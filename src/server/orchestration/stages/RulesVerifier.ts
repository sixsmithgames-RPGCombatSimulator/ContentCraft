/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { runRulesGuard } from '../validators/RulesGuard.js';
import type { StageOutput } from '../Orchestrator.js';
import type { Run } from '../../models/Run.js';

export async function runRulesVerifier(
  run: Run,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const draft: any = inputs.creator;

  if (run?.flags?.domain === 'writing') {
    return {
      artifact: { ok: true, skipped: true, reason: 'rules skipped for writing domain' },
      notes: ['rules: skipped for writing domain'],
    };
  }

  if (!draft) {
    return { error: 'RulesVerifier requires Draft from Creator' };
  }

  try {
    const result = await runRulesGuard(draft, run);

    if (!result.ok) {
      return {
        error: `Rules validation failed: ${result.errors.join('; ')}`,
        notes: result.balance_flags,
      };
    }

    return {
      artifact: { ok: true, flags: result.balance_flags || [] },
      notes: result.balance_flags || [],
    };
  } catch (error: any) {
    return {
      error: `RulesVerifier exception: ${error.message}`,
    };
  }
}
