/**
 * Schema-Driven NPC Field Mapper
 *
 * Architecture:
 * 1. Uses schema/npc/v1-flat.json as single source of truth
 * 2. Intelligently maps variations to canonical field names
 * 3. Validates against schema using strict validation
 * 4. NO FALLBACKS - only explicit mapping or actionable errors
 
 *
 * 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateNpcSafe } from '../validation/npcValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resolveNpcSchemaPath = (fileName: string): string => {
  const candidatePaths = [
    join(__dirname, '../schemas/npc', fileName),
    join(__dirname, '../../../schema/npc', fileName),
  ];
  const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));

  if (!resolvedPath) {
    throw new Error(`NPC schema file \"${fileName}\" not found. Checked: ${candidatePaths.join(', ')}`);
  }

  return resolvedPath;
};

// Load canonical schema
const schemaPath = resolveNpcSchemaPath('v1-flat.json');
const npcSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

/**
 * Field variation mappings - maps common variations to canonical schema field names
 */
const FIELD_MAPPINGS: Record<string, string[]> = {
  // Ability score variations
  'ability_scores.str': ['STR', 'Str', 'strength', 'Strength', 'STRENGTH'],
  'ability_scores.dex': ['DEX', 'Dex', 'dexterity', 'Dexterity', 'DEXTERITY'],
  'ability_scores.con': ['CON', 'Con', 'constitution', 'Constitution', 'CONSTITUTION'],
  'ability_scores.int': ['INT', 'Int', 'intelligence', 'Intelligence', 'INTELLIGENCE'],
  'ability_scores.wis': ['WIS', 'Wis', 'wisdom', 'Wisdom', 'WISDOM'],
  'ability_scores.cha': ['CHA', 'Cha', 'charisma', 'Charisma', 'CHARISMA'],

  // Trait/ability variations
  'abilities': ['traits', 'Traits', 'special_abilities', 'features'],

  // Personality variations
  'personality.traits': ['personality_traits', 'character_traits'],
  'personality.ideals': ['ideals'],
  'personality.bonds': ['bonds'],
  'personality.flaws': ['flaws'],

  // Name variations
  'name': ['canonical_name', 'character_name', 'npc_name'],

  // Equipment variations
  'equipment': ['equipment.carried', 'gear', 'possessions'],

  // Magic items variations
  'magicItems': ['magic_items', 'magical_items'],
};

/**
 * Mapping result with detailed information
 */
export interface MappingResult {
  success: boolean;
  mapped: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  unmappedFields: string[];
}

/**
 * Normalize ability scores object
 */
function normalizeAbilityScores(source: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [canonical, variations] of Object.entries(FIELD_MAPPINGS)) {
    if (!canonical.startsWith('ability_scores.')) continue;

    const abilityName = canonical.split('.')[1];

    // Try lowercase first (canonical)
    if (typeof source[abilityName] === 'number') {
      result[abilityName] = source[abilityName] as number;
      continue;
    }

    // Try variations
    for (const variation of variations) {
      if (typeof source[variation] === 'number') {
        result[abilityName] = source[variation] as number;
        break;
      }
    }
  }

  return result;
}

function normalizeSpeed(source: unknown): Record<string, string> | undefined {
  if (typeof source === 'number' && Number.isFinite(source)) {
    return { walk: `${source} ft.` };
  }

  if (typeof source === 'string' && source.trim().length > 0) {
    return { walk: source.trim() };
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (key === 'passive_perception') {
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = `${value} ft.`;
      continue;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value.trim();
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeSenses(source: unknown): { senses?: string[]; passivePerception?: number } {
  if (Array.isArray(source)) {
    return {
      senses: source.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
    };
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }

  const senses: string[] = [];
  let passivePerception: number | undefined;

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (key === 'passive_perception') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        passivePerception = value;
      }
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      senses.push(`${key} ${value} ft.`);
      continue;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      senses.push(`${key}: ${value.trim()}`);
    }
  }

  return {
    ...(senses.length > 0 ? { senses } : {}),
    ...(passivePerception !== undefined ? { passivePerception } : {}),
  };
}

function normalizeClassLevels(source: unknown): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(source)) {
    const normalized = source.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof source !== 'string' || source.trim().length === 0) {
    return undefined;
  }

  const normalized = source.trim();
  const levelMatch = normalized.match(/^(.*?)(?:\s+|\s*[-–]\s*)(\d+)$/);
  const descriptor = levelMatch?.[1]?.trim() || normalized;
  const parsedLevel = levelMatch?.[2] ? Number.parseInt(levelMatch[2], 10) : undefined;
  const subclassMatch = descriptor.match(/^(.+?)\s*\((.+)\)$/);

  return [{
    class: (subclassMatch?.[1] || descriptor).trim(),
    ...(Number.isFinite(parsedLevel) ? { level: parsedLevel } : {}),
    ...(subclassMatch?.[2]?.trim() ? { subclass: subclassMatch[2].trim() } : {}),
  }];
}

/**
 * Normalize equipment array
 */
function normalizeEquipment(source: Record<string, unknown>): string[] {
  // Check if equipment is nested under 'carried'
  if (source.equipment && typeof source.equipment === 'object' && 'carried' in source.equipment) {
    const carried = (source.equipment as Record<string, unknown>).carried;
    if (Array.isArray(carried)) {
      return carried.filter(item => typeof item === 'string');
    }
  }

  // Check direct equipment array
  if (Array.isArray(source.equipment)) {
    return source.equipment.filter(item => typeof item === 'string');
  }

  return [];
}

/**
 * Normalize magic items array
 */
function normalizeMagicItems(source: Record<string, unknown>): string[] {
  const magicItems = source.magic_items || source.magical_items;

  if (!Array.isArray(magicItems)) {
    return [];
  }

  // If array contains objects with 'name' property, extract names
  if (magicItems.length > 0 && typeof magicItems[0] === 'object' && magicItems[0] !== null) {
    return magicItems
      .map(item => {
        if (typeof item === 'object' && item !== null && 'name' in item) {
          return String((item as Record<string, unknown>).name);
        }
        return null;
      })
      .filter((name): name is string => name !== null);
  }

  // If already strings, return as-is
  return magicItems.filter(item => typeof item === 'string');
}

/**
 * Normalize personality object
 */
function normalizePersonality(source: Record<string, unknown>): Record<string, string[]> {
  const result: Record<string, string[]> = {
    traits: [],
    ideals: [],
    bonds: [],
    flaws: [],
  };

  // Check nested personality object first
  const personalityObj = source.personality;
  if (personalityObj && typeof personalityObj === 'object') {
    const personality = personalityObj as Record<string, unknown>;

    if (Array.isArray(personality.traits)) {
      result.traits = personality.traits.filter(t => typeof t === 'string');
    }
    if (Array.isArray(personality.ideals)) {
      result.ideals = personality.ideals.filter(t => typeof t === 'string');
    }
    if (Array.isArray(personality.bonds)) {
      result.bonds = personality.bonds.filter(t => typeof t === 'string');
    }
    if (Array.isArray(personality.flaws)) {
      result.flaws = personality.flaws.filter(t => typeof t === 'string');
    }
  }

  // Check top-level variations
  if (result.traits.length === 0 && Array.isArray(source.personality_traits)) {
    result.traits = source.personality_traits.filter(t => typeof t === 'string');
  }
  if (result.ideals.length === 0) {
    if (Array.isArray(source.ideals)) {
      result.ideals = source.ideals.filter(t => typeof t === 'string');
    } else if (typeof source.ideals === 'string' && source.ideals.trim().length > 0) {
      result.ideals = [source.ideals.trim()];
    }
  }
  if (result.bonds.length === 0 && Array.isArray(source.bonds)) {
    result.bonds = source.bonds.filter(t => typeof t === 'string');
  }
  if (result.flaws.length === 0) {
    if (Array.isArray(source.flaws)) {
      result.flaws = source.flaws.filter(t => typeof t === 'string');
    } else if (typeof source.flaws === 'string' && source.flaws.trim().length > 0) {
      result.flaws = [source.flaws.trim()];
    }
  }

  return result;
}

function normalizeNamedEntries(source: unknown, defaultFields: Record<string, unknown> = {}): Array<Record<string, unknown>> | undefined {
  const entries = Array.isArray(source)
    ? source
    : source === undefined || source === null
      ? []
      : [source];

  const normalized = entries
    .map((entry) => {
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { ...defaultFields, name } : null;
      }

      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const name = typeof record.name === 'string'
        ? record.name.trim()
        : typeof record.entity === 'string'
          ? record.entity.trim()
          : typeof record.title === 'string'
            ? record.title.trim()
            : '';

      if (!name) {
        return null;
      }

      return {
        ...defaultFields,
        ...record,
        name,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Map raw AI output to canonical schema structure
 *
 * This function intelligently maps field variations to canonical names
 * based on the schema. It does NOT use fallbacks - it only maps known
 * variations or reports errors.
 *
 * @param rawData Raw data from AI or any source
 * @returns Mapping result with success status, mapped data, and any errors
 */
export function mapToCanonicalStructure(rawData: Record<string, unknown>): MappingResult {
  const result: MappingResult = {
    success: false,
    mapped: {},
    errors: [],
    warnings: [],
    unmappedFields: [],
  };

  try {
    // Start with a copy of raw data
    const mapped: Record<string, unknown> = { ...rawData };

    // 0. Normalize schema version marker (supports common variants)
    const schemaVersionSource =
      typeof rawData.schema_version === 'string' || typeof rawData.schema_version === 'number'
        ? rawData.schema_version
        : typeof (rawData as Record<string, unknown>).schemaVersion === 'string' ||
            typeof (rawData as Record<string, unknown>).schemaVersion === 'number'
          ? ((rawData as Record<string, unknown>).schemaVersion as string | number)
          : undefined;

    if (typeof schemaVersionSource === 'number') {
      const detected = schemaVersionSource === 1.1 ? '1.1' : schemaVersionSource === 1.0 ? '1.0' : undefined;
      if (detected) {
        mapped.schema_version = detected;
        result.warnings.push(`Normalized schema_version from "${schemaVersionSource}" to "${detected}"`);
      }
    } else if (typeof schemaVersionSource === 'string') {
      const normalized = schemaVersionSource.trim().toLowerCase();
      const match = normalized.match(/(?:^|\b|\/)(?:v)?(\d+\.\d+)(?:\.\d+)?(?:$|\b)/);
      const detected = match?.[1];
      if (detected === '1.1' || detected === '1.0') {
        mapped.schema_version = detected;
        if (schemaVersionSource !== detected) {
          result.warnings.push(`Normalized schema_version from "${schemaVersionSource}" to "${detected}"`);
        }
      }
    }

    // 1. Normalize ability scores
    if (rawData.ability_scores && typeof rawData.ability_scores === 'object') {
      const abilityScores = normalizeAbilityScores(rawData.ability_scores as Record<string, unknown>);

      // Check if we got all 6 abilities
      const requiredAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      const missingAbilities = requiredAbilities.filter(ab => !(ab in abilityScores));

      if (missingAbilities.length > 0) {
        result.errors.push(`Missing ability scores: ${missingAbilities.join(', ')}`);
      } else {
        mapped.ability_scores = abilityScores;
      }
    }

    // 2. Map traits to abilities (if abilities doesn't exist)
    if (!rawData.abilities && rawData.traits && Array.isArray(rawData.traits)) {
      mapped.abilities = rawData.traits;
      result.warnings.push('Mapped "traits" field to canonical "abilities" field');
    }

    // 3. Normalize equipment
    const equipment = normalizeEquipment(rawData);
    if (equipment.length > 0) {
      mapped.equipment = equipment;
      if (rawData.equipment && typeof rawData.equipment === 'object' && 'carried' in rawData.equipment) {
        result.warnings.push('Normalized nested equipment.carried to flat equipment array');
      }
    }

    // 4. Normalize magic items
    const magicItems = normalizeMagicItems(rawData);
    if (magicItems.length > 0) {
      mapped.magicItems = magicItems;
      if (Array.isArray(rawData.magic_items) && rawData.magic_items.length > 0 && typeof rawData.magic_items[0] === 'object') {
        result.warnings.push('Extracted magic item names from object array');
      }
    }

    // 5. Normalize personality
    const personality = normalizePersonality(rawData);
    mapped.personality = personality;
    if (rawData.personality_traits || rawData.ideals || rawData.bonds || rawData.flaws) {
      result.warnings.push('Normalized top-level personality fields into personality object');
    }

    const normalizedSpeed = normalizeSpeed(rawData.speed);
    if (normalizedSpeed) {
      mapped.speed = normalizedSpeed;
      if (typeof rawData.speed === 'number' || typeof rawData.speed === 'string') {
        result.warnings.push('Normalized scalar speed value into canonical speed object');
      }
    }

    const normalizedSenses = normalizeSenses(rawData.senses);
    if (normalizedSenses.senses) {
      mapped.senses = normalizedSenses.senses;
      if (rawData.senses && typeof rawData.senses === 'object' && !Array.isArray(rawData.senses)) {
        result.warnings.push('Normalized object-form senses into canonical senses array');
      }
    }
    if (normalizedSenses.passivePerception !== undefined && mapped.passive_perception === undefined) {
      mapped.passive_perception = normalizedSenses.passivePerception;
    }

    // 6. Map canonical_name to name if needed
    if (!rawData.name && rawData.canonical_name) {
      mapped.name = rawData.canonical_name;
      result.warnings.push('Mapped "canonical_name" to "name"');
    }

    // 6a. Normalize race/species/subspecies terminology
    const explicitRace = typeof rawData.race === 'string' ? rawData.race.trim() : '';
    const explicitSpecies = typeof rawData.species === 'string' ? rawData.species.trim() : '';
    const explicitSubspecies = typeof rawData.subspecies === 'string' ? rawData.subspecies.trim() : '';
    const explicitSubtype = typeof rawData.subtype === 'string' ? rawData.subtype.trim() : '';

    if (!explicitRace && explicitSpecies) {
      mapped.race = explicitSpecies;
      result.warnings.push('Mapped "species" to canonical "race" field because no explicit race was provided');
    }

    const resolvedSubspecies = explicitSubspecies || (explicitRace ? explicitSpecies : '') || explicitSubtype;
    if (resolvedSubspecies) {
      mapped.subspecies = resolvedSubspecies;
      mapped.subtype = resolvedSubspecies;
      if (explicitRace && explicitSpecies) {
        result.warnings.push('Mapped "species" to canonical "subspecies" field and synchronized legacy "subtype"');
      } else if (!explicitSubspecies && explicitSubtype) {
        result.warnings.push('Mapped legacy "subtype" field to canonical "subspecies" alias');
      }
    }

    const normalizedOrganizations = normalizeNamedEntries(rawData.organizations ?? rawData.factions, { role: 'member' });
    if (normalizedOrganizations) {
      mapped.organizations = normalizedOrganizations;
      mapped.factions = normalizedOrganizations.map((entry) => ({
        ...entry,
        role: typeof entry.role === 'string' && entry.role.trim().length > 0 ? entry.role : 'member',
      }));
      result.warnings.push('Normalized organizations/factions to object array structure');
    }

    const normalizedClassLevels = normalizeClassLevels(rawData.class_levels);
    if (normalizedClassLevels) {
      mapped.class_levels = normalizedClassLevels;
      if (typeof rawData.class_levels === 'string') {
        result.warnings.push('Normalized string class_levels into canonical array format');
      }
    }

    result.mapped = mapped;
    result.success = result.errors.length === 0;

    return result;

  } catch (error) {
    result.errors.push(`Mapping failed: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

/**
 * Map and validate NPC data in one step
 *
 * This is the primary function to use for processing raw NPC data.
 * It maps variations to canonical structure, then validates against schema.
 *
 * @param rawData Raw NPC data from any source
 * @returns Validation result with mapped data or detailed errors
 */
export function mapAndValidateNpc(rawData: Record<string, unknown>): {
  success: boolean;
  data: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  validationErrors?: string;
  rawErrors?: unknown[];
  schemaVersion?: '1.0' | '1.1';
} {
  // Step 1: Map to canonical structure
  const mappingResult = mapToCanonicalStructure(rawData);

  if (!mappingResult.success) {
    return {
      success: false,
      data: null,
      errors: ['Mapping failed', ...mappingResult.errors],
      warnings: mappingResult.warnings,
    };
  }

  // Step 2: Validate against schema
  const validation = validateNpcSafe(mappingResult.mapped);

  if (!validation.valid) {
    return {
      success: false,
      data: mappingResult.mapped,
      errors: ['Schema validation failed'],
      warnings: mappingResult.warnings,
      validationErrors: validation.details || 'Unknown validation error',
      rawErrors: validation.errors as unknown[],
      schemaVersion: validation.schemaVersion,
    };
  }

  return {
    success: true,
    data: mappingResult.mapped,
    errors: [],
    warnings: mappingResult.warnings,
    schemaVersion: validation.schemaVersion,
  };
}

/**
 * Get schema field definitions for generating AI prompts
 *
 * Returns a structured representation of required and optional fields
 * that can be used to tell the AI what structure to output.
 */
export function getSchemaFieldDefinitions(): {
  required: string[];
  optional: string[];
  structure: Record<string, unknown>;
} {
  const required = npcSchema.required || [];
  const properties = npcSchema.properties || {};
  const optional = Object.keys(properties).filter(key => !required.includes(key));

  return {
    required,
    optional,
    structure: properties,
  };
}

/**
 * Generate field guidance for AI prompts
 *
 * Creates human-readable guidance that can be included in AI prompts
 * to ensure correct field names and structure.
 */
export function generateFieldGuidance(): string {
  const { required, structure } = getSchemaFieldDefinitions();

  let guidance = '## Required NPC Fields\n\n';
  guidance += 'The following fields are REQUIRED and must be included:\n\n';

  for (const field of required) {
    const fieldDef = (structure as Record<string, any>)[field];
    const description = fieldDef?.description || 'No description';
    guidance += `- **${field}**: ${description}\n`;
  }

  guidance += '\n## Important Field Naming Rules\n\n';
  guidance += '- Ability scores must use lowercase: str, dex, con, int, wis, cha\n';
  guidance += '- Special abilities should be in the "abilities" array (not "traits")\n';
  guidance += '- Equipment should be a flat array of strings (not nested under "carried")\n';
  guidance += '- Magic items should be strings or objects with "name" property\n';
  guidance += '- Personality should be an object with traits, ideals, bonds, flaws arrays\n';

  return guidance;
}

/**
 * Generate compact field structure for AI prompt injection
 *
 * Creates a compact JSON structure showing the expected NPC schema
 * that can be injected into AI prompts to guide output format.
 */
export function generateSchemaPromptSection(): string {
  return `
⚠️ CRITICAL: NPC OUTPUT SCHEMA ⚠️

Your NPC output MUST conform to this exact schema structure. Use these EXACT field names:

REQUIRED FIELDS:
- name: string (canonical character name)
- description: string (physical appearance and narrative summary, min 20 chars)
- race: string (e.g., "Human", "Elf", "Dwarf")
- class_levels: array of {class: string, level: number, subclass?: string}
- ability_scores: object with {str, dex, con, int, wis, cha} - LOWERCASE ONLY
- proficiency_bonus: number or string
- personality: object with {traits: array, ideals: array, bonds: array, flaws: array}
- motivations: array of strings
- rule_base: "2024RAW" or "2014RAW"
- sources_used: array of source names referenced
- assumptions: array of assumptions made
- proposals: array of {question, options, rule_impact} for ambiguities
- canon_update: string summary of canon changes (min 20 chars)

CRITICAL NAMING RULES:
1. Ability scores: Use LOWERCASE keys: str, dex, con, int, wis, cha (NOT STR, DEX, etc.)
2. Special abilities: Use "abilities" field (NOT "traits")
3. Equipment: Flat array of strings (NOT nested under "carried")
4. Magic items: Array of strings or objects with "name" property
5. Personality: Must be nested object {traits: [], ideals: [], bonds: [], flaws: []}

OPTIONAL FIELDS (use if applicable):
- title, aliases, role, appearance, background
- alignment, affiliation, location, era
- size, creature_type, subtype
- challenge_rating, experience_points
- armor_class, hit_points, hit_dice, speed
- saving_throws, skill_proficiencies, senses, passive_perception, languages
- damage_resistances, damage_immunities, damage_vulnerabilities, condition_immunities
- equipment, additional_traits, spellcasting
- actions, bonus_actions, reactions
- legendary_actions, mythic_actions, lair_actions, regional_effects
- relationships, hooks, tactics, notes, sources

Example ability_scores (CORRECT):
{"str": 18, "dex": 16, "con": 14, "int": 10, "wis": 12, "cha": 8}

Example ability_scores (WRONG - will fail validation):
{"STR": 18, "DEX": 16, "CON": 14, "INT": 10, "WIS": 12, "CHA": 8}

Example personality (CORRECT):
{"personality": {"traits": ["Brave", "Loyal"], "ideals": ["Honor"], "bonds": ["Family"], "flaws": ["Stubborn"]}}

Example personality (WRONG - will fail validation):
{"personality_traits": ["Brave"], "ideals": ["Honor"], ...}

VALIDATION ENFORCEMENT:
Your output will be validated against this schema before storage. Any deviations from these field names will cause a validation error and require regeneration.
`;
}
