/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { getDb } from '../../config/mongo.js';
import type { StageOutput } from '../Orchestrator.js';
import type { Brief, FactPack } from '../../models/Artifact.js';

export async function runRetriever(
  _run: any,
  inputs: Record<string, any>
): Promise<StageOutput> {
  const brief: Brief = inputs.planner;

  if (!brief || !brief.retrieval_hints) {
    return { error: 'Retriever requires Brief artifact from Planner' };
  }

  try {
    const db = getDb();
    const chunksCol = db.collection('canon_chunks');

    const { entities = [], regions = [], eras = [], keywords = [] } = brief.retrieval_hints;

    // Build query
    const query: any = {};
    const orClauses: any[] = [];

    if (entities.length > 0) {
      orClauses.push({ entity_id: { $in: entities } });
    }
    if (regions.length > 0) {
      orClauses.push({ 'metadata.region': { $in: regions } });
    }
    if (eras.length > 0) {
      orClauses.push({ 'metadata.era': { $in: eras } });
    }
    if (keywords.length > 0) {
      orClauses.push({ 'metadata.tags': { $in: keywords } });
    }

    if (orClauses.length > 0) {
      query.$or = orClauses;
    }

    // Get base results
    const finalResults = await chunksCol.find(query).limit(25).toArray();

    // Dedupe by chunk_id AND text content, then limit to 10
    const seenChunkIds = new Set<string>();
    const seenTexts = new Set<string>();
    const dedupedResults = finalResults.filter(chunk => {
      const chunkId = String(chunk._id);
      const textRaw = typeof chunk.text === 'string' ? chunk.text : String(chunk.text ?? '');
      const normalizedText = textRaw.trim().toLowerCase();

      // Skip if we've seen this chunk_id OR this exact text
      if (seenChunkIds.has(chunkId) || seenTexts.has(normalizedText)) {
        return false;
      }

      seenChunkIds.add(chunkId);
      seenTexts.add(normalizedText);
      return true;
    }).slice(0, 10);

    // Build fact pack
    const facts: FactPack['facts'] = [];
    for (const chunk of dedupedResults) {
      const chunkId = String(chunk._id);
      const textRaw = typeof chunk.text === 'string' ? chunk.text : String(chunk.text ?? '');
      const text = textRaw.trim();
      if (!text) {
        continue;
      }

      const fact: FactPack['facts'][number] = {
        chunk_id: chunkId,
        text,
      };

      if (chunk.entity_id) {
        fact.entity_id = String(chunk.entity_id);
      }

      facts.push(fact);
    }

    const entitiesFound = Array.from(new Set(
      dedupedResults
        .map((c) => (c.entity_id ? String(c.entity_id) : undefined))
        .filter((value): value is string => typeof value === 'string')
    ));

    const gaps: string[] = [];
    if (facts.length === 0) {
      gaps.push('No canon chunks matched retrieval hints. Consider adding seed data or broadening search.');
    }
    if (entities.length > 0 && entitiesFound.length < entities.length) {
      const missing = entities.filter(e => !entitiesFound.includes(e));
      gaps.push(`Entities not found: ${missing.join(', ')}`);
    }

    const factPack: FactPack = {
      facts,
      entities: entitiesFound,
      gaps: gaps.length > 0 ? gaps : undefined,
    };

    return {
      artifact: factPack,
      notes: [`Retrieved ${facts.length} chunks from ${entitiesFound.length} entities`],
    };
  } catch (error: any) {
    return {
      error: `Retriever failed: ${error.message}`,
    };
  }
}
