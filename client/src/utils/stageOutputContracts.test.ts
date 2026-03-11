import { describe, expect, it } from 'vitest';
import { validateStageOutput } from './stageOutputContracts';

describe('validateStageOutput', () => {
  it('allows optional character build arrays to be empty', () => {
    const result = validateStageOutput('characterBuild', {
      class_features: [{ name: 'Pact Magic', level: 1, description: 'Warlock spell slots.', source: 'PHB 2024' }],
      subclass_features: [{ name: 'Genie\'s Vessel', level: 1, description: 'Bound to a vessel.', source: 'TCoE' }],
      racial_features: [{ name: 'Lucky', description: 'Reroll natural 1s.', source: 'PHB 2024' }],
      feats: [],
      fighting_styles: [],
      skill_proficiencies: [{ name: 'Persuasion', value: '+9' }],
      saving_throws: [{ name: 'Charisma', value: '+9' }],
    });

    expect(result).toEqual({ ok: true });
  });

  it('allows empty combat bonus actions and reactions when actions are present', () => {
    const result = validateStageOutput('combat', {
      actions: [{ name: 'Eldritch Blast', description: 'Ranged spell attack.' }],
      bonus_actions: [],
      reactions: [],
    });

    expect(result).toEqual({ ok: true });
  });

  it('still rejects empty core detail arrays', () => {
    const result = validateStageOutput('coreDetails', {
      personality_traits: [],
      ideals: ['Freedom'],
      bonds: ['My patron'],
      flaws: ['Reckless'],
      goals: ['Find rare ingredients'],
      fears: ['Drying out'],
      quirks: ['Talks to soup'],
      voice_mannerisms: ['Bubbling laugh'],
      hooks: ['Needs a kraken spice'],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('personality_traits');
  });
});
