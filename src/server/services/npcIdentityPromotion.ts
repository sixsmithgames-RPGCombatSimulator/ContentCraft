import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getCanonEntitiesCollection } from '../config/mongo.js';
import {
  NPC_IDENTITY_CONTRACT_VERSION,
  NPC_NARRATIVE_DEPTHS,
  isCanonicalNpcName,
  maxNpcNarrativeDepth,
  normalizeNpcIdentitySeed,
} from './npcIdentity.js';

export const NPC_IDENTITY_PROMOTION_CONTRACT_VERSION = 'gmc.npc-identity-promotion/1';
export const NPC_IDENTITY_PROMOTION_RECEIPT_CONTRACT_VERSION = 'gmc.npc-identity-promotion-receipt/1';

interface NpcRecord {
  _id: string;
  userId: string;
  project_id: string;
  type: 'npc';
  canonical_name: string;
  canonicalIdentityKey?: string;
  aliases?: string[];
  details?: Record<string, any>;
  revision?: number;
  version?: string;
  status?: string;
  audit_trail?: Array<Record<string, any>>;
  updated_at?: Date;
  [key: string]: any;
}

export interface PromoteExistingNpcIdentityInput {
  schemaVersion: typeof NPC_IDENTITY_PROMOTION_CONTRACT_VERSION;
  userId: string;
  campaignId: string;
  npcId: string;
  expectedRevision: number;
  roleSeed: {
    displayLabel: string;
    profession?: string;
    title?: string;
    role?: string;
    affiliationRefs?: string[];
  };
  requiredIdentityMaturity: 'canonical_private';
  requiredNarrativeDepth: typeof NPC_NARRATIVE_DEPTHS[number];
  unavailableNames?: string[];
  reason: string;
  idempotencyKey: string;
  correlationId?: string;
}

type NpcCollection = Collection<NpcRecord>;

function collection(): NpcCollection {
  return getCanonEntitiesCollection() as unknown as NpcCollection;
}

function fail(status: number, code: string, message: string, details: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { status, code, details });
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, field: string, max = 240): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > max || /[\x00-\x1F\x7F]/.test(result)) {
    fail(400, 'NPC_IDENTITY_PROMOTION_INVALID', `${field} is invalid.`, { field });
  }
  return result;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    fail(400, 'NPC_IDENTITY_PROMOTION_INVALID', `${field} is not a stable identifier.`, { field });
  }
  return result;
}

function identityKey(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/[‘’]/g, "'").toLocaleLowerCase()
    .replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(input: PromoteExistingNpcIdentityInput) {
  return createHash('sha256').update(canonicalJson({
    schemaVersion: input.schemaVersion,
    campaignId: input.campaignId,
    npcId: input.npcId,
    expectedRevision: input.expectedRevision,
    roleSeed: input.roleSeed,
    requiredIdentityMaturity: input.requiredIdentityMaturity,
    requiredNarrativeDepth: input.requiredNarrativeDepth,
    unavailableNames: input.unavailableNames ?? [],
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  }), 'utf8').digest('hex');
}

function currentRevision(record: NpcRecord) {
  return Math.max(1, Number(record.revision ?? 1));
}

function receipt(record: NpcRecord, status: 'applied' | 'no_change', duplicate: boolean) {
  const details = plainObject(record.details) ? record.details : {};
  const identity = plainObject(details.identity) ? details.identity : {};
  return {
    schemaVersion: NPC_IDENTITY_PROMOTION_CONTRACT_VERSION,
    npcId: record._id,
    revision: currentRevision(record),
    privateCanonicalName: record.canonical_name,
    displayLabel: String(details.displayLabel ?? identity.displayLabel ?? record.canonical_name),
    aliases: Array.isArray(record.aliases) ? record.aliases : [],
    identityMaturity: String(identity.identityMaturity ?? (identity.nameKnownToPlayers ? 'canonical_player_known' : 'canonical_private')),
    revealState: String(identity.revealState ?? (identity.nameKnownToPlayers ? 'known' : 'not_known')),
    narrativeDepth: String(details.narrativeDepth ?? 'surface'),
    mechanicalDepth: String(details.mechanicalDepth ?? 'none'),
    duplicate,
    authorityReceipt: {
      contractVersion: NPC_IDENTITY_PROMOTION_RECEIPT_CONTRACT_VERSION,
      authority: 'gmc',
      status,
      authoritativeStateChanged: status === 'applied' && !duplicate,
      npcId: record._id,
      authorityRevision: String(currentRevision(record)),
    },
    npc: record,
  };
}

/**
 * Promotes one existing individual role seed in place. It never creates an NPC,
 * changes presence, or reveals the private name to players.
 */
export async function promoteExistingNpcIdentity(
  input: PromoteExistingNpcIdentityInput,
  records: NpcCollection = collection(),
) {
  if (!plainObject(input) || input.schemaVersion !== NPC_IDENTITY_PROMOTION_CONTRACT_VERSION) {
    fail(422, 'NPC_IDENTITY_PROMOTION_SCHEMA_UNSUPPORTED', 'The NPC identity-promotion contract is not supported.', {
      supportedSchemaVersions: [NPC_IDENTITY_PROMOTION_CONTRACT_VERSION],
    });
  }
  const userId = text(input.userId, 'userId', 254);
  const campaignId = identifier(input.campaignId, 'campaignId');
  const npcId = identifier(input.npcId, 'npcId');
  const idempotencyKey = identifier(input.idempotencyKey, 'idempotencyKey');
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    fail(400, 'NPC_IDENTITY_PROMOTION_INVALID', 'expectedRevision must be a positive integer.', { field: 'expectedRevision' });
  }
  if (input.requiredIdentityMaturity !== 'canonical_private') {
    fail(422, 'NPC_IDENTITY_PROMOTION_REVEAL_FORBIDDEN', 'Preparation may create a private identity but cannot reveal it.', {
      requiredIdentityMaturity: input.requiredIdentityMaturity,
    });
  }
  if (!(NPC_NARRATIVE_DEPTHS as readonly string[]).includes(String(input.requiredNarrativeDepth))) {
    fail(422, 'NPC_IDENTITY_PROMOTION_INVALID', 'requiredNarrativeDepth is invalid.', { field: 'requiredNarrativeDepth' });
  }
  if (!plainObject(input.roleSeed)) fail(400, 'NPC_IDENTITY_PROMOTION_INVALID', 'roleSeed must be an object.', { field: 'roleSeed' });
  const displayLabel = text(input.roleSeed.displayLabel, 'roleSeed.displayLabel', 200);
  const reason = text(input.reason, 'reason', 1_000);
  const unavailableNames = Array.isArray(input.unavailableNames)
    ? [...new Set(input.unavailableNames.slice(0, 250).map((name, index) => text(name, `unavailableNames[${index}]`, 200)))]
    : [];
  const hash = requestHash({ ...input, userId, campaignId, npcId, idempotencyKey, reason, unavailableNames });

  const current = await records.findOne({
    _id: npcId, userId, project_id: campaignId, type: 'npc', status: { $ne: 'superseded' },
  } as any);
  if (!current) return null;
  const priorOperation = (Array.isArray(current.audit_trail) ? current.audit_trail : []).find((event) => (
    event.action === 'identity_promoted' && event.idempotencyKey === idempotencyKey
  ));
  if (priorOperation) {
    if (priorOperation.requestHash !== hash) {
      fail(409, 'NPC_IDENTITY_PROMOTION_IDEMPOTENCY_CONFLICT', 'The identity-promotion key was already used for a different request.', {});
    }
    return receipt(current, 'applied', true);
  }
  const revision = currentRevision(current);
  if (revision !== expectedRevision) {
    fail(409, 'NPC_IDENTITY_PROMOTION_REVISION_CONFLICT', 'The NPC changed before identity preparation could be applied.', {
      npcId, expectedRevision, actualRevision: revision,
    });
  }

  const otherNpcs = await records.find({
    userId, project_id: campaignId, type: 'npc', status: { $ne: 'superseded' }, _id: { $ne: npcId },
  } as any).project({ canonical_name: 1, aliases: 1 }).toArray();
  const occupied = [
    ...otherNpcs.flatMap((npc) => [npc.canonical_name, ...(Array.isArray(npc.aliases) ? npc.aliases : [])]),
    ...unavailableNames,
  ].map(String).filter(Boolean);
  const currentDetails = plainObject(current.details) ? current.details : {};
  const identity = plainObject(currentDetails.identity) ? currentDetails.identity : {};
  const currentNameIsCanonical = isCanonicalNpcName(current.canonical_name);
  const normalized = normalizeNpcIdentitySeed({
    name: current.canonical_name || displayLabel,
    aliases: current.aliases ?? [],
    displayLabel,
    profession: input.roleSeed.profession ?? currentDetails.profession ?? currentDetails.occupation,
    title: input.roleSeed.title ?? currentDetails.title,
    role: input.roleSeed.role ?? currentDetails.role,
    narrativeDepth: maxNpcNarrativeDepth(currentDetails.narrativeDepth, input.requiredNarrativeDepth),
    mechanicalDepth: currentDetails.mechanicalDepth ?? 'none',
    nameKnownToPlayers: Boolean(identity.nameKnownToPlayers),
    details: currentDetails,
  }, {
    campaignId,
    mutationId: idempotencyKey,
    unavailableNames: occupied,
    source: 'gmc-npc-identity-promotion',
  });
  const canonicalName = currentNameIsCanonical ? current.canonical_name : normalized.name;
  const aliases = [...new Set([
    ...(Array.isArray(normalized.aliases) ? normalized.aliases : []),
    ...(!currentNameIsCanonical && current.canonical_name ? [current.canonical_name] : []),
  ].map(String).map((value) => value.trim()).filter(Boolean))];
  const proposedKeys = new Set([canonicalName, ...aliases].map(identityKey).filter(Boolean));
  const conflicts = otherNpcs.filter((npc) => [npc.canonical_name, ...(Array.isArray(npc.aliases) ? npc.aliases : [])]
    .some((name) => proposedKeys.has(identityKey(name))));
  if (conflicts.length) {
    fail(409, 'NPC_IDENTITY_PROMOTION_NAME_CONFLICT', 'The prepared identity conflicts with an existing NPC.', {
      npcId,
      conflictingNpcIds: conflicts.map((npc) => npc._id),
    });
  }
  const nameKnownToPlayers = Boolean(identity.nameKnownToPlayers);
  const normalizedIdentity = plainObject(normalized.details.identity) ? normalized.details.identity : {};
  const nextDetails = {
    ...currentDetails,
    ...normalized.details,
    name: canonicalName,
    displayLabel: nameKnownToPlayers ? canonicalName : displayLabel,
    ...(input.roleSeed.affiliationRefs ? { affiliationRefs: input.roleSeed.affiliationRefs.slice(0, 20).map(String) } : {}),
    identity: {
      ...(currentNameIsCanonical && Object.keys(identity).length ? identity : normalizedIdentity),
      canonicalName,
      displayLabel: nameKnownToPlayers ? canonicalName : displayLabel,
      nameKnownToPlayers,
      identityMaturity: nameKnownToPlayers ? 'canonical_player_known' : 'canonical_private',
      revealState: nameKnownToPlayers ? 'known' : String(identity.revealState ?? 'not_known'),
      revealEligibility: String(identity.revealEligibility ?? 'self_introduction_on_arrival'),
    },
    narrativeDepth: maxNpcNarrativeDepth(currentDetails.narrativeDepth, input.requiredNarrativeDepth),
    mechanicalDepth: currentDetails.mechanicalDepth ?? 'none',
    profileLifecycle: {
      ...(plainObject(currentDetails.profileLifecycle) ? currentDetails.profileLifecycle : {}),
      contractVersion: NPC_IDENTITY_CONTRACT_VERSION,
      narrativeDepth: maxNpcNarrativeDepth(currentDetails.narrativeDepth, input.requiredNarrativeDepth),
      mechanicalDepth: currentDetails.mechanicalDepth ?? 'none',
    },
  };
  const alreadyPrepared = currentNameIsCanonical
    && ['canonical_private', 'canonical_player_known'].includes(String(identity.identityMaturity))
    && nextDetails.narrativeDepth === currentDetails.narrativeDepth
    && canonicalJson(currentDetails) === canonicalJson(nextDetails);
  if (alreadyPrepared) return receipt(current, 'no_change', false);

  const timestamp = new Date();
  (nextDetails.profileLifecycle as Record<string, unknown>).lastIdentityPromotedAt = timestamp;
  const event = {
    at: timestamp,
    action: 'identity_promoted',
    schemaVersion: NPC_IDENTITY_PROMOTION_CONTRACT_VERSION,
    idempotencyKey,
    requestHash: hash,
    priorPublicLabel: displayLabel,
    identityMaturity: nameKnownToPlayers ? 'canonical_player_known' : 'canonical_private',
    narrativeDepth: nextDetails.narrativeDepth,
    reason,
    correlationId: String(input.correlationId ?? '').slice(0, 240) || null,
  };
  let updated: NpcRecord | null;
  try {
    updated = await records.findOneAndUpdate(
      {
        _id: npcId, userId, project_id: campaignId, type: 'npc', status: { $ne: 'superseded' },
        ...(current.revision === undefined ? { revision: { $exists: false } } : { revision: current.revision }),
      } as any,
      {
        $set: {
          canonical_name: canonicalName,
          canonicalIdentityKey: identityKey(canonicalName),
          aliases,
          details: nextDetails,
          revision: revision + 1,
          version: `1.0.${revision}`,
          updated_at: timestamp,
        },
        $push: { audit_trail: { $each: [event], $slice: -100 } },
      } as any,
      { returnDocument: 'after' },
    );
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 11000) {
      fail(409, 'NPC_IDENTITY_PROMOTION_NAME_CONFLICT', 'The prepared identity conflicts with an existing NPC.', { npcId });
    }
    throw error;
  }
  if (!updated) {
    const concurrent = await records.findOne({ _id: npcId, userId, project_id: campaignId, type: 'npc' } as any);
    const replay = concurrent && (Array.isArray(concurrent.audit_trail) ? concurrent.audit_trail : []).find((candidate) => (
      candidate.action === 'identity_promoted' && candidate.idempotencyKey === idempotencyKey && candidate.requestHash === hash
    ));
    if (concurrent && replay) return receipt(concurrent, 'applied', true);
    fail(409, 'NPC_IDENTITY_PROMOTION_REVISION_CONFLICT', 'The NPC changed before identity preparation could be applied.', {
      npcId, expectedRevision, actualRevision: concurrent ? currentRevision(concurrent) : null,
    });
  }
  return receipt(updated, 'applied', false);
}
