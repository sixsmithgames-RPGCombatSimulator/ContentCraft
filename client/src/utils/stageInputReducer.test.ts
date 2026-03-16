import { describe, expect, it } from 'vitest';
import { reduceStageInputs } from './stageInputReducer';

describe('stageInputReducer', () => {
  it('includes basic identity and class context for spellcasting stages', () => {
    const reduced = reduceStageInputs('spellcasting', {
      'creator:_basic_info': {
        name: 'Barley',
        race: 'Halfling',
        background: 'Chef',
        class_levels: [{ class: 'Warlock', level: 11, subclass: 'Archfey' }],
      },
      'creator:_stats': {
        ability_scores: {
          str: 8,
          dex: 14,
          con: 12,
          int: 10,
          wis: 13,
          cha: 18,
        },
        proficiency_bonus: 4,
      },
      'creator:_character_build': {
        class_features: ['Pact Magic'],
        subclass_features: ['Misty Escape'],
        racial_features: ['Brave'],
        feats: ['Fey Touched'],
      },
    });

    expect(reduced).toEqual({
      name: 'Barley',
      race: 'Halfling',
      background: 'Chef',
      class_levels: [{ class: 'Warlock', level: 11, subclass: 'Archfey' }],
      ability_scores: {
        str: 8,
        dex: 14,
        con: 12,
        int: 10,
        wis: 13,
        cha: 18,
      },
      proficiency_bonus: 4,
      class_features: ['Pact Magic'],
      subclass_features: ['Misty Escape'],
      racial_features: ['Brave'],
      feats: ['Fey Touched'],
    });
  });
});
