/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { ContentBlockModel } from '../models/index.js';
import { ContentBlockSchema, PaginationSchema } from '../../shared/validators/index.js';
import { APIResponse, PaginatedResponse } from '../../shared/types/index.js';
import { getDb } from '../config/mongo.js';
import { mapGeneratedContentToContentBlock } from '../services/generatedContentMapper.js';
import { mapAndValidateNpc } from '../services/npcSchemaMapper.js';
import { validateMonsterStrict, isMonsterContent } from '../validation/monsterValidator.js';
import type { GeneratedContentDocument } from '../models/GeneratedContent.js';

export const contentRouter = Router();

contentRouter.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const pagination = PaginationSchema.parse(req.query);
    const { blocks, total } = await ContentBlockModel.findByProjectId(projectId, pagination);

    const response: PaginatedResponse<typeof blocks[0]> = {
      success: true,
      data: blocks,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch content blocks',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

contentRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const block = await ContentBlockModel.findById(id);

    if (!block) {
      const response: APIResponse = {
        success: false,
        error: 'Content block not found'
      };
      return res.status(404).json(response);
    }

    const response: APIResponse<typeof block> = {
      success: true,
      data: block
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch content block',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

contentRouter.get('/:id/children', async (req, res) => {
  try {
    const { id } = req.params;
    const children = await ContentBlockModel.findByParentId(id);

    const response: APIResponse<typeof children> = {
      success: true,
      data: children
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch child blocks',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

contentRouter.post('/', async (req, res) => {
  try {
    const payload = ContentBlockSchema.parse(req.body);
    const block = await ContentBlockModel.create({
      projectId: payload.projectId,
      parentId: payload.parentId,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      order: payload.order ?? 0,
      metadata: payload.metadata ?? {},
    });

    const response: APIResponse<typeof block> = {
      success: true,
      data: block,
      message: 'Content block created successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to create content block',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(400).json(response);
  }
});

contentRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = ContentBlockSchema.partial().parse(req.body);
    const existing = await ContentBlockModel.findById(id);

    if (!existing) {
      const response: APIResponse = {
        success: false,
        error: `Content block not found (ID: ${id}). The content may have been deleted or moved. Please refresh the page and try again.`
      };
      return res.status(404).json(response);
    }

    const existingMetadata = (existing.metadata ?? {}) as Record<string, any>;
    const incomingMetadata = (validatedData.metadata ?? {}) as Record<string, any>;

    const existingIsWriting =
      (typeof existingMetadata.domain === 'string' && existingMetadata.domain.toLowerCase() === 'writing') ||
      (typeof existingMetadata.structuredContent?.type === 'string' && existingMetadata.structuredContent.type === 'writing');

    const hasStructuredUpdate =
      incomingMetadata.structuredContent &&
      typeof incomingMetadata.structuredContent === 'object' &&
      !Array.isArray(incomingMetadata.structuredContent);

    const hasFullGeneratedUpdate =
      incomingMetadata.full_generated_content &&
      typeof incomingMetadata.full_generated_content === 'object' &&
      !Array.isArray(incomingMetadata.full_generated_content);

    let updatePayload = validatedData;

    // Canonical structured edits: keep raw JSON in metadata and regenerate preview content.
    if (!existingIsWriting && (hasStructuredUpdate || hasFullGeneratedUpdate)) {
      const structured = hasStructuredUpdate ? incomingMetadata.structuredContent : undefined;
      const generatedContent = hasFullGeneratedUpdate ? incomingMetadata.full_generated_content : structured?.data;

      if (generatedContent && typeof generatedContent === 'object') {
        const deliverableHint = typeof existingMetadata.deliverable === 'string' ? existingMetadata.deliverable.toLowerCase() : '';

        // CRITICAL: Check for Monster content FIRST before NPC validation.
        const looksLikeMonster =
          deliverableHint.includes('monster') ||
          deliverableHint.includes('creature') ||
          isMonsterContent(generatedContent);

        if (looksLikeMonster) {
          const validation = validateMonsterStrict(generatedContent);
          if (!validation.valid) {
            const errorCount = validation.errors?.length || 0;
            return res.status(400).json({
              success: false,
              error: 'Monster Validation Failed',
              details: {
                errorCount,
                errors: validation.details?.split('\n\n') || ['Unknown validation error'],
                rawErrors: validation.errors,
              },
              message: `The monster data has ${errorCount} validation error${errorCount !== 1 ? 's' : ''}. Review the errors and correct the data before saving.`,
            });
          }
        } else {
          const looksLikeNpc =
            deliverableHint.includes('npc') ||
            deliverableHint.includes('character') ||
            existing.type === 'character';

          if (looksLikeNpc && generatedContent && typeof generatedContent === 'object') {
            const validation = mapAndValidateNpc(generatedContent as Record<string, unknown>);

            if (!validation.success) {
              return res.status(400).json({
                success: false,
                error: 'NPC validation failed',
                details: {
                  errors: validation.rawErrors || validation.errors,
                  errorSummary: validation.errors,
                  warnings: validation.warnings,
                  validationErrors: validation.validationErrors,
                  schemaVersion: validation.schemaVersion,
                },
                message: 'The edited NPC does not conform to the schema. Please check the field names and structure.',
              });
            }
          }
        }

        const mapped = mapGeneratedContentToContentBlock({
          contentType: existing.type,
          deliverable: existingMetadata.deliverable,
          title: (validatedData.title as string | undefined) ?? existing.title,
          generatedContent,
          resolvedProposals: existingMetadata.resolved_proposals,
          resolvedConflicts: existingMetadata.resolved_conflicts,
        });

        const mergedMetadata: Record<string, any> = {
          ...existingMetadata,
          ...incomingMetadata,
          structuredContent: mapped.metadata?.structuredContent ?? existingMetadata.structuredContent,
        };

        // Preserve / refresh canonical raw payload only when client explicitly sends it.
        if (hasFullGeneratedUpdate) {
          mergedMetadata.full_generated_content = generatedContent;
        }

        updatePayload = {
          ...validatedData,
          content: mapped.content,
          metadata: mergedMetadata,
        };
      }
    } else if (validatedData.metadata) {
      // Always merge metadata to avoid silent loss.
      updatePayload = {
        ...validatedData,
        metadata: {
          ...existingMetadata,
          ...incomingMetadata,
        },
      };
    }

    const block = await ContentBlockModel.update(id, updatePayload);

    if (!block) {
      const response: APIResponse = {
        success: false,
        error: `Content block not found (ID: ${id}). The content may have been deleted or moved. Please refresh the page and try again.`
      };
      return res.status(404).json(response);
    }

    const response: APIResponse<typeof block> = {
      success: true,
      data: block,
      message: 'Content block updated successfully'
    };

    res.json(response);
  } catch (error) {
    console.error(`[Content Block Update] Failed to update ID: ${req.params.id}`, error);
    const response: APIResponse = {
      success: false,
      error: 'Failed to update content block',
      message: error instanceof Error ? error.message : 'Unknown error. Please check that all required fields are present and properly formatted.'
    };
    res.status(400).json(response);
  }
});

contentRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = ContentBlockModel.delete(id);

    if (!deleted) {
      const response: APIResponse = {
        success: false,
        error: 'Content block not found'
      };
      return res.status(404).json(response);
    }

    const response: APIResponse = {
      success: true,
      message: 'Content block deleted successfully'
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to delete content block',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

contentRouter.post('/reorder/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { blockIds } = req.body;

    if (!Array.isArray(blockIds)) {
      const response: APIResponse = {
        success: false,
        error: 'blockIds must be an array'
      };
      return res.status(400).json(response);
    }

    const success = await ContentBlockModel.reorder(projectId, blockIds);

    if (!success) {
      const response: APIResponse = {
        success: false,
        error: 'Failed to reorder content blocks'
      };
      return res.status(500).json(response);
    }

    const response: APIResponse = {
      success: true,
      message: 'Content blocks reordered successfully'
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to reorder content blocks',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/content/generated/save
 * Save generated content (encounters, scenes, adventures) to a project
 * This is separate from canon resources - it's actual story content
 */
contentRouter.post('/generated/save', async (req, res) => {
  try {
    const {
      project_id,
      content_type,
      deliverable_type,
      title,
      generated_content,
      persisted_content,
      resolved_proposals,
      resolved_conflicts,
      domain,
    } = req.body;

    if (!project_id || !content_type || !generated_content) {
      return res.status(400).json({
        success: false,
        error: 'project_id, content_type, and generated_content are required',
      });
    }

    console.log(`[Generated Content] Saving ${content_type} to project ${project_id}`);

    // CRITICAL: Check for Monster content FIRST before NPC check
    // Monsters also have content_type='character' so they'd be caught by NPC validation if we check NPC first
    let validatedContent = generated_content;
    const isMonster = isMonsterContent(generated_content);

    if (isMonster) {
      console.log('[Generated Content] Detected Monster content, applying schema validation...');

      const validation = validateMonsterStrict(generated_content);

      if (!validation.valid) {
        console.error('[Generated Content] Monster validation failed');
        console.error('[Generated Content] Detailed validation errors:', validation.details);

        const errorCount = validation.errors?.length || 0;
        return res.status(400).json({
          success: false,
          error: 'Monster Validation Failed',
          details: {
            errorCount,
            errors: validation.details?.split('\n\n') || ['Unknown validation error'],
            rawErrors: validation.errors,
          },
          message: `The monster data has ${errorCount} validation error${errorCount !== 1 ? 's' : ''}. Review the errors below and correct the data before saving.`,
        });
      }

      console.log('[Generated Content] Monster validation successful');
    }
    // Schema-driven validation for NPC content (check AFTER monster check)
    else {
      const isNpcContent = content_type?.toLowerCase().includes('npc') ||
                          content_type?.toLowerCase().includes('character') ||
                          generated_content.deliverable?.toLowerCase().includes('npc') ||
                          persisted_content?.deliverable?.toLowerCase().includes('npc');

      if (isNpcContent) {
        console.log('[Generated Content] Detected NPC content, applying schema validation...');

        const npcPayloadForValidation =
          persisted_content && typeof persisted_content === 'object'
            ? persisted_content
            : generated_content;

        const validation = mapAndValidateNpc(npcPayloadForValidation);

        if (!validation.success) {
          console.error('[Generated Content] NPC validation failed:', validation.errors);
          console.error('[Generated Content] Detailed validation errors:', validation.validationErrors);
          console.error('[Generated Content] Validation warnings:', validation.warnings);

          return res.status(400).json({
            success: false,
            error: 'NPC validation failed',
            details: {
              errors: validation.rawErrors || validation.errors,
              errorSummary: validation.errors,
              warnings: validation.warnings,
              validationErrors: validation.validationErrors,
              schemaVersion: validation.schemaVersion,
            },
            message: 'The generated NPC does not conform to the schema. Please check the field names and structure.',
          });
        }

        // Use validated and mapped data
        validatedContent = validation.data!;

        if (validation.warnings.length > 0) {
          console.warn('[Generated Content] NPC validation warnings:', validation.warnings);
        }

        console.log('[Generated Content] NPC validation successful');
      }
    }

    const db = getDb();
    const contentId = `gen_${project_id}_${Date.now()}`;

    // Determine the correct content_type based on deliverable
    // Monsters should have content_type: 'monster', not 'character'
    let finalContentType = content_type;
    if (isMonster) {
      finalContentType = 'monster';
      console.log('[Generated Content] Setting content_type to "monster" for monster content');
    } else if (validatedContent.deliverable === 'npc') {
      finalContentType = 'character';
    }

    const effectiveDeliverable =
      (typeof validatedContent?.deliverable === 'string' && validatedContent.deliverable.trim().length > 0
        ? validatedContent.deliverable.trim()
        : (typeof deliverable_type === 'string' && deliverable_type.trim().length > 0
          ? deliverable_type.trim()
          : '')) || undefined;

    if (effectiveDeliverable && (!validatedContent.deliverable || String(validatedContent.deliverable).trim().length === 0)) {
      validatedContent = { ...validatedContent, deliverable: effectiveDeliverable };
    }

    const generatedDoc = {
      _id: contentId,
      project_id,
      content_type: finalContentType,
      title: title || validatedContent.title || validatedContent.name || 'Untitled',
      generated_content: validatedContent, // Use validated content
      resolved_proposals: resolved_proposals || [],
      resolved_conflicts: resolved_conflicts || [],
      metadata: {
        sources_used: validatedContent.sources_used || [],
        assumptions: validatedContent.assumptions || [],
        canon_update: validatedContent.canon_update || '',
        deliverable: effectiveDeliverable ?? validatedContent.deliverable,
        difficulty: validatedContent.difficulty,
        rule_base: validatedContent.rule_base,
        domain:
          typeof domain === 'string' && (domain === 'rpg' || domain === 'writing')
            ? domain
            : typeof validatedContent?.domain === 'string' && (validatedContent.domain === 'rpg' || validatedContent.domain === 'writing')
              ? validatedContent.domain
              : 'rpg',
      },
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection('generated_content').insertOne(generatedDoc as any);

    const mappedBlock = mapGeneratedContentToContentBlock({
      contentType: finalContentType, // Use the corrected content_type
      deliverable: effectiveDeliverable ?? validatedContent.deliverable,
      title: title || validatedContent.title || validatedContent.name || 'Untitled',
      generatedContent: validatedContent, // Use validated content
      resolvedProposals: resolved_proposals,
      resolvedConflicts: resolved_conflicts,
    });

    // CRITICAL: Store reference to full generated content in metadata
    // This allows retrieving ALL data including ability scores, traits, etc.
    const enhancedMetadata = {
      ...mappedBlock.metadata,
      generated_content_id: contentId,
      full_generated_content: validatedContent, // Store validated content
      domain: (generatedDoc as any).metadata.domain,
    };

    const contentBlock = await ContentBlockModel.create({
      projectId: project_id,
      title: mappedBlock.title,
      content: mappedBlock.content,
      type: mappedBlock.type,
      metadata: enhancedMetadata,
      order: 0,
    });

    console.log(`[Generated Content] Created: ${contentId} and content block ${contentBlock.id}`);

    res.json({
      success: true,
      data: { content_id: contentId, content_block: contentBlock },
      message: 'Generated content saved successfully',
    });
  } catch (error) {
    console.error('[Generated Content] Save failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save generated content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/content/generated/list/:projectId
 * Get all generated content for a project
 */
contentRouter.get('/generated/list/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { content_type, limit = '50' } = req.query;

    const query: any = { project_id: projectId };
    if (content_type) query.content_type = content_type;

    const db = getDb();
    const generatedContentCollection = db.collection<GeneratedContentDocument>('generated_content');
    const content = await generatedContentCollection
      .find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit as string))
      .toArray();

    console.log(`[Generated Content] Found ${content.length} items for project ${projectId}`);

    res.json({
      success: true,
      data: content,
    });
  } catch (error) {
    console.error('[Generated Content] List failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list generated content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/content/generated/debug/all
 * DEBUG: Get all generated content with project IDs
 */
contentRouter.get('/generated/debug/all', async (_req, res) => {
  try {
    const db = getDb();
    const generatedContentCollection = db.collection<GeneratedContentDocument>('generated_content');
    const allContent = await generatedContentCollection
      .find({})
      .project({ _id: 1, project_id: 1, title: 1, content_type: 1, created_at: 1 })
      .limit(50)
      .toArray();

    console.log(`[DEBUG] Found ${allContent.length} total generated content items`);
    allContent.forEach(item => {
      console.log(`[DEBUG] - ${item._id}: project_id="${item.project_id}", title="${item.title}"`);
    });

    res.json({
      success: true,
      data: allContent,
      count: allContent.length,
    });
  } catch (error) {
    console.error('[DEBUG] Failed to list all content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list content',
    });
  }
});

/**
 * GET /api/content/generated/:contentId
 * Get a specific piece of generated content
 */
contentRouter.get('/generated/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    const db = getDb();
    const generatedContentCollection = db.collection<GeneratedContentDocument>('generated_content');
    const content = await generatedContentCollection.findOne({ _id: contentId });

    if (!content) {
      return res.status(404).json({
        success: false,
        error: 'Generated content not found',
      });
    }

    res.json({
      success: true,
      data: content,
    });
  } catch (error) {
    console.error('[Generated Content] Get failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get generated content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/content/generated/:contentId
 * Update a piece of generated content
 */
contentRouter.put('/generated/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { title, generated_content, persisted_content } = req.body;

    if (!title && !generated_content) {
      return res.status(400).json({
        success: false,
        error: 'At least one field (title or generated_content) is required',
      });
    }

    const db = getDb();
    const generatedContentCollection = db.collection<GeneratedContentDocument>('generated_content');

    // Get existing content to check type
    const existingContent = await generatedContentCollection.findOne({ _id: contentId });
    if (!existingContent) {
      return res.status(404).json({
        success: false,
        error: 'Generated content not found',
      });
    }

    const updateFields: any = {
      updated_at: new Date(),
    };

    if (title) updateFields.title = title;

    // Validate NPC content on update
    if (generated_content) {
      const isNpcContent = existingContent.content_type?.toLowerCase().includes('npc') ||
                          existingContent.content_type?.toLowerCase().includes('character') ||
                          generated_content.deliverable?.toLowerCase().includes('npc') ||
                          persisted_content?.deliverable?.toLowerCase().includes('npc');

      if (isNpcContent) {
        console.log('[Generated Content] Detected NPC content update, applying schema validation...');

        const npcPayloadForValidation =
          persisted_content && typeof persisted_content === 'object'
            ? persisted_content
            : generated_content;

        const validation = mapAndValidateNpc(npcPayloadForValidation);

        if (!validation.success) {
          console.error('[Generated Content] NPC validation failed on update:', validation.errors);
          console.error('[Generated Content] Detailed validation errors:', validation.validationErrors);
          console.error('[Generated Content] Validation warnings:', validation.warnings);

          return res.status(400).json({
            success: false,
            error: 'NPC validation failed',
            details: {
              errors: validation.rawErrors || validation.errors,
              errorSummary: validation.errors,
              warnings: validation.warnings,
              validationErrors: validation.validationErrors,
              schemaVersion: validation.schemaVersion,
            },
            message: 'The updated NPC does not conform to the schema. Please check the field names and structure.',
          });
        }

        // Use validated and mapped data
        updateFields.generated_content = validation.data!;

        if (validation.warnings.length > 0) {
          console.warn('[Generated Content] NPC validation warnings on update:', validation.warnings);
        }

        console.log('[Generated Content] NPC validation successful on update');
      } else {
        updateFields.generated_content = generated_content;
      }
    }

    const result = await generatedContentCollection.updateOne(
      { _id: contentId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Generated content not found',
      });
    }

    const updatedContent = await generatedContentCollection.findOne({ _id: contentId });

    console.log(`[Generated Content] Updated: ${contentId}`);

    res.json({
      success: true,
      data: updatedContent,
      message: 'Generated content updated successfully',
    });
  } catch (error) {
    console.error('[Generated Content] Update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update generated content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/content/generated/:contentId
 * Delete a piece of generated content
 */
contentRouter.delete('/generated/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    const db = getDb();
    const generatedContentCollection = db.collection<GeneratedContentDocument>('generated_content');
    const result = await generatedContentCollection.deleteOne({ _id: contentId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Generated content not found',
      });
    }

    console.log(`[Generated Content] Deleted: ${contentId}`);

    res.json({
      success: true,
      message: 'Generated content deleted successfully',
    });
  } catch (error) {
    console.error('[Generated Content] Delete failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete generated content',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});