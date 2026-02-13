/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { runBalanceGuard } from '../validators/BalanceGuard.js';
import type { StageOutput } from '../Orchestrator.js';

export async function runBalanceLints(
  run: any,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const draft: any = inputs.creator;

  if (run?.flags?.domain === 'writing') {
    return {
      artifact: { ok: true, skipped: true, reason: 'balance skipped for writing domain' },
      notes: ['balance: skipped for writing domain'],
    };
  }

  if (!draft) {
    return { error: 'BalanceLints requires Draft from Creator' };
  }

  try {
    const result = await runBalanceGuard(draft);

    if (!result.ok) {
      return {
        error: `Balance validation failed: ${result.errors.join('; ')}`,
        notes: result.flags,
      };
    }

    return {
      artifact: { ok: true, flags: result.flags },
      notes: result.flags,
    };
  } catch (error: any) {
    return {
      error: `BalanceLints exception: ${error.message}`,
    };
  }
}
