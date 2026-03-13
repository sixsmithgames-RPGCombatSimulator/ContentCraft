import { describe, expect, it } from 'vitest';
import {
  buildWorkflowStageErrorOutput,
  deduplicateWorkflowProposals,
  filterAnsweredWorkflowProposals,
  prepareWorkflowStageForReview,
  sanitizeWorkflowProposals,
} from './workflowStageReview';

describe('workflowStageReview', () => {
  it('pauses planner stages when unanswered proposals remain', () => {
    const result = prepareWorkflowStageForReview({
      parsed: {
        proposals: [
          {
            question: 'Which oath does Thyra uphold?',
            options: ['Devotion', 'Watchers'],
            default: 'Devotion',
          },
        ],
      },
      stageName: 'Planner',
      workflowType: 'npc',
      accumulatedAnswers: {},
      isMultiPartGeneration: false,
    });

    expect(result.shouldPauseForPlannerDecisions).toBe(true);
    expect(result.shouldPauseForReview).toBe(false);
    expect(result.hasProposals).toBe(true);
  });

  it('turns fact-check ambiguities into review proposals and pauses for review', () => {
    const result = prepareWorkflowStageForReview({
      parsed: {
        ambiguities: [
          {
            field_path: 'content.title',
            text: 'Moon Dock',
            clarification_needed: 'Should the title stay "Moon Dock" or be revised?',
            recommended_revision: 'Rename it to "Moonlit Dock".',
          },
        ],
        conflicts: [{ severity: 'warning', description: 'Minor canon mismatch' }],
      },
      stageName: 'Fact Checker',
      workflowType: 'scene',
      accumulatedAnswers: {},
      isMultiPartGeneration: false,
    });

    expect(result.shouldPauseForReview).toBe(true);
    expect(result.hasProposals).toBe(true);
    expect(Array.isArray(result.parsed.proposals)).toBe(true);
    expect((result.parsed.proposals as unknown[]).length).toBe(1);
  });

  it('treats editor-style review stages as fact-check stages for writing workflows', () => {
    const result = prepareWorkflowStageForReview({
      parsed: {
        ambiguities: [
          {
            field_path: 'chapters[0].title',
            text: 'Salt Road',
            clarification_needed: 'Should the chapter title reference the ruined harbor instead?',
            recommended_revision: 'Rename it to "Harbor Road Ruins".',
          },
        ],
      },
      stageName: 'Editor & Style',
      workflowType: 'outline',
      accumulatedAnswers: {},
      isMultiPartGeneration: false,
    });

    expect(result.shouldPauseForReview).toBe(true);
    expect(result.hasProposals).toBe(true);
    expect(Array.isArray(result.parsed.proposals)).toBe(true);
    expect((result.parsed.proposals as unknown[]).length).toBe(1);
  });

  it('does not route location spaces through the generic review modal', () => {
    const result = prepareWorkflowStageForReview({
      parsed: {
        conflicts: [{ severity: 'critical', description: 'Door exceeds wall length' }],
      },
      stageName: 'Spaces',
      workflowType: 'location',
      accumulatedAnswers: {},
      isMultiPartGeneration: false,
    });

    expect(result.hasCriticalIssues).toBe(true);
    expect(result.shouldPauseForReview).toBe(false);
  });

  it('deduplicates proposals against ids, exact questions, and normalized questions', () => {
    const sanitized = sanitizeWorkflowProposals([
      {
        id: 'oath-choice',
        question: 'Which oath does Thyra uphold?',
        topic: 'Paladin Oath',
        options: ['Devotion', 'Watchers'],
      },
      {
        question: 'Which oath does Thyra uphold?!',
        options: ['Devotion', 'Watchers'],
      },
      {
        question: 'What potions does she carry?',
        options: ['Healing'],
      },
    ]);

    const deduped = deduplicateWorkflowProposals(sanitized, {
      'oath-choice': 'Devotion',
    });

    expect(deduped).toEqual([
      expect.objectContaining({
        question: 'What potions does she carry?',
      }),
    ]);
  });

  it('filters answered proposals for accept-with-issues flows', () => {
    const filtered = filterAnsweredWorkflowProposals([
      {
        question: 'Which oath does Thyra uphold?',
        options: ['Devotion', 'Watchers'],
      },
      {
        question: 'What potions does she carry?',
        options: ['Healing'],
      },
    ], {
      'Which oath does Thyra uphold?': 'Devotion',
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        question: 'What potions does she carry?',
      }),
    ]);
  });

  it('builds consistent review-modal error payloads', () => {
    expect(buildWorkflowStageErrorOutput({
      stageName: 'Creator: Stats',
      errorMessage: 'Missing armor_class.',
      rawSnippet: '{"ability_scores":{}}',
    })).toEqual({
      stage: 'Creator: Stats',
      error: 'Missing armor_class.',
      rawResponseSnippet: '{"ability_scores":{}}',
    });
  });
});
