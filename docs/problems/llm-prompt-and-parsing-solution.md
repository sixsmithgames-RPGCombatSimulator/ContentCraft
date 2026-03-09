You’ve got three separate problems layered together:

stage outputs are “bleeding” into other stages (model returns a full NPC blob even when the stage only asked for one slice)

your retry contract is conflicting / noisy (the model is being instructed to do two different things, plus you’re feeding it giant “additional_critical_instructions” blocks that re-prime the wrong shape)

pipeline control-flow isn’t enforcing gates (proposals aren’t stopping the run; errors aren’t surfaced/terminating cleanly)

Below is a thorough fix plan, and a full prompt rewrite that removes unnecessary instructions (handled by parsing) and removes conflicts.

A. What the logs prove (root causes)
A1) Keyword Extractor stage is not isolated

Your Keyword Extractor system prompt demands only:

{ "keywords": [...] }

But Gemini returned:

keywords (good)

plus personality/ability_scores/speed/etc (bad stage contamination)

You’re currently “getting away with it” because your code only reads keywords. But the model is learning that dumping a full NPC skeleton is acceptable.

Fix: strict output isolation (allowed keys per stage) + pruning + stage-specific AJV.

A2) Basic Info stage is producing fields owned by later stages

Basic Info output includes:

personality object

ability_scores

speed

etc.

That’s a major conflict: Core Details and Stats stages are supposed to create those.

Fix: Basic Info prompt must forbid those keys AND your server must discard them even if the model emits them.

A3) Core Details stage failed because the model is primed to return the “NPC blob”

Core Details contract requires 9 flat arrays. Gemini returned only hooks plus the same blob keys again.

Then your “repair_text” retry contract is a new output shape, but the user payload includes a huge, conflicting instruction blob that also says “MANDATORY OUTPUT … arrays” while simultaneously saying “RETRY FORMAT OVERRIDE … repair_text”.

Even though that’s technically consistent, it’s cognitively noisy, and the retry prompt includes the last failed output and conflicts object, which further anchors the model to the wrong structure.

Fix: do not change output shape on retry. Use patch-style retry with the same JSON keys every time.

A4) Planner proposals exist, but you didn’t gate on them

Planner output includes proposals. The pipeline proceeds immediately to Creator stages. That’s a control-flow bug, not a prompting bug.

Fix: after Planner, if proposals.length > 0 and there are no user decisions, pipeline must pause and prompt the user (or auto-select defaults and record them).

A5) Stage 5 (Character Build) 422 “No JSON object found” stalled the workflow

You have a hard parser that rejects anything without a clean {...} object. The model likely returned prose or markdown (or an empty response). You logged it, but the UI/state machine did not terminate cleanly.

Fix: robust JSON extraction + error propagation + fail-fast stage state (no “silent stall”).

B. Hard rules to adopt (these eliminate your class of failures)

One stage = one slice. Every stage has:

allowedKeys (exact)

requiredKeys

AJV schema for that slice only

After parsing model JSON:

prune to allowedKeys

validate requiredKeys exist and types match

ONLY THEN merge into accumulatedAnswers

Retries never change output shape.

Retry prompt should say: “Return the same JSON object shape. Replace missing/empty fields. Do not add new keys.”

Parsing is your job, not the model’s.

Stop repeating “start with { end with }”

Instead implement extractFirstJsonObject() that can pull JSON from markdown fences or surrounding text

Then validate + prune

Planner proposals are a gate.

If proposals exist and no user_decisions, stop.

C. Prompt rewrite: minimal, non-conflicting, stage-isolated

Below are revised SYSTEM prompts. They assume you already wrap user inputs as JSON under “Stage Inputs”.

C1) Keyword Extractor (system prompt)
You are a Keyword Extraction module.

Input: a JSON object with key "user_prompt" (string).
Output: JSON with EXACTLY one key: "keywords".

Rules:
- Return 5–15 keywords/phrases maximum.
- Prefer proper nouns, factions, places, items, titles, abilities, creature types, and setting-specific concepts.
- Exclude filler words and generic adjectives.

Output format:
{ "keywords": ["..."] }
C2) Planner (system prompt) — add IDs + defaults, remove bloat
You are the Planner. Produce a design brief for the requested deliverable.

Output JSON with keys:
- deliverable: "npc"
- retrieval_hints: { entities: string[], regions: string[], eras: string[], keywords: string[] }
- proposals: array of { id: string, topic: string, question: string, options: string[], default: string, required: boolean }
- assumptions: string[]  (only if needed)
- flags_echo: { allow_invention, tone, rule_base, mode, difficulty, realism }

Rules:
- If the user already specified something (e.g., “no legendary actions”), do not propose it.
- Only propose true ambiguities that affect later stages (subclass/oath, spell focus, loadout details, deity tie, etc.).
- If you propose something, provide a reasonable default and mark required=true only if downstream stages cannot proceed without it.
C3) Creator: Basic Info (system prompt) — MUST NOT emit stats/personality/equipment
You are the NPC Creator (Basic Info slice).

Return JSON with ONLY these keys (no extras):
- name: string
- title: string (optional, but include if obvious)
- description: string (2–4 sentences)
- appearance: string
- background: string
- species: string
- alignment: string
- class_levels: array of { class: string, level: number }
- location: string (optional if known)
- affiliation: string (optional if known)

Forbidden keys (do not output them): ability_scores, hit_points, armor_class, speed, senses, personality, equipment, feats, class_features, spells, legendary_actions.

If an optional field is unknown, omit it (do not add empty strings).
C4) Creator: Core Details (system prompt) — same shape always, no repair_text
You are the NPC Creator (Core Details slice).

Return JSON with ONLY these keys (no extras):
- personality_traits: string[]
- ideals: string[]
- bonds: string[]
- flaws: string[]
- goals: string[]
- fears: string[]
- quirks: string[]
- voice_mannerisms: string[]
- hooks: string[]

Minimum: 3 items per array. No placeholders. No empty strings.
Do not return a nested "personality" object.

Retry (system prompt) — patch style, SAME SHAPE:

You are fixing an invalid Core Details slice.

Return the SAME JSON shape with the 9 arrays:
personality_traits, ideals, bonds, flaws, goals, fears, quirks, voice_mannerisms, hooks.

Replace any missing or empty arrays with 3–6 concrete items each.
Return ONLY those 9 keys, no extras.
C5) Creator: Stats (system prompt) — fix type conflicts

Right now you instruct “speed.walk: integer” but your outputs use "30 ft." strings. Pick one and enforce it.

Strong recommendation: store numbers; render units in UI.

You are the NPC Creator (Stats slice).

Return JSON with ONLY these keys:
- ability_scores: { str: number, dex: number, con: number, int: number, wis: number, cha: number }
- proficiency_bonus: number
- speed: { walk: number, fly?: number, swim?: number, climb?: number, burrow?: number }
- armor_class: { value: number, breakdown: string }
- hit_points: { average: number, formula: string }
- senses: string[]

Rules:
- speed values are numbers (feet). Example: walk: 30
- ability_scores keys must be lowercase: str,dex,con,int,wis,cha
- senses strings include units (e.g., "darkvision 60 ft.")
Return only these keys; no personality/equipment/etc.
C6) Creator: Character Build (system prompt) — reduce verbosity, isolate keys, allow partial chunking

This stage is where Gemini often returns prose or times out. Make it smaller and optionally split it.

Option A: keep one stage but isolate keys hard:

You are the NPC Creator (Character Build slice).

Return JSON with ONLY these keys:
- class_features: { name: string, level: number, description: string, source: string }[]
- subclass_features: same shape[]
- racial_features: { name: string, description: string, source: string }[]
- feats: { name: string, description: string, source: string }[]
- fighting_styles: { name: string, description: string, source: string }[]
- skill_proficiencies: { name: string, value: string }[]
- saving_throws: { name: string, value: string }[]

Rules:
- Include features appropriate for an 11th-level paladin (rule_base as provided).
- Keep descriptions concise but complete (2–5 sentences per feature).
- Values in skill_proficiencies/saving_throws must be signed strings (e.g., "+7").
Return only these keys.

Option B (recommended for reliability): split Character Build into 2–3 sub-stages:

Build: Features (class+subclass)

Build: Traits (racial+feats+styles)

Build: Proficiencies (skills+saves)

This massively reduces “no JSON found” incidents.

C7) Creator: Equipment (system prompt) — isolate keys
You are the NPC Creator (Equipment slice).

Return JSON with ONLY these keys:
- weapons: { name: string, notes?: string }[]
- armor_and_shields: { name: string, notes?: string }[]
- wondrous_items: { name: string, notes?: string }[]
- consumables: { name: string, quantity: number, notes?: string }[]
- other_gear: { name: string, notes?: string }[]

Use the user request as the source of truth for named items.
Return only these keys.
D. Remove “unnecessary instructions” by fixing parsing (this is mandatory)

Your 422 “No JSON object found” is a parsing fragility. Fix that once and you can delete 50% of your prompt boilerplate.

Implement a robust extractor:

export function extractFirstJsonObject(text: string): string | null {
  // 1) Prefer fenced blocks ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text;

  // 2) Find first '{' and parse by brace matching (string-aware)
  const start = candidate.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];

    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === "\"") { inStr = false; continue; }
      continue;
    } else {
      if (ch === "\"") { inStr = true; continue; }
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  return null;
}

Then:

parse JSON

prune keys

validate with AJV

Now you can remove repetitive “NO prose / start with { / end with }” boilerplate from prompts.

E. Enforce stage isolation in code (prevents personality/stats bleeding)

For each stage define:

type StageKey =
  | "keywordExtractor"
  | "planner"
  | "basicInfo"
  | "coreDetails"
  | "stats"
  | "characterBuild"
  | "equipment";

interface StageContract {
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
}

const STAGE_CONTRACTS: Record<StageKey, StageContract> = {
  keywordExtractor: { allowedKeys: ["keywords"], requiredKeys: ["keywords"] },
  planner: { allowedKeys: ["deliverable","retrieval_hints","proposals","assumptions","flags_echo"], requiredKeys: ["deliverable","retrieval_hints","proposals","flags_echo"] },
  basicInfo: { allowedKeys: ["name","title","description","appearance","background","species","alignment","class_levels","location","affiliation"], requiredKeys: ["name","description","appearance","background","species","alignment","class_levels"] },
  coreDetails: { allowedKeys: ["personality_traits","ideals","bonds","flaws","goals","fears","quirks","voice_mannerisms","hooks"], requiredKeys: ["personality_traits","ideals","bonds","flaws","goals","fears","quirks","voice_mannerisms","hooks"] },
  stats: { allowedKeys: ["ability_scores","proficiency_bonus","speed","armor_class","hit_points","senses"], requiredKeys: ["ability_scores","proficiency_bonus","speed","armor_class","hit_points","senses"] },
  characterBuild: { allowedKeys: ["class_features","subclass_features","racial_features","feats","fighting_styles","skill_proficiencies","saving_throws"], requiredKeys: ["class_features","subclass_features","racial_features","feats","fighting_styles","skill_proficiencies","saving_throws"] },
  equipment: { allowedKeys: ["weapons","armor_and_shields","wondrous_items","consumables","other_gear"], requiredKeys: ["weapons","armor_and_shields","wondrous_items","consumables","other_gear"] },
};

Then prune:

function pruneToAllowedKeys<T extends Record<string, unknown>>(
  obj: T,
  allowedKeys: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of allowedKeys) if (k in obj) out[k as keyof T] = obj[k];
  return out;
}

This alone stops the “NPC blob” from polluting later stages.

F. Fix the proposals bug (why user wasn’t prompted)

After Planner:

If proposals.length > 0 and there is no user_decisions recorded, the generator must STOP and surface proposals in UI.

State machine rule:

if (stage === "planner" && result.proposals?.length) {
  if (!session.userDecisions || Object.keys(session.userDecisions).length === 0) {
    setSessionStatus("awaiting_user_decisions");
    return; // do not advance
  }
}

If you want “auto” mode:

pick default for each proposal

write to userDecisions

continue

Right now you are always “continue”, which is why it never prompted.

G. Fix the stall (errors must terminate the run)

When you get a 422 INVALID_RESPONSE:

set session.status = "error"

store lastError = { stage, message, rawResponseSnippet }

stop scheduling further stage runs

render an error card with a “Retry stage” button

Also: your gate logs show “skip: awaiting compiled stage request” repeatedly. That’s a symptom of “runner state not reset on error” or “stage queue not cleared”.

Minimum rule: any non-retryable error clears:

inFlightRequest

pendingStageRequest

autoStart timers

H. The specific conflicts to remove from your current prompts

Remove duplicate “CRITICAL OUTPUT REQUIREMENT” blocks repeated in every stage. Put that in code as a shared prefix if you still want it.

Remove “TAKE YOUR TIME” and similar filler. It doesn’t increase compliance; it increases token waste.

Remove “Start with { end with }” once your parser is fixed.

Remove any mention of “personality” from Basic Info and Stats prompts entirely.

Delete the “repair_text” alternate contract. It’s not working and it complicates parsing/validation. Patch with the same JSON schema instead.