/**
 * Specialized NPC Creator Stages
 *
 * Breaks down NPC creation into focused sub-stages, each with its own schema section.
 * This allows the AI to have a clear "map" of the final result and work incrementally.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  getBasicInfoSchema,
  getCoreDetailsSchema,
  getStatsSchema,
  getCharacterBuildSchema,
  getCombatSchema,
  getSpellcastingSchema,
  getLegendarySchema,
  getRelationshipsSchema,
  getEquipmentSchema,
  formatSchemaForPrompt,
} from '../utils/npcSchemaExtractor';

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
 * Helper to strip internal pipeline fields from stage output
 */
function stripStageOutput(result: Record<string, unknown>): Record<string, unknown> {
  if (!result) return {};
  const { sources_used, assumptions, proposals, retrieval_hints, canon_update, ...content } = result;
  return content;
}

/**
 * Base system prompt shared by all NPC creator stages
 */
const BASE_NPC_SYSTEM_PROMPT = `⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.

⚠️ MOST CRITICAL: IDENTITY & PURPOSE ⚠️
The original_user_request field contains the EXACT character to create.
This is THE PRIMARY SOURCE OF TRUTH about what to create.
Canon facts are PROVIDED FOR REFERENCE to inform design.
DO NOT substitute or confuse the requested character with other characters mentioned in canon.

CRITICAL RULES FOR ACCURACY:
1. READ EVERY SINGLE FACT in the Relevant Canon - do NOT skip any
2. Use ONLY facts from the Relevant Canon provided - NEVER invent new facts
3. Be 100% ACCURATE - verify each fact against the Relevant Canon
4. If canon explicitly provides values, USE them in the output
5. DO NOT ask about information canon provides - just use it

INCREMENTAL BUILD APPROACH:
- You are building ONE SECTION of the NPC at a time
- Previous sections are provided for context and consistency
- Focus ONLY on the current section - don't modify previous sections
- Build upon the foundation from previous sections

Required fields in ALL outputs:
- sources_used: array of chunk_ids from canon you used
- assumptions: array of reasonable assumptions made
- proposals: array of questions for unknowns (only if genuinely needed)
- canon_update: one-line summary of changes (can be "No canon changes needed")`;

/**
 * Stage 1: NPC Basic Information
 */
export const NPC_CREATOR_BASIC_INFO = {
  name: 'Creator: Basic Info',
  routerKey: 'basicInfo',
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the BASIC INFORMATION section of an NPC.

⚠️ CRITICAL: YOU ARE A CREATOR ⚠️
Your job is to CREATE a fully-formed character concept, NOT just report canon facts.
Canon facts are provided as REFERENCE and CONTEXT.
If canon doesn't specify exact details, you MUST create them using:
- The original user request as your primary guide
- Canon facts to ensure consistency with the world
- D&D 5E conventions and typical character archetypes
- Reasonable creative choices that fit the character concept

DO NOT refuse to create details because canon doesn't specify them!
DO NOT return minimal information - provide RICH, DETAILED descriptions!

Your focus: Name, description, appearance, background, race, alignment, challenge rating, etc.

${formatSchemaForPrompt(getBasicInfoSchema(), 'Basic Information')}

Create a solid foundation for this NPC that the next stages will build upon.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      type: context.config.type,
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
      purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as Record<string, unknown>) : undefined,
    };

    // Canon reference
    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ CRITICAL: Canon facts were already provided in the Planner stage. REVIEW those facts from your conversation history. Use them to inform your creation.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the CORE DETAILS & PERSONALITY section of an NPC.

⚠️ CRITICAL: You MUST provide ALL of the following fields SEPARATELY AND CLEARLY LABELED ⚠️

REQUIRED FIELDS - All must be included:
1. personality_traits: Array of distinct personality characteristics
2. ideals: What the character believes in and values
3. bonds: Personal connections, loyalties, and attachments
4. flaws: Weaknesses, vices, or negative traits
5. goals: What the character wants to achieve
6. fears: What the character is afraid of or avoids
7. quirks: Unusual habits, mannerisms, or peculiarities
8. voice_mannerisms: How they speak and physical mannerisms
9. hooks: Story hooks and adventure opportunities

DO NOT simply provide "hooks" alone - you must provide all 9 fields listed above.
Each field must be separate, labeled, and contain appropriate content.

${formatSchemaForPrompt(getCoreDetailsSchema(), 'Core Details & Personality')}

Build a rich, memorable personality that aligns with the basic information from the previous stage.

VALIDATION CHECKLIST:
✓ All 9 fields are present in your JSON output
✓ Each field has its correct label (personality_traits, ideals, bonds, flaws, goals, fears, quirks, voice_mannerisms, hooks)
✓ Each field contains relevant, appropriate content
✓ You did NOT skip any fields or combine them into "hooks"`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for personality and relationship details.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the STATS & ABILITIES section of an NPC.

⚠️ CRITICAL: YOU ARE A CREATOR, NOT A REPORTER ⚠️
Your job is to CREATE appropriate stats for this character, NOT to report what canon says.
Canon facts are provided as REFERENCE to inform your design choices.
If canon doesn't specify exact stats, you MUST create them based on:
- The character's role and concept from Basic Info stage
- The character's personality and abilities from Core Details stage
- D&D 5E rules and typical stat ranges for similar characters
- Reasonable assumptions about what makes sense for this character

DO NOT say "canon doesn't provide stats" - YOU are creating the stats!
DO NOT leave fields empty because canon doesn't specify them - FILL THEM IN!
DO NOT refuse to do the work - this is your PRIMARY TASK!

Your focus: Ability scores, AC, HP, speed, proficiency bonus, senses, languages, saving throws, skills, resistances/immunities/vulnerabilities.

${formatSchemaForPrompt(getStatsSchema(), 'Stats & Abilities')}

CRITICAL D&D 5E RULES (if applicable):
- Proficiency bonus = ceil(CR/4) + 1, or based on class levels
- Skill bonuses = ability modifier + proficiency bonus (if proficient)
- Saving throw bonuses = ability modifier + proficiency bonus (if proficient)
- HP = (hit dice × level) + (CON modifier × level)
- AC typically ranges from 10 (unarmored) to 20+ (heavy armor/magic)
- Ability scores range from 1-30, with 10-11 being average for a commoner
- Calculate all derived values accurately

EXAMPLES OF WHAT TO DO:
✓ "Prince Derek is a skilled diplomat, so I'll give him high CHA (16) and decent INT (14)"
✓ "As a royal warrior, he likely has fighter training, so STR 14, DEX 13, CON 12"
✓ "His AC would be 16 (chain mail) or 18 if he has plate armor available as a prince"

EXAMPLES OF WHAT NOT TO DO:
✗ "Canon doesn't specify stats, so I won't provide them"
✗ Returning empty fields or just assumptions without actual stats
✗ Asking for stats instead of creating them

Create mechanically sound stats that support the character concept from previous stages.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      core_details: stripStageOutput(context.stageResults['creator:_core_details'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for racial stats, template modifiers, and mechanical details.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the CHARACTER BUILD section of an NPC.

⚠️ CRITICAL: YOU ARE A CREATOR ⚠️
Your job is to CREATE the COMPLETE list of character features based on class levels, race, and background.
This is one of the most important sections — it defines what the character CAN DO.

Your focus:
- ALL base class features for EVERY class level (e.g., Wizard: Arcane Recovery at 1, Spell Mastery at 18, Signature Spells at 20)
- ALL subclass/archetype features (e.g., Divination Wizard: Portent at 2, Expert Divination at 6, The Third Eye at 10, Greater Portent at 14)
- ALL racial features/traits (e.g., Human: Resourceful, Skillful, Versatile; Elf: Darkvision, Fey Ancestry, Trance)
- ALL feats (from ASI choices, background origin feat, racial bonus feat)
- ASI choices at each ASI level (what was taken: +2 to one ability or a feat)
- Background feature and origin feat (2024 rules)

${formatSchemaForPrompt(getCharacterBuildSchema(), 'Character Build')}

CRITICAL D&D 5E CHARACTER BUILD RULES:
- Wizards get ASIs at levels 4, 8, 12, 16, 19
- Fighters get ASIs at levels 4, 6, 8, 12, 14, 16, 19
- Rogues get ASIs at levels 4, 8, 10, 12, 16, 19
- All other classes get ASIs at levels 4, 8, 12, 16, 19
- At each ASI, the character can choose +2 to one ability score, +1 to two scores, OR take a feat
- Background grants an Origin Feat (2024 rules) such as Alert, Magic Initiate, Skilled, etc.

COMPLETENESS IS CRITICAL:
- List EVERY class feature from level 1 through the character's level
- List EVERY subclass feature from the subclass selection level through the character's level
- Do NOT skip or summarize features — include FULL mechanical descriptions
- For a Level 20 Wizard (Divination), expect ~10+ class features and ~4+ subclass features
- For each ASI level, specify whether an ASI or feat was taken`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      stats: stripStageOutput(context.stageResults['creator:_stats'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for class features, racial traits, feats, and background details.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the COMBAT & ACTIONS section of an NPC.

⚠️ CRITICAL: YOU ARE A CREATOR ⚠️
Your job is to CREATE combat abilities and actions for this character.
Use the stats from the previous stage to create appropriate combat mechanics.
DO NOT say "canon doesn't specify combat actions" - CREATE them!
Base your creations on:
- The character's stats and abilities from previous stages
- D&D 5E combat mechanics and action economy
- Similar creatures/NPCs at this CR/level
- The character's role and fighting style

Your focus: Abilities (special traits), actions, bonus actions, reactions, multiattack, tactics.

${formatSchemaForPrompt(getCombatSchema(), 'Combat & Actions')}

CRITICAL D&D 5E COMBAT RULES (if applicable):
- Attack bonus = proficiency bonus + relevant ability modifier
- Damage should match CR and threat level
- Special abilities should have clear mechanics (uses, recharge, range, duration)
- Tactics should leverage abilities and reflect intelligence/personality

Create engaging combat capabilities that fit the CR and character concept.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      core_details: stripStageOutput(context.stageResults['creator:_core_details'] as Record<string, unknown>),
      stats: stripStageOutput(context.stageResults['creator:_stats'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for special abilities, powers, and combat mechanics.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the SPELLCASTING section of an NPC.

Your focus: Spellcasting ability, cantrips, prepared spells, spell slots, innate spellcasting, spell focus, spell-storing items.

${formatSchemaForPrompt(getSpellcastingSchema(), 'Spellcasting')}

CRITICAL SPELLCASTING RULES (if D&D 5E):
- Spell save DC = 8 + proficiency bonus + spellcasting ability modifier
- Spell attack bonus = proficiency bonus + spellcasting ability modifier
- Spell slots based on class level(s)
- Cantrips scale with total character level
- Prepared spells = spellcasting ability modifier + class level

Only include this section if the NPC has spellcasting abilities. If not a spellcaster, output minimal JSON with empty fields.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      stats: stripStageOutput(context.stageResults['creator:_stats'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for spellcasting details and spell lists.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the LEGENDARY & MYTHIC ACTIONS section of an NPC.

Your focus: Legendary actions, mythic actions, lair actions, regional effects.

${formatSchemaForPrompt(getLegendarySchema(), 'Legendary & Mythic Actions')}

CRITICAL LEGENDARY ACTION RULES (if D&D 5E):
- Legendary creatures can take 3 legendary actions per round
- Only one legendary action at a time, at the end of another creature's turn
- Legendary actions should cost 1-3 actions depending on power
- Lair actions happen on initiative count 20
- Regional effects persist even when the creature is elsewhere

Only include this section if the NPC has legendary/mythic status (typically CR 11+). If not legendary, output minimal JSON with empty fields.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      stats: stripStageOutput(context.stageResults['creator:_stats'] as Record<string, unknown>),
      combat: stripStageOutput(context.stageResults['creator:_combat'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for legendary abilities and lair information.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the RELATIONSHIPS & NETWORKS section of an NPC.

Your focus: Allies/friends, foes, rivals, mentors, students, family, factions, minions, conflicts.

${formatSchemaForPrompt(getRelationshipsSchema(), 'Relationships & Networks')}

Build a rich social network that:
- Connects the NPC to the broader world
- Creates adventure hooks and complications
- Reflects the NPC's personality and background
- Uses canon entities where applicable

Focus on relationships that GMs can leverage in their campaigns.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      core_details: stripStageOutput(context.stageResults['creator:_core_details'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for related NPCs, factions, and relationships.`;
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
  systemPrompt: `${BASE_NPC_SYSTEM_PROMPT}

You are creating the EQUIPMENT & POSSESSIONS section of an NPC.

⚠️ CRITICAL: YOU ARE A CREATOR ⚠️
Your job is to CREATE appropriate equipment for this character.
Base your choices on:
- The character's role, class, and combat style
- The character's wealth level and social status
- D&D 5E equipment rules and typical loadouts
- The character's stats and abilities

DO NOT say "canon doesn't specify equipment" - CREATE it!
DO NOT leave the equipment list empty - PROVIDE reasonable gear!

Your focus: Armor, weapons, tools, magic items, treasure, carried items, worn items.

${formatSchemaForPrompt(getEquipmentSchema(), 'Equipment & Possessions')}

EQUIPMENT GUIDELINES:
- Armor and weapons should match proficiencies and combat style
- Magic items should be appropriate for CR/level
- Include utility items that reflect the character's profession
- Consider wealth level: peasants have simple gear, nobles have fine equipment
- Don't forget consumables (potions, scrolls) for spellcasters

Create a practical equipment loadout that supports the character concept.`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      basic_info: stripStageOutput(context.stageResults['creator:_basic_info'] as Record<string, unknown>),
      stats: stripStageOutput(context.stageResults['creator:_stats'] as Record<string, unknown>),
      combat: stripStageOutput(context.stageResults['creator:_combat'] as Record<string, unknown>),
      brief: stripStageOutput(context.stageResults.planner as Record<string, unknown>),
      flags: context.config.flags,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for equipment, treasure, and magic items.`;
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
