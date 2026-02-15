/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { getRunsCollection, getArtifactsCollection } from '../config/mongo.js';
import { createRun, getStageOrder, type StageName } from '../models/Run.js';
import { Orchestrator } from '../orchestration/Orchestrator.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const runsRouter = Router();

// Apply auth middleware to all routes
runsRouter.use(authMiddleware);

/**
 * POST /api/runs
 * Create a new content generation run
 */
runsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { type, prompt, flags } = req.body;

    if (!type || !prompt) {
      return res.status(400).json({ error: 'type and prompt are required' });
    }

    const id = nanoid(8);
    const run = createRun(id, type, prompt, flags);

    // Add userId to run document
    (run as any).userId = authReq.userId;

    const runsCollection = getRunsCollection();
    await runsCollection.insertOne(run);

    // Start orchestration asynchronously
    const orchestrator = new Orchestrator();
    orchestrator.startRun(id).catch(err => {
      console.error(`Run ${id} failed:`, err);
    });

    res.json({ runId: id });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id
 * Get run status and details
 */
runsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const runsCollection = getRunsCollection();
    const run = await runsCollection.findOne({ _id: req.params.id, userId: authReq.userId });

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(run);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs
 * List all runs with optional filters
 */
runsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { type, status, limit = '50' } = req.query;

    const query: any = { userId: authReq.userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const runsCollection = getRunsCollection();
    const runs = await runsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .toArray();

    res.json(runs);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id/artifacts/:stage
 * Get artifact from a specific stage
 */
runsRouter.get('/:id/artifacts/:stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const stageParam = req.params.stage as StageName;
    if (!getStageOrder().includes(stageParam)) {
      return res.status(400).json({ error: 'Invalid stage parameter' });
    }

    // Verify run belongs to user
    const runsCollection = getRunsCollection();
    const run = await runsCollection.findOne({ _id: req.params.id, userId: authReq.userId });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const artifactsCollection = getArtifactsCollection();
    const artifact = await artifactsCollection.findOne({
      run_id: req.params.id,
      stage: stageParam,
    });

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(artifact.data);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:id/advance
 * Manually advance/retry a run
 */
runsRouter.post('/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as unknown as AuthRequest;

    // Verify run belongs to user
    const runsCollection = getRunsCollection();
    const run = await runsCollection.findOne({ _id: req.params.id, userId: authReq.userId });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const orchestrator = new Orchestrator();
    await orchestrator.startRun(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
