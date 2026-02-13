/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface Proposal {
  question: string;
  options:
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string];
  rule_impact: string;
  recommendation?: string;
}

export interface BaseOutput {
  rule_base: '2024RAW' | '2014RAW';
  sources_used: string[];
  assumptions: string[];
  proposals: Proposal[];
  canon_update: string;
}

export interface SchemaEncounterV1Character {
  id: string;
  name: string;
  role: string;
  level: number;
  class?: string;
  hit_points: number;
  conditions?: string[];
  notes?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Npc {
  entity_id: string;
  name: string;
  affiliation: string;
  motivation?: string;
  support?: string;
  stat_block?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Monster {
  name: string;
  count: number;
  ac: number;
  hp: number;
  speed: number;
  abilities: string[];
  legendary_actions?: number;
  cr?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Trap {
  name: string;
  trigger: string;
  effect: string;
  dc: number;
  disarm?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Hazard {
  name: string;
  description: string;
  impact: string;
  mitigation?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1TerrainFeature {
  name: string;
  effect: string;
  dc?: number;
  cover?: string;
  movement?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Terrain {
  description: string;
  features: SchemaEncounterV1TerrainFeature[];
  lighting?: 'bright' | 'dim' | 'dark' | 'magical-dark';
  elevation?: string;
  weather?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Phase {
  name: string;
  trigger: string;
  outcome: string;
  clock_segment?: number;
  [k: string]: unknown;
}

export interface SchemaEncounterV1TacticsObject {
  opening_moves: string;
  focus_targets?: string;
  resource_usage?: string;
  fallback_plan: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1FactCheckIssue {
  description: string;
  severity: 'minor' | 'major' | 'critical';
  resolution?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1FactCheckReport {
  status: 'pending' | 'pass' | 'fail';
  summary?: string;
  issues?: SchemaEncounterV1FactCheckIssue[];
  [k: string]: unknown;
}

export interface SchemaEncounterV1TreasureCurrency {
  gp?: number;
  sp?: number;
  cp?: number;
  [k: string]: unknown;
}

export interface SchemaEncounterV1TreasureItem {
  name: string;
  rarity?: string;
  description?: string;
  [k: string]: unknown;
}

export interface SchemaEncounterV1Treasure {
  type: 'currency' | 'item' | 'boon' | 'information';
  currency?: SchemaEncounterV1TreasureCurrency;
  items?: SchemaEncounterV1TreasureItem[];
  boons?: string[];
  [k: string]: unknown;
}

export type SchemaEncounterV1Json = BaseOutput & {
  title: string;
  description: string;
  characters: [SchemaEncounterV1Character, ...SchemaEncounterV1Character[]];
  NPCs: SchemaEncounterV1Npc[];
  monsters: [SchemaEncounterV1Monster, ...SchemaEncounterV1Monster[]];
  traps: SchemaEncounterV1Trap[];
  hazards: SchemaEncounterV1Hazard[];
  terrain: SchemaEncounterV1Terrain;
  objectives: [string, ...string[]];
  difficulty_tier: 'easy' | 'standard' | 'deadly' | 'boss';
  expected_duration_rounds: number;
  treasure: SchemaEncounterV1Treasure;
  event_clock: {
    summary?: string;
    phases: [SchemaEncounterV1Phase, ...SchemaEncounterV1Phase[]];
    [k: string]: unknown;
  };
  tactics: string | SchemaEncounterV1TacticsObject;
  sources_used: [string, ...string[]];
  assumptions: string[];
  fact_check_report: SchemaEncounterV1FactCheckReport;
  schemaVersion: string;
  [k: string]: unknown;
};
