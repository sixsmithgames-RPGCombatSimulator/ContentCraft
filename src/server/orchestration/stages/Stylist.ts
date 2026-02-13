/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// import { llmJSON } from '../../config/openai.js';
// import { validateDraft } from '../validators/AJV.js';
import type { StageOutput } from '../Orchestrator.js';
import type { Run } from '../../models/Run.js';

export async function runStylist(
  _run: Run,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const draft: any = inputs.creator;
  const factCheck: any = inputs.fact_check;

  if (!draft || !factCheck) {
    return { error: 'Stylist requires Draft and FactCheck artifacts' };
  }

  return {
    error: 'Stylist stage disabled: OpenAI integration is commented out.',
  };
}
