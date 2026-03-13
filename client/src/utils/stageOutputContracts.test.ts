import { describe, expect, it } from 'vitest';
import { getStageContract, validateStageOutput } from './stageOutputContracts';

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

  it('validates monster combat stages through the shared workflow registry', () => {
    const result = validateStageOutput('monster.combat', {
      abilities: [{ name: 'Pack Tactics', description: 'Advantage near allies.' }],
      actions: [{ name: 'Bite', description: 'Melee Weapon Attack.' }],
      bonus_actions: [],
      reactions: [],
      tactics: 'Prefers to flank isolated targets.',
    });

    expect(result).toEqual({ ok: true });
  });

  it('validates item mechanics stages through the shared workflow registry', () => {
    const result = validateStageOutput('item.mechanics', {
      properties: [
        {
          name: 'Tidal Surge',
          description: 'The wielder can release a wave of force.',
          activation: 'action',
        },
      ],
      spells: [],
      charges: { maximum: 3, recharge: 'regains 1d3 charges at dawn' },
    });

    expect(result).toEqual({ ok: true });
  });

  it('validates encounter concept stages through the shared workflow registry', () => {
    const result = validateStageOutput('encounter.concept', {
      title: 'Ambush at the Fallen Bridge',
      description: 'Bandits and a mage pin the party on a collapsing span.',
      encounter_type: 'combat',
      difficulty_tier: 'hard',
      party_level: 6,
      party_size: 4,
      xp_budget: 1800,
      objectives: ['Defeat the raiders', 'Secure the caravan'],
      failure_conditions: ['The caravan falls into the gorge'],
      location: 'Northbridge Pass',
      setting_context: 'The trade route has become a choke point for raiders.',
    });

    expect(result).toEqual({ ok: true });
  });

  it('resolves ambiguous concept aliases using the workflow type', () => {
    const contract = getStageContract('concept', 'encounter');

    expect(contract?.allowedKeys).toEqual(
      expect.arrayContaining(['title', 'description', 'encounter_type', 'xp_budget']),
    );
    expect(contract?.allowedKeys).not.toContain('item_type');
  });

  it('validates story arc structure stages through the shared workflow registry', () => {
    const result = validateStageOutput('story_arc.structure', {
      acts: [{ name: 'Act 1', summary: 'The threat emerges.' }],
      beats: [{ name: 'First Omen', description: 'The sky fractures.', act: 'Act 1', type: 'revelation', required: true }],
      branching_paths: [],
      known_barriers: ['The duke refuses aid'],
      unknown_barriers: ['A hidden cult is guiding the crisis'],
    });

    expect(result).toEqual({ ok: true });
  });
});
