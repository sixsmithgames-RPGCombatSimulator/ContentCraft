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
import type { RoutedNpcStageKey } from './npcStageRouter';
import {
  buildWorkflowStagePrompt,
  createWorkflowStagePromptPayload,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from '../services/stagePromptShared';
import {
  buildCharacterBuildChunkPlan,
  buildCharacterBuildStagePrompt,
} from '../services/npcCharacterBuildEnrichment';

const CLASS_SPELLCAST_ABILITY_MAP: Record<string, string> = {
  cleric: 'WIS',
  druid: 'WIS',
  paladin: 'CHA',
  ranger: 'WIS',
  bard: 'CHA',
  sorcerer: 'CHA',
  warlock: 'CHA',
  wizard: 'INT',
  artificer: 'INT',
};

function extractClass(value: string | undefined): string {
  if (!value) return '';
  const match = value.match(/^(.*?)(?:\s*\(|\s*-\s*)([^)]*)\)?$/);
  if (match && match[1]) return match[1].trim();
  return value.trim();
}

function extractSubclass(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(.*?)(?:\s*\(|\s*-\s*)([^)]*)\)?$/);
  if (match && match[2]) {
    const subclass = match[2].trim();
    return subclass || undefined;
  }
  return undefined;
}

function inferSpellcastingAbility(className?: string, subclass?: string): string | undefined {
  const normalized = className?.trim().toLowerCase() || '';
  if (!normalized) return undefined;
  if (normalized === 'paladin' && subclass?.toLowerCase().includes('devotion')) return 'CHA';
  return CLASS_SPELLCAST_ABILITY_MAP[normalized];
}

function computeHalfCasterSlots(level?: number): Record<string, number> {
  if (!Number.isFinite(level)) return {};
  const table: Record<number, Record<string, number>> = {
    1: { 1: 0 },
    2: { 1: 2 },
    3: { 1: 3 },
    4: { 1: 3 },
    5: { 1: 4, 2: 2 },
    6: { 1: 4, 2: 2 },
    7: { 1: 4, 2: 3 },
    8: { 1: 4, 2: 3 },
    9: { 1: 4, 2: 3, 3: 2 },
    10: { 1: 4, 2: 3, 3: 2 },
    11: { 1: 4, 2: 3, 3: 2, 4: 1 },
    12: { 1: 4, 2: 3, 3: 2, 4: 1 },
    13: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    14: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    15: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    16: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    17: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    18: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 1 },
    19: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 1 },
    20: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 1 },
  };
  const nearest = Object.keys(table)
    .map((k) => Number(k))
    .filter((k) => k <= (level as number))
    .sort((a, b) => b - a)[0];
  return nearest ? table[nearest] : {};
}

/**
 * Stage 1: NPC Basic Information
 */
export const NPC_CREATOR_BASIC_INFO = {
  name: 'Creator: Basic Info',
  routerKey: 'basicInfo',
  systemPrompt: BASIC_INFO_CONTRACT,

  buildUserPrompt: (context: StageContext) => {
    const planner = context.stageResults.planner;
    const purpose = context.stageResults.purpose;

    return buildWorkflowStagePrompt({
      context,
      deliverable: context.config.type,
      stage: 'basic_info',
      payload: {
        type: context.config.type,
        brief: planner ? stripStageOutput(planner) : undefined,
        purpose: purpose ? stripStageOutput(purpose) : undefined,
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Use them to inform your creation.',
    });
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'core_details',
      payload: {
        basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for personality and relationship details.',
    });
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'stats',
      payload: {
        name: basicInfo?.name,
        species: basicInfo?.species || basicInfo?.race,
        appearance: basicInfo?.appearance,
        description: basicInfo?.description,
        class_levels: basicInfo?.class_levels || coreDetails?.class_levels,
        challenge_rating: basicInfo?.challenge_rating,
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for racial stats and mechanical details.',
    });
  },
};

/**
 * Stage 3b: NPC Character Build (Class Features, Racial Features, Feats, ASI, Background)
 */
export const NPC_CREATOR_CHARACTER_BUILD = {
  name: 'Creator: Character Build',
  routerKey: 'characterBuild',
  systemPrompt: CHARACTER_BUILD_CONTRACT,
  shouldChunk: () => buildCharacterBuildChunkPlan(),
  buildUserPrompt: (context: StageContext) => buildCharacterBuildStagePrompt(context),
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'combat',
      payload: {
        ability_scores: stats?.ability_scores,
        proficiency_bonus: stats?.proficiency_bonus,
        armor_class: stats?.armor_class,
        hit_points: stats?.hit_points,
        class_features: build?.class_features,
        fighting_styles: build?.fighting_styles,
        class_levels: basicInfo?.class_levels,
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for special abilities and combat mechanics.',
    });
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

    const classLevels = Array.isArray(basicInfo?.class_levels) ? basicInfo?.class_levels : [];
    const primaryClassRaw = (classLevels?.[0]?.class as string | undefined) || '';
    const primaryLevel = Number.isFinite(classLevels?.[0]?.level as number) ? (classLevels?.[0]?.level as number) : basicInfo?.level;
    const subclass = (classLevels?.[0]?.subclass as string | undefined) || extractSubclass(primaryClassRaw);
    const className = subclass ? extractClass(primaryClassRaw) : primaryClassRaw;

    const abilityScores =
      stats?.ability_scores && typeof stats.ability_scores === 'object' && stats.ability_scores !== null && !Array.isArray(stats.ability_scores)
        ? stats.ability_scores as Record<string, unknown>
        : null;
    const spellcastingAbility = inferSpellcastingAbility(className, subclass);
    const spellcastingAbilityKey = typeof spellcastingAbility === 'string' ? spellcastingAbility.toLowerCase() : null;
    const abilityScoreValue = spellcastingAbilityKey && abilityScores
      ? abilityScores[spellcastingAbilityKey]
      : undefined;
    const abilityScore = typeof abilityScoreValue === 'number' ? abilityScoreValue : undefined;
    const abilityModifier = abilityScore !== undefined ? Math.floor((abilityScore - 10) / 2) : undefined;
    const proficiencyBonus = typeof stats?.proficiency_bonus === 'number' ? stats.proficiency_bonus : undefined;

    const slotProgression = computeHalfCasterSlots(typeof primaryLevel === 'number' ? primaryLevel : undefined);
    const derivedDc = abilityModifier !== undefined && proficiencyBonus !== undefined ? 8 + abilityModifier + proficiencyBonus : undefined;
    const derivedAttack = abilityModifier !== undefined && proficiencyBonus !== undefined ? abilityModifier + proficiencyBonus : undefined;

    const alwaysPreparedSpellSources = subclass ? [subclass] : [];

    return JSON.stringify(createWorkflowStagePromptPayload({
      context,
      deliverable: 'npc',
      stage: 'spellcasting',
      payload: {
        class_name: className || undefined,
        subclass: subclass || undefined,
        level: primaryLevel,
        caster_type: 'prepared_half_caster',
        spellcasting_ability: spellcastingAbility,
        ability_modifier: abilityModifier,
        proficiency_bonus: proficiencyBonus,
        derived: {
          spell_save_dc: derivedDc,
          spell_attack_bonus: derivedAttack,
          slot_progression: slotProgression,
        },
        always_prepared_spell_sources: alwaysPreparedSpellSources,
        known_item_spell_sources: [],
      },
      plannerReferenceMessage: 'Planner provided canon facts; reuse only spell names relevant to this NPC.',
      plannerReferenceKey: 'canon_reference',
      factpackKey: 'compact_canon',
    }), null, 2);
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'legendary',
      payload: {
        name: basicInfo?.name,
        species: basicInfo?.species || basicInfo?.race,
        class_levels: basicInfo?.class_levels,
        actions: combat?.actions,
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for legendary abilities and lair information.',
    });
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'relationships',
      payload: {
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
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for related NPCs, factions, and relationships.',
    });
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
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'npc',
      stage: 'equipment',
      payload: {
        name: basicInfo?.name,
        species: basicInfo?.species || basicInfo?.race,
        class_levels: basicInfo?.class_levels,
        proficiency_bonus: stats?.proficiency_bonus,
        skill_proficiencies: build?.skill_proficiencies,
        fighting_styles: build?.fighting_styles,
        background: basicInfo?.background,
        armor_class: stats?.armor_class,
      },
      plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for equipment, treasure, and magic items.',
    });
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
export const STAGE_ROUTER_MAP: Record<RoutedNpcStageKey, typeof NPC_CREATOR_BASIC_INFO> = {
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
