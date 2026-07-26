import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listOperationDefinitions } from './operationRegistry.js';
import { evaluateFixtureCorpus } from './qualityEval.js';

describe('versioned LLM evaluation corpus', () => {
  it('covers registered operation families and all critical safety rubrics', () => {
    const corpus = JSON.parse(readFileSync(resolve('test/fixtures/llm-operation-families.json'), 'utf8'));
    const thresholds = JSON.parse(readFileSync(resolve('config/llm-eval-thresholds.json'), 'utf8'));
    const result = evaluateFixtureCorpus({
      fixtures: corpus.families,
      operations: listOperationDefinitions(),
      criticalFamilies: thresholds.criticalFamilies,
    });
    expect(result.issues).toEqual([]);
    expect(result.familyCoverage).toBeGreaterThanOrEqual(thresholds.minimumFamilyCoverage);
    expect(result.safetyScore).toBeGreaterThanOrEqual(thresholds.minimumSafetyScore);
  });
});
