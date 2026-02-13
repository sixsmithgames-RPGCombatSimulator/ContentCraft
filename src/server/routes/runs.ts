/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getRunsCollection, getArtifactsCollection } from '../config/mongo.js';
import { createRun, getStageOrder, type StageName } from '../models/Run.js';
import { Orchestrator } from '../orchestration/Orchestrator.js';

export const runsRouter = Router();

/**
 * POST /api/runs
 * Create a new content generation run
 */
runsRouter.post('/', async (req, res, next) => {
  try {
    const { type, prompt, flags } = req.body;

    if (!type || !prompt) {
      return res.status(400).json({ error: 'type and prompt are required' });
    }

    const id = nanoid(8);
    const run = createRun(id, type, prompt, flags);

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
runsRouter.get('/:id', async (req, res, next) => {
  try {
    const runsCollection = getRunsCollection();
    const run = await runsCollection.findOne({ _id: req.params.id });

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
runsRouter.get('/', async (req, res, next) => {
  try {
    const { type, status, limit = '50' } = req.query;

    const query: any = {};
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
runsRouter.get('/:id/artifacts/:stage', async (req, res, next) => {
  try {
    const stageParam = req.params.stage as StageName;
    if (!getStageOrder().includes(stageParam)) {
      return res.status(400).json({ error: 'Invalid stage parameter' });
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
runsRouter.post('/:id/advance', async (req, res, next) => {
  try {
    const orchestrator = new Orchestrator();
    await orchestrator.startRun(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
