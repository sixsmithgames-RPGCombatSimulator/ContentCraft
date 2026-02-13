/**
 * Magic Item Schema Extraction Utilities
 *
 * Extracts specific sections of the v1.1 item schema for focused AI generation stages
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import itemSchemaV1_1 from '../../../schema/item/v1.1-client.json';

type SchemaObject = Record<string, unknown>;

/**
 * Extract a subset of properties from the item schema
 */
function extractSchemaProperties(propertyKeys: string[]): SchemaObject {
  const fullProperties = (itemSchemaV1_1.properties || {}) as Record<string, unknown>;
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
 * Section 1: Concept & Rarity
 * Core item identity, type, rarity, attunement
 */
export function getItemConceptSchema(): SchemaObject {
  return extractSchemaProperties([
    'schema_version',
    'name',
    'item_type',
    'item_subtype',
    'rarity',
    'attunement',
    'description',
    'appearance',
    'weight',
    'value',
  ]);
}

/**
 * Section 2: Properties & Mechanics
 * Magical properties, charges, spells, weapon/armor stats
 */
export function getItemMechanicsSchema(): SchemaObject {
  return extractSchemaProperties([
    'properties',
    'charges',
    'spells',
    'weapon_properties',
    'armor_properties',
  ]);
}

/**
 * Section 3: History & Flavor
 * Lore, creator, previous owners, quirks, curse, sentience, hooks
 */
export function getItemLoreSchema(): SchemaObject {
  return extractSchemaProperties([
    'history',
    'creator',
    'previous_owners',
    'quirks',
    'curse',
    'sentience',
    'campaign_hooks',
    'notes',
  ]);
}

/**
 * Get full item schema with all properties
 */
export function getFullItemSchema(): SchemaObject {
  return itemSchemaV1_1 as SchemaObject;
}

/**
 * Format schema section for AI prompt
 */
export function formatItemSchemaForPrompt(schema: SchemaObject, sectionName: string): string {
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
