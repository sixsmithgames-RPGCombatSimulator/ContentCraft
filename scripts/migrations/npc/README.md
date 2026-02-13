# NPC Schema Migrations

This directory contains migration scripts for upgrading NPC data when the schema version changes.

## Migration Naming Convention

Migrations follow the pattern: `v{old}_to_v{new}.ts`

Example: `v1_to_v2.ts` migrates data from schema v1 to schema v2.

## Creating a Migration

1. Create a new file: `scripts/migrations/npc/v{N}_to_v{N+1}.ts`
2. Implement the `migrate` function that transforms old data to new schema
3. Add tests to verify the migration works correctly
4. Update the migration registry in `scripts/migrations/index.ts`

## Migration Template

```typescript
/**
 * Migration: NPC Schema v1 → v2
 *
 * Changes:
 * - Added field: foo
 * - Removed field: bar
 * - Renamed field: baz → qux
 */

export interface NpcV1 {
  // Old schema fields
}

export interface NpcV2 {
  // New schema fields
}

export function migrate(data: NpcV1): NpcV2 {
  return {
    ...data,
    // Apply transformations here
    schemaVersion: 'npc/v2',
  };
}

export function rollback(data: NpcV2): NpcV1 {
  // Optional: implement rollback if needed
  throw new Error('Rollback not supported for v1 → v2');
}
```

## Running Migrations

```bash
# Migrate all NPCs in database
npm run migrate:npc

# Migrate specific NPC
npm run migrate:npc -- --id=npc.entity_id

# Dry run (preview changes without saving)
npm run migrate:npc -- --dry-run
```

## Testing Migrations

Always test migrations with real data before deploying:

```bash
npm run test:migrations
```

## Best Practices

1. **Never Delete Data**: Transform or archive old data instead of deleting
2. **Provide Defaults**: Supply reasonable defaults for new required fields
3. **Document Changes**: Clearly describe what changed and why
4. **Test Thoroughly**: Use fixtures from production to test edge cases
5. **Make Reversible**: Implement rollback when possible
6. **Version Everything**: Update `schemaVersion` field in migrated data
7. **Audit Trail**: Log all migrations with timestamps and user info
