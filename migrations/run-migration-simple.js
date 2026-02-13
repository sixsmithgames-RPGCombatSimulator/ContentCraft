/**
 * Simple SQLite Migration Runner
 * © 2025 Sixsmith Games. All rights reserved.
 *
 * Run with: node migrations/run-migration-simple.js
 */

import sqlite3 from 'sqlite3';

const dbPath = process.env.DATABASE_PATH || './data/contentcraft.db';

console.log('🚀 Starting SQLite multi-tenancy migration...\n');
console.log(`📂 Database: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath);

// Define migration statements in correct order
const migrations = [
  {
    name: 'Create users table',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      metadata TEXT DEFAULT '{}'
    )`
  },
  {
    name: 'Insert local-dev user',
    sql: `INSERT OR IGNORE INTO users (id, email, display_name) VALUES ('local-dev', 'local@dev.local', 'Local Development User')`
  },
  {
    name: 'Add user_id to projects',
    sql: `ALTER TABLE projects ADD COLUMN user_id TEXT`
  },
  {
    name: 'Set projects user_id to local-dev',
    sql: `UPDATE projects SET user_id = 'local-dev' WHERE user_id IS NULL`
  },
  {
    name: 'Add user_id to content_blocks',
    sql: `ALTER TABLE content_blocks ADD COLUMN user_id TEXT`
  },
  {
    name: 'Set content_blocks user_id to local-dev',
    sql: `UPDATE content_blocks SET user_id = 'local-dev' WHERE user_id IS NULL`
  },
  {
    name: 'Add user_id to fact_checks',
    sql: `ALTER TABLE fact_checks ADD COLUMN user_id TEXT`
  },
  {
    name: 'Set fact_checks user_id to local-dev',
    sql: `UPDATE fact_checks SET user_id = 'local-dev' WHERE user_id IS NULL`
  },
  {
    name: 'Add user_id to sources',
    sql: `ALTER TABLE sources ADD COLUMN user_id TEXT`
  },
  {
    name: 'Set sources user_id to local-dev',
    sql: `UPDATE sources SET user_id = 'local-dev' WHERE user_id IS NULL`
  },
  {
    name: 'Create index on projects.user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`
  },
  {
    name: 'Create index on content_blocks.user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_content_blocks_user_id ON content_blocks(user_id)`
  },
  {
    name: 'Create index on fact_checks.user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_fact_checks_user_id ON fact_checks(user_id)`
  },
  {
    name: 'Create index on sources.user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id)`
  },
  {
    name: 'Create index on users.email',
    sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
  }
];

let completed = 0;
let skipped = 0;
let failed = 0;

function runMigration(index) {
  if (index >= migrations.length) {
    // All migrations complete, verify
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Completed: ${completed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}\n`);

    db.get("SELECT COUNT(*) as count FROM users WHERE id = 'local-dev'", (err, row) => {
      if (err) {
        console.error('❌ Verification failed:', err.message);
        db.close();
        return;
      }

      console.log('✅ Verification: local-dev user exists');

      db.get("SELECT COUNT(*) as count FROM projects WHERE user_id = 'local-dev'", (err, row) => {
        if (err) {
          console.error('❌ Verification failed:', err.message);
        } else {
          console.log(`✅ Verification: ${row.count} projects assigned to local-dev user`);
        }

        db.get("SELECT COUNT(*) as count FROM content_blocks WHERE user_id = 'local-dev'", (err, row) => {
          if (err) {
            console.error('❌ Verification failed:', err.message);
          } else {
            console.log(`✅ Verification: ${row.count} content blocks assigned to local-dev user\n`);
          }

          console.log('✅ SQLite migration completed successfully!');
          console.log('\n📝 Next steps:');
          console.log('   1. Run MongoDB migration: node migrations/001_add_multi_tenancy_mongo.js');
          console.log('   2. Add SINGLE_USER_MODE=true to .env');
          console.log('   3. Test the application\n');

          db.close();
        });
      });
    });
    return;
  }

  const migration = migrations[index];
  console.log(`${index + 1}. ${migration.name}...`);

  db.run(migration.sql, function(err) {
    if (err) {
      // Check if error is acceptable
      if (err.message.includes('duplicate column name')) {
        console.log(`   ⏭️  Already exists (OK)`);
        skipped++;
        completed++;
      } else if (err.message.includes('already exists')) {
        console.log(`   ⏭️  Already exists (OK)`);
        skipped++;
        completed++;
      } else if (err.message.includes('no such table') && migration.sql.includes('ALTER TABLE')) {
        console.log(`   ⏭️  Table doesn't exist (OK)`);
        skipped++;
        completed++;
      } else {
        console.error(`   ❌ Failed: ${err.message}`);
        failed++;
      }
    } else {
      console.log(`   ✓ Done`);
      completed++;
    }

    // Run next migration
    runMigration(index + 1);
  });
}

// Start migrations
db.serialize(() => {
  console.log(`📝 Running ${migrations.length} migration steps...\n`);
  runMigration(0);
});
