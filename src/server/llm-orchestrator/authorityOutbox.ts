import { createHash } from 'node:crypto';
import { getDb } from '../config/mongo.js';
import { OrchestratorError } from './errors.js';

export type AuthoritySystem = 'GMC' | 'VCS';
export type AuthorityStepStatus = 'pending' | 'completed' | 'failed' | 'compensated';

export interface AuthorityStep {
  stepId: string;
  authority: AuthoritySystem;
  mutationId: string;
  preconditions: Record<string, unknown>;
  compensation?: {
    authority: AuthoritySystem;
    mutationId: string;
    action: string;
  };
  status: AuthorityStepStatus;
  receipt?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  completedAt?: Date;
}

export interface AuthorityOperation {
  userId: string;
  operationId: string;
  correlationId: string;
  fingerprint: string;
  proposal: {
    status: 'validated';
    validationVersion: string;
    sourceOperation: string;
    resultFingerprint: string;
  };
  status: 'pending' | 'completed' | 'failed' | 'compensation_required' | 'compensated';
  steps: AuthorityStep[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface AuthorityOutboxStore {
  create(operation: AuthorityOperation): Promise<{ created: boolean; operation: AuthorityOperation }>;
  get(userId: string, operationId: string): Promise<AuthorityOperation | null>;
  replace(operation: AuthorityOperation): Promise<void>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(input: unknown) {
  return createHash('sha256').update(stable(input)).digest('hex');
}

export class MongoAuthorityOutboxStore implements AuthorityOutboxStore {
  private collection() {
    return getDb().collection<AuthorityOperation>('authority_operations');
  }

  async create(operation: AuthorityOperation) {
    try {
      await this.collection().insertOne(operation);
      return { created: true, operation };
    } catch (error) {
      if (Number((error as any)?.code) !== 11000) throw error;
      const existing = await this.get(operation.userId, operation.operationId);
      if (!existing) throw error;
      return { created: false, operation: existing };
    }
  }

  async get(userId: string, operationId: string) {
    return this.collection().findOne({ userId, operationId });
  }

  async replace(operation: AuthorityOperation) {
    await this.collection().replaceOne(
      { userId: operation.userId, operationId: operation.operationId, fingerprint: operation.fingerprint },
      operation,
      { upsert: false },
    );
  }
}

export class MemoryAuthorityOutboxStore implements AuthorityOutboxStore {
  private operations = new Map<string, AuthorityOperation>();
  private key(userId: string, operationId: string) {
    return `${userId}\0${operationId}`;
  }
  async create(operation: AuthorityOperation) {
    const key = this.key(operation.userId, operation.operationId);
    const existing = this.operations.get(key);
    if (existing) return { created: false, operation: structuredClone(existing) };
    this.operations.set(key, structuredClone(operation));
    return { created: true, operation: structuredClone(operation) };
  }
  async get(userId: string, operationId: string) {
    const value = this.operations.get(this.key(userId, operationId));
    return value ? structuredClone(value) : null;
  }
  async replace(operation: AuthorityOperation) {
    this.operations.set(this.key(operation.userId, operation.operationId), structuredClone(operation));
  }
}

function validateSteps(steps: Array<Omit<AuthorityStep, 'status'>>) {
  if (!steps.length) throw new OrchestratorError({ code: 'AUTHORITY_STEPS_REQUIRED', category: 'commit', message: 'At least one authority step is required.', status: 400 });
  const identities = new Set<string>();
  for (const step of steps) {
    if (!step.stepId || !step.mutationId || !['GMC', 'VCS'].includes(step.authority)) {
      throw new OrchestratorError({ code: 'AUTHORITY_STEP_INVALID', category: 'commit', message: 'Each authority step requires an ID, authority, and mutation ID.', status: 400 });
    }
    if (identities.has(step.stepId)) throw new OrchestratorError({ code: 'AUTHORITY_STEP_DUPLICATE', category: 'commit', message: `Duplicate authority step '${step.stepId}'.`, status: 400 });
    identities.add(step.stepId);
  }
}

export async function createAuthorityOperation(input: {
  store: AuthorityOutboxStore;
  userId: string;
  operationId: string;
  correlationId: string;
  proposal: AuthorityOperation['proposal'];
  steps: Array<Omit<AuthorityStep, 'status'>>;
}) {
  validateSteps(input.steps);
  if (
    input.proposal?.status !== 'validated'
    || !input.proposal.validationVersion
    || !input.proposal.sourceOperation
    || !input.proposal.resultFingerprint
  ) {
    throw new OrchestratorError({
      code: 'AUTHORITY_PROPOSAL_NOT_VALIDATED',
      category: 'commit',
      message: 'Authority operations accept only a versioned validated proposal.',
      status: 422,
    });
  }
  const operationFingerprint = fingerprint({ proposal: input.proposal, steps: input.steps });
  const now = new Date();
  const result = await input.store.create({
    userId: input.userId,
    operationId: input.operationId,
    correlationId: input.correlationId,
    fingerprint: operationFingerprint,
    proposal: input.proposal,
    status: 'pending',
    steps: input.steps.map((step) => ({ ...step, status: 'pending' })),
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(
      now.getTime() + Number(process.env.AUTHORITY_OPERATION_RETENTION_DAYS ?? 30) * 86_400_000,
    ),
  });
  if (!result.created && result.operation.fingerprint !== operationFingerprint) {
    throw new OrchestratorError({
      code: 'AUTHORITY_OPERATION_CONFLICT',
      category: 'commit',
      message: 'This authority operation ID is already associated with different steps.',
      status: 409,
    });
  }
  return result.operation;
}

export async function recordAuthorityReceipt(input: {
  store: AuthorityOutboxStore;
  userId: string;
  operationId: string;
  stepId: string;
  mutationId: string;
  receipt: unknown;
}) {
  const operation = await input.store.get(input.userId, input.operationId);
  if (!operation) throw new OrchestratorError({ code: 'AUTHORITY_OPERATION_NOT_FOUND', category: 'commit', message: 'Authority operation not found.', status: 404 });
  const step = operation.steps.find((candidate) => candidate.stepId === input.stepId);
  if (!step) throw new OrchestratorError({ code: 'AUTHORITY_STEP_NOT_FOUND', category: 'commit', message: 'Authority step not found.', status: 404 });
  if (step.mutationId !== input.mutationId) throw new OrchestratorError({ code: 'AUTHORITY_MUTATION_CONFLICT', category: 'commit', message: 'The receipt mutation ID does not match the staged step.', status: 409 });
  if (step.status === 'completed') return operation;
  step.status = 'completed';
  step.receipt = input.receipt;
  step.completedAt = new Date();
  operation.status = operation.steps.every((candidate) => candidate.status === 'completed') ? 'completed' : 'pending';
  operation.updatedAt = new Date();
  await input.store.replace(operation);
  return operation;
}

export async function recordAuthorityFailure(input: {
  store: AuthorityOutboxStore;
  userId: string;
  operationId: string;
  stepId: string;
  error: { code: string; message: string; retryable: boolean };
}) {
  const operation = await input.store.get(input.userId, input.operationId);
  if (!operation) throw new OrchestratorError({ code: 'AUTHORITY_OPERATION_NOT_FOUND', category: 'commit', message: 'Authority operation not found.', status: 404 });
  const step = operation.steps.find((candidate) => candidate.stepId === input.stepId);
  if (!step) throw new OrchestratorError({ code: 'AUTHORITY_STEP_NOT_FOUND', category: 'commit', message: 'Authority step not found.', status: 404 });
  step.status = 'failed';
  step.error = input.error;
  const compensableCompleted = operation.steps.some((candidate) => candidate.status === 'completed' && candidate.compensation);
  operation.status = compensableCompleted ? 'compensation_required' : 'failed';
  operation.updatedAt = new Date();
  await input.store.replace(operation);
  return operation;
}

export async function recordAuthorityCompensation(input: {
  store: AuthorityOutboxStore;
  userId: string;
  operationId: string;
  stepId: string;
  receipt: unknown;
}) {
  const operation = await input.store.get(input.userId, input.operationId);
  if (!operation) throw new OrchestratorError({ code: 'AUTHORITY_OPERATION_NOT_FOUND', category: 'commit', message: 'Authority operation not found.', status: 404 });
  const step = operation.steps.find((candidate) => candidate.stepId === input.stepId);
  if (!step?.compensation) throw new OrchestratorError({ code: 'AUTHORITY_COMPENSATION_NOT_DEFINED', category: 'commit', message: 'No compensation is defined for this step.', status: 409 });
  step.status = 'compensated';
  step.receipt = { forward: step.receipt, compensation: input.receipt };
  operation.status = operation.steps
    .filter((candidate) => candidate.compensation && candidate.completedAt)
    .every((candidate) => candidate.status === 'compensated')
    ? 'compensated'
    : 'compensation_required';
  operation.updatedAt = new Date();
  await input.store.replace(operation);
  return operation;
}
