/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { SchemaEncounterV1Json, Proposal } from './encounter/generated.js';

export type RawEncounterV1 = SchemaEncounterV1Json;

export type EncounterRuleBase = RawEncounterV1['rule_base'];

export interface NormalizedEncounterCharacter {
  id: string;
  name: string;
  role: string;
  level: number;
  class?: string;
  hitPoints: number;
  conditions?: string[];
  notes?: string;
}

export interface NormalizedEncounterNpc {
  entityId: string;
  name: string;
  affiliation: string;
  motivation?: string;
  support?: string;
  statBlock?: string;
}

export interface NormalizedEncounterMonster {
  name: string;
  count: number;
  armorClass: number;
  hitPoints: number;
  speed: number;
  abilities: string[];
  legendaryActions?: number;
  challengeRating?: string;
}

export interface NormalizedEncounterTrap {
  name: string;
  trigger: string;
  effect: string;
  dc: number;
  disarm?: string;
}

export interface NormalizedEncounterHazard {
  name: string;
  description: string;
  impact: string;
  mitigation?: string;
}

export interface NormalizedEncounterTerrainFeature {
  name: string;
  effect: string;
  dc?: number;
  cover?: string;
  movement?: string;
}

export interface NormalizedEncounterTerrain {
  description: string;
  features: NormalizedEncounterTerrainFeature[];
  lighting?: 'bright' | 'dim' | 'dark' | 'magical-dark';
  elevation?: string;
  weather?: string;
}

export interface NormalizedEncounterItemReward {
  name: string;
  rarity?: string;
  description?: string;
}

export interface NormalizedEncounterTreasure {
  type: 'currency' | 'item' | 'boon' | 'information';
  currency?: {
    gp?: number;
    sp?: number;
    cp?: number;
  };
  items?: NormalizedEncounterItemReward[];
  boons?: string[];
}

export interface NormalizedEncounterPhase {
  name: string;
  trigger: string;
  outcome: string;
  clockSegment?: number;
}

export type NormalizedEncounterTactics =
  | string
  | {
      openingMoves: string;
      focusTargets?: string;
      resourceUsage?: string;
      fallbackPlan: string;
    };

export interface NormalizedEncounterFactCheckIssue {
  description: string;
  severity: 'minor' | 'major' | 'critical';
  resolution?: string;
}

export interface NormalizedEncounterFactCheckReport {
  status: 'pending' | 'pass' | 'fail';
  summary?: string;
  issues?: NormalizedEncounterFactCheckIssue[];
}

export interface NormalizedEncounterV1 {
  title: string;
  description: string;
  ruleBase: EncounterRuleBase;
  sourcesUsed: string[];
  assumptions: string[];
  proposals: Proposal[];
  canonUpdate: string;
  characters: NormalizedEncounterCharacter[];
  npcs: NormalizedEncounterNpc[];
  monsters: NormalizedEncounterMonster[];
  traps: NormalizedEncounterTrap[];
  hazards: NormalizedEncounterHazard[];
  terrain: NormalizedEncounterTerrain;
  objectives: string[];
  difficultyTier: 'easy' | 'standard' | 'deadly' | 'boss';
  expectedDurationRounds: number;
  treasure: NormalizedEncounterTreasure;
  eventClock: {
    summary?: string;
    phases: NormalizedEncounterPhase[];
  };
  tactics: NormalizedEncounterTactics;
  factCheckReport: NormalizedEncounterFactCheckReport;
  schemaVersion: string;
}

export interface PersistedEncounterV1 extends RawEncounterV1 {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string;
  changeSummary: string;
}
