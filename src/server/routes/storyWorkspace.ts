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
import {
  commitObservationAuthority,
  OBSERVATION_AUTHORITY_COMMIT_CONTRACT_VERSION,
  OBSERVATION_AUTHORITY_PROJECTION_CONTRACT_VERSION,
  OBSERVATION_AUTHORITY_READER_BUNDLE_VERSION,
  OBSERVATION_AUTHORITY_RECEIPT_CONTRACT_VERSION,
  OBSERVATION_AUTHORITY_WRITER_BUNDLE_VERSION,
  OBSERVATION_SAGA_CAPABILITIES,
  OBSERVATION_SAGA_SHARED_CONTRACTS,
  OBSERVATION_SAGA_SHARED_WRITER_BUNDLE_VERSION,
  readObservationAuthority,
  readObservationAuthorityOperation,
} from '../services/observationAuthorityService.js';
import {
  advanceCompoundActionArtifact,
  COMPOUND_ACTION_ARTIFACT_REFERENCE_CONTRACT_VERSION,
  COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION,
  COMPOUND_ACTION_CAPABILITIES,
  COMPOUND_ACTION_CONTRACTS,
  COMPOUND_ACTION_LIMITS,
  COMPOUND_ACTION_REQUIREMENT_PROJECTION_CONTRACT_VERSION,
  createCompoundActionArtifact,
  readActiveCompoundActionArtifact,
  readCompoundActionOperationStatus,
  resolveCompoundActionRequirements,
  resolveCompoundReplayStoryCheckpoint,
  resolveCompoundReplayStoryCheckpointV2,
  COMPOUND_REPLAY_STORY_CHECKPOINT_V2_CONTRACT_VERSION,
  readStagedCompoundActionInstruction,
  rewindCompoundActionArtifacts,
  stageCompoundActionInstruction,
  settleCompoundActionArtifact,
  tombstoneCompoundActionArtifact,
  type CompoundActionRequirement,
} from '../services/compoundActionArtifactStore.js';
import { GMA_SCENE_PLAN_SCHEMA_ALLOWLIST, readActiveScenePlan, readLatestActiveScenePlan } from '../services/gmaScenePlanStore.js';
import { collections } from '../services/gmcIntegrationStore.js';
import {
  applyStoryDeltaV2,
  commitSceneHandoff,
  compileAcceptedV1SceneSnapshotMigrationPreview,
  compileLegacyScenePlanV2MigrationPreview,
  importAcceptedV1SceneSnapshotMigration,
  migrateStoryWorkspaceV2,
  readCommittedSceneHandoff,
  readCurrentSceneContexts,
  readStoryGraphV2,
  replaceStoryGraphV2,
  type SceneHandoffAuthorityEnvelope,
  type StoryDeltaV2,
  STORY_MIGRATION_PREVIEW_CONTRACT_VERSION,
} from '../services/actionDirectedStoryStore.js';
import {
  ACTION_DIRECTED_STORY_CAPABILITIES,
  ACTION_DIRECTED_STORY_PLAYABLE_SCENE_CONTEXT_READ_VERSIONS,
  ACTION_DIRECTED_STORY_SCENE_KIT_READ_VERSIONS,
  PLAYABLE_SCENE_CONTEXT_CONTRACT_VERSION,
  SCENE_HANDOFF_RECEIPT_CONTRACT_VERSION,
  SCENE_HANDOFF_PROPOSAL_CONTRACT_VERSION,
  SCENE_KIT_CONTRACT_VERSION,
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

function queryRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
  return value === undefined ? [] : String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

storyWorkspaceRouter.get('/observation-authority', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const derivedSubject = req.query.derivedParentActorRef || req.query.derivedMechanicsSubjectRef || req.query.derivedSubjectKind
    ? {
        parentActorRef: String(req.query.derivedParentActorRef ?? ''),
        mechanicsSubjectRef: String(req.query.derivedMechanicsSubjectRef ?? ''),
        subjectKind: String(req.query.derivedSubjectKind ?? ''),
      }
    : null;
  res.json(await readObservationAuthority({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    actorRefs: queryRefs(req.query.actorRef),
    subjectRefs: queryRefs(req.query.subjectRef),
    derivedSubject,
  }));
}));

storyWorkspaceRouter.post('/observation-authority/commit', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await commitObservationAuthority({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedWorkspaceRevision: body.expectedWorkspaceRevision,
    expectedSceneRevision: body.expectedSceneRevision,
    operationId: body.operationId,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    requestFingerprint: body.requestFingerprint,
    sceneKit: body.sceneKit,
    vcsBindings: body.vcsBindings ?? [],
    sourceReceiptRefs: body.sourceReceiptRefs ?? [],
    preparedTargetRefs: body.preparedTargetRefs,
    derivedActorEvidence: body.derivedActorEvidence ?? [],
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-handoffs/:idempotencyKey', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readCommittedSceneHandoff({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    idempotencyKey: req.params.idempotencyKey,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'STORY_SCENE_HANDOFF_RECEIPT_NOT_FOUND',
        message: 'No committed Scene handoff matches that operation.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.get('/observation-authority/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readObservationAuthorityOperation({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    operationId: req.params.operationId,
  }));
}));

storyWorkspaceRouter.post('/interaction-artifacts', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await createCompoundActionArtifact({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    instruction: body.instruction,
    program: body.program,
    cursor: body.cursor,
    clarifications: body.clarifications,
    saga: body.saga,
    originCheckpoint: body.originCheckpoint,
    timelineAnchor: body.timelineAnchor,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.post('/interaction-instructions', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await stageCompoundActionInstruction({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    instruction: body.instruction,
    expectedStoryWorkspaceRef: body.expectedStoryWorkspaceRef,
    timelineAnchor: body.timelineAnchor,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/interaction-instructions/:interactionId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readStagedCompoundActionInstruction({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    interactionId: req.params.interactionId,
  });
  if (!result) { res.status(404).json({ error: { code: 'COMPOUND_ACTION_INSTRUCTION_NOT_FOUND', message: 'The staged player instruction was not found.' } }); return; }
  res.json(result);
}));

storyWorkspaceRouter.post('/interaction-artifacts/requirements', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  res.json(await resolveCompoundActionRequirements({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: body.programId,
    nodeId: body.nodeId,
    requirements: body.requirements as CompoundActionRequirement[],
    expectedAuthority: body.expectedAuthority,
  }));
}));

storyWorkspaceRouter.post('/interaction-artifacts/rewind', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await rewindCompoundActionArtifacts({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    boundarySequence: req.body?.boundarySequence,
    rewindId: req.body?.rewindId,
  }));
}));

storyWorkspaceRouter.get('/interaction-artifacts/:programId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readActiveCompoundActionArtifact({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'COMPOUND_ACTION_ARTIFACT_NOT_FOUND',
        message: 'No active interaction artifact was found for this program.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.put('/interaction-artifacts/:programId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await advanceCompoundActionArtifact({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    program: body.program,
    cursor: body.cursor,
    appendReceipts: body.appendReceipts,
    clarifications: body.clarifications,
    rootFailure: body.rootFailure,
    saga: body.saga,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.post('/interaction-artifacts/replay-checkpoint', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const common = {
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    boundarySequence: body.boundarySequence,
    instructionFingerprint: body.instructionFingerprint,
    replayLineageId: body.replayLineageId,
    programId: body.programId,
    observedSurvivingStoryWorkspaceRef: body.observedSurvivingStoryWorkspaceRef,
  };
  if (body.checkpointContractVersion === COMPOUND_REPLAY_STORY_CHECKPOINT_V2_CONTRACT_VERSION) {
    res.json(await resolveCompoundReplayStoryCheckpointV2({
      ...common,
      replayLineageId: body.replayLineageId,
      allowRootlessArtifactMembership: body.allowRootlessArtifactMembership === true,
    }));
    return;
  }
  res.json(await resolveCompoundReplayStoryCheckpoint({
    ...common,
    allowLegacyFingerprintBoundary: body.allowLegacyFingerprintBoundary === true,
  }));
}));

storyWorkspaceRouter.post('/interaction-artifacts/:programId/settle', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await settleCompoundActionArtifact({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
    cursor: body.cursor,
    executionReceipt: body.executionReceipt,
    executionReceipts: body.executionReceipts,
    saga: body.saga,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/interaction-artifacts/:programId/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readCompoundActionOperationStatus({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
    operationId: req.params.operationId,
  }));
}));

storyWorkspaceRouter.post('/interaction-artifacts/:programId/tombstone', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await tombstoneCompoundActionArtifact({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey ?? req.header('Idempotency-Key'),
  });
  res.status(result.duplicate ? 200 : 201).json(result);
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
    restoreStoryWorkspaceRef: req.body?.restoreStoryWorkspaceRef ?? null,
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
      sceneHandoffReceipt: SCENE_HANDOFF_RECEIPT_CONTRACT_VERSION,
      sceneKit: SCENE_KIT_CONTRACT_VERSION,
      sceneKitReadVersions: ACTION_DIRECTED_STORY_SCENE_KIT_READ_VERSIONS,
      playableSceneContext: PLAYABLE_SCENE_CONTEXT_CONTRACT_VERSION,
      playableSceneContextReadVersions: ACTION_DIRECTED_STORY_PLAYABLE_SCENE_CONTEXT_READ_VERSIONS,
      storyDelta: STORY_DELTA_V2_CONTRACT_VERSION,
      capabilities: ACTION_DIRECTED_STORY_CAPABILITIES,
      authority: 'gmc',
      routeEnabled: false,
    },
    observationSaga: {
      projection: OBSERVATION_AUTHORITY_PROJECTION_CONTRACT_VERSION,
      commit: OBSERVATION_AUTHORITY_COMMIT_CONTRACT_VERSION,
      receipt: OBSERVATION_AUTHORITY_RECEIPT_CONTRACT_VERSION,
      readerBundle: OBSERVATION_AUTHORITY_READER_BUNDLE_VERSION,
      writerBundle: OBSERVATION_AUTHORITY_WRITER_BUNDLE_VERSION,
      sharedWriterBundle: OBSERVATION_SAGA_SHARED_WRITER_BUNDLE_VERSION,
      capabilities: OBSERVATION_SAGA_CAPABILITIES,
      sharedContracts: OBSERVATION_SAGA_SHARED_CONTRACTS,
      authority: 'gmc',
      routeEnabled: true,
      conformance: true,
    },
    storyObligations: {
      sceneStoryDesign: SCENE_STORY_DESIGN_CONTRACT_VERSION,
      storyAffordanceProjection: STORY_AFFORDANCE_PROJECTION_CONTRACT_VERSION,
      storySatisfactionReceipt: STORY_SATISFACTION_RECEIPT_CONTRACT_VERSION,
      capabilities: STORY_OBLIGATION_CAPABILITIES,
      authority: 'gmc',
      routeEnabled: false,
    },
    compoundActions: {
      artifactStore: COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION,
      artifactReference: COMPOUND_ACTION_ARTIFACT_REFERENCE_CONTRACT_VERSION,
      requirementProjection: COMPOUND_ACTION_REQUIREMENT_PROJECTION_CONTRACT_VERSION,
      contracts: COMPOUND_ACTION_CONTRACTS,
      capabilities: COMPOUND_ACTION_CAPABILITIES,
      limits: COMPOUND_ACTION_LIMITS,
      authority: 'gmc',
      persistence: 'non_canonical_interaction',
      access: 'service_only',
      routeEnabled: false,
    },
  });
});
