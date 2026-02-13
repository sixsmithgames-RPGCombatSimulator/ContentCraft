/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface GenerationRun {
  _id: string; // e.g., "run_abc123xyz"
  project_id: string; // Which project this generation belongs to
  config: GenerationConfig; // The input configuration used
  results: GenerationResults; // The output from all stages
  entities_created?: string[]; // IDs of entities created from this run
  status: 'completed' | 'saved' | 'discarded';
  created_at: Date;
  updated_at: Date;
}

export interface GenerationConfig {
  prompt: string;
  type: string; // encounter, npc, item, etc.
  flags: {
    rule_base: string;
    allow_invention: string;
    tone: string;
    mode: string;
    difficulty?: string;
    realism?: string;
  };
}

export interface GenerationResults {
  planner?: any; // Design brief from planner stage
  creator?: any; // Content from creator stage
  stylist?: any; // Polished content from stylist stage
}

/**
 * Helper to generate run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `run_${timestamp}_${random}`;
}
