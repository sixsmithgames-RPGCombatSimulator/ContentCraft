/**
 * Specialized Monster Creator Stages
 *
 * Breaks down monster creation into focused sub-stages optimized for D&D 5e stat blocks.
 * Monsters focus on combat stats, abilities, and ecology rather than personality/relationships.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

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
 * Helper to strip internal pipeline fields from stage output
 */
function stripStageOutput(result: Record<string, unknown>): Record<string, unknown> {
  if (!result) return {};
  const { sources_used, assumptions, proposals, retrieval_hints, canon_update, ...content } = result;
  return content;
}

/**
 * Stage 1: Basic monster information
 */
export const MONSTER_CREATOR_BASIC_INFO = {
  id: 'monster_basic_info',
  name: 'Basic Info',
  systemPrompt: `You are creating a D&D 5e monster stat block. This is stage 1/5: Basic Information.

Your task is to establish the fundamental identity and classification of the monster.

Focus ONLY on these fields:
- name: The monster's name (required)
- description: Physical appearance and general behavior (2-3 sentences, required)
- size: Tiny, Small, Medium, Large, Huge, or Gargantuan (required)
- creature_type: Aberration, Beast, Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, or Undead (required)
- subtype: Specific subtype if applicable (e.g., "goblinoid", "shapechanger")
- alignment: Typical alignment for this creature (required)
- challenge_rating: CR as a string like "1/4", "1/2", "1", "5", etc. (required)
- experience_points: XP value based on CR
- location: Typical habitat or environment where this creature is found

Do NOT include stats, abilities, or actions yet - those come in later stages.

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      request: context.config.prompt,
      deliverable: 'monster',
      stage: 'basic_info',
      instructions: 'Generate the basic information for this monster. Include name, description, size, creature type, alignment, and challenge rating.',
    };

    if (context.factpack) {
      userPrompt.canon_context = 'Use the provided factpack for canon accuracy.';
    }

    if (context.previousDecisions) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 2: Core stats and defenses
 */
export const MONSTER_CREATOR_STATS = {
  id: 'monster_stats',
  name: 'Stats & Defenses',
  systemPrompt: `You are creating a D&D 5e monster stat block. This is stage 2/5: Stats and Defenses.

You are building upon the basic info from stage 1.

Focus ONLY on these fields:
- ability_scores: Object with str, dex, con, int, wis, cha (all integers 1-30, required)
- armor_class: Integer or array of AC objects with value/type/notes (required)
- hit_points: Integer or object with average and formula (required)
- hit_dice: String like "8d10" or "15d8+45"
- proficiency_bonus: Integer +2 to +9 based on CR (required)
- speed: Object with walk, fly, swim, climb, burrow speeds (strings like "30 ft.")
- saving_throws: Array of {name: string, value: string, notes?: string} - value MUST be string like "+5" or "-1"
- skill_proficiencies: Array of {name: string, value: string, notes?: string} - value MUST be string like "+7" or "+0"
- damage_vulnerabilities: Array of damage types
- damage_resistances: Array of damage types
- damage_immunities: Array of damage types
- condition_immunities: Array of conditions
- senses: Array of special senses (e.g., "darkvision 60 ft.", "blindsight 30 ft.")
- languages: Array of languages understood/spoken

Calculate stats appropriate for the monster's CR and type. Use D&D 5e guidelines for CR-appropriate values.

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

    const userPrompt: Record<string, unknown> = {
      request: context.config.prompt,
      deliverable: 'monster',
      stage: 'stats',
      basic_info: basicInfo,
      instructions: `Generate stats and defenses for this monster. Ensure values are appropriate for CR ${basicInfo.challenge_rating || 'unknown'}.`,
    };

    if (context.factpack) {
      userPrompt.canon_context = 'Use the provided factpack for canon accuracy.';
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 3: Combat abilities and actions
 */
export const MONSTER_CREATOR_COMBAT = {
  id: 'monster_combat',
  name: 'Combat & Abilities',
  systemPrompt: `You are creating a D&D 5e monster stat block. This is stage 3/5: Combat and Abilities.

You are building upon previous stages.

Focus ONLY on these fields:
- abilities: Array of special traits/abilities (passive features like Magic Resistance, Pack Tactics, etc.)
  Each ability: {name, description, uses?, recharge?, notes?}
- actions: Array of actions the monster can take (attacks, special actions)
  Each action: {name, description, uses?, recharge?, notes?}
  Include attack bonus, damage, and DC values in descriptions
- bonus_actions: Array of bonus actions if applicable
- reactions: Array of reactions if applicable
- tactics: String describing combat tactics and behavior patterns

Create abilities and actions appropriate for the monster's CR and type. Include:
- At least 1-2 attack actions
- Special abilities that make the monster interesting/unique
- Appropriate attack bonuses and save DCs for the CR

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});
    const stats = stripStageOutput(context.stageResults.monster_stats || {});

    const userPrompt: Record<string, unknown> = {
      request: context.config.prompt,
      deliverable: 'monster',
      stage: 'combat',
      basic_info: basicInfo,
      stats: stats,
      instructions: `Generate combat abilities and actions for this monster. Make it interesting and mechanically appropriate for CR ${basicInfo.challenge_rating || 'unknown'}.`,
    };

    if (context.factpack) {
      userPrompt.canon_context = 'Use the provided factpack for canon accuracy.';
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 4: Legendary and lair features (if applicable)
 */
export const MONSTER_CREATOR_LEGENDARY = {
  id: 'monster_legendary',
  name: 'Legendary & Lair',
  systemPrompt: `You are creating a D&D 5e monster stat block. This is stage 4/5: Legendary and Lair Features.

You are building upon previous stages. This stage is OPTIONAL - only include these if the monster is powerful/important enough (typically CR 5+).

Focus ONLY on these fields (only if appropriate):
- legendary_actions: Object with {summary, options}
  summary: String explaining how many legendary actions the creature gets
  options: Array of legendary actions, each with {name, description, uses?, recharge?, notes?}
- mythic_actions: Object with {summary, options} - only for extremely powerful creatures
- lair_actions: Array of strings describing lair actions (if the creature has a lair)
- regional_effects: Array of strings describing regional effects (if applicable)

Most monsters will NOT need these fields. Only include if:
- CR is 5+ for legendary actions
- CR is 15+ for mythic actions
- The monster is significant enough to have a lair

If not applicable, return an empty object {} or omit these fields.

Return ONLY a JSON object. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

    const userPrompt: Record<string, unknown> = {
      request: context.config.prompt,
      deliverable: 'monster',
      stage: 'legendary',
      basic_info: basicInfo,
      instructions: `If appropriate for CR ${basicInfo.challenge_rating || 'unknown'}, generate legendary actions and/or lair features. Otherwise return an empty object.`,
    };

    if (context.factpack) {
      userPrompt.canon_context = 'Use the provided factpack for canon accuracy.';
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 5: Ecology and lore
 */
export const MONSTER_CREATOR_LORE = {
  id: 'monster_lore',
  name: 'Ecology & Lore',
  systemPrompt: `You are creating a D&D 5e monster stat block. This is stage 5/5: Ecology and Lore.

You are building upon all previous stages to add final context and flavor.

Focus ONLY on these fields:
- ecology: String (2-3 sentences) describing habitat, diet, social structure, and behavior in its natural environment
- lore: String (2-3 sentences) providing background lore, origin, or interesting facts about the creature
- notes: Array of strings with any additional GM notes or adventure hooks
- sources: Array of strings citing any source books or references

This is the final polish stage - provide interesting context that helps a GM use this monster effectively.

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

    const userPrompt: Record<string, unknown> = {
      request: context.config.prompt,
      deliverable: 'monster',
      stage: 'lore',
      basic_info: basicInfo,
      stats_summary: {
        cr: basicInfo.challenge_rating,
        type: basicInfo.creature_type,
        has_legendary: !!(context.stageResults.monster_legendary && Object.keys(context.stageResults.monster_legendary).length > 0),
      },
      instructions: 'Generate ecology and lore information for this monster. Provide context that helps GMs use it effectively.',
    };

    if (context.factpack) {
      userPrompt.canon_context = 'Use the provided factpack for canon accuracy.';
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * All monster creator sub-stages in order
 */
export const MONSTER_CREATOR_STAGES = [
  MONSTER_CREATOR_BASIC_INFO,
  MONSTER_CREATOR_STATS,
  MONSTER_CREATOR_COMBAT,
  MONSTER_CREATOR_LEGENDARY,
  MONSTER_CREATOR_LORE,
];
