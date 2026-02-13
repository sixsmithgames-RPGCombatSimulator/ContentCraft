/**
 * Story Arc Schema Extraction Utilities
 *
 * Extracts specific sections of the v1.1 story arc schema for focused AI generation stages
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import storyArcSchemaV1_1 from '../../../schema/story_arc/v1.1-client.json';

type SchemaObject = Record<string, unknown>;

/**
 * Extract a subset of properties from the story arc schema
 */
function extractSchemaProperties(propertyKeys: string[]): SchemaObject {
  const fullProperties = (storyArcSchemaV1_1.properties || {}) as Record<string, unknown>;
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
 * Section 1: Premise & Setup
 * Core story identity, theme, setting, hook
 */
export function getStoryArcPremiseSchema(): SchemaObject {
  return extractSchemaProperties([
    'schema_version',
    'title',
    'synopsis',
    'theme',
    'tone',
    'setting',
    'level_range',
    'estimated_sessions',
    'overarching_goal',
    'hook',
  ]);
}

/**
 * Section 2: Structure & Beats
 * Acts, key events, beats, branching paths
 */
export function getStoryArcStructureSchema(): SchemaObject {
  return extractSchemaProperties([
    'acts',
    'beats',
    'branching_paths',
    'known_barriers',
    'unknown_barriers',
  ]);
}

/**
 * Section 3: Characters & Factions
 * NPCs, factions, relationships, motivations
 */
export function getStoryArcCharactersSchema(): SchemaObject {
  return extractSchemaProperties([
    'characters',
    'factions',
  ]);
}

/**
 * Section 4: Secrets & Rewards
 * Clues, secrets, rewards, DM notes
 */
export function getStoryArcSecretsSchema(): SchemaObject {
  return extractSchemaProperties([
    'clues_and_secrets',
    'rewards',
    'dm_notes',
  ]);
}

/**
 * Get full story arc schema with all properties
 */
export function getFullStoryArcSchema(): SchemaObject {
  return storyArcSchemaV1_1 as SchemaObject;
}

/**
 * Format schema section for AI prompt
 */
export function formatStoryArcSchemaForPrompt(schema: SchemaObject, sectionName: string): string {
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
