import { describe, expect, it } from 'vitest';
import { applyLocationEditorUpdates } from './locationEditorWorkflow';

describe('locationEditorWorkflow', () => {
  it('builds consistent merged spaces, stage results, and chunk state for map editor saves', () => {
    const result = applyLocationEditorUpdates({
      accumulatedChunkResults: [
        {
          name: 'Hall',
          description: 'Original hall',
          size_ft: { width: 20, height: 20 },
        },
      ],
      updatedSpaces: [
        {
          name: 'Hall',
          size_ft: { width: 25, height: 20 },
          position: { x: 30, y: 40 },
        },
      ],
      stageResults: {},
      isStageChunking: true,
      currentStageChunk: 1,
      totalStageChunks: 4,
      showLiveMap: true,
    });

    expect(result.updatedResults).toEqual([
      expect.objectContaining({
        name: 'Hall',
        description: 'Original hall',
        size_ft: { width: 25, height: 20 },
        position: { x: 30, y: 40 },
      }),
    ]);
    expect(result.updatedStageResults.spaces).toEqual({
      spaces: result.updatedResults,
      total_spaces: 1,
    });
    expect(result.updatedStageChunkState).toEqual({
      isStageChunking: true,
      currentStageChunk: 1,
      totalStageChunks: 4,
      showLiveMap: true,
      liveMapSpaces: result.updatedResults,
      accumulatedChunkResults: result.updatedResults,
    });
  });

  it('supports review-mode rename flows and returns the updated pending space', () => {
    const result = applyLocationEditorUpdates({
      accumulatedChunkResults: [
        {
          name: 'Old Name',
          description: 'Original metadata',
          size_ft: { width: 12, height: 12 },
        },
      ],
      updatedSpaces: [
        {
          name: 'New Name',
          size_ft: { width: 14, height: 12 },
        },
      ],
      stageResults: {},
      stageChunkState: {
        isStageChunking: true,
        currentStageChunk: 2,
        totalStageChunks: 5,
        showLiveMap: true,
        accumulatedChunkResults: [],
        liveMapSpaces: [],
      },
      isStageChunking: true,
      currentStageChunk: 2,
      totalStageChunks: 5,
      showLiveMap: true,
      reviewSpaceIndex: 0,
      mergeStrategy: 'identity-or-index',
    });

    expect(result.updatedResults[0]).toEqual(
      expect.objectContaining({
        name: 'New Name',
        description: 'Original metadata',
        size_ft: { width: 14, height: 12 },
      })
    );
    expect(result.updatedPendingSpace).toEqual(result.updatedResults[0]);
  });
});
