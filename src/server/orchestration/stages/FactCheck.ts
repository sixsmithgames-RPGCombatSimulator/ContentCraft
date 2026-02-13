/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { StageOutput } from '../Orchestrator.js';
import type { Run } from '../../models/Run.js';
import type { Draft, FactPack } from '../../models/Artifact.js';

export async function runFactCheck(
  _run: Run,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const draft: Draft | undefined = inputs.creator;
  const factpack: FactPack | undefined = inputs.retriever;

  if (!draft || !factpack) {
    return { error: 'FactCheck requires Draft and FactPack artifacts' };
  }

  return {
    error: 'FactCheck stage disabled: OpenAI integration is commented out.',
  };
}
