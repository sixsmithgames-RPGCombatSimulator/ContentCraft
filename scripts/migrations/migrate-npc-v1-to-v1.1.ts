/**
 * Migration Script: NPC Schema v1.0 → v1.1
 *
 * This script migrates existing NPC JSONs from v1.0 schema to v1.1 schema.
 *
 * Changes:
 * - Adds schema_version: "1.1"
 * - Maps "canonical_name" → "name"
 * - Maps "traits" → "abilities"
 * - Converts class_levels string to array format (if applicable)
 * - Separates magic_items into attuned_items and magic_items
 * - Preserves all existing data
 *
 * Usage:
 *   npx ts-node scripts/migrations/migrate-npc-v1-to-v1.1.ts <input.json> <output.json>
 *   npx ts-node scripts/migrations/migrate-npc-v1-to-v1.1.ts data/npcs/lady-erliza.json data/npcs/lady-erliza-v1.1.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

type JsonRecord = Record<string, unknown>;

interface MigrationResult {
  success: boolean;
  changes: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Convert class_levels string to array format
 * Example: "Artificer 16 / Vampire 9" → [{class: "Artificer", level: 16}, {class: "Vampire", level: 9}]
 */
function migrateClassLevels(classLevels: unknown): unknown {
  if (typeof classLevels !== 'string') {
    return classLevels; // Already array or other format
  }

  // Parse "Class Level / Class Level" format
  const parts = classLevels.split('/').map(p => p.trim());
  const result: Array<{ class: string; level: number }> = [];

  for (const part of parts) {
    // Match "ClassName Number" pattern
    const match = part.match(/^(.+?)\s+(\d+)$/);
    if (match) {
      const [, className, levelStr] = match;
      result.push({
        class: className.trim(),
        level: parseInt(levelStr, 10),
      });
    } else {
      // Keep as string if can't parse
      console.warn(`Could not parse class level: "${part}". Keeping original string format.`);
      return classLevels;
    }
  }

  return result.length > 0 ? result : classLevels;
}

/**
 * Separate magic_items into attuned_items and magic_items based on requires_attunement
 */
function migrateMagicItems(source: JsonRecord): { attuned: unknown[] | null; nonAttuned: unknown[] | null } {
  const magicItems = source.magic_items || source.magical_items;

  if (!Array.isArray(magicItems) || magicItems.length === 0) {
    return { attuned: null, nonAttuned: null };
  }

  const attuned: unknown[] = [];
  const nonAttuned: unknown[] = [];

  for (const item of magicItems) {
    if (typeof item === 'object' && item !== null) {
      const itemObj = item as Record<string, unknown>;
      if (itemObj.requires_attunement === true) {
        attuned.push({ ...itemObj, attuned: true });
      } else {
        nonAttuned.push(itemObj);
      }
    } else if (typeof item === 'string') {
      // String items default to non-attuned
      nonAttuned.push({ name: item });
    }
  }

  return {
    attuned: attuned.length > 0 ? attuned : null,
    nonAttuned: nonAttuned.length > 0 ? nonAttuned : null,
  };
}

/**
 * Migrate NPC from v1.0 to v1.1
 */
function migrateNpcToV1_1(npc: JsonRecord): { migrated: JsonRecord; result: MigrationResult } {
  const result: MigrationResult = {
    success: true,
    changes: [],
    warnings: [],
    errors: [],
  };

  const migrated: JsonRecord = { ...npc };

  // 1. Add schema_version
  if (!migrated.schema_version) {
    migrated.schema_version = '1.1';
    result.changes.push('Added schema_version: "1.1"');
  } else if (migrated.schema_version === '1.1') {
    result.warnings.push('Already at schema version 1.1');
  }

  // 2. Map canonical_name → name
  if (migrated.canonical_name && !migrated.name) {
    migrated.name = migrated.canonical_name;
    delete migrated.canonical_name;
    result.changes.push('Mapped canonical_name → name');
  }

  // 3. Map traits → abilities
  if (migrated.traits && !migrated.abilities) {
    migrated.abilities = migrated.traits;
    delete migrated.traits;
    result.changes.push('Mapped traits → abilities');
  }

  // 4. Migrate class_levels to array format
  if (migrated.class_levels && typeof migrated.class_levels === 'string') {
    const original = migrated.class_levels;
    const migratedLevels = migrateClassLevels(migrated.class_levels);

    if (Array.isArray(migratedLevels)) {
      migrated.class_levels = migratedLevels;
      result.changes.push(`Converted class_levels string → array: "${original}"`);
    } else {
      result.warnings.push(`Could not convert class_levels to array format, keeping as string: "${original}"`);
    }
  }

  // 5. Separate magic_items into attuned_items and magic_items
  const { attuned, nonAttuned } = migrateMagicItems(migrated);

  if (attuned !== null || nonAttuned !== null) {
    if (attuned !== null) {
      migrated.attuned_items = attuned;
      result.changes.push(`Created attuned_items (${attuned.length} items)`);
    }

    if (nonAttuned !== null) {
      migrated.magic_items = nonAttuned;
      result.changes.push(`Updated magic_items to non-attuned items (${nonAttuned.length} items)`);
    } else {
      // Remove magic_items if all were attuned
      delete migrated.magic_items;
    }

    delete migrated.magical_items; // Remove alternative field name
  }

  // 6. Map allies_and_contacts → allies_friends
  if (migrated.allies_and_contacts && !migrated.allies_friends) {
    migrated.allies_friends = migrated.allies_and_contacts;
    delete migrated.allies_and_contacts;
    result.changes.push('Mapped allies_and_contacts → allies_friends');
  } else if (migrated.allies && !migrated.allies_friends) {
    migrated.allies_friends = migrated.allies;
    delete migrated.allies;
    result.changes.push('Mapped allies → allies_friends');
  }

  // 7. Ensure ability scores are lowercase
  if (migrated.ability_scores && typeof migrated.ability_scores === 'object') {
    const abilityScores = migrated.ability_scores as Record<string, unknown>;
    const hasUppercase = 'STR' in abilityScores || 'DEX' in abilityScores;

    if (hasUppercase) {
      const lowercaseScores: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(abilityScores)) {
        lowercaseScores[key.toLowerCase()] = value;
      }
      migrated.ability_scores = lowercaseScores;
      result.changes.push('Converted ability scores to lowercase (STR → str, etc.)');
    }
  }

  // 8. Add generation_metadata stub if not present
  if (!migrated.generation_metadata) {
    migrated.generation_metadata = {
      generated_date: new Date().toISOString(),
      ai_model: 'unknown (migrated from v1.0)',
      validation_notes: ['Migrated from schema v1.0 to v1.1'],
    };
    result.changes.push('Added generation_metadata stub');
  }

  return { migrated, result };
}

/**
 * Main migration function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node scripts/migrations/migrate-npc-v1-to-v1.1.ts <input.json> <output.json>');
    console.error('Example: npx ts-node scripts/migrations/migrate-npc-v1-to-v1.1.ts data/npcs/old.json data/npcs/new.json');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;

  console.log('🔄 NPC Migration: v1.0 → v1.1');
  console.log(`📥 Input: ${inputPath}`);
  console.log(`📤 Output: ${outputPath}`);
  console.log('');

  try {
    // Read input file
    const inputFullPath = resolve(process.cwd(), inputPath);
    const inputData = readFileSync(inputFullPath, 'utf-8');
    const npc = JSON.parse(inputData) as JsonRecord;

    console.log(`✅ Loaded NPC: ${npc.name || npc.canonical_name || 'Unknown'}`);
    console.log('');

    // Perform migration
    const { migrated, result } = migrateNpcToV1_1(npc);

    // Display results
    if (result.changes.length > 0) {
      console.log('📝 Changes:');
      result.changes.forEach((change, i) => console.log(`   ${i + 1}. ${change}`));
      console.log('');
    }

    if (result.warnings.length > 0) {
      console.log('⚠️ Warnings:');
      result.warnings.forEach((warning, i) => console.log(`   ${i + 1}. ${warning}`));
      console.log('');
    }

    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`));
      console.log('');
      process.exit(1);
    }

    // Write output file
    const outputFullPath = resolve(process.cwd(), outputPath);
    writeFileSync(outputFullPath, JSON.stringify(migrated, null, 2), 'utf-8');

    console.log(`✅ Migration complete! Wrote to: ${outputPath}`);
    console.log(`   Schema version: ${migrated.schema_version}`);
    console.log(`   ${result.changes.length} changes applied`);

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error);
    process.exit(1);
  }
}

main();
