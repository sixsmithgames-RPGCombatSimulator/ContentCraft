import { describe, expect, it } from 'vitest';

import {
  buildActorStagePacket,
  composeActorProfile,
  validateActorProfile,
} from './actorEnsureWorkflow.js';

describe('actor ensure workflow contract', () => {
  it('composes modular NPC stages into the canonical NPC schema', () => {
    const profile: any = composeActorProfile('npc', { name: 'Captain Mira Vale', aliases: ['Mira'] }, {
      basic_info: {
        name: 'Captain Mira Vale',
        description: 'A disciplined harbor officer whose calm attention rarely leaves the waterline.',
        appearance: 'Weathered blue coat, close-cropped hair, and a brass watch badge.',
        background: 'She rose through dock patrols by protecting witnesses from corrupt merchants.',
        species: 'Human',
        alignment: 'Lawful Good',
        class_levels: [{ class: 'Fighter', level: 5 }],
      },
      core_details: {
        personality_traits: ['Calm under pressure'], ideals: ['Public trust'], bonds: ['The harbor watch'], flaws: ['Takes too much responsibility'],
        goals: ['End the smuggling route'], fears: ['Losing another witness'], quirks: ['Checks every exit'], voice_mannerisms: ['Uses short declarative sentences'], hooks: ['Needs a discreet scout'],
      },
      stats: {
        size: 'Medium', ability_scores: { str: 15, dex: 13, con: 14, int: 12, wis: 14, cha: 13 },
        proficiency_bonus: 3, speed: 30, armor_class: 16, hit_points: 38, hit_dice: '5d10+10', senses: ['passive Perception 14'],
      },
      character_build: {
        class_features: [{ name: 'Second Wind', description: 'Regains a small amount of stamina.' }], subclass_features: [], racial_features: [], feats: [], fighting_styles: [], skill_proficiencies: [], saving_throws: [],
      },
      combat: { actions: [{ name: 'Watch Sabre', description: 'Melee weapon attack.' }], bonus_actions: [], reactions: [] },
      spellcasting: { spellcasting_ability: 'none', spell_save_dc: 0, spell_attack_bonus: 0 },
      legendary: {},
      relationships: { allies: ['Kerrigan Brynn'], enemies: ['The Below Route'], organizations: ['Harbor Watch'] },
      equipment: { weapons: ['Watch sabre'], armor_and_shields: ['Breastplate'], wondrous_items: [], consumables: [], other_gear: ['Manacles'] },
    });

    const validation = validateActorProfile('npc', profile);
    expect(validation.valid).toBe(true);
    expect(profile.personality.traits).toEqual(['Calm under pressure']);
    expect(profile.motivations).toEqual(['End the smuggling route']);
    expect(profile.equipment).toEqual(['Watch sabre', 'Breastplate', 'Manacles']);
    expect(profile.relationships[0]).toEqual({ entity: 'Kerrigan Brynn', relationship: 'ally' });
    expect(profile.spellcasting).toBeUndefined();
  });

  it('composes and strictly validates a monster profile', () => {
    const profile: any = composeActorProfile('monster', {}, {
      'monster.basic_info': {
        name: 'Tide Hunter',
        description: 'A patient amphibious predator that stalks flooded tunnels beneath the harbor.',
        size: 'Large', creature_type: 'Monstrosity', alignment: 'Unaligned', challenge_rating: '3',
      },
      'monster.stats': {
        ability_scores: { str: 17, dex: 14, con: 15, int: 6, wis: 13, cha: 8 }, armor_class: 15,
        hit_points: { average: 52, formula: '7d10+14' }, proficiency_bonus: 2, speed: { walk: '30 ft.', swim: '40 ft.' },
        saving_throws: [], skill_proficiencies: [], damage_vulnerabilities: [], damage_resistances: ['cold'], damage_immunities: [], condition_immunities: [], senses: ['darkvision 60 ft.'], languages: [],
      },
      'monster.combat': { abilities: [{ name: 'Amphibious', description: 'The hunter can breathe air and water.' }], actions: [{ name: 'Bite', description: 'Melee weapon attack.' }], bonus_actions: [], reactions: [], tactics: 'Ambushes isolated prey.' },
      'monster.legendary': { lair_actions: [], regional_effects: [] },
      'monster.lore': { ecology: 'Flooded tunnels and coastal caves.', lore: 'Dockworkers mistake its tracks for drag marks.', notes: [], sources: [] },
    });

    expect(validateActorProfile('monster', profile).valid).toBe(true);
    expect(profile.hit_points).toEqual({ average: 52, formula: '7d10+14' });
    expect(profile.actions[0].name).toBe('Bite');
  });

  it('builds a human-readable first-stage packet from the registered workflow', () => {
    const packet = buildActorStagePacket({
      _id: 'workflow-1', userId: 'user-1', campaignId: 'campaign-1', kind: 'monster', normalizedName: 'tide hunter',
      purpose: 'Prepare a reusable campaign threat.', actorSnapshot: { name: 'Tide Hunter' }, identityHints: { name: 'Tide Hunter', aliases: [] },
      executionMode: 'manual', status: 'awaiting_ai', stageSequence: ['monster.basic_info', 'monster.stats', 'monster.combat', 'monster.legendary', 'monster.lore'],
      currentStageIndex: 0, stageResults: {}, attempts: [], createdAt: new Date(), updatedAt: new Date(),
    } as any);

    expect(packet?.stage).toEqual({ key: 'monster.basic_info', label: 'Basic Info', number: 1, total: 5 });
    expect(packet?.contract.requiredKeys).toContain('challenge_rating');
    expect(packet?.returnSchema.stageKey).toBe('monster.basic_info');
  });
});
