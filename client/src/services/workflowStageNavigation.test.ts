import { describe, expect, it } from 'vitest';
import {
  buildWorkflowAdvancePlan,
  buildWorkflowCanonContinuationPlan,
} from './workflowStageNavigation';

describe('workflowStageNavigation', () => {
  it('builds a generic advance plan when another stage remains', () => {
    const plan = buildWorkflowAdvancePlan({
      currentStageIndex: 1,
      totalStages: 4,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: { facts: [], entities: [], gaps: [] },
      resetCurrentGroupIndex: true,
    });

    expect(plan).toEqual({
      kind: 'advance',
      nextIndex: 2,
      stageResults: { planner: { deliverable: 'npc' } },
      factpack: { facts: [], entities: [], gaps: [] },
      resetCurrentGroupIndex: true,
    });
  });

  it('builds a noop plan at the final stage', () => {
    const plan = buildWorkflowAdvancePlan({
      currentStageIndex: 3,
      totalStages: 4,
      stageResults: { final: { title: 'Done' } },
      factpack: null,
    });

    expect(plan).toEqual({
      kind: 'noop',
      stageResults: { final: { title: 'Done' } },
      factpack: null,
      resetCurrentGroupIndex: false,
    });
  });

  it('builds canon continuation plans for retrieval-hint merges', () => {
    const plan = buildWorkflowCanonContinuationPlan({
      currentStageIndex: 1,
      totalStages: 4,
      currentStageName: 'Planner',
      stageResults: { planner: { deliverable: 'npc' } },
      pendingStageResults: { planner: { deliverable: 'npc', retrieval_hints: {} } },
      selectedFactpack: {
        facts: [{ chunk_id: '2', text: 'New fact', entity_id: 'b', entity_name: 'B' }],
        entities: ['B'],
        gaps: [],
      },
      existingFactpack: {
        facts: [{ chunk_id: '1', text: 'Existing fact', entity_id: 'a', entity_name: 'A' }],
        entities: ['A'],
        gaps: [],
      },
      wasProcessingRetrievalHints: true,
      resetCurrentGroupIndex: true,
    });

    expect(plan.kind).toBe('advance');
    if (plan.kind !== 'advance') return;
    expect(plan.nextIndex).toBe(2);
    expect(plan.stageResults).toEqual({ planner: { deliverable: 'npc', retrieval_hints: {} } });
    expect(plan.factpack?.facts).toHaveLength(2);
    expect(plan.resetCurrentGroupIndex).toBe(true);
  });

  it('stores keyword narrowing results on the keyword extractor stage before advancing', () => {
    const plan = buildWorkflowCanonContinuationPlan({
      currentStageIndex: 0,
      totalStages: 3,
      currentStageName: 'Keyword Extractor',
      stageResults: {},
      selectedFactpack: {
        facts: [{ chunk_id: '1', text: 'Moonwell', entity_id: 'loc', entity_name: 'Moonwell' }],
        entities: ['Moonwell'],
        gaps: [],
      },
      wasProcessingRetrievalHints: false,
      narrowingKeywords: ['Moonwell', 'Selune'],
    });

    expect(plan.kind).toBe('advance');
    if (plan.kind !== 'advance') return;
    expect(plan.stageResults).toEqual({
      keyword_extractor: {
        keywords: ['Moonwell', 'Selune'],
      },
    });
    expect(plan.factpack?.entities).toEqual(['Moonwell']);
  });
});
