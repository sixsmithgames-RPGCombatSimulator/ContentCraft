import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntegrationRequest } from '../middleware/integrationAuth.js';
import { storyWorkspaceRouter } from './storyWorkspace.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('D2 Story authority routes', () => {
  it('rejects direct Clerk calls before private reads or authority mutations run', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const integrationRequest = req as IntegrationRequest;
      integrationRequest.userId = 'user-1';
      integrationRequest.integrationAuth = 'clerk';
      next();
    });
    app.use('/campaigns/:campaignId/story', storyWorkspaceRouter);
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/campaigns/campaign-1/story`;

    for (const [method, path] of [
      ['POST', '/deltas-v2'],
      ['PUT', '/graph'],
      ['POST', '/migrate-v2'],
      ['POST', '/migration-preview'],
      ['POST', '/scene-handoffs'],
      ['GET', '/scene-context'],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      expect(response.status, `${method} ${path}`).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'SERVICE_AUTH_REQUIRED' },
      });
    }
  });
});
