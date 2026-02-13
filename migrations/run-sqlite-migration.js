/**
 * SQLite Migration Runner
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 *
 * Run with: node migrations/run-sqlite-migration.js
 */

import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || './data/contentcraft.db';
const migrationPath = join(__dirname, '001_add_multi_tenancy.sql');

console.log('🚀 Starting SQLite multi-tenancy migration...\n');
console.log(`📂 Database: ${dbPath}`);
console.log(`📄 Migration: ${migrationPath}\n`);

const db = new sqlite3.Database(dbPath);

// Read migration SQL
const sql = readFileSync(migrationPath, 'utf8');

// Split into individual statements (SQLite can't run multiple at once)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

let completed = 0;
let failed = 0;

console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

db.serialize(() => {
  statements.forEach((statement, index) => {
    db.run(statement, function(err) {
      if (err) {
        // Some errors are acceptable (like column already exists)
        if (err.message.includes('duplicate column name')) {
          console.log(`⚠️  Statement ${index + 1}: Column already exists (skipping)`);
          completed++;
        } else if (err.message.includes('already exists')) {
          console.log(`⚠️  Statement ${index + 1}: Already exists (skipping)`);
          completed++;
        } else {
          console.error(`❌ Statement ${index + 1} failed:`, err.message);
          failed++;
        }
      } else {
        completed++;
        const preview = statement.substring(0, 60).replace(/\n/g, ' ');
        console.log(`✓ Statement ${index + 1}: ${preview}${statement.length > 60 ? '...' : ''}`);
      }

      // Check if this was the last statement
      if (index === statements.length - 1) {
        console.log(`\n📊 Migration Summary:`);
        console.log(`   Completed: ${completed}/${statements.length}`);
        console.log(`   Failed: ${failed}/${statements.length}\n`);

        // Verify the migration
        db.get("SELECT COUNT(*) as count FROM users WHERE id = 'local-dev'", (err, row) => {
          if (err) {
            console.error('❌ Verification failed:', err.message);
          } else if (row.count > 0) {
            console.log('✅ Verification: local-dev user exists');

            // Check if existing data was migrated
            db.get("SELECT COUNT(*) as count FROM projects WHERE user_id = 'local-dev'", (err, row) => {
              if (err) {
                console.error('❌ Verification failed:', err.message);
              } else {
                console.log(`✅ Verification: ${row.count} projects assigned to local-dev user\n`);

                console.log('✅ SQLite migration completed successfully!');
                console.log('\n📝 Next steps:');
                console.log('   1. Run MongoDB migration: node migrations/001_add_multi_tenancy_mongo.js');
                console.log('   2. Update application code');
                console.log('   3. Test the application\n');

                db.close();
              }
            });
          } else {
            console.error('❌ Verification failed: local-dev user not found');
            db.close();
          }
        });
      }
    });
  });
});
