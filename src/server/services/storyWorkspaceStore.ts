import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';

export const STORY_WORKSPACE_CONTRACT_VERSION = 'gmc.story-workspace/1';
export const STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION = 'gmc.story-workspace-ref/1';
export const STORY_DELTA_CONTRACT_VERSION = 'studio.story-delta/1';
export const STORY_DELTA_RECEIPT_CONTRACT_VERSION = 'gmc.story-delta-receipt/1';
export const STORY_PUBLIC_PROJECTION_CONTRACT_VERSION = 'gmc.story-public-projection/1';
export const PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION = 'gmc.playable-story-projection/1';
export const STORY_WORKSPACE_MAX_BYTES = 131_072;
export const STORY_DELTA_MAX_BYTES = 8_192;
export const STORY_SCENE_KIT_MAX_BYTES = 65_536;
export const STORY_PROMPT_PROJECTION_MAX_BYTES = 12_288;

export const STORY_PLANNING_STATES = Object.freeze([
  'idea', 'draft', 'prepared', 'active', 'resolved', 'dormant', 'retired',
] as const);
export const STORY_TRUTH_STATES = Object.freeze([
  'possibility', 'gm_preparation', 'private_canon', 'revealed_canon',
] as const);
export const STORY_DELTA_CLASSIFICATIONS = Object.freeze([
  'no_replan', 'scene_patch', 'scene_replace', 'frontier_refresh',
  'portfolio_review', 'full_rebuild',
] as const);

type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
type StoryRecordType = 'workspace' | 'arc' | 'frontier' | 'scene_kit'
  | 'npc_scene_card' | 'npc_readiness' | 'preparation_requirement';

export interface StoryWorkspaceReference {
  contractVersion: typeof STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION;
  campaignId: string;
  workspaceId: string;
  revision: number;
  payloadHash: string;
}

export interface StoryWorkspaceRevisionDocument {
  userId: string;
  campaignId: string;
  workspaceId: string;
  revision: number;
  payloadHash: string;
  requestHash: string;
  status: 'available' | 'superseded';
  workspace: JsonObject;
  source: 'studio_manual' | 'story_delta' | 'migration' | 'gmc';
  deltaId: string | null;
  idempotencyKey: string;
  timelineAnchor: { messageId: string; sequence: number } | null;
  createdAt: Date;
  supersededAt?: Date;
  supersededByRewindId?: string;
  redactedAudit: {
    workspaceBytes: number;
    arcCount: number;
    frontierCount: number;
    sceneKitCount: number;
    npcSceneCardCount: number;
    npcReadinessCount: number;
    preparationRequirementCount: number;
    sourceRevisionKeys: string[];
    changedRecordRefs: string[];
  };
}

export interface StoryChange {
  op: 'set' | 'remove';
  path: string;
  value?: JsonValue;
}

export interface StoryRecordPatch {
  recordType: StoryRecordType;
  recordId: string;
  expectedRevision: number;
  changes: StoryChange[];
}

export interface StoryDelta {
  schemaVersion: typeof STORY_DELTA_CONTRACT_VERSION;
  deltaId: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
  campaignId: string;
  initiatedBy: string;
  sourceSystem: 'studio' | 'gma';
  targetAuthority: 'gmc';
  visibility: 'gm_only';
  classification: typeof STORY_DELTA_CLASSIFICATIONS[number];
  expectedWorkspaceRevision: number;
  reason: string;
  sourceRevisions: Record<string, string | number>;
  sourceReceiptRefs: string[];
  affectedRecords: StoryRecordPatch[];
  timelineSequence?: number;
  timelineMessageId?: string;
}

export class StoryWorkspaceStoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'StoryWorkspaceStoreError';
  }
}

type RevisionCollection = Collection<StoryWorkspaceRevisionDocument>;

const recordDescriptors: Record<Exclude<StoryRecordType, 'workspace'>, {
  path: string[];
  idField: string;
}> = {
  arc: { path: ['portfolio', 'arcs'], idField: 'arcId' },
  frontier: { path: ['frontier', 'candidates'], idField: 'candidateId' },
  scene_kit: { path: ['sceneKits'], idField: 'sceneKitId' },
  npc_scene_card: { path: ['npcSceneCards'], idField: 'cardId' },
  npc_readiness: { path: ['npcReadiness'], idField: 'readinessId' },
  preparation_requirement: { path: ['preparationLedger', 'requirements'], idField: 'requirementId' },
};

function collection(): RevisionCollection {
  return getDb().collection<StoryWorkspaceRevisionDocument>('gmc_story_workspace_revisions');
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function text(value: unknown, field: string, max = 240): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > max || /[\x00-\x1F\x7F]/.test(result)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} is invalid.`, { field });
  }
  return result;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} is not a stable identifier.`, { field });
  }
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} must be a non-negative integer.`, { field });
  }
  return Number(value);
}

function validateJson(value: unknown, field: string, depth = 0, counters = { keys: 0 }): asserts value is JsonValue {
  if (depth > 14) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} exceeds the maximum nesting depth.`, { field });
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 250) {
      throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} contains an oversized array.`, { field });
    }
    for (const item of value) validateJson(item, field, depth + 1, counters);
    return;
  }
  if (!plainObject(value)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} must contain JSON values only.`, { field });
  }
  for (const [key, item] of Object.entries(value)) {
    counters.keys += 1;
    if (!key || key.length > 120 || counters.keys > 4_000 || ['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} contains too many or invalid keys.`, { field });
    }
    validateJson(item, field, depth + 1, counters);
  }
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function clone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function byteLength(value: JsonValue): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function stringArray(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} must be a bounded array.`, { field });
  }
  return [...new Set(value.map((entry, index) => text(entry, `${field}[${index}]`)))];
}

function sourceRevisions(value: unknown): Record<string, string | number> {
  if (!plainObject(value) || Object.keys(value).length > 20) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', 'sourceRevisions must be a bounded object.', { field: 'sourceRevisions' });
  }
  const result: Record<string, string | number> = {};
  for (const [key, revision] of Object.entries(value)) {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(key)
      || !(typeof revision === 'string' && revision.trim() || typeof revision === 'number' && Number.isFinite(revision) && revision >= 0)) {
      throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', 'sourceRevisions contains an invalid entry.', { field: `sourceRevisions.${key}` });
    }
    result[key] = typeof revision === 'string' ? revision.trim() : revision;
  }
  return result;
}

function storyState(record: Record<string, unknown>, field: string) {
  if (!(STORY_PLANNING_STATES as readonly string[]).includes(String(record.planningState))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_STATE_INVALID', `${field}.planningState is invalid.`, { field: `${field}.planningState` });
  }
  if (!(STORY_TRUTH_STATES as readonly string[]).includes(String(record.truthState))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_STATE_INVALID', `${field}.truthState is invalid.`, { field: `${field}.truthState` });
  }
}

function recordArray(workspace: Record<string, unknown>, descriptor: { path: string[] }): Record<string, unknown>[] {
  let value: unknown = workspace;
  for (const segment of descriptor.path) value = plainObject(value) ? value[segment] : undefined;
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function recordRevision(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function normalizeRecordCollection(
  proposed: Record<string, unknown>[],
  previous: Record<string, unknown>[],
  idField: string,
  field: string,
): JsonObject[] {
  const prior = new Map(previous.map((record) => [String(record[idField]), record]));
  const seen = new Set<string>();
  return proposed.map((source, index) => {
    if (!plainObject(source)) throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field}[${index}] must be an object.`, { field });
    const id = identifier(source[idField], `${field}[${index}].${idField}`);
    if (seen.has(id)) throw new StoryWorkspaceStoreError(409, 'STORY_RECORD_DUPLICATE', `${field} contains a duplicate record.`, { recordId: id });
    seen.add(id);
    const next = clone(source as JsonObject);
    delete next.recordRevision;
    const current = prior.get(id);
    const currentComparable = current ? clone(current as JsonObject) : null;
    if (currentComparable) delete currentComparable.recordRevision;
    next.recordRevision = current
      ? (canonicalJson(next) === canonicalJson(currentComparable as JsonObject) ? recordRevision(current.recordRevision) : recordRevision(current.recordRevision) + 1)
      : 1;
    return next;
  });
}

function setAtPath(target: Record<string, JsonValue>, path: string[], value: JsonValue) {
  let cursor: Record<string, JsonValue> = target;
  for (const segment of path.slice(0, -1)) {
    const current = cursor[segment];
    if (!plainObject(current)) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, JsonValue>;
  }
  cursor[path[path.length - 1]] = value;
}

function normalizeWorkspace(
  input: unknown,
  campaignId: string,
  revision: number,
  previous: JsonObject | null,
): { workspace: JsonObject; serialized: string; bytes: number; payloadHash: string } {
  if (!plainObject(input)) throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', 'workspace must be an object.', { field: 'workspace' });
  validateJson(input, 'workspace');
  if (input.schemaVersion !== STORY_WORKSPACE_CONTRACT_VERSION) {
    throw new StoryWorkspaceStoreError(422, 'STORY_SCHEMA_UNSUPPORTED', 'The Story workspace schema version is not supported.', {
      supportedSchemaVersions: [STORY_WORKSPACE_CONTRACT_VERSION],
    });
  }
  const workspaceId = `story-workspace:${campaignId}`;
  if (input.workspaceId !== workspaceId || input.campaignId !== campaignId) {
    throw new StoryWorkspaceStoreError(422, 'STORY_WORKSPACE_IDENTITY_MISMATCH', 'The Story workspace does not match its campaign envelope.', {});
  }
  const portfolio = plainObject(input.portfolio) ? input.portfolio : {};
  const frontier = plainObject(input.frontier) ? input.frontier : {};
  const ledger = plainObject(input.preparationLedger) ? input.preparationLedger : {};
  const priorWorkspace = previous ?? {};
  const next: Record<string, JsonValue> = {
    ...clone(input as JsonObject),
    schemaVersion: STORY_WORKSPACE_CONTRACT_VERSION,
    workspaceId,
    campaignId,
    revision,
    sourceRevisions: sourceRevisions(input.sourceRevisions ?? {}),
    portfolio: { ...clone(portfolio as JsonObject), arcs: [] },
    frontier: { ...clone(frontier as JsonObject), candidates: [] },
    preparationLedger: {
      ...clone(ledger as JsonObject),
      requirements: [],
      invalidations: Array.isArray(ledger.invalidations) ? clone(ledger.invalidations as JsonValue[]) : [],
    },
    sceneKits: [],
    npcSceneCards: [],
    npcReadiness: [],
  };
  const proposedCollections: Array<[Exclude<StoryRecordType, 'workspace'>, unknown]> = [
    ['arc', portfolio.arcs ?? []],
    ['frontier', frontier.candidates ?? []],
    ['scene_kit', input.sceneKits ?? []],
    ['npc_scene_card', input.npcSceneCards ?? []],
    ['npc_readiness', input.npcReadiness ?? []],
    ['preparation_requirement', ledger.requirements ?? []],
  ];
  for (const [recordType, proposedValue] of proposedCollections) {
    if (!Array.isArray(proposedValue)) throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${recordType} records must be an array.`, { recordType });
    const descriptor = recordDescriptors[recordType];
    const previousRecords = recordArray(priorWorkspace, descriptor);
    const normalized = normalizeRecordCollection(proposedValue as Record<string, unknown>[], previousRecords, descriptor.idField, descriptor.path.join('.'));
    setAtPath(next, descriptor.path, normalized);
  }
  validateNormalizedWorkspace(next);
  refreshActiveSceneKitReference(next, campaignId);
  const serialized = canonicalJson(next);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > STORY_WORKSPACE_MAX_BYTES) {
    throw new StoryWorkspaceStoreError(413, 'STORY_WORKSPACE_TOO_LARGE', 'The Story workspace exceeds its storage bound.', {
      maximumBytes: STORY_WORKSPACE_MAX_BYTES, suppliedBytes: bytes,
    });
  }
  const promptProjection = buildPlayableStoryProjection(next);
  if (byteLength(promptProjection) > STORY_PROMPT_PROJECTION_MAX_BYTES) {
    throw new StoryWorkspaceStoreError(413, 'STORY_PROMPT_PROJECTION_TOO_LARGE', 'The active Story projection exceeds its prompt bound.', {
      maximumBytes: STORY_PROMPT_PROJECTION_MAX_BYTES,
    });
  }
  return { workspace: next, serialized, bytes, payloadHash: sha256(serialized) };
}

function validateNormalizedWorkspace(workspace: Record<string, JsonValue>) {
  const portfolio = workspace.portfolio as Record<string, unknown>;
  const arcs = Array.isArray(portfolio.arcs) ? portfolio.arcs as Record<string, unknown>[] : [];
  const liveArcs = arcs.filter((arc) => ['idea', 'draft', 'prepared', 'active'].includes(String(arc.planningState)));
  const retainedArcSummaries = arcs.filter((arc) => ['resolved', 'dormant', 'retired'].includes(String(arc.planningState)));
  if (liveArcs.length > 6 || retainedArcSummaries.length > 8) {
    throw new StoryWorkspaceStoreError(422, 'STORY_PORTFOLIO_BOUND_EXCEEDED', 'The Story portfolio exceeds its active or retained arc bound.', {
      liveArcMaximum: 6, retainedArcMaximum: 8,
    });
  }
  arcs.forEach((arc, index) => {
    storyState(arc, `portfolio.arcs[${index}]`);
    identifier(arc.arcId, `portfolio.arcs[${index}].arcId`);
    text(arc.title, `portfolio.arcs[${index}].title`, 300);
    text(arc.dramaticQuestion, `portfolio.arcs[${index}].dramaticQuestion`, 1_000);
  });

  const frontier = workspace.frontier as Record<string, unknown>;
  const candidates = Array.isArray(frontier.candidates) ? frontier.candidates as Record<string, unknown>[] : [];
  if (candidates.length > 5 || candidates.filter((candidate) => candidate.preparationHorizon === 'ready_soon').length > 3
    || candidates.filter((candidate) => candidate.preparationHorizon === 'ready_now').length > 1) {
    throw new StoryWorkspaceStoreError(422, 'STORY_FRONTIER_BOUND_EXCEEDED', 'The Story frontier exceeds its preparation-horizon bound.', {
      candidateMaximum: 5, readySoonMaximum: 3, readyNowMaximum: 1,
    });
  }
  candidates.forEach((candidate, index) => {
    storyState(candidate, `frontier.candidates[${index}]`);
    identifier(candidate.candidateId, `frontier.candidates[${index}].candidateId`);
    if (!['seeded', 'ready_later', 'ready_soon', 'ready_now'].includes(String(candidate.preparationHorizon))) {
      throw new StoryWorkspaceStoreError(422, 'STORY_PREPARATION_HORIZON_INVALID', 'A frontier candidate has an invalid preparation horizon.', {
        field: `frontier.candidates[${index}].preparationHorizon`,
      });
    }
  });

  const ledger = workspace.preparationLedger as Record<string, unknown>;
  const requirements = Array.isArray(ledger.requirements) ? ledger.requirements as Record<string, unknown>[] : [];
  const invalidations = Array.isArray(ledger.invalidations) ? ledger.invalidations : [];
  if (requirements.filter((requirement) => !['complete', 'cancelled', 'invalidated'].includes(String(requirement.status))).length > 64
    || invalidations.length > 32) {
    throw new StoryWorkspaceStoreError(422, 'STORY_PREPARATION_LEDGER_BOUND_EXCEEDED', 'The preparation ledger exceeds its open requirement or invalidation bound.', {
      openRequirementMaximum: 64, invalidationMaximum: 32,
    });
  }
  requirements.forEach((requirement, index) => {
    storyState(requirement, `preparationLedger.requirements[${index}]`);
    identifier(requirement.requirementId, `preparationLedger.requirements[${index}].requirementId`);
  });

  const collectionBounds: Array<[Exclude<StoryRecordType, 'workspace' | 'arc' | 'frontier' | 'preparation_requirement'>, number]> = [
    ['scene_kit', 32], ['npc_scene_card', 64], ['npc_readiness', 64],
  ];
  for (const [recordType, maximum] of collectionBounds) {
    const descriptor = recordDescriptors[recordType];
    const records = recordArray(workspace, descriptor);
    if (records.length > maximum) {
      throw new StoryWorkspaceStoreError(422, 'STORY_RECORD_BOUND_EXCEEDED', `${recordType} exceeds its record bound.`, { recordType, maximum });
    }
    records.forEach((record, index) => {
      storyState(record, `${descriptor.path.join('.')}[${index}]`);
      identifier(record[descriptor.idField], `${descriptor.path.join('.')}[${index}].${descriptor.idField}`);
      if (recordType === 'scene_kit' && byteLength(record as JsonObject) > STORY_SCENE_KIT_MAX_BYTES) {
        throw new StoryWorkspaceStoreError(413, 'STORY_SCENE_KIT_TOO_LARGE', 'A scene kit exceeds its storage bound.', {
          sceneKitId: record.sceneKitId, maximumBytes: STORY_SCENE_KIT_MAX_BYTES,
        });
      }
      if (recordType === 'npc_readiness') validateNpcReadinessRecord(record, index);
    });
  }
  validateSceneKitReadiness(workspace);
}

function validateNpcReadinessRecord(record: Record<string, unknown>, index: number) {
  const field = `npcReadiness[${index}]`;
  if (!['individual', 'anonymous_extra', 'collective'].includes(String(record.identityKind))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_READINESS_INVALID', 'NPC readiness has an invalid identity kind.', { field: `${field}.identityKind` });
  }
  if (!['role_seed', 'canonical_private', 'canonical_player_known'].includes(String(record.identityMaturity))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_READINESS_INVALID', 'NPC readiness has an invalid identity maturity.', { field: `${field}.identityMaturity` });
  }
  if (!['not_known', 'eligible', 'introduced', 'known'].includes(String(record.revealState))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_READINESS_INVALID', 'NPC readiness has an invalid reveal state.', { field: `${field}.revealState` });
  }
  if (!['surface', 'developed', 'major'].includes(String(record.narrativeDepth))
    || !['none', 'template', 'combat_ready', 'full'].includes(String(record.mechanicalDepth))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_READINESS_INVALID', 'NPC readiness has an invalid preparation depth.', { field });
  }
  text(record.publicLabel, `${field}.publicLabel`, 200);
  if (record.identityKind === 'individual' && record.readiness === 'ready' && record.identityMaturity === 'role_seed') {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_IDENTITY_DEBT_UNRESOLVED', 'An individual role seed cannot be marked ready to speak.', {
      readinessId: record.readinessId,
    });
  }
  if (record.identityMaturity === 'canonical_private' && !String(record.privateCanonicalNameRef ?? '').trim()) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NPC_READINESS_INVALID', 'A private canonical identity requires an opaque private-name reference.', {
      readinessId: record.readinessId,
    });
  }
}

function validateSceneKitReadiness(workspace: Record<string, JsonValue>) {
  const readinessRecords = recordArray(workspace, recordDescriptors.npc_readiness);
  const readinessById = new Map(readinessRecords.map((record) => [String(record.readinessId), record]));
  const requirements = recordArray(workspace, recordDescriptors.preparation_requirement);
  for (const kit of recordArray(workspace, recordDescriptors.scene_kit)) {
    const runnable = ['prepared', 'active'].includes(String(kit.planningState));
    const participants = plainObject(kit.participants) ? kit.participants : {};
    const rows = [
      ...(Array.isArray(participants.present) ? participants.present : []),
      ...(Array.isArray(participants.anticipated) ? participants.anticipated : []),
    ] as Record<string, unknown>[];
    for (const participant of rows) {
      const explicitKind = String(participant.identityKind ?? 'individual');
      if (['anonymous_extra', 'collective'].includes(explicitKind)) continue;
      const readinessRef = String(participant.readinessRef ?? '');
      const readiness = readinessById.get(readinessRef);
      if (runnable && (!readiness || readiness.readiness !== 'ready')) {
        throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_READINESS_BLOCKED', 'A runnable scene kit has an individual participant with unresolved readiness.', {
          sceneKitId: kit.sceneKitId,
          participantRef: participant.entityId ?? participant.npcRef ?? null,
          readinessRef: readinessRef || null,
        });
      }
      if (!runnable && !readiness && readinessRef
        && !requirements.some((requirement) => requirement.targetRef === participant.entityId && requirement.status === 'required')) {
        throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_READINESS_DEBT_MISSING', 'A draft scene participant has neither readiness nor recorded preparation debt.', {
          sceneKitId: kit.sceneKitId, readinessRef,
        });
      }
    }
    if (!runnable) continue;
    const information = Array.isArray(kit.information) ? kit.information as Record<string, unknown>[] : [];
    for (const item of information.filter((entry) => !['revealed', 'revealed_canon'].includes(String(entry.status)))) {
      if (!Array.isArray(item.accessVectors) || !item.accessVectors.length || !String(item.revealAuthority ?? '').trim()) {
        throw new StoryWorkspaceStoreError(422, 'STORY_INFORMATION_ACCESS_UNPREPARED', 'A runnable scene has private information without an access path and reveal authority.', {
          sceneKitId: kit.sceneKitId, informationId: item.informationId ?? null,
        });
      }
    }
    if (!Array.isArray(kit.exitVectors) || !kit.exitVectors.length) {
      throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_EXIT_VECTOR_REQUIRED', 'A runnable scene kit requires at least one completion, failure, abandonment, or redirect path.', {
        sceneKitId: kit.sceneKitId,
      });
    }
  }
}

function refreshActiveSceneKitReference(workspace: Record<string, JsonValue>, campaignId: string) {
  if (workspace.activeSceneKitRef === null || workspace.activeSceneKitRef === undefined) return;
  if (!plainObject(workspace.activeSceneKitRef)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACTIVE_SCENE_KIT_INVALID', 'activeSceneKitRef must be null or a scene-kit reference.', {});
  }
  const sceneKitId = identifier(workspace.activeSceneKitRef.sceneKitId, 'activeSceneKitRef.sceneKitId');
  const kits = recordArray(workspace, recordDescriptors.scene_kit);
  const kit = kits.find((candidate) => candidate.sceneKitId === sceneKitId);
  if (!kit) throw new StoryWorkspaceStoreError(422, 'STORY_ACTIVE_SCENE_KIT_NOT_FOUND', 'The active scene-kit reference does not resolve in this workspace.', { sceneKitId });
  const sceneId = identifier(kit.sceneId, 'sceneKits.sceneId');
  workspace.activeSceneKitRef = {
    contractVersion: 'gmc.scene-kit-ref/1',
    campaignId,
    sceneKitId,
    sceneId,
    revision: recordRevision(kit.recordRevision),
    payloadHash: sha256(canonicalJson(kit as JsonObject)),
  };
}

function workspaceRef(record: StoryWorkspaceRevisionDocument): StoryWorkspaceReference {
  return {
    contractVersion: STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
    campaignId: record.campaignId,
    workspaceId: record.workspaceId,
    revision: record.revision,
    payloadHash: record.payloadHash,
  };
}

async function activeRecord(records: RevisionCollection, input: { userId: string; campaignId: string }) {
  return records.findOne({
    userId: input.userId,
    campaignId: input.campaignId,
    workspaceId: `story-workspace:${input.campaignId}`,
    status: 'available',
  }, { sort: { revision: -1 } });
}

function audit(workspace: JsonObject, bytes: number, changedRecordRefs: string[]) {
  const count = (descriptor: { path: string[] }) => recordArray(workspace, descriptor).length;
  return {
    workspaceBytes: bytes,
    arcCount: count(recordDescriptors.arc),
    frontierCount: count(recordDescriptors.frontier),
    sceneKitCount: count(recordDescriptors.scene_kit),
    npcSceneCardCount: count(recordDescriptors.npc_scene_card),
    npcReadinessCount: count(recordDescriptors.npc_readiness),
    preparationRequirementCount: count(recordDescriptors.preparation_requirement),
    sourceRevisionKeys: Object.keys(workspace.sourceRevisions as Record<string, JsonValue>).sort(),
    changedRecordRefs: [...new Set(changedRecordRefs)].sort(),
  };
}

export function emptyStoryWorkspace(campaignIdValue: string): JsonObject {
  const campaignId = identifier(campaignIdValue, 'campaignId');
  return {
    schemaVersion: STORY_WORKSPACE_CONTRACT_VERSION,
    workspaceId: `story-workspace:${campaignId}`,
    campaignId,
    revision: 0,
    sourceRevisions: {},
    portfolio: { campaignQuestion: null, arcs: [] },
    frontier: { candidates: [] },
    preparationLedger: { requirements: [], invalidations: [] },
    sceneKits: [],
    npcSceneCards: [],
    npcReadiness: [],
    activeSceneKitRef: null,
    lastStoryDeltaRef: null,
    timelineAnchor: null,
  };
}

export async function readActiveStoryWorkspace(
  input: { userId: string; campaignId: string },
  records: RevisionCollection = collection(),
) {
  const normalized = { userId: text(input.userId, 'userId', 254), campaignId: identifier(input.campaignId, 'campaignId') };
  const record = await activeRecord(records, normalized);
  if (!record) return null;
  return { contractVersion: STORY_WORKSPACE_CONTRACT_VERSION, storyWorkspaceRef: workspaceRef(record), workspace: record.workspace };
}

export async function replaceStoryWorkspace(
  input: {
    userId: string;
    campaignId: string;
    expectedRevision: number;
    idempotencyKey: string;
    source?: StoryWorkspaceRevisionDocument['source'];
    timelineAnchor?: { messageId: string; sequence: number } | null;
    workspace: JsonObject;
    deltaId?: string | null;
    changedRecordRefs?: string[];
    requestHashOverride?: string;
  },
  records: RevisionCollection = collection(),
) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = identifier(input.campaignId, 'campaignId');
  const expectedRevision = nonNegativeInteger(input.expectedRevision, 'expectedRevision');
  const idempotencyKey = identifier(input.idempotencyKey, 'idempotencyKey');
  const prior = await activeRecord(records, { userId, campaignId });
  const currentRevision = prior?.revision ?? 0;
  const requestHash = input.requestHashOverride ?? sha256(canonicalJson({
    campaignId, expectedRevision, workspace: input.workspace, source: input.source ?? 'studio_manual', deltaId: input.deltaId ?? null,
  } as JsonObject));
  const idempotent = await records.findOne({ userId, campaignId, idempotencyKey });
  if (idempotent) {
    if (idempotent.requestHash !== requestHash) {
      throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The Story idempotency key was already used for a different write.', {});
    }
    return { contractVersion: STORY_WORKSPACE_CONTRACT_VERSION, duplicate: true, storyWorkspaceRef: workspaceRef(idempotent) };
  }
  if (currentRevision !== expectedRevision) {
    throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before this write.', {
      expectedRevision, actualRevision: currentRevision,
    });
  }
  const latest = await records.findOne({ userId, campaignId, workspaceId: `story-workspace:${campaignId}` }, { sort: { revision: -1 } });
  const revision = (latest?.revision ?? 0) + 1;
  const normalized = normalizeWorkspace(input.workspace, campaignId, revision, prior?.workspace ?? null);
  const timelineAnchor = input.timelineAnchor == null ? null : {
    messageId: identifier(input.timelineAnchor.messageId, 'timelineAnchor.messageId'),
    sequence: nonNegativeInteger(input.timelineAnchor.sequence, 'timelineAnchor.sequence'),
  };
  const document: StoryWorkspaceRevisionDocument = {
    userId,
    campaignId,
    workspaceId: `story-workspace:${campaignId}`,
    revision,
    payloadHash: normalized.payloadHash,
    requestHash,
    status: 'available',
    workspace: normalized.workspace,
    source: input.source ?? 'studio_manual',
    deltaId: input.deltaId ? identifier(input.deltaId, 'deltaId') : null,
    idempotencyKey,
    timelineAnchor,
    createdAt: new Date(),
    redactedAudit: audit(normalized.workspace, normalized.bytes, input.changedRecordRefs ?? ['workspace']),
  };
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const replay = await records.findOne({ userId, campaignId, idempotencyKey });
    if (replay?.requestHash === requestHash) {
      return { contractVersion: STORY_WORKSPACE_CONTRACT_VERSION, duplicate: true, storyWorkspaceRef: workspaceRef(replay) };
    }
    throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'Another Story revision was written first.', {
      expectedRevision,
    });
  }
  return { contractVersion: STORY_WORKSPACE_CONTRACT_VERSION, duplicate: false, storyWorkspaceRef: workspaceRef(document) };
}

function pointerSegments(path: unknown, field: string): string[] {
  const value = text(path, field, 160);
  if (!value.startsWith('/')) throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_PATH_INVALID', 'A Story change path must be absolute.', { field });
  if (value === '/') return [];
  const segments = value.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (segments.some((segment) => !segment || ['__proto__', 'prototype', 'constructor'].includes(segment) || /^\d+$/.test(segment))) {
    throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_PATH_INVALID', 'A Story change path contains a forbidden segment.', { field });
  }
  return segments;
}

function applyChange(root: JsonObject, change: StoryChange, field: string): JsonObject | null {
  if (!plainObject(change) || !['set', 'remove'].includes(change.op)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A Story change has an invalid operation.', { field });
  }
  const path = pointerSegments(change.path, `${field}.path`);
  if (change.op === 'set') {
    if (!Object.prototype.hasOwnProperty.call(change, 'value')) {
      throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A set change requires a value.', { field });
    }
    validateJson(change.value, `${field}.value`);
    if (!path.length) {
      if (!plainObject(change.value)) throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A root Story record must be an object.', { field });
      return clone(change.value as JsonObject);
    }
    const result = clone(root);
    let cursor: Record<string, JsonValue> = result;
    for (const segment of path.slice(0, -1)) {
      if (!plainObject(cursor[segment])) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, JsonValue>;
    }
    cursor[path[path.length - 1]] = clone(change.value as JsonValue);
    return result;
  }
  if (Object.prototype.hasOwnProperty.call(change, 'value')) {
    throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A remove change cannot include a value.', { field });
  }
  if (!path.length) return null;
  const result = clone(root);
  let cursor: Record<string, JsonValue> = result;
  for (const segment of path.slice(0, -1)) {
    if (!plainObject(cursor[segment])) return result;
    cursor = cursor[segment] as Record<string, JsonValue>;
  }
  delete cursor[path[path.length - 1]];
  return result;
}

function validateDelta(input: unknown, campaignId: string): StoryDelta {
  if (!plainObject(input)) throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'The Story delta must be an object.', {});
  validateJson(input, 'storyDelta');
  if (byteLength(input as JsonObject) > STORY_DELTA_MAX_BYTES) {
    throw new StoryWorkspaceStoreError(413, 'STORY_DELTA_TOO_LARGE', 'The Story delta exceeds its size bound.', { maximumBytes: STORY_DELTA_MAX_BYTES });
  }
  if (input.schemaVersion !== STORY_DELTA_CONTRACT_VERSION || input.campaignId !== campaignId
    || !['studio', 'gma'].includes(String(input.sourceSystem)) || input.targetAuthority !== 'gmc' || input.visibility !== 'gm_only') {
    throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_ENVELOPE_INVALID', 'The Story delta authority envelope is invalid.', {});
  }
  const classification = String(input.classification);
  if (!(STORY_DELTA_CLASSIFICATIONS as readonly string[]).includes(classification)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_CLASSIFICATION_INVALID', 'The Story delta classification is invalid.', {});
  }
  for (const field of ['deltaId', 'operationId', 'idempotencyKey', 'correlationId', 'campaignId', 'initiatedBy']) identifier(input[field], field);
  text(input.reason, 'reason', 2_000);
  nonNegativeInteger(input.expectedWorkspaceRevision, 'expectedWorkspaceRevision');
  sourceRevisions(input.sourceRevisions);
  const receiptRefs = stringArray(input.sourceReceiptRefs, 'sourceReceiptRefs', 32).map((entry, index) => identifier(entry, `sourceReceiptRefs[${index}]`));
  if (!Array.isArray(input.affectedRecords) || input.affectedRecords.length > 16) {
    throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'affectedRecords must be a bounded array.', { field: 'affectedRecords' });
  }
  if (classification === 'no_replan' && input.affectedRecords.length) {
    throw new StoryWorkspaceStoreError(422, 'STORY_NO_REPLAN_WRITE_FORBIDDEN', 'A no-replan delta cannot write Story records.', {});
  }
  if (classification !== 'no_replan' && (!input.affectedRecords.length || !receiptRefs.length)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_GROUNDING_REQUIRED', 'A material Story delta requires record patches and authority receipts.', {});
  }
  (input.affectedRecords as unknown[]).forEach((patch, index) => {
    if (!plainObject(patch) || !['workspace', ...Object.keys(recordDescriptors)].includes(String(patch.recordType))) {
      throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A Story record patch has an invalid record type.', { index });
    }
    identifier(patch.recordId, `affectedRecords[${index}].recordId`);
    nonNegativeInteger(patch.expectedRevision, `affectedRecords[${index}].expectedRevision`);
    if (!Array.isArray(patch.changes) || !patch.changes.length || patch.changes.length > 32) {
      throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A Story record patch must contain bounded changes.', { index });
    }
    patch.changes.forEach((change, changeIndex) => {
      if (!plainObject(change)) throw new StoryWorkspaceStoreError(400, 'STORY_DELTA_INVALID', 'A Story change must be an object.', { index, changeIndex });
      pointerSegments(change.path, `affectedRecords[${index}].changes[${changeIndex}].path`);
      if (String(change.path).endsWith('/planningState') && change.op === 'set'
        && !(STORY_PLANNING_STATES as readonly unknown[]).includes(change.value)) {
        throw new StoryWorkspaceStoreError(422, 'STORY_STATE_INVALID', 'A delta supplied an invalid planning state.', {});
      }
      if (String(change.path).endsWith('/truthState') && change.op === 'set'
        && !(STORY_TRUTH_STATES as readonly unknown[]).includes(change.value)) {
        throw new StoryWorkspaceStoreError(422, 'STORY_STATE_INVALID', 'A delta supplied an invalid truth state.', {});
      }
    });
  });
  return input as unknown as StoryDelta;
}

function applyRecordPatch(workspace: JsonObject, patch: StoryRecordPatch): string {
  if (patch.recordType === 'workspace') {
    if (patch.recordId !== workspace.workspaceId) throw new StoryWorkspaceStoreError(404, 'STORY_RECORD_NOT_FOUND', 'The Story workspace patch target was not found.', {});
    if (patch.expectedRevision !== Number(workspace.revision)) throw new StoryWorkspaceStoreError(409, 'STORY_RECORD_REVISION_CONFLICT', 'The Story workspace record changed before this delta.', {
      recordType: patch.recordType, recordId: patch.recordId, expectedRevision: patch.expectedRevision, actualRevision: workspace.revision,
    });
    for (const [index, change] of patch.changes.entries()) {
      const applied = applyChange(workspace, change, `changes[${index}]`);
      if (!applied) throw new StoryWorkspaceStoreError(422, 'STORY_WORKSPACE_REMOVE_FORBIDDEN', 'A delta cannot remove the Story workspace root.', {});
      Object.keys(workspace).forEach((key) => delete workspace[key]);
      Object.assign(workspace, applied);
    }
    return `workspace:${patch.recordId}`;
  }
  const descriptor = recordDescriptors[patch.recordType];
  const records = recordArray(workspace, descriptor);
  const index = records.findIndex((record) => record[descriptor.idField] === patch.recordId);
  const current = index >= 0 ? records[index] : null;
  const actualRevision = current ? recordRevision(current.recordRevision) : 0;
  if (actualRevision !== patch.expectedRevision) {
    throw new StoryWorkspaceStoreError(409, 'STORY_RECORD_REVISION_CONFLICT', 'A named Story record changed before this delta.', {
      recordType: patch.recordType, recordId: patch.recordId, expectedRevision: patch.expectedRevision, actualRevision,
    });
  }
  let result = current ? clone(current as JsonObject) : null;
  for (const [changeIndex, change] of patch.changes.entries()) {
    if (!result && change.path !== '/') {
      throw new StoryWorkspaceStoreError(404, 'STORY_RECORD_NOT_FOUND', 'A new Story record must be supplied as a complete root value.', {
        recordType: patch.recordType, recordId: patch.recordId,
      });
    }
    result = applyChange(result ?? {}, change, `changes[${changeIndex}]`);
  }
  if (result && result[descriptor.idField] !== patch.recordId) {
    throw new StoryWorkspaceStoreError(422, 'STORY_RECORD_ID_MISMATCH', 'A Story patch cannot change its record identity.', {
      recordType: patch.recordType, recordId: patch.recordId,
    });
  }
  if (result) result.recordRevision = actualRevision + 1;
  if (index >= 0 && result) records[index] = result;
  else if (index >= 0) records.splice(index, 1);
  else if (result) records.push(result);
  setAtPath(workspace, descriptor.path, records as unknown as JsonValue);
  return `${patch.recordType}:${patch.recordId}`;
}

export async function applyStoryDelta(
  input: { userId: string; campaignId: string; delta: StoryDelta },
  records: RevisionCollection = collection(),
) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = identifier(input.campaignId, 'campaignId');
  const delta = validateDelta(input.delta, campaignId);
  const requestHash = sha256(canonicalJson(delta as unknown as JsonObject));
  const active = await activeRecord(records, { userId, campaignId });
  const actualRevision = active?.revision ?? 0;
  if (delta.classification !== 'no_replan') {
    const replay = await records.findOne({ userId, campaignId, idempotencyKey: delta.idempotencyKey });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The Story idempotency key was already used for a different write.', {});
      }
      return {
        contractVersion: STORY_DELTA_RECEIPT_CONTRACT_VERSION,
        deltaId: delta.deltaId,
        operationId: delta.operationId,
        status: 'applied',
        duplicate: true,
        authoritativeStateChanged: false,
        storyWorkspaceRef: workspaceRef(replay),
      };
    }
  }
  if (delta.expectedWorkspaceRevision !== actualRevision) {
    throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before this delta.', {
      expectedRevision: delta.expectedWorkspaceRevision, actualRevision,
    });
  }
  if (delta.classification === 'no_replan') {
    return {
      contractVersion: STORY_DELTA_RECEIPT_CONTRACT_VERSION,
      deltaId: delta.deltaId,
      operationId: delta.operationId,
      status: 'no_change',
      authoritativeStateChanged: false,
      storyWorkspaceRef: active ? workspaceRef(active) : null,
    };
  }
  const workspace = clone(active?.workspace ?? emptyStoryWorkspace(campaignId));
  const changedRecordRefs = delta.affectedRecords.map((patch) => applyRecordPatch(workspace, patch));
  workspace.lastStoryDeltaRef = delta.deltaId;
  workspace.sourceRevisions = sourceRevisions(delta.sourceRevisions) as unknown as JsonValue;
  if (delta.timelineSequence !== undefined || delta.timelineMessageId !== undefined) {
    workspace.timelineAnchor = {
      messageId: identifier(delta.timelineMessageId ?? `story-delta:${delta.deltaId}`, 'timelineMessageId'),
      sequence: nonNegativeInteger(delta.timelineSequence ?? delta.sourceRevisions.timelineSequence, 'timelineSequence'),
    };
  }
  const written = await replaceStoryWorkspace({
    userId,
    campaignId,
    expectedRevision: delta.expectedWorkspaceRevision,
    idempotencyKey: delta.idempotencyKey,
    source: 'story_delta',
    timelineAnchor: plainObject(workspace.timelineAnchor) ? workspace.timelineAnchor as { messageId: string; sequence: number } : null,
    workspace,
    deltaId: delta.deltaId,
    changedRecordRefs,
    requestHashOverride: requestHash,
  }, records);
  return {
    contractVersion: STORY_DELTA_RECEIPT_CONTRACT_VERSION,
    deltaId: delta.deltaId,
    operationId: delta.operationId,
    status: 'applied',
    duplicate: written.duplicate,
    authoritativeStateChanged: !written.duplicate,
    storyWorkspaceRef: written.storyWorkspaceRef,
  };
}

export async function listStoryWorkspaceHistory(
  input: { userId: string; campaignId: string; limit?: number },
  records: RevisionCollection = collection(),
) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = identifier(input.campaignId, 'campaignId');
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit ?? 25) || 25)));
  const rows = await records.find({ userId, campaignId, workspaceId: `story-workspace:${campaignId}` })
    .sort({ revision: -1 }).limit(limit).toArray();
  return {
    contractVersion: STORY_WORKSPACE_CONTRACT_VERSION,
    revisions: rows.map((record) => ({
      storyWorkspaceRef: workspaceRef(record),
      status: record.status,
      source: record.source,
      deltaId: record.deltaId,
      timelineAnchor: record.timelineAnchor,
      createdAt: record.createdAt,
      redactedAudit: record.redactedAudit,
    })),
  };
}

export async function rewindStoryWorkspace(
  input: { userId: string; campaignId: string; expectedRevision: number; boundarySequence: number; rewindId: string },
  records: RevisionCollection = collection(),
) {
  const normalized = {
    userId: text(input.userId, 'userId', 254),
    campaignId: identifier(input.campaignId, 'campaignId'),
    expectedRevision: nonNegativeInteger(input.expectedRevision, 'expectedRevision'),
    boundarySequence: nonNegativeInteger(input.boundarySequence, 'boundarySequence'),
    rewindId: identifier(input.rewindId, 'rewindId'),
  };
  const active = await activeRecord(records, normalized);
  const currentRevision = active?.revision ?? 0;
  if (currentRevision !== normalized.expectedRevision) {
    const replay = await records.findOne({
      userId: normalized.userId, campaignId: normalized.campaignId, supersededByRewindId: normalized.rewindId,
    });
    if (!replay) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before rewind.', {
      expectedRevision: normalized.expectedRevision, actualRevision: currentRevision,
    });
    const restoredReplay = await activeRecord(records, normalized);
    return {
      contractVersion: STORY_WORKSPACE_CONTRACT_VERSION,
      duplicate: true,
      rewindId: normalized.rewindId,
      supersededCount: 0,
      restoredStoryWorkspaceRef: restoredReplay ? workspaceRef(restoredReplay) : null,
    };
  }
  const updated = await records.updateMany({
    userId: normalized.userId,
    campaignId: normalized.campaignId,
    workspaceId: `story-workspace:${normalized.campaignId}`,
    status: 'available',
    'timelineAnchor.sequence': { $gt: normalized.boundarySequence },
  }, {
    $set: { status: 'superseded', supersededAt: new Date(), supersededByRewindId: normalized.rewindId },
  });
  const restored = await activeRecord(records, normalized);
  return {
    contractVersion: STORY_WORKSPACE_CONTRACT_VERSION,
    duplicate: false,
    rewindId: normalized.rewindId,
    supersededCount: updated.modifiedCount,
    restoredStoryWorkspaceRef: restored ? workspaceRef(restored) : null,
  };
}

function boundedText(value: unknown, max = 1_000): string | null {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
}

function selectFields(record: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, clone(record[field] as JsonValue)]));
}

/** Strict allowlist projection safe for a player-visible route. */
export function buildPublicStoryProjection(workspace: JsonObject) {
  const arcs = recordArray(workspace, recordDescriptors.arc)
    .filter((arc) => arc.truthState === 'revealed_canon')
    .map((arc) => ({ arcId: arc.arcId, title: boundedText(arc.title, 300) }));
  const activeRef = plainObject(workspace.activeSceneKitRef) ? workspace.activeSceneKitRef : null;
  const activeKit = activeRef
    ? recordArray(workspace, recordDescriptors.scene_kit).find((kit) => kit.sceneKitId === activeRef.sceneKitId)
    : null;
  const present = activeKit && plainObject(activeKit.participants) && Array.isArray(activeKit.participants.present)
    ? (activeKit.participants.present as Record<string, unknown>[]).slice(0, 30).map((participant) => ({
      publicLabel: boundedText(participant.publicLabel, 200),
    })).filter((participant) => participant.publicLabel)
    : [];
  const revealedInformation = activeKit && Array.isArray(activeKit.information)
    ? (activeKit.information as Record<string, unknown>[])
      .filter((entry) => ['revealed', 'revealed_canon'].includes(String(entry.status)))
      .slice(0, 20)
      .map((entry) => ({ informationId: entry.informationId, publicSummary: boundedText(entry.publicSummary, 1_000) }))
      .filter((entry) => entry.publicSummary)
    : [];
  return {
    schemaVersion: STORY_PUBLIC_PROJECTION_CONTRACT_VERSION,
    campaignId: workspace.campaignId,
    workspaceId: workspace.workspaceId,
    revision: workspace.revision,
    arcs,
    activeScene: activeKit ? {
      sceneId: activeKit.sceneId,
      title: boundedText(activeKit.publicTitle ?? activeKit.title, 300),
      participants: { present },
      information: revealedInformation,
    } : null,
  } as JsonObject;
}

/** Focused, transient server projection for one playable scene; never a second authority. */
export function buildPlayableStoryProjection(workspace: JsonObject, requestedSceneKitId?: string) {
  const activeRef = plainObject(workspace.activeSceneKitRef) ? workspace.activeSceneKitRef : null;
  const sceneKitId = requestedSceneKitId ?? String(activeRef?.sceneKitId ?? '');
  const kit = sceneKitId
    ? recordArray(workspace, recordDescriptors.scene_kit).find((record) => record.sceneKitId === sceneKitId)
    : null;
  if (!kit) {
    return {
      schemaVersion: PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
      workspaceRef: { workspaceId: workspace.workspaceId, revision: workspace.revision },
      sceneKit: null,
      npcSceneCards: [],
      npcReadiness: [],
      preparationRequirements: [],
    } as JsonObject;
  }
  const participants = plainObject(kit.participants) ? kit.participants : {};
  const participantRows = [
    ...(Array.isArray(participants.present) ? participants.present : []),
    ...(Array.isArray(participants.anticipated) ? participants.anticipated : []),
  ] as Record<string, unknown>[];
  const npcRefs = new Set(participantRows.map((row) => String(row.entityId ?? row.npcRef ?? '')).filter(Boolean));
  const readinessRefs = new Set(participantRows.map((row) => String(row.readinessRef ?? '')).filter(Boolean));
  const readiness = recordArray(workspace, recordDescriptors.npc_readiness).filter((record) => (
    npcRefs.has(String(record.npcRef ?? '')) || readinessRefs.has(String(record.readinessId ?? ''))
  )).slice(0, 24).map((record) => selectFields(record, [
    'readinessId', 'recordRevision', 'npcRef', 'npcRevision', 'identityKind', 'identityMaturity',
    'publicLabel', 'privateCanonicalNameRef', 'revealState', 'revealEligibility', 'narrativeDepth',
    'requiredNarrativeDepth', 'mechanicalDepth', 'sceneRole', 'readiness', 'sourceRefs',
  ]));
  const cards = recordArray(workspace, recordDescriptors.npc_scene_card).filter((record) => (
    npcRefs.has(String(record.npcRef ?? ''))
  )).slice(0, 24).map((record) => selectFields(record, [
    'cardId', 'recordRevision', 'npcRef', 'readinessRef', 'publicLabel', 'knowledge', 'disclosurePosture',
    'hardLimits', 'approachSensitivities', 'currentObjective', 'likelyAction', 'relationshipRefs',
    'commitmentRefs', 'sourceRefs',
  ]));
  const preparationIds = new Set((Array.isArray(kit.preparationLedgerRefs) ? kit.preparationLedgerRefs : []).map(String));
  const requirements = recordArray(workspace, recordDescriptors.preparation_requirement)
    .filter((record) => preparationIds.has(String(record.requirementId)))
    .slice(0, 32)
    .map((record) => selectFields(record, [
      'requirementId', 'recordRevision', 'kind', 'targetRef', 'horizon', 'status', 'requiredDepth', 'sourceRefs',
    ]));
  const projectedParticipants = {
    present: (Array.isArray(participants.present) ? participants.present : []).slice(0, 30).map((row) => (
      selectFields(plainObject(row) ? row : {}, ['entityId', 'npcRef', 'publicLabel', 'reason', 'readinessRef', 'identityKind'])
    )),
    anticipated: (Array.isArray(participants.anticipated) ? participants.anticipated : []).slice(0, 30).map((row) => (
      selectFields(plainObject(row) ? row : {}, [
        'entityId', 'npcRef', 'publicLabel', 'reason', 'readinessRef', 'identityKind', 'state', 'status', 'arrivalWindow',
      ])
    )),
  };
  const sceneKit = selectFields(kit, [
    'sceneKitId', 'recordRevision', 'sceneId', 'planningState', 'truthState', 'title', 'purpose',
    'dramaticQuestion', 'locationRef', 'participants', 'activity', 'information', 'exitVectors',
    'preparationLedgerRefs', 'arcRefs', 'frontierCandidateId', 'sourceRefs',
  ]);
  sceneKit.participants = projectedParticipants;
  return {
    schemaVersion: PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
    workspaceRef: { workspaceId: workspace.workspaceId, revision: workspace.revision },
    sceneKit,
    npcSceneCards: cards,
    npcReadiness: readiness,
    preparationRequirements: requirements,
  } as JsonObject;
}

export async function readStoryProjection(
  input: { userId: string; campaignId: string; mode: 'public' | 'playable'; sceneKitId?: string },
  records: RevisionCollection = collection(),
) {
  const active = await activeRecord(records, {
    userId: text(input.userId, 'userId', 254), campaignId: identifier(input.campaignId, 'campaignId'),
  });
  if (!active) return null;
  const projection = input.mode === 'public'
    ? buildPublicStoryProjection(active.workspace)
    : buildPlayableStoryProjection(active.workspace, input.sceneKitId);
  const bytes = byteLength(projection);
  if (input.mode === 'playable' && bytes > STORY_PROMPT_PROJECTION_MAX_BYTES) {
    throw new StoryWorkspaceStoreError(413, 'STORY_PROMPT_PROJECTION_TOO_LARGE', 'The selected Story projection exceeds its prompt bound.', {
      maximumBytes: STORY_PROMPT_PROJECTION_MAX_BYTES, suppliedBytes: bytes,
    });
  }
  return { storyWorkspaceRef: workspaceRef(active), projection, projectionBytes: bytes };
}

function legacyParticipant(value: unknown, index: number, state: 'present' | 'anticipated') {
  const source = plainObject(value) ? value : {};
  const publicLabel = boundedText(source.publicLabel ?? source.displayLabel ?? source.name, 200) ?? `${state === 'present' ? 'Present' : 'Expected'} participant ${index + 1}`;
  const entityId = String(source.entityId ?? source.npcId ?? source.id ?? `legacy:${state}:${index + 1}`).trim();
  return {
    entityId,
    publicLabel,
    reason: boundedText(source.reason ?? source.whyPresent, 500),
    ...(state === 'anticipated' ? {
      state: String(source.state ?? 'expected'),
      status: String(source.status ?? 'pending'),
      ...(source.arrivalWindow !== undefined ? { arrivalWindow: clone(source.arrivalWindow as JsonValue) } : {}),
    } : {}),
    legacySource: 'gma.scene-plan/2',
  } as JsonObject;
}

/**
 * Deterministic, one-way migration compiler. It preserves useful preparation
 * and provenance but never treats legacy GMA state as canon.
 */
export function compileLegacyScenePlanImport(input: {
  campaignId: string;
  currentWorkspace?: JsonObject | null;
  scenePlanRef: { scenePlanId: string; sceneId: string; revision: number; payloadHash: string };
  privatePayload: JsonObject;
}) {
  const campaignId = identifier(input.campaignId, 'campaignId');
  const payload = input.privatePayload;
  if (!plainObject(payload) || payload.schemaVersion !== 'gma.scene-plan/2'
    || String(payload.sceneId) !== input.scenePlanRef.sceneId) {
    throw new StoryWorkspaceStoreError(422, 'STORY_LEGACY_SCENE_PLAN_INVALID', 'The legacy scene plan does not match its migration reference.', {});
  }
  const workspace = clone(input.currentWorkspace ?? emptyStoryWorkspace(campaignId));
  const scenePlanId = identifier(input.scenePlanRef.scenePlanId, 'scenePlanRef.scenePlanId');
  const sceneId = identifier(input.scenePlanRef.sceneId, 'scenePlanRef.sceneId');
  const sceneKitId = `scene-kit:legacy:${scenePlanId}`;
  const participants = plainObject(payload.participants) ? payload.participants : {};
  const present = (Array.isArray(participants.present) ? participants.present : [])
    .slice(0, 30).map((entry, index) => legacyParticipant(entry, index, 'present'));
  const anticipated = (Array.isArray(participants.anticipated) ? participants.anticipated : [])
    .slice(0, 30).map((entry, index) => legacyParticipant(entry, index, 'anticipated'));
  const preparedElements = Array.isArray(payload.preparedElements) ? payload.preparedElements.slice(0, 32) : [];
  const knownDetails = Array.isArray(payload.knownDetails) ? payload.knownDetails.slice(0, 32) : [];
  const doneWhen = Array.isArray(payload.doneWhen) ? payload.doneWhen.slice(0, 16) : [];
  const sceneKit: JsonObject = {
    sceneKitId,
    sceneId,
    planningState: 'draft',
    truthState: 'gm_preparation',
    title: boundedText(payload.title, 300) ?? 'Imported scene preparation',
    purpose: boundedText(payload.objective, 1_000),
    dramaticQuestion: boundedText(payload.dramaticQuestion ?? payload.objective, 1_000) ?? 'What will the players do here?',
    locationRef: payload.locationRef !== undefined ? clone(payload.locationRef as JsonValue) : boundedText(payload.where, 300),
    participants: { present, anticipated },
    activity: preparedElements.map((entry) => clone(entry as JsonValue)),
    information: knownDetails.map((entry, index) => ({
      informationId: `legacy-info:${scenePlanId}:${index + 1}`,
      status: 'prepared_gm_material',
      detail: clone(entry as JsonValue),
      revealAuthority: 'current-interaction validation required',
    })),
    exitVectors: doneWhen.map((condition) => ({
      kind: 'completion', condition: String(condition).slice(0, 1_000),
      consequence: 'Refresh the GMC Story frontier from committed play receipts.',
    })),
    preparationLedgerRefs: anticipated.map((_entry, index) => `prep:legacy:${scenePlanId}:anticipated:${index + 1}`),
    sourceRefs: [`gma-scene-plan:${scenePlanId}:r${input.scenePlanRef.revision}`],
    migrationProvenance: {
      sourceSchemaVersion: 'gma.scene-plan/2',
      scenePlanId,
      sourceRevision: input.scenePlanRef.revision,
      sourcePayloadHash: input.scenePlanRef.payloadHash,
      authority: 'migration_evidence_only',
    },
  };
  const kits = Array.isArray(workspace.sceneKits) ? workspace.sceneKits as JsonObject[] : [];
  const existingKitIndex = kits.findIndex((kit) => kit.sceneKitId === sceneKitId);
  if (existingKitIndex >= 0) kits[existingKitIndex] = sceneKit;
  else kits.push(sceneKit);
  workspace.sceneKits = kits;

  const ledger = plainObject(workspace.preparationLedger) ? workspace.preparationLedger as JsonObject : { requirements: [], invalidations: [] };
  const requirements = Array.isArray(ledger.requirements) ? ledger.requirements as JsonObject[] : [];
  for (const [index, participant] of anticipated.entries()) {
    const requirementId = `prep:legacy:${scenePlanId}:anticipated:${index + 1}`;
    if (requirements.some((requirement) => requirement.requirementId === requirementId)) continue;
    requirements.push({
      requirementId,
      planningState: 'draft',
      truthState: 'gm_preparation',
      kind: 'npc_readiness_review',
      targetRef: String(participant.entityId),
      horizon: 'ready_soon',
      status: 'required',
      requiredDepth: 'surface',
      sourceRefs: [`gma-scene-plan:${scenePlanId}:r${input.scenePlanRef.revision}`],
    });
  }
  workspace.preparationLedger = { ...ledger, requirements };

  const privateSection = plainObject(payload.private) ? payload.private : {};
  const legacyFrames = Array.isArray(privateSection.dialogueFrames)
    ? privateSection.dialogueFrames
    : (Array.isArray(payload.dialogueFrames) ? payload.dialogueFrames : []);
  const cards = Array.isArray(workspace.npcSceneCards) ? workspace.npcSceneCards as JsonObject[] : [];
  legacyFrames.slice(0, 24).forEach((entry, index) => {
    if (!plainObject(entry)) return;
    const npcRef = String(entry.npcRef ?? entry.npcId ?? `legacy-npc:${scenePlanId}:${index + 1}`);
    const cardId = `npc-card:legacy:${scenePlanId}:${identifier(npcRef.replace(/[^A-Za-z0-9._:-]+/g, '-'), `dialogueFrames[${index}].npcRef`)}`;
    const card: JsonObject = {
      cardId,
      npcRef,
      planningState: 'draft',
      truthState: 'gm_preparation',
      publicLabel: boundedText(entry.publicLabel ?? entry.npcName ?? entry.name, 200) ?? 'Prepared NPC',
      knowledge: clone((entry.knowledge ?? []) as JsonValue),
      disclosurePosture: clone((entry.disclosurePosture ?? entry.disclosure ?? []) as JsonValue),
      hardLimits: clone((entry.hardLimits ?? []) as JsonValue),
      approachSensitivities: clone((entry.approachSensitivities ?? []) as JsonValue),
      currentObjective: boundedText(entry.currentObjective ?? entry.objective, 1_000),
      likelyAction: boundedText(entry.likelyAction, 1_000),
      sourceRefs: [`gma-scene-plan:${scenePlanId}:r${input.scenePlanRef.revision}`],
    };
    const existingCardIndex = cards.findIndex((candidate) => candidate.cardId === cardId);
    if (existingCardIndex >= 0) cards[existingCardIndex] = card;
    else cards.push(card);
  });
  workspace.npcSceneCards = cards;
  workspace.activeSceneKitRef = { sceneKitId };
  workspace.sourceRevisions = {
    ...(plainObject(workspace.sourceRevisions) ? workspace.sourceRevisions : {}),
    legacyGmaScenePlan: `${scenePlanId}:r${input.scenePlanRef.revision}:${input.scenePlanRef.payloadHash}`,
  };
  return workspace;
}
