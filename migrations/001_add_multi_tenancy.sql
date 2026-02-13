/**
 * Migration: Add Multi-Tenancy Support
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 *
 * This migration adds user_id fields to all tables while preserving existing data.
 * All existing data is assigned to the 'local-dev' user.
 */

-- Step 1: Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  metadata TEXT DEFAULT '{}'
);

-- Step 2: Insert default local development user
INSERT OR IGNORE INTO users (id, email, display_name)
VALUES ('local-dev', 'local@dev.local', 'Local Development User');

-- Step 3: Add user_id to projects table
-- First add the column as nullable
ALTER TABLE projects ADD COLUMN user_id TEXT;

-- Set all existing projects to local-dev user
UPDATE projects SET user_id = 'local-dev' WHERE user_id IS NULL;

-- Step 4: Add user_id to content_blocks table
ALTER TABLE content_blocks ADD COLUMN user_id TEXT;

-- Set all existing content blocks to local-dev user
UPDATE content_blocks SET user_id = 'local-dev' WHERE user_id IS NULL;

-- Step 5: Add user_id to fact_checks table (if exists)
ALTER TABLE fact_checks ADD COLUMN user_id TEXT;
UPDATE fact_checks SET user_id = 'local-dev' WHERE user_id IS NULL;

-- Step 6: Add user_id to sources table (if exists)
ALTER TABLE sources ADD COLUMN user_id TEXT;
UPDATE sources SET user_id = 'local-dev' WHERE user_id IS NULL;

-- Step 7: Create indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_content_blocks_user_id ON content_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_fact_checks_user_id ON fact_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);

-- Step 8: Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Migration complete
-- All existing data has been preserved and assigned to 'local-dev' user
