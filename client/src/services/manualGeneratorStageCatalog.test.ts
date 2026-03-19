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

  it('compacts large scene drafts before building the generic fact checker prompt', () => {
    const factCheckerStage = GENERIC_STAGES.find((stage) => stage.routerKey === 'fact_checker');

    expect(factCheckerStage?.buildUserPrompt).toBeTypeOf('function');
    if (!factCheckerStage?.buildUserPrompt) {
      return;
    }

    const largeSceneDraft = {
      title: 'The Ash-Choked Truce',
      description: 'A'.repeat(1600),
      scene_type: 'cutscene',
      location: {
        name: 'The Shattered Archway',
        description: 'B'.repeat(500),
        region: 'The Fractured Wastes',
        ambiance: 'Oppressive',
        sensory_details: {
          sights: ['C'.repeat(120), 'D'.repeat(120), 'E'.repeat(120)],
          sounds: ['F'.repeat(120), 'G'.repeat(120), 'H'.repeat(120)],
          smells: ['I'.repeat(120), 'J'.repeat(120), 'K'.repeat(120)],
        },
      },
      participants: Array.from({ length: 5 }, (_, index) => ({
        name: `Participant ${index + 1}`,
        role: 'survivor',
        disposition: 'hostile',
        goals: ['L'.repeat(140), 'M'.repeat(140), 'N'.repeat(140)],
      })),
      objectives: ['O'.repeat(180), 'P'.repeat(180), 'Q'.repeat(180), 'R'.repeat(180)],
      hooks: ['S'.repeat(180), 'T'.repeat(180), 'U'.repeat(180), 'V'.repeat(180)],
      skill_challenges: Array.from({ length: 3 }, () => ({
        description: 'W'.repeat(220),
        suggested_skills: ['Acrobatics', 'Perception', 'Insight', 'Stealth'],
        dc: 15,
        consequences: {
          success: 'X'.repeat(180),
          failure: 'Y'.repeat(180),
        },
      })),
      dialogue: Array.from({ length: 4 }, (_, index) => ({
        speaker: index % 2 === 0 ? 'Nasir' : 'Karoz',
        line: 'Z'.repeat(220),
        context: 'Q'.repeat(180),
      })),
      discoveries: ['R'.repeat(180), 'S'.repeat(180), 'T'.repeat(180), 'U'.repeat(180)],
      gm_notes: 'V'.repeat(500),
      rule_base: '2024RAW',
    };

    const promptContext: ManualGeneratorStageContext = {
      config: {
        prompt: 'Create a tense aftermath scene between Nasir and Karoz.',
        type: 'scene',
        flags: {},
      },
      stageResults: {
        creator: largeSceneDraft,
      },
      factpack: null,
      previousDecisions: {
        tension: 'Keep the tension high and non-verbal.',
      },
    };

    const userPrompt = JSON.parse(factCheckerStage.buildUserPrompt(promptContext)) as Record<string, unknown>;
    const compactDraft = userPrompt.draft as Record<string, unknown>;

    expect(JSON.stringify(compactDraft).length).toBeLessThan(JSON.stringify(largeSceneDraft).length);
    expect(String(compactDraft.description).length).toBeLessThanOrEqual(700);
    expect(Array.isArray(compactDraft.participants)).toBe(true);
    expect((compactDraft.participants as unknown[]).length).toBeLessThanOrEqual(3);
    expect(Array.isArray(compactDraft.dialogue)).toBe(true);
    expect((compactDraft.dialogue as unknown[]).length).toBeLessThanOrEqual(2);
    expect(userPrompt.note).toBe('Previous decisions were already made. Do NOT flag these as issues.');
  });
});
