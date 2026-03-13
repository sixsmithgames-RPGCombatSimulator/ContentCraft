export type WorkflowExecutionErrorType =
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'SCHEMA_MISMATCH'
  | 'FORBIDDEN_PATH'
  | 'PAYLOAD_TOO_LARGE'
  | 'BUDGET_EXCEEDED'
  | 'ABORTED';

export type WorkflowExecutionOutcome =
  | 'accepted'
  | 'retry_required'
  | 'review_required'
  | 'invalid_response'
  | 'partial';

export interface WorkflowExecutionRetryContext {
  reason: string;
  retryable: boolean;
  retryAfterMs?: number;
  duplicateRetryBlocked?: boolean;
}

export interface WorkflowExecutionMetadata {
  stageId: string;
  stageKey: string;
  workflowType?: string;
  outcome: WorkflowExecutionOutcome;
  accepted: boolean;
  allowedKeyCount: number;
  rawAllowedKeyCount: number;
  retryContext?: WorkflowExecutionRetryContext;
}

export interface WorkflowExecutionRequestBody {
  projectId: string;
  stageId: string;
  stageRunId: string;
  prompt: string;
  schemaVersion: string;
  responseFormat?: string;
  clientContext?: {
    appVersion?: string;
    stageKey?: string;
    generatorType?: string;
    userSelectedMode?: string;
    promptMode?: string;
    measuredChars?: number;
  };
}

export interface WorkflowExecutionSuccessResponse {
  ok: true;
  provider: string;
  model: string;
  requestId: string;
  stageRunId: string;
  workflow: WorkflowExecutionMetadata;
  rawText: string;
  jsonPatch?: Record<string, unknown>;
  parse: {
    foundJsonBlock: boolean;
    parseWarnings: string[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  safety: {
    patchSizeBytes: number;
    appliedPathsCandidateCount: number;
  };
}

export interface WorkflowExecutionFailureResponse {
  ok: false;
  requestId: string;
  stageRunId: string;
  workflow?: WorkflowExecutionMetadata;
  error: {
    type: WorkflowExecutionErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}

function resolveFailureOutcome(input: {
  type: WorkflowExecutionErrorType;
  retryable: boolean;
  outcome?: WorkflowExecutionOutcome;
}): WorkflowExecutionOutcome {
  if (input.outcome) return input.outcome;
  if (input.type === 'ABORTED') return 'review_required';
  if (input.retryable) return 'retry_required';
  return 'invalid_response';
}

export interface WorkflowChatRequestBody {
  systemPrompt?: string;
  userMessage: string;
}

export interface WorkflowChatSuccessResponse {
  ok: true;
  provider: string;
  model: string;
  requestId: string;
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface WorkflowChatFailureResponse {
  ok: false;
  requestId: string;
  error: {
    type: WorkflowExecutionErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}

export function createWorkflowExecutionSuccess(input: {
  provider: string;
  model: string;
  requestId: string;
  stageRunId: string;
  stageId: string;
  stageKey: string;
  workflowType?: string;
  outcome?: WorkflowExecutionOutcome;
  allowedKeyCount?: number;
  rawAllowedKeyCount?: number;
  retryContext?: WorkflowExecutionRetryContext;
  rawText: string;
  jsonPatch?: Record<string, unknown>;
  foundJsonBlock: boolean;
  parseWarnings?: string[];
  inputTokens?: number;
  outputTokens?: number;
  patchSizeBytes?: number;
  appliedPathsCandidateCount?: number;
}): WorkflowExecutionSuccessResponse {
  return {
    ok: true,
    provider: input.provider,
    model: input.model,
    requestId: input.requestId,
    stageRunId: input.stageRunId,
    workflow: {
      stageId: input.stageId,
      stageKey: input.stageKey,
      workflowType: input.workflowType,
      outcome: input.outcome ?? 'accepted',
      accepted: (input.outcome ?? 'accepted') === 'accepted' || (input.outcome ?? 'accepted') === 'partial',
      allowedKeyCount: Number(input.allowedKeyCount ?? 0),
      rawAllowedKeyCount: Number(input.rawAllowedKeyCount ?? 0),
      retryContext: input.retryContext,
    },
    rawText: input.rawText,
    jsonPatch: input.jsonPatch,
    parse: {
      foundJsonBlock: input.foundJsonBlock,
      parseWarnings: input.parseWarnings ?? [],
    },
    usage: {
      inputTokens: Number(input.inputTokens ?? 0),
      outputTokens: Number(input.outputTokens ?? 0),
    },
    safety: {
      patchSizeBytes: input.patchSizeBytes ?? 0,
      appliedPathsCandidateCount: input.appliedPathsCandidateCount ?? 0,
    },
  };
}

export function createWorkflowExecutionFailure(input: {
  requestId: string;
  stageRunId: string;
  type: WorkflowExecutionErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  stageId?: string;
  stageKey?: string;
  workflowType?: string;
  outcome?: WorkflowExecutionOutcome;
  allowedKeyCount?: number;
  rawAllowedKeyCount?: number;
  retryContext?: WorkflowExecutionRetryContext;
}): WorkflowExecutionFailureResponse {
  const outcome = resolveFailureOutcome({
    type: input.type,
    retryable: input.retryable,
    outcome: input.outcome,
  });
  return {
    ok: false,
    requestId: input.requestId,
    stageRunId: input.stageRunId,
    workflow: input.stageId && input.stageKey
      ? {
          stageId: input.stageId,
          stageKey: input.stageKey,
          workflowType: input.workflowType,
          outcome,
          accepted: outcome === 'accepted' || outcome === 'partial',
          allowedKeyCount: Number(input.allowedKeyCount ?? 0),
          rawAllowedKeyCount: Number(input.rawAllowedKeyCount ?? 0),
          retryContext: input.retryContext,
        }
      : undefined,
    error: {
      type: input.type,
      message: input.message,
      retryable: input.retryable,
      retryAfterMs: input.retryAfterMs,
    },
  };
}

export function createWorkflowChatSuccess(input: {
  provider: string;
  model: string;
  requestId: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}): WorkflowChatSuccessResponse {
  return {
    ok: true,
    provider: input.provider,
    model: input.model,
    requestId: input.requestId,
    text: input.text,
    usage: {
      inputTokens: Number(input.inputTokens ?? 0),
      outputTokens: Number(input.outputTokens ?? 0),
    },
  };
}

export function createWorkflowChatFailure(input: {
  requestId: string;
  type: WorkflowExecutionErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}): WorkflowChatFailureResponse {
  return {
    ok: false,
    requestId: input.requestId,
    error: {
      type: input.type,
      message: input.message,
      retryable: input.retryable,
      retryAfterMs: input.retryAfterMs,
    },
  };
}
