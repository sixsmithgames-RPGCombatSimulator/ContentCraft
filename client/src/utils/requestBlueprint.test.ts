import { describe, expect, it } from 'vitest';
import {
  buildRequestBlueprint,
  computeNpcSpellSlots,
  extractNpcRequestFacts,
  normalizeNpcClassLevels,
  resolveNpcCasterProfile,
} from './requestBlueprint';

describe('requestBlueprint', () => {
  it('extracts structured npc facts from a normalized brief', () => {
    const facts = extractNpcRequestFacts(`Structured brief:
name: Fiblan
level: 10
class: Wizard
race: Human
subrace: Variant Human
background: Sage
alignment: Lawful Neutral
abilities:
  strength: 8
  dexterity: 14
  constitution: 15
  intelligence: 16
  wisdom: 12
  charisma: 10`);

    expect(facts).toMatchObject({
      name: 'Fiblan',
      level: 10,
      race: 'Human',
      subrace: 'Variant Human',
      background: 'Sage',
      alignment: 'Lawful Neutral',
      class_levels: [{ class: 'Wizard', level: 10 }],
      ability_scores: { str: 8, dex: 14, con: 15, int: 16, wis: 12, cha: 10 },
    });
  });

  it('builds npc request blueprints that emphasize explicit user-provided mechanics', () => {
    const blueprint = buildRequestBlueprint(`Structured brief:
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
  charisma: 10`, 'npc', { allow_invention: 'cosmetic' });

    expect(blueprint.source_kind).toBe('structured');
    expect(blueprint.explicit_facts).toMatchObject({
      name: 'Fiblan',
      class_levels: [{ class: 'Wizard', level: 10 }],
      ability_scores: { str: 8, dex: 14, con: 15, int: 16, wis: 12, cha: 10 },
    });
    expect(blueprint.success_criteria).toContain('Use explicit ability scores from the request as authoritative instead of inventing replacements.');
    expect(blueprint.blocking_gaps).toEqual([]);
  });

  it('parses string class levels and resolves full-caster wizard spell slots', () => {
    const classLevels = normalizeNpcClassLevels('Wizard 10');
    const caster = resolveNpcCasterProfile({ classLevels });

    expect(classLevels).toEqual([{ class: 'Wizard', level: 10 }]);
    expect(caster.casterType).toBe('prepared_full_caster');
    expect(computeNpcSpellSlots(caster.casterType, caster.level)).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
  });
});
