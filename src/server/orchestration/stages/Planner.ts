/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// import { llmJSON } from '../../config/openai.js';
import type { Run } from '../../models/Run.js';
import type { StageOutput } from '../Orchestrator.js';

export async function runPlanner(_run: Run): Promise<StageOutput> {
  return {
    error: 'Planner stage disabled: OpenAI integration is commented out.',
  };
}
