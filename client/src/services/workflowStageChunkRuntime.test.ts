import { describe, expect, it } from 'vitest';
import {
  buildWorkflowStageChunkInfoForIndex,
  getNextWorkflowStageChunkStep,
  mergeWorkflowStageChunks,
} from './workflowStageChunkRuntime';

describe('workflowStageChunkRuntime', () => {
  it('builds stage chunk info with standard and suffixed labels', () => {
    expect(buildWorkflowStageChunkInfoForIndex(0, 4)).toEqual({
      isChunked: true,
      currentChunk: 1,
      totalChunks: 4,
      chunkLabel: 'Space 1 of 4',
    });

    expect(buildWorkflowStageChunkInfoForIndex(1, 4, { labelSuffix: '(Regenerating)' })).toEqual({
      isChunked: true,
      currentChunk: 2,
      totalChunks: 4,
      chunkLabel: 'Space 2 of 4 (Regenerating)',
    });
  });

  it('returns the next stage chunk step when more chunks remain', () => {
    expect(getNextWorkflowStageChunkStep(0, 3)).toEqual({
      nextChunkIndex: 1,
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 3,
        chunkLabel: 'Space 2 of 3',
      },
    });

    expect(getNextWorkflowStageChunkStep(2, 3)).toBeNull();
  });

  it('merges spaces-stage chunks into a stage envelope', () => {
    expect(mergeWorkflowStageChunks([
      { name: 'Dock Entry' },
      { name: 'Moonlit Kitchen' },
    ], 'Spaces')).toEqual({
      spaces: [
        { name: 'Dock Entry' },
        { name: 'Moonlit Kitchen' },
      ],
      total_spaces: 2,
    });
  });

  it('merges generic stage chunks by concatenating arrays and preserving later scalars', () => {
    expect(mergeWorkflowStageChunks([
      {
        sections: ['Intro'],
        notes: 'first',
        score: 1,
      },
      {
        sections: ['Climax'],
        notes: 'second',
      },
    ], 'Draft')).toEqual({
      sections: ['Intro', 'Climax'],
      notes: 'second',
      score: 1,
    });
  });
});
