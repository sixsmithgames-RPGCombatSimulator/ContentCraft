/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { describe, it, expect } from 'vitest';
import { validateNpcSafe } from './npcValidator.js';
import { mapAndValidateNpc } from '../services/npcSchemaMapper.js';

describe('npcValidator.validateNpcSafe', () => {
  it('validates v1.1 NPC with string proposals', () => {
    const npc = {
      schema_version: '1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('treats schema_version variant npc/v1.1 as v1.1', () => {
    const npc = {
      schema_version: 'npc/v1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    // validateNpcSafe validates raw data. v1.1 schema requires schema_version === "1.1" exactly,
    // so variants like "npc/v1.1" should fail. Normalization happens in the mapper.
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('mapAndValidateNpc normalizes schema_version variants and validates as v1.1', () => {
    const npc = {
      schema_version: 'npc/v1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = mapAndValidateNpc(npc as unknown as Record<string, unknown>);
    expect(result.success).toBe(true);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.data?.schema_version).toBe('1.1');
  });

  it('validates v1.1 NPC with object proposals', () => {
    const npc = {
      schema_version: '1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: [{ question: 'Should this NPC have a secret?', answer: 'Yes' }],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });


  it('mapAndValidateNpc preserves rich manual-generator NPC fields and maps species to race', () => {
    const npc = {
      schema_version: '1.1',
      name: 'Seraphina Vale',
      description: 'A veteran knight-captain with a measured voice, scarred shield, and a tactical mind sharpened by years on the frontier.',
      species: 'Human',
      personality: {
        traits: ['Measured', 'Protective'],
        ideals: ['Duty'],
        bonds: ['Her garrison'],
        flaws: ['Rigid'],
      },
      motivations: ['Protect innocent travelers'],
      goals: ['Keep the northern trade road open through winter'],
      fears: ['Losing soldiers because she hesitated'],
      quirks: ['Counts exits whenever she enters a room'],
      voice_mannerisms: ['Speaks in clipped military phrases'],
      fighting_styles: [{ name: 'Defense', description: 'Keeps a shield wall between danger and her allies.' }],
      weapons: [{ name: 'Longsword', notes: '+1 blade from her order' }],
      armor_and_shields: [{ name: 'Shield', notes: 'Stamped with the Silver Order crest' }],
      organizations: [{ name: 'Silver Order', role: 'Captain', standing: 'Respected' }],
      family: [{ name: 'Mira Vale', relationship: 'Sister', status: 'Alive' }],
      contacts: [{ name: 'Hollis Reed', profession: 'Quartermaster', location: 'Northwatch' }],
      legendary_resistance: { uses_per_day: 1, description: 'Can steel herself against one failed saving throw.' },
      spellcasting_ability: 'Wisdom',
      spell_save_dc: 15,
      spell_attack_bonus: 7,
      spell_slots: { '1': 4, '2': 2 },
      prepared_spells: { '1': ['bless', 'shield of faith'], '2': ['lesser restoration'] },
      always_prepared_spells: { Oath: ['heroism'] },
      innate_spells: { 'At will': ['light'] },
      spells_known: ['bless', 'lesser restoration'],
      spellcasting_focus: 'Silver holy symbol',
    };

    const result = mapAndValidateNpc(npc as unknown as Record<string, unknown>);

    expect(result.success).toBe(true);
    expect(result.data?.race).toBe('Human');
    expect(result.data?.goals).toEqual(['Keep the northern trade road open through winter']);
    expect(result.data?.fears).toEqual(['Losing soldiers because she hesitated']);
    expect(result.data?.quirks).toEqual(['Counts exits whenever she enters a room']);
    expect(result.data?.voice_mannerisms).toEqual(['Speaks in clipped military phrases']);
    expect(result.data?.prepared_spells).toEqual({ '1': ['bless', 'shield of faith'], '2': ['lesser restoration'] });
    expect(result.data?.always_prepared_spells).toEqual({ Oath: ['heroism'] });
    expect(result.data?.legendary_resistance).toEqual({ uses_per_day: 1, description: 'Can steel herself against one failed saving throw.' });
    expect(result.data?.organizations).toEqual([{ name: 'Silver Order', role: 'Captain', standing: 'Respected' }]);
    expect(result.warnings).toContain('Mapped "species" to canonical "race" field');
  });

  it('mapAndValidateNpc normalizes raw generator NPC transport shapes used during project saves', () => {
    const npc = {
      schema_version: 'npc/v1.1',
      name: 'Karoz',
      description: 'A pragmatic and highly skilled evocation wizard with a vendetta against the drow.',
      species: 'High Elf',
      class_levels: 'Wizard (Evocation) 20',
      ability_scores: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 20,
        wisdom: 12,
        charisma: 12,
      },
      speed: 30,
      senses: {
        darkvision: 60,
        passive_perception: 17,
      },
      personality_traits: ['Intellectually arrogant'],
      ideals: ['Knowledge is the ultimate currency'],
      bonds: ['His wizard tower in Amn is his sanctuary'],
      flaws: ['Greed often clouds his judgment'],
      motivations: ['Destroy drow influence in the region'],
      rule_base: '2024RAW',
      sources_used: [],
      assumptions: [],
      proposals: [],
      canon_update: 'Created Karoz as a high-level Amnian archmage with deeply personal stakes against the drow.',
    };

    const result = mapAndValidateNpc(npc as unknown as Record<string, unknown>);

    expect(result.success).toBe(true);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.data?.schema_version).toBe('1.1');
    expect(result.data?.race).toBe('High Elf');
    expect(result.data?.class_levels).toEqual([
      {
        class: 'Wizard',
        level: 20,
        subclass: 'Evocation',
      },
    ]);
    expect(result.data?.ability_scores).toEqual({
      str: 10,
      dex: 16,
      con: 14,
      int: 20,
      wis: 12,
      cha: 12,
    });
    expect(result.data?.speed).toEqual({ walk: '30 ft.' });
    expect(result.data?.senses).toEqual(['darkvision 60 ft.']);
    expect(result.data?.passive_perception).toBe(17);
    expect(result.data?.personality).toEqual({
      traits: ['Intellectually arrogant'],
      ideals: ['Knowledge is the ultimate currency'],
      bonds: ['His wizard tower in Amn is his sanctuary'],
      flaws: ['Greed often clouds his judgment'],
    });
  });

  it('defaults to v1.0 and fails when legacy required fields are missing', () => {
    const legacyNpc = {
      name: 'Legacy NPC',
      description: 'This is a sufficiently long description.',
    };

    const result = validateNpcSafe(legacyNpc);
    expect(result.schemaVersion).toBe('1.0');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
