/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { FactPack } from '../../models/Artifact.js';
import type { Authority } from '../../models/Authority.js';

export interface CanonGuardResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that sources_used references are valid
 */
export function validateSources(
  sourcesUsed: string[],
  factPack: FactPack
): CanonGuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const availableChunkIds = factPack.facts.map(f => f.chunk_id);

  // Check all sources_used are in factpack
  const invalidSources = sourcesUsed.filter(id => !availableChunkIds.includes(id));

  if (invalidSources.length > 0) {
    errors.push(
      `Sources not found in fact pack: ${invalidSources.join(', ')}`
    );
  }

  // Warn if no sources cited
  if (sourcesUsed.length === 0) {
    warnings.push('No sources cited - content may be invented');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check invention policy compliance
 */
export function checkInventionPolicy(
  draft: any,
  authority: Authority
): CanonGuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const forbiddenCategories = new Set(authority.forbidden_inventions);

  // Check proposals for forbidden inventions
  if (draft.proposals && Array.isArray(draft.proposals)) {
    for (const proposal of draft.proposals) {
      const question = proposal.question.toLowerCase();

      // Check if proposal contains forbidden patterns
      for (const forbidden of forbiddenCategories) {
        if (question.includes(forbidden.toLowerCase())) {
          errors.push(
            `Proposal violates invention policy: "${proposal.question}" contains forbidden category "${forbidden}"`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
