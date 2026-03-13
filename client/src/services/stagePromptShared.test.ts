import { describe, expect, it } from 'vitest';
import {
  buildWorkflowStagePrompt,
  createMinimalFactpack,
  createWorkflowStagePromptPayload,
  stripStageOutput,
} from './stagePromptShared';

describe('stage prompt shared helpers', () => {
  it('strips workflow-only metadata from stage output', () => {
    expect(stripStageOutput({
      name: 'Barley',
      assumptions: ['x'],
      sources_used: ['fact-1'],
      proposals: [{ question: 'q' }],
      retrieval_hints: { keywords: ['k'] },
      canon_update: 'none',
      keywords: ['barley'],
    })).toEqual({
      name: 'Barley',
    });
  });

  it('normalizes fact entries and trims oversized factpacks without producing invalid JSON', () => {
    const factpack = {
      facts: [
        { text: 'A'.repeat(2000), entity_name: 'one', region: 'Moonsea' },
        { text: 'B'.repeat(2000), source: 'two', extra: true },
        { text: 'C'.repeat(2000), entityName: 'three' },
      ],
      entities: ['Barley'],
    };

    const minimized = createMinimalFactpack(factpack, 2600) as {
      facts: Array<{ text: string; source?: string }>;
      entities: string[];
    };

    expect(Array.isArray(minimized.facts)).toBe(true);
    expect(minimized.facts.length).toBeGreaterThan(0);
    expect(minimized.facts.length).toBeLessThan(factpack.facts.length);
    expect(minimized.facts[0]).toEqual({
      text: 'A'.repeat(2000),
      source: 'one',
    });
    expect(minimized.entities).toEqual(['Barley']);
    expect(() => JSON.stringify(minimized)).not.toThrow();
  });

  it('returns an empty fact array when no factpack is available', () => {
    expect(createMinimalFactpack(null)).toEqual({ facts: [] });
  });

  it('builds shared workflow stage prompts with canon context and prior decisions', () => {
    const prompt = buildWorkflowStagePrompt({
      context: {
        config: {
          prompt: 'Create a tidal relic.',
          type: 'item',
          flags: { tone: 'epic' },
        },
        stageResults: {},
        factpack: {
          facts: [{ text: 'Marids prize jeweled serving ware.', source: 'canon' }],
        },
        previousDecisions: {
          rarity: 'rare',
        },
      },
      deliverable: 'item',
      stage: 'concept',
      includeFlags: true,
    });

    expect(JSON.parse(prompt)).toEqual({
      original_user_request: 'Create a tidal relic.',
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

  it('prefers planner canon references over embedding another factpack copy', () => {
    const prompt = buildWorkflowStagePrompt({
      context: {
        config: {
          prompt: 'Create a storm encounter.',
          type: 'encounter',
          flags: {},
        },
        stageResults: {
          planner: {
            deliverable: 'encounter',
          },
        },
        factpack: {
          facts: [{ text: 'The harbor chains rise at dusk.' }],
        },
      },
      deliverable: 'encounter',
      stage: 'rewards',
      plannerReferenceMessage: 'Review planner canon first.',
    });

    expect(JSON.parse(prompt)).toEqual({
      original_user_request: 'Create a storm encounter.',
      deliverable: 'encounter',
      stage: 'rewards',
      canon_reference: 'Review planner canon first.',
    });
  });

  it('supports custom payload keys for special workflow stages', () => {
    const payload = createWorkflowStagePromptPayload({
      context: {
        config: {
          prompt: 'Create a spellcasting knight.',
          type: 'npc',
          flags: {},
        },
        stageResults: {
          planner: {
            deliverable: 'npc',
          },
        },
        factpack: {
          facts: [{ text: 'Knights of Selune favor moon-themed prayers.' }],
        },
        previousDecisions: {
          oath: 'devotion',
        },
      },
      deliverable: 'npc',
      stage: 'spellcasting',
      plannerReferenceMessage: 'Reuse only relevant canon spell names.',
      plannerReferenceKey: 'compact_canon',
      factpackKey: 'compact_canon',
      previousDecisionsKey: 'decisions',
    });

    expect(payload).toEqual({
      original_user_request: 'Create a spellcasting knight.',
      deliverable: 'npc',
      stage: 'spellcasting',
      compact_canon: 'Reuse only relevant canon spell names.',
      decisions: {
        oath: 'devotion',
      },
    });
  });
});
