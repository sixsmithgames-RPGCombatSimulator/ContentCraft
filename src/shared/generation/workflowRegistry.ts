import type {
  RetrievalGroundingStatus,
  RulesPack,
  StageDefinition,
  StageRetryPolicy,
  WorkflowContentType,
  WorkflowDefinition,
} from './workflowTypes';

const DEFAULT_RETRY_POLICY: StageRetryPolicy = {
  autoRetryable: true,
  maxAttempts: 2,
  cooldownMs: 5000,
  retryOnStructuralFailure: false,
};

const NON_EMPTY_ARRAY_RULE = { policy: 'non_empty_if_present', type: 'array' } as const;
const MAY_BE_EMPTY_ARRAY_RULE = { policy: 'may_be_empty', type: 'array' } as const;

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

const STAGE_DEFINITIONS: Record<string, StageDefinition> = {
  purpose: {
    key: 'purpose',
    label: 'Purpose',
    aliases: ['purpose'],
    contentTypes: ['location', 'nonfiction', 'outline', 'chapter', 'memoir', 'journal_entry', 'diet_log_entry', 'other_writing', 'scene', 'adventure', 'unknown'],
    manualModeSupported: true,
    retrievalPolicy: 'none',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['content_type', 'generation_mode', 'game_system', 'detail_level', 'special_requirements', 'interpretation', 'deliverable', 'keywords', 'medium', 'audience', 'goal', 'key_topics', 'tone', 'proposals'],
      requiredKeys: [],
      proxyAllowedKeys: ['content_type', 'generation_mode', 'game_system', 'detail_level', 'special_requirements', 'interpretation', 'deliverable', 'keywords', 'medium', 'audience', 'goal', 'key_topics', 'tone', 'proposals'],
      fieldRules: {
        special_requirements: MAY_BE_EMPTY_ARRAY_RULE,
        keywords: MAY_BE_EMPTY_ARRAY_RULE,
        key_topics: MAY_BE_EMPTY_ARRAY_RULE,
        proposals: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  'outline_&_structure': {
    key: 'outline_&_structure',
    label: 'Outline & Structure',
    aliases: ['outline_&_structure', 'outlineAndStructure', 'Outline & Structure'],
    contentTypes: ['nonfiction', 'outline', 'chapter', 'memoir', 'journal_entry', 'diet_log_entry', 'other_writing'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  draft: {
    key: 'draft',
    label: 'Draft',
    aliases: ['draft', 'Draft'],
    contentTypes: ['nonfiction', 'outline', 'chapter', 'memoir', 'journal_entry', 'diet_log_entry', 'other_writing'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'editor_&_style': {
    key: 'editor_&_style',
    label: 'Editor & Style',
    aliases: ['editor_&_style', 'editorAndStyle', 'Editor & Style'],
    contentTypes: ['nonfiction', 'outline', 'chapter', 'memoir', 'journal_entry', 'diet_log_entry', 'other_writing'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  keyword_extractor: {
    key: 'keyword_extractor',
    label: 'Keyword Extractor',
    aliases: ['keyword_extractor', 'keywordExtractor', 'Keyword Extractor'],
    contentTypes: ['npc', 'unknown'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
    label: 'Planner',
    aliases: ['planner', 'Planner'],
    contentTypes: ['npc', 'unknown'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['deliverable', 'story_clock', 'threads', 'retrieval_hints', 'proposals', 'allow_invention', 'rule_base', 'tone', 'mode', 'difficulty', 'realism', 'flags_echo'],
      requiredKeys: ['deliverable', 'retrieval_hints', 'proposals'],
      proxyAllowedKeys: ['deliverable', 'story_clock', 'threads', 'retrieval_hints', 'proposals', 'allow_invention', 'rule_base', 'tone', 'mode', 'difficulty', 'realism', 'flags_echo'],
      fieldRules: {
        proposals: MAY_BE_EMPTY_ARRAY_RULE,
      },
    },
  },
  creator: {
    key: 'creator',
    label: 'Creator',
    aliases: ['creator', 'Creator'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  fact_checker: {
    key: 'fact_checker',
    label: 'Fact Checker',
    aliases: ['fact_checker', 'factChecker', 'Fact Checker'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['conflicts', 'ambiguities', 'unassociated', 'revision_prompt', 'user_questions', 'summary'],
      requiredKeys: ['conflicts', 'ambiguities', 'unassociated', 'revision_prompt', 'user_questions', 'summary'],
      proxyAllowedKeys: ['conflicts', 'ambiguities', 'unassociated', 'revision_prompt', 'user_questions', 'summary'],
      fieldRules: {
        conflicts: MAY_BE_EMPTY_ARRAY_RULE,
        ambiguities: MAY_BE_EMPTY_ARRAY_RULE,
        unassociated: MAY_BE_EMPTY_ARRAY_RULE,
        user_questions: MAY_BE_EMPTY_ARRAY_RULE,
        revision_prompt: { policy: 'required', type: 'string' },
        summary: { policy: 'required', type: 'string' },
      },
    },
  },
  stylist: {
    key: 'stylist',
    label: 'Stylist',
    aliases: ['stylist', 'Stylist'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  canon_validator: {
    key: 'canon_validator',
    label: 'Canon Validator',
    aliases: ['canon_validator', 'canonValidator', 'Canon Validator'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['conflicts', 'canon_alignment_score', 'validation_notes'],
      requiredKeys: ['conflicts', 'canon_alignment_score', 'validation_notes'],
      proxyAllowedKeys: ['conflicts', 'canon_alignment_score', 'validation_notes'],
      fieldRules: {
        conflicts: MAY_BE_EMPTY_ARRAY_RULE,
        canon_alignment_score: { policy: 'required', type: 'number' },
        validation_notes: { policy: 'required', type: 'string' },
      },
    },
  },
  physics_validator: {
    key: 'physics_validator',
    label: 'Physics Validator',
    aliases: ['physics_validator', 'physicsValidator', 'Physics Validator'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['physics_issues', 'logic_score', 'balance_notes'],
      requiredKeys: ['physics_issues', 'logic_score', 'balance_notes'],
      proxyAllowedKeys: ['physics_issues', 'logic_score', 'balance_notes'],
      fieldRules: {
        physics_issues: MAY_BE_EMPTY_ARRAY_RULE,
        logic_score: { policy: 'required', type: 'number' },
        balance_notes: { policy: 'required', type: 'string' },
      },
    },
  },
  finalizer: {
    key: 'finalizer',
    label: 'Finalizer',
    aliases: ['finalizer', 'Finalizer'],
    contentTypes: ['unknown', 'adventure', 'scene', 'homebrew', 'nonfiction', 'outline', 'chapter', 'memoir', 'journal_entry', 'diet_log_entry', 'other_writing'],
    manualModeSupported: true,
    retrievalPolicy: 'none',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  basic_info: {
    key: 'basic_info',
    label: 'Creator: Basic Info',
    aliases: ['basic_info', 'basicInfo', 'Creator: Basic Info'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['name', 'title', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation'],
      requiredKeys: ['name', 'description', 'appearance', 'background', 'species', 'alignment', 'class_levels'],
      proxyAllowedKeys: ['name', 'title', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation'],
      zeroRawGuard: true,
    },
  },
  core_details: {
    key: 'core_details',
    label: 'Creator: Core Details',
    aliases: ['core_details', 'coreDetails', 'Creator: Core Details'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
    label: 'Creator: Stats',
    aliases: ['stats', 'Creator: Stats'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'none',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'senses'],
      requiredKeys: ['ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'senses'],
      proxyAllowedKeys: ['ability_scores', 'proficiency_bonus', 'speed', 'armor_class', 'hit_points', 'senses'],
    },
  },
  character_build: {
    key: 'character_build',
    label: 'Creator: Character Build',
    aliases: ['character_build', 'characterBuild', 'Creator: Character Build'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
  combat: {
    key: 'combat',
    label: 'Creator: Combat',
    aliases: ['combat', 'Creator: Combat'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
    label: 'Creator: Spellcasting',
    aliases: ['spellcasting', 'Creator: Spellcasting'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
    label: 'Creator: Legendary',
    aliases: ['legendary', 'Creator: Legendary'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['legendary_actions', 'legendary_resistance', 'lair_actions', 'regional_effects'],
      requiredKeys: [],
      proxyAllowedKeys: ['legendary_actions', 'legendary_resistance', 'lair_actions', 'regional_effects'],
    },
  },
  relationships: {
    key: 'relationships',
    label: 'Creator: Relationships',
    aliases: ['relationships', 'Creator: Relationships'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
    label: 'Creator: Equipment',
    aliases: ['equipment', 'Creator: Equipment'],
    contentTypes: ['npc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
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
  'monster.basic_info': {
    key: 'monster.basic_info',
    label: 'Basic Info',
    aliases: ['monster.basic_info', 'monster_basic_info', 'Basic Info'],
    contentTypes: ['monster'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['name', 'description', 'size', 'creature_type', 'subtype', 'alignment', 'challenge_rating', 'experience_points', 'location'],
      requiredKeys: ['name', 'description', 'size', 'creature_type', 'alignment', 'challenge_rating'],
      fieldRules: {},
    },
  },
  'monster.stats': {
    key: 'monster.stats',
    label: 'Stats & Defenses',
    aliases: ['monster.stats', 'monster_stats', 'Stats & Defenses'],
    contentTypes: ['monster'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: [
        'ability_scores',
        'armor_class',
        'hit_points',
        'hit_dice',
        'proficiency_bonus',
        'speed',
        'saving_throws',
        'skill_proficiencies',
        'damage_vulnerabilities',
        'damage_resistances',
        'damage_immunities',
        'condition_immunities',
        'senses',
        'languages',
      ],
      requiredKeys: ['ability_scores', 'armor_class', 'hit_points', 'proficiency_bonus'],
      fieldRules: {
        ability_scores: { policy: 'required', type: 'object' },
        speed: { policy: 'present_if_applicable', type: 'object' },
        saving_throws: { policy: 'may_be_empty', type: 'array' },
        skill_proficiencies: { policy: 'may_be_empty', type: 'array' },
        damage_vulnerabilities: { policy: 'may_be_empty', type: 'array' },
        damage_resistances: { policy: 'may_be_empty', type: 'array' },
        damage_immunities: { policy: 'may_be_empty', type: 'array' },
        condition_immunities: { policy: 'may_be_empty', type: 'array' },
        senses: { policy: 'may_be_empty', type: 'array' },
        languages: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'monster.combat': {
    key: 'monster.combat',
    label: 'Combat & Abilities',
    aliases: ['monster.combat', 'monster_combat', 'Combat & Abilities'],
    contentTypes: ['monster'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['abilities', 'actions', 'bonus_actions', 'reactions', 'tactics'],
      requiredKeys: ['abilities', 'actions'],
      fieldRules: {
        abilities: { policy: 'non_empty_if_present', type: 'array' },
        actions: { policy: 'non_empty_if_present', type: 'array' },
        bonus_actions: { policy: 'may_be_empty', type: 'array' },
        reactions: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'monster.legendary': {
    key: 'monster.legendary',
    label: 'Legendary & Lair',
    aliases: ['monster.legendary', 'monster_legendary', 'Legendary & Lair'],
    contentTypes: ['monster'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['legendary_actions', 'mythic_actions', 'lair_actions', 'regional_effects'],
      requiredKeys: [],
      fieldRules: {
        lair_actions: { policy: 'may_be_empty', type: 'array' },
        regional_effects: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'monster.lore': {
    key: 'monster.lore',
    label: 'Ecology & Lore',
    aliases: ['monster.lore', 'monster_lore', 'Ecology & Lore'],
    contentTypes: ['monster'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['ecology', 'lore', 'notes', 'sources'],
      requiredKeys: ['ecology', 'lore'],
      fieldRules: {
        notes: { policy: 'may_be_empty', type: 'array' },
        sources: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'item.concept': {
    key: 'item.concept',
    label: 'Creator: Concept',
    aliases: ['item.concept', 'concept', 'Creator: Concept'],
    contentTypes: ['item'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['name', 'item_type', 'item_subtype', 'rarity', 'attunement', 'description', 'appearance', 'weight', 'value'],
      requiredKeys: ['name', 'item_type', 'rarity', 'attunement', 'description', 'appearance'],
      fieldRules: {
        attunement: { policy: 'required', type: 'object' },
      },
    },
  },
  'item.mechanics': {
    key: 'item.mechanics',
    label: 'Creator: Mechanics',
    aliases: ['item.mechanics', 'mechanics', 'Creator: Mechanics'],
    contentTypes: ['item'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['properties', 'charges', 'spells', 'weapon_properties', 'armor_properties'],
      requiredKeys: ['properties'],
      fieldRules: {
        properties: { policy: 'non_empty_if_present', type: 'array' },
        spells: { policy: 'may_be_empty', type: 'array' },
        charges: { policy: 'present_if_applicable', type: 'object' },
        weapon_properties: { policy: 'present_if_applicable', type: 'object' },
        armor_properties: { policy: 'present_if_applicable', type: 'object' },
      },
    },
  },
  'item.lore': {
    key: 'item.lore',
    label: 'Creator: Lore',
    aliases: ['item.lore', 'lore', 'Creator: Lore'],
    contentTypes: ['item'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['history', 'creator', 'previous_owners', 'quirks', 'curse', 'sentience', 'campaign_hooks', 'notes'],
      requiredKeys: ['history', 'creator', 'campaign_hooks'],
      fieldRules: {
        previous_owners: { policy: 'may_be_empty', type: 'array' },
        quirks: { policy: 'may_be_empty', type: 'array' },
        campaign_hooks: { policy: 'non_empty_if_present', type: 'array' },
        notes: { policy: 'may_be_empty', type: 'array' },
        curse: { policy: 'present_if_applicable', type: 'object' },
        sentience: { policy: 'present_if_applicable', type: 'object' },
      },
    },
  },
  'encounter.concept': {
    key: 'encounter.concept',
    label: 'Creator: Concept',
    aliases: ['encounter.concept', 'concept', 'Creator: Concept'],
    contentTypes: ['encounter'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: [
        'title',
        'description',
        'encounter_type',
        'difficulty_tier',
        'party_level',
        'party_size',
        'xp_budget',
        'objectives',
        'failure_conditions',
        'location',
        'setting_context',
      ],
      requiredKeys: [
        'title',
        'description',
        'encounter_type',
        'difficulty_tier',
        'party_level',
        'party_size',
        'xp_budget',
        'objectives',
      ],
      fieldRules: {
        objectives: { policy: 'non_empty_if_present', type: 'array' },
        failure_conditions: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'encounter.enemies': {
    key: 'encounter.enemies',
    label: 'Creator: Enemies',
    aliases: ['encounter.enemies', 'enemies', 'Creator: Enemies'],
    contentTypes: ['encounter'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['monsters', 'npcs'],
      requiredKeys: ['monsters', 'npcs'],
      fieldRules: {
        monsters: { policy: 'may_be_empty', type: 'array' },
        npcs: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'encounter.terrain': {
    key: 'encounter.terrain',
    label: 'Creator: Terrain',
    aliases: ['encounter.terrain', 'terrain', 'Creator: Terrain'],
    contentTypes: ['encounter'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['terrain', 'hazards', 'traps'],
      requiredKeys: ['terrain'],
      fieldRules: {
        terrain: { policy: 'required', type: 'object' },
        hazards: { policy: 'may_be_empty', type: 'array' },
        traps: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'encounter.tactics': {
    key: 'encounter.tactics',
    label: 'Creator: Tactics',
    aliases: ['encounter.tactics', 'tactics', 'Creator: Tactics'],
    contentTypes: ['encounter'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['tactics', 'event_clock'],
      requiredKeys: ['tactics', 'event_clock'],
      fieldRules: {
        tactics: { policy: 'required', type: 'object' },
        event_clock: { policy: 'required', type: 'object' },
      },
    },
  },
  'encounter.rewards': {
    key: 'encounter.rewards',
    label: 'Creator: Rewards',
    aliases: ['encounter.rewards', 'rewards', 'Creator: Rewards'],
    contentTypes: ['encounter'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['treasure', 'consequences', 'scaling', 'notes'],
      requiredKeys: ['treasure', 'consequences', 'scaling'],
      fieldRules: {
        treasure: { policy: 'required', type: 'object' },
        consequences: { policy: 'required', type: 'object' },
        scaling: { policy: 'required', type: 'object' },
        notes: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'location.purpose': {
    key: 'location.purpose',
    label: 'Purpose',
    aliases: ['location.purpose', 'location_purpose', 'Purpose'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'location.foundation': {
    key: 'location.foundation',
    label: 'Foundation',
    aliases: ['location.foundation', 'location_foundation', 'Foundation'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'location.spaces': {
    key: 'location.spaces',
    label: 'Spaces',
    aliases: ['location.spaces', 'location_spaces', 'Spaces'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'location.details': {
    key: 'location.details',
    label: 'Details',
    aliases: ['location.details', 'location_details', 'Details'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'location.visual_map': {
    key: 'location.visual_map',
    label: 'Visual Map',
    aliases: ['location.visual_map', 'location_visual_map', 'Visual Map'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'none',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'location.accuracy_refinement': {
    key: 'location.accuracy_refinement',
    label: 'Accuracy Refinement',
    aliases: ['location.accuracy_refinement', 'location_accuracy', 'Accuracy Refinement'],
    contentTypes: ['location'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
  'story_arc.premise': {
    key: 'story_arc.premise',
    label: 'Creator: Premise',
    aliases: ['story_arc.premise', 'premise', 'Creator: Premise'],
    contentTypes: ['story_arc'],
    manualModeSupported: true,
    retrievalPolicy: 'initial',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['title', 'synopsis', 'theme', 'tone', 'setting', 'level_range', 'estimated_sessions', 'overarching_goal', 'hook'],
      requiredKeys: ['title', 'synopsis', 'theme', 'tone', 'setting', 'overarching_goal', 'hook'],
      fieldRules: {},
    },
  },
  'story_arc.structure': {
    key: 'story_arc.structure',
    label: 'Creator: Structure',
    aliases: ['story_arc.structure', 'structure', 'Creator: Structure'],
    contentTypes: ['story_arc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['acts', 'beats', 'branching_paths', 'known_barriers', 'unknown_barriers'],
      requiredKeys: ['acts', 'beats', 'branching_paths', 'known_barriers', 'unknown_barriers'],
      fieldRules: {
        acts: { policy: 'non_empty_if_present', type: 'array' },
        beats: { policy: 'non_empty_if_present', type: 'array' },
        branching_paths: { policy: 'may_be_empty', type: 'array' },
        known_barriers: { policy: 'may_be_empty', type: 'array' },
        unknown_barriers: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'story_arc.characters': {
    key: 'story_arc.characters',
    label: 'Creator: Characters',
    aliases: ['story_arc.characters', 'characters', 'Creator: Characters'],
    contentTypes: ['story_arc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['characters', 'factions'],
      requiredKeys: ['characters', 'factions'],
      fieldRules: {
        characters: { policy: 'non_empty_if_present', type: 'array' },
        factions: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
  'story_arc.secrets': {
    key: 'story_arc.secrets',
    label: 'Creator: Secrets',
    aliases: ['story_arc.secrets', 'secrets', 'Creator: Secrets'],
    contentTypes: ['story_arc'],
    manualModeSupported: true,
    retrievalPolicy: 'hints_allowed',
    retryPolicy: DEFAULT_RETRY_POLICY,
    contract: {
      outputAllowedKeys: ['clues_and_secrets', 'rewards', 'dm_notes'],
      requiredKeys: ['clues_and_secrets', 'rewards', 'dm_notes'],
      fieldRules: {
        clues_and_secrets: { policy: 'non_empty_if_present', type: 'array' },
        rewards: { policy: 'may_be_empty', type: 'array' },
        dm_notes: { policy: 'may_be_empty', type: 'array' },
      },
    },
  },
};

export const WORKFLOW_RULES_PACKS: Record<string, RulesPack> = {
  'npc-dnd': {
    id: 'npc-dnd',
    label: 'D&D NPC Rules Pack',
    contentTypes: ['npc'],
    primaryRuleBase: '2024RAW',
    supportedRuleBases: ['2024RAW', '2014RAW'],
    description: 'NPC-first rules pack for class, race, feat, spellcasting, legendary, and noncombat branching.',
  },
};

export const WORKFLOW_DEFINITIONS: Record<WorkflowContentType, WorkflowDefinition> = {
  unknown: {
    contentType: 'unknown',
    label: 'Content Generator',
    stageKeys: ['purpose', 'keyword_extractor', 'planner', 'creator', 'fact_checker', 'stylist', 'canon_validator', 'physics_validator'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  npc: {
    contentType: 'npc',
    label: 'NPC Creator',
    stageKeys: ['keyword_extractor', 'planner', 'basic_info', 'core_details', 'stats', 'character_build', 'combat', 'spellcasting', 'legendary', 'relationships', 'equipment'],
    rulesPackId: 'npc-dnd',
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  monster: {
    contentType: 'monster',
    label: 'Monster Creator',
    stageKeys: ['monster.basic_info', 'monster.stats', 'monster.combat', 'monster.legendary', 'monster.lore'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  item: {
    contentType: 'item',
    label: 'Item Creator',
    stageKeys: ['item.concept', 'item.mechanics', 'item.lore'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  encounter: {
    contentType: 'encounter',
    label: 'Encounter Builder',
    stageKeys: ['encounter.concept', 'encounter.enemies', 'encounter.terrain', 'encounter.tactics', 'encounter.rewards'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  location: {
    contentType: 'location',
    label: 'Location Builder',
    stageKeys: ['location.purpose', 'location.foundation', 'location.spaces', 'location.details', 'location.visual_map', 'location.accuracy_refinement'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  story_arc: {
    contentType: 'story_arc',
    label: 'Story Arc',
    stageKeys: ['story_arc.premise', 'story_arc.structure', 'story_arc.characters', 'story_arc.secrets'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  scene: {
    contentType: 'scene',
    label: 'Scene Writer',
    stageKeys: ['purpose', 'keyword_extractor', 'planner', 'creator', 'fact_checker', 'stylist', 'canon_validator', 'physics_validator'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  adventure: {
    contentType: 'adventure',
    label: 'Adventure Planner',
    stageKeys: ['purpose', 'keyword_extractor', 'planner', 'creator', 'fact_checker', 'stylist', 'canon_validator', 'physics_validator'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  homebrew: {
    contentType: 'homebrew',
    label: 'Homebrew Parser',
    stageKeys: ['purpose', 'keyword_extractor', 'planner', 'creator', 'fact_checker', 'stylist', 'canon_validator', 'physics_validator'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  nonfiction: {
    contentType: 'nonfiction',
    label: 'Non-Fiction Writer',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  outline: {
    contentType: 'outline',
    label: 'Outline Generator',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  chapter: {
    contentType: 'chapter',
    label: 'Chapter Writer',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  memoir: {
    contentType: 'memoir',
    label: 'Memoir Writer',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  journal_entry: {
    contentType: 'journal_entry',
    label: 'Journal Entry',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  diet_log_entry: {
    contentType: 'diet_log_entry',
    label: 'Diet Log Entry',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
  other_writing: {
    contentType: 'other_writing',
    label: 'Writing Assistant',
    stageKeys: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    manualModeSupported: true,
    retrievalFallbackOrder: ['project', 'library', 'ungrounded'],
    resourceCheckTarget: '#resources-panel',
  },
};

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const STAGE_ALIAS_LOOKUP = new Map<string, string>();
const WORKFLOW_STAGE_ALIAS_LOOKUP = new Map<string, string>();

for (const definition of Object.values(STAGE_DEFINITIONS)) {
  STAGE_ALIAS_LOOKUP.set(normalizeAlias(definition.key), definition.key);
  STAGE_ALIAS_LOOKUP.set(normalizeAlias(definition.label), definition.key);
  for (const alias of definition.aliases) {
    STAGE_ALIAS_LOOKUP.set(normalizeAlias(alias), definition.key);
  }

  for (const workflowType of definition.contentTypes) {
    WORKFLOW_STAGE_ALIAS_LOOKUP.set(`${workflowType}:${normalizeAlias(definition.key)}`, definition.key);
    WORKFLOW_STAGE_ALIAS_LOOKUP.set(`${workflowType}:${normalizeAlias(definition.label)}`, definition.key);
    for (const alias of definition.aliases) {
      WORKFLOW_STAGE_ALIAS_LOOKUP.set(`${workflowType}:${normalizeAlias(alias)}`, definition.key);
    }
  }
}

export function getWorkflowDefinition(contentType: WorkflowContentType | string): WorkflowDefinition | null {
  return WORKFLOW_DEFINITIONS[contentType as WorkflowContentType] ?? null;
}

export function getWorkflowRulesPack(contentType: WorkflowContentType | string): RulesPack | null {
  const workflow = getWorkflowDefinition(contentType);
  if (!workflow?.rulesPackId) return null;
  return WORKFLOW_RULES_PACKS[workflow.rulesPackId] ?? null;
}

export function getStageDefinition(stageKey: string): StageDefinition | null {
  return STAGE_DEFINITIONS[stageKey] ?? STAGE_DEFINITIONS[STAGE_ALIAS_LOOKUP.get(normalizeAlias(stageKey)) ?? ''] ?? null;
}

export function normalizeWorkflowStageId(stageIdOrAlias: string): string | null {
  return getStageDefinition(stageIdOrAlias)?.key ?? null;
}

export function getWorkflowStageProxyAllowedKeys(stageIdOrAlias: string): readonly string[] | null {
  const contract = getStageDefinition(stageIdOrAlias)?.contract;
  return contract?.proxyAllowedKeys ?? contract?.outputAllowedKeys ?? null;
}

export function isWorkflowStageCriticalZeroGuard(stageIdOrAlias: string): boolean {
  return Boolean(getStageDefinition(stageIdOrAlias)?.contract?.zeroRawGuard);
}

export function resolveWorkflowStageKey(contentType: WorkflowContentType | string, stageIdOrAlias: string): string | null {
  if (typeof stageIdOrAlias !== 'string' || stageIdOrAlias.trim().length === 0) {
    return null;
  }

  const workflowScoped = WORKFLOW_STAGE_ALIAS_LOOKUP.get(`${contentType}:${normalizeAlias(stageIdOrAlias)}`);
  if (workflowScoped) return workflowScoped;

  return STAGE_ALIAS_LOOKUP.get(normalizeAlias(stageIdOrAlias)) ?? null;
}

export function getWorkflowStageDefinition(
  contentType: WorkflowContentType | string,
  stageIdOrAlias: string,
): StageDefinition | null {
  const stageKey = resolveWorkflowStageKey(contentType, stageIdOrAlias);
  return stageKey ? getStageDefinition(stageKey) : null;
}

export function getWorkflowStageSequence(contentType: WorkflowContentType | string): StageDefinition[] {
  const workflow = getWorkflowDefinition(contentType);
  if (!workflow) return [];
  return workflow.stageKeys
    .map((stageKey) => getStageDefinition(stageKey))
    .filter((stage): stage is StageDefinition => Boolean(stage));
}

export function createUngroundedWarning(
  workflowType: WorkflowContentType | string,
  groundingStatus: RetrievalGroundingStatus,
): string | undefined {
  if (groundingStatus === 'project') return undefined;

  if (groundingStatus === 'library') {
    return `${workflowType} generation is using library canon because this project has no linked canon resources yet.`;
  }

  return `${workflowType} generation is currently ungrounded because no project or library canon facts were found.`;
}
