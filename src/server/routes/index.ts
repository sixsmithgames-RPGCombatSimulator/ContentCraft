/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { projectRouter } from './projects.js';
import { contentRouter } from './content.js';
import { runsRouter } from './runs.js';
import { canonRouter } from './canon.js';
import { configRouter } from './config.js';
import { uploadRouter } from './upload.js';
import { homebrewRouter } from './homebrew.js';
import factCheckRouter from './factCheck.js';
import { progressRouter } from './progress.js';
import { aiRouter } from './ai.js';
import { gmcV1Router } from './gmcV1.js';
import { GMC_VERSION } from '../serviceVersion.js';
import {
  GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES,
  GMA_SCENE_PLAN_REFERENCE_CONTRACT_VERSION,
  GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
  GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
} from '../services/gmaScenePlanStore.js';
import {
  GMA_LOCATION_ROUTING_CONTRACT_VERSION,
  NARRATION_EVIDENCE_CONTRACT_VERSION,
  PREVIOUS_NARRATION_EVIDENCE_CONTRACT_VERSION,
  PREVIOUS_WORLD_GENERATION_POLICY_VERSION,
  WORLD_GENERATION_POLICY_VERSION,
} from '../services/gmcIntegrationStore.js';
import {
  ACTION_DIRECTED_STORY_CAPABILITIES,
  PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
  PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
  SCENE_HANDOFF_PROPOSAL_CONTRACT_VERSION,
  SCENE_KIT_V2_CONTRACT_VERSION,
  STORY_DELTA_CONTRACT_VERSION,
  STORY_DELTA_V2_CONTRACT_VERSION,
  STORY_GRAPH_CONTRACT_VERSION,
  STORY_GRAPH_NODE_REFERENCE_CONTRACT_VERSION,
  STORY_PROMPT_PROJECTION_MAX_BYTES,
  STORY_PUBLIC_PROJECTION_CONTRACT_VERSION,
  STORY_TURN_INTENT_CONTRACT_VERSION,
  STORY_WORKSPACE_CONTRACT_VERSION,
  STORY_WORKSPACE_MAX_BYTES,
  STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
} from '../services/storyWorkspaceStore.js';
import { NPC_IDENTITY_PROMOTION_CONTRACT_VERSION } from '../services/npcIdentityPromotion.js';

export const apiRouter = Router();

apiRouter.use('/projects', projectRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/canon', canonRouter);
apiRouter.use('/canon/fact-check', factCheckRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/homebrew', homebrewRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/gmc/v1', gmcV1Router);
apiRouter.use('/', progressRouter);

apiRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'gamemastercraft',
    version: GMC_VERSION,
    message: 'GameMasterCraft API is running',
    contracts: {
      gmaScenePlanStore: {
        contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
        referenceContractVersion: GMA_SCENE_PLAN_REFERENCE_CONTRACT_VERSION,
        schemaVersions: GMA_SCENE_PLAN_SCHEMA_ALLOWLIST,
        maximumPrivatePayloadBytes: GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES,
        access: 'service_only',
      },
      gmaSceneStoryRouting: {
        locationRoutingContractVersion: GMA_LOCATION_ROUTING_CONTRACT_VERSION,
        narrationEvidenceContractVersion: NARRATION_EVIDENCE_CONTRACT_VERSION,
        acceptedNarrationEvidenceContractVersions: [
          PREVIOUS_NARRATION_EVIDENCE_CONTRACT_VERSION,
          NARRATION_EVIDENCE_CONTRACT_VERSION,
        ],
        worldGenerationPolicyContractVersion: WORLD_GENERATION_POLICY_VERSION,
        acceptedWorldGenerationPolicyContractVersions: [
          PREVIOUS_WORLD_GENERATION_POLICY_VERSION,
          WORLD_GENERATION_POLICY_VERSION,
        ],
      },
      storyPreparation: {
        workspaceContractVersion: STORY_WORKSPACE_CONTRACT_VERSION,
        workspaceReferenceContractVersion: STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
        storyDeltaContractVersion: STORY_DELTA_CONTRACT_VERSION,
        publicProjectionContractVersion: STORY_PUBLIC_PROJECTION_CONTRACT_VERSION,
        playableProjectionContractVersion: PLAYABLE_STORY_PROJECTION_CONTRACT_VERSION,
        npcIdentityPromotionContractVersion: NPC_IDENTITY_PROMOTION_CONTRACT_VERSION,
        maximumWorkspaceBytes: STORY_WORKSPACE_MAX_BYTES,
        maximumPlayableProjectionBytes: STORY_PROMPT_PROJECTION_MAX_BYTES,
        authority: 'gmc',
      },
      actionDirectedStory: {
        capabilities: ACTION_DIRECTED_STORY_CAPABILITIES,
        contracts: {
          storyTurnIntent: STORY_TURN_INTENT_CONTRACT_VERSION,
          storyGraph: STORY_GRAPH_CONTRACT_VERSION,
          storyNodeRef: STORY_GRAPH_NODE_REFERENCE_CONTRACT_VERSION,
          sceneHandoffProposal: SCENE_HANDOFF_PROPOSAL_CONTRACT_VERSION,
          sceneKit: SCENE_KIT_V2_CONTRACT_VERSION,
          playableSceneContext: PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
          storyDelta: STORY_DELTA_V2_CONTRACT_VERSION,
        },
        authority: 'gmc',
        routeEnabled: false,
      },
    },
  });
});
