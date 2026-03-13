import { describe, expect, it } from 'vitest';
import { buildWorkflowStageChunkProgress } from './workflowStageChunkProgress';

describe('workflowStageChunkProgress', () => {
  it('builds continuation state for an in-progress chunked stage', () => {
    const result = buildWorkflowStageChunkProgress({
      stageName: 'Spaces',
      stageResults: {},
      accumulatedChunks: [{ name: 'Hall' }],
      currentStageChunk: 0,
      totalStageChunks: 3,
      liveMapSpaces: [{ name: 'Hall' }],
      showLiveMap: true,
    });

    expect(result.stageComplete).toBe(false);
    expect(result.updatedStageResults).toEqual({
      spaces: {
        spaces: [{ name: 'Hall' }],
        total_spaces: 1,
      },
    });
    expect(result.nextChunkStep?.nextChunkIndex).toBe(1);
    expect(result.updatedStageChunkState).toEqual({
      isStageChunking: true,
      currentStageChunk: 1,
      totalStageChunks: 3,
      accumulatedChunkResults: [{ name: 'Hall' }],
      liveMapSpaces: [{ name: 'Hall' }],
      showLiveMap: true,
    });
  });

  it('builds completion state when the final chunk is reached', () => {
    const result = buildWorkflowStageChunkProgress({
      stageName: 'Details',
      stageResults: { foundation: { name: 'Keep' } },
      accumulatedChunks: [{ summary: 'One' }, { summary: 'Two' }],
      currentStageChunk: 1,
      totalStageChunks: 2,
    });

    expect(result.stageComplete).toBe(true);
    expect(result.nextChunkStep).toBeNull();
    expect(result.updatedStageChunkState).toBeUndefined();
    expect(result.updatedStageResults).toEqual({
      foundation: { name: 'Keep' },
      details: { summary: 'Two' },
    });
  });
});
