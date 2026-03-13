import { describe, expect, it } from 'vitest';
import { addProgressEntry, attachWorkflowSessionMetadata, createProgressSession, updateProgressResponse } from './generationProgress';

describe('generationProgress', () => {
  it('persists confirmed workflow metadata on the last completed progress entry', () => {
    const session = addProgressEntry(
      createProgressSession({ type: 'npc', prompt: 'Create Thyra' }),
      'Creator: Basic Info',
      null,
      'SYSTEM\nUSER',
    );

    const updated = updateProgressResponse(
      session,
      '{"name":"Thyra"}',
      'completed',
      undefined,
      {
        confirmedStageId: 'Creator: Basic Info',
        confirmedStageKey: 'basic_info',
        confirmedWorkflowType: 'npc',
      },
    );

    expect(updated.progress.at(-1)).toEqual(
      expect.objectContaining({
        confirmedStageId: 'Creator: Basic Info',
        confirmedStageKey: 'basic_info',
        confirmedWorkflowType: 'npc',
      }),
    );
  });

  it('attaches persisted workflow run state additively to saved sessions', () => {
    const updated = attachWorkflowSessionMetadata(
      createProgressSession({ type: 'npc', prompt: 'Create Thyra' }),
      {
        workflowType: 'npc',
        workflowStageSequence: ['keyword_extractor', 'planner', 'basic_info'],
        workflowRunState: {
          runId: 'run-1',
          workflowType: 'npc',
          workflowLabel: 'NPC Creator',
          executionMode: 'integrated',
          status: 'running',
          stageSequence: ['keyword_extractor', 'planner', 'basic_info'],
          stageLabels: {
            keyword_extractor: 'Keyword Extractor',
            planner: 'Planner',
            basic_info: 'Creator: Basic Info',
          },
          currentStageKey: 'planner',
          currentStageLabel: 'Planner',
          currentStageIndex: 1,
          currentAttemptId: 'attempt-1',
          attempts: [],
          retrieval: {
            groundingStatus: 'project',
            provenance: 'project',
            factsFound: 12,
            lastUpdatedAt: 1000,
            resourceCheckTarget: '#resources-panel',
          },
          warnings: [],
          resourceCheckTarget: '#resources-panel',
          startedAt: 1000,
          updatedAt: 1000,
        },
        compiledStageRequest: {
          requestId: 'req-1',
          stageKey: 'planner',
          stageLabel: 'Planner',
          prompt: 'Retry the planner output.',
          systemPrompt: 'SYSTEM',
          userPrompt: 'USER',
          promptBudget: {
            measuredChars: 25,
            safetyCeiling: 7200,
            hardLimit: 8000,
            mode: 'packed',
            droppedSections: [],
            warnings: [],
            compressionApplied: false,
          },
          memory: {
            request: {
              prompt: 'Retry the planner output.',
              stageKey: 'planner',
              stageLabel: 'Planner',
            },
            completedStages: [],
            currentStageData: {},
            priorStageSummaries: {},
            previousDecisions: {},
            factpack: {
              factCount: 0,
              entityNames: [],
            },
          },
        },
      },
    );

    expect(updated.workflowType).toBe('npc');
    expect(updated.workflowStageSequence).toEqual(['keyword_extractor', 'planner', 'basic_info']);
    expect(updated.workflowRunState).toEqual(
      expect.objectContaining({
        executionMode: 'integrated',
        currentStageKey: 'planner',
        currentAttemptId: 'attempt-1',
      }),
    );
    expect(updated.compiledStageRequest).toEqual(
      expect.objectContaining({
        requestId: 'req-1',
        stageKey: 'planner',
      }),
    );
  });
});
