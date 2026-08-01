import { describe, expect, it } from 'vitest';
import { createUniversalRequest } from './orchestrator.js';
import { getOperationDefinition } from './operationRegistry.js';
import {
  hydrateReferenceContext,
  resolveOperationContext,
  type ReferenceContextLoader,
} from './contextResolver.js';
import { OrchestratorError } from './errors.js';

function request() {
  return createUniversalRequest({
    operation: 'narration.generate',
    taskId: 'task-context',
    correlationId: 'correlation-context',
    idempotencyKey: 'idempotency-context',
    references: {
      campaignId: 'campaign-1',
      canonVersion: 'canon-r1',
      sceneId: 'scene-1',
      sceneVersion: 'scene-r1',
    },
    context: {
      input: { label: 'user_text', value: { instruction: 'Continue.' } },
    },
  });
}

describe('operation-owned reference context', () => {
  it('hydrates only missing allowlisted layers through a tenant-aware loader', async () => {
    const req = request();
    const calls: any[] = [];
    const loader: ReferenceContextLoader = {
      async load(input) {
        calls.push(input);
        return {
          campaign: { label: 'retrieved_authority_data', revision: 'canon-r1', value: { id: 'campaign-1' } },
          scene: { label: 'retrieved_authority_data', revision: 'scene-r1', value: { id: 'scene-1' } },
        };
      },
    };
    const hydrated = await hydrateReferenceContext({
      userId: 'user-1',
      request: req,
      operation: getOperationDefinition(req.operation),
      loader,
    });
    expect(calls[0].userId).toBe('user-1');
    expect(calls[0].missingLayers).toEqual(['campaign', 'scene']);
    expect(hydrated.context.campaign?.revision).toBe('canon-r1');
    expect(hydrated.context.scene?.revision).toBe('scene-r1');
  });

  it('fails closed when a referenced record is outside tenant ownership', async () => {
    const req = request();
    const loader: ReferenceContextLoader = {
      async load() {
        throw new OrchestratorError({
          code: 'REFERENCE_NOT_OWNED',
          category: 'context',
          message: 'not owned',
          status: 404,
        });
      },
    };
    await expect(hydrateReferenceContext({
      userId: 'wrong-user',
      request: req,
      operation: getOperationDefinition(req.operation),
      loader,
    })).rejects.toMatchObject({ code: 'REFERENCE_NOT_OWNED' });
  });

  it('changes cache identity when an authority revision changes', () => {
    const req = request();
    req.context.campaign = { label: 'retrieved_authority_data', revision: 'canon-r1', value: { id: 'campaign-1' } };
    req.context.scene = { label: 'retrieved_authority_data', revision: 'scene-r1', value: { id: 'scene-1' } };
    const operation = getOperationDefinition(req.operation);
    const first = resolveOperationContext(req, operation);
    const next = structuredClone(req);
    next.references.sceneVersion = 'scene-r2';
    next.context.scene.revision = 'scene-r2';
    expect(resolveOperationContext(next, operation).cacheKey).not.toBe(first.cacheKey);
  });

  it('keeps adaptive targets as telemetry and rejects the operation hard ceiling', () => {
    const req = request();
    req.references = {};
    req.context.input.value = { instruction: 'x'.repeat(80_000) };
    const operation = getOperationDefinition(req.operation);
    const target = resolveOperationContext(req, operation);
    expect(target.targetExceeded).toBe(true);
    expect(target.totalBytes).toBeGreaterThan(operation.context.inputTargetBytes);
    expect(target.totalBytes).toBeLessThan(operation.context.inputHardLimitBytes);

    req.context.input.value = { instruction: 'x'.repeat(2_100_000) };
    expect(() => resolveOperationContext(req, operation)).toThrowError(expect.objectContaining({
      code: 'LLM_CONTEXT_HARD_LIMIT_EXCEEDED',
    }));
  });
});
