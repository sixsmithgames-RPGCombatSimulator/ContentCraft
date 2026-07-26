import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutionRecord, ExecutionStore } from './executionStore.js';

type SloPolicy = {
  version: string;
  classes: Record<string, {
    latencyP95Ms: number;
    maxModelCalls: number;
    maxRetries: number;
    minimumSchemaSuccessRate: number;
    costUsdPerExecution: number | null;
  }>;
};

export function loadSloPolicy(): SloPolicy {
  return JSON.parse(readFileSync(resolve('config/llm-slos.json'), 'utf8')) as SloPolicy;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index];
}

export function buildLlmObservabilityReport(records: ExecutionRecord[], policy = loadSloPolicy()) {
  const completed = records.filter((record) => record.response);
  const grouped = completed.reduce<Record<string, ExecutionRecord[]>>((result, record) => {
    const operationClass = String(record.requestMetadata.operationClass || 'unknown');
    (result[operationClass] ??= []).push(record);
    return result;
  }, {});
  const alerts: Array<{
    severity: 'warning' | 'critical';
    operationClass: string;
    metric: string;
    observed: number;
    target: number;
  }> = [];
  const classes = Object.entries(grouped).map(([operationClass, classRecords]) => {
    const target = policy.classes[operationClass];
    const latencies = classRecords.map((record) => Number(record.response?.timing.durationMs ?? 0));
    const p95 = percentile(latencies, 0.95) ?? 0;
    const schemaResults = classRecords.flatMap((record) =>
      record.response?.validation.filter((result) => result.validatorId.endsWith('.json-schema')) ?? []);
    const schemaSuccessRate = schemaResults.length
      ? schemaResults.filter((result) => result.valid).length / schemaResults.length
      : 1;
    const averageAttempts = classRecords.reduce(
      (sum, record) => sum + Number(record.response?.timing.attempts ?? 0),
      0,
    ) / Math.max(classRecords.length, 1);
    const priced = classRecords.filter((record) => typeof record.response?.usage.costUsd === 'number');
    const averageCostUsd = priced.length === classRecords.length
      ? priced.reduce((sum, record) => sum + Number(record.response?.usage.costUsd), 0) / classRecords.length
      : null;
    if (target && p95 > target.latencyP95Ms) {
      alerts.push({
        severity: 'warning',
        operationClass,
        metric: 'latencyP95Ms',
        observed: p95,
        target: target.latencyP95Ms,
      });
    }
    if (target && schemaSuccessRate < target.minimumSchemaSuccessRate) {
      alerts.push({
        severity: 'critical',
        operationClass,
        metric: 'schemaSuccessRate',
        observed: schemaSuccessRate,
        target: target.minimumSchemaSuccessRate,
      });
    }
    if (target && averageAttempts > target.maxModelCalls) {
      alerts.push({
        severity: 'critical',
        operationClass,
        metric: 'averageModelAttempts',
        observed: averageAttempts,
        target: target.maxModelCalls,
      });
    }
    if (target?.costUsdPerExecution !== null && target?.costUsdPerExecution !== undefined
      && averageCostUsd !== null && averageCostUsd > target.costUsdPerExecution) {
      alerts.push({
        severity: 'warning',
        operationClass,
        metric: 'averageCostUsd',
        observed: averageCostUsd,
        target: target.costUsdPerExecution,
      });
    }
    return {
      operationClass,
      executions: classRecords.length,
      successes: classRecords.filter((record) => record.response?.status === 'succeeded').length,
      failures: classRecords.filter((record) => record.response?.status !== 'succeeded').length,
      latencyP95Ms: p95,
      averageAttempts,
      schemaSuccessRate,
      fallbackRate: classRecords.filter((record) => record.response?.route.fallbackUsed).length / classRecords.length,
      cacheHitRate: classRecords.filter((record) => record.response?.cache.status === 'hit').length / classRecords.length,
      averageCostUsd,
      unpricedExecutions: classRecords.length - priced.length,
      target: target ?? null,
    };
  }).sort((left, right) => left.operationClass.localeCompare(right.operationClass));
  const routeMix = Object.values(completed.reduce<Record<string, {
    provider: string;
    model: string;
    executions: number;
  }>>((result, record) => {
    const provider = String(record.response?.route.provider ?? 'none');
    const model = String(record.response?.route.model ?? 'none');
    const key = `${provider}\0${model}`;
    const entry = result[key] ?? { provider, model, executions: 0 };
    entry.executions += 1;
    result[key] = entry;
    return result;
  }, {})).sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
  return {
    schemaVersion: 'gma-gmc.llm-observability/1',
    sloPolicyVersion: policy.version,
    generatedAt: new Date().toISOString(),
    executions: completed.length,
    classes,
    routeMix,
    alerts,
  };
}

export async function queryLlmObservability(store: ExecutionStore, userId: string) {
  return buildLlmObservabilityReport(await store.query(userId, { limit: 200 }));
}
