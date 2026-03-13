import { describe, expect, it } from 'vitest';
import {
  buildItemConceptPrompt,
  buildItemLorePrompt,
  buildItemMechanicsPrompt,
} from './itemStagePrompt';

describe('buildItemConceptPrompt', () => {
  it('builds the concept stage through the shared workflow prompt helper', () => {
    const prompt = buildItemConceptPrompt({
      config: {
        prompt: 'Create a tidebound trident.',
        type: 'item',
        flags: {
          tone: 'epic',
        },
      },
      stageResults: {},
      factpack: {
        facts: [{ text: 'Marids prize jeweled serving ware.', source: 'canon' }],
      },
      previousDecisions: {
        rarity: 'rare',
      },
    });

    expect(JSON.parse(prompt)).toEqual({
      original_user_request: 'Create a tidebound trident.',
      deliverable: 'item',
      stage: 'concept',
      flags: { tone: 'epic' },
      relevant_canon: {
        facts: [{ text: 'Marids prize jeweled serving ware.', source: 'canon' }],
      },
      previous_decisions: {
        rarity: 'rare',
      },
    });
  });
});

describe('buildItemMechanicsPrompt', () => {
  it('builds mechanics prompts from the stripped concept stage and planner canon reference', () => {
    const prompt = buildItemMechanicsPrompt({
      config: {
        prompt: 'Create a tidebound trident.',
        type: 'item',
        flags: {},
      },
      stageResults: {
        item_concept: {
          name: 'Tidebound Trident',
          rarity: 'rare',
          item_type: 'weapon',
          sources_used: ['canon-1'],
          proposals: [{ question: 'q' }],
        },
        planner: {
          deliverable: 'item',
        },
      },
      factpack: {
        facts: [{ text: 'Sea princes fear relic spears.', source: 'canon' }],
      },
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('mechanics');
    expect(parsed.concept).toEqual({
      name: 'Tidebound Trident',
      rarity: 'rare',
      item_type: 'weapon',
    });
    expect(parsed.instructions).toContain('rare');
    expect(parsed.instructions).toContain('weapon');
    expect(parsed.canon_reference).toContain('Planner stage');
  });
});

describe('buildItemLorePrompt', () => {
  it('builds lore prompts from concept and mechanics summaries', () => {
    const prompt = buildItemLorePrompt({
      config: {
        prompt: 'Create a tidebound trident.',
        type: 'item',
        flags: {},
      },
      stageResults: {
        item_concept: {
          name: 'Tidebound Trident',
          item_type: 'weapon',
          rarity: 'rare',
          description: 'A salt-blue spear crowned with pearl runes.',
        },
        item_mechanics: {
          charges: { maximum: 5 },
          spells: [{ name: 'tidal wave' }],
          properties: [{ name: 'Undertow' }, { name: 'Tidal Return' }],
        },
        planner: {
          deliverable: 'item',
        },
      },
      factpack: null,
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('lore');
    expect(parsed.concept).toEqual({
      name: 'Tidebound Trident',
      item_type: 'weapon',
      rarity: 'rare',
      description: 'A salt-blue spear crowned with pearl runes.',
    });
    expect(parsed.mechanics_summary).toEqual({
      has_charges: true,
      has_spells: true,
      property_count: 2,
    });
    expect(parsed.canon_reference).toContain('Planner stage');
  });
});
