/**
 * Migration script to convert project-scoped entities to library entities
 *
 * This script:
 * 1. Finds all entities with project scope (proj_*)
 * 2. Converts them to library entities (scope='lib')
 * 3. Updates their _id from proj_{id}.{type}.{slug} to lib.{type}.{slug}
 * 4. Updates all associated chunks
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

async function migrateToLibrary() {
  console.warn('migrateToLibrary() is disabled pending canon refactor.');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToLibrary()
    .then(() => {
      console.warn('Migration script skipped.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script encountered an error:', error);
      process.exit(1);
    });
}

export { migrateToLibrary };
