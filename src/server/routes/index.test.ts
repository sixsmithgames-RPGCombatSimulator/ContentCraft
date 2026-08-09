import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTION_DIRECTED_STORY_CAPABILITIES,
  STORY_OBLIGATION_CAPABILITIES,
} from '../services/storyWorkspaceStore.js';
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
      version: '1.9.19',
      contracts: {
        actionDirectedStory: {
          capabilities: ACTION_DIRECTED_STORY_CAPABILITIES,
          contracts: {
            migrationPreview: 'gmc.story-migration-preview/1',
            acceptedV1SceneSnapshot: 'gma.accepted-v1-scene-snapshot/1',
          },
          authority: 'gmc',
          routeEnabled: false,
        },
        storyObligations: {
          capabilities: STORY_OBLIGATION_CAPABILITIES,
          contracts: {
            sceneStoryDesign: 'gmc.scene-story-design/1',
            storyAffordanceProjection: 'gma.story-affordance-projection/1',
            storySatisfactionReceipt: 'gma.story-satisfaction-receipt/1',
          },
          authority: 'gmc',
          routeEnabled: false,
        },
      },
    });
  });
});
