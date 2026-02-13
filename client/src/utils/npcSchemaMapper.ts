/**
 * Client-Side Schema-Driven NPC Field Mapper
 *
 * Architecture:
 * 1. Uses schema as single source of truth for field names
 * 2. Intelligently maps variations to canonical field names
 * 3. NO FALLBACKS - only explicit mapping or actionable errors
 *
 * This is the client-side version that works in the browser.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

/**
 * Field variation mappings - maps common variations to canonical schema field names (v1.1)
 * This is kept for documentation purposes and may be used in future enhancements
 */
// const FIELD_MAPPINGS: Record<string, string[]> = {
//   // Ability score variations
//   'ability_scores.str': ['STR', 'Str', 'strength', 'Strength', 'STRENGTH'],
//   'ability_scores.dex': ['DEX', 'Dex', 'dexterity', 'Dexterity', 'DEXTERITY'],
//   'ability_scores.con': ['CON', 'Con', 'constitution', 'Constitution', 'CONSTITUTION'],
//   'ability_scores.int': ['INT', 'Int', 'intelligence', 'Intelligence', 'INTELLIGENCE'],
//   'ability_scores.wis': ['WIS', 'Wis', 'wisdom', 'Wisdom', 'WISDOM'],
//   'ability_scores.cha': ['CHA', 'Cha', 'charisma', 'Charisma', 'CHARISMA'],
//
//   // Trait/ability variations - v1.1 uses 'abilities'
//   'abilities': ['traits', 'Traits', 'special_abilities', 'features', 'special_traits'],
//
//   // Personality variations
//   'personality.traits': ['personality_traits', 'character_traits'],
//   'personality.ideals': ['ideals'],
//   'personality.bonds': ['bonds'],
//   'personality.flaws': ['flaws'],
//
//   // Name variations
//   'name': ['canonical_name', 'character_name', 'npc_name'],
//
//   // Equipment variations
//   'equipment': ['equipment.carried', 'gear', 'possessions'],
//
//   // Magic items variations (v1.1: separate attuned_items and magic_items)
//   'attuned_items': ['attuned_magic_items', 'attunement_items'],
//   'magic_items': ['magical_items', 'non_attuned_items'],
//
//   // Allies variations (v1.1: allies_friends is preferred detailed format)
//   'allies_friends': ['allies', 'allies_and_contacts', 'allies_list'],
//
//   // Factions (v1.1 new field)
//   'factions': ['faction_memberships', 'organizations'],
//
//   // Minions (v1.1 new field)
//   'minions': ['servants', 'controlled_creatures', 'underlings'],
//
//   // Spellcasting variations
//   'spellcasting.cantrips': ['cantrips_known', 'cantrip_list'],
//   'spellcasting.spellcasting_focus': ['focus', 'arcane_focus', 'spellcasting_focus'],
//
//   // Vampire traits (v1.1 new field)
//   'vampire_traits': ['vampire_template', 'vampiric_abilities'],
//
//   // Legendary actions (v1.1 enhanced)
//   'legendary_actions.count': ['legendary_action_count', 'legendary_actions_per_round'],
//
//   // Generation metadata (v1.1 new field)
//   'generation_metadata': ['metadata', 'generation_info'],
// };

/**
 * Mapping result with detailed information
 */
export interface MappingResult {
  success: boolean;
  mapped: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

/**
 * Normalize ability scores object - maps variations to canonical lowercase names
 */
function normalizeAbilityScores(source: Record<string, unknown>): Record<string, number> | null {
  const result: Record<string, number> = {};
  const requiredAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  for (const abilityName of requiredAbilities) {
    // Try lowercase first (canonical)
    if (typeof source[abilityName] === 'number') {
      result[abilityName] = source[abilityName] as number;
      continue;
    }

    // Try uppercase
    const uppercase = abilityName.toUpperCase();
    if (typeof source[uppercase] === 'number') {
      result[abilityName] = source[uppercase] as number;
      continue;
    }

    // Try capitalized
    const capitalized = abilityName.charAt(0).toUpperCase() + abilityName.slice(1);
    if (typeof source[capitalized] === 'number') {
      result[abilityName] = source[capitalized] as number;
      continue;
    }

    // Could not find this ability score
    return null;
  }

  return result;
}

/**
 * Normalize equipment array
 */
function normalizeEquipment(source: Record<string, unknown>): string[] | null {
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

  // Check alternative names
  if (Array.isArray(source.gear)) {
    return (source.gear as unknown[]).filter(item => typeof item === 'string') as string[];
  }

  return null;
}

/**
 * Normalize magic items array (v1.1: preserves full object structure)
 */
function normalizeMagicItems(source: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const magicItems = source.magic_items || source.magical_items;

  if (!Array.isArray(magicItems)) {
    return null;
  }

  // v1.1: Preserve full object structure with rarity, description, etc.
  if (magicItems.length > 0 && typeof magicItems[0] === 'object' && magicItems[0] !== null) {
    return magicItems
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  // If strings, convert to minimal object format
  return magicItems
    .filter(item => typeof item === 'string')
    .map(name => ({ name }));
}

/**
 * Normalize attuned items array (v1.1: separate from magic_items)
 */
function normalizeAttunedItems(source: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const attunedItems = source.attuned_items || source.attuned_magic_items;

  if (!Array.isArray(attunedItems)) {
    return null;
  }

  // Preserve full object structure with attunement, charges, etc.
  if (attunedItems.length > 0 && typeof attunedItems[0] === 'object' && attunedItems[0] !== null) {
    return attunedItems
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  // If strings, convert to minimal object format
  return attunedItems
    .filter(item => typeof item === 'string')
    .map(name => ({ name, requires_attunement: true, attuned: true }));
}

/**
 * Normalize class levels (v1.1: accepts string OR array)
 */
function normalizeClassLevels(source: Record<string, unknown>): string | Array<Record<string, unknown>> | null {
  const classLevels = source.class_levels;

  if (!classLevels) {
    return null;
  }

  // If already a string (legacy format like "Artificer 16 / Vampire 9"), return as-is
  if (typeof classLevels === 'string') {
    return classLevels;
  }

  // If array, preserve object structure
  if (Array.isArray(classLevels)) {
    return classLevels
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  return null;
}

/**
 * Normalize vampire traits (v1.1: new structured field)
 */
function normalizeVampireTraits(source: Record<string, unknown>): Record<string, unknown> | null {
  const vampireTraits = source.vampire_traits || source.vampire_template;

  if (!vampireTraits || typeof vampireTraits !== 'object') {
    return null;
  }

  return vampireTraits as Record<string, unknown>;
}

/**
 * Normalize allies/friends (v1.1: preserves detailed structure)
 */
function normalizeAlliesFriends(source: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const allies = source.allies_friends || source.allies || source.allies_and_contacts;

  if (!Array.isArray(allies)) {
    return null;
  }

  // If array contains objects, preserve full structure
  if (allies.length > 0 && typeof allies[0] === 'object' && allies[0] !== null) {
    return allies
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  // If strings, convert to minimal object format
  return allies
    .filter(item => typeof item === 'string')
    .map(name => ({ name, type: 'unknown', relationship: 'ally' }));
}

/**
 * Normalize factions (v1.1: new field)
 */
function normalizeFactions(source: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const factions = source.factions || source.faction_memberships || source.organizations;

  if (!Array.isArray(factions)) {
    return null;
  }

  if (factions.length > 0 && typeof factions[0] === 'object' && factions[0] !== null) {
    return factions
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  // If strings, convert to minimal object format
  return factions
    .filter(item => typeof item === 'string')
    .map(name => ({ name, role: 'member' }));
}

/**
 * Normalize minions (v1.1: new field)
 */
function normalizeMinions(source: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const minions = source.minions || source.servants || source.controlled_creatures;

  if (!Array.isArray(minions)) {
    return null;
  }

  if (minions.length > 0 && typeof minions[0] === 'object' && minions[0] !== null) {
    return minions
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  // If strings, convert to minimal object format
  return minions
    .filter(item => typeof item === 'string')
    .map(name => ({ name, type: 'unknown', quantity: 1 }));
}

/**
 * Normalize personality object
 */
function normalizePersonality(source: Record<string, unknown>): Record<string, string[]> | null {
  const result: Record<string, string[]> = {
    traits: [],
    ideals: [],
    bonds: [],
    flaws: [],
  };

  let foundAny = false;

  // Check nested personality object first
  const personalityObj = source.personality;
  if (personalityObj && typeof personalityObj === 'object') {
    const personality = personalityObj as Record<string, unknown>;

    if (Array.isArray(personality.traits)) {
      result.traits = personality.traits.filter(t => typeof t === 'string');
      foundAny = true;
    }
    if (Array.isArray(personality.ideals)) {
      result.ideals = personality.ideals.filter(t => typeof t === 'string');
      foundAny = true;
    }
    if (Array.isArray(personality.bonds)) {
      result.bonds = personality.bonds.filter(t => typeof t === 'string');
      foundAny = true;
    }
    if (Array.isArray(personality.flaws)) {
      result.flaws = personality.flaws.filter(t => typeof t === 'string');
      foundAny = true;
    }
  }

  // Check top-level variations
  if (result.traits.length === 0 && Array.isArray(source.personality_traits)) {
    result.traits = source.personality_traits.filter(t => typeof t === 'string');
    foundAny = true;
  }
  if (result.ideals.length === 0 && Array.isArray(source.ideals)) {
    result.ideals = source.ideals.filter(t => typeof t === 'string');
    foundAny = true;
  }
  if (result.bonds.length === 0 && Array.isArray(source.bonds)) {
    result.bonds = source.bonds.filter(t => typeof t === 'string');
    foundAny = true;
  }
  if (result.flaws.length === 0 && Array.isArray(source.flaws)) {
    result.flaws = source.flaws.filter(t => typeof t === 'string');
    foundAny = true;
  }

  return foundAny ? result : null;
}

/**
 * Map raw data to canonical structure
 *
 * This function intelligently maps field variations to canonical names.
 * It does NOT use silent fallbacks - it only maps known variations or reports errors.
 *
 * @param rawData Raw data from any source
 * @returns Mapping result with success status, mapped data, and any errors/warnings
 */
export function mapToCanonicalStructure(rawData: Record<string, unknown>): MappingResult {
  const result: MappingResult = {
    success: false,
    mapped: {},
    errors: [],
    warnings: [],
  };

  try {
    // Start with a copy of raw data
    const mapped: Record<string, unknown> = { ...rawData };

    // 1. Normalize ability scores
    if (rawData.ability_scores && typeof rawData.ability_scores === 'object') {
      const abilityScores = normalizeAbilityScores(rawData.ability_scores as Record<string, unknown>);

      if (abilityScores === null) {
        result.errors.push('Could not find all 6 ability scores (str, dex, con, int, wis, cha). Check for uppercase/lowercase variations.');
      } else {
        mapped.ability_scores = abilityScores;

        // Check if we mapped from uppercase
        const rawAbilities = rawData.ability_scores as Record<string, unknown>;
        if ('STR' in rawAbilities || 'DEX' in rawAbilities) {
          result.warnings.push('Mapped uppercase ability scores (STR, DEX, etc.) to lowercase (str, dex, etc.)');
        }
      }
    }

    // 2. Map traits to abilities (if abilities doesn't exist)
    if (!rawData.abilities && rawData.traits && Array.isArray(rawData.traits)) {
      mapped.abilities = rawData.traits;
      result.warnings.push('Mapped "traits" field to canonical "abilities" field');
      delete mapped.traits; // Remove the old field
    }

    // 3. Normalize equipment
    const equipment = normalizeEquipment(rawData);
    if (equipment !== null) {
      mapped.equipment = equipment;
      if (rawData.equipment && typeof rawData.equipment === 'object' && 'carried' in rawData.equipment) {
        result.warnings.push('Normalized nested equipment.carried to flat equipment array');
      }
    }

    // 4. Normalize magic items (v1.1: preserve object structure)
    const magicItems = normalizeMagicItems(rawData);
    if (magicItems !== null) {
      mapped.magic_items = magicItems;
      if (Array.isArray(rawData.magic_items) && rawData.magic_items.length > 0 && typeof rawData.magic_items[0] === 'object') {
        result.warnings.push('Normalized magic items to v1.1 object structure');
      }
      delete mapped.magical_items; // Remove alternative field name
    }

    // 4a. Normalize attuned items (v1.1: separate from magic_items)
    const attunedItems = normalizeAttunedItems(rawData);
    if (attunedItems !== null) {
      mapped.attuned_items = attunedItems;
      result.warnings.push('Normalized attuned items to v1.1 structure');
    }

    // 5. Normalize personality
    const personality = normalizePersonality(rawData);
    if (personality !== null) {
      mapped.personality = personality;

      // Check if we mapped from top-level fields
      if (rawData.personality_traits || rawData.ideals || rawData.bonds || rawData.flaws) {
        result.warnings.push('Normalized top-level personality fields into personality object');
        delete mapped.personality_traits;
        delete mapped.ideals;
        delete mapped.bonds;
        delete mapped.flaws;
      }
    }

    // 6. Map canonical_name to name if needed
    if (!rawData.name && rawData.canonical_name) {
      mapped.name = rawData.canonical_name;
      result.warnings.push('Mapped "canonical_name" to "name"');
    }

    // 7. Normalize class_levels (v1.1: string OR array)
    const classLevels = normalizeClassLevels(rawData);
    if (classLevels !== null) {
      mapped.class_levels = classLevels;
      if (typeof classLevels === 'string') {
        result.warnings.push('class_levels is string format (legacy). Consider converting to array format.');
      }
    }

    // 8. Normalize vampire traits (v1.1: new field)
    const vampireTraits = normalizeVampireTraits(rawData);
    if (vampireTraits !== null) {
      mapped.vampire_traits = vampireTraits;
      result.warnings.push('Normalized vampire traits to v1.1 structure');
    }

    // 9. Normalize allies/friends (v1.1: detailed structure)
    const alliesFriends = normalizeAlliesFriends(rawData);
    if (alliesFriends !== null) {
      mapped.allies_friends = alliesFriends;
      result.warnings.push('Normalized allies_friends to v1.1 detailed structure');
      delete mapped.allies; // Remove legacy field
      delete mapped.allies_and_contacts;
    }

    // 10. Normalize factions (v1.1: new field)
    const factions = normalizeFactions(rawData);
    if (factions !== null) {
      mapped.factions = factions;
      result.warnings.push('Normalized factions to v1.1 structure');
      delete mapped.faction_memberships;
      delete mapped.organizations;
    }

    // 11. Normalize minions (v1.1: new field)
    const minions = normalizeMinions(rawData);
    if (minions !== null) {
      mapped.minions = minions;
      result.warnings.push('Normalized minions to v1.1 structure');
      delete mapped.servants;
      delete mapped.controlled_creatures;
    }

    // 12. Map foes variations (keeping for backward compatibility)
    if (!rawData.foes && rawData.enemies) {
      mapped.foes = rawData.enemies;
      result.warnings.push('Mapped "enemies" to canonical "foes" field');
      delete mapped.enemies;
    }

    // 13. Ensure schema_version is set for v1.1
    if (!mapped.schema_version) {
      mapped.schema_version = '1.1';
      result.warnings.push('Added schema_version: "1.1" (not present in source)');
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
 * Log mapping result to console with detailed information
 */
export function logMappingResult(result: MappingResult, context: string): void {
  if (result.warnings.length > 0) {
    console.warn(`[${context}] Field mapping warnings:`, result.warnings);
  }

  if (result.errors.length > 0) {
    console.error(`[${context}] Field mapping errors:`, result.errors);
  }

  if (result.success) {
    console.log(`[${context}] Field mapping successful`);
  } else {
    console.error(`[${context}] Field mapping failed`);
  }
}
