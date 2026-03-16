import { describe, expect, it } from 'vitest';
import type { GeneratorStage } from './generatorWorkflow';
import { normalizeWorkflowStage, normalizeWorkflowStageSet } from './workflowStageAdapter';

describe('workflowStageAdapter', () => {
  it('adds canonical workflow keys to stages that only expose display names', () => {
    const stageInput: GeneratorStage = {
      name: 'Basic Info',
      systemPrompt: 'prompt',
      buildUserPrompt: () => '{}',
    };
    const stage = normalizeWorkflowStage('monster', stageInput);

    expect(stage.routerKey).toBe('monster.basic_info');
    expect(stage.workflowStageKey).toBe('monster.basic_info');
    expect(stage.workflowStageLabel).toBe('Basic Info');
  });

  it('preserves legacy aliases while still attaching canonical workflow keys', () => {
    const stageSet: GeneratorStage[] = [
      {
        name: 'Creator: Concept',
        routerKey: 'concept',
        systemPrompt: 'prompt',
        buildUserPrompt: () => '{}',
      },
    ];
    const [stage] = normalizeWorkflowStageSet('item', stageSet);

    expect(stage?.routerKey).toBe('concept');
    expect(stage?.workflowStageKey).toBe('item.concept');
    expect(stage?.workflowStageLabel).toBe('Creator: Concept');
  });
});
