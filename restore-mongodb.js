/**
 * Restore MongoDB from JSON backup
 */
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = 'mongodb://127.0.0.1:27017/dndgen';
const BACKUP_DIR = path.join(__dirname, 'backups', 'mongodb-backup-2025-12-14_12-44-48');

async function restoreCollection(db, collectionName, jsonFile) {
  console.log(`\n📦 Restoring ${collectionName}...`);

  const filePath = path.join(BACKUP_DIR, jsonFile);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${jsonFile}`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');

  // Handle empty files (just "[]" or whitespace)
  if (!fileContent || fileContent.trim() === '[]' || fileContent.trim() === '') {
    console.log(`  ⏭️  Skipping empty collection`);
    return;
  }

  // Parse JSON array
  const documents = JSON.parse(fileContent);

  if (documents.length === 0) {
    console.log(`  ⏭️  No documents to restore`);
    return;
  }

  const collection = db.collection(collectionName);

  // Drop existing collection
  try {
    await collection.drop();
    console.log(`  🗑️  Dropped existing collection`);
  } catch (err) {
    // Collection might not exist, that's ok
  }

  // Insert documents
  await collection.insertMany(documents);
  console.log(`  ✅ Restored ${documents.length} documents`);
}

async function restore() {
  console.log('🔄 Starting MongoDB Restore...');
  console.log(`📂 Backup directory: ${BACKUP_DIR}`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();

    // Restore all collections
    const collections = [
      { name: 'generated_content', file: 'generated_content.json' },
      { name: 'canon_entities', file: 'canon_entities.json' },
      { name: 'canon_chunks', file: 'canon_chunks.json' },
      { name: 'library_collections', file: 'library_collections.json' },
      { name: 'project_library_links', file: 'project_library_links.json' },
      { name: 'runs', file: 'runs.json' },
      { name: 'artifacts', file: 'artifacts.json' },
      { name: 'npc_records', file: 'npc_records.json' },
      { name: 'encounter_records', file: 'encounter_records.json' },
      { name: 'schema_registry', file: 'schema_registry.json' },
      { name: 'authority', file: 'authority.json' },
    ];

    for (const { name, file } of collections) {
      await restoreCollection(db, name, file);
    }

    console.log('\n✅ Restore completed successfully!');

  } catch (error) {
    console.error('❌ Restore failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

restore();
