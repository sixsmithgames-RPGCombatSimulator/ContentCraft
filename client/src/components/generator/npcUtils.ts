/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { ContentType } from '../../types';
import { mapToCanonicalStructure, logMappingResult } from '../../utils/npcSchemaMapper';

export type PrimitiveRecord = Record<string, unknown>;

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Feature {
  name: string;
  description: string;
  notes?: string;
}

export interface ScoredEntry {
  name: string;
  value: string;
  notes?: string;
}

export interface Relationship {
  entity?: string;
  relationship?: string;
  notes?: string;
}

export interface SpellcastingSummary {
  type?: string;
  ability?: string;
  saveDc?: number;
  attackBonus?: number;
  knownSpells: string[];
  spellSlots: Record<string, number>;
  notes?: string;
}

export interface ClassLevel {
  class?: string;
  level?: number;
  subclass?: string;
  notes?: string;
}

export interface HitPointsValue {
  average?: number;
  formula?: string;
  notes?: string;
}

export interface NormalizedNpc {
  name: string;
  title?: string;
  aliases: string[];
  role?: string;
  description: string;
  appearance?: string;
  background?: string;
  race?: string;
  alignment?: string;
  affiliation?: string;
  location?: string;
  era?: string;
  region?: string;
  challengeRating?: string;
  experiencePoints?: number;
  hooks: string[];
  motivations: string[];
  tactics?: string;
  classLevels: ClassLevel[];
  abilityScores: AbilityScores;
  armorClass: number | { value: number; type?: string; notes?: string }[] | undefined;
  hitPoints?: HitPointsValue;
  hitDice?: string;
  proficiencyBonus?: number | string;
  proficiencyBonusText?: string;
  speed: Record<string, string>;
  senses: string[];
  passivePerception?: number;
  languages: string[];
  savingThrows: ScoredEntry[];
  skills: ScoredEntry[];
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  abilities: Feature[];
  additionalTraits: Feature[];
  equipment: string[];
  magicItems: string[];
  relationships: Relationship[];
  allies: string[];
  foes: string[];
  personality: {
    traits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  };
  classFeatures: Feature[];
  subclassFeatures: Feature[];
  racialFeatures: Feature[];
  feats: Feature[];
  asiChoices: PrimitiveRecord[];
  backgroundFeature?: PrimitiveRecord;
  spellcasting?: SpellcastingSummary;
  actions: Feature[];
  bonusActions: Feature[];
  reactions: Feature[];
  lairActions: string[];
  regionalEffects: string[];
  notes: string[];
  sources: string[];
  sourcesUsed: string[];
  assumptions: string[];
  factCheckReport?: PrimitiveRecord;
  schemaVersion?: string;
  statBlock: PrimitiveRecord;
}

const DEFAULT_ABILITY_SCORES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const ensureObject = (value: unknown): PrimitiveRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as PrimitiveRecord;
  return {};
};

export const ensureString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

export const ensureNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const ensureArray = <T>(value: unknown, mapper?: (entry: unknown, idx: number) => T | undefined): T[] => {
  const list = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : [value];

  if (!mapper) return list as T[];

  return (list as unknown[])
    .map((entry, idx) => mapper(entry, idx))
    .filter((entry): entry is T => entry !== undefined && entry !== null);
};

export const ensureStringArray = (value: unknown): string[] =>
  ensureArray(value, (entry) => {
    const str = ensureString(entry);
    return str.length ? str : undefined;
  }) as string[];

const ensureAbilityScores = (value: unknown): AbilityScores => {
  const source = ensureObject(value);
  // Only accept canonical lowercase field names
  return {
    str: ensureNumber(source.str) ?? DEFAULT_ABILITY_SCORES.str,
    dex: ensureNumber(source.dex) ?? DEFAULT_ABILITY_SCORES.dex,
    con: ensureNumber(source.con) ?? DEFAULT_ABILITY_SCORES.con,
    int: ensureNumber(source.int) ?? DEFAULT_ABILITY_SCORES.int,
    wis: ensureNumber(source.wis) ?? DEFAULT_ABILITY_SCORES.wis,
    cha: ensureNumber(source.cha) ?? DEFAULT_ABILITY_SCORES.cha,
  };
};

const normalizeFeatureList = (value: unknown): Feature[] =>
  ensureArray(value, (entry) => {
    if (typeof entry === 'string') {
      const description = ensureString(entry);
      if (!description) return undefined;
      return { name: description.slice(0, 80) || 'Feature', description };
    }

    const obj = ensureObject(entry);
    const name = ensureString(obj.name) || ensureString(obj.title);
    const description = ensureString(obj.description) || ensureString(obj.text) || ensureString(obj.effect);
    if (!name && !description) return undefined;
    return {
      name: name || 'Feature',
      description: description || 'Details unavailable.',
      notes: ensureString(obj.notes) || undefined,
    };
  }) as Feature[];

const normalizeScoredList = (value: unknown): ScoredEntry[] =>
  ensureArray(value, (entry) => {
    if (typeof entry === 'string') {
      const text = ensureString(entry);
      if (!text) return undefined;
      return { name: text, value: text };
    }

    const obj = ensureObject(entry);
    const name = ensureString(obj.name) || ensureString(obj.skill) || ensureString(obj.title);
    const amount = ensureString(obj.value) || ensureString(obj.modifier) || ensureString(obj.bonus);
    if (!name && !amount) return undefined;
    return {
      name: name || amount || '',
      value: amount || '—',
      notes: ensureString(obj.notes) || undefined,
    };
  }) as ScoredEntry[];

const normalizeRelationships = (value: unknown): Relationship[] =>
  ensureArray(value, (entry) => {
    const obj = ensureObject(entry);
    const entity = ensureString(obj.entity) || ensureString(obj.name);
    const relationship = ensureString(obj.relationship) || ensureString(obj.type) || ensureString(obj.description);
    if (!entity && !relationship) return undefined;
    return {
      entity: entity || undefined,
      relationship: relationship || undefined,
      notes: ensureString(obj.notes) || undefined,
    };
  }) as Relationship[];

const normalizeClassLevels = (value: unknown): ClassLevel[] =>
  ensureArray(value, (entry) => {
    const obj = ensureObject(entry);
    const className = ensureString(obj.class) || ensureString(obj.name);
    const level = ensureNumber(obj.level);
    if (!className && level === undefined) return undefined;
    return {
      class: className || undefined,
      level,
      subclass: ensureString(obj.subclass) || ensureString(obj.archetype) || undefined,
      notes: ensureString(obj.notes) || undefined,
    };
  }) as ClassLevel[];

const normalizeArmorClass = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    const numeric = match ? Number.parseInt(match[1], 10) : undefined;
    return [{ value: numeric ?? 0, notes: value }];
  }

  const entries = normalizeScoredList(value);
  if (!entries.length) return undefined;
  return entries.map((entry) => ({
    value: Number.parseInt(entry.value, 10) || 0,
    type: entry.name,
    notes: entry.notes,
  }));
};

const normalizeHitPoints = (value: unknown, fallbackFormula?: string): HitPointsValue | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return { average: value };
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    const average = match ? Number.parseInt(match[1], 10) : undefined;
    return { average, formula: value, notes: average ? undefined : value };
  }

  const obj = ensureObject(value);
  if (Object.keys(obj).length === 0) return fallbackFormula ? normalizeHitPoints(fallbackFormula) : undefined;
  return {
    average: ensureNumber(obj.average),
    formula: ensureString(obj.formula || fallbackFormula) || undefined,
    notes: ensureString(obj.notes) || undefined,
  };
};

const normalizeSpellcasting = (value: unknown): SpellcastingSummary | undefined => {
  const obj = ensureObject(value);
  if (Object.keys(obj).length === 0) return undefined;

  const spellSlots: Record<string, number> = {};
  Object.entries(ensureObject(obj.spell_slots)).forEach(([level, amount]) => {
    const parsed = ensureNumber(amount);
    if (parsed !== undefined) spellSlots[level] = parsed;
  });

  return {
    type: ensureString(obj.type) || ensureString(obj.tradition) || undefined,
    ability: ensureString(obj.ability) || ensureString(obj.spellcasting_ability) || undefined,
    saveDc: ensureNumber(obj.save_dc),
    attackBonus: ensureNumber(obj.attack_bonus),
    knownSpells: ensureStringArray(obj.known_spells),
    spellSlots,
    notes: ensureString(obj.notes) || ensureString(obj.text) || undefined,
  };
};

export const asRecord = (value: unknown): PrimitiveRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as PrimitiveRecord;
  if (Array.isArray(value)) return { items: value };
  if (value === null || value === undefined) return {};
  return { value };
};

export const inferNpcType = (record: PrimitiveRecord, deliverable?: string): ContentType => {
  const candidates = [
    ensureString(record.content_type),
    ensureString(record.type),
    ensureString(record.category),
    ensureString(record.kind),
    ensureString(record.deliverable),
    ensureString(deliverable),
  ].map((text) => text.toLowerCase());

  const keys = Object.keys(record).map((key) => key.toLowerCase());

  if (keys.some((key) => key.includes('story_arc') || key.includes('storyarc') || key === 'story arc')) {
    return ContentType.STORY_ARC;
  }
  if (keys.some((key) => key === 'npc' || key.includes('character'))) {
    return ContentType.CHARACTER;
  }
  if (keys.some((key) => key.includes('encounter'))) {
    return ContentType.SECTION;
  }
  if (keys.some((key) => key.includes('item'))) {
    return ContentType.ITEM;
  }
  if (keys.some((key) => key.includes('location'))) {
    return ContentType.LOCATION;
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('story') && candidate.includes('arc')) return ContentType.STORY_ARC;
    if (candidate.includes('npc') || candidate.includes('character')) return ContentType.CHARACTER;
    if (candidate.includes('encounter') || candidate.includes('combat')) return ContentType.SECTION;
    if (candidate.includes('item') || candidate.includes('treasure')) return ContentType.ITEM;
    if (candidate.includes('location') || candidate.includes('place')) return ContentType.LOCATION;
  }

  return ContentType.TEXT;
};

export const normalizeNpc = (record: PrimitiveRecord): NormalizedNpc => {
  // Step 1: Use schema mapper to intelligently map field variations to canonical structure
  const mappingResult = mapToCanonicalStructure(record);
  logMappingResult(mappingResult, 'normalizeNpc');

  // Use mapped data if successful, otherwise use original
  const sourceData = mappingResult.success ? mappingResult.mapped : record;

  const npcSource = ensureObject(sourceData.npc || sourceData.character || sourceData);
  const statBlock = ensureObject(npcSource.stat_block);
  const personalitySource = ensureObject(npcSource.personality);
  const factCheckSource = ensureObject(sourceData.fact_check_report);

  // Normalize personality to required structure
  const normalizedPersonality = {
    traits: ensureStringArray(personalitySource.traits || personalitySource.personality_traits),
    ideals: ensureStringArray(personalitySource.ideals),
    bonds: ensureStringArray(personalitySource.bonds),
    flaws: ensureStringArray(personalitySource.flaws),
  };

  const armorClass = normalizeArmorClass(npcSource.armor_class || statBlock.armor_class);
  const hitPoints = normalizeHitPoints(
    npcSource.hit_points || statBlock.hit_points,
    ensureString(statBlock.hit_points_formula) || undefined,
  );
  const proficiencyValue = ensureNumber(npcSource.proficiency_bonus);
  const proficiencyText = ensureString(npcSource.proficiency_bonus) || ensureString(statBlock.proficiency_bonus);

  return {
    name: ensureString(npcSource.name) || 'Unknown NPC',
    title: ensureString(npcSource.title) || undefined,
    aliases: ensureStringArray(npcSource.aliases),
    role: ensureString(npcSource.role) || undefined,
    description: ensureString(npcSource.description),
    appearance: ensureString(npcSource.appearance) || undefined,
    background: ensureString(npcSource.background) || undefined,
    race: ensureString(npcSource.race) || undefined,
    alignment: ensureString(npcSource.alignment) || undefined,
    affiliation: ensureString(npcSource.affiliation) || undefined,
    location: ensureString(npcSource.location) || undefined,
    era: ensureString(npcSource.era) || ensureString(sourceData.era) || undefined,
    region: ensureString(npcSource.region) || ensureString(sourceData.region) || undefined,
    challengeRating: ensureString(npcSource.challenge_rating) || ensureString(statBlock.challenge_rating) || undefined,
    experiencePoints: ensureNumber(npcSource.experience_points),
    hooks: ensureStringArray(npcSource.hooks),
    motivations: ensureStringArray(npcSource.motivations),
    tactics: ensureString(npcSource.tactics) || undefined,
    classLevels: normalizeClassLevels(npcSource.class_levels),
    classFeatures: normalizeFeatureList(npcSource.class_features),
    subclassFeatures: normalizeFeatureList(npcSource.subclass_features),
    racialFeatures: normalizeFeatureList(npcSource.racial_features),
    feats: normalizeFeatureList(npcSource.feats),
    asiChoices: ensureArray(npcSource.asi_choices, (entry) => {
      const obj = ensureObject(entry);
      if (!obj.level && !obj.choice) return undefined;
      return obj as PrimitiveRecord;
    }),
    backgroundFeature: npcSource.background_feature && typeof npcSource.background_feature === 'object' && !Array.isArray(npcSource.background_feature)
      ? npcSource.background_feature as PrimitiveRecord
      : undefined,
    abilityScores: ensureAbilityScores(npcSource.ability_scores || statBlock.ability_scores),
    armorClass,
    hitPoints,
    hitDice: ensureString(npcSource.hit_dice) || ensureString(statBlock.hit_dice) || undefined,
    proficiencyBonus: proficiencyValue ?? (proficiencyText || undefined),
    proficiencyBonusText:
      typeof (proficiencyValue ?? proficiencyText) === 'string'
        ? ((proficiencyValue ?? proficiencyText) as string)
        : undefined,
    speed: ensureObject(npcSource.speed || statBlock.speed) as Record<string, string>,
    senses: ensureStringArray(npcSource.senses || statBlock.senses),
    passivePerception: ensureNumber(npcSource.passive_perception) ?? ensureNumber(statBlock.passive_perception),
    languages: ensureStringArray(npcSource.languages || statBlock.languages),
    savingThrows: normalizeScoredList(npcSource.saving_throws || statBlock.saving_throws),
    skills: normalizeScoredList(npcSource.skills || statBlock.skills),
    damageResistances: ensureStringArray(npcSource.damage_resistances || statBlock.damage_resistances),
    damageImmunities: ensureStringArray(npcSource.damage_immunities || statBlock.damage_immunities),
    damageVulnerabilities: ensureStringArray(npcSource.damage_vulnerabilities || statBlock.damage_vulnerabilities),
    conditionImmunities: ensureStringArray(npcSource.condition_immunities || statBlock.condition_immunities),
    abilities: normalizeFeatureList(npcSource.abilities || statBlock.abilities),
    additionalTraits: normalizeFeatureList(npcSource.additional_traits),
    equipment: ensureStringArray(npcSource.equipment),
    magicItems: ensureStringArray(npcSource.magicItems),
    relationships: normalizeRelationships(npcSource.relationships),
    allies: ensureStringArray(npcSource.allies),
    foes: ensureStringArray(npcSource.foes),
    personality: normalizedPersonality,
    spellcasting: normalizeSpellcasting(npcSource.spellcasting),
    actions: normalizeFeatureList(npcSource.actions || statBlock.actions),
    bonusActions: normalizeFeatureList(npcSource.bonus_actions || statBlock.bonus_actions),
    reactions: normalizeFeatureList(npcSource.reactions || statBlock.reactions),
    lairActions: ensureStringArray(npcSource.lair_actions || statBlock.lair_actions),
    regionalEffects: ensureStringArray(npcSource.regional_effects || statBlock.regional_effects),
    notes: ensureStringArray(npcSource.notes),
    sources: ensureStringArray(npcSource.sources),
    sourcesUsed: ensureStringArray(sourceData.sources_used),
    assumptions: ensureStringArray(sourceData.assumptions),
    factCheckReport: Object.keys(factCheckSource).length ? factCheckSource : undefined,
    schemaVersion: ensureString(sourceData.schema_version) || undefined,
    statBlock: statBlock,
  };
};

export const formatArmorClass = (armorClass: NormalizedNpc['armorClass']) => {
  if (!armorClass) return 'N/A';
  if (typeof armorClass === 'number') return String(armorClass);
  return armorClass
    .map((entry) => {
      const parts = [String(entry.value)];
      if (entry.type) parts.push(`(${entry.type})`);
      if (entry.notes) parts.push(`- ${entry.notes}`);
      return parts.join(' ');
    })
    .join(', ');
};

export const formatHitPoints = (hitPoints?: HitPointsValue) => {
  if (!hitPoints) return 'N/A';
  const pieces = [hitPoints.average, hitPoints.formula, hitPoints.notes]
    .filter((piece) => piece !== undefined && piece !== '')
    .map(String);
  return pieces.length ? pieces.join(' / ') : 'N/A';
};

export const listToMultiline = (values: string[]): string => values.join('\n');

export const multilineToList = (value: string): string[] => value
  .split('\n')
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export const featuresToMultiline = (items: Feature[]): string => items
  .map((item) => [item.name ?? '', item.description ?? '', item.notes ?? ''].filter(Boolean).join(' | '))
  .join('\n');

export const multilineToFeatures = (value: string): Feature[] => multilineToList(value).map((line) => {
  const [name = '', description = '', notes = ''] = line.split('|').map((part) => part.trim());
  return {
    name: name || (description ? description.slice(0, 80) : 'Feature'),
    description,
    ...(notes ? { notes } : {}),
  };
});

export const relationshipsToMultiline = (items: Relationship[]): string => items
  .map((item) => [item.entity ?? '', item.relationship ?? '', item.notes ?? ''].filter(Boolean).join(' | '))
  .join('\n');

export const multilineToRelationships = (value: string): Relationship[] => multilineToList(value).map((line) => {
  const [entity = '', relationship = '', notes = ''] = line.split('|').map((part) => part.trim());
  const result: Relationship = {};
  if (entity) result.entity = entity;
  if (relationship) result.relationship = relationship;
  if (notes) result.notes = notes;
  return result;
});

export const classLevelsToMultiline = (levels: ClassLevel[]): string =>
  levels
    .map((level, index) => {
      const parts = [level.class || `Class ${index + 1}`];
      if (level.level !== undefined) parts.push(`Level ${level.level}`);
      if (level.subclass) parts.push(level.subclass);
      if (level.notes) parts.push(`Notes: ${level.notes}`);
      return parts.join(' | ');
    })
    .join('\n');

export const multilineToClassLevels = (value: string): ClassLevel[] =>
  multilineToList(value).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const [classPart = '', levelPart = '', subclassPart = '', notesPart = ''] = parts;
    const parsedLevel = Number.parseInt(levelPart.replace(/[^0-9-]/g, ''), 10);
    const level = Number.isFinite(parsedLevel) ? parsedLevel : undefined;
    return {
      class: classPart || undefined,
      level,
      subclass: subclassPart || undefined,
      notes: notesPart.replace(/^Notes:\s*/i, '') || undefined,
    };
  });

export const scoredEntriesToMultiline = (entries: ScoredEntry[]): string =>
  entries
    .map((entry) => {
      const parts = [entry.name];
      parts.push(entry.value);
      if (entry.notes) parts.push(entry.notes);
      return parts.join(' | ');
    })
    .join('\n');

export const multilineToScoredEntries = (value: string): ScoredEntry[] =>
  multilineToList(value).map((line) => {
    const [name = '', amount = '', notes = ''] = line.split('|').map((part) => part.trim());
    return {
      name: name || amount || 'Entry',
      value: amount || '—',
      ...(notes ? { notes } : {}),
    };
  });

export const normalizedNpcToRecord = (
  npc: NormalizedNpc,
  base: PrimitiveRecord = {},
): PrimitiveRecord => {
  const updated: PrimitiveRecord = { ...base };

  const preserveEmptyArrays = new Set<string>([
    'class_levels',
    'motivations',
    'sources_used',
    'assumptions',
  ]);

  const assign = (key: string, value: unknown) => {
    const shouldPreserveEmptyArray = preserveEmptyArrays.has(key) && Array.isArray(value) && value.length === 0;
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0 && !shouldPreserveEmptyArray)
    ) {
      delete updated[key];
      return;
    }
    updated[key] = value;
  };

  updated.type = 'npc';
  assign('name', npc.name);
  assign('canonical_name', npc.name);
  assign('title', npc.title);
  assign('role', npc.role);
  assign('description', npc.description);
  assign('appearance', npc.appearance);
  assign('physical_appearance', npc.appearance);
  assign('background', npc.background);
  assign('race', npc.race);
  assign('alignment', npc.alignment);
  assign('affiliation', npc.affiliation);
  assign('location', npc.location);
  assign('era', npc.era);
  assign('region', npc.region);
  assign('challenge_rating', npc.challengeRating);
  assign('experience_points', npc.experiencePoints);
  assign('aliases', npc.aliases);
  assign('hooks', npc.hooks);
  assign('motivations', npc.motivations);
  assign('tactics', npc.tactics);
  assign('class_levels', npc.classLevels);
  assign('class_features', npc.classFeatures);
  assign('subclass_features', npc.subclassFeatures);
  assign('racial_features', npc.racialFeatures);
  assign('feats', npc.feats);
  assign('asi_choices', npc.asiChoices);
  assign('background_feature', npc.backgroundFeature);
  assign('ability_scores', npc.abilityScores);
  assign('armor_class', npc.armorClass);
  assign('hit_points', npc.hitPoints);
  assign('hit_points_details', npc.hitPoints);
  assign('hit_dice', npc.hitDice);
  assign('proficiency_bonus', npc.proficiencyBonus);
  assign('passive_perception', npc.passivePerception);
  assign('speed', npc.speed);
  assign('senses', npc.senses);
  assign('languages', npc.languages);
  assign('saving_throws', npc.savingThrows);
  assign('skills', npc.skills);
  assign('damage_resistances', npc.damageResistances);
  assign('damage_immunities', npc.damageImmunities);
  assign('damage_vulnerabilities', npc.damageVulnerabilities);
  assign('condition_immunities', npc.conditionImmunities);
  assign('abilities', npc.abilities);
  assign('additional_traits', npc.additionalTraits);
  assign('equipment', npc.equipment);
  assign('magic_items', npc.magicItems);
  assign('relationships', npc.relationships);
  assign('allies', npc.allies);
  assign('foes', npc.foes);
  assign('personality', {
    traits: npc.personality.traits,
    ideals: npc.personality.ideals,
    bonds: npc.personality.bonds,
    flaws: npc.personality.flaws,
  });
  assign('spellcasting', npc.spellcasting);
  assign('actions', npc.actions);
  assign('bonus_actions', npc.bonusActions);
  assign('reactions', npc.reactions);
  assign('lair_actions', npc.lairActions);
  assign('regional_effects', npc.regionalEffects);
  assign('notes', npc.notes);
  assign('sources', npc.sources);
  assign('sources_used', npc.sourcesUsed);
  assign('assumptions', npc.assumptions);
  assign('fact_check_report', npc.factCheckReport);
  assign('schema_version', npc.schemaVersion);
  assign('stat_block', npc.statBlock);

  if (!updated.deliverable) {
    updated.deliverable = 'npc';
  }

  return updated;
};

export const isNpcContent = (deliverable?: string, contentType?: string): boolean => {
  const d = deliverable?.toLowerCase() ?? '';
  const t = contentType?.toLowerCase() ?? '';
  return d.includes('npc') || d.includes('character') || t === ContentType.CHARACTER;
};

export interface DiscreteCanonCandidate {
  id: string;
  category: string;
  label: string;
  detail?: string;
  source: string;
}

const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+)|(-+$)/g, '') || 'entry';

const uniqueId = (category: string, label: string, index: number) => `${category}-${index}-${slugify(label)}`;

export const collectDiscreteCanonCandidates = (npc: NormalizedNpc): DiscreteCanonCandidate[] => {
  const entries: DiscreteCanonCandidate[] = [];
  const push = (category: string, label: string, detail?: string) => {
    const id = uniqueId(category, label, entries.length);
    entries.push({ id, category, label, detail, source: npc.name });
  };

  npc.abilities.forEach((feature) => push('ability', feature.name, feature.description));
  npc.additionalTraits.forEach((feature) => push('trait', feature.name, feature.description));
  npc.actions.forEach((feature) => push('action', feature.name, feature.description));
  npc.bonusActions.forEach((feature) => push('bonus-action', feature.name, feature.description));
  npc.reactions.forEach((feature) => push('reaction', feature.name, feature.description));
  npc.lairActions.forEach((entry, index) => push('lair-action', `Lair Action ${index + 1}`, entry));
  npc.regionalEffects.forEach((entry, index) => push('regional-effect', `Regional Effect ${index + 1}`, entry));
  npc.equipment.forEach((item) => push('item', item));
  npc.hooks.forEach((hook, index) => push('hook', hook, `Hook ${index + 1}`));
  npc.motivations.forEach((motivation, index) => push('motivation', motivation, `Motivation ${index + 1}`));
  npc.classLevels.forEach((level, index) => {
    const title = [level.class, level.subclass].filter(Boolean).join(' - ') || `Class Level ${index + 1}`;
    const detail = [level.level !== undefined ? `Level ${level.level}` : undefined, level.notes].filter(Boolean).join(' | ');
    push('class-feature', title, detail || undefined);
  });
  npc.notes.forEach((note, index) => push('note', `Note ${index + 1}`, note));

  return entries;
};
