import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectModel } from '../models/Project.js';
import * as artifacts from '../services/compoundActionArtifactStore.js';
import type { IntegrationRequest } from '../middleware/integrationAuth.js';
import { compoundActionAdvanceInput, storyWorkspaceRouter } from './storyWorkspace.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('D2 Story authority routes', () => {
  it('rejects coercible identity references and unknown operation versions before opening an owner writer', async () => {
    vi.spyOn(ProjectModel, 'findById').mockResolvedValue({ _id: 'fictional-campaign' } as any);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { (req as IntegrationRequest).userId = 'fictional-user'; (req as IntegrationRequest).integrationAuth = 'service'; next(); });
    app.use('/campaigns/:campaignId/story', storyWorkspaceRouter);
    const server = app.listen(0); servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/campaigns/fictional-campaign/story`;
    for (const [path, body] of [
      ['/actor-mechanics-links/confirm', { decisionRef: ['decision:forged'] }],
      ['/actor-mechanics-links/confirm', { decisionRef: { id: 'decision:forged' } }],
      ['/actor-mechanics-links/retire', { operationId: 'retire:one', linkRef: 'link:one', expectedRegistryRevision: '1' }],
      ['/actor-mechanics-links/retire', { operationId: ['retire:one'], linkRef: 'link:one', expectedRegistryRevision: 1 }],
      ['/actor-mechanics-links/confirm', { decisionRef: 'decision:one', userId: 'forged-owner' }],
    ] as const) {
      const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      expect(response.status).toBe(422); expect((await response.json()).error.code).toBe('ACTOR_LINK_INPUT_INVALID');
    }
    const unknown = await fetch(`${base}/observation-authority/operations/activate:one?version=99&programId=program:one`);
    expect(unknown.status).toBe(422); expect((await unknown.json()).error.code).toBe('QUALIFIED_OBSERVATION_INPUT_INVALID');
  });
  it('forwards protected freeform provenance to the owner rather than dropping the binding', async () => {
    vi.spyOn(ProjectModel, 'findById').mockResolvedValue({ _id: 'fictional-campaign' } as any);
    const create = vi.spyOn(artifacts, 'createCompoundActionArtifact').mockResolvedValue({ artifactRef: {} as any, duplicate: false });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { (req as IntegrationRequest).userId = 'fictional-user'; (req as IntegrationRequest).integrationAuth = 'service'; next(); });
    app.use('/campaigns/:campaignId/story', storyWorkspaceRouter);
    const server = app.listen(0); servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const binding = { schemaVersion: 'gma.freeform-plan-binding/1', ticket: 'fictional-ticket' };
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/campaigns/fictional-campaign/story/interaction-artifacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'fictional-key', freeformBinding: binding }),
    });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'fictional-user', campaignId: 'fictional-campaign', freeformBinding: binding }));
  });
  it('forwards Scene-authority rebase receipts through the compound artifact route mapping', () => {
    const receipt = { schemaVersion: 'gma.action-program-rebase-receipt/2', receiptId: 'rebase:one' };
    const binding = { schemaVersion: 'gma.action-intent-binding-receipt/1', receiptId: 'intent-binding:one' };
    const mapped = compoundActionAdvanceInput({
      userId: 'user-1', campaignId: 'campaign-1', programId: 'program-1', idempotencyKey: 'header-key',
      body: { expectedRevision: 4, cursor: { revision: 5 }, appendRebaseReceipts: [receipt], appendIntentBindingReceipts: [binding] },
    });
    expect(mapped.appendRebaseReceipts).toEqual([receipt]);
    expect(mapped.appendIntentBindingReceipts).toEqual([binding]);
    expect(mapped.idempotencyKey).toBe('header-key');
  });

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
      ['GET', '/scene-handoffs/scene-handoff%3Aturn-1'],
      ['GET', '/scene-context'],
      ['POST', '/scene-turns'],
      ['GET', '/scene-turns/operations/scene-turn%3Aturn-1%3Aresult'],
      ['GET', '/conversation-history'],
      ['GET', '/observation-authority'],
      ['GET', '/observation-authority?version=2&programId=program-1'],
      ['GET', '/actor-mechanics-links'],
      ['GET', '/actor-mechanics-links/choices'],
      ['GET', '/actor-mechanics-links/operations/link-1'],
      ['GET', '/actor-mechanics-links/decisions/link-1'],
      ['POST', '/actor-mechanics-links/prepare'],
      ['POST', '/actor-mechanics-links/confirm'],
      ['POST', '/actor-mechanics-links/retire'],
      ['GET', '/scene-reality/pending-intent/program-1'],
      ['GET', '/scene-reality/pending-intent/program-1?qualification=1'],
      ['POST', '/scene-reality/observer-origins'],
      ['POST', '/scene-reality/observer-qualifications'],
      ['POST', '/scene-reality/commit'],
      ['POST', '/observation-authority/commit'],
      ['GET', '/observation-authority/operations/operation-1'],
      ['GET', '/observation-authority/operations/operation-1?version=2&programId=program-1'],
      ['POST', '/interaction-artifacts'],
      ['POST', '/interaction-artifacts/requirements'],
      ['POST', '/interaction-artifacts/rewind'],
      ['POST', '/interaction-artifacts/replay-checkpoint'],
      ['GET', '/interaction-artifacts/program-1'],
      ['PUT', '/interaction-artifacts/program-1'],
      ['POST', '/interaction-artifacts/program-1/settle'],
      ['GET', '/interaction-artifacts/program-1/operations/operation-1'],
      ['POST', '/interaction-artifacts/program-1/tombstone'],
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
