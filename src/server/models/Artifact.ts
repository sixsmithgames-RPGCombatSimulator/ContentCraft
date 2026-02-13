/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { StageName } from './Run.js';

/**
 * Large JSON payloads produced by stages
 */
export interface Artifact {
  _id: string;
  run_id: string;
  stage: StageName;
  data: any; // The actual artifact payload (Brief, FactPack, Draft, etc.)
  created_at: Date;
}

// ============================================
// Stage-specific artifact structures
// ============================================

/**
 * Planner stage output
 */
export interface Brief {
  deliverable: string; // What we're creating
  story_clock?: string; // Narrative urgency/timing
  threads?: string[]; // Story threads to weave in
  retrieval_hints: {
    entities?: string[]; // Entity IDs or names
    regions?: string[];
    eras?: string[];
    keywords?: string[];
  };
  allow_invention: string;
  rule_base: string;
  tone: string;
  mode: string;
  difficulty: string;
  realism: string;
}

/**
 * Retriever stage output
 */
export interface FactPack {
  facts: Array<{
    chunk_id: string;
    text: string;
    entity_id?: string;
  }>;
  entities: string[]; // Entity IDs referenced
  gaps?: string[]; // Missing information identified
}

/**
 * Creator stage output (must match schema)
 */
export interface Draft {
  rule_base: string;
  sources_used: string[]; // chunk_ids
  assumptions: string[];
  proposals: Proposal[];
  canon_update: string;
  // ... plus type-specific fields (scene, encounter, npc, item data)
  [key: string]: any;
}

export interface Proposal {
  question: string;
  options: string[];
  rule_impact: string;
  recommendation?: string;
}

export interface FactCheckConflict {
  field_path: string;
  summary: string;
  details: string;
  severity: 'critical' | 'major' | 'minor';
  chunk_id?: string;
  canon_fact?: string;
  suggested_fix: string;
}

export interface FactCheckAmbiguity {
  field_path: string;
  text: string;
  clarification_needed: string;
  recommended_revision: string;
}

export interface FactCheckUnassociated {
  field_path: string;
  text: string;
  reason: string;
  suggested_action: 'ask_user' | 'discard' | 'keep';
}

export interface FactCheckReport {
  conflicts: FactCheckConflict[];
  ambiguities: FactCheckAmbiguity[];
  unassociated: FactCheckUnassociated[];
  revision_prompt: string;
  user_questions: string[];
  summary: string;
}

/**
 * Finalizer stage outputs
 */
export interface ContinuityLedger {
  facts_relied_on: string[]; // chunk_ids
  assumptions: string[];
  proposals: Proposal[];
}

export interface CanonDelta {
  summary: string;
  new_entities?: string[];
  updated_entities?: string[];
  new_chunks?: number;
}
