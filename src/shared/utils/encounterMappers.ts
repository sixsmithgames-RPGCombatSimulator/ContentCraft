/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { RawEncounterV1, NormalizedEncounterV1, NormalizedEncounterCharacter, NormalizedEncounterNpc, NormalizedEncounterMonster, NormalizedEncounterTrap, NormalizedEncounterHazard, NormalizedEncounterTerrain, NormalizedEncounterTerrainFeature, NormalizedEncounterTreasure, NormalizedEncounterItemReward, NormalizedEncounterPhase, NormalizedEncounterFactCheckReport, NormalizedEncounterV1 as NormalizedEncounter } from '../types/encounter.js';

type RequiredRaw = RawEncounterV1;

type TacticsObject = Extract<NormalizedEncounter['tactics'], Exclude<NormalizedEncounter['tactics'], string>>;

const toNonEmptyTuple = <T>(items: T[], field: string): [T, ...T[]] => {
  if (items.length === 0) {
    throw new Error(`Encounter mapper requires at least one ${field}`);
  }
  return [items[0], ...items.slice(1)];
};

const mapNonEmptyTuple = <Input, Output>(
  items: Input[],
  field: string,
  mapper: (item: Input) => Output,
): [Output, ...Output[]] => {
  const [first, ...rest] = toNonEmptyTuple(items, field);
  return [mapper(first), ...rest.map(mapper)];
};

const mapCharacters = (characters: RequiredRaw['characters']): NormalizedEncounterCharacter[] =>
  characters.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    level: character.level,
    class: character.class ?? undefined,
    hitPoints: character.hit_points,
    conditions: character.conditions ?? undefined,
    notes: character.notes ?? undefined,
  }));

const mapNpcs = (npcs: RequiredRaw['NPCs']): NormalizedEncounterNpc[] =>
  npcs.map((npc) => ({
    entityId: npc.entity_id,
    name: npc.name,
    affiliation: npc.affiliation,
    motivation: npc.motivation ?? undefined,
    support: npc.support ?? undefined,
    statBlock: npc.stat_block ?? undefined,
  }));

const mapMonsters = (monsters: RequiredRaw['monsters']): NormalizedEncounterMonster[] =>
  monsters.map((monster) => ({
    name: monster.name,
    count: monster.count,
    armorClass: monster.ac,
    hitPoints: monster.hp,
    speed: monster.speed,
    abilities: [...monster.abilities],
    legendaryActions: monster.legendary_actions ?? undefined,
    challengeRating: monster.cr ?? undefined,
  }));

const mapTraps = (traps: RequiredRaw['traps']): NormalizedEncounterTrap[] =>
  traps.map((trap) => ({
    name: trap.name,
    trigger: trap.trigger,
    effect: trap.effect,
    dc: trap.dc,
    disarm: trap.disarm ?? undefined,
  }));

const mapHazards = (hazards: RequiredRaw['hazards']): NormalizedEncounterHazard[] =>
  hazards.map((hazard) => ({
    name: hazard.name,
    description: hazard.description,
    impact: hazard.impact,
    mitigation: hazard.mitigation ?? undefined,
  }));

const mapTerrainFeatures = (features: NonNullable<RequiredRaw['terrain']>['features']): NormalizedEncounterTerrainFeature[] =>
  features.map((feature) => ({
    name: feature.name,
    effect: feature.effect,
    dc: feature.dc ?? undefined,
    cover: feature.cover ?? undefined,
    movement: feature.movement ?? undefined,
  }));

const mapTerrain = (terrain: RequiredRaw['terrain']): NormalizedEncounterTerrain => ({
  description: terrain.description,
  features: mapTerrainFeatures(terrain.features ?? []),
  lighting: terrain.lighting ?? undefined,
  elevation: terrain.elevation ?? undefined,
  weather: terrain.weather ?? undefined,
});

const mapTreasureItems = (items: NonNullable<RequiredRaw['treasure']['items']>): NormalizedEncounterItemReward[] =>
  items.map((item) => ({
    name: item.name,
    rarity: item.rarity ?? undefined,
    description: item.description ?? undefined,
  }));

const mapTreasure = (treasure: RequiredRaw['treasure']): NormalizedEncounterTreasure => ({
  type: treasure.type,
  currency: treasure.currency ? { ...treasure.currency } : undefined,
  items: treasure.items ? mapTreasureItems(treasure.items) : undefined,
  boons: treasure.boons ? [...treasure.boons] : undefined,
});

const mapPhases = (phases: RequiredRaw['event_clock']['phases']): NormalizedEncounterPhase[] =>
  phases.map((phase) => ({
    name: phase.name,
    trigger: phase.trigger,
    outcome: phase.outcome,
    clockSegment: phase.clock_segment ?? undefined,
  }));

const mapTactics = (tactics: RequiredRaw['tactics']): NormalizedEncounter['tactics'] => {
  if (typeof tactics === 'string') {
    return tactics;
  }

  const mapped: TacticsObject = {
    openingMoves: tactics.opening_moves,
    focusTargets: tactics.focus_targets ?? undefined,
    resourceUsage: tactics.resource_usage ?? undefined,
    fallbackPlan: tactics.fallback_plan,
  };

  return mapped;
};

const mapFactCheckReport = (report: RequiredRaw['fact_check_report']): NormalizedEncounterFactCheckReport => ({
  status: report.status,
  summary: report.summary ?? undefined,
  issues: report.issues
    ? report.issues.map((issue) => ({
        description: issue.description,
        severity: issue.severity,
        resolution: issue.resolution ?? undefined,
      }))
    : undefined,
});

export const mapRawToNormalizedEncounter = (raw: RequiredRaw): NormalizedEncounterV1 => ({
  title: raw.title,
  description: raw.description,
  ruleBase: raw.rule_base,
  sourcesUsed: [...raw.sources_used],
  assumptions: [...raw.assumptions],
  proposals: raw.proposals,
  canonUpdate: raw.canon_update,
  characters: mapCharacters(raw.characters),
  npcs: mapNpcs(raw.NPCs),
  monsters: mapMonsters(raw.monsters),
  traps: mapTraps(raw.traps ?? []),
  hazards: mapHazards(raw.hazards ?? []),
  terrain: mapTerrain(raw.terrain),
  objectives: [...raw.objectives],
  difficultyTier: raw.difficulty_tier,
  expectedDurationRounds: raw.expected_duration_rounds,
  treasure: mapTreasure(raw.treasure),
  eventClock: {
    summary: raw.event_clock.summary ?? undefined,
    phases: mapPhases(raw.event_clock.phases),
  },
  tactics: mapTactics(raw.tactics),
  factCheckReport: mapFactCheckReport(raw.fact_check_report),
  schemaVersion: raw.schemaVersion,
});

type WithIdMetadata = RequiredRaw & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  lastEditedBy?: string;
  changeSummary?: string;
};

const mergeOptionalString = (value: string | undefined): string | undefined => (value ? value : undefined);

const mapCharacterToRaw = (character: NormalizedEncounterCharacter): RequiredRaw['characters'][number] => ({
  id: character.id,
  name: character.name,
  role: character.role,
  level: character.level,
  class: mergeOptionalString(character.class),
  hit_points: character.hitPoints,
  conditions: character.conditions && character.conditions.length > 0 ? character.conditions : undefined,
  notes: mergeOptionalString(character.notes),
});

const mapNpcToRaw = (npc: NormalizedEncounterNpc): RequiredRaw['NPCs'][number] => ({
  entity_id: npc.entityId,
  name: npc.name,
  affiliation: npc.affiliation,
  motivation: mergeOptionalString(npc.motivation),
  support: mergeOptionalString(npc.support),
  stat_block: mergeOptionalString(npc.statBlock),
});

const mapMonsterToRaw = (monster: NormalizedEncounterMonster): RequiredRaw['monsters'][number] => ({
  name: monster.name,
  count: monster.count,
  ac: monster.armorClass,
  hp: monster.hitPoints,
  speed: monster.speed,
  abilities: [...monster.abilities],
  legendary_actions: monster.legendaryActions,
  cr: mergeOptionalString(monster.challengeRating),
});

const mapTrapToRaw = (trap: NormalizedEncounterTrap): RequiredRaw['traps'][number] => ({
  name: trap.name,
  trigger: trap.trigger,
  effect: trap.effect,
  dc: trap.dc,
  disarm: mergeOptionalString(trap.disarm),
});

const mapHazardToRaw = (hazard: NormalizedEncounterHazard): RequiredRaw['hazards'][number] => ({
  name: hazard.name,
  description: hazard.description,
  impact: hazard.impact,
  mitigation: mergeOptionalString(hazard.mitigation),
});

const mapTerrainFeatureToRaw = (feature: NormalizedEncounterTerrainFeature): NonNullable<RequiredRaw['terrain']['features']>[number] => ({
  name: feature.name,
  effect: feature.effect,
  dc: feature.dc,
  cover: feature.cover,
  movement: feature.movement,
});

const mapTerrainToRaw = (terrain: NormalizedEncounterTerrain): RequiredRaw['terrain'] => ({
  description: terrain.description,
  features: terrain.features.map(mapTerrainFeatureToRaw),
  lighting: terrain.lighting,
  elevation: terrain.elevation,
  weather: terrain.weather,
});

const mapTreasureItemToRaw = (item: NormalizedEncounterItemReward): NonNullable<RequiredRaw['treasure']['items']>[number] => ({
  name: item.name,
  rarity: item.rarity,
  description: item.description,
});

const mapTreasureToRaw = (treasure: NormalizedEncounterTreasure): RequiredRaw['treasure'] => ({
  type: treasure.type,
  currency: treasure.currency ? { ...treasure.currency } : undefined,
  items: treasure.items ? treasure.items.map(mapTreasureItemToRaw) : undefined,
  boons: treasure.boons && treasure.boons.length > 0 ? [...treasure.boons] : undefined,
});

const mapPhaseToRaw = (phase: NormalizedEncounterPhase): RequiredRaw['event_clock']['phases'][number] => ({
  name: phase.name,
  trigger: phase.trigger,
  outcome: phase.outcome,
  clock_segment: phase.clockSegment,
});

const mapTacticsToRaw = (tactics: NormalizedEncounter['tactics']): RequiredRaw['tactics'] => {
  if (typeof tactics === 'string') {
    return tactics;
  }

  return {
    opening_moves: tactics.openingMoves,
    focus_targets: tactics.focusTargets,
    resource_usage: tactics.resourceUsage,
    fallback_plan: tactics.fallbackPlan,
  };
};

const mapFactCheckReportToRaw = (report: NormalizedEncounterFactCheckReport): RequiredRaw['fact_check_report'] => ({
  status: report.status,
  summary: report.summary,
  issues: report.issues
    ? report.issues.map((issue) => ({
        description: issue.description,
        severity: issue.severity,
        resolution: issue.resolution,
      }))
    : undefined,
});

export const mapNormalizedToRawEncounter = (
  normalized: NormalizedEncounterV1,
  base?: WithIdMetadata,
): WithIdMetadata => ({
  ...(base ?? {}),
  title: normalized.title,
  description: normalized.description,
  rule_base: normalized.ruleBase,
  sources_used: toNonEmptyTuple(normalized.sourcesUsed, 'sources_used'),
  assumptions: [...normalized.assumptions],
  proposals: normalized.proposals,
  canon_update: normalized.canonUpdate,
  characters: mapNonEmptyTuple(normalized.characters, 'characters', mapCharacterToRaw),
  NPCs: normalized.npcs.map(mapNpcToRaw),
  monsters: mapNonEmptyTuple(normalized.monsters, 'monsters', mapMonsterToRaw),
  traps: normalized.traps.map(mapTrapToRaw),
  hazards: normalized.hazards.map(mapHazardToRaw),
  terrain: mapTerrainToRaw(normalized.terrain),
  objectives: toNonEmptyTuple(normalized.objectives, 'objectives'),
  difficulty_tier: normalized.difficultyTier,
  expected_duration_rounds: normalized.expectedDurationRounds,
  treasure: mapTreasureToRaw(normalized.treasure),
  event_clock: {
    summary: normalized.eventClock.summary,
    phases: mapNonEmptyTuple(normalized.eventClock.phases, 'event_clock.phases', mapPhaseToRaw),
  },
  tactics: mapTacticsToRaw(normalized.tactics),
  fact_check_report: mapFactCheckReportToRaw(normalized.factCheckReport),
  schemaVersion: normalized.schemaVersion,
});
