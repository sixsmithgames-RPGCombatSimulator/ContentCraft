import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ProjectModel } from '../models/index.js';
import { type IntegrationRequest } from '../middleware/integrationAuth.js';
import {
  applyStoryDelta,
  compileLegacyScenePlanImport,
  emptyStoryWorkspace,
  listStoryWorkspaceHistory,
  PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
  readActiveStoryWorkspace,
  readStoryProjection,
  replaceStoryWorkspace,
  rewindStoryWorkspace,
  STORY_DELTA_CONTRACT_VERSION,
  STORY_PUBLIC_PROJECTION_CONTRACT_VERSION,
  STORY_WORKSPACE_CONTRACT_VERSION,
  StoryWorkspaceStoreError,
} from '../services/storyWorkspaceStore.js';
import { GMA_SCENE_PLAN_SCHEMA_ALLOWLIST, readActiveScenePlan } from '../services/gmaScenePlanStore.js';

export const storyWorkspaceRouter = Router({ mergeParams: true });

function correlationId(req: Request) {
  return req.header('X-Sixsmith-Correlation-Id') || randomUUID();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error: unknown) {
      if (error instanceof StoryWorkspaceStoreError) {
        res.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            correlationId: correlationId(req),
            details: error.details,
          },
        });
        return;
      }
      next(error);
    }
  };
}

async function requireCampaign(req: Request, res: Response) {
  const campaign = await ProjectModel.findById((req as IntegrationRequest).userId, req.params.campaignId);
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

storyWorkspaceRouter.get('/', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readActiveStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'STORY_WORKSPACE_NOT_FOUND',
        message: 'No Story workspace has been prepared for this campaign.',
        correlationId: correlationId(req),
        details: { schemaVersion: STORY_WORKSPACE_CONTRACT_VERSION },
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.post('/initialize', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const campaignId = req.params.campaignId;
  const existing = await readActiveStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId,
  });
  if (existing) {
    res.json({ ...existing, duplicate: true });
    return;
  }
  const result = await replaceStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId,
    expectedRevision: 0,
    idempotencyKey: String(req.body?.idempotencyKey ?? req.header('Idempotency-Key') ?? `story-initialize:${campaignId}`),
    source: 'gmc',
    workspace: emptyStoryWorkspace(campaignId),
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.put('/', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await replaceStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    source: body.source ?? 'studio_manual',
    timelineAnchor: body.timelineAnchor ?? null,
    workspace: body.workspace,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.post('/deltas', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await applyStoryDelta({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    delta: req.body,
  });
  res.status(result.status === 'applied' && !result.duplicate ? 201 : 200).json(result);
}));

storyWorkspaceRouter.get('/history', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await listStoryWorkspaceHistory({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    limit: Number(req.query.limit ?? 25),
  }));
}));

storyWorkspaceRouter.post('/rewind', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await rewindStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedRevision: req.body?.expectedRevision,
    boundarySequence: req.body?.boundarySequence,
    rewindId: req.body?.rewindId,
  }));
}));

storyWorkspaceRouter.post('/import-legacy-scene-plan', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const legacy = await readActiveScenePlan({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    scenePlanId: body.scenePlanId,
    sceneId: body.sceneId,
    schemaVersion: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST[0],
  });
  if (!legacy) {
    res.status(404).json({
      error: {
        code: 'STORY_LEGACY_SCENE_PLAN_NOT_FOUND',
        message: 'No compatible legacy scene plan was found to import.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  if (body.expectedLegacyRevision !== undefined && body.expectedLegacyRevision !== legacy.scenePlanRef.revision) {
    throw new StoryWorkspaceStoreError(409, 'STORY_LEGACY_SCENE_PLAN_REVISION_CONFLICT', 'The legacy scene plan changed before import.', {
      expectedRevision: body.expectedLegacyRevision,
      actualRevision: legacy.scenePlanRef.revision,
    });
  }
  const active = await readActiveStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
  });
  const workspace = compileLegacyScenePlanImport({
    campaignId: req.params.campaignId,
    currentWorkspace: active?.workspace ?? null,
    scenePlanRef: legacy.scenePlanRef,
    privatePayload: legacy.privatePayload,
  });
  const result = await replaceStoryWorkspace({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedRevision: body.expectedWorkspaceRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    source: 'migration',
    timelineAnchor: body.timelineAnchor ?? null,
    workspace,
    changedRecordRefs: [`scene_kit:scene-kit:legacy:${legacy.scenePlanRef.scenePlanId}`],
  });
  res.status(result.duplicate ? 200 : 201).json({ ...result, importedScenePlanRef: legacy.scenePlanRef });
}));

storyWorkspaceRouter.get('/projections/:mode', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (!['public', 'playable'].includes(req.params.mode)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_PROJECTION_MODE_INVALID', 'The Story projection mode is invalid.', {
      supportedModes: ['public', 'playable'],
    });
  }
  const result = await readStoryProjection({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    mode: req.params.mode as 'public' | 'playable',
    sceneKitId: req.query.sceneKitId ? String(req.query.sceneKitId) : undefined,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'STORY_WORKSPACE_NOT_FOUND',
        message: 'No Story workspace has been prepared for this campaign.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json({
    contractVersion: req.params.mode === 'public'
      ? STORY_PUBLIC_PROJECTION_CONTRACT_VERSION
      : PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
    ...result,
  });
}));

storyWorkspaceRouter.get('/contracts', (_req, res) => {
  res.json({
    storyWorkspace: STORY_WORKSPACE_CONTRACT_VERSION,
    storyDelta: STORY_DELTA_CONTRACT_VERSION,
    publicProjection: STORY_PUBLIC_PROJECTION_CONTRACT_VERSION,
    playableProjection: PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
  });
});
