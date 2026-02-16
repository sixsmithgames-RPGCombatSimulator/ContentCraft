/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SQLite doesn't work on Vercel (read-only filesystem except /tmp)
// Only initialize if not running on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
let _db: sqlite3.Database | null = null;

if (!isVercel) {
  const dbPath = process.env.DATABASE_PATH || './data/contentcraft.db';
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  _db = new sqlite3.Database(dbPath);
  _db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  console.log('✅ SQLite database initialized');
} else {
  console.log('⚠️ Running on Vercel - SQLite disabled (use MongoDB for persistence)');
}

export const db = _db as sqlite3.Database;

export const initializeDatabase = (): Promise<void> => {
  // Skip SQLite initialization on Vercel
  if (isVercel || !_db) {
    console.log('⏭️ Skipping SQLite initialization (not available in this environment)');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const tables = [
      `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS content_blocks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL,
        content TEXT,
        type TEXT NOT NULL,
        order_num INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES content_blocks(id) ON DELETE SET NULL
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS ai_prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        template TEXT NOT NULL,
        variables TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS fact_checks (
        id TEXT PRIMARY KEY,
        content_block_id TEXT NOT NULL,
        claim TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (content_block_id) REFERENCES content_blocks(id) ON DELETE CASCADE
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        fact_check_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        credibility INTEGER DEFAULT 5,
        date_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fact_check_id) REFERENCES fact_checks(id) ON DELETE CASCADE
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_content_blocks_project_id ON content_blocks(project_id);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_content_blocks_parent_id ON content_blocks(parent_id);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_fact_checks_content_block_id ON fact_checks(content_block_id);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_sources_fact_check_id ON sources(fact_check_id);
      `
    ];

    _db!.serialize(() => {
      tables.forEach(table => {
        _db!.exec(table, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            reject(err);
          }
        });
      });

      console.log('Database initialized successfully');
      resolve();
    });
  });
};

export const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  if (!_db) {
    return Promise.reject(new Error('SQLite not available in this environment. Use MongoDB instead.'));
  }
  return new Promise((resolve, reject) => {
    _db!.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
  if (!_db) {
    return Promise.reject(new Error('SQLite not available in this environment. Use MongoDB instead.'));
  }
  return new Promise((resolve, reject) => {
    _db!.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

export const dbRun = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
  if (!_db) {
    return Promise.reject(new Error('SQLite not available in this environment. Use MongoDB instead.'));
  }
  return new Promise((resolve, reject) => {
    _db!.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};