import { randomUUID } from 'node:crypto';
import { freeformJsonDigest, FREEFORM_PLAN_BINDING_REGISTRY_VERSIONS } from '../../shared/llm/freeformPlanBinding.js';
import type { Collection } from 'mongodb';
import { LLM_REQUEST_SCHEMA_VERSION, type LlmRequestEnvelope, type LlmResponseEnvelope } from '../../shared/llm/orchestratorContracts.js';
import { FREEFORM_INTAKE_OPERATION, FREEFORM_INTAKE_POLICY_VERSION, FREEFORM_ANSWER_POLICY_VERSION,
  FREEFORM_READABLE_POLICY_VERSIONS, FREEFORM_REMOTE_POLICY_VERSION, FREEFORM_REMOTE_ANSWER_POLICY_VERSION,
  FREEFORM_READ_EFFECT_OPERATION, FREEFORM_READ_EFFECT_POLICY_VERSION, FREEFORM_READ_EFFECT_ANSWER_POLICY_VERSION,
  FREEFORM_MOVER_POLICY_VERSION, FREEFORM_MOVER_ANSWER_POLICY_VERSION, FREEFORM_TYPED_REFERENCE_OPERATION,
  FREEFORM_TYPED_REFERENCE_POLICY_VERSION, FREEFORM_TYPED_REFERENCE_ANSWER_POLICY_VERSION } from '../../shared/llm/freeformIntakePolicy.js';
import { readEffectWritesEnabled, typedReferenceWritesEnabled } from '../services/readEffectRollout.js';
import { getDb } from '../config/mongo.js';
import { readStagedCompoundActionInstruction } from '../services/compoundActionArtifactStore.js';
import { OrchestratorError } from './errors.js';
import { getOperationDefinition, OPERATION_REGISTRY_VERSION } from './operationRegistry.js';
import { resolveOperationContext } from './contextResolver.js';
import { readCurrentSceneContexts } from '../services/actionDirectedStoryStore.js';
import { buildFreeformSceneCatalog, type FreeformCatalogBinding, type FreeformCatalogContextRef } from './freeformSceneCatalog.js';
import { FREEFORM_SITUATION, freeformSituationIssues, isSituationPolicy } from '../../shared/llm/freeformSituation.js';
import { readFreeformSituationSources, buildFreeformSituation, assertSituationCurrent, situationPublicLabels, situationError, type SituationReader } from './freeformSituationContext.js';

export const FREEFORM_TICKET_LIFETIME_MS = 86_400_000;
export const freeformDigest = freeformJsonDigest;

export function freeformTicketError(code: string, status = 409): never {
  throw new OrchestratorError({ code, category: 'policy', status, retryable: false,
    message: 'The protected intake request cannot be used in its current disposition.', source: 'gmc.freeform-ticket' });
}

export interface FreeformTicketRecord {
  _id: string;
  userId: string;
  campaignId: string;
  interactionId: string;
  issuanceKey: string;
  issuanceDigest: string;
  instructionFingerprint: string;
  policyVersion: string;
  registryVersion: string;
  mode: 'action';
  transport: 'manual' | 'integrated';
  selectedActorRef: string | null;
  catalogBindings?: FreeformCatalogBinding[];
  catalogContextRef?: FreeformCatalogContextRef;
  situationBinding?: Record<string, any>;
  situationBindingDigest?: string;
  attempt: 1 | 2;
  previousTicket: string | null;
  status: 'active' | 'running' | 'accepted' | 'retired';
  request: LlmRequestEnvelope;
  requestDigest: string;
  outputDigest?: string;
  response?: LlmResponseEnvelope;
  failureSignature?: string;
  supportStop?: boolean;
  workflowRef?: { turnId: string; windowId: string };
  renewedTicket?: string;
  createdAt: Date;
  expiresAt: Date;
}

export type FreeformTicketCollection = Pick<Collection<FreeformTicketRecord>, 'findOne' | 'insertOne' | 'findOneAndUpdate'>;
export const freeformTicketCollection = (): FreeformTicketCollection => getDb().collection<FreeformTicketRecord>('llm_freeform_tickets');

export interface IssueFreeformTicketInput {
  userId: string;
  campaignId: string;
  interactionId: string;
  issuanceKey: string;
  mode: 'action';
  transport: 'manual' | 'integrated';
  selectedActorRef: string | null;
  previousTicket?: string | null;
  includeSceneCatalog?: boolean;
  includeSituation?: boolean;
  /** Protected workflow service only; never accepted by the raw issuance route. */
  clarifications?: { question: string; answer: string }[];
  workflowRef?: { turnId: string; windowId: string };
  renewedTicket?: string;
}

export function validateFreeformTicketInput(input: IssueFreeformTicketInput) {
  if (input.workflowRef !== undefined && (!input.workflowRef || Object.keys(input.workflowRef).sort().join(',') !== 'turnId,windowId'
    || Object.values(input.workflowRef).some((value) => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)))
    || input.renewedTicket !== undefined && (typeof input.renewedTicket !== 'string' || !input.renewedTicket.length || input.renewedTicket.length > 80)) freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  if (input.clarifications !== undefined && (!Array.isArray(input.clarifications) || !input.clarifications.length || input.clarifications.length > 2
    || input.transport !== 'manual' || input.clarifications.some((row) => !row || Object.keys(row).sort().join(',') !== 'answer,question'
      || typeof row.question !== 'string' || !row.question.trim() || row.question.length > 500
      || typeof row.answer !== 'string' || !row.answer.trim() || Buffer.byteLength(row.answer) > 2048))) {
    freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  }
  for (const key of ['userId', 'campaignId', 'interactionId', 'issuanceKey'] as const) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 240) freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  }
  if (input.mode !== 'action' || !['manual', 'integrated'].includes(input.transport)
    || input.includeSituation !== undefined && typeof input.includeSituation !== 'boolean'
    || input.includeSituation === true && (input.includeSceneCatalog !== true || input.transport !== 'manual')
    || input.includeSceneCatalog !== undefined && typeof input.includeSceneCatalog !== 'boolean'
    || input.includeSceneCatalog === true && input.transport !== 'manual'
    || input.selectedActorRef !== null && (typeof input.selectedActorRef !== 'string' || !input.selectedActorRef.length
      || input.selectedActorRef.length > 240)
    || input.previousTicket !== undefined && input.previousTicket !== null
      && (typeof input.previousTicket !== 'string' || !input.previousTicket.length || input.previousTicket.length > 80)) {
    freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  }
}

export async function issueFreeformTicket(input: IssueFreeformTicketInput, options: {
  records?: FreeformTicketCollection;
  readInstruction?: typeof readStagedCompoundActionInstruction;
  readSceneContext?: typeof readCurrentSceneContexts;
  readSituationSources?: SituationReader;
  now?: Date;
} = {}) {
  validateFreeformTicketInput(input);
  const records = options.records ?? freeformTicketCollection();
  const now = options.now ?? new Date();
  const staged = await (options.readInstruction ?? readStagedCompoundActionInstruction)(input);
  if (!staged) freeformTicketError('FREEFORM_INSTRUCTION_NOT_STAGED', 404);
  const instruction = staged.instruction;
  const originalTicket = input.previousTicket ?? input.renewedTicket;
  const originalContract = originalTicket ? await records.findOne({ userId: input.userId, campaignId: input.campaignId, _id: originalTicket }) : null;
  const typedReferences = originalContract ? originalContract.request.operation === FREEFORM_TYPED_REFERENCE_OPERATION
    : input.transport === 'manual' && typedReferenceWritesEnabled(input.campaignId);
  const readEffects = typedReferences || (originalContract ? originalContract.request.operation === FREEFORM_READ_EFFECT_OPERATION
    : input.transport === 'manual' && readEffectWritesEnabled(input.campaignId));
  // New durable workflows receive the remote-meaning policy. The original
  // action-only entry retains its historical policy; a replacement stays in
  // the original ticket's policy family rather than silently changing it.
  const remoteWorkflow = Boolean(input.workflowRef)
    || [FREEFORM_REMOTE_POLICY_VERSION, FREEFORM_REMOTE_ANSWER_POLICY_VERSION].includes(originalContract?.policyVersion ?? '');
  const historicalReadEffects = [FREEFORM_READ_EFFECT_POLICY_VERSION, FREEFORM_READ_EFFECT_ANSWER_POLICY_VERSION].includes(originalContract?.policyVersion ?? '');
  const withSituation = originalContract ? isSituationPolicy(originalContract.policyVersion) : input.includeSituation === true;
  if (withSituation && !typedReferences) freeformTicketError('FREEFORM_SITUATION_READER_UNAVAILABLE');
  const policyVersion = withSituation ? input.clarifications?.length ? FREEFORM_SITUATION.answerPolicy : FREEFORM_SITUATION.policy
    : typedReferences ? input.clarifications?.length ? FREEFORM_TYPED_REFERENCE_ANSWER_POLICY_VERSION : FREEFORM_TYPED_REFERENCE_POLICY_VERSION
    : readEffects ? historicalReadEffects
    ? input.clarifications?.length ? FREEFORM_READ_EFFECT_ANSWER_POLICY_VERSION : FREEFORM_READ_EFFECT_POLICY_VERSION
    : input.clarifications?.length ? FREEFORM_MOVER_ANSWER_POLICY_VERSION : FREEFORM_MOVER_POLICY_VERSION
    : remoteWorkflow ? input.clarifications?.length ? FREEFORM_REMOTE_ANSWER_POLICY_VERSION : FREEFORM_REMOTE_POLICY_VERSION
      : input.clarifications?.length ? FREEFORM_ANSWER_POLICY_VERSION : FREEFORM_INTAKE_POLICY_VERSION;
  const issuanceDigest = freeformDigest({ ...input, previousTicket: input.previousTicket ?? null,
    fingerprint: instruction.instructionFingerprint, policy: policyVersion, registry: OPERATION_REGISTRY_VERSION });
  const scope = { userId: input.userId, campaignId: input.campaignId };
  const existing = await records.findOne({ ...scope, issuanceKey: input.issuanceKey });
  if (existing) {
    if (existing.issuanceDigest !== issuanceDigest) freeformTicketError('FREEFORM_TICKET_ISSUANCE_CONFLICT');
    return issuedTicket(existing, true);
  }
  let previous: FreeformTicketRecord | null = null;
  let expired: FreeformTicketRecord | null = null;
  if (input.renewedTicket) {
    expired = await records.findOne({ ...scope, _id: input.renewedTicket });
    if (!expired || expired.status !== 'retired' || expired.expiresAt > now || expired.failureSignature || expired.supportStop
      || freeformDigest(expired.workflowRef) !== freeformDigest(input.workflowRef)
      || expired.instructionFingerprint !== instruction.instructionFingerprint || expired.selectedActorRef !== input.selectedActorRef
      || expired.transport !== input.transport || input.previousTicket) freeformTicketError('FREEFORM_RENEWAL_NOT_ALLOWED');
  }
  if (input.previousTicket) {
    previous = await records.findOne({ ...scope, _id: input.previousTicket });
    if (!previous || previous.attempt !== 1 || previous.status !== 'retired' || !previous.failureSignature || previous.supportStop
      || previous.expiresAt <= now || previous.interactionId !== input.interactionId || previous.mode !== input.mode
      || previous.selectedActorRef !== input.selectedActorRef || previous.transport !== input.transport
      || previous.instructionFingerprint !== instruction.instructionFingerprint) freeformTicketError('FREEFORM_REPLACEMENT_NOT_ALLOWED');
  }
  const ticket = randomUUID();
  const operation = getOperationDefinition(typedReferences ? FREEFORM_TYPED_REFERENCE_OPERATION : readEffects ? FREEFORM_READ_EFFECT_OPERATION : FREEFORM_INTAKE_OPERATION);
  const situationReader = options.readSituationSources ?? readFreeformSituationSources;
  const situationSources = withSituation ? await situationReader(scope) : null;
  const sceneCatalog = input.includeSceneCatalog === true ? buildFreeformSceneCatalog(
    situationSources?.context ?? await (options.readSceneContext ?? readCurrentSceneContexts)(input), input.selectedActorRef, staged.originCheckpoint?.storyWorkspaceRef,
  ) : null;
  if (situationSources && sceneCatalog) {
    const labels = situationPublicLabels(situationSources);
    for (const row of sceneCatalog.catalog) {
      const binding = sceneCatalog.catalogBindings.find(b => b.key === row.key);
      if (binding?.kind === 'actor') row.label = labels.get(binding.ref) ?? 'Unnamed participant';
    }
  }
  const situation = situationSources && sceneCatalog ? buildFreeformSituation(situationSources, sceneCatalog.catalog, sceneCatalog.catalogBindings, Number(staged.originCheckpoint?.timelineSequence)) : null;
  if (situation) assertSituationCurrent(situation.binding, situation.situation, await situationReader(scope));
  const request: LlmRequestEnvelope = {
    schemaVersion: LLM_REQUEST_SCHEMA_VERSION,
    taskId: `freeform:${ticket}`, correlationId: `freeform:${ticket}`, idempotencyKey: `freeform:${ticket}`,
    operation: operation.id, stage: 'interpret', operationClass: operation.operationClass, authority: { ...operation.authority },
    references: { campaignId: input.campaignId },
    context: { input: { label: 'user_text', value: {
      ticket, instruction: instruction.exactText, mode: input.mode, selectedActorRef: input.selectedActorRef,
      catalog: sceneCatalog?.catalog ?? (input.selectedActorRef ? [{ key: 'selected_actor', kind: 'actor' }] : []),
      ...(situation ? { situation: situation.situation } : {}),
      ...(input.clarifications?.length ? { clarifications: structuredClone(input.clarifications) } : {}),
    } } },
    constraints: { registryVersion: OPERATION_REGISTRY_VERSION, policyVersion,
      maxProviderAttempts: 1, allowProviderFallback: false },
    outputSchema: { id: operation.outputSchema.id, version: operation.outputSchema.version },
  };
  // Reject over-budget indivisible input before issuing an unusable packet.
  try { resolveOperationContext(request, operation); }
  catch (error: any) {
    if (withSituation && error?.code === 'LLM_CONTEXT_HARD_LIMIT_EXCEEDED') situationError('FREEFORM_SITUATION_OVER_BUDGET', 413);
    throw error;
  }
  const record: FreeformTicketRecord = {
    _id: ticket, ...scope, interactionId: input.interactionId, issuanceKey: input.issuanceKey, issuanceDigest,
    instructionFingerprint: String(instruction.instructionFingerprint), policyVersion,
    registryVersion: OPERATION_REGISTRY_VERSION, mode: input.mode, transport: input.transport,
    selectedActorRef: input.selectedActorRef, attempt: expired?.attempt ?? (previous ? 2 : 1), previousTicket: expired?.previousTicket ?? previous?._id ?? null,
    ...(input.workflowRef ? { workflowRef: structuredClone(input.workflowRef) } : {}),
    ...(input.renewedTicket ? { renewedTicket: input.renewedTicket } : {}),
    ...(sceneCatalog ? { catalogBindings: sceneCatalog.catalogBindings, catalogContextRef: sceneCatalog.catalogContextRef } : {}),
    ...(situation ? { situationBinding: situation.binding, situationBindingDigest: freeformDigest(situation.binding) } : {}),
    status: 'active', request, requestDigest: freeformDigest(request), createdAt: now,
    expiresAt: new Date(now.getTime() + FREEFORM_TICKET_LIFETIME_MS),
  };
  try { await records.insertOne(record); }
  catch (error: unknown) {
    if (Number((error as { code?: number })?.code) !== 11000) throw error;
    const replay = await records.findOne({ ...scope, issuanceKey: input.issuanceKey });
    if (!replay || replay.issuanceDigest !== issuanceDigest) freeformTicketError('FREEFORM_TICKET_ISSUANCE_CONFLICT');
    return issuedTicket(replay, true);
  }
  return issuedTicket(record, false);
}

function issuedTicket(record: FreeformTicketRecord, duplicate: boolean) {
  if (isSituationPolicy(record.policyVersion)) {
    const input = record.request.context.input?.value as any;
    if (!record.situationBinding || record.situationBindingDigest !== freeformDigest(record.situationBinding) || record.requestDigest !== freeformDigest(record.request)
      || record.situationBinding.snapshotDigest !== freeformDigest(input?.situation)
      || freeformSituationIssues(input?.situation, input?.catalog ?? [], Object.keys(record.situationBinding.sourceBindings ?? {})).length) situationError();
  }
  return { ticket: record._id, request: structuredClone(record.request), expiresAt: record.expiresAt, duplicate,
    instructionBinding: { schemaVersion: 'gmc.freeform-ticket-binding/1', interactionId: record.interactionId,
      instructionFingerprint: record.instructionFingerprint, attempt: record.attempt, transport: record.transport },
    ...(record.catalogContextRef ? { schemaVersion: 'gmc.freeform-scene-catalog/1', catalogBindings: structuredClone(record.catalogBindings), catalogContextRef: structuredClone(record.catalogContextRef) } : {}),
    ...(record.situationBinding ? { situationBinding: structuredClone(record.situationBinding) } : {}) };
}

/** Service-scoped read of the immutable compiler map; never accept a caller map. */
export async function readFreeformTicketContext(input: { userId: string; campaignId: string; ticket: string }, records = freeformTicketCollection()): Promise<ReturnType<typeof issuedTicket>> {
  if ([input.userId, input.campaignId, input.ticket].some((value) => typeof value !== 'string' || !value.trim() || value.length > 240)) freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  const record = await records.findOne({ _id: input.ticket, userId: input.userId, campaignId: input.campaignId });
  if (!record) freeformTicketError('FREEFORM_TICKET_NOT_FOUND', 404);
  if (record.expiresAt <= new Date()) freeformTicketError('FREEFORM_TICKET_EXPIRED');
  // The immutable request is also needed to reconcile an uncertain acceptance.
  // Reading it does not take over a running attempt or authorize regeneration.
  if (!['active', 'running', 'accepted'].includes(record.status)) freeformTicketError('FREEFORM_TICKET_RETIRED');
  return issuedTicket(record, true);
}

export async function loadBoundFreeformTicket(input: {
  userId: string; request: LlmRequestEnvelope; manualOutput?: unknown; now?: Date;
}, records = freeformTicketCollection()) {
  const ticket = (input.request.context.input?.value as any)?.ticket;
  if (typeof ticket !== 'string' || ticket.length > 80) freeformTicketError('FREEFORM_TICKET_REQUIRED');
  const record = await records.findOne({ _id: ticket, userId: input.userId, campaignId: input.request.references.campaignId });
  if (!record || record.requestDigest !== freeformDigest(input.request)
    || !FREEFORM_READABLE_POLICY_VERSIONS.includes(record.policyVersion) || !FREEFORM_PLAN_BINDING_REGISTRY_VERSIONS.includes(record.registryVersion)
    || record.transport !== (input.manualOutput === undefined ? 'integrated' : 'manual')) freeformTicketError('FREEFORM_TICKET_BINDING_INVALID');
  if (record.expiresAt <= (input.now ?? new Date())) freeformTicketError('FREEFORM_TICKET_EXPIRED');
  if (record.status === 'retired') freeformTicketError(record.supportStop ? 'FREEFORM_INTAKE_SUPPORT_REQUIRED' : 'FREEFORM_TICKET_RETIRED');
  if (record.status === 'accepted' && input.manualOutput !== undefined && record.outputDigest !== freeformDigest(input.manualOutput)) {
    freeformTicketError('FREEFORM_ACCEPTED_REPLY_CHANGED');
  }
  return record;
}

export async function retireFreeformTicket(input: { userId: string; campaignId: string; ticket: string },
  records = freeformTicketCollection()) {
  if (typeof input.ticket !== 'string' || !input.ticket.length || input.ticket.length > 80
    || typeof input.campaignId !== 'string' || !input.campaignId.trim() || input.campaignId.length > 240) {
    freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  }
  const record = await records.findOne({ _id: input.ticket, userId: input.userId, campaignId: input.campaignId });
  if (!record) freeformTicketError('FREEFORM_TICKET_NOT_FOUND', 404);
  if (record.status === 'retired') return { retired: true, duplicate: true };
  if (record.status === 'running') freeformTicketError('FREEFORM_ACCEPTANCE_PENDING');
  if (record.status === 'accepted') freeformTicketError('FREEFORM_ACCEPTED_TICKET_IMMUTABLE');
  const updated = await records.findOneAndUpdate({ _id: record._id, userId: input.userId, status: record.status }, {
    $set: { status: 'retired' },
  }, { returnDocument: 'after' });
  if (!updated) freeformTicketError('FREEFORM_TICKET_SETTLEMENT_CONFLICT');
  return { retired: true, duplicate: false };
}

export async function finishFreeformTicket(record: FreeformTicketRecord, response: LlmResponseEnvelope,
  records = freeformTicketCollection()): Promise<LlmResponseEnvelope> {
  const accepted = response.status === 'succeeded';
  const failureSignature = accepted ? undefined : freeformDigest({
    root: response.error?.code, workflow: FREEFORM_INTAKE_OPERATION, stage: 'interpret',
    issues: response.validation.flatMap((row) => row.issues.map((issue) => [issue.code, issue.path])).sort(),
  });
  const previous = record.previousTicket ? await records.findOne({ _id: record.previousTicket, userId: record.userId, campaignId: record.campaignId }) : null;
  const supportStop = !accepted && previous?.failureSignature === failureSignature;
  const settled = supportStop ? { ...response, output: null,
    error: { ...response.error!, code: 'FREEFORM_INTAKE_SUPPORT_REQUIRED', retryable: false } } : response;
  const updated = await records.findOneAndUpdate({ _id: record._id, userId: record.userId, status: 'running' }, {
    $set: { status: accepted ? 'accepted' : 'retired', response: structuredClone(settled),
      ...(accepted ? { outputDigest: freeformDigest(response.output) } : { failureSignature, supportStop }) },
  }, { returnDocument: 'after' });
  if (!updated) freeformTicketError('FREEFORM_TICKET_SETTLEMENT_CONFLICT');
  return settled;
}
