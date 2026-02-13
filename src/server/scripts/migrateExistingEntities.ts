/**
 * Migration script to add scope and project_id to existing entities
 *
 * This script:
 * 1. Finds all entities without a scope field
 * 2. Assigns them to proj_default by default
 * 3. Updates their _id to include the scope prefix
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

async function migrateExistingEntities() {
  console.warn('migrateExistingEntities() is disabled pending canon refactor.');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateExistingEntities()
    .then(() => {
      console.warn('Migration script skipped.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script encountered an error:', error);
      process.exit(1);
    });
}

export { migrateExistingEntities };
