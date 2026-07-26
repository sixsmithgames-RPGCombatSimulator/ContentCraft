import type { LlmRequestEnvelope, LlmResponseEnvelope } from '../../shared/llm/orchestratorContracts.js';
import { getDb } from '../config/mongo.js';
import { redactExecutionEventData } from './eventRedaction.js';

export interface ExecutionRecord {
  userId: string;
  operation: string;
  idempotencyKey: string;
  requestFingerprint: string;
  taskId: string;
  correlationId: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  leaseExpiresAt: Date;
  expiresAt: Date;
  cacheKey?: string;
  response?: LlmResponseEnvelope;
  requestMetadata: {
    schemaVersion: string;
    stage: string;
    operationClass: string;
    authority: unknown;
    references: unknown;
    contextKeys: string[];
  };
  events: Array<{
    at: Date;
    type: string;
    data?: Record<string, unknown>;
  }>;
}

export type ClaimResult =
  | { kind: 'claimed'; record: ExecutionRecord }
  | { kind: 'replay'; record: ExecutionRecord }
  | { kind: 'running'; record: ExecutionRecord }
  | { kind: 'conflict'; record: ExecutionRecord };

export interface ExecutionStore {
  claim(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    leaseMs: number;
    retentionMs: number;
  }): Promise<ClaimResult>;
  complete(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    response: LlmResponseEnvelope;
    cacheKey?: string;
  }): Promise<void>;
  find(userId: string, operation: string, idempotencyKey: string): Promise<ExecutionRecord | null>;
  findCache(userId: string, operation: string, cacheKey: string): Promise<ExecutionRecord | null>;
  appendEvent(userId: string, operation: string, idempotencyKey: string, type: string, data?: Record<string, unknown>): Promise<void>;
  query(userId: string, filters: { taskId?: string; correlationId?: string; operation?: string; limit?: number }): Promise<ExecutionRecord[]>;
}

function requestMetadata(request: LlmRequestEnvelope): ExecutionRecord['requestMetadata'] {
  return {
    schemaVersion: request.schemaVersion,
    stage: request.stage,
    operationClass: request.operationClass,
    authority: request.authority,
    references: request.references,
    contextKeys: Object.keys(request.context),
  };
}

export class MongoExecutionStore implements ExecutionStore {
  private collection() {
    return getDb().collection<ExecutionRecord>('llm_executions');
  }

  async claim(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    leaseMs: number;
    retentionMs: number;
  }): Promise<ClaimResult> {
    const now = new Date();
    const record: ExecutionRecord = {
      userId: input.userId,
      operation: input.request.operation,
      idempotencyKey: input.request.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      taskId: input.request.taskId,
      correlationId: input.request.correlationId,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      expiresAt: new Date(now.getTime() + input.retentionMs),
      requestMetadata: requestMetadata(input.request),
      events: [{ at: now, type: 'claimed' }],
    };
    try {
      await this.collection().insertOne(record);
      return { kind: 'claimed', record };
    } catch (error) {
      if (Number((error as any)?.code) !== 11000) throw error;
    }
    const existing = await this.find(input.userId, input.request.operation, input.request.idempotencyKey);
    if (!existing) throw new Error('Execution claim lost after an idempotency conflict.');
    if (existing.requestFingerprint !== input.requestFingerprint) return { kind: 'conflict', record: existing };
    if (existing.status === 'succeeded') return { kind: 'replay', record: existing };
    if (existing.status === 'failed') {
      if (existing.response?.error?.retryable !== true) return { kind: 'replay', record: existing };
      const retry = await this.collection().findOneAndUpdate(
        {
          userId: input.userId,
          operation: input.request.operation,
          idempotencyKey: input.request.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          status: 'failed',
          'response.error.retryable': true,
        },
        {
          $set: {
            status: 'running',
            updatedAt: now,
            leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
          },
          $unset: { response: '', completedAt: '', cacheKey: '' },
          $push: { events: { at: now, type: 'retry_claimed' } },
        },
        { returnDocument: 'after' },
      );
      return retry ? { kind: 'claimed', record: retry } : { kind: 'running', record: existing };
    }
    if (existing.leaseExpiresAt.getTime() > now.getTime()) return { kind: 'running', record: existing };
    const takeover = await this.collection().findOneAndUpdate(
      {
        userId: input.userId,
        operation: input.request.operation,
        idempotencyKey: input.request.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        status: 'running',
        leaseExpiresAt: { $lte: now },
      },
      {
        $set: {
          updatedAt: now,
          leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
        },
        $push: { events: { at: now, type: 'lease_takeover' } },
      },
      { returnDocument: 'after' },
    );
    return takeover ? { kind: 'claimed', record: takeover } : { kind: 'running', record: existing };
  }

  async complete(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    response: LlmResponseEnvelope;
    cacheKey?: string;
  }) {
    const now = new Date();
    await this.collection().updateOne(
      {
        userId: input.userId,
        operation: input.request.operation,
        idempotencyKey: input.request.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      },
      {
        $set: {
          status: input.response.status === 'succeeded' ? 'succeeded' : 'failed',
          response: input.response,
          cacheKey: input.cacheKey,
          updatedAt: now,
          completedAt: now,
          leaseExpiresAt: now,
        },
        $push: { events: { at: now, type: input.response.status === 'succeeded' ? 'completed' : 'failed' } },
      },
    );
  }

  async find(userId: string, operation: string, idempotencyKey: string) {
    return this.collection().findOne({ userId, operation, idempotencyKey });
  }

  async findCache(userId: string, operation: string, cacheKey: string) {
    return this.collection().findOne({
      userId,
      operation,
      cacheKey,
      status: 'succeeded',
      expiresAt: { $gt: new Date() },
    }, { sort: { completedAt: -1 } });
  }

  async appendEvent(userId: string, operation: string, idempotencyKey: string, type: string, data?: Record<string, unknown>) {
    await this.collection().updateOne(
      { userId, operation, idempotencyKey },
      {
        $set: { updatedAt: new Date() },
        $push: { events: { at: new Date(), type, data: redactExecutionEventData(data) } },
      },
    );
  }

  async query(userId: string, filters: { taskId?: string; correlationId?: string; operation?: string; limit?: number }) {
    const query: Record<string, unknown> = { userId };
    if (filters.taskId) query.taskId = filters.taskId;
    if (filters.correlationId) query.correlationId = filters.correlationId;
    if (filters.operation) query.operation = filters.operation;
    return this.collection().find(query).sort({ startedAt: -1 }).limit(Math.min(200, Math.max(1, filters.limit ?? 50))).toArray();
  }
}

export class MemoryExecutionStore implements ExecutionStore {
  private records = new Map<string, ExecutionRecord>();

  private key(userId: string, operation: string, idempotencyKey: string) {
    return `${userId}\0${operation}\0${idempotencyKey}`;
  }

  async claim(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    leaseMs: number;
    retentionMs: number;
  }): Promise<ClaimResult> {
    const key = this.key(input.userId, input.request.operation, input.request.idempotencyKey);
    const existing = this.records.get(key);
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint) return { kind: 'conflict', record: existing };
      if (existing.status === 'running') return { kind: 'running', record: existing };
      if (existing.status === 'failed' && existing.response?.error?.retryable === true) {
        const now = new Date();
        existing.status = 'running';
        existing.updatedAt = now;
        existing.leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
        existing.response = undefined;
        existing.completedAt = undefined;
        existing.cacheKey = undefined;
        existing.events.push({ at: now, type: 'retry_claimed' });
        return { kind: 'claimed', record: existing };
      }
      return { kind: 'replay', record: existing };
    }
    const now = new Date();
    const record: ExecutionRecord = {
      userId: input.userId,
      operation: input.request.operation,
      idempotencyKey: input.request.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      taskId: input.request.taskId,
      correlationId: input.request.correlationId,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      expiresAt: new Date(now.getTime() + input.retentionMs),
      requestMetadata: requestMetadata(input.request),
      events: [{ at: now, type: 'claimed' }],
    };
    this.records.set(key, record);
    return { kind: 'claimed', record };
  }

  async complete(input: {
    userId: string;
    request: LlmRequestEnvelope;
    requestFingerprint: string;
    response: LlmResponseEnvelope;
    cacheKey?: string;
  }) {
    const key = this.key(input.userId, input.request.operation, input.request.idempotencyKey);
    const record = this.records.get(key);
    if (!record || record.requestFingerprint !== input.requestFingerprint) return;
    record.status = input.response.status === 'succeeded' ? 'succeeded' : 'failed';
    record.response = structuredClone(input.response);
    record.cacheKey = input.cacheKey;
    record.completedAt = new Date();
    record.updatedAt = new Date();
    record.events.push({ at: new Date(), type: record.status === 'succeeded' ? 'completed' : 'failed' });
  }

  async find(userId: string, operation: string, idempotencyKey: string) {
    return this.records.get(this.key(userId, operation, idempotencyKey)) ?? null;
  }

  async findCache(userId: string, operation: string, cacheKey: string) {
    return [...this.records.values()].find((record) =>
      record.userId === userId
      && record.operation === operation
      && record.cacheKey === cacheKey
      && record.status === 'succeeded'
      && record.expiresAt.getTime() > Date.now()) ?? null;
  }

  async appendEvent(userId: string, operation: string, idempotencyKey: string, type: string, data?: Record<string, unknown>) {
    const record = await this.find(userId, operation, idempotencyKey);
    record?.events.push({ at: new Date(), type, data: redactExecutionEventData(data) });
  }

  async query(userId: string, filters: { taskId?: string; correlationId?: string; operation?: string; limit?: number }) {
    return [...this.records.values()]
      .filter((record) =>
        record.userId === userId
        && (!filters.taskId || record.taskId === filters.taskId)
        && (!filters.correlationId || record.correlationId === filters.correlationId)
        && (!filters.operation || record.operation === filters.operation))
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .slice(0, filters.limit ?? 50);
  }
}

export async function getDurableUsageSnapshot(store: ExecutionStore, userId: string) {
  const records = await store.query(userId, { limit: 200 });
  const completed = records.filter((record) => record.response);
  const exact = completed.filter((record) => record.response?.usage.source === 'provider');
  const total = (field: 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'cachedInputTokens') =>
    completed.reduce((sum, record) => sum + Number(record.response?.usage[field] ?? 0), 0);
  const priced = completed.filter((record) => typeof record.response?.usage.costUsd === 'number');
  const byOperation = Object.values(completed.reduce<Record<string, {
    operation: string;
    requests: number;
    successes: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }>>((groups, record) => {
    const operation = record.operation;
    const current = groups[operation] ?? {
      operation,
      requests: 0,
      successes: 0,
      failures: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.requests += 1;
    current.successes += record.response?.status === 'succeeded' ? 1 : 0;
    current.failures += record.response?.status === 'succeeded' ? 0 : 1;
    current.inputTokens += Number(record.response?.usage.inputTokens ?? 0);
    current.outputTokens += Number(record.response?.usage.outputTokens ?? 0);
    current.costUsd = typeof record.response?.usage.costUsd === 'number' && current.costUsd !== null
      ? current.costUsd + record.response.usage.costUsd
      : null;
    groups[operation] = current;
    return groups;
  }, {})).sort((left, right) => left.operation.localeCompare(right.operation));
  return {
    source: 'llm_executions',
    durable: true,
    traffic: {
      status: 'ok',
      requestCount: completed.length,
      warningLimit: null,
      guardLimit: null,
      windowMs: null,
      manualFallbackAvailable: false,
    },
    totals: {
      requests: completed.length,
      successes: completed.filter((record) => record.response?.status === 'succeeded').length,
      errors: completed.filter((record) => record.response?.status !== 'succeeded').length,
      exactUsageRecords: exact.length,
      estimatedUsageRecords: completed.filter((record) => record.response?.usage.source === 'estimate').length,
      unavailableUsageRecords: completed.filter((record) => record.response?.usage.source === 'unavailable').length,
      pricedUsageRecords: priced.length,
      unpricedUsageRecords: completed.length - priced.length,
      inputTokens: total('inputTokens'),
      outputTokens: total('outputTokens'),
      reasoningTokens: total('reasoningTokens'),
      cachedInputTokens: total('cachedInputTokens'),
      costUsd: priced.length === completed.length
        ? priced.reduce((sum, record) => sum + Number(record.response?.usage.costUsd), 0)
        : null,
    },
    byOperation,
    recent: completed.slice(0, 25).map((record) => ({
      taskId: record.taskId,
      correlationId: record.correlationId,
      operation: record.operation,
      status: record.response?.status,
      provider: record.response?.route.provider,
      model: record.response?.route.model,
      durationMs: record.response?.timing.durationMs,
      usage: record.response?.usage,
      errorCode: record.response?.error?.code ?? null,
    })),
  };
}
