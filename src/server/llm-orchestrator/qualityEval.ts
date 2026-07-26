import type { LlmOperationDefinition } from './operationRegistry.js';

type EvalFixture = {
  family: string;
  operation?: string;
  modelCalls?: number;
  transport?: string;
  request: unknown;
  response: any;
};

export function evaluateFixtureCorpus(input: {
  fixtures: EvalFixture[];
  operations: LlmOperationDefinition[];
  criticalFamilies: string[];
}) {
  const operationIds = new Set(input.operations.map((operation) => operation.id));
  const families = new Set(input.fixtures.map((fixture) => fixture.family));
  const issues: string[] = [];
  for (const fixture of input.fixtures) {
    if (fixture.operation && !operationIds.has(fixture.operation)) {
      issues.push(`${fixture.family} references unregistered operation ${fixture.operation}`);
    }
    if (fixture.family.startsWith('deterministic_') && fixture.modelCalls !== 0) {
      issues.push(`${fixture.family} must prove zero model calls`);
    }
    if (fixture.family === 'manual_mode' && fixture.transport !== 'manual') {
      issues.push('manual_mode must use the manual transport adapter');
    }
    if (fixture.family === 'error' && !fixture.response?.error?.code) {
      issues.push('error fixture must include normalized error provenance');
    }
  }
  for (const family of input.criticalFamilies) {
    if (!families.has(family)) issues.push(`missing critical fixture family ${family}`);
  }
  const registeredFamilies = input.fixtures.filter((fixture) => !fixture.operation || operationIds.has(fixture.operation)).length;
  const familyCoverage = input.fixtures.length ? registeredFamilies / input.fixtures.length : 0;
  const safetyScore = issues.length ? 0 : 1;
  return {
    schemaVersion: 'gma-gmc.llm-eval-result/1',
    familyCoverage,
    safetyScore,
    fixtures: input.fixtures.length,
    criticalFamilies: input.criticalFamilies.length,
    issues,
    passed: issues.length === 0,
  };
}
