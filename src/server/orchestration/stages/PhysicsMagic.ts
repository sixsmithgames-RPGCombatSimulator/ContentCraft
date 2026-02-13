/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { runPhysicsGuard } from '../validators/PhysicsGuard.js';
import type { StageOutput } from '../Orchestrator.js';

export async function runPhysicsMagic(
  run: any,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const draft: any = inputs.creator;

  if (run?.flags?.domain === 'writing') {
    return {
      artifact: { ok: true, skipped: true, reason: 'physics skipped for writing domain' },
      notes: ['physics: skipped for writing domain'],
    };
  }

  if (!draft) {
    return { error: 'PhysicsMagic requires Draft from Creator' };
  }

  try {
    const result = await runPhysicsGuard(draft);

    if (!result.ok) {
      return {
        error: `Physics validation failed: ${result.errors.join('; ')}`,
        notes: result.flags,
      };
    }

    return {
      artifact: { ok: true, flags: result.flags || [] },
      notes: result.flags || [],
    };
  } catch (error: any) {
    return {
      error: `PhysicsMagic exception: ${error.message}`,
    };
  }
}
