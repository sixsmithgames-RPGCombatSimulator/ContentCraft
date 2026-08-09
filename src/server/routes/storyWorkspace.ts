import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ProjectModel } from '../models/index.js';
import { requireServiceIntegration, type IntegrationRequest } from '../middleware/integrationAuth.js';
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
import { GMA_SCENE_PLAN_SCHEMA_ALLOWLIST, readActiveScenePlan, readLatestActiveScenePlan } from '../services/gmaScenePlanStore.js';
import { collections } from '../services/gmcIntegrationStore.js';
import {
  applyStoryDeltaV2,
  commitSceneHandoff,
  compileAcceptedV1SceneSnapshotMigrationPreview,
  compileLegacyScenePlanV2MigrationPreview,
  importAcceptedV1SceneSnapshotMigration,
  migrateStoryWorkspaceV2,
  readCurrentSceneContexts,
  readStoryGraphV2,
  replaceStoryGraphV2,
  type SceneHandoffAuthorityEnvelope,
  type StoryDeltaV2,
  STORY_MIGRATION_PREVIEW_CONTRACT_VERSION,
} from '../services/actionDirectedStoryStore.js';
import {
  ACTION_DIRECTED_STORY_CAPABILITIES,
  PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
  SCENE_HANDOFF_PROPOSAL_CONTRACT_VERSION,
  SCENE_KIT_V2_CONTRACT_VERSION,
  SCENE_STORY_DESIGN_CONTRACT_VERSION,
  STORY_AFFORDANCE_PROJECTION_CONTRACT_VERSION,
  STORY_DELTA_V2_CONTRACT_VERSION,
  STORY_GRAPH_CONTRACT_VERSION,
  STORY_GRAPH_NODE_REFERENCE_CONTRACT_VERSION,
  STORY_OBLIGATION_CAPABILITIES,
  STORY_SATISFACTION_RECEIPT_CONTRACT_VERSION,
} from '../services/storyWorkspaceStore.js';

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

async function currentCanonicalAnchor(userId: string, campaignId: string) {
  const state = await collections.state().findOne({ userId, campaignId });
  const currentScene = state?.currentSceneId
    ? await collections.scenes().findOne({ _id: state.currentSceneId, userId, campaignId })
    : null;
  const currentLocation = currentScene?.locationId
    ? await collections.entities().findOne({
      _id: currentScene.locationId,
      userId,
      project_id: campaignId,
      type: 'location',
      status: { $ne: 'superseded' },
    })
    : null;
  if (!currentLocation) {
    throw new StoryWorkspaceStoreError(409, 'STORY_ACCEPTED_SCENE_ANCHOR_MISSING', 'The campaign current location is unavailable for accepted-scene migration.', {});
  }
  return {
    locationRef: String(currentLocation._id),
    label: String(currentLocation.canonical_name ?? ''),
  };
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

storyWorkspaceRouter.post('/deltas-v2', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await applyStoryDeltaV2({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    delta: req.body as StoryDeltaV2,
  });
  res.status(result.status === 'applied' && !result.duplicate ? 201 : 200).json(result);
}));

storyWorkspaceRouter.get('/graph', asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readStoryGraphV2({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
  }));
}));

storyWorkspaceRouter.put('/graph', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await replaceStoryGraphV2({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedWorkspaceRevision: body.expectedWorkspaceRevision,
    expectedGraphRevision: body.expectedGraphRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    graph: body.graph,
    sourceReceiptRefs: body.sourceReceiptRefs ?? [],
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.post('/migrate-v2', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const acceptedSnapshot = body.acceptedV1SceneSnapshot;
  if (acceptedSnapshot && typeof acceptedSnapshot === 'object' && !Array.isArray(acceptedSnapshot)) {
    const userId = (req as IntegrationRequest).userId;
    const canonicalAnchor = await currentCanonicalAnchor(userId, req.params.campaignId);
    if (body.dryRun !== false) {
      res.json(compileAcceptedV1SceneSnapshotMigrationPreview({
        campaignId: req.params.campaignId,
        snapshot: acceptedSnapshot,
        canonicalAnchor,
      }));
      return;
    }
    const result = await importAcceptedV1SceneSnapshotMigration({
      userId,
      campaignId: req.params.campaignId,
      expectedWorkspaceRevision: Number(body.expectedWorkspaceRevision ?? 0),
      idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
      snapshot: acceptedSnapshot,
      canonicalAnchor,
    });
    res.status(result.duplicate ? 200 : 201).json(result);
    return;
  }
  const result = await migrateStoryWorkspaceV2({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedWorkspaceRevision: body.expectedWorkspaceRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    dryRun: body.dryRun !== false,
  });
  res.status(result.dryRun || result.changed === false || ('duplicate' in result && result.duplicate) ? 200 : 201).json(result);
}));

storyWorkspaceRouter.post('/migration-preview', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const userId = (req as IntegrationRequest).userId;
  const campaignId = req.params.campaignId;
  const active = await readActiveStoryWorkspace({ userId, campaignId });
  if (active) {
    const migrationPreview = await migrateStoryWorkspaceV2({
      userId,
      campaignId,
      expectedWorkspaceRevision: body.expectedWorkspaceRevision,
      idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
      dryRun: true,
    });
    const sceneContext = await readCurrentSceneContexts({ userId, campaignId });
    const history = await listStoryWorkspaceHistory({ userId, campaignId, limit: 100 });
    res.json({
      contractVersion: STORY_MIGRATION_PREVIEW_CONTRACT_VERSION,
      dryRun: true,
      mutationApplied: false,
      source: 'story_workspace',
      migrationPreview,
      sceneContext,
      history,
    });
    return;
  }
  if (Number(body.expectedWorkspaceRevision ?? 0) !== 0) {
    throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before migration preview.', {
      expectedRevision: body.expectedWorkspaceRevision,
      actualRevision: 0,
    });
  }
  const legacy = body.scenePlanId
    ? await readActiveScenePlan({
      userId,
      campaignId,
      scenePlanId: body.scenePlanId,
      sceneId: body.sceneId,
      schemaVersion: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST[0],
    })
    : await readLatestActiveScenePlan({ userId, campaignId, schemaVersion: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST[0] });
  if (!legacy) {
    const acceptedSnapshot = body.acceptedV1SceneSnapshot;
    if (acceptedSnapshot && typeof acceptedSnapshot === 'object' && !Array.isArray(acceptedSnapshot)) {
      const canonicalAnchor = await currentCanonicalAnchor(userId, campaignId);
      res.json(compileAcceptedV1SceneSnapshotMigrationPreview({
        campaignId,
        snapshot: acceptedSnapshot,
        canonicalAnchor,
      }));
      return;
    }
    res.status(404).json({
      error: {
        code: 'STORY_LEGACY_SCENE_PLAN_NOT_FOUND',
        message: 'No compatible legacy scene plan was found to preview.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(compileLegacyScenePlanV2MigrationPreview({
    campaignId,
    scenePlanRef: legacy.scenePlanRef,
    privatePayload: legacy.privatePayload,
  }));
}));

storyWorkspaceRouter.post('/scene-handoffs', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await commitSceneHandoff({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    envelope: req.body as SceneHandoffAuthorityEnvelope,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-context', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readCurrentSceneContexts({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
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
  res.json(result);
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
    actionDirectedStory: {
      storyGraph: STORY_GRAPH_CONTRACT_VERSION,
      storyNodeRef: STORY_GRAPH_NODE_REFERENCE_CONTRACT_VERSION,
      sceneHandoffProposal: SCENE_HANDOFF_PROPOSAL_CONTRACT_VERSION,
      sceneKit: SCENE_KIT_V2_CONTRACT_VERSION,
      playableSceneContext: PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
      storyDelta: STORY_DELTA_V2_CONTRACT_VERSION,
      capabilities: ACTION_DIRECTED_STORY_CAPABILITIES,
      authority: 'gmc',
      routeEnabled: false,
    },
    storyObligations: {
      sceneStoryDesign: SCENE_STORY_DESIGN_CONTRACT_VERSION,
      storyAffordanceProjection: STORY_AFFORDANCE_PROJECTION_CONTRACT_VERSION,
      storySatisfactionReceipt: STORY_SATISFACTION_RECEIPT_CONTRACT_VERSION,
      capabilities: STORY_OBLIGATION_CAPABILITIES,
      authority: 'gmc',
      routeEnabled: false,
    },
  });
});
