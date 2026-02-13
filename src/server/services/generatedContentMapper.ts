/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { ContentType } from '../../shared/types/index.js';

type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

interface SpellcastingDetails {
  type?: string;
  ability?: string;
  save_dc?: number;
  attack_bonus?: number;
  notes?: string;
  spell_slots: Record<string, unknown>;
  prepared_spells: Record<string, unknown>;
  innate_spells: Record<string, unknown>;
  known_spells: string[];
}

interface NpcFeature {
  name: string;
  description: string;
  uses?: string;
  recharge?: string;
  notes?: string;
}

interface ScoredEntry {
  name: string;
  value: string;
  notes?: string;
}

interface NpcClassLevel {
  class: string;
  level?: number;
  subclass?: string;
  notes?: string;
}

interface NpcRelationship {
  entity: string;
  relationship: string;
  notes?: string;
}

type ArmorClassEntry = {
  value: number;
  type?: string;
  notes?: string;
};

interface HitPointsDetails {
  average?: number;
  formula?: string;
  notes?: string;
}

interface NormalizedNpc {
  name: string;
  title: string;
  aliases: string[];
  role: string;
  description: string;
  appearance: string;
  background: string;
  race: string;
  size: string;
  creature_type: string;
  subtype: string;
  alignment: string;
  affiliation: string;
  location: string;
  era: string;
  challenge_rating: string;
  experience_points?: number;
  hooks: string[];
  motivations: string[];
  tactics: string;
  class_levels: NpcClassLevel[];
  ability_scores: AbilityScores;
  armor_class?: number | ArmorClassEntry[];
  hit_points?: HitPointsDetails;
  hit_dice: string;
  proficiency_bonus: number | string;
  speed: Record<string, unknown>;
  saving_throws: ScoredEntry[];
  skill_proficiencies: ScoredEntry[];
  senses: string[];
  passive_perception?: number;
  languages: string[];
  damage_resistances: string[];
  damage_immunities: string[];
  damage_vulnerabilities: string[];
  condition_immunities: string[];
  class_features: NpcFeature[];
  subclass_features: NpcFeature[];
  racial_features: NpcFeature[];
  feats: NpcFeature[];
  asi_choices: Record<string, unknown>[];
  background_feature?: Record<string, unknown>;
  abilities: NpcFeature[];
  additional_traits: NpcFeature[];
  equipment: string[];
  relationships: NpcRelationship[];
  personality: {
    traits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  };
  spellcasting?: SpellcastingDetails;
  actions: NpcFeature[];
  bonus_actions: NpcFeature[];
  reactions: NpcFeature[];
  legendary_actions: Record<string, unknown>;
  mythic_actions: Record<string, unknown>;
  lair_actions: string[];
  regional_effects: string[];
  notes: string[];
  sources: string[];
  stat_block: Record<string, unknown>;
  ac?: number | string | ArmorClassEntry[];
  hp?: number | string;
  proficiency_bonus_text?: string;
}

interface ItemProperty {
  name: string;
  description: string;
  activation?: string;
  uses?: string;
  recharge?: string;
  save_dc?: number;
  save_type?: string;
  damage?: string;
  bonus?: string;
  duration?: string;
  range?: string;
  notes?: string;
}

interface ItemSpell {
  name: string;
  level?: number;
  charges_cost?: number;
  notes?: string;
}

interface PreviousOwner {
  name: string;
  era?: string;
  notable_deed?: string;
}

interface NormalizedItem {
  name: string;
  item_type: string;
  item_subtype: string;
  rarity: string;
  attunement: {
    required: boolean;
    restrictions: string;
  };
  description: string;
  appearance: string;
  weight: string;
  value: string;
  properties_v2: ItemProperty[];
  charges: {
    maximum: number;
    recharge: string;
    on_last_charge: string;
  };
  spells: ItemSpell[];
  weapon_properties: Record<string, unknown>;
  armor_properties: Record<string, unknown>;
  history: string;
  creator: string;
  previous_owners: PreviousOwner[];
  quirks: string[];
  curse: {
    is_cursed: boolean;
    description: string;
    trigger: string;
    removal: string;
    hidden: boolean;
  };
  sentience: {
    is_sentient: boolean;
    alignment: string;
    intelligence: number;
    wisdom: number;
    charisma: number;
    communication: string;
    senses: string;
    purpose: string;
    personality: string;
    conflict: string;
  };
  campaign_hooks: string[];
  notes: string[];
  // Legacy fields for backward compatibility
  type: string;
  properties: string[];
  abilities: string[];
  usage: string;
  drawbacks: string;
  mechanics: Record<string, unknown>;
}

interface MonsterFeature {
  name: string;
  description: string;
  attack_bonus?: string;
  damage?: string;
  uses?: string;
  recharge?: string;
  cost?: number;
  notes?: string;
}

interface NormalizedMonster {
  name: string;
  description: string;
  size: string;
  creature_type: string;
  subtype: string;
  alignment: string;
  challenge_rating: string;
  experience_points: number;
  proficiency_bonus: number;
  ability_scores: AbilityScores;
  armor_class: number | ArmorClassEntry[];
  hit_points: HitPointsDetails;
  hit_dice: string;
  speed: Record<string, unknown>;
  saving_throws: ScoredEntry[];
  skill_proficiencies: ScoredEntry[];
  damage_vulnerabilities: string[];
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: string[];
  senses: string[];
  passive_perception: number;
  languages: string[];
  abilities: MonsterFeature[];
  actions: MonsterFeature[];
  bonus_actions: MonsterFeature[];
  reactions: MonsterFeature[];
  multiattack: string;
  spellcasting: Record<string, unknown>;
  legendary_actions: {
    summary: string;
    options: MonsterFeature[];
  };
  mythic_actions: {
    summary: string;
    options: MonsterFeature[];
  };
  lair_actions: string[];
  regional_effects: string[];
  location: string;
  ecology: string;
  lore: string;
  tactics: string;
  notes: string[];
  sources: string[];
}

interface NormalizedLocation {
  name: string;
  region: string;
  description: string;
  history: string;
  key_features: string[];
  inhabitants: string[];
  hooks: string[];
}

interface StoryArcGoal {
  target: string;
  achievement: string;
}

interface StoryArcCharacter {
  name: string;
  role: string;
  description: string;
  motivation: {
    purpose: string;
    reason: string;
  };
  goals: StoryArcGoal[];
  known_barriers: string[];
  unknown_barriers: string[];
  arc: string;
  first_appearance: string;
}

interface StoryArcAct {
  name: string;
  summary: string;
  key_events: string[];
  locations: string[];
  climax: string;
  transition: string;
}

interface StoryArcBeat {
  name: string;
  description: string;
  act: string;
  type: string;
  required: boolean;
}

interface StoryArcFaction {
  name: string;
  description: string;
  goals: string[];
  resources: string[];
  relationship_to_party: string;
}

interface StoryArcBranchingPath {
  decision_point: string;
  options: Array<{ choice: string; consequence: string }>;
}

interface StoryArcSecret {
  secret: string;
  discovery_method: string;
  impact: string;
}

interface StoryArcReward {
  name: string;
  type: string;
  when: string;
}

interface NormalizedStoryArc {
  title: string;
  synopsis: string;
  theme: string;
  tone: string;
  setting: string;
  level_range: string;
  estimated_sessions: string;
  overarching_goal: string;
  hook: string;
  acts: StoryArcAct[];
  beats: StoryArcBeat[];
  characters: StoryArcCharacter[];
  factions: StoryArcFaction[];
  known_barriers: string[];
  unknown_barriers: string[];
  branching_paths: StoryArcBranchingPath[];
  rewards: StoryArcReward[];
  clues_and_secrets: StoryArcSecret[];
  dm_notes: string[];
  // Legacy fields for backward compatibility
  acts_legacy: string[];
  beats_legacy: string[];
}

interface EncounterMonster {
  name: string;
  count: number;
  cr: string;
  xp: number;
  ac: number;
  hp: number;
  speed: string;
  role: string;
  positioning: string;
  key_abilities: string[];
  source: string;
  notes: string;
}

interface EncounterEnemy {
  name: string;
  role: string;
  tactics: string;
  quantity: number;
  stat_block: Record<string, unknown>;
}

interface EncounterNpc {
  name: string;
  role: string;
  affiliation: string;
  motivation: string;
  stat_reference: string;
  notes: string;
}

interface TerrainFeature {
  name: string;
  effect: string;
  dc?: number;
  cover?: string;
  movement_cost?: string;
}

interface EncounterHazard {
  name: string;
  description: string;
  impact: string;
  dc?: number;
  damage?: string;
  trigger?: string;
  mitigation?: string;
}

interface EncounterTrap {
  name: string;
  trigger: string;
  effect: string;
  dc: number;
  damage?: string;
  disarm?: string;
  detection_dc?: number;
}

interface EventClockPhase {
  name: string;
  trigger: string;
  outcome: string;
  round?: number;
}

interface NormalizedEncounter {
  title: string;
  description: string;
  encounter_type: string;
  difficulty_tier: string;
  party_level?: number;
  party_size?: number;
  xp_budget?: number;
  adjusted_xp?: number;
  expected_duration_rounds?: number;
  location: string;
  setting_context: string;
  objectives: string[];
  failure_conditions: string[];
  monsters: EncounterMonster[];
  npcs: EncounterNpc[];
  terrain: {
    description: string;
    features: TerrainFeature[];
    lighting: string;
    elevation: string;
    weather: string;
    map_dimensions: string;
  };
  hazards: EncounterHazard[];
  traps: EncounterTrap[];
  tactics: {
    opening_moves: string;
    focus_targets: string;
    resource_usage: string;
    fallback_plan: string;
    morale: string;
    coordination: string;
  };
  event_clock: {
    summary: string;
    phases: EventClockPhase[];
  };
  treasure: {
    currency: Record<string, number>;
    items: Array<{ name: string; rarity?: string; description?: string; value?: string }>;
    boons: string[];
  };
  consequences: {
    success: string;
    failure: string;
    partial: string;
    story_hooks: string[];
  };
  scaling: {
    easier: string;
    harder: string;
    party_size_adjust: string;
  };
  notes: string[];
  // Legacy fields for backwards compatibility
  hooks: string[];
  enemies: EncounterEnemy[];
  loot: string[];
  stat_blocks: Record<string, unknown>[];
  environment: string;
  phases: string[];
}

interface GeneratedContentMapParams {
  contentType?: string;
  deliverable?: string;
  title: string;
  generatedContent: any;
  resolvedProposals?: any[];
  resolvedConflicts?: any[];
}

interface MappedContentBlock {
  title: string;
  content: string;
  type: ContentType;
  metadata: Record<string, any>;
}

const DEFAULT_ABILITY_SCORES = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

const formatList = (items: string[], emptyFallback = 'None'): string => {
  if (!items || items.length === 0) {
    return `- ${emptyFallback}`;
  }

  return items
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join('\n') || `- ${emptyFallback}`;
};

const ensureString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value).trim();
};

const ensureArray = <T>(
  value: unknown,
  mapper?: (val: unknown, index: number) => T | undefined,
): T[] => {
  const base = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : [value];

  if (!mapper) {
    return base as T[];
  }

  return (base as unknown[])
    .map((item, index) => mapper(item, index))
    .filter((item): item is T => item !== undefined && item !== null);
};

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const ensureAbilityScores = (scores: unknown): AbilityScores => {
  const source = ensureObject(scores);
  return {
    str: Number.isFinite(source.str as number) ? (source.str as number) : DEFAULT_ABILITY_SCORES.str,
    dex: Number.isFinite(source.dex as number) ? (source.dex as number) : DEFAULT_ABILITY_SCORES.dex,
    con: Number.isFinite(source.con as number) ? (source.con as number) : DEFAULT_ABILITY_SCORES.con,
    int: Number.isFinite(source.int as number) ? (source.int as number) : DEFAULT_ABILITY_SCORES.int,
    wis: Number.isFinite(source.wis as number) ? (source.wis as number) : DEFAULT_ABILITY_SCORES.wis,
    cha: Number.isFinite(source.cha as number) ? (source.cha as number) : DEFAULT_ABILITY_SCORES.cha,
  };
};

const ensureStringArray = (value: unknown): string[] => {
  return ensureArray<string>(value, (entry) => ensureString(entry)).filter(Boolean);
};

const normalizeFeatureList = (value: unknown): NpcFeature[] => {
  return ensureArray<NpcFeature>(value, (feature) => {
    if (typeof feature === 'string') {
      const text = ensureString(feature);
      if (!text) return undefined;
      return { name: text.slice(0, 80) || 'Feature', description: text };
    }

    const obj = ensureObject(feature);
    const name = ensureString(obj.name ?? obj.title);
    const description = ensureString(obj.description ?? obj.text ?? obj.effect);
    if (!name && !description) return undefined;
    return {
      name: name || 'Feature',
      description: description || 'Details unavailable.',
      uses: ensureString(obj.uses),
      recharge: ensureString(obj.recharge),
      notes: ensureString(obj.notes),
    };
  });
};

const normalizeScoredList = (value: unknown): ScoredEntry[] => {
  return ensureArray<ScoredEntry>(value, (entry) => {
    if (typeof entry === 'string') {
      const normalized = ensureString(entry);
      if (!normalized) return undefined;
      return { name: normalized, value: normalized };
    }
    const obj = ensureObject(entry);
    const name = ensureString(obj.name || obj.skill || obj.title);
    const value = ensureString(obj.value || obj.modifier || obj.bonus || obj.score);
    if (!name && !value) return undefined;
    return {
      name: name || value || '',
      value: value || '—',
      notes: ensureString(obj.notes),
    };
  });
};

const normalizeRelationshipsList = (value: unknown): NpcRelationship[] => {
  return ensureArray<NpcRelationship>(value, (rel) => {
    const relObj = ensureObject(rel);
    const entity = ensureString(relObj.entity ?? relObj.name);
    const relationship = ensureString(relObj.relationship ?? relObj.description ?? relObj.type);
    if (!entity && !relationship) return undefined;
    return {
      entity,
      relationship,
      notes: ensureString(relObj.notes),
    };
  });
};

const normalizeArmorClass = (value: unknown): number | ArmorClassEntry[] | undefined => {
  if (Number.isFinite(value)) {
    return value as number;
  }

  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    const numeric = match ? Number.parseInt(match[1], 10) : undefined;
    return numeric ? [{ value: numeric, notes: value }] : [{ value: 0, notes: value }];
  }

  const arr = normalizeScoredList(value);
  if (arr.length === 0) return undefined;
  return arr.map((item) => ({ value: Number.parseInt(item.value, 10) || 0, type: item.name, notes: item.notes }));
};

const normalizeHitPoints = (value: unknown, fallbackFormula?: string): HitPointsDetails => {
  if (Number.isFinite(value)) {
    return { average: value as number };
  }

  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    const average = match ? Number.parseInt(match[1], 10) : undefined;
    return { average, formula: value, notes: average ? undefined : value };
  }

  const obj = ensureObject(value);
  if (Object.keys(obj).length === 0 && fallbackFormula) {
    return normalizeHitPoints(fallbackFormula);
  }
  return {
    average: Number.isFinite(obj.average as number) ? (obj.average as number) : undefined,
    formula: ensureString(obj.formula ?? fallbackFormula),
    notes: ensureString(obj.notes),
  };
};

const normalizeSpellcasting = (value: unknown): SpellcastingDetails | undefined => {
  const obj = ensureObject(value);
  if (Object.keys(obj).length === 0) return undefined;
  return {
    type: ensureString(obj.type ?? obj.tradition),
    ability: ensureString(obj.ability ?? obj.spellcasting_ability),
    save_dc: Number.isFinite(obj.save_dc as number) ? (obj.save_dc as number) : undefined,
    attack_bonus: Number.isFinite(obj.attack_bonus as number) ? (obj.attack_bonus as number) : undefined,
    notes: ensureString(obj.notes ?? obj.text),
    spell_slots: ensureObject(obj.spell_slots),
    prepared_spells: ensureObject(obj.prepared_spells),
    innate_spells: ensureObject(obj.innate_spells),
    known_spells: ensureStringArray(obj.known_spells),
  };
};

const featureListToLines = (features: unknown): string[] => {
  return ensureArray<string>(features, (feature) => {
    if (!feature) return undefined;
    if (typeof feature === 'string') return ensureString(feature);
    const obj = ensureObject(feature);
    const name = ensureString(obj.name);
    const description = ensureString(obj.description);
    const notes = ensureString(obj.notes);
    const base = [name, description].filter(Boolean).join(': ').trim();
    if (base || notes) {
      return [base, notes].filter(Boolean).join(' ').trim();
    }
    return undefined;
  }).filter(Boolean);
};

const inferContentType = (
  contentType: string | undefined,
  deliverable: string | undefined,
  generatedContent: any,
): ContentType => {
  const values = Object.values(ContentType) as string[];
  if (contentType && values.includes(contentType)) {
    return contentType as ContentType;
  }

  const deliverableLower = ensureString(deliverable || generatedContent?.deliverable).toLowerCase();
  const draft = ensureObject(generatedContent?.draft);
  const draftDeliverable = ensureString(draft.deliverable).toLowerCase();

  if (
    draft?.story_arc ||
    draft?.storyArc ||
    generatedContent?.story_arc ||
    generatedContent?.storyArc ||
    generatedContent?.arc ||
    draftDeliverable.includes('story arc') ||
    draftDeliverable.includes('story-arc') ||
    draftDeliverable.includes('plot arc') ||
    deliverableLower.includes('story arc') ||
    deliverableLower.includes('story-arc') ||
    deliverableLower.includes('plot arc')
  ) {
    return ContentType.STORY_ARC;
  }

  if (
    generatedContent?.monster ||
    draft?.monster ||
    deliverableLower.includes('monster') ||
    deliverableLower.includes('creature') ||
    draftDeliverable.includes('monster') ||
    draftDeliverable.includes('creature')
  ) {
    return ContentType.MONSTER;
  }

  if (draft?.npc || draft?.character || generatedContent?.npc) {
    return ContentType.CHARACTER;
  }

  if (draftDeliverable.includes('npc') || deliverableLower.includes('npc') || deliverableLower.includes('character')) {
    return ContentType.CHARACTER;
  }

  if (
    generatedContent?.encounter ||
    generatedContent?.encounter_details ||
    draft?.encounter ||
    draft?.encounter_details ||
    deliverableLower.includes('encounter') ||
    deliverableLower.includes('combat') ||
    draftDeliverable.includes('encounter') ||
    draftDeliverable.includes('combat')
  ) {
    return ContentType.SECTION;
  }

  if (
    generatedContent?.item ||
    draft?.item ||
    deliverableLower.includes('item') ||
    deliverableLower.includes('artifact') ||
    draftDeliverable.includes('item') ||
    draftDeliverable.includes('artifact')
  ) {
    return ContentType.ITEM;
  }

  if (
    generatedContent?.location ||
    draft?.location ||
    deliverableLower.includes('location') ||
    deliverableLower.includes('place') ||
    draftDeliverable.includes('location') ||
    draftDeliverable.includes('place')
  ) {
    return ContentType.LOCATION;
  }

  if (deliverableLower.includes('outline') || draftDeliverable.includes('outline')) {
    return ContentType.OUTLINE;
  }

  if (deliverableLower.includes('chapter') || draftDeliverable.includes('chapter')) {
    return ContentType.CHAPTER;
  }

  if (deliverableLower.includes('scene') || draftDeliverable.includes('scene')) {
    return ContentType.SECTION;
  }

  if (deliverableLower.includes('stat') || draftDeliverable.includes('stat')) {
    return ContentType.STAT_BLOCK;
  }

  if (
    deliverableLower.includes('fact') ||
    deliverableLower.includes('lore') ||
    draftDeliverable.includes('fact') ||
    draftDeliverable.includes('lore')
  ) {
    return ContentType.FACT;
  }

  return ContentType.TEXT;
};

const buildCommonMetadata = (params: GeneratedContentMapParams) => {
  const { generatedContent, resolvedConflicts, resolvedProposals } = params;

  const metadata: Record<string, any> = {
    sources_used: ensureArray<string>(generatedContent?.sources_used),
    assumptions: ensureArray<string>(generatedContent?.assumptions),
    canon_update: ensureString(generatedContent?.canon_update),
    deliverable: ensureString(params.deliverable ?? generatedContent?.deliverable),
    difficulty: ensureString(generatedContent?.difficulty),
    rule_base: ensureString(generatedContent?.rule_base),
    raw: generatedContent,
    resolved_conflicts: resolvedConflicts ?? [],
    resolved_proposals: resolvedProposals ?? [],
  };

  if (generatedContent?.canon_alignment_score !== undefined) {
    metadata.canon_alignment_score = generatedContent.canon_alignment_score;
  }

  if (generatedContent?.logic_score !== undefined) {
    metadata.logic_score = generatedContent.logic_score;
  }

  if (generatedContent?.validation_notes) {
    metadata.validation_notes = generatedContent.validation_notes;
  }

  if (generatedContent?.balance_notes) {
    metadata.balance_notes = generatedContent.balance_notes;
  }

  if (generatedContent?.physics_issues) {
    metadata.physics_issues = ensureArray<any>(generatedContent.physics_issues);
  }

  if (generatedContent?.conflicts) {
    metadata.conflicts = ensureArray<any>(generatedContent.conflicts);
  }

  if (generatedContent?.proposals) {
    metadata.proposals = ensureArray<any>(generatedContent.proposals);
  }

  return metadata;
};

const normalizeNpc = (source: unknown): NormalizedNpc => {
  const npcSource = ensureObject(source);
  const statBlock = ensureObject(npcSource.stat_block);
  const personalityObject = ensureObject(npcSource.personality);
  const spellcasting = normalizeSpellcasting(npcSource.spellcasting ?? npcSource.spells);

  const armorClass = normalizeArmorClass(npcSource.armor_class ?? npcSource.ac ?? statBlock.armor_class);
  const hitPoints = normalizeHitPoints(
    npcSource.hit_points ?? npcSource.hp ?? statBlock.hit_points,
    ensureString(statBlock.hit_points_formula),
  );

  const normalizedNpc: NormalizedNpc = {
    name: ensureString(npcSource.name, ensureString(npcSource.canonical_name, 'Unknown NPC')),
    title: ensureString(npcSource.title ?? npcSource.title_or_role),
    aliases: ensureStringArray(npcSource.aliases),
    role: ensureString(npcSource.role),
    description: ensureString(npcSource.description ?? npcSource.summary),
    appearance: ensureString(npcSource.appearance ?? npcSource.physical_appearance),
    background: ensureString(npcSource.background),
    race: ensureString(npcSource.race),
    size: ensureString(npcSource.size ?? statBlock.size),
    creature_type: ensureString(npcSource.creature_type ?? statBlock.creature_type ?? npcSource.type),
    subtype: ensureString(npcSource.subtype ?? statBlock.subtype),
    alignment: ensureString(npcSource.alignment),
    affiliation: ensureString(npcSource.affiliation),
    location: ensureString(npcSource.location),
    era: ensureString(npcSource.era),
    challenge_rating: ensureString(npcSource.challenge_rating ?? statBlock.challenge_rating),
    experience_points: Number.isFinite(npcSource.experience_points as number)
      ? (npcSource.experience_points as number)
      : undefined,
    hooks: ensureStringArray(npcSource.hooks),
    motivations: ensureStringArray(npcSource.motivations),
    tactics: ensureString(npcSource.combat_tactics ?? npcSource.tactics),
    class_levels: ensureArray<NpcClassLevel>(npcSource.class_levels, (cl) => {
      const clObj = ensureObject(cl);
      const className = ensureString(clObj.class ?? clObj.name);
      const level = Number.isFinite(clObj.level as number) ? (clObj.level as number) : undefined;
      const subclass = ensureString(clObj.subclass ?? clObj.archetype);
      if (!className && level === undefined) return undefined;
      return { class: className, level, subclass, notes: ensureString(clObj.notes) };
    }),
    ability_scores: ensureAbilityScores(npcSource.ability_scores),
    armor_class: armorClass,
    hit_points: hitPoints,
    hit_dice: ensureString(npcSource.hit_dice ?? statBlock.hit_dice),
    proficiency_bonus: Number.isFinite(npcSource.proficiency_bonus as number)
      ? (npcSource.proficiency_bonus as number)
      : ensureString(npcSource.proficiency_bonus ?? statBlock.proficiency_bonus),
    speed: ensureObject(npcSource.speed ?? statBlock.speed),
    saving_throws: normalizeScoredList(npcSource.saving_throws ?? statBlock.saving_throws),
    skill_proficiencies: normalizeScoredList(npcSource.skills ?? npcSource.skill_proficiencies ?? statBlock.skills),
    senses: ensureStringArray(npcSource.senses ?? statBlock.senses),
    passive_perception: Number.isFinite(npcSource.passive_perception as number)
      ? (npcSource.passive_perception as number)
      : Number.parseInt(ensureString(statBlock.passive_perception), 10) || undefined,
    languages: ensureStringArray(npcSource.languages ?? statBlock.languages),
    damage_resistances: ensureStringArray(npcSource.damage_resistances ?? statBlock.damage_resistances),
    damage_immunities: ensureStringArray(npcSource.damage_immunities ?? statBlock.damage_immunities),
    damage_vulnerabilities: ensureStringArray(
      npcSource.damage_vulnerabilities ?? statBlock.damage_vulnerabilities,
    ),
    condition_immunities: ensureStringArray(npcSource.condition_immunities ?? statBlock.condition_immunities),
    class_features: normalizeFeatureList(npcSource.class_features),
    subclass_features: normalizeFeatureList(npcSource.subclass_features),
    racial_features: normalizeFeatureList(npcSource.racial_features),
    feats: normalizeFeatureList(npcSource.feats),
    asi_choices: ensureArray<Record<string, unknown>>(npcSource.asi_choices, (entry) => {
      const obj = ensureObject(entry);
      if (!obj.level && !obj.choice) return undefined;
      return obj;
    }),
    background_feature: npcSource.background_feature && typeof npcSource.background_feature === 'object' && !Array.isArray(npcSource.background_feature)
      ? (npcSource.background_feature as Record<string, unknown>)
      : undefined,
    abilities: normalizeFeatureList(npcSource.abilities ?? statBlock.abilities),
    additional_traits: normalizeFeatureList(npcSource.additional_traits),
    equipment: ensureStringArray(npcSource.equipment),
    relationships: normalizeRelationshipsList(npcSource.relationships),
    personality: {
      traits: ensureStringArray(personalityObject.traits),
      ideals: ensureStringArray(personalityObject.ideals),
      bonds: ensureStringArray(personalityObject.bonds),
      flaws: ensureStringArray(personalityObject.flaws),
    },
    spellcasting,
    actions: normalizeFeatureList(npcSource.actions ?? statBlock.actions),
    bonus_actions: normalizeFeatureList(npcSource.bonus_actions ?? statBlock.bonus_actions),
    reactions: normalizeFeatureList(npcSource.reactions ?? statBlock.reactions),
    legendary_actions: ensureObject(npcSource.legendary_actions ?? statBlock.legendary_actions),
    mythic_actions: ensureObject(npcSource.mythic_actions ?? statBlock.mythic_actions),
    lair_actions: ensureStringArray(npcSource.lair_actions ?? statBlock.lair_actions),
    regional_effects: ensureStringArray(npcSource.regional_effects ?? statBlock.regional_effects),
    notes: ensureStringArray(npcSource.notes),
    sources: ensureStringArray(npcSource.sources),
    stat_block: statBlock,
  };

  return {
    ...normalizedNpc,
    // Backwards compatible aliases for components expecting legacy keys
    ac: Array.isArray(armorClass) ? armorClass[0]?.value ?? '' : armorClass ?? '',
    hp: hitPoints?.average ?? hitPoints?.formula ?? '',
    proficiency_bonus_text: typeof normalizedNpc.proficiency_bonus === 'string' ? normalizedNpc.proficiency_bonus : undefined,
  };
};

const formatNpcContent = (title: string, normalized: NormalizedNpc): string => {
  const lines: string[] = [];

  lines.push(`## NPC: ${title}`);
  lines.push('');
  lines.push(`**Role:** ${normalized.role || 'Unknown role'}`);
  lines.push(`**Title:** ${normalized.title || 'No formal title'}`);
  lines.push(`**Race:** ${normalized.race || 'Unknown'}`);
  lines.push(`**Alignment:** ${normalized.alignment || 'Unknown'}`);
  lines.push(`**Affiliation:** ${normalized.affiliation || 'None noted'}`);
  lines.push(`**Location:** ${normalized.location || 'Unknown'}`);
  lines.push(`**Era:** ${normalized.era || 'Unknown'}`);
  lines.push('');
  lines.push('### Description');
  lines.push(normalized.description || 'No description provided.');
  if (normalized.appearance) {
    lines.push('');
    lines.push('### Appearance');
    lines.push(normalized.appearance);
  }
  if (normalized.background) {
    lines.push('');
    lines.push('### Background');
    lines.push(normalized.background);
  }
  lines.push('');
  lines.push('### Personality');
  lines.push('**Traits**');
  lines.push(formatList(normalized.personality.traits));
  lines.push('**Ideals**');
  lines.push(formatList(normalized.personality.ideals));
  lines.push('**Bonds**');
  lines.push(formatList(normalized.personality.bonds));
  lines.push('**Flaws**');
  lines.push(formatList(normalized.personality.flaws));
  lines.push('');
  lines.push('### Motivations');
  lines.push(formatList(normalized.motivations));
  if (normalized.hooks.length) {
    lines.push('');
    lines.push('### Adventure Hooks');
    lines.push(formatList(normalized.hooks));
  }
  const abilityLines = featureListToLines(normalized.abilities);
  if (abilityLines.length) {
    lines.push('');
    lines.push('### Abilities & Skills');
    lines.push(formatList(abilityLines));
  }
  if (normalized.tactics) {
    lines.push('');
    lines.push('### Combat Tactics');
    lines.push(normalized.tactics);
  }
  if (normalized.class_levels.length) {
    lines.push('');
    lines.push('### Class Levels');
    lines.push(
      normalized.class_levels
        .map((cl) => `- ${cl.class || 'Class'} ${cl.level}${cl.subclass ? ` (${cl.subclass})` : ''}`)
        .join('\n'),
    );
  }
  const classFeatureLines = featureListToLines(normalized.class_features);
  if (classFeatureLines.length) {
    lines.push('');
    lines.push('### Class Features');
    lines.push(formatList(classFeatureLines));
  }
  const subclassFeatureLines = featureListToLines(normalized.subclass_features);
  if (subclassFeatureLines.length) {
    lines.push('');
    lines.push('### Subclass Features');
    lines.push(formatList(subclassFeatureLines));
  }
  const racialFeatureLines = featureListToLines(normalized.racial_features);
  if (racialFeatureLines.length) {
    lines.push('');
    lines.push('### Racial Features');
    lines.push(formatList(racialFeatureLines));
  }
  const featLines = featureListToLines(normalized.feats);
  if (featLines.length) {
    lines.push('');
    lines.push('### Feats');
    lines.push(formatList(featLines));
  }
  if (normalized.asi_choices.length) {
    lines.push('');
    lines.push('### ASI Choices');
    lines.push(
      normalized.asi_choices
        .map((asi) => `- Level ${asi.level || '?'}: ${asi.choice || 'Unknown'}${asi.details ? ` (${asi.details})` : ''}`)
        .join('\n'),
    );
  }
  if (normalized.background_feature && Object.keys(normalized.background_feature).length) {
    lines.push('');
    lines.push('### Background');
    const bg = normalized.background_feature;
    if (bg.background_name) lines.push(`**Background:** ${bg.background_name}`);
    if (bg.feature_name) lines.push(`**Feature:** ${bg.feature_name}`);
    if (bg.description) lines.push(String(bg.description));
    if (bg.origin_feat) lines.push(`**Origin Feat:** ${bg.origin_feat}`);
  }
  lines.push('');
  lines.push('### Ability Scores');
  lines.push(
    `- STR ${normalized.ability_scores.str} \| DEX ${normalized.ability_scores.dex} \| CON ${normalized.ability_scores.con}`,
  );
  lines.push(
    `- INT ${normalized.ability_scores.int} \| WIS ${normalized.ability_scores.wis} \| CHA ${normalized.ability_scores.cha}`,
  );
  lines.push('');
  lines.push('### Core Stats');
  lines.push(`- Armor Class: ${normalized.ac || 'N/A'}`);
  lines.push(`- Hit Points: ${normalized.hp || 'N/A'}`);
  lines.push(`- Proficiency Bonus: ${normalized.proficiency_bonus || 'N/A'}`);
  const knownSpells = normalized.spellcasting?.known_spells ?? [];
  if (knownSpells.length) {
    lines.push('');
    lines.push('### Known Spells');
    lines.push(formatList(knownSpells));
  }
  if (normalized.equipment.length) {
    lines.push('');
    lines.push('### Equipment');
    lines.push(formatList(normalized.equipment));
  }
  const actionLines = featureListToLines(normalized.actions);
  if (actionLines.length) {
    lines.push('');
    lines.push('### Actions');
    lines.push(formatList(actionLines));
  }
  const bonusActionLines = featureListToLines(normalized.bonus_actions);
  if (bonusActionLines.length) {
    lines.push('');
    lines.push('### Bonus Actions');
    lines.push(formatList(bonusActionLines));
  }
  const reactionLines = featureListToLines(normalized.reactions);
  if (reactionLines.length) {
    lines.push('');
    lines.push('### Reactions');
    lines.push(formatList(reactionLines));
  }
  if (normalized.relationships.length) {
    lines.push('');
    lines.push('### Relationships');
    lines.push(
      normalized.relationships
        .map((rel) => `- ${rel.entity || 'Unknown'}: ${rel.relationship || 'Relationship unspecified'}`)
        .join('\n'),
    );
  }
  if (Object.keys(normalized.stat_block).length) {
    lines.push('');
    lines.push('### Stat Block');
    lines.push('```json');
    lines.push(JSON.stringify(normalized.stat_block, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
};

const formatWritingContent = (generatedContent: unknown): string => {
  const source = ensureObject(generatedContent);
  const draft = ensureObject(source.draft);
  const merged: Record<string, any> = Object.keys(draft).length ? { ...source, ...draft } : source;

  const title =
    ensureString(merged.title) ||
    ensureString(merged.chapter_title ?? merged.chapterTitle) ||
    ensureString(ensureObject(merged.chapter).title) ||
    ensureString(ensureObject(merged.scene).title) ||
    ensureString(ensureObject(merged.work).title) ||
    'Draft';

  const subtitle = ensureString(merged.subtitle) || ensureString(ensureObject(merged.work).subtitle);
  const summary =
    ensureString(merged.summary) ||
    ensureString(merged.synopsis) ||
    ensureString(merged.abstract) ||
    ensureString(ensureObject(merged.chapter).summary) ||
    ensureString(ensureObject(merged.scene).summary);

  const outline = ensureStringArray(merged.outline ?? merged.structure ?? merged.outline_structure ?? merged.outlineStructure);
  const toc = ensureStringArray(
    merged.table_of_contents ?? merged.tableOfContents ?? ensureObject(merged.work).table_of_contents ?? ensureObject(merged.work).tableOfContents,
  );

  const text =
    ensureString(merged.formatted_text ?? merged.formattedText) ||
    ensureString(merged.formatted_manuscript ?? merged.formattedManuscript) ||
    ensureString(merged.draft_text ?? merged.draftText) ||
    ensureString(ensureObject(merged.chapter).draft_text ?? ensureObject(merged.chapter).draftText) ||
    ensureString(ensureObject(merged.scene).draft_text ?? ensureObject(merged.scene).draftText) ||
    ensureString(merged.text) ||
    ensureString(merged.body);

  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (subtitle) {
    lines.push('');
    lines.push(`**${subtitle}**`);
  }

  if (summary) {
    lines.push('');
    lines.push('## Summary');
    lines.push(summary);
  }

  if (outline.length) {
    lines.push('');
    lines.push('## Outline');
    lines.push(formatList(outline));
  }

  if (toc.length) {
    lines.push('');
    lines.push('## Table of Contents');
    lines.push(formatList(toc));
  }

  if (text) {
    lines.push('');
    lines.push('## Draft');
    lines.push(text);
  }

  return lines.join('\n');
};

const formatNonfictionContent = (generatedContent: unknown): string => {
  const source = ensureObject(generatedContent);
  const draft = ensureObject(source.draft);
  const content = Object.keys(draft).length ? draft : source;

  const asStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) return ensureStringArray(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      return trimmed
        .split(/\r?\n|,|;|\u2022|\u00b7/)
        .map((part) => part.replace(/^[-*\d.\s]+/, '').trim())
        .filter((part) => part.length > 0);
    }
    return [];
  };

  const title = ensureString(content.title ?? content.working_title ?? source.title ?? source.working_title) || 'Non-Fiction';
  const subtitle = ensureString(content.subtitle ?? source.subtitle);
  const medium = ensureString(content.medium ?? source.medium);
  const toc = asStringList(content.table_of_contents ?? content.tableOfContents);
  const formatted = ensureString(content.formatted_manuscript ?? content.formattedManuscript);
  const purpose = ensureString(content.purpose ?? content.mission ?? content.premise);
  const thesis = ensureString(content.thesis ?? content.central_thesis ?? content.centralThesis);
  const keywords = asStringList(content.keywords);
  const outline = asStringList(content.outline ?? content.structure ?? content.outline_structure ?? content.outlineStructure);

  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (subtitle) {
    lines.push('');
    lines.push(`**${subtitle}**`);
  }
  if (medium) {
    lines.push('');
    lines.push(`*Medium:* ${medium}`);
  }

  if (toc.length) {
    lines.push('');
    lines.push('## Table of Contents');
    lines.push(formatList(toc));
  }

  if (purpose) {
    lines.push('');
    lines.push('## Purpose');
    lines.push(purpose);
  }

  if (thesis) {
    lines.push('');
    lines.push('## Thesis');
    lines.push(thesis);
  }

  if (keywords.length) {
    lines.push('');
    lines.push('## Keywords');
    lines.push(formatList(keywords));
  }

  if (outline.length) {
    lines.push('');
    lines.push('## Outline');
    lines.push(formatList(outline));
  }

  if (formatted) {
    lines.push('');
    lines.push('## Manuscript');
    lines.push(formatted);
    return lines.join('\n');
  }

  const chapters = ensureArray<any>(content.chapters, (chapter) => {
    const obj = ensureObject(chapter);
    const chapterTitle = ensureString(obj.title);
    if (!chapterTitle && !ensureString(obj.summary) && !ensureString(obj.draft_text ?? obj.draftText)) {
      return undefined;
    }
    return obj;
  }).filter(Boolean);

  if (chapters.length) {
    lines.push('');
    lines.push('## Chapters');

    chapters.forEach((chapterObj: any, index: number) => {
      const chapterTitle = ensureString(chapterObj.title) || `Chapter ${index + 1}`;
      lines.push('');
      lines.push(`### ${chapterTitle}`);

      const summary = ensureString(chapterObj.summary);
      if (summary) {
        lines.push('');
        lines.push(summary);
      }

      const keyPoints = ensureStringArray(chapterObj.key_points ?? chapterObj.keyPoints);
      if (keyPoints.length) {
        lines.push('');
        lines.push('**Key Points**');
        lines.push(formatList(keyPoints));
      }

      const draftText = ensureString(chapterObj.draft_text ?? chapterObj.draftText);
      if (draftText) {
        lines.push('');
        lines.push(draftText);
      }
    });
  }

  if (lines.length <= 3) {
    return JSON.stringify(source, null, 2);
  }

  return lines.join('\n');
};

const normalizeEncounter = (generatedContent: unknown): NormalizedEncounter => {
  const source = ensureObject(generatedContent);
  const encounter = ensureObject(source.encounter ?? source.encounter_details);
  const merged = Object.keys(encounter).length ? encounter : source;

  // Normalize tactics — handle both string (legacy) and object (v1.1) formats
  const rawTactics = merged.tactics ?? source.tactics;
  const tacticsObj = typeof rawTactics === 'object' && rawTactics && !Array.isArray(rawTactics)
    ? ensureObject(rawTactics)
    : {};
  const normalizedTactics = {
    opening_moves: ensureString(tacticsObj.opening_moves),
    focus_targets: ensureString(tacticsObj.focus_targets),
    resource_usage: ensureString(tacticsObj.resource_usage),
    fallback_plan: ensureString(tacticsObj.fallback_plan),
    morale: ensureString(tacticsObj.morale),
    coordination: ensureString(tacticsObj.coordination),
  };
  // If tactics was a plain string (legacy), put it in opening_moves
  if (typeof rawTactics === 'string' && rawTactics.trim()) {
    normalizedTactics.opening_moves = normalizedTactics.opening_moves || rawTactics.trim();
  }

  // Normalize scaling — handle both string (legacy) and object (v1.1) formats
  const rawScaling = merged.scaling ?? source.scaling;
  const scalingObj = typeof rawScaling === 'object' && rawScaling && !Array.isArray(rawScaling)
    ? ensureObject(rawScaling)
    : {};
  const normalizedScaling = {
    easier: ensureString(scalingObj.easier),
    harder: ensureString(scalingObj.harder),
    party_size_adjust: ensureString(scalingObj.party_size_adjust),
  };
  if (typeof rawScaling === 'string' && rawScaling.trim()) {
    normalizedScaling.easier = normalizedScaling.easier || rawScaling.trim();
  }

  // Normalize terrain
  const rawTerrain = ensureObject(merged.terrain ?? source.terrain);
  const normalizedTerrain = {
    description: ensureString(rawTerrain.description ?? merged.environment ?? source.environment),
    features: ensureArray<TerrainFeature>(rawTerrain.features, (f) => {
      const obj = ensureObject(f);
      const name = ensureString(obj.name);
      const effect = ensureString(obj.effect);
      if (!name && !effect) return undefined;
      return {
        name,
        effect,
        dc: Number.isFinite(obj.dc as number) ? (obj.dc as number) : undefined,
        cover: ensureString(obj.cover) || undefined,
        movement_cost: ensureString(obj.movement_cost) || undefined,
      };
    }),
    lighting: ensureString(rawTerrain.lighting),
    elevation: ensureString(rawTerrain.elevation),
    weather: ensureString(rawTerrain.weather),
    map_dimensions: ensureString(rawTerrain.map_dimensions),
  };

  // Normalize event clock
  const rawEventClock = ensureObject(merged.event_clock ?? source.event_clock);
  const normalizedEventClock = {
    summary: ensureString(rawEventClock.summary),
    phases: ensureArray<EventClockPhase>(rawEventClock.phases, (p) => {
      const obj = ensureObject(p);
      const name = ensureString(obj.name);
      const trigger = ensureString(obj.trigger);
      const outcome = ensureString(obj.outcome);
      if (!name && !trigger && !outcome) return undefined;
      return {
        name,
        trigger,
        outcome,
        round: Number.isFinite(obj.round as number) ? (obj.round as number) : undefined,
      };
    }),
  };

  // Normalize treasure
  const rawTreasure = ensureObject(merged.treasure ?? source.treasure);
  const currencyObj = ensureObject(rawTreasure.currency);
  const normalizedTreasure = {
    currency: {
      cp: Number.isFinite(currencyObj.cp as number) ? (currencyObj.cp as number) : 0,
      sp: Number.isFinite(currencyObj.sp as number) ? (currencyObj.sp as number) : 0,
      ep: Number.isFinite(currencyObj.ep as number) ? (currencyObj.ep as number) : 0,
      gp: Number.isFinite(currencyObj.gp as number) ? (currencyObj.gp as number) : 0,
      pp: Number.isFinite(currencyObj.pp as number) ? (currencyObj.pp as number) : 0,
    },
    items: ensureArray<{ name: string; rarity?: string; description?: string; value?: string }>(rawTreasure.items, (i) => {
      const obj = ensureObject(i);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        rarity: ensureString(obj.rarity) || undefined,
        description: ensureString(obj.description) || undefined,
        value: ensureString(obj.value) || undefined,
      };
    }),
    boons: ensureStringArray(rawTreasure.boons),
  };

  // Normalize consequences
  const rawConsequences = ensureObject(merged.consequences ?? source.consequences);
  const normalizedConsequences = {
    success: ensureString(rawConsequences.success),
    failure: ensureString(rawConsequences.failure),
    partial: ensureString(rawConsequences.partial),
    story_hooks: ensureStringArray(rawConsequences.story_hooks),
  };

  return {
    title: ensureString(merged.title ?? source.title ?? 'Untitled Encounter'),
    description: ensureString(merged.description ?? source.description),
    encounter_type: ensureString(merged.encounter_type),
    difficulty_tier: ensureString(merged.difficulty_tier ?? merged.difficulty),
    party_level: Number.isFinite(merged.party_level as number) ? (merged.party_level as number) : undefined,
    party_size: Number.isFinite(merged.party_size as number) ? (merged.party_size as number) : undefined,
    xp_budget: Number.isFinite(merged.xp_budget as number) ? (merged.xp_budget as number) : undefined,
    adjusted_xp: Number.isFinite(merged.adjusted_xp as number) ? (merged.adjusted_xp as number) : undefined,
    expected_duration_rounds: Number.isFinite(merged.expected_duration_rounds as number) ? (merged.expected_duration_rounds as number) : undefined,
    location: ensureString(merged.location ?? source.location),
    setting_context: ensureString(merged.setting_context),
    objectives: ensureStringArray(merged.objectives ?? source.objectives),
    failure_conditions: ensureStringArray(merged.failure_conditions),
    monsters: ensureArray<EncounterMonster>(merged.monsters, (m) => {
      const obj = ensureObject(m);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        count: Number.isFinite(obj.count as number) ? (obj.count as number) : 1,
        cr: ensureString(obj.cr),
        xp: Number.isFinite(obj.xp as number) ? (obj.xp as number) : 0,
        ac: Number.isFinite(obj.ac as number) ? (obj.ac as number) : 0,
        hp: Number.isFinite(obj.hp as number) ? (obj.hp as number) : 0,
        speed: ensureString(obj.speed),
        role: ensureString(obj.role),
        positioning: ensureString(obj.positioning),
        key_abilities: ensureStringArray(obj.key_abilities),
        source: ensureString(obj.source),
        notes: ensureString(obj.notes),
      };
    }),
    npcs: ensureArray<EncounterNpc>(merged.npcs ?? merged.NPCs, (n) => {
      const obj = ensureObject(n);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        role: ensureString(obj.role),
        affiliation: ensureString(obj.affiliation),
        motivation: ensureString(obj.motivation),
        stat_reference: ensureString(obj.stat_reference ?? obj.stat_block),
        notes: ensureString(obj.notes),
      };
    }),
    terrain: normalizedTerrain,
    hazards: ensureArray<EncounterHazard>(merged.hazards, (h) => {
      const obj = ensureObject(h);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        description: ensureString(obj.description),
        impact: ensureString(obj.impact),
        dc: Number.isFinite(obj.dc as number) ? (obj.dc as number) : undefined,
        damage: ensureString(obj.damage) || undefined,
        trigger: ensureString(obj.trigger) || undefined,
        mitigation: ensureString(obj.mitigation) || undefined,
      };
    }),
    traps: ensureArray<EncounterTrap>(merged.traps, (t) => {
      const obj = ensureObject(t);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        trigger: ensureString(obj.trigger),
        effect: ensureString(obj.effect),
        dc: Number.isFinite(obj.dc as number) ? (obj.dc as number) : 0,
        damage: ensureString(obj.damage) || undefined,
        disarm: ensureString(obj.disarm) || undefined,
        detection_dc: Number.isFinite(obj.detection_dc as number) ? (obj.detection_dc as number) : undefined,
      };
    }),
    tactics: normalizedTactics,
    event_clock: normalizedEventClock,
    treasure: normalizedTreasure,
    consequences: normalizedConsequences,
    scaling: normalizedScaling,
    notes: ensureStringArray(merged.notes ?? source.notes),
    // Legacy fields for backward compatibility
    hooks: ensureStringArray(source.hooks),
    environment: normalizedTerrain.description,
    enemies: ensureArray<EncounterEnemy>(merged.enemies, (enemy) => {
      const enemyObj = ensureObject(enemy);
      const name = ensureString(enemyObj.name ?? enemyObj.creature_type ?? enemyObj.title ?? 'Unnamed enemy');
      const role = ensureString(enemyObj.role);
      const tactics = ensureString(enemyObj.tactics);
      const quantityRaw = enemyObj.quantity ?? enemyObj.count ?? 1;
      const quantity = Number.isFinite(quantityRaw as number) ? (quantityRaw as number) : 1;
      return { name, role, tactics, quantity, stat_block: ensureObject(enemyObj.stat_block) };
    }),
    loot: ensureArray<string>(merged.loot ?? source.loot, (item) => {
      if (typeof item === 'string') return ensureString(item);
      const obj = ensureObject(item);
      const name = ensureString(obj.name ?? obj.item);
      const desc = ensureString(obj.description);
      return [name, desc].filter(Boolean).join(' - ') || undefined;
    }),
    stat_blocks: ensureArray<Record<string, unknown>>(source.stat_blocks, (block) => ensureObject(block)),
    phases: normalizedEventClock.phases.map((p) => `${p.name}: ${p.trigger} → ${p.outcome}`),
  };
};

const formatEncounterContent = (normalized: NormalizedEncounter): string => {
  const lines: string[] = [];
  lines.push(`## Encounter: ${normalized.title}`);
  lines.push('');
  lines.push(normalized.description || 'No description provided.');
  lines.push('');

  // Encounter metadata
  if (normalized.encounter_type) lines.push(`**Type:** ${normalized.encounter_type}`);
  if (normalized.difficulty_tier) lines.push(`**Difficulty:** ${normalized.difficulty_tier}`);
  if (normalized.party_level) lines.push(`**Party Level:** ${normalized.party_level}${normalized.party_size ? ` (${normalized.party_size} players)` : ''}`);
  if (normalized.xp_budget) lines.push(`**XP Budget:** ${normalized.xp_budget}${normalized.adjusted_xp ? ` (adjusted: ${normalized.adjusted_xp})` : ''}`);
  if (normalized.expected_duration_rounds) lines.push(`**Expected Duration:** ~${normalized.expected_duration_rounds} rounds`);
  lines.push(`**Location:** ${normalized.location || 'Unknown'}`);
  if (normalized.setting_context) lines.push(`**Context:** ${normalized.setting_context}`);

  // Objectives
  if (normalized.objectives.length) {
    lines.push('');
    lines.push('### Objectives');
    lines.push(formatList(normalized.objectives));
  }
  if (normalized.failure_conditions.length) {
    lines.push('');
    lines.push('### Failure Conditions');
    lines.push(formatList(normalized.failure_conditions));
  }

  // Monsters (v1.1 format)
  if (normalized.monsters.length) {
    lines.push('');
    lines.push('### Monsters');
    for (const monster of normalized.monsters) {
      const header = `- **${monster.name}** (×${monster.count}) — CR ${monster.cr || '?'}${monster.xp ? ` (${monster.xp} XP)` : ''}`;
      lines.push(header);
      if (monster.ac || monster.hp) lines.push(`  - AC ${monster.ac || '?'}, HP ${monster.hp || '?'}${monster.speed ? `, Speed ${monster.speed}` : ''}`);
      if (monster.role) lines.push(`  - Role: ${monster.role}`);
      if (monster.positioning) lines.push(`  - Position: ${monster.positioning}`);
      if (monster.key_abilities.length) lines.push(`  - Key Abilities: ${monster.key_abilities.join(', ')}`);
      if (monster.source) lines.push(`  - Source: ${monster.source}`);
      if (monster.notes) lines.push(`  - Notes: ${monster.notes}`);
    }
  }

  // Legacy enemies (backward compat)
  if (!normalized.monsters.length && normalized.enemies.length) {
    lines.push('');
    lines.push('### Opponents');
    for (const enemy of normalized.enemies) {
      lines.push(`- **${enemy.name}**`);
      if (enemy.role) lines.push(`  - Role: ${enemy.role}`);
      if (enemy.quantity) lines.push(`  - Quantity: ${enemy.quantity}`);
      if (enemy.tactics) lines.push(`  - Tactics: ${enemy.tactics}`);
    }
  }

  // NPCs
  if (normalized.npcs.length) {
    lines.push('');
    lines.push('### NPCs');
    for (const npc of normalized.npcs) {
      lines.push(`- **${npc.name}**${npc.role ? ` (${npc.role})` : ''}`);
      if (npc.affiliation) lines.push(`  - Affiliation: ${npc.affiliation}`);
      if (npc.motivation) lines.push(`  - Motivation: ${npc.motivation}`);
      if (npc.stat_reference) lines.push(`  - Stat Reference: ${npc.stat_reference}`);
    }
  }

  // Terrain
  if (normalized.terrain.description || normalized.terrain.features.length) {
    lines.push('');
    lines.push('### Terrain & Environment');
    if (normalized.terrain.description) lines.push(normalized.terrain.description);
    if (normalized.terrain.lighting) lines.push(`**Lighting:** ${normalized.terrain.lighting}`);
    if (normalized.terrain.elevation) lines.push(`**Elevation:** ${normalized.terrain.elevation}`);
    if (normalized.terrain.weather) lines.push(`**Weather:** ${normalized.terrain.weather}`);
    if (normalized.terrain.map_dimensions) lines.push(`**Map Size:** ${normalized.terrain.map_dimensions}`);
    if (normalized.terrain.features.length) {
      lines.push('');
      lines.push('**Terrain Features:**');
      for (const feature of normalized.terrain.features) {
        let line = `- **${feature.name}**: ${feature.effect}`;
        if (feature.dc) line += ` (DC ${feature.dc})`;
        if (feature.cover) line += ` [${feature.cover} cover]`;
        if (feature.movement_cost) line += ` [${feature.movement_cost}]`;
        lines.push(line);
      }
    }
  }

  // Hazards
  if (normalized.hazards.length) {
    lines.push('');
    lines.push('### Hazards');
    for (const hazard of normalized.hazards) {
      lines.push(`- **${hazard.name}**: ${hazard.description || hazard.impact}`);
      if (hazard.damage) lines.push(`  - Damage: ${hazard.damage}${hazard.dc ? ` (DC ${hazard.dc})` : ''}`);
      if (hazard.trigger) lines.push(`  - Trigger: ${hazard.trigger}`);
      if (hazard.mitigation) lines.push(`  - Mitigation: ${hazard.mitigation}`);
    }
  }

  // Traps
  if (normalized.traps.length) {
    lines.push('');
    lines.push('### Traps');
    for (const trap of normalized.traps) {
      lines.push(`- **${trap.name}**`);
      lines.push(`  - Trigger: ${trap.trigger}`);
      lines.push(`  - Effect: ${trap.effect}${trap.damage ? ` (${trap.damage})` : ''}`);
      lines.push(`  - DC: ${trap.dc}${trap.detection_dc ? `, Detection DC: ${trap.detection_dc}` : ''}`);
      if (trap.disarm) lines.push(`  - Disarm: ${trap.disarm}`);
    }
  }

  // Tactics
  const t = normalized.tactics;
  if (t.opening_moves || t.focus_targets || t.fallback_plan || t.coordination) {
    lines.push('');
    lines.push('### Tactics');
    if (t.opening_moves) lines.push(`**Opening Moves:** ${t.opening_moves}`);
    if (t.focus_targets) lines.push(`**Focus Targets:** ${t.focus_targets}`);
    if (t.resource_usage) lines.push(`**Resource Usage:** ${t.resource_usage}`);
    if (t.coordination) lines.push(`**Coordination:** ${t.coordination}`);
    if (t.fallback_plan) lines.push(`**Fallback Plan:** ${t.fallback_plan}`);
    if (t.morale) lines.push(`**Morale:** ${t.morale}`);
  }

  // Event Clock
  if (normalized.event_clock.phases.length) {
    lines.push('');
    lines.push('### Event Clock');
    if (normalized.event_clock.summary) lines.push(normalized.event_clock.summary);
    for (const phase of normalized.event_clock.phases) {
      const roundStr = phase.round ? ` (Round ${phase.round})` : '';
      lines.push(`- **${phase.name}**${roundStr}: ${phase.trigger} → ${phase.outcome}`);
    }
  }

  // Treasure
  const tr = normalized.treasure;
  const hasCurrency = Object.values(tr.currency).some((v) => v > 0);
  if (hasCurrency || tr.items.length || tr.boons.length) {
    lines.push('');
    lines.push('### Treasure & Rewards');
    if (hasCurrency) {
      const coins = Object.entries(tr.currency)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      lines.push(`**Currency:** ${coins}`);
    }
    if (tr.items.length) {
      lines.push('**Items:**');
      for (const item of tr.items) {
        let line = `- ${item.name}`;
        if (item.rarity) line += ` (${item.rarity})`;
        if (item.description) line += ` — ${item.description}`;
        if (item.value) line += ` [${item.value}]`;
        lines.push(line);
      }
    }
    if (tr.boons.length) {
      lines.push('**Boons:**');
      lines.push(formatList(tr.boons));
    }
  }

  // Legacy loot (backward compat)
  if (!hasCurrency && !tr.items.length && normalized.loot.length) {
    lines.push('');
    lines.push('### Loot & Rewards');
    lines.push(formatList(normalized.loot));
  }

  // Consequences
  const c = normalized.consequences;
  if (c.success || c.failure || c.partial || c.story_hooks.length) {
    lines.push('');
    lines.push('### Consequences');
    if (c.success) lines.push(`**Success:** ${c.success}`);
    if (c.failure) lines.push(`**Failure:** ${c.failure}`);
    if (c.partial) lines.push(`**Partial Success:** ${c.partial}`);
    if (c.story_hooks.length) {
      lines.push('**Story Hooks:**');
      lines.push(formatList(c.story_hooks));
    }
  }

  // Scaling
  const s = normalized.scaling;
  if (s.easier || s.harder || s.party_size_adjust) {
    lines.push('');
    lines.push('### Scaling');
    if (s.easier) lines.push(`**Easier:** ${s.easier}`);
    if (s.harder) lines.push(`**Harder:** ${s.harder}`);
    if (s.party_size_adjust) lines.push(`**Party Size Adjust:** ${s.party_size_adjust}`);
  }

  // Notes
  if (normalized.notes.length) {
    lines.push('');
    lines.push('### GM Notes');
    lines.push(formatList(normalized.notes));
  }

  // Legacy hooks
  if (normalized.hooks.length) {
    lines.push('');
    lines.push('### Adventure Hooks');
    lines.push(formatList(normalized.hooks));
  }

  // Legacy stat blocks
  if (normalized.stat_blocks.some((block) => Object.keys(block).length)) {
    lines.push('');
    lines.push('### Stat Blocks');
    normalized.stat_blocks.forEach((block, index) => {
      if (!block || Object.keys(block).length === 0) return;
      lines.push('');
      lines.push(`#### Creature ${index + 1}`);
      lines.push('```json');
      lines.push(JSON.stringify(block, null, 2));
      lines.push('```');
    });
  }

  return lines.join('\n');
};

const normalizeItem = (generatedContent: unknown): NormalizedItem => {
  const source = ensureObject(generatedContent);
  const item = ensureObject(source.item ?? generatedContent);

  // Normalize attunement — handle both string (legacy) and object (v1.1) formats
  const rawAttunement = item.attunement;
  let normalizedAttunement = { required: false, restrictions: '' };
  if (typeof rawAttunement === 'string') {
    const lower = rawAttunement.toLowerCase();
    normalizedAttunement = {
      required: lower !== 'no' && lower !== 'false' && lower !== '' && lower !== 'none',
      restrictions: lower.includes('by ') ? rawAttunement : '',
    };
  } else if (rawAttunement && typeof rawAttunement === 'object' && !Array.isArray(rawAttunement)) {
    const attObj = ensureObject(rawAttunement);
    normalizedAttunement = {
      required: attObj.required === true || attObj.required === 'true' || attObj.required === 'yes',
      restrictions: ensureString(attObj.restrictions),
    };
  }

  // Normalize charges
  const rawCharges = ensureObject(item.charges);
  const normalizedCharges = {
    maximum: Number.isFinite(rawCharges.maximum as number) ? (rawCharges.maximum as number) : 0,
    recharge: ensureString(rawCharges.recharge),
    on_last_charge: ensureString(rawCharges.on_last_charge),
  };

  // Normalize curse
  const rawCurse = ensureObject(item.curse);
  const normalizedCurse = {
    is_cursed: rawCurse.is_cursed === true || rawCurse.is_cursed === 'true',
    description: ensureString(rawCurse.description),
    trigger: ensureString(rawCurse.trigger),
    removal: ensureString(rawCurse.removal),
    hidden: rawCurse.hidden === true || rawCurse.hidden === 'true',
  };

  // Normalize sentience
  const rawSentience = ensureObject(item.sentience);
  const normalizedSentience = {
    is_sentient: rawSentience.is_sentient === true || rawSentience.is_sentient === 'true',
    alignment: ensureString(rawSentience.alignment),
    intelligence: Number.isFinite(rawSentience.intelligence as number) ? (rawSentience.intelligence as number) : 0,
    wisdom: Number.isFinite(rawSentience.wisdom as number) ? (rawSentience.wisdom as number) : 0,
    charisma: Number.isFinite(rawSentience.charisma as number) ? (rawSentience.charisma as number) : 0,
    communication: ensureString(rawSentience.communication),
    senses: ensureString(rawSentience.senses),
    purpose: ensureString(rawSentience.purpose),
    personality: ensureString(rawSentience.personality),
    conflict: ensureString(rawSentience.conflict),
  };

  // Normalize properties — handle both string array (legacy) and object array (v1.1)
  const rawProperties = item.properties;
  const propertiesV2 = ensureArray<ItemProperty>(rawProperties, (p) => {
    if (typeof p === 'string') {
      const text = ensureString(p);
      if (!text) return undefined;
      return { name: text.slice(0, 80), description: text };
    }
    const obj = ensureObject(p);
    const name = ensureString(obj.name);
    const description = ensureString(obj.description);
    if (!name && !description) return undefined;
    return {
      name: name || 'Property',
      description: description || 'Details unavailable.',
      activation: ensureString(obj.activation) || undefined,
      uses: ensureString(obj.uses) || undefined,
      recharge: ensureString(obj.recharge) || undefined,
      save_dc: Number.isFinite(obj.save_dc as number) ? (obj.save_dc as number) : undefined,
      save_type: ensureString(obj.save_type) || undefined,
      damage: ensureString(obj.damage) || undefined,
      bonus: ensureString(obj.bonus) || undefined,
      duration: ensureString(obj.duration) || undefined,
      range: ensureString(obj.range) || undefined,
      notes: ensureString(obj.notes) || undefined,
    };
  });

  return {
    name: ensureString(item.name ?? source.title ?? 'Unnamed Item'),
    item_type: ensureString(item.item_type ?? item.type ?? item.category),
    item_subtype: ensureString(item.item_subtype ?? item.subtype ?? item.base_item),
    rarity: ensureString(item.rarity),
    attunement: normalizedAttunement,
    description: ensureString(item.description),
    appearance: ensureString(item.appearance),
    weight: ensureString(item.weight),
    value: ensureString(item.value),
    properties_v2: propertiesV2,
    charges: normalizedCharges,
    spells: ensureArray<ItemSpell>(item.spells, (s) => {
      const obj = ensureObject(s);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        level: Number.isFinite(obj.level as number) ? (obj.level as number) : undefined,
        charges_cost: Number.isFinite(obj.charges_cost as number) ? (obj.charges_cost as number) : undefined,
        notes: ensureString(obj.notes) || undefined,
      };
    }),
    weapon_properties: ensureObject(item.weapon_properties),
    armor_properties: ensureObject(item.armor_properties),
    history: ensureString(item.history ?? item.origin),
    creator: ensureString(item.creator),
    previous_owners: ensureArray<PreviousOwner>(item.previous_owners, (o) => {
      const obj = ensureObject(o);
      const name = ensureString(obj.name);
      if (!name) return undefined;
      return {
        name,
        era: ensureString(obj.era) || undefined,
        notable_deed: ensureString(obj.notable_deed) || undefined,
      };
    }),
    quirks: ensureStringArray(item.quirks),
    curse: normalizedCurse,
    sentience: normalizedSentience,
    campaign_hooks: ensureStringArray(item.campaign_hooks),
    notes: ensureStringArray(item.notes ?? source.notes),
    // Legacy fields
    type: ensureString(item.type ?? item.item_type ?? item.category),
    properties: ensureStringArray(item.properties).filter(Boolean),
    abilities: ensureStringArray(item.abilities ?? item.effects).filter(Boolean),
    usage: ensureString(item.usage ?? item.activation),
    drawbacks: ensureString(item.drawbacks ?? item.curses),
    mechanics: ensureObject(item.mechanics),
  };
};

const formatItemContent = (normalized: NormalizedItem): string => {
  const lines: string[] = [];
  lines.push(`## Item: ${normalized.name}`);
  lines.push('');

  // Item metadata
  lines.push(`**Type:** ${normalized.item_type || normalized.type || 'Unknown'}${normalized.item_subtype ? ` (${normalized.item_subtype})` : ''}`);
  lines.push(`**Rarity:** ${normalized.rarity || 'Unknown'}`);
  if (normalized.attunement.required) {
    lines.push(`**Requires Attunement:** Yes${normalized.attunement.restrictions ? ` (${normalized.attunement.restrictions})` : ''}`);
  } else {
    lines.push(`**Requires Attunement:** No`);
  }
  if (normalized.weight) lines.push(`**Weight:** ${normalized.weight}`);
  if (normalized.value) lines.push(`**Value:** ${normalized.value}`);

  // Description & Appearance
  lines.push('');
  lines.push('### Description');
  lines.push(normalized.description || 'No description provided.');
  if (normalized.appearance) {
    lines.push('');
    lines.push(`**Appearance:** ${normalized.appearance}`);
  }

  // Magical Properties (v1.1)
  if (normalized.properties_v2.length) {
    lines.push('');
    lines.push('### Magical Properties');
    for (const prop of normalized.properties_v2) {
      let line = `- **${prop.name}**: ${prop.description}`;
      const details: string[] = [];
      if (prop.activation) details.push(`Activation: ${prop.activation}`);
      if (prop.uses) details.push(`Uses: ${prop.uses}`);
      if (prop.recharge) details.push(`Recharge: ${prop.recharge}`);
      if (prop.save_dc) details.push(`DC ${prop.save_dc}${prop.save_type ? ` ${prop.save_type}` : ''}`);
      if (prop.damage) details.push(`Damage: ${prop.damage}`);
      if (prop.bonus) details.push(`Bonus: ${prop.bonus}`);
      if (prop.duration) details.push(`Duration: ${prop.duration}`);
      lines.push(line);
      if (details.length) lines.push(`  - ${details.join(' | ')}`);
    }
  }

  // Charges
  if (normalized.charges.maximum > 0) {
    lines.push('');
    lines.push('### Charges');
    lines.push(`**Maximum Charges:** ${normalized.charges.maximum}`);
    if (normalized.charges.recharge) lines.push(`**Recharge:** ${normalized.charges.recharge}`);
    if (normalized.charges.on_last_charge) lines.push(`**On Last Charge:** ${normalized.charges.on_last_charge}`);
  }

  // Spells
  if (normalized.spells.length) {
    lines.push('');
    lines.push('### Spells');
    for (const spell of normalized.spells) {
      let line = `- **${spell.name}**`;
      if (spell.level !== undefined) line += ` (level ${spell.level})`;
      if (spell.charges_cost) line += ` — ${spell.charges_cost} charge${spell.charges_cost > 1 ? 's' : ''}`;
      if (spell.notes) line += ` — ${spell.notes}`;
      lines.push(line);
    }
  }

  // Weapon Properties
  if (Object.keys(normalized.weapon_properties).length) {
    lines.push('');
    lines.push('### Weapon Stats');
    const wp = normalized.weapon_properties;
    if (wp.damage) lines.push(`**Damage:** ${wp.damage}`);
    if (wp.bonus) lines.push(`**Bonus:** ${wp.bonus}`);
    if (wp.range) lines.push(`**Range:** ${wp.range}`);
    if (Array.isArray(wp.properties) && wp.properties.length) lines.push(`**Properties:** ${wp.properties.join(', ')}`);
  }

  // Armor Properties
  if (Object.keys(normalized.armor_properties).length) {
    lines.push('');
    lines.push('### Armor Stats');
    const ap = normalized.armor_properties;
    if (ap.base_ac) lines.push(`**Base AC:** ${ap.base_ac}`);
    if (ap.ac_bonus) lines.push(`**AC Bonus:** +${ap.ac_bonus}`);
    if (ap.armor_type) lines.push(`**Type:** ${ap.armor_type}`);
    if (ap.stealth_disadvantage) lines.push(`**Stealth:** Disadvantage`);
    if (ap.strength_requirement) lines.push(`**Strength Required:** ${ap.strength_requirement}`);
  }

  // History & Lore
  if (normalized.history) {
    lines.push('');
    lines.push('### Lore & History');
    lines.push(normalized.history);
    if (normalized.creator) lines.push(`**Creator:** ${normalized.creator}`);
  }

  // Previous Owners
  if (normalized.previous_owners.length) {
    lines.push('');
    lines.push('### Previous Owners');
    for (const owner of normalized.previous_owners) {
      let line = `- **${owner.name}**`;
      if (owner.era) line += ` (${owner.era})`;
      if (owner.notable_deed) line += `: ${owner.notable_deed}`;
      lines.push(line);
    }
  }

  // Quirks
  if (normalized.quirks.length) {
    lines.push('');
    lines.push('### Quirks');
    lines.push(formatList(normalized.quirks));
  }

  // Curse
  if (normalized.curse.is_cursed) {
    lines.push('');
    lines.push('### Curse');
    if (normalized.curse.hidden) lines.push('*This curse is hidden until triggered.*');
    if (normalized.curse.description) lines.push(normalized.curse.description);
    if (normalized.curse.trigger) lines.push(`**Trigger:** ${normalized.curse.trigger}`);
    if (normalized.curse.removal) lines.push(`**Removal:** ${normalized.curse.removal}`);
  }

  // Sentience
  if (normalized.sentience.is_sentient) {
    lines.push('');
    lines.push('### Sentience');
    if (normalized.sentience.alignment) lines.push(`**Alignment:** ${normalized.sentience.alignment}`);
    if (normalized.sentience.intelligence) lines.push(`**INT** ${normalized.sentience.intelligence}, **WIS** ${normalized.sentience.wisdom}, **CHA** ${normalized.sentience.charisma}`);
    if (normalized.sentience.communication) lines.push(`**Communication:** ${normalized.sentience.communication}`);
    if (normalized.sentience.senses) lines.push(`**Senses:** ${normalized.sentience.senses}`);
    if (normalized.sentience.purpose) lines.push(`**Purpose:** ${normalized.sentience.purpose}`);
    if (normalized.sentience.personality) lines.push(`**Personality:** ${normalized.sentience.personality}`);
    if (normalized.sentience.conflict) lines.push(`**Conflict:** ${normalized.sentience.conflict}`);
  }

  // Campaign Hooks
  if (normalized.campaign_hooks.length) {
    lines.push('');
    lines.push('### Campaign Hooks');
    lines.push(formatList(normalized.campaign_hooks));
  }

  // Legacy: drawbacks fallback
  if (normalized.drawbacks && !normalized.curse.is_cursed) {
    lines.push('');
    lines.push('### Drawbacks');
    lines.push(normalized.drawbacks);
  }

  // Notes
  if (normalized.notes.length) {
    lines.push('');
    lines.push('### GM Notes');
    lines.push(formatList(normalized.notes));
  }

  // Legacy mechanics (backward compat)
  if (!normalized.properties_v2.length && Object.keys(normalized.mechanics).length) {
    lines.push('');
    lines.push('### Mechanics');
    lines.push('```json');
    lines.push(JSON.stringify(normalized.mechanics, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
};

const normalizeMonsterFeatures = (raw: unknown): MonsterFeature[] => {
  return ensureArray<MonsterFeature>(raw, (item) => {
    if (typeof item === 'string') {
      const text = ensureString(item);
      if (!text) return undefined;
      return { name: text.slice(0, 80), description: text };
    }
    const obj = ensureObject(item);
    const name = ensureString(obj.name);
    const description = ensureString(obj.description);
    if (!name && !description) return undefined;
    return {
      name: name || 'Feature',
      description: description || 'No description.',
      attack_bonus: ensureString(obj.attack_bonus) || undefined,
      damage: ensureString(obj.damage) || undefined,
      uses: ensureString(obj.uses) || undefined,
      recharge: ensureString(obj.recharge) || undefined,
      cost: Number.isFinite(obj.cost as number) ? (obj.cost as number) : undefined,
      notes: ensureString(obj.notes) || undefined,
    };
  });
};

const normalizeMonster = (generatedContent: unknown): NormalizedMonster => {
  const source = ensureObject(generatedContent);
  const monster = ensureObject(source.monster ?? generatedContent);

  // Normalize ability scores
  const rawScores = ensureObject(monster.ability_scores);
  const abilityScores: AbilityScores = {
    str: Number.isFinite(rawScores.str as number) ? (rawScores.str as number) : 10,
    dex: Number.isFinite(rawScores.dex as number) ? (rawScores.dex as number) : 10,
    con: Number.isFinite(rawScores.con as number) ? (rawScores.con as number) : 10,
    int: Number.isFinite(rawScores.int as number) ? (rawScores.int as number) : 10,
    wis: Number.isFinite(rawScores.wis as number) ? (rawScores.wis as number) : 10,
    cha: Number.isFinite(rawScores.cha as number) ? (rawScores.cha as number) : 10,
  };

  // Normalize AC — handle integer, object, or array
  const rawAc = monster.armor_class;
  let normalizedAc: number | ArmorClassEntry[];
  if (typeof rawAc === 'number') {
    normalizedAc = rawAc;
  } else if (Array.isArray(rawAc)) {
    normalizedAc = ensureArray<ArmorClassEntry>(rawAc, (entry) => {
      const obj = ensureObject(entry);
      const value = Number.isFinite(obj.value as number) ? (obj.value as number) : 0;
      if (!value) return undefined;
      return { value, type: ensureString(obj.type) || undefined, notes: ensureString(obj.notes) || undefined };
    });
  } else if (rawAc && typeof rawAc === 'object') {
    const obj = ensureObject(rawAc);
    const value = Number.isFinite(obj.value as number) ? (obj.value as number) : 0;
    normalizedAc = value ? [{ value, type: ensureString(obj.type) || undefined, notes: ensureString(obj.notes) || undefined }] : 0;
  } else {
    normalizedAc = Number.isFinite(Number(rawAc)) ? Number(rawAc) : 0;
  }

  // Normalize HP — handle integer or object
  const rawHp = monster.hit_points;
  let normalizedHp: HitPointsDetails;
  if (typeof rawHp === 'number') {
    normalizedHp = { average: rawHp };
  } else if (rawHp && typeof rawHp === 'object') {
    const obj = ensureObject(rawHp);
    normalizedHp = {
      average: Number.isFinite(obj.average as number) ? (obj.average as number) : undefined,
      formula: ensureString(obj.formula) || undefined,
    };
  } else {
    normalizedHp = { average: Number.isFinite(Number(rawHp)) ? Number(rawHp) : 0 };
  }

  // Normalize legendary/mythic actions
  const rawLegendary = ensureObject(monster.legendary_actions);
  const legendaryActions = {
    summary: ensureString(rawLegendary.summary),
    options: normalizeMonsterFeatures(rawLegendary.options),
  };

  const rawMythic = ensureObject(monster.mythic_actions);
  const mythicActions = {
    summary: ensureString(rawMythic.summary),
    options: normalizeMonsterFeatures(rawMythic.options),
  };

  // Normalize saving throws and skills
  const normalizeScoredEntries = (raw: unknown): ScoredEntry[] => {
    return ensureArray<ScoredEntry>(raw, (entry) => {
      const obj = ensureObject(entry);
      const name = ensureString(obj.name);
      const value = ensureString(obj.value ?? obj.modifier ?? obj.bonus);
      if (!name) return undefined;
      return { name, value: value || '+0', notes: ensureString(obj.notes) || undefined };
    });
  };

  return {
    name: ensureString(monster.name ?? source.title ?? 'Unnamed Monster'),
    description: ensureString(monster.description),
    size: ensureString(monster.size),
    creature_type: ensureString(monster.creature_type ?? monster.type),
    subtype: ensureString(monster.subtype),
    alignment: ensureString(monster.alignment),
    challenge_rating: ensureString(monster.challenge_rating ?? monster.cr),
    experience_points: Number.isFinite(monster.experience_points as number) ? (monster.experience_points as number) : 0,
    proficiency_bonus: Number.isFinite(monster.proficiency_bonus as number) ? (monster.proficiency_bonus as number) : 2,
    ability_scores: abilityScores,
    armor_class: normalizedAc,
    hit_points: normalizedHp,
    hit_dice: ensureString(monster.hit_dice),
    speed: ensureObject(monster.speed),
    saving_throws: normalizeScoredEntries(monster.saving_throws),
    skill_proficiencies: normalizeScoredEntries(monster.skill_proficiencies ?? monster.skills),
    damage_vulnerabilities: ensureStringArray(monster.damage_vulnerabilities),
    damage_resistances: ensureStringArray(monster.damage_resistances),
    damage_immunities: ensureStringArray(monster.damage_immunities),
    condition_immunities: ensureStringArray(monster.condition_immunities),
    senses: ensureStringArray(monster.senses),
    passive_perception: Number.isFinite(monster.passive_perception as number) ? (monster.passive_perception as number) : 0,
    languages: ensureStringArray(monster.languages),
    abilities: normalizeMonsterFeatures(monster.abilities ?? monster.traits),
    actions: normalizeMonsterFeatures(monster.actions),
    bonus_actions: normalizeMonsterFeatures(monster.bonus_actions),
    reactions: normalizeMonsterFeatures(monster.reactions),
    multiattack: ensureString(monster.multiattack),
    spellcasting: ensureObject(monster.spellcasting),
    legendary_actions: legendaryActions,
    mythic_actions: mythicActions,
    lair_actions: ensureStringArray(monster.lair_actions),
    regional_effects: ensureStringArray(monster.regional_effects),
    location: ensureString(monster.location ?? monster.habitat),
    ecology: ensureString(monster.ecology),
    lore: ensureString(monster.lore),
    tactics: ensureString(monster.tactics),
    notes: ensureStringArray(monster.notes),
    sources: ensureStringArray(monster.sources ?? monster.sources_used),
  };
};

const formatMonsterContent = (normalized: NormalizedMonster): string => {
  const lines: string[] = [];

  // Header
  lines.push(`## ${normalized.name}`);
  lines.push('');
  lines.push(`*${normalized.size || 'Medium'} ${normalized.creature_type || 'creature'}${normalized.subtype ? ` (${normalized.subtype})` : ''}, ${normalized.alignment || 'unaligned'}*`);
  lines.push('');

  // Core Stats
  const acDisplay = typeof normalized.armor_class === 'number'
    ? `${normalized.armor_class}`
    : Array.isArray(normalized.armor_class)
      ? normalized.armor_class.map(e => `${e.value}${e.type ? ` (${e.type})` : ''}`).join(', ')
      : '10';
  lines.push(`**Armor Class** ${acDisplay}`);

  const hpDisplay = normalized.hit_points.average
    ? `${normalized.hit_points.average}${normalized.hit_dice ? ` (${normalized.hit_dice})` : (normalized.hit_points.formula ? ` (${normalized.hit_points.formula})` : '')}`
    : normalized.hit_dice || '0';
  lines.push(`**Hit Points** ${hpDisplay}`);

  // Speed
  const speedEntries: string[] = [];
  const speed = normalized.speed;
  if (speed.walk) speedEntries.push(`${speed.walk}`);
  if (speed.fly) speedEntries.push(`fly ${speed.fly}${speed.hover ? ' (hover)' : ''}`);
  if (speed.swim) speedEntries.push(`swim ${speed.swim}`);
  if (speed.climb) speedEntries.push(`climb ${speed.climb}`);
  if (speed.burrow) speedEntries.push(`burrow ${speed.burrow}`);
  lines.push(`**Speed** ${speedEntries.join(', ') || '30 ft.'}`);
  lines.push('');

  // Ability Scores
  const scores = normalized.ability_scores;
  const mod = (score: number) => {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  };
  lines.push('| STR | DEX | CON | INT | WIS | CHA |');
  lines.push('|-----|-----|-----|-----|-----|-----|');
  lines.push(`| ${scores.str} (${mod(scores.str)}) | ${scores.dex} (${mod(scores.dex)}) | ${scores.con} (${mod(scores.con)}) | ${scores.int} (${mod(scores.int)}) | ${scores.wis} (${mod(scores.wis)}) | ${scores.cha} (${mod(scores.cha)}) |`);
  lines.push('');

  // Saving Throws
  if (normalized.saving_throws.length) {
    lines.push(`**Saving Throws** ${normalized.saving_throws.map(s => `${s.name} ${s.value}`).join(', ')}`);
  }

  // Skills
  if (normalized.skill_proficiencies.length) {
    lines.push(`**Skills** ${normalized.skill_proficiencies.map(s => `${s.name} ${s.value}`).join(', ')}`);
  }

  // Damage/Condition info
  if (normalized.damage_vulnerabilities.length) lines.push(`**Damage Vulnerabilities** ${normalized.damage_vulnerabilities.join(', ')}`);
  if (normalized.damage_resistances.length) lines.push(`**Damage Resistances** ${normalized.damage_resistances.join(', ')}`);
  if (normalized.damage_immunities.length) lines.push(`**Damage Immunities** ${normalized.damage_immunities.join(', ')}`);
  if (normalized.condition_immunities.length) lines.push(`**Condition Immunities** ${normalized.condition_immunities.join(', ')}`);

  // Senses
  if (normalized.senses.length || normalized.passive_perception) {
    const senseParts = [...normalized.senses];
    if (normalized.passive_perception) senseParts.push(`passive Perception ${normalized.passive_perception}`);
    lines.push(`**Senses** ${senseParts.join(', ')}`);
  }

  // Languages
  lines.push(`**Languages** ${normalized.languages.length ? normalized.languages.join(', ') : '—'}`);

  // CR
  lines.push(`**Challenge** ${normalized.challenge_rating || '0'}${normalized.experience_points ? ` (${normalized.experience_points.toLocaleString()} XP)` : ''}${normalized.proficiency_bonus ? ` **Proficiency Bonus** +${normalized.proficiency_bonus}` : ''}`);
  lines.push('');
  lines.push('---');

  // Description
  if (normalized.description) {
    lines.push('');
    lines.push(normalized.description);
  }

  // Abilities (Traits)
  if (normalized.abilities.length) {
    lines.push('');
    lines.push('### Traits');
    for (const ability of normalized.abilities) {
      let header = `**${ability.name}`;
      if (ability.recharge) header += ` (${ability.recharge})`;
      if (ability.uses) header += ` (${ability.uses})`;
      header += '.**';
      lines.push(`${header} ${ability.description}`);
    }
  }

  // Actions
  if (normalized.actions.length || normalized.multiattack) {
    lines.push('');
    lines.push('### Actions');
    if (normalized.multiattack) {
      lines.push(`**Multiattack.** ${normalized.multiattack}`);
    }
    for (const action of normalized.actions) {
      let header = `**${action.name}`;
      if (action.recharge) header += ` (${action.recharge})`;
      if (action.uses) header += ` (${action.uses})`;
      header += '.**';
      lines.push(`${header} ${action.description}`);
    }
  }

  // Bonus Actions
  if (normalized.bonus_actions.length) {
    lines.push('');
    lines.push('### Bonus Actions');
    for (const ba of normalized.bonus_actions) {
      lines.push(`**${ba.name}.** ${ba.description}`);
    }
  }

  // Reactions
  if (normalized.reactions.length) {
    lines.push('');
    lines.push('### Reactions');
    for (const reaction of normalized.reactions) {
      lines.push(`**${reaction.name}.** ${reaction.description}`);
    }
  }

  // Spellcasting
  if (Object.keys(normalized.spellcasting).length) {
    const sc = normalized.spellcasting;
    lines.push('');
    lines.push('### Spellcasting');
    if (sc.type) lines.push(`**${sc.type}**`);
    if (sc.ability) lines.push(`Spellcasting ability: ${sc.ability}${sc.save_dc ? `, spell save DC ${sc.save_dc}` : ''}${sc.attack_bonus ? `, ${sc.attack_bonus} to hit` : ''}`);
    if (Array.isArray(sc.at_will) && sc.at_will.length) lines.push(`At will: ${sc.at_will.join(', ')}`);
    if (sc.per_day && typeof sc.per_day === 'object') {
      for (const [freq, spells] of Object.entries(sc.per_day)) {
        if (Array.isArray(spells)) lines.push(`${freq}: ${spells.join(', ')}`);
      }
    }
    if (Array.isArray(sc.spells_known)) {
      for (const spell of sc.spells_known) {
        if (typeof spell === 'object' && spell !== null) {
          const s = spell as { name?: string; level?: number; notes?: string };
          lines.push(`- ${s.name || 'Unknown'}${s.level !== undefined ? ` (level ${s.level})` : ''}${s.notes ? ` — ${s.notes}` : ''}`);
        }
      }
    }
  }

  // Legendary Actions
  if (normalized.legendary_actions.options.length) {
    lines.push('');
    lines.push('### Legendary Actions');
    if (normalized.legendary_actions.summary) lines.push(normalized.legendary_actions.summary);
    lines.push('');
    for (const la of normalized.legendary_actions.options) {
      let header = `**${la.name}`;
      if (la.cost && la.cost > 1) header += ` (Costs ${la.cost} Actions)`;
      header += '.**';
      lines.push(`${header} ${la.description}`);
    }
  }

  // Mythic Actions
  if (normalized.mythic_actions.options.length) {
    lines.push('');
    lines.push('### Mythic Actions');
    if (normalized.mythic_actions.summary) lines.push(normalized.mythic_actions.summary);
    lines.push('');
    for (const ma of normalized.mythic_actions.options) {
      let header = `**${ma.name}`;
      if (ma.cost && ma.cost > 1) header += ` (Costs ${ma.cost} Actions)`;
      header += '.**';
      lines.push(`${header} ${ma.description}`);
    }
  }

  // Lair Actions
  if (normalized.lair_actions.length) {
    lines.push('');
    lines.push('### Lair Actions');
    lines.push(formatList(normalized.lair_actions));
  }

  // Regional Effects
  if (normalized.regional_effects.length) {
    lines.push('');
    lines.push('### Regional Effects');
    lines.push(formatList(normalized.regional_effects));
  }

  // Ecology & Lore
  if (normalized.ecology || normalized.lore) {
    lines.push('');
    lines.push('### Ecology & Lore');
    if (normalized.ecology) lines.push(normalized.ecology);
    if (normalized.lore) lines.push(normalized.lore);
    if (normalized.location) lines.push(`**Habitat:** ${normalized.location}`);
  }

  // Tactics
  if (normalized.tactics) {
    lines.push('');
    lines.push('### Tactics');
    lines.push(normalized.tactics);
  }

  // Notes
  if (normalized.notes.length) {
    lines.push('');
    lines.push('### GM Notes');
    lines.push(formatList(normalized.notes));
  }

  return lines.join('\n');
};

const normalizeLocation = (generatedContent: unknown): NormalizedLocation => {
  const source = ensureObject(generatedContent);
  const location = ensureObject(source.location ?? generatedContent);
  return {
    name: ensureString(location.name ?? source.title ?? 'Unnamed Location'),
    region: ensureString(location.region ?? source.region),
    description: ensureString(location.description),
    history: ensureString(location.history ?? location.origin_story),
    key_features: ensureStringArray(location.features ?? location.key_points).filter(Boolean),
    inhabitants: ensureStringArray(location.inhabitants ?? location.factions).filter(Boolean),
    hooks: ensureStringArray(location.hooks ?? source.hooks).filter(Boolean),
  };
};

const formatLocationContent = (normalized: NormalizedLocation): string => {
  const lines: string[] = [];
  lines.push(`## Location: ${normalized.name}`);
  lines.push('');
  lines.push(`**Region:** ${normalized.region || 'Unknown'}`);
  lines.push('');
  lines.push('### Description');
  lines.push(normalized.description || 'No description provided.');
  if (normalized.history) {
    lines.push('');
    lines.push('### History');
    lines.push(normalized.history);
  }
  if (normalized.key_features.length) {
    lines.push('');
    lines.push('### Key Features');
    lines.push(formatList(normalized.key_features));
  }
  if (normalized.inhabitants.length) {
    lines.push('');
    lines.push('### Inhabitants & Factions');
    lines.push(formatList(normalized.inhabitants));
  }
  if (normalized.hooks.length) {
    lines.push('');
    lines.push('### Adventure Hooks');
    lines.push(formatList(normalized.hooks));
  }
  return lines.join('\n');
};

const normalizeStoryArc = (generatedContent: unknown): NormalizedStoryArc => {
  const source = ensureObject(generatedContent);
  const arc = ensureObject(source.story_arc ?? source.storyArc ?? source.arc ?? generatedContent);

  // Normalize characters
  const characters = ensureArray<StoryArcCharacter>(arc.characters ?? source.characters, (character) => {
    const characterObj = ensureObject(character);
    const name = ensureString(characterObj.name);
    const role = ensureString(characterObj.role ?? characterObj.function);
    const motivationSource = ensureObject(characterObj.motivation);
    const purpose = ensureString(
      motivationSource.purpose ?? characterObj.motivation_purpose ?? characterObj.purpose,
    );
    const reason = ensureString(
      motivationSource.reason ?? characterObj.motivation_reason ?? characterObj.reason,
    );

    const goals = ensureArray<StoryArcGoal>(
      characterObj.goals ?? characterObj.objectives ?? characterObj.targets,
      (goal) => {
        const goalObj = ensureObject(goal);
        const target = ensureString(
          goalObj.target ?? goalObj.goal ?? goalObj.objective ?? goalObj.name,
        );
        const achievement = ensureString(
          goalObj.achievement ?? goalObj.success ?? goalObj.outcome ?? goalObj.result,
        );
        if (!target && !achievement) return undefined;
        return { target, achievement };
      },
    ).filter(Boolean);

    const barriersObj = ensureObject(characterObj.barriers);
    const knownBarriers = ensureStringArray(
      characterObj.known_barriers ?? barriersObj['known'] ?? characterObj.barriers_known ?? characterObj.obstacles,
    ).filter(Boolean);
    const unknownBarriers = ensureStringArray(
      characterObj.unknown_barriers ?? barriersObj['unknown'] ?? characterObj.barriers_unknown ?? characterObj.risks,
    ).filter(Boolean);

    if (!name && !role && goals.length === 0) return undefined;

    return {
      name: name || 'Unnamed Character',
      role,
      description: ensureString(characterObj.description),
      motivation: { purpose, reason },
      goals,
      known_barriers: knownBarriers,
      unknown_barriers: unknownBarriers,
      arc: ensureString(characterObj.arc),
      first_appearance: ensureString(characterObj.first_appearance),
    };
  }).filter(Boolean);

  // Normalize acts — handle both legacy string[] and v1.1 object[]
  const rawActs = arc.acts ?? source.acts;
  const actsLegacy: string[] = [];
  const acts = ensureArray<StoryArcAct>(rawActs, (act) => {
    if (typeof act === 'string') {
      const text = ensureString(act);
      if (text) actsLegacy.push(text);
      return { name: text, summary: '', key_events: [], locations: [], climax: '', transition: '' };
    }
    const obj = ensureObject(act);
    const name = ensureString(obj.name);
    const summary = ensureString(obj.summary ?? obj.description);
    if (!name && !summary) return undefined;
    return {
      name: name || 'Unnamed Act',
      summary,
      key_events: ensureStringArray(obj.key_events).filter(Boolean),
      locations: ensureStringArray(obj.locations).filter(Boolean),
      climax: ensureString(obj.climax),
      transition: ensureString(obj.transition),
    };
  });

  // Normalize beats — handle both legacy string[] and v1.1 object[]
  const rawBeats = arc.beats ?? arc.milestones ?? source.milestones ?? source.beats;
  const beatsLegacy: string[] = [];
  const beats = ensureArray<StoryArcBeat>(rawBeats, (beat) => {
    if (typeof beat === 'string') {
      const text = ensureString(beat);
      if (text) beatsLegacy.push(text);
      return { name: text, description: '', act: '', type: 'plot', required: true };
    }
    const obj = ensureObject(beat);
    const name = ensureString(obj.name);
    if (!name) return undefined;
    return {
      name,
      description: ensureString(obj.description),
      act: ensureString(obj.act),
      type: ensureString(obj.type) || 'plot',
      required: obj.required !== false,
    };
  });

  // Normalize factions
  const factions = ensureArray<StoryArcFaction>(arc.factions ?? source.factions, (faction) => {
    const obj = ensureObject(faction);
    const name = ensureString(obj.name);
    if (!name) return undefined;
    return {
      name,
      description: ensureString(obj.description),
      goals: ensureStringArray(obj.goals).filter(Boolean),
      resources: ensureStringArray(obj.resources).filter(Boolean),
      relationship_to_party: ensureString(obj.relationship_to_party),
    };
  });

  // Normalize branching paths
  const branchingPaths = ensureArray<StoryArcBranchingPath>(arc.branching_paths, (bp) => {
    const obj = ensureObject(bp);
    const decisionPoint = ensureString(obj.decision_point);
    if (!decisionPoint) return undefined;
    const options = ensureArray<{ choice: string; consequence: string }>(obj.options, (opt) => {
      const optObj = ensureObject(opt);
      const choice = ensureString(optObj.choice);
      if (!choice) return undefined;
      return { choice, consequence: ensureString(optObj.consequence) };
    });
    return { decision_point: decisionPoint, options };
  });

  // Normalize secrets
  const cluesAndSecrets = ensureArray<StoryArcSecret>(arc.clues_and_secrets ?? arc.secrets, (secret) => {
    const obj = ensureObject(secret);
    const text = ensureString(obj.secret ?? obj.name ?? obj.description);
    if (!text) return undefined;
    return {
      secret: text,
      discovery_method: ensureString(obj.discovery_method ?? obj.method),
      impact: ensureString(obj.impact ?? obj.consequence),
    };
  });

  // Normalize rewards
  const rewards = ensureArray<StoryArcReward>(arc.rewards, (reward) => {
    const obj = ensureObject(reward);
    const name = ensureString(obj.name);
    if (!name) return undefined;
    return {
      name,
      type: ensureString(obj.type),
      when: ensureString(obj.when),
    };
  });

  const arcBarriers = ensureObject(arc.barriers);

  return {
    title: ensureString(arc.title ?? source.title ?? 'Untitled Story Arc'),
    synopsis: ensureString(arc.synopsis ?? arc.summary ?? source.synopsis ?? source.summary),
    theme: ensureString(arc.theme ?? source.theme),
    tone: ensureString(arc.tone ?? source.tone),
    setting: ensureString(arc.setting ?? source.setting),
    level_range: ensureString(arc.level_range),
    estimated_sessions: ensureString(arc.estimated_sessions),
    overarching_goal: ensureString(arc.goal ?? arc.objective ?? arc.overarching_goal ?? source.goal ?? source.objective),
    hook: ensureString(arc.hook ?? arc.inciting_incident),
    acts,
    beats,
    characters,
    factions,
    known_barriers: ensureStringArray(
      arc.known_barriers ?? arcBarriers['known'] ?? source.known_barriers,
    ).filter(Boolean),
    unknown_barriers: ensureStringArray(
      arc.unknown_barriers ?? arcBarriers['unknown'] ?? source.unknown_barriers,
    ).filter(Boolean),
    branching_paths: branchingPaths,
    rewards,
    clues_and_secrets: cluesAndSecrets,
    dm_notes: ensureStringArray(arc.dm_notes ?? arc.gm_notes ?? arc.notes).filter(Boolean),
    acts_legacy: actsLegacy,
    beats_legacy: beatsLegacy,
  };
};

const formatStoryArcContent = (normalized: NormalizedStoryArc): string => {
  const lines: string[] = [];
  lines.push(`## Story Arc: ${normalized.title}`);
  lines.push('');

  // Metadata
  if (normalized.theme) lines.push(`**Theme:** ${normalized.theme}`);
  if (normalized.tone) lines.push(`**Tone:** ${normalized.tone}`);
  if (normalized.setting) lines.push(`**Setting:** ${normalized.setting}`);
  if (normalized.level_range) lines.push(`**Level Range:** ${normalized.level_range}`);
  if (normalized.estimated_sessions) lines.push(`**Estimated Sessions:** ${normalized.estimated_sessions}`);
  if (normalized.overarching_goal) lines.push(`**Overarching Goal:** ${normalized.overarching_goal}`);

  // Hook
  if (normalized.hook) {
    lines.push('');
    lines.push('### Hook');
    lines.push(normalized.hook);
  }

  // Synopsis
  if (normalized.synopsis) {
    lines.push('');
    lines.push('### Synopsis');
    lines.push(normalized.synopsis);
  }

  // Acts
  if (normalized.acts.length) {
    lines.push('');
    lines.push('### Acts');
    for (const act of normalized.acts) {
      lines.push(`\n#### ${act.name}`);
      if (act.summary) lines.push(act.summary);
      if (act.key_events.length) {
        lines.push('**Key Events:**');
        lines.push(formatList(act.key_events));
      }
      if (act.locations.length) {
        lines.push(`**Locations:** ${act.locations.join(', ')}`);
      }
      if (act.climax) lines.push(`**Climax:** ${act.climax}`);
      if (act.transition) lines.push(`**Transition:** ${act.transition}`);
    }
  }

  // Beats
  if (normalized.beats.length) {
    lines.push('');
    lines.push('### Story Beats & Milestones');
    for (const beat of normalized.beats) {
      const tags: string[] = [];
      if (beat.type) tags.push(beat.type);
      if (beat.act) tags.push(beat.act);
      if (!beat.required) tags.push('optional');
      const tagStr = tags.length ? ` *(${tags.join(', ')})*` : '';
      lines.push(`- **${beat.name}**${tagStr}`);
      if (beat.description) lines.push(`  ${beat.description}`);
    }
  }

  // Barriers
  if (normalized.known_barriers.length || normalized.unknown_barriers.length) {
    lines.push('');
    lines.push('### Barriers & Obstacles');
    if (normalized.known_barriers.length) {
      lines.push('**Known Barriers**');
      lines.push(formatList(normalized.known_barriers));
    }
    if (normalized.unknown_barriers.length) {
      lines.push('**Unknown Barriers**');
      lines.push(formatList(normalized.unknown_barriers));
    }
  }

  // Characters
  if (normalized.characters.length) {
    lines.push('');
    lines.push('### Characters');
    for (const character of normalized.characters) {
      lines.push(`\n**${character.name}**${character.role ? ` — ${character.role}` : ''}`);
      if (character.description) lines.push(character.description);
      if (character.motivation.purpose || character.motivation.reason) {
        lines.push(
          `- **Motivation:** ${[
            character.motivation.purpose && `Purpose — ${character.motivation.purpose}`,
            character.motivation.reason && `Reason — ${character.motivation.reason}`,
          ].filter(Boolean).join('; ')}`,
        );
      }
      if (character.goals.length) {
        lines.push('- **Goals:**');
        for (const goal of character.goals) {
          lines.push(`  - ${goal.target || 'Unspecified'}${goal.achievement ? ` → ${goal.achievement}` : ''}`);
        }
      }
      if (character.arc) lines.push(`- **Arc:** ${character.arc}`);
      if (character.first_appearance) lines.push(`- **First Appearance:** ${character.first_appearance}`);
      if (character.known_barriers.length) {
        lines.push(`- **Known Barriers:** ${character.known_barriers.join(', ')}`);
      }
      if (character.unknown_barriers.length) {
        lines.push(`- **Unknown Barriers:** ${character.unknown_barriers.join(', ')}`);
      }
    }
  }

  // Factions
  if (normalized.factions.length) {
    lines.push('');
    lines.push('### Factions');
    for (const faction of normalized.factions) {
      lines.push(`\n**${faction.name}**`);
      if (faction.description) lines.push(faction.description);
      if (faction.goals.length) lines.push(`- **Goals:** ${faction.goals.join(', ')}`);
      if (faction.resources.length) lines.push(`- **Resources:** ${faction.resources.join(', ')}`);
      if (faction.relationship_to_party) lines.push(`- **Relationship to Party:** ${faction.relationship_to_party}`);
    }
  }

  // Branching Paths
  if (normalized.branching_paths.length) {
    lines.push('');
    lines.push('### Branching Paths');
    for (const bp of normalized.branching_paths) {
      lines.push(`\n**Decision:** ${bp.decision_point}`);
      for (const opt of bp.options) {
        lines.push(`- *${opt.choice}* → ${opt.consequence}`);
      }
    }
  }

  // Secrets & Clues
  if (normalized.clues_and_secrets.length) {
    lines.push('');
    lines.push('### Clues & Secrets');
    for (const secret of normalized.clues_and_secrets) {
      lines.push(`\n**Secret:** ${secret.secret}`);
      if (secret.discovery_method) lines.push(`- **Discovery:** ${secret.discovery_method}`);
      if (secret.impact) lines.push(`- **Impact:** ${secret.impact}`);
    }
  }

  // Rewards
  if (normalized.rewards.length) {
    lines.push('');
    lines.push('### Rewards');
    for (const reward of normalized.rewards) {
      lines.push(`- **${reward.name}**${reward.type ? ` (${reward.type})` : ''}${reward.when ? ` — ${reward.when}` : ''}`);
    }
  }

  // DM Notes
  if (normalized.dm_notes.length) {
    lines.push('');
    lines.push('### DM Notes');
    lines.push(formatList(normalized.dm_notes));
  }

  return lines.join('\n');
};

export const mapGeneratedContentToContentBlock = (
  params: GeneratedContentMapParams,
): MappedContentBlock => {
  const { generatedContent } = params;
  const inferredType = inferContentType(params.contentType, params.deliverable, generatedContent);
  const commonMetadata = buildCommonMetadata(params);

  const source = ensureObject(generatedContent);
  const draft = ensureObject(source.draft);
  const merged: Record<string, any> = Object.keys(draft).length ? { ...source, ...draft } : source;

  const deliverableLower = ensureString(params.deliverable ?? merged?.deliverable ?? source?.deliverable).toLowerCase();
  const hasFormattedManuscript = Boolean(
    ensureString(merged.formatted_manuscript ?? merged.formattedManuscript),
  );
  const hasNonfictionSignals =
    Boolean(ensureString(merged.working_title ?? merged.work_title ?? merged.workTitle)) ||
    Boolean(ensureString(merged.subtitle)) ||
    Boolean(ensureString(merged.medium)) ||
    Boolean(ensureString(merged.purpose ?? merged.mission ?? merged.premise)) ||
    Boolean(ensureString(merged.thesis ?? merged.central_thesis ?? merged.centralThesis)) ||
    Boolean(ensureString(merged.primary_audience ?? merged.primaryAudience)) ||
    Boolean(ensureString(merged.author_role ?? merged.authorRole)) ||
    Boolean(ensureString(merged.author_name_policy ?? merged.authorNamePolicy)) ||
    ensureStringArray(merged.intended_formats ?? merged.intendedFormats).length > 0 ||
    ensureStringArray(merged.table_of_contents ?? merged.tableOfContents).length > 0 ||
    ensureStringArray(merged.keywords).length > 0 ||
    (typeof merged.outline === 'string' && merged.outline.trim().length > 0) ||
    Array.isArray(merged.outline) ||
    (typeof merged.structure === 'string' && merged.structure.trim().length > 0) ||
    Array.isArray(merged.structure) ||
    (Array.isArray(merged.chapters) && merged.chapters.length > 0);

  const hasRpgSignals =
    Boolean(merged.stat_block) ||
    Boolean(merged.ability_scores) ||
    Boolean(merged.armor_class) ||
    Boolean(merged.hit_points) ||
    Boolean(merged.challenge_rating) ||
    Boolean(merged.npc) ||
    Boolean(merged.monster) ||
    Boolean(merged.encounter) ||
    Boolean(merged.encounter_details);

  const isNonfiction =
    deliverableLower === 'nonfiction' ||
    deliverableLower.includes('nonfiction') ||
    hasFormattedManuscript ||
    (hasNonfictionSignals && !hasRpgSignals);

  if (isNonfiction) {
    const title = params.title || ensureString(generatedContent.title) || ensureString(generatedContent.working_title) || 'Non-Fiction';
    return {
      title,
      type: inferredType,
      content: formatNonfictionContent(generatedContent),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'nonfiction',
          data: generatedContent,
        },
      },
    };
  }

  const writingTokens = [
    'chapter',
    'outline',
    'foreword',
    'prologue',
    'epilogue',
    'scene',
    'section',
    'journal',
    'diary',
    'memoir',
    'log',
    'diet',
    'entry',
    'manuscript',
  ];

  const domainLower = ensureString(merged.domain).toLowerCase();
  const mergedTypeLower = ensureString(merged.type ?? merged.content_type ?? merged.contentType).toLowerCase();
  const hasWorkObject = Object.keys(ensureObject(merged.work)).length > 0;
  const hasWritingText =
    Boolean(ensureString(merged.formatted_text ?? merged.formattedText)) ||
    Boolean(ensureString(merged.draft_text ?? merged.draftText)) ||
    Boolean(ensureString(merged.text)) ||
    Boolean(ensureString(merged.body));

  const looksLikeWriting =
    !hasRpgSignals &&
    (domainLower === 'writing' ||
      hasWorkObject ||
      hasWritingText ||
      writingTokens.some((t) => deliverableLower.includes(t)) ||
      writingTokens.some((t) => mergedTypeLower.includes(t)));

  if (looksLikeWriting) {
    const title = params.title || ensureString(merged.title) || 'Draft';
    return {
      title,
      type: inferredType,
      content: formatWritingContent(generatedContent),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'writing',
          data: generatedContent,
        },
      },
    };
  }

  if (inferredType === ContentType.MONSTER) {
    const monsterSource = generatedContent.monster || generatedContent;
    const normalizedMonster = normalizeMonster(monsterSource);
    const title = params.title || normalizedMonster.name || 'Generated Monster';

    return {
      title,
      type: ContentType.MONSTER,
      content: formatMonsterContent(normalizedMonster),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'monster',
          data: normalizedMonster,
        },
      },
    };
  }

  if (inferredType === ContentType.CHARACTER) {
    const npcSource =
      generatedContent.npc ||
      generatedContent.character ||
      generatedContent.draft?.npc ||
      generatedContent.draft?.character ||
      generatedContent;
    const normalizedNpc = normalizeNpc(npcSource);
    const title = params.title || normalizedNpc.name || ensureString(generatedContent.canonical_name) || 'Generated NPC';

    return {
      title,
      type: ContentType.CHARACTER,
      content: formatNpcContent(title, normalizedNpc),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'npc',
          data: normalizedNpc,
        },
      },
    };
  }

  if (inferredType === ContentType.ITEM) {
    const normalizedItem = normalizeItem(generatedContent.item || generatedContent);
    const title = params.title || normalizedItem.name || 'Generated Item';

    return {
      title,
      type: ContentType.ITEM,
      content: formatItemContent(normalizedItem),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'item',
          data: normalizedItem,
        },
      },
    };
  }

  if (inferredType === ContentType.LOCATION) {
    const normalizedLocation = normalizeLocation(generatedContent.location || generatedContent);
    const title = params.title || normalizedLocation.name || 'Generated Location';

    return {
      title,
      type: ContentType.LOCATION,
      content: formatLocationContent(normalizedLocation),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'location',
          data: normalizedLocation,
        },
      },
    };
  }

  if (inferredType === ContentType.STORY_ARC) {
    const normalizedStoryArc = normalizeStoryArc(generatedContent.story_arc || generatedContent);
    const title = params.title || normalizedStoryArc.title || 'Story Arc';

    return {
      title,
      type: ContentType.STORY_ARC,
      content: formatStoryArcContent(normalizedStoryArc),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'story-arc',
          data: normalizedStoryArc,
        },
      },
    };
  }

  if (
    inferredType === ContentType.SECTION ||
    inferredType === ContentType.CHAPTER ||
    inferredType === ContentType.OUTLINE
  ) {
    const normalizedEncounter = normalizeEncounter(generatedContent);
    const title = params.title || normalizedEncounter.title || 'Generated Content';

    return {
      title,
      type: inferredType,
      content: formatEncounterContent(normalizedEncounter),
      metadata: {
        ...commonMetadata,
        structuredContent: {
          type: 'encounter',
          data: normalizedEncounter,
        },
      },
    };
  }

  const fallbackTitle = params.title || ensureString(generatedContent.title) || 'Generated Content';

  return {
    title: fallbackTitle,
    type: inferredType,
    content: JSON.stringify(generatedContent, null, 2),
    metadata: {
      ...commonMetadata,
      structuredContent: {
        type: 'generic',
        data: generatedContent,
      },
    },
  };
};
