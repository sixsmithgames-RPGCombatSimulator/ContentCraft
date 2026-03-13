import { describe, expect, it } from 'vitest';
import {
  buildWorkflowFilteredFactpack,
  createEmptyWorkflowCanonNarrowingState,
  isWorkflowRetrievalHintNarrowing,
  openInitialWorkflowCanonNarrowing,
  openRetrievalHintWorkflowCanonNarrowing,
  updateWorkflowCanonNarrowingSearch,
} from './workflowCanonNarrowing';

describe('workflowCanonNarrowing', () => {
  it('creates an empty narrowing state', () => {
    expect(createEmptyWorkflowCanonNarrowingState()).toEqual({
      isOpen: false,
      keywords: [],
      pendingFactpack: null,
      pendingStageResults: null,
      mode: null,
      retrievalHintsContext: null,
    });
  });

  it('opens initial narrowing state without retrieval context', () => {
    const state = openInitialWorkflowCanonNarrowing({
      keywords: ['Barley'],
      pendingFactpack: { facts: [], entities: [], gaps: [] },
      pendingStageResults: { keyword_extractor: { keywords: ['Barley'] } },
    });

    expect(state.mode).toBe('initial');
    expect(state.retrievalHintsContext).toBeNull();
    expect(isWorkflowRetrievalHintNarrowing(state)).toBe(false);
  });

  it('opens retrieval-hint narrowing state with stage context', () => {
    const state = openRetrievalHintWorkflowCanonNarrowing({
      keywords: ['Tears of Selune'],
      pendingFactpack: { facts: [], entities: [], gaps: [] },
      pendingStageResults: { planner: { retrieval_hints: { regions: ['Tears of Selune'] } } },
      stageName: 'Planner',
      requestedEntities: ['Tears of Selune'],
    });

    expect(state.mode).toBe('retrieval_hints');
    expect(state.retrievalHintsContext?.stageName).toBe('Planner');
    expect(isWorkflowRetrievalHintNarrowing(state)).toBe(true);
  });

  it('updates the search results while preserving mode and context', () => {
    const original = openRetrievalHintWorkflowCanonNarrowing({
      keywords: ['old'],
      pendingFactpack: { facts: [], entities: [], gaps: [] },
      pendingStageResults: { planner: {} },
      stageName: 'Planner',
      requestedEntities: ['A'],
    });

    const updated = updateWorkflowCanonNarrowingSearch(original, {
      keywords: ['new'],
      pendingFactpack: { facts: [{ chunk_id: '1', text: 'Fact', entity_id: 'a', entity_name: 'A' }], entities: ['a'], gaps: [] },
    });

    expect(updated.mode).toBe('retrieval_hints');
    expect(updated.retrievalHintsContext?.requestedEntities).toEqual(['A']);
    expect(updated.keywords).toEqual(['new']);
    expect(updated.pendingFactpack?.facts).toHaveLength(1);
  });

  it('builds a filtered factpack from modal selections', () => {
    const factpack = buildWorkflowFilteredFactpack([
      {
        text: 'Barley serves a marid patron.',
        chunk_id: 'npc.barley#c1',
        entity_name: 'Barley',
        entity_id: 'npc.barley',
        entity_type: 'npc',
        region: 'Tears of Selune',
      },
    ]);

    expect(factpack.entities).toEqual(['npc.barley']);
    expect(factpack.facts[0]).toEqual({
      text: 'Barley serves a marid patron.',
      chunk_id: 'npc.barley#c1',
      entity_name: 'Barley',
      entity_id: 'npc.barley',
      entity_type: 'npc',
      region: 'Tears of Selune',
    });
  });
});
