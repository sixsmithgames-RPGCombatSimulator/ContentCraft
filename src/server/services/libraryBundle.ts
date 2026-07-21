import { z } from 'zod';
import { generateChunkId, type CanonChunk } from '../models/CanonChunk.js';
import { generateEntityId, type CanonEntity, type EntityType } from '../models/CanonEntity.js';
import { generateCollectionId, type LibraryCollection } from '../models/LibraryCollection.js';

export const LIBRARY_BUNDLE_SCHEMA = 'gmc-canon-library-bundle/v1' as const;

const entityTypes = ['npc', 'monster', 'item', 'spell', 'location', 'faction', 'rule', 'timeline'] as const;
const shortString = z.string().trim().min(1).max(500);
const optionalShortString = z.string().trim().max(500).optional();

const relationshipSchema = z.object({
  target_id: shortString,
  kind: shortString,
}).strict();

const claimSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  source: z.string().trim().min(1).max(2_000),
}).strict();

const entitySchema = z.object({
  _id: shortString,
  type: z.enum(entityTypes),
  canonical_name: shortString,
  aliases: z.array(shortString).max(100).default([]),
  era: optionalShortString,
  region: optionalShortString,
  relationships: z.array(relationshipSchema).max(500).default([]),
  claims: z.array(claimSchema).max(1_000).default([]),
  npc_details: z.record(z.unknown()).optional(),
  spell_details: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
  status: optionalShortString,
  draft: z.boolean().optional(),
  schema_version: optionalShortString,
  is_official: z.boolean().optional(),
  tags: z.array(shortString).max(200).default([]),
  source: z.string().trim().max(2_000).optional(),
  version: optionalShortString,
}).strict();

const chunkSchema = z.object({
  entity_id: shortString,
  text: z.string().trim().min(1).max(20_000),
  metadata: z.record(z.unknown()).default({}),
}).strict();

const collectionSchema = z.object({
  _id: shortString,
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(4_000),
  entity_ids: z.array(shortString).max(2_000),
  tags: z.array(shortString).max(200).default([]),
  category: optionalShortString,
  is_official: z.boolean().optional(),
}).strict();

const libraryBundleSchema = z.object({
  schema: z.literal(LIBRARY_BUNDLE_SCHEMA),
  exported_at: z.string().datetime(),
  collection: collectionSchema,
  dependency_entity_ids: z.array(shortString).max(2_000).default([]),
  entities: z.array(entitySchema).max(2_000),
  chunks: z.array(chunkSchema).max(20_000).default([]),
}).strict();

export type LibraryBundle = {
  schema: typeof LIBRARY_BUNDLE_SCHEMA;
  exported_at: string;
  collection: {
    _id: string;
    name: string;
    description: string;
    entity_ids: string[];
    tags: string[];
    category?: string;
    is_official?: boolean;
  };
  dependency_entity_ids: string[];
  entities: Array<{
    _id: string;
    type: EntityType;
    canonical_name: string;
    aliases: string[];
    era?: string;
    region?: string;
    relationships: NonNullable<CanonEntity['relationships']>;
    claims: CanonEntity['claims'];
    npc_details?: CanonEntity['npc_details'];
    spell_details?: CanonEntity['spell_details'];
    details?: CanonEntity['details'];
    status?: string;
    draft?: boolean;
    schema_version?: string;
    is_official?: boolean;
    tags: string[];
    source?: string;
    version?: string;
  }>;
  chunks: Array<{
    entity_id: string;
    text: string;
    metadata: CanonChunk['metadata'];
  }>;
};

export type LibraryImportPlan = {
  collection: Omit<LibraryCollection, 'userId' | 'created_at' | 'updated_at'>;
  entities: CanonEntity[];
  chunks: CanonChunk[];
  dependencyEntityIds: string[];
};

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

export function createLibraryBundle(
  collection: LibraryCollection,
  entities: CanonEntity[],
  chunks: CanonChunk[],
): LibraryBundle {
  const includedIds = new Set(entities.map((entity) => entity._id));
  const memberIds = collection.entity_ids.filter((id) => includedIds.has(id));
  const memberIdSet = new Set(memberIds);

  return {
    schema: LIBRARY_BUNDLE_SCHEMA,
    exported_at: new Date().toISOString(),
    collection: withoutUndefined({
      _id: collection._id,
      name: collection.name,
      description: collection.description,
      entity_ids: memberIds,
      tags: collection.tags ?? [],
      category: collection.category,
      is_official: collection.is_official,
    }),
    dependency_entity_ids: entities
      .map((entity) => entity._id)
      .filter((id) => !memberIdSet.has(id)),
    entities: entities.map((entity) => withoutUndefined({
      _id: entity._id,
      type: entity.type,
      canonical_name: entity.canonical_name,
      aliases: entity.aliases ?? [],
      era: entity.era,
      region: entity.region,
      relationships: entity.relationships ?? [],
      claims: entity.claims ?? [],
      npc_details: entity.npc_details,
      spell_details: entity.spell_details,
      details: entity.details,
      status: entity.status,
      draft: entity.draft,
      schema_version: entity.schema_version,
      is_official: entity.is_official,
      tags: entity.tags ?? [],
      source: entity.source,
      version: entity.version,
    })),
    chunks: chunks
      .filter((chunk) => includedIds.has(chunk.entity_id))
      .map((chunk) => ({
        entity_id: chunk.entity_id,
        text: chunk.text,
        metadata: chunk.metadata ?? {},
      })),
  };
}

export function createLibraryImportPlan(input: unknown): LibraryImportPlan {
  const bundle = libraryBundleSchema.parse(input) as unknown as LibraryBundle;
  const oldToNewId = new Map<string, string>();
  const generatedIds = new Set<string>();

  for (const entity of bundle.entities) {
    const generatedId = generateEntityId(entity.type as EntityType, entity.canonical_name, 'lib');
    if (generatedIds.has(generatedId)) {
      throw new Error(`Bundle contains duplicate canonical entity identity: ${generatedId}`);
    }
    generatedIds.add(generatedId);
    oldToNewId.set(entity._id, generatedId);
  }

  const entities: CanonEntity[] = bundle.entities.map((entity) => ({
    _id: oldToNewId.get(entity._id)!,
    scope: 'lib',
    type: entity.type as EntityType,
    canonical_name: entity.canonical_name,
    aliases: entity.aliases,
    era: entity.era,
    region: entity.region,
    relationships: entity.relationships.map((relationship) => ({
      target_id: oldToNewId.get(relationship.target_id) ?? relationship.target_id,
      kind: relationship.kind,
    })),
    claims: entity.claims,
    npc_details: entity.npc_details as CanonEntity['npc_details'],
    spell_details: entity.spell_details as CanonEntity['spell_details'],
    details: entity.details,
    status: entity.status,
    draft: entity.draft,
    schema_version: entity.schema_version,
    is_official: Boolean(entity.is_official),
    tags: entity.tags,
    source: entity.source,
    version: entity.version || '1.0.0',
  }));

  const collectionEntityIds = bundle.collection.entity_ids.map((oldId) => {
    const mapped = oldToNewId.get(oldId);
    if (!mapped) throw new Error(`Collection member ${oldId} is missing from bundle entities.`);
    return mapped;
  });

  const chunksByEntity = new Map<string, LibraryBundle['chunks']>();
  for (const chunk of bundle.chunks) {
    const mappedEntityId = oldToNewId.get(chunk.entity_id);
    if (!mappedEntityId) throw new Error(`Chunk references unknown bundle entity ${chunk.entity_id}.`);
    const existing = chunksByEntity.get(mappedEntityId) ?? [];
    existing.push(chunk);
    chunksByEntity.set(mappedEntityId, existing);
  }

  const chunks: CanonChunk[] = [];
  for (const entity of entities) {
    const supplied = chunksByEntity.get(entity._id) ?? [];
    const sourceChunks = supplied.length > 0
      ? supplied.map((chunk) => ({ text: chunk.text, metadata: chunk.metadata }))
      : entity.claims.map((entityClaim) => ({
          text: entityClaim.text,
          metadata: {
            source: entityClaim.source,
            entity_name: entity.canonical_name,
            entity_type: entity.type,
            era: entity.era,
            region: entity.region,
            tags: entity.tags,
          },
        }));

    sourceChunks.forEach((chunk, index) => {
      chunks.push({
        _id: generateChunkId(entity._id, index + 1),
        entity_id: entity._id,
        text: chunk.text,
        metadata: chunk.metadata,
      });
    });
  }

  return {
    collection: {
      _id: generateCollectionId(bundle.collection.name),
      name: bundle.collection.name,
      description: bundle.collection.description,
      entity_ids: collectionEntityIds,
      tags: bundle.collection.tags,
      category: bundle.collection.category,
      is_official: Boolean(bundle.collection.is_official),
    },
    entities,
    chunks,
    dependencyEntityIds: bundle.dependency_entity_ids
      .map((oldId) => oldToNewId.get(oldId))
      .filter((id): id is string => Boolean(id)),
  };
}
