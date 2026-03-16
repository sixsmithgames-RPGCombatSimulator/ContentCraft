/**
 * Stage Input Reducer
 *
 * Extracts only the fields each stage needs from prior stage outputs.
 * Reduces prompt size by passing 8-10 fields (~200 chars) instead of 50+ fields (2000+ chars).
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

/**
 * Stage results from prior stages.
 */
export interface StageResults {
  [stageName: string]: Record<string, unknown>;
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function isEmptyObject(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function isEmptyPersonalityShell(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const keys = ['traits', 'ideals', 'bonds', 'flaws'];
  return keys.every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).length === 0);
}

function isDefaultAbilityScores(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  return keys.every((key) => value[key] === 10);
}

function isDefaultSpeed(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && value.walk === '30 ft.';
}

function shouldIncludeReducedField(fieldName: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim().length === 0) return false;
  if (isEmptyArray(value) || isEmptyObject(value)) return false;
  if (fieldName === 'personality' && isEmptyPersonalityShell(value)) return false;
  if (fieldName === 'ability_scores' && isDefaultAbilityScores(value)) return false;
  if (fieldName === 'speed' && isDefaultSpeed(value)) return false;
  return true;
}

/**
 * Helper to safely extract a value from stage results.
 *
 * @param results - Stage results object
 * @param stageName - Stage name (lowercase with underscores)
 * @param fieldName - Field name to extract
 * @returns Field value or undefined
 */
function getField(results: StageResults, stageName: string, fieldName: string): unknown {
  const stageData = results[stageName];
  if (!stageData || typeof stageData !== 'object') return undefined;
  return stageData[fieldName];
}

/**
 * Helper to safely extract multiple fields from a stage.
 *
 * @param results - Stage results object
 * @param stageName - Stage name (lowercase with underscores)
 * @param fieldNames - Array of field names to extract
 * @returns Object with extracted fields
 */
function getFields(results: StageResults, stageName: string, fieldNames: string[]): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  for (const fieldName of fieldNames) {
    const value = getField(results, stageName, fieldName);
    if (shouldIncludeReducedField(fieldName, value)) {
      extracted[fieldName] = value;
    }
  }
  return extracted;
}

/**
 * Reduces stage inputs for the Basic Info stage.
 * Basic Info is the first creator stage — needs only planner brief.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Basic Info stage
 */
function reduceBasicInfoInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'planner', ['concept', 'race', 'class', 'level', 'background', 'alignment', 'challenge_rating']),
    ...getFields(results, 'purpose', ['deliverable', 'type']),
  };
}

/**
 * Reduces stage inputs for the Core Details stage.
 * Core Details needs: name, race, alignment, background from basic_info.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Core Details stage
 */
function reduceCoreDetailsInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'basic_info', ['name', 'race', 'alignment', 'background', 'class_levels', 'challenge_rating']),
    ...getFields(results, 'creator:_basic_info', ['name', 'race', 'alignment', 'background', 'class_levels', 'challenge_rating']),
  };
}

/**
 * Reduces stage inputs for the Stats stage.
 * Stats needs: concept, race, class levels, CR, role.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Stats stage
 */
function reduceStatsInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'basic_info', ['concept', 'race', 'size', 'alignment']),
    ...getFields(results, 'creator:_basic_info', ['concept', 'race', 'size', 'alignment']),
    ...getFields(results, 'core_details', ['class_levels', 'challenge_rating', 'role', 'level']),
    ...getFields(results, 'creator:_core_details', ['class_levels', 'challenge_rating', 'role', 'level']),
  };
}

/**
 * Reduces stage inputs for the Character Build stage.
 * Build needs: final stats, class levels, race, role.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Character Build stage
 */
function reduceCharacterBuildInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'stats', ['ability_scores', 'proficiency_bonus', 'speed']),
    ...getFields(results, 'creator:_stats', ['ability_scores', 'proficiency_bonus', 'speed']),
    ...getFields(results, 'core_details', ['class_levels', 'role', 'level']),
    ...getFields(results, 'creator:_core_details', ['class_levels', 'role', 'level']),
    ...getFields(results, 'basic_info', ['race', 'background']),
    ...getFields(results, 'creator:_basic_info', ['race', 'background']),
  };
}

/**
 * Reduces stage inputs for the Combat stage.
 * Combat needs: stats, proficiencies, class features, role.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Combat stage
 */
function reduceCombatInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'stats', ['ability_scores', 'proficiency_bonus', 'armor_class', 'hit_points']),
    ...getFields(results, 'creator:_stats', ['ability_scores', 'proficiency_bonus', 'armor_class', 'hit_points']),
    ...getFields(results, 'character_build', ['class_features', 'fighting_styles', 'feats']),
    ...getFields(results, 'creator:_character_build', ['class_features', 'fighting_styles', 'feats']),
    ...getFields(results, 'core_details', ['role', 'class_levels']),
    ...getFields(results, 'creator:_core_details', ['role', 'class_levels']),
  };
}

/**
 * Reduces stage inputs for the Equipment stage.
 * Equipment needs: proficiencies, class levels, role, environment, ability scores.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Equipment stage
 */
function reduceEquipmentInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'character_build', ['skill_proficiencies', 'fighting_styles']),
    ...getFields(results, 'creator:_character_build', ['skill_proficiencies', 'fighting_styles']),
    ...getFields(results, 'stats', ['ability_scores', 'proficiency_bonus']),
    ...getFields(results, 'creator:_stats', ['ability_scores', 'proficiency_bonus']),
    ...getFields(results, 'core_details', ['class_levels', 'role', 'level']),
    ...getFields(results, 'creator:_core_details', ['class_levels', 'role', 'level']),
    ...getFields(results, 'basic_info', ['environment', 'background']),
    ...getFields(results, 'creator:_basic_info', ['environment', 'background']),
  };
}

/**
 * Reduces stage inputs for the Spellcasting stage.
 * Spellcasting needs: class levels, ability scores, spellcasting ability.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Spellcasting stage
 */
function reduceSpellcastingInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'basic_info', ['name', 'species', 'race', 'alignment', 'background', 'class_levels', 'level']),
    ...getFields(results, 'creator:_basic_info', ['name', 'species', 'race', 'alignment', 'background', 'class_levels', 'level']),
    ...getFields(results, 'core_details', ['class_levels', 'level']),
    ...getFields(results, 'creator:_core_details', ['class_levels', 'level']),
    ...getFields(results, 'stats', ['ability_scores', 'proficiency_bonus']),
    ...getFields(results, 'creator:_stats', ['ability_scores', 'proficiency_bonus']),
    ...getFields(results, 'character_build', ['class_features', 'subclass_features', 'racial_features', 'feats']),
    ...getFields(results, 'creator:_character_build', ['class_features', 'subclass_features', 'racial_features', 'feats']),
  };
}

/**
 * Reduces stage inputs for the Legendary stage.
 * Legendary needs: CR, role, abilities, actions.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Legendary stage
 */
function reduceLegendaryInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'core_details', ['challenge_rating', 'role']),
    ...getFields(results, 'creator:_core_details', ['challenge_rating', 'role']),
    ...getFields(results, 'combat', ['actions', 'bonus_actions', 'reactions']),
    ...getFields(results, 'creator:_combat', ['actions', 'bonus_actions', 'reactions']),
    ...getFields(results, 'character_build', ['abilities']),
    ...getFields(results, 'creator:_character_build', ['abilities']),
  };
}

/**
 * Reduces stage inputs for the Relationships stage.
 * Relationships needs: name, race, background, personality, alignment.
 *
 * @param results - Prior stage results
 * @returns Reduced inputs for Relationships stage
 */
function reduceRelationshipsInputs(results: StageResults): Record<string, unknown> {
  return {
    ...getFields(results, 'basic_info', ['name', 'race', 'background', 'alignment']),
    ...getFields(results, 'creator:_basic_info', ['name', 'race', 'background', 'alignment']),
    ...getFields(results, 'core_details', ['personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'hooks']),
    ...getFields(results, 'creator:_core_details', ['personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'hooks']),
  };
}

/**
 * Stage input reducer map.
 * Maps stage names to their reducer functions.
 */
const STAGE_REDUCERS: Record<string, (results: StageResults) => Record<string, unknown>> = {
  // NPC Creator stages
  'basic_info': reduceBasicInfoInputs,
  'creator:_basic_info': reduceBasicInfoInputs,
  'basicInfo': reduceBasicInfoInputs,
  'core_details': reduceCoreDetailsInputs,
  'creator:_core_details': reduceCoreDetailsInputs,
  'coreDetails': reduceCoreDetailsInputs,
  'stats': reduceStatsInputs,
  'creator:_stats': reduceStatsInputs,
  'character_build': reduceCharacterBuildInputs,
  'creator:_character_build': reduceCharacterBuildInputs,
  'combat': reduceCombatInputs,
  'creator:_combat': reduceCombatInputs,
  'equipment': reduceEquipmentInputs,
  'creator:_equipment': reduceEquipmentInputs,
  'spellcasting': reduceSpellcastingInputs,
  'creator:_spellcasting': reduceSpellcastingInputs,
  'legendary': reduceLegendaryInputs,
  'creator:_legendary': reduceLegendaryInputs,
  'relationships': reduceRelationshipsInputs,
  'creator:_relationships': reduceRelationshipsInputs,
};

/**
 * Reduces stage inputs based on stage name.
 * Extracts only the fields needed by the current stage from prior outputs.
 *
 * @param stageName - Current stage name (e.g., 'stats', 'character_build')
 * @param priorResults - Results from all prior stages
 * @returns Reduced inputs object containing only needed fields
 *
 * @example
 * ```typescript
 * const priorResults = {
 *   basic_info: { name: 'Thyra', race: 'Aasimar', concept: 'Paladin', ... },
 *   core_details: { class_levels: [{class: 'Paladin', level: 11}], role: 'Defender', ... },
 *   // ... 50+ other fields
 * };
 *
 * const statsInputs = reduceStageInputs('stats', priorResults);
 * // Returns only: { concept: 'Paladin', race: 'Aasimar', class_levels: [...], role: 'Defender' }
 * // ~200 chars instead of 2000+
 * ```
 */
export function reduceStageInputs(stageName: string, priorResults: StageResults): Record<string, unknown> {
  // Normalize stage name to lowercase with underscores
  const normalizedStageName = stageName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/\s+/g, '_');

  // Try exact match first
  const reducer = STAGE_REDUCERS[normalizedStageName];
  if (reducer) {
    return reducer(priorResults);
  }

  // Try with 'creator:_' prefix (for NPC Creator stages)
  const prefixedName = `creator:_${normalizedStageName}`;
  const prefixedReducer = STAGE_REDUCERS[prefixedName];
  if (prefixedReducer) {
    return prefixedReducer(priorResults);
  }

  // No specific reducer found - return empty object
  // This is safe because must-have components will still include the stage contract
  console.warn(`[stageInputReducer] No reducer found for stage: ${stageName}. Returning empty inputs.`);
  return {};
}

/**
 * Estimates the size savings from using reduced inputs vs full prior outputs.
 *
 * @param stageName - Current stage name
 * @param priorResults - Results from all prior stages
 * @returns Object with original size, reduced size, and savings percentage
 */
export function estimateSizeSavings(
  stageName: string,
  priorResults: StageResults
): { originalSize: number; reducedSize: number; savingsPercent: number } {
  const fullSize = JSON.stringify(priorResults).length;
  const reducedInputs = reduceStageInputs(stageName, priorResults);
  const reducedSize = JSON.stringify(reducedInputs).length;
  const savingsPercent = fullSize > 0 ? ((fullSize - reducedSize) / fullSize) * 100 : 0;

  return {
    originalSize: fullSize,
    reducedSize,
    savingsPercent,
  };
}
