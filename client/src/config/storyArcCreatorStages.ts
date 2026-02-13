/**
 * Specialized Story Arc Creator Stages
 *
 * Breaks down story arc creation into 4 focused sub-stages optimized for D&D campaign
 * narratives with acts, beats, characters, factions, and branching paths.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  getStoryArcPremiseSchema,
  getStoryArcStructureSchema,
  getStoryArcCharactersSchema,
  getStoryArcSecretsSchema,
  formatStoryArcSchemaForPrompt,
} from '../utils/storyArcSchemaExtractor';

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
  return JSON.parse(serialized.substring(0, maxChars) + '"}]');
}

const BASE_STORY_ARC_SYSTEM_PROMPT = `You are a D&D 5e Story Arc Creator — a specialist in designing compelling, multi-session campaign narratives with strong dramatic structure, memorable NPCs, and meaningful player agency.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

⚠️ CRITICAL: IDENTITY & PURPOSE ⚠️
The user prompt specifies the EXACT story arc to create.
Canon facts are PROVIDED FOR REFERENCE to inform the design.
DO NOT substitute or confuse the requested arc with other stories in canon.

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
 * Stage 1: Premise & Setup
 */
export const STORY_ARC_CREATOR_PREMISE = {
  name: 'Creator: Premise',
  routerKey: 'premise',
  systemPrompt: `${BASE_STORY_ARC_SYSTEM_PROMPT}

You are creating the PREMISE & SETUP section of a story arc.

Your focus:
- title: Evocative story arc title
- synopsis: 2-4 sentence summary of the arc
- theme: Central thematic thread (e.g., "corruption of power", "redemption through sacrifice")
- tone: Narrative tone (grim, heroic, mystery, political intrigue, horror, comedic, etc.)
- setting: Where the story takes place — be specific about regions, cities, or locales
- level_range: Suggested party level range
- estimated_sessions: Approximate number of sessions
- overarching_goal: The primary objective the party is working toward
- hook: The inciting incident that draws the party into the story

${formatStoryArcSchemaForPrompt(getStoryArcPremiseSchema(), 'Premise & Setup')}

STORY ARC DESIGN PRINCIPLES:
- The hook should be immediately compelling and tie to the theme
- The overarching goal should be clear but have hidden complexity
- Tone should be consistent but allow for tonal variety within scenes
- Level range should inform the scale of threats and stakes
- The synopsis should create excitement without spoiling key twists`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'story_arc',
      stage: 'premise',
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
 * Stage 2: Structure & Beats
 */
export const STORY_ARC_CREATOR_STRUCTURE = {
  name: 'Creator: Structure',
  routerKey: 'structure',
  systemPrompt: `${BASE_STORY_ARC_SYSTEM_PROMPT}

You are creating the STRUCTURE & BEATS section of a story arc.

You are building upon the Premise stage. Design a dramatic structure with clear escalation.

Your focus:
- acts: Array of acts (typically 3-5), each with:
  - name: Act title (e.g., "Act 1: The Gathering Storm")
  - summary: What happens in this act (2-3 sentences)
  - key_events: Major events in this act
  - locations: Key locations visited
  - climax: The act's climactic moment
  - transition: How this act leads into the next
- beats: Array of key story beats/milestones with name, description, act, type, and whether required
  - Types: plot, character, revelation, combat, social, exploration, milestone
- branching_paths: Key decision points with options and consequences
- known_barriers: Known obstacles the party must overcome
- unknown_barriers: Hidden threats or twists the party doesn't know about yet

${formatStoryArcSchemaForPrompt(getStoryArcStructureSchema(), 'Structure & Beats')}

DRAMATIC STRUCTURE GUIDELINES:
- Act 1 (25%): Setup, hook, introduce key NPCs and stakes
- Act 2 (50%): Rising action, complications, character development, key revelations
- Act 3 (25%): Climax, resolution, aftermath
- Each act should have a clear internal arc (setup → complication → mini-climax)
- Branching paths give players meaningful agency without derailing the plot
- Include at least 2-3 decision points with real consequences
- Mix beat types: don't have 5 combat beats in a row
- Unknown barriers create dramatic irony and surprise`,

  buildUserPrompt: (context: StageContext) => {
    const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'story_arc',
      stage: 'structure',
      premise,
      instructions: `Design the dramatic structure for "${premise.title || 'this story arc'}". Create ${premise.estimated_sessions ? `content for approximately ${premise.estimated_sessions} sessions` : 'a multi-session arc'}.`,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for story structure and events.`;
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
 * Stage 3: Characters & Factions
 */
export const STORY_ARC_CREATOR_CHARACTERS = {
  name: 'Creator: Characters',
  routerKey: 'characters',
  systemPrompt: `${BASE_STORY_ARC_SYSTEM_PROMPT}

You are creating the CHARACTERS & FACTIONS section of a story arc.

You are building upon the Premise and Structure stages. Populate the story with compelling NPCs and factions.

Your focus:
- characters: Array of key NPCs, each with:
  - name, role (antagonist, ally, patron, rival, wildcard, informant, etc.)
  - description: Brief physical/personality description
  - motivation: { purpose, reason }
  - goals: Array of { target, achievement }
  - known_barriers, unknown_barriers: Obstacles to their goals
  - arc: How this character changes over the story
  - first_appearance: When/where they first appear
- factions: Array of factions, each with:
  - name, description, goals, resources, relationship_to_party

${formatStoryArcSchemaForPrompt(getStoryArcCharactersSchema(), 'Characters & Factions')}

CHARACTER DESIGN PRINCIPLES:
- Every major NPC should have a clear motivation that can conflict with the party's goals
- Antagonists need depth — they believe they're right or have understandable reasons
- Include at least one NPC per act who drives the plot forward
- Characters should have arcs that change based on party actions
- Factions create a web of alliances and rivalries the party navigates
- "Wildcard" characters add unpredictability
- First appearances should be memorable and establish the character's role

FACTION GUIDELINES:
- Each faction should have 2-3 clear goals (some may conflict with the party, some align)
- Resources indicate what the faction can bring to bear (soldiers, magic, political influence, information)
- Faction relationships with the party should be dynamic — they can shift based on player choices`,

  buildUserPrompt: (context: StageContext) => {
    const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});
    const structure = stripStageOutput(context.stageResults['story_arc_structure'] || {});

    const actNames = Array.isArray(structure.acts)
      ? (structure.acts as Array<{ name?: string }>).map(a => a.name || 'Unnamed Act')
      : [];

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'story_arc',
      stage: 'characters',
      premise: { title: premise.title, theme: premise.theme, setting: premise.setting, overarching_goal: premise.overarching_goal },
      structure_summary: { act_count: actNames.length, acts: actNames },
      instructions: 'Create the key NPCs and factions for this story arc. Every character should serve a narrative purpose.',
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for existing NPCs and factions.`;
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
 * Stage 4: Secrets & Rewards
 */
export const STORY_ARC_CREATOR_SECRETS = {
  name: 'Creator: Secrets',
  routerKey: 'secrets',
  systemPrompt: `${BASE_STORY_ARC_SYSTEM_PROMPT}

You are creating the SECRETS & REWARDS section of a story arc.

You are building upon all previous stages. Add depth through hidden information and meaningful rewards.

Your focus:
- clues_and_secrets: Array of hidden information with:
  - secret: The hidden information itself
  - discovery_method: How the party can discover it (investigation, NPC interrogation, exploration, etc.)
  - impact: What changes when this secret is revealed
- rewards: Array of major rewards with:
  - name: What the reward is
  - type: item, gold, reputation, information, ally, territory, etc.
  - when: When/how it's earned (e.g., "After completing Act 2", "If they spare the antagonist")
- dm_notes: Array of GM guidance strings — pacing tips, adaptation suggestions, "what if" scenarios

${formatStoryArcSchemaForPrompt(getStoryArcSecretsSchema(), 'Secrets & Rewards')}

SECRETS DESIGN PRINCIPLES:
- Layer secrets: some are easy to discover (DC 10-12), others require effort (DC 15-18), a few are deeply hidden (DC 20+)
- Each secret should have at least 2 possible discovery methods (so the party isn't stuck)
- Revelations should change the party's understanding of the situation or force difficult choices
- Connect secrets to the theme and character motivations
- At least one secret should reframe a seemingly straightforward situation

REWARDS GUIDELINES:
- Rewards should escalate with the arc (small early, big at climax)
- Mix reward types: not everything should be magic items
- "Information" rewards (learning a secret, gaining a map) drive the plot forward
- "Ally" rewards create future story hooks
- Consider consequences for choosing certain rewards over others

DM NOTES SHOULD COVER:
- Pacing advice (when to slow down, when to push forward)
- "What if the party does X?" contingency guidance
- Tone-setting tips for key scenes
- Scaling suggestions for different party sizes/levels
- How to handle failed checks at critical moments`,

  buildUserPrompt: (context: StageContext) => {
    const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});
    const structure = stripStageOutput(context.stageResults['story_arc_structure'] || {});
    const characters = stripStageOutput(context.stageResults['story_arc_characters'] || {});

    const characterNames = Array.isArray(characters.characters)
      ? (characters.characters as Array<{ name?: string; role?: string }>).map(c => `${c.name || '?'} (${c.role || '?'})`)
      : [];

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'story_arc',
      stage: 'secrets',
      premise: { title: premise.title, theme: premise.theme },
      barrier_count: {
        known: Array.isArray(structure.known_barriers) ? structure.known_barriers.length : 0,
        unknown: Array.isArray(structure.unknown_barriers) ? structure.unknown_barriers.length : 0,
      },
      characters_summary: characterNames,
      instructions: 'Create secrets, rewards, and DM notes that tie everything together and create layers of depth.',
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for secrets and lore.`;
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
 * All story arc creator sub-stages in order
 */
export const STORY_ARC_CREATOR_STAGES = [
  STORY_ARC_CREATOR_PREMISE,
  STORY_ARC_CREATOR_STRUCTURE,
  STORY_ARC_CREATOR_CHARACTERS,
  STORY_ARC_CREATOR_SECRETS,
];
