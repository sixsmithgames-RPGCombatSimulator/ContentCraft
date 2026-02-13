/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { Authority } from './Authority.js';
import { DEFAULT_AUTHORITY } from './Authority.js';

export type RunType = 'scene' | 'encounter' | 'npc' | 'item' | 'adventure';

export type StageName =
  | 'planner'
  | 'retriever'
  | 'coherence_pre'
  | 'creator'
  | 'fact_check'
  | 'rules'
  | 'physics'
  | 'balance'
  | 'coherence_post'
  | 'stylist'
  | 'finalizer';

export type StageStatus = 'idle' | 'ok' | 'fail';
export type RunStatus = 'queued' | 'running' | 'failed' | 'completed';

export interface RunFlags {
  domain?: 'rpg' | 'writing';
  rule_base?: '2024RAW' | '2014RAW' | `HouseRules:${string}`;
  allow_invention?: Authority['invention_policy_default'];
  mode?: 'GM' | 'player';
  tone?: string; // e.g., "dark", "heroic", "comedic"
  difficulty?: 'easy' | 'standard' | 'deadly' | 'boss';
  realism?: 'strict' | 'cinematic';
}

export interface StageResult {
  status: StageStatus;
  error?: string;
  artifact_id?: string; // Points to artifacts collection
  notes?: string[];
  started_at?: Date;
  completed_at?: Date;
}

export interface Run {
  _id: string; // Short ID generated with nanoid
  createdAt: Date;
  updatedAt: Date;
  type: RunType;
  prompt: string;
  flags: RunFlags;
  status: RunStatus;
  stages: Record<StageName, StageResult>;
  current_stage?: StageName;
  error?: string; // Overall run error
}

/**
 * Initialize a new run with default stage states
 */
export function createRun(
  id: string,
  type: RunType,
  prompt: string,
  flags: RunFlags
): Run {
  const normalizedFlags: RunFlags = {
    domain: flags?.domain ?? 'rpg',
    rule_base: flags?.rule_base ?? '2024RAW',
    allow_invention: flags?.allow_invention ?? DEFAULT_AUTHORITY.invention_policy_default,
    mode: flags?.mode ?? 'GM',
    tone: flags?.tone ?? 'epic',
    difficulty: flags?.difficulty ?? 'standard',
    realism: flags?.realism ?? 'cinematic',
  };

  const stages: Record<StageName, StageResult> = {
    planner: { status: 'idle' },
    retriever: { status: 'idle' },
    coherence_pre: { status: 'idle' },
    creator: { status: 'idle' },
    fact_check: { status: 'idle' },
    rules: { status: 'idle' },
    physics: { status: 'idle' },
    balance: { status: 'idle' },
    coherence_post: { status: 'idle' },
    stylist: { status: 'idle' },
    finalizer: { status: 'idle' },
  };

  return {
    _id: id,
    createdAt: new Date(),
    updatedAt: new Date(),
    type,
    prompt,
    flags: normalizedFlags,
    status: 'queued',
    stages,
    current_stage: 'planner',
  };
}

/**
 * Get ordered list of stages
 */
export function getStageOrder(): StageName[] {
  return [
    'planner',
    'retriever',
    'coherence_pre',
    'creator',
    'fact_check',
    'rules',
    'physics',
    'balance',
    'coherence_post',
    'stylist',
    'finalizer',
  ];
}

/**
 * Get the next stage after the given stage
 */
export function getNextStage(current: StageName): StageName | null {
  const order = getStageOrder();
  const currentIndex = order.indexOf(current);

  if (currentIndex === -1 || currentIndex === order.length - 1) {
    return null;
  }

  return order[currentIndex + 1];
}
