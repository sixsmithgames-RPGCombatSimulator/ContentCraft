import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LLM_OPERATION_CLASSES } from '../../shared/llm/orchestratorContracts.js';
import { priceUsage } from './modelPolicy.js';

describe('effective-dated model pricing and SLO policy', () => {
  it('prices provider-reported usage only when every effective rate is known', () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningTokens: 0,
      cachedInputTokens: 200,
      source: 'provider' as const,
      priceVersion: null,
      costUsd: null,
    };
    expect(priceUsage(usage, {
      config: {
        default: 'fixture',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
        cachedInputUsdPerMillion: 0.5,
      },
      priceVersion: 'price-r1',
    }).costUsd).toBeCloseTo(0.0019);
    expect(priceUsage(usage, {
      config: {
        default: 'fixture',
        inputUsdPerMillion: null,
        outputUsdPerMillion: null,
        cachedInputUsdPerMillion: null,
      },
      priceVersion: 'price-r2',
    }).costUsd).toBeNull();
  });

  it('defines model-call and latency SLOs for all six operation classes', () => {
    const policy = JSON.parse(readFileSync(resolve('config/llm-slos.json'), 'utf8'));
    expect(Object.keys(policy.classes).sort()).toEqual([...LLM_OPERATION_CLASSES].sort());
    expect(policy.classes.deterministic_rule.maxModelCalls).toBe(0);
    expect(policy.classes.deterministic_lookup.maxModelCalls).toBe(0);
    for (const value of Object.values<any>(policy.classes)) {
      expect(value.latencyP95Ms).toBeGreaterThan(0);
      expect(value.minimumSchemaSuccessRate).toBeGreaterThanOrEqual(0.99);
    }
  });
});
