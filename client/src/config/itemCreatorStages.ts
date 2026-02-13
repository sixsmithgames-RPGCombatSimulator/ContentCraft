/**
 * Specialized Magic Item Creator Stages
 *
 * Breaks down magic item creation into 3 focused sub-stages optimized for D&D 5e
 * items with properties, mechanics, lore, curses, and sentience.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  getItemConceptSchema,
  getItemMechanicsSchema,
  getItemLoreSchema,
  formatItemSchemaForPrompt,
} from '../utils/itemSchemaExtractor';

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

const BASE_ITEM_SYSTEM_PROMPT = `You are a D&D 5e Magic Item Creator — a specialist in designing balanced, flavorful, and mechanically interesting magic items.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

⚠️ CRITICAL: IDENTITY & PURPOSE ⚠️
The user prompt specifies the EXACT item to create.
Canon facts are PROVIDED FOR REFERENCE to inform the design.
DO NOT substitute or confuse the requested item with other items mentioned in canon.

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
 * Stage 1: Concept & Rarity
 */
export const ITEM_CREATOR_CONCEPT = {
  name: 'Creator: Concept',
  routerKey: 'concept',
  systemPrompt: `${BASE_ITEM_SYSTEM_PROMPT}

You are creating the CONCEPT & RARITY section of a magic item.

Your focus:
- name: Evocative item name
- item_type: weapon, armor, shield, wondrous, potion, scroll, ring, rod, staff, wand, ammunition, other
- item_subtype: Specific base item (e.g., 'longsword', 'plate armor', 'cloak', 'amulet')
- rarity: common, uncommon, rare, very rare, legendary, artifact
- attunement: { required: boolean, restrictions?: string }
- description: Full description (2-4 sentences minimum)
- appearance: Physical appearance and distinctive visual features
- weight: Item weight
- value: Approximate market value

${formatItemSchemaForPrompt(getItemConceptSchema(), 'Concept & Rarity')}

D&D 5E ITEM RARITY REFERENCE:
- Common: Minor effects, no combat advantage. ~50-100 gp.
- Uncommon: Useful but not powerful. +1 weapons/armor. ~100-500 gp.
- Rare: Significant power. +2 weapons/armor. ~500-5,000 gp.
- Very Rare: Major power. +3 weapons/armor. ~5,000-50,000 gp.
- Legendary: Campaign-defining. ~50,000+ gp.
- Artifact: World-shaping. Priceless.

ATTUNEMENT GUIDELINES:
- Items with persistent effects typically require attunement
- Consumables (potions, scrolls) never require attunement
- +1 weapons/armor typically do NOT require attunement
- +2/+3 weapons/armor and items with active abilities typically DO require attunement
- Add restrictions (class, alignment) only when thematically appropriate`,

  buildUserPrompt: (context: StageContext) => {
    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'item',
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
 * Stage 2: Properties & Mechanics
 */
export const ITEM_CREATOR_MECHANICS = {
  name: 'Creator: Mechanics',
  routerKey: 'mechanics',
  systemPrompt: `${BASE_ITEM_SYSTEM_PROMPT}

You are creating the PROPERTIES & MECHANICS section of a magic item.

You are building upon the Concept stage. Design mechanics appropriate for the item's rarity.

Your focus:
- properties: Array of magical properties, each with name, description, activation, uses, recharge, save_dc, damage, bonus, duration, range
- charges: { maximum, recharge, on_last_charge } — if the item uses charges
- spells: Array of spells castable from the item with level and charge cost
- weapon_properties: Weapon stats if applicable (damage, type, properties, range, bonus)
- armor_properties: Armor stats if applicable (base_ac, bonus, type, stealth, strength)

${formatItemSchemaForPrompt(getItemMechanicsSchema(), 'Properties & Mechanics')}

CRITICAL D&D 5E ITEM BALANCE RULES:
- Common: No combat bonuses. Cantrip-level effects at best.
- Uncommon: +1 bonus OR one moderate effect. 1-3 charges, recharge at dawn.
- Rare: +2 bonus OR 2-3 moderate effects OR 1 strong effect. Up to 7 charges.
- Very Rare: +3 bonus OR multiple strong effects. Up to 10 charges.
- Legendary: Multiple powerful effects, may have drawbacks for balance. Up to 20 charges.
- Artifact: Nearly unlimited power, significant drawbacks or conditions.

CHARGE SYSTEM GUIDELINES:
- Use charges for items with multiple uses per day
- Standard recharge: "regains 1d4+1 charges daily at dawn"
- On last charge: "roll d20; on a 1, the item [crumbles/loses magic/transforms]"
- Save DCs: Uncommon=13, Rare=15, Very Rare=17, Legendary=19, Artifact=21+

MECHANICAL CLARITY:
- Every property MUST have a clear mechanical effect
- Specify activation (action, bonus action, reaction, passive)
- Specify duration for non-instantaneous effects
- Specify whether concentration is required for spell-like effects
- Include save type AND DC for any saving throw effects`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['item_concept'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'item',
      stage: 'mechanics',
      concept,
      instructions: `Design mechanics for this ${concept.rarity || ''} ${concept.item_type || 'magic'} item. Ensure balance is appropriate for rarity.`,
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for item mechanics and lore.`;
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
 * Stage 3: History & Flavor
 */
export const ITEM_CREATOR_LORE = {
  name: 'Creator: Lore',
  routerKey: 'lore',
  systemPrompt: `${BASE_ITEM_SYSTEM_PROMPT}

You are creating the HISTORY & FLAVOR section of a magic item.

You are building upon the Concept and Mechanics stages. Add depth, personality, and campaign utility.

Your focus:
- history: Creation story, historical significance (2-4 sentences)
- creator: Who created the item and how
- previous_owners: Array of notable previous owners with era and deeds
- quirks: Array of minor personality traits or cosmetic effects
- curse: { is_cursed, description, trigger, removal, hidden } — if applicable
- sentience: { is_sentient, alignment, int/wis/cha, communication, senses, purpose, personality, conflict } — if applicable
- campaign_hooks: Array of adventure hooks related to the item
- notes: GM tips

${formatItemSchemaForPrompt(getItemLoreSchema(), 'History & Flavor')}

LORE DESIGN PRINCIPLES:
- History should connect to the campaign world if canon provides context
- Previous owners create ready-made plot hooks (their descendants, rivals, unfinished business)
- Quirks make items memorable — cosmetic effects that don't affect gameplay
  Examples: "hums softly near undead", "blade glows blue in moonlight", "feels warm to the touch"
- At least 2-3 campaign hooks per item
- Hooks should range from simple (find the creator) to complex (item is key to a larger plot)

CURSE GUIDELINES (only if appropriate):
- Curses should be thematically linked to the item's purpose or history
- "Hidden" curses only reveal after attunement (remove curse or specific quest)
- Balance: curse severity should match item power (powerful items = harsher curses)

SENTIENCE GUIDELINES (only for legendary+ or thematically appropriate):
- Sentient items have personality and goals
- Conflict arises when wielder's goals oppose the item's purpose
- Communication: empathy (emotions only) → telepathy → speech
- Int/Wis/Cha should be 10-20 range (higher = more forceful personality)`,

  buildUserPrompt: (context: StageContext) => {
    const concept = stripStageOutput(context.stageResults['item_concept'] || {});
    const mechanics = stripStageOutput(context.stageResults['item_mechanics'] || {});

    const userPrompt: Record<string, unknown> = {
      original_user_request: context.config.prompt,
      deliverable: 'item',
      stage: 'lore',
      concept: { name: concept.name, item_type: concept.item_type, rarity: concept.rarity, description: concept.description },
      mechanics_summary: {
        has_charges: !!mechanics.charges,
        has_spells: Array.isArray(mechanics.spells) && mechanics.spells.length > 0,
        property_count: Array.isArray(mechanics.properties) ? mechanics.properties.length : 0,
      },
      instructions: 'Create rich history, flavor, and campaign hooks for this item. Add curse/sentience ONLY if thematically appropriate.',
    };

    if (context.stageResults.planner) {
      userPrompt.canon_reference = `⚠️ Canon facts were provided in the Planner stage. Review them for item lore and history.`;
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
 * All item creator sub-stages in order
 */
export const ITEM_CREATOR_STAGES = [
  ITEM_CREATOR_CONCEPT,
  ITEM_CREATOR_MECHANICS,
  ITEM_CREATOR_LORE,
];
