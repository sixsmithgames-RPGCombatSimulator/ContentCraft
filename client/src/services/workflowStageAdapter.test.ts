import { describe, expect, it } from 'vitest';
import { normalizeWorkflowStage, normalizeWorkflowStageSet } from './workflowStageAdapter';

describe('workflowStageAdapter', () => {
  it('adds canonical workflow keys to stages that only expose display names', () => {
    const stage = normalizeWorkflowStage('monster', {
      name: 'Basic Info',
      systemPrompt: 'prompt',
      buildUserPrompt: () => '{}',
    });

    expect(stage.routerKey).toBe('monster.basic_info');
    expect(stage.workflowStageKey).toBe('monster.basic_info');
    expect(stage.workflowStageLabel).toBe('Basic Info');
  });

  it('preserves legacy aliases while still attaching canonical workflow keys', () => {
    const [stage] = normalizeWorkflowStageSet('item', [
      {
        name: 'Creator: Concept',
        routerKey: 'concept',
        systemPrompt: 'prompt',
        buildUserPrompt: () => '{}',
      },
    ]);

    expect(stage?.routerKey).toBe('concept');
    expect(stage?.workflowStageKey).toBe('item.concept');
    expect(stage?.workflowStageLabel).toBe('Creator: Concept');
  });
});
