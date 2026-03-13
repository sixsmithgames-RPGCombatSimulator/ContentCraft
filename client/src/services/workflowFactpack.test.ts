import { describe, expect, it } from 'vitest';
import {
  deduplicateWorkflowFactpack,
  formatWorkflowCanonFacts,
  groupWorkflowFacts,
  mergeWorkflowFactpacks,
} from './workflowFactpack';
import type { Factpack } from './workflowCanonRetrieval';

const sampleFactpack: Factpack = {
  facts: [
    {
      chunk_id: 'npc.barley#c1',
      text: 'Barley is a halfling warlock chef.',
      entity_id: 'npc.barley',
      entity_name: 'Barley',
      entity_type: 'npc',
      region: 'Tears of Selune',
    },
    {
      chunk_id: 'npc.barley#c2',
      text: 'Barley serves a marid patron.',
      entity_id: 'npc.barley',
      entity_name: 'Barley',
      entity_type: 'npc',
      region: 'Tears of Selune',
    },
  ],
  entities: ['npc.barley'],
  gaps: [],
};

describe('workflowFactpack', () => {
  it('deduplicates facts by chunk id and normalized text', () => {
    const result = deduplicateWorkflowFactpack({
      facts: [
        ...sampleFactpack.facts,
        {
          chunk_id: 'npc.barley#c1',
          text: 'Barley is a halfling warlock chef.',
          entity_id: 'npc.barley',
          entity_name: 'Barley',
        },
        {
          chunk_id: 'npc.barley#c3',
          text: '  barley is a halfling warlock chef.  ',
          entity_id: 'npc.barley',
          entity_name: 'Barley',
        },
      ],
      entities: ['npc.barley', 'npc.barley'],
      gaps: ['none', 'none'],
    });

    expect(result.facts).toHaveLength(2);
    expect(result.entities).toEqual(['npc.barley']);
    expect(result.gaps).toEqual(['none']);
  });

  it('merges factpacks without duplicating entities or facts', () => {
    const result = mergeWorkflowFactpacks(sampleFactpack, {
      facts: [
        sampleFactpack.facts[1],
        {
          chunk_id: 'location.kitchen#c1',
          text: 'The kitchen smells of sea salt.',
          entity_id: 'location.kitchen',
          entity_name: 'Kitchen',
          entity_type: 'location',
        },
      ],
      entities: ['npc.barley', 'location.kitchen'],
      gaps: ['missing tavern owner'],
    });

    expect(result.facts).toHaveLength(3);
    expect(result.entities).toEqual(['npc.barley', 'location.kitchen']);
    expect(result.gaps).toEqual(['missing tavern owner']);
  });

  it('groups large factpacks into bounded chunks', () => {
    const result = groupWorkflowFacts({
      facts: [
        {
          chunk_id: 'a',
          text: 'x'.repeat(60),
          entity_id: 'npc.a',
          entity_name: 'A',
          entity_type: 'npc',
          region: 'north',
        },
        {
          chunk_id: 'b',
          text: 'y'.repeat(60),
          entity_id: 'npc.b',
          entity_name: 'B',
          entity_type: 'npc',
          region: 'north',
        },
        {
          chunk_id: 'c',
          text: 'z'.repeat(60),
          entity_id: 'item.c',
          entity_name: 'C',
          entity_type: 'item',
          region: 'south',
        },
      ],
      entities: ['npc.a', 'npc.b', 'item.c'],
      gaps: [],
    }, 80);

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((group) => group.characterCount <= 80)).toBe(true);
  });

  it('formats canon facts consistently for prompts', () => {
    expect(formatWorkflowCanonFacts(sampleFactpack)).toBe(
      '[Barley] Barley is a halfling warlock chef.\n\n[Barley] Barley serves a marid patron.',
    );
  });
});
