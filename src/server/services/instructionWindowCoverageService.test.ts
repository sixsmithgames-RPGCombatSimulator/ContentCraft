import { describe, expect, it } from 'vitest';
import { readInstructionWindowCoverage, type InstructionCoverageDependencies } from './instructionWindowCoverageService.js';
import { freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import type { FreeformTurnDocument } from './freeformTurnStore.js';

function fixture() {
  const scope = { userId: 'owner:one', campaignId: 'campaign:one', programId: 'program:turn:one' }, text = 'I nod. Then I smile.', prefix = 'I nod.', tail = ' Then I smile.';
  const instruction = { interactionId: 'turn:one', instructionRef: 'gma:instruction:turn:one', exactText: text, instructionFingerprint: freeformTextDigest(text) };
  const authorityBase = { campaignId: scope.campaignId, storyWorkspaceRevision: 1, sceneRevision: 1, vcsCharacterRevision: 0 };
  const artifact: JsonObject = { instruction, program: { programId: scope.programId, authorityBase,
    nodes: [{ nodeId: 'step:one', dataRequirements: [] }], planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/12' } },
    freeformBinding: { schemaVersion: 'gma.freeform-plan-binding/1', instructionRef: instruction.instructionRef,
      interactionId: instruction.interactionId, instructionFingerprint: instruction.instructionFingerprint,
      windowId: `window:${freeformTextDigest(prefix)}`, windowBytes: Buffer.byteLength(prefix), suffixText: tail,
      continuationFingerprint: freeformTextDigest(tail), policyVersion: 'gma.freeform-intake-policy/3', registryVersion: '2026-10-15.1',
      proposalDigest: 'a'.repeat(64), requestDigest: 'b'.repeat(64), ticket: 'ticket:one', ticketDisposition: 'owner_accepted',
      authorityBase, sourceReferences: [], compiledStepIds: ['step:one'], operationRequirements: [{ nodeRef: 'step:one', requirements: [] }] } };
  const ticket = { _id: 'ticket:one', userId: scope.userId, campaignId: scope.campaignId, status: 'accepted',
    interactionId: instruction.interactionId, instructionFingerprint: instruction.instructionFingerprint,
    workflowRef: { turnId: 'turn:protected', windowId: 'window:protected' } };
  const document: FreeformTurnDocument = { _id: 'turn:protected', userId: scope.userId, campaignId: scope.campaignId,
    rootInteractionId: instruction.interactionId, selectedMechanicsSubjectRef: 'character:one', selectedMechanicsOwnerRef: scope.userId,
    selectedActorRef: 'actor:one', answers: [], timelineSequence: 1, updatedAt: new Date(0),
    turn: { schemaVersion: 'gma.freeform-turn/1', turnId: 'turn:protected', campaignId: scope.campaignId, revision: 2,
      status: 'active', rootInstructionRef: instruction.instructionRef, activeWindowRef: 'window:protected', windows: [{
        windowId: 'window:protected', ordinal: 1, instructionRef: instruction.instructionRef, ticketRef: ticket._id,
        parentProgramRef: null, programRef: scope.programId, pendingDecision: null, status: 'plan_saved' }] } };
  const reads: unknown[] = [];
  const deps: InstructionCoverageDependencies = { tickets: { findOne: async () => {
    throw new Error('An accepted window must survive ticket TTL deletion.');
  } } as unknown as FreeformTicketCollection, reader: async (input) => {
    reads.push(input); return input.userId === document.userId && input.campaignId === document.campaignId ? structuredClone(document) : null;
  }, readInstruction: async (input) => { reads.push(input); return { instruction: structuredClone(instruction), originCheckpoint: null, stagedAt: new Date('2026-10-15T12:00:00Z') }; } };
  return { scope, artifact, ticket, document, deps, reads };
}

describe('protected instruction coverage reader', () => {
  it('uses durable accepted membership and exact root after ticket TTL deletion, without renewal or writes', async () => {
    const f = fixture(), before = structuredClone({ artifact: f.artifact, ticket: f.ticket, document: f.document });
    const result = await readInstructionWindowCoverage(f.scope, f.artifact, f.deps);
    expect(result.instructionCoverage).toMatchObject({ programRef: f.scope.programId, deferredTailBytes: 14, rootCompletionPermitted: false });
    expect({ artifact: f.artifact, ticket: f.ticket, document: f.document }).toEqual(before);
    expect(f.reads).toContainEqual({ userId: f.scope.userId, campaignId: f.scope.campaignId,
      ticketRef: f.ticket._id, programRef: f.scope.programId, instructionRef: (f.artifact.instruction as JsonObject).instructionRef });
  });
  for (const [name, mutate] of [
    ['foreign owner', (f: ReturnType<typeof fixture>) => { f.scope.userId = 'owner:other'; }],
    ['foreign campaign', (f: ReturnType<typeof fixture>) => { f.scope.campaignId = 'campaign:other'; }],
    ['unaccepted reply', (f: ReturnType<typeof fixture>) => { (f.artifact.freeformBinding as JsonObject).ticketDisposition = 'pending'; }],
    ['closed workflow', (f: ReturnType<typeof fixture>) => { f.document.turn.status = 'retired'; }],
    ['pending retirement', (f: ReturnType<typeof fixture>) => { f.document.retirementRequestedAt = new Date(); }],
    ['support-stopped workflow', (f: ReturnType<typeof fixture>) => { f.document.supportCode = 'SUPPORT'; }],
    ['foreign program', (f: ReturnType<typeof fixture>) => { f.document.turn.windows[0].programRef = 'program:foreign'; }],
    ['different instruction', (f: ReturnType<typeof fixture>) => { (f.artifact.freeformBinding as JsonObject).instructionFingerprint = 'f'.repeat(64); }],
  ] as const) it(`rejects ${name} without returning completion authority`, async () => {
    const f = fixture(); mutate(f);
    await expect(readInstructionWindowCoverage(f.scope, f.artifact, f.deps)).rejects.toBeInstanceOf(Error);
  });
});
