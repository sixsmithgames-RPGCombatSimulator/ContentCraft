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
export const CAMPAIGN_MEMORY_CONTRACT_VERSION = '2026-07-21.1';
export const WORLD_GENERATION_POLICY_VERSION = '2026-07-21.1';
export const SCENE_TRANSITION_CONTRACT_VERSION = '2026-07-21.1';

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

function normalizedReferenceIdentity(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identityRegex(value: string) {
  return new RegExp(escapeRegex(value).replace(/['’]/g, "['’]"), 'i');
}

function containsNormalizedIdentity(text: unknown, identity: unknown) {
  const haystack = ` ${normalizedReferenceIdentity(text)} `;
  const needle = normalizedReferenceIdentity(identity);
  return Boolean(needle) && (
    haystack.includes(` ${needle} `)
    || haystack.includes(` ${needle}'s `)
    || haystack.includes(` ${needle}' `)
  );
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

const IMPLICIT_REFERENCE_KIND_TERMS: ReadonlyArray<readonly [MemoryReferenceKind, RegExp]> = [
  ['npc', /\b(?:person|npc|mentor|captain|keeper|proprietor|owner|contact|friend|ally|merchant|dealer|quartermaster|innkeeper|shopkeeper|barkeep|bartender|guard|witness)\b/i],
  ['item', /\b(?:item|object|weapon|sword|bow|dagger|armor|key|token|book|letter|device|frame|tool|potion|ring|amulet|stone|component|reagent|residue)\b/i],
  ['faction', /\b(?:faction|guild|watch|order|cult|church|company|gang|crew|family|house|clan|organization)\b/i],
  ['location', /\b(?:place|location|destination|site|room|inn|tavern|lodging|shop|store|workshop|workroom|home|house|market|office|warehouse|dock|docks|harbor|ward|street|lane|alley|route|sewer|tunnel|cellar|basement|floor|stair|stairs|chamber|hall|corridor|chapel|temple)\b/i],
];

/**
 * Classify only typed campaign referents. Abstract idioms such as "on the
 * same page", "the last word", or "our current plan" are deliberately not
 * coerced into locations merely because they follow a recency cue.
 */
function implicitReferenceKind(phrase: string): MemoryReferenceKind | null {
  for (const [kind, terms] of IMPLICIT_REFERENCE_KIND_TERMS) {
    if (terms.test(phrase)) return kind;
  }
  return null;
}

/**
 * Distinguishes an instruction that points back to established canon from one
 * that deliberately asks the GM to introduce a new person, place, thing, or
 * organization. This permission is narrow and instruction-bound: it never
 * authorizes replacing an unresolved "back/same/usual/last" reference.
 */
export function classifyWorldGenerationIntent(instruction: string) {
  const text = String(instruction ?? '').trim();
  const generativeAction = /\b(?:find|look(?:ing)?\s+for|search(?:ing)?\s+for|seek(?:ing)?|hunt(?:ing)?\s+for|scout(?:ing)?\s+for|explore|wander|pick(?:ing)?\s+out|choose|locate)\b/i.test(text);
  const indefiniteTarget = /\b(?:a|an|some|someone|somebody|somewhere|new|another|any)\b/i.test(text);
  const explicitCreationAction = /\b(?:create|generate|invent|introduce|populate|add|draft|design|name|make\s+up|establish\s+(?:a|an|some|new|additional))\b/i.test(text);
  const establishedOnly = /\b(?:already[- ]established|existing|previously established|those|these)\b/i.test(text)
    && !/\b(?:new|additional|another|create names?|invent|make up|you (?:can|may) create)\b/i.test(text);
  const canonicalLocationCue = /\b(?:back\s+to|return(?:ing|ed)?\s+to|same|usual|last|previous(?:ly)?|again|where\s+\w+\s+(?:stayed|slept|lodged))\b/i.test(text);
  const departure = /\b(?:leave|depart|head\s+out|set\s+out|go(?:es|ing)?|went|walk|travel|ride|sail|move\s+on)\b/i.test(text);
  const openEnded = (generativeAction && indefiniteTarget) || (explicitCreationAction && !establishedOnly);
  const allowedEntityTypes: MemoryReferenceKind[] = [];
  if (openEnded && /\b(?:someone|somebody|persons?|people|npcs?|characters?|marks?|targets?|contacts?|patrons?|customers?|merchants?|guides?|hires?|recruits?|witnesses?|victims?|opponents?|allies|companions?)\b/i.test(text)) allowedEntityTypes.push('npc');
  if (openEnded && !canonicalLocationCue && (departure || /\b(?:somewhere|places?|areas?|locations?|destinations?|districts?|wards?|streets?|lanes?|alleys?|markets?|inns?|taverns?|boarding houses?|residences?|homes?|houses?|shops?|stores?|workshops?|rooms?|buildings?|facilities?|courts?|offices?|temples?|chapels?|healers?|clinics?|towers?|guild halls?|entertainment (?:places?|venues?)|theaters?|warehouses?|boundaries|routes?|neighbou?rhoods?)\b/i.test(text))) allowedEntityTypes.push('location');
  if (openEnded && /\b(?:things?|items?|objects?|weapons?|armou?r|keys?|books?|letters?|devices?|tools?|potions?|rings?|amulets?|components?|reagents?|clues?|evidence)\b/i.test(text)) allowedEntityTypes.push('item');
  if (openEnded && /\b(?:factions?|guilds?\b(?!\s+halls?)|watch\b(?!\s+facilit)|orders?|cults?|churches?|companies|gangs?|crews?|families|clans?|organizations?|groups?)\b/i.test(text)) allowedEntityTypes.push('faction');
  const uniqueTypes = [...new Set(allowedEntityTypes)].sort();
  const source = {
    authority: 'gmc.worldGenerationPolicy',
    contractVersion: WORLD_GENERATION_POLICY_VERSION,
    instruction: normalizedReferenceIdentity(text),
    mode: uniqueTypes.length ? 'world_generation_allowed' : 'canonical_only',
    allowedEntityTypes: uniqueTypes,
  };
  return {
    ...source,
    revision: createHash('sha256').update(stablePresenceJson(source)).digest('hex'),
    allowSceneSettingCreation: uniqueTypes.includes('location'),
    rules: uniqueTypes.length ? [
      'Creation is allowed only for the listed entity types and only to fulfill this instruction.',
      'Any established canonical reference selected by memory resolution remains binding.',
      'New scene-local people and places must be returned as matching ENTITY create proposals.',
    ] : [
      'Do not create a substitute for an unresolved or established canonical reference.',
    ],
  };
}

function referenceSpecs(instruction: string): MemoryReferenceSpec[] {
  const text = String(instruction ?? '');
  const mostRecent = /\b(?:back to|return(?:ing|ed)? to|same|usual|last|previous(?:ly)?|again|where\s+\w+\s+(?:stayed|slept|lodged))\b/i.test(text);
  const generationPolicy = classifyWorldGenerationIntent(text);
  const specs: MemoryReferenceSpec[] = [];
  if (/\b(?:inn|tavern|lodg(?:e|ed|ing)?|room for the night|sleep|slept|stayed|staying|night's? rest)\b/i.test(text)) {
    if (!generationPolicy.allowedEntityTypes.includes('location')) specs.push({ key: 'lodging_location', kind: 'location', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'lodging', label: 'lodging location', recordTerms: /\b(?:inn|tavern|lodg|hostel|boarding)\b/i, evidenceTerms: /\b(?:stay(?:ed|ing)?|slept|lodg|room key|night's? rest|paid for (?:the )?night)\b/i });
    if (!generationPolicy.allowedEntityTypes.includes('npc')) specs.push({ key: 'lodging_proprietor', kind: 'npc', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'lodging', label: 'innkeeper or lodging proprietor', recordTerms: /\b(?:innkeeper|barkeep|bartender|proprietor|landlord|landlady|lodging host)\b/i, evidenceTerms: /\b(?:innkeeper|barkeep|bartender|proprietor|room key|paid for (?:the )?night|lodging)\b/i });
  }
  if (/\b(?:sell|sold|selling|buy|bought|shop|store|merchant|dealer|quartermaster|outfitter|trade|hagg(?:le|led|ling)|gear|supplies|arms|armor)\b/i.test(text)) {
    if (!generationPolicy.allowedEntityTypes.includes('location')) specs.push({ key: 'commerce_location', kind: 'location', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'commerce', label: 'shop or trade location', recordTerms: /\b(?:shop|store|market|merchant|quartermaster|outfitter|trade|goods|arms|armor|supplies)\b/i, evidenceTerms: /\b(?:sell|sold|buy|bought|trade|traded|haggl|apprais|offer|store credit|quartermaster)\b/i });
    if (!generationPolicy.allowedEntityTypes.includes('npc')) specs.push({ key: 'commerce_contact', kind: 'npc', relationship: mostRecent ? 'most_recent' : 'explicit', activity: 'commerce', label: 'merchant or trade contact', recordTerms: /\b(?:merchant|dealer|quartermaster|outfitter|shopkeeper|trader|appraiser|sells?)\b/i, evidenceTerms: /\b(?:sell|sold|buy|bought|trade|traded|haggl|apprais|offer|store credit|quartermaster)\b/i });
  }
  const implicitMentions = [...text.matchAll(/\b(back to|return(?:ing|ed)? to|same|usual|last|previous(?:ly visited)?|my|our)\s+(?:the\s+)?([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})/gi)];
  for (const match of implicitMentions) {
    const phrase = String(match[2] ?? '').trim().replace(/\b(?:where|that|who|which|and|then|before|after|for|with|from)\b[\s\S]*$/i, '').trim();
    if (!phrase || /^(?:thing|one|way|time|character|campaign|response|name|sell|selling|buy|buying|go|going|see|ask|use|visit|head|return)\b/i.test(phrase)) continue;
    const lower = phrase.toLowerCase();
    const kind = implicitReferenceKind(lower);
    if (!kind) continue;
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

function explicitCanonicalReferenceSpecs(
  records: Record<MemoryReferenceKind, any[]>,
  instruction: string,
) {
  const text = normalizedReferenceIdentity(instruction);
  const specs: MemoryReferenceSpec[] = [];
  for (const kind of ['location', 'npc', 'item', 'faction'] as const) {
    for (const record of records[kind] ?? []) {
      const identities = [
        record?.canonical_name ?? record?.name ?? record?.title,
        ...(Array.isArray(record?.aliases) ? record.aliases : []),
      ].map((value) => String(value ?? '').trim()).filter((value) => value.length >= 3);
      const mentioned = identities.find((identity) => containsNormalizedIdentity(text, identity));
      if (!mentioned) continue;
      const id = String(record?._id ?? record?.id ?? mentioned);
      const terms = new RegExp(identities.map(escapeRegex).join('|'), 'i');
      specs.push({
        key: `explicit_${kind}_${id.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`,
        kind,
        relationship: 'explicit',
        activity: 'general',
        label: `${kind} “${mentioned}”`,
        recordTerms: terms,
        evidenceTerms: terms,
      });
    }
  }
  return specs;
}

function linkedNpcLocationReferenceSpecs(npcs: any[], instruction: string): MemoryReferenceSpec[] {
  const text = normalizedReferenceIdentity(instruction);
  const specs = new Map<string, MemoryReferenceSpec>();
  for (const npc of npcs ?? []) {
    const locationName = String(npc?.details?.location ?? '').trim();
    if (!locationName || !containsNormalizedIdentity(text, locationName)) continue;
    const npcIdentities = [npc?.canonical_name ?? npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
      .map((value) => String(value ?? '').trim()).filter(Boolean);
    if (!npcIdentities.some((identity) => containsNormalizedIdentity(text, identity))) continue;
    const npcId = String(npc?._id ?? npc?.id ?? locationName);
    const key = `linked_location_${npcId.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    specs.set(key, {
      key,
      kind: 'location',
      relationship: 'explicit',
      activity: 'general',
      label: `location “${locationName}” associated with ${String(npc?.canonical_name ?? npc?.name ?? 'canonical NPC')}`,
      recordTerms: identityRegex(locationName),
      evidenceTerms: identityRegex(locationName),
    });
  }
  return [...specs.values()];
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
  const specs = [
    ...referenceSpecs(instruction),
    ...linkedNpcLocationReferenceSpecs(byKind.npc, instruction),
    ...explicitCanonicalReferenceSpecs(byKind, instruction),
  ];
  const normalizedInstruction = normalizedReferenceIdentity(instruction);
  const references = specs.map((spec) => {
    const candidates = (byKind[spec.kind] ?? []).flatMap((record: any) => {
      const corpus = recordCorpusForKind(record, spec.kind);
      if (!spec.recordTerms.test(corpus)) return [];
      const id = String(record?._id ?? record?.id ?? '');
      const name = String(record?.canonical_name ?? record?.name ?? record?.title ?? '').trim();
      const identities = [name, ...(Array.isArray(record?.aliases) ? record.aliases : [])]
        .map((value) => String(value ?? '').trim()).filter(Boolean);
      const matchedIdentity = identities.find((identity) => containsNormalizedIdentity(normalizedInstruction, identity)) ?? null;
      const explicitlyNamed = Boolean(matchedIdentity);
      const evidence = facts.filter((fact: any) => {
        const text = String(fact?.text ?? '');
        const relatedIds = [...(fact?.relatedEntityIds ?? []), ...(fact?.relatedNpcIds ?? []), ...(fact?.relatedLocationIds ?? [])].map(String);
        const linked = relatedIds.includes(id);
        // Explicit provenance is authoritative. Once a fact names its related
        // records by ID, incidental or negative text mentions must not attach
        // that evidence to a different canonical record.
        const textLinked = relatedIds.length === 0 && name && text.toLowerCase().includes(name.toLowerCase());
        return (linked || textLinked) && spec.evidenceTerms.test(text);
      }).map((fact: any) => ({
        id: fact?._id ?? fact?.id ?? null,
        text: String(fact?.text ?? ''),
        campaignMinute: campaignMinuteFromRecord(fact),
        createdAt: fact?.createdAt ?? null,
      })).sort((left, right) => Number(right.campaignMinute ?? -1) - Number(left.campaignMinute ?? -1));
      const latestCampaignMinute = evidence.find((entry) => entry.campaignMinute !== null)?.campaignMinute ?? null;
      const score = 10 + (explicitlyNamed ? 100 : 0) + (evidence.length ? 30 : 0) + Math.min(15, evidence.length * 3) + (record?.tags?.includes?.('player-known') ? 2 : 0);
      return [{ id, name, kind: spec.kind, score, latestCampaignMinute, explicitlyNamed, matchedIdentity, record, evidence: evidence.slice(0, 5) }];
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
  const creationPolicy = classifyWorldGenerationIntent(instruction);
  const options = [...new Map(unresolved.flatMap((reference) => reference.candidates)
    .map((candidate: any) => [candidate.id, { id: candidate.id, name: candidate.name, kind: candidate.kind }])).values()];
  return {
    authority: 'gmc.campaign-memory',
    contractVersion: CAMPAIGN_MEMORY_CONTRACT_VERSION,
    instruction,
    status: unresolved.length ? 'clarification_required' : 'resolved',
    references,
    creationPolicy,
    clarification: unresolved.length ? {
      question: options.length
        ? `Which established ${unresolved.map((entry) => entry.label).join(' and ')} did you mean?`
        : `GMC is missing the established ${unresolved.map((entry) => entry.label).join(' and ')}. What canonical name should be restored?`,
      options,
      unresolvedKeys: unresolved.map((entry) => entry.key),
    } : null,
  };
}

export async function prepareMemoryReferences(userId: string, campaignId: string, instruction: string) {
  const npcs = await listEntities(userId, campaignId, 'npc');
  const locations = await listEntities(userId, campaignId, 'location');
  const repairs: any[] = [];
  for (const npc of npcs) {
    const locationName = String(npc?.details?.location ?? '').trim();
    const npcName = String(npc?.canonical_name ?? '').trim();
    if (!locationName || !npcName) continue;
    if (!containsNormalizedIdentity(instruction, locationName)) continue;
    const npcIdentities = [npcName, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
      .map((identity) => String(identity ?? '').trim()).filter(Boolean);
    if (!npcIdentities.some((identity) => containsNormalizedIdentity(instruction, identity))) continue;
    let location = locations.find((candidate: any) => [candidate?.canonical_name ?? candidate?.name, ...(Array.isArray(candidate?.aliases) ? candidate.aliases : [])]
      .some((identity) => normalizedReferenceIdentity(identity) === normalizedReferenceIdentity(locationName)));
    let materialized = false;
    let duplicate = false;
    if (!location) {
      const repairFingerprint = createHash('sha256').update(stablePresenceJson({ campaignId, npcId: String(npc?._id), locationName: normalizedReferenceIdentity(locationName) })).digest('hex');
      const created = await createEntityMutation(userId, campaignId, 'location', {
        mutationId: `materialize-linked-location:${repairFingerprint}`,
        name: locationName,
        aliases: [],
        tags: ['player-known', 'location:canonical', 'location:site', 'relationship:npc-associated', 'normalized-from:embedded-npc-location'],
        relationships: [{ type: 'associated_npc', targetId: String(npc?._id), name: npcName }],
        geographicTier: 'site',
        source: { system: 'gamemastercraft', kind: 'embedded-npc-location-normalization', npcId: String(npc?._id), sourceField: 'details.location' },
        details: {
          name: locationName,
          type: 'Established NPC-associated place',
          geographicTier: 'site',
          visibility: 'player-known',
          associatedNpcId: String(npc?._id),
          associatedNpcName: npcName,
          canonicalization: { sourceEntityId: String(npc?._id), sourceField: 'details.location', sourceValue: locationName },
        },
        draft: false,
      });
      location = created.record;
      materialized = true;
      duplicate = created.duplicate;
      locations.push(created.record);
    }
    const locationId = String(location?._id);
    const locationRelationships = Array.isArray(location?.relationships) ? location.relationships : [];
    const locationLinked = locationRelationships.some((relationship: any) => String(relationship?.targetId) === String(npc?._id));
    const npcRelationships = Array.isArray(npc?.relationships) ? npc.relationships : [];
    const npcLinked = npcRelationships.some((relationship: any) => String(relationship?.targetId) === locationId);
    const timestamp = now();
    if (!locationLinked) await (getCanonEntitiesCollection() as any).updateOne(
      { _id: locationId, userId, project_id: campaignId, type: 'location' },
      { $addToSet: { relationships: { type: 'associated_npc', targetId: String(npc?._id), name: npcName } }, $set: { updated_at: timestamp } },
    );
    if (!npcLinked) await (getCanonEntitiesCollection() as any).updateOne(
      { _id: String(npc?._id), userId, project_id: campaignId, type: 'npc' },
      { $addToSet: { relationships: { type: 'associated_location', targetId: locationId, name: locationName } }, $set: { updated_at: timestamp } },
    );
    if (materialized || !locationLinked || !npcLinked) repairs.push({
      kind: 'location', id: locationId, name: locationName,
      sourceNpcId: String(npc?._id), sourceNpcName: npcName, materialized, duplicate,
      locationRelationshipRepaired: !locationLinked, npcRelationshipRepaired: !npcLinked,
    });
  }
  const [facts, threads, items, refreshedNpcs, refreshedLocations, factions] = await Promise.all([
    listFacts(userId, campaignId), listThreads(userId, campaignId), listEntities(userId, campaignId, 'item'),
    listEntities(userId, campaignId, 'npc'), listEntities(userId, campaignId, 'location'), listEntities(userId, campaignId, 'faction'),
  ]);
  const resolution = resolveMemoryReferences({ facts: [...facts, ...threads], items, npcs: refreshedNpcs, locations: refreshedLocations, factions }, instruction);
  return { repairs, resolution: { ...resolution, canonicalRepairs: repairs } };
}

type MemoryRestorationRecord = {
  key: string;
  kind: MemoryReferenceKind;
  name: string;
  nameEvidence: string;
};

function normalizedQuote(value: unknown) {
  return String(value ?? '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
}

/**
 * Validates the deliberately narrow result of the manual clarification pass.
 * The model may identify names, but every accepted name must be a verbatim
 * quote from the player's answer and must fill exactly one unresolved key.
 */
export function validateMemoryRestorationCandidate(input: Record<string, any>) {
  const answer = String(input?.clarificationAnswer ?? '').trim();
  const prior = input?.priorResolution;
  if (!answer) throw Object.assign(new Error('clarificationAnswer is required.'), { status: 400, code: 'VALIDATION_ERROR' });
  if (prior?.authority !== 'gmc.campaign-memory' || prior?.contractVersion !== CAMPAIGN_MEMORY_CONTRACT_VERSION || prior?.status !== 'clarification_required') {
    throw Object.assign(new Error('A current GMC clarification contract is required.'), { status: 409, code: 'MEMORY_CLARIFICATION_CONTRACT_REQUIRED' });
  }
  const unresolved = (Array.isArray(prior.references) ? prior.references : []).filter((reference: any) => reference?.status !== 'resolved');
  const expected = new Map(unresolved.map((reference: any) => [String(reference.key), reference]));
  const supplied = Array.isArray(input?.records) ? input.records : [];
  if (!expected.size || supplied.length !== expected.size) {
    throw Object.assign(new Error('The restoration must fill every unresolved reference exactly once.'), { status: 409, code: 'MEMORY_RESTORATION_INCOMPLETE' });
  }
  const seen = new Set<string>();
  const records = supplied.map((record: any): MemoryRestorationRecord => {
    const key = String(record?.key ?? '').trim();
    const reference: any = expected.get(key);
    if (!reference || seen.has(key)) throw Object.assign(new Error(`Unexpected or duplicate memory key: ${key || '(blank)'}.`), { status: 409, code: 'MEMORY_RESTORATION_KEY_INVALID' });
    seen.add(key);
    const kind = String(record?.kind ?? '') as MemoryReferenceKind;
    if (kind !== reference.kind) throw Object.assign(new Error(`Memory key ${key} must restore a ${reference.kind}.`), { status: 409, code: 'MEMORY_RESTORATION_KIND_INVALID' });
    const name = normalizedQuote(record?.name);
    const evidence = normalizedQuote(record?.nameEvidence);
    if (!name || !evidence || name.toLocaleLowerCase() !== evidence.toLocaleLowerCase() || !answer.toLocaleLowerCase().includes(evidence.toLocaleLowerCase())) {
      throw Object.assign(new Error(`The canonical name for ${key} must be quoted verbatim from the player's clarification.`), { status: 409, code: 'MEMORY_RESTORATION_EVIDENCE_REQUIRED' });
    }
    return { key, kind, name, nameEvidence: evidence };
  });
  return { answer, prior, unresolved, records };
}

function restorationTags(reference: any, kind: MemoryReferenceKind) {
  const activity = String(reference?.activity ?? 'general');
  const clarifiedRole = kind === 'npc'
    ? String(reference?.label ?? '').match(/[“"]([^”"]+)[”"]/)?.[1]?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;
  const role = activity === 'lodging' && kind === 'npc'
    ? 'innkeeper'
    : (activity === 'commerce' && kind === 'npc' ? 'merchant' : null);
  return [...new Set([
    'player-known', `${kind}:canonical`, `activity:${activity}`, 'relationship:known-to-player',
    ...(role ? [`role:${role}`] : []),
    ...(clarifiedRole ? [`role:${clarifiedRole}`] : []),
    ...(activity === 'lodging' && kind === 'location' ? ['location:lodging'] : []),
    ...(activity === 'commerce' && kind === 'location' ? ['location:shop'] : []),
  ])];
}

function restorationAliases(reference: any, kind: MemoryReferenceKind) {
  if (kind !== 'npc') return [];
  const clarifiedRole = String(reference?.label ?? '').match(/[“"]([^”"]+)[”"]/)?.[1]?.trim();
  return clarifiedRole ? [clarifiedRole] : [];
}

export async function restoreMemoryReferences(userId: string, campaignId: string, input: Record<string, any>) {
  const mutationId = String(input?.mutationId ?? '').trim();
  const originalInstruction = String(input?.originalInstruction ?? '').trim();
  if (!mutationId || !originalInstruction) throw Object.assign(new Error('mutationId and originalInstruction are required.'), { status: 400, code: 'VALIDATION_ERROR' });
  const validated = validateMemoryRestorationCandidate(input);
  if (String(validated.prior.instruction ?? '').trim() !== originalInstruction) {
    throw Object.assign(new Error('The clarification is not bound to the original unresolved instruction.'), { status: 409, code: 'MEMORY_CLARIFICATION_STALE' });
  }
  const referenceByKey = new Map(validated.unresolved.map((reference: any) => [String(reference.key), reference]));
  const created: any[] = [];
  for (const record of validated.records) {
    const reference: any = referenceByKey.get(record.key);
    const existing = await getCanonEntitiesCollection().findOne({
      userId, project_id: campaignId, type: record.kind,
      canonical_name: { $regex: `^${escapeRegex(record.name)}$`, $options: 'i' },
    } as any);
    if (existing) {
      const updated = await updateEntity(userId, existing._id, record.kind as GmcEntityKind, {
        tags: [...new Set([...(Array.isArray(existing.tags) ? existing.tags : []), ...restorationTags(reference, record.kind)])],
        aliases: [...new Set([...(Array.isArray(existing.aliases) ? existing.aliases : []), ...restorationAliases(reference, record.kind)])],
        relationships: Array.isArray(existing.relationships) ? existing.relationships : [],
        details: {
          ...objectRecord(existing.details),
          playerClarification: validated.answer,
          activity: reference?.activity ?? 'general',
          roleAliases: [...new Set([...(Array.isArray(existing?.details?.roleAliases) ? existing.details.roleAliases : []), ...restorationAliases(reference, record.kind)])],
        },
      });
      created.push({ key: record.key, kind: record.kind, reference, record: updated, duplicate: true });
      continue;
    }
    const result = await createEntityMutation(userId, campaignId, record.kind as GmcEntityKind, {
      mutationId: `${mutationId}:${record.key}`,
      name: record.name,
      aliases: restorationAliases(reference, record.kind),
      tags: restorationTags(reference, record.kind),
      relationships: [],
      source: { system: 'gamemaster-assistant', kind: 'player-memory-clarification', mutationId },
      details: {
        name: record.name,
        role: reference?.label ?? null,
        type: reference?.label ?? null,
        activity: reference?.activity ?? 'general',
        playerClarification: validated.answer,
        visibility: 'player-known',
      },
      draft: false,
    });
    created.push({ key: record.key, kind: record.kind, reference, record: result.record, duplicate: result.duplicate });
  }
  for (const entry of created) {
    const peers = created.filter((candidate) => candidate !== entry && candidate.reference?.activity === entry.reference?.activity);
    const relationships = peers.map((peer) => ({
      type: entry.kind === 'location' && peer.kind === 'npc'
        ? (entry.reference?.activity === 'lodging' ? 'lodging_proprietor' : (entry.reference?.activity === 'commerce' ? 'trade_contact' : 'associated_with'))
        : (entry.kind === 'npc' && peer.kind === 'location' ? 'works_at' : 'associated_with'),
      targetId: peer.record?._id ?? peer.record?.id,
      name: peer.record?.canonical_name ?? peer.record?.name,
    }));
    if (relationships.length) {
      entry.record = await updateEntity(userId, entry.record?._id ?? entry.record?.id, entry.kind, {
        relationships,
        tags: entry.record?.tags ?? restorationTags(entry.reference, entry.kind),
        details: entry.record?.details,
      });
    }
  }
  const locationIds = created.filter((entry) => entry.kind === 'location').map((entry) => entry.record?._id ?? entry.record?.id).filter(Boolean);
  const entityIds = created.filter((entry) => entry.kind !== 'location').map((entry) => entry.record?._id ?? entry.record?.id).filter(Boolean);
  const factMutation = await createFactMutation(userId, campaignId, {
    mutationId: `${mutationId}:evidence`,
    text: `Player clarification restoring campaign memory: ${validated.answer}`,
    category: 'continuity',
    tags: ['memory-clarification', ...new Set(created.map((entry) => `activity:${entry.reference?.activity ?? 'general'}`))],
    relatedEntityIds: entityIds,
    relatedLocationIds: locationIds,
    locked: true,
    secret: false,
    memory: { gameClock: input?.gameClock ?? null, sourceInstruction: originalInstruction },
    source: { system: 'gamemaster-assistant', kind: 'player-memory-clarification', mutationId },
  });
  const [facts, threads, items, npcs, locations, factions] = await Promise.all([
    listFacts(userId, campaignId), listThreads(userId, campaignId),
    listEntities(userId, campaignId, 'item'), listEntities(userId, campaignId, 'npc'),
    listEntities(userId, campaignId, 'location'), listEntities(userId, campaignId, 'faction'),
  ]);
  const resolution = resolveMemoryReferences({ facts: [...facts, ...threads], items, npcs, locations, factions }, originalInstruction);
  if (resolution.status !== 'resolved') {
    throw Object.assign(new Error('Canonical records were restored, but the original references are still not unique. GMA must ask another question.'), {
      status: 409, code: 'MEMORY_RESTORATION_INCOMPLETE', details: { resolution },
    });
  }
  return {
    restored: created.map((entry) => ({ key: entry.key, kind: entry.kind, record: entry.record, duplicate: entry.duplicate })),
    evidenceFact: factMutation.record,
    resolution,
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

/**
 * Validates an exact proposed scene roster without changing GMC current state.
 * GMA binds manual review to this revision, then commits the same projection only
 * after the reviewed result is approved. date_of_change: 2026-07-19
 */
export function buildProposedScenePresenceContract(input: {
  currentContract: any;
  location: any;
  presentNpcIds: string[];
  npcs: any[];
}) {
  const currentContract = input?.currentContract;
  const locationId = String(input?.location?._id ?? input?.location?.id ?? '').trim();
  const locationName = String(input?.location?.canonical_name ?? input?.location?.details?.name ?? input?.location?.name ?? '').trim();
  const presentNpcIds = [...new Set((Array.isArray(input?.presentNpcIds) ? input.presentNpcIds : []).map(String).filter(Boolean))].sort();
  const syntheticId = createHash('sha256').update(stablePresenceJson({ baseRevision: currentContract?.revision ?? null, locationId, presentNpcIds })).digest('hex');
  const syntheticScene = {
    _id: `proposed:${syntheticId}`,
    updatedAt: null,
    presentNpcIds,
  };
  const projected = buildScenePresenceContract(syntheticScene, input?.npcs ?? []);
  const valid = currentContract?.valid === true
    && Boolean(currentContract?.revision)
    && Boolean(locationId)
    && Boolean(locationName)
    && projected.unresolvedPresentNpcIds.length === 0;
  const presentNpcs = [...projected.presentNpcs]
    .sort((left, right) => String(left?.id ?? '').localeCompare(String(right?.id ?? '')));
  const revisionSource = {
    authority: 'gmc.proposedScene.presentNpcIds',
    baseRevision: currentContract?.revision ?? null,
    currentSceneId: currentContract?.sceneId ?? null,
    locationId,
    presentNpcIds,
    identities: presentNpcs,
  };
  return {
    ...projected,
    presentNpcs,
    authority: 'gmc.proposedScene.presentNpcIds',
    sceneId: null,
    baseRevision: currentContract?.revision ?? null,
    currentSceneId: currentContract?.sceneId ?? null,
    locationId,
    locationName,
    revision: createHash('sha256').update(stablePresenceJson(revisionSource)).digest('hex'),
    valid,
    rules: [
      'This exact proposed roster is valid only while baseRevision remains GMC current scene authority.',
      'The proposal is non-mutating and must be committed before narration is applied.',
      'Only presentNpcs may take a current role in the proposed destination scene.',
    ],
  };
}

function narrativePresencePattern(value: unknown) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function narrativePresenceSentences(value: unknown) {
  return String(value ?? '')
    .split(/(?<=[.!?…][”'\"]?)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function narrativeIdentityReferences(npc: any) {
  const name = String(npc?.name ?? '').trim();
  const aliases = Array.isArray(npc?.aliases) ? npc.aliases : [];
  return [...new Set([name, ...aliases]
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length >= 3))]
    .sort((left, right) => right.length - left.length);
}

function narrativeReferenceMatch(text: string, references: string[]) {
  for (const reference of references) {
    const match = new RegExp(`\\b${narrativePresencePattern(reference)}\\b`, 'i').exec(text);
    if (match) return { reference, index: match.index };
  }
  return null;
}

function narrativeReferenceIsRemoteOrReported(sentence: string, reference: string, index: number) {
  const escaped = narrativePresencePattern(reference);
  const nearby = sentence.slice(Math.max(0, index - 120), Math.min(sentence.length, index + reference.length + 140));
  const explicitNonLocal = /\b(?:not present|absent|elsewhere|away|below|above|upstairs|downstairs|outside|off[- ]site|back at|over at|aboard|in custody|at the watch|at headquarters|from afar|in another|in the other|there rather than here)\b/i.test(nearby);
  const historical = /\b(?:previously|earlier|before|formerly|had already|used to|recalled|remembered|recovered from|taken from|received from|seized from|salvaged from|belonged to|owned by)\b/i.test(nearby);
  const discussedByAnother = new RegExp(`\\b(?:says?|asks?|answers?|explains?|warns?|thinks?|believes?|suspects?|supposes?|knows?|recalls?|remembers?|describes?|mentions?|discusses?)\\b[^.\\n]{0,180}\\b${escaped}\\b`, 'i').test(sentence)
    && !new RegExp(`\\b${escaped}\\b[^.\\n]{0,45}\\b(?:says?|asks?|answers?|explains?|warns?|thinks?|believes?|suspects?|supposes?|knows?)\\b`, 'i').test(sentence);
  const speculativeSubject = new RegExp(`\\b${escaped}\\b[^.\\n]{0,45}\\b(?:may|might|could|would|probably|likely|apparently|reportedly|seems?|appears?|is believed|is thought|was|were|had)\\b`, 'i').test(sentence);
  const topicOnly = new RegExp(`\\b(?:about|regarding|concerning|of|from)\\s+(?:the\\s+)?${escaped}\\b`, 'i').test(sentence);
  return explicitNonLocal || historical || discussedByAnother || speculativeSubject || topicOnly;
}

function narrativeReferenceHasUnambiguousLocalRole(sentence: string, reference: string) {
  const escaped = narrativePresencePattern(reference);
  const subjectAction = new RegExp(`\\b${escaped}(?:'s|’s)?\\b[^.\\n]{0,55}\\b(?:says?|speaks?|asks?|answers?|replies?|gives?|hands?|takes?|receives?|arrives?|enters?|joins?|waits?|stands?|sits?|walks?|moves?|watches?|observes?|guards?|helps?|attacks?|casts?|holds?|carries?|touches?|opens?|closes?|nods?|turns?)\\b`, 'i').test(sentence);
  const actedUpon = new RegExp(`\\b(?:gives?|hands?|shows?|tells?|asks?|leads?|follows?|joins?|greets?|helps?|attacks?|touches?|watches?|guards?)\\b[^.\\n]{0,55}\\b${escaped}\\b`, 'i').test(sentence);
  const explicitLocality = new RegExp(`\\b${escaped}\\b[^.\\n]{0,70}\\b(?:beside|next to|across from|in front of|behind|with)\\s+(?:Kerrigan|you|Vesper)\\b|\\b${escaped}\\b[^.\\n]{0,70}\\b(?:here|in the room|at the table|through the door)\\b`, 'i').test(sentence);
  return subjectAction || actedUpon || explicitLocality;
}

/**
 * Binds narrative use of known NPC identities to one GMC presence revision.
 * Remote, historical, reported, and speculative references remain legal; only
 * an exact roster declaration or an unambiguous scene-local role is blocking.
 * date_of_change: 2026-07-20
 */
export function validateNarrativePresenceContract(input: {
  presenceContract: any;
  responseMode?: string;
  responseText?: string;
  sceneSegment?: any;
  candidateFingerprint?: string | null;
}) {
  const presenceContract = input?.presenceContract;
  if (presenceContract?.valid !== true || !presenceContract?.revision) {
    throw Object.assign(new Error('A valid GMC scene-presence contract is required to validate narration.'), {
      status: 409,
      code: 'GMC_PRESENCE_CONTRACT_REQUIRED',
    });
  }
  const responseMode = String(input?.responseMode ?? 'in_character');
  const responseText = String(input?.responseText ?? '');
  const sceneSegment = input?.sceneSegment && typeof input.sceneSegment === 'object' && !Array.isArray(input.sceneSegment)
    ? input.sceneSegment
    : null;
  const issues: any[] = [];
  const references: any[] = [];
  if (responseMode !== 'ooc') {
    const declaredWho = Array.isArray(sceneSegment?.who) ? sceneSegment.who.map(String) : [];
    const narrativeSentences = narrativePresenceSentences(responseText);
    for (const npc of presenceContract.knownNonPresentNpcs ?? []) {
      const identityReferences = narrativeIdentityReferences(npc);
      if (!identityReferences.length) continue;
      for (const actor of declaredWho) {
        const match = narrativeReferenceMatch(actor, identityReferences);
        if (!match) continue;
        const issue = {
          code: 'ABSENT_NPC_DECLARED_PRESENT',
          field: 'sceneSegment.who',
          npcId: npc.id,
          name: npc.name,
          reference: match.reference,
          excerpt: actor,
          explanation: `${npc.name} is listed in sceneSegment.who but is absent from GMC's selected scene roster.`,
        };
        issues.push(issue);
        references.push({ ...issue, usage: 'scene_roster_violation' });
        break;
      }
      for (const sentence of narrativeSentences) {
        const match = narrativeReferenceMatch(sentence, identityReferences);
        if (!match) continue;
        const remoteOrReported = narrativeReferenceIsRemoteOrReported(sentence, match.reference, match.index);
        const localRole = narrativeReferenceHasUnambiguousLocalRole(sentence, match.reference);
        const usage = localRole && !remoteOrReported ? 'scene_local_violation' : 'remote_historical_or_discussed';
        references.push({ npcId: npc.id, name: npc.name, reference: match.reference, excerpt: sentence, usage });
        if (usage === 'scene_local_violation') {
          issues.push({
            code: 'ABSENT_NPC_LOCAL_ROLE',
            field: 'responseText',
            npcId: npc.id,
            name: npc.name,
            reference: match.reference,
            excerpt: sentence,
            explanation: `${npc.name} receives an unambiguous scene-local role but is absent from GMC's selected scene roster.`,
          });
        }
      }
    }
  }
  const contractSource = {
    authority: 'gmc.narrativePresence',
    contractVersion: '2026-07-20.1',
    presenceRevision: presenceContract.revision,
    candidateFingerprint: input?.candidateFingerprint ?? null,
    responseMode,
    responseText,
    sceneWho: Array.isArray(sceneSegment?.who) ? sceneSegment.who : [],
    issues,
  };
  return {
    ...contractSource,
    revision: createHash('sha256').update(stablePresenceJson(contractSource)).digest('hex'),
    valid: issues.length === 0,
    issues,
    references,
    rules: [
      'GMC sceneSegment.who is an exact roster declaration.',
      'Known non-present NPCs may be discussed remotely, historically, speculatively, or through reported information.',
      'Only an unambiguous scene-local role for a known non-present NPC is blocking.',
    ],
  };
}

function exactEntityIdentityMatches(value: unknown, records: any[]) {
  const normalized = normalizedReferenceIdentity(value);
  if (!normalized) return [];
  return records.filter((record: any) => [record?.canonical_name ?? record?.name, ...(Array.isArray(record?.aliases) ? record.aliases : [])]
    .some((identity) => normalizedReferenceIdentity(identity) === normalized));
}

function locationDeclarationMatches(where: string, locations: any[]) {
  const primary = normalizedReferenceIdentity(String(where).split(/[,;\n]/, 1)[0]);
  const matches = locations.flatMap((location: any) => {
    const identities = [location?.canonical_name ?? location?.name, ...(Array.isArray(location?.aliases) ? location.aliases : [])]
      .map((identity) => ({ raw: String(identity ?? '').trim(), normalized: normalizedReferenceIdentity(identity) }))
      .filter((identity) => identity.normalized);
    const primaryIdentity = identities.find((identity) => identity.normalized === primary);
    return primaryIdentity ? [{ location, matchedIdentity: primaryIdentity.raw }] : [];
  });
  const byId = new Map<string, any>();
  for (const match of matches) {
    const id = String(match.location?._id ?? match.location?.id ?? '');
    const prior = byId.get(id);
    if (!prior || String(match.matchedIdentity).length > String(prior.matchedIdentity).length) byId.set(id, match);
  }
  return [...byId.values()];
}

type GeneratedSceneEntityKind = Extract<GmcEntityKind, 'npc' | 'location'>;

function normalizeGeneratedSceneEntityPlan(
  userId: string,
  campaignId: string,
  raw: any,
  generationPolicy: ReturnType<typeof classifyWorldGenerationIntent>,
) {
  const entityType = String(raw?.entityType ?? '').trim().toLowerCase() as GeneratedSceneEntityKind;
  const mutationId = String(raw?.mutationId ?? '').trim();
  const name = String(raw?.name ?? raw?.payload?.name ?? '').trim();
  if (!['npc', 'location'].includes(entityType) || !mutationId || mutationId.length > 240 || !name || name.length > 200) {
    throw Object.assign(new Error('Generated scene entities require entityType npc|location, mutationId, and a bounded canonical name.'), {
      status: 409, code: 'SCENE_GENERATED_ENTITY_INVALID', details: { entityType, mutationId: mutationId || null, name: name || null },
    });
  }
  if (generationPolicy.mode !== 'world_generation_allowed' || !generationPolicy.allowedEntityTypes.includes(entityType)) {
    throw Object.assign(new Error(`This instruction does not authorize creation of a new ${entityType}.`), {
      status: 409, code: 'SCENE_GENERATION_NOT_AUTHORIZED', details: { entityType, generationPolicy },
    });
  }
  // A normalized preview is intentionally valid input to the commit-time
  // resolver. This makes the preview/commit boundary replayable instead of
  // asking either GMA or GMC to reinterpret the model's original proposal.
  const payload = objectRecord(raw?.payload ?? raw?.input);
  const aliases = (Array.isArray(payload.aliases ?? raw?.aliases) ? (payload.aliases ?? raw.aliases) : [])
    .map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 20);
  const tags = (Array.isArray(payload.tags ?? raw?.tags) ? (payload.tags ?? raw.tags) : [])
    .map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 30);
  const relationships = (Array.isArray(payload.relationships ?? raw?.relationships) ? (payload.relationships ?? raw.relationships) : []).slice(0, 30);
  const claims = (Array.isArray(payload.claims ?? raw?.claims) ? (payload.claims ?? raw.claims) : []).slice(0, 30);
  const entityTier = includes(ENTITY_SCOPE_TIERS, raw?.entityTier ?? payload.entityTier) ? String(raw?.entityTier ?? payload.entityTier) : 'contact';
  const geographicTier = includes(GEOGRAPHIC_SCOPE_TIERS, raw?.geographicTier ?? payload.geographicTier) ? String(raw?.geographicTier ?? payload.geographicTier) : 'site';
  const parentLocationId = raw?.parentLocationId ?? payload.parentLocationId ?? null;
  const descriptiveDetails = Object.fromEntries(['description', 'role', 'appearance', 'personality', 'occupation', 'address', 'notes']
    .flatMap((key) => {
      const value = payload[key];
      if (typeof value !== 'string' || !value.trim()) return [];
      return [[key, value.trim().slice(0, 4_000)]];
    }));
  const details = {
    ...objectRecord(payload.details ?? raw?.details),
    ...descriptiveDetails,
    name,
    ...(entityType === 'npc' ? {
      entityTier,
    } : {
      geographicTier,
      parentLocationId,
    }),
  };
  const entityInput = {
    name,
    aliases,
    tags: [...new Set([...tags, 'generated-in-play', `scene-generated:${entityType}`])],
    relationships,
    claims,
    details,
    ...(entityType === 'npc' ? { entityTier } : { geographicTier, parentLocationId }),
    status: 'active',
    draft: false,
    source: { system: 'gamemaster-assistant', kind: 'internally-reconciled-scene-generation' },
    mutationId,
  };
  const baseId = generateProjectEntityId(campaignId, entityType as EntityType, name);
  const id = canonicalMutationDocumentId({ userId, campaignId, recordKind: `ENTITY:${entityType}`, mutationId, prefix: baseId });
  return {
    id,
    entityType,
    mutationId,
    name,
    input: entityInput,
    previewRecord: {
      _id: id,
      type: entityType,
      canonical_name: name,
      aliases,
      tags: entityInput.tags,
      details,
      status: 'active',
      draft: false,
    },
  };
}

export function generatedSceneEntitiesRevision(entities: any[]) {
  const source = (Array.isArray(entities) ? entities : []).map((entity) => ({
    id: entity?.id,
    entityType: entity?.entityType,
    mutationId: entity?.mutationId,
    name: entity?.name,
    input: entity?.input,
  }));
  return createHash('sha256').update(stablePresenceJson(source)).digest('hex');
}

export function resolveSceneTransitionContract(input: {
  userId?: string;
  campaignId?: string;
  currentContract: any;
  currentScene: any;
  locations: any[];
  npcs: any[];
  where: string;
  who: string[];
  playerCharacterNames?: string[];
  instruction?: string;
  generatedEntities?: any[];
}) {
  const currentContract = input?.currentContract;
  if (currentContract?.valid !== true || !currentContract?.revision) {
    throw Object.assign(new Error('A valid GMC current-scene presence revision is required.'), { status: 409, code: 'GMC_PRESENCE_CONTRACT_REQUIRED' });
  }
  const where = String(input?.where ?? '').trim();
  if (!where) throw Object.assign(new Error('The proposed scene must declare where it occurs.'), { status: 409, code: 'SCENE_DESTINATION_LOCATION_REQUIRED' });
  const generationPolicy = classifyWorldGenerationIntent(input?.instruction ?? '');
  const rawGeneratedEntities = Array.isArray(input?.generatedEntities) ? input.generatedEntities : [];
  if (rawGeneratedEntities.length > 20) throw Object.assign(new Error('No more than 20 generated scene entities may be staged.'), { status: 409, code: 'SCENE_GENERATED_ENTITY_LIMIT' });
  if (rawGeneratedEntities.length && (!input?.userId || !input?.campaignId)) {
    throw Object.assign(new Error('userId and campaignId are required to stage generated scene entities.'), { status: 409, code: 'SCENE_GENERATION_AUTHORITY_REQUIRED' });
  }
  const stagedEntities = rawGeneratedEntities.map((entity) => normalizeGeneratedSceneEntityPlan(
    String(input.userId), String(input.campaignId), entity, generationPolicy,
  ));
  for (const staged of stagedEntities) {
    const existing = exactEntityIdentityMatches(staged.name, staged.entityType === 'npc' ? (input?.npcs ?? []) : (input?.locations ?? []));
    if (existing.length) {
      throw Object.assign(new Error(`The proposed new ${staged.entityType} “${staged.name}” already matches canonical GMC data. Use the existing record instead of creating a duplicate.`), {
        status: 409, code: 'SCENE_GENERATED_ENTITY_ALREADY_EXISTS', details: { entityType: staged.entityType, name: staged.name, existingIds: existing.map((entry: any) => String(entry?._id ?? entry?.id)) },
      });
    }
  }
  const stagedLocations = stagedEntities.filter((entity) => entity.entityType === 'location').map((entity) => entity.previewRecord);
  const stagedNpcs = stagedEntities.filter((entity) => entity.entityType === 'npc').map((entity) => entity.previewRecord);
  const allLocations = [...(input?.locations ?? []), ...stagedLocations];
  const allNpcs = [...(input?.npcs ?? []), ...stagedNpcs];
  const locationMatches = locationDeclarationMatches(where, allLocations);
  if (locationMatches.length !== 1) {
    const options = locationMatches.map((match) => ({
      id: String(match.location?._id ?? match.location?.id),
      name: String(match.location?.canonical_name ?? match.location?.name),
      matchedIdentity: match.matchedIdentity,
    }));
    throw Object.assign(new Error(locationMatches.length
      ? 'GMC found multiple canonical locations in the structured scene destination. Use one exact primary location name in sceneSegment.where.'
      : 'GMC could not bind sceneSegment.where to a canonical location. Restore or select the exact location before auditing narration.'), {
      status: 409,
      code: locationMatches.length ? 'SCENE_DESTINATION_LOCATION_AMBIGUOUS' : 'SCENE_DESTINATION_LOCATION_UNRESOLVED',
      details: { where, options },
    });
  }
  const playerNames = new Set((input?.playerCharacterNames ?? []).map(normalizedReferenceIdentity).filter(Boolean));
  const declaredWho = [...new Set((Array.isArray(input?.who) ? input.who : []).map((value) => String(value ?? '').trim()).filter(Boolean))];
  const presentNpcIds: string[] = [];
  const presentNpcs: any[] = [];
  const nonNpcActors: string[] = [];
  const unresolvedActors: string[] = [];
  const ambiguousActors: Array<{ name: string; options: Array<{ id: string; name: string }> }> = [];
  for (const actorName of declaredWho) {
    if (playerNames.has(normalizedReferenceIdentity(actorName))) { nonNpcActors.push(actorName); continue; }
    const matches = exactEntityIdentityMatches(actorName, allNpcs);
    if (matches.length === 1) {
      const id = String(matches[0]?._id ?? matches[0]?.id);
      if (!presentNpcIds.includes(id)) {
        presentNpcIds.push(id);
        presentNpcs.push({ id, name: String(matches[0]?.canonical_name ?? matches[0]?.name), matchedIdentity: actorName });
      }
    } else if (!matches.length) unresolvedActors.push(actorName);
    else ambiguousActors.push({ name: actorName, options: matches.map((npc: any) => ({ id: String(npc?._id ?? npc?.id), name: String(npc?.canonical_name ?? npc?.name) })) });
  }
  if (unresolvedActors.length || ambiguousActors.length) {
    throw Object.assign(new Error('GMC could not resolve every declared scene actor uniquely. Correct sceneSegment.who before auditing narration.'), {
      status: 409, code: 'SCENE_DESTINATION_ROSTER_UNRESOLVED', details: { unresolvedActors, ambiguousActors, playerCharacterNames: [...playerNames] },
    });
  }
  const selected = locationMatches[0];
  const locationId = String(selected.location?._id ?? selected.location?.id);
  const presenceContract = buildProposedScenePresenceContract({
    currentContract, location: selected.location, presentNpcIds, npcs: allNpcs,
  });
  if (!presenceContract.valid) {
    throw Object.assign(new Error('GMC could not build an exact proposed-scene presence contract.'), {
      status: 409, code: 'SCENE_PRESENCE_PROPOSAL_INVALID', details: { presenceContract },
    });
  }
  const currentNpcIds = (Array.isArray(currentContract?.exactPresentNpcIds) ? currentContract.exactPresentNpcIds : []).map(String).sort();
  const proposedNpcIds = [...presentNpcIds].sort();
  const usedGeneratedIds = new Set([locationId, ...proposedNpcIds]);
  const generatedEntities = stagedEntities
    .filter((entity) => usedGeneratedIds.has(entity.id))
    .map(({ previewRecord: _previewRecord, ...entity }) => entity);
  const generatedEntityRevision = generatedSceneEntitiesRevision(generatedEntities);
  const transitionRequired = String(input?.currentScene?.locationId ?? '') !== locationId
    || JSON.stringify(currentNpcIds) !== JSON.stringify(proposedNpcIds);
  const contractSource = {
    authority: 'gmc.sceneTransition', contractVersion: SCENE_TRANSITION_CONTRACT_VERSION,
    baseRevision: currentContract.revision, locationId, presentNpcIds: proposedNpcIds,
    where, who: declaredWho, nonNpcActors, generatedEntityRevision,
  };
  return {
    ...contractSource,
    revision: createHash('sha256').update(stablePresenceJson(contractSource)).digest('hex'),
    status: 'resolved',
    transitionRequired,
    location: {
      id: locationId,
      name: String(selected.location?.canonical_name ?? selected.location?.name),
      matchedIdentity: selected.matchedIdentity,
      aliases: Array.isArray(selected.location?.aliases) ? selected.location.aliases : [],
      details: selected.location?.details ?? {},
    },
    presentNpcIds: proposedNpcIds,
    presentNpcs,
    nonNpcActors,
    generationPolicy,
    generatedEntities,
    generatedEntityRevision,
    presenceContract: transitionRequired ? presenceContract : currentContract,
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
