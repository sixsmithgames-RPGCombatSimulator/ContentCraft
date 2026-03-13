import { describe, expect, it } from 'vitest';
import { resolveWorkflowResumeAction } from './workflowResume';
import type { GenerationProgress } from '../utils/generationProgress';
import type { GeneratorStage } from './generatorWorkflow';

function createSession(overrides: Partial<GenerationProgress> = {}): GenerationProgress {
  return {
    sessionId: 'gen-1',
    createdAt: '2026-03-11T00:00:00.000Z',
    lastUpdatedAt: '2026-03-11T00:00:00.000Z',
    config: { type: 'scene' },
    multiChunkState: {
      isMultiPartGeneration: false,
      currentGroupIndex: 0,
      totalGroups: 0,
    },
    progress: [],
    stageResults: {},
    currentStageIndex: 0,
    ...overrides,
  };
}

function createStage(name: string, workflowStageKey?: string): GeneratorStage {
  return {
    name,
    workflowStageKey,
    systemPrompt: 'system',
    buildUserPrompt: () => 'prompt',
  };
}

const stages: GeneratorStage[] = [
  createStage('Keyword Extractor', 'keyword_extractor'),
  createStage('Planner', 'planner'),
  createStage('Spaces', 'spaces'),
  createStage('Creator', 'basic_info'),
];

describe('workflowResume', () => {
  it('resumes an incomplete prompt first', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({
        currentStageIndex: 0,
        progress: [
          {
            stage: 'Planner',
            chunkIndex: null,
            prompt: 'prompt text',
            response: null,
            timestamp: '2026-03-11T00:00:00.000Z',
            status: 'pending',
          },
        ],
      }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('pending_prompt');
    if (action.kind !== 'pending_prompt') {
      throw new Error(`Expected pending_prompt, received ${action.kind}`);
    }
    expect(action.stageIndex).toBe(1);
    expect(action.prompt).toBe('prompt text');
  });

  it('restores retry provenance for an incomplete prompt', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({
        currentStageIndex: 2,
        progress: [
          {
            stage: 'Spaces',
            chunkIndex: 1,
            prompt: 'retry prompt',
            response: null,
            timestamp: '2026-03-11T00:00:00.000Z',
            status: 'pending',
            retrySource: {
              kind: 'geometry_proposal',
              label: 'Use wall thickness issue',
              summary: 'Wall thickness should match the connected hall.',
              targetName: 'Vault',
              issueCategory: 'wall_thickness',
            },
          },
        ],
      }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('pending_prompt');
    if (action.kind !== 'pending_prompt') {
      throw new Error(`Expected pending_prompt, received ${action.kind}`);
    }
    expect(action.retrySource).toEqual(
      expect.objectContaining({
        kind: 'geometry_proposal',
        targetName: 'Vault',
      }),
    );
  });

  it('restores an incomplete prompt by canonical stage alias when the active stage name differs', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({
        currentStageIndex: 1,
        config: { type: 'npc' },
        workflowType: 'npc',
        workflowStageSequence: ['keyword_extractor', 'planner', 'spaces', 'basic_info'],
        progress: [
          {
            stage: 'Creator: Basic Info',
            chunkIndex: null,
            prompt: 'npc prompt',
            response: null,
            timestamp: '2026-03-11T00:00:00.000Z',
            status: 'pending',
          },
        ],
      }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('pending_prompt');
    if (action.kind !== 'pending_prompt') {
      throw new Error(`Expected pending_prompt, received ${action.kind}`);
    }
    expect(action.stageIndex).toBe(3);
    expect(action.stageName).toBe('Creator: Basic Info');
  });

  it('includes the last confirmed server stage in resume alerts when available', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({
        currentStageIndex: 2,
        progress: [
          {
            stage: 'Planner',
            chunkIndex: null,
            prompt: 'planner prompt',
            response: '{"deliverable":"npc"}',
            timestamp: '2026-03-11T00:00:00.000Z',
            status: 'completed',
            confirmedStageId: 'Planner',
            confirmedStageKey: 'planner',
            confirmedWorkflowType: 'npc',
          },
          {
            stage: 'Spaces',
            chunkIndex: null,
            prompt: 'pending prompt',
            response: null,
            timestamp: '2026-03-11T00:05:00.000Z',
            status: 'pending',
          },
        ],
      }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('pending_prompt');
    if (action.kind !== 'pending_prompt') {
      throw new Error(`Expected pending_prompt, received ${action.kind}`);
    }
    expect(action.alertMessage).toContain('Last server-confirmed stage: Planner (planner)');
  });

  it('resumes a later fact chunk from its saved pending prompt before generic stage resume', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({
        currentStageIndex: 0,
        multiChunkState: {
          isMultiPartGeneration: true,
          currentGroupIndex: 1,
          totalGroups: 3,
        },
        progress: [
          {
            stage: 'Planner',
            chunkIndex: 0,
            prompt: 'Intro canon facts',
            response: '{"deliverable":"npc"}',
            timestamp: '2026-03-11T00:00:00.000Z',
            status: 'completed',
          },
          {
            stage: 'Planner',
            chunkIndex: 1,
            prompt: 'Continuing canon facts for chunk 2',
            response: null,
            timestamp: '2026-03-11T00:05:00.000Z',
            status: 'pending',
          },
        ],
      }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('pending_prompt');
    if (action.kind !== 'pending_prompt') {
      throw new Error(`Expected pending_prompt, received ${action.kind}`);
    }
    expect(action.stageIndex).toBe(1);
    expect(action.prompt).toBe('Continuing canon facts for chunk 2');
  });

  it('resumes stage chunking before normal stage flow', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({ currentStageIndex: 3 }),
      stages,
      effectiveChunkState: {
        isStageChunking: true,
        currentStageChunk: 2,
        totalStageChunks: 5,
        accumulatedChunkResults: [],
        liveMapSpaces: [{ name: 'Kitchen' } as any],
        showLiveMap: true,
      },
      finalOutput: {},
    });

    expect(action.kind).toBe('stage_chunk');
    if (action.kind !== 'stage_chunk') {
      throw new Error(`Expected stage_chunk, received ${action.kind}`);
    }
    expect(action.stageIndex).toBe(2);
    expect(action.chunkInfo.currentChunk).toBe(3);
  });

  it('returns completed when final output is already available', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({ currentStageIndex: 3 }),
      stages,
      effectiveChunkState: null,
      finalOutput: { title: 'Completed Scene' },
    });

    expect(action.kind).toBe('completed');
    if (action.kind !== 'completed') {
      throw new Error(`Expected completed, received ${action.kind}`);
    }
    expect(action.finalOutput).toEqual({ title: 'Completed Scene' });
  });

  it('falls back to final stage resume when no final output is available', () => {
    const action = resolveWorkflowResumeAction({
      session: createSession({ currentStageIndex: 3 }),
      stages,
      effectiveChunkState: null,
      finalOutput: {},
    });

    expect(action.kind).toBe('final_stage');
    if (action.kind !== 'final_stage') {
      throw new Error(`Expected final_stage, received ${action.kind}`);
    }
    expect(action.stageIndex).toBe(3);
  });
});
