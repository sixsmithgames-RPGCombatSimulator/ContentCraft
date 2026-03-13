import type { AiAssistantWorkflowContext, AiProviderType } from '../contexts/AiAssistantContext';
import type {
  WorkflowExecutionFailureResponse,
  WorkflowExecutionOutcome,
  WorkflowExecutionRetryContext,
  WorkflowExecutionSuccessResponse,
} from '../../../src/server/services/workflowExecutionService';

export interface WorkflowTransportStageRequest {
  projectId: string;
  stageId: string;
  stageRunId: string;
  prompt: string;
  schemaVersion: string;
  clientContext?: {
    appVersion?: string;
    stageKey?: string;
    generatorType?: string;
    userSelectedMode?: string;
    promptMode?: string;
    measuredChars?: number;
  };
}

export type WorkflowTransportStageResponse =
  | WorkflowExecutionSuccessResponse
  | WorkflowExecutionFailureResponse;

export interface ConfirmedWorkflowStageMetadata {
  stageId: string;
  stageKey: string;
  workflowType?: string;
  outcome: WorkflowExecutionOutcome;
  accepted: boolean;
  allowedKeyCount: number;
  rawAllowedKeyCount: number;
  retryContext?: WorkflowExecutionRetryContext;
}

export function buildIntegratedStageRequest(
  workflowContext: AiAssistantWorkflowContext,
  stageId: string,
  stageRunId: string,
  providerType: AiProviderType = 'none',
): WorkflowTransportStageRequest | null {
  const compiled = workflowContext.compiledStageRequest;
  if (!compiled) return null;

  return {
    projectId: workflowContext.projectId || 'default',
    stageId,
    stageRunId,
    prompt: compiled.prompt,
    schemaVersion: workflowContext.schemaVersion || 'v1.1-client',
    clientContext: {
      generatorType: workflowContext.generatorType || workflowContext.workflowType,
      stageKey: stageId,
      userSelectedMode: providerType,
      promptMode: compiled.promptBudget.mode,
      measuredChars: compiled.promptBudget.measuredChars,
    },
  };
}

export async function executeIntegratedStageRequest(
  requestBody: WorkflowTransportStageRequest,
): Promise<{ response: Response; body: WorkflowTransportStageResponse }> {
  const response = await fetch('/api/ai/workflow/execute-stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as WorkflowTransportStageResponse;
  return { response, body };
}

export function getConfirmedIntegratedStageMetadata(
  responseBody: WorkflowTransportStageResponse,
  fallback: { stageId: string; stageKey: string; workflowType?: string },
): ConfirmedWorkflowStageMetadata {
  if (responseBody.workflow) {
    return {
      stageId: responseBody.workflow.stageId || fallback.stageId,
      stageKey: responseBody.workflow.stageKey || fallback.stageKey,
      workflowType: responseBody.workflow.workflowType || fallback.workflowType,
      outcome: responseBody.workflow.outcome,
      accepted: responseBody.workflow.accepted,
      allowedKeyCount: responseBody.workflow.allowedKeyCount,
      rawAllowedKeyCount: responseBody.workflow.rawAllowedKeyCount,
      retryContext: responseBody.workflow.retryContext,
    };
  }

  return {
    stageId: fallback.stageId,
    stageKey: fallback.stageKey,
    workflowType: fallback.workflowType,
    outcome: responseBody.ok ? 'accepted' : 'invalid_response',
    accepted: responseBody.ok,
    allowedKeyCount: 0,
    rawAllowedKeyCount: 0,
    retryContext: undefined,
  };
}

export function buildManualStagePrompt(
  workflowContext: AiAssistantWorkflowContext,
): { prompt: string; stageKey: string; stageLabel: string; requestId: string } | null {
  const compiled = workflowContext.compiledStageRequest;
  if (!compiled) return null;

  return {
    prompt: compiled.prompt,
    stageKey: compiled.stageKey,
    stageLabel: compiled.stageLabel,
    requestId: compiled.requestId,
  };
}
