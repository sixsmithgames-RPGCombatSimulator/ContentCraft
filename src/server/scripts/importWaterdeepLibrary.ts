/**
 * Idempotently installs the curated Waterdeep library into GMC MongoDB.
 *
 * Usage:
 *   npm run canon:waterdeep -- --dry-run --user-id <clerk-user-id>
 *   npm run canon:waterdeep -- --user-id <clerk-user-id> [--project-id <id>]
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import {
  closeMongo,
  connectToMongo,
  getCanonChunksCollection,
  getCanonEntitiesCollection,
  getLibraryCollectionsCollection,
  getProjectLibraryLinksCollection,
} from '../config/mongo.js';
import { generateChunkId, type CanonChunk } from '../models/CanonChunk.js';
import { generateLinkId, type ProjectLibraryLink } from '../models/ProjectLibraryLink.js';
import {
  WATERDEEP_CANON_COLLECTIONS,
  WATERDEEP_CANON_ENTITIES,
} from '../data/waterdeepCanon.js';

type ImportOptions = {
  userId: string;
  dryRun?: boolean;
  projectId?: string;
};

export type WaterdeepImportReport = {
  dryRun: boolean;
  userId: string;
  collectionIds: string[];
  entities: { created: number; updated: number; total: number };
  chunks: { replaced: number; total: number };
  collections: { created: number; updated: number; total: number };
  projectLinks: { created: number; existing: number; projectId: string | null };
};

const ownerConflict = (kind: string, id: string, owner: unknown, requestedOwner: string): Error =>
  new Error(`${kind} ${id} belongs to ${String(owner)}; refusing to reassign it to ${requestedOwner}.`);

export async function importWaterdeepLibrary(options: ImportOptions): Promise<WaterdeepImportReport> {
  const userId = options.userId.trim();
  if (!userId) throw new Error('A non-empty userId is required.');

  const entitiesCollection = getCanonEntitiesCollection();
  const chunksCollection = getCanonChunksCollection();
  const collectionsCollection = getLibraryCollectionsCollection();
  const linksCollection = getProjectLibraryLinksCollection();
  const now = new Date();

  const report: WaterdeepImportReport = {
    dryRun: Boolean(options.dryRun),
    userId,
    collectionIds: WATERDEEP_CANON_COLLECTIONS.map((collection) => collection._id),
    entities: { created: 0, updated: 0, total: WATERDEEP_CANON_ENTITIES.length },
    chunks: {
      replaced: 0,
      total: WATERDEEP_CANON_ENTITIES.reduce((sum, entity) => sum + entity.claims.length, 0),
    },
    collections: { created: 0, updated: 0, total: WATERDEEP_CANON_COLLECTIONS.length },
    projectLinks: { created: 0, existing: 0, projectId: options.projectId?.trim() || null },
  };

  for (const seed of WATERDEEP_CANON_ENTITIES) {
    const existing = await entitiesCollection.findOne({ _id: seed._id });
    if (existing?.userId && existing.userId !== userId) {
      throw ownerConflict('Canon entity', seed._id, existing.userId, userId);
    }

    if (existing) report.entities.updated += 1;
    else report.entities.created += 1;

    if (!options.dryRun) {
      const { _id, created_at: _createdAt, ...mutableSeed } = seed;
      await entitiesCollection.updateOne(
        { _id },
        {
          $set: { ...mutableSeed, userId, updated_at: now },
          $setOnInsert: { _id, created_at: now },
        },
        { upsert: true },
      );

      const chunks: CanonChunk[] = seed.claims.map((seedClaim, index) => ({
        _id: generateChunkId(seed._id, index + 1),
        userId,
        entity_id: seed._id,
        text: seedClaim.text,
        metadata: {
          source: seedClaim.source,
          entity_name: seed.canonical_name,
          entity_type: seed.type,
          era: seed.era,
          region: seed.region,
          tags: seed.tags,
          canon_layer: seed.details?.canonLayer ?? 'high-level',
          collection_ids: WATERDEEP_CANON_COLLECTIONS
            .filter((collection) => collection.entity_ids.includes(seed._id))
            .map((collection) => collection._id),
        },
        created_at: now,
        updated_at: now,
      }));

      await chunksCollection.deleteMany({ entity_id: seed._id });
      if (chunks.length > 0) await chunksCollection.insertMany(chunks);
      report.chunks.replaced += chunks.length;
    }
  }

  for (const collection of WATERDEEP_CANON_COLLECTIONS) {
    const existingCollection = await collectionsCollection.findOne({ _id: collection._id });
    if (existingCollection?.userId && existingCollection.userId !== userId) {
      throw ownerConflict('Library collection', collection._id, existingCollection.userId, userId);
    }
    if (existingCollection) report.collections.updated += 1;
    else report.collections.created += 1;

    if (!options.dryRun) {
      const { _id, ...collectionSeed } = collection;
      await collectionsCollection.updateOne(
        { _id },
        {
          $set: { ...collectionSeed, userId, updated_at: now },
          $setOnInsert: { _id, created_at: now },
        },
        { upsert: true },
      );
    }
  }

  const projectId = options.projectId?.trim();
  if (projectId) {
    for (const entity of WATERDEEP_CANON_ENTITIES) {
      const linkId = generateLinkId(projectId, entity._id);
      const existing = await linksCollection.findOne({ _id: linkId });
      if (existing) {
        report.projectLinks.existing += 1;
        continue;
      }

      report.projectLinks.created += 1;
      if (!options.dryRun) {
        const link: ProjectLibraryLink = {
          _id: linkId,
          userId,
          project_id: projectId,
          library_entity_id: entity._id,
          added_at: now,
          added_by: userId,
        };
        await linksCollection.insertOne(link);
      }
    }
  }

  if (options.dryRun) report.chunks.replaced = report.chunks.total;
  return report;
}

type CliOptions = ImportOptions & { help?: boolean };

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = { userId: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--user-id') parsed.userId = args[++index] ?? '';
    else if (arg === '--project-id') parsed.projectId = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function loadEnvironment(): void {
  dotenv.config({ path: resolve('.env') });
  dotenv.config({ path: resolve('.env.local'), override: true });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run canon:waterdeep -- [--dry-run] --user-id <id> [--project-id <id>]');
    return;
  }

  loadEnvironment();
  options.userId = options.userId || process.env.DEFAULT_USER_ID || '';
  if (!options.userId) throw new Error('Pass --user-id or configure DEFAULT_USER_ID.');

  const db = await connectToMongo();
  if (!db) throw new Error('MongoDB is not configured or unavailable.');

  try {
    const report = await importWaterdeepLibrary(options);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closeMongo();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
