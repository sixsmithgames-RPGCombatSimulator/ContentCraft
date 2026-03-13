import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from '../services/stagePromptShared';
import {
  ITEM_CREATOR_CONCEPT,
  ITEM_CREATOR_LORE,
  ITEM_CREATOR_MECHANICS,
} from './itemCreatorStages';

function createContext(
  overrides: Partial<GeneratorStagePromptContext> = {},
): GeneratorStagePromptContext {
  return {
    config: {
      prompt: 'Create a tidebound trident.',
      type: 'item',
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

describe('item creator stage contracts', () => {
  it('preserves the concept stage identity and shared prompt shape', () => {
    const prompt = ITEM_CREATOR_CONCEPT.buildUserPrompt(createContext({
      config: {
        prompt: 'Create a tidebound trident.',
        type: 'item',
        flags: { tone: 'epic' },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(ITEM_CREATOR_CONCEPT.routerKey).toBe('concept');
    expect(parsed.deliverable).toBe('item');
    expect(parsed.stage).toBe('concept');
    expect(parsed.flags).toEqual({ tone: 'epic' });
  });

  it('preserves the mechanics stage identity and expected concept input', () => {
    const prompt = ITEM_CREATOR_MECHANICS.buildUserPrompt(createContext({
      stageResults: {
        item_concept: {
          name: 'Tidebound Trident',
          rarity: 'rare',
          item_type: 'weapon',
        },
        planner: {
          deliverable: 'item',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(ITEM_CREATOR_MECHANICS.routerKey).toBe('mechanics');
    expect(parsed.stage).toBe('mechanics');
    expect(parsed.concept).toEqual({
      name: 'Tidebound Trident',
      rarity: 'rare',
      item_type: 'weapon',
    });
  });

  it('preserves the lore stage identity and expected mechanics summary input', () => {
    const prompt = ITEM_CREATOR_LORE.buildUserPrompt(createContext({
      stageResults: {
        item_concept: {
          name: 'Tidebound Trident',
          item_type: 'weapon',
          rarity: 'rare',
          description: 'A salt-blue spear crowned with pearl runes.',
        },
        item_mechanics: {
          charges: { maximum: 5 },
          properties: [{ name: 'Undertow' }],
          spells: [{ name: 'tidal wave' }],
        },
        planner: {
          deliverable: 'item',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(ITEM_CREATOR_LORE.routerKey).toBe('lore');
    expect(parsed.stage).toBe('lore');
    expect(parsed.mechanics_summary).toEqual({
      has_charges: true,
      has_spells: true,
      property_count: 1,
    });
  });
});
