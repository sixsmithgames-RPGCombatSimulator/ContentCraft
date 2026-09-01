import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { collections } from './gmcIntegrationStore.js';
import {
  readActiveStoryWorkspace,
  readStoryWorkspaceRevision,
  readStoryWorkspaceTimelineCheckpoint,
  StoryWorkspaceStoreError,
  type JsonObject,
  type JsonValue,
  type StoryWorkspaceReference,
} from './storyWorkspaceStore.js';

export const COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION = 'gmc.compound-action-artifact-store/2';
export const COMPOUND_ACTION_ARTIFACT_REFERENCE_CONTRACT_VERSION = 'gmc.compound-action-artifact-ref/1';
export const COMPOUND_ACTION_REQUIREMENT_PROJECTION_CONTRACT_VERSION = 'gmc.compound-action-requirement-projection/1';
export const COMPOUND_REPLAY_STORY_CHECKPOINT_CONTRACT_VERSION = 'gmc.compound-replay-story-checkpoint/1';
export const COMPOUND_REPLAY_STORY_CHECKPOINT_V2_CONTRACT_VERSION = 'gmc.compound-replay-story-checkpoint/2';
export const COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONTRACT_VERSION = 'gmc.compound-action-origin-checkpoint/1';
export const PARALLEL_COHORT_SEMANTIC_ACTION_PROGRAM_VERSION = 'gma.semantic-action-program/5';
export const COMPOUND_ACTION_CAPABILITIES = Object.freeze([
  'compound-action-program/2',
  'compound-action-artifact-store/1',
  'compound-action-feasibility/1',
  'compound-action-typed-repair/4',
] as const);
export const GMC_COMPOUND_ACTION_CAPABILITIES = Object.freeze([
  ...COMPOUND_ACTION_CAPABILITIES,
  'durable-story-settlement-candidate/1',
] as const);
export const COMPOUND_ACTION_CONTRACTS = Object.freeze({
  playerInstructionArtifact: 'gma.player-instruction-artifact/1',
  semanticActionProgram: 'gma.semantic-action-program/2',
  semanticActionProgramV4: 'gma.semantic-action-program/4',
  actionFeasibility: 'gma.action-feasibility/1',
  actionExecutionSlice: 'gma.action-execution-slice/1',
  actionExecutionReceipt: 'gma.action-execution-receipt/1',
  actionExecutionReceiptV2: 'gma.action-execution-receipt/2',
  actionSaga: 'gma.action-saga/1',
  actionProgramCursor: 'gma.action-program-cursor/1',
  actionDirectedStoryRepair: 'gma.action-directed-story-repair/4',
});
export const GMC_COMPOUND_ACTION_CONTRACTS = Object.freeze({
  ...COMPOUND_ACTION_CONTRACTS,
  acceptedModelCandidateV2: 'gma.accepted-model-candidate/2',
  compoundStorySettlementCandidate: 'gma.compound-story-settlement-candidate/1',
});
export const COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS: readonly string[] = Object.freeze([
  COMPOUND_ACTION_CONTRACTS.semanticActionProgram,
  COMPOUND_ACTION_CONTRACTS.semanticActionProgramV4,
  PARALLEL_COHORT_SEMANTIC_ACTION_PROGRAM_VERSION,
]);
export const COMPOUND_ACTION_LIMITS = Object.freeze({
  instructionMaximumBytes: 32_768,
  nodeMaximum: 8,
  dependencyMaximum: 12,
  dataRequirementMaximum: 16,
  programMaximumBytes: 16_384,
  observationProgramMaximumBytes: 24_576,
  cursorMaximumBytes: 16_384,
  receiptMaximumBytes: 4_096,
  observationReceiptMaximumBytes: 24_576,
  receiptMaximum: 16,
  clarificationMaximum: 8,
  parallelRelationshipMaximum: 12,
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
  saga?: JsonObject | null;
  timelineAnchor: { messageId: string; sequence: number; replayLineageId?: string } | null;
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

export interface CompoundActionInstructionDocument {
  userId: string;
  campaignId: string;
  interactionId: string;
  instructionRef: string;
  instructionFingerprint: string;
  utf8Bytes: number;
  instruction: JsonObject;
  idempotencyKey: string;
  requestHash: string;
  originCheckpoint?: {
    contractVersion: typeof COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONTRACT_VERSION;
    storyWorkspaceRef: StoryWorkspaceReference;
    replayLineageId: string;
    messageId: string;
    timelineSequence: number;
    interactionId: string;
    instructionFingerprint: string;
  };
  createdAt: Date;
}

export type CompoundActionInstructionCollection = Collection<CompoundActionInstructionDocument>;

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

function instructionCollection(): CompoundActionInstructionCollection {
  return getDb().collection<CompoundActionInstructionDocument>('gmc_compound_action_instructions');
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

function exactStoryWorkspaceRef(value: unknown, campaignId: string, field = 'expectedStoryWorkspaceRef'): StoryWorkspaceReference {
  if (!isObject(value)
    || value.contractVersion !== 'gmc.story-workspace-ref/1'
    || value.campaignId !== campaignId
    || value.workspaceId !== `story-workspace:${campaignId}`
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || !/^[a-f0-9]{64}$/.test(String(value.payloadHash ?? '').toLowerCase())) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_INVALID', 'The saved-plan origin checkpoint is invalid.', { field });
  }
  return {
    contractVersion: 'gmc.story-workspace-ref/1',
    campaignId,
    workspaceId: String(value.workspaceId),
    revision: Number(value.revision),
    payloadHash: String(value.payloadHash).toLowerCase(),
  };
}

function sameExactStoryWorkspaceRef(left: StoryWorkspaceReference, right: StoryWorkspaceReference): boolean {
  return left.contractVersion === right.contractVersion
    && left.campaignId === right.campaignId
    && left.workspaceId === right.workspaceId
    && left.revision === right.revision
    && left.payloadHash === right.payloadHash;
}

function requiredOwnerRevision(value: unknown, field: string): number | string {
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
  return requiredString(value, field, 240);
}

/**
 * Persists the immutable player bytes before semantic interpretation. This
 * staging record is deliberately separate from the program/cursor artifact so
 * a planner timeout can never erase or rewrite the submitted instruction.
 * date_of_change: 2026-08-11
 */
export async function stageCompoundActionInstruction(input: {
  userId: string;
  campaignId: string;
  idempotencyKey: string;
  instruction: JsonObject;
  expectedStoryWorkspaceRef?: JsonObject | null;
  timelineAnchor?: { messageId: string; sequence: number; replayLineageId?: string } | null;
}, records: CompoundActionInstructionCollection = instructionCollection(), activeStoryReader: (input: {
  userId: string;
  campaignId: string;
}) => Promise<{ storyWorkspaceRef: StoryWorkspaceReference } | null> = readActiveStoryWorkspace) {
  requiredString(input.userId, 'userId');
  requiredString(input.campaignId, 'campaignId');
  requiredString(input.idempotencyKey, 'idempotencyKey');
  validateInstruction(input.instruction);
  const timelineAnchor = input.expectedStoryWorkspaceRef == null ? null : validateTimelineAnchor(input.timelineAnchor);
  const expectedStoryWorkspaceRef = input.expectedStoryWorkspaceRef == null
    ? null
    : exactStoryWorkspaceRef(input.expectedStoryWorkspaceRef, input.campaignId);
  if (expectedStoryWorkspaceRef && (!timelineAnchor?.replayLineageId || !timelineAnchor.messageId)) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_INVALID', 'The saved-plan origin checkpoint is missing its Replay lineage or timeline anchor.', { field: 'timelineAnchor' });
  }
  const requestHashPayload = expectedStoryWorkspaceRef ? {
    instruction: input.instruction,
    expectedStoryWorkspaceRef: expectedStoryWorkspaceRef as unknown as JsonObject,
    timelineAnchor,
  } as JsonObject : input.instruction;
  const requestHash = sha256(canonicalJson(requestHashPayload));
  const existing = await records.findOne({ userId: input.userId, campaignId: input.campaignId, idempotencyKey: input.idempotencyKey });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_IDEMPOTENCY_CONFLICT', 'The instruction staging key was already used for different player bytes.', {});
    return {
      instructionRef: existing.instructionRef, instructionFingerprint: existing.instructionFingerprint,
      utf8Bytes: existing.utf8Bytes, originCheckpoint: structuredClone(existing.originCheckpoint ?? null), duplicate: true,
    };
  }
  let originCheckpoint: CompoundActionInstructionDocument['originCheckpoint'];
  if (expectedStoryWorkspaceRef && timelineAnchor?.replayLineageId) {
    const active = await activeStoryReader({ userId: input.userId, campaignId: input.campaignId });
    const activeRef = active?.storyWorkspaceRef;
    if (!activeRef || !sameExactStoryWorkspaceRef(expectedStoryWorkspaceRef, activeRef)) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONFLICT', 'The saved Story changed before the player instruction could be anchored.', {});
    }
    originCheckpoint = {
      contractVersion: COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONTRACT_VERSION,
      storyWorkspaceRef: structuredClone(expectedStoryWorkspaceRef),
      replayLineageId: timelineAnchor.replayLineageId,
      messageId: timelineAnchor.messageId,
      timelineSequence: timelineAnchor.sequence,
      interactionId: String(input.instruction.interactionId),
      instructionFingerprint: String(input.instruction.instructionFingerprint),
    };
  }
  const document: CompoundActionInstructionDocument = {
    userId: input.userId,
    campaignId: input.campaignId,
    interactionId: String(input.instruction.interactionId),
    instructionRef: String(input.instruction.instructionRef),
    instructionFingerprint: String(input.instruction.instructionFingerprint),
    utf8Bytes: Number(input.instruction.utf8Bytes),
    instruction: structuredClone(input.instruction),
    idempotencyKey: input.idempotencyKey,
    requestHash,
    ...(originCheckpoint ? { originCheckpoint } : {}),
    createdAt: new Date(),
  };
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      const replay = await records.findOne({ userId: input.userId, campaignId: input.campaignId, idempotencyKey: input.idempotencyKey });
      if (replay?.requestHash === requestHash) return {
        instructionRef: replay.instructionRef, instructionFingerprint: replay.instructionFingerprint,
        utf8Bytes: replay.utf8Bytes, originCheckpoint: structuredClone(replay.originCheckpoint ?? null), duplicate: true,
      };
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_INSTRUCTION_CONFLICT', 'The player instruction changed before it could be staged.', {});
    }
    throw error;
  }
  return {
    instructionRef: document.instructionRef, instructionFingerprint: document.instructionFingerprint,
    utf8Bytes: document.utf8Bytes, originCheckpoint: structuredClone(document.originCheckpoint ?? null), duplicate: false,
  };
}

export async function readStagedCompoundActionInstruction(input: {
  userId: string;
  campaignId: string;
  interactionId: string;
}, records: CompoundActionInstructionCollection = instructionCollection()) {
  const document = await records.findOne({ userId: input.userId, campaignId: input.campaignId, interactionId: input.interactionId });
  return document ? {
    instruction: structuredClone(document.instruction),
    originCheckpoint: structuredClone(document.originCheckpoint ?? null),
    stagedAt: document.createdAt,
  } : null;
}

function validateProgram(program: unknown, instruction: JsonObject): asserts program is JsonObject {
  if (!isObject(program) || !COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS.includes(String(program.schemaVersion))) {
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
  const nodesById = new Map<string, JsonObject>();
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
    nodesById.set(nodeId, nodeValue);
    seen.add(nodeId);
  }
  if (program.schemaVersion === PARALLEL_COHORT_SEMANTIC_ACTION_PROGRAM_VERSION) {
    const planner = isObject(program.planner) ? program.planner : null;
    if (!['gma.semantic-action-compiler-policy/8', 'gma.semantic-action-compiler-policy/9'].includes(String(planner?.policyVersion ?? ''))) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'The parallel action program compiler policy is invalid.', {});
    }
    const relationPairs = new Set<string>();
    for (const [index, nodeValue] of nodes.entries()) {
      if (!isObject(nodeValue)) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An action node is invalid.', { index });
      }
      const node = nodeValue;
      const nodeId = String(node.nodeId);
      const parallelWith = node.parallelWith;
      if (!Array.isArray(parallelWith)
        || parallelWith.length > COMPOUND_ACTION_LIMITS.nodeMaximum - 1
        || new Set(parallelWith).size !== parallelWith.length) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'Parallel action references must be a unique bounded collection.', { index });
      }
      for (const parallelRefValue of parallelWith) {
        const parallelRef = String(parallelRefValue);
        if (typeof parallelRefValue !== 'string' || parallelRef === nodeId || !nodesById.has(parallelRef)) {
          throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'A parallel action reference is invalid.', { index });
        }
        const peerRefs = Array.isArray(nodesById.get(parallelRef)?.parallelWith)
          ? nodesById.get(parallelRef)?.parallelWith as JsonValue[]
          : [];
        if (!peerRefs.includes(nodeId)) {
          throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'Parallel action references must be reciprocal.', { index });
        }
        relationPairs.add([nodeId, parallelRef].sort().join('|'));
      }
    }
    const limits = isObject(program.limits) ? program.limits : null;
    if (!limits || limits.parallelRelationshipCount !== relationPairs.size
      || relationPairs.size > COMPOUND_ACTION_LIMITS.parallelRelationshipMaximum) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'The parallel action relationship count is invalid.', {});
    }
  }
  if (program.schemaVersion === COMPOUND_ACTION_CONTRACTS.semanticActionProgramV4) {
    const dependsTransitively = (node: JsonObject, ancestorRef: string, visiting = new Set<string>()): boolean => {
      const nodeId = String(node.nodeId);
      if (visiting.has(nodeId)) return false;
      visiting.add(nodeId);
      const direct = Array.isArray(node.dependsOn) ? node.dependsOn.map(String) : [];
      return direct.includes(ancestorRef) || direct.some((ref) => {
        const parent = nodesById.get(ref);
        return parent ? dependsTransitively(parent, ancestorRef, visiting) : false;
      });
    };
    for (const [nodeId, node] of nodesById) {
      if (node.observationPrerequisite === undefined || node.observationPrerequisite === null) continue;
      const prerequisite = node.observationPrerequisite;
      if (!isObject(prerequisite) || prerequisite.schemaVersion !== 'gma.observation-prerequisite/1'
        || !['gmc', 'vcs'].includes(String(prerequisite.owner))
        || ![['gmc', 'establish_observer_viewpoint'], ['vcs', 'activate_familiar_form']]
          .some(([owner, operation]) => prerequisite.owner === owner && prerequisite.operationKind === operation)) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An observation prerequisite has an unsupported owner operation.', { nodeId });
      }
      const dependentRefs = Array.isArray(prerequisite.dependentObservationNodeRefs) ? prerequisite.dependentObservationNodeRefs : [];
      const groupRefs = Array.isArray(prerequisite.groupRefs) ? prerequisite.groupRefs : [];
      if (!dependentRefs.length || !groupRefs.length
        || dependentRefs.some((ref) => typeof ref !== 'string')
        || groupRefs.some((ref) => typeof ref !== 'string')
        || new Set(dependentRefs).size !== dependentRefs.length
        || new Set(groupRefs).size !== groupRefs.length) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An observation prerequisite must bind dependent observation nodes and groups.', { nodeId });
      }
      const declaredGroups = new Set(groupRefs.map(String));
      const coveredGroups = new Set<string>();
      const groupOwnerCounts = new Map<string, number>();
      for (const dependentRef of dependentRefs) {
        const dependent = nodesById.get(String(dependentRef));
        const groups = Array.isArray(dependent?.observationGroups) ? dependent.observationGroups : [];
        const availableGroups = new Set(groups.filter(isObject).map((group) => String(group.groupId)));
        const matchedGroups = [...availableGroups].filter((groupRef) => declaredGroups.has(groupRef));
        if (!dependent || !dependsTransitively(dependent, nodeId) || matchedGroups.length === 0) {
          throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An observation prerequisite must bind real downstream observation groups.', { nodeId, dependentRef });
        }
        for (const groupRef of matchedGroups) {
          coveredGroups.add(groupRef);
          groupOwnerCounts.set(groupRef, Number(groupOwnerCounts.get(groupRef) ?? 0) + 1);
        }
      }
      if ([...declaredGroups].some((groupRef) => !coveredGroups.has(groupRef))) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An observation prerequisite cannot bind an observation group outside its declared downstream nodes.', { nodeId });
      }
      if ([...declaredGroups].some((groupRef) => groupOwnerCounts.get(groupRef) !== 1)) {
        throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_PROGRAM_INVALID', 'An observation prerequisite must identify one exact downstream owner for each group.', { nodeId });
      }
    }
  }
  const programMaximumBytes = program.schemaVersion === COMPOUND_ACTION_CONTRACTS.semanticActionProgramV4
    ? COMPOUND_ACTION_LIMITS.observationProgramMaximumBytes
    : COMPOUND_ACTION_LIMITS.programMaximumBytes;
  if (dependencies > COMPOUND_ACTION_LIMITS.dependencyMaximum || requirements > COMPOUND_ACTION_LIMITS.dataRequirementMaximum
    || byteLength(program) > programMaximumBytes) {
    throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_PROGRAM_TOO_LARGE', 'The semantic action program exceeds its bounded storage contract.', {});
  }
}

function validateSaga(saga: unknown, instruction: JsonObject, program: JsonObject, cursor: JsonObject): JsonObject | null {
  const v4 = program.schemaVersion === COMPOUND_ACTION_CONTRACTS.semanticActionProgramV4;
  if (!v4 && (saga === undefined || saga === null)) return null;
  if (!isObject(saga) || saga.schemaVersion !== COMPOUND_ACTION_CONTRACTS.actionSaga
    || saga.programId !== program.programId || saga.interactionId !== instruction.interactionId
    || saga.instructionFingerprint !== instruction.instructionFingerprint) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The action saga is not bound to this exact interaction.', {});
  }
  requiredString(saga.sagaId, 'saga.sagaId');
  requiredString(saga.rewindLineageId, 'saga.rewindLineageId');
  const artifactRevision = requiredRevision(saga.artifactRevision, 'saga.artifactRevision');
  const cursorRevision = requiredRevision(saga.cursorRevision, 'saga.cursorRevision');
  if (artifactRevision !== cursor.revision || cursorRevision !== cursor.revision) throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_SAGA_REVISION_CONFLICT', 'The action saga and cursor revisions must settle together.', {});
  const foreground = requiredRevision(saga.foregroundModelOperationCount, 'saga.foregroundModelOperationCount');
  if (foreground > 4) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_MODEL_OPERATION_LIMIT', 'The action saga exceeded its foreground model-operation limit.', {});
  const operations = Array.isArray(saga.operations) ? saga.operations : [];
  if (operations.length > 32) throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_SAGA_TOO_LARGE', 'The action saga contains too many owner operations.', {});
  const operationIds = new Set<string>();
  const operationKeys = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    if (!isObject(operation)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'An action saga operation is invalid.', { index });
    const operationId = requiredString(operation.operationId, `saga.operations.${index}.operationId`);
    const operationKey = requiredString(operation.idempotencyKey, `saga.operations.${index}.idempotencyKey`);
    const requestFingerprint = requiredString(operation.requestFingerprint, `saga.operations.${index}.requestFingerprint`, 64);
    if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'An action saga request fingerprint must be SHA-256.', { index });
    if (!['gmc', 'vcs'].includes(String(operation.owner))) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'An action saga operation owner is unsupported.', { index });
    requiredString(operation.operationKind, `saga.operations.${index}.operationKind`, 80);
    requiredOwnerRevision(operation.expectedOwnerRevision, `saga.operations.${index}.expectedOwnerRevision`);
    requiredRevision(operation.attemptCount, `saga.operations.${index}.attemptCount`);
    requiredRevision(operation.reconciliationCount, `saga.operations.${index}.reconciliationCount`);
    if (!['checkpointed', 'dispatching', 'outcome_unknown', 'committed', 'confirmed_absent', 'failed'].includes(String(operation.disposition))) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'An action saga operation has an unsupported disposition.', { index });
    requiredString(operation.statusLookupMethod, `saga.operations.${index}.statusLookupMethod`, 80);
    if (!Array.isArray(operation.dependencyReceiptRefs) || operation.dependencyReceiptRefs.length > 32) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'An action saga operation has invalid dependency receipts.', { index });
    for (const [receiptIndex, receiptRef] of operation.dependencyReceiptRefs.entries()) requiredString(receiptRef, `saga.operations.${index}.dependencyReceiptRefs.${receiptIndex}`);
    if (operation.receiptRef !== null && operation.receiptRef !== undefined) requiredString(operation.receiptRef, `saga.operations.${index}.receiptRef`);
    if (operation.resultingRevision !== null && operation.resultingRevision !== undefined) requiredOwnerRevision(operation.resultingRevision, `saga.operations.${index}.resultingRevision`);
    if (operation.disposition === 'committed' && (operation.receiptRef == null || operation.resultingRevision == null)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'A committed action saga operation requires its owner receipt and resulting revision.', { index });
    if (operationIds.has(operationId) || operationKeys.has(operationKey)) throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_SAGA_OPERATION_DUPLICATE', 'Action saga operation identifiers and idempotency keys must be unique.', { index });
    operationIds.add(operationId); operationKeys.add(operationKey);
  }
  for (const field of ['acceptedOwnerReceiptRefs', 'acceptedModelCandidateRefs']) {
    if (!Array.isArray(saga[field]) || saga[field].length > 64 || saga[field].some((value) => typeof value !== 'string')) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The action saga contains an invalid bounded reference set.', { field });
  }
  if (saga.pendingModelCandidate !== null && saga.pendingModelCandidate !== undefined) {
    const pendingValue = saga.pendingModelCandidate;
    if (!isObject(pendingValue)) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The pending accepted model candidate is invalid.', {});
    }
    const pending = pendingValue;
    const observationCandidate = pending.schemaVersion === 'gma.accepted-model-candidate/1'
      && ['observation_preparation', 'observation_narration'].includes(String(pending.kind));
    const storyCandidate = pending.schemaVersion === GMC_COMPOUND_ACTION_CONTRACTS.acceptedModelCandidateV2
      && pending.kind === 'story_narration'
      && isObject(pending.candidate)
      && pending.candidate.schemaVersion === GMC_COMPOUND_ACTION_CONTRACTS.compoundStorySettlementCandidate;
    if ((!observationCandidate && !storyCandidate) || !isObject(pending.candidate)) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The pending accepted model candidate is invalid.', {});
    }
    requiredString(pending.operationKey, 'saga.pendingModelCandidate.operationKey');
    const inputFingerprint = requiredString(pending.inputFingerprint, 'saga.pendingModelCandidate.inputFingerprint', 64);
    const candidateFingerprint = requiredString(pending.candidateFingerprint, 'saga.pendingModelCandidate.candidateFingerprint', 64);
    if (!/^[a-f0-9]{64}$/.test(inputFingerprint) || !/^[a-f0-9]{64}$/.test(candidateFingerprint)
      || candidateFingerprint !== sha256(canonicalJson(pending.candidate))
      || !(saga.acceptedModelCandidateRefs as JsonValue[]).includes(candidateFingerprint)
      || byteLength(pending) > (storyCandidate ? 24_576 : 20_480)) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The pending accepted model candidate does not match its durable fingerprint.', {});
    }
  }
  if (!isObject(saga.presentationSettlement) || !['unsettled', 'settled'].includes(String(saga.presentationSettlement.state))) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SAGA_INVALID', 'The action saga presentation settlement is invalid.', {});
  if (byteLength(saga) > 32_768) throw new StoryWorkspaceStoreError(413, 'COMPOUND_ACTION_SAGA_TOO_LARGE', 'The action saga exceeds its bounded storage contract.', {});
  return structuredClone(saga);
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
    const expectedReceiptVersion = program.schemaVersion === COMPOUND_ACTION_CONTRACTS.semanticActionProgramV4
      ? COMPOUND_ACTION_CONTRACTS.actionExecutionReceiptV2 : COMPOUND_ACTION_CONTRACTS.actionExecutionReceipt;
    if (!isObject(receiptValue) || receiptValue.schemaVersion !== expectedReceiptVersion
      || receiptValue.programId !== program.programId || !nodeIds.has(String(receiptValue.nodeId))) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_RECEIPT_INVALID', 'An action execution receipt is invalid for this program.', {});
    }
    const receiptId = requiredString(receiptValue.receiptId, 'receipt.receiptId');
    const receiptMaximumBytes = expectedReceiptVersion === COMPOUND_ACTION_CONTRACTS.actionExecutionReceiptV2
      ? COMPOUND_ACTION_LIMITS.observationReceiptMaximumBytes : COMPOUND_ACTION_LIMITS.receiptMaximumBytes;
    if (receiptIds.has(receiptId) || byteLength(receiptValue) > receiptMaximumBytes) {
      throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_RECEIPT_INVALID', 'Action execution receipts must be unique and bounded.', { receiptId });
    }
    receiptIds.add(receiptId);
    return structuredClone(receiptValue);
  });
}

function validateTimelineAnchor(value: unknown): { messageId: string; sequence: number; replayLineageId?: string } | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_TIMELINE_INVALID', 'The timeline anchor is invalid.', {});
  const replayLineageId = value.replayLineageId === undefined || value.replayLineageId === null
    ? null
    : requiredString(value.replayLineageId, 'timelineAnchor.replayLineageId');
  return {
    messageId: requiredString(value.messageId, 'timelineAnchor.messageId'),
    sequence: requiredRevision(value.sequence, 'timelineAnchor.sequence'),
    ...(replayLineageId ? { replayLineageId } : {}),
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
  'instruction' | 'program' | 'cursor' | 'receipts' | 'clarifications' | 'rootFailure' | 'timelineAnchor' | 'saga'>): JsonObject {
  return {
    instruction: document.instruction,
    program: document.program,
    cursor: document.cursor,
    receipts: document.receipts,
    clarifications: document.clarifications,
    rootFailure: document.rootFailure,
    saga: document.saga ?? null,
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
  clarifications?: JsonObject[];
  saga?: JsonObject;
  originCheckpoint?: CompoundActionInstructionDocument['originCheckpoint'] | null;
  timelineAnchor?: { messageId: string; sequence: number; replayLineageId?: string } | null;
}, records: CompoundActionArtifactCollection = artifactCollection(), stagedInstructions?: CompoundActionInstructionCollection) {
  requiredString(input.userId, 'userId');
  requiredString(input.campaignId, 'campaignId');
  requiredString(input.idempotencyKey, 'idempotencyKey');
  validateInstruction(input.instruction);
  validateProgram(input.program, input.instruction);
  validateCursor(input.cursor, input.program, 1);
  const clarifications = input.clarifications ?? [];
  if (!Array.isArray(clarifications) || clarifications.length > COMPOUND_ACTION_LIMITS.clarificationMaximum || clarifications.some((value) => !isObject(value))) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_CLARIFICATION_INVALID', 'The interaction clarification state is invalid.', {});
  }
  const timelineAnchor = validateTimelineAnchor(input.timelineAnchor);
  if (input.originCheckpoint != null) {
    const submittedOrigin = input.originCheckpoint;
    const submittedStoryRef = exactStoryWorkspaceRef(submittedOrigin.storyWorkspaceRef, input.campaignId, 'originCheckpoint.storyWorkspaceRef');
    const staged = await (stagedInstructions ?? instructionCollection()).findOne({
      userId: input.userId, campaignId: input.campaignId, interactionId: String(input.instruction.interactionId),
    });
    if (!staged?.originCheckpoint
      || canonicalJson(staged.originCheckpoint as unknown as JsonObject) !== canonicalJson(submittedOrigin as unknown as JsonObject)
      || staged.originCheckpoint.replayLineageId !== timelineAnchor?.replayLineageId
      || staged.originCheckpoint.messageId !== timelineAnchor?.messageId
      || staged.originCheckpoint.timelineSequence !== timelineAnchor?.sequence
      || Number((input.program.authorityBase as JsonObject | undefined)?.storyWorkspaceRevision) !== submittedStoryRef.revision) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_MISMATCH', 'The saved plan is not bound to its verified Story origin.', {});
    }
  }
  const saga = validateSaga(input.saga, input.instruction, input.program, input.cursor);
  const draft = {
    instruction: structuredClone(input.instruction),
    program: structuredClone(input.program),
    cursor: structuredClone(input.cursor),
    receipts: [] as JsonObject[], clarifications: structuredClone(clarifications), rootFailure: null, saga, timelineAnchor,
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
  saga?: JsonObject;
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
      && (input.saga === undefined || canonicalJson(priorReplay.saga ?? null) === canonicalJson(input.saga))
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
  const saga = validateSaga(input.saga === undefined ? active.saga : input.saga, active.instruction, program, input.cursor);
  const draft = {
    instruction: active.instruction, program: structuredClone(program), cursor: structuredClone(input.cursor), receipts,
    clarifications: structuredClone(clarifications), rootFailure: input.rootFailure === undefined ? active.rootFailure : input.rootFailure,
    saga,
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

/** Atomically stores the final execution receipt, saga settlement, and cursor advance. */
export async function settleCompoundActionArtifact(input: {
  userId: string;
  campaignId: string;
  programId: string;
  expectedRevision: number;
  idempotencyKey: string;
  cursor: JsonObject;
  executionReceipt: JsonObject;
  executionReceipts?: JsonObject[];
  saga: JsonObject;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  const executionReceipts = Array.isArray(input.executionReceipts) ? input.executionReceipts : [input.executionReceipt];
  const receiptIds = executionReceipts.map((receipt) => receipt?.receiptId);
  const completedNodeRefs = new Set(Array.isArray(input.cursor.completedNodeRefs) ? input.cursor.completedNodeRefs : []);
  if (executionReceipts.length < 1 || executionReceipts.length > 8
    || canonicalJson(executionReceipts[0]) !== canonicalJson(input.executionReceipt)
    || new Set(receiptIds).size !== receiptIds.length
    || executionReceipts.some((receipt) => receipt?.schemaVersion !== COMPOUND_ACTION_CONTRACTS.actionExecutionReceiptV2
      || receipt?.programId !== input.programId
      || !completedNodeRefs.has(receipt?.nodeId))
    || input.saga.schemaVersion !== COMPOUND_ACTION_CONTRACTS.actionSaga
    || !isObject(input.saga.presentationSettlement)
    || input.saga.presentationSettlement.state !== 'settled') {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SETTLEMENT_INVALID', 'The presentation receipt and action saga are not ready to settle together.', {});
  }
  if (input.executionReceipt.programId !== input.programId
    || input.saga.programId !== input.programId
    || input.saga.presentationSettlement.receiptRef !== input.executionReceipt.receiptId) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SETTLEMENT_INVALID', 'The presentation settlement is not bound to this execution receipt.', {});
  }
  const settlementOperations = Array.isArray(input.saga.operations)
    ? input.saga.operations.filter((operation) => isObject(operation) && operation.operationKind === 'settle_observation_presentation')
    : [];
  const settlementOperation = settlementOperations[0];
  if (settlementOperations.length !== 1 || !isObject(settlementOperation)
    || settlementOperation.owner !== 'gmc'
    || settlementOperation.disposition !== 'committed'
    || settlementOperation.idempotencyKey !== input.idempotencyKey
    || settlementOperation.receiptRef !== input.executionReceipt.receiptId
    || Number(settlementOperation.expectedOwnerRevision) !== input.expectedRevision
    || Number(settlementOperation.resultingRevision) !== Number(input.cursor.revision)) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_ACTION_SETTLEMENT_INVALID', 'The presentation settlement is missing its exact committed artifact operation.', {});
  }
  return advanceCompoundActionArtifact({
    userId: input.userId,
    campaignId: input.campaignId,
    programId: input.programId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    cursor: input.cursor,
    appendReceipts: executionReceipts,
    saga: input.saga,
  }, records);
}

export async function readCompoundActionOperationStatus(input: {
  userId: string;
  campaignId: string;
  programId: string;
  operationId: string;
}, records: CompoundActionArtifactCollection = artifactCollection()) {
  const operationId = requiredString(input.operationId, 'operationId');
  const document = await records.findOne({
    userId: input.userId,
    campaignId: input.campaignId,
    programId: input.programId,
    'saga.operations.operationId': operationId,
  } as Filter<CompoundActionArtifactRevisionDocument>, { sort: { revision: -1 } });
  const operation = document?.saga && Array.isArray(document.saga.operations)
    ? document.saga.operations.find((candidate) => isObject(candidate) && candidate.operationId === operationId)
    : null;
  return operation && isObject(operation) ? {
    schemaVersion: 'gmc.action-saga-operation-status/1',
    programId: input.programId,
    operationId,
    artifactRevision: document?.revision,
    disposition: operation.disposition,
    receiptRef: operation.receiptRef ?? null,
    resultingRevision: operation.resultingRevision ?? null,
    requestFingerprint: operation.requestFingerprint,
  } : {
    schemaVersion: 'gmc.action-saga-operation-status/1',
    programId: input.programId,
    operationId,
    disposition: 'unresolved',
  };
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

type ReplayCheckpointRevisionReader = (input: {
  userId: string;
  campaignId: string;
  revision: number;
}) => Promise<{ storyWorkspaceRef: StoryWorkspaceReference } | null>;

type ReplayTimelineCheckpointReader = (input: {
  userId: string;
  campaignId: string;
  boundarySequence: number;
}) => Promise<{
  storyWorkspaceRef: StoryWorkspaceReference;
  timelineAnchor: { messageId: string; sequence: number };
} | null>;

function replayCheckpointFingerprint(value: unknown): string {
  const fingerprint = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new StoryWorkspaceStoreError(422, 'COMPOUND_REPLAY_CHECKPOINT_SELECTOR_INVALID', 'The Replay checkpoint selector is invalid.', { field: 'instructionFingerprint' });
  }
  return fingerprint;
}

function replayCheckpointAuthorityBase(document: CompoundActionArtifactRevisionDocument): number {
  const authorityBase = document.program.authorityBase;
  const revision = Number(authorityBase && typeof authorityBase === 'object' && !Array.isArray(authorityBase)
    ? authorityBase.storyWorkspaceRevision
    : NaN);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_BASE_INVALID', 'The original Story checkpoint for this saved plan is invalid.', {});
  }
  return revision;
}

async function replayCheckpointCandidates(
  records: CompoundActionArtifactCollection,
  filter: Filter<CompoundActionArtifactRevisionDocument>,
): Promise<CompoundActionArtifactRevisionDocument[]> {
  const candidates = await records.find(filter).limit(257).toArray();
  if (candidates.length > 256) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_AMBIGUOUS', 'The saved plan has too many matching Replay checkpoints to select safely.', {});
  }
  return candidates;
}

async function replayOriginCandidates(
  records: CompoundActionInstructionCollection,
  filter: Filter<CompoundActionInstructionDocument>,
): Promise<CompoundActionInstructionDocument[]> {
  const candidates = await records.find(filter).limit(257).toArray();
  if (candidates.length > 256) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_AMBIGUOUS', 'The saved plan has too many matching origin checkpoints to select safely.', {});
  }
  return candidates;
}

function validatedReplayOrigin(
  document: CompoundActionInstructionDocument,
  campaignId: string,
  instructionFingerprint: string,
  replayLineageId: string,
) {
  const origin = document.originCheckpoint;
  if (!origin
    || origin.contractVersion !== COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONTRACT_VERSION
    || origin.replayLineageId !== replayLineageId
    || origin.interactionId !== document.interactionId
    || origin.instructionFingerprint !== instructionFingerprint
    || document.instructionFingerprint !== instructionFingerprint
    || origin.messageId.length < 1 || origin.messageId.length > 240
    || !Number.isSafeInteger(origin.timelineSequence) || origin.timelineSequence < 0) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_ORIGIN_CHECKPOINT_INVALID', 'The saved plan origin checkpoint is inconsistent.', {});
  }
  return {
    ...origin,
    storyWorkspaceRef: exactStoryWorkspaceRef(origin.storyWorkspaceRef, campaignId, 'originCheckpoint.storyWorkspaceRef'),
  };
}

/**
 * Resolves the Story revision that causally preceded a compound action from
 * GMC-owned immutable instruction-origin history, with bounded artifact-only
 * healing for records created before origin capture. Browser timeline refs are
 * compared for drift only and never participate in checkpoint selection.
 */
export async function resolveCompoundReplayStoryCheckpoint(input: {
  userId: string;
  campaignId: string;
  boundarySequence: number;
  instructionFingerprint: string;
  replayLineageId?: string | null;
  allowLegacyFingerprintBoundary?: boolean;
  programId?: string | null;
  observedSurvivingStoryWorkspaceRef?: JsonObject | null;
}, records: CompoundActionArtifactCollection = artifactCollection(), revisionReader: ReplayCheckpointRevisionReader = readStoryWorkspaceRevision, stagedInstructions: CompoundActionInstructionCollection = instructionCollection()): Promise<{
  contractVersion: typeof COMPOUND_REPLAY_STORY_CHECKPOINT_CONTRACT_VERSION;
  restoreStoryWorkspaceRef: StoryWorkspaceReference;
  selectionMode: 'replay_lineage' | 'legacy_fingerprint_boundary';
  matchedAnchorSequence: number;
  matchedArtifactCount: number;
  matchedProgramCount: number;
  matchedOriginCount: number;
  checkpointSource: 'instruction_stage' | 'artifact_legacy';
  observedSurvivingRefAgreement: boolean | null;
}> {
  const userId = requiredString(input.userId, 'userId', 254);
  const campaignId = requiredString(input.campaignId, 'campaignId');
  const boundarySequence = requiredRevision(input.boundarySequence, 'boundarySequence');
  const instructionFingerprint = replayCheckpointFingerprint(input.instructionFingerprint);
  const replayLineageId = input.replayLineageId == null
    ? null
    : requiredString(input.replayLineageId, 'replayLineageId');
  const programId = input.programId == null ? null : requiredString(input.programId, 'programId');
  const baseFilter = {
    userId,
    campaignId,
    'instruction.instructionFingerprint': instructionFingerprint,
    'timelineAnchor.sequence': { $gt: boundarySequence },
    status: { $in: ['available', 'superseded', 'inactive', 'tombstoned'] },
  } as unknown as Filter<CompoundActionArtifactRevisionDocument>;

  let selectionMode: 'replay_lineage' | 'legacy_fingerprint_boundary' | null = null;
  let candidates: CompoundActionArtifactRevisionDocument[] = [];
  let matchedOrigins: ReturnType<typeof validatedReplayOrigin>[] = [];
  let restoreStoryWorkspaceRefFromOrigin: StoryWorkspaceReference | null = null;
  if (replayLineageId) {
    const originDocuments = await replayOriginCandidates(stagedInstructions, {
      userId,
      campaignId,
      instructionFingerprint,
      'originCheckpoint.replayLineageId': replayLineageId,
      'originCheckpoint.timelineSequence': { $gt: boundarySequence },
    } as unknown as Filter<CompoundActionInstructionDocument>);
    if (originDocuments.length) {
      const validatedOrigins = originDocuments.map((document) => validatedReplayOrigin(
        document, campaignId, instructionFingerprint, replayLineageId,
      ));
      const firstOriginAnchor = Math.min(...validatedOrigins.map((origin) => origin.timelineSequence));
      matchedOrigins = validatedOrigins.filter((origin) => origin.timelineSequence === firstOriginAnchor);
      const earliestRevision = Math.min(...matchedOrigins.map((origin) => origin.storyWorkspaceRef.revision));
      const earliestRefs = matchedOrigins.filter((origin) => origin.storyWorkspaceRef.revision === earliestRevision)
        .map((origin) => origin.storyWorkspaceRef);
      if (new Set(earliestRefs.map((ref) => `${ref.revision}:${ref.payloadHash}`)).size !== 1) {
        throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_AMBIGUOUS', 'The saved plan has conflicting origin checkpoints.', {});
      }
      restoreStoryWorkspaceRefFromOrigin = earliestRefs[0];
      candidates = await replayCheckpointCandidates(records, {
        ...baseFilter,
        'timelineAnchor.replayLineageId': replayLineageId,
        'timelineAnchor.sequence': firstOriginAnchor,
      } as unknown as Filter<CompoundActionArtifactRevisionDocument>);
      selectionMode = 'replay_lineage';
    }
  }
  if (!selectionMode && input.allowLegacyFingerprintBoundary === true) {
    candidates = await replayCheckpointCandidates(records, baseFilter);
    if (candidates.length) selectionMode = 'legacy_fingerprint_boundary';
  }
  if (!candidates.length || !selectionMode) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_NOT_FOUND', 'No verified original Story checkpoint was found for this saved plan.', {});
  }

  const matchedAnchorSequence = selectionMode === 'replay_lineage'
    ? matchedOrigins[0].timelineSequence
    : Math.min(...candidates.map((candidate) => Number(candidate.timelineAnchor?.sequence)));
  const anchored = candidates.filter((candidate) => Number(candidate.timelineAnchor?.sequence) === matchedAnchorSequence);
  const byProgram = new Map<string, CompoundActionArtifactRevisionDocument>();
  for (const candidate of anchored) {
    const prior = byProgram.get(candidate.programId);
    if (!prior || candidate.revision < prior.revision) byProgram.set(candidate.programId, candidate);
  }
  if (programId && !byProgram.has(programId)) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_PROGRAM_MISMATCH', 'The selected saved plan does not belong to this Replay checkpoint.', {});
  }
  const baseRevisions = selectionMode === 'replay_lineage'
    ? [restoreStoryWorkspaceRefFromOrigin?.revision]
    : [...byProgram.values()].map(replayCheckpointAuthorityBase);
  if (!baseRevisions.length) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_NOT_FOUND', 'No verified original Story checkpoint was found for this saved plan.', {});
  }
  const restoreRevision = Math.min(...baseRevisions.map(Number));
  const storyRevision = await revisionReader({ userId, campaignId, revision: restoreRevision });
  const restoreStoryWorkspaceRef = storyRevision?.storyWorkspaceRef;
  if (!restoreStoryWorkspaceRef
    || restoreStoryWorkspaceRef.contractVersion !== 'gmc.story-workspace-ref/1'
    || restoreStoryWorkspaceRef.campaignId !== campaignId
    || restoreStoryWorkspaceRef.workspaceId !== `story-workspace:${campaignId}`
    || Number(restoreStoryWorkspaceRef.revision) !== restoreRevision
    || !/^[a-f0-9]{64}$/.test(String(restoreStoryWorkspaceRef.payloadHash ?? ''))) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_STORY_REVISION_MISSING', 'The original Story checkpoint for this saved plan is unavailable.', {});
  }
  const observed = input.observedSurvivingStoryWorkspaceRef;
  const observedSurvivingRefAgreement = observed && typeof observed === 'object' && !Array.isArray(observed)
    ? Number(observed.revision) === restoreRevision
      && String(observed.payloadHash ?? '').toLowerCase() === String(restoreStoryWorkspaceRef.payloadHash).toLowerCase()
    : null;
  return {
    contractVersion: COMPOUND_REPLAY_STORY_CHECKPOINT_CONTRACT_VERSION,
    restoreStoryWorkspaceRef: structuredClone(restoreStoryWorkspaceRef),
    selectionMode,
    matchedAnchorSequence,
    matchedArtifactCount: anchored.length,
    matchedProgramCount: byProgram.size,
    matchedOriginCount: matchedOrigins.length,
    checkpointSource: selectionMode === 'replay_lineage' ? 'instruction_stage' : 'artifact_legacy',
    observedSurvivingRefAgreement,
  };
}

function validateReplayRootInstruction(
  document: CompoundActionInstructionDocument,
  campaignId: string,
  instructionFingerprint: string,
  replayLineageId: string,
) {
  if (document.campaignId !== campaignId
    || document.interactionId !== replayLineageId
    || document.instructionFingerprint !== instructionFingerprint
    || document.instruction?.interactionId !== replayLineageId
    || document.instruction?.instructionFingerprint !== instructionFingerprint) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_LINEAGE_ROOT_INVALID', 'The saved plan lineage root is inconsistent.', {});
  }
  validateInstruction(document.instruction);
}

function replayProgramMembership(
  candidates: CompoundActionArtifactRevisionDocument[],
  programId: string | null,
) {
  const byProgram = new Map<string, CompoundActionArtifactRevisionDocument>();
  for (const candidate of candidates) {
    const prior = byProgram.get(candidate.programId);
    if (!prior || candidate.revision < prior.revision) byProgram.set(candidate.programId, candidate);
  }
  if (programId && !byProgram.has(programId)) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_PROGRAM_MISMATCH', 'The selected saved plan does not belong to this Replay checkpoint.', {});
  }
  return byProgram;
}

function requireObservedStoryAgreement(
  observedValue: JsonObject | null | undefined,
  selected: StoryWorkspaceReference,
  campaignId: string,
): boolean | null {
  if (observedValue == null) return null;
  let observed: StoryWorkspaceReference;
  try {
    observed = exactStoryWorkspaceRef(observedValue, campaignId, 'observedSurvivingStoryWorkspaceRef');
  } catch {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_OBSERVED_STORY_REF_INVALID', 'The surviving Story checkpoint is invalid.', {});
  }
  if (!sameExactStoryWorkspaceRef(observed, selected)) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_OBSERVED_STORY_REF_MISMATCH', 'The surviving Story checkpoint does not match the owner timeline.', {});
  }
  return true;
}

/**
 * Resolves Replay from the immutable lineage root. A descendant retry origin
 * can never replace an originless historical root; legacy Story selection is
 * made from GMC's available owner timeline rather than artifact bases.
 */
export async function resolveCompoundReplayStoryCheckpointV2(input: {
  userId: string;
  campaignId: string;
  boundarySequence: number;
  instructionFingerprint: string;
  replayLineageId: string;
  allowRootlessArtifactMembership?: boolean;
  programId?: string | null;
  observedSurvivingStoryWorkspaceRef?: JsonObject | null;
}, records: CompoundActionArtifactCollection = artifactCollection(), revisionReader: ReplayCheckpointRevisionReader = readStoryWorkspaceRevision, stagedInstructions: CompoundActionInstructionCollection = instructionCollection(), timelineCheckpointReader: ReplayTimelineCheckpointReader = readStoryWorkspaceTimelineCheckpoint): Promise<{
  contractVersion: typeof COMPOUND_REPLAY_STORY_CHECKPOINT_V2_CONTRACT_VERSION;
  restoreStoryWorkspaceRef: StoryWorkspaceReference;
  selectionMode: 'root_instruction_origin' | 'legacy_owner_timeline';
  rootEvidenceMode: 'origin_instruction' | 'legacy_instruction' | 'artifact_membership';
  lineageRootInteractionId: string;
  matchedAnchorSequence: number;
  matchedInstructionCount: number;
  matchedArtifactCount: number;
  matchedProgramCount: number;
  observedSurvivingRefAgreement: boolean | null;
}> {
  const userId = requiredString(input.userId, 'userId', 254);
  const campaignId = requiredString(input.campaignId, 'campaignId');
  const boundarySequence = requiredRevision(input.boundarySequence, 'boundarySequence');
  const instructionFingerprint = replayCheckpointFingerprint(input.instructionFingerprint);
  const replayLineageId = requiredString(input.replayLineageId, 'replayLineageId');
  const programId = input.programId == null ? null : requiredString(input.programId, 'programId');
  const rootDocuments = await replayOriginCandidates(stagedInstructions, {
    userId,
    campaignId,
    interactionId: replayLineageId,
    instructionFingerprint,
  } as Filter<CompoundActionInstructionDocument>);
  if (rootDocuments.length > 1) {
    throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_LINEAGE_ROOT_AMBIGUOUS', 'The saved plan has conflicting lineage roots.', {});
  }
  const root = rootDocuments[0] ?? null;
  if (root) validateReplayRootInstruction(root, campaignId, instructionFingerprint, replayLineageId);

  const artifactBaseFilter = {
    userId,
    campaignId,
    'instruction.instructionFingerprint': instructionFingerprint,
    'timelineAnchor.sequence': { $gt: boundarySequence },
    status: { $in: ['available', 'superseded', 'inactive', 'tombstoned'] },
  } as unknown as Filter<CompoundActionArtifactRevisionDocument>;
  let artifacts: CompoundActionArtifactRevisionDocument[] = [];
  let byProgram = new Map<string, CompoundActionArtifactRevisionDocument>();
  let restoreStoryWorkspaceRef: StoryWorkspaceReference;
  let selectionMode: 'root_instruction_origin' | 'legacy_owner_timeline';
  let rootEvidenceMode: 'origin_instruction' | 'legacy_instruction' | 'artifact_membership';
  let matchedAnchorSequence: number;

  if (root?.originCheckpoint) {
    const origin = validatedReplayOrigin(root, campaignId, instructionFingerprint, replayLineageId);
    if (origin.timelineSequence <= boundarySequence) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_LINEAGE_ROOT_INVALID', 'The saved plan root checkpoint is outside its Replay boundary.', {});
    }
    if (programId) {
      artifacts = await replayCheckpointCandidates(records, {
        ...artifactBaseFilter,
        'timelineAnchor.replayLineageId': replayLineageId,
      } as unknown as Filter<CompoundActionArtifactRevisionDocument>);
      byProgram = replayProgramMembership(artifacts, programId);
    }
    const revision = await revisionReader({ userId, campaignId, revision: origin.storyWorkspaceRef.revision });
    if (!revision?.storyWorkspaceRef || !sameExactStoryWorkspaceRef(revision.storyWorkspaceRef, origin.storyWorkspaceRef)) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_STORY_REVISION_MISSING', 'The original Story checkpoint for this saved plan is unavailable.', {});
    }
    restoreStoryWorkspaceRef = structuredClone(origin.storyWorkspaceRef);
    selectionMode = 'root_instruction_origin';
    rootEvidenceMode = 'origin_instruction';
    matchedAnchorSequence = origin.timelineSequence;
  } else {
    if (root) {
      rootEvidenceMode = 'legacy_instruction';
      if (programId) {
        artifacts = await replayCheckpointCandidates(records, artifactBaseFilter);
        byProgram = replayProgramMembership(artifacts, programId);
      }
    } else {
      if (input.allowRootlessArtifactMembership !== true) {
        throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_NOT_FOUND', 'No verified lineage root was found for this saved plan.', {});
      }
      const candidates = await replayCheckpointCandidates(records, artifactBaseFilter);
      if (!candidates.length) {
        throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_NOT_FOUND', 'No verified lineage root was found for this saved plan.', {});
      }
      const firstArtifactAnchor = Math.min(...candidates.map((candidate) => Number(candidate.timelineAnchor?.sequence)));
      artifacts = candidates.filter((candidate) => Number(candidate.timelineAnchor?.sequence) === firstArtifactAnchor);
      byProgram = replayProgramMembership(artifacts, programId);
      rootEvidenceMode = 'artifact_membership';
    }
    const ownerCheckpoint = await timelineCheckpointReader({ userId, campaignId, boundarySequence });
    if (!ownerCheckpoint?.storyWorkspaceRef
      || ownerCheckpoint.timelineAnchor.sequence > boundarySequence) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_STORY_REVISION_MISSING', 'The Story checkpoint before this saved plan is unavailable.', {});
    }
    const verifiedRevision = await revisionReader({
      userId, campaignId, revision: ownerCheckpoint.storyWorkspaceRef.revision,
    });
    if (!verifiedRevision?.storyWorkspaceRef
      || !sameExactStoryWorkspaceRef(verifiedRevision.storyWorkspaceRef, ownerCheckpoint.storyWorkspaceRef)) {
      throw new StoryWorkspaceStoreError(409, 'COMPOUND_REPLAY_CHECKPOINT_STORY_REVISION_MISSING', 'The Story checkpoint before this saved plan is unavailable.', {});
    }
    restoreStoryWorkspaceRef = structuredClone(ownerCheckpoint.storyWorkspaceRef);
    selectionMode = 'legacy_owner_timeline';
    matchedAnchorSequence = ownerCheckpoint.timelineAnchor.sequence;
  }

  const observedSurvivingRefAgreement = requireObservedStoryAgreement(
    input.observedSurvivingStoryWorkspaceRef,
    restoreStoryWorkspaceRef,
    campaignId,
  );
  return {
    contractVersion: COMPOUND_REPLAY_STORY_CHECKPOINT_V2_CONTRACT_VERSION,
    restoreStoryWorkspaceRef,
    selectionMode,
    rootEvidenceMode,
    lineageRootInteractionId: replayLineageId,
    matchedAnchorSequence,
    matchedInstructionCount: rootDocuments.length,
    matchedArtifactCount: artifacts.length,
    matchedProgramCount: byProgram.size,
    observedSurvivingRefAgreement,
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
