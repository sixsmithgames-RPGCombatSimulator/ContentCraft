import { describe, expect, it } from 'vitest';
import { normalizeNpc } from './npcUtils';

describe('npcUtils.normalizeNpc', () => {
  it('preserves rich raw NPC generator shapes that were previously collapsed during save/edit flows', () => {
    const normalized = normalizeNpc({
      schema_version: 'npc/v1.1',
      name: 'Karoz',
      description: 'A pragmatic archmage with a tower in Amn.',
      physical_appearance: 'Tall high elf in midnight robes.',
      race: 'Elf',
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
      bonds: ['His tower in Amn'],
      flaws: ['Greed often clouds his judgment'],
      combat_tactics: 'Controls the battlefield with overwhelming evocation magic.',
    });

    expect(normalized.appearance).toBe('Tall high elf in midnight robes.');
    expect(normalized.race).toBe('Elf');
    expect(normalized.subspecies).toBe('High Elf');
    expect(normalized.subtype).toBe('High Elf');
    expect(normalized.classLevels).toEqual([
      {
        class: 'Wizard',
        level: 20,
        subclass: 'Evocation',
      },
    ]);
    expect(normalized.abilityScores).toEqual({
      str: 10,
      dex: 16,
      con: 14,
      int: 20,
      wis: 12,
      cha: 12,
    });
    expect(normalized.speed).toEqual({ walk: '30 ft.' });
    expect(normalized.senses).toEqual(['darkvision 60 ft.']);
    expect(normalized.passivePerception).toBe(17);
    expect(normalized.personality).toEqual({
      traits: ['Intellectually arrogant'],
      ideals: ['Knowledge is the ultimate currency'],
      bonds: ['His tower in Amn'],
      flaws: ['Greed often clouds his judgment'],
    });
    expect(normalized.tactics).toBe('Controls the battlefield with overwhelming evocation magic.');
    expect(normalized.schemaVersion).toBe('1.1');
  });
});
