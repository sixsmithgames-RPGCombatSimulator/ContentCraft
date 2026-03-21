import { describe, expect, it } from 'vitest';
import {
  buildWorkflowCompletionResult,
  getWorkflowStageProgression,
} from './workflowStageTransition';
import type { GenerationRunState } from '../../../src/shared/generation/workflowTypes';

function createAuthoritativeWorkflowRunState(title = 'Moonlit Dock'): GenerationRunState {
  const canon = {
    groundingStatus: 'project' as const,
    factCount: 12,
    entityNames: [title, 'Azure Court'],
    gaps: [],
  };
  const conflicts = {
    reviewRequired: true,
    alignedCount: 11,
    additiveCount: 0,
    ambiguityCount: 0,
    conflictCount: 1,
    unsupportedCount: 0,
    items: [
      {
        key: 'ownership.current_holder',
        status: 'conflicting' as const,
        message: 'Dock ownership conflicts with established Azure Court canon.',
        fieldPath: 'ownership.current_holder',
        currentValue: 'Harbormaster Sel',
        proposedValue: 'Azure Court',
      },
    ],
  };

  return {
    runId: 'run-1',
    workflowType: 'scene',
    workflowLabel: 'Scene Builder',
    executionMode: 'integrated',
    status: 'awaiting_user_input',
    stageSequence: ['creator', 'fact_checker', 'canon_validator'],
    stageLabels: {
      creator: 'Creator',
      fact_checker: 'Fact Checker',
      canon_validator: 'Canon Validator',
    },
    currentStageKey: 'fact_checker',
    currentStageLabel: 'Fact Checker',
    currentStageIndex: 1,
    currentAttemptId: 'attempt-1',
    attempts: [
      {
        attemptId: 'attempt-1',
        stageKey: 'fact_checker',
        stageLabel: 'Fact Checker',
        status: 'awaiting_user_input',
        transport: 'integrated',
        acceptanceState: 'review_required_conflict',
        canon,
        conflicts,
        startedAt: 1,
        updatedAt: 2,
      },
    ],
    retrieval: {
      groundingStatus: 'project',
      provenance: 'project',
      factsFound: 12,
      lastUpdatedAt: 2,
    },
    acceptanceState: 'review_required_conflict',
    memory: {
      request: {
        prompt: 'Draft the harbor confrontation scene.',
        generatorType: 'scene',
        schemaVersion: 'v1.1-client',
      },
      stage: {
        currentStageKey: 'fact_checker',
        currentStageLabel: 'Fact Checker',
        currentStageIndex: 1,
        completedStages: ['creator'],
        currentStageData: { title },
        summaries: {
          creator: { title },
        },
      },
      decisions: {
        confirmed: {},
        unresolvedQuestions: [],
      },
      canon,
      conflicts,
    },
    warnings: [],
    startedAt: 1,
    updatedAt: 2,
  };
}

describe('workflowStageTransition', () => {
  it('returns the next stage when the workflow is not complete', () => {
    expect(getWorkflowStageProgression(2, 5)).toEqual({
      kind: 'advance',
      nextIndex: 3,
    });
  });

  it('returns complete when the workflow is at the final stage', () => {
    expect(getWorkflowStageProgression(4, 5)).toEqual({
      kind: 'complete',
    });
  });

  it('builds finalized workflow output with deduplicated proposals', () => {
    const result = buildWorkflowCompletionResult({
      workflowType: 'encounter',
      stageResults: {
        concept: {
          title: 'Kitchen Under Siege',
          objectives: ['Protect the pantry'],
          proposals: [
            {
              question: 'Should the cook save the mayor?',
              options: ['Yes', 'No'],
            },
            {
              question: 'Should the cook save the mayor?!',
              options: ['Yes', 'No'],
            },
          ],
        },
        enemies: {
          monsters: [{ name: 'Brine Mephit', count: 3 }],
        },
        terrain: {
          terrain: { summary: 'Flooded galley' },
        },
        tactics: {
          tactics: { opening_moves: ['Break the stove line'] },
        },
        rewards: {
          treasure: { gold: '180 gp' },
        },
      },
      accumulatedAnswers: {
        'Should the cook save the mayor?': 'Yes',
      },
      strategy: 'finalized',
    });

    expect(result.assembledContent.logLabel).toContain('Encounter');
    expect(result.proposals).toEqual([]);
    expect(result.finalContent).toMatchObject({
      deliverable: 'encounter',
      type: 'encounter',
      title: 'Kitchen Under Siege',
      monsters: [{ name: 'Brine Mephit', count: 3 }],
    });
  });

  it('builds resolved workflow output for restored or merged completion flows', () => {
    const result = buildWorkflowCompletionResult({
      workflowType: 'location',
      stageResults: {
        purpose: {
          title: 'Moonwell Vault',
        },
        foundation: {
          total_floors: 2,
        },
      },
      strategy: 'resolved',
      ruleBase: '2024RAW',
    });

    expect(result.finalContent).toMatchObject({
      title: 'Moonwell Vault',
      _pipeline_stages: expect.any(Object),
    });
  });

  it('preserves authoritative workflow conflict provenance in finalized output when validator stages are absent', () => {
    const result = buildWorkflowCompletionResult({
      workflowType: 'scene',
      stageResults: {
        creator: {
          title: 'Moonlit Dock',
          description: 'Lantern light ripples across black water.',
        },
      },
      strategy: 'finalized',
      workflowRunState: createAuthoritativeWorkflowRunState(),
    });

    expect(result.finalContent).toMatchObject({
      title: 'Moonlit Dock',
      deliverable: 'scene',
    });
    expect(result.finalContent.conflicts).toEqual([
      expect.objectContaining({
        summary: 'Dock ownership conflicts with established Azure Court canon.',
        field_path: 'ownership.current_holder',
        conflict_type: 'canon_conflict',
        existing_claim: 'Harbormaster Sel',
        new_claim: 'Azure Court',
      }),
    ]);
    expect(result.finalContent.validation_notes).toContain('Acceptance state: review required conflict.');
    expect(result.finalContent.validation_notes).toContain('Canon grounding: project');
  });
});
