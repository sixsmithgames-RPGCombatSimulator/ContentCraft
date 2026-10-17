import { describe, expect, it } from 'vitest';
import { assertFreeformProgramWorkflowOpen } from './freeformWorkflowAuthority.js';
import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import type { FreeformTurnDocument } from './freeformTurnStore.js';

const scope = { userId: 'owner:one', campaignId: 'campaign:one', programId: 'program:interaction:one' };
const binding = { policyVersion: 'gma.freeform-intake-policy/4', ticket: 'ticket:one',
  interactionId: 'interaction:one', instructionRef: 'gma:instruction:interaction:one', ticketDisposition: 'owner_accepted' };
function document(): FreeformTurnDocument {
  return { _id: 'turn:one', userId: scope.userId, campaignId: scope.campaignId, rootInteractionId: binding.interactionId,
    selectedMechanicsSubjectRef: 'character:one', selectedMechanicsOwnerRef: scope.userId, selectedActorRef: 'actor:one',
    answers: [], timelineSequence: 1, updatedAt: new Date(0),
    turn: { schemaVersion: 'gma.freeform-turn/1', turnId: 'turn:one', campaignId: scope.campaignId,
      rootInstructionRef: binding.instructionRef, revision: 2, status: 'active', activeWindowRef: 'window:one', windows: [
        { windowId: 'window:one', ordinal: 1, ticketRef: binding.ticket, instructionRef: binding.instructionRef,
          parentProgramRef: null, programRef: scope.programId, pendingDecision: null, status: 'plan_saved' },
      ] } };
}

describe('durable accepted freeform workflow scope', () => {
  it('survives accepted ticket TTL deletion without renewing, reading or extending the ticket', async () => {
    const tickets = { findOne: async () => { throw new Error('Accepted execution must not depend on the TTL ticket collection.'); } } as unknown as FreeformTicketCollection;
    for (const policyVersion of ['gma.freeform-intake-policy/3', 'gma.freeform-intake-policy/4', 'gma.freeform-intake-policy/5', 'gma.freeform-intake-policy/6']) {
      await expect(assertFreeformProgramWorkflowOpen(scope, { ...binding, policyVersion }, { tickets, reader: async (query) => {
        expect(query).toEqual({ userId: scope.userId, campaignId: scope.campaignId, ticketRef: binding.ticket,
          instructionRef: binding.instructionRef, programRef: scope.programId });
        return document();
      } })).resolves.toBeUndefined();
    }
  });
  it('derives exact immutable program identity without an extra caller programId', async () => {
    await expect(assertFreeformProgramWorkflowOpen({ userId: scope.userId, campaignId: scope.campaignId }, binding,
      { reader: async (query) => { expect(query.programRef).toBe(scope.programId); return document(); } })).resolves.toBeUndefined();
  });
  it('rejects absent owner-scoped membership instead of resurrecting an expired ticket', async () => {
    await expect(assertFreeformProgramWorkflowOpen(scope, binding, { reader: async () => null }))
      .rejects.toMatchObject({ code: 'FREEFORM_WORKFLOW_NOT_FOUND' });
  });
  for (const [label, mutate] of [
    ['another owner', (d: FreeformTurnDocument) => { d.userId = 'owner:foreign'; }],
    ['another campaign', (d: FreeformTurnDocument) => { d.campaignId = 'campaign:foreign'; }],
    ['another projected campaign', (d: FreeformTurnDocument) => { d.turn.campaignId = 'campaign:foreign'; }],
    ['retirement in progress', (d: FreeformTurnDocument) => { d.retirementRequestedAt = new Date(0); }],
    ['retired root', (d: FreeformTurnDocument) => { d.turn.status = 'retired'; }],
    ['support stop', (d: FreeformTurnDocument) => { d.supportCode = 'closed'; }],
    ['successor already active', (d: FreeformTurnDocument) => { d.turn.activeWindowRef = 'window:two'; }],
    ['another ticket', (d: FreeformTurnDocument) => { d.turn.windows[0].ticketRef = 'ticket:two'; }],
    ['another instruction', (d: FreeformTurnDocument) => { d.turn.windows[0].instructionRef = 'gma:instruction:another'; }],
    ['another program', (d: FreeformTurnDocument) => { d.turn.windows[0].programRef = 'program:another'; }],
    ['unaccepted window', (d: FreeformTurnDocument) => { d.turn.windows[0].status = 'awaiting_reply'; }],
  ] as const) it(`rejects ${label} even with matching historical acceptance`, async () => {
    const d = document(); mutate(d);
    await expect(assertFreeformProgramWorkflowOpen(scope, binding, { reader: async () => d }))
      .rejects.toMatchObject({ code: 'FREEFORM_WORKFLOW_CLOSED' });
  });
  for (const invalid of [
    { ...binding, ticketDisposition: 'pending' }, { ...binding, instructionRef: 'gma:instruction:foreign' }, { ...binding, ticket: null },
  ]) it('rejects inconsistent provenance before any membership read', async () => {
    await expect(assertFreeformProgramWorkflowOpen(scope, invalid, { reader: async () => { throw new Error('must not read'); } }))
      .rejects.toMatchObject({ code: 'FREEFORM_PARENT_BINDING_INVALID' });
  });
  it('rejects a caller program different from the accepted instruction', async () => {
    await expect(assertFreeformProgramWorkflowOpen({ ...scope, programId: 'program:other' }, binding,
      { reader: async () => document() })).rejects.toMatchObject({ code: 'FREEFORM_WORKFLOW_CLOSED' });
  });
});
