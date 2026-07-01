import { randomUUID } from 'node:crypto';
import { getDb, getCanonEntitiesCollection } from '../config/mongo.js';
import { generateProjectEntityId, type EntityType } from '../models/CanonEntity.js';

const now = () => new Date();

export type GmcEntityKind = 'npc' | 'location' | 'item' | 'faction';

export const MEMORY_RECORD_TYPES = ['FACT', 'ITEM', 'EVENT'] as const;
export const GEOGRAPHIC_SCOPE_TIERS = ['world', 'city', 'district', 'site', 'room'] as const;
export const ENTITY_SCOPE_TIERS = ['bbeg', 'lieutenant', 'henchman', 'contact'] as const;
export const ITEM_TIERS = ['plot', 'mundane', 'currency', 'furniture'] as const;

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return values.includes(String(value) as T[number]);
}

function normalizeScope(input: Record<string, any>) {
  const supplied = input.scope ?? {};
  const rawTier = supplied.tier ?? input.scopeTier ?? input.category;
  const hasRelatedEntity = Boolean(supplied.entityId ?? input.scopeEntityId ?? input.relatedEntityIds?.[0]);
  const hasRelatedLocation = Boolean(supplied.locationId ?? input.scopeLocationId ?? input.relatedLocationIds?.[0]);
  const inferredTier = includes(GEOGRAPHIC_SCOPE_TIERS, rawTier)
    ? String(rawTier)
    : (hasRelatedLocation ? 'site' : 'world');
  const kind = supplied.kind === 'entity' || includes(ENTITY_SCOPE_TIERS, rawTier) || (hasRelatedEntity && !hasRelatedLocation)
    ? 'entity'
    : 'geographic';
  const tier = kind === 'entity'
    ? (includes(ENTITY_SCOPE_TIERS, supplied.tier ?? input.scopeTier) ? String(supplied.tier ?? input.scopeTier) : 'contact')
    : (includes(GEOGRAPHIC_SCOPE_TIERS, inferredTier) ? inferredTier : 'world');
  return {
    kind, tier,
    locationId: supplied.locationId ?? input.scopeLocationId ?? input.relatedLocationIds?.[0] ?? null,
    entityId: supplied.entityId ?? input.scopeEntityId ?? input.relatedEntityIds?.[0] ?? null,
  };
}

export async function listEntities(userId: string, campaignId: string, kind: GmcEntityKind, search?: string) {
  const filter: Record<string, unknown> = { userId, project_id: campaignId, type: kind };
  if (search) filter.canonical_name = { $regex: search, $options: 'i' };
  return getCanonEntitiesCollection().find(filter).sort({ canonical_name: 1 }).limit(250).toArray();
}

export async function getEntity(userId: string, id: string, kind?: GmcEntityKind) {
  const filter: Record<string, unknown> = { _id: id, userId };
  if (kind) filter.type = kind;
  return getCanonEntitiesCollection().findOne(filter);
}

export async function createEntity(userId: string, campaignId: string, kind: GmcEntityKind, input: Record<string, any>) {
  const name = String(input.name || input.canonical_name || '').trim();
  if (!name) throw new Error('name is required');
  const baseId = generateProjectEntityId(campaignId, kind as EntityType, name);
  const doc: any = {
    _id: `${baseId}_${randomUUID().slice(0, 8)}`,
    userId,
    scope: `proj_${campaignId}`,
    project_id: campaignId,
    type: kind,
    canonical_name: name,
    aliases: Array.isArray(input.aliases) ? input.aliases : [],
    claims: Array.isArray(input.claims) ? input.claims : [],
    relationships: Array.isArray(input.relationships) ? input.relationships : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    source: input.source || 'gamemastercraft',
    version: '1.0.0',
    details: kind === 'item' ? {
      ...(input.details ?? input),
      memory: {
        recordType: 'ITEM',
        tier: includes(ITEM_TIERS, input.itemTier ?? input.details?.memory?.tier) ? String(input.itemTier ?? input.details?.memory?.tier) : 'mundane',
        currentLocationId: input.currentLocationId ?? input.details?.memory?.currentLocationId ?? null,
        ownerEntityId: input.ownerEntityId ?? input.details?.memory?.ownerEntityId ?? null,
        ownerType: input.ownerType ?? input.details?.memory?.ownerType ?? null,
      },
    } : {
      ...(input.details ?? input),
      ...(kind === 'npc' ? { entityTier: includes(ENTITY_SCOPE_TIERS, input.entityTier ?? input.details?.entityTier) ? String(input.entityTier ?? input.details?.entityTier) : 'contact' } : {}),
    },
    status: input.status ?? 'active',
    draft: Boolean(input.draft),
    created_at: now(),
    updated_at: now(),
  };
  await getCanonEntitiesCollection().insertOne(doc);
  return doc;
}

export async function updateEntity(userId: string, id: string, kind: GmcEntityKind, input: Record<string, any>) {
  const allowed: Record<string, unknown> = {};
  if (input.name !== undefined) allowed.canonical_name = String(input.name);
  for (const key of ['aliases', 'claims', 'relationships', 'tags', 'details', 'status', 'draft', 'source']) {
    if (input[key] !== undefined) allowed[key] = input[key];
  }
  if (kind === 'npc' && input.entityTier !== undefined) allowed['details.entityTier'] = includes(ENTITY_SCOPE_TIERS, input.entityTier) ? String(input.entityTier) : 'contact';
  if (kind === 'item') {
    if (input.itemTier !== undefined) allowed['details.memory.tier'] = includes(ITEM_TIERS, input.itemTier) ? String(input.itemTier) : 'mundane';
    for (const key of ['currentLocationId', 'ownerEntityId', 'ownerType']) {
      if (input[key] !== undefined) allowed[`details.memory.${key}`] = input[key];
    }
  }
  allowed.updated_at = now();
  return getCanonEntitiesCollection().findOneAndUpdate(
    { _id: id, userId, type: kind },
    { $set: allowed },
    { returnDocument: 'after' }
  );
}

export async function listFacts(userId: string, campaignId: string, query: Record<string, any> = {}) {
  const filter: Record<string, any> = { userId, campaignId, supersededAt: null };
  if (query.locked !== undefined) filter.locked = String(query.locked) === 'true';
  if (query.category) filter.category = query.category;
  if (query.entityId) filter.relatedEntityIds = query.entityId;
  if (query.search) filter.text = { $regex: String(query.search), $options: 'i' };
  return getDb().collection<any>('gmc_facts').find(filter).sort({ createdAt: -1 }).limit(500).toArray();
}

export async function createFact(userId: string, campaignId: string, input: Record<string, any>) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text is required');
  const doc = {
    _id: randomUUID(), userId, campaignId, text, recordType: 'FACT', scope: normalizeScope(input),
    category: input.category ?? 'event',
    relatedEntityIds: input.relatedEntityIds ?? [], relatedLocationIds: input.relatedLocationIds ?? [],
    source: input.source ?? { system: 'gamemastercraft' },
    locked: Boolean(input.locked), secret: Boolean(input.secret),
    supersededAt: null, supersededByFactId: null, supersedeReason: null,
    createdAt: now(), updatedAt: now(),
  };
  await getDb().collection<any>('gmc_facts').insertOne(doc);
  return doc;
}

export async function buildMemoryContext(
  userId: string,
  campaignId: string,
  context: { currentLocationId?: string | null; presentNpcIds?: string[] } = {}
) {
  const [facts, items, npcs, locations, events] = await Promise.all([
    listFacts(userId, campaignId),
    listEntities(userId, campaignId, 'item'),
    listEntities(userId, campaignId, 'npc'),
    listEntities(userId, campaignId, 'location'),
    listThreads(userId, campaignId, { status: 'open' }),
  ]);
  return selectMemoryContext({ facts, items, npcs, locations, events }, context);
}

export function selectMemoryContext(
  records: { facts: any[]; items: any[]; npcs: any[]; locations: any[]; events: any[] },
  context: { currentLocationId?: string | null; presentNpcIds?: string[] } = {}
) {
  const { facts, items, npcs, locations, events } = records;
  const locationById = new Map(locations.map((location: any) => [String(location._id), location]));
  const locationAncestry = new Set<string>();
  let cursor = context.currentLocationId ? String(context.currentLocationId) : '';
  while (cursor && !locationAncestry.has(cursor)) {
    locationAncestry.add(cursor);
    const location: any = locationById.get(cursor);
    cursor = String(location?.details?.parentLocationId ?? location?.details?.parent_location_id ?? '');
  }
  const present = new Set((context.presentNpcIds ?? []).map(String));
  const relevantFacts = facts.filter((fact: any) => {
    const scope = fact.scope ?? normalizeScope(fact);
    if (scope.kind === 'entity') {
      if (scope.tier === 'bbeg' || scope.tier === 'lieutenant') return true;
      const ids = [scope.entityId, ...(fact.relatedEntityIds ?? [])].filter(Boolean).map(String);
      return ids.some((id) => present.has(id));
    }
    if (scope.tier === 'world') return true;
    const ids = [scope.locationId, ...(fact.relatedLocationIds ?? [])].filter(Boolean).map(String);
    return ids.some((id) => locationAncestry.has(id));
  });
  const relevantItems = items.filter((item: any) => {
    if (item.status === 'superseded') return false;
    const memory = item.details?.memory ?? {};
    // Legacy items predate memory tiers. Treat them as plot-significant so a schema
    // migration can never silently remove a previously visible canonical object.
    const tier = includes(ITEM_TIERS, memory.tier) ? memory.tier : (item.details?.memory ? 'mundane' : 'plot');
    if (tier === 'plot') return true;
    if (memory.ownerType === 'player') return true;
    return (memory.currentLocationId && locationAncestry.has(String(memory.currentLocationId)))
      || (memory.ownerEntityId && present.has(String(memory.ownerEntityId)));
  });
  const relevantEvents = events.filter((event: any) => {
    const deadlineTime = event.deadlineAt ? Date.parse(String(event.deadlineAt)) : Number.NaN;
    if (Number.isFinite(deadlineTime) && deadlineTime <= Date.now()) return true;
    const scope = event.scope ?? {};
    if (!scope.kind || scope.tier === 'world') return true;
    if (scope.kind === 'entity') {
      if (scope.tier === 'bbeg' || scope.tier === 'lieutenant') return true;
      return Boolean(scope.entityId && present.has(String(scope.entityId)));
    }
    return Boolean(scope.locationId && locationAncestry.has(String(scope.locationId)));
  });
  const relevantNpcs = npcs.filter((npc: any) => {
    if (npc.status === 'superseded') return false;
    const tier = npc.details?.entityTier ?? 'contact';
    return tier === 'bbeg' || tier === 'lieutenant' || present.has(String(npc._id));
  });
  return {
    currentLocationId: context.currentLocationId ?? null,
    locationAncestry: [...locationAncestry],
    facts: relevantFacts,
    items: relevantItems,
    events: relevantEvents.map((event: any) => {
      const deadlineTime = event.deadlineAt ? Date.parse(String(event.deadlineAt)) : Number.NaN;
      const deadlineState = Number.isFinite(deadlineTime)
        ? (deadlineTime <= Date.now() ? 'due' : 'scheduled')
        : (event.deadlineDescription ? 'trigger-based' : 'legacy-unspecified');
      return { ...event, recordType: 'EVENT', deadlineState };
    }),
    entities: relevantNpcs,
    retrieval: {
      included: { facts: relevantFacts.length, items: relevantItems.length, events: relevantEvents.length, entities: relevantNpcs.length },
      excluded: { facts: facts.length - relevantFacts.length, items: items.length - relevantItems.length, events: events.length - relevantEvents.length, entities: npcs.length - relevantNpcs.length },
    },
  };
}

export async function listThreads(userId: string, campaignId: string, query: Record<string, any> = {}) {
  const filter: Record<string, any> = { userId, campaignId };
  if (query.status) filter.status = query.status;
  if (query.relatedNpcId) filter.relatedNpcIds = query.relatedNpcId;
  return getDb().collection<any>('gmc_threads').find(filter).sort({ updatedAt: -1 }).limit(500).toArray();
}

export function contradictionCandidates(proposed: string, lockedFacts: Array<Record<string, any>>) {
  const words = new Set(proposed.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const proposedNegated = /\b(no|not|never|none|without|isn't|wasn't|cannot|can't)\b/i.test(proposed);
  return lockedFacts.flatMap((fact) => {
    const factWords = new Set(String(fact.text).toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
    const overlap = [...words].filter((word) => factWords.has(word)).length;
    const denominator = Math.max(1, Math.min(words.size, factWords.size));
    const factNegated = /\b(no|not|never|none|without|isn't|wasn't|cannot|can't)\b/i.test(String(fact.text));
    return overlap / denominator >= 0.4 && proposedNegated !== factNegated
      ? [{ lockedFactId: fact._id, lockedFactText: fact.text, severity: overlap / denominator >= 0.7 ? 'high' : 'medium' }]
      : [];
  });
}

export const collections = {
  entities: () => getCanonEntitiesCollection(),
  scenes: () => getDb().collection<any>('gmc_scenes'),
  state: () => getDb().collection<any>('gmc_campaign_state'),
  facts: () => getDb().collection<any>('gmc_facts'),
  threads: () => getDb().collection<any>('gmc_threads'),
  sessions: () => getDb().collection<any>('gmc_sessions'),
};
