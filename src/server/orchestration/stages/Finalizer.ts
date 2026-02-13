/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { StageOutput } from '../Orchestrator.js';
import type { FactPack, ContinuityLedger, CanonDelta } from '../../models/Artifact.js';

export async function runFinalizer(
  run: any,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const styled: any = inputs.stylist;
  const factpack: FactPack = inputs.retriever;

  if (!styled || !factpack) {
    return { error: 'Finalizer requires Styled draft and FactPack' };
  }

  try {
    // Build continuity ledger
    const continuityLedger: ContinuityLedger = {
      facts_relied_on: styled.sources_used || [],
      assumptions: styled.assumptions || [],
      proposals: styled.proposals || [],
    };

    // Build canon delta
    const canonDelta: CanonDelta = {
      summary: styled.canon_update || 'No canon changes',
    };

    // Identify new entities mentioned that aren't in canon
    const mentionedEntities = extractMentionedEntities(styled);
    const canonEntities = factpack.entities || [];
    const newEntities = mentionedEntities.filter(e => !canonEntities.includes(e));

    if (newEntities.length > 0) {
      canonDelta.new_entities = newEntities;
    }

    // Count updated entities (those with sources_used)
    if (canonEntities.length > 0) {
      canonDelta.updated_entities = canonEntities;
    }

    // Estimate new chunks that would be created
    const textContent = JSON.stringify(styled);
    const estimatedChunks = Math.ceil(textContent.length / 500);
    canonDelta.new_chunks = estimatedChunks;

    return {
      artifact: {
        continuity_ledger: continuityLedger,
        canon_delta: canonDelta,
      },
      notes: [
        `Continuity ledger: ${continuityLedger.facts_relied_on.length} sources, ${continuityLedger.assumptions.length} assumptions`,
        `Canon delta: ${canonDelta.summary}`,
      ],
    };
  } catch (error: any) {
    return {
      error: `Finalizer failed: ${error.message}`,
    };
  }
}

function extractMentionedEntities(draft: any): string[] {
  const entities: Set<string> = new Set();

  // Extract from common fields
  if (draft.participants) {
    draft.participants.forEach((p: any) => {
      if (p.name) entities.add(`npc.${slugify(p.name)}`);
    });
  }

  if (draft.combatants) {
    draft.combatants.forEach((c: any) => {
      if (c.name) entities.add(`npc.${slugify(c.name)}`);
    });
  }

  if (draft.key_npcs) {
    draft.key_npcs.forEach((npc: any) => {
      if (npc.name) entities.add(`npc.${slugify(npc.name)}`);
    });
  }

  if (draft.key_locations) {
    draft.key_locations.forEach((loc: any) => {
      if (loc.name) entities.add(`location.${slugify(loc.name)}`);
    });
  }

  if (draft.name) {
    const type = draft.type || 'item';
    entities.add(`${type}.${slugify(draft.name)}`);
  }

  return Array.from(entities);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
