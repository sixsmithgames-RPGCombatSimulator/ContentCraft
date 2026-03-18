import { describe, expect, it } from 'vitest';
import {
  GENERIC_STAGES,
  MANUAL_GENERATOR_STAGE_CATALOG,
  NONFICTION_BOOK_STAGES,
  type ManualGeneratorStageContext,
} from './manualGeneratorStageCatalog';
import type { GeneratorStage } from './generatorWorkflow';

describe('manual generator stage catalog', () => {
  it('exports the generic workflow stages through the shared catalog', () => {
    expect(MANUAL_GENERATOR_STAGE_CATALOG.genericStages).toBe(GENERIC_STAGES);
    expect(GENERIC_STAGES[0]?.name).toBe('Purpose');
    expect(GENERIC_STAGES[1]?.name).toBe('Keyword Extractor');
    expect(GENERIC_STAGES[2]?.name).toBe('Planner');
    expect(GENERIC_STAGES[3]?.routerKey).toBe('creator');
    expect(GENERIC_STAGES[4]?.routerKey).toBe('fact_checker');
    expect(GENERIC_STAGES[5]?.routerKey).toBe('stylist');
    expect(GENERIC_STAGES[6]?.routerKey).toBe('canon_validator');
    expect(GENERIC_STAGES[7]?.routerKey).toBe('physics_validator');
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

  it('keeps the generic creator prompt stateless and compact for scene workflows', () => {
    const creatorStage = GENERIC_STAGES.find((stage) => stage.routerKey === 'creator');

    expect(creatorStage?.systemPrompt.length ?? 0).toBeLessThan(1500);
    expect(creatorStage?.systemPrompt).toContain('Do NOT rely on prior conversation history');
    expect(creatorStage?.buildUserPrompt).toBeTypeOf('function');
    if (!creatorStage?.buildUserPrompt) {
      return;
    }

    const promptContext: ManualGeneratorStageContext = {
      config: {
        prompt: 'Create a tense investigative scene in the catacombs beneath Blackstone Abbey.',
        type: 'scene',
        flags: {},
      },
      stageResults: {
        planner: {
          deliverable: 'scene',
          title: 'Echoes Below Blackstone Abbey',
        },
        purpose: {
          content_type: 'scene',
        },
      },
      factpack: {
        facts: [
          {
            text: 'Blackstone Abbey hides flooded catacombs beneath its ruined cloister.',
            source: 'Blackstone Abbey',
          },
        ],
      },
      previousDecisions: {
        tone: 'gothic suspense',
      },
    };

    const userPrompt = JSON.parse(creatorStage.buildUserPrompt(promptContext)) as Record<string, unknown>;

    expect(userPrompt.output_schema).toBeTypeOf('string');
    expect(String(userPrompt.output_schema)).toContain('Scene output schema');
    expect(String(userPrompt.output_schema)).toContain('location { name, description');
    expect(String(userPrompt.output_schema)).toContain('participants[{ name, role, goals[], disposition }]');
    expect(String(userPrompt.output_schema)).not.toContain('setting { location');
    expect(String(userPrompt.output_schema)).not.toContain('npcs_present');
    expect(userPrompt.relevant_canon).toMatchObject({
      facts: [
        {
          text: 'Blackstone Abbey hides flooded catacombs beneath its ruined cloister.',
          source: 'Blackstone Abbey',
        },
      ],
    });
    expect(userPrompt).not.toHaveProperty('canon_reference');
  });
});
