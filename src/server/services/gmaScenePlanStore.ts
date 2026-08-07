import { createHash } from 'node:crypto';
import type { Collection, Filter, WithId } from 'mongodb';
import { getDb } from '../config/mongo.js';

export const GMA_SCENE_PLAN_STORE_CONTRACT_VERSION = 'gmc.gma-scene-plan-store/1';
export const GMA_SCENE_PLAN_REFERENCE_CONTRACT_VERSION = 'gma.scene-plan-ref/1';
export const GMA_SCENE_PLAN_SCHEMA_ALLOWLIST = Object.freeze(['gma.scene-plan/2']);
export const GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES = 65_536;

type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export type ScenePlanSourceRevisions = Record<string, string | number | null>;

export interface ScenePlanTimelineAnchor {
  messageId: string;
  sequence: number;
}

export interface ScenePlanReference {
  contractVersion: typeof GMA_SCENE_PLAN_REFERENCE_CONTRACT_VERSION;
  schemaVersion: string;
  sceneId: string;
  scenePlanId: string;
  revision: number;
  payloadHash: string;
}

export interface ScenePlanRevisionDocument {
  userId: string;
  campaignId: string;
  sceneId: string;
  scenePlanId: string;
  revision: number;
  schemaVersion: string;
  payloadHash: string;
  requestHash: string;
  status: 'available' | 'superseded';
  sourceRevisions: ScenePlanSourceRevisions;
  interactionId: string | null;
  timelineAnchor: ScenePlanTimelineAnchor;
  privatePayload: Record<string, JsonValue>;
  idempotencyKey: string;
  createdAt: Date;
  supersededAt?: Date;
  supersededByRewindId?: string;
  redactedAudit: {
    privatePayloadBytes: number;
    topLevelKeys: string[];
    sourceRevisionKeys: string[];
  };
}

export class ScenePlanStoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ScenePlanStoreError';
  }
}

export interface AppendScenePlanRevisionInput {
  userId: string;
  campaignId: string;
  sceneId: string;
  scenePlanId: string;
  schemaVersion: string;
  expectedRevision: number;
  idempotencyKey: string;
  sourceRevisions: ScenePlanSourceRevisions;
  interactionId?: string | null;
  timelineAnchor: ScenePlanTimelineAnchor;
  privatePayload: Record<string, JsonValue>;
}

export interface RewindScenePlanInput {
  userId: string;
  campaignId: string;
  scenePlanId: string;
  expectedRevision: number;
  boundarySequence: number;
  rewindId: string;
}

type RevisionCollection = Collection<ScenePlanRevisionDocument>;

function collection(): RevisionCollection {
  return getDb().collection<ScenePlanRevisionDocument>('gma_scene_plan_revisions');
}

function text(value: unknown, field: string, max = 200): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > max || /[\x00-\x1F\x7F]/.test(result)) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', `${field} is invalid.`, { field });
  }
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', `${field} must be a non-negative integer.`, { field });
  }
  return Number(value);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validateJson(value: unknown, depth = 0, counters = { keys: 0 }): asserts value is JsonValue {
  if (depth > 12) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'privatePayload exceeds the maximum nesting depth.', { field: 'privatePayload' });
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 200) {
      throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'privatePayload contains an oversized array.', { field: 'privatePayload' });
    }
    for (const item of value) validateJson(item, depth + 1, counters);
    return;
  }
  if (!plainObject(value)) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'privatePayload must contain JSON values only.', { field: 'privatePayload' });
  }
  for (const [key, item] of Object.entries(value)) {
    counters.keys += 1;
    if (!key || key.length > 120 || counters.keys > 1_000) {
      throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'privatePayload contains too many or invalid keys.', { field: 'privatePayload' });
    }
    validateJson(item, depth + 1, counters);
  }
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateSourceRevisions(value: unknown): ScenePlanSourceRevisions {
  if (!plainObject(value) || Object.keys(value).length > 20) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'sourceRevisions must be a bounded object.', { field: 'sourceRevisions' });
  }
  const result: ScenePlanSourceRevisions = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key || key.length > 80 || !/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'sourceRevisions contains an invalid key.', { field: 'sourceRevisions' });
    }
    if (entry !== null && typeof entry !== 'string' && !(typeof entry === 'number' && Number.isFinite(entry))) {
      throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'sourceRevisions contains an invalid value.', { field: 'sourceRevisions' });
    }
    result[key] = typeof entry === 'string'
      ? text(entry, `sourceRevisions.${key}`)
      : entry as number | null;
  }
  return result;
}

function reference(record: ScenePlanRevisionDocument): ScenePlanReference {
  return {
    contractVersion: GMA_SCENE_PLAN_REFERENCE_CONTRACT_VERSION,
    schemaVersion: record.schemaVersion,
    sceneId: record.sceneId,
    scenePlanId: record.scenePlanId,
    revision: record.revision,
    payloadHash: record.payloadHash,
  };
}

function normalizeAppend(input: AppendScenePlanRevisionInput) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = text(input.campaignId, 'campaignId');
  const sceneId = text(input.sceneId, 'sceneId');
  const scenePlanId = text(input.scenePlanId, 'scenePlanId');
  const schemaVersion = text(input.schemaVersion, 'schemaVersion', 80);
  if (!GMA_SCENE_PLAN_SCHEMA_ALLOWLIST.includes(schemaVersion)) {
    throw new ScenePlanStoreError(422, 'GMA_SCENE_PLAN_SCHEMA_UNSUPPORTED', 'The scene-plan schema version is not supported.', {
      supportedSchemaVersions: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
    });
  }
  const expectedRevision = nonNegativeInteger(input.expectedRevision, 'expectedRevision');
  const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey');
  const interactionId = input.interactionId == null ? null : text(input.interactionId, 'interactionId');
  const timelineAnchor = {
    messageId: text(input.timelineAnchor?.messageId, 'timelineAnchor.messageId'),
    sequence: nonNegativeInteger(input.timelineAnchor?.sequence, 'timelineAnchor.sequence'),
  };
  const sourceRevisions = validateSourceRevisions(input.sourceRevisions);
  if (!plainObject(input.privatePayload)) {
    throw new ScenePlanStoreError(400, 'GMA_SCENE_PLAN_VALIDATION_FAILED', 'privatePayload must be an object.', { field: 'privatePayload' });
  }
  validateJson(input.privatePayload);
  if (input.privatePayload.schemaVersion !== schemaVersion || input.privatePayload.sceneId !== sceneId) {
    throw new ScenePlanStoreError(422, 'GMA_SCENE_PLAN_PAYLOAD_MISMATCH', 'The private scene plan does not match its storage envelope.', {
      requiredFields: ['schemaVersion', 'sceneId'],
    });
  }
  const serializedPayload = canonicalJson(input.privatePayload as Record<string, JsonValue>);
  const privatePayloadBytes = Buffer.byteLength(serializedPayload, 'utf8');
  if (privatePayloadBytes > GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES) {
    throw new ScenePlanStoreError(413, 'GMA_SCENE_PLAN_PAYLOAD_TOO_LARGE', 'The private scene plan exceeds the storage limit.', {
      maximumBytes: GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES,
      suppliedBytes: privatePayloadBytes,
    });
  }
  const payloadHash = sha256(serializedPayload);
  const requestHash = sha256(canonicalJson({
    campaignId,
    sceneId,
    scenePlanId,
    schemaVersion,
    expectedRevision,
    sourceRevisions,
    interactionId,
    timelineAnchor,
    payloadHash,
  }));
  return {
    userId, campaignId, sceneId, scenePlanId, schemaVersion, expectedRevision,
    idempotencyKey, sourceRevisions, interactionId, timelineAnchor,
    privatePayload: input.privatePayload as Record<string, JsonValue>,
    privatePayloadBytes, payloadHash, requestHash,
  };
}

async function activeRecord(
  records: RevisionCollection,
  input: { userId: string; campaignId: string; scenePlanId: string; schemaVersion?: string },
) {
  const filter: Filter<ScenePlanRevisionDocument> = {
    userId: input.userId,
    campaignId: input.campaignId,
    scenePlanId: input.scenePlanId,
    status: 'available',
  };
  if (input.schemaVersion) filter.schemaVersion = input.schemaVersion;
  return records.findOne(filter, { sort: { revision: -1 } });
}

/** Appends one immutable private scene-plan revision using optimistic concurrency. */
export async function appendScenePlanRevision(
  input: AppendScenePlanRevisionInput,
  records: RevisionCollection = collection(),
) {
  const normalized = normalizeAppend(input);
  const idempotent = await records.findOne({
    userId: normalized.userId,
    campaignId: normalized.campaignId,
    idempotencyKey: normalized.idempotencyKey,
  });
  if (idempotent) {
    if (idempotent.requestHash !== normalized.requestHash) {
      throw new ScenePlanStoreError(409, 'GMA_SCENE_PLAN_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different scene-plan append.', {});
    }
    return { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, duplicate: true, scenePlanRef: reference(idempotent) };
  }

  const active = await activeRecord(records, normalized);
  const currentRevision = active?.revision ?? 0;
  if (currentRevision !== normalized.expectedRevision) {
    throw new ScenePlanStoreError(409, 'GMA_SCENE_PLAN_REVISION_CONFLICT', 'The active scene-plan revision changed before this append.', {
      expectedRevision: normalized.expectedRevision,
      actualRevision: currentRevision,
    });
  }
  const latest = await records.findOne({
    userId: normalized.userId,
    campaignId: normalized.campaignId,
    scenePlanId: normalized.scenePlanId,
  }, { sort: { revision: -1 } });
  const revision = (latest?.revision ?? 0) + 1;
  const now = new Date();
  const document: ScenePlanRevisionDocument = {
    userId: normalized.userId,
    campaignId: normalized.campaignId,
    sceneId: normalized.sceneId,
    scenePlanId: normalized.scenePlanId,
    revision,
    schemaVersion: normalized.schemaVersion,
    payloadHash: normalized.payloadHash,
    requestHash: normalized.requestHash,
    status: 'available',
    sourceRevisions: normalized.sourceRevisions,
    interactionId: normalized.interactionId,
    timelineAnchor: normalized.timelineAnchor,
    privatePayload: normalized.privatePayload,
    idempotencyKey: normalized.idempotencyKey,
    createdAt: now,
    redactedAudit: {
      privatePayloadBytes: normalized.privatePayloadBytes,
      topLevelKeys: Object.keys(normalized.privatePayload).sort(),
      sourceRevisionKeys: Object.keys(normalized.sourceRevisions).sort(),
    },
  };
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 11000) {
      const replay = await records.findOne({
        userId: normalized.userId,
        campaignId: normalized.campaignId,
        idempotencyKey: normalized.idempotencyKey,
      });
      if (replay?.requestHash === normalized.requestHash) {
        return { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, duplicate: true, scenePlanRef: reference(replay) };
      }
      throw new ScenePlanStoreError(409, 'GMA_SCENE_PLAN_REVISION_CONFLICT', 'Another scene-plan revision was appended first.', {
        expectedRevision: normalized.expectedRevision,
      });
    }
    throw error;
  }
  return { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, duplicate: false, scenePlanRef: reference(document) };
}

/** Reads the active compatible private revision for one tenant-owned plan. */
export async function readActiveScenePlan(
  input: { userId: string; campaignId: string; scenePlanId: string; sceneId?: string; schemaVersion: string },
  records: RevisionCollection = collection(),
) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = text(input.campaignId, 'campaignId');
  const scenePlanId = text(input.scenePlanId, 'scenePlanId');
  const schemaVersion = text(input.schemaVersion, 'schemaVersion', 80);
  if (!GMA_SCENE_PLAN_SCHEMA_ALLOWLIST.includes(schemaVersion)) {
    throw new ScenePlanStoreError(422, 'GMA_SCENE_PLAN_SCHEMA_UNSUPPORTED', 'The scene-plan schema version is not supported.', {
      supportedSchemaVersions: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
    });
  }
  const record = await activeRecord(records, { userId, campaignId, scenePlanId, schemaVersion });
  if (!record || (input.sceneId && record.sceneId !== text(input.sceneId, 'sceneId'))) return null;
  return { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, scenePlanRef: reference(record), privatePayload: record.privatePayload };
}

/**
 * Resolves the most recent available plan when a migration rehearsal begins
 * before a Story workspace has recorded an active Scene-kit reference.
 * date_of_change: 2026-08-07
 */
export async function readLatestActiveScenePlan(
  input: { userId: string; campaignId: string; schemaVersion: string },
  records: RevisionCollection = collection(),
) {
  const userId = text(input.userId, 'userId', 254);
  const campaignId = text(input.campaignId, 'campaignId');
  const schemaVersion = text(input.schemaVersion, 'schemaVersion');
  if (!GMA_SCENE_PLAN_SCHEMA_ALLOWLIST.includes(schemaVersion)) {
    throw new ScenePlanStoreError(422, 'GMA_SCENE_PLAN_SCHEMA_UNSUPPORTED', 'The scene-plan schema version is not supported.', {
      supportedSchemaVersions: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
    });
  }
  const record = await records.findOne(
    { userId, campaignId, schemaVersion, status: 'available' },
    { sort: { 'timelineAnchor.sequence': -1, createdAt: -1, revision: -1 } },
  );
  return record
    ? { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, scenePlanRef: reference(record), privatePayload: record.privatePayload }
    : null;
}

/** Resolves an opaque revision reference without exposing database identifiers. */
export async function resolveScenePlanRevision(
  input: { userId: string; campaignId: string; scenePlanId: string; revision: number; payloadHash?: string },
  records: RevisionCollection = collection(),
) {
  const record = await records.findOne({
    userId: text(input.userId, 'userId', 254),
    campaignId: text(input.campaignId, 'campaignId'),
    scenePlanId: text(input.scenePlanId, 'scenePlanId'),
    revision: nonNegativeInteger(input.revision, 'revision'),
  });
  if (!record) return null;
  if (input.payloadHash && record.payloadHash !== text(input.payloadHash, 'payloadHash', 64)) {
    throw new ScenePlanStoreError(409, 'GMA_SCENE_PLAN_REFERENCE_MISMATCH', 'The scene-plan reference hash does not match the stored revision.', {});
  }
  return { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION, scenePlanRef: reference(record), status: record.status, privatePayload: record.privatePayload };
}

/** Supersedes revisions after a timeline boundary and restores the prior plan. */
export async function rewindScenePlan(
  input: RewindScenePlanInput,
  records: RevisionCollection = collection(),
) {
  const normalized = {
    userId: text(input.userId, 'userId', 254),
    campaignId: text(input.campaignId, 'campaignId'),
    scenePlanId: text(input.scenePlanId, 'scenePlanId'),
    expectedRevision: nonNegativeInteger(input.expectedRevision, 'expectedRevision'),
    boundarySequence: nonNegativeInteger(input.boundarySequence, 'boundarySequence'),
    rewindId: text(input.rewindId, 'rewindId'),
  };
  const active = await activeRecord(records, normalized);
  const currentRevision = active?.revision ?? 0;
  if (currentRevision !== normalized.expectedRevision) {
    const replay = await records.findOne({
      userId: normalized.userId,
      campaignId: normalized.campaignId,
      scenePlanId: normalized.scenePlanId,
      supersededByRewindId: normalized.rewindId,
    });
    if (replay) {
      const restoredReplay = await records.findOne({
        userId: normalized.userId,
        campaignId: normalized.campaignId,
        scenePlanId: normalized.scenePlanId,
        status: 'available',
        'timelineAnchor.sequence': { $lte: normalized.boundarySequence },
      }, { sort: { revision: -1 } });
      return {
        contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
        duplicate: true,
        rewindId: normalized.rewindId,
        supersededCount: 0,
        restoredScenePlanRef: restoredReplay ? reference(restoredReplay) : null,
      };
    }
    throw new ScenePlanStoreError(409, 'GMA_SCENE_PLAN_REVISION_CONFLICT', 'The active scene-plan revision changed before rewind.', {
      expectedRevision: normalized.expectedRevision,
      actualRevision: currentRevision,
    });
  }
  const supersededAt = new Date();
  const updated = await records.updateMany({
    userId: normalized.userId,
    campaignId: normalized.campaignId,
    scenePlanId: normalized.scenePlanId,
    status: 'available',
    'timelineAnchor.sequence': { $gt: normalized.boundarySequence },
  }, {
    $set: {
      status: 'superseded',
      supersededAt,
      supersededByRewindId: normalized.rewindId,
    },
  });
  const restored = await activeRecord(records, normalized);
  return {
    contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
    duplicate: false,
    rewindId: normalized.rewindId,
    supersededCount: updated.modifiedCount,
    restoredScenePlanRef: restored ? reference(restored) : null,
  };
}

/** Returns only redacted metadata suitable for diagnostics and audit logs. */
export function redactScenePlanRevision(record: WithId<ScenePlanRevisionDocument> | ScenePlanRevisionDocument) {
  return {
    contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
    userId: record.userId,
    campaignId: record.campaignId,
    sceneId: record.sceneId,
    scenePlanId: record.scenePlanId,
    revision: record.revision,
    schemaVersion: record.schemaVersion,
    payloadHash: record.payloadHash,
    status: record.status,
    timelineAnchor: record.timelineAnchor,
    interactionId: record.interactionId,
    createdAt: record.createdAt,
    redactedAudit: record.redactedAudit,
  };
}
