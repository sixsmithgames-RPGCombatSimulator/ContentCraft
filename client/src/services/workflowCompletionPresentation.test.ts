import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildResolvedWorkflowFinalContent,
  buildWorkflowCompletionAlertMessage,
  getWorkflowCompletionTitle,
  logWorkflowCompletionResult,
} from './workflowCompletionPresentation';
import type { WorkflowCompletionResult } from './workflowStageTransition';
import type { GenerationRunState } from '../../../src/shared/generation/workflowTypes';

function createResolvedWorkflowRunState(): GenerationRunState {
  const canon = {
    groundingStatus: 'project' as const,
    factCount: 9,
    entityNames: ['Moonspire Keep'],
    gaps: ['missing ward sigil provenance'],
  };
  const conflicts = {
    reviewRequired: false,
    alignedCount: 8,
    additiveCount: 1,
    ambiguityCount: 0,
    conflictCount: 0,
    unsupportedCount: 0,
    items: [
      {
        key: 'wards.new_sigils',
        status: 'additive_unverified' as const,
        message: 'The new ward sigils are additive and not yet backed by canon.',
        fieldPath: 'wards.new_sigils',
        proposedValue: 'Moon glass sigils',
      },
    ],
  };

  return {
    runId: 'run-location-1',
    workflowType: 'location',
    workflowLabel: 'Location Builder',
    executionMode: 'integrated',
    status: 'ready',
    stageSequence: ['purpose', 'foundation'],
    stageLabels: {
      purpose: 'Purpose',
      foundation: 'Foundation',
    },
    currentStageKey: 'foundation',
    currentStageLabel: 'Foundation',
    currentStageIndex: 1,
    currentAttemptId: 'attempt-location-1',
    attempts: [
      {
        attemptId: 'attempt-location-1',
        stageKey: 'foundation',
        stageLabel: 'Foundation',
        status: 'accepted',
        transport: 'integrated',
        acceptanceState: 'accepted_with_additions',
        canon,
        conflicts,
        startedAt: 1,
        updatedAt: 2,
        acceptedAt: 2,
        completedAt: 2,
      },
    ],
    retrieval: {
      groundingStatus: 'project',
      provenance: 'project',
      factsFound: 9,
      lastUpdatedAt: 2,
    },
    acceptanceState: 'accepted_with_additions',
    memory: {
      request: {
        prompt: 'Build Moonspire Keep.',
        generatorType: 'location',
      },
      stage: {
        currentStageKey: 'foundation',
        currentStageLabel: 'Foundation',
        currentStageIndex: 1,
        completedStages: ['purpose'],
        currentStageData: { environment: 'mountain' },
        summaries: {
          purpose: { title: 'Moonspire Keep' },
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

describe('workflowCompletionPresentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds resolved workflow final content', () => {
    const finalContent = buildResolvedWorkflowFinalContent({
      workflowType: 'location',
      stageResults: {
        purpose: { title: 'Moonspire Keep' },
        foundation: { environment: 'mountain' },
      },
      ruleBase: '2024RAW',
    });

    expect(finalContent.title).toBe('Moonspire Keep');
    expect(finalContent.rule_base).toBe('2024RAW');
    expect(finalContent.deliverable).toBe('location');
  });

  it('builds resolved workflow final content with authoritative workflow provenance fallbacks', () => {
    const finalContent = buildResolvedWorkflowFinalContent({
      workflowType: 'location',
      stageResults: {
        purpose: { title: 'Moonspire Keep' },
        foundation: { environment: 'mountain' },
      },
      workflowRunState: createResolvedWorkflowRunState(),
    });

    expect(finalContent.conflicts).toEqual([
      expect.objectContaining({
        summary: 'The new ward sigils are additive and not yet backed by canon.',
        conflict_type: 'canon_addition',
        field_path: 'wards.new_sigils',
      }),
    ]);
    expect(finalContent.validation_notes).toContain('Acceptance state: accepted with additions.');
    expect(finalContent.validation_notes).toContain('Known canon gaps: missing ward sigil provenance.');
  });

  it('builds a validation summary completion alert', () => {
    const message = buildWorkflowCompletionAlertMessage({
      finalContent: {
        title: 'Barley',
        conflicts: [{ field: 'name' }],
        physics_issues: [{ issue: 'sightline' }, { issue: 'door' }],
        canon_alignment_score: 92,
        logic_score: 88,
      },
      variant: 'validation_summary',
    });

    expect(message).toContain('Title: Barley');
    expect(message).toContain('1 canon conflicts');
    expect(message).toContain('2 physics/logic issues');
    expect(message).toContain('92/100');
    expect(message).toContain('88/100');
  });

  it('builds a simple completion alert', () => {
    const message = buildWorkflowCompletionAlertMessage({
      finalContent: {
        canonical_name: 'Thyra Odinson',
      },
      variant: 'simple',
    });

    expect(message).toContain('Title: Thyra Odinson');
    expect(message).toContain('review and save the content');
  });

  it('logs completion details and conflicts', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const completionResult: WorkflowCompletionResult = {
      assembledContent: {
        content: { title: 'Barley' },
        logLabel: 'NPC: intelligently merged creator stage results',
        logDetails: { totalFields: 12 },
        conflicts: [{ field: 'name', resolvedValue: 'Barley', resolution: 'last-wins', stages: [] }],
      },
      baseContent: { title: 'Barley' },
      proposals: [],
      finalContent: { title: 'Barley' },
    };

    logWorkflowCompletionResult('[Pipeline Complete]', completionResult, {});

    expect(logSpy).toHaveBeenCalledWith(
      '[Pipeline Complete] NPC: intelligently merged creator stage results',
      { totalFields: 12 },
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it('prefers title over canonical name for completion titles', () => {
    expect(getWorkflowCompletionTitle({
      title: 'Storm Crown',
      canonical_name: 'Fallback Name',
    })).toBe('Storm Crown');
  });
});
