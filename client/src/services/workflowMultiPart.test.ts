import { describe, expect, it } from 'vitest';
import type { NpcSectionChunk } from '../config/npcSectionChunks';
import type { WorkflowFactGroup } from './workflowFactpack';
import {
  getNextWorkflowFactChunkStep,
  getNextWorkflowNpcSectionStep,
  mergeWorkflowChunkOutputs,
  mergeWorkflowNpcSections,
} from './workflowMultiPart';

describe('workflowMultiPart', () => {
  it('merges planner chunk outputs by aggregating threads, retrieval hints, and proposals', () => {
    const merged = mergeWorkflowChunkOutputs([
      {
        threads: ['thread-a'],
        retrieval_hints: { entities: ['Barley'], keywords: ['chef'] },
        proposals: [{ id: 'a' }],
      },
      {
        threads: ['thread-b'],
        retrieval_hints: { regions: ['Tears of Selune'], keywords: ['warlock'] },
        proposals: [{ id: 'b' }],
      },
    ], 'Planner');

    expect(merged.threads).toEqual(['thread-a', 'thread-b']);
    expect(merged.retrieval_hints).toEqual({
      entities: ['Barley'],
      regions: ['Tears of Selune'],
      eras: [],
      keywords: ['chef', 'warlock'],
    });
    expect(merged.proposals).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('merges non-planner chunks by using the last chunk as the base and aggregating proposals', () => {
    const merged = mergeWorkflowChunkOutputs([
      { description: 'first', proposals: [{ id: 'a' }] },
      { description: 'second', hooks: ['hook'], proposals: [{ id: 'b' }] },
    ], 'Creator');

    expect(merged.description).toBe('second');
    expect(merged.hooks).toEqual(['hook']);
    expect(merged.proposals).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('builds the next fact chunk step with factpack and chunk info', () => {
    const groups: WorkflowFactGroup[] = [
      {
        id: 'g1',
        label: 'First',
        facts: [{ chunk_id: 'a', text: 'A', entity_id: 'a', entity_name: 'A' }],
        characterCount: 1,
        entityTypes: [],
        regions: [],
      },
      {
        id: 'g2',
        label: 'Second',
        facts: [{ chunk_id: 'b', text: 'B', entity_id: 'b', entity_name: 'B' }],
        characterCount: 1,
        entityTypes: [],
        regions: [],
      },
    ];

    const next = getNextWorkflowFactChunkStep(groups, 0);

    expect(next).not.toBeNull();
    expect(next?.nextChunkIndex).toBe(1);
    expect(next?.nextFactpack.entities).toEqual(['b']);
    expect(next?.chunkInfo).toEqual({
      isChunked: true,
      currentChunk: 2,
      totalChunks: 2,
      chunkLabel: 'Second',
    });
  });

  it('builds the next npc section step with chunk info', () => {
    const sections: NpcSectionChunk[] = [
      {
        chunkLabel: 'Basic Information',
        sectionName: 'basic_info',
        instructions: 'a',
        schemaSection: '{}',
        includePreviousSections: false,
        outputFields: ['name'],
      },
      {
        chunkLabel: 'Stats',
        sectionName: 'stats',
        instructions: 'b',
        schemaSection: '{}',
        includePreviousSections: true,
        outputFields: ['ability_scores'],
      },
    ];

    const next = getNextWorkflowNpcSectionStep(sections, 0);

    expect(next?.nextSectionIndex).toBe(1);
    expect(next?.nextSection.chunkLabel).toBe('Stats');
    expect(next?.chunkInfo.currentChunk).toBe(2);
  });

  it('merges npc sections and strips pipeline-only fields from the cleaned result', () => {
    const merged = mergeWorkflowNpcSections(
      { name: 'Barley', sources_used: ['old'] },
      { ability_scores: { cha: 18 }, proposals: [{ id: 'q1' }], canon_update: { ok: true } },
    );

    expect(merged.mergedSections).toEqual({
      name: 'Barley',
      sources_used: ['old'],
      ability_scores: { cha: 18 },
      proposals: [{ id: 'q1' }],
      canon_update: { ok: true },
    });
    expect(merged.cleanedSections).toEqual({
      name: 'Barley',
      ability_scores: { cha: 18 },
    });
  });
});
