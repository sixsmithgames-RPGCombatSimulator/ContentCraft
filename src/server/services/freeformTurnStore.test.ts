import { describe, expect, it, vi } from 'vitest';
import { freeformTurnService, rewindFreeformTurns, type FreeformTurnCollection,
  type FreeformTurnDependencies } from './freeformTurnStore.js';
import { freeformJsonDigest, freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { freeformTurnIssues } from '../../shared/llm/freeformTurn.js';
import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import { validateFreeformIntake } from '../llm-orchestrator/freeformIntakeValidation.js';
import { FREEFORM_ANSWER_POLICY } from '../../shared/llm/freeformIntakePolicy.js';
import { FREEFORM_REMOTE_POLICY, FREEFORM_REMOTE_ANSWER_POLICY, freeformPromptForVersion } from '../../shared/llm/freeformIntakePolicy.js';
import { assertFreeformWorkflowOpen } from './freeformWorkflowAuthority.js';

function memory() {
  const rows: any[] = [];
  const at = (row: any, path: string) => path.split('.').reduce((v, key) => v?.[key], row);
  const match = (row: any, filter: any) => Object.entries(filter).every(([key, value]) => key === 'turn.windows.programRef'
    ? row.turn?.windows.some((window: any) => window.programRef === value) : at(row, key) === value);
  return { rows, collection: {
    async findOne(filter: any) { return structuredClone(rows.find((row) => match(row, filter)) ?? null); },
    async insertOne(row: any) { if (rows.some((value) => value._id === row._id || row.rootInteractionId
      && value.userId === row.userId && value.campaignId === row.campaignId && value.rootInteractionId === row.rootInteractionId)) throw Object.assign(new Error('duplicate'), { code: 11000 }); rows.push(structuredClone(row)); },
    async findOneAndUpdate(filter: any, update: any) { const row = rows.find((value) => match(value, filter));
      if (!row) return null; Object.assign(row, structuredClone(update.$set)); return structuredClone(row); },
  } };
}
function fixture() {
  const turns = memory(), tickets = memory(), instructions = new Map<string, any>(), artifacts = new Map<string, any>();
  const scope = { userId: 'fictional-user', campaignId: 'fictional-campaign' };
  const storyWorkspaceRef = { contractVersion: 'gmc.story-workspace-ref/1', workspaceId: `story-workspace:${scope.campaignId}`,
    campaignId: scope.campaignId, revision: 1, payloadHash: 'a'.repeat(64) };
  const scene: any = { storyWorkspaceRef, playableSceneContext: { sceneKitRef: { sceneKitId: 'fictional-scene', revision: 1 },
    playableLocus: { label: 'Fictional room', canonicalAnchorRef: 'fictional-room' }, presentActors: ['fictional-actor'], sceneLocalRoles: [], establishedElements: [] } };
  const readInstruction = vi.fn(async ({ interactionId }: any) => structuredClone(instructions.get(interactionId) ?? null));
  const stageInstruction = vi.fn(async (input: any) => {
    const value = input.instruction;
    instructions.set(value.interactionId, { instruction: value, originCheckpoint: { contractVersion: 'gmc.compound-action-origin-checkpoint/1',
      storyWorkspaceRef, messageId: 'fictional-message', timelineSequence: 1, replayLineageId: 'fictional-lineage', interactionId: value.interactionId,
      instructionFingerprint: value.instructionFingerprint } });
    return {} as any;
  });
  const readActors = vi.fn(async () => ({ actorCandidates: [{ actorRef: 'fictional-actor' }], actorMechanicsBindings: [
    { actorRef: 'fictional-actor', state: 'active', campaignRef: scope.campaignId, mechanicsSubjectRef: 'vcs:character:fictional', vcsOwnerRef: scope.userId } ] } as any));
  const deps = { records: turns.collection as unknown as FreeformTurnCollection, tickets: tickets.collection as unknown as FreeformTicketCollection,
    readInstruction: readInstruction as any, stageInstruction,
    readArtifact: async (input: Parameters<NonNullable<FreeformTurnDependencies['readArtifact']>>[0]) => structuredClone(artifacts.get(input.programId) ?? null),
    readScene: async () => structuredClone(scene), readActors,
    readActorLinks: async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 0, links: [],
      sourceHead: { workspaceRevision: 1, sceneKitId: 'fictional-scene', sceneRevision: 1, payloadFingerprint: 'a'.repeat(64) } }) };
  const service = freeformTurnService(deps);
  const root = { schemaVersion: 'gma.player-instruction-artifact/1', instructionRef: 'gma:instruction:fictional-turn', interactionId: 'fictional-turn',
    exactText: 'I open it.', utf8Bytes: 10, instructionFingerprint: freeformTextDigest('I open it.') };
  const input = { ...scope, interactionId: root.interactionId, selectedMechanicsSubjectRef: 'vcs:character:fictional', selectedMechanicsOwnerRef: scope.userId };
  const staged = stageInstruction({ instruction: root });
  async function start() { await staged; return (await service.prepare(input))!; }
  function ask(prepared: any, question = 'Which container do you open?') {
    const row = tickets.rows.find((value) => value._id === prepared.turn.windows.at(-1).ticketRef);
    row.status = 'accepted'; row.response = { status: 'succeeded', output: { clarification: question } };
  }
  function finish(prepared: any, suffixText: string) {
    const id = prepared.instruction.interactionId;
    artifacts.set(`program:${id}`, { artifact: { freeformBinding: { suffixText }, program: { programId: `program:${id}`, nodes: [{ nodeId: 'fictional-step' }] },
      cursor: { waiting: null, readyNodeRefs: [], remainingNodeRefs: [], completedNodeRefs: ['fictional-step'], skippedNodeRefs: [] } } });
  }
  return { service, deps, start, input, scope, turns, tickets, instructions, artifacts, readActors, ask, finish };
}

describe('protected Manual freeform workflow (not gameplay proof)', () => {
  it.each(['failed', 'review_required'])('discovers confirmed %s rejection and its sole replacement after response loss without retaining reply data', async (status) => {
    const f = fixture(), first = await f.start(), ticket = f.tickets.rows[0];
    ticket.status = 'retired'; ticket.failureSignature = 'f'.repeat(64);
    ticket.response = { status, output: null, validation: [{ issues: [{ path: '/observations/0/viewpointAfter', code: 'FREEFORM_VIEWPOINT_INVALID' }] }] };
    const before = structuredClone(f.turns.rows);
    const read = await f.service.read({ ...f.scope, turnId: first.turn.turnId });
    expect(read!.ticketDisposition).toEqual({ schemaVersion: 'gmc.freeform-ticket-disposition/1', ticketRef: ticket._id,
      attempt: 1, status: 'rejected', supportStop: false, replacementPermitted: true,
      issues: [{ path: '/observations/0/viewpointAfter', code: 'FREEFORM_VIEWPOINT_INVALID' }] });
    expect(f.turns.rows).toEqual(before); expect(f.artifacts.size).toBe(0);
    expect(await f.service.read({ ...f.scope, userId: 'foreign', turnId: first.turn.turnId })).toBeNull();
    const replacement = await f.service.prepare({ ...f.scope, turnId: first.turn.turnId, previousTicket: ticket._id });
    expect(replacement!.ticketDisposition).toMatchObject({ status: 'replacement', attempt: 2, replacementPermitted: false,
      issues: read!.ticketDisposition!.issues });
    expect(f.tickets.rows).toHaveLength(2); expect(f.artifacts.size).toBe(0);
    ticket.workflowRef.turnId = 'foreign-turn';
    expect((await f.service.read({ ...f.scope, turnId: first.turn.turnId }))!.ticketDisposition).toBeUndefined();
  });
  it.each(['support', 'expiry', 'cancel', 'second'])('confirmed rejection discovery cannot reopen %s boundary', async (boundary) => {
    const f = fixture(), first = await f.start(), ticket = f.tickets.rows[0];
    ticket.status = 'retired'; ticket.failureSignature = 'f'.repeat(64);
    ticket.response = { status: 'review_required', output: null, validation: [] };
    if (boundary === 'support') ticket.supportStop = true;
    if (boundary === 'expiry') ticket.expiresAt = new Date(0);
    if (boundary === 'cancel') f.turns.rows[0].retirementRequestedAt = new Date();
    if (boundary === 'second') ticket.attempt = 2;
    expect((await f.service.read({ ...f.scope, turnId: first.turn.turnId }))!.ticketDisposition!.replacementPermitted).toBe(false);
    expect(f.tickets.rows).toHaveLength(1); expect(f.artifacts.size).toBe(0);
  });
  it.each([undefined, {}, { clarification: null }, { clarification: '' }])('never fabricates a clarification from an unusable accepted reply: %j', async (output) => {
    const f = fixture(), first = await f.start();
    const ticket = f.tickets.rows[0]; ticket.status = 'accepted'; ticket.response = { status: 'succeeded', output };
    const before = structuredClone(f.turns.rows);
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_PLAN_BINDING_INVALID' });
    expect(f.turns.rows).toEqual(before); expect(f.tickets.rows).toHaveLength(1);
    expect(f.artifacts.size).toBe(0);
  });
  it('rediscovers an accepted action whose original plan save was interrupted, without another ticket or owner write', async () => {
    const f = fixture(), first = await f.start(), ticket = f.tickets.rows[0];
    const output = { schemaVersion: 'gma.freeform-intent-proposal/1', ticket: ticket._id,
      windowText: first.instruction.exactText, clarification: null,
      referents: [{ kind: 'actor', text: 'I', catalogKey: 'selected_actor', methodKind: null }],
      steps: [{ kind: 'action', purpose: 'apply_capability', goal: 'Open it', evidence: ['I open it.'], actor: 0,
        targets: [], method: null, results: ['Attempt to open it'], after: [], parallel: [], when: null }], observations: [] };
    ticket.status = 'accepted'; ticket.outputDigest = freeformJsonDigest(output);
    ticket.response = { schemaVersion: 'gma-gmc.llm-response/1', status: 'succeeded', output,
      operation: ticket.request.operation, taskId: ticket.request.taskId, correlationId: ticket.request.correlationId,
      idempotencyKey: ticket.request.idempotencyKey, route: { provider: 'manual', model: null } };
    const before = structuredClone(f.turns.rows), ticketsBefore = structuredClone(f.tickets.rows);
    expect((await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!.turn).toEqual(first.turn);
    expect((await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!.turn).toEqual(first.turn);
    expect(f.turns.rows).toEqual(before); expect(f.tickets.rows).toEqual(ticketsBefore);
    expect(f.artifacts.size).toBe(0);
    ticket.outputDigest = 'f'.repeat(64);
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_PLAN_BINDING_INVALID' });
    expect(f.turns.rows).toEqual(before);
  });
  it('never turns a missing suffix into a new instruction or closes the root', async () => {
    const f = fixture(), first = await f.start(); f.finish(first, '');
    const artifact = f.artifacts.values().next().value!; delete artifact.artifact.freeformBinding.suffixText;
    const saved = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    const before = structuredClone(f.turns.rows);
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId, advance: true,
      expectedParentProgramRef: saved.turn.windows[0].programRef! })).rejects.toMatchObject({ code: 'FREEFORM_PLAN_BINDING_INVALID' });
    expect(f.turns.rows).toEqual(before); expect(f.tickets.rows).toHaveLength(1);
    expect(f.instructions.size).toBe(1);
  });
  it('cannot retire over an unreadable owner-operation list', async () => {
    const f = fixture(), first = await f.start(); f.finish(first, '');
    const artifact = f.artifacts.values().next().value!; artifact.artifact.saga = { operations: 'unreadable' };
    const saved = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    await expect(f.service.retire({ ...f.scope, turnId: first.turn.turnId,
      expectedRevision: saved.turn.revision })).rejects.toMatchObject({ code: 'FREEFORM_OWNER_OUTCOME_UNKNOWN' });
    expect(f.turns.rows[0].turn.status).toBe('active');
    expect(f.turns.rows[0].retirementRequestedAt).toBeInstanceOf(Date);
    expect(f.artifacts.size).toBe(1); expect(f.tickets.rows[0].status).not.toBe('retired');
  });
  it('discovers and completes an accepted saved window after its ticket TTL document is removed', async () => {
    const f = fixture(), first = await f.start();
    f.finish(first, '');
    const saved = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    expect(saved.turn.windows[0].status).toBe('plan_saved');
    f.tickets.rows.splice(0); // Simulates TTL cleanup only in isolated memory.
    expect((await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!.turn).toEqual(saved.turn);
    const finished = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId,
      advance: true, expectedParentProgramRef: saved.turn.windows[0].programRef! }))!;
    expect(finished.turn.status).toBe('completed');
    expect(f.tickets.rows).toEqual([]);
    expect(finished.instruction.exactText).toBe(first.instruction.exactText);
  });
  it('discovers exact saved program membership across windows without a browser turn reference', async () => {
    const f = fixture(), first = await f.start(), row = f.turns.rows[0];
    row.turn.windows[0].programRef = 'program:accepted'; row.turn.windows[0].status = 'plan_saved';
    const before = structuredClone(row);
    expect(await f.service.read({ ...f.scope, programId: 'program:accepted' })).toMatchObject({ turn: { turnId: first.turn.turnId } });
    expect(await f.service.read({ ...f.scope, userId: 'foreign', programId: 'program:accepted' })).toBeNull();
    expect(await f.service.read({ ...f.scope, campaignId: 'foreign', programId: 'program:accepted' })).toBeNull();
    expect(await f.service.read({ ...f.scope, programId: 'program:other' })).toBeNull();
    await expect(f.service.read({ ...f.scope, programId: 'program:accepted', turnId: first.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_TURN_INPUT_INVALID' });
    expect(row).toEqual(before);
  });
  it('issues once from verified character binding and returns the same protected original on reload', async () => {
    const f = fixture(), first = await f.start();
    expect(freeformTurnIssues(first.turn)).toEqual([]);
    expect(await f.service.prepare(f.input)).toEqual(first);
    expect(f.tickets.rows).toHaveLength(1); expect(f.turns.rows).toHaveLength(1);
    expect(f.tickets.rows[0].selectedActorRef).toBe('fictional-actor');
    expect(JSON.stringify(first)).not.toContain('mechanicsSubjectRef');
  });
  it('rejects absent, ambiguous and changed selection rather than guessing actor identity', async () => {
    const f = fixture(); f.readActors.mockResolvedValue({ actorCandidates: [], actorMechanicsBindings: [] } as any);
    await expect(f.start()).rejects.toMatchObject({ code: 'FREEFORM_SELECTED_CHARACTER_BINDING_REQUIRED' });
    expect(f.turns.rows).toHaveLength(0); expect(f.tickets.rows).toHaveLength(0);
    const g = fixture(); await g.start();
    await expect(g.service.prepare({ ...g.input, selectedMechanicsSubjectRef: 'vcs:character:another' })).rejects.toMatchObject({ code: 'FREEFORM_SELECTED_CHARACTER_CHANGED' });
  });
  it('stores a consequential question without a program, binds a human answer once, and retains original evidence', async () => {
    const f = fixture(), first = await f.start(); f.ask(first);
    const pending = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    const window = pending.turn.windows[0]; expect(window.status).toBe('awaiting_clarification'); expect(window.programRef).toBeNull();
    expect(f.artifacts.size).toBe(0);
    const answer = { ticket: window.ticketRef!, text: 'The brass chest.', expectedRevision: pending.turn.revision };
    const next = (await f.service.prepare({ ...f.scope, turnId: pending.turn.turnId, answer }))!;
    expect(next.instruction.exactText).toBe('I open it.'); expect(next.instruction.interactionId).not.toBe(first.instruction.interactionId);
    expect(next.turn.windows[0].pendingDecision).toBeNull(); expect(f.tickets.rows).toHaveLength(2);
    expect(f.tickets.rows[1].request.constraints.policyVersion).toBe('gma.freeform-intake-policy/4');
    expect(f.tickets.rows[1].request.context.input.value.clarifications).toEqual([{ question: 'Which container do you open?', answer: answer.text }]);
    expect(await f.service.prepare({ ...f.scope, turnId: pending.turn.turnId, answer })).toEqual(next);
    expect(f.tickets.rows).toHaveLength(2);
    await expect(f.service.prepare({ ...f.scope, turnId: pending.turn.turnId, answer: { ...answer, text: 'Both chests.' } })).rejects.toMatchObject({ code: 'FREEFORM_ANSWER_CHANGED' });
  });
  it('rejects forged question, revision and oversized answer without another ticket', async () => {
    const f = fixture(), first = await f.start(); f.ask(first);
    const pending = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    const base = { ticket: pending.turn.windows[0].ticketRef!, text: 'The brass chest.', expectedRevision: pending.turn.revision };
    for (const answer of [{ ...base, ticket: 'other-question' }, { ...base, expectedRevision: 0 }, { ...base, text: 'a'.repeat(2049) }]) {
      await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId, answer })).rejects.toThrow();
    }
    expect(f.tickets.rows).toHaveLength(1);
    expect(await f.service.read({ ...f.scope, userId: 'another-user', turnId: first.turn.turnId })).toBeNull();
    expect(await f.service.read({ ...f.scope, campaignId: 'another-campaign', turnId: first.turn.turnId })).toBeNull();
  });
  it('stops a repeated answered question without producing an executable program or another packet', async () => {
    const f = fixture(), first = await f.start(); f.ask(first);
    const pending = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId }))!;
    const next = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId,
      answer: { ticket: pending.turn.windows[0].ticketRef!, text: 'The brass chest.', expectedRevision: pending.turn.revision } }))!;
    f.ask(next);
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_CLARIFICATION_SUPPORT_REQUIRED' });
    expect(f.tickets.rows).toHaveLength(2); expect(f.artifacts.size).toBe(0);
    const closed = await f.service.read({ ...f.scope, turnId: first.turn.turnId });
    expect(closed?.turn.status).toBe('retired');
    expect(closed?.supportCode).toBe('FREEFORM_CLARIFICATION_SUPPORT_REQUIRED');
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).rejects.toMatchObject({ code: closed?.supportCode });
  });
  it('activates only the exact suffix after completed progress; lost reply discovers the same successor', async () => {
    const f = fixture(), first = await f.start(); f.finish(first, '  I wait.');
    const advance = { ...f.scope, turnId: first.turn.turnId, advance: true, expectedParentProgramRef: `program:${first.instruction.interactionId}` };
    const next = (await f.service.prepare(advance))!;
    expect(next.instruction.exactText).toBe('  I wait.'); expect(next.turn.windows).toHaveLength(2);
    expect(next.turn.windows[1].parentProgramRef).toBe(`program:${first.instruction.interactionId}`);
    expect(await f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).toEqual(next);
    expect(f.tickets.rows).toHaveLength(2); expect(f.artifacts.size).toBe(1);
    f.finish(next, ' I leave.');
    expect(await f.service.prepare(advance)).toEqual(next);
    expect(f.tickets.rows).toHaveLength(2);
  });
  it('does not advance unfinished work or mark nonempty suffixes complete', async () => {
    const f = fixture(), first = await f.start(); f.finish(first, ' I wait.');
    f.artifacts.get(`program:${first.instruction.interactionId}`).artifact.cursor.remainingNodeRefs = ['fictional-step'];
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId, advance: true, expectedParentProgramRef: `program:${first.instruction.interactionId}` })).rejects.toMatchObject({ code: 'FREEFORM_PARENT_NOT_COMPLETED' });
    expect(f.turns.rows[0].turn.status).toBe('active'); expect(f.tickets.rows).toHaveLength(1);
  });
  it('final completion uses owner-backed progress and remains discoverable after ticket expiry', async () => {
    const f = fixture(), first = await f.start(); f.finish(first, '');
    f.tickets.rows[0].expiresAt = new Date(0);
    const done = (await f.service.prepare({ ...f.scope, turnId: first.turn.turnId, advance: true, expectedParentProgramRef: `program:${first.instruction.interactionId}` }))!;
    expect(done.turn.status).toBe('completed'); expect(f.tickets.rows).toHaveLength(1);
    expect(await f.service.prepare({ ...f.scope, turnId: first.turn.turnId, advance: true })).toEqual(done);
  });
  it('retires unaccepted packets, preserves accepted history, and will not cancel uncertain acceptance', async () => {
    const f = fixture(), first = await f.start();
    f.tickets.rows[0].status = 'running';
    await expect(f.service.retire({ ...f.scope, turnId: first.turn.turnId, expectedRevision: first.turn.revision })).rejects.toMatchObject({ code: 'FREEFORM_ACCEPTANCE_PENDING' });
    f.tickets.rows[0].status = 'active';
    const retired = await f.service.retire({ ...f.scope, turnId: first.turn.turnId, expectedRevision: first.turn.revision });
    expect(retired.turn.status).toBe('retired'); expect(f.tickets.rows[0].status).toBe('retired');
    expect((await f.service.retire({ ...f.scope, turnId: first.turn.turnId, expectedRevision: first.turn.revision })).duplicate).toBe(true);
    const g = fixture(), accepted = await g.start(); g.ask(accepted);
    await g.service.retire({ ...g.scope, turnId: accepted.turn.turnId, expectedRevision: accepted.turn.revision });
    expect(g.tickets.rows[0].status).toBe('accepted');
  });
  it('keeps answer policy positive requirements in the original first pass, not a correction-only rule', () => {
    expect(FREEFORM_ANSWER_POLICY).toContain('Do not repeat an already answered question');
    expect(FREEFORM_ANSWER_POLICY).toContain('Evidence still quotes only the original windowText');
    expect(freeformJsonDigest(FREEFORM_ANSWER_POLICY)).toMatch(/^[a-f0-9]{64}$/);
    expect(validateFreeformIntake).toBeTypeOf('function');
    expect(FREEFORM_REMOTE_POLICY).toContain('actual sensory source');
    expect(FREEFORM_REMOTE_POLICY).toContain('one coupled information action');
    expect(FREEFORM_REMOTE_ANSWER_POLICY).toContain('Do not repeat an already answered question');
    expect(freeformPromptForVersion('gma.freeform-intake-policy/1').systemInstruction).not.toContain('one coupled information action');
  });

  it('renews only an expired unused packet, preserving exact text, attempt and idempotent lineage', async () => {
    const f = fixture(), first = await f.start(), ticket = f.tickets.rows[0];
    const request = { ...f.scope, turnId: first.turn.turnId, renewTicket: ticket._id };
    await expect(f.service.prepare(request)).rejects.toMatchObject({ code: 'FREEFORM_RENEWAL_NOT_ALLOWED' });
    ticket.expiresAt = new Date(0);
    const next = (await f.service.prepare(request))!;
    expect(next.instruction.exactText).toBe(first.instruction.exactText);
    expect(next.instruction.interactionId).not.toBe(first.instruction.interactionId);
    expect(next.turn.windows).toHaveLength(1); expect(ticket.status).toBe('retired');
    expect(f.tickets.rows[1].attempt).toBe(ticket.attempt);
    expect(await f.service.prepare(request)).toEqual(next);
    expect(f.tickets.rows).toHaveLength(2);
  });

  it('stops at the two-answer boundary without silently executing a third ambiguity', async () => {
    const f = fixture(); let prepared = await f.start();
    for (const [question, answer] of [['Which container?', 'Brass.'], ['Which handle?', 'Left.']]) {
      f.ask(prepared, question);
      const pending = (await f.service.prepare({ ...f.scope, turnId: prepared.turn.turnId }))!;
      prepared = (await f.service.prepare({ ...f.scope, turnId: prepared.turn.turnId,
        answer: { ticket: pending.turn.windows[0].ticketRef!, text: answer, expectedRevision: pending.turn.revision } }))!;
    }
    f.ask(prepared, 'Which tool?');
    await expect(f.service.prepare({ ...f.scope, turnId: prepared.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_CLARIFICATION_SUPPORT_REQUIRED' });
    expect(f.tickets.rows).toHaveLength(3); expect(f.artifacts.size).toBe(0);
  });

  it('records retirement intent and blocks new execution if acceptance races cancellation', async () => {
    const f = fixture(), first = await f.start(), ticket = f.tickets.rows[0];
    const original = f.turns.collection.findOneAndUpdate;
    f.turns.collection.findOneAndUpdate = async (filter: any, update: any) => {
      const saved = await original(filter, update);
      if (update.$set.retirementRequestedAt && ticket.status === 'active') ticket.status = 'running';
      return saved;
    };
    await expect(f.service.retire({ ...f.scope, turnId: first.turn.turnId, expectedRevision: first.turn.revision }))
      .rejects.toMatchObject({ code: 'FREEFORM_ACCEPTANCE_PENDING' });
    expect((await f.service.read({ ...f.scope, turnId: first.turn.turnId }))?.retirementPending).toBe(true);
    await expect(assertFreeformWorkflowOpen(ticket, async () => f.turns.rows[0])).rejects.toMatchObject({ code: 'FREEFORM_WORKFLOW_CLOSED' });
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId })).rejects.toMatchObject({ code: 'FREEFORM_RETIREMENT_PENDING' });
    ticket.status = 'accepted';
    const done = await f.service.retire({ ...f.scope, turnId: first.turn.turnId, expectedRevision: first.turn.revision });
    expect(done.turn.status).toBe('retired'); expect(ticket.status).toBe('accepted');
  });

  it('rejects a different mechanics owner and ambiguous scene bridges without issuing a ticket', async () => {
    const f = fixture();
    await expect(f.service.prepare({ ...f.input, selectedMechanicsOwnerRef: 'another-owner' })).rejects.toMatchObject({ code: 'FREEFORM_SELECTED_CHARACTER_BINDING_REQUIRED' });
    f.readActors.mockResolvedValue({ actorCandidates: [{ actorRef: 'a' }, { actorRef: 'b' }],
      actorMechanicsBindings: ['a', 'b'].map((actorRef) => ({ actorRef, state: 'active', campaignRef: f.scope.campaignId,
        mechanicsSubjectRef: f.input.selectedMechanicsSubjectRef, vcsOwnerRef: f.scope.userId })) } as any);
    await expect(f.start()).rejects.toMatchObject({ code: 'FREEFORM_SELECTED_CHARACTER_BINDING_REQUIRED' });
    expect(f.tickets.rows).toHaveLength(0);
  });

  it('stops at 64 windows with the exact pending suffix and completed receipts retained', async () => {
    const f = fixture(), first = await f.start(), document = f.turns.rows[0];
    const current = document.turn.windows[0];
    document.turn.windows = Array.from({ length: 64 }, (_, i) => ({ ...structuredClone(current),
      windowId: `fictional-window-${i + 1}`, ordinal: i + 1, status: i === 63 ? 'awaiting_reply' : 'completed',
      instructionRef: i === 63 ? current.instructionRef : `gma:instruction:fictional-prior-${i + 1}`,
      programRef: i === 63 ? null : `program:fictional-prior-${i + 1}` }));
    document.turn.activeWindowRef = 'fictional-window-64'; f.finish(first, '  I wait. 🐀');
    await expect(f.service.prepare({ ...f.scope, turnId: first.turn.turnId, advance: true,
      expectedParentProgramRef: `program:${first.instruction.interactionId}` })).rejects.toMatchObject({ code: 'FREEFORM_WINDOW_LIMIT' });
    expect(f.artifacts.get(`program:${first.instruction.interactionId}`).artifact.freeformBinding.suffixText).toBe('  I wait. 🐀');
    expect(f.tickets.rows).toHaveLength(1); expect(f.turns.rows[0].supportCode).toBe('FREEFORM_WINDOW_LIMIT');
  });

  it('rewind retires only roots beyond the verified timeline boundary and retains accepted question history', async () => {
    const f = fixture(), first = await f.start(); f.ask(first);
    const candidates = { find: (filter: any) => ({ toArray: async () => f.turns.rows.filter((row) =>
      row.userId === filter.userId && row.campaignId === filter.campaignId && row.timelineSequence > filter.timelineSequence.$gt
      && row.turn.status === 'active') }) } as any;
    expect(await rewindFreeformTurns({ ...f.scope, boundarySequence: 1 }, f.deps, candidates)).toEqual({ retiredTurnCount: 0 });
    expect(await rewindFreeformTurns({ ...f.scope, boundarySequence: 0 }, f.deps, candidates)).toEqual({ retiredTurnCount: 1 });
    expect(f.tickets.rows[0].status).toBe('accepted'); expect(f.turns.rows[0].turn.status).toBe('retired');
  });
});
