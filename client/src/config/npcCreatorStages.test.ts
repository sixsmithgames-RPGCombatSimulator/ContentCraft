import { describe, expect, it } from 'vitest';
import {
  NPC_CREATOR_BASIC_INFO,
  NPC_CREATOR_STATS,
  NPC_CREATOR_EQUIPMENT,
  NPC_CREATOR_SPELLCASTING,
} from './npcCreatorStages';

describe('npc creator stage prompts', () => {
  it('builds basic info prompts with planner canon references through shared scaffolding', () => {
    const prompt = NPC_CREATOR_BASIC_INFO.buildUserPrompt({
      config: {
        prompt: 'Create Barley the halfling warlock.',
        type: 'npc',
        flags: {},
      },
      stageResults: {
        planner: {
          deliverable: 'npc',
          proposals: [],
        },
        purpose: {
          goal: 'Create a memorable ally.',
        },
      },
      factpack: {
        facts: [{ text: 'Halflings of the Moonshae Isles love hearth culture.', source: 'canon' }],
      },
      previousDecisions: {
        oath: 'none',
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.original_user_request).toBe('Create Barley the halfling warlock.');
    expect(parsed.brief).toEqual({
      deliverable: 'npc',
    });
    expect(parsed.purpose).toEqual({
      goal: 'Create a memorable ally.',
    });
    expect(parsed.canon_reference).toContain('Planner stage');
    expect(parsed.previous_decisions).toEqual({
      oath: 'none',
    });
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'Halflings of the Moonshae Isles love hearth culture.', source: 'canon' }],
    });
  });

  it('builds equipment prompts with structured canon facts when planner is absent', () => {
    const prompt = NPC_CREATOR_EQUIPMENT.buildUserPrompt({
      config: {
        prompt: 'Create Barley the halfling warlock.',
        type: 'npc',
        flags: {},
      },
      stageResults: {
        'creator:_basic_info': {
          name: 'Barley',
          species: 'Halfling',
          class_levels: [{ class: 'Warlock', level: 11 }],
          background: 'Chef',
        },
        'creator:_stats': {
          proficiency_bonus: 4,
          armor_class: 15,
        },
        'creator:_character_build': {
          skill_proficiencies: [{ name: 'Persuasion', value: '+8' }],
          fighting_styles: [],
        },
      },
      factpack: {
        facts: [{ text: 'Rods of the Pact Keeper are prized by pact-bound warlocks.', source: 'canon' }],
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.name).toBe('Barley');
    expect(parsed.species).toBe('Halfling');
    expect(parsed.proficiency_bonus).toBe(4);
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'Rods of the Pact Keeper are prized by pact-bound warlocks.', source: 'canon' }],
    });
  });

  it('keeps spellcasting fallback instructions aligned with spell-list requirements', () => {
    expect(NPC_CREATOR_SPELLCASTING.systemPrompt).toContain('Include at least one populated spell list');
    expect(NPC_CREATOR_SPELLCASTING.systemPrompt).toContain('Known casters such as warlocks must include spells_known.');
    expect(NPC_CREATOR_SPELLCASTING.systemPrompt).toContain('If the NPC is a slot-based caster, include spell_slots with at least one slot.');
  });

  it('passes explicit request ability scores into the stats stage when the user supplied a structured brief', () => {
    const prompt = NPC_CREATOR_STATS.buildUserPrompt({
      config: {
        prompt: `Structured brief:
name: Fiblan
level: 10
class: Wizard
race: Human
abilities:
  strength: 8
  dexterity: 14
  constitution: 15
  intelligence: 16
  wisdom: 12
  charisma: 10`,
        type: 'npc',
        flags: { rule_base: '2024RAW' },
      },
      stageResults: {
        'creator:_basic_info': {
          name: 'Fiblan',
          species: 'Human',
          class_levels: 'Wizard 10',
        },
      },
      factpack: null,
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.requested_ability_scores).toEqual({
      str: 8,
      dex: 14,
      con: 15,
      int: 16,
      wis: 12,
      cha: 10,
    });
    expect(parsed.requested_class_levels).toEqual([{ class: 'Wizard', level: 10 }]);
  });

  it('uses full-caster spell inputs for wizard requests instead of half-caster defaults', () => {
    const prompt = NPC_CREATOR_SPELLCASTING.buildUserPrompt({
      config: {
        prompt: `Structured brief:
name: Fiblan
level: 10
class: Wizard
race: Human
abilities:
  intelligence: 16`,
        type: 'npc',
        flags: { rule_base: '2024RAW' },
      },
      stageResults: {
        'creator:_basic_info': {
          name: 'Fiblan',
          species: 'Human',
          class_levels: 'Wizard 10',
        },
        'creator:_stats': {
          ability_scores: { str: 8, dex: 14, con: 15, int: 16, wis: 12, cha: 10 },
          proficiency_bonus: 4,
        },
      },
      factpack: null,
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.class_name).toBe('Wizard');
    expect(parsed.caster_type).toBe('prepared_full_caster');
    expect(parsed.derived).toMatchObject({
      spell_save_dc: 15,
      spell_attack_bonus: 7,
      slot_progression: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
    });
  });
});
