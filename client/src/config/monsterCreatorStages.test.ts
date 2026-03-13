import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from '../services/stagePromptShared';
import {
  MONSTER_CREATOR_BASIC_INFO,
  MONSTER_CREATOR_COMBAT,
  MONSTER_CREATOR_LORE,
} from './monsterCreatorStages';

function createContext(
  overrides: Partial<GeneratorStagePromptContext> = {},
): GeneratorStagePromptContext {
  return {
    config: {
      prompt: 'Create a reef-dwelling undead shark.',
      type: 'monster',
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

describe('monster creator stage prompts', () => {
  it('builds basic info prompts with structured canon facts', () => {
    const prompt = MONSTER_CREATOR_BASIC_INFO.buildUserPrompt(createContext({
      factpack: {
        facts: [{ text: 'The drowned reefs are haunted by saltbound dead.', source: 'canon' }],
      },
      previousDecisions: {
        habitat: 'reef',
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.request).toBe('Create a reef-dwelling undead shark.');
    expect(parsed.stage).toBe('basic_info');
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'The drowned reefs are haunted by saltbound dead.', source: 'canon' }],
    });
    expect(parsed.previous_decisions).toEqual({
      habitat: 'reef',
    });
  });

  it('builds combat prompts with inherited stage context through shared scaffolding', () => {
    const prompt = MONSTER_CREATOR_COMBAT.buildUserPrompt(createContext({
      stageResults: {
        monster_basic_info: {
          challenge_rating: '7',
          creature_type: 'undead',
        },
        monster_stats: {
          ability_scores: { str: 18, dex: 14, con: 16, int: 3, wis: 12, cha: 8 },
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.basic_info).toEqual({
      challenge_rating: '7',
      creature_type: 'undead',
    });
    expect(parsed.stats).toEqual({
      ability_scores: { str: 18, dex: 14, con: 16, int: 3, wis: 12, cha: 8 },
    });
    expect(parsed.instructions).toContain('CR 7');
  });

  it('builds lore prompts with the expected summary payload through the shared service', () => {
    const prompt = MONSTER_CREATOR_LORE.buildUserPrompt(createContext({
      stageResults: {
        monster_basic_info: {
          challenge_rating: '12',
          creature_type: 'dragon',
        },
        monster_legendary: {
          legendary_actions: {
            summary: 'The dragon can take 3 legendary actions.',
          },
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.stats_summary).toEqual({
      cr: '12',
      type: 'dragon',
      has_legendary: true,
    });
  });
});
