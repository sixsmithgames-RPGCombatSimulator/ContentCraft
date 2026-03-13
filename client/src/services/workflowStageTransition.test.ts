import { describe, expect, it } from 'vitest';
import {
  buildWorkflowCompletionResult,
  getWorkflowStageProgression,
} from './workflowStageTransition';

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
});
