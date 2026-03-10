/**
 * Specialized NPC Creator Stages
 *
 * Breaks down NPC creation into focused sub-stages, each with its own schema section.
 * This allows the AI to have a clear "map" of the final result and work incrementally.
 *
 * Uses compact stage contracts (from npcStageContracts.ts) instead of verbose inline
 * schemas to stay well within the 7200-char prompt safety ceiling.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  BASIC_INFO_CONTRACT,
  CORE_DETAILS_CONTRACT,
  STATS_CONTRACT,
  CHARACTER_BUILD_CONTRACT,
  COMBAT_CONTRACT,
  SPELLCASTING_CONTRACT,
  LEGENDARY_CONTRACT,
  RELATIONSHIPS_CONTRACT,
  EQUIPMENT_CONTRACT,
} from './npcStageContracts';

interface StageContext {
  config: { prompt: string; type: string; flags: Record<string, unknown> };
  stageResults: Record<string, Record<string, unknown>>;
  factpack: unknown;
  chunkInfo?: {
    isChunked: boolean;
    currentChunk: number;
    totalChunks: number;
    chunkLabel: string;
  };
  previousDecisions?: Record<string, string>;
  unansweredProposals?: unknown[];
}

/**
 * Helper to create minimal factpack reference
 */
function createMinimalFactpack(factpack: unknown): unknown {
  if (!factpack) return null;
  // Simplified - actual implementation in ManualGenerator
  return factpack;
}

/**
 * Helper to strip internal pipeline fields from stage output.
 * Produces a compact summary of prior-stage output for context.
 */
function stripStageOutput(result: Record<string, unknown>): Record<string, unknown> {
  if (!result) return {};
  const content = { ...result } as Record<string, unknown>;
  delete content.sources_used;
  delete content.assumptions;
  delete content.proposals;
  delete content.retrieval_hints;
  delete content.canon_update;
  return content;
}

/**
 * Stage 1: NPC Basic Information
 */
export const NPC_CREATOR_BASIC_INFO = {
  name: 'Creator: Basic Info',
  routerKey: 'basicInfo',
  systemPrompt: BASIC_INFO_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      type: context.config.type,
    };

    // Include planner brief if available (compact)
    const planner = context.stageResults.planner;
    if (planner) {
      userPrompt.brief = stripStageOutput(planner);
    }

    // Include purpose if available (compact)
    const purpose = context.stageResults.purpose;
    if (purpose) {
      userPrompt.purpose = stripStageOutput(purpose);
    }

    // Canon reference
    if (planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Use them to inform your creation.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    // Previous decisions
    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 2: NPC Core Details & Personality
 */
export const NPC_CREATOR_CORE_DETAILS = {
  name: 'Creator: Core Details',
  routerKey: 'coreDetails',
  systemPrompt: CORE_DETAILS_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for personality and relationship details.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 3: NPC Stats & Abilities
 */
export const NPC_CREATOR_STATS = {
  name: 'Creator: Stats',
  routerKey: 'stats',
  systemPrompt: STATS_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const coreDetails = context.stageResults['creator:_core_details'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Stats actually needs
      name: basicInfo?.name,
      species: basicInfo?.species || basicInfo?.race,
      class_levels: basicInfo?.class_levels || coreDetails?.class_levels,
      challenge_rating: basicInfo?.challenge_rating,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for racial stats and mechanical details.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 3b: NPC Character Build (Class Features, Racial Features, Feats, ASI, Background)
 */
export const NPC_CREATOR_CHARACTER_BUILD = {
  name: 'Creator: Character Build',
  routerKey: 'characterBuild',
  systemPrompt: CHARACTER_BUILD_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const stats = context.stageResults['creator:_stats'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Character Build actually needs
      species: basicInfo?.species || basicInfo?.race,
      background: basicInfo?.background,
      class_levels: basicInfo?.class_levels,
      ability_scores: stats?.ability_scores,
      proficiency_bonus: stats?.proficiency_bonus,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for class features, racial traits, feats, and background details.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 4: NPC Combat & Actions
 */
export const NPC_CREATOR_COMBAT = {
  name: 'Creator: Combat',
  routerKey: 'combat',
  systemPrompt: COMBAT_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const stats = context.stageResults['creator:_stats'];
    const build = context.stageResults['creator:_character_build'];
    const basicInfo = context.stageResults['creator:_basic_info'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Combat actually needs
      ability_scores: stats?.ability_scores,
      proficiency_bonus: stats?.proficiency_bonus,
      armor_class: stats?.armor_class,
      hit_points: stats?.hit_points,
      class_features: build?.class_features,
      fighting_styles: build?.fighting_styles,
      class_levels: basicInfo?.class_levels,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for special abilities and combat mechanics.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 5: NPC Spellcasting (if applicable)
 */
export const NPC_CREATOR_SPELLCASTING = {
  name: 'Creator: Spellcasting',
  routerKey: 'spellcasting',
  systemPrompt: SPELLCASTING_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const stats = context.stageResults['creator:_stats'];
    const build = context.stageResults['creator:_character_build'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Spellcasting actually needs
      name: basicInfo?.name,
      species: basicInfo?.species || basicInfo?.race,
      class_levels: basicInfo?.class_levels,
      ability_scores: stats?.ability_scores,
      proficiency_bonus: stats?.proficiency_bonus,
      class_features: build?.class_features,
      subclass_features: build?.subclass_features,
      racial_features: build?.racial_features,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for spellcasting details and spell lists.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 6: NPC Legendary & Mythic Actions (if applicable)
 */
export const NPC_CREATOR_LEGENDARY = {
  name: 'Creator: Legendary',
  routerKey: 'legendary',
  systemPrompt: LEGENDARY_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const combat = context.stageResults['creator:_combat'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Legendary actually needs
      name: basicInfo?.name,
      species: basicInfo?.species || basicInfo?.race,
      class_levels: basicInfo?.class_levels,
      actions: combat?.actions,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for legendary abilities and lair information.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 7: NPC Relationships & Networks
 */
export const NPC_CREATOR_RELATIONSHIPS = {
  name: 'Creator: Relationships',
  routerKey: 'relationships',
  systemPrompt: RELATIONSHIPS_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const coreDetails = context.stageResults['creator:_core_details'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Relationships actually needs
      name: basicInfo?.name,
      species: basicInfo?.species || basicInfo?.race,
      background: basicInfo?.background,
      alignment: basicInfo?.alignment,
      personality_traits: coreDetails?.personality_traits,
      ideals: coreDetails?.ideals,
      bonds: coreDetails?.bonds,
      flaws: coreDetails?.flaws,
      goals: coreDetails?.goals,
      hooks: coreDetails?.hooks,
      affiliation: basicInfo?.affiliation,
      location: basicInfo?.location,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for related NPCs, factions, and relationships.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 8: NPC Equipment & Possessions
 */
export const NPC_CREATOR_EQUIPMENT = {
  name: 'Creator: Equipment',
  routerKey: 'equipment',
  systemPrompt: EQUIPMENT_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = context.stageResults['creator:_basic_info'];
    const stats = context.stageResults['creator:_stats'];
    const build = context.stageResults['creator:_character_build'];
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      // Only carry forward the fields Equipment actually needs
      name: basicInfo?.name,
      species: basicInfo?.species || basicInfo?.race,
      class_levels: basicInfo?.class_levels,
      proficiency_bonus: stats?.proficiency_bonus,
      skill_proficiencies: build?.skill_proficiencies,
      fighting_styles: build?.fighting_styles,
      background: basicInfo?.background,
      armor_class: stats?.armor_class,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `Canon facts were provided in the Planner stage. Review them for equipment, treasure, and magic items.`;
    } else {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * All NPC creator sub-stages in order
 */
export const NPC_CREATOR_STAGES = [
  NPC_CREATOR_BASIC_INFO,
  NPC_CREATOR_CORE_DETAILS,
  NPC_CREATOR_STATS,
  NPC_CREATOR_CHARACTER_BUILD,
  NPC_CREATOR_COMBAT,
  NPC_CREATOR_SPELLCASTING,
  NPC_CREATOR_LEGENDARY,
  NPC_CREATOR_RELATIONSHIPS,
  NPC_CREATOR_EQUIPMENT,
];

/**
 * Map router keys to stage configs for smart routing
 */
export const STAGE_ROUTER_MAP: Record<string, typeof NPC_CREATOR_BASIC_INFO> = {
  basicInfo: NPC_CREATOR_BASIC_INFO,
  coreDetails: NPC_CREATOR_CORE_DETAILS,
  stats: NPC_CREATOR_STATS,
  characterBuild: NPC_CREATOR_CHARACTER_BUILD,
  combat: NPC_CREATOR_COMBAT,
  spellcasting: NPC_CREATOR_SPELLCASTING,
  legendary: NPC_CREATOR_LEGENDARY,
  relationships: NPC_CREATOR_RELATIONSHIPS,
  equipment: NPC_CREATOR_EQUIPMENT,
};
