/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { clerkAuthMiddleware, AuthRequest } from '../middleware/clerkAuth.js';
import { getWorkflowDefinition } from '../../shared/generation/workflowRegistry.js';
import { resolveWorkflowContentType } from '../../shared/generation/workflowContentType.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const progressRouter = Router();

// Apply auth middleware to all routes
progressRouter.use(clerkAuthMiddleware);

type ProgressEntryLike = Record<string, unknown>;

// Directory to store progress files
// Use /tmp on serverless platforms (Vercel), local dir otherwise
const PROGRESS_DIR = process.env.VERCEL 
  ? '/tmp/generation-progress'
  : path.join(__dirname, '..', '..', '..', 'generation-progress');

// Ensure progress directory exists
async function ensureProgressDir() {
  try {
    await fs.access(PROGRESS_DIR);
  } catch {
    await fs.mkdir(PROGRESS_DIR, { recursive: true });
  }
}

/**
 * POST /api/save-progress
 * Saves generation progress to a JSON file
 */
progressRouter.post('/save-progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename or data',
      });
    }

    await ensureProgressDir();

    // Add userId to the data
    const dataWithUserId = {
      ...data,
      userId: authReq.userId,
    };

    const filepath = path.join(PROGRESS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(dataWithUserId, null, 2), 'utf-8');

    console.log(`[Progress] Saved to ${filepath}`);

    res.json({
      success: true,
      filepath: filename,
      message: 'Progress saved successfully',
    });
  } catch (error) {
    console.error('[Progress] Error saving progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/load-progress?filename=...
 * Loads generation progress from a JSON file
 */
progressRouter.get('/load-progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { filename } = req.query;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid filename',
      });
    }

    const filepath = path.join(PROGRESS_DIR, filename);

    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Progress file not found',
      });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    // Verify userId matches
    if (data.userId && data.userId !== authReq.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    console.log(`[Progress] Loaded from ${filepath}`);

    res.json(data);
  } catch (error) {
    console.error('[Progress] Error loading progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/list-progress
 * Lists all available progress files
 */
progressRouter.get('/list-progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthRequest;
    await ensureProgressDir();

    const files = await fs.readdir(PROGRESS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const progressFiles = await Promise.all(
      jsonFiles.map(async (filename) => {
        try {
          const filepath = path.join(PROGRESS_DIR, filename);
          const content = await fs.readFile(filepath, 'utf-8');
          const data = JSON.parse(content);
          const progressEntries: ProgressEntryLike[] = Array.isArray(data.progress)
            ? data.progress.filter((entry: unknown): entry is ProgressEntryLike => typeof entry === 'object' && entry !== null)
            : [];
          const pendingEntry = progressEntries.find(
            (entry) => entry?.status === 'pending' && entry?.response === null,
          );
          const latestRetryEntry = [...progressEntries].reverse().find((entry) => entry?.retrySource);
          const latestConfirmedEntry = [...progressEntries].reverse().find(
            (entry) => typeof entry?.confirmedStageKey === 'string' || typeof entry?.confirmedStageId === 'string',
          );
          const retryEntry = pendingEntry?.retrySource ? pendingEntry : latestRetryEntry;
          const workflowType = resolveWorkflowContentType(data.workflowType || data.config?.type);
          const workflowDefinition = getWorkflowDefinition(workflowType);
          const workflowStageSequence = Array.isArray(data.workflowStageSequence)
            ? data.workflowStageSequence.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
            : [];
          const totalStages = workflowStageSequence.length > 0
            ? workflowStageSequence.length
            : workflowDefinition?.stageKeys.length ?? 0;
          const recentProgress = [...progressEntries]
            .slice(-4)
            .reverse()
            .map((entry) => ({
              stage: typeof entry?.stage === 'string' ? entry.stage : 'Unknown Stage',
              status: entry?.status === 'pending' || entry?.status === 'completed' || entry?.status === 'error'
                ? entry.status
                : 'completed',
              timestamp: typeof entry?.timestamp === 'string' ? entry.timestamp : data.lastUpdatedAt,
              chunkIndex: typeof entry?.chunkIndex === 'number' ? entry.chunkIndex : null,
              retrySource: entry?.retrySource || undefined,
              confirmedStageId: typeof entry?.confirmedStageId === 'string' ? entry.confirmedStageId : undefined,
              confirmedStageKey: typeof entry?.confirmedStageKey === 'string' ? entry.confirmedStageKey : undefined,
              confirmedWorkflowType: typeof entry?.confirmedWorkflowType === 'string' ? entry.confirmedWorkflowType : undefined,
            }));

          // Filter by userId
          if (data.userId && data.userId !== authReq.userId) {
            return null;
          }

          return {
            filename,
            sessionId: data.sessionId,
            sessionName: data.sessionName,
            createdAt: data.createdAt,
            lastUpdatedAt: data.lastUpdatedAt,
            config: data.config,
            currentStageIndex: data.currentStageIndex,
            progressCount: progressEntries.length,
            totalStages,
            retrySource: retryEntry?.retrySource || null,
            retryStage: retryEntry?.stage,
            hasPendingRetry: Boolean(pendingEntry?.retrySource),
            lastConfirmedStageId: typeof latestConfirmedEntry?.confirmedStageId === 'string'
              ? latestConfirmedEntry.confirmedStageId
              : undefined,
            lastConfirmedStageKey: typeof latestConfirmedEntry?.confirmedStageKey === 'string'
              ? latestConfirmedEntry.confirmedStageKey
              : undefined,
            lastConfirmedWorkflowType: typeof latestConfirmedEntry?.confirmedWorkflowType === 'string'
              ? latestConfirmedEntry.confirmedWorkflowType
              : undefined,
            recentProgress,
          };
        } catch (error) {
          console.error(`[Progress] Error reading ${filename}:`, error);
          return null;
        }
      })
    );

    // Filter out any failed reads and non-matching users
    const validFiles = progressFiles.filter(f => f !== null);

    res.json(validFiles);
  } catch (error) {
    console.error('[Progress] Error listing progress files:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/delete-progress?filename=...
 * Deletes a progress file
 */
progressRouter.delete('/delete-progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { filename } = req.query;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid filename',
      });
    }

    const filepath = path.join(PROGRESS_DIR, filename);

    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Progress file not found',
      });
    }

    // Verify userId matches before deleting
    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    if (data.userId && data.userId !== authReq.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    await fs.unlink(filepath);

    console.log(`[Progress] Deleted ${filepath}`);

    res.json({
      success: true,
      message: 'Progress file deleted successfully',
    });
  } catch (error) {
    console.error('[Progress] Error deleting progress file:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
