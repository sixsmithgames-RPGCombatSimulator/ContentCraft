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
    && value.some((item) => isRecord(item) && Object.keys(item).length > 0);
}

function hasDefaultAbilityScores(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  return keys.every((key) => value[key] === 10);
}

function hasClassNamed(output: Record<string, unknown>, className: string): boolean {
  const classLevels = output.class_levels;
  if (!Array.isArray(classLevels)) return false;
  return classLevels.some((entry) => isRecord(entry) && typeof entry.class === 'string' && entry.class.toLowerCase().includes(className.toLowerCase()));
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

  if (getStringArray(output.senses).length === 0) {
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
  }

  if (!hasNonEmptyObjectArray(output.saving_throws)) {
    warnings.push('Saving throws are empty.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
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
  const shouldHaveSpellcasting = hasClassNamed(output, 'paladin')
    || hasClassNamed(output, 'cleric')
    || hasClassNamed(output, 'wizard')
    || hasClassNamed(output, 'sorcerer')
    || hasClassNamed(output, 'bard')
    || hasClassNamed(output, 'warlock')
    || hasClassNamed(output, 'druid')
    || hasClassNamed(output, 'ranger');

  if (shouldHaveSpellcasting) {
    if (typeof output.spellcasting_ability !== 'string' || output.spellcasting_ability.trim().length === 0) {
      errors.push('Missing spellcasting_ability for a spellcasting class.');
    }
    if (!Array.isArray(output.spells_known) || output.spells_known.length === 0) {
      errors.push('Missing spells_known for a spellcasting class.');
    }
    if (!isRecord(output.spell_slots) || Object.keys(output.spell_slots).length === 0) {
      errors.push('Missing spell_slots for a spellcasting class.');
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

  if (normalizedName.includes('core details')) {
    return validateCoreDetailsStage(output);
  }

  if (normalizedName.includes('stats')) {
    return validateStatsStage(output);
  }

  if (normalizedName.includes('character build')) {
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
