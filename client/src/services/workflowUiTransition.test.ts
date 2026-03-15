import { describe, expect, it } from 'vitest';
import {
  buildWorkflowAdvanceUiTransition,
  buildWorkflowCompletionUiTransition,
  buildWorkflowErrorUiTransition,
  buildWorkflowRetryUiTransition,
} from './workflowUiTransition';

describe('workflowUiTransition', () => {
  it('builds an error transition that clears in-flight workflow state', () => {
    expect(buildWorkflowErrorUiTransition()).toEqual({
      showReviewModal: true,
      sessionStatus: 'error',
      clearCompiledStageRequest: true,
      clearCanonNarrowing: true,
      clearWorkflowChunking: true,
      isStageChunking: false,
      isMultiPartGeneration: false,
    });
  });

  it('builds an advance transition with reset flags', () => {
    expect(buildWorkflowAdvanceUiTransition({
      resetMultiPart: true,
      resetStageChunking: true,
    })).toEqual({
      modalMode: null,
      skipMode: false,
      isMultiPartGeneration: false,
      clearWorkflowChunking: true,
      currentGroupIndex: 0,
      isStageChunking: false,
      currentStageChunk: 0,
      totalStageChunks: 0,
      clearAccumulatedChunkResults: true,
    });
  });

  it('supports narrower advance transitions without resetting chunking', () => {
    expect(buildWorkflowAdvanceUiTransition({
      resetMultiPart: false,
      closeModal: false,
      clearSkipMode: false,
    })).toEqual({
      modalMode: undefined,
      skipMode: undefined,
      isMultiPartGeneration: undefined,
      clearWorkflowChunking: undefined,
      currentGroupIndex: undefined,
      isStageChunking: undefined,
      currentStageChunk: undefined,
      totalStageChunks: undefined,
      clearAccumulatedChunkResults: undefined,
    });
  });

  it('builds a completion transition', () => {
    expect(buildWorkflowCompletionUiTransition()).toEqual({
      modalMode: null,
      sessionStatus: 'complete',
      clearCompiledStageRequest: true,
    });
  });

  it('builds a retry transition that closes review state', () => {
    expect(buildWorkflowRetryUiTransition()).toEqual({
      showReviewModal: false,
      sessionStatus: 'running',
      clearCompiledStageRequest: true,
    });
  });
});
