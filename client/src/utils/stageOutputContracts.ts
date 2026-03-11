import {
  getLegacyStageContractKey,
  getWorkflowStageDefinition,
  type LegacyStageContractKey,
} from '../../../src/shared/generation/workflowStageCatalog';

// Local utility types
export type JsonRecord = Record<string, unknown>;
export type StageKey = LegacyStageContractKey;

export interface StageContract {
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
}

const STAGE_KEY_ORDER: readonly StageKey[] = [
  'keywordExtractor',
  'planner',
  'basicInfo',
  'coreDetails',
  'stats',
  'characterBuild',
  'combat',
  'spellcasting',
  'legendary',
  'relationships',
  'equipment',
];

export const STAGE_OUTPUT_CONTRACTS: Record<StageKey, StageContract> = Object.fromEntries(
  STAGE_KEY_ORDER.map((stageKey) => {
    const definition = getWorkflowStageDefinition(stageKey);
    if (!definition?.contract) {
      throw new Error(`Missing shared workflow contract for stage ${stageKey}`);
    }

    return [
      stageKey,
      {
        allowedKeys: definition.contract.outputAllowedKeys,
        requiredKeys: definition.contract.requiredKeys,
      },
    ];
  }),
) as Record<StageKey, StageContract>;

export function resolveStageContractKey(stageIdOrName: string): StageKey | null {
  return getLegacyStageContractKey(stageIdOrName);
}

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

  const arrayFields: Partial<Record<StageKey, readonly string[]>> = {
    keywordExtractor: ['keywords'],
    coreDetails: contract.requiredKeys,
    characterBuild: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
    combat: ['actions', 'bonus_actions', 'reactions'],
    relationships: ['allies', 'enemies', 'organizations', 'family', 'contacts'],
    equipment: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
  };

  const nonEmptyArrayFields: Partial<Record<StageKey, readonly string[]>> = {
    keywordExtractor: ['keywords'],
    coreDetails: contract.requiredKeys,
    combat: ['actions'],
  };

  for (const field of arrayFields[stage] ?? []) {
    const value = obj[field];
    if (!Array.isArray(value)) {
      return { ok: false, error: `Field ${field} must be an array.` };
    }
  }

  for (const field of nonEmptyArrayFields[stage] ?? []) {
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
