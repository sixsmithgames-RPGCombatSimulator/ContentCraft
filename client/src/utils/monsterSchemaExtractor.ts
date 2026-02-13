/**
 * Monster Schema Extraction Utilities
 *
 * Extracts specific sections of the v1.1 monster schema for focused AI generation stages
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import monsterSchemaV1_1 from '../../../schema/monster/v1.1-client.json';

type SchemaObject = Record<string, unknown>;

/**
 * Extract a subset of properties from the monster schema
 */
function extractSchemaProperties(propertyKeys: string[]): SchemaObject {
  const fullProperties = (monsterSchemaV1_1.properties || {}) as Record<string, unknown>;
  const extracted: Record<string, unknown> = {};

  for (const key of propertyKeys) {
    if (key in fullProperties) {
      extracted[key] = fullProperties[key];
    }
  }

  return {
    type: 'object',
    properties: extracted,
    required: ['name', 'schema_version'],
  };
}

/**
 * Section 1: Basic Info
 * Core identity, type, CR, alignment
 */
export function getMonsterBasicInfoSchema(): SchemaObject {
  return extractSchemaProperties([
    'schema_version',
    'name',
    'description',
    'size',
    'creature_type',
    'subtype',
    'alignment',
    'challenge_rating',
    'experience_points',
    'location',
  ]);
}

/**
 * Section 2: Stats & Defenses
 * Ability scores, AC, HP, speed, saves, skills, immunities, senses
 */
export function getMonsterStatsSchema(): SchemaObject {
  return extractSchemaProperties([
    'ability_scores',
    'armor_class',
    'hit_points',
    'hit_dice',
    'proficiency_bonus',
    'speed',
    'saving_throws',
    'skill_proficiencies',
    'damage_vulnerabilities',
    'damage_resistances',
    'damage_immunities',
    'condition_immunities',
    'senses',
    'passive_perception',
    'languages',
  ]);
}

/**
 * Section 3: Combat & Abilities
 * Traits, actions, bonus actions, reactions, multiattack, spellcasting
 */
export function getMonsterCombatSchema(): SchemaObject {
  return extractSchemaProperties([
    'abilities',
    'actions',
    'bonus_actions',
    'reactions',
    'multiattack',
    'spellcasting',
    'tactics',
  ]);
}

/**
 * Section 4: Legendary & Lair
 * Legendary/mythic actions, lair actions, regional effects
 */
export function getMonsterLegendarySchema(): SchemaObject {
  return extractSchemaProperties([
    'legendary_actions',
    'mythic_actions',
    'lair_actions',
    'regional_effects',
  ]);
}

/**
 * Section 5: Ecology & Lore
 * Ecology, lore, notes, sources
 */
export function getMonsterLoreSchema(): SchemaObject {
  return extractSchemaProperties([
    'ecology',
    'lore',
    'notes',
    'sources',
  ]);
}

/**
 * Get full monster schema with all properties
 */
export function getFullMonsterSchema(): SchemaObject {
  return monsterSchemaV1_1 as SchemaObject;
}

/**
 * Format schema section for AI prompt
 */
export function formatMonsterSchemaForPrompt(schema: SchemaObject, sectionName: string): string {
  const schemaJson = JSON.stringify(schema, null, 2);
  return `
=== ${sectionName.toUpperCase()} SCHEMA ===

Your output MUST conform to this JSON schema:

${schemaJson}

⚠️ CRITICAL:
- Use ONLY the properties defined in this schema section
- Follow the exact data types specified
- Include required fields: ${JSON.stringify((schema.required as string[]) || [])}
- Output ONLY valid JSON matching this schema structure
`;
}
