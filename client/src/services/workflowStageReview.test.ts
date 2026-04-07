import { describe, expect, it } from 'vitest';
import {
  buildWorkflowStageErrorOutput,
  deduplicateWorkflowProposals,
  filterAnsweredWorkflowProposals,
  prepareWorkflowStageForReview,
  resolveWorkflowStageFailureHandling,
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
        options: ['Healing', 'Antitoxin'],
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
        options: ['Healing', 'Antitoxin'],
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

  it('drops single-option suggestion proposals so they do not pause the pipeline', () => {
    expect(sanitizeWorkflowProposals([
      {
        question: 'Include a crumbling cliffside hazard in the ambush scene.',
        options: ['Include a crumbling cliffside hazard in the ambush scene.'],
        default: 'Include a crumbling cliffside hazard in the ambush scene.',
      },
    ])).toEqual([]);
  });

  it('builds consistent review-modal error payloads', () => {
    expect(buildWorkflowStageErrorOutput({
      stageName: 'Creator: Stats',
      errorMessage: 'Missing armor_class.',
      displayErrorMessage: 'The last attempt returned incomplete structured data for this stage. Review the suggested fixes below, then retry the stage.',
      technicalErrorMessage: 'Missing armor_class.',
      rawSnippet: '{"ability_scores":{}}',
    })).toEqual({
      stage: 'Creator: Stats',
      error: 'The last attempt returned incomplete structured data for this stage. Review the suggested fixes below, then retry the stage.',
      technicalErrorMessage: 'Missing armor_class.',
      rawResponseSnippet: '{"ability_scores":{}}',
    });
  });

  it('marks structured NPC validation failures as auto-retryable once and softens the user-facing message', () => {
    expect(resolveWorkflowStageFailureHandling({
      stageName: 'Creator: Character Build',
      errorMessage: 'Skill proficiencies use placeholder modifiers (+0). Provide real signed modifiers for the listed proficient skills.',
      parsed: {
        conflicts: [
          {
            severity: 'critical',
            description: 'Skill proficiencies use placeholder modifiers (+0). Provide real signed modifiers for the listed proficient skills.',
          },
        ],
      },
      allowAutomaticRetry: true,
      automaticRetryAlreadyUsed: false,
    })).toEqual({
      userMessage: 'The last attempt returned incomplete character mechanics. Review the suggested fixes below, then retry the stage.',
      retryIssues: [
        'Skill proficiencies use placeholder modifiers (+0). Provide real signed modifiers for the listed proficient skills.',
      ],
      shouldAutoRetry: true,
    });
  });

  it('treats placeholder character build descriptions as incomplete mechanics for retry messaging', () => {
    expect(resolveWorkflowStageFailureHandling({
      stageName: 'Creator: Character Build',
      errorMessage: 'class_features[0] description repeats the feature name. Provide concrete effect text instead.',
      parsed: {
        conflicts: [
          {
            severity: 'critical',
            description: 'class_features[0] description repeats the feature name. Provide concrete effect text instead.',
          },
        ],
      },
      allowAutomaticRetry: true,
      automaticRetryAlreadyUsed: false,
    })).toEqual({
      userMessage: 'The last attempt returned incomplete character mechanics. Review the suggested fixes below, then retry the stage.',
      retryIssues: [
        'class_features[0] description repeats the feature name. Provide concrete effect text instead.',
      ],
      shouldAutoRetry: true,
    });
  });

  it('does not auto-retry the same structured validation failure after the one automatic pass is used', () => {
    expect(resolveWorkflowStageFailureHandling({
      stageName: 'Creator: Spellcasting',
      errorMessage: 'Known casters must include spells_known as a non-empty array of spell names.',
      parsed: {
        conflicts: [
          {
            severity: 'critical',
            description: 'Known casters must include spells_known as a non-empty array of spell names.',
          },
        ],
      },
      allowAutomaticRetry: true,
      automaticRetryAlreadyUsed: true,
    }).shouldAutoRetry).toBe(false);
  });
});
