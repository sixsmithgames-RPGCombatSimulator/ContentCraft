import type { StageContract as SharedStageContract } from './workflowTypes';

export type WorkflowStageKey =
  | 'purpose'
  | 'keyword_extractor'
  | 'planner'
  | 'basic_info'
  | 'core_details'
  | 'stats'
  | 'character_build'
  | 'character_build_feature_inventory'
  | 'character_build_feature_enrichment'
  | 'combat'
  | 'spellcasting'
  | 'legendary'
  | 'relationships'
  | 'equipment';

export type WorkflowStageContractKey = Exclude<WorkflowStageKey, 'purpose'>;

export type LegacyStageContractKey =
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

export type NpcPromptContractKey = Exclude<
  WorkflowStageContractKey,
  'keyword_extractor' | 'planner' | 'character_build_feature_inventory' | 'character_build_feature_enrichment'
>;

export interface WorkflowStageContract extends SharedStageContract {}

export interface WorkflowStageDefinition {
  key: WorkflowStageKey;
  displayName: string;
  aliases: readonly string[];
  contentTypes: readonly string[];
  manualModeSupported: boolean;
  contract?: WorkflowStageContract;
  legacyContractKey?: LegacyStageContractKey;
  promptContractKey?: NpcPromptContractKey;
}

export const NPC_SPELLCASTING_OUTPUT_ALLOWED_KEYS = [
  'spellcasting_ability',
  'spell_save_dc',
  'spell_attack_bonus',
  'spell_slots',
  'prepared_spells',
  'always_prepared_spells',
  'innate_spells',
  'spells_known',
  'spellcasting_focus',
] as const;

export const NPC_SPELLCASTING_PROXY_ALLOWED_KEYS = [
  ...NPC_SPELLCASTING_OUTPUT_ALLOWED_KEYS,
  'class_levels',
  'ability_scores',
  'proficiency_bonus',
] as const;

const NON_EMPTY_ARRAY_RULE = { policy: 'non_empty_if_present', type: 'array' } as const;
const MAY_BE_EMPTY_ARRAY_RULE = { policy: 'may_be_empty', type: 'array' } as const;

const WORKFLOW_STAGE_DEFINITIONS: Record<WorkflowStageKey, WorkflowStageDefinition> = {
  purpose: {
    key: 'purpose',
    displayName: 'Purpose',
    aliases: ['purpose'],
    contentTypes: ['*'],
    manualModeSupported: true,
  },
  keyword_extractor: {
    key: 'keyword_extractor',
    displayName: 'Keyword Extractor',
    aliases: ['keywordExtractor', 'keyword_extractor'],
    contentTypes: ['*'],
    manualModeSupported: true,
    legacyContractKey: 'keywordExtractor',
    contract: {
      outputAllowedKeys: ['keywords'],
      requiredKeys: ['keywords'],
      proxyAllowedKeys: ['keywords'],
      fieldRules: {
        keywords: NON_EMPTY_ARRAY_RULE,
      },
    },
  },
  planner: {
    key: 'planner',
    displayName: 'Planner',
    aliases: ['planner'],
    contentTypes: ['*'],
    manualModeSupported: true,
    legacyContractKey: 'planner',
    contract: {
      outputAllowedKeys: ['deliverable', 'retrieval_hints', 'proposals', 'assumptions', 'flags_echo'],
      requiredKeys: ['deliverable', 'retrieval_hints', 'proposals', 'flags_echo'],
      proxyAllowedKeys: ['deliverable', 'retrieval_hints', 'proposals', 'assumptions', 'flags_echo'],
      fieldRules: {
        proposals: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  basic_info: {
    key: 'basic_info',
    displayName: 'Creator: Basic Info',
    aliases: ['basicInfo', 'basic_info', 'creator:_basic_info'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'basicInfo',
    promptContractKey: 'basic_info',
    contract: {
      outputAllowedKeys: ['name', 'title', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation'],
      requiredKeys: ['name', 'description', 'appearance', 'background', 'species', 'alignment', 'class_levels'],
      proxyAllowedKeys: ['name', 'title', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation'],
      zeroRawGuard: true,
    },
  },
  core_details: {
    key: 'core_details',
    displayName: 'Creator: Core Details',
    aliases: ['coreDetails', 'core_details', 'creator:_core_details'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'coreDetails',
    promptContractKey: 'core_details',
    contract: {
      outputAllowedKeys: ['personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'fears', 'quirks', 'voice_mannerisms', 'hooks'],
      requiredKeys: ['personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'fears', 'quirks', 'voice_mannerisms', 'hooks'],
      proxyAllowedKeys: ['personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'fears', 'quirks', 'voice_mannerisms', 'hooks'],
      zeroRawGuard: true,
      fieldRules: {
        personality_traits: NON_EMPTY_ARRAY_RULE,
        ideals: NON_EMPTY_ARRAY_RULE,
        bonds: NON_EMPTY_ARRAY_RULE,
        flaws: NON_EMPTY_ARRAY_RULE,
        goals: NON_EMPTY_ARRAY_RULE,
        fears: NON_EMPTY_ARRAY_RULE,
        quirks: NON_EMPTY_ARRAY_RULE,
        voice_mannerisms: NON_EMPTY_ARRAY_RULE,
        hooks: NON_EMPTY_ARRAY_RULE,
      },
    },
  },
  stats: {
    key: 'stats',
    displayName: 'Creator: Stats',
    aliases: ['stats', 'creator:_stats'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'stats',
    promptContractKey: 'stats',
    contract: {
      outputAllowedKeys: ['size', 'ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'hit_dice', 'senses'],
      requiredKeys: ['size', 'ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'hit_dice', 'senses'],
      proxyAllowedKeys: ['size', 'ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'hit_dice', 'senses'],
    },
  },
  character_build: {
    key: 'character_build',
    displayName: 'Creator: Character Build',
    aliases: ['characterBuild', 'character_build', 'creator:_character_build'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'characterBuild',
    promptContractKey: 'character_build',
    contract: {
      outputAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      requiredKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      proxyAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      fieldRules: {
        class_features: MAY_BE_EMPTY_ARRAY_RULE,
        subclass_features: MAY_BE_EMPTY_ARRAY_RULE,
        racial_features: MAY_BE_EMPTY_ARRAY_RULE,
        feats: MAY_BE_EMPTY_ARRAY_RULE,
        fighting_styles: MAY_BE_EMPTY_ARRAY_RULE,
        skill_proficiencies: MAY_BE_EMPTY_ARRAY_RULE,
        saving_throws: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  character_build_feature_inventory: {
    key: 'character_build_feature_inventory',
    displayName: 'Creator: Character Build Inventory',
    aliases: ['character_build_feature_inventory', 'characterBuildFeatureInventory'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    contract: {
      outputAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      requiredKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      proxyAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
      fieldRules: {
        class_features: MAY_BE_EMPTY_ARRAY_RULE,
        subclass_features: MAY_BE_EMPTY_ARRAY_RULE,
        racial_features: MAY_BE_EMPTY_ARRAY_RULE,
        feats: MAY_BE_EMPTY_ARRAY_RULE,
        fighting_styles: MAY_BE_EMPTY_ARRAY_RULE,
        skill_proficiencies: MAY_BE_EMPTY_ARRAY_RULE,
        saving_throws: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  character_build_feature_enrichment: {
    key: 'character_build_feature_enrichment',
    displayName: 'Creator: Character Build Enrichment',
    aliases: ['character_build_feature_enrichment', 'characterBuildFeatureEnrichment'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    contract: {
      outputAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles'],
      requiredKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles'],
      proxyAllowedKeys: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles'],
      fieldRules: {
        class_features: MAY_BE_EMPTY_ARRAY_RULE,
        subclass_features: MAY_BE_EMPTY_ARRAY_RULE,
        racial_features: MAY_BE_EMPTY_ARRAY_RULE,
        feats: MAY_BE_EMPTY_ARRAY_RULE,
        fighting_styles: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  combat: {
    key: 'combat',
    displayName: 'Creator: Combat',
    aliases: ['combat', 'creator:_combat'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'combat',
    promptContractKey: 'combat',
    contract: {
      outputAllowedKeys: ['actions', 'bonus_actions', 'reactions', 'multiattack', 'special_attacks'],
      requiredKeys: ['actions', 'bonus_actions', 'reactions'],
      proxyAllowedKeys: ['actions', 'bonus_actions', 'reactions', 'multiattack', 'special_attacks', 'tactics', 'combat_tactics'],
      fieldRules: {
        actions: NON_EMPTY_ARRAY_RULE,
        bonus_actions: MAY_BE_EMPTY_ARRAY_RULE,
        reactions: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  spellcasting: {
    key: 'spellcasting',
    displayName: 'Creator: Spellcasting',
    aliases: ['spellcasting', 'creator:_spellcasting'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'spellcasting',
    promptContractKey: 'spellcasting',
    contract: {
      outputAllowedKeys: [...NPC_SPELLCASTING_OUTPUT_ALLOWED_KEYS],
      requiredKeys: ['spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus'],
      proxyAllowedKeys: [...NPC_SPELLCASTING_PROXY_ALLOWED_KEYS],
      fieldRules: {
        prepared_spells: { policy: 'present_if_applicable', type: 'object' },
        always_prepared_spells: { policy: 'present_if_applicable', type: 'object' },
        innate_spells: { policy: 'present_if_applicable', type: 'object' },
        spells_known: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  legendary: {
    key: 'legendary',
    displayName: 'Creator: Legendary',
    aliases: ['legendary', 'creator:_legendary'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'legendary',
    promptContractKey: 'legendary',
    contract: {
      outputAllowedKeys: ['legendary_actions', 'legendary_resistance', 'lair_actions', 'regional_effects'],
      requiredKeys: [],
      proxyAllowedKeys: ['legendary_actions', 'legendary_resistance', 'lair_actions', 'regional_effects'],
    },
  },
  relationships: {
    key: 'relationships',
    displayName: 'Creator: Relationships',
    aliases: ['relationships', 'creator:_relationships'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'relationships',
    promptContractKey: 'relationships',
    contract: {
      outputAllowedKeys: ['allies', 'enemies', 'organizations', 'family', 'contacts'],
      requiredKeys: ['allies', 'enemies', 'organizations'],
      proxyAllowedKeys: ['allies', 'enemies', 'foes', 'organizations', 'family', 'contacts'],
      fieldRules: {
        allies: MAY_BE_EMPTY_ARRAY_RULE,
        enemies: MAY_BE_EMPTY_ARRAY_RULE,
        organizations: MAY_BE_EMPTY_ARRAY_RULE,
        family: MAY_BE_EMPTY_ARRAY_RULE,
        contacts: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  equipment: {
    key: 'equipment',
    displayName: 'Creator: Equipment',
    aliases: ['equipment', 'creator:_equipment'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    legacyContractKey: 'equipment',
    promptContractKey: 'equipment',
    contract: {
      outputAllowedKeys: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
      requiredKeys: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear'],
      proxyAllowedKeys: ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear', 'equipment'],
      fieldRules: {
        weapons: MAY_BE_EMPTY_ARRAY_RULE,
        armor_and_shields: MAY_BE_EMPTY_ARRAY_RULE,
        wondrous_items: MAY_BE_EMPTY_ARRAY_RULE,
        consumables: MAY_BE_EMPTY_ARRAY_RULE,
        other_gear: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
};

const normalizeAlias = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const stageAliasLookup = new Map<string, WorkflowStageKey>();

for (const definition of Object.values(WORKFLOW_STAGE_DEFINITIONS)) {
  stageAliasLookup.set(normalizeAlias(definition.key), definition.key);
  stageAliasLookup.set(normalizeAlias(definition.displayName), definition.key);
  for (const alias of definition.aliases) {
    stageAliasLookup.set(normalizeAlias(alias), definition.key);
  }
}

export const WORKFLOW_STAGES = WORKFLOW_STAGE_DEFINITIONS;

export function normalizeWorkflowStageId(stageIdOrName: string): WorkflowStageKey | null {
  if (typeof stageIdOrName !== 'string' || stageIdOrName.trim().length === 0) {
    return null;
  }
  return stageAliasLookup.get(normalizeAlias(stageIdOrName)) ?? null;
}

export function getWorkflowStageDefinition(stageIdOrName: string): WorkflowStageDefinition | null {
  const stageKey = normalizeWorkflowStageId(stageIdOrName);
  return stageKey ? WORKFLOW_STAGES[stageKey] : null;
}

export function getWorkflowStageOutputAllowedKeys(stageIdOrName: string): readonly string[] | null {
  return getWorkflowStageDefinition(stageIdOrName)?.contract?.outputAllowedKeys ?? null;
}

export function getWorkflowStageProxyAllowedKeys(stageIdOrName: string): readonly string[] | null {
  const contract = getWorkflowStageDefinition(stageIdOrName)?.contract;
  return contract?.proxyAllowedKeys ?? contract?.outputAllowedKeys ?? null;
}

export function getWorkflowStageRequiredKeys(stageIdOrName: string): readonly string[] | null {
  return getWorkflowStageDefinition(stageIdOrName)?.contract?.requiredKeys ?? null;
}

export function getLegacyStageContractKey(stageIdOrName: string): LegacyStageContractKey | null {
  return getWorkflowStageDefinition(stageIdOrName)?.legacyContractKey ?? null;
}

export function getNpcPromptContractKey(stageIdOrName: string): NpcPromptContractKey | null {
  return getWorkflowStageDefinition(stageIdOrName)?.promptContractKey ?? null;
}

export function isWorkflowStageManualModeSupported(stageIdOrName: string): boolean {
  return getWorkflowStageDefinition(stageIdOrName)?.manualModeSupported ?? false;
}

export function isWorkflowStageCriticalZeroGuard(stageIdOrName: string): boolean {
  return Boolean(getWorkflowStageDefinition(stageIdOrName)?.contract?.zeroRawGuard);
}
