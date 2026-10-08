import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FREEFORM_INTAKE_OPERATION } from '../../shared/llm/freeformIntakePolicy.js';
import { createUniversalRequest, executeLlmOperation } from './orchestrator.js';
import { MemoryExecutionStore } from './executionStore.js';
import { getOperationDefinition, validateOperationOutput } from './operationRegistry.js';
import { validateFreeformIntake } from './freeformIntakeValidation.js';
import { freeformDigest, issueFreeformTicket, type FreeformTicketCollection, type FreeformTicketRecord } from './freeformTickets.js';
import * as rollout from './rolloutPolicy.js';

// Deterministic test tickets let the *unedited* external LLM replies travel
// through the real issuer and protected execution boundary. Never used at runtime.
vi.mock('node:crypto', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:crypto')>(), randomUUID: vi.fn(),
}));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(randomUUID).mockReset(); });

const captures = JSON.parse(readFileSync(new URL('../../../docs/fixtures/manual-freeform-llm-first-pass-2026-10-08.json', import.meta.url), 'utf8')) as Array<{
  caseId: string; input: { ticket: string; instruction: string; mode: 'action'; selectedActorRef: null; catalog: [] }; output: any;
}>;

function memoryTickets() {
  const documents: FreeformTicketRecord[] = [];
  const matches = (row: FreeformTicketRecord, filter: Record<string, unknown>) => Object.entries(filter)
    .every(([key, value]) => (row as any)[key] === value);
  const records = {
    async findOne(filter: Record<string, unknown>) { return structuredClone(documents.find((row) => matches(row, filter)) ?? null); },
    async insertOne(record: FreeformTicketRecord) { documents.push(structuredClone(record)); },
    async findOneAndUpdate(filter: Record<string, unknown>, update: any) {
      const row = documents.find((entry) => matches(entry, filter));
      if (!row) return null;
      Object.assign(row, structuredClone(update.$set));
      return structuredClone(row);
    },
  } as unknown as FreeformTicketCollection;
  return { documents, records };
}

const capture = (id: string) => captures.find((row) => row.caseId === id)!;
const meanings = (id: string) => capture(id).output;

describe('blind external-LLM Manual rehearsal (not a gameplay certificate)', () => {
  it('retains six unedited first replies, with no campaign or owner identifiers', () => {
    expect(captures.map((row) => row.caseId)).toEqual([
      'familiar-scout', 'unicode-look', 'ambiguous-container', 'npc-quotation', 'conditional-exchange', 'simultaneous-watch',
    ]);
    for (const row of captures) {
      expect(row.input.catalog).toEqual([]);
      expect(row.input.selectedActorRef).toBeNull();
      expect(row.output.ticket).toBe(row.input.ticket);
      expect(row.output.referents.every((ref: any) => ref.catalogKey === null)).toBe(true);
      expect(Object.keys(row.output).sort()).toEqual(['schemaVersion', 'ticket', 'windowText', 'referents', 'steps', 'observations', 'clarification'].sort());
    }
  });

  it.each(captures)('accepts the unedited $caseId first reply in the real schema and semantic checks', (row) => {
    const request = createUniversalRequest({ operation: FREEFORM_INTAKE_OPERATION, taskId: `rehearsal:${row.caseId}`,
      correlationId: `rehearsal:${row.caseId}`, idempotencyKey: `rehearsal:${row.caseId}`,
      context: { input: { label: 'user_text', value: row.input } } });
    expect(validateOperationOutput(FREEFORM_INTAKE_OPERATION, row.output).issues).toEqual([]);
    expect(validateFreeformIntake(request, row.output).issues).toEqual([]);
    expect(row.output.windowText).toBe(row.input.instruction);
  });

  it.each(captures)('issues, accepts and exactly replays $caseId through protected Manual execution without a provider', async (row) => {
    // A test-only rollout override leaves the real deployment disabled.
    vi.spyOn(rollout, 'resolveRolloutDecision').mockImplementation((operation) => ({
      operation, policyVersion: 'manual-rehearsal-only', mode: 'primary', configuredMode: 'primary',
      canaryPercent: 100, canaryBucket: 0, selected: true, rollbackTarget: 'disabled',
    }));
    vi.mocked(randomUUID).mockReturnValue(row.input.ticket as ReturnType<typeof randomUUID>);
    const tickets = memoryTickets();
    const interactionId = `manual-rehearsal:${row.caseId}`;
    const issued = await issueFreeformTicket({ userId: 'fictional-user', campaignId: 'fictional-campaign', interactionId,
      issuanceKey: interactionId, mode: 'action', selectedActorRef: null, transport: 'manual' }, {
      records: tickets.records,
      readInstruction: async () => ({ instruction: {
        schemaVersion: 'gma.player-instruction-artifact/1', instructionRef: `gma:instruction:${interactionId}`,
        interactionId, exactText: row.input.instruction, utf8Bytes: Buffer.byteLength(row.input.instruction),
        instructionFingerprint: createHash('sha256').update(row.input.instruction).digest('hex'),
      }, originCheckpoint: null, stagedAt: new Date() }),
    });
    expect(issued.request.context.input.value).toEqual(row.input);
    const store = new MemoryExecutionStore();
    const options = { userId: 'fictional-user', freeformTickets: tickets.records, store, providers: [], manualOutput: row.output };
    const response = await executeLlmOperation(issued.request, options);
    expect(response.status).toBe('succeeded');
    expect(response.output).toEqual(row.output);
    expect(response.route.provider).toBe('manual');
    expect(response.route.model).toBeNull();
    expect(response.timing.attempts).toBe(0);
    expect(tickets.documents[0]).toMatchObject({ status: 'accepted', outputDigest: freeformDigest(row.output) });
    expect(await executeLlmOperation(issued.request, options)).toEqual(response);
    expect(await store.query('fictional-user', {})).toHaveLength(1);
    // Simulate an accepted response lost before ticket settlement. Reconcile
    // that original durable execution; do not create another model operation.
    tickets.documents[0].status = 'running';
    delete tickets.documents[0].response;
    expect(await executeLlmOperation(issued.request, options)).toEqual(response);
    expect(await store.query('fictional-user', {})).toHaveLength(1);
    await expect(executeLlmOperation(issued.request, { ...options, userId: 'another-user' }))
      .rejects.toMatchObject({ code: 'FREEFORM_TICKET_BINDING_INVALID' });
  });

  it('preserves the familiar move, stationary character and familiar sensory viewpoint without invented form activation', () => {
    const output = meanings('familiar-scout');
    const moveIndex = output.steps.findIndex((step: any) => step.purpose === 'relocate_actor');
    const move = output.steps[moveIndex];
    expect(output.referents[move.actor].text).toBe('my familiar');
    expect(output.steps.filter((step: any) => step.purpose === 'relocate_actor')).toHaveLength(1);
    const cover = output.steps.find((step: any) => step.evidence.includes('stay behind cover') && step.purpose !== 'observe_situation');
    expect(output.referents[cover.actor].text).toBe('I');
    const observation = output.observations[0];
    expect(observation).toMatchObject({ observer: move.actor, observerKind: 'familiar', viewpointAfter: moveIndex, form: null });
    expect(output.referents[output.steps[observation.step].actor].text).toBe('I');
    expect(output.steps.some((step: any) => step.purpose === 'apply_capability')).toBe(false);
  });

  it('preserves Unicode, sequential viewing and departure, not an invented hidden answer', () => {
    const output = meanings('unicode-look');
    expect(output.steps.map((step: any) => step.purpose)).toEqual(['observe_situation', 'relocate_actor']);
    expect(output.steps[1].after).toEqual([0]);
    expect(output.steps[0].evidence).toEqual(['I look 👁️ at the gate']);
    expect(output.steps[0].results).toEqual([]);
  });

  it('keeps the ambiguous target unbound and asks one consequential question instead of choosing a container', () => {
    const output = meanings('ambiguous-container');
    expect(output.steps).toHaveLength(1);
    expect(output.steps[0].purpose).toBe('manipulate_object');
    expect(output.referents[output.steps[0].targets[0].ref].catalogKey).toBeNull();
    expect(output.clarification).toBe('Do you want to open the chest or the sealed box?');
    // Accepted interpretation is not permission to open either container.
    expect(getOperationDefinition(FREEFORM_INTAKE_OPERATION).authority.commit).toBe('proposal_only');
  });

  it('preserves the guard question and explicit non-attack constraint without executing quoted speech', () => {
    const output = meanings('npc-quotation');
    expect(output.steps).toHaveLength(1);
    expect(output.steps[0].purpose).toBe('exchange_information');
    expect(output.steps[0].evidence).toContain('I do not attack anyone.');
    expect(output.steps[0].goal).toContain('without attacking anyone');
    expect(output.observations).toEqual([]);
  });

  it('preserves both conditional branches without claiming the merchant agreed or a payment happened', () => {
    const output = meanings('conditional-exchange');
    expect(output.steps.map((step: any) => step.purpose)).toEqual(['influence_actor', 'relocate_actor', 'change_resource']);
    expect(output.steps[1].when).toEqual({ predicate: 'declined', step: 0, requirement: null });
    expect(output.steps[2].when).toEqual({ predicate: 'succeeded', step: 0, requirement: null });
    expect(output.steps[1].after).toEqual([0]);
    expect(output.steps[2].after).toEqual([0]);
    expect(output.steps[2].goal).toContain('if the merchant agrees');
  });

  it('keeps simultaneous observations attached to their distinct observers and subjects', () => {
    const output = meanings('simultaneous-watch');
    expect(output.steps[0].parallel).toEqual([1]);
    expect(output.steps[1].parallel).toEqual([0]);
    expect(output.observations.map((row: any) => row.observerKind)).toEqual(['character', 'ally']);
    expect(output.observations.map((row: any) => output.referents[row.subject].text)).toEqual(['the arch', 'the worker']);
    expect(output.observations[0].observer).not.toBe(output.observations[1].observer);
  });
});
