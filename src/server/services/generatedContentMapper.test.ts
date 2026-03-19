import { describe, expect, it } from 'vitest';
import { ContentType } from '../../shared/types/index.js';
import { mapGeneratedContentToContentBlock } from './generatedContentMapper.js';

describe('generatedContentMapper', () => {
  it('maps story-arc payloads as story arcs even when a stale character content type is passed in', () => {
    const result = mapGeneratedContentToContentBlock({
      contentType: 'character',
      deliverable: 'story_arc',
      title: 'The Shadowed Rivalry',
      generatedContent: {
        title: 'The Shadowed Rivalry',
        synopsis: 'A long feud is about to ignite.',
        acts: [
          {
            name: 'Act I',
            summary: 'The opening move.',
            key_events: ['A warning arrives.'],
            locations: ['Moonlit Keep'],
            climax: 'The rivals collide.',
            transition: 'The relic is revealed.',
          },
        ],
        beats: [
          {
            name: 'Opening omen',
            description: 'An omen marks the rivalry as dangerous.',
            act: 'Act I',
            type: 'setup',
            required: true,
          },
        ],
        characters: [
          {
            name: 'Thyra Odinson',
            role: 'Champion',
            description: 'A determined rival.',
            motivation: { purpose: 'Protect the realm', reason: 'A sworn vow' },
            goals: [{ target: 'The relic', achievement: 'Secure it first' }],
            known_barriers: ['Political enemies'],
            unknown_barriers: ['Shadow corruption'],
            arc: 'Learns to trust allies.',
            first_appearance: 'Moonlit Keep',
          },
        ],
      },
    });

    expect(result.type).toBe(ContentType.STORY_ARC);
    expect(result.metadata.structuredContent?.type).toBe('story-arc');
    expect(result.title).toBe('The Shadowed Rivalry');
  });

  it('maps monster payloads as monsters even when a legacy character content type is passed in', () => {
    const result = mapGeneratedContentToContentBlock({
      contentType: 'character',
      deliverable: 'monster',
      title: 'Tempest Hydra',
      generatedContent: {
        name: 'Tempest Hydra',
        creature_type: 'monstrosity',
        challenge_rating: '10',
        armor_class: 17,
        hit_points: { average: 172, formula: '15d12 + 75' },
        speed: { walk: 30, swim: 40 },
        ability_scores: { str: 20, dex: 12, con: 20, int: 3, wis: 10, cha: 7 },
        actions: [{ name: 'Storm Bite', description: 'A crackling bite attack.' }],
      },
    });

    expect(result.type).toBe(ContentType.MONSTER);
    expect(result.metadata.structuredContent?.type).toBe('monster');
    expect(result.title).toBe('Tempest Hydra');
  });
});
