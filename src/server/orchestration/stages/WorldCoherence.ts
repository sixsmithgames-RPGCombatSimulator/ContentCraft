/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { runCoherenceGuard } from '../validators/CoherenceGuard.js';
import type { StageOutput } from '../Orchestrator.js';
import type { Brief, FactPack } from '../../models/Artifact.js';

export async function runWorldCoherence(
  run: any,
  inputs: Record<string, any>,
  phase: 'pre' | 'post'
): Promise<StageOutput> {
  try {
    if (phase === 'pre') {
      const brief: Brief = inputs.planner;
      const factpack: FactPack = inputs.retriever;

      if (!factpack) {
        return { error: 'WorldCoherence(pre) requires FactPack from Retriever' };
      }

      const result = await runCoherenceGuard(factpack, {
        phase: 'pre',
        factpack,
        regions: brief?.retrieval_hints?.regions,
        eras: brief?.retrieval_hints?.eras,
      });

      if (!result.ok) {
        return {
          error: `WorldCoherence(pre) failed: ${result.errors.join('; ')}`,
          notes: result.suggestions,
        };
      }

      return {
        artifact: { ok: true, suggestions: result.suggestions || [] },
        notes: result.suggestions || [],
      };
    } else {
      // Post phase
      const brief: Brief = inputs.planner;
      const factpack: FactPack = inputs.retriever;
      const draft: any = inputs.creator;

      if (!draft) {
        return { error: 'WorldCoherence(post) requires Draft from Creator' };
      }

      const result = await runCoherenceGuard(draft, {
        phase: 'post',
        factpack,
        regions: brief?.retrieval_hints?.regions,
        eras: brief?.retrieval_hints?.eras,
      });

      if (!result.ok) {
        return {
          error: `WorldCoherence(post) failed: ${result.errors.join('; ')}`,
          notes: result.suggestions,
        };
      }

      return {
        artifact: { ok: true, suggestions: result.suggestions || [] },
        notes: result.suggestions || [],
      };
    }
  } catch (error: any) {
    return {
      error: `WorldCoherence(${phase}) exception: ${error.message}`,
    };
  }
}
