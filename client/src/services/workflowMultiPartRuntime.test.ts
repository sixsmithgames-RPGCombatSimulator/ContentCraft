import { describe, expect, it } from 'vitest';
import {
  getNextWorkflowFactChunkStep,
  getNextWorkflowNpcSectionStep,
  mergeWorkflowChunkOutputs,
  mergeWorkflowNpcSections,
} from './workflowMultiPartRuntime';

describe('workflowMultiPartRuntime', () => {
  it('merges planner-style chunk outputs with combined hints, threads, and proposals', () => {
    const merged = mergeWorkflowChunkOutputs([
      {
        story_clock: 'slow burn',
        threads: ['origin mystery', 'marid pact'],
        retrieval_hints: {
          entities: ['Barley'],
          keywords: ['halfling'],
        },
        proposals: [{ id: 'dish' }],
        mode: 'GM',
      },
      {
        story_clock: 'active',
        threads: ['marid pact', 'culinary debt'],
        retrieval_hints: {
          regions: ['Sea of Fallen Stars'],
          keywords: ['warlock'],
        },
        proposals: [{ id: 'patron-relationship' }],
        tone: 'epic',
      },
    ], 'Planner');

    expect(merged.story_clock).toBe('active');
    expect(merged.mode).toBe('GM');
    expect(merged.tone).toBe('epic');
    expect(merged.threads).toEqual(['origin mystery', 'marid pact', 'culinary debt']);
    expect(merged.retrieval_hints).toEqual({
      entities: ['Barley'],
      regions: ['Sea of Fallen Stars'],
      eras: [],
      keywords: ['halfling', 'warlock'],
    });
    expect(merged.proposals).toEqual([{ id: 'dish' }, { id: 'patron-relationship' }]);
  });

  it('merges creator-style chunk outputs with latest fields and aggregated proposals', () => {
    const merged = mergeWorkflowChunkOutputs([
      {
        class_features: [{ name: 'Pact Magic' }],
        feats: [{ name: 'Chef' }],
        proposals: [{ id: 'feat-choice' }],
      },
      {
        feats: [],
        subclass_features: [{ name: 'Genie Patron' }],
        proposals: [{ id: 'boon-choice' }],
      },
    ], 'Creator: Character Build');

    expect(merged.class_features).toEqual([{ name: 'Pact Magic' }]);
    expect(merged.feats).toEqual([]);
    expect(merged.subclass_features).toEqual([{ name: 'Genie Patron' }]);
    expect(merged.proposals).toEqual([{ id: 'feat-choice' }, { id: 'boon-choice' }]);
  });

  it('builds the next fact chunk step with factpack and chunk info', () => {
    const nextStep = getNextWorkflowFactChunkStep([
      {
        id: 'g1',
        label: 'Part One',
        facts: [{ chunk_id: '1', text: 'Fact 1', entity_id: 'a', entity_name: 'A' }],
        characterCount: 6,
        entityTypes: ['npc'],
        regions: [],
      },
      {
        id: 'g2',
        label: 'Part Two',
        facts: [{ chunk_id: '2', text: 'Fact 2', entity_id: 'b', entity_name: 'B' }],
        characterCount: 6,
        entityTypes: ['location'],
        regions: ['Moonsea'],
      },
    ], 0);

    expect(nextStep).toEqual({
      nextChunkIndex: 1,
      nextGroup: {
        id: 'g2',
        label: 'Part Two',
        facts: [{ chunk_id: '2', text: 'Fact 2', entity_id: 'b', entity_name: 'B' }],
        characterCount: 6,
        entityTypes: ['location'],
        regions: ['Moonsea'],
      },
      nextFactpack: {
        facts: [{ chunk_id: '2', text: 'Fact 2', entity_id: 'b', entity_name: 'B' }],
        entities: ['b'],
        gaps: [],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 2,
        chunkLabel: 'Part Two',
      },
    });
    expect(getNextWorkflowFactChunkStep(nextStep ? [nextStep.nextGroup] : [], 0)).toBeNull();
  });

  it('merges npc section outputs and strips pipeline-only fields', () => {
    const merged = mergeWorkflowNpcSections(
      {
        name: 'Barley',
        sources_used: ['old'],
      },
      {
        goals: ['Repay the marid'],
        proposals: [{ id: 'dish' }],
        retrieval_hints: { keywords: ['marid'] },
      },
    );

    expect(merged.mergedSections).toEqual({
      name: 'Barley',
      sources_used: ['old'],
      goals: ['Repay the marid'],
      proposals: [{ id: 'dish' }],
      retrieval_hints: { keywords: ['marid'] },
    });
    expect(merged.cleanedSections).toEqual({
      name: 'Barley',
      goals: ['Repay the marid'],
    });
  });

  it('builds the next npc section step with chunk info', () => {
    const nextStep = getNextWorkflowNpcSectionStep([
      {
        chunkLabel: 'Basic Information',
        sectionName: 'basic_info',
        instructions: 'Start here',
        schemaSection: '{}',
        includePreviousSections: false,
        outputFields: ['name'],
      },
      {
        chunkLabel: 'Core Details',
        sectionName: 'core_details',
        instructions: 'Continue',
        schemaSection: '{}',
        includePreviousSections: true,
        outputFields: ['goals'],
      },
    ], 0);

    expect(nextStep).toEqual({
      nextSectionIndex: 1,
      nextSection: {
        chunkLabel: 'Core Details',
        sectionName: 'core_details',
        instructions: 'Continue',
        schemaSection: '{}',
        includePreviousSections: true,
        outputFields: ['goals'],
      },
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 2,
        chunkLabel: 'Core Details',
      },
    });
    expect(getNextWorkflowNpcSectionStep(nextStep ? [nextStep.nextSection] : [], 0)).toBeNull();
  });
});
