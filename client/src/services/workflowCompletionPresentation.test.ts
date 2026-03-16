import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildResolvedWorkflowFinalContent,
  buildWorkflowCompletionAlertMessage,
  getWorkflowCompletionTitle,
  logWorkflowCompletionResult,
} from './workflowCompletionPresentation';
import type { WorkflowCompletionResult } from './workflowStageTransition';

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
