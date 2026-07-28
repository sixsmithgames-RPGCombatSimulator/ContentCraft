import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../config/mongo.js';

export const ENCOUNTER_PLAN_CONTRACT_VERSION = '1.0.0';
export const ENCOUNTER_PLAN_STATUSES = [
  'draft',
  'tactical_setup',
  'ready',
  'active',
  'ended',
  'aftermath_pending',
  'closed',
  'archived',
] as const;

export type EncounterPlanStatus = typeof ENCOUNTER_PLAN_STATUSES[number];

type OperationMetadata = {
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EncounterPlanRecord = {
  _id: string;
  id: string;
  userId: string;
  campaignId: string;
  contractVersion: typeof ENCOUNTER_PLAN_CONTRACT_VERSION;
  revision: string;
  revisionNumber: number;
  status: EncounterPlanStatus;
  title: string;
  situation: string;
  objective: string;
  sessionId: string | null;
  sceneId: string | null;
  locationId: string | null;
  sceneRevision: string | null;
  presenceRevision: string | null;
  scheduledFor: Date | null;
  visibility: 'gm_only' | 'table';
  roster: Array<Record<string, any>>;
  map: Record<string, any>;
  notes: string;
  vcsBinding: Record<string, any> | null;
  readiness: ReturnType<typeof evaluateEncounterReadiness>;
  creationOperation: OperationMetadata & { fingerprint: string };
  mutationReceipts: Array<OperationMetadata & {
    fingerprint: string;
    action: string;
    revision: string;
    appliedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

const TRANSITIONS: Record<EncounterPlanStatus, EncounterPlanStatus[]> = {
  draft: ['tactical_setup', 'archived'],
  tactical_setup: ['draft', 'ready', 'archived'],
  ready: ['tactical_setup', 'active', 'archived'],
  active: ['ended'],
  ended: ['aftermath_pending', 'closed'],
  aftermath_pending: ['closed'],
  closed: ['archived'],
  archived: [],
};

export class EncounterPlanError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'EncounterPlanError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function collection() {
  return getDb().collection<EncounterPlanRecord>('gmc_encounters');
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {};
}

function boundedString(value: unknown, maxLength: number, field: string, required = false) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} is required.`);
  if (text.length > maxLength) throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} must be ${maxLength} characters or fewer.`);
  return text;
}

function nullableIdentifier(value: unknown, field: string) {
  const text = boundedString(value, 240, field);
  if (!text) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
    throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} must be a stable identifier.`);
  }
  return text;
}

function requiredIdentifier(value: unknown, field: string) {
  const result = nullableIdentifier(value, field);
  if (!result) throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return result;
}

function operationMetadata(input: Record<string, any>): OperationMetadata {
  return {
    operationId: requiredIdentifier(input.operationId ?? input.mutationId, 'operationId'),
    idempotencyKey: requiredIdentifier(input.idempotencyKey ?? input.mutationId, 'idempotencyKey'),
    correlationId: requiredIdentifier(input.correlationId, 'correlationId'),
  };
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function revision(id: string, revisionNumber: number) {
  return `gmc-encounter:${id}:r${revisionNumber}`;
}

function encounterId(userId: string, campaignId: string, idempotencyKey: string) {
  const digest = createHash('sha256').update(`${userId}\n${campaignId}\n${idempotencyKey}`).digest('hex').slice(0, 24);
  return `encounter:${digest}`;
}

function normalizeDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} must be an ISO-8601 date-time.`);
  return date;
}

function finiteNumber(value: unknown, field: string, options: { positive?: boolean } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (options.positive && number <= 0)) {
    throw new EncounterPlanError(400, 'VALIDATION_ERROR', `${field} must be ${options.positive ? 'a positive' : 'a finite'} number.`);
  }
  return number;
}

function normalizeSourceRef(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const source = record(value);
  const system = boundedString(source.system, 20, 'sourceRef.system', true);
  if (!['gmc', 'vcs'].includes(system)) {
    throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'sourceRef.system must be gmc or vcs.');
  }
  return {
    system,
    id: requiredIdentifier(source.id, 'sourceRef.id'),
    revision: boundedString(source.revision, 240, 'sourceRef.revision', true),
    ...(source.entityType ? { entityType: boundedString(source.entityType, 80, 'sourceRef.entityType', true) } : {}),
  };
}

function normalizeToken(value: unknown) {
  const source = record(value);
  return {
    assetId: nullableIdentifier(source.assetId, 'token.assetId'),
    assetUrl: boundedString(source.assetUrl, 2048, 'token.assetUrl') || null,
    color: boundedString(source.color, 32, 'token.color') || null,
    size: boundedString(source.size, 32, 'token.size') || 'medium',
    x: finiteNumber(source.x, 'token.x'),
    y: finiteNumber(source.y, 'token.y'),
    hidden: Boolean(source.hidden),
  };
}

export function normalizeEncounterRoster(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'roster must be an array.');
  if (value.length > 200) throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'roster cannot contain more than 200 actors.');
  const actorIds = new Set<string>();
  return value.map((item, index) => {
    const actor = record(item);
    const name = boundedString(actor.name, 200, `roster[${index}].name`, true);
    const actorId = actor.actorId
      ? requiredIdentifier(actor.actorId, `roster[${index}].actorId`)
      : `actor:${createHash('sha256').update(`${index}\n${name}`).digest('hex').slice(0, 20)}`;
    if (actorIds.has(actorId)) throw new EncounterPlanError(400, 'VALIDATION_ERROR', `roster[${index}].actorId must be unique.`);
    actorIds.add(actorId);
    const role = boundedString(actor.role, 20, `roster[${index}].role`, true);
    if (!['player', 'hostile', 'ally', 'hazard'].includes(role)) {
      throw new EncounterPlanError(400, 'VALIDATION_ERROR', `roster[${index}].role must be player, hostile, ally, or hazard.`);
    }
    return {
      actorId,
      name,
      role,
      sourceRef: normalizeSourceRef(actor.sourceRef),
      initiativeModifier: finiteNumber(actor.initiativeModifier, `roster[${index}].initiativeModifier`) ?? 0,
      maxHp: finiteNumber(actor.maxHp, `roster[${index}].maxHp`, { positive: true }),
      armorClass: finiteNumber(actor.armorClass, `roster[${index}].armorClass`, { positive: true }),
      token: normalizeToken(actor.token),
      notes: boundedString(actor.notes, 2000, `roster[${index}].notes`),
      mechanics: record(actor.mechanics),
    };
  });
}

export function normalizeEncounterMap(value: unknown) {
  const map = record(value);
  return {
    id: nullableIdentifier(map.id, 'map.id'),
    name: boundedString(map.name, 200, 'map.name') || null,
    assetUrl: boundedString(map.assetUrl, 2048, 'map.assetUrl') || null,
    width: finiteNumber(map.width, 'map.width', { positive: true }),
    height: finiteNumber(map.height, 'map.height', { positive: true }),
    gridSize: finiteNumber(map.gridSize, 'map.gridSize', { positive: true }),
    gridType: ['square', 'hex'].includes(String(map.gridType)) ? String(map.gridType) : 'square',
    gridVisible: map.gridVisible !== false,
    fogEnabled: Boolean(map.fogEnabled),
    backgroundColor: boundedString(map.backgroundColor, 32, 'map.backgroundColor') || '#111827',
  };
}

export function evaluateEncounterReadiness(plan: Pick<EncounterPlanRecord, 'title' | 'roster' | 'map' | 'vcsBinding'> | Record<string, any>) {
  const blockers: Array<{ code: string; path: string; message: string }> = [];
  const warnings: Array<{ code: string; path: string; message: string }> = [];
  const roster = Array.isArray(plan.roster) ? plan.roster : [];
  const map = record(plan.map);
  if (!String(plan.title ?? '').trim()) blockers.push({ code: 'TITLE_REQUIRED', path: 'title', message: 'Give the encounter a title.' });
  if (!map.id && !map.assetUrl) blockers.push({ code: 'MAP_REQUIRED', path: 'map', message: 'Choose or upload a battle map.' });
  for (const field of ['width', 'height', 'gridSize']) {
    if (!(Number(map[field]) > 0)) blockers.push({ code: `MAP_${field.toUpperCase()}_REQUIRED`, path: `map.${field}`, message: `Set the map ${field}.` });
  }
  if (!roster.some((actor: any) => actor.role === 'player')) {
    blockers.push({ code: 'PLAYER_REQUIRED', path: 'roster', message: 'Add at least one player character.' });
  }
  if (!roster.some((actor: any) => actor.role === 'hostile' || actor.role === 'hazard')) {
    blockers.push({ code: 'OPPOSITION_REQUIRED', path: 'roster', message: 'Add at least one hostile or hazard.' });
  }
  roster.forEach((actor: any, index: number) => {
    if (actor?.token?.x === null || actor?.token?.y === null || actor?.token?.x === undefined || actor?.token?.y === undefined) {
      warnings.push({ code: 'TOKEN_NOT_PLACED', path: `roster[${index}].token`, message: `${actor?.name ?? 'An actor'} will be auto-placed when the room is prepared.` });
    }
    if (!actor?.token?.assetId && !actor?.token?.assetUrl) {
      warnings.push({ code: 'TOKEN_ART_MISSING', path: `roster[${index}].token`, message: `${actor?.name ?? 'An actor'} will use a generated marker.` });
    }
  });
  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    checkedAt: new Date(),
  };
}

export function assertEncounterPlanTransition(fromStatus: EncounterPlanStatus, toStatus: EncounterPlanStatus) {
  if (!ENCOUNTER_PLAN_STATUSES.includes(fromStatus) || !ENCOUNTER_PLAN_STATUSES.includes(toStatus)) {
    throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'Encounter status is not supported.');
  }
  if (!TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new EncounterPlanError(409, 'INVALID_ENCOUNTER_TRANSITION', `Encounter cannot move from ${fromStatus} to ${toStatus}.`, {
      allowed: TRANSITIONS[fromStatus],
    });
  }
  return true;
}

function normalizeCreate(campaignId: string, input: Record<string, any>) {
  return {
    campaignId,
    title: boundedString(input.title, 200, 'title', true),
    situation: boundedString(input.situation, 5000, 'situation'),
    objective: boundedString(input.objective, 2000, 'objective'),
    sessionId: nullableIdentifier(input.sessionId, 'sessionId'),
    sceneId: nullableIdentifier(input.sceneId, 'sceneId'),
    locationId: nullableIdentifier(input.locationId, 'locationId'),
    sceneRevision: boundedString(input.sceneRevision, 240, 'sceneRevision') || null,
    presenceRevision: boundedString(input.presenceRevision, 240, 'presenceRevision') || null,
    scheduledFor: normalizeDate(input.scheduledFor, 'scheduledFor'),
    visibility: input.visibility === 'table' ? 'table' as const : 'gm_only' as const,
    roster: normalizeEncounterRoster(input.roster),
    map: normalizeEncounterMap(input.map),
    notes: boundedString(input.notes, 10000, 'notes'),
  };
}

function normalizePatch(input: Record<string, any>) {
  const patch: Record<string, any> = {};
  for (const [field, max] of [['title', 200], ['situation', 5000], ['objective', 2000], ['notes', 10000]] as const) {
    if (input[field] !== undefined) patch[field] = boundedString(input[field], max, field, field === 'title');
  }
  for (const field of ['sessionId', 'sceneId', 'locationId']) {
    if (input[field] !== undefined) patch[field] = nullableIdentifier(input[field], field);
  }
  for (const field of ['sceneRevision', 'presenceRevision']) {
    if (input[field] !== undefined) patch[field] = boundedString(input[field], 240, field) || null;
  }
  if (input.scheduledFor !== undefined) patch.scheduledFor = normalizeDate(input.scheduledFor, 'scheduledFor');
  if (input.visibility !== undefined) {
    if (!['gm_only', 'table'].includes(String(input.visibility))) throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'visibility must be gm_only or table.');
    patch.visibility = input.visibility;
  }
  if (input.roster !== undefined) patch.roster = normalizeEncounterRoster(input.roster);
  if (input.map !== undefined) patch.map = normalizeEncounterMap(input.map);
  return patch;
}

function assertRevision(current: EncounterPlanRecord, expectedRevision: unknown) {
  const expected = boundedString(expectedRevision, 240, 'expectedRevision', true);
  if (current.revision !== expected) {
    throw new EncounterPlanError(409, 'STALE_ENCOUNTER_REVISION', 'The encounter changed after this editor was loaded. Reload it before saving.', {
      expectedRevision: expected,
      currentRevision: current.revision,
    });
  }
}

function matchingReceipt(current: EncounterPlanRecord, operation: OperationMetadata, action: string, operationFingerprint: string) {
  const existing = current.mutationReceipts?.find((item) => item.idempotencyKey === operation.idempotencyKey);
  if (!existing) return null;
  if (existing.fingerprint !== operationFingerprint || existing.action !== action) {
    throw new EncounterPlanError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different encounter change.', {
      action,
      priorAction: existing.action,
    });
  }
  return existing;
}

function authorityReceipt(plan: EncounterPlanRecord, operation: OperationMetadata, status: 'applied' | 'no_change') {
  return {
    contractVersion: ENCOUNTER_PLAN_CONTRACT_VERSION,
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    correlationId: operation.correlationId,
    authority: 'gmc',
    status,
    authorityRevision: plan.revision,
    authoritativeStateChanged: status === 'applied',
  };
}

export async function createEncounterPlan(userId: string, campaignId: string, input: Record<string, any>) {
  const operation = operationMetadata(input);
  const normalized = normalizeCreate(campaignId, input);
  const operationFingerprint = fingerprint(normalized);
  const id = encounterId(userId, campaignId, operation.idempotencyKey);
  const existing = await collection().findOne({ _id: id, userId, campaignId });
  if (existing) {
    if (existing.creationOperation.fingerprint !== operationFingerprint) {
      throw new EncounterPlanError(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used to create a different encounter.');
    }
    return { encounter: existing, duplicate: true, receipt: authorityReceipt(existing, operation, 'no_change') };
  }
  const timestamp = new Date();
  const initial: EncounterPlanRecord = {
    _id: id,
    id,
    userId,
    contractVersion: ENCOUNTER_PLAN_CONTRACT_VERSION,
    ...normalized,
    revision: revision(id, 1),
    revisionNumber: 1,
    status: 'draft',
    vcsBinding: null,
    readiness: evaluateEncounterReadiness({ ...normalized, vcsBinding: null }),
    creationOperation: { ...operation, fingerprint: operationFingerprint },
    mutationReceipts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    await collection().insertOne(initial);
    return { encounter: initial, duplicate: false, receipt: authorityReceipt(initial, operation, 'applied') };
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const concurrent = await collection().findOne({ _id: id, userId, campaignId });
    if (!concurrent || concurrent.creationOperation.fingerprint !== operationFingerprint) {
      throw new EncounterPlanError(409, 'IDEMPOTENCY_KEY_REUSED', 'A conflicting encounter create was recorded for this idempotency key.');
    }
    return { encounter: concurrent, duplicate: true, receipt: authorityReceipt(concurrent, operation, 'no_change') };
  }
}

export async function listEncounterPlans(userId: string, campaignId: string, options: { status?: string } = {}) {
  const filter: Record<string, any> = { userId, campaignId };
  if (options.status) {
    if (!ENCOUNTER_PLAN_STATUSES.includes(options.status as EncounterPlanStatus)) {
      throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'status is not a supported encounter-plan status.');
    }
    filter.status = options.status;
  } else {
    filter.status = { $ne: 'archived' };
  }
  return collection().find(filter).sort({ scheduledFor: 1, updatedAt: -1 }).limit(500).toArray();
}

export async function getEncounterPlan(userId: string, encounterIdValue: string) {
  return collection().findOne({ _id: encounterIdValue, userId });
}

export async function updateEncounterPlan(userId: string, encounterIdValue: string, input: Record<string, any>) {
  const operation = operationMetadata(input);
  const current = await getEncounterPlan(userId, encounterIdValue);
  if (!current) throw new EncounterPlanError(404, 'NOT_FOUND', 'Encounter not found.');
  const patch = normalizePatch(input);
  const operationFingerprint = fingerprint(patch);
  const replay = matchingReceipt(current, operation, 'update', operationFingerprint);
  if (replay) return { encounter: current, duplicate: true, receipt: authorityReceipt(current, operation, 'no_change') };
  assertRevision(current, input.expectedRevision);
  const revisionNumber = current.revisionNumber + 1;
  const nextRevision = revision(current.id, revisionNumber);
  const updatedAt = new Date();
  const projected = { ...current, ...patch };
  const updated = await collection().findOneAndUpdate(
    { _id: current._id, userId, revision: current.revision },
    {
      $set: {
        ...patch,
        revisionNumber,
        revision: nextRevision,
        readiness: evaluateEncounterReadiness(projected),
        updatedAt,
      },
      $push: {
        mutationReceipts: {
          $each: [{ ...operation, fingerprint: operationFingerprint, action: 'update', revision: nextRevision, appliedAt: updatedAt }],
          $slice: -100,
        },
      } as any,
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new EncounterPlanError(409, 'STALE_ENCOUNTER_REVISION', 'The encounter changed while it was being saved. Reload it before retrying.');
  return { encounter: updated, duplicate: false, receipt: authorityReceipt(updated, operation, 'applied') };
}

export async function bindEncounterBattleRoom(userId: string, encounterIdValue: string, input: Record<string, any>) {
  const operation = operationMetadata(input);
  const current = await getEncounterPlan(userId, encounterIdValue);
  if (!current) throw new EncounterPlanError(404, 'NOT_FOUND', 'Encounter not found.');
  const binding = {
    contractVersion: ENCOUNTER_PLAN_CONTRACT_VERSION,
    authority: 'vcs',
    battleRoomId: requiredIdentifier(input.battleRoomId, 'battleRoomId'),
    phaseId: requiredIdentifier(input.phaseId ?? 'main', 'phaseId'),
    vcsRevision: boundedString(input.vcsRevision, 240, 'vcsRevision', true),
    status: boundedString(input.status, 32, 'status', true),
    campaignRef: { system: 'gmc', id: current.campaignId },
    encounterRef: { system: 'gmc', id: current.id, revision: current.revision },
    boundAt: new Date(),
  };
  if (!['draft', 'ready', 'active', 'paused', 'ended', 'archived'].includes(binding.status)) {
    throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'status is not a supported BattleRoom status.');
  }
  const operationFingerprint = fingerprint({
    battleRoomId: binding.battleRoomId,
    phaseId: binding.phaseId,
    vcsRevision: binding.vcsRevision,
    status: binding.status,
  });
  const replay = matchingReceipt(current, operation, 'bind_battleroom', operationFingerprint);
  if (replay) return { encounter: current, duplicate: true, receipt: authorityReceipt(current, operation, 'no_change') };
  if (
    current.vcsBinding?.battleRoomId === binding.battleRoomId
    && current.vcsBinding?.phaseId === binding.phaseId
    && current.vcsBinding?.vcsRevision === binding.vcsRevision
    && current.vcsBinding?.status === binding.status
  ) {
    return { encounter: current, duplicate: true, receipt: authorityReceipt(current, operation, 'no_change') };
  }
  assertRevision(current, input.expectedRevision);
  if (current.vcsBinding && (
    current.vcsBinding.battleRoomId !== binding.battleRoomId
    || current.vcsBinding.phaseId !== binding.phaseId
  )) {
    throw new EncounterPlanError(409, 'BATTLE_ROOM_ALREADY_BOUND', 'This encounter phase is already bound to a different BattleRoom.', {
      currentBattleRoomId: current.vcsBinding.battleRoomId,
      requestedBattleRoomId: binding.battleRoomId,
    });
  }
  const revisionNumber = current.revisionNumber + 1;
  const nextRevision = revision(current.id, revisionNumber);
  const updatedAt = new Date();
  const updated = await collection().findOneAndUpdate(
    { _id: current._id, userId, revision: current.revision },
    {
      $set: {
        vcsBinding: binding,
        status: current.status === 'draft' ? 'tactical_setup' : current.status,
        revisionNumber,
        revision: nextRevision,
        updatedAt,
      },
      $push: {
        mutationReceipts: {
          $each: [{ ...operation, fingerprint: operationFingerprint, action: 'bind_battleroom', revision: nextRevision, appliedAt: updatedAt }],
          $slice: -100,
        },
      } as any,
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new EncounterPlanError(409, 'STALE_ENCOUNTER_REVISION', 'The encounter changed while the BattleRoom was being linked. Reconcile the room before retrying.');
  return { encounter: updated, duplicate: false, receipt: authorityReceipt(updated, operation, 'applied') };
}

export async function transitionEncounterPlan(userId: string, encounterIdValue: string, input: Record<string, any>) {
  const operation = operationMetadata(input);
  const current = await getEncounterPlan(userId, encounterIdValue);
  if (!current) throw new EncounterPlanError(404, 'NOT_FOUND', 'Encounter not found.');
  const target = boundedString(input.toStatus, 40, 'toStatus', true) as EncounterPlanStatus;
  if (!ENCOUNTER_PLAN_STATUSES.includes(target)) throw new EncounterPlanError(400, 'VALIDATION_ERROR', 'toStatus is not supported.');
  const operationFingerprint = fingerprint({ toStatus: target });
  const replay = matchingReceipt(current, operation, 'transition', operationFingerprint);
  if (replay) return { encounter: current, duplicate: true, receipt: authorityReceipt(current, operation, 'no_change') };
  assertRevision(current, input.expectedRevision);
  assertEncounterPlanTransition(current.status, target);
  const readiness = evaluateEncounterReadiness(current);
  if (target === 'ready' && !readiness.ready) {
    throw new EncounterPlanError(409, 'ENCOUNTER_NOT_READY', 'The encounter still has setup blockers.', { readiness });
  }
  if (target === 'active' && current.vcsBinding?.status !== 'active') {
    throw new EncounterPlanError(409, 'BATTLE_ROOM_NOT_ACTIVE', 'VCS must confirm that the BattleRoom is active before GMC starts the encounter.', {
      battleRoomStatus: current.vcsBinding?.status ?? null,
    });
  }
  const revisionNumber = current.revisionNumber + 1;
  const nextRevision = revision(current.id, revisionNumber);
  const updatedAt = new Date();
  const updated = await collection().findOneAndUpdate(
    { _id: current._id, userId, revision: current.revision },
    {
      $set: { status: target, readiness, revisionNumber, revision: nextRevision, updatedAt },
      $push: {
        mutationReceipts: {
          $each: [{ ...operation, fingerprint: operationFingerprint, action: 'transition', revision: nextRevision, appliedAt: updatedAt }],
          $slice: -100,
        },
      } as any,
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new EncounterPlanError(409, 'STALE_ENCOUNTER_REVISION', 'The encounter changed while its status was being updated. Reload it before retrying.');
  return { encounter: updated, duplicate: false, receipt: authorityReceipt(updated, operation, 'applied') };
}

export function createOperationMetadata(prefix = 'gmc-encounter') {
  const id = `${prefix}:${randomUUID()}`;
  return { operationId: id, idempotencyKey: id, correlationId: id };
}
