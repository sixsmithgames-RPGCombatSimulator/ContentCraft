import { createHash } from 'node:crypto';
import { getDb, getCanonEntitiesCollection } from '../config/mongo.js';
import { generateProjectEntityId, type EntityType } from '../models/CanonEntity.js';
import {
  canonicalMutationDocumentId,
  insertCanonicalMutation,
} from './canonicalMutation.js';

const now = () => new Date();

export type GmcEntityKind = 'npc' | 'monster' | 'location' | 'item' | 'faction';
export type GmcActorKind = Extract<GmcEntityKind, 'npc' | 'monster'>;

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

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function findActorEntity(
  userId: string,
  campaignId: string,
  kind: GmcActorKind,
  input: { canonicalEntityId?: string; name?: string; aliases?: string[] },
) {
  if (input.canonicalEntityId) {
    const byId = await getCanonEntitiesCollection().findOne({
      _id: input.canonicalEntityId,
      userId,
      project_id: campaignId,
      type: kind,
    });
    if (byId) return byId;
  }
  const names = [input.name, ...(input.aliases ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  if (!names.length) return null;
  const exact = names.map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i'));
  return getCanonEntitiesCollection().findOne({
    userId,
    project_id: campaignId,
    type: kind,
    $or: [
      { canonical_name: { $in: exact } },
      { aliases: { $in: exact } },
    ],
  } as any);
}

export async function upsertCanonicalActor(
  userId: string,
  campaignId: string,
  kind: GmcActorKind,
  actor: Record<string, any>,
  generation: Record<string, any>,
  existingId?: string,
) {
  const name = String(actor.name ?? '').trim();
  if (!name) throw new Error('name is required');
  const existing = await findActorEntity(userId, campaignId, kind, {
    canonicalEntityId: existingId,
    name,
    aliases: Array.isArray(actor.aliases) ? actor.aliases : [],
  });
  if (
    existing
    && generation.workflowId
    && (existing as any).details?.generation?.workflowId === generation.workflowId
    && (existing as any).details?.profileCompleteness === 'full'
  ) return existing;
  const timestamp = now();
  const profileCompleteness = generation.profileCompleteness === 'combat_ready' ? 'combat_ready' : 'full';
  const schemaVersion = String(
    generation.schemaVersion
      ?? (profileCompleteness === 'combat_ready' ? `${kind}/combat-ready/1.0` : (kind === 'npc' ? 'npc/1.1' : 'monster/1.0')),
  );
  const generationSource = String(generation.source ?? (profileCompleteness === 'combat_ready' ? 'gmc-encounter-contract' : 'gmc-actor-workflow'));
  const auditEntry = {
    at: timestamp,
    action: existing ? (profileCompleteness === 'full' ? 'profile_rebuilt' : 'combat_profile_refreshed') : 'created',
    source: generationSource,
    workflowId: generation.workflowId ?? null,
  };
  if (existing) {
    const revision = Math.max(1, Number((existing as any).revision ?? 1)) + 1;
    const previousDetails = objectRecord((existing as any).details);
    const aliases = Array.from(new Set([
      ...((Array.isArray((existing as any).aliases) ? (existing as any).aliases : []) as string[]),
      ...((Array.isArray(actor.aliases) ? actor.aliases : []) as string[]),
    ].map((value) => String(value).trim()).filter(Boolean)));
    return getCanonEntitiesCollection().findOneAndUpdate(
      { _id: (existing as any)._id, userId, type: kind },
      {
        $set: {
          canonical_name: name,
          aliases,
          details: {
            ...previousDetails,
            actorProfile: actor,
            profileCompleteness,
            schemaVersion,
            generation: { ...generation, completedAt: timestamp },
          },
          status: (existing as any).status ?? 'active',
          draft: false,
          revision,
          schema_version: schemaVersion,
          version: `1.0.${revision - 1}`,
          updated_at: timestamp,
        },
        $push: { audit_trail: { $each: [auditEntry], $slice: -100 } } as any,
      },
      { returnDocument: 'after' },
    );
  }
  const entityId = generateProjectEntityId(campaignId, kind as EntityType, name);
  const document: any = {
    _id: entityId,
    userId,
    scope: `proj_${campaignId}`,
    project_id: campaignId,
    type: kind,
    canonical_name: name,
    aliases: Array.isArray(actor.aliases) ? actor.aliases : [],
    claims: [],
    relationships: [],
    tags: ['actor', kind, profileCompleteness === 'full' ? 'workflow-generated' : 'encounter-ready'],
    source: 'gamemastercraft',
    version: '1.0.0',
    revision: 1,
    schema_version: schemaVersion,
    details: {
      actorProfile: actor,
      profileCompleteness,
      schemaVersion,
      generation: { ...generation, completedAt: timestamp },
      ...(kind === 'npc' ? { entityTier: 'contact' } : {}),
    },
    status: 'active',
    draft: false,
    audit_trail: [auditEntry],
    created_at: timestamp,
    updated_at: timestamp,
  };
  try {
    await getCanonEntitiesCollection().insertOne(document);
    return document;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    return upsertCanonicalActor(userId, campaignId, kind, actor, generation, entityId);
  }
}

export async function createEntityMutation(userId: string, campaignId: string, kind: GmcEntityKind, input: Record<string, any>) {
  const { mutationId, ...inputData } = input;
  const name = String(inputData.name || inputData.canonical_name || '').trim();
  if (!name) throw new Error('name is required');
  const baseId = generateProjectEntityId(campaignId, kind as EntityType, name);
  const documentId = canonicalMutationDocumentId({
    userId,
    campaignId,
    recordKind: `ENTITY:${kind}`,
    mutationId,
    prefix: baseId,
  });
  return insertCanonicalMutation({
    collection: getCanonEntitiesCollection(),
    userId,
    campaignId,
    recordKind: `ENTITY:${kind}`,
    mutationId,
    input: inputData,
    documentId,
    scopeFilter: { project_id: campaignId, type: kind },
    buildDocument: ({ documentId: id, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: id,
      userId,
      scope: `proj_${campaignId}`,
      project_id: campaignId,
      type: kind,
      canonical_name: name,
      aliases: Array.isArray(inputData.aliases) ? inputData.aliases : [],
      claims: Array.isArray(inputData.claims) ? inputData.claims : [],
      relationships: Array.isArray(inputData.relationships) ? inputData.relationships : [],
      tags: Array.isArray(inputData.tags) ? inputData.tags : [],
      source: inputData.source || 'gamemastercraft',
      version: '1.0.0',
      details: kind === 'item' ? {
        ...(inputData.details ?? inputData),
        memory: {
          recordType: 'ITEM',
          tier: includes(ITEM_TIERS, inputData.itemTier ?? inputData.details?.memory?.tier) ? String(inputData.itemTier ?? inputData.details?.memory?.tier) : 'mundane',
          currentLocationId: inputData.currentLocationId ?? inputData.details?.memory?.currentLocationId ?? null,
          ownerEntityId: inputData.ownerEntityId ?? inputData.details?.memory?.ownerEntityId ?? null,
          ownerType: inputData.ownerType ?? inputData.details?.memory?.ownerType ?? null,
        },
      } : {
        ...(inputData.details ?? inputData),
        ...(kind === 'npc' ? { entityTier: includes(ENTITY_SCOPE_TIERS, inputData.entityTier ?? inputData.details?.entityTier) ? String(inputData.entityTier ?? inputData.details?.entityTier) : 'contact' } : {}),
      },
      status: inputData.status ?? 'active',
      draft: Boolean(inputData.draft),
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      created_at: timestamp,
      updated_at: timestamp,
    }) as any,
  });
}

export async function createEntity(userId: string, campaignId: string, kind: GmcEntityKind, input: Record<string, any>) {
  return (await createEntityMutation(userId, campaignId, kind, input)).record;
}

export async function updateEntity(userId: string, id: string, kind: GmcEntityKind, input: Record<string, any>) {
  const allowed: Record<string, unknown> = {};
  if (input.name !== undefined) allowed.canonical_name = String(input.name);
  for (const key of ['aliases', 'claims', 'relationships', 'tags', 'details', 'status', 'draft', 'source']) {
    if (input[key] !== undefined) allowed[key] = input[key];
  }
  if (kind === 'npc' && input.entityTier !== undefined) {
    const entityTier = includes(ENTITY_SCOPE_TIERS, input.entityTier) ? String(input.entityTier) : 'contact';
    if (allowed.details !== undefined) {
      allowed.details = { ...objectRecord(allowed.details), entityTier };
    } else {
      allowed['details.entityTier'] = entityTier;
    }
  }
  if (kind === 'item') {
    const memoryPatch: Record<string, unknown> = {};
    if (input.itemTier !== undefined) memoryPatch.tier = includes(ITEM_TIERS, input.itemTier) ? String(input.itemTier) : 'mundane';
    for (const key of ['currentLocationId', 'ownerEntityId', 'ownerType']) {
      if (input[key] !== undefined) memoryPatch[key] = input[key];
    }
    if (Object.keys(memoryPatch).length > 0) {
      if (allowed.details !== undefined) {
        const details = objectRecord(allowed.details);
        allowed.details = {
          ...details,
          memory: {
            ...objectRecord(details.memory),
            ...memoryPatch,
          },
        };
      } else {
        for (const [key, value] of Object.entries(memoryPatch)) {
          allowed[`details.memory.${key}`] = value;
        }
      }
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

type MemoryReferenceKind = 'location' | 'npc' | 'item' | 'faction';

type MemoryReferenceSpec = {
  key: string;
  kind: MemoryReferenceKind;
  relationship: 'most_recent' | 'explicit';
  activity: 'lodging' | 'commerce' | 'meeting' | 'general';
  label: string;
  recordTerms: RegExp;
  evidenceTerms: RegExp;
};

function campaignMinuteFromText(value: unknown) {
  const text = String(value ?? '');
  const match = text.match(/\bday\s*(\d{1,5})\b[\s\S]{0,60}?\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return null;
  let hour = Number(match[2]);
  const period = match[4].toLowerCase().replace(/\./g, '');
  if (hour === 12) hour = 0;
  if (period === 'pm') hour += 12;
  return Number(match[1]) * 1440 + hour * 60 + Number(match[3] ?? 0);
}

function campaignMinuteFromRecord(record: any) {
  const clock = record?.memory?.gameClock ?? record?.source?.gameClock ?? null;
  const day = Number(clock?.day);
  const hour = Number(clock?.hour);
  const minute = Number(clock?.minute ?? 0);
  if (Number.isFinite(day) && Number.isFinite(hour) && Number.isFinite(minute)) return day * 1440 + hour * 60 + minute;
  return campaignMinuteFromText(record?.text ?? record?.description);
}

function recordCorpus(record: any) {
  return JSON.stringify({
    name: record?.canonical_name ?? record?.name ?? record?.title,
    aliases: record?.aliases,
    tags: record?.tags,
    relationships: record?.relationships,
    details: record?.details,
  });
}

function recordCorpusForKind(record: any, kind: MemoryReferenceKind) {
  if (kind !== 'npc') return recordCorpus(record);
  return JSON.stringify({
    name: record?.canonical_name ?? record?.name,
    aliases: record?.aliases,
    tags: record?.tags,
    relationships: record?.relationships,
    role: record?.details?.role ?? record?.details?.actorProfile?.role,
  });
}

function referenceSpecs(instruction: string): MemoryReferenceSpec[] {
  const text = String(instruction ?? '');
  const mostRecent = /\b(?:back to|return(?:ing|ed)? to|same|usual|last|previous(?:ly)?|again|where\s+\w+\s+(?:stayed|slept|lodged))\b/i.test(text);
  const specs: MemoryReferenceSpec[] = [];
  if (/\b(?:inn|tavern|lodg(?:e|ed|ing)?|room for the night|sleep|slept|stayed|staying|night's? rest)\b/i.test(text)) {
    specs.push({ key: 'lodging_location', kind: 'location', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'lodging', label: 'lodging location', recordTerms: /\b(?:inn|tavern|lodg|hostel|boarding)\b/i, evidenceTerms: /\b(?:stay(?:ed|ing)?|slept|lodg|room key|night's? rest|paid for (?:the )?night)\b/i });
    specs.push({ key: 'lodging_proprietor', kind: 'npc', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'lodging', label: 'innkeeper or lodging proprietor', recordTerms: /\b(?:innkeeper|barkeep|bartender|proprietor|landlord|landlady|lodging host)\b/i, evidenceTerms: /\b(?:innkeeper|barkeep|bartender|proprietor|room key|paid for (?:the )?night|lodging)\b/i });
  }
  if (/\b(?:sell|sold|selling|buy|bought|shop|store|merchant|dealer|quartermaster|outfitter|trade|hagg(?:le|led|ling)|gear|supplies|arms|armor)\b/i.test(text)) {
    specs.push({ key: 'commerce_location', kind: 'location', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'commerce', label: 'shop or trade location', recordTerms: /\b(?:shop|store|market|merchant|quartermaster|outfitter|trade|goods|arms|armor|supplies)\b/i, evidenceTerms: /\b(?:sell|sold|buy|bought|trade|traded|haggl|apprais|offer|store credit|quartermaster)\b/i });
    specs.push({ key: 'commerce_contact', kind: 'npc', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'commerce', label: 'merchant or trade contact', recordTerms: /\b(?:merchant|dealer|quartermaster|outfitter|shopkeeper|trader|appraiser|sells?)\b/i, evidenceTerms: /\b(?:sell|sold|buy|bought|trade|traded|haggl|apprais|offer|store credit|quartermaster)\b/i });
  }
  const implicitMentions = [...text.matchAll(/\b(back to|return(?:ing|ed)? to|same|usual|last|previous(?:ly visited)?|my|our)\s+(?:the\s+)?([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})/gi)];
  for (const match of implicitMentions) {
    const phrase = String(match[2] ?? '').trim().replace(/\b(?:where|that|who|which|and|then|before|after|for|with|from)\b[\s\S]*$/i, '').trim();
    if (!phrase || /^(?:place|thing|one|way|time|character|campaign|response|name|sell|selling|buy|buying|go|going|see|ask|use|visit|head|return)\b/i.test(phrase)) continue;
    const lower = phrase.toLowerCase();
    let kind: MemoryReferenceKind = 'location';
    if (/\b(?:person|npc|mentor|captain|keeper|proprietor|owner|contact|friend|ally|merchant|dealer|quartermaster|innkeeper|shopkeeper|barkeep|bartender|guard|witness)\b/i.test(lower)) kind = 'npc';
    else if (/\b(?:item|object|weapon|sword|bow|dagger|armor|key|token|book|letter|device|tool|potion|ring|amulet|stone|component|reagent)\b/i.test(lower)) kind = 'item';
    else if (/\b(?:faction|guild|watch|order|cult|church|company|gang|crew|family|house|clan|organization)\b/i.test(lower)) kind = 'faction';
    const duplicateDomain = (kind === 'location' && specs.some((spec) => spec.kind === 'location' && spec.recordTerms.test(phrase)))
      || (kind === 'npc' && specs.some((spec) => spec.kind === 'npc' && spec.recordTerms.test(phrase)));
    if (duplicateDomain) continue;
    const meaningful = phrase.split(/\s+/).filter((word) => word.length >= 3 && !/^(?:the|same|usual|last|old|new|different)$/i.test(word));
    if (!meaningful.length) continue;
    const terms = new RegExp(meaningful.map(escapeRegex).join('|'), 'i');
    const key = `implicit_${kind}_${meaningful.join('_').toLowerCase()}`;
    if (specs.some((spec) => spec.key === key)) continue;
    specs.push({ key, kind, relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'general', label: `${kind} “${phrase}”`, recordTerms: terms, evidenceTerms: terms });
  }
  return specs;
}

/**
 * Resolves implicit campaign references from canonical records using typed
 * relationships and campaign time. It never converts a lexical match into an
 * established relationship without supporting visit/activity evidence.
 * date_of_change: 2026-07-19
 */
export function resolveMemoryReferences(
  records: { facts: any[]; items: any[]; npcs: any[]; locations: any[]; factions?: any[] },
  instruction: string,
) {
  const facts = Array.isArray(records.facts) ? records.facts : [];
  const byKind: Record<MemoryReferenceKind, any[]> = {
    location: records.locations ?? [],
    npc: records.npcs ?? [],
    item: records.items ?? [],
    faction: records.factions ?? [],
  };
  const references = referenceSpecs(instruction).map((spec) => {
    const candidates = (byKind[spec.kind] ?? []).flatMap((record: any) => {
      const corpus = recordCorpusForKind(record, spec.kind);
      if (!spec.recordTerms.test(corpus)) return [];
      const id = String(record?._id ?? record?.id ?? '');
      const name = String(record?.canonical_name ?? record?.name ?? record?.title ?? '').trim();
      const explicitlyNamed = Boolean(name && instruction.toLowerCase().includes(name.toLowerCase()));
      const evidence = facts.filter((fact: any) => {
        const text = String(fact?.text ?? '');
        const linked = [...(fact?.relatedEntityIds ?? []), ...(fact?.relatedNpcIds ?? []), ...(fact?.relatedLocationIds ?? [])].map(String).includes(id);
        return (linked || (name && text.toLowerCase().includes(name.toLowerCase()))) && spec.evidenceTerms.test(text);
      }).map((fact: any) => ({
        id: fact?._id ?? fact?.id ?? null,
        text: String(fact?.text ?? ''),
        campaignMinute: campaignMinuteFromRecord(fact),
        createdAt: fact?.createdAt ?? null,
      })).sort((left, right) => Number(right.campaignMinute ?? -1) - Number(left.campaignMinute ?? -1));
      const latestCampaignMinute = evidence.find((entry) => entry.campaignMinute !== null)?.campaignMinute ?? null;
      const score = 10 + (explicitlyNamed ? 100 : 0) + (evidence.length ? 30 : 0) + Math.min(15, evidence.length * 3) + (record?.tags?.includes?.('player-known') ? 2 : 0);
      return [{ id, name, kind: spec.kind, score, latestCampaignMinute, explicitlyNamed, record, evidence: evidence.slice(0, 5) }];
    }).sort((left: any, right: any) => (
      right.score - left.score
      || Number(right.latestCampaignMinute ?? -1) - Number(left.latestCampaignMinute ?? -1)
      || left.name.localeCompare(right.name)
    ));
    const established = candidates.filter((candidate: any) => candidate.evidence.length > 0 || candidate.explicitlyNamed);
    const selected = established.length === 1
      || (established.length > 1 && (
        established[0].explicitlyNamed
        || established[0].score >= established[1].score + 6
        || Number(established[0].latestCampaignMinute ?? -1) > Number(established[1].latestCampaignMinute ?? -1)
      ))
      ? established[0]
      : null;
    const status = selected ? 'resolved' : (candidates.length ? 'ambiguous' : 'missing');
    return {
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      relationship: spec.relationship,
      activity: spec.activity,
      status,
      selected,
      candidates: candidates.slice(0, 6),
      integrityReason: selected
        ? null
        : (candidates.length
          ? `Canonical ${spec.kind} candidates exist, but GMC has no unique time-ranked ${spec.activity} relationship.`
          : `GMC has no canonical ${spec.kind} matching the requested ${spec.activity} role.`),
    };
  });
  const unresolved = references.filter((reference) => reference.status !== 'resolved');
  const options = [...new Map(unresolved.flatMap((reference) => reference.candidates)
    .map((candidate: any) => [candidate.id, { id: candidate.id, name: candidate.name, kind: candidate.kind }])).values()];
  return {
    authority: 'gmc.campaign-memory',
    contractVersion: '2026-07-19.1',
    instruction,
    status: unresolved.length ? 'clarification_required' : 'resolved',
    references,
    clarification: unresolved.length ? {
      question: options.length
        ? `Which established ${unresolved.map((entry) => entry.label).join(' and ')} did you mean?`
        : `GMC is missing the established ${unresolved.map((entry) => entry.label).join(' and ')}. What canonical name should be restored?`,
      options,
      unresolvedKeys: unresolved.map((entry) => entry.key),
    } : null,
  };
}

export async function createFactMutation(userId: string, campaignId: string, input: Record<string, any>) {
  const { mutationId, ...inputData } = input;
  const text = String(inputData.text || '').trim();
  if (!text) throw new Error('text is required');
  return insertCanonicalMutation({
    collection: getDb().collection<any>('gmc_facts'),
    userId,
    campaignId,
    recordKind: 'FACT',
    mutationId,
    input: inputData,
    scopeFilter: { campaignId },
    buildDocument: ({ documentId, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: documentId, userId, campaignId, text, recordType: 'FACT', scope: normalizeScope(inputData),
      category: inputData.category ?? 'event',
      tags: Array.isArray(inputData.tags) ? inputData.tags : [],
      memory: objectRecord(inputData.memory),
      relatedEntityIds: inputData.relatedEntityIds ?? [], relatedLocationIds: inputData.relatedLocationIds ?? [],
      source: inputData.source ?? { system: 'gamemastercraft' },
      locked: Boolean(inputData.locked), secret: Boolean(inputData.secret),
      supersededAt: null, supersededByFactId: null, supersedeReason: null,
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      createdAt: timestamp, updatedAt: timestamp,
    }),
  });
}

export async function createFact(userId: string, campaignId: string, input: Record<string, any>) {
  return (await createFactMutation(userId, campaignId, input)).record;
}

export async function createThreadMutation(userId: string, campaignId: string, input: Record<string, any>) {
  const { mutationId, ...inputData } = input;
  return insertCanonicalMutation({
    collection: getDb().collection<any>('gmc_threads'),
    userId,
    campaignId,
    recordKind: 'EVENT',
    mutationId,
    input: inputData,
    scopeFilter: { campaignId },
    buildDocument: ({ documentId, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: documentId, userId, campaignId,
      recordType: 'EVENT', title: inputData.title, description: inputData.description ?? '',
      deadlineAt: inputData.deadlineAt ?? null,
      deadlineDescription: inputData.deadlineDescription ?? inputData.deadline ?? null,
      consequence: inputData.consequence ?? '',
      scope: inputData.scope ?? { kind: 'geographic', tier: 'world', locationId: null, entityId: null },
      relatedNpcIds: inputData.relatedNpcIds ?? [], relatedLocationIds: inputData.relatedLocationIds ?? [],
      tags: Array.isArray(inputData.tags) ? inputData.tags : [],
      memory: objectRecord(inputData.memory),
      status: inputData.status ?? 'open',
      source: inputData.source ?? { system: 'gamemastercraft' },
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      createdAt: timestamp, updatedAt: timestamp,
    }),
  });
}

export async function createSceneMutation(userId: string, campaignId: string, input: Record<string, any>) {
  const { mutationId, ...inputData } = input;
  return insertCanonicalMutation({
    collection: getDb().collection<any>('gmc_scenes'),
    userId,
    campaignId,
    recordKind: 'SCENE',
    mutationId,
    input: inputData,
    scopeFilter: { campaignId },
    buildDocument: ({ documentId, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: documentId,
      userId,
      campaignId,
      name: inputData.name,
      locationId: inputData.locationId ?? null,
      presentNpcIds: inputData.presentNpcIds ?? [],
      description: inputData.description ?? '',
      gmPrivateNotes: inputData.gmPrivateNotes ?? null,
      status: inputData.status ?? 'active',
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  });
}

export async function createSessionMutation(userId: string, campaignId: string, input: Record<string, any>) {
  const { mutationId, ...inputData } = input;
  return insertCanonicalMutation({
    collection: getDb().collection<any>('gmc_sessions'),
    userId,
    campaignId,
    recordKind: 'SESSION',
    mutationId,
    input: inputData,
    scopeFilter: { campaignId },
    buildDocument: ({ documentId, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: documentId,
      userId,
      campaignId,
      ...inputData,
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  });
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

function stablePresenceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stablePresenceJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stablePresenceJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function presenceIdentity(npc: any) {
  const aliases = [
    ...(Array.isArray(npc?.aliases) ? npc.aliases : []),
    ...(Array.isArray(npc?.details?.aliases) ? npc.details.aliases : []),
  ].map(String).map((value) => value.trim()).filter(Boolean);
  return {
    id: String(npc?._id ?? npc?.id ?? ''),
    name: String(npc?.canonical_name ?? npc?.details?.name ?? npc?.name ?? '').trim(),
    aliases: [...new Set(aliases)].sort(),
  };
}

/**
 * Projects GMC's canonical scene roster into a revision-bound read contract.
 * Narrators may describe this roster, but cannot maintain a competing presence list.
 * date_of_change: 2026-07-19
 */
export function buildScenePresenceContract(scene: any, npcs: any[]) {
  const exactPresentNpcIds: string[] = (Array.isArray(scene?.presentNpcIds) ? scene.presentNpcIds : []).map(String);
  const present = new Set(exactPresentNpcIds);
  const identities = (Array.isArray(npcs) ? npcs : []).map(presenceIdentity).filter((npc) => npc.id);
  const presentNpcs = identities.filter((npc) => present.has(npc.id));
  const knownNonPresentNpcs = identities.filter((npc) => !present.has(npc.id));
  const unresolvedPresentNpcIds = exactPresentNpcIds.filter((id) => !identities.some((npc) => npc.id === id));
  const revisionSource = {
    sceneId: String(scene?._id ?? scene?.id ?? ''),
    sceneUpdatedAt: scene?.updatedAt ?? null,
    exactPresentNpcIds,
    identities,
  };
  return {
    authority: 'gmc.currentScene.presentNpcIds',
    sceneId: revisionSource.sceneId || null,
    sceneUpdatedAt: revisionSource.sceneUpdatedAt,
    revision: createHash('sha256').update(stablePresenceJson(revisionSource)).digest('hex'),
    exactPresentNpcIds,
    presentNpcs,
    knownNonPresentNpcs,
    unresolvedPresentNpcIds,
    valid: Boolean(revisionSource.sceneId) && unresolvedPresentNpcIds.length === 0,
    rules: [
      'The exactPresentNpcIds roster is exclusive for the current scene state.',
      'A known non-present NPC cannot act, speak, observe, carry, guard, or receive an assignment in current narration.',
      'An arrival or departure requires an explicit scene-presence mutation before later narration may rely on the changed roster.',
    ],
  };
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
  actorWorkflows: () => getDb().collection<any>('gmc_actor_workflows'),
};
