import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from '../services/stagePromptShared';
import {
  ENCOUNTER_CREATOR_CONCEPT,
  ENCOUNTER_CREATOR_REWARDS,
  ENCOUNTER_CREATOR_TERRAIN,
} from './encounterCreatorStages';

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

describe('encounter creator stage contracts', () => {
  it('preserves the concept stage identity and shared prompt shape', () => {
    const prompt = ENCOUNTER_CREATOR_CONCEPT.buildUserPrompt(createContext({
      config: {
        prompt: 'Create a harbor ambush encounter.',
        type: 'encounter',
        flags: { weather: 'storm' },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(ENCOUNTER_CREATOR_CONCEPT.routerKey).toBe('concept');
    expect(parsed.deliverable).toBe('encounter');
    expect(parsed.stage).toBe('concept');
    expect(parsed.flags).toEqual({ weather: 'storm' });
  });

  it('preserves the terrain stage identity and summary inputs', () => {
    const prompt = ENCOUNTER_CREATOR_TERRAIN.buildUserPrompt(createContext({
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

    expect(ENCOUNTER_CREATOR_TERRAIN.routerKey).toBe('terrain');
    expect(parsed.stage).toBe('terrain');
    expect(parsed.enemies_summary).toEqual({
      monster_count: 2,
      has_ranged: 'Check enemy key_abilities for ranged attacks',
      has_flyers: 'Check enemy speed for fly speeds',
    });
  });

  it('preserves the rewards stage identity and expected summary payload', () => {
    const prompt = ENCOUNTER_CREATOR_REWARDS.buildUserPrompt(createContext({
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

    expect(ENCOUNTER_CREATOR_REWARDS.routerKey).toBe('rewards');
    expect(parsed.stage).toBe('rewards');
    expect(parsed.enemies_summary).toEqual({
      monster_count: 2,
      total_xp: 1800,
    });
  });
});
