/**
 * Specialized Encounter Creator Stages
 *
 * Breaks down encounter creation into 5 focused sub-stages optimized for D&D 5e
 * combat encounters with terrain, tactics, event clocks, and rewards.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  getConceptSchema,
  getEnemyCompositionSchema,
  getTerrainSchema,
  getTacticsSchema,
  getRewardsSchema,
  formatEncounterSchemaForPrompt,
} from '../utils/encounterSchemaExtractor';

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
 * Create a minimal factpack reference for prompts
 */
function createMinimalFactpack(factpack: unknown, maxChars: number = 8000): unknown {
  if (!factpack) return null;
  const serialized = JSON.stringify(factpack);
  if (serialized.length <= maxChars) return factpack;
  // Truncate if too large
  return JSON.parse(serialized.substring(0, maxChars) + '"}]');
}

const BASE_ENCOUNTER_SYSTEM_PROMPT = `You are a D&D 5e Encounter Creator — a specialist in designing tactically interesting, balanced, and narratively engaging combat encounters.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

⚠️ CRITICAL: IDENTITY & PURPOSE ⚠️
The user prompt specifies the EXACT encounter to create.
Canon facts are PROVIDED FOR REFERENCE to inform the design.
DO NOT substitute or confuse the requested encounter with other events mentioned in canon.

⚠️ CRITICAL: NEVER REPEAT QUESTIONS ⚠️
If the user input includes "previous_decisions", those topics have ALREADY been decided.
DO NOT create proposals for ANY topic mentioned in previous_decisions.
USE the decisions directly in your output.

CRITICAL RULES FOR ACCURACY:
1. READ ALL provided canon facts THOROUGHLY
2. Use ONLY facts from the Relevant Canon provided — NEVER invent new facts
3. Every claim MUST be traceable to a source in sources_used[]
4. If information is NOT in canon — add it to proposals[], do NOT make it up

Required fields in ALL outputs:
- rule_base, sources_used, assumptions, proposals, canon_update`;

/**
 * Stage 1: Encounter Concept & Setup
 */
export const ENCOUNTER_CREATOR_CONCEPT = {
  name: 'Creator: Concept',
  routerKey: 'concept',
  systemPrompt: `${BASE_ENCOUNTER_SYSTEM_PROMPT}

You are creating the CONCEPT & SETUP section of an encounter.

Your focus:
- title: Evocative encounter name
- description: Narrative setup (2-4 sentences minimum) — what the party walks into
- encounter_type: combat, social, exploration, puzzle, chase, or hybrid
- difficulty_tier: trivial/easy/medium/hard/deadly/boss
- party_level and party_size: From user request or reasonable defaults
- xp_budget: Total XP budget based on difficulty and party (use DMG encounter building tables)
- objectives: What the party needs to accomplish (at least 2)
- failure_conditions: What happens if they fail
- location: Where this takes place
- setting_context: WHY this encounter is happening in the story

${formatEncounterSchemaForPrompt(getConceptSchema(), 'Concept & Setup')}

D&D 5E ENCOUNTER BUDGET REFERENCE:
- Easy: 25 XP × party level × party size
- Medium: 50 XP × party level × party size
- Hard: 75 XP × party level × party size
- Deadly: 100 XP × party level × party size
- Apply encounter multiplier for multiple monsters (2 = ×1.5, 3-6 = ×2, 7-10 = ×2.5, 11-14 = ×3, 15+ = ×4)`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'encounter',
      stage: 'concept',
      flags: context.config.flags,
    };

    if (context.factpack) {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 2: Enemy Composition
 */
export const ENCOUNTER_CREATOR_ENEMIES = {
  name: 'Creator: Enemies',
  routerKey: 'enemies',
  systemPrompt: `${BASE_ENCOUNTER_SYSTEM_PROMPT}

You are creating the ENEMY COMPOSITION section of an encounter.

You are building upon the Concept stage. Use the XP budget and difficulty to select appropriate enemies.

Your focus:
- monsters: Array of creatures with name, count, CR, XP, AC, HP, speed, role, positioning, key abilities
- npcs: Array of named NPCs involved (allies, enemies, neutrals, bystanders)

${formatEncounterSchemaForPrompt(getEnemyCompositionSchema(), 'Enemy Composition')}

CRITICAL D&D 5E ENEMY DESIGN RULES:
- Total monster XP (before multiplier) should match the xp_budget from Concept stage
- Apply encounter multiplier: 2 monsters = ×1.5, 3-6 = ×2, 7-10 = ×2.5, 11-14 = ×3, 15+ = ×4
- Mix tactical roles for interesting combat: brutes (high HP, melee), artillery (ranged damage), controllers (conditions/terrain), skirmishers (mobile), leaders (buffs/heals)
- Include at least one creature that threatens the party's typical strategy
- Specify starting positions relative to terrain
- Use OFFICIAL D&D monsters when possible (cite source book)

CR-TO-XP REFERENCE:
0=10, 1/8=25, 1/4=50, 1/2=100, 1=200, 2=450, 3=700, 4=1100, 5=1800,
6=2300, 7=2900, 8=3900, 9=5000, 10=5900, 11=7200, 12=8400, 13=10000,
14=11500, 15=13000, 16=15000, 17=18000, 18=20000, 19=22000, 20=25000`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'encounter',
      stage: 'enemies',
      concept,
      instructions: `Select enemies for this encounter. XP budget: ${concept.xp_budget || 'see concept'}. Difficulty: ${concept.difficulty_tier || 'medium'}.`,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for monster/NPC details.`;
    } else if (context.factpack) {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 3: Terrain & Environment
 */
export const ENCOUNTER_CREATOR_TERRAIN = {
  name: 'Creator: Terrain',
  routerKey: 'terrain',
  systemPrompt: `${BASE_ENCOUNTER_SYSTEM_PROMPT}

You are creating the TERRAIN & ENVIRONMENT section of an encounter.

You are building upon the Concept and Enemy stages. Design terrain that creates interesting tactical choices.

Your focus:
- terrain: Overall description, features (with mechanical effects), lighting, elevation, weather, map dimensions
- hazards: Environmental dangers (lava, collapsing floor, poison gas, etc.)
- traps: Hidden dangers with trigger, effect, DC, detection, and disarm methods

${formatEncounterSchemaForPrompt(getTerrainSchema(), 'Terrain & Environment')}

CRITICAL TERRAIN DESIGN PRINCIPLES:
- Every terrain feature should create a TACTICAL CHOICE (not just flavor)
- Include at least 2-3 features with mechanical effects (cover, difficult terrain, elevation advantage)
- Terrain should interact with the enemy tactics — enemies should USE the terrain
- Include at least ONE feature that benefits the party if they're clever
- Specify lighting — it affects many abilities (darkvision, disadvantage, hiding)
- Hazards should have clear triggers and counterplay
- Traps need detection DC, trigger, effect, and disarm method
- Map dimensions should accommodate the number of combatants`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
    const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'encounter',
      stage: 'terrain',
      concept: { location: concept.location, description: concept.description, setting_context: concept.setting_context },
      enemies_summary: {
        monster_count: Array.isArray(enemies.monsters) ? enemies.monsters.length : 0,
        has_ranged: 'Check enemy key_abilities for ranged attacks',
        has_flyers: 'Check enemy speed for fly speeds',
      },
      instructions: 'Design terrain that creates interesting tactical decisions. Terrain should interact with enemy abilities.',
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for location details.`;
    } else if (context.factpack) {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 4: Tactics & Event Clock
 */
export const ENCOUNTER_CREATOR_TACTICS = {
  name: 'Creator: Tactics',
  routerKey: 'tactics',
  systemPrompt: `${BASE_ENCOUNTER_SYSTEM_PROMPT}

You are creating the TACTICS & EVENT CLOCK section of an encounter.

You are building upon all previous stages. Design how the enemies BEHAVE and how the encounter EVOLVES.

Your focus:
- tactics: Opening moves, focus targets, resource usage, fallback plan, morale, coordination
- event_clock: Escalation phases with triggers and outcomes

${formatEncounterSchemaForPrompt(getTacticsSchema(), 'Tactics & Event Clock')}

CRITICAL TACTICS DESIGN PRINCIPLES:
- Enemies should fight SMART — use terrain, coordinate roles, protect vulnerable members
- Opening moves should establish the encounter's character (ambush? defensive? aggressive?)
- Focus targets should reflect enemy intelligence (mindless undead attack nearest; smart enemies target healers)
- Resource usage: when do enemies burn limited abilities? (saving big spells for when outnumbered, using potions below half HP)
- Fallback plan: what happens when enemies start losing? (retreat, surrender, berserker rage, call reinforcements)
- Morale: specify when enemies flee (below 50% numbers? leader falls? specific trigger?)
- Coordination: how do different enemy types support each other?

EVENT CLOCK PRINCIPLES:
- An event clock creates URGENCY and ESCALATION
- Each phase should change the tactical situation
- Triggers can be: round numbers, HP thresholds, player actions, environmental changes
- Examples: "Round 3: Reinforcements arrive", "Leader drops below 50% HP: activates lair action", "Altar is touched: room begins flooding"
- 3-5 phases is typical for a dynamic encounter`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
    const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});
    const terrain = stripStageOutput(context.stageResults['encounter_terrain'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'encounter',
      stage: 'tactics',
      concept: { difficulty_tier: concept.difficulty_tier, objectives: concept.objectives, expected_duration_rounds: concept.expected_duration_rounds },
      enemies,
      terrain,
      instructions: 'Design enemy tactics and an event clock that makes this encounter dynamic and escalating.',
    };

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * Stage 5: Rewards & Aftermath
 */
export const ENCOUNTER_CREATOR_REWARDS = {
  name: 'Creator: Rewards',
  routerKey: 'rewards',
  systemPrompt: `${BASE_ENCOUNTER_SYSTEM_PROMPT}

You are creating the REWARDS & AFTERMATH section of an encounter.

You are building upon all previous stages. Define what the party gains and what happens next.

Your focus:
- treasure: Currency (cp/sp/ep/gp/pp), items (with rarity), and boons (non-material rewards)
- consequences: What happens on success, failure, or partial success
- scaling: How to adjust difficulty (easier/harder/different party sizes)
- notes: GM tips and additional guidance

${formatEncounterSchemaForPrompt(getRewardsSchema(), 'Rewards & Aftermath')}

CRITICAL REWARD DESIGN PRINCIPLES:
- Treasure should be appropriate for the encounter's difficulty and party level
- Use DMG treasure hoard tables as reference (adjusted for encounter, not full hoard)
- Include at least one non-monetary reward (information, favor, reputation, magic item for hard+ encounters)
- Consequences should have narrative weight — success and failure both advance the story
- Include a "partial success" outcome for when things go sideways
- Story hooks should connect to the larger campaign arc
- Scaling guidance helps GMs adapt on the fly

TREASURE REFERENCE (per-encounter, not full hoard):
- Level 1-4: 10-50 gp equivalent, common/uncommon items
- Level 5-10: 50-500 gp equivalent, uncommon/rare items
- Level 11-16: 500-5000 gp equivalent, rare/very rare items
- Level 17-20: 5000-50000 gp equivalent, very rare/legendary items`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
    const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'encounter',
      stage: 'rewards',
      concept: { difficulty_tier: concept.difficulty_tier, party_level: concept.party_level, party_size: concept.party_size, objectives: concept.objectives },
      enemies_summary: {
        monster_count: Array.isArray(enemies.monsters) ? enemies.monsters.length : 0,
        total_xp: concept.xp_budget,
      },
      instructions: 'Design rewards, consequences, and scaling guidance appropriate for the encounter difficulty and party level.',
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for treasure and story context.`;
    } else if (context.factpack) {
      userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
    }

    if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
      userPrompt.previous_decisions = context.previousDecisions;
    }

    return JSON.stringify(userPrompt, null, 2);
  },
};

/**
 * All encounter creator sub-stages in order
 */
export const ENCOUNTER_CREATOR_STAGES = [
  ENCOUNTER_CREATOR_CONCEPT,
  ENCOUNTER_CREATOR_ENEMIES,
  ENCOUNTER_CREATOR_TERRAIN,
  ENCOUNTER_CREATOR_TACTICS,
  ENCOUNTER_CREATOR_REWARDS,
];
