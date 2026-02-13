/**
 * Initial NPC Schema v1
 *
 * This is the baseline schema. No migration needed for v1 data.
 * This file documents the v1 schema structure for reference.
 */

import type { NPCSchemaV1 } from '../../../client/src/types/npc/generated.js';

export const SCHEMA_VERSION = 'npc/v1';

/**
 * Validate that data conforms to v1 schema
 */
export function isV1(data: unknown): data is NPCSchemaV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    'ability_scores' in data &&
    'class_levels' in data
  );
}

/**
 * Add schema version to v1 data if missing
 */
export function addSchemaVersion(data: Partial<NPCSchemaV1>): NPCSchemaV1 & { schemaVersion: string } {
  return {
    ...data,
    schemaVersion: SCHEMA_VERSION,
  } as NPCSchemaV1 & { schemaVersion: string };
}

/**
 * Example v1 NPC for testing
 */
export const EXAMPLE_V1_NPC: Partial<NPCSchemaV1> = {
  name: 'Goran Varus',
  title: 'Lord Commander',
  description: 'A battle-hardened warrior with a stern gaze',
  race: 'Human',
  class_levels: [
    {
      class: 'Fighter',
      level: 12,
      subclass: 'Champion',
    },
  ],
  ability_scores: {
    str: 18,
    dex: 14,
    con: 16,
    int: 10,
    wis: 12,
    cha: 13,
  },
  proficiency_bonus: 4,
  personality: {
    traits: ['Disciplined', 'Strategic thinker'],
    ideals: ['Honor above all'],
    bonds: ['Sworn to protect the realm'],
    flaws: ['Stubborn and inflexible'],
  },
  motivations: ['Maintain order', 'Protect the innocent'],
  rule_base: '2024RAW',
  sources_used: [],
  assumptions: [],
  proposals: [],
  canon_update: 'Initial NPC creation',
};
