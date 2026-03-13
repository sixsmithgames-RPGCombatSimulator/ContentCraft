import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from './stagePromptShared';
import {
  buildMonsterBasicInfoPrompt,
  buildMonsterCombatPrompt,
  buildMonsterLegendaryPrompt,
  buildMonsterLorePrompt,
  buildMonsterStatsPrompt,
} from './monsterStagePrompt';

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

describe('buildMonsterBasicInfoPrompt', () => {
  it('builds basic info prompts with request-key payloads and canon context', () => {
    const prompt = buildMonsterBasicInfoPrompt(createContext({
      factpack: {
        facts: [{ text: 'The drowned reefs are haunted by saltbound dead.', source: 'canon' }],
      },
      previousDecisions: {
        habitat: 'reef',
      },
    }));

    expect(JSON.parse(prompt)).toEqual({
      request: 'Create a reef-dwelling undead shark.',
      deliverable: 'monster',
      stage: 'basic_info',
      instructions: 'Generate the basic information for this monster. Include name, description, size, creature type, alignment, and challenge rating.',
      relevant_canon: {
        facts: [{ text: 'The drowned reefs are haunted by saltbound dead.', source: 'canon' }],
      },
      previous_decisions: {
        habitat: 'reef',
      },
    });
  });
});

describe('buildMonsterStatsPrompt', () => {
  it('builds stats prompts from stripped basic info context', () => {
    const prompt = buildMonsterStatsPrompt(createContext({
      stageResults: {
        monster_basic_info: {
          challenge_rating: '7',
          creature_type: 'undead',
          sources_used: ['canon-1'],
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('stats');
    expect(parsed.basic_info).toEqual({
      challenge_rating: '7',
      creature_type: 'undead',
    });
    expect(parsed.instructions).toBe('Generate stats and defenses for this monster. Ensure values are appropriate for CR 7.');
  });
});

describe('buildMonsterCombatPrompt', () => {
  it('builds combat prompts with inherited basic info and stats context', () => {
    const prompt = buildMonsterCombatPrompt(createContext({
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
});

describe('buildMonsterLegendaryPrompt', () => {
  it('builds legendary prompts from the monster basic info stage', () => {
    const prompt = buildMonsterLegendaryPrompt(createContext({
      stageResults: {
        monster_basic_info: {
          challenge_rating: '12',
          creature_type: 'dragon',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('legendary');
    expect(parsed.basic_info).toEqual({
      challenge_rating: '12',
      creature_type: 'dragon',
    });
    expect(parsed.instructions).toContain('CR 12');
  });
});

describe('buildMonsterLorePrompt', () => {
  it('builds lore prompts with legendary-state summaries', () => {
    const prompt = buildMonsterLorePrompt(createContext({
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

    expect(parsed.stage).toBe('lore');
    expect(parsed.basic_info).toEqual({
      challenge_rating: '12',
      creature_type: 'dragon',
    });
    expect(parsed.stats_summary).toEqual({
      cr: '12',
      type: 'dragon',
      has_legendary: true,
    });
  });
});
