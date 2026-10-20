import { readScenePendingIntentContext } from '../services/scenePendingIntentService.js';
import { readCurrentSceneOwnerContext } from '../services/currentSceneOwnerContext.js';
import { readSceneTemporalAuthority, evaluateCurrentSceneTemporalValidity } from '../services/sceneTemporalAuthorityService.js';
import { sceneTemporalGmDecisionService } from '../services/sceneTemporalGmDecisionStore.js';
import { sceneMovementOutcomeService, type SceneMovementOutcomeCommit } from '../services/sceneMovementOutcomeStore.js';
import { pendingReferenceQualificationService, type PendingReferenceQualificationCommit } from '../services/pendingReferenceQualificationStore.js';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { OrchestratorError } from '../llm-orchestrator/errors.js';
import { readQualifiedSceneTurnIdentitySources } from '../services/qualifiedSceneTurnSources.js';
import { ProjectModel } from '../models/index.js';
import { requireServiceIntegration, type IntegrationRequest } from '../middleware/integrationAuth.js';
import { rewindFreeformTurns } from '../services/freeformTurnStore.js';
import { actorMechanicsLinkService } from '../services/actorMechanicsLinkStore.js';
import { readActorIdentityChoices } from '../services/actorIdentityChoices.js';
import { pendingObserverEvidenceService } from '../services/pendingObserverEvidenceStore.js';
import { qualifiedObservationAuthorityService, type QualifiedObservationCommit } from '../services/qualifiedObservationAuthorityService.js';
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
  type JsonObject,
} from '../services/storyWorkspaceStore.js';
import {
  commitSceneReality,
  compileScenePreparedBindings,
  readScenePreparationResume,
  issueScenePreparationReview,
  decideSceneCoverage,
  readActiveSceneReality,
  readSceneRealityInspection,
  readSceneRealityOperation,
  sceneRealitySupportsStorySettlement,
  sceneRealityHealthAdvertisement,
  selectPreparedStoryFacts,
} from '../services/sceneRealityReadinessService.js';
import {
  ACTIVE_SCENE_CAPABILITIES,
  ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
  ACTIVE_SCENE_CONTEXT_MAX_BYTES,
  ACTIVE_SCENE_STATE_CONTRACT_VERSION,
  ACTIVE_SCENE_STATE_MAX_BYTES,
  CONVERSATION_HISTORY_CONTRACT_VERSION,
  CONVERSATION_HISTORY_LIMIT,
  CONVERSATION_HISTORY_MAX_BYTES,
  commitSceneTurn,
  PUBLISHED_EXCHANGE_CONTRACT_VERSION,
  readConversationHistory,
  recordConversationHistoryRewind,
  readSceneTurnOperation,
  SCENE_STATE_DELTA_CONTRACT_VERSION,
  SCENE_TURN_PROPOSAL_CONTRACT_VERSION,
  SCENE_TURN_PROPOSAL_MAX_BYTES,
  SCENE_TURN_PROPOSAL_V2_CONTRACT_VERSION,
  SCENE_TURN_PROPOSAL_V2_MAX_BYTES,
  SCENE_TURN_RECEIPT_CONTRACT_VERSION,
  SCENE_TURN_RECEIPT_V2_CONTRACT_VERSION,
} from '../services/activeSceneStateStore.js';
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
  COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS,
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
      if (error instanceof OrchestratorError && error.code === 'FREEFORM_WORKFLOW_CLOSED') {
        res.status(error.status).json({ error: {
          code: error.code,
          message: 'Studio could not continue this saved action because it is no longer open in this game. This request applied nothing; your saved game and earlier completed steps are safe. Return to Story to review the saved game before sending a new action.',
          correlationId: correlationId(req), details: {},
        } });
        return;
      }
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
  const userId = (req as IntegrationRequest).userId;
  const campaignId = req.params.campaignId;
  const result = await readCurrentSceneOwnerContext({
    userId,
    campaignId,
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

function closedActorLinkBody(body: unknown, fields: string[]): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== fields.length || fields.some((key) => !Object.hasOwn(body, key))
    || Buffer.byteLength(JSON.stringify(body)) > 8_192) {
    throw new StoryWorkspaceStoreError(422, 'ACTOR_LINK_INPUT_INVALID', 'The identity selection contains unsupported fields.', {});
  }
}

storyWorkspaceRouter.get('/actor-mechanics-links', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await actorMechanicsLinkService().read({ userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId }));
}));
storyWorkspaceRouter.get('/actor-mechanics-links/choices', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const subjectKind = req.query.subjectKind;
  if (Object.keys(req.query).sort().join(',') !== 'mechanicsSubjectRef,subjectKind'
    || subjectKind !== 'character' && subjectKind !== 'familiar' || typeof req.query.mechanicsSubjectRef !== 'string') {
    throw new StoryWorkspaceStoreError(422, 'ACTOR_LINK_INPUT_INVALID', 'Identity choices require one exact subject selection.', {});
  }
  res.json(await readActorIdentityChoices({ userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId,
    subjectKind, mechanicsSubjectRef: req.query.mechanicsSubjectRef }));
}));
storyWorkspaceRouter.get('/actor-mechanics-links/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await actorMechanicsLinkService().operation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: req.params.operationId }));
}));
storyWorkspaceRouter.get('/actor-mechanics-links/decisions/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await actorMechanicsLinkService().decisionOperation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: req.params.operationId }));
}));
storyWorkspaceRouter.post('/actor-mechanics-links/prepare', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['operationId', 'actorRef', 'subjectKind', 'parentActorRef', 'expectedRegistryRevision',
    'expectedWorkspaceRevision', 'expectedSceneRevision', 'vcsBinding']);
  res.json(await actorMechanicsLinkService().prepare({ ...req.body,
    userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId } as Parameters<ReturnType<typeof actorMechanicsLinkService>['prepare']>[0]));
}));
storyWorkspaceRouter.post('/actor-mechanics-links/confirm', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['decisionRef']);
  if (typeof req.body.decisionRef !== 'string') throw new StoryWorkspaceStoreError(422, 'ACTOR_LINK_INPUT_INVALID', 'The identity decision must be one exact reference.', {});
  res.json(await actorMechanicsLinkService().confirm({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, decisionRef: req.body.decisionRef }));
}));
storyWorkspaceRouter.post('/actor-mechanics-links/retire', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['operationId', 'linkRef', 'expectedRegistryRevision']);
  if (typeof req.body.operationId !== 'string' || typeof req.body.linkRef !== 'string' || typeof req.body.expectedRegistryRevision !== 'number') throw new StoryWorkspaceStoreError(422, 'ACTOR_LINK_INPUT_INVALID', 'The identity correction requires exact references and revision.', {});
  res.json(await actorMechanicsLinkService().retire({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: req.body.operationId, linkRef: req.body.linkRef,
    expectedRegistryRevision: req.body.expectedRegistryRevision }));
}));

storyWorkspaceRouter.get('/observation-authority', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (req.query.version !== undefined && !['1', '2', '3'].includes(String(req.query.version))) throw new StoryWorkspaceStoreError(422, 'QUALIFIED_OBSERVATION_INPUT_INVALID', 'Unsupported observation reader version.', {});
  if (req.query.version === '2' || req.query.version === '3') {
    if (Object.keys(req.query).some((key) => !['version', 'programId'].includes(key)) || typeof req.query.programId !== 'string') throw new StoryWorkspaceStoreError(422, 'QUALIFIED_OBSERVATION_INPUT_INVALID', 'Qualified observation requires one exact saved program.', {});
    res.json(await qualifiedObservationAuthorityService().read({ userId: (req as IntegrationRequest).userId,
      campaignId: req.params.campaignId, programId: req.query.programId, version: req.query.version }));
    return;
  }
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
  if (['gmc.observation-authority-commit/2', 'gmc.observation-authority-commit/3'].includes(body.schemaVersion)) {
    closedActorLinkBody(body, ['schemaVersion', 'programId', 'operationId', 'idempotencyKey', 'expectedArtifactRevision',
      'expectedWorkspaceRevision', 'expectedPreparedSceneRevision', 'bindingRecordRef', 'evidenceRef', 'nodeRef', 'groupId', 'movementReceiptRef', 'vcsProjection',
      ...(body.schemaVersion === 'gmc.observation-authority-commit/3' ? ['relocationLineageRef'] : [])]);
    const result = await qualifiedObservationAuthorityService().commit({ ...body, userId: (req as IntegrationRequest).userId,
      campaignId: req.params.campaignId } as QualifiedObservationCommit);
    res.status(result.duplicate ? 200 : 201).json(result);
    return;
  }
  if (body.schemaVersion !== undefined && body.schemaVersion !== 'gmc.observation-authority-commit/1') throw new StoryWorkspaceStoreError(422, 'QUALIFIED_OBSERVATION_INPUT_INVALID', 'Unsupported observation commit version.', {});
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

storyWorkspaceRouter.post('/scene-turns', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const userId = (req as IntegrationRequest).userId;
  const campaignId = req.params.campaignId;
  const [activeReality, activeStory] = await Promise.all([
    readActiveSceneReality({ userId, campaignId }),
    readActiveStoryWorkspace({ userId, campaignId }),
  ]);
  const realityBundle = activeReality && typeof activeReality.bundle === 'object'
    && activeReality.bundle !== null && !Array.isArray(activeReality.bundle)
    ? activeReality.bundle
    : null;
  const temporalEvaluation = realityBundle ? await evaluateCurrentSceneTemporalValidity({ userId, campaignId }, realityBundle) : null;
  if (temporalEvaluation && temporalEvaluation.decision !== 'valid') throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_VALIDITY_STALE', 'The prepared situation no longer has confirmed current timing conditions.',
    { decision: temporalEvaluation.decision, changedDimensions: temporalEvaluation.changedDimensions });
  const certifiedSettlement = realityBundle
    && typeof realityBundle.sceneKit === 'object' && realityBundle.sceneKit !== null && !Array.isArray(realityBundle.sceneKit)
    && activeStory
    && sceneRealitySupportsStorySettlement(
      activeReality,
      campaignId,
      activeStory.storyWorkspaceRef,
      activeStory.workspace,
      req.body,
      temporalEvaluation,
    );
  const sceneKit = certifiedSettlement ? realityBundle.sceneKit as JsonObject : undefined;
  const sceneStoryDesign = certifiedSettlement
    && typeof realityBundle.sceneStoryDesign === 'object'
    && realityBundle.sceneStoryDesign !== null
    && !Array.isArray(realityBundle.sceneStoryDesign)
    ? realityBundle.sceneStoryDesign as JsonObject
    : undefined;
  const result = await commitSceneTurn({
    userId,
    campaignId,
    proposal: req.body,
    sceneKit,
    sceneStoryDesign,
    certifiedIdentitySourceRefs: certifiedSettlement ? await readQualifiedSceneTurnIdentitySources({ userId, campaignId, bundle: realityBundle, proposal: req.body }) : [],
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-turns/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readSceneTurnOperation({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    operationId: req.params.operationId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'STORY_SCENE_TURN_RECEIPT_NOT_FOUND',
        message: 'No accepted Scene turn matches that operation.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.get('/conversation-history', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readConversationHistory({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    limit: Number(req.query.limit ?? CONVERSATION_HISTORY_LIMIT),
  }));
}));

storyWorkspaceRouter.get('/observation-authority/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (req.query.version !== undefined && !['1', '2', '3'].includes(String(req.query.version))) throw new StoryWorkspaceStoreError(422, 'QUALIFIED_OBSERVATION_INPUT_INVALID', 'Unsupported observation operation reader version.', {});
  if (req.query.version === '2' || req.query.version === '3') {
    if (Object.keys(req.query).some((key) => !['version', 'programId'].includes(key)) || typeof req.query.programId !== 'string') throw new StoryWorkspaceStoreError(422, 'QUALIFIED_OBSERVATION_INPUT_INVALID', 'Qualified observation lookup requires one exact saved program.', {});
    const result = await qualifiedObservationAuthorityService().operation({ userId: (req as IntegrationRequest).userId,
      campaignId: req.params.campaignId, programId: req.query.programId, operationId: req.params.operationId, version: req.query.version });
    res.json(result ?? { disposition: 'confirmed_absent' });
    return;
  }
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
    freeformBinding: body.freeformBinding,
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
  const freeform = await rewindFreeformTurns({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, boundarySequence: req.body?.boundarySequence });
  res.json(await rewindCompoundActionArtifacts({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    boundarySequence: req.body?.boundarySequence,
    rewindId: req.body?.rewindId,
  }).then((result) => ({ ...result, ...freeform })));
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

export function compoundActionAdvanceInput(input: {
  userId: string;
  campaignId: string;
  programId: string;
  body: {
    expectedRevision: number;
    idempotencyKey?: string;
    program?: JsonObject;
    cursor: JsonObject;
    appendReceipts?: JsonObject[];
    appendRebaseReceipts?: JsonObject[];
    appendIntentBindingReceipts?: JsonObject[];
    clarifications?: JsonObject[];
    rootFailure?: JsonObject | null;
    saga?: JsonObject;
  };
  idempotencyKey?: string;
}) {
  const body = input.body;
  return {
    userId: input.userId,
    campaignId: input.campaignId,
    programId: input.programId,
    expectedRevision: body.expectedRevision,
    idempotencyKey: body.idempotencyKey ?? input.idempotencyKey ?? '',
    program: body.program,
    cursor: body.cursor,
    appendReceipts: body.appendReceipts,
    appendRebaseReceipts: body.appendRebaseReceipts,
    appendIntentBindingReceipts: body.appendIntentBindingReceipts,
    clarifications: body.clarifications,
    rootFailure: body.rootFailure,
    saga: body.saga,
  };
}

storyWorkspaceRouter.put('/interaction-artifacts/:programId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await advanceCompoundActionArtifact(compoundActionAdvanceInput({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    programId: req.params.programId,
    body,
    idempotencyKey: req.header('Idempotency-Key') ?? undefined,
  }));
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
  const input = {
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedRevision: req.body?.expectedRevision,
    boundarySequence: req.body?.boundarySequence,
    rewindId: req.body?.rewindId,
    restoreStoryWorkspaceRef: req.body?.restoreStoryWorkspaceRef ?? null,
  };
  const result = await rewindStoryWorkspace(input);
  const conversationHistoryRewind = await recordConversationHistoryRewind(input);
  res.json({ ...result, conversationHistoryRewind });
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

storyWorkspaceRouter.get('/scene-reality', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readActiveSceneReality({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'SCENE_READINESS_CERTIFICATE_REQUIRED',
        message: 'The current Scene has not been prepared and certified for play.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.get('/scene-reality/inspection', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readSceneRealityInspection({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'SCENE_READINESS_CERTIFICATE_REQUIRED',
        message: 'The current Scene has no readiness dossier to inspect yet.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.get('/scene-reality/temporal-authority', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readSceneTemporalAuthority({ userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId,
    gmDecisions: req.query.gmDecisions === '1', analysis: req.query.analysis === '1' }));
}));

storyWorkspaceRouter.get('/scene-reality/timing/choices', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await sceneTemporalGmDecisionService().choices({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, offset: Number(req.query.offset ?? 0),
    catalogFingerprint: typeof req.query.catalogFingerprint === 'string' ? req.query.catalogFingerprint : undefined }));
}));
storyWorkspaceRouter.get('/scene-reality/timing/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const found = await sceneTemporalGmDecisionService().operation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: req.params.operationId });
  if (!found) { res.status(404).json({ error: 'SCENE_TEMPORAL_GM_OPERATION_NOT_FOUND' }); return; }
  res.json(found.receipt);
}));
storyWorkspaceRouter.get('/scene-reality/timing/preparations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const found = await sceneTemporalGmDecisionService().preparationOperation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: req.params.operationId });
  if (!found) { res.status(404).json({ error: 'SCENE_TEMPORAL_GM_PREPARATION_NOT_FOUND' }); return; }
  res.json({ decisionRef: found._id, requestFingerprint: found.requestFingerprint, expiresAt: found.expiresAt });
}));
storyWorkspaceRouter.post('/scene-reality/timing/prepare', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const b = req.body ?? {};
  res.json(await sceneTemporalGmDecisionService().prepare({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, operationId: b.operationId, expectedRevision: b.expectedRevision,
    expectedSourceHead: b.expectedSourceHead, catalogFingerprint: b.catalogFingerprint, choice: b.choice,
    confirmationToken: b.confirmationToken }));
}));
storyWorkspaceRouter.post('/scene-reality/timing/confirm', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const b = req.body ?? {};
  res.json(await sceneTemporalGmDecisionService().confirm({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, decisionRef: b.decisionRef, confirmationToken: b.confirmationToken,
    humanConfirmed: b.humanConfirmed }));
}));

storyWorkspaceRouter.post('/scene-reality/coverage', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await decideSceneCoverage({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    query: req.body,
  }));
}));

storyWorkspaceRouter.post('/scene-reality/compile-prepared-bindings', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await compileScenePreparedBindings({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, body: req.body }));
}));

storyWorkspaceRouter.get('/scene-reality/preparation-resumes/:resumeRef', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await readScenePreparationResume({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, resumeRef: req.params.resumeRef }));
}));
storyWorkspaceRouter.post('/scene-reality/review-issuance', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await issueScenePreparationReview({ userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId, body: req.body }));
}));

storyWorkspaceRouter.post('/scene-reality/commit', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const body = req.body ?? {};
  const result = await commitSceneReality({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    expectedPointerRevision: body.expectedPointerRevision,
    buildRequest: body.buildRequest,
    proposal: body.proposal,
    assessment: body.assessment,
    ...(body.pendingIntent !== undefined ? { pendingIntent: body.pendingIntent } : {}),
    ...(body.ownerPremisesReview !== undefined ? { ownerPremisesReview: body.ownerPremisesReview } : {}),
    ...(body.preparedBindingReview !== undefined ? { preparedBindingReview: body.preparedBindingReview } : {}),
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-reality/pending-intent/:programId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (Object.keys(req.query).some((key) => !['qualification', 'continuation', 'readEffects', 'typedReferences'].includes(key))
    || req.query.qualification !== undefined && req.query.qualification !== '1'
    || req.query.continuation !== undefined && req.query.continuation !== '1'
    || req.query.readEffects !== undefined && req.query.readEffects !== '1'
    || req.query.typedReferences !== undefined && req.query.typedReferences !== '1') {
    throw new StoryWorkspaceStoreError(422, 'OBSERVER_QUALIFICATION_INPUT_INVALID', 'The unfinished-action reader option is unsupported.', {});
  }
  res.json(await readScenePendingIntentContext({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, programId: req.params.programId,
    qualified: req.query.qualification === '1', continuation: req.query.continuation === '1', readEffects: req.query.readEffects === '1', typedReferences: req.query.typedReferences === '1' }));
}));

storyWorkspaceRouter.get('/pending-reference-qualifications/operations/:programId/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (Object.keys(req.query).length) throw new StoryWorkspaceStoreError(422, 'PENDING_REFERENCE_INPUT_INVALID', 'Unsupported saved-reference reader fields.', {});
  res.json(await pendingReferenceQualificationService().operation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, programId: req.params.programId, operationId: req.params.operationId }) ?? { disposition: 'confirmed_absent' });
}));
storyWorkspaceRouter.post('/pending-reference-qualifications/commit', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['schemaVersion', 'operationId', 'idempotencyKey', 'programId', 'expectedArtifactRevision']);
  const result = await pendingReferenceQualificationService().commit({ ...req.body,
    userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId } as PendingReferenceQualificationCommit);
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-movement-outcomes/expectation/:programId/:nodeRef', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (Object.keys(req.query).length) throw new StoryWorkspaceStoreError(422, 'SCENE_MOVEMENT_OUTCOME_INVALID', 'Unsupported movement reader fields.', {});
  res.json(await sceneMovementOutcomeService().expectation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, programId: req.params.programId, nodeRef: req.params.nodeRef }));
}));
storyWorkspaceRouter.get('/scene-movement-outcomes/operations/:programId/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  if (Object.keys(req.query).length) throw new StoryWorkspaceStoreError(422, 'SCENE_MOVEMENT_OUTCOME_INVALID', 'Unsupported movement reader fields.', {});
  const receipt = await sceneMovementOutcomeService().operation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, programId: req.params.programId, operationId: req.params.operationId });
  res.json(receipt ?? { disposition: 'confirmed_absent' });
}));
storyWorkspaceRouter.post('/scene-movement-outcomes/commit', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['schemaVersion', 'operationId', 'idempotencyKey', 'programId', 'nodeRef',
    'expectedArtifactRevision', 'expectedWorkspaceRevision', 'expectedPreparedSceneRevision', 'expectedActiveSceneRevision',
    'sourceSceneTurnReceiptRef', 'expectation', 'proposal', 'sourceKind', 'humanDecision',
    ...(req.body?.schemaVersion === 'gmc.scene-movement-outcome-commit/2' ? ['selectedCheckSource'] : [])]);
  const result = await sceneMovementOutcomeService().commit({ ...req.body,
    userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId } as SceneMovementOutcomeCommit);
  res.status(result.duplicate ? 200 : 201).json(result);
}));

storyWorkspaceRouter.get('/scene-reality/observer-origins/operations/:programId/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  res.json(await pendingObserverEvidenceService().originOperation({ userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId, programId: req.params.programId, operationId: req.params.operationId }));
}));
storyWorkspaceRouter.post('/scene-reality/observer-origins', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  closedActorLinkBody(req.body, ['operationId', 'programId', 'actorLinkRef', 'expectedWindowFingerprint', 'description']);
  res.json(await pendingObserverEvidenceService().confirmOrigin({ ...req.body,
    userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId } as Parameters<ReturnType<typeof pendingObserverEvidenceService>['confirmOrigin']>[0]));
}));
storyWorkspaceRouter.post('/scene-reality/observer-qualifications', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const fields = ['programId', 'nodeRef', 'groupId', 'actorLinkRef', 'expectedWindowFingerprint', 'vcsProjection'];
  if (Object.hasOwn(req.body ?? {}, 'schemaVersion')) {
    if (req.body.schemaVersion !== 'gmc.pending-observer-qualification/2') throw new StoryWorkspaceStoreError(422, 'OBSERVER_QUALIFICATION_INPUT_INVALID', 'Unsupported observer qualification version.', {});
    fields.push('schemaVersion');
  }
  closedActorLinkBody(req.body, Object.hasOwn(req.body ?? {}, 'originRef') ? [...fields, 'originRef'] : fields);
  res.json(await pendingObserverEvidenceService().qualify({ ...req.body,
    userId: (req as IntegrationRequest).userId, campaignId: req.params.campaignId } as Parameters<ReturnType<typeof pendingObserverEvidenceService>['qualify']>[0]));
}));

storyWorkspaceRouter.get('/scene-reality/operations/:operationId', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await readSceneRealityOperation({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    operationId: req.params.operationId,
  });
  if (!result) {
    res.status(404).json({
      error: {
        code: 'SCENE_REALITY_OPERATION_NOT_FOUND',
        message: 'No matching Scene preparation operation was found.',
        correlationId: correlationId(req),
        details: {},
      },
    });
    return;
  }
  res.json(result);
}));

storyWorkspaceRouter.post('/scene-reality/fact-selections', requireServiceIntegration, asyncRoute(async (req, res) => {
  if (!await requireCampaign(req, res)) return;
  const result = await selectPreparedStoryFacts({
    userId: (req as IntegrationRequest).userId,
    campaignId: req.params.campaignId,
    proposal: req.body,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
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
    activeSceneState: {
      capabilities: ACTIVE_SCENE_CAPABILITIES,
      activeSceneState: ACTIVE_SCENE_STATE_CONTRACT_VERSION,
      activeSceneContext: ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
      sceneStateDelta: SCENE_STATE_DELTA_CONTRACT_VERSION,
      sceneTurnProposal: SCENE_TURN_PROPOSAL_CONTRACT_VERSION,
      sceneTurnReceipt: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
      sceneTurnProposalV2: SCENE_TURN_PROPOSAL_V2_CONTRACT_VERSION,
      sceneTurnReceiptV2: SCENE_TURN_RECEIPT_V2_CONTRACT_VERSION,
      publishedExchange: PUBLISHED_EXCHANGE_CONTRACT_VERSION,
      conversationHistory: CONVERSATION_HISTORY_CONTRACT_VERSION,
      maximumStateBytes: ACTIVE_SCENE_STATE_MAX_BYTES,
      maximumContextBytes: ACTIVE_SCENE_CONTEXT_MAX_BYTES,
      maximumProposalBytes: SCENE_TURN_PROPOSAL_MAX_BYTES,
      maximumProposalV2Bytes: SCENE_TURN_PROPOSAL_V2_MAX_BYTES,
      maximumConversationHistoryBytes: CONVERSATION_HISTORY_MAX_BYTES,
      maximumConversationHistoryInteractions: CONVERSATION_HISTORY_LIMIT,
      authority: 'gmc',
      routeEnabled: true,
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
    sceneReality: sceneRealityHealthAdvertisement(),
    compoundActions: {
      artifactStore: COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION,
      readableSemanticActionPrograms: COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS,
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
