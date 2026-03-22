/**
 * NPC Stage Output Validation
 * Validates that AI responses include all required fields
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function hasNonEmptyObjectArray(value: unknown): boolean {
  return Array.isArray(value)
    && value.some((item) => {
      if (typeof item === 'string') {
        return item.trim().length > 0;
      }

      return isRecord(item) && Object.keys(item).length > 0;
    });
}

function hasOnlyPlaceholderModifiers(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2) {
    return false;
  }

  const modifiers = value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (!isRecord(item) || typeof item.value !== 'string') {
        return '';
      }

      return item.value.trim();
    })
    .filter((item) => item.length > 0);

  return modifiers.length === value.length
    && modifiers.every((item) => item === '+0' || item === '0' || item === '-0');
}

function getClassLevelTexts(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (!isRecord(entry)) {
          return '';
        }

        if (typeof entry.class === 'string' && entry.class.trim().length > 0) {
          return entry.class.trim();
        }

        if (typeof entry.name === 'string' && entry.name.trim().length > 0) {
          return entry.name.trim();
        }

        return '';
      })
      .filter((entry) => entry.length > 0);
  }

  if (isRecord(value)) {
    return Object.keys(value).filter((entry) => entry.trim().length > 0);
  }

  return [];
}

function hasDefaultAbilityScores(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const shortKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const longKeys = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;

  const hasShortDefaults = shortKeys.every((key) => value[key] === 10);
  const hasLongDefaults = longKeys.every((key) => value[key] === 10);

  return hasShortDefaults || hasLongDefaults;
}

function hasClassNamed(output: Record<string, unknown>, className: string): boolean {
  return getClassLevelTexts(output.class_levels)
    .some((entry) => entry.toLowerCase().includes(className.toLowerCase()));
}

/**
 * Validate Core Details stage output
 * Ensures all personality fields are present
 */
export function validateCoreDetailsStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredFields = [
    'personality_traits',
    'ideals',
    'bonds',
    'flaws',
    'goals',
    'fears',
    'quirks',
    'voice_mannerisms',
    'hooks',
  ];

  const incompleteFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in output)) {
      incompleteFields.push(field);
    } else {
      const value = output[field];
      if (!Array.isArray(value) || value.length === 0 || value.every((item) => typeof item !== 'string' || item.trim().length === 0)) {
        incompleteFields.push(field);
      }
    }
  }

  if (incompleteFields.length > 0) {
    errors.push(
      `AI response is incomplete. These required personality fields are missing or empty: ${incompleteFields.join(', ')}. ` +
      `The AI must provide non-empty arrays for all 9 fields separately, not just hooks.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateStatsStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasSenses = getStringArray(output.senses).length > 0
    || (isRecord(output.senses) && Object.keys(output.senses).length > 0);

  if (!isRecord(output.ability_scores)) {
    errors.push('Missing ability_scores object.');
  } else if (hasDefaultAbilityScores(output.ability_scores)) {
    errors.push('Ability scores are placeholder defaults (all 10). Generate role-appropriate stats.');
  }

  if (!("armor_class" in output)) {
    errors.push('Missing armor_class.');
  }

  if (!("hit_points" in output)) {
    errors.push('Missing hit_points.');
  }

  if (!hasSenses) {
    warnings.push('Senses are empty or missing.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateCharacterBuildStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasNonEmptyObjectArray(output.class_features)) {
    errors.push('Missing class_features. Include all class features through the current level.');
  }

  if (!hasNonEmptyObjectArray(output.racial_features)) {
    errors.push('Missing racial_features. Include racial traits.');
  }

  if (!hasNonEmptyObjectArray(output.skill_proficiencies)) {
    warnings.push('Skill proficiencies are empty.');
  } else if (hasOnlyPlaceholderModifiers(output.skill_proficiencies)) {
    errors.push('Skill proficiencies use placeholder modifiers (+0). Provide real signed modifiers for the listed proficient skills.');
  }

  if (!hasNonEmptyObjectArray(output.saving_throws)) {
    warnings.push('Saving throws are empty.');
  } else if (hasOnlyPlaceholderModifiers(output.saving_throws)) {
    errors.push('Saving throws use placeholder modifiers (+0). Provide real signed modifiers for the listed saving throw proficiencies.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateCharacterBuildEnrichmentStage(): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: [],
  };
}

function validateCombatStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasNonEmptyObjectArray(output.actions)) {
    errors.push('Missing combat actions. Include weapon attacks and core combat options.');
  }

  if (!Array.isArray(output.bonus_actions)) {
    warnings.push('bonus_actions missing.');
  }

  if (!Array.isArray(output.reactions)) {
    warnings.push('reactions missing.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSpellcastingStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const preparedCasters = ['cleric', 'druid', 'paladin', 'wizard', 'artificer'];
  const knownCasters = ['bard', 'sorcerer', 'warlock'];
  const halfCasters = ['ranger'];

  const isPrepared = preparedCasters.some((cls) => hasClassNamed(output, cls));
  const isKnown = knownCasters.some((cls) => hasClassNamed(output, cls));
  const isHalf = halfCasters.some((cls) => hasClassNamed(output, cls));
  const shouldHaveSpellcasting = isPrepared || isKnown || isHalf;

  const hasSlots = isRecord(output.spell_slots) && Object.keys(output.spell_slots).length > 0;
  const hasPrepared = isRecord(output.prepared_spells) && Object.values(output.prepared_spells).some((v) => Array.isArray(v) && v.length > 0);
  const hasAlwaysPrepared = isRecord(output.always_prepared_spells) && Object.values(output.always_prepared_spells).some((v) => Array.isArray(v) && v.length > 0);
  const hasKnown = Array.isArray(output.spells_known) && output.spells_known.length > 0;
  const hasInnate = isRecord(output.innate_spells) && Object.keys(output.innate_spells).length > 0;

  if (shouldHaveSpellcasting) {
    if (typeof output.spellcasting_ability !== 'string' || output.spellcasting_ability.trim().length === 0) {
      errors.push('Missing spellcasting_ability for a spellcasting class.');
    }

    if (isPrepared || isHalf) {
      if (!hasSlots) {
        errors.push('Missing spell_slots for a prepared/slots-based caster.');
      }
      if (!hasPrepared && !hasAlwaysPrepared && !hasInnate) {
        errors.push('Prepared casters must include prepared_spells or always_prepared_spells (innate allowed as supplement).');
      }
    }

    if (isKnown) {
      if (!hasKnown) {
        errors.push('Known casters must include spells_known as a non-empty array of spell names.');
      }
      if (!hasSlots && !hasInnate) {
        errors.push('Known casters should include spell_slots (or innate_spells if purely innate).');
      }
    }

    if (typeof output.spell_save_dc !== 'number' || !Number.isFinite(output.spell_save_dc)) {
      errors.push('Missing spell_save_dc for a spellcasting class.');
    }
    if (typeof output.spell_attack_bonus !== 'number' || !Number.isFinite(output.spell_attack_bonus)) {
      errors.push('Missing spell_attack_bonus for a spellcasting class.');
    }
  } else if (Object.keys(output).length === 0) {
    warnings.push('Spellcasting stage returned an empty object.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRelationshipsStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasAnyRelationships = hasNonEmptyObjectArray(output.allies)
    || hasNonEmptyObjectArray(output.enemies)
    || hasNonEmptyObjectArray(output.organizations)
    || hasNonEmptyObjectArray(output.family)
    || hasNonEmptyObjectArray(output.contacts);

  if (!hasAnyRelationships) {
    errors.push('Relationships stage is empty. Include allies, enemies, organizations, family, or contacts as appropriate.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateEquipmentStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasAnyEquipment = hasNonEmptyObjectArray(output.weapons)
    || hasNonEmptyObjectArray(output.armor_and_shields)
    || hasNonEmptyObjectArray(output.wondrous_items)
    || hasNonEmptyObjectArray(output.consumables)
    || hasNonEmptyObjectArray(output.other_gear);

  if (!hasAnyEquipment) {
    errors.push('Equipment stage is empty. Include weapons, armor, wondrous items, consumables, or other gear as appropriate.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate any NPC stage output based on stage name
 */
export function validateNpcStageOutput(
  stageName: string,
  output: Record<string, unknown>
): ValidationResult {
  const normalizedName = stageName.toLowerCase();
  const relaxedName = normalizedName.replace(/[_:]+/g, ' ');

  if (
    normalizedName.includes('character_build_feature_inventory')
    || relaxedName.includes('character build inventory')
  ) {
    return validateCharacterBuildStage(output);
  }

  if (
    normalizedName.includes('character_build_feature_enrichment')
    || relaxedName.includes('character build enrichment')
  ) {
    return validateCharacterBuildEnrichmentStage();
  }

  if (normalizedName.includes('core_details') || relaxedName.includes('core details')) {
    return validateCoreDetailsStage(output);
  }

  if (normalizedName.includes('stats')) {
    return validateStatsStage(output);
  }

  if (normalizedName.includes('character_build') || relaxedName.includes('character build')) {
    return validateCharacterBuildStage(output);
  }

  if (normalizedName.includes('combat')) {
    return validateCombatStage(output);
  }

  if (normalizedName.includes('spellcasting')) {
    return validateSpellcastingStage(output);
  }

  if (normalizedName.includes('relationships')) {
    return validateRelationshipsStage(output);
  }

  if (normalizedName.includes('equipment')) {
    return validateEquipmentStage(output);
  }

  // Other stages pass validation for now
  return {
    isValid: true,
    errors: [],
    warnings: [],
  };
}
