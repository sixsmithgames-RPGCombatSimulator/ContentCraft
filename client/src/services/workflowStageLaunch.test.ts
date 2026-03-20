import { describe, expect, it } from 'vitest';
import {
  buildWorkflowCompletedLaunchPlan,
  buildWorkflowFactChunkRestartLaunchPlan,
  buildWorkflowFactChunkStartLaunchPlan,
  buildWorkflowJumpToStageLaunchPlan,
  buildWorkflowNpcSectionStartLaunchPlan,
  buildWorkflowPromptLaunchPlan,
  buildWorkflowResumeLaunchPlan,
  buildWorkflowSameStageLaunchPlan,
} from './workflowStageLaunch';

describe('workflowStageLaunch', () => {
  it('builds a stage jump launch plan', () => {
    expect(buildWorkflowJumpToStageLaunchPlan({
      stageIndex: 2,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: { facts: [], entities: [], gaps: [] },
    })).toEqual({
      kind: 'show_stage',
      stageIndex: 2,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: { facts: [], entities: [], gaps: [] },
    });
  });

  it('builds a pending prompt resume launch plan with retry notice', () => {
    const plan = buildWorkflowResumeLaunchPlan({
      resumeAction: {
        kind: 'pending_prompt',
        stageIndex: 1,
        prompt: 'Retry the planner output.',
        stageName: 'Planner',
        alertMessage: 'Resume planner',
        retrySource: {
          kind: 'freeform_rejection',
          label: 'Manual Retry',
          summary: 'User requested a retry',
        },
      },
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: null,
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
            currentStageIndex: 1,
          },
        },
      },
      retryNoticeBuilder: (retrySource) => ({
        title: retrySource.label,
        message: retrySource.summary,
      }),
    });

    expect(plan).toEqual({
      kind: 'show_prompt',
      stageIndex: 1,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: null,
      prompt: 'Retry the planner output.',
      promptNotice: {
        title: 'Manual Retry',
        message: 'User requested a retry',
      },
      retrySource: {
        kind: 'freeform_rejection',
        label: 'Manual Retry',
        summary: 'User requested a retry',
      },
      compiledStageRequest: expect.objectContaining({
        requestId: 'req-1',
        stageKey: 'planner',
      }),
      alertMessage: 'Resume planner',
      clearCompiledStageRequest: true,
      modalMode: 'input',
    });
  });

  it('builds a direct prompt launch plan for manual prompt flows', () => {
    const plan = buildWorkflowPromptLaunchPlan({
      stageIndex: 0,
      stageResults: { homebrew_chunks: { items: [] } },
      factpack: null,
      prompt: 'Parse this chunk.',
      modalMode: 'output',
    });

    expect(plan).toEqual({
      kind: 'show_prompt',
      stageIndex: 0,
      stageResults: { homebrew_chunks: { items: [] } },
      factpack: null,
      prompt: 'Parse this chunk.',
      promptNotice: null,
      retrySource: null,
      alertMessage: undefined,
      clearCompiledStageRequest: true,
      modalMode: 'output',
    });
  });

  it('builds a completed resume launch plan', () => {
    const plan = buildWorkflowResumeLaunchPlan({
      resumeAction: {
        kind: 'completed',
        finalOutput: { title: 'Done' },
        alertMessage: 'Already complete',
      },
      stageResults: {},
      factpack: null,
      retryNoticeBuilder: () => null,
    });

    expect(plan).toEqual({
      kind: 'show_completed',
      finalOutput: { title: 'Done' },
      alertMessage: 'Already complete',
    });
  });

  it('builds a direct completed launch plan', () => {
    expect(buildWorkflowCompletedLaunchPlan({
      finalOutput: { title: 'Done' },
      alertMessage: 'Finished',
    })).toEqual({
      kind: 'show_completed',
      finalOutput: { title: 'Done' },
      alertMessage: 'Finished',
    });
  });

  it('builds a fact chunk restart launch plan', () => {
    const plan = buildWorkflowFactChunkRestartLaunchPlan({
      plannerStageIndex: 0,
      nextChunkIndex: 2,
      nextFactpack: {
        facts: [{ chunk_id: '2', text: 'Moon fact', entity_id: 'moon', entity_name: 'Moon' }],
        entities: ['Moon'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 3,
        totalChunks: 5,
        chunkLabel: 'Chunk 3',
      },
    });

    expect(plan).toEqual({
      kind: 'show_stage',
      stageIndex: 0,
      stageResults: {},
      factpack: {
        facts: [{ chunk_id: '2', text: 'Moon fact', entity_id: 'moon', entity_name: 'Moon' }],
        entities: ['Moon'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 3,
        totalChunks: 5,
        chunkLabel: 'Chunk 3',
      },
      isComplete: false,
      finalOutput: null,
      sessionStatus: 'idle',
      currentGroupIndex: 2,
    });
  });

  it('builds a fact chunk start launch plan', () => {
    const plan = buildWorkflowFactChunkStartLaunchPlan({
      stageIndex: 3,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: {
        facts: [{ chunk_id: '0', text: 'Wave fact', entity_id: 'wave', entity_name: 'Wave' }],
        entities: ['Wave'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 3,
        chunkLabel: 'Chunk 1',
      },
    });

    expect(plan).toEqual({
      kind: 'show_stage',
      stageIndex: 3,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: {
        facts: [{ chunk_id: '0', text: 'Wave fact', entity_id: 'wave', entity_name: 'Wave' }],
        entities: ['Wave'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 3,
        chunkLabel: 'Chunk 1',
      },
      currentGroupIndex: 0,
    });
  });

  it('builds an npc section start launch plan', () => {
    const plan = buildWorkflowNpcSectionStartLaunchPlan({
      stageIndex: 4,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 4,
        chunkLabel: 'Basic Info',
      },
    });

    expect(plan).toEqual({
      kind: 'show_stage',
      stageIndex: 4,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 4,
        chunkLabel: 'Basic Info',
      },
      currentNpcSectionIndex: 0,
      accumulatedNpcSections: {},
    });
  });

  it('builds a same-stage relaunch plan with chunk state', () => {
    const plan = buildWorkflowSameStageLaunchPlan({
      stageIndex: 5,
      stageResults: { creator: { name: 'Barley' } },
      factpack: {
        facts: [{ chunk_id: '1', text: 'Storm fact', entity_id: 'storm', entity_name: 'Storm' }],
        entities: ['Storm'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 4,
        chunkLabel: 'Chunk 2',
      },
      currentGroupIndex: 1,
      currentNpcSectionIndex: 2,
      accumulatedNpcSections: { name: 'Barley' },
    });

    expect(plan).toEqual({
      kind: 'show_stage',
      stageIndex: 5,
      stageResults: { creator: { name: 'Barley' } },
      factpack: {
        facts: [{ chunk_id: '1', text: 'Storm fact', entity_id: 'storm', entity_name: 'Storm' }],
        entities: ['Storm'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 4,
        chunkLabel: 'Chunk 2',
      },
      currentGroupIndex: 1,
      currentNpcSectionIndex: 2,
      accumulatedNpcSections: { name: 'Barley' },
    });
  });
});
