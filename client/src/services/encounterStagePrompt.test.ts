import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from './stagePromptShared';
import {
  buildEncounterConceptPrompt,
  buildEncounterEnemiesPrompt,
  buildEncounterRewardsPrompt,
  buildEncounterTacticsPrompt,
  buildEncounterTerrainPrompt,
} from './encounterStagePrompt';

function createContext(
  overrides: Partial<GeneratorStagePromptContext> = {},
): GeneratorStagePromptContext {
  return {
    config: {
      prompt: 'Create a harbor ambush encounter.',
      type: 'encounter',
      flags: {},
      ...overrides.config,
    },
    stageResults: {
      ...(overrides.stageResults || {}),
    },
    factpack: overrides.factpack ?? null,
    chunkInfo: overrides.chunkInfo,
    previousDecisions: overrides.previousDecisions,
    unansweredProposals: overrides.unansweredProposals,
    npcSectionContext: overrides.npcSectionContext,
  };
}

describe('buildEncounterConceptPrompt', () => {
  it('builds the concept stage through the shared workflow prompt helper', () => {
    const prompt = buildEncounterConceptPrompt(createContext({
      config: {
        prompt: 'Create a harbor ambush encounter.',
        type: 'encounter',
        flags: { weather: 'storm' },
      },
      factpack: {
        facts: [{ text: 'The harbor chains rise at dusk.', source: 'canon' }],
      },
      previousDecisions: {
        difficulty: 'hard',
      },
    }));

    expect(JSON.parse(prompt)).toEqual({
      original_user_request: 'Create a harbor ambush encounter.',
      deliverable: 'encounter',
      stage: 'concept',
      flags: { weather: 'storm' },
      relevant_canon: {
        facts: [{ text: 'The harbor chains rise at dusk.', source: 'canon' }],
      },
      previous_decisions: {
        difficulty: 'hard',
      },
    });
  });
});

describe('buildEncounterEnemiesPrompt', () => {
  it('builds enemies prompts from the stripped concept stage and planner canon reference', () => {
    const prompt = buildEncounterEnemiesPrompt(createContext({
      stageResults: {
        encounter_concept: {
          title: 'Chains at Dusk',
          xp_budget: 1800,
          difficulty_tier: 'hard',
          proposals: [{ question: 'q' }],
        },
        planner: {
          deliverable: 'encounter',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('enemies');
    expect(parsed.concept).toEqual({
      title: 'Chains at Dusk',
      xp_budget: 1800,
      difficulty_tier: 'hard',
    });
    expect(parsed.instructions).toBe('Select enemies for this encounter. XP budget: 1800. Difficulty: hard.');
    expect(parsed.canon_reference).toContain('monster/NPC details');
  });
});

describe('buildEncounterTerrainPrompt', () => {
  it('builds terrain prompts with summarized enemy context', () => {
    const prompt = buildEncounterTerrainPrompt(createContext({
      stageResults: {
        encounter_concept: {
          location: 'North Harbor',
          description: 'A moonlit dockside trap.',
          setting_context: 'Smugglers bait the party into a dead end.',
        },
        encounter_enemies: {
          monsters: [{ name: 'Bandit' }, { name: 'Bandit Captain' }],
        },
        planner: {
          deliverable: 'encounter',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('terrain');
    expect(parsed.concept).toEqual({
      location: 'North Harbor',
      description: 'A moonlit dockside trap.',
      setting_context: 'Smugglers bait the party into a dead end.',
    });
    expect(parsed.enemies_summary).toEqual({
      monster_count: 2,
      has_ranged: 'Check enemy key_abilities for ranged attacks',
      has_flyers: 'Check enemy speed for fly speeds',
    });
  });
});

describe('buildEncounterTacticsPrompt', () => {
  it('builds tactics prompts from prior stage outputs', () => {
    const prompt = buildEncounterTacticsPrompt(createContext({
      stageResults: {
        encounter_concept: {
          difficulty_tier: 'hard',
          objectives: ['Survive the ambush', 'Capture the smuggler leader'],
          expected_duration_rounds: 5,
        },
        encounter_enemies: {
          monsters: [{ name: 'Bandit Captain' }],
        },
        encounter_terrain: {
          terrain: 'Docks with stacked crates and slick planks',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('tactics');
    expect(parsed.concept).toEqual({
      difficulty_tier: 'hard',
      objectives: ['Survive the ambush', 'Capture the smuggler leader'],
      expected_duration_rounds: 5,
    });
    expect(parsed.enemies).toEqual({
      monsters: [{ name: 'Bandit Captain' }],
    });
    expect(parsed.terrain).toEqual({
      terrain: 'Docks with stacked crates and slick planks',
    });
  });
});

describe('buildEncounterRewardsPrompt', () => {
  it('builds rewards prompts with party and enemy summaries', () => {
    const prompt = buildEncounterRewardsPrompt(createContext({
      stageResults: {
        encounter_concept: {
          difficulty_tier: 'hard',
          party_level: 5,
          party_size: 4,
          objectives: ['Survive the ambush'],
          xp_budget: 1800,
        },
        encounter_enemies: {
          monsters: [{ name: 'Bandit' }, { name: 'Bandit Captain' }],
        },
        planner: {
          deliverable: 'encounter',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('rewards');
    expect(parsed.concept).toEqual({
      difficulty_tier: 'hard',
      party_level: 5,
      party_size: 4,
      objectives: ['Survive the ambush'],
    });
    expect(parsed.enemies_summary).toEqual({
      monster_count: 2,
      total_xp: 1800,
    });
    expect(parsed.canon_reference).toContain('treasure and story context');
  });
});
