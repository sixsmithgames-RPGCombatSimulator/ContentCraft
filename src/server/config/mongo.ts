/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { MongoClient, Db } from 'mongodb';
import type { Collection } from 'mongodb';
import type { CanonEntity } from '../models/CanonEntity.js';
import type { CanonChunk } from '../models/CanonChunk.js';
import type { ProjectLibraryLink } from '../models/ProjectLibraryLink.js';
import type { LibraryCollection } from '../models/LibraryCollection.js';
import type { Run } from '../models/Run.js';
import type { Artifact } from '../models/Artifact.js';
import type { GeneratedContentDocument } from '../models/GeneratedContent.js';
import type { GenerationRun } from '../models/GenerationRun.js';
import type { SchemaRegistryEntry } from '../models/SchemaRegistry.js';
import type { NpcRecord } from '../models/NpcRecord.js';
import type { EncounterRecord } from '../models/EncounterRecord.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dndgen';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToMongo(): Promise<Db | null> {
  if (db) {
    return db;
  }

  // Skip MongoDB if URI is not configured
  if (!process.env.MONGODB_URI) {
    console.log('⚠️ MongoDB URI not configured - D&D Generator features will be unavailable');
    console.log('💡 Set MONGODB_URI environment variable to enable D&D features');
    return null;
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();

    console.log('✓ Connected to MongoDB');

    // Create indexes
    await createIndexes(db);

    return db;
  } catch (error) {
    console.error('⚠️ MongoDB connection failed:', error);
    console.log('💡 D&D Generator features will be unavailable');
    console.log('💡 ContentCraft features (copy/paste to AI) will still work');
    // Don't throw - allow app to run without MongoDB
    return null;
  }
}

async function createIndexes(database: Db): Promise<void> {
  // ContentCraft projects indexes
  await database.collection('projects').createIndex({ userId: 1, updatedAt: -1 });
  await database.collection('projects').createIndex({ userId: 1, type: 1 });

  // ContentCraft content blocks indexes
  await database.collection('content_blocks').createIndex({ userId: 1, projectId: 1, order: 1 });
  await database.collection('content_blocks').createIndex({ userId: 1, parentId: 1 });

  // Canon entities indexes
  await database.collection('canon_entities').createIndex({ type: 1 });
  await database.collection('canon_entities').createIndex({ canonical_name: 1 });
  await database.collection('canon_entities').createIndex({ era: 1, region: 1 });
  await database.collection('canon_entities').createIndex({ 'aliases': 1 });
  await database.collection('canon_entities').createIndex({ scope: 1, type: 1, canonical_name: 1 });
  await database.collection('canon_entities').createIndex({ tags: 1, era: 1, region: 1 });

  // Canon chunks indexes
  await database.collection('canon_chunks').createIndex({ entity_id: 1 });
  await database.collection('canon_chunks').createIndex({ 'metadata.region': 1 });
  await database.collection('canon_chunks').createIndex({ 'metadata.era': 1 });
  await database.collection('canon_chunks').createIndex({ 'metadata.tags': 1 });

  // Runs indexes
  await database.collection('runs').createIndex({ status: 1 });
  await database.collection('runs').createIndex({ type: 1 });
  await database.collection('runs').createIndex({ createdAt: -1 });

  // Artifacts indexes
  await database.collection('artifacts').createIndex({ run_id: 1 });
  await database.collection('artifacts').createIndex({ stage: 1 });

  await database.collection('schema_registry').createIndex({ domain: 1, version: 1 }, { unique: true });
  await database.collection('schema_registry').createIndex({ domain: 1, active: 1 });

  await database.collection('npc_records').createIndex({ project_id: 1, canonical_id: 1 }, { unique: true });
  await database.collection('npc_records').createIndex({ tags: 1 });
  await database.collection('npc_records').createIndex({ 'normalized.name': 'text', 'normalized.summary': 'text' });

  await database.collection('encounter_records').createIndex({ project_id: 1, canonical_id: 1 }, { unique: true });
  await database.collection('encounter_records').createIndex({ tags: 1 });
  await database.collection('encounter_records').createIndex({ 'normalized.title': 'text', 'normalized.description': 'text' });

  console.log('✓ MongoDB indexes created');
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not available. This feature requires MongoDB. Set MONGODB_URI environment variable.');
  }
  return db;
}

export function isMongoAvailable(): boolean {
  return db !== null;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('✓ MongoDB connection closed');
  }
}

export function getCanonEntitiesCollection(): Collection<CanonEntity> {
  return getDb().collection<CanonEntity>('canon_entities');
}

export function getCanonChunksCollection(): Collection<CanonChunk> {
  return getDb().collection<CanonChunk>('canon_chunks');
}

export function getProjectLibraryLinksCollection(): Collection<ProjectLibraryLink> {
  return getDb().collection<ProjectLibraryLink>('project_library_links');
}

export function getLibraryCollectionsCollection(): Collection<LibraryCollection> {
  return getDb().collection<LibraryCollection>('library_collections');
}

export function getRunsCollection(): Collection<Run> {
  return getDb().collection<Run>('runs');
}

export function getArtifactsCollection(): Collection<Artifact> {
  return getDb().collection<Artifact>('artifacts');
}

export function getGeneratedContentCollection(): Collection<GeneratedContentDocument> {
  return getDb().collection<GeneratedContentDocument>('generated_content');
}

export function getGenerationRunsCollection(): Collection<GenerationRun> {
  return getDb().collection<GenerationRun>('generation_runs');
}

export function getSchemaRegistryCollection(): Collection<SchemaRegistryEntry> {
  return getDb().collection<SchemaRegistryEntry>('schema_registry');
}

export function getNpcRecordsCollection(): Collection<NpcRecord> {
  return getDb().collection<NpcRecord>('npc_records');
}

export function getEncounterRecordsCollection(): Collection<EncounterRecord> {
  return getDb().collection<EncounterRecord>('encounter_records');
}
