import type { WorkflowPromptNotice } from '../types/workflowUi';
import type { WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';

export type WorkflowSessionStatus =
  | 'idle'
  | 'running'
  | 'error'
  | 'complete'
  | 'awaiting_user_decisions';

export interface WorkflowUiTransitionPlan {
  modalMode?: 'input' | 'output' | null;
  skipMode?: boolean;
  showReviewModal?: boolean;
  sessionStatus?: WorkflowSessionStatus;
  clearCompiledStageRequest?: boolean;
  promptNotice?: WorkflowPromptNotice | null;
  retrySource?: WorkflowRetrySource | null;
  clearCanonNarrowing?: boolean;
  clearWorkflowChunking?: boolean;
  isMultiPartGeneration?: boolean;
  currentGroupIndex?: number;
  isStageChunking?: boolean;
  currentStageChunk?: number;
  totalStageChunks?: number;
  clearAccumulatedChunkResults?: boolean;
}

export function buildWorkflowErrorUiTransition(): WorkflowUiTransitionPlan {
  return {
    showReviewModal: true,
    sessionStatus: 'error',
    clearCompiledStageRequest: true,
    clearCanonNarrowing: true,
    clearWorkflowChunking: true,
    isStageChunking: false,
    isMultiPartGeneration: false,
  };
}

export function buildWorkflowAdvanceUiTransition(input: {
  resetMultiPart?: boolean;
  resetStageChunking?: boolean;
  closeModal?: boolean;
  clearSkipMode?: boolean;
} = {}): WorkflowUiTransitionPlan {
  return {
    modalMode: input.closeModal === false ? undefined : null,
    skipMode: input.clearSkipMode === false ? undefined : false,
    isMultiPartGeneration: input.resetMultiPart === false ? undefined : false,
    clearWorkflowChunking: input.resetMultiPart === false ? undefined : true,
    currentGroupIndex: input.resetMultiPart === false ? undefined : 0,
    isStageChunking: input.resetStageChunking ? false : undefined,
    currentStageChunk: input.resetStageChunking ? 0 : undefined,
    totalStageChunks: input.resetStageChunking ? 0 : undefined,
    clearAccumulatedChunkResults: input.resetStageChunking ? true : undefined,
  };
}

export function buildWorkflowCompletionUiTransition(): WorkflowUiTransitionPlan {
  return {
    modalMode: null,
    sessionStatus: 'complete',
    clearCompiledStageRequest: true,
  };
}

export function buildWorkflowRetryUiTransition(input: {
  closeReviewModal?: boolean;
} = {}): WorkflowUiTransitionPlan {
  return {
    showReviewModal: input.closeReviewModal === false ? undefined : false,
    sessionStatus: 'running',
  };
}
