import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest, freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { FREEFORM_TURN_VERSION, FREEFORM_DECISION_VERSION, FREEFORM_WINDOW_MAXIMUM, FREEFORM_DECISION_MAXIMUM,
  FREEFORM_ANSWER_MAXIMUM_BYTES, freeformTurnIssues, type FreeformTurn, type FreeformWindow } from '../../shared/llm/freeformTurn.js';
import { issueFreeformTicket, retireFreeformTicket, freeformTicketCollection, freeformTicketError,
  type FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { readActiveCompoundActionArtifact, readStagedCompoundActionInstruction, stageCompoundActionInstruction, tombstoneCompoundActionArtifact,
  type CompoundActionInstructionDocument } from './compoundActionArtifactStore.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import { actorMechanicsLinkService } from './actorMechanicsLinkStore.js';

type Scope = { userId: string; campaignId: string };
type AnswerBinding = { windowId: string; question: string; questionDigest: string; ticketRef: string; answerInstructionRef: string };
/** Protected orchestration lineage; gameplay truth stays in owner receipts. */
export interface FreeformTurnDocument extends Scope {
  _id: string; rootInteractionId: string; selectedMechanicsSubjectRef: string; selectedMechanicsOwnerRef: string; selectedActorRef: string;
  turn: FreeformTurn; answers: AnswerBinding[]; timelineSequence: number; updatedAt: Date;
  retirementRequestedAt?: Date; supportCode?: string;
  pendingRenewal?: { windowId: string; ticketRef: string } | null;
}
/** Minimal Mongo boundary allows deterministic owner-store tests. */
export type FreeformTurnCollection = Pick<Collection<FreeformTurnDocument>, 'findOne' | 'insertOne' | 'findOneAndUpdate'>;
const collection = (): FreeformTurnCollection => getDb().collection<FreeformTurnDocument>('gma_freeform_turns');
/** Injected owner readers/writers, never a caller-supplied authority cache. */
export interface FreeformTurnDependencies {
  records?: FreeformTurnCollection; tickets?: FreeformTicketCollection;
  readInstruction?: typeof readStagedCompoundActionInstruction;
  stageInstruction?: typeof stageCompoundActionInstruction;
  readArtifact?: typeof readActiveCompoundActionArtifact;
  readScene?: typeof readCurrentSceneContexts;
  readActors?: typeof readObservationAuthority;
  readActorLinks?: ReturnType<typeof actorMechanicsLinkService>['read'];
  tombstoneArtifact?: typeof tombstoneCompoundActionArtifact;
}
/** Only opaque lineage and immutable instruction evidence leave this coordinator. */
export interface FreeformTurnState {
  turn: FreeformTurn; instruction: JsonObject;
  originCheckpoint: CompoundActionInstructionDocument['originCheckpoint'] | null;
  retirementPending?: boolean; supportCode?: string;
  ticketDisposition?: { schemaVersion: 'gmc.freeform-ticket-disposition/1'; ticketRef: string; attempt: 1 | 2;
    status: 'rejected' | 'replacement'; supportStop: boolean; replacementPermitted: boolean; issues: { path: string; code: string }[] };
}
/** Human answer and exact-parent advancement are distinct protected transitions. */
export interface FreeformTurnPrepareInput extends Scope {
  interactionId?: string; turnId?: string; selectedMechanicsSubjectRef?: string; selectedMechanicsOwnerRef?: string;
  previousTicket?: string; renewTicket?: string; answer?: { ticket: string; text: string; expectedRevision: number };
  advance?: boolean; expectedParentProgramRef?: string;
}
/** Explicit coordinator API; none of its methods resolves gameplay. */
export interface FreeformTurnService {
  read(input: Scope & { turnId?: string; interactionId?: string; programId?: string }): Promise<FreeformTurnState | null>;
  prepare(input: FreeformTurnPrepareInput): Promise<FreeformTurnState | null>;
  retire(input: Scope & { turnId: string; expectedRevision: number }): Promise<{ turn: FreeformTurn; duplicate: boolean }>;
}
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const errorCode = (error: unknown): unknown => error && typeof error === 'object' && 'code' in error ? error.code : null;
const ownerArray = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : freeformTicketError('FREEFORM_PLAN_BINDING_INVALID');
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const interactionOf = (ref: string) => ref.replace(/^gma:instruction:/, '');
function instruction(exactText: string, interactionId: string): JsonObject {
  return { schemaVersion: 'gma.player-instruction-artifact/1', interactionId, instructionRef: `gma:instruction:${interactionId}`,
    exactText, utf8Bytes: Buffer.byteLength(exactText), instructionFingerprint: freeformTextDigest(exactText) };
}
function windowRow(interactionId: string, ordinal: number, parentProgramRef: string | null): FreeformWindow {
  return { windowId: `window:${freeformTextDigest(interactionId).slice(0, 32)}`, ordinal,
    instructionRef: `gma:instruction:${interactionId}`, parentProgramRef, ticketRef: null, programRef: null,
    pendingDecision: null, status: 'awaiting_reply' };
}
const activeWindow = (document: FreeformTurnDocument) => document.turn.windows.find((row) => row.windowId === document.turn.activeWindowRef)!;
const scoped = (input: Scope) => ({ userId: input.userId, campaignId: input.campaignId });

/** Server-owned CAS coordinator. No model calls or world/mechanics writes. */
export function freeformTurnService(deps: FreeformTurnDependencies = {}): FreeformTurnService {
  const records = deps.records ?? collection(), tickets = deps.tickets ?? freeformTicketCollection();
  const readInstruction = deps.readInstruction ?? readStagedCompoundActionInstruction;
  const stageInstruction = deps.stageInstruction ?? stageCompoundActionInstruction;
  const readArtifact = deps.readArtifact ?? readActiveCompoundActionArtifact;
  const readScene = deps.readScene ?? readCurrentSceneContexts;
  const readActors = deps.readActors ?? readObservationAuthority;
  const readActorLinks = deps.readActorLinks ?? actorMechanicsLinkService().read;
  const tombstoneArtifact = deps.tombstoneArtifact ?? tombstoneCompoundActionArtifact;
  async function save(before: FreeformTurnDocument, next: FreeformTurnDocument) {
    next.turn.revision = before.turn.revision + 1; next.updatedAt = new Date();
    if (freeformTurnIssues(next.turn).length) freeformTicketError('FREEFORM_TURN_INVALID');
    const result = await records.findOneAndUpdate({ ...scoped(before), _id: before._id, 'turn.revision': before.turn.revision },
      { $set: { turn: next.turn, answers: next.answers, updatedAt: next.updatedAt,
        pendingRenewal: next.pendingRenewal ?? null,
        ...(next.retirementRequestedAt ? { retirementRequestedAt: next.retirementRequestedAt } : {}),
        ...(next.supportCode ? { supportCode: next.supportCode } : {}) } }, { returnDocument: 'after' });
    if (!result) freeformTicketError('FREEFORM_TURN_REVISION_CONFLICT');
    return result;
  }
  async function load(input: Scope & { turnId?: string; interactionId?: string; programId?: string }) {
    if (![input.userId, input.campaignId].every(identifier)
      || input.turnId !== undefined && !identifier(input.turnId)
      || input.interactionId !== undefined && !identifier(input.interactionId)
      || input.programId !== undefined && (!identifier(input.programId) || input.turnId !== undefined || input.interactionId !== undefined)) freeformTicketError('FREEFORM_TURN_INPUT_INVALID', 422);
    const filter = input.programId ? { 'turn.windows.programRef': input.programId }
      : input.turnId ? { _id: input.turnId } : { rootInteractionId: input.interactionId };
    const document = await records.findOne({ ...scoped(input), ...filter });
    if (document && freeformTurnIssues(document.turn).length) freeformTicketError('FREEFORM_TURN_INVALID');
    return document;
  }
  async function read(input: Scope & { turnId?: string; interactionId?: string; programId?: string }) {
    const document = await load(input);
    if (!document) return null;
    const window = activeWindow(document);
    const staged = await readInstruction({ ...scoped(input), interactionId: interactionOf(window.instructionRef) });
    if (!staged) freeformTicketError('FREEFORM_INSTRUCTION_NOT_STAGED');
    const ticket = window.ticketRef ? await tickets.findOne({ ...scoped(input), _id: window.ticketRef }) : null;
    const rejected = ticket?.status === 'retired' && !!ticket.failureSignature && ticket.response?.output === null
      && ['failed', 'review_required'].includes(ticket.response.status);
    const previous = ticket?.previousTicket ? await tickets.findOne({ ...scoped(input), _id: ticket.previousTicket }) : null;
    const replacement = ticket?.attempt === 2 && ['active', 'running'].includes(ticket.status)
      && previous?.status === 'retired' && !!previous.failureSignature && previous.response?.output === null
      && !previous.supportStop && previous.workflowRef?.turnId === document._id && previous.workflowRef.windowId === window.windowId
      && previous.instructionFingerprint === staged.instruction.instructionFingerprint;
    if (rejected && (ticket.workflowRef?.turnId !== document._id || ticket.workflowRef.windowId !== window.windowId
      || ticket.instructionFingerprint !== staged.instruction.instructionFingerprint)) freeformTicketError('FREEFORM_TICKET_BINDING_INVALID');
    return { turn: document.turn, instruction: staged.instruction, originCheckpoint: staged.originCheckpoint,
      ...(rejected || replacement ? { ticketDisposition: { schemaVersion: 'gmc.freeform-ticket-disposition/1' as const, ticketRef: ticket!._id,
        attempt: ticket!.attempt, status: rejected ? 'rejected' as const : 'replacement' as const, supportStop: ticket!.supportStop === true,
        replacementPermitted: ticket.attempt === 1 && !ticket.supportStop && ticket.expiresAt > new Date()
          && document.turn.status === 'active' && !document.retirementRequestedAt && !document.supportCode && !window.programRef,
        issues: (rejected ? ticket!.response! : previous!.response!).validation.flatMap((row) => row.issues).slice(0, 16).map((row) => ({ path: row.path ?? '$', code: row.code })) } } : {}),
      ...(document.retirementRequestedAt && document.turn.status !== 'retired' ? { retirementPending: true } : {}),
      ...(document.supportCode ? { supportCode: document.supportCode } : {}) };
  }
  async function stageDerived(document: FreeformTurnDocument, value: JsonObject, origin: CompoundActionInstructionDocument['originCheckpoint'] | null) {
    const current = await readInstruction({ ...scoped(document), interactionId: String(value.interactionId) });
    if (current) {
      if (freeformJsonDigest(current.instruction) !== freeformJsonDigest(value)) freeformTicketError('FREEFORM_INSTRUCTION_BINDING_INVALID');
      return current;
    }
    const scene = await readScene(scoped(document));
    if (!scene?.storyWorkspaceRef || !origin) freeformTicketError('FREEFORM_INSTRUCTION_ORIGIN_REQUIRED');
    await stageInstruction({ ...scoped(document), instruction: value, idempotencyKey: `freeform-stage:${value.interactionId}`,
      expectedStoryWorkspaceRef: scene.storyWorkspaceRef as unknown as JsonObject,
      timelineAnchor: { messageId: origin.messageId, sequence: origin.timelineSequence, replayLineageId: origin.replayLineageId } });
    return (await readInstruction({ ...scoped(document), interactionId: String(value.interactionId) }))!;
  }
  async function stop(document: FreeformTurnDocument, code: string): Promise<never> {
    const next = structuredClone(document); next.supportCode = code;
    next.turn.status = 'retired'; activeWindow(next).status = 'retired';
    await save(document, next);
    freeformTicketError(code);
  }
  async function prepareOnce(input: FreeformTurnPrepareInput): Promise<FreeformTurnState | null> {
    let document = await load(input);
    if (!document) {
      if (input.turnId || !identifier(input.interactionId) || !identifier(input.selectedMechanicsSubjectRef) || !identifier(input.selectedMechanicsOwnerRef)) freeformTicketError('FREEFORM_TURN_NOT_FOUND', 404);
      const staged = await readInstruction({ ...scoped(input), interactionId: input.interactionId });
      if (!staged?.originCheckpoint) freeformTicketError('FREEFORM_INSTRUCTION_ORIGIN_REQUIRED');
      const projection = await readActors(scoped(input));
      const identity = await readActorLinks(scoped(input), projection);
      const bindings = [...(projection.actorMechanicsBindings ?? []), ...identity.links];
      const matches = bindings.filter((row) => row.state === 'active' && row.campaignRef === input.campaignId
        && row.mechanicsSubjectRef === input.selectedMechanicsSubjectRef
        && row.vcsOwnerRef === input.selectedMechanicsOwnerRef
        && projection.actorCandidates.some((candidate) => candidate.actorRef === row.actorRef));
      const actors = [...new Set(matches.map((row) => row.actorRef))];
      if (actors.length !== 1) freeformTicketError('FREEFORM_SELECTED_CHARACTER_BINDING_REQUIRED');
      const turnId = `freeform-turn:${freeformJsonDigest({ ...scoped(input), interactionId: input.interactionId }).slice(0, 40)}`;
      const first = windowRow(input.interactionId, 1, null);
      document = { ...scoped(input), _id: turnId, rootInteractionId: input.interactionId,
        selectedMechanicsSubjectRef: input.selectedMechanicsSubjectRef, selectedMechanicsOwnerRef: input.selectedMechanicsOwnerRef,
        selectedActorRef: String(actors[0]), answers: [],
        timelineSequence: staged.originCheckpoint.timelineSequence, updatedAt: new Date(),
        turn: { schemaVersion: FREEFORM_TURN_VERSION, turnId, campaignId: input.campaignId,
          rootInstructionRef: String(staged.instruction.instructionRef), revision: 1, status: 'active', activeWindowRef: first.windowId, windows: [first] } };
      try { await records.insertOne(document); }
      catch (error) { if (errorCode(error) !== 11000) throw error; document = (await load({ ...input, turnId }))!; }
    }
    if (input.selectedMechanicsSubjectRef && document.selectedMechanicsSubjectRef !== input.selectedMechanicsSubjectRef) freeformTicketError('FREEFORM_SELECTED_CHARACTER_CHANGED');
    if (input.selectedMechanicsOwnerRef && document.selectedMechanicsOwnerRef !== input.selectedMechanicsOwnerRef) freeformTicketError('FREEFORM_SELECTED_CHARACTER_CHANGED');
    if (document.supportCode) freeformTicketError(document.supportCode);
    if (document.retirementRequestedAt && document.turn.status !== 'retired') freeformTicketError('FREEFORM_RETIREMENT_PENDING');
    if (document.turn.status !== 'active') return read({ ...scoped(input), turnId: document._id });
    if (document.pendingRenewal && !input.renewTicket) input = { ...input, renewTicket: document.pendingRenewal.ticketRef };
    let window = activeWindow(document);
    if (input.advance) {
      if (!identifier(input.expectedParentProgramRef)) freeformTicketError('FREEFORM_PARENT_BINDING_REQUIRED');
      const parent = document.turn.windows.find((row) => row.programRef === input.expectedParentProgramRef
        || `program:${interactionOf(row.instructionRef)}` === input.expectedParentProgramRef);
      if (!parent) freeformTicketError('FREEFORM_PARENT_BINDING_INVALID');
      // A delayed retry of an older completion discovers the current window;
      // it cannot advance that window even if it has since completed too.
      if (parent.windowId !== window.windowId) return read({ ...scoped(input), turnId: document._id });
    }
    // Reconcile the existing artifact before ticket lifetime or disposition.
    let artifact = await readArtifact({ ...scoped(input), programId: window.programRef ?? `program:${interactionOf(window.instructionRef)}` });
    if (artifact && !window.programRef) {
      if (!artifact.artifact.freeformBinding) freeformTicketError('FREEFORM_PLAN_BINDING_INVALID');
      const next = structuredClone(document); const row = activeWindow(next);
      row.programRef = String((artifact.artifact.program as JsonObject).programId); row.status = 'plan_saved'; row.pendingDecision = null;
      document = await save(document, next); window = activeWindow(document);
    }
    if (artifact && input.advance) {
      const cursor = artifact.artifact.cursor, program = artifact.artifact.program, binding = artifact.artifact.freeformBinding;
      if (!object(cursor) || !object(program) || !object(binding) || typeof binding.suffixText !== 'string') freeformTicketError('FREEFORM_PLAN_BINDING_INVALID');
      if (cursor.waiting || ownerArray(cursor.readyNodeRefs).length || ownerArray(cursor.remainingNodeRefs).length
        || ownerArray(cursor.completedNodeRefs).length + ownerArray(cursor.skippedNodeRefs).length !== ownerArray(program.nodes).length) freeformTicketError('FREEFORM_PARENT_NOT_COMPLETED');
      const suffix = binding.suffixText;
      const next = structuredClone(document); activeWindow(next).status = 'completed';
      if (!suffix.length) { next.turn.status = 'completed'; document = await save(document, next); return read({ ...scoped(input), turnId: document._id }); }
      if (window.ordinal >= FREEFORM_WINDOW_MAXIMUM) return stop(document, 'FREEFORM_WINDOW_LIMIT');
      const parent = await readInstruction({ ...scoped(input), interactionId: interactionOf(window.instructionRef) });
      const childId = `${document.rootInteractionId.slice(0, 130)}:window:${window.ordinal + 1}:${freeformTextDigest(suffix).slice(0, 24)}`;
      const child = instruction(suffix, childId);
      await stageDerived(document, child, parent?.originCheckpoint ?? null);
      const row = windowRow(childId, window.ordinal + 1, window.programRef);
      next.turn.windows.push(row); next.turn.activeWindowRef = row.windowId;
      document = await save(document, next); window = activeWindow(document); artifact = null;
    }
    if (artifact) return read({ ...scoped(input), turnId: document._id });
    const ticket = window.ticketRef ? await tickets.findOne({ ...scoped(input), _id: window.ticketRef }) : null;
    if (ticket?.status === 'accepted' && !window.pendingDecision) {
      const output = ticket.response?.output;
      if (!object(output) || typeof output.clarification !== 'string' || !output.clarification.trim()) freeformTicketError('FREEFORM_PLAN_BINDING_INVALID');
      const question = output.clarification;
      const digest = freeformTextDigest(question.trim().toLocaleLowerCase('en-US'));
      if (document.answers.some((row) => row.windowId === window.windowId && row.questionDigest === digest)
        || document.answers.filter((row) => row.windowId === window.windowId).length >= FREEFORM_DECISION_MAXIMUM) return stop(document, 'FREEFORM_CLARIFICATION_SUPPORT_REQUIRED');
      const next = structuredClone(document); const row = activeWindow(next);
      row.pendingDecision = { schemaVersion: FREEFORM_DECISION_VERSION, ticketRef: ticket._id, questionDigest: digest,
        question, originalInstructionRef: window.instructionRef, answerInstructionRef: null };
      row.status = 'awaiting_clarification'; document = await save(document, next); window = activeWindow(document);
    }
    if (input.answer) {
      const answer = input.answer;
      if (!identifier(answer.ticket) || typeof answer.text !== 'string' || !answer.text.trim()
        || Buffer.byteLength(answer.text) > FREEFORM_ANSWER_MAXIMUM_BYTES) freeformTicketError('FREEFORM_ANSWER_INVALID', 422);
      const decision = window.pendingDecision;
      const prior = document.answers.find((row) => row.ticketRef === answer.ticket);
      if (prior) {
        const staged = await readInstruction({ ...scoped(input), interactionId: interactionOf(prior.answerInstructionRef) });
        if (staged?.instruction.exactText !== answer.text) freeformTicketError('FREEFORM_ANSWER_CHANGED');
      } else {
        if (!decision || decision.ticketRef !== answer.ticket || document.turn.revision !== answer.expectedRevision) freeformTicketError('FREEFORM_ANSWER_BINDING_INVALID');
        const parent = await readInstruction({ ...scoped(input), interactionId: interactionOf(window.instructionRef) });
        const answerId = `${document.rootInteractionId.slice(0, 120)}:answer:${freeformJsonDigest({ ticket: answer.ticket, text: answer.text }).slice(0, 32)}`;
        await stageDerived(document, instruction(answer.text, answerId), parent?.originCheckpoint ?? null);
        const proposalId = `${document.rootInteractionId.slice(0, 120)}:clarified:${freeformTextDigest(answerId).slice(0, 32)}`;
        await stageDerived(document, instruction(String(parent!.instruction.exactText), proposalId), parent!.originCheckpoint);
        const next = structuredClone(document); const row = activeWindow(next);
        next.answers.push({ windowId: window.windowId, question: decision.question, questionDigest: decision.questionDigest,
          ticketRef: decision.ticketRef, answerInstructionRef: `gma:instruction:${answerId}` });
        row.instructionRef = `gma:instruction:${proposalId}`; row.pendingDecision = null; row.ticketRef = null; row.status = 'awaiting_reply';
        document = await save(document, next); window = activeWindow(document);
      }
    }
    if (window.pendingDecision) return read({ ...scoped(input), turnId: document._id });
    if (input.renewTicket) {
      if (ticket?.renewedTicket === input.renewTicket) return read({ ...scoped(input), turnId: document._id });
      const expired = await tickets.findOne({ ...scoped(input), _id: input.renewTicket });
      if (window.ticketRef !== input.renewTicket || !expired || expired.expiresAt > new Date()
        || !['active', 'retired'].includes(expired.status) || expired.failureSignature || expired.supportStop) freeformTicketError('FREEFORM_RENEWAL_NOT_ALLOWED');
      if (expired.status === 'active') await retireFreeformTicket({ ...scoped(input), ticket: expired._id }, tickets);
      const parent = await readInstruction({ ...scoped(input), interactionId: interactionOf(window.instructionRef) });
      const renewalId = `${document.rootInteractionId.slice(0, 120)}:renew:${freeformTextDigest(expired._id).slice(0, 32)}`;
      await stageDerived(document, instruction(String(parent!.instruction.exactText), renewalId), parent!.originCheckpoint);
      // Preserve the window and answer history; only the expired, never-accepted
      // packet receives a new immutable instruction origin and ticket identity.
      const next = structuredClone(document); activeWindow(next).instructionRef = `gma:instruction:${renewalId}`;
      next.pendingRenewal = { windowId: window.windowId, ticketRef: expired._id };
      document = await save(document, next); window = activeWindow(document);
    }
    if (window.ticketRef && !input.previousTicket && !input.renewTicket) {
      const currentTicket = await tickets.findOne({ ...scoped(input), _id: window.ticketRef });
      if (!currentTicket || currentTicket.status === 'retired') freeformTicketError(currentTicket?.supportStop ? 'FREEFORM_INTAKE_SUPPORT_REQUIRED' : 'FREEFORM_TICKET_RETIRED');
      return read({ ...scoped(input), turnId: document._id });
    }
    if (input.previousTicket && input.previousTicket !== window.ticketRef) freeformTicketError('FREEFORM_REPLACEMENT_NOT_ALLOWED');
    const clarifications = await Promise.all(document.answers.filter((row) => row.windowId === window.windowId).map(async (row) => {
      const staged = await readInstruction({ ...scoped(input), interactionId: interactionOf(row.answerInstructionRef) });
      if (!staged) freeformTicketError('FREEFORM_ANSWER_BINDING_INVALID');
      return { question: row.question, answer: String(staged.instruction.exactText) };
    }));
    const issued = await issueFreeformTicket({ ...scoped(input), interactionId: interactionOf(window.instructionRef),
      issuanceKey: `freeform:${freeformTextDigest(window.instructionRef).slice(0, 40)}:${input.previousTicket ? 2 : 1}`,
      mode: 'action', transport: 'manual', selectedActorRef: document.selectedActorRef, includeSceneCatalog: true,
      workflowRef: { turnId: document._id, windowId: window.windowId },
      ...(input.renewTicket ? { renewedTicket: input.renewTicket } : {}),
      ...(clarifications.length ? { clarifications } : {}), ...(input.previousTicket ? { previousTicket: input.previousTicket } : {}) },
    { records: tickets, readInstruction, readSceneContext: readScene });
    if (window.ticketRef !== issued.ticket) {
      const next = structuredClone(document); activeWindow(next).ticketRef = issued.ticket;
      next.pendingRenewal = null;
      document = await save(document, next);
    }
    return read({ ...scoped(input), turnId: document._id });
  }
  async function prepare(input: Parameters<typeof prepareOnce>[0]) {
    try { return await prepareOnce(input); }
    catch (error) {
      // One deterministic rediscovery, with the same immutable identities.
      // This is not another interpretation or a takeover of running work.
      if (errorCode(error) !== 'FREEFORM_TURN_REVISION_CONFLICT') throw error;
      return prepareOnce(input);
    }
  }
  async function retire(input: Scope & { turnId: string; expectedRevision: number }) {
    let document = await load(input);
    if (!document) freeformTicketError('FREEFORM_TURN_NOT_FOUND', 404);
    if (document.turn.status === 'retired') return { turn: document.turn, duplicate: true };
    if (!document.retirementRequestedAt && document.turn.revision !== input.expectedRevision) freeformTicketError('FREEFORM_TURN_REVISION_CONFLICT');
    // Inspect every uncertain acceptance before closing any pending work.
    for (const row of document.turn.windows) {
      if (!row.ticketRef) continue;
      const ticket = await tickets.findOne({ ...scoped(input), _id: row.ticketRef });
      if (ticket?.status === 'running') freeformTicketError('FREEFORM_ACCEPTANCE_PENDING');
    }
    if (!document.retirementRequestedAt) {
      const next = structuredClone(document); next.retirementRequestedAt = new Date();
      document = await save(document, next);
    }
    const current = activeWindow(document);
    const existing = await readArtifact({ ...scoped(input), programId: current.programRef ?? `program:${interactionOf(current.instructionRef)}` });
    if (existing) {
      const cursor = existing.artifact.cursor as JsonObject;
      const saga = existing.artifact.saga;
      if (saga != null && (!object(saga) || !Array.isArray(saga.operations)
        || saga.operations.some((row) => !object(row) || ['dispatching', 'outcome_unknown'].includes(String(row.disposition))))) freeformTicketError('FREEFORM_OWNER_OUTCOME_UNKNOWN');
      if (cursor.waiting || (cursor.remainingNodeRefs as unknown[]).length || (cursor.readyNodeRefs as unknown[]).length) {
        await tombstoneArtifact({ ...scoped(input), programId: String((existing.artifact.program as JsonObject).programId),
          expectedRevision: existing.artifactRef.revision, idempotencyKey: `freeform-cancel:${document._id}` });
      }
    }
    for (const row of document.turn.windows) {
      if (!row.ticketRef) continue;
      const ticket = await tickets.findOne({ ...scoped(input), _id: row.ticketRef });
      if (ticket?.status === 'running') freeformTicketError('FREEFORM_ACCEPTANCE_PENDING');
      if (ticket?.status === 'active') await retireFreeformTicket({ ...scoped(input), ticket: ticket._id }, tickets);
    }
    const next = structuredClone(document); next.turn.status = 'retired'; activeWindow(next).status = 'retired';
    document = await save(document, next);
    return { turn: document.turn, duplicate: false };
  }
  return { read, prepare, retire };
}

/** Rewind closes only roots causally beyond the owner-verified boundary. */
export async function rewindFreeformTurns(input: Scope & { boundarySequence: number }, deps: FreeformTurnDependencies = {},
  candidates = getDb().collection<FreeformTurnDocument>('gma_freeform_turns')): Promise<{ retiredTurnCount: number }> {
  if (!Number.isSafeInteger(input.boundarySequence) || input.boundarySequence < 0) freeformTicketError('FREEFORM_TURN_INPUT_INVALID', 422);
  const rows = await candidates.find({ ...scoped(input), timelineSequence: { $gt: input.boundarySequence }, 'turn.status': 'active' }).toArray();
  const service = freeformTurnService(deps);
  for (const row of rows) await service.retire({ ...scoped(input), turnId: row._id, expectedRevision: row.turn.revision });
  return { retiredTurnCount: rows.length };
}
