import { describe, expect, it } from 'vitest';
import {
  normalizeGeneratedContentTypeToken,
  resolveGeneratedContentType,
} from './generatedContentType';

describe('generatedContentType', () => {
  it('normalizes common deliverable aliases to canonical content types', () => {
    expect(normalizeGeneratedContentTypeToken('story_arc')).toBe('story-arc');
    expect(normalizeGeneratedContentTypeToken('Story Arc')).toBe('story-arc');
    expect(normalizeGeneratedContentTypeToken('npc')).toBe('character');
    expect(normalizeGeneratedContentTypeToken('creature')).toBe('monster');
  });

  it('keeps story arcs classified as story arcs even when they include characters', () => {
    expect(
      resolveGeneratedContentType({
        contentType: 'character',
        deliverable: 'story_arc',
        generatedContent: {
          title: 'The Shadowed Rivalry',
          synopsis: 'Two rivals race toward the same forbidden relic.',
          acts: ['Act I', 'Act II'],
          beats: ['Opening omen', 'Final confrontation'],
          characters: [{ name: 'Rival A' }, { name: 'Rival B' }],
        },
      }),
    ).toBe('story-arc');
  });

  it('prefers strong story-arc structure over a stale character content type hint', () => {
    expect(
      resolveGeneratedContentType({
        contentType: 'character',
        generatedContent: {
          title: 'The Shadowed Rivalry',
          synopsis: 'A dangerous feud ignites.',
          acts: ['Act I'],
          central_conflict: { antagonist: 'The shadow broker' },
          characters: [{ name: 'Thyra' }],
        },
      }),
    ).toBe('story-arc');
  });

  it('does not classify content as a character just because it has a characters array', () => {
    expect(
      resolveGeneratedContentType({
        generatedContent: {
          title: 'Campaign Threads',
          characters: [{ name: 'Barley' }],
        },
      }),
    ).toBe('text');
  });

  it('classifies strong npc and monster structures correctly', () => {
    expect(
      resolveGeneratedContentType({
        generatedContent: {
          name: 'Thyra Odinson',
          race: 'Aasimar',
          class_levels: [{ class: 'Paladin', level: 11 }],
          ability_scores: { str: 18, dex: 10, con: 16, int: 10, wis: 12, cha: 18 },
          armor_class: 20,
        },
      }),
    ).toBe('character');

    expect(
      resolveGeneratedContentType({
        contentType: 'character',
        deliverable: 'monster',
        generatedContent: {
          name: 'Tempest Hydra',
          creature_type: 'monstrosity',
          challenge_rating: '10',
          armor_class: 17,
          hit_points: { average: 172 },
          actions: [{ name: 'Storm Bite' }],
        },
      }),
    ).toBe('monster');
  });
});
