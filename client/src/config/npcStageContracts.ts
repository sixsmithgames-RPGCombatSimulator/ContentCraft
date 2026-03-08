/**
 * NPC Stage Contracts
 *
 * Stage-minimal system prompts (800-1500 chars max) that replace verbose base prompts.
 * Focus on output format, required keys, and critical constraints only.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

/**
 * Base output format requirement (used by all stages).
 */
const BASE_OUTPUT_FORMAT = `⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.`;

/**
 * Base completeness requirement (used by all stages).
 */
const BASE_COMPLETENESS = `⚠️ COMPLETENESS REQUIREMENT - NO LAZY RESPONSES ⚠️
You MUST provide COMPLETE, THOROUGH data for ALL required fields.
DO NOT provide minimal or abbreviated responses.
DO NOT omit required fields.
DO NOT use placeholder values or empty arrays when real data is expected.
Incomplete responses will be REJECTED and you will be asked to retry.`;

/**
 * Basic Info stage contract.
 * Target: ~600 chars
 */
export const BASIC_INFO_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

⚠️ IDENTITY: The original_user_request is THE PRIMARY SOURCE OF TRUTH about what to create.
Canon facts are reference material — do NOT substitute the requested character with other canon characters.

**Required Keys:**
- name: string
- description: string (rich, detailed — 2-4 sentences minimum)
- appearance: string (physical appearance description)
- background: string (character's backstory)
- race: string (D&D race/species)
- alignment: string (e.g., "Lawful Good", "Chaotic Neutral")
- challenge_rating: number or string (e.g., 5, "1/2")
- class_levels: array of {class, level} (if applicable)

**Optional but Recommended:**
- title, aliases, size, creature_type, subtype, affiliation, location, era, experience_points

**Creator Role:** You are CREATING a character, not reporting canon. If canon doesn't specify details, invent them based on the concept, D&D 5e conventions, and the user request.`;

/**
 * Core Details stage contract.
 * Target: ~600 chars
 */
export const CORE_DETAILS_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys — ALL 9 must be present (flat, top-level arrays):**
1. personality_traits: array of strings (distinct characteristics)
2. ideals: array of strings (values and beliefs)
3. bonds: array of strings (personal connections and loyalties)
4. flaws: array of strings (weaknesses and vices)
5. goals: array of strings (what they want to achieve)
6. fears: array of strings (what they avoid or dread)
7. quirks: array of strings (unusual habits or mannerisms)
8. voice_mannerisms: array of strings (speech patterns, physical gestures)
9. hooks: array of strings (story hooks and adventure opportunities)

**Minimum completeness per field:** At least 3 items per array (more if obvious), no empty strings, no placeholders.

**FORBIDDEN:**
- Nested or combined personality objects (e.g., no {"personality": {...}} wrappers).
- Merging fields together or renaming keys.

**Shape example (follow exactly, flat keys only):**
{
  "personality_traits": ["bluntly honest", "protective of underdogs", "keeps meticulous notes"],
  "ideals": ["justice over law", "knowledge should be shared", "loyalty to crew"],
  "bonds": ["owes a debt to the harbor master", "sworn siblinghood with the navigator", "secret patron in the guild"],
  "flaws": ["trusts too quickly", "gambling habit", "holds grudges"],
  "goals": ["clear her captain's name", "secure a private ship", "map the storm reefs"],
  "fears": ["open ocean at night", "being powerless again", "losing her journal"],
  "quirks": ["taps quill while thinking", "collects tide glass", "sings old sea shanties off-key"],
  "voice_mannerisms": ["low gravelly voice", "pauses before revealing facts", "avoids eye contact when lying"],
  "hooks": ["a rival wants her journal", "storm cult hunts her crew", "knows a secret smuggling route"]
}

**Validation:** Do NOT skip any of the 9 fields. Do NOT combine fields. Each must be separate, labeled, flat, and non-empty.`;

/**
 * Stats stage contract.
 * Target: ~600 chars
 */
export const STATS_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys:**
- ability_scores: {str, dex, con, int, wis, cha} (integers 1-30, LOWERCASE keys only)
- proficiency_bonus: integer +2 to +9 based on level/CR
- speed: {walk: integer >= 0, fly?, swim?, climb?, burrow?}
- armor_class: integer or {value: integer, source?: string}
- hit_points: integer or {average: integer, formula: string}
- senses: array of strings (e.g., ["darkvision 60 ft.", "passive Perception 14"])

**Critical Naming Rules:**
- Ability scores: LOWERCASE only (str, dex, con, int, wis, cha) - NOT STR, DEX, etc.
- No null values unless schema explicitly allows
- All required keys must be present with valid values

**D&D 5e Rules:**
- Proficiency bonus: +2 (levels 1-4), +3 (5-8), +4 (9-12), +5 (13-16), +6 (17-20)
- Ability scores: Standard array, point buy, or rolled stats (typically 8-18 for PCs, can go higher for monsters)
- Speed: Most humanoids have 30 ft. walk speed; adjust for race/size
- AC: 10 + Dex modifier + armor + shield + other bonuses
- HP: (Hit Die average × level) + (Con modifier × level)`;

/**
 * Character Build stage contract.
 * Target: ~800 chars
 */
export const CHARACTER_BUILD_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys:**
- class_features: array of {name, description, level, source, uses?, notes?}
- subclass_features: array of {name, description, level, source, uses?, notes?}
- racial_features: array of {name, description, source?, notes?}
- feats: array of {name, description, source?, prerequisite?, notes?}
- asi_choices: array of {level, choice, details?, source_class?}
- background_feature: {background_name, feature_name, description, origin_feat?, skill_proficiencies?, tool_proficiencies?}
- abilities: array of {name, description, uses?, recharge?, notes?, source?}
- ability_scores: {str, dex, con, int, wis, cha} (LOWERCASE only)
- skill_proficiencies: array of {name, value: string like "+5"}
- saving_throws: array of {name, value: string like "+7"}
- fighting_styles: array of {name, description, source?}

**Completeness Requirements:**
- Include ALL class features from level 1 to character level (not just highlights)
- Include ALL subclass features gained at this level
- Include ALL racial traits (Darkvision, Fey Ancestry, etc.)
- Include ALL feats (from ASI, background, racial bonus, etc.)
- List ASI choices at each ASI level (4th, 8th, 12th, 16th, 19th for most classes)
- Do NOT use placeholder values or empty arrays for required fields

**Critical Rules:**
- Ability scores: LOWERCASE keys only
- Skill/save values: strings with + or - (e.g., "+5", "-1")
- No null values unless schema allows`;

/**
 * Combat stage contract.
 * Target: ~700 chars
 */
export const COMBAT_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys:**
- actions: array of {name, description, attack_bonus?, damage?, range?, notes?}
- bonus_actions: array of {name, description, uses?, notes?}
- reactions: array of {name, description, trigger?, notes?}

**Optional but Common:**
- multiattack: {description, attacks_per_action?}
- special_attacks: array of {name, description, save_dc?, damage?, notes?}

**D&D 5e Combat Rules:**
- Attack bonus = proficiency + ability modifier + magic bonus
- Damage format: "1d8+3 slashing" or "2d6+4 fire"
- Save DC = 8 + proficiency + ability modifier
- Action economy: 1 action, 1 bonus action (if available), 1 reaction per round
- Multiattack: Typically gained at level 5 for martial classes

**Completeness:**
- Include at least 2-3 actions (basic attack, class feature attack, etc.)
- Include bonus actions if class has them (e.g., Cunning Action, Flurry of Blows)
- Include reactions if applicable (e.g., Opportunity Attack, Shield spell)`;

/**
 * Equipment stage contract.
 * Target: ~500 chars
 */
export const EQUIPMENT_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys:**
- equipment: array of strings or {name, quantity?, notes?}
- attuned_items: array of {name, rarity, effects: array of strings, attunement_requirement?}

**Equipment Rules:**
- Include basic gear appropriate to class/species/level (armor, weapons, tools, adventuring gear)
- Magic items must respect rarity cap and level appropriateness
- Attuned effects MUST be incorporated into final stats/abilities
- Maximum 3 attuned items (D&D 5e attunement limit)

**Rarity Guidelines by Level:**
- Levels 1-4: Common, Uncommon
- Levels 5-10: Uncommon, Rare
- Levels 11-16: Rare, Very Rare
- Levels 17-20: Very Rare, Legendary

**Attuned Item Effects:**
- Update ability scores if item grants bonuses (e.g., Gauntlets of Ogre Power sets Str to 19)
- Update AC if item grants armor bonus (e.g., +1 armor, Ring of Protection)
- Update HP if item grants hit point maximum increase
- Add special abilities granted by items to the abilities array`;

/**
 * Spellcasting stage contract.
 * Target: ~600 chars
 */
export const SPELLCASTING_CONTRACT = `${BASE_OUTPUT_FORMAT}

${BASE_COMPLETENESS}

**Required Keys (if spellcaster):**
- spellcasting_ability: string (e.g., "Intelligence", "Wisdom", "Charisma")
- spell_save_dc: integer (8 + proficiency + ability modifier)
- spell_attack_bonus: integer (proficiency + ability modifier)
- spells_known: array of {name, level, school?, casting_time?, range?, components?, duration?, description}
- spell_slots: {1?: integer, 2?: integer, 3?: integer, ...} (by spell level)

**Optional:**
- cantrips_known: array of spell names
- prepared_spells: array of spell names (for prepared casters)
- ritual_casting: boolean
- spellcasting_focus: string

**D&D 5e Spellcasting Rules:**
- Spell slots by class level (consult class tables)
- Spell save DC = 8 + proficiency + spellcasting ability modifier
- Spell attack bonus = proficiency + spellcasting ability modifier
- Cantrips scale with character level, not class level
- Prepared casters can change prepared spells after long rest`;

/**
 * Legendary stage contract.
 * Target: ~500 chars
 */
export const LEGENDARY_CONTRACT = `${BASE_OUTPUT_FORMAT}

⚠️ REQUEST OVERRIDE: If the original_user_request says there are NO legendary actions, then do NOT invent any legendary actions, lair actions, regional effects, or legendary resistance.
In that case, return an empty/disabled legendary payload only.

**Required Keys (if legendary creature):**
- legendary_actions: {summary: string, options: array of {name, description, cost?}}
- legendary_resistance: {uses_per_day: integer, description: string}

**Optional:**
- lair_actions: array of {name, description, initiative_count?}
- regional_effects: array of {description, range?}

**If NOT legendary or explicitly forbidden by the user request:**
- legendary_actions: {actions: [], lair_actions: [], regional_effects: []}
- Omit legendary_resistance

**Legendary Action Rules:**
- Creature can take 3 legendary actions per round
- Only one legendary action at a time
- Only at the end of another creature's turn
- Regains spent legendary actions at start of its turn
- Some actions cost 2 or 3 legendary actions

**Legendary Resistance:**
- Typically 3 uses per day
- Allows creature to succeed on a failed save
- Used to prevent debilitating effects (stun, paralysis, etc.)`;

/**
 * Relationships stage contract.
 * Target: ~400 chars
 */
export const RELATIONSHIPS_CONTRACT = `${BASE_OUTPUT_FORMAT}

**Required Keys:**
- allies: array of {name, relationship, notes?}
- enemies: array of {name, relationship, notes?}
- organizations: array of {name, role, standing?, notes?}

**Optional:**
- family: array of {name, relationship, status?}
- contacts: array of {name, profession, location?, notes?}

**Relationship Guidelines:**
- Allies: Friends, mentors, patrons, party members
- Enemies: Rivals, nemeses, opposing factions
- Organizations: Guilds, churches, governments, secret societies
- Include 2-4 relationships minimum for depth
- Relationships should tie to character background and motivations`;

/**
 * Stage contract map.
 * Maps stage IDs to their contracts.
 */
export const STAGE_CONTRACTS: Record<string, string> = {
  'basic_info': BASIC_INFO_CONTRACT,
  'creator:_basic_info': BASIC_INFO_CONTRACT,
  'core_details': CORE_DETAILS_CONTRACT,
  'creator:_core_details': CORE_DETAILS_CONTRACT,
  'stats': STATS_CONTRACT,
  'creator:_stats': STATS_CONTRACT,
  'character_build': CHARACTER_BUILD_CONTRACT,
  'creator:_character_build': CHARACTER_BUILD_CONTRACT,
  'combat': COMBAT_CONTRACT,
  'creator:_combat': COMBAT_CONTRACT,
  'equipment': EQUIPMENT_CONTRACT,
  'creator:_equipment': EQUIPMENT_CONTRACT,
  'spellcasting': SPELLCASTING_CONTRACT,
  'creator:_spellcasting': SPELLCASTING_CONTRACT,
  'legendary': LEGENDARY_CONTRACT,
  'creator:_legendary': LEGENDARY_CONTRACT,
  'relationships': RELATIONSHIPS_CONTRACT,
  'creator:_relationships': RELATIONSHIPS_CONTRACT,
};

/**
 * Gets the contract for a stage by ID or name.
 *
 * @param stageIdOrName - Stage ID or name
 * @returns Stage contract or null if not found
 */
export function getStageContract(stageIdOrName: string): string | null {
  // Normalize to lowercase with underscores
  const normalized = stageIdOrName.toLowerCase().replace(/\s+/g, '_');
  
  // Try exact match
  if (STAGE_CONTRACTS[normalized]) {
    return STAGE_CONTRACTS[normalized];
  }
  
  // Try with 'creator:_' prefix
  const prefixed = `creator:_${normalized}`;
  if (STAGE_CONTRACTS[prefixed]) {
    return STAGE_CONTRACTS[prefixed];
  }
  
  return null;
}
