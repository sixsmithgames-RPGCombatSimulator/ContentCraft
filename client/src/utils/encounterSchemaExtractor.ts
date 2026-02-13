/**
 * Encounter Schema Extraction Utilities
 *
 * Extracts specific sections of the v1.1 encounter schema for focused AI generation stages
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import encounterSchemaV1_1 from '../../../schema/encounter/v1.1-client.json';

type SchemaObject = Record<string, unknown>;

/**
 * Extract a subset of properties from the encounter schema
 */
function extractSchemaProperties(propertyKeys: string[]): SchemaObject {
  const fullProperties = (encounterSchemaV1_1.properties || {}) as Record<string, unknown>;
  const extracted: Record<string, unknown> = {};

  for (const key of propertyKeys) {
    if (key in fullProperties) {
      extracted[key] = fullProperties[key];
    }
  }

  return {
    type: 'object',
    properties: extracted,
    required: ['title', 'schema_version'],
  };
}

/**
 * Section 1: Concept & Setup
 * Core encounter identity, objectives, and difficulty
 */
export function getConceptSchema(): SchemaObject {
  return extractSchemaProperties([
    'schema_version',
    'title',
    'description',
    'encounter_type',
    'difficulty_tier',
    'party_level',
    'party_size',
    'xp_budget',
    'adjusted_xp',
    'expected_duration_rounds',
    'location',
    'setting_context',
    'objectives',
    'failure_conditions',
  ]);
}

/**
 * Section 2: Enemy Composition
 * Monsters, NPCs, CR budget, positioning
 */
export function getEnemyCompositionSchema(): SchemaObject {
  return extractSchemaProperties([
    'monsters',
    'npcs',
  ]);
}

/**
 * Section 3: Terrain & Environment
 * Terrain features, hazards, traps, lighting, weather
 */
export function getTerrainSchema(): SchemaObject {
  return extractSchemaProperties([
    'terrain',
    'hazards',
    'traps',
  ]);
}

/**
 * Section 4: Tactics & Event Clock
 * Enemy behavior, escalation phases, coordination
 */
export function getTacticsSchema(): SchemaObject {
  return extractSchemaProperties([
    'tactics',
    'event_clock',
  ]);
}

/**
 * Section 5: Rewards & Aftermath
 * Treasure, consequences, scaling, story hooks
 */
export function getRewardsSchema(): SchemaObject {
  return extractSchemaProperties([
    'treasure',
    'consequences',
    'scaling',
    'notes',
  ]);
}

/**
 * Get full encounter schema with all properties
 */
export function getFullEncounterSchema(): SchemaObject {
  return encounterSchemaV1_1 as SchemaObject;
}

/**
 * Format schema section for AI prompt (with size info)
 */
export function formatEncounterSchemaForPrompt(schema: SchemaObject, sectionName: string): string {
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
