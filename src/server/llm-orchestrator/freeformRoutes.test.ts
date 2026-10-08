import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmOrchestratorRouter } from './routes.js';
import type { IntegrationRequest } from '../middleware/integrationAuth.js';
import { ProjectModel } from '../models/Project.js';
import * as mongo from '../config/mongo.js';
import * as orchestrator from './orchestrator.js';

const servers: ReturnType<ReturnType<typeof express>['listen']>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});
async function serverFor(auth: 'clerk' | 'service') {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as IntegrationRequest).userId = 'fictional-user'; (req as IntegrationRequest).integrationAuth = auth; next(); });
  app.use('/llm', llmOrchestratorRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: { code: error.code } }));
  const server = app.listen(0); servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/llm`;
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('protected compact intake HTTP boundaries', () => {
  it('rejects browser ticket issuance and retirement before any private read or write', async () => {
    const project = vi.spyOn(ProjectModel, 'findById');
    const database = vi.spyOn(mongo, 'getDb');
    const base = await serverFor('clerk');
    for (const path of ['/freeform-tickets', '/freeform-tickets/fictional/retire']) {
      const response = await post(base + path, { campaignId: 'fictional-campaign' });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_AUTH_REQUIRED' } });
    }
    expect(project).not.toHaveBeenCalled(); expect(database).not.toHaveBeenCalled();
    const context = await fetch(base + '/freeform-tickets/fictional/context?campaignId=fictional-campaign');
    expect(context.status).toBe(403); expect(database).not.toHaveBeenCalled();
  });
  it('does not turn a missing Manual reply into integrated model execution', async () => {
    const execute = vi.spyOn(orchestrator, 'executeLlmOperation');
    const base = await serverFor('service');
    const response = await post(base + '/validate-manual', { request: { operation: 'input.freeform.interpret' } });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'MANUAL_OUTPUT_REQUIRED' } });
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects unowned campaigns and unapproved packet fields before staging or provider work', async () => {
    const project = vi.spyOn(ProjectModel, 'findById').mockResolvedValue(null);
    const database = vi.spyOn(mongo, 'getDb');
    const execute = vi.spyOn(orchestrator, 'executeLlmOperation');
    const base = await serverFor('service');
    const body = { campaignId: 'another-campaign', interactionId: 'fictional-turn', issuanceKey: 'fictional-key',
      mode: 'action', transport: 'manual', selectedActorRef: null };
    let response = await post(base + '/freeform-tickets', body);
    expect(response.status).toBe(404);
    expect(project).toHaveBeenCalledWith('fictional-user', 'another-campaign');
    response = await post(base + '/freeform-tickets', { campaignId: 'fictional-campaign', context: { private: 'not allowed' } });
    expect(response.status).toBe(422);
    expect(database).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it('rejects query-shaped or incomplete identifiers before reading any owned data', async () => {
    const project = vi.spyOn(ProjectModel, 'findById');
    const database = vi.spyOn(mongo, 'getDb');
    const base = await serverFor('service');
    const body = { campaignId: 'fictional-campaign', interactionId: 'fictional-turn', issuanceKey: 'fictional-key',
      mode: 'action', transport: 'manual', selectedActorRef: null };
    for (const bad of [{ ...body, interactionId: { $ne: null } }, { ...body, previousTicket: { $ne: null } },
      { ...body, selectedActorRef: { $ne: null } }, { campaignId: 'fictional-campaign' }]) {
      expect((await post(base + '/freeform-tickets', bad)).status).toBe(422);
    }
    expect(project).not.toHaveBeenCalled(); expect(database).not.toHaveBeenCalled();
  });
});
