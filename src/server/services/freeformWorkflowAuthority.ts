import { getDb } from '../config/mongo.js';
import { freeformTicketError, type FreeformTicketRecord, type FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import type { FreeformTurnDocument } from './freeformTurnStore.js';

/** Only the owner workflow fields used by the ticket execution guard. */
export type FreeformWorkflowView = Pick<FreeformTurnDocument, 'turn' | 'retirementRequestedAt' | 'supportCode'>;
/** Authenticated lookup; no caller-authored action progress enters this guard. */
export type FreeformWorkflowReader = (scope: { userId: string; campaignId: string; turnId: string }) => Promise<FreeformWorkflowView | null>;
const readWorkflow: FreeformWorkflowReader = ({ turnId, ...scope }) => getDb().collection<FreeformTurnDocument>('gma_freeform_turns').findOne({ ...scope, _id: turnId });

/** Immutable acceptance can still be read after closure; new execution cannot. */
export async function assertFreeformWorkflowOpen(ticket: FreeformTicketRecord, reader: FreeformWorkflowReader = readWorkflow): Promise<void> {
  if (!ticket.workflowRef) return; // Historical tickets have no turn coordinator.
  const document = await reader({ userId: ticket.userId, campaignId: ticket.campaignId, turnId: ticket.workflowRef.turnId });
  const row = document?.turn?.windows?.find((window) => window.windowId === ticket.workflowRef!.windowId);
  if (!document || document.retirementRequestedAt || document.supportCode || document.turn.status !== 'active'
    || document.turn.activeWindowRef !== row?.windowId || row.ticketRef !== ticket._id
    || row.instructionRef !== `gma:instruction:${ticket.interactionId}`) freeformTicketError('FREEFORM_WORKFLOW_CLOSED');
}

/** Durable membership outlives the expiring, unaccepted Manual ticket cache. */
export type FreeformProgramWorkflowScope = { userId: string; campaignId: string; ticketRef: string; instructionRef: string; programRef: string };
/** Owner-scoped lookup of one accepted program's exact window association. */
export type FreeformProgramWorkflowReader = (scope: FreeformProgramWorkflowScope) => Promise<FreeformTurnDocument | null>;
const readProgramWorkflow: FreeformProgramWorkflowReader = ({ userId, campaignId, ...membership }) =>
  getDb().collection<FreeformTurnDocument>('gma_freeform_turns').findOne({ userId, campaignId, 'turn.windows': { $elemMatch: membership } });

/** Accepted program execution is authorized by durable window membership, never
 * by renewing a ticket or by relying on a TTL document that can disappear. */
export async function readAcceptedFreeformProgramWorkflow(scope: { userId: string; campaignId: string; programId?: string },
  value: unknown,
  deps: { tickets?: FreeformTicketCollection; reader?: FreeformProgramWorkflowReader } = {}): Promise<FreeformTurnDocument | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  // Artifact callers validate the entire binding; this boundary still narrows
  // the fields it uses rather than accepting transport data as typed authority.
  const binding = value as Record<string, unknown>;
  if (typeof binding.policyVersion !== 'string' || !['gma.freeform-intake-policy/3', 'gma.freeform-intake-policy/4', 'gma.freeform-intake-policy/5', 'gma.freeform-intake-policy/6', 'gma.freeform-intake-policy/7', 'gma.freeform-intake-policy/8', 'gma.freeform-intake-policy/9', 'gma.freeform-intake-policy/10', 'gma.freeform-intake-policy/11', 'gma.freeform-intake-policy/12'].includes(binding.policyVersion)) return null;
  if (typeof binding?.ticket !== 'string' || typeof binding.interactionId !== 'string'
    || binding.instructionRef !== `gma:instruction:${binding.interactionId}` || binding.ticketDisposition !== 'owner_accepted') freeformTicketError('FREEFORM_PARENT_BINDING_INVALID');
  const membership = { userId: scope.userId, campaignId: scope.campaignId, ticketRef: binding.ticket,
    instructionRef: binding.instructionRef, programRef: scope.programId ?? `program:${binding.interactionId}` };
  const document = await (deps.reader ?? readProgramWorkflow)(membership);
  if (!document) freeformTicketError('FREEFORM_WORKFLOW_NOT_FOUND');
  const row = document.turn.windows.find((window) => window.windowId === document.turn.activeWindowRef);
  if (document.userId !== scope.userId || document.campaignId !== scope.campaignId || document.turn.campaignId !== scope.campaignId
    || document.retirementRequestedAt || document.supportCode || document.turn.status !== 'active'
    || row?.ticketRef !== membership.ticketRef || row.instructionRef !== membership.instructionRef
    || row.programRef !== membership.programRef || row.status !== 'plan_saved') freeformTicketError('FREEFORM_WORKFLOW_CLOSED');
  return document;
}

/** Existing execution writers share the same durable guard without exposing
 * the private workflow document to their callers. */
export async function assertFreeformProgramWorkflowOpen(scope: { userId: string; campaignId: string; programId?: string }, value: unknown,
  deps: { tickets?: FreeformTicketCollection; reader?: FreeformProgramWorkflowReader } = {}): Promise<void> {
  await readAcceptedFreeformProgramWorkflow(scope, value, deps);
}
