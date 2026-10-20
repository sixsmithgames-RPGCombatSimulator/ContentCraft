import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { storyWorkspaceRouter } from './storyWorkspace.js';
import { ProjectModel } from '../models/Project.js';
import type { IntegrationRequest } from '../middleware/integrationAuth.js';
import * as observation from '../services/qualifiedObservationAuthorityService.js';
import { assertFreeformProgramWorkflowOpen } from '../services/freeformWorkflowAuthority.js';
import type { FreeformTurnDocument } from '../services/freeformTurnStore.js';
import { OrchestratorError } from '../llm-orchestrator/errors.js';

const servers: ReturnType<ReturnType<typeof express>['listen']>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});
const scope = { userId: 'owner:one', campaignId: 'campaign:one', programId: 'program:interaction:one' };
const binding = { policyVersion: 'gma.freeform-intake-policy/4', ticket: 'ticket:one', interactionId: 'interaction:one',
  instructionRef: 'gma:instruction:interaction:one', ticketDisposition: 'owner_accepted' };
async function server() {
  vi.spyOn(ProjectModel, 'findById').mockResolvedValue({ _id: scope.campaignId } as never);
  const app = express(), unexpected = vi.fn(); app.use(express.json());
  app.use((req, _res, next) => { (req as IntegrationRequest).userId = scope.userId;
    (req as IntegrationRequest).integrationAuth = 'service'; next(); });
  app.use('/story', storyWorkspaceRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    unexpected(error); res.status(500).json({error:{code:'UNEXPECTED_TEST_ERROR'}});
  });
  const running = app.listen(0); servers.push(running);
  await new Promise<void>((resolve) => running.once('listening', resolve));
  return { base: `http://127.0.0.1:${(running.address() as AddressInfo).port}/story`, unexpected };
}
for (const status of ['completed', 'retired'] as const) it(`returns a clear typed denial for ${status} roots, while saved receipt discovery stays readable`, async () => {
  const write = vi.fn();
  const read = vi.fn(async () => {
    await assertFreeformProgramWorkflowOpen(scope, binding, { reader: async () => ({
      userId:scope.userId,campaignId:scope.campaignId,
      turn:{campaignId:scope.campaignId,status,activeWindowRef:'window:one',windows:[{windowId:'window:one',
        ticketRef:binding.ticket,instructionRef:binding.instructionRef,programRef:scope.programId,status:'completed'}]},
    } as unknown as FreeformTurnDocument) });
    write(); return {};
  });
  const receipt = {schemaVersion:'gmc.observation-authority-receipt/3',disposition:'committed',receiptRef:'accepted:original'};
  const operation = vi.fn(async () => receipt);
  vi.spyOn(observation,'qualifiedObservationAuthorityService').mockReturnValue({read,operation,commit:write} as never);
  const {base,unexpected}=await server();
  const response=await fetch(`${base}/observation-authority?version=3&programId=${encodeURIComponent(scope.programId)}`,
    {headers:{'X-Sixsmith-Correlation-Id':'proof:closed'}});
  expect(response.status).toBe(409);
  const body=await response.json();
  expect(body.error.code).toBe('FREEFORM_WORKFLOW_CLOSED'); expect(body.error.correlationId).toBe('proof:closed');
  expect(body.error.message).toMatch(/could not continue.*no longer open.*applied nothing.*completed steps are safe.*Return to Story/);
  expect(body.error.message).not.toMatch(/schema|Orchestrator|protected intake|current disposition|database|HTTP|retry|repair/i);
  expect(unexpected).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  const saved=await fetch(`${base}/observation-authority/operations/activation:original?version=3&programId=${encodeURIComponent(scope.programId)}`);
  expect(saved.status).toBe(200); expect(await saved.json()).toEqual(receipt);
  expect(operation).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
});
it('does not classify lookalike or unrelated exceptions as a closed action or expose their text',async()=>{
  let error: unknown = {code:'FREEFORM_WORKFLOW_CLOSED',status:409,message:'private secret text'};
  vi.spyOn(observation,'qualifiedObservationAuthorityService').mockReturnValue({read:async()=>{throw error;}} as never);
  const {base,unexpected}=await server();
  for (const value of [error,new OrchestratorError({code:'DIFFERENT_POLICY_ERROR',category:'policy',message:'private secret text'})]) {
    error=value;
    const response=await fetch(`${base}/observation-authority?version=3&programId=program:one`);
    expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('private secret');
  }
  expect(unexpected).toHaveBeenCalledTimes(2);
});
