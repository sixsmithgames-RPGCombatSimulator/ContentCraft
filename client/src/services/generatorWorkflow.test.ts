import { describe, expect, it } from 'vitest';
import {
  buildNpcDynamicStagePlan,
  buildWorkflowRunDefinitionFromStages,
  getCurrentWorkflowStageIdentity,
  getGeneratorStages,
  getWorkflowLabel,
  resolveWorkflowSessionMetadata,
  resolveWorkflowTypeFromConfigType,
  shouldShowLocationMapForStage,
  type GeneratorStage,
} from './generatorWorkflow';
import { MANUAL_GENERATOR_STAGE_CATALOG } from './manualGeneratorStageCatalog';

function createStage(name: string, routerKey?: string): GeneratorStage {
  return {
    name,
    routerKey,
    systemPrompt: `${name} prompt`,
    buildUserPrompt: () => JSON.stringify({ stage: name }),
  };
}

const genericStages: GeneratorStage[] = [
  createStage('Purpose'),
  createStage('Planner'),
  createStage('Keyword Extractor'),
  createStage('Creator'),
  createStage('Fact Checker'),
  createStage('Finalizer'),
];

const nonfictionStages: GeneratorStage[] = [
  createStage('Purpose'),
  createStage('Outline & Structure'),
  createStage('Draft'),
  createStage('Editor & Style'),
  createStage('Finalizer'),
];

const stageCatalog = {
  ...MANUAL_GENERATOR_STAGE_CATALOG,
  genericStages,
  nonfictionStages,
};

describe('generator workflow service', () => {
  it('maps config types onto shared workflow types and labels', () => {
    expect(resolveWorkflowTypeFromConfigType('diet_log_entry')).toBe('diet_log_entry');
    expect(resolveWorkflowTypeFromConfigType('not-real')).toBe('unknown');
    expect(getWorkflowLabel('monster')).toBe('Monster Creator');
  });

  it('selects specialized stage catalogs through shared type lookup and falls back for unknown types', () => {
    expect(getGeneratorStages('monster', stageCatalog)).toBe(stageCatalog.monsterStages);
    expect(getGeneratorStages('encounter', stageCatalog)).toBe(stageCatalog.encounterStages);
    expect(getGeneratorStages('item', stageCatalog)).toBe(stageCatalog.itemStages);
    expect(getGeneratorStages('story_arc', stageCatalog)).toBe(stageCatalog.storyArcStages);
    expect(getGeneratorStages('location', stageCatalog)).toBe(stageCatalog.locationStages);
    expect(getGeneratorStages('nonfiction', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('outline', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('chapter', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('memoir', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('journal_entry', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('diet_log_entry', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('other_writing', stageCatalog)).toBe(nonfictionStages);
    expect(getGeneratorStages('not-real', stageCatalog)).toBe(genericStages);
  });

  it('selects NPC stages with keyword extractor and planner prefix independent of array indexes', () => {
    const stages = getGeneratorStages('npc', stageCatalog);

    expect(stages[0]?.name).toBe('Keyword Extractor');
    expect(stages[1]?.name).toBe('Planner');
    expect(stages[2]?.name).toBe('Creator: Basic Info');
  });

  it('builds dynamic NPC stages from routing decisions in canonical order', () => {
    const plan = buildNpcDynamicStagePlan({
      basicInfoOutput: {
        name: 'Barley',
        race: 'Halfling',
        description: 'A halfling warlock chef bound to a genie patron.',
      },
      userPrompt: 'Create a halfling that is an 11th level Warlock named Barley. No legendary actions.',
      catalog: stageCatalog,
    });

    expect(plan.routingDecision.spellcasting.required).toBe(true);
    expect(plan.routingDecision.legendary.required).toBe(false);
    expect(plan.dynamicStages.some((stage) => stage.name === 'Creator: Spellcasting')).toBe(true);
    expect(plan.dynamicStages.some((stage) => stage.name === 'Creator: Legendary')).toBe(false);
    expect(plan.dynamicStages[0]?.name).toBe('Keyword Extractor');
    expect(plan.dynamicStages[1]?.name).toBe('Planner');
    expect(plan.dynamicStages[2]?.name).toBe('Creator: Basic Info');
  });

  it('prefers dynamic NPC stages when they are available', () => {
    const dynamicNpcStages = [createStage('Dynamic NPC Stage')];

    expect(getGeneratorStages('npc', stageCatalog, dynamicNpcStages)).toBe(dynamicNpcStages);
  });

  it('builds run definitions and stage identities from shared workflow metadata', () => {
    const npcStages = getGeneratorStages('npc', stageCatalog).slice(0, 3);
    const currentStage = getCurrentWorkflowStageIdentity('npc', npcStages[2]);
    const definition = buildWorkflowRunDefinitionFromStages({
      workflowType: 'npc',
      stages: npcStages,
      executionMode: 'manual',
      projectId: 'project-123',
    });

    expect(currentStage?.stageKey).toBe('basic_info');
    expect(currentStage?.stageLabel).toBe('Creator: Basic Info');
    expect(definition.stageSequence).toEqual(['keyword_extractor', 'planner', 'basic_info']);
    expect(definition.stageLabels.basic_info).toBe('Creator: Basic Info');
    expect(definition.projectId).toBe('project-123');
  });

  it('resolves canonical workflow session metadata from the active stage list when config types match', () => {
    const npcStages = getGeneratorStages('npc', stageCatalog).slice(0, 3);

    expect(resolveWorkflowSessionMetadata({
      sessionConfigType: 'npc',
      currentConfigType: 'npc',
      stages: npcStages,
    })).toEqual({
      workflowType: 'npc',
      workflowStageSequence: ['keyword_extractor', 'planner', 'basic_info'],
    });
  });

  it('resolves canonical writing workflow stage metadata from the active stage list', () => {
    expect(resolveWorkflowSessionMetadata({
      sessionConfigType: 'nonfiction',
      currentConfigType: 'nonfiction',
      stages: getGeneratorStages('nonfiction', stageCatalog),
    })).toEqual({
      workflowType: 'nonfiction',
      workflowStageSequence: ['purpose', 'outline_&_structure', 'draft', 'editor_&_style', 'finalizer'],
    });
  });

  it('preserves saved workflow stage sequences when the active config differs', () => {
    expect(resolveWorkflowSessionMetadata({
      sessionWorkflowType: 'story_arc',
      sessionConfigType: 'story_arc',
      currentConfigType: 'npc',
      sessionWorkflowStageSequence: ['premise', 'structure', 'characters', 'secrets'],
      stages: getGeneratorStages('npc', stageCatalog).slice(0, 2),
    })).toEqual({
      workflowType: 'story_arc',
      workflowStageSequence: ['premise', 'structure', 'characters', 'secrets'],
    });
  });

  it('only shows the location map for map-aware stages', () => {
    const locationStages = [
      createStage('Purpose'),
      createStage('Spaces'),
      createStage('Details'),
    ];

    expect(shouldShowLocationMapForStage('location', 1, locationStages)).toBe(true);
    expect(shouldShowLocationMapForStage('location', 0, locationStages)).toBe(false);
    expect(shouldShowLocationMapForStage('npc', 1, locationStages)).toBe(false);
  });
});
