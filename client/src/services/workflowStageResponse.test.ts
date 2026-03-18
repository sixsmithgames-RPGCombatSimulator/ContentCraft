import { describe, expect, it } from 'vitest';
import {
  inferSpecies,
  parseAndNormalizeWorkflowStageResponse,
} from './workflowStageResponse';

describe('workflowStageResponse', () => {
  it('infers species from fuzzy user prompt text', () => {
    expect(inferSpecies({
      original_user_request: 'Create an 11th level aasismar paladin named Thyra.',
    })).toBe('Aasimar');
  });

  it('normalizes planner output into shared workflow shape', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        deliverable: 'npc',
        retrieval_hints: {
          entities: ['Thyra Odinson', 42],
          keywords: ['Aasimar', 'Paladin'],
          regions: 'Tears of Selune',
        },
        proposals: [{ id: 'oath-choice' }],
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      }),
      stageName: 'Planner',
      stageIdentity: 'planner',
      workflowType: 'npc',
      configFlags: {
        allow_invention: 'grounded',
        tone: 'grim',
        rule_base: '2014RAW',
      },
      stageResults: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed).toMatchObject({
      deliverable: 'npc',
      retrieval_hints: {
        entities: ['Thyra Odinson'],
        keywords: ['Aasimar', 'Paladin'],
        regions: [],
        eras: [],
      },
      proposals: [{ id: 'oath-choice' }],
      flags_echo: {
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      },
    });
  });

  it('repairs malformed planner retrieval hints and proposals before validation', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        deliverable: 'npc',
        retrieval_hints: 'Tiefling rogue assassin',
        proposals: { id: 'origin', question: 'Choose an origin?' },
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      }),
      stageName: 'Planner',
      stageIdentity: 'planner',
      workflowType: 'npc',
      configFlags: {
        allow_invention: 'grounded',
        tone: 'grim',
        rule_base: '2014RAW',
      },
      stageResults: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed).toMatchObject({
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
  });

  it('infers npc basic-info species and prunes forbidden fields', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        name: 'Thyra Odinson',
        description: 'A stern celestial knight sworn to defend sacred frontiers.',
        appearance: 'Moonlit armor and an unflinching gaze mark her presence.',
        background: 'She patrols the Tears of Selune in service to her oath.',
        alignment: 'Lawful Good',
        class_levels: [{ class: 'Paladin', level: 11 }],
        ability_scores: { str: 18 },
      }),
      stageName: 'Creator: Basic Info',
      stageIdentity: 'basic_info',
      workflowType: 'npc',
      configPrompt: 'Create an 11th level aasismar paladin named Thyra Odinson.',
      stageResults: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.contractKey).toBe('basic_info');
    expect(result.parsed.species).toBe('Aasimar');
    expect(result.parsed.race).toBe('Aasimar');
    expect(result.parsed).not.toHaveProperty('ability_scores');
  });

  it('flattens npc core details personality data through the shared normalizer', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        personality: {
          traits: ['Stoic'],
          ideals: ['Duty'],
          bonds: ['Selune'],
          flaws: ['Stubborn'],
          goals: ['Protect the Tears'],
          fears: ['Failing her oath'],
          quirks: ['Counts prayer beads'],
          voice_mannerisms: ['Quiet and deliberate'],
          hooks: ['Needs help cleansing a shrine'],
        },
      }),
      stageName: 'Creator: Core Details',
      stageIdentity: 'core_details',
      workflowType: 'npc',
      configFlags: { tone: 'epic' },
      stageResults: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.contractKey).toBe('core_details');
    expect(result.parsed.personality_traits).toEqual(expect.arrayContaining(['Stoic']));
    expect(result.parsed.ideals).toEqual(expect.arrayContaining(['Duty']));
    expect(result.parsed.voice_mannerisms).toEqual(expect.arrayContaining(['Quiet and deliberate']));
    expect(Array.isArray(result.parsed.hooks)).toBe(true);
    expect((result.parsed.hooks as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect(result.parsed).not.toHaveProperty('personality');
  });

  it('accepts populated relationships returned as string arrays', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        allies: ['The Obsidian Veil inner circle', 'Selûnite clergy members'],
        enemies: ['Rival assassin guilds'],
        organizations: ['The Obsidian Veil', 'Church of Selûne'],
        family: ['Deceased family members (avenged)'],
        contacts: ['Noble house informants'],
      }),
      stageName: 'Creator: Relationships',
      stageIdentity: 'relationships',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Malakor Vane',
          class_levels: 'Rogue (Assassin) 5',
          race: 'Tiefling',
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.allies).toEqual(expect.arrayContaining(['The Obsidian Veil inner circle']));
    expect(result.parsed.organizations).toEqual(expect.arrayContaining(['The Obsidian Veil']));
  });

  it('rejects placeholder npc stats even when ability scores use long-form keys', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        ability_scores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        proficiency_bonus: 3,
        speed: 30,
        armor_class: 15,
        hit_points: 32,
        senses: {
          passive_perception: 10,
        },
      }),
      stageName: 'Creator: Stats',
      stageIdentity: 'stats',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Malakor Vane',
          class_levels: 'Rogue (Assassin) 5',
          race: 'Tiefling',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const failure = result as { ok: false; error: string };

    expect(failure.error).toContain('placeholder defaults');
  });

  it('accepts npc stats when long-form ability scores override placeholder short-form defaults', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
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
      }),
      stageName: 'Creator: Stats',
      stageIdentity: 'stats',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Malakor Vane',
          class_levels: 'Rogue (Assassin) 5',
          race: 'Tiefling',
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.ability_scores).toEqual({
      str: 18,
      dex: 16,
      con: 14,
      int: 12,
      wis: 11,
      cha: 13,
    });
  });

  it('rejects placeholder +0 proficiency and save modifiers for character builds', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        class_features: [
          { name: 'Sneak Attack (3d6)', description: 'Deal extra precision damage once per turn.' },
        ],
        subclass_features: [
          { name: 'Assassinate', description: 'Gain advantage against creatures that have not acted yet.' },
        ],
        racial_features: [
          { name: 'Darkvision', description: 'See in darkness out to 60 feet.' },
        ],
        feats: [
          { name: 'Piercer', description: 'Improve piercing damage output.' },
        ],
        fighting_styles: [],
        skill_proficiencies: [
          { name: 'Stealth', value: '+0' },
          { name: 'Perception', value: '+0' },
        ],
        saving_throws: [
          { name: 'Dexterity', value: '+0' },
          { name: 'Intelligence', value: '+0' },
        ],
      }),
      stageName: 'Creator: Character Build',
      stageIdentity: 'character_build',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Malakor Vane',
          class_levels: 'Rogue (Assassin) 5',
          race: 'Tiefling',
        },
        'creator:_stats': {
          ability_scores: {
            strength: 10,
            dexterity: 18,
            constitution: 14,
            intelligence: 12,
            wisdom: 10,
            charisma: 16,
          },
          proficiency_bonus: 3,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const failure = result as { ok: false; error: string };

    expect(failure.error).toContain('placeholder modifiers');
  });

  it('accepts character build string entries when they include signed modifiers', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        class_features: ['Pact Magic', 'Pact Boon: Pact of the Tome'],
        subclass_features: ['Genie\'s Vessel', 'Genie\'s Wrath'],
        racial_features: ['Lucky', 'Brave'],
        feats: ['Chef'],
        fighting_styles: ['None'],
        skill_proficiencies: ['Persuasion +8', 'Stealth +7', 'Survival +5', 'Insight +5'],
        saving_throws: ['Wisdom +5', 'Charisma +8'],
      }),
      stageName: 'Creator: Character Build',
      stageIdentity: 'character_build',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Barley Brambleberry',
          class_levels: 'Warlock 11',
          race: 'Lightfoot Halfling',
        },
        'creator:_stats': {
          ability_scores: {
            strength: 10,
            dexterity: 16,
            constitution: 14,
            intelligence: 10,
            wisdom: 12,
            charisma: 18,
          },
          proficiency_bonus: 4,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.skill_proficiencies).toEqual([
      { name: 'Persuasion', value: '+8' },
      { name: 'Stealth', value: '+7' },
      { name: 'Survival', value: '+5' },
      { name: 'Insight', value: '+5' },
    ]);
    expect(result.parsed.saving_throws).toEqual([
      { name: 'Wisdom', value: '+5' },
      { name: 'Charisma', value: '+8' },
    ]);
  });

  it('accepts character build entries when modifiers arrive as numeric bonus aliases', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        class_features: ['Sneak Attack (4d6)', 'Cunning Action'],
        subclass_features: ['Assassinate'],
        racial_features: ['Darkvision'],
        feats: ['Alert'],
        fighting_styles: [],
        skill_proficiencies: [
          { skill: 'Stealth', bonus: 8 },
          { name: 'Perception', modifier: 5 },
        ],
        saving_throws: [
          { ability: 'Dexterity', bonus: 8 },
          { save: 'Intelligence', modifier: 5 },
        ],
      }),
      stageName: 'Creator: Character Build',
      stageIdentity: 'character_build',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Malakor Vane',
          class_levels: 'Rogue (Assassin) 7',
          race: 'Tiefling',
        },
        'creator:_stats': {
          ability_scores: {
            strength: 10,
            dexterity: 18,
            constitution: 14,
            intelligence: 16,
            wisdom: 12,
            charisma: 14,
          },
          proficiency_bonus: 3,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.skill_proficiencies).toEqual([
      { name: 'Stealth', value: '+8' },
      { name: 'Perception', value: '+5' },
    ]);
    expect(result.parsed.saving_throws).toEqual([
      { name: 'Dexterity', value: '+8' },
      { name: 'Intelligence', value: '+5' },
    ]);
  });

  it('accepts spellcasting responses that return spells_known as a leveled object map', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        spellcasting_ability: 'Charisma',
        spell_save_dc: 16,
        spell_attack_bonus: 8,
        spell_slots: { '5th': 3 },
        always_prepared_spells: {
          Marid: ['Fog Cloud', 'Blur'],
        },
        spells_known: {
          Cantrips: ['Eldritch Blast', 'Mage Hand', 'Prestidigitation'],
          '1st-5th': ['Armor of Agathys', 'Hex', 'Hunger of Hadar', 'Dimension Door'],
          '6th': ['Synaptic Static'],
        },
        innate_spells: {
          '1/day': ['Investiture of Ice'],
        },
        spellcasting_focus: 'Genie\'s Vessel (Portable Kitchen)',
      }),
      stageName: 'Creator: Spellcasting',
      stageIdentity: 'spellcasting',
      workflowType: 'npc',
      stageResults: {
        'creator:_basic_info': {
          name: 'Barley Brambleberry',
          class_levels: 'Warlock 11',
          race: 'Lightfoot Halfling',
        },
        'creator:_stats': {
          ability_scores: {
            strength: 10,
            dexterity: 16,
            constitution: 14,
            intelligence: 10,
            wisdom: 12,
            charisma: 18,
          },
          proficiency_bonus: 4,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.spell_slots).toEqual({ '5th': 3 });
    expect(result.parsed.spells_known).toEqual([
      'Eldritch Blast',
      'Mage Hand',
      'Prestidigitation',
      'Armor of Agathys',
      'Hex',
      'Hunger of Hadar',
      'Dimension Door',
      'Synaptic Static',
    ]);
  });

  it('passes through visual map html without JSON parsing', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: '<section>map html</section>',
      stageName: 'Visual Map',
      stageIdentity: 'visual_map',
      workflowType: 'location',
      stageResults: {},
    });

    expect(result).toMatchObject({
      ok: true,
      parsed: {
        visual_map_html: '<section>map html</section>',
        stage: 'visual_map',
      },
    });
  });

  it('rejects invalid location spaces before the page accepts them', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        name: 'Antechamber',
        doors: [],
      }),
      stageName: 'Spaces',
      stageIdentity: 'spaces',
      workflowType: 'location',
      stageResults: {},
    });

    if (!result.ok) {
      const failure = result as { ok: false; error: string };
      expect(failure.error).toContain('size_ft');
      return;
    }

    expect.fail('Expected location stage normalization to fail for invalid spaces.');
  });
});
