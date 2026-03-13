import { createUngroundedWarning } from './workflowRegistry';
import type {
  ExecutionMode,
  GenerationRunState,
  GenerationRunStatus,
  RetrievalGroundingStatus,
  RetrievalStatus,
  StageAttempt,
  StageAttemptStatus,
  WorkflowRetrySource,
  WorkflowContentType,
} from './workflowTypes';

function makeId(prefix: string): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowValue(now?: number): number {
  return typeof now === 'number' ? now : Date.now();
}

export interface CreateGenerationRunStateInput {
  workflowType: WorkflowContentType;
  workflowLabel: string;
  executionMode: ExecutionMode;
  stageSequence: string[];
  stageLabels: Record<string, string>;
  projectId?: string;
  resourceCheckTarget?: string;
  now?: number;
}

export interface SyncGenerationRunDefinitionInput {
  workflowType: WorkflowContentType;
  workflowLabel: string;
  executionMode: ExecutionMode;
  stageSequence: string[];
  stageLabels: Record<string, string>;
  projectId?: string;
  resourceCheckTarget?: string;
  now?: number;
}

export interface StageAttemptUpdateInput {
  stageKey: string;
  stageLabel: string;
  status: StageAttemptStatus;
  compiledRequestId?: string;
  attemptId?: string;
  transport?: ExecutionMode | 'server';
  error?: string;
  warnings?: string[];
  retrySource?: WorkflowRetrySource;
  now?: number;
}

export function createInitialRetrievalStatus(resourceCheckTarget?: string, now?: number): RetrievalStatus {
  const timestamp = nowValue(now);
  return {
    groundingStatus: 'ungrounded',
    provenance: 'ungrounded',
    factsFound: 0,
    lastUpdatedAt: timestamp,
    warningMessage: undefined,
    resourceCheckTarget,
  };
}

export function createGenerationRunState(input: CreateGenerationRunStateInput): GenerationRunState {
  const timestamp = nowValue(input.now);

  return {
    runId: makeId('run'),
    workflowType: input.workflowType,
    workflowLabel: input.workflowLabel,
    executionMode: input.executionMode,
    status: 'idle',
    stageSequence: [...input.stageSequence],
    stageLabels: { ...input.stageLabels },
    currentStageIndex: -1,
    attempts: [],
    retrieval: createInitialRetrievalStatus(input.resourceCheckTarget, timestamp),
    warnings: [],
    resourceCheckTarget: input.resourceCheckTarget,
    projectId: input.projectId,
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function syncGenerationRunDefinition(
  runState: GenerationRunState | null,
  input: SyncGenerationRunDefinitionInput,
): GenerationRunState {
  if (!runState) {
    return createGenerationRunState(input);
  }

  const timestamp = nowValue(input.now);
  return {
    ...runState,
    workflowType: input.workflowType,
    workflowLabel: input.workflowLabel,
    executionMode: input.executionMode,
    stageSequence: [...input.stageSequence],
    stageLabels: { ...input.stageLabels },
    resourceCheckTarget: input.resourceCheckTarget,
    projectId: input.projectId,
    updatedAt: timestamp,
    retrieval: {
      ...runState.retrieval,
      resourceCheckTarget: input.resourceCheckTarget,
      lastUpdatedAt: timestamp,
    },
  };
}

export function getCurrentStageAttempt(runState: GenerationRunState | null): StageAttempt | null {
  if (!runState?.currentAttemptId) return null;
  return runState.attempts.find((attempt) => attempt.attemptId === runState.currentAttemptId) ?? null;
}

function mergeWarnings(existing: string[], incoming?: string[]): string[] {
  const values = [...existing, ...(incoming ?? [])].filter((value) => typeof value === 'string' && value.trim().length > 0);
  return Array.from(new Set(values));
}

function replaceAttempt(
  attempts: StageAttempt[],
  attemptId: string,
  updater: (attempt: StageAttempt) => StageAttempt,
): StageAttempt[] {
  return attempts.map((attempt) => (attempt.attemptId === attemptId ? updater(attempt) : attempt));
}

function inferRunStatusFromAttempt(status: StageAttemptStatus): GenerationRunStatus {
  if (status === 'accepted') return 'ready';
  if (status === 'awaiting_user_input') return 'awaiting_user_input';
  if (status === 'error') return 'error';
  return 'running';
}

export function upsertStageAttempt(
  runState: GenerationRunState | null,
  input: StageAttemptUpdateInput,
): GenerationRunState | null {
  if (!runState) return null;

  const timestamp = nowValue(input.now);
  const existing = input.attemptId
    ? runState.attempts.find((attempt) => attempt.attemptId === input.attemptId)
    : null;

  if (existing) {
    const updatedAttempt: StageAttempt = {
      ...existing,
      status: input.status,
      compiledRequestId: input.compiledRequestId ?? existing.compiledRequestId,
      transport: input.transport ?? existing.transport,
      error: input.error,
      warnings: mergeWarnings(existing.warnings ?? [], input.warnings),
      retrySource: input.retrySource ?? existing.retrySource,
      updatedAt: timestamp,
      acceptedAt: input.status === 'accepted' ? timestamp : existing.acceptedAt,
      completedAt: input.status === 'accepted' || input.status === 'error' ? timestamp : existing.completedAt,
    };

    return {
      ...runState,
      currentStageKey: input.stageKey,
      currentStageLabel: input.stageLabel,
      currentStageIndex: Math.max(runState.stageSequence.indexOf(input.stageKey), runState.currentStageIndex),
      currentAttemptId: updatedAttempt.attemptId,
      attempts: replaceAttempt(runState.attempts, updatedAttempt.attemptId, () => updatedAttempt),
      status: inferRunStatusFromAttempt(input.status),
      warnings: mergeWarnings(runState.warnings, input.warnings),
      updatedAt: timestamp,
    };
  }

  const attemptId = input.attemptId ?? makeId('attempt');
  const attempt: StageAttempt = {
    attemptId,
    stageKey: input.stageKey,
    stageLabel: input.stageLabel,
    status: input.status,
    compiledRequestId: input.compiledRequestId,
    error: input.error,
    warnings: input.warnings ? [...input.warnings] : [],
    retrySource: input.retrySource,
    transport: input.transport,
    startedAt: timestamp,
    updatedAt: timestamp,
    acceptedAt: input.status === 'accepted' ? timestamp : undefined,
    completedAt: input.status === 'accepted' || input.status === 'error' ? timestamp : undefined,
  };

  return {
    ...runState,
    currentStageKey: input.stageKey,
    currentStageLabel: input.stageLabel,
    currentStageIndex: runState.stageSequence.indexOf(input.stageKey),
    currentAttemptId: attempt.attemptId,
    attempts: [...runState.attempts, attempt],
    status: inferRunStatusFromAttempt(input.status),
    warnings: mergeWarnings(runState.warnings, input.warnings),
    updatedAt: timestamp,
  };
}

export function syncCurrentStage(
  runState: GenerationRunState | null,
  stageKey: string,
  stageLabel: string,
  compiledRequestId?: string,
  options?: { transport?: ExecutionMode | 'server'; retrySource?: WorkflowRetrySource; now?: number },
): GenerationRunState | null {
  return upsertStageAttempt(runState, {
    stageKey,
    stageLabel,
    status: 'compiled',
    compiledRequestId,
    transport: options?.transport,
    retrySource: options?.retrySource,
    now: options?.now,
  });
}

export function markStageAccepted(
  runState: GenerationRunState | null,
  stageKey: string,
  stageLabel: string,
  options?: { attemptId?: string; warnings?: string[]; now?: number },
): GenerationRunState | null {
  const updated = upsertStageAttempt(runState, {
    attemptId: options?.attemptId,
    stageKey,
    stageLabel,
    status: 'accepted',
    warnings: options?.warnings,
    now: options?.now,
  });

  if (!updated) return null;
  const timestamp = nowValue(options?.now);
  return {
    ...updated,
    status: 'ready',
    lastAcceptedStageKey: stageKey,
    updatedAt: timestamp,
  };
}

export function markStageError(
  runState: GenerationRunState | null,
  stageKey: string,
  stageLabel: string,
  error: string,
  options?: { attemptId?: string; warnings?: string[]; now?: number },
): GenerationRunState | null {
  return upsertStageAttempt(runState, {
    attemptId: options?.attemptId,
    stageKey,
    stageLabel,
    status: 'error',
    error,
    warnings: options?.warnings,
    now: options?.now,
  });
}

export function markRunAwaitingUserDecisions(
  runState: GenerationRunState | null,
  stageKey: string,
  stageLabel: string,
  options?: { attemptId?: string; now?: number },
): GenerationRunState | null {
  const accepted = markStageAccepted(runState, stageKey, stageLabel, {
    attemptId: options?.attemptId,
    now: options?.now,
  });
  if (!accepted) return null;
  return {
    ...accepted,
    status: 'awaiting_user_decisions',
    updatedAt: nowValue(options?.now),
  };
}

export function markRunComplete(runState: GenerationRunState | null, now?: number): GenerationRunState | null {
  if (!runState) return null;
  const timestamp = nowValue(now);
  return {
    ...runState,
    status: 'complete',
    completedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateRetrievalStatus(
  runState: GenerationRunState | null,
  workflowType: WorkflowContentType,
  groundingStatus: RetrievalGroundingStatus,
  factsFound: number,
  options?: { resourceCheckTarget?: string; warningMessage?: string; now?: number },
): GenerationRunState | null {
  if (!runState) return null;
  const timestamp = nowValue(options?.now);
  const warningMessage = options?.warningMessage ?? createUngroundedWarning(workflowType, groundingStatus);

  return {
    ...runState,
    retrieval: {
      groundingStatus,
      provenance: groundingStatus,
      factsFound,
      warningMessage,
      resourceCheckTarget: options?.resourceCheckTarget ?? runState.resourceCheckTarget,
      lastUpdatedAt: timestamp,
    },
    warnings: warningMessage ? mergeWarnings(runState.warnings, [warningMessage]) : runState.warnings,
    updatedAt: timestamp,
  };
}

export function hasAcceptedCurrentStage(runState: GenerationRunState | null): boolean {
  const attempt = getCurrentStageAttempt(runState);
  return attempt?.status === 'accepted';
}
