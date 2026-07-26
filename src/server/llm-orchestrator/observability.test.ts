import { describe, expect, it } from 'vitest';
import type { ExecutionRecord } from './executionStore.js';
import { buildLlmObservabilityReport } from './observability.js';

function record(durationMs: number, valid: boolean): ExecutionRecord {
  const startedAt = new Date('2026-07-26T00:00:00.000Z');
  return {
    userId: 'user-1',
    operation: 'narration.generate',
    idempotencyKey: `id-${durationMs}`,
    requestFingerprint: `hash-${durationMs}`,
    taskId: `task-${durationMs}`,
    correlationId: 'correlation-1',
    status: valid ? 'succeeded' : 'failed',
    startedAt,
    updatedAt: startedAt,
    leaseExpiresAt: startedAt,
    expiresAt: new Date('2026-08-26T00:00:00.000Z'),
    requestMetadata: {
      schemaVersion: '1',
      stage: 'generate',
      operationClass: 'narrative',
      authority: {},
      references: {},
      contextKeys: ['input'],
    },
    events: [],
    response: {
      schemaVersion: 'gma-gmc.llm-response/1',
      taskId: `task-${durationMs}`,
      correlationId: 'correlation-1',
      idempotencyKey: `id-${durationMs}`,
      operation: 'narration.generate',
      stage: 'generate',
      status: valid ? 'succeeded' : 'review_required',
      output: valid ? { narration: 'Fixture' } : null,
      validation: [{
        validatorId: 'narration.generate.result.json-schema',
        version: '1',
        valid,
        issues: valid ? [] : [{ code: 'INVALID', message: 'invalid' }],
      }],
      route: {
        provider: 'fake',
        model: 'fake-narrative',
        capabilityTier: 'narrative',
        fallbackUsed: false,
        registryVersion: '1',
        operationVersion: '1',
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        source: 'provider',
        priceVersion: '1',
        costUsd: 0,
      },
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: startedAt.toISOString(),
        durationMs,
        attempts: 1,
      },
      cache: { status: 'miss', key: null },
      error: valid ? null : {
        code: 'OUTPUT_VALIDATION_FAILED',
        category: 'validation',
        message: 'invalid',
        retryable: true,
        source: 'test',
      },
    },
  };
}

describe('LLM observability and SLO evaluation', () => {
  it('reports route, latency, schema quality, pricing coverage, and actionable alerts', () => {
    const report = buildLlmObservabilityReport(
      [record(100, true), record(40_000, false)],
      {
        version: 'test',
        classes: {
          narrative: {
            latencyP95Ms: 30_000,
            maxModelCalls: 2,
            maxRetries: 1,
            minimumSchemaSuccessRate: 0.99,
            costUsdPerExecution: null,
          },
        },
      },
    );
    expect(report.executions).toBe(2);
    expect(report.routeMix).toEqual([{ provider: 'fake', model: 'fake-narrative', executions: 2 }]);
    expect(report.alerts.map((alert) => alert.metric)).toEqual(['latencyP95Ms', 'schemaSuccessRate']);
  });
});
