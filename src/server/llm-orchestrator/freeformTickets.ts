import { createHash, randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { LLM_REQUEST_SCHEMA_VERSION, type LlmRequestEnvelope, type LlmResponseEnvelope } from '../../shared/llm/orchestratorContracts.js';
import { FREEFORM_INTAKE_OPERATION, FREEFORM_INTAKE_POLICY_VERSION } from '../../shared/llm/freeformIntakePolicy.js';
import { getDb } from '../config/mongo.js';
import { readStagedCompoundActionInstruction } from '../services/compoundActionArtifactStore.js';
import { OrchestratorError } from './errors.js';
import { getOperationDefinition, OPERATION_REGISTRY_VERSION } from './operationRegistry.js';
import { resolveOperationContext } from './contextResolver.js';

export const FREEFORM_TICKET_LIFETIME_MS = 86_400_000;
export function freeformDigest(value: unknown): string {
  const stable = (entry: unknown): string => {
    if (Array.isArray(entry)) return `[${entry.map(stable).join(',')}]`;
    if (entry && typeof entry === 'object') return `{${Object.entries(entry).filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
    return JSON.stringify(entry);
  };
  return createHash('sha256').update(stable(value)).digest('hex');
}

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
  attempt: 1 | 2;
  previousTicket: string | null;
  status: 'active' | 'running' | 'accepted' | 'retired';
  request: LlmRequestEnvelope;
  requestDigest: string;
  outputDigest?: string;
  response?: LlmResponseEnvelope;
  failureSignature?: string;
  supportStop?: boolean;
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
}

export function validateFreeformTicketInput(input: IssueFreeformTicketInput) {
  for (const key of ['userId', 'campaignId', 'interactionId', 'issuanceKey'] as const) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 240) freeformTicketError('FREEFORM_TICKET_INPUT_INVALID', 422);
  }
  if (input.mode !== 'action' || !['manual', 'integrated'].includes(input.transport)
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
  now?: Date;
} = {}) {
  validateFreeformTicketInput(input);
  const records = options.records ?? freeformTicketCollection();
  const now = options.now ?? new Date();
  const staged = await (options.readInstruction ?? readStagedCompoundActionInstruction)(input);
  if (!staged) freeformTicketError('FREEFORM_INSTRUCTION_NOT_STAGED', 404);
  const instruction = staged.instruction;
  const issuanceDigest = freeformDigest({ ...input, previousTicket: input.previousTicket ?? null,
    fingerprint: instruction.instructionFingerprint, policy: FREEFORM_INTAKE_POLICY_VERSION, registry: OPERATION_REGISTRY_VERSION });
  const scope = { userId: input.userId, campaignId: input.campaignId };
  const existing = await records.findOne({ ...scope, issuanceKey: input.issuanceKey });
  if (existing) {
    if (existing.issuanceDigest !== issuanceDigest) freeformTicketError('FREEFORM_TICKET_ISSUANCE_CONFLICT');
    return { ticket: existing._id, request: structuredClone(existing.request), expiresAt: existing.expiresAt, duplicate: true };
  }
  let previous: FreeformTicketRecord | null = null;
  if (input.previousTicket) {
    previous = await records.findOne({ ...scope, _id: input.previousTicket });
    if (!previous || previous.attempt !== 1 || previous.status !== 'retired' || !previous.failureSignature || previous.supportStop
      || previous.expiresAt <= now || previous.interactionId !== input.interactionId || previous.mode !== input.mode
      || previous.selectedActorRef !== input.selectedActorRef || previous.transport !== input.transport
      || previous.instructionFingerprint !== instruction.instructionFingerprint) freeformTicketError('FREEFORM_REPLACEMENT_NOT_ALLOWED');
  }
  const ticket = randomUUID();
  const operation = getOperationDefinition(FREEFORM_INTAKE_OPERATION);
  const request: LlmRequestEnvelope = {
    schemaVersion: LLM_REQUEST_SCHEMA_VERSION,
    taskId: `freeform:${ticket}`, correlationId: `freeform:${ticket}`, idempotencyKey: `freeform:${ticket}`,
    operation: operation.id, stage: 'interpret', operationClass: operation.operationClass, authority: { ...operation.authority },
    references: { campaignId: input.campaignId },
    context: { input: { label: 'user_text', value: {
      ticket, instruction: instruction.exactText, mode: input.mode, selectedActorRef: input.selectedActorRef,
      catalog: input.selectedActorRef ? [{ key: 'selected_actor', kind: 'actor' }] : [],
    } } },
    constraints: { registryVersion: OPERATION_REGISTRY_VERSION, policyVersion: FREEFORM_INTAKE_POLICY_VERSION,
      maxProviderAttempts: 1, allowProviderFallback: false },
    outputSchema: { id: operation.outputSchema.id, version: operation.outputSchema.version },
  };
  // Reject over-budget indivisible input before issuing an unusable packet.
  resolveOperationContext(request, operation);
  const record: FreeformTicketRecord = {
    _id: ticket, ...scope, interactionId: input.interactionId, issuanceKey: input.issuanceKey, issuanceDigest,
    instructionFingerprint: String(instruction.instructionFingerprint), policyVersion: FREEFORM_INTAKE_POLICY_VERSION,
    registryVersion: OPERATION_REGISTRY_VERSION, mode: input.mode, transport: input.transport,
    selectedActorRef: input.selectedActorRef, attempt: previous ? 2 : 1, previousTicket: previous?._id ?? null,
    status: 'active', request, requestDigest: freeformDigest(request), createdAt: now,
    expiresAt: new Date(now.getTime() + FREEFORM_TICKET_LIFETIME_MS),
  };
  try { await records.insertOne(record); }
  catch (error: unknown) {
    if (Number((error as { code?: number })?.code) !== 11000) throw error;
    const replay = await records.findOne({ ...scope, issuanceKey: input.issuanceKey });
    if (!replay || replay.issuanceDigest !== issuanceDigest) freeformTicketError('FREEFORM_TICKET_ISSUANCE_CONFLICT');
    return { ticket: replay._id, request: structuredClone(replay.request), expiresAt: replay.expiresAt, duplicate: true };
  }
  return { ticket, request: structuredClone(request), expiresAt: record.expiresAt, duplicate: false };
}

export async function loadBoundFreeformTicket(input: {
  userId: string; request: LlmRequestEnvelope; manualOutput?: unknown; now?: Date;
}, records = freeformTicketCollection()) {
  const ticket = (input.request.context.input?.value as any)?.ticket;
  if (typeof ticket !== 'string' || ticket.length > 80) freeformTicketError('FREEFORM_TICKET_REQUIRED');
  const record = await records.findOne({ _id: ticket, userId: input.userId, campaignId: input.request.references.campaignId });
  if (!record || record.requestDigest !== freeformDigest(input.request)
    || record.policyVersion !== FREEFORM_INTAKE_POLICY_VERSION || record.registryVersion !== OPERATION_REGISTRY_VERSION
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
