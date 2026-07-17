import { describe, expect, it } from 'vitest';

import {
  buildActorStagePacket,
  composeCombatReadyActorProfile,
  composeActorProfile,
  parseActorStageResult,
  validateCombatReadyActorProfile,
  validateActorProfile,
} from './actorEnsureWorkflow.js';

describe('actor ensure workflow contract', () => {
  it('builds a lightweight combat-ready NPC without requiring narrative workflow fields', () => {
    const profile: any = composeCombatReadyActorProfile('npc', {
      name: 'Dock Thug 2', role: 'Cart escort', disposition: 'hostile',
      hitPoints: { current: 16, max: 16 }, armorClass: 13, speed: 30, initiativeModifier: 1,
      abilities: { str: 13, dex: 12, con: 12, int: 9, wis: 10, cha: 8 },
      equipment: { weapons: ['Club'], armor: ['Leather armor'] },
      actions: [{ name: 'Club', attackBonus: 3, damage: [{ dice: '1d4', bonus: 1, type: 'bludgeoning' }] }],
      carriedInventory: { equipped: ['Club'], coin: { gp: 2 }, documents: [], concealedItems: [] },
    });

    expect(validateCombatReadyActorProfile('npc', profile).valid).toBe(true);
    expect(profile.hitPoints).toEqual({ current: 16, max: 16 });
    expect(profile.armor_class).toBe(13);
    expect(profile.profile_detail).toBe('combat_ready');
    expect(profile.ability_scores.str).toBe(13);
    expect(profile.equipment.weapons).toEqual(['Club']);
    expect(profile.actions[0].attackBonus).toBe(3);
    expect(profile.carriedInventory.coin.gp).toBe(2);
  });

  it('rejects a combat-ready shell that cannot take an executable action', () => {
    const validation = validateCombatReadyActorProfile('npc', {
      name: 'Unfinished Guard', hitPoints: 12, armorClass: 13, actions: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.details).toContain('at least one executable action');
  });

  it('rejects descriptive identity labels, placeholder spells, and unarmed-only Watch fallbacks', () => {
    const descriptive = validateCombatReadyActorProfile('npc', {
      name: 'Narrow-faced Watch ward-reader', role: 'arcane hazard reader',
      hitPoints: 18, armorClass: 12,
      actions: [{ name: 'Spell', type: 'spell', attackBonus: 4, damage: [] }],
    });
    expect(descriptive.valid).toBe(false);
    expect(descriptive.details).toContain('move that text to description');
    expect(descriptive.details).toContain('non-placeholder name');

    const unarmedWatch = validateCombatReadyActorProfile('npc', {
      name: 'Constable Orin Hale', role: 'Watch rear guard', hitPoints: 16, armorClass: 14,
      actions: [{ name: 'Unarmed Strike', type: 'attack', attackBonus: 2, damage: [{ dice: '1d1', type: 'bludgeoning' }] }],
    });
    expect(unarmedWatch.valid).toBe(false);
    expect(unarmedWatch.details).toContain('actual issued weapon or spell actions');
  });

  it('composes modular NPC stages into the canonical NPC schema', () => {
    const profile: any = composeActorProfile('npc', {
      name: 'Captain Mira Vale', aliases: ['Mira'],
      actions: [{ name: 'Watch Sabre', actionId: 'watch-sabre', attackBonus: 5, damage: [{ dice: '1d8', bonus: 3, type: 'slashing' }] }],
      carriedInventory: { equipped: ['Watch sabre', 'Breastplate'], coin: { gp: 12 } },
    }, {
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
    expect(profile.actions[0].attackBonus).toBe(5);
    expect(profile.actions[0].damage[0].dice).toBe('1d8');
    expect(profile.carriedInventory.coin.gp).toBe(12);
    expect(profile.relationships[0]).toEqual({ entity: 'Kerrigan Brynn', relationship: 'ally' });
    expect(profile.spellcasting).toBeUndefined();
  });

  it('repairs string feature and proficiency entries while assembling saved stages', () => {
    const profile: any = composeActorProfile('npc', {
      name: 'Captain Elara Thorne',
      actions: [{ name: 'Watch Sabre', attackBonus: 5, damage: '1d8+3' }],
    }, {
      basic_info: {
        name: 'Captain Elara Thorne',
        description: 'A disciplined harbor Watch captain who protects witnesses and evidence.',
        species: 'Human', alignment: 'Lawful Good',
      },
      stats: {
        ability_scores: { str: 15, dex: 14, con: 14, int: 12, wis: 14, cha: 13 },
        armor_class: 16, hit_points: 38, speed: 30,
      },
      character_build: {
        class_features: ['Fighter 4 martial officer build', 'Second Wind: once per short rest'],
        subclass_features: ['Battle Master Fighter build'],
        racial_features: ['Human adaptability'],
        feats: ['No separate feat beyond an ability score improvement'],
        fighting_styles: ['Dueling'],
        saving_throws: ['Strength (+4)', 'Constitution: +4'],
        skill_proficiencies: ['Athletics', 'Insight (+4)', { name: 'Perception', value: 4 }],
      },
      combat: { actions: [{ name: 'Watch Sabre', description: 'Melee weapon attack.' }], bonus_actions: [], reactions: [] },
      relationships: { allies: [], enemies: [], organizations: ['Harbor Watch'] },
      equipment: { weapons: ['Watch sabre'], armor_and_shields: ['Breastplate'], wondrous_items: [], consumables: [], other_gear: [] },
    });

    expect(validateActorProfile('npc', profile).valid).toBe(true);
    expect(profile.class_features[0]).toEqual(expect.objectContaining({ name: 'Fighter 4 martial officer build' }));
    expect(profile.saving_throws).toEqual([
      expect.objectContaining({ name: 'Strength', value: '+4' }),
      expect.objectContaining({ name: 'Constitution', value: '+4' }),
    ]);
    expect(profile.skill_proficiencies[0]).toEqual({ name: 'Athletics', value: 'proficient' });
    expect(profile.skill_proficiencies[2]).toEqual(expect.objectContaining({ name: 'Perception', value: '+4' }));
  });

  it('repairs the Elowen legacy snapshot shape at the canonical composition boundary', () => {
    const profile: any = composeActorProfile('npc', {
      name: 'Ward-Reader Elowen Rusk',
      description: 'A Watch ward-reader with a narrow face and a careful, analytical manner.',
      abilities: { strength: 8, dexterity: 12, constitution: 12, intelligence: 15, wisdom: 13, charisma: 10 },
      hit_dice: { d6: 1, d8: 2 },
      legendary_actions: [],
      lair_actions: [],
      regional_effects: [],
    }, {
      basic_info: {
        name: 'Ward-Reader Elowen Rusk',
        description: 'A Watch ward-reader with a narrow face and a careful, analytical manner.',
        species: 'Human',
      },
      stats: {
        size: 'Medium',
        ability_scores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 15, wisdom: 13, charisma: 10 },
        proficiency_bonus: 2,
        speed: 30,
        armor_class: 12,
        hit_points: 18,
        hit_dice: { formula: '1d6 + 2d8' },
        senses: { passive_perception: 13, darkvision: 0, special: [] },
      },
      character_build: {
        class_features: [{ name: 'Arcane Training', description: 'Elowen is trained to read active wards.' }],
        subclass_features: [], racial_features: [], feats: [], fighting_styles: [], skill_proficiencies: [], saving_throws: [],
      },
      combat: {
        actions: [{ name: 'Fire Bolt', description: 'Ranged spell attack that deals fire damage.' }],
        bonus_actions: [], reactions: [],
      },
      legendary: { legendary_actions: [], lair_actions: [], regional_effects: [] },
    });

    expect(profile.hit_dice).toBe('1d6+2d8');
    expect(profile.abilities).toEqual([expect.objectContaining({ name: 'Arcane Training' })]);
    expect(profile.legendary_actions).toBeUndefined();
    expect(profile.lair_actions).toBeUndefined();
    expect(profile.regional_effects).toBeUndefined();
    expect(validateActorProfile('npc', profile).valid).toBe(true);
  });

  it('runs actor stage responses through shared repair before strict validation', () => {
    const result: any = parseActorStageResult({
      stageKey: 'stats',
      stageResult: {
        size: 'Medium',
        ability_scores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 15, wisdom: 13, charisma: 10 },
        proficiency_bonus: 2,
        speed: 30,
        armor_class: 12,
        hit_points: 18,
        hit_dice: { formula: '1d6 + 2d8' },
        senses: { passive_perception: 13, darkvision: 0, special: [] },
      },
    }, 'stats');

    expect(result.speed).toEqual({ walk: '30 ft.' });
    expect(result.hit_dice).toBe('1d6+2d8');
    expect(result.ability_scores).toEqual({ str: 8, dex: 12, con: 12, int: 15, wis: 13, cha: 10 });
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

  it('unwraps common assistant envelopes without weakening the active stage contract', () => {
    const result = parseActorStageResult(JSON.stringify({
      responseMode: 'ooc',
      responseText: 'Captain profile stage prepared.',
      actorWorkflowUpdate: {
        stageKey: 'basic_info',
        stageResult: {
          name: 'Captain Elara Thorne',
          description: 'A disciplined harbor Watch captain who protects witnesses and evidence.',
          appearance: 'Weather-dark armor, a close-pinned cloak, and an old brass Watch badge.',
          background: 'Thorne rose through dock patrols while resisting merchant corruption.',
          species: 'Human',
          alignment: 'Lawful Good',
          class_levels: [{ class: 'Fighter', level: 5 }],
        },
      },
    }), 'basic_info');

    expect(result.name).toBe('Captain Elara Thorne');
    expect(result.responseMode).toBeUndefined();
  });

  it('reports exact actor-stage contract diagnostics for a rejected paste', () => {
    expect(() => parseActorStageResult({
      stageKey: 'basic_info',
      stageResult: { name: 'Captain Elara Thorne' },
    }, 'basic_info')).toThrowError(expect.objectContaining({
      code: 'ACTOR_STAGE_INVALID',
      details: expect.objectContaining({
        receivedKeys: ['name'],
        requiredKeys: expect.arrayContaining(['description', 'appearance', 'background', 'class_levels']),
      }),
    }));
  });
});
