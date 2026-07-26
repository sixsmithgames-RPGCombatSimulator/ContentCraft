import { createHash } from 'node:crypto';
import { getDb } from '../config/mongo.js';
import { OrchestratorError } from './errors.js';

export const GENERATION_WORKFLOW_SCHEMA_VERSION = 'gma-gmc.generation-workflow/1';

export type GenerationWorkflowKind =
  | 'entity.npc'
  | 'entity.monster'
  | 'entity.location'
  | 'entity.item'
  | 'campaign.foundation';

export type GenerationWorkflowStage = 'plan' | 'retrieve' | 'skeleton' | 'expand' | 'review';

export interface GenerationWorkflowRecord {
  schemaVersion: typeof GENERATION_WORKFLOW_SCHEMA_VERSION;
  userId: string;
  workflowId: string;
  kind: GenerationWorkflowKind;
  requestFingerprint: string;
  status: 'running' | 'succeeded' | 'failed';
  currentStage: GenerationWorkflowStage;
  completedStages: GenerationWorkflowStage[];
  stageResults: Partial<Record<GenerationWorkflowStage, unknown>>;
  modelCalls: number;
  maxModelCalls: number;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    stage: GenerationWorkflowStage;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export interface GenerationWorkflowStore {
  claim(input: {
    userId: string;
    workflowId: string;
    kind: GenerationWorkflowKind;
    requestFingerprint: string;
    maxModelCalls: number;
    retentionMs: number;
  }): Promise<{ kind: 'claimed' | 'resume' | 'replay' | 'conflict'; record: GenerationWorkflowRecord }>;
  save(record: GenerationWorkflowRecord): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function generationWorkflowFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export class MongoGenerationWorkflowStore implements GenerationWorkflowStore {
  private collection() {
    return getDb().collection<GenerationWorkflowRecord>('llm_generation_workflows');
  }

  async claim(input: {
    userId: string;
    workflowId: string;
    kind: GenerationWorkflowKind;
    requestFingerprint: string;
    maxModelCalls: number;
    retentionMs: number;
  }) {
    const now = new Date();
    const record: GenerationWorkflowRecord = {
      schemaVersion: GENERATION_WORKFLOW_SCHEMA_VERSION,
      userId: input.userId,
      workflowId: input.workflowId,
      kind: input.kind,
      requestFingerprint: input.requestFingerprint,
      status: 'running',
      currentStage: 'plan',
      completedStages: [],
      stageResults: {},
      modelCalls: 0,
      maxModelCalls: input.maxModelCalls,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + input.retentionMs),
    };
    try {
      await this.collection().insertOne(record);
      return { kind: 'claimed' as const, record };
    } catch (error) {
      if (Number((error as any)?.code) !== 11000) throw error;
    }
    const existing = await this.collection().findOne({
      userId: input.userId,
      workflowId: input.workflowId,
    });
    if (!existing) throw new Error('Generation workflow claim was lost.');
    if (existing.requestFingerprint !== input.requestFingerprint || existing.kind !== input.kind) {
      return { kind: 'conflict' as const, record: existing };
    }
    if (existing.status === 'succeeded') return { kind: 'replay' as const, record: existing };
    return { kind: 'resume' as const, record: existing };
  }

  async save(record: GenerationWorkflowRecord) {
    const result = await this.collection().replaceOne(
      {
        userId: record.userId,
        workflowId: record.workflowId,
        requestFingerprint: record.requestFingerprint,
      },
      record,
    );
    if (result.matchedCount !== 1) {
      throw new OrchestratorError({
        code: 'WORKFLOW_PERSISTENCE_FAILED',
        category: 'persistence',
        message: 'The generation workflow could not be saved durably.',
        retryable: true,
        status: 503,
        source: 'gmc.generation-workflow',
      });
    }
  }
}

export class MemoryGenerationWorkflowStore implements GenerationWorkflowStore {
  private records = new Map<string, GenerationWorkflowRecord>();

  private key(userId: string, workflowId: string) {
    return `${userId}\0${workflowId}`;
  }

  async claim(input: {
    userId: string;
    workflowId: string;
    kind: GenerationWorkflowKind;
    requestFingerprint: string;
    maxModelCalls: number;
    retentionMs: number;
  }) {
    const key = this.key(input.userId, input.workflowId);
    const existing = this.records.get(key);
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint || existing.kind !== input.kind) {
        return { kind: 'conflict' as const, record: clone(existing) };
      }
      return {
        kind: existing.status === 'succeeded' ? 'replay' as const : 'resume' as const,
        record: clone(existing),
      };
    }
    const now = new Date();
    const record: GenerationWorkflowRecord = {
      schemaVersion: GENERATION_WORKFLOW_SCHEMA_VERSION,
      userId: input.userId,
      workflowId: input.workflowId,
      kind: input.kind,
      requestFingerprint: input.requestFingerprint,
      status: 'running',
      currentStage: 'plan',
      completedStages: [],
      stageResults: {},
      modelCalls: 0,
      maxModelCalls: input.maxModelCalls,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + input.retentionMs),
    };
    this.records.set(key, clone(record));
    return { kind: 'claimed' as const, record };
  }

  async save(record: GenerationWorkflowRecord) {
    this.records.set(this.key(record.userId, record.workflowId), clone(record));
  }
}

const stages: GenerationWorkflowStage[] = ['plan', 'retrieve', 'skeleton', 'expand', 'review'];

export async function executeGenerationWorkflow(input: {
  userId: string;
  workflowId: string;
  kind: GenerationWorkflowKind;
  request: unknown;
  store?: GenerationWorkflowStore;
  maxModelCalls?: number;
  runStage: (context: {
    stage: GenerationWorkflowStage;
    request: unknown;
    prior: Partial<Record<GenerationWorkflowStage, unknown>>;
    consumeModelCall: () => void;
  }) => Promise<unknown>;
}) {
  const store = input.store ?? new MongoGenerationWorkflowStore();
  const requestFingerprint = generationWorkflowFingerprint(input.request);
  const claim = await store.claim({
    userId: input.userId,
    workflowId: input.workflowId,
    kind: input.kind,
    requestFingerprint,
    maxModelCalls: input.maxModelCalls ?? 2,
    retentionMs: Number(process.env.LLM_WORKFLOW_RETENTION_DAYS ?? 30) * 86_400_000,
  });
  if (claim.kind === 'conflict') {
    throw new OrchestratorError({
      code: 'WORKFLOW_IDEMPOTENCY_CONFLICT',
      category: 'persistence',
      message: 'This workflow ID is already associated with different input.',
      retryable: false,
      status: 409,
      source: 'gmc.generation-workflow',
    });
  }
  if (claim.kind === 'replay') return claim.record.result;

  const record = claim.record;
  for (const stage of stages) {
    if (record.completedStages.includes(stage)) continue;
    record.currentStage = stage;
    record.updatedAt = new Date();
    await store.save(record);
    let consumed = false;
    const consumeModelCall = () => {
      if (consumed) return;
      if (record.modelCalls >= record.maxModelCalls) {
        throw new OrchestratorError({
          code: 'WORKFLOW_MODEL_BUDGET_EXCEEDED',
          category: 'policy',
          message: `The ${input.kind} workflow exceeded its registered model-call budget.`,
          retryable: false,
          status: 400,
          source: 'gmc.generation-workflow',
        });
      }
      consumed = true;
      record.modelCalls += 1;
    };
    try {
      const result = await input.runStage({
        stage,
        request: input.request,
        prior: clone(record.stageResults),
        consumeModelCall,
      });
      record.stageResults[stage] = result;
      record.completedStages.push(stage);
      record.error = undefined;
      record.updatedAt = new Date();
      await store.save(record);
    } catch (error) {
      record.status = 'failed';
      record.error = {
        code: String((error as any)?.code ?? 'WORKFLOW_STAGE_FAILED'),
        message: error instanceof Error ? error.message : String(error),
        retryable: Boolean((error as any)?.retryable ?? true),
        stage,
      };
      record.updatedAt = new Date();
      await store.save(record);
      throw error;
    }
  }
  record.status = 'succeeded';
  record.result = record.stageResults.review ?? record.stageResults.expand;
  record.completedAt = new Date();
  record.updatedAt = record.completedAt;
  await store.save(record);
  return record.result;
}

export function defaultGenerationStage(input: {
  stage: GenerationWorkflowStage;
  request: any;
  prior: Partial<Record<GenerationWorkflowStage, any>>;
  consumeModelCall: () => void;
  expand: () => Promise<unknown>;
}) {
  switch (input.stage) {
    case 'plan':
      return Promise.resolve({
        kind: input.request?.kind ?? null,
        campaignId: input.request?.campaignId ?? null,
        requestedName: input.request?.name ?? input.request?.context?.name ?? null,
        objective: 'Produce one canon-constrained proposal without committing authority state.',
      });
    case 'retrieve':
      return Promise.resolve({
        campaignId: input.request?.campaignId ?? null,
        suppliedContextKeys: Object.keys(input.request?.context ?? {}).sort(),
        authority: 'GMC',
      });
    case 'skeleton':
      return Promise.resolve({
        name: input.prior.plan?.requestedName ?? null,
        proposalOnly: true,
        sections: input.request?.kind === 'campaign.foundation'
          ? ['spine', 'arcs', 'locations', 'factions', 'opening', 'progression']
          : ['identity', 'description', 'relationships', 'mechanics', 'claims'],
      });
    case 'expand':
      input.consumeModelCall();
      return input.expand();
    case 'review':
      return Promise.resolve(input.prior.expand);
  }
}
