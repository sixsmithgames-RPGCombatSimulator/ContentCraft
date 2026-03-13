import { describe, expect, it } from 'vitest';
import {
  buildIntegratedStageRequest,
  buildManualStagePrompt,
  getConfirmedIntegratedStageMetadata,
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
      accepted: true,
      allowedKeyCount: 8,
      rawAllowedKeyCount: 5,
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
          accepted: false,
          allowedKeyCount: 0,
          rawAllowedKeyCount: 0,
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
      },
      { stageId: 'planner', stageKey: 'planner', workflowType: 'npc' },
    );

    expect(confirmed).toEqual({
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
