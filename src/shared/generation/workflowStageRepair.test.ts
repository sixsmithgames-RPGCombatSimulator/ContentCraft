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
        ability_scores: { str: 10, dex: 18, con: 12, int: 13, wis: 11, cha: 14 },
        proficiency_bonus: 3,
        speed: { walk: 30, climb: '20 ft.' },
        armor_class: 15,
        hit_points: 38,
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

  it('repairs malformed character build feature arrays into schema-safe object arrays', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: ['Extra Attack', { name: 'Action Surge', level: '2', source: 'Fighter' }],
        subclass_features: [{ title: 'Improved Critical', details: 'Critical hit on 19-20.', level: 3, subclass: 'Champion' }],
        racial_features: ['Darkvision'],
        feats: ['Alert'],
        fighting_styles: ['Defense'],
        skill_proficiencies: ['Athletics'],
        saving_throws: [{ save: 'Strength', modifier: '+7' }],
      },
    });

    expect(repaired.payload.class_features).toEqual([
      { name: 'Extra Attack', description: 'Extra Attack' },
      { name: 'Action Surge', description: 'Action Surge', level: 2, source: 'Fighter' },
    ]);
    expect(repaired.payload.feats).toEqual([{ name: 'Alert', description: 'Alert' }]);
    expect(repaired.payload.skill_proficiencies).toEqual([{ name: 'Athletics', value: '+0' }]);
    expect(validateWorkflowStageContractPayload('character_build', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('preserves signed modifiers when character build skills and saves arrive as strings', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'character_build',
      workflowType: 'npc',
      payload: {
        class_features: ['Pact Magic'],
        subclass_features: ['Genie\'s Vessel'],
        racial_features: ['Lucky'],
        feats: ['Chef'],
        fighting_styles: ['None'],
        skill_proficiencies: ['Persuasion +8', 'Stealth +7', 'Survival +5'],
        saving_throws: ['Wisdom +5', 'Charisma +8'],
      },
    });

    expect(repaired.payload.skill_proficiencies).toEqual([
      { name: 'Persuasion', value: '+8' },
      { name: 'Stealth', value: '+7' },
      { name: 'Survival', value: '+5' },
    ]);
    expect(repaired.payload.saving_throws).toEqual([
      { name: 'Wisdom', value: '+5' },
      { name: 'Charisma', value: '+8' },
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
