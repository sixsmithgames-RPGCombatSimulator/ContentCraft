/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, type Request, type Response } from 'express';
import { getCanonEntitiesCollection, getCanonChunksCollection } from '../config/mongo.js';
import { generateLibraryEntityId, type CanonEntity, type EntityType } from '../models/CanonEntity.js';
import { generateChunkId, type CanonChunk } from '../models/CanonChunk.js';
import { logger } from '../utils/logger.js';
import { NpcValidationError, validateNpcStrict } from '../validation/npcValidator.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const uploadRouter = Router();

// Apply auth middleware to all routes
uploadRouter.use(authMiddleware);

const ALLOWED_ENTITY_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'npc',
  'monster',
  'item',
  'spell',
  'location',
  'faction',
  'rule',
  'timeline',
]);

interface ParsedClaim {
  text: string;
  source: string;
}

interface ParsedEntityPayload {
  type: string;
  canonical_name: string;
  aliases?: string[];
  era?: string;
  region?: string;
  claims: ParsedClaim[];
  npc_details?: Record<string, unknown>;
  spell_details?: Record<string, unknown>;
  stat_block?: Record<string, unknown>;
  abilities?: Record<string, unknown>;
  equipment?: string[];
  [key: string]: unknown;
}

interface ApproveUploadRequestBody {
  entities?: ParsedEntityPayload[];
  sourceName?: string;
  projectId?: string;
}

uploadRouter.post('/approve', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthRequest;
  const { entities, sourceName = 'unknown_source' } = req.body as ApproveUploadRequestBody;

  if (!Array.isArray(entities) || entities.length === 0) {
    return res.status(400).json({ error: 'entities array is required' });
  }

  const entitiesCollection = getCanonEntitiesCollection();
  const chunksCollection = getCanonChunksCollection();

  const createdEntities: string[] = [];
  const updatedEntities: string[] = [];
  const errors: Array<{ name: string; message: string }> = [];
  let chunksCreated = 0;

  for (const entity of entities) {
    const name = entity.canonical_name?.trim();
    const type = entity.type?.trim().toLowerCase();

    if (!name || !type) {
      errors.push({ name: name ?? 'unknown', message: 'Missing required fields type or canonical_name' });
      continue;
    }

    if (!ALLOWED_ENTITY_TYPES.has(type as EntityType)) {
      errors.push({
        name,
        message: `Unsupported entity type "${type}". Allowed types: ${Array.from(ALLOWED_ENTITY_TYPES).join(', ')}`,
      });
      continue;
    }

    const entityId = generateLibraryEntityId(type as CanonEntity['type'], name);

    try {
      // Build canon entity payload
      const now = new Date();
      const canonEntity: CanonEntity = {
        _id: entityId,
        userId: authReq.userId,
        scope: 'lib',
        type: type as CanonEntity['type'],
        canonical_name: name,
        aliases: entity.aliases?.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0) ?? [],
        era: entity.era,
        region: entity.region,
        relationships: [],
        claims: (entity.claims ?? []).map((claim) => ({
          text: claim.text,
          source: claim.source || sourceName,
        })),
        npc_details: entity.npc_details as unknown as CanonEntity['npc_details'],
        spell_details: entity.spell_details as unknown as CanonEntity['spell_details'],
        project_id: undefined,
        is_official: true,
        tags: Array.isArray(entity.tags)
          ? entity.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          : undefined,
        source: sourceName,
        version: '1.0.0',
        created_at: now,
        updated_at: now,
      };

      const existing = await entitiesCollection.findOne({ _id: entityId, userId: authReq.userId });
      if (existing) {
        await entitiesCollection.updateOne(
          { _id: entityId, userId: authReq.userId },
          { $set: { ...canonEntity, created_at: existing.created_at } }
        );
        updatedEntities.push(entityId);
      } else {
        await entitiesCollection.insertOne(canonEntity);
        createdEntities.push(entityId);
      }

      // Wipe existing chunks for consistency
      await chunksCollection.deleteMany({ entity_id: entityId, userId: authReq.userId });

      // Create chunks from claims
      const claims = canonEntity.claims ?? [];
      let chunkIndex = 0;

      for (const claim of claims) {
        chunkIndex += 1;
        const chunkId = generateChunkId(entityId, chunkIndex);
        const chunk: CanonChunk = {
          _id: chunkId,
          userId: authReq.userId,
          entity_id: entityId,
          text: claim.text,
          metadata: {
            source: claim.source,
            entity_name: canonEntity.canonical_name,
            entity_type: canonEntity.type,
            era: canonEntity.era,
            region: canonEntity.region,
            tags: canonEntity.tags,
          },
          created_at: new Date(),
          updated_at: new Date(),
        };

        await chunksCollection.insertOne(chunk);
        chunksCreated += 1;
      }

      // Optional: Validate NPC details against schema (non-blocking)
      if (canonEntity.type === 'npc' && canonEntity.npc_details) {
        try {
          validateNpcStrict(canonEntity.npc_details);
          logger.info(`NPC ${name} passed validation`);
        } catch (validationError) {
          // Log validation warning but don't fail the upload
          if (validationError instanceof NpcValidationError) {
            logger.warn(`NPC ${name} validation warning: ${validationError.details}`);
          } else {
            logger.warn(`NPC ${name} validation warning:`, validationError);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to process entity ${name}:`, error);
      let message = 'Failed to save entity';
      if (error instanceof NpcValidationError) {
        message = error.details;
      } else if (error instanceof Error) {
        message = error.message;
      }
      errors.push({ name, message });
    }
  }

  const status = errors.length === entities.length ? 400 : errors.length > 0 ? 207 : 200;

  res.status(status).json({
    message: 'Upload approval processed',
    entitiesCreated: createdEntities.length,
    entitiesUpdated: updatedEntities.length,
    chunksCreated,
    errors,
  });
});

/**
 * POST /api/upload/text
 * Auto-parse text with AI (requires OpenAI API)
 * This endpoint is disabled - use manual parse workflow instead
 */
uploadRouter.post('/text', async (_req: Request, res: Response) => {
  return res.status(501).json({
    error: 'Auto-parse with AI requires OpenAI API configuration',
    message: 'This feature requires an OpenAI API key. Please use the "Parse Document with AI (Copy/Paste)" option instead, which lets you use any AI service without API keys.',
    alternative: 'Use the Manual Parse workflow: paste your text, get a prompt to copy to ChatGPT/Claude/etc., then paste the response back.',
  });
});

/**
 * POST /api/upload/document
 * Auto-parse document with AI (requires OpenAI API)
 * This endpoint is disabled - use manual parse workflow instead
 */
uploadRouter.post('/document', async (_req: Request, res: Response) => {
  return res.status(501).json({
    error: 'Auto-parse with AI requires OpenAI API configuration',
    message: 'This feature requires an OpenAI API key. Please use the "Parse Document with AI (Copy/Paste)" option instead, which lets you use any AI service without API keys.',
    alternative: 'Use the Manual Parse workflow: paste your document text, get a prompt to copy to ChatGPT/Claude/etc., then paste the response back.',
  });
});

// Fallback handler for other upload routes still under refactor
uploadRouter.use((_req, res) => {
  res.status(503).json({ error: 'Upload route not implemented.' });
});
