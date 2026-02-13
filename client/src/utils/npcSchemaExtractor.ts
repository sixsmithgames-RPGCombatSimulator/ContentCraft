/**
 * NPC Schema Extraction Utilities
 *
 * Extracts specific sections of the v1.1 schema for focused AI generation stages
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import npcSchemaV1_1 from '../../../schema/npc/v1.1-client.json';

type SchemaObject = Record<string, unknown>;

/**
 * Extract a subset of properties from the schema
 */
function extractSchemaProperties(propertyKeys: string[]): SchemaObject {
  const fullProperties = (npcSchemaV1_1.properties || {}) as Record<string, unknown>;
  const extracted: Record<string, unknown> = {};

  for (const key of propertyKeys) {
    if (key in fullProperties) {
      extracted[key] = fullProperties[key];
    }
  }

  return {
    type: 'object',
    properties: extracted,
    required: ['name', 'schema_version'], // Always require these
  };
}

/**
 * Section 1: Basic Information
 * Core identification and descriptive fields
 */
export function getBasicInfoSchema(): SchemaObject {
  return extractSchemaProperties([
    'schema_version',
    'genre',
    'name',
    'title',
    'aliases',
    'description',
    'appearance',
    'background',
    'race',
    'size',
    'creature_type',
    'subtype',
    'alignment',
    'affiliation',
    'location',
    'era',
    'challenge_rating',
    'experience_points',
  ]);
}

/**
 * Section 2: Core Details & Personality
 * Personality traits, ideals, flaws, hooks
 */
export function getCoreDetailsSchema(): SchemaObject {
  return extractSchemaProperties([
    'role',
    'personality_traits',
    'ideals',
    'bonds',
    'flaws',
    'goals',
    'fears',
    'quirks',
    'voice_mannerisms',
    'hooks',
  ]);
}

/**
 * Section 3: Stats & Abilities
 * Core game mechanics (ability scores, AC, HP, etc.)
 */
export function getStatsSchema(): SchemaObject {
  return extractSchemaProperties([
    'class_levels',
    'multiclass_features',
    'ability_scores',
    'armor_class',
    'hit_points',
    'hit_dice',
    'speed',
    'proficiency_bonus',
    'senses',
    'languages',
    'saving_throws',
    'skill_proficiencies',
    'damage_resistances',
    'damage_immunities',
    'damage_vulnerabilities',
    'condition_immunities',
  ]);
}

/**
 * Section 3b: Character Build
 * Class features, subclass features, racial features, feats, ASI, background
 */
export function getCharacterBuildSchema(): SchemaObject {
  return extractSchemaProperties([
    'class_features',
    'subclass_features',
    'racial_features',
    'feats',
    'asi_choices',
    'background_feature',
  ]);
}

/**
 * Section 4: Combat & Actions
 * Actions, reactions, abilities, tactics
 */
export function getCombatSchema(): SchemaObject {
  return extractSchemaProperties([
    'abilities',
    'actions',
    'bonus_actions',
    'reactions',
    'tactics',
    'multiattack',
  ]);
}

/**
 * Section 5: Spellcasting
 * All spellcasting-related fields
 */
export function getSpellcastingSchema(): SchemaObject {
  return extractSchemaProperties([
    'spellcasting',
    'cantrips',
    'prepared_spells',
    'spell_slots',
    'innate_spellcasting',
  ]);
}

/**
 * Section 6: Legendary & Mythic Actions
 * Legendary actions, lair actions, regional effects
 */
export function getLegendarySchema(): SchemaObject {
  return extractSchemaProperties([
    'legendary_actions',
    'mythic_actions',
    'lair_actions',
    'regional_effects',
  ]);
}

/**
 * Section 7: Relationships & Networks
 * Allies, foes, factions, minions
 */
export function getRelationshipsSchema(): SchemaObject {
  return extractSchemaProperties([
    'allies_friends',
    'foes',
    'rivals',
    'mentors',
    'students',
    'family',
    'factions',
    'minions',
    'conflicts',
  ]);
}

/**
 * Section 8: Equipment & Resources
 * Magic items, equipment, wealth
 */
export function getEquipmentSchema(): SchemaObject {
  return extractSchemaProperties([
    'equipment',
    'magic_items',
    'attuned_items',
    'signature_items',
    'wealth',
    'resources',
  ]);
}

/**
 * Section 9: Special Traits (Vampire, Lycanthrope, etc.)
 * Template-specific mechanics
 */
export function getSpecialTraitsSchema(): SchemaObject {
  return extractSchemaProperties([
    'vampire_traits',
    'lycanthropy_traits',
    'template_traits',
  ]);
}

/**
 * Get full schema with all properties
 */
export function getFullSchema(): SchemaObject {
  return npcSchemaV1_1 as SchemaObject;
}

/**
 * Format schema section for AI prompt (with size info)
 */
export function formatSchemaForPrompt(schema: SchemaObject, sectionName: string): string {
  const schemaJson = JSON.stringify(schema, null, 2);
  return `
=== ${sectionName.toUpperCase()} SCHEMA ===

Your output MUST conform to this JSON schema:

${schemaJson}

⚠️ CRITICAL:
- Use ONLY the properties defined in this schema section
- Follow the exact data types specified (string, number, array, object)
- Include required fields: ${JSON.stringify((schema.required as string[]) || [])}
- Output ONLY valid JSON matching this schema structure
`;
}
