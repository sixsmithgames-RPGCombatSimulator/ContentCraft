/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { getDb } from '../config/mongo.js';
import type { CanonEntity } from '../models/CanonEntity.js';
import { ObjectId } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

interface DuplicateGroup {
  text: string;
  normalized_text: string;
  chunk_ids: string[];
  sources: string[];
  count: number;
}

interface EntityWithDuplicates {
  entity_id: string;
  canonical_name: string;
  type: string;
  region?: string;
  is_official?: boolean;
  duplicate_groups: DuplicateGroup[];
  total_duplicates: number;
}

interface ScanResult {
  stats: {
    entities_scanned: number;
    entities_with_duplicates: number;
    total_duplicates: number;
    potential_removals: number;
  };
  entities: EntityWithDuplicates[];
  cross_entity_duplicates?: {
    text: string;
    normalized_text: string;
    entities: Array<{
      entity_id: string;
      canonical_name: string;
      chunk_ids: string[];
    }>;
    count: number;
  }[];
}

/**
 * POST /api/canon/fact-check/scan
 * Scans for duplicate claims in the canon library
 * Query params:
 *   - scope: 'all' | 'official' | 'homebrew'
 *   - entity_id: scan specific entity (optional)
 */
router.post('/scan', async (req, res) => {
  try {
    const db = getDb();
    const entitiesCol = db.collection<CanonEntity>('canon_entities');

    const { scope = 'all', entity_id } = req.body;

    // Build query filter
    const filter: any = {};
    if (entity_id) {
      filter._id = entity_id;
    } else if (scope === 'official') {
      filter.is_official = true;
    } else if (scope === 'homebrew') {
      filter.is_official = { $ne: true };
    }

    // Fetch all entities
    const entities = await entitiesCol.find(filter).toArray();

    const entitiesWithDuplicates: EntityWithDuplicates[] = [];
    let totalDuplicates = 0;
    let potentialRemovals = 0;

    // Track cross-entity duplicates
    const textToEntities = new Map<string, Array<{ entity_id: string; canonical_name: string; chunk_id: string }>>();

    // Scan each entity for within-entity duplicates
    for (const entity of entities) {
      const claims = entity.claims || [];
      if (claims.length === 0) continue;

      // Group claims by normalized text
      const textGroups = new Map<string, Array<{ chunk_id: string; text: string; source: string }>>();

      claims.forEach((claim, index) => {
        const text = claim.text || '';
        const normalized = text.trim().toLowerCase();
        if (!normalized) return;

        const chunk_id = `${entity._id}#c${index + 1}`;

        // Track for within-entity duplicates
        if (!textGroups.has(normalized)) {
          textGroups.set(normalized, []);
        }
        textGroups.get(normalized)!.push({
          chunk_id,
          text,
          source: claim.source || 'Unknown',
        });

        // Track for cross-entity duplicates
        if (!textToEntities.has(normalized)) {
          textToEntities.set(normalized, []);
        }
        textToEntities.get(normalized)!.push({
          entity_id: entity._id,
          canonical_name: entity.canonical_name || 'Unknown',
          chunk_id,
        });
      });

      // Find duplicate groups (groups with more than 1 claim)
      const duplicateGroups: DuplicateGroup[] = [];
      for (const [normalized, group] of textGroups.entries()) {
        if (group.length > 1) {
          duplicateGroups.push({
            text: group[0].text, // Use original text from first claim
            normalized_text: normalized,
            chunk_ids: group.map(c => c.chunk_id),
            sources: Array.from(new Set(group.map(c => c.source))),
            count: group.length,
          });

          totalDuplicates += group.length - 1; // -1 because we keep one
          potentialRemovals += group.length - 1;
        }
      }

      if (duplicateGroups.length > 0) {
        entitiesWithDuplicates.push({
          entity_id: entity._id,
          canonical_name: entity.canonical_name || 'Unknown',
          type: entity.type || 'unknown',
          region: entity.region,
          is_official: entity.is_official,
          duplicate_groups: duplicateGroups,
          total_duplicates: duplicateGroups.reduce((sum, g) => sum + (g.count - 1), 0),
        });
      }
    }

    // Find cross-entity duplicates (same text on multiple entities)
    const crossEntityDuplicates = [];
    for (const [normalized, entityList] of textToEntities.entries()) {
      // Group by entity_id to get unique entities
      const entitiesWithThisText = new Map<string, { entity_id: string; canonical_name: string; chunk_ids: string[] }>();

      for (const item of entityList) {
        if (!entitiesWithThisText.has(item.entity_id)) {
          entitiesWithThisText.set(item.entity_id, {
            entity_id: item.entity_id,
            canonical_name: item.canonical_name,
            chunk_ids: [],
          });
        }
        entitiesWithThisText.get(item.entity_id)!.chunk_ids.push(item.chunk_id);
      }

      // If this text appears on multiple entities, it's a cross-entity duplicate
      if (entitiesWithThisText.size > 1) {
        crossEntityDuplicates.push({
          text: entityList[0].chunk_id, // We'll need to fetch the actual text
          normalized_text: normalized,
          entities: Array.from(entitiesWithThisText.values()),
          count: entityList.length,
        });
      }
    }

    const result: ScanResult = {
      stats: {
        entities_scanned: entities.length,
        entities_with_duplicates: entitiesWithDuplicates.length,
        total_duplicates: totalDuplicates,
        potential_removals: potentialRemovals,
      },
      entities: entitiesWithDuplicates.sort((a, b) => b.total_duplicates - a.total_duplicates),
      cross_entity_duplicates: crossEntityDuplicates.length > 0 ? crossEntityDuplicates : undefined,
    };

    res.json(result);
  } catch (error: any) {
    console.error('[Fact Check Scan] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to scan for duplicates' });
  }
});

/**
 * POST /api/canon/fact-check/backup
 * Creates a JSON backup of entities before cleanup
 * Body: { entity_ids: string[] }
 */
router.post('/backup', async (req, res) => {
  try {
    const db = getDb();
    const entitiesCol = db.collection<CanonEntity>('canon_entities');

    const { entity_ids } = req.body;

    if (!Array.isArray(entity_ids) || entity_ids.length === 0) {
      return res.status(400).json({ error: 'entity_ids array is required' });
    }

    // Fetch entities to backup
    const entities = await entitiesCol.find({ _id: { $in: entity_ids } }).toArray();

    const backup = {
      backup_date: new Date().toISOString(),
      entity_count: entities.length,
      entities,
    };

    // Save to backups directory
    const backupsDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });

    const filename = `fact-check-backup-${Date.now()}.json`;
    const filepath = path.join(backupsDir, filename);
    await fs.writeFile(filepath, JSON.stringify(backup, null, 2));

    res.json({
      success: true,
      backup_file: filename,
      filepath,
      entity_count: entities.length,
      backup_data: backup, // Also return the data for client-side download
    });
  } catch (error: any) {
    console.error('[Fact Check Backup] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to create backup' });
  }
});

/**
 * POST /api/canon/fact-check/dedupe
 * Removes duplicate claims from an entity
 * Body: {
 *   entity_id: string,
 *   deduplication_plan: {
 *     normalized_text: string,
 *     chunk_ids_to_remove: string[]
 *   }[]
 * }
 */
router.post('/dedupe', async (req, res) => {
  try {
    const db = getDb();
    const entitiesCol = db.collection<CanonEntity>('canon_entities');

    const { entity_id, deduplication_plan } = req.body;

    if (!entity_id || !Array.isArray(deduplication_plan)) {
      return res.status(400).json({ error: 'entity_id and deduplication_plan are required' });
    }

    // Fetch entity
    const entity = await entitiesCol.findOne({ _id: entity_id });
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Build set of chunk_ids to remove
    const chunkIdsToRemove = new Set<string>();
    for (const plan of deduplication_plan) {
      for (const chunk_id of plan.chunk_ids_to_remove) {
        chunkIdsToRemove.add(chunk_id);
      }
    }

    // Filter claims
    const originalClaimCount = entity.claims?.length || 0;
    const filteredClaims = (entity.claims || []).filter((claim, index) => {
      const chunk_id = `${entity_id}#c${index + 1}`;
      return !chunkIdsToRemove.has(chunk_id);
    });

    // Update entity
    await entitiesCol.updateOne(
      { _id: entity_id },
      {
        $set: {
          claims: filteredClaims,
          updated_at: new Date(),
        },
      }
    );

    // Also update chunks collection
    const chunksCol = db.collection<{ _id: string }>('canon_chunks');
    const chunkIdsArray = Array.from(chunkIdsToRemove);
    if (chunkIdsArray.length > 0) {
      await chunksCol.deleteMany({ _id: { $in: chunkIdsArray } });
    }

    res.json({
      success: true,
      entity_id,
      original_claim_count: originalClaimCount,
      new_claim_count: filteredClaims.length,
      removed_count: originalClaimCount - filteredClaims.length,
    });
  } catch (error: any) {
    console.error('[Fact Check Dedupe] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to dedupe entity' });
  }
});

/**
 * POST /api/canon/fact-check/bulk-dedupe
 * Bulk deduplication across multiple entities
 * Body: {
 *   entity_plans: Array<{
 *     entity_id: string,
 *     deduplication_plan: { normalized_text: string, chunk_ids_to_remove: string[] }[]
 *   }>
 * }
 */
router.post('/bulk-dedupe', async (req, res) => {
  try {
    const db = getDb();
    const entitiesCol = db.collection<CanonEntity>('canon_entities');

    const { entity_plans } = req.body;

    if (!Array.isArray(entity_plans) || entity_plans.length === 0) {
      return res.status(400).json({ error: 'entity_plans array is required' });
    }

    const results = [];
    let totalRemoved = 0;

    for (const plan of entity_plans) {
      const { entity_id, deduplication_plan } = plan;

      // Fetch entity
      const entity = await entitiesCol.findOne({ _id: entity_id });
      if (!entity) {
        results.push({ entity_id, error: 'Entity not found' });
        continue;
      }

      // Build set of chunk_ids to remove
      const chunkIdsToRemove = new Set<string>();
      for (const dupPlan of deduplication_plan) {
        for (const chunk_id of dupPlan.chunk_ids_to_remove) {
          chunkIdsToRemove.add(chunk_id);
        }
      }

      // Filter claims
      const originalClaimCount = entity.claims?.length || 0;
      const filteredClaims = (entity.claims || []).filter((claim, index) => {
        const chunk_id = `${entity_id}#c${index + 1}`;
        return !chunkIdsToRemove.has(chunk_id);
      });

      // Update entity
      await entitiesCol.updateOne(
        { _id: entity_id },
        {
          $set: {
            claims: filteredClaims,
            updated_at: new Date(),
          },
        }
      );

      // Also update chunks collection
      const chunksCol = db.collection<{ _id: string }>('canon_chunks');
      const chunkIdsArray = Array.from(chunkIdsToRemove);
      if (chunkIdsArray.length > 0) {
        await chunksCol.deleteMany({ _id: { $in: chunkIdsArray } });
      }

      const removedCount = originalClaimCount - filteredClaims.length;
      totalRemoved += removedCount;

      results.push({
        entity_id,
        success: true,
        original_claim_count: originalClaimCount,
        new_claim_count: filteredClaims.length,
        removed_count: removedCount,
      });
    }

    res.json({
      success: true,
      entities_processed: entity_plans.length,
      total_removed: totalRemoved,
      results,
    });
  } catch (error: any) {
    console.error('[Fact Check Bulk Dedupe] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk dedupe' });
  }
});

export default router;
