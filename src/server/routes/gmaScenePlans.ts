import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ProjectModel } from '../models/index.js';
import { requireServiceIntegration, type IntegrationRequest } from '../middleware/integrationAuth.js';
import {
  appendScenePlanRevision,
  GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
  GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
  readActiveScenePlan,
  resolveScenePlanRevision,
  rewindScenePlan,
  ScenePlanStoreError,
} from '../services/gmaScenePlanStore.js';

export const gmaScenePlanRouter = Router({ mergeParams: true });
gmaScenePlanRouter.use(requireServiceIntegration);

function correlationId(req: Request) {
  return req.header('X-Sixsmith-Correlation-Id') || randomUUID();
}

function failure(req: Request, res: Response, error: ScenePlanStoreError) {
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      correlationId: correlationId(req),
      details: error.details,
    },
  });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error: unknown) {
      if (error instanceof ScenePlanStoreError) {
        failure(req, res, error);
        return;
      }
      next(error);
    }
  };
}

async function requireCampaign(req: Request, res: Response) {
  const userId = (req as IntegrationRequest).userId;
  const campaign = await ProjectModel.findById(userId, req.params.campaignId);
  if (campaign) return campaign;
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Campaign not found.',
      correlationId: correlationId(req),
      details: {},
    },
  });
  return null;
}

gmaScenePlanRouter.post('/revisions', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await appendScenePlanRevision({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    sceneId: body.sceneId,
    scenePlanId: body.scenePlanId,
    schemaVersion: body.schemaVersion,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey,
    sourceRevisions: body.sourceRevisions,
    interactionId: body.interactionId,
    timelineAnchor: body.timelineAnchor,
    privatePayload: body.privatePayload,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

gmaScenePlanRouter.get('/active', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readActiveScenePlan({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    scenePlanId: req.query.scenePlanId as string,
    sceneId: req.query.sceneId as string | undefined,
    schemaVersion: String(req.query.schemaVersion || GMA_SCENE_PLAN_SCHEMA_ALLOWLIST[0]),
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'GMA_SCENE_PLAN_NOT_FOUND',
        message: 'No compatible active scene plan was found.',
        correlationId: correlationId(req),
        details: { contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION },
      },
    });
    return;
  }
  res.json(result);
}));

gmaScenePlanRouter.get('/:scenePlanId/revisions/:revision', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await resolveScenePlanRevision({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    scenePlanId: req.params.scenePlanId,
    revision: Number(req.params.revision),
    payloadHash: req.query.payloadHash as string | undefined,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'GMA_SCENE_PLAN_NOT_FOUND',
        message: 'The requested scene-plan revision was not found.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

gmaScenePlanRouter.post('/:scenePlanId/rewind', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await rewindScenePlan({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    scenePlanId: req.params.scenePlanId,
    expectedRevision: req.body?.expectedRevision,
    boundarySequence: req.body?.boundarySequence,
    rewindId: req.body?.rewindId,
  });
  res.json(result);
}));
