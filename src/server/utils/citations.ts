/**
 * Validate that all non-proposal claims in a draft are covered by sources_used
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */
export function validateCitations(
  draft: {
    sources_used: string[];
    proposals?: Array<{ question: string }>;
    [key: string]: any;
  },
  availableChunkIds: string[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check that sources_used references valid chunks
  const invalidSources = draft.sources_used.filter(chunkId => !availableChunkIds.includes(chunkId));

  if (invalidSources.length > 0) {
    errors.push(`Invalid chunk IDs in sources_used: ${invalidSources.join(', ')}`);
  }

  // Warn if no sources used (unless everything is proposals)
  if (draft.sources_used.length === 0 && (!draft.proposals || draft.proposals.length === 0)) {
    warnings.push('No sources cited and no proposals made - this may indicate invented content');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format a citation for display
 */
export function formatCitation(chunkId: string, text?: string): string {
  if (text) {
    return `[${chunkId}]: "${text}"`;
  }
  return `[${chunkId}]`;
}

/**
 * Extract entity references from text
 * Simple pattern matching for entity IDs like "npc.rhylar_frinac"
 */
export function extractEntityReferences(text: string): string[] {
  const pattern = /\b(npc|item|location|faction|rule|timeline)\.[a-z0-9_]+\b/g;
  const matches = text.match(pattern);
  return matches ? Array.from(new Set(matches)) : [];
}
