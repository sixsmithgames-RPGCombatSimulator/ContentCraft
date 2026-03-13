import { describe, expect, it } from 'vitest';
import { createWorkflowExecutionFailure, createWorkflowExecutionSuccess } from './workflowExecutionService';

describe('createWorkflowExecutionSuccess', () => {
  it('includes accepted workflow metadata for the executed stage', () => {
    const result = createWorkflowExecutionSuccess({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      requestId: 'req-1',
      stageRunId: 'run-1',
      stageId: 'Creator: Basic Info',
      stageKey: 'basic_info',
      workflowType: 'npc',
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
      rawText: '{"name":"Thyra"}',
      jsonPatch: { 'Creator: Basic Info': { name: 'Thyra' } },
      foundJsonBlock: true,
    });

    expect(result.workflow).toEqual({
      stageId: 'Creator: Basic Info',
      stageKey: 'basic_info',
      workflowType: 'npc',
      outcome: 'accepted',
      accepted: true,
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
      retryContext: undefined,
    });
  });

  it('includes review_required workflow metadata for duplicate retry failures', () => {
    const result = createWorkflowExecutionFailure({
      requestId: 'req-2',
      stageRunId: 'run-2',
      stageId: 'planner',
      stageKey: 'planner',
      workflowType: 'npc',
      type: 'ABORTED',
      message: 'Duplicate retry signature detected; review required before retrying.',
      retryable: false,
      retryContext: {
        reason: 'duplicate_retry_signature',
        retryable: false,
        duplicateRetryBlocked: true,
      },
    });

    expect(result.workflow).toEqual({
      stageId: 'planner',
      stageKey: 'planner',
      workflowType: 'npc',
      outcome: 'review_required',
      accepted: false,
      allowedKeyCount: 0,
      rawAllowedKeyCount: 0,
      retryContext: {
        reason: 'duplicate_retry_signature',
        retryable: false,
        duplicateRetryBlocked: true,
      },
    });
  });
});
