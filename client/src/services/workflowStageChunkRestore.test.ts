import { describe, expect, it } from 'vitest';
import { restoreWorkflowStageChunkState } from './workflowStageChunkRestore';
import type { GenerationProgress } from '../utils/generationProgress';

function createSession(overrides: Partial<GenerationProgress> = {}): GenerationProgress {
  return {
    sessionId: 'gen-1',
    createdAt: '2026-03-11T00:00:00.000Z',
    lastUpdatedAt: '2026-03-11T00:00:00.000Z',
    config: { type: 'location' },
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

describe('workflowStageChunkRestore', () => {
  it('normalizes modern stage chunk state', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      stageChunkState: {
        isStageChunking: true,
        currentStageChunk: 2,
        totalStageChunks: 5,
        accumulatedChunkResults: [{ name: 'Kitchen' }],
        liveMapSpaces: [{ name: 'Kitchen', position: { x: 1, y: 2 } }],
        showLiveMap: false,
      },
    }));

    expect(restored.restoreSource).toBe('stageChunkState');
    expect(restored.needsMigration).toBe(false);
    expect(restored.normalizedStageChunkState?.currentStageChunk).toBe(2);
    expect(restored.normalizedStageChunkState?.showLiveMap).toBe(true);
  });

  it('loads legacy top-level chunk state and marks it for migration', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      accumulatedChunkResults: [{ name: 'Hall' }] as any,
      liveMapSpaces: [{ name: 'Hall' }] as any,
    }));

    expect(restored.restoreSource).toBe('legacy');
    expect(restored.needsMigration).toBe(true);
    expect(restored.accumulatedChunks).toEqual([{ name: 'Hall' }]);
    expect(restored.savedLiveMapSpaces).toEqual([{ name: 'Hall' }]);
  });

  it('reconstructs spaces from progress entries when chunk state is missing', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      progress: [
        {
          stage: 'Spaces',
          chunkIndex: 0,
          prompt: 'Generate Space 1/4',
          response: JSON.stringify({ name: 'Atrium' }),
          timestamp: '2026-03-11T00:00:00.000Z',
          status: 'completed',
        },
        {
          stage: 'Spaces',
          chunkIndex: 1,
          prompt: 'Generate Space 2/4',
          response: JSON.stringify({ name: 'Gallery' }),
          timestamp: '2026-03-11T00:01:00.000Z',
          status: 'completed',
        },
      ],
    }));

    expect(restored.restoreSource).toBe('progress');
    expect(restored.accumulatedChunks).toEqual([{ name: 'Atrium' }, { name: 'Gallery' }]);
    expect(restored.normalizedStageChunkState?.isStageChunking).toBe(true);
    expect(restored.normalizedStageChunkState?.currentStageChunk).toBe(2);
    expect(restored.normalizedStageChunkState?.totalStageChunks).toBe(4);
  });

  it('reconstructs spaces from canonical stage keys in saved progress entries', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      workflowType: 'location',
      progress: [
        {
          stage: 'location.spaces',
          chunkIndex: 0,
          prompt: 'Generate Space 1/3',
          response: JSON.stringify({ name: 'Courtyard' }),
          timestamp: '2026-03-11T00:00:00.000Z',
          status: 'completed',
        },
      ],
    }));

    expect(restored.restoreSource).toBe('progress');
    expect(restored.accumulatedChunks).toEqual([{ name: 'Courtyard' }]);
    expect(restored.normalizedStageChunkState?.currentStageChunk).toBe(1);
    expect(restored.normalizedStageChunkState?.totalStageChunks).toBe(3);
  });

  it('derives location chunk metadata from purpose when chunks exist but metadata does not', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      accumulatedChunkResults: [{ name: 'Entry' }, { name: 'Study' }] as any,
      stageResults: {
        purpose: {
          estimated_spaces: '6',
        },
      },
    }));

    expect(restored.restoreSource).toBe('derived');
    expect(restored.normalizedStageChunkState?.isStageChunking).toBe(true);
    expect(restored.normalizedStageChunkState?.currentStageChunk).toBe(2);
    expect(restored.normalizedStageChunkState?.totalStageChunks).toBe(6);
    expect(restored.shouldRebuildLiveMapFromChunks).toBe(true);
  });

  it('falls back to scale-derived estimated spaces when exact count is unavailable', () => {
    const restored = restoreWorkflowStageChunkState(createSession({
      accumulatedChunkResults: [{ name: 'Entry' }] as any,
      stageResults: {
        purpose: {
          scale: 'complex',
        },
      },
    }));

    expect(restored.normalizedStageChunkState?.totalStageChunks).toBe(30);
  });
});
