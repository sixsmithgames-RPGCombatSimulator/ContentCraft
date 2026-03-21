import { describe, expect, it } from 'vitest';
import { repairWorkflowStagePayload } from './workflowStageRepair';
import { validateWorkflowStageContractPayload } from './workflowStageValidation';

describe('workflowStageRepair', () => {
  it('repairs malformed planner payloads into contract-compliant shape', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'planner',
      workflowType: 'npc',
      payload: {
        deliverable: 'npc',
        retrieval_hints: 'Tiefling rogue assassin',
        proposals: { id: 'origin', question: 'Choose an origin?' },
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      },
    });

    expect(repaired.contractKey).toBe('planner');
    expect(repaired.payload).toMatchObject({
      deliverable: 'npc',
      retrieval_hints: {
        entities: [],
        regions: [],
        eras: [],
        keywords: ['Tiefling rogue assassin'],
      },
      proposals: [{ id: 'origin', question: 'Choose an origin?' }],
      flags_echo: {
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      },
    });

    expect(validateWorkflowStageContractPayload('planner', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('infers npc species and race for basic info responses from user prompt context', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'basic_info',
      workflowType: 'npc',
      payload: {
        name: 'Thyra Odinson',
        description: 'A stern celestial knight sworn to defend sacred frontiers.',
        appearance: 'Moonlit armor and an unflinching gaze mark her presence.',
        background: 'She patrols the Tears of Selune in service to her oath.',
        alignment: 'Lawful Good',
        class_levels: [{ class: 'Paladin', level: 11 }],
      },
      configPrompt: 'Create an 11th level aasismar paladin named Thyra Odinson.',
    });

    expect(repaired.payload.species).toBe('Aasimar');
    expect(repaired.payload.race).toBe('Aasimar');
  });

  it('normalizes stats speed values into schema-safe strings', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'stats',
      workflowType: 'npc',
      payload: {
        size: 'Medium',
        ability_scores: { str: 10, dex: 18, con: 12, int: 13, wis: 11, cha: 14 },
        proficiency_bonus: 3,
        speed: { walk: 30, climb: '20 ft.' },
        armor_class: 15,
        hit_points: 38,
        hit_dice: '13d8',
        senses: [],
      },
    });

    expect(repaired.payload.speed).toEqual({
      walk: '30 ft.',
      climb: '20 ft.',
    });
    expect(validateWorkflowStageContractPayload('stats', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('normalizes mixed-form stats ability scores and prefers non-placeholder values', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'stats',
      workflowType: 'npc',
      payload: {
        size: 'Medium',
        ability_scores: {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
          strength: 18,
          dexterity: 16,
          constitution: 14,
          intelligence: 12,
          wisdom: 11,
          charisma: 13,
        },
        proficiency_bonus: 3,
        speed: { walk: 30 },
        armor_class: 16,
        hit_points: 45,
        hit_dice: '8d8',
        senses: ['darkvision 60 ft.'],
      },
    });

    expect(repaired.payload.ability_scores).toEqual({
      str: 18,
      dex: 16,
      con: 14,
      int: 12,
      wis: 11,
      cha: 13,
    });
    expect(repaired.appliedRepairs).toContain('stats:normalize_ability_scores');
    expect(validateWorkflowStageContractPayload('stats', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('derives stats hit_dice from hit_points formulas when the explicit field is omitted', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'stats',
      workflowType: 'npc',
      payload: {
        size: 'Medium',
        ability_scores: { str: 10, dex: 18, con: 12, int: 13, wis: 11, cha: 14 },
        proficiency_bonus: 3,
        speed: { walk: 30 },
        armor_class: 15,
        hit_points: { average: 38, formula: '7d8 + 7' },
        senses: ['darkvision 60 ft.'],
      },
    });

    expect(repaired.payload.hit_dice).toBe('7d8');
    expect(repaired.appliedRepairs).toContain('stats:derive_hit_dice');
    expect(validateWorkflowStageContractPayload('stats', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('repairs malformed character build feature arrays into schema-safe object arrays', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: ['Extra Attack: You can attack twice, instead of once, whenever you take the Attack action on your turn.', { name: 'Action Surge', description: 'Take one additional action on your turn, once per short or long rest.', level: '2', source: 'Fighter' }],
        subclass_features: [{ title: 'Improved Critical', details: 'Critical hit on 19-20.', level: 3, subclass: 'Champion' }],
        racial_features: ['Darkvision: You can see in dim light within 120 feet as if it were bright light, and in darkness as if it were dim light.'],
        feats: ['Alert: Gain +5 to initiative, and you cannot be surprised while conscious.'],
        fighting_styles: ['Defense: While you are wearing armor, you gain a +1 bonus to Armor Class.'],
        skill_proficiencies: ['Athletics'],
        saving_throws: [{ save: 'Strength', modifier: '+7' }],
      },
    });

    expect(repaired.payload.class_features).toEqual([
      { name: 'Extra Attack', description: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.' },
      { name: 'Action Surge', description: 'Take one additional action on your turn, once per short or long rest.', level: 2, source: 'Fighter' },
    ]);
    expect(repaired.payload.feats).toEqual([{ name: 'Alert', description: 'Gain +5 to initiative, and you cannot be surprised while conscious.' }]);
    expect(repaired.payload.skill_proficiencies).toEqual([{ name: 'Athletics', value: '+0' }]);
    expect(validateWorkflowStageContractPayload('character_build', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('rejects placeholder character build descriptions after repair', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: ['Extra Attack'],
        subclass_features: ['Improved Critical'],
        racial_features: ['Darkvision'],
        feats: ['Alert'],
        fighting_styles: ['Defense'],
        skill_proficiencies: ['Athletics +7'],
        saving_throws: ['Strength +7'],
      },
    });

    expect(validateWorkflowStageContractPayload('character_build', repaired.payload, 'npc')).toEqual({
      ok: false,
      error: expect.stringContaining('description repeats the feature name'),
    });
  });

  it('preserves signed modifiers when character build skills and saves arrive as strings', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: ['Pact Magic: You have two spell slots that recharge on a short or long rest.'],
        subclass_features: ['Genie\'s Vessel: You carry a magical vessel that serves as your patron\'s conduit and refuge.'],
        racial_features: ['Lucky: When you roll a 1 on a d20 test, you can reroll the die and use the new roll.'],
        feats: ['Chef: Increase Constitution or Wisdom by 1 and create treats that grant temporary hit points.'],
        fighting_styles: [],
        skill_proficiencies: ['Persuasion +8', 'Stealth +7', 'Survival +5', 'Insight +5'],
        saving_throws: ['Wisdom +5', 'Charisma +8'],
      },
    });

    expect(repaired.payload.skill_proficiencies).toEqual([
      { name: 'Persuasion', value: '+8' },
      { name: 'Stealth', value: '+7' },
      { name: 'Survival', value: '+5' },
      { name: 'Insight', value: '+5' },
    ]);
    expect(repaired.payload.saving_throws).toEqual([
      { name: 'Wisdom', value: '+5' },
      { name: 'Charisma', value: '+8' },
    ]);
    expect(validateWorkflowStageContractPayload('character_build', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('normalizes numeric bonus aliases for character build skills and saves', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: [{ name: 'Sneak Attack', description: 'Once per turn, deal extra damage to a target you hit with advantage or with an adjacent ally.' }],
        subclass_features: [{ name: 'Assassinate', description: 'You gain advantage against creatures that have not acted yet, and hits against surprised creatures are critical hits.' }],
        racial_features: [{ name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' }],
        feats: [{ name: 'Alert', description: 'Gain +5 to initiative, and you cannot be surprised while conscious.' }],
        fighting_styles: [],
        skill_proficiencies: [
          { skill: 'Stealth', bonus: 8 },
          { name: 'Perception', modifier: 4 },
        ],
        saving_throws: [
          { ability: 'Dexterity', bonus: 8 },
          { save: 'Intelligence', modifier: 4 },
        ],
      },
    });

    expect(repaired.payload.skill_proficiencies).toEqual([
      { name: 'Stealth', value: '+8' },
      { name: 'Perception', value: '+4' },
    ]);
    expect(repaired.payload.saving_throws).toEqual([
      { name: 'Dexterity', value: '+8' },
      { name: 'Intelligence', value: '+4' },
    ]);
    expect(validateWorkflowStageContractPayload('character_build', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('normalizes spellcasting arrays and slot strings into contract-compliant maps', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'spellcasting',
      workflowType: 'npc',
      payload: {
        spellcasting_ability: 'Charisma',
        spell_save_dc: 16,
        spell_attack_bonus: 8,
        spell_slots: '3 slots at 5th Level',
        spells_known: {
          Cantrips: ['Eldritch Blast'],
          '1st-3rd': ['Fog Cloud', 'Misty Step'],
          MysticArcanum: 'Conjure Elemental',
        },
        always_prepared_spells: ['Fog Cloud', 'Blur'],
        innate_spells: ['Conjure Elemental (1/Day via Mystic Arcanum)'],
      },
    });

    expect(repaired.payload.spell_slots).toEqual({ '5': 3 });
    expect(repaired.payload.spells_known).toEqual([
      'Eldritch Blast',
      'Fog Cloud',
      'Misty Step',
      'Conjure Elemental',
    ]);
    expect(repaired.payload.always_prepared_spells).toEqual({
      always: ['Fog Cloud', 'Blur'],
    });
    expect(repaired.payload.innate_spells).toEqual({
      special: ['Conjure Elemental (1/Day via Mystic Arcanum)'],
    });
    expect(validateWorkflowStageContractPayload('spellcasting', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('normalizes legacy scene creator payloads into the live scene schema shape', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'creator',
      workflowType: 'scene',
      payload: {
        title: 'Lantern Watch in the Storm',
        description: 'The storm batters the watchtower as the harbor bells begin to ring.',
        scene_type: 'roleplay',
        setting: {
          location: 'Lantern Watchtower',
          atmosphere: 'Rain hisses across the slate roof while signal braziers gutter in the wind.',
          sensory_details: {
            sights: ['Blue-white lightning forks above the harbor.'],
            sounds: ['Warning bells clash with the surf.'],
            smells: ['Salt spray and wet ash cling to the air.'],
          },
        },
        npcs_present: [{
          name: 'Captain Mira Vale',
          role: 'watch commander',
          goals: ['Warn the harbor before the cult flotilla slips inside the chain.'],
          disposition: 'friendly',
        }],
        hooks: ['Warn the harbor before the cult flotilla slips inside the chain.'],
        skill_checks: [{
          skill: 'Investigation',
          dc: 15,
          purpose: 'Find the altered signal code before the next warning lamp is lit.',
          success_result: 'The party exposes the cult route across the shoals.',
          failure_result: 'A false signal sends defenders to the wrong pier.',
        }],
        clues_information: ['The lantern code was changed from inside the tower less than an hour ago.'],
        narration: {
          opening: 'Captain Mira meets the party at the stairwell landing with seawater streaming from her cloak.',
          gm_secrets: ['A second cult cell is hiding in the flooded cistern beneath the tower.'],
        },
        transitions: {
          from_previous: 'The party arrives just as the abbey road vanishes behind a curtain of rain.',
          to_next: ['A pursuit spills into the flooded lower docks.'],
        },
      },
    });

    expect(repaired.payload).toMatchObject({
      title: 'Lantern Watch in the Storm',
      scene_type: 'social',
      location: {
        name: 'Lantern Watchtower',
        description: 'Rain hisses across the slate roof while signal braziers gutter in the wind.',
        ambiance: 'Rain hisses across the slate roof while signal braziers gutter in the wind.',
        sensory_details: {
          sights: ['Blue-white lightning forks above the harbor.'],
          sounds: ['Warning bells clash with the surf.'],
          smells: ['Salt spray and wet ash cling to the air.'],
        },
      },
      participants: [{
        name: 'Captain Mira Vale',
        role: 'watch commander',
        goals: ['Warn the harbor before the cult flotilla slips inside the chain.'],
        disposition: 'friendly',
      }],
      objectives: ['Warn the harbor before the cult flotilla slips inside the chain.'],
      hooks: ['Warn the harbor before the cult flotilla slips inside the chain.'],
      skill_challenges: [{
        description: 'Find the altered signal code before the next warning lamp is lit.',
        suggested_skills: ['Investigation'],
        dc: 15,
        consequences: {
          success: 'The party exposes the cult route across the shoals.',
          failure: 'A false signal sends defenders to the wrong pier.',
        },
      }],
      discoveries: ['The lantern code was changed from inside the tower less than an hour ago.'],
      transitions: {
        entry: 'The party arrives just as the abbey road vanishes behind a curtain of rain.',
        exit: 'A pursuit spills into the flooded lower docks.',
      },
      gm_notes: 'A second cult cell is hiding in the flooded cistern beneath the tower.',
    });
    expect(typeof repaired.payload.description).toBe('string');
    expect((repaired.payload.description as string).length).toBeGreaterThanOrEqual(100);
    expect(repaired.payload).not.toHaveProperty('setting');
    expect(repaired.payload).not.toHaveProperty('npcs_present');
    expect(repaired.payload).not.toHaveProperty('skill_checks');
    expect(repaired.payload).not.toHaveProperty('clues_information');
  });

  it('does not duplicate scene description fragments that are already present inline', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'creator',
      workflowType: 'scene',
      payload: {
        title: 'The Ash-Choked Truce',
        description: 'Nasir and Karoz stagger beneath the shattered archway. A precarious ruin of ancient masonry located in a desolate, wind-swept canyon where the earth itself seems to be rejecting the presence of the living. Hooks: The ground begins to liquefy beneath them, forcing a physical proximity neither wants. Objectives: Navigate the collapsing ruins to safety. Discoveries: Their survival is briefly tethered to the other\'s cooperation.',
        scene_type: 'cutscene',
        location: {
          name: 'The Shattered Archway',
          description: 'A precarious ruin of ancient masonry located in a desolate, wind-swept canyon where the earth itself seems to be rejecting the presence of the living.',
        },
        hooks: ['The ground begins to liquefy beneath them, forcing a physical proximity neither wants.'],
        objectives: ['Navigate the collapsing ruins to safety.'],
        discoveries: ['Their survival is briefly tethered to the other\'s cooperation.'],
      },
    });

    const description = String(repaired.payload.description ?? '');
    expect(description.match(/A precarious ruin of ancient masonry/gi)?.length ?? 0).toBe(1);
    expect(description.match(/Hooks:/g)?.length ?? 0).toBe(1);
    expect(description.match(/Objectives:/g)?.length ?? 0).toBe(1);
    expect(description.match(/Discoveries:/g)?.length ?? 0).toBe(1);
  });

  it('normalizes story arc secrets payloads into the live contract shape', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'story_arc.secrets',
      workflowType: 'story_arc',
      payload: {
        clues_and_secrets: [{
          revelation: 'Karoz\'s order once protected the same Drow enclave they now hunt.',
          discovery_methods: ['interrogate a veteran', 'inspect the chapel records'],
          consequence: 'Nasir realizes the feud is based on a falsified betrayal.',
        }],
        rewards: ['A sealed dossier naming the real conspirator'],
        dm_notes: ['Let the reveal land after a costly compromise.'],
      },
    });

    expect(repaired.payload).toEqual({
      clues_and_secrets: [{
        secret: 'Karoz\'s order once protected the same Drow enclave they now hunt.',
        discovery_method: 'interrogate a veteran; inspect the chapel records',
        impact: 'Nasir realizes the feud is based on a falsified betrayal.',
      }],
      rewards: [{
        name: 'A sealed dossier naming the real conspirator',
        type: 'information',
        when: 'At a pivotal story milestone',
      }],
      dm_notes: ['Let the reveal land after a costly compromise.'],
    });
    expect(validateWorkflowStageContractPayload('story_arc.secrets', repaired.payload, 'story_arc')).toEqual({ ok: true });
  });
});
