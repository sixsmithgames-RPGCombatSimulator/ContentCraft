import { describe, expect, it } from 'vitest';
import {
  GENERIC_STAGES,
  MANUAL_GENERATOR_STAGE_CATALOG,
  NONFICTION_BOOK_STAGES,
} from './manualGeneratorStageCatalog';
import type { GeneratorStage } from './generatorWorkflow';

describe('manual generator stage catalog', () => {
  it('exports the generic workflow stages through the shared catalog', () => {
    expect(MANUAL_GENERATOR_STAGE_CATALOG.genericStages).toBe(GENERIC_STAGES);
    expect(GENERIC_STAGES[0]?.name).toBe('Purpose');
    expect(GENERIC_STAGES[1]?.name).toBe('Keyword Extractor');
    expect(GENERIC_STAGES[2]?.name).toBe('Planner');
  });

  it('exports the nonfiction writing workflow stages through the shared catalog', () => {
    expect(MANUAL_GENERATOR_STAGE_CATALOG.nonfictionStages).not.toBe(NONFICTION_BOOK_STAGES);
    expect(NONFICTION_BOOK_STAGES.map((stage) => stage.name)).toEqual([
      'Purpose',
      'Outline & Structure',
      'Draft',
      'Editor & Style',
      'Finalizer',
    ]);
  });

  it('centralizes specialized stage arrays for workflow composition', () => {
    expect(MANUAL_GENERATOR_STAGE_CATALOG.npcStages[0]?.name).toBe('Creator: Basic Info');
    expect(MANUAL_GENERATOR_STAGE_CATALOG.monsterStages[0]?.name).toBe('Basic Info');
    expect(MANUAL_GENERATOR_STAGE_CATALOG.locationStages[0]?.name).toBe('Purpose');
    expect(MANUAL_GENERATOR_STAGE_CATALOG.npcStageRouterMap.basicInfo?.name).toBe('Creator: Basic Info');
  });

  it('normalizes specialized stages against the shared workflow registry', () => {
    const nonfictionStages = MANUAL_GENERATOR_STAGE_CATALOG.nonfictionStages as GeneratorStage[];
    const monsterStages = MANUAL_GENERATOR_STAGE_CATALOG.monsterStages as GeneratorStage[];
    const locationStages = MANUAL_GENERATOR_STAGE_CATALOG.locationStages as GeneratorStage[];
    const npcBasicInfoStage = MANUAL_GENERATOR_STAGE_CATALOG.npcStageRouterMap.basicInfo as GeneratorStage | undefined;

    expect(nonfictionStages[0]?.workflowStageKey).toBe('purpose');
    expect(nonfictionStages[1]?.workflowStageKey).toBe('outline_&_structure');
    expect(nonfictionStages[2]?.workflowStageKey).toBe('draft');
    expect(nonfictionStages[3]?.workflowStageKey).toBe('editor_&_style');
    expect(nonfictionStages[4]?.workflowStageKey).toBe('finalizer');
    expect(monsterStages[0]?.workflowStageKey).toBe('monster.basic_info');
    expect(locationStages[0]?.routerKey).toBe('location.purpose');
    expect(npcBasicInfoStage?.workflowStageKey).toBe('basic_info');
  });
});
