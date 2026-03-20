import { describe, expect, it } from 'vitest';
import { createWorkflowExecutionFailure, createWorkflowExecutionSuccess } from './workflowExecutionService';
import type { WorkflowCanonSummary, WorkflowConflictSummary } from '../../shared/generation/workflowTypes.js';

describe('createWorkflowExecutionSuccess', () => {
  it('includes accepted workflow metadata for the executed stage', () => {
    const canon: WorkflowCanonSummary = {
      groundingStatus: 'project',
      factCount: 8,
      entityNames: ['Thyra'],
      gaps: [],
    };
    const conflictSummary: WorkflowConflictSummary = {
      reviewRequired: false,
      alignedCount: 8,
      additiveCount: 1,
      ambiguityCount: 0,
      conflictCount: 0,
      unsupportedCount: 0,
      items: [],
    };
    const result = createWorkflowExecutionSuccess({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      requestId: 'req-1',
      stageRunId: 'run-1',
      stageId: 'Creator: Basic Info',
      stageKey: 'basic_info',
      workflowType: 'npc',
      acceptanceState: 'accepted_with_additions',
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
      canon,
      conflictSummary,
      rawText: '{"name":"Thyra"}',
      jsonPatch: { 'Creator: Basic Info': { name: 'Thyra' } },
      foundJsonBlock: true,
    });

    expect(result.workflow).toEqual({
      stageId: 'Creator: Basic Info',
      stageKey: 'basic_info',
      workflowType: 'npc',
      outcome: 'accepted',
      acceptanceState: 'accepted_with_additions',
      accepted: true,
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
      canon,
      conflictSummary,
      retryContext: undefined,
    });
  });

  it('includes review_required workflow metadata for duplicate retry failures', () => {
    const conflictSummary: WorkflowConflictSummary = {
      reviewRequired: true,
      alignedCount: 0,
      additiveCount: 0,
      ambiguityCount: 0,
      conflictCount: 1,
      unsupportedCount: 0,
      items: [
        {
          key: 'duplicate_retry_signature',
          status: 'conflicting',
          message: 'Planner output duplicates an already-reviewed retry payload.',
        },
      ],
    };
    const result = createWorkflowExecutionFailure({
      requestId: 'req-2',
      stageRunId: 'run-2',
      stageId: 'planner',
      stageKey: 'planner',
      workflowType: 'npc',
      type: 'ABORTED',
      message: 'Duplicate retry signature detected; review required before retrying.',
      retryable: false,
      acceptanceState: 'review_required_conflict',
      conflictSummary,
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
      acceptanceState: 'review_required_conflict',
      accepted: false,
      allowedKeyCount: 0,
      rawAllowedKeyCount: 0,
      canon: undefined,
      conflictSummary,
      retryContext: {
        reason: 'duplicate_retry_signature',
        retryable: false,
        duplicateRetryBlocked: true,
      },
    });
  });
});
