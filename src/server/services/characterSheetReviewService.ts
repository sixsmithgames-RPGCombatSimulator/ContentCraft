import { createHash } from 'node:crypto';
import { getDb } from '../config/mongo.js';

export const CHARACTER_SHEET_REVIEW_CONTRACT_VERSION = '2026-07-29.1';

const REVIEW_COLLECTION = 'gmc_character_sheet_reviews';
const SHEET_COLLECTIONS = ['items', 'equippedWeapons', 'equippedArmor', 'tools', 'otherEquipment'] as const;
const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;

type JsonRecord = Record<string, any>;
interface CharacterSheetReviewState {
  _id: string;
  userId: string;
  campaignId: string;
  characterId: string;
  characterName?: string | null;
  baseline: JsonRecord;
  pending?: JsonRecord | null;
  history: JsonRecord[];
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function finiteInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function cloneList(value: unknown) {
  return Array.isArray(value) ? structuredClone(value).slice(0, 1_000) : [];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stableValue(nested)]));
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function revisionFrom(sheet: JsonRecord) {
  const revision = String(sheet?.revision?.fingerprint ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(revision)) {
    throw Object.assign(new Error('Character-sheet review requires the 64-character VCS sheet revision.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVISION_REQUIRED',
    });
  }
  return revision;
}

export function normalizeCharacterSheetReviewSnapshot(sheet: unknown) {
  const source = record(sheet);
  const equipment = record(source.equipment);
  const hitPoints = record(source.hitPoints);
  const hitDice = record(source.hitDice);
  const currency = record(source.currency);
  return {
    experiencePoints: finiteInteger(source.experiencePoints),
    hitPoints: {
      current: finiteInteger(hitPoints.current),
      maximum: finiteInteger(hitPoints.maximum ?? hitPoints.max),
      temporary: finiteInteger(hitPoints.temporary ?? hitPoints.temp),
    },
    hitDice: {
      total: String(hitDice.total ?? '').trim().slice(0, 32),
      spent: finiteInteger(hitDice.spent),
    },
    currency: Object.fromEntries(COINS.map((coin) => [coin, finiteInteger(currency[coin])])),
    items: cloneList(source.items),
    equippedWeapons: cloneList(source.equippedWeapons ?? equipment.weapons),
    equippedArmor: cloneList(source.equippedArmor ?? equipment.armor),
    tools: cloneList(source.tools ?? equipment.tools),
    otherEquipment: cloneList(source.otherEquipment ?? equipment.other),
  };
}

function itemName(value: unknown) {
  return String(typeof value === 'string' ? value : (record(value).name ?? record(value).title ?? '')).trim() || 'Unnamed item';
}

function itemIdentity(value: unknown) {
  const item = record(value);
  const stableId = String(item.id ?? item._id ?? item.refId ?? '').trim();
  if (stableId) return `id:${stableId}`;
  const baseName = itemName(value)
    .toLocaleLowerCase()
    .replace(/\+\s*\d+\b/g, '+#')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `name:${baseName || 'unnamed-item'}`;
}

function itemMap(entries: unknown[]) {
  const occurrences = new Map<string, number>();
  return new Map(entries.map((item) => {
    const identity = itemIdentity(item);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return [`${identity}:${occurrence}`, item];
  }));
}

function itemFields(value: unknown): JsonRecord {
  const item = record(value);
  if (typeof value === 'string') return { name: value };
  return {
    name: itemName(value),
    quantity: finiteInteger(item.quantity, 1) || 1,
    type: String(item.type ?? item.kind ?? '').trim() || null,
    rarity: String(item.rarity?.classification ?? item.rarity ?? item.magic?.rarity ?? '').trim() || null,
    weight: String(item.weight ?? item.weight_lbs ?? '').trim() || null,
    description: String(item.description ?? item.properties ?? '').trim() || null,
    magical: item.magical === true || item.magicItem === true || Boolean(item.rarity),
    equipped: item.equipped === true,
    requiresAttunement: item.requiresAttunement === true || item.requires_attunement === true || item.attunement === true,
    attuned: item.attuned === true,
  };
}

function itemChangeSummary(collection: string, before: unknown, after: unknown) {
  const beforeFields = before === undefined ? null : itemFields(before);
  const afterFields = after === undefined ? null : itemFields(after);
  const name = afterFields?.name ?? beforeFields?.name ?? 'Unnamed item';
  if (!beforeFields) return `${name} was added to ${collection}.`;
  if (!afterFields) return `${name} was removed from ${collection}.`;
  const labels: Record<string, string> = {
    name: 'name',
    quantity: 'quantity',
    type: 'type',
    rarity: 'rarity',
    weight: 'weight',
    description: 'description',
    magical: 'magic-item status',
    equipped: 'equipped status',
    requiresAttunement: 'attunement requirement',
    attuned: 'attuned status',
  };
  const fields = Object.keys(labels).filter((key) => stableJson(beforeFields[key]) !== stableJson(afterFields[key]));
  return `${name}: ${fields.map((field) => labels[field]).join(', ') || 'item details'} changed.`;
}

export function describeCharacterSheetChanges(beforeSheet: unknown, afterSheet: unknown) {
  const before = normalizeCharacterSheetReviewSnapshot(beforeSheet);
  const after = normalizeCharacterSheetReviewSnapshot(afterSheet);
  const changes: JsonRecord[] = [];
  const scalarFields = [
    ['experiencePoints', 'Experience points'],
    ['hitPoints.current', 'Current hit points'],
    ['hitPoints.maximum', 'Maximum hit points'],
    ['hitPoints.temporary', 'Temporary hit points'],
    ['hitDice.total', 'Total hit dice'],
    ['hitDice.spent', 'Spent hit dice'],
    ...COINS.map((coin) => [`currency.${coin}`, coin.toUpperCase()]),
  ] as const;
  const readPath = (source: JsonRecord, path: string) => path.split('.').reduce((value, key) => value?.[key], source);
  for (const [path, label] of scalarFields) {
    const previous = readPath(before, path);
    const current = readPath(after, path);
    if (stableJson(previous) === stableJson(current)) continue;
    const delta = typeof previous === 'number' && typeof current === 'number' ? current - previous : null;
    changes.push({
      kind: 'resource',
      path,
      label,
      before: previous,
      after: current,
      delta,
      summary: `${label}: ${previous || 0} → ${current || 0}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}.`,
    });
  }
  for (const collection of SHEET_COLLECTIONS) {
    const previousEntries = before[collection] as unknown[];
    const currentEntries = after[collection] as unknown[];
    const previous = itemMap(previousEntries);
    const current = itemMap(currentEntries);
    const keys = new Set([...previous.keys(), ...current.keys()]);
    for (const key of keys) {
      const oldItem = previous.get(key);
      const newItem = current.get(key);
      if (stableJson(oldItem) === stableJson(newItem)) continue;
      changes.push({
        kind: oldItem === undefined ? 'item_added' : (newItem === undefined ? 'item_removed' : 'item_changed'),
        collection,
        name: itemName(newItem ?? oldItem),
        before: oldItem === undefined ? null : structuredClone(oldItem),
        after: newItem === undefined ? null : structuredClone(newItem),
        summary: itemChangeSummary(collection, oldItem, newItem),
      });
    }
  }
  return changes;
}

function stateId(userId: string, campaignId: string, characterId: string) {
  return `sheet-review-${createHash('sha256').update(`${userId}\0${campaignId}\0${characterId}`).digest('hex').slice(0, 32)}`;
}

function reviewId(baselineRevision: string, currentRevision: string, changes: unknown[]) {
  return `csr-${createHash('sha256').update(stableJson({ baselineRevision, currentRevision, changes })).digest('hex').slice(0, 32)}`;
}

function reviewResponse(state: JsonRecord, seeded = false) {
  return {
    authority: 'gmc.character-sheet-review',
    contractVersion: CHARACTER_SHEET_REVIEW_CONTRACT_VERSION,
    status: state.pending ? 'pending_review' : 'confirmed',
    seeded,
    characterId: state.characterId,
    characterName: state.characterName ?? null,
    baseline: state.baseline,
    pending: state.pending ?? null,
    history: Array.isArray(state.history) ? state.history.slice(-20) : [],
  };
}

export async function observeCharacterSheetReview(userId: string, campaignId: string, input: JsonRecord) {
  const characterId = String(input.characterId ?? '').trim();
  if (!userId || !campaignId || !characterId) {
    throw Object.assign(new Error('Character-sheet review requires user, campaign, and character identity.'), {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const sheet = record(input.sheet);
  const currentRevision = revisionFrom(sheet);
  const snapshot = normalizeCharacterSheetReviewSnapshot(sheet);
  const collection = getDb().collection<CharacterSheetReviewState>(REVIEW_COLLECTION);
  const _id = stateId(userId, campaignId, characterId);
  let state = await collection.findOne({ _id, userId, campaignId, characterId });
  if (!state) {
    const now = new Date();
    const baseline = {
      revision: currentRevision,
      snapshot,
      acceptedAt: now,
      reason: 'Initial authoritative VCS character-sheet snapshot.',
      source: 'vcs_initial_link',
    };
    await collection.updateOne(
      { _id },
      {
        $setOnInsert: {
          _id, userId, campaignId, characterId,
          characterName: String(input.characterName ?? '').trim() || null,
          baseline,
          pending: null,
          history: [],
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    state = await collection.findOne({ _id, userId, campaignId, characterId });
    return reviewResponse(state ?? { characterId, baseline, pending: null, history: [] }, true);
  }
  if (state.baseline?.revision === currentRevision) {
    if (state.pending) {
      const updated = await collection.findOneAndUpdate(
        { _id, 'baseline.revision': currentRevision, 'pending.reviewId': state.pending.reviewId },
        { $set: { pending: null, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!updated) {
        throw Object.assign(new Error('The character-sheet baseline changed while GMC was observing it. Refresh and retry.'), {
          status: 409,
          code: 'CHARACTER_SHEET_REVIEW_STALE',
        });
      }
      state = updated;
    }
    return reviewResponse(state);
  }
  const changes = describeCharacterSheetChanges(state.baseline?.snapshot ?? {}, snapshot);
  if (changes.length === 0) {
    const baseline = { ...state.baseline, revision: currentRevision, snapshot, acceptedAt: new Date(), source: 'vcs_nonmaterial_revision' };
    const updated = await collection.findOneAndUpdate(
      { _id, 'baseline.revision': state.baseline.revision },
      { $set: { baseline, pending: null, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw Object.assign(new Error('The character-sheet baseline changed while GMC was observing it. Refresh and retry.'), {
        status: 409,
        code: 'CHARACTER_SHEET_REVIEW_STALE',
      });
    }
    return reviewResponse(updated);
  }
  const pending = {
    reviewId: reviewId(state.baseline.revision, currentRevision, changes),
    baselineRevision: state.baseline.revision,
    currentRevision,
    observedAt: new Date(),
    before: structuredClone(state.baseline.snapshot),
    after: snapshot,
    changes,
  };
  const updated = await collection.findOneAndUpdate(
    { _id, 'baseline.revision': state.baseline.revision },
    { $set: { pending, characterName: String(input.characterName ?? state.characterName ?? '').trim() || null, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw Object.assign(new Error('The character-sheet baseline changed while GMC was observing it. Refresh and retry.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVIEW_STALE',
    });
  }
  return reviewResponse(updated);
}

export async function resolveCharacterSheetReview(userId: string, campaignId: string, characterId: string, input: JsonRecord) {
  const action = String(input.action ?? '').trim();
  const requestedReviewId = String(input.reviewId ?? '').trim();
  if (!['keep', 'revert'].includes(action) || !requestedReviewId) {
    throw Object.assign(new Error('Character-sheet review resolution requires action keep|revert and reviewId.'), {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const collection = getDb().collection<CharacterSheetReviewState>(REVIEW_COLLECTION);
  const _id = stateId(userId, campaignId, characterId);
  const state = await collection.findOne({ _id, userId, campaignId, characterId });
  const pending = state?.pending;
  if (!state || !pending || pending.reviewId !== requestedReviewId) {
    throw Object.assign(new Error('This character-sheet review is no longer current. Refresh before resolving it.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVIEW_STALE',
    });
  }
  const resolutionSheet = record(input.sheet);
  const resolutionRevision = revisionFrom(resolutionSheet);
  const resolutionSnapshot = normalizeCharacterSheetReviewSnapshot(resolutionSheet);
  const reason = String(input.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 1_000);
  if (action === 'keep' && reason.length < 8) {
    throw Object.assign(new Error('Keeping a player character-sheet change requires a reason of at least 8 characters.'), {
      status: 400,
      code: 'CHARACTER_SHEET_REVIEW_REASON_REQUIRED',
    });
  }
  if (action === 'keep' && resolutionRevision !== pending.currentRevision) {
    throw Object.assign(new Error('The VCS sheet changed again before this review was kept. Refresh and review the newest changes.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVIEW_STALE',
    });
  }
  if (action === 'revert' && stableJson(resolutionSnapshot) !== stableJson(state.baseline.snapshot)) {
    throw Object.assign(new Error('VCS did not confirm the exact reviewed baseline, so GMC did not mark the revert complete.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVERT_NOT_CONFIRMED',
    });
  }
  const resolvedAt = new Date();
  const resolution = {
    reviewId: pending.reviewId,
    action,
    reason: action === 'keep' ? reason : (reason || 'Reverted to the last GMC-confirmed VCS character sheet.'),
    resolvedAt,
    baselineRevision: pending.baselineRevision,
    reviewedRevision: pending.currentRevision,
    resultRevision: resolutionRevision,
    changes: pending.changes,
  };
  const baseline = action === 'keep'
    ? { revision: pending.currentRevision, snapshot: pending.after, acceptedAt: resolvedAt, reason, source: 'human_review_keep' }
    : { revision: resolutionRevision, snapshot: resolutionSnapshot, acceptedAt: resolvedAt, reason: resolution.reason, source: 'human_review_revert' };
  const updated = await collection.findOneAndUpdate(
    { _id, userId, campaignId, characterId, 'pending.reviewId': requestedReviewId },
    {
      $set: {
        baseline,
        pending: null,
        history: [...(Array.isArray(state.history) ? state.history : []), resolution].slice(-100),
        updatedAt: resolvedAt,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw Object.assign(new Error('This character-sheet review was resolved elsewhere. Refresh before continuing.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVIEW_STALE',
    });
  }
  return { ...reviewResponse(updated), resolution };
}

export async function confirmCharacterSheetAuthorityMutation(userId: string, campaignId: string, input: JsonRecord) {
  const characterId = String(input.characterId ?? '').trim();
  const expectedBaselineRevision = String(input.expectedBaselineRevision ?? '').trim();
  const mutationId = String(input.mutationId ?? '').trim();
  const reason = String(input.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 1_000);
  const sheet = record(input.sheet);
  const resultRevision = revisionFrom(sheet);
  if (!characterId || !expectedBaselineRevision || !mutationId || !reason) {
    throw Object.assign(new Error('Confirming a GMA sheet mutation requires characterId, expected baseline, mutationId, reason, and sheet.'), {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const collection = getDb().collection<CharacterSheetReviewState>(REVIEW_COLLECTION);
  const _id = stateId(userId, campaignId, characterId);
  const state = await collection.findOne({ _id, userId, campaignId, characterId });
  const confirmedAt = new Date();
  const history = {
    action: 'gma_confirmed',
    mutationId,
    reason,
    resolvedAt: confirmedAt,
    baselineRevision: expectedBaselineRevision,
    resultRevision,
  };
  const updated = await collection.findOneAndUpdate(
    { _id, userId, campaignId, characterId, 'baseline.revision': expectedBaselineRevision, pending: null },
    {
      $set: {
        baseline: {
          revision: resultRevision,
          snapshot: normalizeCharacterSheetReviewSnapshot(sheet),
          acceptedAt: confirmedAt,
          reason,
          source: 'gma_confirmed_mutation',
        },
        history: [...(Array.isArray(state?.history) ? state.history : []), history].slice(-100),
        updatedAt: confirmedAt,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw Object.assign(new Error('GMA did not advance the sheet baseline because a player edit is pending or the baseline changed.'), {
      status: 409,
      code: 'CHARACTER_SHEET_REVIEW_REQUIRED',
    });
  }
  return reviewResponse(updated);
}
