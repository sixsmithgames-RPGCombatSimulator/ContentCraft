import { describe, expect, it } from 'vitest';
import {
  buildIntegratedStageRequest,
  buildManualStagePrompt,
  getConfirmedIntegratedStageMetadata,
  resolveIntegratedRetryDelayMs,
  shouldAutoRetryIntegratedFailure,
} from './workflowTransport';
import type { AiAssistantWorkflowContext } from '../contexts/AiAssistantContext';

function createWorkflowContext(): AiAssistantWorkflowContext {
  return {
    workflowType: 'npc',
    workflowLabel: 'NPC Creator',
    currentStage: 'Creator: Basic Info',
    stageRouterKey: 'basic_info',
    currentData: {},
    compiledStageRequest: {
      requestId: 'req-123',
      stageKey: 'basic_info',
      stageLabel: 'Creator: Basic Info',
      prompt: 'SYSTEM\nUSER',
      systemPrompt: 'SYSTEM',
      userPrompt: 'USER',
      promptBudget: {
        measuredChars: 2048,
        safetyCeiling: 7200,
        hardLimit: 8000,
        mode: 'packed',
        droppedSections: [],
        warnings: [],
        compressionApplied: false,
      },
      memory: {
        request: {
          prompt: 'Create an NPC',
          type: 'npc',
          stageKey: 'basic_info',
          stageLabel: 'Creator: Basic Info',
        },
        completedStages: ['keyword_extractor', 'planner'],
        currentStageData: {},
        priorStageSummaries: {},
        previousDecisions: {},
        factpack: {
          factCount: 0,
          entityNames: [],
          gaps: [],
          groundingStatus: 'ungrounded',
        },
        canon: {
          groundingStatus: 'ungrounded',
          factCount: 0,
          entityNames: [],
          gaps: [],
        },
        conflicts: {
          reviewRequired: false,
          alignedCount: 0,
          additiveCount: 0,
          ambiguityCount: 0,
          conflictCount: 0,
          unsupportedCount: 0,
          items: [],
        },
        execution: {
          workflowType: 'npc',
          executionMode: 'integrated',
          currentStageIndex: 2,
        },
      },
    },
    generatorType: 'npc',
    schemaVersion: 'v1.1-client',
    projectId: 'project-1',
  };
}

describe('workflow transport', () => {
  it('builds integrated workflow stage requests from shared workflow context', () => {
    const context = createWorkflowContext();
    const request = buildIntegratedStageRequest(context, 'basic_info', 'run-1', 'openai');

    expect(request).toEqual({
      projectId: 'project-1',
      stageId: 'basic_info',
      stageRunId: 'run-1',
      prompt: 'SYSTEM\nUSER',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        stageKey: 'basic_info',
        userSelectedMode: 'openai',
        promptMode: 'packed',
        measuredChars: 2048,
        memorySummary: context.compiledStageRequest?.memory,
      },
    });
  });

  it('uses override prompt metadata for correction retries', () => {
    const context = createWorkflowContext();
    const request = buildIntegratedStageRequest(context, 'basic_info', 'run-2', 'gemini', {
      promptOverride: 'FIX JSON ONLY',
      correctionAttempt: 1,
    });

    expect(request).toEqual({
      projectId: 'project-1',
      stageId: 'basic_info',
      stageRunId: 'run-2',
      prompt: 'FIX JSON ONLY',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        stageKey: 'basic_info',
        userSelectedMode: 'gemini',
        promptMode: 'packed',
        measuredChars: 'FIX JSON ONLY'.length,
        correctionAttempt: 1,
        memorySummary: context.compiledStageRequest?.memory,
      },
    });
  });

  it('builds manual stage prompts from the same compiled request', () => {
    const context = createWorkflowContext();
    const manual = buildManualStagePrompt(context);

    expect(manual).toEqual({
      prompt: 'SYSTEM\nUSER',
      stageKey: 'basic_info',
      stageLabel: 'Creator: Basic Info',
      requestId: 'req-123',
    });
  });

  it('returns null when no compiled stage request is present', () => {
    const context = {
      ...createWorkflowContext(),
      compiledStageRequest: undefined,
    };

    expect(buildIntegratedStageRequest(context, 'basic_info', 'run-1', 'gemini')).toBeNull();
    expect(buildManualStagePrompt(context)).toBeNull();
  });

  it('prefers confirmed stage metadata from the server response', () => {
    const confirmed = getConfirmedIntegratedStageMetadata(
      {
        ok: true,
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        requestId: 'req-1',
        stageRunId: 'run-1',
        workflow: {
          stageId: 'Creator: Basic Info',
          stageKey: 'basic_info',
          workflowType: 'npc',
          outcome: 'accepted',
          acceptanceState: 'accepted',
          accepted: true,
          allowedKeyCount: 8,
          rawAllowedKeyCount: 5,
        },
        rawText: '{"name":"Thyra"}',
        jsonPatch: { basic_info: { name: 'Thyra' } },
        parse: {
          foundJsonBlock: true,
          parseWarnings: [],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
        safety: {
          patchSizeBytes: 12,
          appliedPathsCandidateCount: 1,
        },
      },
      { stageId: 'basic_info', stageKey: 'basic_info', workflowType: 'npc' },
    );

    expect(confirmed).toEqual({
      stageId: 'Creator: Basic Info',
      stageKey: 'basic_info',
      workflowType: 'npc',
      outcome: 'accepted',
      acceptanceState: 'accepted',
      accepted: true,
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
      canon: undefined,
      conflictSummary: undefined,
      retryContext: undefined,
    });
  });

  it('uses workflow metadata from failure responses when available', () => {
    const confirmed = getConfirmedIntegratedStageMetadata(
      {
        ok: false,
        requestId: 'req-2',
        stageRunId: 'run-2',
        workflow: {
          stageId: 'planner',
          stageKey: 'planner',
          workflowType: 'npc',
          outcome: 'review_required',
          acceptanceState: 'review_required_conflict',
          accepted: false,
          allowedKeyCount: 0,
          rawAllowedKeyCount: 0,
          retryContext: {
            reason: 'duplicate_retry_signature',
            retryable: false,
            duplicateRetryBlocked: true,
            validationIssues: ['proposals must be an array of proposal objects'],
          },
        },
        error: {
          type: 'ABORTED',
          message: 'Duplicate retry signature detected; review required before retrying.',
          retryable: false,
        },
      },
      { stageId: 'planner', stageKey: 'planner', workflowType: 'npc' },
    );

    expect(confirmed).toEqual({
      stageId: 'planner',
      stageKey: 'planner',
      workflowType: 'npc',
      outcome: 'review_required',
      acceptanceState: 'review_required_conflict',
      accepted: false,
      allowedKeyCount: 0,
      rawAllowedKeyCount: 0,
      canon: undefined,
      conflictSummary: undefined,
      retryContext: {
        reason: 'duplicate_retry_signature',
        retryable: false,
        duplicateRetryBlocked: true,
        validationIssues: ['proposals must be an array of proposal objects'],
      },
    });
  });

  it('does not auto-retry non-retryable integrated failures', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-3',
      stageRunId: 'run-3',
      workflow: {
        stageId: 'stats',
        stageKey: 'stats',
        workflowType: 'npc',
        outcome: 'invalid_response',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 6,
        rawAllowedKeyCount: 6,
        retryContext: {
          reason: 'schema_validation_failed',
          retryable: false,
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: '/speed/walk must be string',
        retryable: false,
      },
    })).toBe(false);
  });

  it('does not auto-retry review-required failures', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-4',
      stageRunId: 'run-4',
      workflow: {
        stageId: 'stats',
        stageKey: 'stats',
        workflowType: 'npc',
        outcome: 'review_required',
        acceptanceState: 'review_required_conflict',
        accepted: false,
        allowedKeyCount: 6,
        rawAllowedKeyCount: 6,
        retryContext: {
          reason: 'duplicate_retry_signature',
          retryable: false,
          duplicateRetryBlocked: true,
        },
      },
      error: {
        type: 'ABORTED',
        message: 'Duplicate retry signature detected; review required before retrying.',
        retryable: false,
      },
    })).toBe(false);
  });

  it('allows auto-retry for repairable schema failures carrying correction prompts', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-5',
      stageRunId: 'run-5',
      workflow: {
        stageId: 'character_build',
        stageKey: 'character_build',
        workflowType: 'npc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 8,
        rawAllowedKeyCount: 8,
        retryContext: {
          reason: 'schema_validation_failed',
          retryable: true,
          correctionPrompt: 'Output ONLY valid JSON.',
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'character_build returned malformed structured data. Retrying automatically with repair instructions.',
        retryable: true,
      },
    })).toBe(true);
  });

  it('does not auto-retry retry-required failures when the correction prompt is missing', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-5b',
      stageRunId: 'run-5b',
      workflow: {
        stageId: 'character_build',
        stageKey: 'character_build',
        workflowType: 'npc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 8,
        rawAllowedKeyCount: 8,
        retryContext: {
          reason: 'schema_validation_failed',
          retryable: true,
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'character_build returned malformed structured data. Review required before retrying.',
        retryable: true,
      },
    })).toBe(false);
  });

  it('does not auto-retry retry-required failures when the correction prompt is blank', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-5c',
      stageRunId: 'run-5c',
      workflow: {
        stageId: 'character_build',
        stageKey: 'character_build',
        workflowType: 'npc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 8,
        rawAllowedKeyCount: 8,
        retryContext: {
          reason: 'schema_validation_failed',
          retryable: true,
          correctionPrompt: '   ',
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'character_build returned malformed structured data. Review required before retrying.',
        retryable: true,
      },
    })).toBe(false);
  });

  it('allows auto-retry for repairable spellcasting semantic failures carrying correction prompts', () => {
    expect(shouldAutoRetryIntegratedFailure({
      ok: false,
      requestId: 'req-6',
      stageRunId: 'run-6',
      workflow: {
        stageId: 'spellcasting',
        stageKey: 'spellcasting',
        workflowType: 'npc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 9,
        rawAllowedKeyCount: 4,
        retryContext: {
          reason: 'spellcasting_semantic_validation_failed',
          retryable: true,
          correctionPrompt: 'Return spellcasting JSON.\n\nADDITIONAL_CRITICAL_INSTRUCTIONS (RETRY):',
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'Spellcasting response was incomplete. Retrying automatically with repair instructions.',
        retryable: true,
      },
    })).toBe(true);
  });

  it('resolves integrated retry delay from workflow retry metadata with a safe minimum', () => {
    expect(resolveIntegratedRetryDelayMs({
      ok: false,
      requestId: 'req-7',
      stageRunId: 'run-7',
      workflow: {
        stageId: 'story_arc.characters',
        stageKey: 'story_arc.characters',
        workflowType: 'story_arc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 2,
        rawAllowedKeyCount: 1,
        retryContext: {
          reason: 'contract_validation_failed',
          retryable: true,
          retryAfterMs: 603,
          correctionPrompt: 'Return ONLY JSON.',
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'story_arc.characters returned malformed structured data. Retrying automatically with repair instructions.',
        retryable: true,
        retryAfterMs: 603,
      },
    })).toBe(2500);
  });

  it('falls back to the default integrated retry delay when retry metadata is absent', () => {
    expect(resolveIntegratedRetryDelayMs({
      ok: false,
      requestId: 'req-8',
      stageRunId: 'run-8',
      workflow: {
        stageId: 'story_arc.characters',
        stageKey: 'story_arc.characters',
        workflowType: 'story_arc',
        outcome: 'retry_required',
        acceptanceState: 'invalid_response',
        accepted: false,
        allowedKeyCount: 2,
        rawAllowedKeyCount: 1,
        retryContext: {
          reason: 'contract_validation_failed',
          retryable: true,
          correctionPrompt: 'Return ONLY JSON.',
        },
      },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'story_arc.characters returned malformed structured data. Retrying automatically with repair instructions.',
        retryable: true,
      },
    })).toBe(5000);
  });
});
