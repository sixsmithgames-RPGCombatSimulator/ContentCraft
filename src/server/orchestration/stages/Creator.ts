/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { StageOutput } from '../Orchestrator.js';
import type { Brief, FactPack } from '../../models/Artifact.js';
import type { Run } from '../../models/Run.js';

export async function runCreator(
  _run: Run,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const brief: Brief = inputs.planner;
  const factpack: FactPack = inputs.retriever;

  if (!brief || !factpack) {
    return { error: 'Creator requires Brief and FactPack artifacts' };
  }

  // OpenAI integration disabled
  return {
    error: 'Creator stage disabled: OpenAI integration is commented out.',
  };
}
