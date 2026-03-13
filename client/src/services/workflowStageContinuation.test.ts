import { describe, expect, it } from 'vitest';
import { resolveWorkflowStageContinuation } from './workflowStageContinuation';
import type { GeneratorStage, GeneratorStageCatalog } from './generatorWorkflow';

function makeStage(
  name: string,
  overrides: Partial<GeneratorStage> = {},
): GeneratorStage {
  return {
    name,
    systemPrompt: '',
    buildUserPrompt: () => '',
    ...overrides,
  };
}

describe('workflowStageContinuation', () => {
  const genericStages = [
    makeStage('Keyword Extractor', { workflowStageKey: 'keywordExtractor' }),
    makeStage('Planner', { workflowStageKey: 'planner' }),
  ];

  const npcStages = [
    makeStage('Creator: Basic Info', { routerKey: 'basicInfo', workflowStageKey: 'basicInfo' }),
    makeStage('Creator: Core Details', { routerKey: 'coreDetails', workflowStageKey: 'coreDetails' }),
    makeStage('Creator: Stats', { routerKey: 'stats', workflowStageKey: 'stats' }),
    makeStage('Creator: Character Build', { routerKey: 'characterBuild', workflowStageKey: 'characterBuild' }),
    makeStage('Creator: Combat', { routerKey: 'combat', workflowStageKey: 'combat' }),
    makeStage('Creator: Spellcasting', { routerKey: 'spellcasting', workflowStageKey: 'spellcasting' }),
    makeStage('Creator: Legendary', { routerKey: 'legendary', workflowStageKey: 'legendary' }),
    makeStage('Creator: Relationships', { routerKey: 'relationships', workflowStageKey: 'relationships' }),
    makeStage('Creator: Equipment', { routerKey: 'equipment', workflowStageKey: 'equipment' }),
  ];

  const npcCatalog: Pick<GeneratorStageCatalog, 'genericStages' | 'npcStages' | 'npcStageRouterMap'> = {
    genericStages,
    npcStages,
    npcStageRouterMap: {
      basicInfo: npcStages[0],
      coreDetails: npcStages[1],
      stats: npcStages[2],
      characterBuild: npcStages[3],
      combat: npcStages[4],
      spellcasting: npcStages[5],
      legendary: npcStages[6],
      relationships: npcStages[7],
      equipment: npcStages[8],
    },
  };

  it('applies npc dynamic routing before advancing from basic info', () => {
    const allStages = [...genericStages, ...npcStages];
    const result = resolveWorkflowStageContinuation({
      currentStageIndex: 2,
      currentStage: npcStages[0],
      stages: allStages,
      workflowType: 'npc',
      userPrompt: 'Create an 11th level warlock named Barley. No legendary actions.',
      stageResults: {
        creator_basic_info: {
          name: 'Barley',
        },
      },
      currentStageOutput: {
        name: 'Barley',
        class_levels: [{ class: 'Warlock', level: 11 }],
        race: 'Halfling',
        description: 'A halfling warlock chef bound to a water genie.',
      },
      catalog: npcCatalog,
      completionStrategy: 'finalized',
    });

    expect(result.kind).toBe('advance');
    expect(result.routingPlan).toBeDefined();
    expect(result.effectiveStages.some((stage) => stage.routerKey === 'legendary')).toBe(false);
    if (result.kind === 'advance') {
      expect(result.nextStage.routerKey).toBe('coreDetails');
      expect(result.nextIndex).toBe(3);
    }
  });

  it('skips legendary stage when the user declines it', () => {
    const stages = [
      makeStage('Creator: Combat', { routerKey: 'combat', workflowStageKey: 'combat' }),
      makeStage('Creator: Legendary', { routerKey: 'legendary', workflowStageKey: 'legendary' }),
      makeStage('Creator: Relationships', { routerKey: 'relationships', workflowStageKey: 'relationships' }),
    ];

    const result = resolveWorkflowStageContinuation({
      currentStageIndex: 0,
      currentStage: stages[0],
      stages,
      workflowType: 'npc',
      userPrompt: 'Create a powerful paladin NPC.',
      stageResults: {
        combat: {
          actions: [],
        },
      },
      onLegendaryDecisionRequired: () => false,
      completionStrategy: 'finalized',
    });

    expect(result.kind).toBe('advance');
    if (result.kind === 'advance') {
      expect(result.nextStage.routerKey).toBe('relationships');
      expect(result.nextIndex).toBe(2);
    }
  });

  it('builds a completion result when there is no next stage', () => {
    const stages = [makeStage('Purpose', { workflowStageKey: 'purpose' })];

    const result = resolveWorkflowStageContinuation({
      currentStageIndex: 0,
      currentStage: stages[0],
      stages,
      workflowType: 'story_arc',
      userPrompt: 'Build a story arc.',
      stageResults: {
        purpose: {
          title: 'Storm Crown',
          summary: 'A storm-threatened kingdom.',
        },
      },
      accumulatedAnswers: { theme: 'redemption' },
      completionStrategy: 'finalized',
    });

    expect(result.kind).toBe('complete');
    if (result.kind === 'complete') {
      expect(result.completionResult.finalContent).toBeTruthy();
    }
  });
});
