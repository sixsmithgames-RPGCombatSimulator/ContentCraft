import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { collections } from './gmcIntegrationStore.js';
import { StoryWorkspaceStoreError, type JsonObject, type JsonValue } from './storyWorkspaceStore.js';

export const COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION = 'gmc.compound-action-artifact-store/1';
export const COMPOUND_ACTION_ARTIFACT_REFERENCE_CONTRACT_VERSION = 'gmc.compound-action-artifact-ref/1';
export const COMPOUND_ACTION_REQUIREMENT_PROJECTION_CONTRACT_VERSION = 'gmc.compound-action-requirement-projection/1';
export const COMPOUND_ACTION_CAPABILITIES = Object.freeze([
  'compound-action-program/2',
  'compound-action-artifact-store/1',
  'compound-action-feasibility/1',
  'compound-action-typed-repair/4',
] as const);
export const COMPOUND_ACTION_CONTRACTS = Object.freeze({
  playerInstructionArtifact: 'gma.player-instruction-artifact/1',
  semanticActionProgram: 'gma.semantic-action-program/2',
  actionFeasibility: 'gma.action-feasibility/1',
  actionExecutionSlice: 'gma.action-execution-slice/1',
  actionExecutionReceipt: 'gma.action-execution-receipt/1',
  actionProgramCursor: 'gma.action-program-cursor/1',
  actionDirectedStoryRepair: 'gma.action-directed-story-repair/4',
});
export const COMPOUND_ACTION_LIMITS = Object.freeze({
  instructionMaximumBytes: 32_768,
  nodeMaximum: 8,
  dependencyMaximum: 12,
  dataRequirementMaximum: 16,
  programMaximumBytes: 16_384,
  cursorMaximumBytes: 16_384,
  receiptMaximumBytes: 4_096,
  receiptMaximum: 16,
  clarificationMaximum: 8,
});

type ArtifactStatus = 'available' | 'superseded' | 'inactive' | 'tombstoned';
type RequirementDimension = 'who' | 'what' | 'where' | 'when' | 'how';
type RequirementKind = 'actor_identity' | 'scene_presence' | 'canonical_reference' | 'current_location'
  | 'destination_location' | 'story_fact' | 'time_clock' | 'character_capability' | 'resource'
  | 'mechanic' | 'recent_continuity' | 'active_offer';
type RequirementStatus = 'resolved' | 'unresolved' | 'absent' | 'preparation_debt' | 'stale' | 'contradictory';

export interface CompoundActionArtifactRevisionDocument {
  userId: string;
  campaignId: string;
  programId: string;
  interactionId: string;
  revision: number;
  payloadHash: string;
  requestHash: string;
  status: ArtifactStatus;
  idempotencyKey: string;
  instruction: JsonObject;
  program: JsonObject;
  cursor: JsonObject;
  receipts: JsonObject[];
  clarifications: JsonObject[];
  rootFailure: JsonObject | null;
  timelineAnchor: { messageId: string; sequence: number } | null;
  createdAt: Date;
  supersededAt?: Date;
  supersededByRewindId?: string;
  redactedAudit: {
    instructionBytes: number;
    programBytes: number;
    cursorBytes: number;
    receiptCount: number;
    clarificationCount: number;
    nodeCount: number;
  };
}

export type CompoundActionArtifactCollection = Collection<CompoundActionArtifactRevisionDocument>;

export interface CompoundActionRequirement {
  requirementId?: string;
  dimension: RequirementDimension;
  kind: RequirementKind;
  query: string;
}

export interface CompoundActionRequirementResult {
  requirementId: string;
  dimension: RequirementDimension;
  kind: RequirementKind;
  status: RequirementStatus;
  sourceRefs: string[];
  revision: number | string | null;
  authority: 'gmc' | 'vcs';
  reasonCode: string;
}

function artifactCollection(): CompoundActionArtifactCollection {
  return getDb().collection<CompoundActionArtifactRevisionDocument>('gmc_compound_action_artifact_revisions');
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredString(value: unknown, field: string, maximum = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_ARTIFACT_INVALID', `${field} is invalid.`, { field });
  }
  return value;
}

function requiredRevision(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_ARTIFACT_INVALID', `${field} is invalid.`, { field });
  }
  return Number(value);
}

function validateInstruction(instruction: unknown): asserts instruction is JsonObject {
  if (!isObject(instruction) || instruction.schemaVersion !== COMPOUND_ACTION_CONTRACTS.playerInstructionArtifact) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_INSTRUCTION_INVALID', 'The player instruction artifact is invalid.', {});
  }
  const exactText = requiredString(instruction.exactText, 'instruction.exactText', COMPOUND_ACTION_LIMITS.instructionMaximumBytes);
  requiredString(instruction.instructionRef, 'instruction.instructionRef');
  requiredString(instruction.interactionId, 'instruction.interactionId');
  const actualBytes = Buffer.byteLength(exactText, 'utf8');
  if (actualBytes > COMPOUND_ACTION_LIMITS.instructionMaximumBytes
    || instruction.utf8Bytes !== actualBytes
    || instruction.instructionFingerprint !== sha256(exactText)) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_INSTRUCTION_INVALID', 'The player instruction bytes do not match their fingerprint.', {});
  }
}

function validateProgram(program: unknown, instruction: JsonObject): asserts program is JsonObject {
  if (!isObject(program) || program.schemaVersion !== COMPOUND_ACTION_CONTRACTS.semanticActionProgram) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'The semantic action program is invalid.', {});
  }
  requiredString(program.programId, 'program.programId');
  if (program.interactionId !== instruction.interactionId
    || program.instructionRef !== instruction.instructionRef
    || program.instructionFingerprint !== instruction.instructionFingerprint
    || program.instructionBytes !== instruction.utf8Bytes) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_BINDING_INVALID', 'The semantic action program is not bound to this exact instruction.', {});
  }
  const nodes = Array.isArray(program.nodes) ? program.nodes : [];
  if (nodes.length < 1 || nodes.length > COMPOUND_ACTION_LIMITS.nodeMaximum) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'The semantic action program node count is outside its bound.', {});
  }
  const seen = new Set<string>();
  let dependencies = 0;
  let requirements = 0;
  for (const [index, nodeValue] of nodes.entries()) {
    if (!isObject(nodeValue)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An action node is invalid.', { index });
    const nodeId = requiredString(nodeValue.nodeId, `nodes.${index}.nodeId`);
    if (seen.has(nodeId)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'Action node identifiers must be unique.', { nodeId });
    const dependsOn = Array.isArray(nodeValue.dependsOn) ? nodeValue.dependsOn : [];
    for (const dependency of dependsOn) {
      if (typeof dependency !== 'string' || !seen.has(dependency)) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'Action dependencies must reference earlier nodes.', { nodeId });
      }
    }
    dependencies += dependsOn.length;
    requirements += Array.isArray(nodeValue.dataRequirements) ? nodeValue.dataRequirements.length : 0;
    seen.add(nodeId);
  }
  if (dependencies > COMPOUND_ACTION_LIMITS.dependencyMaximum || requirements > COMPOUND_ACTION_LIMITS.dataRequirementMaximum
    || byteLength(program) > COMPOUND_ACTION_LIMITS.programMaximumBytes) {
    throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_PROGRAM_TOO_LARGE', 'The semantic action program exceeds its bounded storage contract.', {});
  }
}

function validateCursor(cursor: unknown, program: JsonObject, expectedRevision?: number): asserts cursor is JsonObject {
  if (!isObject(cursor) || cursor.schemaVersion !== COMPOUND_ACTION_CONTRACTS.actionProgramCursor
    || cursor.programId !== program.programId) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_CURSOR_INVALID', 'The action cursor is invalid for this program.', {});
  }
  const revision = requiredRevision(cursor.revision, 'cursor.revision');
  if (expectedRevision !== undefined && revision !== expectedRevision) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_CURSOR_REVISION_CONFLICT', 'The action cursor revision is not the expected next revision.', {
      expectedRevision,
      actualRevision: revision,
    });
  }
  const nodeIds = new Set((program.nodes as JsonObject[]).map((node) => String(node.nodeId)));
  const ownership = new Set<string>();
  for (const field of ['completedNodeRefs', 'readyNodeRefs', 'remainingNodeRefs', 'skippedNodeRefs']) {
    const refs = cursor[field];
    if (!Array.isArray(refs)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_CURSOR_INVALID', 'The action cursor node sets are incomplete.', { field });
    for (const ref of refs) {
      if (typeof ref !== 'string' || !nodeIds.has(ref) || ownership.has(ref)) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_CURSOR_INVALID', 'The action cursor node sets must be disjoint and reference program nodes.', { field });
      }
      ownership.add(ref);
    }
  }
  if (byteLength(cursor) > COMPOUND_ACTION_LIMITS.cursorMaximumBytes) {
    throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_CURSOR_TOO_LARGE', 'The action cursor exceeds its bounded storage contract.', {});
  }
}

function validateReceipts(receipts: unknown[], program: JsonObject): JsonObject[] {
  if (receipts.length > COMPOUND_ACTION_LIMITS.receiptMaximum) {
    throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_RECEIPTS_TOO_LARGE', 'The action program has too many receipts.', {});
  }
  const nodeIds = new Set((program.nodes as JsonObject[]).map((node) => String(node.nodeId)));
  const receiptIds = new Set<string>();
  return receipts.map((receiptValue) => {
    if (!isObject(receiptValue) || receiptValue.schemaVersion !== COMPOUND_ACTION_CONTRACTS.actionExecutionReceipt
      || receiptValue.programId !== program.programId || !nodeIds.has(String(receiptValue.nodeId))) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_RECEIPT_INVALID', 'An action execution receipt is invalid for this program.', {});
    }
    const receiptId = requiredString(receiptValue.receiptId, 'receipt.receiptId');
    if (receiptIds.has(receiptId) || byteLength(receiptValue) > COMPOUND_ACTION_LIMITS.receiptMaximumBytes) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_RECEIPT_INVALID', 'Action execution receipts must be unique and bounded.', { receiptId });
    }
    receiptIds.add(receiptId);
    return structuredClone(receiptValue);
  });
}

function validateTimelineAnchor(value: unknown): { messageId: string; sequence: number } | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_TIMELINE_INVALID', 'The timeline anchor is invalid.', {});
  return {
    messageId: requiredString(value.messageId, 'timelineAnchor.messageId'),
    sequence: requiredRevision(value.sequence, 'timelineAnchor.sequence'),
  };
}

function reference(document: CompoundActionArtifactRevisionDocument) {
  return {
    contractVersion: COMPOUND_ACTION_ARTIFACT_REFERENCE_CONTRACT_VERSION,
    campaignId: document.campaignId,
    programId: document.programId,
    interactionId: document.interactionId,
    revision: document.revision,
    payloadHash: document.payloadHash,
    status: document.status,
  };
}

function payload(document: Pick<CompoundActionArtifactRevisionDocument,
  'instruction' | 'program' | 'cursor' | 'receipts' | 'clarifications' | 'rootFailure' | 'timelineAnchor'>): JsonObject {
  return {
    instruction: document.instruction,
    program: document.program,
    cursor: document.cursor,
    receipts: document.receipts,
    clarifications: document.clarifications,
    rootFailure: document.rootFailure,
    timelineAnchor: document.timelineAnchor,
  };
}

function audit(document: Pick<CompoundActionArtifactRevisionDocument, 'instruction' | 'program' | 'cursor' | 'receipts' | 'clarifications'>) {
  return {
    instructionBytes: Number(document.instruction.utf8Bytes),
    programBytes: byteLength(document.program),
    cursorBytes: byteLength(document.cursor),
    receiptCount: document.receipts.length,
    clarificationCount: document.clarifications.length,
    nodeCount: (document.program.nodes as JsonObject[]).length,
  };
}

async function duplicateForKey(records: CompoundActionArtifactCollection, userId: string, campaignId: string, idempotencyKey: string, requestHash: string) {
  const existing = await records.findOne({ userId, campaignId, idempotencyKey });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different interaction artifact write.', {});
  }
  return { artifactRef: reference(existing), duplicate: true };
}

export async function createCompoundActionArtifact(input: {
  userId: string;
  campaignId: string;
  idempotencyKey: string;
  instruction: JsonObject;
  program: JsonObject;
  cursor: JsonObject;
  timelineAnchor?: { messageId: string; sequence: number } | null;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  requiredString(input.userId, 'userId');
  requiredString(input.campaignId, 'campaignId');
  requiredString(input.idempotencyKey, 'idempotencyKey');
  validateInstruction(input.instruction);
  validateProgram(input.program, input.instruction);
  validateCursor(input.cursor, input.program, 1);
  const timelineAnchor = validateTimelineAnchor(input.timelineAnchor);
  const draft = {
    instruction: structuredClone(input.instruction),
    program: structuredClone(input.program),
    cursor: structuredClone(input.cursor),
    receipts: [] as JsonObject[], clarifications: [] as JsonObject[], rootFailure: null, timelineAnchor,
  };
  const requestHash = sha256(canonicalJson(draft));
  const duplicate = await duplicateForKey(records, input.userId, input.campaignId, input.idempotencyKey, requestHash);
  if (duplicate) return duplicate;
  const document: CompoundActionArtifactRevisionDocument = {
    userId: input.userId, campaignId: input.campaignId,
    programId: String(input.program.programId), interactionId: String(input.instruction.interactionId),
    revision: 1, payloadHash: sha256(canonicalJson(draft)), requestHash, status: 'available',
    idempotencyKey: input.idempotencyKey, ...draft, createdAt: new Date(), redactedAudit: audit(draft),
  };
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      const replay = await duplicateForKey(records, input.userId, input.campaignId, input.idempotencyKey, requestHash);
      if (replay) return replay;
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_REVISION_CONFLICT', 'The interaction artifact changed before it could be created.', {});
    }
    throw error;
  }
  return { artifactRef: reference(document), duplicate: false };
}

export async function readActiveCompoundActionArtifact(input: { userId: string; campaignId: string; programId: string }, records: CompoundActionArtifactCollection = artifactCollection()) {
  const document = await records.findOne({ userId: input.userId, campaignId: input.campaignId, programId: input.programId, status: 'available' }, { sort: { revision: -1 } });
  return document ? { artifactRef: reference(document), artifact: payload(document) } : null;
}

export async function advanceCompoundActionArtifact(input: {
  userId: string;
  campaignId: string;
  programId: string;
  expectedRevision: number;
  idempotencyKey: string;
  program?: JsonObject;
  cursor: JsonObject;
  appendReceipts?: JsonObject[];
  clarifications?: JsonObject[];
  rootFailure?: JsonObject | null;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  const priorReplay = await records.findOne({ userId: input.userId, campaignId: input.campaignId, idempotencyKey: input.idempotencyKey });
  if (priorReplay) {
    const receiptsMatch = (input.appendReceipts ?? []).every((candidate) => priorReplay.receipts.some((stored) => canonicalJson(stored) === canonicalJson(candidate)));
    const matches = priorReplay.programId === input.programId
      && input.expectedRevision === priorReplay.revision - 1
      && canonicalJson(priorReplay.cursor) === canonicalJson(input.cursor)
      && (input.program === undefined || canonicalJson(priorReplay.program) === canonicalJson(input.program))
      && (input.clarifications === undefined || canonicalJson(priorReplay.clarifications) === canonicalJson(input.clarifications))
      && (input.rootFailure === undefined || canonicalJson(priorReplay.rootFailure) === canonicalJson(input.rootFailure))
      && receiptsMatch;
    if (!matches) throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different interaction artifact write.', {});
    return { artifactRef: reference(priorReplay), duplicate: true };
  }
  const active = await records.findOne({ userId: input.userId, campaignId: input.campaignId, programId: input.programId, status: 'available' }, { sort: { revision: -1 } });
  if (!active) throw new StoryWorkspaceStoreError(404, 'COMPOUND_ACTION_ARTIFACT_NOT_FOUND', 'The interaction artifact was not found.', {});
  if (active.revision !== input.expectedRevision) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_REVISION_CONFLICT', 'The interaction artifact changed before this update.', { expectedRevision: input.expectedRevision, actualRevision: active.revision });
  }
  const program = input.program ?? active.program;
  validateProgram(program, active.instruction);
  validateCursor(input.cursor, program, active.revision + 1);
  const receiptsById = new Map(active.receipts.map((receipt) => [String(receipt.receiptId), receipt]));
  for (const receipt of input.appendReceipts ?? []) {
    const key = String(receipt.receiptId ?? '');
    const existing = receiptsById.get(key);
    if (existing && canonicalJson(existing) !== canonicalJson(receipt)) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_RECEIPT_CONFLICT', 'An existing action receipt cannot be changed.', { receiptId: key });
    }
    receiptsById.set(key, structuredClone(receipt));
  }
  const receipts = validateReceipts([...receiptsById.values()], program);
  const clarifications = input.clarifications ?? active.clarifications;
  if (!Array.isArray(clarifications) || clarifications.length > COMPOUND_ACTION_LIMITS.clarificationMaximum || clarifications.some((value) => !isObject(value))) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_CLARIFICATION_INVALID', 'The interaction clarification state is invalid.', {});
  }
  const draft = {
    instruction: active.instruction, program: structuredClone(program), cursor: structuredClone(input.cursor), receipts,
    clarifications: structuredClone(clarifications), rootFailure: input.rootFailure === undefined ? active.rootFailure : input.rootFailure,
    timelineAnchor: active.timelineAnchor,
  };
  const requestHash = sha256(canonicalJson({ expectedRevision: input.expectedRevision, ...draft }));
  const duplicate = await duplicateForKey(records, input.userId, input.campaignId, input.idempotencyKey, requestHash);
  if (duplicate) return duplicate;
  const document: CompoundActionArtifactRevisionDocument = {
    userId: active.userId, campaignId: active.campaignId, programId: active.programId, interactionId: active.interactionId,
    revision: active.revision + 1, payloadHash: sha256(canonicalJson(draft)), requestHash, status: 'available',
    idempotencyKey: input.idempotencyKey, ...draft, createdAt: new Date(), redactedAudit: audit(draft),
  };
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      const replay = await duplicateForKey(records, input.userId, input.campaignId, input.idempotencyKey, requestHash);
      if (replay) return replay;
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_REVISION_CONFLICT', 'The interaction artifact changed before this update.', {});
    }
    throw error;
  }
  await records.updateMany({ userId: active.userId, campaignId: active.campaignId, programId: active.programId, revision: active.revision, status: 'available' }, {
    $set: { status: 'superseded', supersededAt: new Date() },
  });
  return { artifactRef: reference(document), duplicate: false };
}

export async function tombstoneCompoundActionArtifact(input: {
  userId: string; campaignId: string; programId: string; expectedRevision: number; idempotencyKey: string;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  const priorReplay = await records.findOne({ userId: input.userId, campaignId: input.campaignId, idempotencyKey: input.idempotencyKey });
  if (priorReplay) {
    if (priorReplay.programId !== input.programId || priorReplay.status !== 'tombstoned'
      || input.expectedRevision !== priorReplay.revision - 1) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different interaction artifact write.', {});
    }
    return { artifactRef: reference(priorReplay), duplicate: true };
  }
  const active = await records.findOne({ userId: input.userId, campaignId: input.campaignId, programId: input.programId, status: 'available' }, { sort: { revision: -1 } });
  if (!active) throw new StoryWorkspaceStoreError(404, 'COMPOUND_ACTION_ARTIFACT_NOT_FOUND', 'The interaction artifact was not found.', {});
  if (active.revision !== input.expectedRevision) throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_REVISION_CONFLICT', 'The interaction artifact changed before it could be closed.', {});
  const requestHash = sha256(canonicalJson({ programId: input.programId, expectedRevision: input.expectedRevision, tombstone: true }));
  const duplicate = await duplicateForKey(records, input.userId, input.campaignId, input.idempotencyKey, requestHash);
  if (duplicate) return duplicate;
  const document: CompoundActionArtifactRevisionDocument = {
    ...structuredClone(active), revision: active.revision + 1, status: 'tombstoned', requestHash,
    payloadHash: sha256(canonicalJson({ ...payload(active), tombstoned: true })), idempotencyKey: input.idempotencyKey,
    createdAt: new Date(), redactedAudit: active.redactedAudit,
  };
  await records.insertOne(document);
  await records.updateMany({ userId: active.userId, campaignId: active.campaignId, programId: active.programId, revision: active.revision, status: 'available' }, {
    $set: { status: 'superseded', supersededAt: new Date() },
  });
  return { artifactRef: reference(document), duplicate: false };
}

export async function rewindCompoundActionArtifacts(input: {
  userId: string; campaignId: string; boundarySequence: number; rewindId: string;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  requiredRevision(input.boundarySequence, 'boundarySequence');
  requiredString(input.rewindId, 'rewindId');
  const filter = {
    userId: input.userId,
    campaignId: input.campaignId,
    'timelineAnchor.sequence': { $gt: input.boundarySequence },
    status: { $in: ['available', 'superseded'] },
  } as unknown as Filter<CompoundActionArtifactRevisionDocument>;
  const updated = await records.updateMany(filter, {
    $set: { status: 'inactive', supersededAt: new Date(), supersededByRewindId: input.rewindId },
  });
  const eligible = await records.find({
    userId: input.userId,
    campaignId: input.campaignId,
    'timelineAnchor.sequence': { $lte: input.boundarySequence },
    status: { $in: ['available', 'superseded'] },
  } as unknown as Filter<CompoundActionArtifactRevisionDocument>).sort({ revision: -1 }).toArray();
  const restoredPrograms = new Set<string>();
  for (const candidate of eligible) {
    if (restoredPrograms.has(candidate.programId)) continue;
    restoredPrograms.add(candidate.programId);
    if (candidate.status === 'available') continue;
    await records.updateMany({
      userId: candidate.userId,
      campaignId: candidate.campaignId,
      programId: candidate.programId,
      revision: candidate.revision,
      status: 'superseded',
    }, { $set: { status: 'available' } });
  }
  return {
    contractVersion: COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION,
    rewindId: input.rewindId,
    boundarySequence: input.boundarySequence,
    inactivatedRevisionCount: updated.modifiedCount,
    restoredProgramCount: restoredPrograms.size,
    authoritativeStateChanged: false,
  };
}

function normalizedQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceRef(prefix: string, value: unknown): string | null {
  const id = String(value ?? '').trim();
  return id ? `${prefix}:${id}` : null;
}

function result(requirement: CompoundActionRequirement, index: number, values: Partial<CompoundActionRequirementResult>): CompoundActionRequirementResult {
  return {
    requirementId: requirement.requirementId ?? `requirement:${index + 1}`,
    dimension: requirement.dimension,
    kind: requirement.kind,
    status: values.status ?? 'unresolved',
    sourceRefs: values.sourceRefs ?? [],
    revision: values.revision ?? null,
    authority: values.authority ?? 'gmc',
    reasonCode: values.reasonCode ?? 'AUTHORITY_EVIDENCE_NOT_FOUND',
  };
}

function publicLabelMatch(row: Record<string, unknown>, query: string): boolean {
  const labels = [row.canonical_name, row.name, row.title, row.publicLabel, row.displayLabel]
    .map((value) => normalizedQuery(String(value ?? ''))).filter(Boolean);
  return labels.some((label) => label === query || label.includes(query) || query.includes(label));
}

export function compileCompoundActionRequirementProjection(input: {
  programId: string;
  nodeId: string;
  requirements: CompoundActionRequirement[];
  storyContext?: Record<string, unknown> | null;
  campaignState?: Record<string, unknown> | null;
  currentScene?: Record<string, unknown> | null;
  entities?: Array<Record<string, unknown>>;
  facts?: Array<Record<string, unknown>>;
  activeOffers?: Array<Record<string, unknown>>;
}) {
  if (input.requirements.length > COMPOUND_ACTION_LIMITS.dataRequirementMaximum) {
    throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_REQUIREMENTS_TOO_LARGE', 'The action has too many typed requirements.', {});
  }
  const playable = (input.storyContext?.playableSceneContext ?? {}) as Record<string, unknown>;
  const privateContext = (input.storyContext?.privateSceneContext ?? {}) as Record<string, unknown>;
  const workspaceRef = (input.storyContext?.storyWorkspaceRef ?? {}) as Record<string, unknown>;
  const scene = input.currentScene ?? {};
  const state = input.campaignState ?? {};
  const entities = input.entities ?? [];
  const facts = input.facts ?? [];
  const activeOffers = input.activeOffers ?? [];
  const sceneKit = (playable.sceneKit ?? {}) as Record<string, unknown>;
  const participants = (sceneKit.participants ?? {}) as Record<string, unknown>;
  const participantRows = [...(Array.isArray(participants.present) ? participants.present : []), ...(Array.isArray(playable.presentActors) ? playable.presentActors : [])]
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object');
  const locationRef = String(sceneKit.locationRef ?? scene.locationId ?? '');

  const requirementResults = input.requirements.map((requirement, index) => {
    if (!['who', 'what', 'where', 'when', 'how'].includes(requirement.dimension)
      || !['actor_identity', 'scene_presence', 'canonical_reference', 'current_location', 'destination_location', 'story_fact', 'time_clock', 'character_capability', 'resource', 'mechanic', 'recent_continuity', 'active_offer'].includes(requirement.kind)
      || typeof requirement.query !== 'string' || !requirement.query.trim()) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_REQUIREMENT_INVALID', 'A typed action requirement is invalid.', { index });
    }
    const query = normalizedQuery(requirement.query);
    if (['character_capability', 'resource', 'mechanic'].includes(requirement.kind)) {
      return result(requirement, index, { authority: 'vcs', status: 'unresolved', reasonCode: 'VCS_MECHANICS_EVIDENCE_REQUIRED' });
    }
    if (requirement.kind === 'current_location') {
      return locationRef
        ? result(requirement, index, { status: 'resolved', sourceRefs: [`gmc:location:${locationRef}`], revision: Number(scene.revision ?? scene.recordRevision ?? 0), reasonCode: 'CURRENT_PLAYABLE_LOCATION' })
        : result(requirement, index, { status: 'preparation_debt', reasonCode: 'CURRENT_LOCATION_NOT_PREPARED' });
    }
    if (requirement.kind === 'time_clock') {
      const revision = Number(state.revision ?? state.clockRevision ?? 0);
      return (state.gameClock || state.gameTime || state.campaignTime || state.currentTime)
        ? result(requirement, index, { status: 'resolved', sourceRefs: ['gmc:campaign-clock'], revision, reasonCode: 'CAMPAIGN_CLOCK_CURRENT' })
        : result(requirement, index, { status: 'unresolved', revision, reasonCode: 'CAMPAIGN_CLOCK_VALUE_UNAVAILABLE' });
    }
    if (requirement.kind === 'scene_presence') {
      const actor = participantRows.find((row) => publicLabelMatch(row, query));
      const ref = actor && sourceRef('gmc:scene-actor', actor.entityId ?? actor.actorId ?? actor.npcRef);
      return ref
        ? result(requirement, index, { status: 'resolved', sourceRefs: [ref], revision: Number(workspaceRef.revision ?? 0), reasonCode: 'ACTOR_PRESENT_IN_PLAYABLE_SCENE' })
        : result(requirement, index, { status: 'absent', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'ACTOR_NOT_PRESENT_IN_PLAYABLE_SCENE' });
    }
    if (requirement.kind === 'actor_identity' || requirement.kind === 'canonical_reference' || requirement.kind === 'destination_location') {
      const matches = entities.filter((row) => publicLabelMatch(row, query));
      const activeMatches = matches.filter((row) => row.status !== 'superseded');
      if (activeMatches.length > 1) {
        return result(requirement, index, { status: 'contradictory', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'CANONICAL_REFERENCE_AMBIGUOUS' });
      }
      const matching = activeMatches[0];
      const type = String(matching?.type ?? 'entity');
      const ref = matching && sourceRef(`gmc:${type}`, matching._id ?? matching.id);
      if (ref) return result(requirement, index, { status: 'resolved', sourceRefs: [ref], revision: Number(matching?.revision ?? matching?.recordRevision ?? 0), reasonCode: 'CANONICAL_REFERENCE_RESOLVED' });
      if (matches.length) return result(requirement, index, { status: 'stale', revision: Number(matches[0].revision ?? matches[0].recordRevision ?? 0), reasonCode: 'CANONICAL_REFERENCE_SUPERSEDED' });
      const privateRefs = JSON.stringify(privateContext).toLocaleLowerCase().includes(query);
      return result(requirement, index, privateRefs
        ? { status: 'unresolved', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'PRIVATE_REFERENCE_REQUIRES_REVEAL_AUTHORITY' }
        : { status: 'unresolved', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'CANONICAL_REFERENCE_NOT_FOUND' });
    }
    if (requirement.kind === 'story_fact' || requirement.kind === 'recent_continuity') {
      const matches = facts.filter((row) => normalizedQuery(String(row.text ?? '')).includes(query));
      if (matches.some((row) => row.contradicted === true || row.status === 'contradictory')) {
        return result(requirement, index, { status: 'contradictory', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'CANONICAL_FACT_CONTRADICTORY' });
      }
      const matching = matches.find((row) => row.status !== 'superseded' && row.active !== false);
      const ref = matching && sourceRef('gmc:fact', matching._id ?? matching.id);
      return ref
        ? result(requirement, index, { status: 'resolved', sourceRefs: [ref], revision: Number(matching?.revision ?? matching?.recordRevision ?? 0), reasonCode: 'CANONICAL_FACT_RESOLVED' })
        : result(requirement, index, matches.length
          ? { status: 'stale', revision: Number(matches[0].revision ?? matches[0].recordRevision ?? 0), reasonCode: 'CANONICAL_FACT_SUPERSEDED' }
          : { status: 'unresolved', revision: Number(workspaceRef.revision ?? 0), reasonCode: 'FACT_NOT_ESTABLISHED' });
    }
    const offer = activeOffers.find((row) => publicLabelMatch(row, query));
    const offerRef = offer && sourceRef('gmc:offer', offer.offerId ?? offer._id ?? offer.id);
    return offerRef
      ? result(requirement, index, { status: 'resolved', sourceRefs: [offerRef], revision: Number(offer?.revision ?? 0), reasonCode: 'ACTIVE_OFFER_RESOLVED' })
      : result(requirement, index, { status: 'absent', reasonCode: 'ACTIVE_OFFER_NOT_FOUND' });
  });
  return {
    contractVersion: COMPOUND_ACTION_REQUIREMENT_PROJECTION_CONTRACT_VERSION,
    programId: input.programId,
    nodeId: input.nodeId,
    authority: 'gmc',
    authorityHead: {
      storyWorkspaceRevision: Number(workspaceRef.revision ?? 0),
      sceneRevision: Number(scene.revision ?? scene.recordRevision ?? 0),
    },
    requirementResults,
  };
}

export async function resolveCompoundActionRequirements(input: {
  userId: string; campaignId: string; programId: string; nodeId: string; requirements: CompoundActionRequirement[];
  expectedAuthority?: { storyWorkspaceRevision?: number; sceneRevision?: number };
}) {
  const [storyContext, campaignState] = await Promise.all([
    readCurrentSceneContexts({ userId: input.userId, campaignId: input.campaignId }),
    collections.state().findOne({ userId: input.userId, campaignId: input.campaignId }),
  ]);
  const currentScene = campaignState?.currentSceneId
    ? await collections.scenes().findOne({ userId: input.userId, campaignId: input.campaignId, _id: campaignState.currentSceneId })
    : null;
  const [entities, facts, merchantOffers] = await Promise.all([
    collections.entities().find({ userId: input.userId, project_id: input.campaignId }).limit(500).toArray(),
    collections.facts().find({ userId: input.userId, campaignId: input.campaignId, locked: true }).limit(500).toArray(),
    collections.merchantOffers().findOne({ userId: input.userId, campaignId: input.campaignId }),
  ]);
  const projection = compileCompoundActionRequirementProjection({
    programId: input.programId, nodeId: input.nodeId, requirements: input.requirements,
    storyContext: storyContext as unknown as Record<string, unknown> | null,
    campaignState, currentScene, entities: entities as unknown as Array<Record<string, unknown>>, facts,
    activeOffers: (Array.isArray(merchantOffers?.offers) ? merchantOffers.offers : [])
      .filter((offer: Record<string, unknown>) => offer.status === 'active'),
  });
  if (input.expectedAuthority && (input.expectedAuthority.storyWorkspaceRevision !== undefined
    && input.expectedAuthority.storyWorkspaceRevision !== projection.authorityHead.storyWorkspaceRevision
    || input.expectedAuthority.sceneRevision !== undefined
    && input.expectedAuthority.sceneRevision !== projection.authorityHead.sceneRevision)) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_AUTHORITY_CONFLICT', 'The campaign authority changed while action requirements were being checked.', {
      expectedAuthority: input.expectedAuthority,
      actualAuthority: projection.authorityHead,
    });
  }
  return projection;
}
