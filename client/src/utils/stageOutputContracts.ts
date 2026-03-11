// Local utility types
export type JsonRecord = Record<string, unknown>;

export type StageKey =
  | 'keywordExtractor'
  | 'planner'
  | 'basicInfo'
  | 'coreDetails'
  | 'stats'
  | 'characterBuild'
  | 'combat'
  | 'spellcasting'
  | 'legendary'
  | 'relationships'
  | 'equipment';

export interface StageContract {
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
}

export const STAGE_OUTPUT_CONTRACTS: Record<StageKey, StageContract> = {
  keywordExtractor: { allowedKeys: ['keywords'], requiredKeys: ['keywords'] },
  planner: {
    allowedKeys: ['deliverable', 'retrieval_hints', 'proposals', 'assumptions', 'flags_echo'],
    requiredKeys: ['deliverable', 'retrieval_hints', 'proposals', 'flags_echo'],
  },
  basicInfo: {
    allowedKeys: ['name', 'title', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation'],
    requiredKeys: ['name', 'description', 'appearance', 'background', 'species', 'alignment', 'class_levels'],
  },
  coreDetails: {
    allowedKeys: [
      'personality_traits',
      'ideals',
      'bonds',
      'flaws',
      'goals',
      'fears',
      'quirks',
      'voice_mannerisms',
      'hooks',
    ],
    requiredKeys: [
      'personality_traits',
      'ideals',
      'bonds',
      'flaws',
      'goals',
      'fears',
      'quirks',
      'voice_mannerisms',
      'hooks',
    ],
  },
  stats: {
    allowedKeys: ['ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'senses'],
    requiredKeys: ['ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'senses'],
  },
  characterBuild: {
    allowedKeys: [
      'class_features',
      'subclass_features',
      'racial_features',
      'feats',
      'fighting_styles',
      'skill_proficiencies',
      'saving_throws',
    ],
    requiredKeys: [
      'class_features',
      'subclass_features',
      'racial_features',
      'feats',
      'fighting_styles',
      'skill_proficiencies',
      'saving_throws',
    ],
  },
  combat: {
    allowedKeys: ['actions', 'bonus_actions', 'reactions', 'multiattack', 'special_attacks'],
    requiredKeys: ['actions', 'bonus_actions', 'reactions'],
  },
  spellcasting: {
    allowedKeys: [
      'spellcasting_ability',
      'spell_save_dc',
      'spell_attack_bonus',
      'spell_slots',
      'prepared_spells',
      'spellcasting_focus',
      'spells_known',
      'always_prepared_spells',
      'innate_spells',
    ],
    requiredKeys: ['spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus'],
  },
  legendary: {
    allowedKeys: ['legendary_actions', 'legendary_resistance', 'lair_actions', 'regional_effects'],
    requiredKeys: [],
  },
  relationships: {
    allowedKeys: ['allies', 'enemies', 'organizations', 'family', 'contacts'],
    requiredKeys: ['allies', 'enemies', 'organizations'],
  },
  equipment: {
    allowedKeys: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
    requiredKeys: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
  },
};

export function pruneToAllowedKeys<T extends Record<string, unknown>>(obj: T, allowedKeys: readonly string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return out;
}

export function validateStageOutput(stage: StageKey, obj: JsonRecord): { ok: boolean; error?: string } {
  const contract = STAGE_OUTPUT_CONTRACTS[stage];
  const missing = contract.requiredKeys.filter((key) => obj[key] === undefined || obj[key] === null);

  if (stage === 'basicInfo') {
    const hasSpecies = typeof obj.species === 'string' && obj.species.trim().length > 0;
    const hasRace = typeof obj.race === 'string' && obj.race.trim().length > 0;
    const filteredMissing = missing.filter((key) => key !== 'species');

    if (!hasSpecies && !hasRace) {
      filteredMissing.push('species or race');
    }

    if (filteredMissing.length > 0) {
      return { ok: false, error: `Missing required keys: ${filteredMissing.join(', ')}` };
    }
  } else if (missing.length > 0) {
    return { ok: false, error: `Missing required keys: ${missing.join(', ')}` };
  }

  const requiredArrayFields: Partial<Record<StageKey, readonly string[]>> = {
    keywordExtractor: ['keywords'],
    coreDetails: contract.requiredKeys,
    characterBuild: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
    combat: ['actions', 'bonus_actions', 'reactions'],
    relationships: ['allies', 'enemies', 'organizations'],
    equipment: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
  };

  for (const field of requiredArrayFields[stage] ?? []) {
    const value = obj[field];
    if (!Array.isArray(value) || value.length === 0) {
      return { ok: false, error: `Field ${field} must be a non-empty array.` };
    }
  }

  if (stage === 'planner') {
    const retrievalHints = obj.retrieval_hints;
    if (typeof retrievalHints !== 'object' || retrievalHints === null || Array.isArray(retrievalHints)) {
      return { ok: false, error: 'Field retrieval_hints must be an object.' };
    }
    if (!Array.isArray(obj.proposals)) {
      return { ok: false, error: 'Field proposals must be an array.' };
    }
  }

  return { ok: true };
}
