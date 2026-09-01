import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTION_DIRECTED_STORY_CAPABILITIES,
  ACTION_DIRECTED_STORY_PLAYABLE_SCENE_CONTEXT_READ_VERSIONS,
  ACTION_DIRECTED_STORY_SCENE_KIT_READ_VERSIONS,
  STORY_OBLIGATION_CAPABILITIES,
} from '../services/storyWorkspaceStore.js';
import {
  COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS,
  GMC_COMPOUND_ACTION_CAPABILITIES,
  GMC_COMPOUND_ACTION_CONTRACTS,
} from '../services/compoundActionArtifactStore.js';
import {
  OBSERVATION_SAGA_CAPABILITIES,
  OBSERVATION_SAGA_SHARED_CONTRACTS,
  OBSERVATION_SAGA_SHARED_WRITER_BUNDLE_VERSION,
} from '../services/observationAuthorityService.js';
import {
  ACTIVE_SCENE_CAPABILITIES,
  ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
  ACTIVE_SCENE_STATE_CONTRACT_VERSION,
  SCENE_STATE_DELTA_CONTRACT_VERSION,
  SCENE_TURN_PROPOSAL_CONTRACT_VERSION,
  SCENE_TURN_RECEIPT_CONTRACT_VERSION,
} from '../services/activeSceneStateStore.js';
import { apiRouter } from './index.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('API health', () => {
  it('advertises the complete D2 authority bundle without authentication', async () => {
    const app = express();
    app.use('/api', apiRouter);
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: 'healthy',
      service: 'gamemastercraft',
      version: '1.11.40',
      contracts: {
        actionDirectedStory: {
          capabilities: ACTION_DIRECTED_STORY_CAPABILITIES,
          contracts: {
            migrationPreview: 'gmc.story-migration-preview/1',
            acceptedV1SceneSnapshot: 'gma.accepted-v1-scene-snapshot/1',
            sceneHandoffReceipt: 'gmc.scene-handoff-receipt/1',
            storyMutationReceipt: 'gmc.story-mutation-receipt/1',
            sceneKitReadVersions: ACTION_DIRECTED_STORY_SCENE_KIT_READ_VERSIONS,
            playableSceneContextReadVersions: ACTION_DIRECTED_STORY_PLAYABLE_SCENE_CONTEXT_READ_VERSIONS,
          },
          authority: 'gmc',
          routeEnabled: false,
        },
        storyObligations: {
          capabilities: STORY_OBLIGATION_CAPABILITIES,
          contracts: {
            sceneStoryDesign: 'gmc.scene-story-design/2',
            storyAffordanceProjection: 'gma.story-affordance-projection/2',
            storySatisfactionReceipt: 'gma.story-satisfaction-receipt/1',
          },
          authority: 'gmc',
          routeEnabled: false,
        },
        activeSceneState: {
          capabilities: ACTIVE_SCENE_CAPABILITIES,
          contracts: {
            activeSceneState: ACTIVE_SCENE_STATE_CONTRACT_VERSION,
            activeSceneContext: ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
            sceneStateDelta: SCENE_STATE_DELTA_CONTRACT_VERSION,
            sceneTurnProposal: SCENE_TURN_PROPOSAL_CONTRACT_VERSION,
            sceneTurnReceipt: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
          },
          authority: 'gmc',
          mechanicsAuthority: 'vcs',
          transcriptAuthority: false,
          routeEnabled: true,
        },
        campaignTime: {
          capabilities: ['campaign-clock-mutation-receipt/1'],
          contracts: { mutationReceipt: 'gmc.campaign-clock-mutation-receipt/1' },
          authority: 'gmc',
          access: 'service_only',
          routeEnabled: true,
        },
        compoundActions: {
          capabilities: GMC_COMPOUND_ACTION_CAPABILITIES,
          contracts: GMC_COMPOUND_ACTION_CONTRACTS,
          artifactStoreContractVersion: 'gmc.compound-action-artifact-store/2',
          readableSemanticActionPrograms: COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS,
          requirementProjectionContractVersion: 'gmc.compound-action-requirement-projection/1',
          authority: 'gmc',
          persistence: 'non_canonical_interaction',
          access: 'service_only',
          routeEnabled: false,
        },
        observationSaga: {
          sharedWriterBundle: OBSERVATION_SAGA_SHARED_WRITER_BUNDLE_VERSION,
          capabilities: OBSERVATION_SAGA_CAPABILITIES,
          sharedContracts: OBSERVATION_SAGA_SHARED_CONTRACTS,
          authority: 'gmc',
          access: 'service_only',
          routeEnabled: true,
          conformance: true,
        },
      },
    });
    expect(ACTION_DIRECTED_STORY_CAPABILITIES).toEqual([
      'action-directed-scene-handoff/1',
      'scene-handoff-receipt-reconciliation/1',
      'current-scene-handoff-receipt/1',
      'story-outcome-receipt-reconciliation/1',
      'nested-story-graph/1',
      'single-playable-scene-authority/1',
      'combined-manual-story-turn/1',
    ]);
    expect(ACTION_DIRECTED_STORY_CAPABILITIES).not.toContain('typed-observation-authority/1');
    expect(ACTION_DIRECTED_STORY_CAPABILITIES).not.toContain('atomic-observation-scene-write/1');
    expect(ACTION_DIRECTED_STORY_SCENE_KIT_READ_VERSIONS).toEqual([
      'gmc.scene-kit/2', 'gmc.scene-kit/3', 'gmc.scene-kit/4',
    ]);
    expect(ACTION_DIRECTED_STORY_PLAYABLE_SCENE_CONTEXT_READ_VERSIONS).toEqual([
      'gma.playable-scene-context/2', 'gma.playable-scene-context/3', 'gma.playable-scene-context/4',
    ]);
    expect(OBSERVATION_SAGA_SHARED_CONTRACTS.semanticActionCompilerPolicy).toBe('gma.semantic-action-compiler-policy/9');
  });
});
