/**
 * Manual generator stage catalog and prompt helpers.
 *
 * This centralizes the generic/manual writing stages alongside the specialized
 * content stage arrays so workflow composition is owned by one catalog layer.
 */

import { ENCOUNTER_CREATOR_STAGES } from '../config/encounterCreatorStages';
import { ITEM_CREATOR_STAGES } from '../config/itemCreatorStages';
import { LOCATION_CREATOR_STAGES } from '../config/locationCreatorStages';
import { MONSTER_CREATOR_STAGES } from '../config/monsterCreatorStages';
import { NPC_CREATOR_STAGES, STAGE_ROUTER_MAP } from '../config/npcCreatorStages';
import { STORY_ARC_CREATOR_STAGES } from '../config/storyArcCreatorStages';
import type { GeneratorStage } from './generatorWorkflow';
import {
  normalizeWorkflowStageMap,
  normalizeWorkflowStageSet,
} from './workflowStageAdapter';
import {
  createMinimalFactpack,
  stripStageOutput,
  type GeneratorStagePromptContext as ManualGeneratorStageContext,
} from './stagePromptShared';

type JsonRecord = Record<string, unknown>;

export type { ManualGeneratorStageContext };

const LEGACY_CANON_MAX_CHARS = 3200;

const LEGACY_CREATOR_SYSTEM_PROMPT = `You are the Creator for structured content generation.

Output ONLY valid JSON. NO markdown. NO prose.
Start your response with { and end with }.

Treat original_user_request as the primary source of truth.
Treat purpose, brief, relevant_canon, previous_decisions, and output_schema as the full authoritative context for this stage.
Do NOT rely on prior conversation history or hidden session memory.
Use canon only when it is explicitly present in relevant_canon.
If explicit inputs still leave gaps, record them in proposals[] instead of inventing unsupported canon.
Incorporate previous_decisions directly and do not ask duplicate questions.
Return content that matches output_schema exactly.`;

const LEGACY_STYLIST_SYSTEM_PROMPT = `You are the Stylist for structured content generation.

Output ONLY valid JSON. NO markdown. NO prose.
Start your response with { and end with }.

Normalize the draft into the schema described by normalized_output_schema.
Use only the explicit context in draft, fact_check, purpose, relevant_canon, and previous_decisions.
Do NOT rely on prior conversation history or hidden session memory.
Preserve supported facts, apply required revisions from fact_check, and avoid inventing unsupported canon.
Return content that matches normalized_output_schema exactly.`;

const LEGACY_DELIVERABLE_SCHEMA_HINTS: Record<string, string> = {
  scene: 'Scene output schema: type, deliverable, title, description, scene_type (social|exploration|investigation|travel|downtime|cutscene), location { name, description, region, ambiance, sensory_details { sights[], sounds[], smells[] } }, participants[{ name, role, goals[], disposition }], objectives[], hooks[], skill_challenges[{ description, suggested_skills[], dc, consequences { success, failure } }], dialogue[{ speaker, line, context }], discoveries[], transitions { entry, exit }, gm_notes, era, region, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  story_arc: 'Story arc output schema: type, deliverable, title, description, premise, themes[], scope { estimated_sessions, level_range, geographic_scope, stakes }, hook { initial_hook, personal_connections[], urgency }, acts[{ act_number, title, summary, key_events[], major_npcs[], locations[], estimated_sessions, act_climax }], major_npcs[{ name, role, motivation, arc }], key_locations[{ name, significance, when_visited }], central_conflict { antagonist, goal, methods[], weakness }, climax { description, location, stakes, victory_conditions[], failure_outcomes[] }, resolution_options[{ outcome, requirements[], consequences }], subplots[{ title, description, resolution }], pacing { introduction, rising_action, climax, falling_action }, era, region, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  adventure: 'Adventure output schema: type, deliverable, title, subtitle, description, premise, scope { estimated_sessions, level_range, player_count, difficulty }, adventure_structure { introduction { hook, starting_location, initial_scenes[] }, acts[{ act_number, title, summary, encounters[], scenes[], key_npcs[], locations[], act_objective }], climax { title, description, final_encounter, resolution_options[] }, conclusion { epilogue, rewards[], sequel_hooks[] } }, major_npcs[{ name, role, brief_stats, key_motivations[] }], key_locations[{ name, description, encounters[], points_of_interest[] }], magic_items[{ name, where_found, brief_description }], appendices { npcs, items, maps[], handouts[] }, gm_guidance { preparation_notes[], pacing_tips[], common_pitfalls[], improvisation_tips[] }, themes[], era, region, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  encounter: 'Encounter output schema: type, deliverable, title, description, encounter_type, objective, environment { location, terrain_features[], hazards[], lighting, weather, cover_terrain[] }, participants[{ name, role, objective, tactics[] }], tactics { enemy_strategy, reinforcements, retreat_conditions, special_phases[] }, rewards { treasure[], experience, story_rewards[] }, hooks[], escalation[], era, region, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  item: 'Item output schema: type, deliverable, title, canonical_name, aliases[], description, item_type, subtype, rarity, requires_attunement, attunement_requirements, appearance, history, properties { magical_bonus, special_abilities[{ name, description, uses, recharge }], passive_effects[], activation, cursed, curse_description }, mechanics { damage, armor_class, spell_save_dc, attack_bonus, weight, cost_gp }, lore { creator, origin_story, famous_wielders[], current_location, legends[] }, era, region, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  npc: 'NPC output schema: type, deliverable, name, title, description, appearance, background, species or race, alignment, class_levels, ability_scores, armor_class, hit_points, speed, senses, actions, traits or abilities, relationships, equipment, rule_base, sources_used[], assumptions[], proposals[], canon_update.',
  homebrew: 'Return a structured homebrew JSON object with deliverable, title or name, description, sections or entries when applicable, rule_base, sources_used[], assumptions[], proposals[], and canon_update.',
  unknown: 'Return a structured JSON object for the requested deliverable with deliverable, title or name, description, rule_base when applicable, sources_used[], assumptions[], proposals[], and canon_update.',
};

function hasFactpackFacts(factpack: unknown): boolean {
  return typeof factpack === 'object'
    && factpack !== null
    && Array.isArray((factpack as { facts?: unknown[] }).facts)
    && ((factpack as { facts?: unknown[] }).facts?.length ?? 0) > 0;
}

function appendLegacyRelevantCanon(
  userPrompt: Record<string, unknown>,
  context: ManualGeneratorStageContext,
  maxChars: number = LEGACY_CANON_MAX_CHARS,
): void {
  if (hasFactpackFacts(context.factpack)) {
    userPrompt.relevant_canon = createMinimalFactpack(context.factpack, maxChars);
  }
}

function matchLegacyDeliverableType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (text.includes('story arc') || text.includes('story_arc') || text.includes('plot arc')) {
    return 'story_arc';
  }

  if (text.includes('scene') || text.includes('narrative')) {
    return 'scene';
  }

  if (text.includes('adventure') || text.includes('campaign') || text.includes('quest')) {
    return 'adventure';
  }

  if (text.includes('encounter') || text.includes('combat')) {
    return 'encounter';
  }

  if (text.includes('item') || text.includes('artifact') || text.includes('treasure')) {
    return 'item';
  }

  if (text.includes('npc') || text.includes('character')) {
    return 'npc';
  }

  if (text.includes('homebrew')) {
    return 'homebrew';
  }

  return null;
}

function resolveLegacyDeliverableType(context: ManualGeneratorStageContext): string {
  const configured = matchLegacyDeliverableType(context.config.type);
  if (configured && configured !== 'unknown') {
    return configured;
  }

  const plannerDeliverable = matchLegacyDeliverableType(context.stageResults.planner?.deliverable);
  if (plannerDeliverable) {
    return plannerDeliverable;
  }

  const purposeType = matchLegacyDeliverableType(context.stageResults.purpose?.content_type);
  if (purposeType) {
    return purposeType;
  }

  return configured ?? 'unknown';
}

function getLegacyDeliverableSchemaHint(context: ManualGeneratorStageContext): string {
  const deliverableType = resolveLegacyDeliverableType(context);
  return LEGACY_DELIVERABLE_SCHEMA_HINTS[deliverableType] ?? LEGACY_DELIVERABLE_SCHEMA_HINTS.unknown;
}

export const NONFICTION_BOOK_STAGES: GeneratorStage[] = [
  {
    name: 'Purpose',
    systemPrompt: `You are the Purpose Analyzer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to analyze the user's request and determine the PURPOSE and CONSTRAINTS for writing a non-fiction book.

IMPORTANT: Audiobooks are structured differently than print books.
- Print books: chapters/sections, headings, visuals/figures (if any), references/endnotes.
- Audiobooks: spoken flow, narration-friendly language, avoidance of heavy visual references, and segment-based structure.

Output a JSON object with:
- deliverable: "nonfiction"
- keywords: string[] (5-15 significant nouns/proper nouns/key concepts for canon/library search)
- medium: "print" | "audiobook" | "both" (infer; if truly ambiguous, create a proposal)
- audience: who this is for
- goal: what the reader should achieve
- key_topics: array of major topics
- tone: descriptive tone guidance (e.g., "authoritative but warm")
- detail_level: "brief" | "standard" | "detailed" | "comprehensive"
- special_requirements: array of constraints
- proposals: array of questions only if needed

If the request implies an audiobook (e.g., "for listening", "narration", "audio"), set medium="audiobook".
If it implies a printed book (e.g., "print", "illustrations", "figures", "footnotes"), set medium="print".
If it implies both or a repurposable manuscript, set medium="both".`,
    buildUserPrompt: (context) => JSON.stringify({
      user_request: context.config.prompt,
      type: context.config.type,
      flags: context.config.flags,
    }, null, 2),
  },
  {
    name: 'Outline & Structure',
    systemPrompt: `You are the Outliner for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to produce a clear, usable outline and structure that matches the user's request and the Purpose stage decisions.

Output a JSON with:
- deliverable: "nonfiction"
- working_title: string
- subtitle: string (optional)
- medium: "print" | "audiobook" | "both" (from Purpose)
- thesis: the core promise/idea in 1-2 sentences
- audience: from Purpose
- voice: guidance for the writing voice
- structure:
  - if medium includes print: parts/chapters with titles and bullet-point key_takeaways
  - if medium includes audiobook: episodes/segments with titles and listener_takeaways
- retrieval_hints: { keywords: [], entities: [], regions: [], eras: [] } (use keywords for concepts/sources to find)
- proposals: questions only for missing requirements that materially affect the structure

Use relevant_canon as a reference pool for existing facts; do not invent citations you don't have.`,
    buildUserPrompt: (context) => {
      const userPrompt: any = {
        prompt: context.config.prompt,
        type: context.config.type,
        flags: context.config.flags,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        relevant_canon: createMinimalFactpack(context.factpack),
      };

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Draft',
    systemPrompt: `You are the Writer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to create a reader-facing draft that matches the Outline & Structure and the medium selected in the Purpose stage.

CRITICAL:
- If medium includes audiobook: write in a narration-friendly style (spoken language, fewer visual-only references).
- If medium includes print: you may include references to figures/tables, but keep them optional.

Output JSON with:
- deliverable: "nonfiction"
- title: string
- subtitle: string (optional)
- medium: "print" | "audiobook" | "both"
- table_of_contents: array of chapter/segment titles
- chapters: array of { title: string, summary: string, key_points: string[], draft_text: string }
- formatted_manuscript: string (human-readable manuscript with headings; this will be shown to the user)
- sources_used: string[] (if you used canon facts)
- assumptions: string[]
- proposals: array of unresolved questions
- canon_update: string

Use relevant_canon when present.`,
    buildUserPrompt: (context) => {
      const userPrompt: any = {
        original_user_request: context.config.prompt,
        type: context.config.type,
        flags: context.config.flags,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
      };

      appendLegacyRelevantCanon(userPrompt, context, 2600);

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Editor & Style',
    systemPrompt: `You are the Editor for non-fiction book generation.

Evaluate the Draft against the Relevant Canon/Library facts and identify what needs to be clarified or revised.

CRITICAL TASKS:
1. Conflicts: cite any draft claims that contradict provided facts.
2. Ambiguities: list vague statements needing clarification.
3. Unassociated: flag claims that need sourcing or are unsupported by provided facts.
4. Revision Prompt: craft a JSON-safe string instructing the Writer what to revise.
5. User Questions: gather concrete questions for each ask_user item.
6. Summary: short recap.

Output STRICT JSON:
{
  "conflicts": [...],
  "ambiguities": [...],
  "unassociated": [...],
  "revision_prompt": string,
  "user_questions": string[],
  "summary": string
}

Do NOT rewrite the manuscript here; only analyze and provide actionable guidance.`,
    buildUserPrompt: (context) => {
      const draft = stripStageOutput(context.stageResults.draft as JsonRecord);
      const userPrompt: any = {
        draft,
        deliverable: context.config.type,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
        relevant_canon: createMinimalFactpack(context.factpack, 6000),
      };

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Finalizer',
    systemPrompt: `You are the Finalizer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO tables. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to incorporate the Editor findings and the user's clarifications, and produce the final manuscript output.

CRITICAL RULES:
1. Do NOT add, remove, or change factual claims.
2. Incorporate clarifications from the Editor report and the user's previous_decisions.
3. Ensure the output remains usable for the selected medium:
   - Print: clean headings, chapter structure, optional callouts.
   - Audiobook: narration-friendly phrasing, avoid heavy visual-only references.
4. Ensure formatted_manuscript is human-readable and complete.
5. Preserve sources_used, assumptions, proposals, and canon_update fields.

Output JSON matching the Draft stage structure, with final prose and formatting.`,
    buildUserPrompt: (context) => {
      const fullDraft = stripStageOutput(context.stageResults.draft as JsonRecord);
      const fullEditor = stripStageOutput(context.stageResults['editor_&_style'] as JsonRecord);

      const userPrompt: any = {
        draft: fullDraft,
        editor_report: fullEditor,
        deliverable_type: context.config.type,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
      };

      appendLegacyRelevantCanon(userPrompt, context, 2600);

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
];

export const GENERIC_STAGES: GeneratorStage[] = [
  {
    name: 'Purpose',
    routerKey: 'purpose',
    systemPrompt: `You are the Purpose Analyzer for content generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to analyze the user's request and determine the PURPOSE and CONSTRAINTS for generation.

Output a JSON with:
- content_type: "npc" | "location" | "item" | "encounter" | "adventure" | "scene" | "organization" | "other"
- generation_mode: "mechanical" (stat block/rules) | "narrative" (story/description) | "hybrid" (both)
- game_system: "D&D 5e" | "Pathfinder" | "system-agnostic" | "other" (extract from user prompt or infer)
- detail_level: "brief" | "standard" | "detailed" | "comprehensive"
- special_requirements: array of special constraints (e.g., ["homebrew allowed", "must have stat block", "narrative focus", "specific race", "specific class"])
- interpretation: brief explanation of what you understand the user wants

Examples:
- User: "Create a level 9 vampire NPC" → game_system: "D&D 5e", generation_mode: "mechanical"
- User: "Describe an ancient elven queen" → game_system: "system-agnostic", generation_mode: "narrative"
- User: "A haunted tavern for my campaign" → content_type: "location", generation_mode: "hybrid"`,
    buildUserPrompt: (context) => JSON.stringify({
      user_request: context.config.prompt,
      flags: context.config.flags,
    }, null, 2),
  },
  {
    name: 'Keyword Extractor',
    routerKey: 'keyword_extractor',
    systemPrompt: `You are a Keyword Extraction specialist.
Your ONLY job is to identify significant keywords from the user's prompt that should be used to search the canon database.

CRITICAL RULES:
1. Extract ONLY significant nouns, proper nouns, and key concepts
2. EXCLUDE common words: and, is, they, that, what, are, the, a, an, in, on, at, to, for, of, with, by, from, etc.
3. Include: character names, location names, item names, ability/power names, entity types, regions, eras, events
4. If a multi-word phrase is clearly a proper noun or title, keep it together (e.g., "Night City", "Corporate Tower", "Vault of Secrets")
5. Return 5-15 keywords maximum - be selective and relevant

TAKE YOUR TIME. Read the prompt carefully. Think about what concepts are mentioned that would exist in the setting's canon database.

Output ONLY valid JSON with this structure:
{
  "keywords": ["keyword1", "keyword2", ...]
}`,
    buildUserPrompt: (context) => JSON.stringify({
      user_prompt: context.config.prompt,
    }, null, 2),
  },
  {
    name: 'Planner',
    routerKey: 'planner',
    systemPrompt: `You are the Planner for game content generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks (no \`\`\`json). NO explanations. NO tables. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.

⚠️ CRITICAL: CHARACTER IDENTITY ⚠️
The user prompt specifies the EXACT character/content to create (e.g., "Goran Varus").
Canon facts are PROVIDED FOR REFERENCE to inform the design - they describe the world, setting, and related entities.
DO NOT substitute or confuse the requested character with other characters mentioned in canon.
Example: If user requests "Goran Varus" and canon mentions "Sir Darris Gorran", you are creating GORAN VARUS (not Sir Darris Gorran).
Your proposals should be about the REQUESTED character only, using their name from the prompt.

⚠️ CRITICAL: NEVER REPEAT QUESTIONS ⚠️
If the user input includes a "previous_decisions" object, those topics have ALREADY been decided.
DO NOT create proposals for ANY topic mentioned in previous_decisions.
DO NOT ask about topics that are semantically similar to previously decided topics.
Asking duplicate questions wastes the user's time and will be considered a critical failure.

Analyze the user prompt and produce a Design Brief JSON with:
- deliverable: type of content ("scene"|"encounter"|"npc"|"item"|"adventure")
- story_clock: narrative timing/urgency (optional)
- threads: story threads to weave in (optional)
- retrieval_hints: { entities: [], regions: [], eras: [], keywords: [] }
- proposals: array of questions for the user
  - Each proposal object MUST use these fields only:
    - id (string, slug)
    - topic (string)
    - question (string)
    - options (string[])
    - default (string, MUST equal one of options)
    - required (boolean)
  - Forbidden fields: choices, selection, any other keys
- allow_invention: from flags
- rule_base: from flags
- tone: from flags
- mode: from flags ("GM"|"player")
- difficulty: from flags
- realism: from flags

CRITICAL INSTRUCTIONS FOR ACCURACY:
1. READ ALL provided canon facts THOROUGHLY - do not skip or skim
2. Do NOT invent ANY facts that are not in the Relevant Canon provided
3. If canon mentions a location, character, or item - USE IT EXACTLY as described
4. If information is not in the canon - note it in retrieval_hints, do NOT make it up
5. Be 100% ACCURATE and 100% PRECISE with canon facts
6. Take your time - accuracy is more important than speed

CANON FACTS ARE YOUR DEFAULTS:
7. If canon provides a fact (e.g., "Androids have INT 16"), USE IT as the default value
8. DO NOT ask about information that canon explicitly provides unless there's genuine ambiguity
9. Example: If canon says "Int 16", set Int 16. Don't ask "should it be 16, 18, or 20?"
10. Example: If canon describes a power's mechanics (e.g., "Cyber-reflex at rank 3 grants +2 AC"), USE those exact mechanics

PROPOSALS - ONLY FOR TRUE AMBIGUITY:
11. ONLY create proposals[] for:
    - Information NOT in canon (custom items, specific tactics, narrative choices)
    - Genuine ambiguity where canon has conflicting information
    - Design choices where multiple valid interpretations exist
    - Information the user didn't specify (e.g., what effect does "sleep arrow" cause?)
12. DO NOT create proposals for information canon explicitly provides
13. DO NOT create proposals for basic stat calculations you can do yourself

The Relevant Canon below contains ALL facts from the database that relate to the keywords in this request.
If you need a fact and it's not listed - it does not exist in canon yet.

Choose conservative defaults. Output ONLY valid JSON.`,
    buildUserPrompt: (context) => {
      // For chunk 1 with large prompts, truncate to fit since detailed prompts are less critical in intro chunks
      let promptToUse = context.config.prompt;
      let flagsToUse = context.config.flags;

      if (context.chunkInfo?.currentChunk === 1) {
        // Truncate prompt if too large
        if (promptToUse && promptToUse.length > 1500) {
          console.log(`[Planner Chunk 1] Truncating prompt from ${promptToUse.length} to 1500 chars`);
          promptToUse = promptToUse.substring(0, 1500) + '\n\n[... remainder in subsequent chunks ...]';
        }

        // Simplify flags for chunk 1 if they're huge
        const flagsJson = JSON.stringify(flagsToUse);
        if (flagsJson.length > 500) {
          console.log(`[Planner Chunk 1] Simplifying flags from ${flagsJson.length} to minimal set`);
          flagsToUse = {
            allow_invention: flagsToUse?.allow_invention,
            rule_base: flagsToUse?.rule_base,
            mode: flagsToUse?.mode,
            tone: flagsToUse?.tone || 'balanced',
            difficulty: flagsToUse?.difficulty || 'standard',
            realism: flagsToUse?.realism || 'cinematic',
          };
        }
      }

      const userPrompt: any = {
        prompt: promptToUse,
        type: context.config.type,
        flags: flagsToUse,
        relevant_canon: createMinimalFactpack(context.factpack),
      };

      // Add chunk information if this is a multi-part generation
      if (context.chunkInfo?.isChunked) {
        const isFirstChunk = context.chunkInfo.currentChunk === 1;
        const isLastChunk = context.chunkInfo.currentChunk === context.chunkInfo.totalChunks;

        userPrompt.chunk_info = {
          message: isLastChunk
            ? `⚠️ FINAL CHUNK (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}): All canon has been provided. This is your last chance to refine.`
            : `📦 CHUNK ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}): More canon will come in subsequent parts.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
          data_status: isFirstChunk
            ? "Initial draft - no previous corrections"
            : "⚠️ UPDATED WITH CORRECTIONS from previous chunk(s). This incorporates your latest decisions and refinements.",
        };
      }

      // Include unanswered proposals from previous chunk for AI to attempt answering
      if (context.unansweredProposals && context.unansweredProposals.length > 0) {
        userPrompt.unanswered_questions_from_previous_chunk = context.unansweredProposals;
        userPrompt.ANSWER_QUESTIONS_INSTRUCTION = `⚠️ CRITICAL: The above unanswered_questions_from_previous_chunk contains ${context.unansweredProposals.length} questions from the previous chunk that you could not answer with those facts. NOW, with the NEW facts in relevant_canon, ATTEMPT TO ANSWER these questions. If you can definitively answer a question using the new facts, DO NOT include it in your proposals[] array. ONLY include questions in proposals[] that you STILL cannot answer with the combined facts from all chunks so far. This reduces the burden on the user.`;
      }

      // Include previous decisions to avoid asking the same questions again
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ FORBIDDEN: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} decisions already made in previous chunks or stages. You MUST NOT create proposals[] entries for these topics. You MUST NOT ask similar or related questions. Repeating questions is a critical error.`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Creator',
    routerKey: 'creator',
    systemPrompt: LEGACY_CREATOR_SYSTEM_PROMPT,
    buildUserPrompt: (context) => {
      const deliverableType = resolveLegacyDeliverableType(context);
      const userPrompt: any = {
        original_user_request: context.config.prompt,  // CRITICAL: Include original prompt so AI knows what to create
        type: context.config.type,
        brief: stripStageOutput(context.stageResults.planner as JsonRecord),
        flags: context.config.flags,
        // Include Purpose stage results for format adaptation
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        deliverable_type: deliverableType !== 'unknown' ? deliverableType : undefined,
        output_schema: getLegacyDeliverableSchemaHint(context),
      };

      // NPC SECTION-BASED CHUNKING: Inject section-specific instructions
      if (context.npcSectionContext?.isNpcSectionChunking && context.npcSectionContext.currentSection) {
        const section = context.npcSectionContext.currentSection;
        const sectionIndex = context.npcSectionContext.currentSectionIndex;
        const accumulated = context.npcSectionContext.accumulatedSections;

        userPrompt.NPC_SECTION_INSTRUCTIONS = section.instructions;
        userPrompt.SECTION_NUMBER = `Section ${sectionIndex + 1} of ${context.chunkInfo?.totalChunks || 1}`;
        userPrompt.SECTION_NAME = section.chunkLabel;

        // Include accumulated sections from previous chunks for context
        if (section.includePreviousSections && Object.keys(accumulated).length > 0) {
          userPrompt.previous_sections = accumulated;
          userPrompt.SECTION_BUILD_INSTRUCTION = `⚠️ CRITICAL: The previous_sections field contains the NPC data created in earlier sections. Build upon this foundation. DO NOT re-output these fields - only output the NEW fields for this section (${section.outputFields.join(', ')}). The system will merge them automatically.`;
        }

        console.log(`[NPC Section Chunking] Injecting instructions for section: ${section.chunkLabel}`);
      }

      // OPTIMIZATION: Don't resend canon if Planner already provided it in same AI session
      // In copy-paste workflow, all prompts go to SAME AI chat session, so AI remembers previous canon
      appendLegacyRelevantCanon(userPrompt, context, 2400);

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        const isFirstChunk = context.chunkInfo.currentChunk === 1;
        const isLastChunk = context.chunkInfo.currentChunk === context.chunkInfo.totalChunks;

        userPrompt.chunk_info = {
          message: isLastChunk
            ? `⚠️ FINAL CHUNK (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}): All canon provided. Finalize your work.`
            : `📦 CHUNK ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}): More canon coming in next chunk.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
          data_status: isFirstChunk
            ? "Initial creation - working from Design Brief"
            : "⚠️ UPDATED CONTENT from previous chunk(s). The 'brief' field contains your latest corrections and decisions. Build upon this updated version, don't revert to original.",
        };
      }

      // Include unanswered proposals from previous chunk for AI to attempt answering
      if (context.unansweredProposals && context.unansweredProposals.length > 0) {
        userPrompt.unanswered_questions_from_previous_chunk = context.unansweredProposals;
        userPrompt.ANSWER_QUESTIONS_INSTRUCTION = `⚠️ CRITICAL: The above unanswered_questions_from_previous_chunk contains ${context.unansweredProposals.length} questions from the previous chunk that could not be answered with those facts. NOW, with the NEW facts in relevant_canon, ATTEMPT TO ANSWER these questions. If you can definitively answer a question using the new facts, DO NOT include it in your proposals[] array. ONLY include questions in proposals[] that you STILL cannot answer with the combined facts from all chunks so far. This reduces the burden on the user.`;
      }

      // Include previous decisions
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ MANDATORY: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} decisions already made by the user. You MUST:
1. INCORPORATE these decisions directly into the structured output for this deliverable
2. UPDATE the relevant fields so the output reflects those answers exactly
3. NOT create proposals[] entries for ANY of these topics
4. NOT ask similar or related questions
Failing to incorporate user decisions is a critical error - the user already answered these questions!`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Fact Checker',
    routerKey: 'fact_checker',
    systemPrompt: `You are the Canon Fact Checker for game content generation.
Evaluate the Creator draft against the Relevant Canon facts.

CRITICAL TASKS:
1. Conflicts: cite any draft claims that contradict canon. Provide field_path, summary, details, severity (critical|major|minor), chunk_id, canon_fact, suggested_fix.
2. Ambiguities: list vague statements needing clarification with field_path, text, clarification_needed, recommended_revision.
3. Unassociated: flag claims lacking canon support with field_path, text, reason, suggested_action (ask_user|discard|keep).
4. Revision Prompt: craft a JSON-safe string instructing the Authoring AI to resolve conflicts, harden ambiguous text, and consult the user on unassociated content.
5. User Questions: gather concrete questions for each "ask_user" item.
6. Summary: short recap of counts and critical findings.

Output STRICT JSON:
{
  "conflicts": [...],
  "ambiguities": [...],
  "unassociated": [...],
  "revision_prompt": string,
  "user_questions": string[],
  "summary": string
}`,
    buildUserPrompt: (context) => {
      // Get full draft
      const fullDraft = stripStageOutput(context.stageResults.creator as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let draftToUse = fullDraft;
      if (context.chunkInfo?.currentChunk === 1) {
        const draftJson = JSON.stringify(fullDraft);
        if (draftJson.length > 5000) {
          console.log(`[Fact Checker Chunk 1] Draft is large (${draftJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          draftToUse = {
            name: fullDraft.name,
            type: context.config.type,
            schema_version: fullDraft.schema_version,
            challenge_rating: fullDraft.challenge_rating,
            _summary: `[Large draft - ${draftJson.length} chars. Full fact-checking in chunk 2. For now, minimal validation only.]`,
            _field_count: Object.keys(fullDraft).length,
          };
        }
      }

      const userPrompt: any = {
        draft: draftToUse,
        deliverable: context.config.type,
        flags: context.config.flags,
      };

      appendLegacyRelevantCanon(userPrompt, context, 3200);

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full draft will be provided in next chunk for detailed fact-checking.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full draft provided. Perform thorough fact-checking now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      // Include previous decisions for context
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.note = "Previous decisions were already made. Do NOT flag these as issues.";
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Stylist',
    routerKey: 'stylist',
    systemPrompt: LEGACY_STYLIST_SYSTEM_PROMPT,
    buildUserPrompt: (context) => {
      const deliverableType = resolveLegacyDeliverableType(context);

      // Get full content
      const fullDraft = stripStageOutput(context.stageResults.creator as JsonRecord);
      const fullFactCheck = stripStageOutput(context.stageResults.fact_checker as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let draftToUse = fullDraft;
      let factCheckToUse = fullFactCheck;

      if (context.chunkInfo?.currentChunk === 1) {
        const draftJson = JSON.stringify(fullDraft);
        if (draftJson.length > 5000) {
          console.log(`[Stylist Chunk 1] Draft is large (${draftJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          draftToUse = {
            name: fullDraft.name,
            type: context.config.type,
            schema_version: fullDraft.schema_version,
            challenge_rating: fullDraft.challenge_rating,
            _summary: `[Large draft - ${draftJson.length} chars. Full styling/normalization in chunk 2. For now, pass through as-is.]`,
            _field_count: Object.keys(fullDraft).length,
          };
        }

        const factCheckJson = JSON.stringify(fullFactCheck);
        if (factCheckJson.length > 3000) {
          console.log(`[Stylist Chunk 1] Fact check is large (${factCheckJson.length} chars). Sending minimal summary.`);
          factCheckToUse = {
            _summary: `[Large fact check - ${factCheckJson.length} chars. Full details in chunk 2.]`,
          };
        }
      }

      const userPrompt: any = {
        draft: draftToUse,
        tone: context.config.flags.tone,
        mode: context.config.flags.mode,
        fact_check: factCheckToUse,
        deliverable_type: deliverableType !== 'unknown' ? deliverableType : context.config.type,
        // Include Purpose stage results for schema adaptation
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        normalized_output_schema: getLegacyDeliverableSchemaHint(context),
      };

      appendLegacyRelevantCanon(userPrompt, context, 2800);

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full draft will be provided in next chunk for detailed styling/normalization.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full draft provided. Apply thorough styling and normalization now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      // Include previous decisions so they can be incorporated during styling/normalization
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ MANDATORY: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} user decisions. While normalizing:
1. INCORPORATE these decisions into the normalized output exactly as answered
2. PRESERVE all relevant details from those user answers in the final structure
3. DO NOT create new proposals for these topics
Failing to incorporate user decisions during normalization is a critical error!`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Canon Validator',
    routerKey: 'canon_validator',
    systemPrompt: `You are the Canon Validator for game content generation.
Your job is to detect conflicts between the generated content and existing canon facts.

CRITICAL RULES FOR THOROUGHNESS:
1. READ EVERY SINGLE FACT in the Relevant Canon below - do NOT skip any
2. Compare ALL claims in the generated content against EVERY fact in the Relevant Canon
3. TAKE YOUR TIME - be thorough and meticulous in your analysis
4. Detect contradictions in:
   - Entity states (alive vs dead, friendly vs hostile, etc.)
   - Locations (destroyed vs intact, abandoned vs inhabited, etc.)
   - Temporal consistency (events in wrong era, anachronisms)
   - Relationship contradictions (enemy vs ally, etc.)
   - Physical descriptions (appearance, size, abilities)
   - Historical events (timeline, causality)
5. For each conflict found, provide:
   - new_claim: what the generated content says
   - existing_claim: what canon says (quote the exact fact)
   - entity_name: which entity is affected
   - conflict_type: type of contradiction
   - severity: "critical" (breaks canon) | "minor" (questionable but acceptable)
6. Add validation metadata to the content:
   - conflicts: array of detected conflicts
   - canon_alignment_score: 0-100 (100 = perfect alignment, deduct points for each conflict)
   - validation_notes: any additional observations
7. Be 100% ACCURATE in identifying conflicts - false positives waste user time
8. Be 100% PRECISE - quote exact facts from canon when noting conflicts

The Relevant Canon below contains all facts that relate to this content.
Read them ALL carefully before validating.

⚠️ CRITICAL: DO NOT CREATE OR MODIFY PROPOSALS ⚠️
You are a VALIDATOR, not a question-asker. Do NOT add to proposals[].
Document resolved conflicts and corrections in validation_notes, NOT in proposals[].
Copy the existing proposals[] array EXACTLY as-is if present.

Output the SAME JSON content with added fields:
- conflicts: [...]
- canon_alignment_score: number
- validation_notes: string`,
    buildUserPrompt: (context) => {
      // Get full content
      const fullContent = stripStageOutput(context.stageResults.stylist as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let contentToUse = fullContent;
      if (context.chunkInfo?.currentChunk === 1) {
        const contentJson = JSON.stringify(fullContent);
        if (contentJson.length > 5000) {
          console.log(`[Canon Validator Chunk 1] Content is large (${contentJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          contentToUse = {
            name: fullContent.name,
            type: context.config.type,
            schema_version: fullContent.schema_version,
            challenge_rating: fullContent.challenge_rating,
            _summary: `[Large content - ${contentJson.length} chars. Full validation in chunk 2. For now, perform basic metadata validation only.]`,
            _field_count: Object.keys(fullContent).length,
          };
        }
      }

      const userPrompt: any = {
        content: contentToUse,
        relevant_canon: createMinimalFactpack(context.factpack, 5000), // Limit to 5000 chars for canon validation
      };

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full content will be provided in next chunk for detailed validation.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full content provided. Perform thorough validation now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Physics Validator',
    routerKey: 'physics_validator',
    systemPrompt: `You are the Physics & Logic Validator for game content generation.
Your job is to ensure the content is internally consistent and follows game physics/logic.

CRITICAL RULES FOR THOROUGHNESS:
1. READ the entire generated content carefully - do NOT skip sections
2. TAKE YOUR TIME - be thorough in checking every detail
3. Check for logical inconsistencies:
   - Impossible actions (walking through walls without magic, etc.)
   - Rule violations (wrong spell levels, incorrect damage types, etc.)
   - Timeline contradictions (events in wrong order)
   - Geography violations (impossible distances, wrong terrain types)
   - Power level mismatches (CR too low/high for described abilities)
   - Internal contradictions (content contradicts itself)
4. For each issue found, provide:
   - issue_type: "rule_violation" | "logic_error" | "balance_issue" | "impossibility"
   - description: what's wrong (be specific)
   - location: where in the content (e.g., "encounter_details.enemies[0]")
   - severity: "critical" | "moderate" | "minor"
   - suggestion: how to fix it
5. Validate against the specified rule_base (5e, PF2e, etc.)
6. Add validation metadata:
   - physics_issues: array of detected issues
   - logic_score: 0-100 (100 = perfectly consistent, deduct points for each issue)
   - balance_notes: observations about game balance
7. Be 100% ACCURATE - false positives waste user time
8. Be 100% PRECISE - cite specific rules or logic principles when identifying issues

The Relevant Canon is provided for context about the world's established facts.

⚠️ CRITICAL: DO NOT CREATE OR MODIFY PROPOSALS ⚠️
You are a VALIDATOR, not a question-asker. Do NOT add to proposals[].
Document issues and corrections in balance_notes, NOT in proposals[].
Copy the existing proposals[] array EXACTLY as-is if present.

Output the SAME JSON content with added fields:
- physics_issues: [...]
- logic_score: number
- balance_notes: string`,
    buildUserPrompt: (context) => {
      // Get full content
      const fullContent = stripStageOutput(context.stageResults.canon_validator as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let contentToUse = fullContent;
      if (context.chunkInfo?.currentChunk === 1) {
        const contentJson = JSON.stringify(fullContent);
        if (contentJson.length > 5000) {
          console.log(`[Physics Validator Chunk 1] Content is large (${contentJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          contentToUse = {
            name: fullContent.name,
            type: context.config.type,
            schema_version: fullContent.schema_version,
            challenge_rating: fullContent.challenge_rating,
            _summary: `[Large content - ${contentJson.length} chars. Full validation in chunk 2. For now, perform basic metadata validation only.]`,
            _field_count: Object.keys(fullContent).length,
          };
        }
      }

      const userPrompt: any = {
        content: contentToUse,
        relevant_canon: createMinimalFactpack(context.factpack, 4000), // Limit to 4000 chars for physics validation
        rule_base: context.config.flags.rule_base,
        difficulty: context.config.flags.difficulty,
      };

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full content will be provided in next chunk for detailed validation.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full content provided. Perform thorough validation now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
];

const NORMALIZED_NPC_STAGES = normalizeWorkflowStageSet('npc', NPC_CREATOR_STAGES);
const NORMALIZED_NPC_STAGE_ROUTER_MAP = normalizeWorkflowStageMap('npc', STAGE_ROUTER_MAP);
const NORMALIZED_NONFICTION_STAGES = normalizeWorkflowStageSet('nonfiction', NONFICTION_BOOK_STAGES);
const NORMALIZED_MONSTER_STAGES = normalizeWorkflowStageSet('monster', MONSTER_CREATOR_STAGES);
const NORMALIZED_ENCOUNTER_STAGES = normalizeWorkflowStageSet('encounter', ENCOUNTER_CREATOR_STAGES);
const NORMALIZED_ITEM_STAGES = normalizeWorkflowStageSet('item', ITEM_CREATOR_STAGES);
const NORMALIZED_STORY_ARC_STAGES = normalizeWorkflowStageSet('story_arc', STORY_ARC_CREATOR_STAGES);
const NORMALIZED_LOCATION_STAGES = normalizeWorkflowStageSet('location', LOCATION_CREATOR_STAGES);

export const MANUAL_GENERATOR_STAGE_CATALOG = {
  genericStages: GENERIC_STAGES,
  nonfictionStages: NORMALIZED_NONFICTION_STAGES,
  npcStages: NORMALIZED_NPC_STAGES,
  npcStageRouterMap: NORMALIZED_NPC_STAGE_ROUTER_MAP,
  monsterStages: NORMALIZED_MONSTER_STAGES,
  encounterStages: NORMALIZED_ENCOUNTER_STAGES,
  itemStages: NORMALIZED_ITEM_STAGES,
  storyArcStages: NORMALIZED_STORY_ARC_STAGES,
  locationStages: NORMALIZED_LOCATION_STAGES,
};
