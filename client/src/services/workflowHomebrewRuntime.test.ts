import { describe, expect, it } from 'vitest';
import {
  buildWorkflowHomebrewCompletionAlertMessage,
  buildWorkflowHomebrewStageResults,
  getCurrentWorkflowHomebrewChunk,
  getWorkflowHomebrewChunks,
  mergeWorkflowHomebrewChunks,
  resolveWorkflowHomebrewChunkProgress,
} from './workflowHomebrewRuntime';

describe('workflowHomebrewRuntime', () => {
  it('builds initial homebrew stage results and exposes the first chunk', () => {
    const stageResults = buildWorkflowHomebrewStageResults([
      { index: 0, title: 'Intro', content: 'a', prompt: 'Prompt A' },
      { index: 1, title: 'Rules', content: 'b', prompt: 'Prompt B' },
    ]);

    expect(getWorkflowHomebrewChunks(stageResults.homebrew_chunks)).toHaveLength(2);
    expect(getCurrentWorkflowHomebrewChunk(stageResults)).toEqual({
      index: 0,
      title: 'Intro',
      content: 'a',
      prompt: 'Prompt A',
    });
  });

  it('advances to the next homebrew chunk while preserving parsed history', () => {
    const stageResults = buildWorkflowHomebrewStageResults([
      { index: 0, title: 'Intro', content: 'a', prompt: 'Prompt A' },
      { index: 1, title: 'Rules', content: 'b', prompt: 'Prompt B' },
    ]);

    const result = resolveWorkflowHomebrewChunkProgress({
      stageResults,
      stageKey: 'homebrew_extraction',
      parsed: {
        entries: [{ type: 'rule', title: 'Rule One' }],
      },
      fileName: 'storm-codex.pdf',
    });

    expect(result.kind).toBe('next_chunk');
    if (result.kind !== 'next_chunk') {
      return;
    }

    expect(result.nextChunkIndex).toBe(1);
    expect(result.nextChunk.prompt).toBe('Prompt B');
    expect((result.stageResults.current_chunk as { value: number }).value).toBe(1);
    expect((result.stageResults.homebrew_chunk_results as { items: unknown[] }).items).toHaveLength(1);
    expect((result.stageResults.homebrew_extraction_chunks as { items: unknown[] }).items).toHaveLength(1);
  });

  it('merges all parsed homebrew chunks on completion', () => {
    const initial = buildWorkflowHomebrewStageResults([
      { index: 0, title: 'Intro', content: 'a', prompt: 'Prompt A' },
      { index: 1, title: 'Rules', content: 'b', prompt: 'Prompt B' },
    ]);

    const firstPass = resolveWorkflowHomebrewChunkProgress({
      stageResults: initial,
      stageKey: 'homebrew_extraction',
      parsed: {
        entries: [{ type: 'rule', title: 'Rule One' }],
      },
      fileName: 'storm-codex.pdf',
    });

    expect(firstPass.kind).toBe('next_chunk');
    if (firstPass.kind !== 'next_chunk') {
      return;
    }

    const secondPass = resolveWorkflowHomebrewChunkProgress({
      stageResults: firstPass.stageResults,
      stageKey: 'homebrew_extraction',
      parsed: {
        entries: [{ type: 'item', title: 'Tide Spoon' }],
      },
      fileName: 'storm-codex.pdf',
    });

    expect(secondPass.kind).toBe('complete');
    if (secondPass.kind !== 'complete') {
      return;
    }

    expect(secondPass.chunkResults).toHaveLength(2);
    expect(secondPass.finalOutput).toMatchObject({
      deliverable: 'homebrew',
      document_title: 'storm-codex.pdf',
      total_chunks: 2,
    });
    expect(secondPass.finalOutput.entries).toEqual([
      { type: 'rule', title: 'Rule One' },
      { type: 'item', title: 'Tide Spoon' },
    ]);
    expect(secondPass.finalOutput.rules).toEqual([{ type: 'rule', title: 'Rule One' }]);
    expect(secondPass.finalOutput.items).toEqual([{ type: 'item', title: 'Tide Spoon' }]);
    expect((secondPass.stageResults.homebrew_chunk_results as { items: unknown[] }).items).toHaveLength(2);
  });

  it('builds a homebrew completion alert message', () => {
    expect(buildWorkflowHomebrewCompletionAlertMessage({
      finalOutput: { document_title: 'storm-codex.pdf' },
      totalChunks: 4,
    })).toContain('Chunks processed: 4');
  });

  it('merges entity-based homebrew chunk output into entries and grouped collections', () => {
    const merged = mergeWorkflowHomebrewChunks([
      {
        entities: [
          {
            type: 'feat',
            canonical_name: 'Storm Chef',
            claims: [{ text: 'Lets you season lightning.', source: 'chunk 1' }],
            homebrew_metadata: {
              homebrew_type: 'feat',
              tags: ['culinary', 'storm'],
            },
          },
        ],
      },
    ]);

    expect(merged.entries).toEqual([
      {
        type: 'feat',
        title: 'Storm Chef',
        short_summary: 'Lets you season lightning.',
        long_description: 'Lets you season lightning.',
        tags: ['culinary', 'storm'],
        assumptions: [],
        notes: [],
        claims: [{ text: 'Lets you season lightning.', source: 'chunk 1' }],
      },
    ]);
    expect(merged.feats).toHaveLength(1);
  });
});
