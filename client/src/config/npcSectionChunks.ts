/**
 * NPC Section-Based Chunking Configuration
 *
 * Defines controlled chunks for NPC creation, each focusing on a specific section.
 * This ensures the AI has clear instructions and schema for each part of the NPC.
 
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

export interface NpcSectionChunk {
  chunkLabel: string;
  sectionName: string;
  instructions: string;
  schemaSection: string;
  includePreviousSections: boolean;
  outputFields: string[]; // Fields expected in this section's output
}

/**
 * Get all NPC section chunks in order
 */
export function getNpcSectionChunks(): NpcSectionChunk[] {
  return [
    {
      chunkLabel: 'Basic Information',
      sectionName: 'basic_info',
      instructions: `
⚠️ FOCUS: This chunk creates the BASIC INFORMATION section of the NPC.

Your focus for THIS CHUNK ONLY:
- Name, description, appearance, background
- Race, size, creature type, alignment
- Challenge rating, experience points
- Location, era, affiliation

DO NOT create stats, abilities, actions, or other sections yet - those come in later chunks.
Create a solid foundation that later chunks will build upon.

${formatSchemaForPrompt(getBasicInfoSchema(), 'Basic Information')}

CRITICAL OUTPUT STRUCTURE:
- Output ONLY the fields listed in the schema above
- Include required fields: name, schema_version
- Set schema_version to "1.1"
- Add sources_used, assumptions, proposals as usual
`,
      schemaSection: JSON.stringify(getBasicInfoSchema(), null, 2),
      includePreviousSections: false,
      outputFields: ['name', 'schema_version', 'genre', 'title', 'aliases', 'description', 'appearance', 'background', 'race', 'size', 'creature_type', 'subtype', 'alignment', 'affiliation', 'location', 'era', 'challenge_rating', 'experience_points'],
    },
    {
      chunkLabel: 'Core Details & Personality',
      sectionName: 'core_details',
      instructions: `
⚠️ FOCUS: This chunk creates the CORE DETAILS & PERSONALITY section.

Your focus for THIS CHUNK ONLY:
- Personality traits, ideals, bonds, flaws
- Goals, fears, quirks, voice/mannerisms
- Story hooks

Build upon the Basic Information from the previous chunk.
DO NOT repeat basic info fields - they're already set.
DO NOT create stats or combat sections yet.

${formatSchemaForPrompt(getCoreDetailsSchema(), 'Core Details & Personality')}

CRITICAL OUTPUT STRUCTURE:
- Output ONLY the NEW fields for this section (personality, ideals, etc.)
- DO NOT re-output basic info fields (name, description, etc.) - those are already complete
- The system will merge this with previous sections automatically
`,
      schemaSection: JSON.stringify(getCoreDetailsSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['role', 'personality_traits', 'ideals', 'bonds', 'flaws', 'goals', 'fears', 'quirks', 'voice_mannerisms', 'hooks'],
    },
    {
      chunkLabel: 'Stats & Abilities',
      sectionName: 'stats',
      instructions: `
⚠️ FOCUS: This chunk creates the STATS & ABILITIES section.

Your focus for THIS CHUNK ONLY:
- Class levels, ability scores, proficiency bonus
- Armor class, hit points, speed
- Senses, languages, saving throws, skills
- Damage resistances/immunities/vulnerabilities

Build upon previous sections (basic info, personality).
Use the character concept to determine appropriate stats.

${formatSchemaForPrompt(getStatsSchema(), 'Stats & Abilities')}

CRITICAL D&D 5E CALCULATIONS (if applicable):
- Proficiency bonus = ceil(CR/4) + 1, or based on class levels
- Skill bonuses = ability modifier + proficiency bonus (if proficient)
- HP = (hit dice × level) + (CON modifier × level)
- Saving throws = ability modifier + proficiency bonus (if proficient)

CRITICAL OUTPUT STRUCTURE:
- Output ONLY the NEW fields for this section (stats-related)
- DO NOT re-output previous sections' fields
- The system will merge this automatically
`,
      schemaSection: JSON.stringify(getStatsSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['class_levels', 'multiclass_features', 'ability_scores', 'armor_class', 'hit_points', 'hit_dice', 'speed', 'proficiency_bonus', 'senses', 'languages', 'saving_throws', 'skill_proficiencies', 'damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities'],
    },
    {
      chunkLabel: 'Character Build',
      sectionName: 'character_build',
      instructions: `
⚠️ FOCUS: This chunk creates the CHARACTER BUILD section.

Your focus for THIS CHUNK ONLY:
- ALL base class features for EVERY class level (e.g., Wizard: Arcane Recovery at 1, Spell Mastery at 18, Signature Spells at 20)
- ALL subclass/archetype features (e.g., Divination Wizard: Portent at 2, Expert Divination at 6, The Third Eye at 10, Greater Portent at 14)
- ALL racial features/traits (e.g., Human: Resourceful, Skillful, Versatile; Elf: Darkvision, Fey Ancestry, Trance, Keen Senses)
- ALL feats (from ASI choices, background origin feat, racial bonus feat)
- ASI choices at each ASI level (what was taken: +2 to an ability score or a feat)
- Background feature and origin feat (2024 rules)

Build upon the Stats section from the previous chunk.
Use the class_levels, race, and background to determine the COMPLETE list of features.

${formatSchemaForPrompt(getCharacterBuildSchema(), 'Character Build')}

CRITICAL D&D 5E 2024 CHARACTER BUILD RULES:
- Wizards get ASIs at levels 4, 8, 12, 16, 19
- Fighters get ASIs at levels 4, 6, 8, 12, 14, 16, 19
- Rogues get ASIs at levels 4, 8, 10, 12, 16, 19
- All other classes get ASIs at levels 4, 8, 12, 16, 19
- At each ASI, the character can choose +2 to one ability score, +1 to two scores, OR take a feat
- Background grants an Origin Feat (2024 rules) such as Alert, Magic Initiate, Skilled, etc.
- Variant Human (2014) gets a bonus feat at level 1
- Human (2024) gets a bonus Origin Feat from their background

COMPLETENESS IS CRITICAL:
- List EVERY class feature from level 1 through the character's level
- List EVERY subclass feature from the subclass selection level through the character's level
- Do NOT skip or summarize features — include FULL mechanical descriptions
- For a Level 20 Wizard (Divination), you should have ~10+ class features and ~4+ subclass features
- For each ASI level, specify whether an ASI or feat was taken and what the choice was

CRITICAL OUTPUT STRUCTURE:
- Output ONLY the NEW fields for this section (class_features, subclass_features, racial_features, feats, asi_choices, background_feature)
- DO NOT re-output previous sections' fields
- The system will merge this automatically
`,
      schemaSection: JSON.stringify(getCharacterBuildSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['class_features', 'subclass_features', 'racial_features', 'feats', 'asi_choices', 'background_feature'],
    },
    {
      chunkLabel: 'Combat & Actions',
      sectionName: 'combat',
      instructions: `
⚠️ FOCUS: This chunk creates the COMBAT & ACTIONS section.

Your focus for THIS CHUNK ONLY:
- Special abilities/traits
- Actions, bonus actions, reactions
- Multiattack patterns
- Combat tactics

Build upon the stats from previous chunks.
Create combat options that match the CR and character concept.

${formatSchemaForPrompt(getCombatSchema(), 'Combat & Actions')}

CRITICAL D&D 5E COMBAT RULES (if applicable):
- Attack bonus = proficiency bonus + relevant ability modifier
- Spell attack bonus = proficiency bonus + spellcasting ability modifier
- Damage should match CR and threat level
- Special abilities should have clear mechanics (uses, recharge, range, duration)

CRITICAL OUTPUT STRUCTURE:
- Output ONLY the NEW fields for this section (combat-related)
- DO NOT re-output previous sections' fields
- The system will merge this automatically
`,
      schemaSection: JSON.stringify(getCombatSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['abilities', 'actions', 'bonus_actions', 'reactions', 'tactics', 'multiattack'],
    },
    {
      chunkLabel: 'Spellcasting (if applicable)',
      sectionName: 'spellcasting',
      instructions: `
⚠️ FOCUS: This chunk creates the SPELLCASTING section (if applicable).

Your focus for THIS CHUNK ONLY:
- Spellcasting ability, spell save DC, spell attack bonus
- Cantrips, prepared spells, spell slots
- Innate spellcasting, spell focus, spell-storing items

ONLY include this section if the NPC is a spellcaster.
If not a spellcaster, output empty/null fields or skip entirely.

${formatSchemaForPrompt(getSpellcastingSchema(), 'Spellcasting')}

CRITICAL SPELLCASTING CALCULATIONS (if D&D 5E):
- Spell save DC = 8 + proficiency bonus + spellcasting ability modifier
- Spell attack bonus = proficiency bonus + spellcasting ability modifier
- Spell slots based on class level(s)
- Cantrips scale with total character level

CRITICAL OUTPUT STRUCTURE:
- Output ONLY spellcasting fields
- If not a spellcaster, output minimal structure or null
- DO NOT re-output previous sections
`,
      schemaSection: JSON.stringify(getSpellcastingSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['spellcasting', 'cantrips', 'prepared_spells', 'spell_slots', 'innate_spellcasting'],
    },
    {
      chunkLabel: 'Legendary & Mythic (if applicable)',
      sectionName: 'legendary',
      instructions: `
⚠️ FOCUS: This chunk creates LEGENDARY & MYTHIC ACTIONS (if applicable).

Your focus for THIS CHUNK ONLY:
- Legendary actions
- Mythic actions (if mythic encounter)
- Lair actions
- Regional effects

ONLY include this for high-CR legendary creatures (typically CR 11+).
If not legendary, output empty/null fields or skip entirely.

${formatSchemaForPrompt(getLegendarySchema(), 'Legendary & Mythic Actions')}

CRITICAL LEGENDARY ACTION RULES (if D&D 5E):
- Legendary creatures can take 3 legendary actions per round
- Only one legendary action at a time
- Costs: simple actions = 1, moderate = 2, powerful = 3
- Lair actions happen on initiative count 20

CRITICAL OUTPUT STRUCTURE:
- Output ONLY legendary/mythic fields
- If not legendary, output minimal structure or null
- DO NOT re-output previous sections
`,
      schemaSection: JSON.stringify(getLegendarySchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['legendary_actions', 'mythic_actions', 'lair_actions', 'regional_effects'],
    },
    {
      chunkLabel: 'Relationships & Networks',
      sectionName: 'relationships',
      instructions: `
⚠️ FOCUS: This chunk creates the RELATIONSHIPS & NETWORKS section.

Your focus for THIS CHUNK ONLY:
- Allies, friends, mentors, students, family
- Foes, rivals, enemies
- Faction memberships and standings
- Minions and followers
- Conflicts and tensions

Build a rich social network that:
- Connects the NPC to the broader world
- Creates adventure hooks and complications
- Reflects personality and background
- Uses canon entities where applicable

${formatSchemaForPrompt(getRelationshipsSchema(), 'Relationships & Networks')}

CRITICAL OUTPUT STRUCTURE:
- Output ONLY relationship fields
- DO NOT re-output previous sections
- The system will merge this automatically
`,
      schemaSection: JSON.stringify(getRelationshipsSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['allies_friends', 'foes', 'rivals', 'mentors', 'students', 'family', 'factions', 'minions', 'conflicts'],
    },
    {
      chunkLabel: 'Equipment & Items (final)',
      sectionName: 'equipment',
      instructions: `
⚠️ FOCUS: This is the FINAL chunk creating EQUIPMENT & ITEMS.

Your focus for THIS CHUNK ONLY:
- Mundane equipment
- Magic items (attuned and non-attuned)
- Signature items
- Wealth and resources

Complete the NPC with appropriate gear for their CR and role.

${formatSchemaForPrompt(getEquipmentSchema(), 'Equipment & Resources')}

CRITICAL OUTPUT STRUCTURE:
- Output ONLY equipment fields
- DO NOT re-output previous sections
- This is the FINAL chunk - ensure consistency with all previous sections
`,
      schemaSection: JSON.stringify(getEquipmentSchema(), null, 2),
      includePreviousSections: true,
      outputFields: ['equipment', 'magic_items', 'attuned_items', 'signature_items', 'wealth', 'resources'],
    },
  ];
}

/**
 * Check if a section is optional (can be skipped if not applicable)
 */
export function isOptionalSection(sectionName: string): boolean {
  return ['spellcasting', 'legendary'].includes(sectionName);
}

/**
 * Get section chunk by index
 */
export function getSectionChunk(index: number): NpcSectionChunk | null {
  const chunks = getNpcSectionChunks();
  return index >= 0 && index < chunks.length ? chunks[index] : null;
}

/**
 * Get total number of NPC section chunks
 */
export function getTotalSectionChunks(): number {
  return getNpcSectionChunks().length;
}
