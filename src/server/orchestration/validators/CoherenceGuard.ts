/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { FactPack } from '../../models/Artifact.js';

type GuardResult = { ok: boolean; errors: string[]; suggestions?: string[] };

export async function runCoherenceGuard(
  data: any,
  opts: {
    phase: 'pre' | 'post';
    factpack?: FactPack;
    regions?: string[];
    eras?: string[];
  }
): Promise<GuardResult> {
  const errors: string[] = [];
  const suggestions: string[] = [];

  if (opts.phase === 'pre') {
    // Ensure facts were retrieved
    const facts = opts.factpack?.facts || [];
    if (facts.length === 0) {
      errors.push(
        'coherence(pre): no facts retrieved; add canon entities/chunks or loosen query'
      );
    }

    // Validate chunk_id format
    facts.forEach(f => {
      if (!/^[\w\.\-]+#c\d+/.test(f.chunk_id)) {
        errors.push(`coherence(pre): malformed chunk_id "${f.chunk_id}"`);
      }
    });

    // Check for gaps
    if (opts.factpack?.gaps && opts.factpack.gaps.length > 0) {
      suggestions.push(
        `coherence(pre): gaps identified: ${opts.factpack.gaps.join('; ')}`
      );
    }
  } else {
    // Post-creation coherence
    const srcs: string[] = data.sources_used || [];
    if (srcs.length === 0) {
      errors.push('coherence(post): no sources_used cited');
    }

    // Region/era consistency
    if (opts.regions?.length) {
      const region = opts.regions[0];
      const locationText = JSON.stringify(data.location || data.environment || '').toLowerCase();
      if (region && !locationText.includes(region.toLowerCase())) {
        suggestions.push(
          `coherence(post): expected region "${region}" not clearly referenced in location`
        );
      }
    }

    if (opts.eras?.length) {
      const era = opts.eras[0];
      // Check if era mentioned in description or context
      const contentText = JSON.stringify(data).toLowerCase();
      if (era && !contentText.includes(era.toLowerCase().replace(/-/g, ' '))) {
        suggestions.push(
          `coherence(post): era "${era}" not explicitly referenced—consider adding temporal context`
        );
      }
    }

    // Entity resolution warnings
    if (data.participants || data.combatants || data.key_npcs) {
      const entities = opts.factpack?.entities || [];
      suggestions.push(
        `coherence(post): ${entities.length} canon entities referenced—verify names match canonical form`
      );
    }
  }

  return { ok: errors.length === 0, errors, suggestions };
}
