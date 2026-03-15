import { describe, expect, it } from 'vitest';
import {
  createUngroundedWarning,
  getWorkflowDefinition,
  getWorkflowStageDefinition,
  getWorkflowStageSequence,
  resolveWorkflowStageKey,
} from './workflowRegistry';
import {
  createGenerationRunState,
  getStageAttempt,
  markRunAwaitingUserDecisions,
  markRunComplete,
  markStageAccepted,
  syncCurrentStage,
  updateRetrievalStatus,
} from './workflowRunState';

describe('workflow registry', () => {
  it('resolves NPC stage aliases through the shared registry', () => {
    expect(resolveWorkflowStageKey('npc', 'basicInfo')).toBe('basic_info');
    expect(resolveWorkflowStageKey('npc', 'Creator: Spellcasting')).toBe('spellcasting');
  });

  it('resolves workflow-specific stages without cross-workflow collisions', () => {
    expect(resolveWorkflowStageKey('item', 'lore')).toBe('item.lore');
    expect(resolveWorkflowStageKey('monster', 'Ecology & Lore')).toBe('monster.lore');
    expect(resolveWorkflowStageKey('location', 'Purpose')).toBe('location.purpose');
  });

  it('returns ordered workflow stage definitions for NPC generation', () => {
    const workflow = getWorkflowDefinition('npc');
    const stages = getWorkflowStageSequence('npc');

    expect(workflow?.stageKeys[0]).toBe('keyword_extractor');
    expect(stages.map((stage) => stage.key)).toEqual(workflow?.stageKeys);
    expect(getWorkflowStageDefinition('npc', 'relationships')?.label).toBe('Creator: Relationships');
  });
});

describe('workflow run state', () => {
  it('tracks compile, acceptance, awaiting decisions, and completion', () => {
    const run = createGenerationRunState({
      workflowType: 'npc',
      workflowLabel: 'NPC Creator',
      executionMode: 'integrated',
      stageSequence: ['keyword_extractor', 'planner', 'basic_info'],
      stageLabels: {
        keyword_extractor: 'Keyword Extractor',
        planner: 'Planner',
        basic_info: 'Creator: Basic Info',
      },
      resourceCheckTarget: '#resources-panel',
      now: 1000,
    });

    const compiled = syncCurrentStage(run, 'planner', 'Planner', 'req-1', { transport: 'integrated', now: 1100 });
    expect(compiled?.currentStageKey).toBe('planner');
    expect(compiled?.currentAttemptId).toBeTruthy();
    expect(compiled?.attempts.at(-1)?.status).toBe('compiled');

    const accepted = markStageAccepted(compiled, 'planner', 'Planner', { attemptId: compiled?.currentAttemptId, now: 1200 });
    expect(accepted?.lastAcceptedStageKey).toBe('planner');
    expect(accepted?.attempts.at(-1)?.status).toBe('accepted');

    const awaiting = markRunAwaitingUserDecisions(accepted, 'planner', 'Planner', { attemptId: accepted?.currentAttemptId, now: 1300 });
    expect(awaiting?.status).toBe('awaiting_user_decisions');

    const completed = markRunComplete(awaiting, 1400);
    expect(completed?.status).toBe('complete');
    expect(completed?.completedAt).toBe(1400);
  });

  it('stores retry provenance on a compiled attempt', () => {
    const run = createGenerationRunState({
      workflowType: 'location',
      workflowLabel: 'Location Builder',
      executionMode: 'manual',
      stageSequence: ['location.spaces'],
      stageLabels: {
        'location.spaces': 'Spaces',
      },
      now: 1000,
    });

    const compiled = syncCurrentStage(run, 'location.spaces', 'Spaces', 'req-2', {
      transport: 'manual',
      retrySource: {
        kind: 'door_validation',
        label: 'Use door validation',
        summary: 'Door 1 is too close to the corner.',
        targetName: 'Vault',
        issueType: 'invalid-door',
      },
      now: 1100,
    });

    expect(compiled?.attempts.at(-1)?.retrySource).toEqual(
      expect.objectContaining({
        kind: 'door_validation',
        targetName: 'Vault',
        issueType: 'invalid-door',
      }),
    );
  });

  it('keeps the active stage attempt when an earlier stage is accepted retroactively', () => {
    const run = createGenerationRunState({
      workflowType: 'npc',
      workflowLabel: 'NPC Creator',
      executionMode: 'integrated',
      stageSequence: ['keyword_extractor', 'planner', 'basic_info'],
      stageLabels: {
        keyword_extractor: 'Keyword Extractor',
        planner: 'Planner',
        basic_info: 'Creator: Basic Info',
      },
      resourceCheckTarget: '#resources-panel',
      now: 1000,
    });

    const keywordCompiled = syncCurrentStage(run, 'keyword_extractor', 'Keyword Extractor', 'req-kw', { now: 1100 });
    const keywordAccepted = markStageAccepted(keywordCompiled, 'keyword_extractor', 'Keyword Extractor', {
      attemptId: keywordCompiled?.currentAttemptId,
      now: 1200,
    });
    const plannerCompiled = syncCurrentStage(keywordAccepted, 'planner', 'Planner', 'req-planner', { now: 1300 });

    expect(getStageAttempt(plannerCompiled, 'planner')?.status).toBe('compiled');
    expect(plannerCompiled?.currentStageKey).toBe('planner');

    const withRetroactiveAcceptance = markStageAccepted(plannerCompiled, 'keyword_extractor', 'Keyword Extractor', {
      now: 1400,
    });

    expect(withRetroactiveAcceptance?.currentStageKey).toBe('planner');
    expect(getStageAttempt(withRetroactiveAcceptance, 'planner')?.status).toBe('compiled');
    expect(getStageAttempt(withRetroactiveAcceptance, 'keyword_extractor')?.status).toBe('accepted');
    expect(withRetroactiveAcceptance?.attempts.filter((attempt) => attempt.stageKey === 'keyword_extractor')).toHaveLength(1);
  });

  it('tracks canon grounding and warning state explicitly', () => {
    const run = createGenerationRunState({
      workflowType: 'npc',
      workflowLabel: 'NPC Creator',
      executionMode: 'manual',
      stageSequence: ['keyword_extractor'],
      stageLabels: { keyword_extractor: 'Keyword Extractor' },
      resourceCheckTarget: '#resources-panel',
      now: 1000,
    });

    const libraryGrounded = updateRetrievalStatus(run, 'npc', 'library', 12, { now: 1100 });
    expect(libraryGrounded?.retrieval.groundingStatus).toBe('library');
    expect(libraryGrounded?.retrieval.warningMessage).toContain('library canon');

    const ungrounded = updateRetrievalStatus(libraryGrounded, 'npc', 'ungrounded', 0, { now: 1200 });
    expect(ungrounded?.retrieval.groundingStatus).toBe('ungrounded');
    expect(ungrounded?.warnings.some((warning) => warning.includes('ungrounded'))).toBe(true);
    expect(createUngroundedWarning('npc', 'project')).toBeUndefined();
  });
});
