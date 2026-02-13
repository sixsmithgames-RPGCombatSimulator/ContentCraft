/**
 * MongoDB Migration: Add Multi-Tenancy Support
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 *
 * This migration adds userId fields to all MongoDB collections while preserving existing data.
 * All existing data is assigned to the 'local-dev' user.
 *
 * Run with: node migrations/001_add_multi_tenancy_mongo.js
 */

import { connectToMongo, getDb, closeMongo } from '../src/server/config/mongo.js';

const DEFAULT_USER_ID = 'local-dev';

async function migrate() {
  console.log('🚀 Starting MongoDB multi-tenancy migration...\n');

  try {
    await connectToMongo();
    const db = getDb();

    // Collections to migrate
    const collections = [
      'canon_entities',
      'canon_chunks',
      'generated_content',
      'npc_records',
      'encounter_records',
      'library_collections',
      'project_library_links',
      'generation_runs',
      'runs',
      'artifacts',
      'authority'
    ];

    let totalUpdated = 0;

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);

        // Check if collection exists
        const exists = await db.listCollections({ name: collectionName }).hasNext();
        if (!exists) {
          console.log(`⏭️  Skipping ${collectionName} (doesn't exist)`);
          continue;
        }

        // Count documents without userId
        const count = await collection.countDocuments({ userId: { $exists: false } });

        if (count === 0) {
          console.log(`✓ ${collectionName}: Already migrated (0 documents to update)`);
          continue;
        }

        // Add userId to all documents without it
        const result = await collection.updateMany(
          { userId: { $exists: false } },
          { $set: { userId: DEFAULT_USER_ID } }
        );

        console.log(`✓ ${collectionName}: Updated ${result.modifiedCount} documents`);
        totalUpdated += result.modifiedCount;

      } catch (error) {
        console.error(`❌ Error migrating ${collectionName}:`, error.message);
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Total documents updated: ${totalUpdated}`);
    console.log(`   Default userId: ${DEFAULT_USER_ID}\n`);

    // Create indexes for userId fields
    console.log('📑 Creating indexes...');

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const exists = await db.listCollections({ name: collectionName }).hasNext();

        if (exists) {
          await collection.createIndex({ userId: 1 });
          console.log(`✓ Created index on ${collectionName}.userId`);
        }
      } catch (error) {
        console.error(`❌ Error creating index for ${collectionName}:`, error.message);
      }
    }

    console.log('\n✅ MongoDB migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run SQLite migration: node migrations/run-sqlite-migration.js');
    console.log('   2. Update application code to use userId filtering');
    console.log('   3. Test in SINGLE_USER_MODE=true\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

migrate();
