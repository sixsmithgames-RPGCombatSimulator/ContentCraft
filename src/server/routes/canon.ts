/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, Request, Response } from 'express';
import {
  getCanonEntitiesCollection,
  getCanonChunksCollection,
  getProjectLibraryLinksCollection,
  getLibraryCollectionsCollection,
} from '../config/mongo.js';
import { CanonEntity, generateEntityId } from '../models/CanonEntity.js';
import { CanonChunk, generateChunkId } from '../models/CanonChunk.js';
import { ProjectLibraryLink, generateLinkId } from '../models/ProjectLibraryLink.js';
import { generateEmbedding, findTopKSimilar } from '../utils/embeddings.js';
import { logger } from '../utils/logger.js';
import { LibraryCollection, generateCollectionId } from '../models/LibraryCollection.js';

export const canonRouter = Router();

// ============================================================================
// CANON ENTITY ROUTES - Complete CRUD operations for canon entities
// ============================================================================

/**
 * GET /api/canon/library
 * Get all library entities (scope='lib') with optional filtering
 * Query params: q (search), type, tags, era, region, limit, offset
 */
canonRouter.get('/library', async (req: Request, res: Response) => {
  try {
    const {
      q,
      type,
      tags,
      era,
      region,
      source,
      sort,
      exclude_collection_ids,
      limit = '1000',
      offset = '0',
    } = req.query;

    const collection = getCanonEntitiesCollection();
    const filter: any = { scope: 'lib' };

    const parseCsv = (value: unknown): string[] => {
      if (typeof value !== 'string') return [];
      return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    };

    const sortValue = typeof sort === 'string' ? sort.trim().toLowerCase() : '';
    const sortSpec: Record<string, 1 | -1> = {};
    if (sortValue === 'recent' || sortValue === 'recently_added' || sortValue === 'newest') {
      sortSpec.created_at = -1;
    }
    sortSpec.canonical_name = 1;

    // Add search filter - prioritize tags, then names, then aliases
    if (q && typeof q === 'string') {
      filter.$or = [
        { tags: { $regex: q, $options: 'i' } },              // Search tags (highest priority)
        { canonical_name: { $regex: q, $options: 'i' } },    // Search canonical name
        { aliases: { $regex: q, $options: 'i' } },           // Search aliases
        { source: { $regex: q, $options: 'i' } },            // Search source
        { 'spell_details.source': { $regex: q, $options: 'i' } }, // Search nested spell source
      ];
    }

    // Add source filter (independent of q)
    if (source && typeof source === 'string' && source.trim().length > 0) {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { source: { $regex: source.trim(), $options: 'i' } },
            { 'spell_details.source': { $regex: source.trim(), $options: 'i' } },
          ],
        },
      ];
    }

    const excludeCollectionIds = parseCsv(exclude_collection_ids);
    if (excludeCollectionIds.length > 0) {
      const collectionsCollection = getLibraryCollectionsCollection();
      const collectionsToExclude = await collectionsCollection
        .find({ _id: { $in: excludeCollectionIds } })
        .project({ entity_ids: 1 })
        .toArray();

      const excludedEntityIds = new Set<string>();
      for (const coll of collectionsToExclude) {
        const ids = Array.isArray((coll as any)?.entity_ids) ? (coll as any).entity_ids : [];
        for (const id of ids) {
          if (typeof id === 'string' && id.trim().length > 0) excludedEntityIds.add(id);
        }
      }

      if (excludedEntityIds.size > 0) {
        filter._id = { $nin: Array.from(excludedEntityIds) };
      }
    }

    // Add type filter
    if (type && typeof type === 'string') {
      filter.type = type;
    }

    // Add tags filter
    if (tags && typeof tags === 'string') {
      filter.tags = tags;
    }

    // Add era filter
    if (era && typeof era === 'string') {
      filter.era = era;
    }

    // Add region filter
    if (region && typeof region === 'string') {
      filter.region = region;
    }

    const entities = await collection
      .find(filter)
      .sort(sortSpec)
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string))
      .toArray();

    res.json(entities);
  } catch (error) {
    logger.error('Error fetching library entities:', error);
    res.status(500).json({ error: 'Failed to fetch library entities' });
  }
});

/**
 * GET /api/canon/entities
 * Search and filter entities across all scopes
 * Query params: scope, type, tags, era, region, q, project_id, limit, offset
 */
canonRouter.get('/entities', async (req: Request, res: Response) => {
  try {
    const { scope, type, tags, era, region, q, project_id, limit = '1000', offset = '0' } = req.query;

    const collection = getCanonEntitiesCollection();
    const filter: any = {};

    // Add scope filter
    if (scope && typeof scope === 'string') {
      filter.scope = scope;
    }

    // Add project filter
    if (project_id && typeof project_id === 'string') {
      filter.scope = `proj_${project_id}`;
    }

    // Add type filter
    if (type && typeof type === 'string') {
      filter.type = type;
    }

    // Add tags filter
    if (tags && typeof tags === 'string') {
      filter.tags = tags;
    }

    // Add era filter
    if (era && typeof era === 'string') {
      filter.era = era;
    }

    // Add region filter
    if (region && typeof region === 'string') {
      filter.region = region;
    }

    // Add search filter - prioritize tags, then names, then aliases
    if (q && typeof q === 'string') {
      filter.$or = [
        { tags: { $regex: q, $options: 'i' } },              // Search tags (highest priority)
        { canonical_name: { $regex: q, $options: 'i' } },    // Search canonical name
        { aliases: { $regex: q, $options: 'i' } },           // Search aliases
      ];
    }

    const entities = await collection
      .find(filter)
      .sort({ canonical_name: 1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string))
      .toArray();

    res.json(entities);
  } catch (error) {
    logger.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

/**
 * GET /api/canon/entities/:id
 * Get a single entity by ID with all its details
 */
canonRouter.get('/entities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collection = getCanonEntitiesCollection();

    const entity = await collection.findOne({ _id: id });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(entity);
  } catch (error) {
    logger.error('Error fetching entity:', error);
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
});

/**
 * POST /api/canon/entities
 * Create a new canon entity
 * Body: CanonEntity (without _id, it will be generated)
 */
canonRouter.post('/entities', async (req: Request, res: Response) => {
  try {
    const entityData = req.body;

    // Validate required fields
    if (!entityData.canonical_name || !entityData.type || !entityData.scope) {
      return res.status(400).json({ error: 'Missing required fields: canonical_name, type, scope' });
    }

    // Generate entity ID
    const entityId = generateEntityId(entityData.type, entityData.canonical_name, entityData.scope);

    const entity: CanonEntity = {
      _id: entityId,
      scope: entityData.scope,
      type: entityData.type,
      canonical_name: entityData.canonical_name,
      aliases: entityData.aliases || [],
      era: entityData.era,
      region: entityData.region,
      relationships: entityData.relationships || [],
      claims: entityData.claims || [],
      npc_details: entityData.npc_details,
      spell_details: entityData.spell_details,
      project_id: entityData.project_id,
      is_official: entityData.is_official || false,
      tags: entityData.tags || [],
      source: entityData.source,
      version: entityData.version || '1.0.0',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const collection = getCanonEntitiesCollection();

    // Check if entity already exists
    const existing = await collection.findOne({ _id: entityId });
    if (existing) {
      return res.status(409).json({ error: 'Entity with this ID already exists', entityId });
    }

    await collection.insertOne(entity);

    logger.info(`Created canon entity: ${entityId}`);
    res.status(201).json(entity);
  } catch (error) {
    logger.error('Error creating entity:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

/**
 * PUT /api/canon/entities/:id
 * Update an existing canon entity
 */
canonRouter.put('/entities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const collection = getCanonEntitiesCollection();

    // Don't allow changing _id, scope, or created_at
    delete updates._id;
    delete updates.scope;
    delete updates.created_at;

    // Update the updated_at timestamp
    updates.updated_at = new Date();

    const result = await collection.updateOne(
      { _id: id },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const updatedEntity = await collection.findOne({ _id: id });

    logger.info(`Updated canon entity: ${id}`);
    res.json(updatedEntity);
  } catch (error) {
    logger.error('Error updating entity:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

/**
 * DELETE /api/canon/entities/:id
 * Delete a canon entity and all its chunks
 */
canonRouter.delete('/entities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const entitiesCollection = getCanonEntitiesCollection();
    const chunksCollection = getCanonChunksCollection();

    // Delete the entity
    const result = await entitiesCollection.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Delete all chunks for this entity
    await chunksCollection.deleteMany({ entity_id: id });

    logger.info(`Deleted canon entity and chunks: ${id}`);
    res.json({ success: true, deletedEntityId: id });
  } catch (error) {
    logger.error('Error deleting entity:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});

// ============================================================================
// CANON CHUNK ROUTES - Managing text chunks and embeddings
// ============================================================================

/**
 * GET /api/canon/chunks
 * Get chunks for an entity
 * Query params: entity_id (required), limit, offset
 */
canonRouter.get('/chunks', async (req: Request, res: Response) => {
  try {
    const { entity_id, limit = '1000', offset = '0' } = req.query;

    if (!entity_id || typeof entity_id !== 'string') {
      return res.status(400).json({ error: 'entity_id is required' });
    }

    const collection = getCanonChunksCollection();

    const chunks = await collection
      .find({ entity_id })
      .sort({ _id: 1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string))
      .toArray();

    res.json(chunks);
  } catch (error) {
    logger.error('Error fetching chunks:', error);
    res.status(500).json({ error: 'Failed to fetch chunks' });
  }
});

/**
 * POST /api/canon/chunks
 * Create chunks for an entity (with optional embeddings)
 * Body: { entity_id, chunks: [{ text, metadata }], generate_embeddings?: boolean }
 */
canonRouter.post('/chunks', async (req: Request, res: Response) => {
  try {
    const { entity_id, chunks, generate_embeddings = false } = req.body;

    if (!entity_id || !chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ error: 'entity_id and chunks array are required' });
    }

    const collection = getCanonChunksCollection();

    // Get existing chunk count for this entity
    const existingCount = await collection.countDocuments({ entity_id });

    const canonChunks: CanonChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = existingCount + i + 1;
      const chunkId = generateChunkId(entity_id, chunkNumber);

      let embedding: number[] | undefined;

      // Generate embedding if requested
      if (generate_embeddings && chunk.text) {
        try {
          embedding = await generateEmbedding(chunk.text);
        } catch (error) {
          logger.warn(`Failed to generate embedding for chunk ${chunkId}:`, error);
          // Continue without embedding
        }
      }

      const canonChunk: CanonChunk = {
        _id: chunkId,
        entity_id,
        text: chunk.text,
        metadata: chunk.metadata || {},
        embedding,
        created_at: new Date(),
        updated_at: new Date(),
      };

      canonChunks.push(canonChunk);
    }

    if (canonChunks.length > 0) {
      await collection.insertMany(canonChunks);
    }

    logger.info(`Created ${canonChunks.length} chunks for entity ${entity_id}`);
    res.status(201).json({ created: canonChunks.length, chunks: canonChunks });
  } catch (error) {
    logger.error('Error creating chunks:', error);
    res.status(500).json({ error: 'Failed to create chunks' });
  }
});

/**
 * PUT /api/canon/chunks/:id
 * Update a chunk
 */
canonRouter.put('/chunks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const collection = getCanonChunksCollection();

    // Don't allow changing _id or entity_id
    delete updates._id;
    delete updates.entity_id;
    delete updates.created_at;

    // Update the updated_at timestamp
    updates.updated_at = new Date();

    // Regenerate embedding if text changed and requested
    if (updates.text && updates.regenerate_embedding) {
      try {
        updates.embedding = await generateEmbedding(updates.text);
      } catch (error) {
        logger.warn(`Failed to regenerate embedding for chunk ${id}:`, error);
      }
    }
    delete updates.regenerate_embedding;

    const result = await collection.updateOne(
      { _id: id },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    const updatedChunk = await collection.findOne({ _id: id });

    logger.info(`Updated chunk: ${id}`);
    res.json(updatedChunk);
  } catch (error) {
    logger.error('Error updating chunk:', error);
    res.status(500).json({ error: 'Failed to update chunk' });
  }
});

/**
 * DELETE /api/canon/chunks/:id
 * Delete a chunk
 */
canonRouter.delete('/chunks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const collection = getCanonChunksCollection();

    const result = await collection.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    logger.info(`Deleted chunk: ${id}`);
    res.json({ success: true, deletedChunkId: id });
  } catch (error) {
    logger.error('Error deleting chunk:', error);
    res.status(500).json({ error: 'Failed to delete chunk' });
  }
});

// ============================================================================
// PROJECT LIBRARY LINK ROUTES - Linking library entities to projects
// ============================================================================

/**
 * GET /api/canon/projects/:projectId/links
 * Get all library links for a project
 */
canonRouter.get('/projects/:projectId/links', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const collection = getProjectLibraryLinksCollection();

    const links = await collection
      .find({ project_id: projectId })
      .sort({ added_at: -1 })
      .toArray();

    res.json(links);
  } catch (error) {
    logger.error('Error fetching project links:', error);
    res.status(500).json({ error: 'Failed to fetch project links' });
  }
});

/**
 * POST /api/canon/projects/:projectId/links
 * Link library entities to a project
 * Body: { library_entity_ids: string[] }
 */
canonRouter.post('/projects/:projectId/links', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { library_entity_ids } = req.body;

    if (!library_entity_ids || !Array.isArray(library_entity_ids)) {
      return res.status(400).json({ error: 'library_entity_ids array is required' });
    }

    const collection = getProjectLibraryLinksCollection();

    const links: ProjectLibraryLink[] = [];
    let alreadyLinked = 0;

    for (const entityId of library_entity_ids) {
      const linkId = generateLinkId(projectId, entityId);

      // Check if already linked
      const existing = await collection.findOne({ _id: linkId });
      if (existing) {
        alreadyLinked++;
        continue;
      }

      const link: ProjectLibraryLink = {
        _id: linkId,
        project_id: projectId,
        library_entity_id: entityId,
        added_at: new Date(),
      };

      links.push(link);
    }

    if (links.length > 0) {
      await collection.insertMany(links);
    }

    logger.info(`Linked ${links.length} entities to project ${projectId}`);
    res.status(201).json({
      linked: links.length,
      already_linked: alreadyLinked,
      total_requested: library_entity_ids.length
    });
  } catch (error) {
    logger.error('Error creating project links:', error);
    res.status(500).json({ error: 'Failed to create project links' });
  }
});

/**
 * DELETE /api/canon/projects/:projectId/links/:linkId
 * Remove a library link from a project
 */
canonRouter.delete('/projects/:projectId/links/:linkId', async (req: Request, res: Response) => {
  try {
    const { linkId } = req.params;

    const collection = getProjectLibraryLinksCollection();

    const result = await collection.deleteOne({ _id: linkId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    logger.info(`Deleted project link: ${linkId}`);
    res.json({ success: true, deletedLinkId: linkId });
  } catch (error) {
    logger.error('Error deleting project link:', error);
    res.status(500).json({ error: 'Failed to delete project link' });
  }
});

/**
 * GET /api/canon/projects/:projectId/entities
 * Get all linked library entities for a project (with full entity data)
 * This resolves both direct entity links AND collection links
 */
canonRouter.get('/projects/:projectId/entities', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, tags } = req.query;

    const linksCollection = getProjectLibraryLinksCollection();
    const entitiesCollection = getCanonEntitiesCollection();
    const collectionsCollection = getLibraryCollectionsCollection();

    // Get all links for this project
    const links = await linksCollection
      .find({ project_id: projectId })
      .toArray();

    if (links.length === 0) {
      return res.json([]);
    }

    // Separate entity IDs and potential collection IDs
    const linkedIds = links.map(link => link.library_entity_id);
    const entityIdsSet = new Set<string>();

    // Check which IDs are collections vs entities
    for (const id of linkedIds) {
      // Check if it's a collection (collections have IDs like "coll_xxx")
      if (id.startsWith('coll_')) {
        const collection = await collectionsCollection.findOne({ _id: id });
        if (collection && collection.entity_ids) {
          // Add all entity IDs from the collection
          collection.entity_ids.forEach(eid => entityIdsSet.add(eid));
        }
      } else {
        // It's a direct entity link
        entityIdsSet.add(id);
      }
    }

    const entityIds = Array.from(entityIdsSet);

    if (entityIds.length === 0) {
      return res.json([]);
    }

    // Build filter for entities
    const filter: any = { _id: { $in: entityIds } };

    if (type && typeof type === 'string') {
      filter.type = type;
    }

    if (tags && typeof tags === 'string') {
      filter.tags = tags;
    }

    // Fetch entities
    const entities = await entitiesCollection
      .find(filter)
      .sort({ canonical_name: 1 })
      .toArray();

    res.json(entities);
  } catch (error) {
    logger.error('Error fetching project entities:', error);
    res.status(500).json({ error: 'Failed to fetch project entities' });
  }
});

// ============================================================================
// SEMANTIC SEARCH & RETRIEVAL ROUTES - Advanced querying with embeddings
// ============================================================================

/**
 * POST /api/canon/search
 * Semantic search across canon chunks
 * Body: { query, scope?, type?, era?, region?, limit?, min_similarity? }
 */
canonRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, scope, type, era, region, limit = 10, min_similarity = 0.7 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query string is required' });
    }

    // Generate query embedding
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      logger.error('Embeddings are disabled, falling back to text search');
      // Fallback to text search
      return textSearchFallback(req, res);
    }

    const chunksCollection = getCanonChunksCollection();
    const entitiesCollection = getCanonEntitiesCollection();

    // Build entity filter
    const entityFilter: any = {};
    if (scope) entityFilter.scope = scope;
    if (type) entityFilter.type = type;
    if (era) entityFilter.era = era;
    if (region) entityFilter.region = region;

    // Get matching entities
    const entities = await entitiesCollection.find(entityFilter).toArray();
    const entityIds = entities.map(e => e._id);

    if (entityIds.length === 0) {
      return res.json([]);
    }

    // Get all chunks for matching entities that have embeddings
    const chunks = await chunksCollection
      .find({
        entity_id: { $in: entityIds },
        embedding: { $exists: true },
      })
      .toArray();

    const chunksWithEmbedding = chunks.filter((chunk): chunk is CanonChunk & { embedding: number[] } =>
      Array.isArray(chunk.embedding),
    );

    // Find top-k similar chunks
    const results = findTopKSimilar(queryEmbedding, chunksWithEmbedding, limit)
      .filter(result => result.similarity >= min_similarity)
      .map(result => ({
        chunk_id: result.chunk._id,
        entity_id: result.chunk.entity_id,
        text: result.chunk.text,
        metadata: result.chunk.metadata,
        similarity: result.similarity,
      }));

    res.json(results);
  } catch (error) {
    logger.error('Error performing semantic search:', error);
    res.status(500).json({ error: 'Failed to perform semantic search' });
  }
});

/**
 * Fallback text search when embeddings are disabled
 */
async function textSearchFallback(req: Request, res: Response) {
  const { query, scope, type, era, region, limit = 10 } = req.body;

  const chunksCollection = getCanonChunksCollection();
  const entitiesCollection = getCanonEntitiesCollection();

  // Build entity filter
  const entityFilter: any = {};
  if (scope) entityFilter.scope = scope;
  if (type) entityFilter.type = type;
  if (era) entityFilter.era = era;
  if (region) entityFilter.region = region;

  // Get matching entities
  const entities = await entitiesCollection.find(entityFilter).toArray();
  const entityIds = entities.map(e => e._id);

  if (entityIds.length === 0) {
    return res.json([]);
  }

  // Text search in chunks
  const chunks = await chunksCollection
    .find({
      entity_id: { $in: entityIds },
      text: { $regex: query, $options: 'i' }
    })
    .limit(limit)
    .toArray();

  const results = chunks.map(chunk => ({
    chunk_id: chunk._id,
    entity_id: chunk.entity_id,
    text: chunk.text,
    metadata: chunk.metadata,
    similarity: 0, // No similarity score for text search
  }));

  res.json(results);
}

/**
 * POST /api/canon/search/similar
 * Find entities similar to a given entity
 * Body: { entity_id, limit?, min_similarity? }
 */
canonRouter.post('/search/similar', async (req: Request, res: Response) => {
  try {
    const { entity_id, limit = 5, min_similarity = 0.7 } = req.body;

    if (!entity_id || typeof entity_id !== 'string') {
      return res.status(400).json({ error: 'entity_id is required' });
    }

    const chunksCollection = getCanonChunksCollection();

    // Get chunks for the source entity
    const sourceChunks = await chunksCollection
      .find({
        entity_id,
        embedding: { $exists: true, $ne: null }
      })
      .toArray();

    if (sourceChunks.length === 0) {
      return res.json([]);
    }

    // Calculate average embedding for source entity
    const avgEmbedding = calculateAverageEmbedding(sourceChunks.map(c => c.embedding!));

    // Get all other chunks with embeddings
    const allChunks = await chunksCollection
      .find({
        entity_id: { $ne: entity_id },
        embedding: { $exists: true },
      })
      .toArray();

    // Find similar chunks
    const allChunksWithEmbedding = allChunks.filter((chunk): chunk is CanonChunk & { embedding: number[] } =>
      Array.isArray(chunk.embedding),
    );

    const results = findTopKSimilar(avgEmbedding, allChunksWithEmbedding, limit * 3) // Get more to group by entity
      .filter(result => result.similarity >= min_similarity);

    // Group by entity and get top entities
    const entityScores = new Map<string, { score: number; count: number }>();

    for (const result of results) {
      const entityId = result.chunk.entity_id;
      const current = entityScores.get(entityId) || { score: 0, count: 0 };
      current.score += result.similarity;
      current.count += 1;
      entityScores.set(entityId, current);
    }

    // Calculate average score per entity and sort
    const sortedEntities = Array.from(entityScores.entries())
      .map(([entityId, data]) => ({
        entity_id: entityId,
        similarity: data.score / data.count,
        matching_chunks: data.count,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    res.json(sortedEntities);
  } catch (error) {
    logger.error('Error finding similar entities:', error);
    res.status(500).json({ error: 'Failed to find similar entities' });
  }
});

/**
 * GET /api/canon/facts
 * Get facts/claims related to a query
 * Query params: q (search), entity_id, type, era, region, limit
 */
canonRouter.get('/facts', async (req: Request, res: Response) => {
  try {
    const { q, entity_id, type, era, region, limit = '20' } = req.query;

    const collection = getCanonEntitiesCollection();

    // Build filter
    const filter: any = {
      claims: { $exists: true, $ne: [] }
    };

    if (entity_id && typeof entity_id === 'string') {
      filter._id = entity_id;
    }

    if (type && typeof type === 'string') {
      filter.type = type;
    }

    if (era && typeof era === 'string') {
      filter.era = era;
    }

    if (region && typeof region === 'string') {
      filter.region = region;
    }

    if (q && typeof q === 'string') {
      filter['claims.text'] = { $regex: q, $options: 'i' };
    }

    const entities = await collection
      .find(filter)
      .limit(parseInt(limit as string))
      .toArray();

    // Extract and flatten all claims
    const facts = entities.flatMap(entity =>
      entity.claims.map(claim => ({
        entity_id: entity._id,
        entity_name: entity.canonical_name,
        entity_type: entity.type,
        claim: claim.text,
        source: claim.source,
        era: entity.era,
        region: entity.region,
      }))
    );

    res.json(facts);
  } catch (error) {
    logger.error('Error fetching facts:', error);
    res.status(500).json({ error: 'Failed to fetch facts' });
  }
});

// ============================================================================
// BATCH OPERATIONS - For efficient bulk processing
// ============================================================================

/**
 * POST /api/canon/entities/batch
 * Create multiple entities in one request
 * Body: { entities: CanonEntity[] }
 */
canonRouter.post('/entities/batch', async (req: Request, res: Response) => {
  try {
    const { entities } = req.body;

    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    const collection = getCanonEntitiesCollection();
    const createdEntities: CanonEntity[] = [];
    const errors: Array<{ entity: any; error: string }> = [];

    for (const entityData of entities) {
      try {
        // Validate required fields
        if (!entityData.canonical_name || !entityData.type || !entityData.scope) {
          errors.push({ entity: entityData, error: 'Missing required fields' });
          continue;
        }

        // Generate entity ID
        const entityId = generateEntityId(entityData.type, entityData.canonical_name, entityData.scope);

        // Check if exists
        const existing = await collection.findOne({ _id: entityId });
        if (existing) {
          errors.push({ entity: entityData, error: 'Entity already exists' });
          continue;
        }

        const entity: CanonEntity = {
          _id: entityId,
          scope: entityData.scope,
          type: entityData.type,
          canonical_name: entityData.canonical_name,
          aliases: entityData.aliases || [],
          era: entityData.era,
          region: entityData.region,
          relationships: entityData.relationships || [],
          claims: entityData.claims || [],
          npc_details: entityData.npc_details,
          spell_details: entityData.spell_details,
          project_id: entityData.project_id,
          is_official: entityData.is_official || false,
          tags: entityData.tags || [],
          source: entityData.source,
          version: entityData.version || '1.0.0',
          created_at: new Date(),
          updated_at: new Date(),
        };

        createdEntities.push(entity);
      } catch (error) {
        errors.push({ entity: entityData, error: String(error) });
      }
    }

    // Insert all valid entities
    if (createdEntities.length > 0) {
      await collection.insertMany(createdEntities);
    }

    logger.info(`Batch created ${createdEntities.length} entities with ${errors.length} errors`);
    res.status(201).json({
      created: createdEntities.length,
      errors: errors.length,
      entities: createdEntities,
      failed: errors,
    });
  } catch (error) {
    logger.error('Error in batch entity creation:', error);
    res.status(500).json({ error: 'Failed to batch create entities' });
  }
});

// =========================================================================
// COLLECTION ROUTES - Organize entities into reusable bundles
// =========================================================================

const sanitizeTags = (tags: unknown): string[] | undefined => {
  if (!tags) return undefined;
  if (!Array.isArray(tags)) return undefined;
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
};

const extractEntityIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
};

canonRouter.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collection = getLibraryCollectionsCollection();
    const collections = await collection.find({}).sort({ name: 1 }).toArray();
    res.json(collections);
  } catch (error) {
    logger.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

canonRouter.post('/collections', async (req: Request, res: Response) => {
  try {
    const { name, description, category, tags, is_official = false } = req.body ?? {};

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    if (typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Collection description is required' });
    }

    const normalizedTags = sanitizeTags(tags);
    const collectionId = generateCollectionId(name);
    const now = new Date();

    const collection = getLibraryCollectionsCollection();
    const existing = await collection.findOne({ _id: collectionId });
    if (existing) {
      return res.status(409).json({ error: 'Collection with this name already exists', collection_id: collectionId });
    }

    let entityIds: string[] = [];
    if (normalizedTags && normalizedTags.length > 0) {
      const entitiesCollection = getCanonEntitiesCollection();
      const tagFilter = normalizedTags.length === 1 ? normalizedTags[0] : { $in: normalizedTags };
      const taggedEntities = await entitiesCollection
        .find({ scope: 'lib', tags: tagFilter })
        .project({ _id: 1 })
        .toArray();
      entityIds = taggedEntities.map((doc) => doc._id);
    }

    const newCollection: LibraryCollection = {
      _id: collectionId,
      name: name.trim(),
      description: description.trim(),
      category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : undefined,
      tags: normalizedTags,
      entity_ids: entityIds,
      is_official: Boolean(is_official),
      created_at: now,
      updated_at: now,
    };

    await collection.insertOne(newCollection);
    logger.info(`Created library collection ${collectionId} with ${entityIds.length} entities`);

    res.status(201).json({ ...newCollection, entity_count: entityIds.length });
  } catch (error) {
    logger.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

canonRouter.put('/collections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entityIds = extractEntityIds(req.body?.entity_ids);

    const collection = getLibraryCollectionsCollection();
    const existing = await collection.findOne({ _id: id });

    if (!existing) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const result = await collection.updateOne(
      { _id: id },
      {
        $set: {
          entity_ids: entityIds,
          updated_at: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const updated = await collection.findOne({ _id: id });
    res.json(updated);
  } catch (error) {
    logger.error('Error updating collection:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

canonRouter.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collection = getLibraryCollectionsCollection();

    const result = await collection.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    logger.info(`Deleted library collection ${id}`);
    res.json({ success: true, deletedCollectionId: id });
  } catch (error) {
    logger.error('Error deleting collection:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Calculate average embedding from multiple embeddings
 */
function calculateAverageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  const dimension = embeddings[0].length;
  const avg = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      avg[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimension; i++) {
    avg[i] /= embeddings.length;
  }

  return avg;
}
