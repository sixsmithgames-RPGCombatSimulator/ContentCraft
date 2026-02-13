/**
 * MongoDB Migration: Add Multi-Tenancy Support
 * © 2025 Sixsmith Games. All rights reserved.
 *
 * Run with: node migrations/run-mongodb-migration.js
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dndgen';
const DEFAULT_USER_ID = 'local-dev';

async function migrate() {
  console.log('🚀 Starting MongoDB multi-tenancy migration...\n');
  console.log(`📂 MongoDB URI: ${MONGO_URI.replace(/:[^:]*@/, ':****@')}\n`);

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log(`✅ Connected to database: ${db.databaseName}\n`);

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
    let totalSkipped = 0;

    console.log(`📝 Migrating ${collections.length} collections...\n`);

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);

        // Check if collection exists
        const exists = await db.listCollections({ name: collectionName }).hasNext();
        if (!exists) {
          console.log(`${collectionName}`);
          console.log(`   ⏭️  Collection doesn't exist (skipping)`);
          totalSkipped++;
          continue;
        }

        // Count documents without userId
        const countWithout = await collection.countDocuments({ userId: { $exists: false } });
        const countWith = await collection.countDocuments({ userId: { $exists: true } });

        console.log(`${collectionName}`);

        if (countWithout === 0 && countWith > 0) {
          console.log(`   ⏭️  Already migrated (${countWith} documents with userId)`);
          totalSkipped++;
          continue;
        }

        if (countWithout === 0 && countWith === 0) {
          console.log(`   ⏭️  Empty collection`);
          totalSkipped++;
          continue;
        }

        // Add userId to all documents without it
        const result = await collection.updateMany(
          { userId: { $exists: false } },
          { $set: { userId: DEFAULT_USER_ID } }
        );

        console.log(`   ✅ Updated ${result.modifiedCount} documents → userId: '${DEFAULT_USER_ID}'`);
        totalUpdated += result.modifiedCount;

      } catch (error) {
        console.error(`${collectionName}`);
        console.error(`   ❌ Error: ${error.message}`);
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Documents updated: ${totalUpdated}`);
    console.log(`   ⏭️  Collections skipped: ${totalSkipped}`);
    console.log(`   🔑 Default userId: '${DEFAULT_USER_ID}'\n`);

    // Create indexes for userId fields
    console.log('📑 Creating indexes for userId fields...\n');

    let indexesCreated = 0;
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const exists = await db.listCollections({ name: collectionName }).hasNext();

        if (exists) {
          await collection.createIndex({ userId: 1 });
          console.log(`   ✓ ${collectionName}.userId`);
          indexesCreated++;
        }
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error(`   ❌ ${collectionName}: ${error.message}`);
        }
      }
    }

    console.log(`\n✅ Created ${indexesCreated} indexes\n`);

    console.log('✅ MongoDB migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Add to .env: SINGLE_USER_MODE=true');
    console.log('   2. Add to .env: DEFAULT_USER_ID=local-dev');
    console.log('   3. Update routes to use authMiddleware');
    console.log('   4. Test the application\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  MongoDB is not running or not accessible');
      console.log('   Start MongoDB and try again\n');
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
