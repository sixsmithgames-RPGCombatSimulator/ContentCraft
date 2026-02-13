/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { Run } from '../../models/Run.js';

type GuardResult = { ok: boolean; errors: string[]; balance_flags?: string[] };

const PROF_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3, 9: 4, 10: 4,
  11: 4, 12: 4, 13: 5, 14: 5, 15: 5, 16: 5, 17: 6, 18: 6, 19: 6, 20: 6
};

function expect(cond: any, msg: string, errors: string[]) {
  if (!cond) errors.push(msg);
}

export async function runRulesGuard(draft: any, run: Run): Promise<GuardResult> {
  const errors: string[] = [];
  const flags: string[] = [];
  const ruleBase = run.flags.rule_base ?? '2024RAW';

  // Common required fields
  expect(
    Array.isArray(draft.sources_used) && draft.sources_used.length > 0,
    'rules: sources_used must cite at least one chunk',
    errors
  );
  expect('rule_base' in draft, 'rules: rule_base missing', errors);

  // Type-specific checks
  switch (run.type) {
    case 'npc': {
      // Proficiency bonus sanity
      const lvl =
        draft.class_levels?.reduce?.((a: number, c: any) => a + (c.level || 0), 0) || 0;
      if (lvl >= 1 && lvl <= 20) {
        const pb = draft.proficiency_bonus;
        expect(
          pb === PROF_BY_LEVEL[lvl],
          `rules: proficiency_bonus ${pb} does not match level ${lvl} (expected ${PROF_BY_LEVEL[lvl]})`,
          errors
        );
      }
      // AC/HP envelopes
      if (typeof draft.ac === 'number') {
        expect(
          draft.ac >= 10 && draft.ac <= 22,
          `rules: AC ${draft.ac} outside expected NPC bounds (10–22)`,
          errors
        );
      }
      if (typeof draft.hp === 'number') {
        expect(
          draft.hp >= 8 && draft.hp <= 350,
          `rules: HP ${draft.hp} outside expected NPC bounds (8–350)`,
          errors
        );
      }
      break;
    }
    case 'item': {
      // Rarity vs attunement sanity
      const rarity = draft.rarity?.toLowerCase?.();
      if (
        rarity &&
        draft.requires_attunement === false &&
        ['very-rare', 'legendary', 'artifact'].includes(rarity)
      ) {
        flags.push('rules: high-rarity item without attunement—review');
      }
      break;
    }
    case 'encounter': {
      // Action economy sanity
      const roster = draft.combatants || [];
      expect(
        Array.isArray(roster) && roster.length > 0,
        'rules: encounter has no combatants',
        errors
      );
      break;
    }
    case 'scene': {
      // DC envelopes if present
      const checks = draft.skill_challenges || [];
      checks.forEach((check: any) => {
        if (typeof check.dc === 'number') {
          expect(
            check.dc >= 10 && check.dc <= 25,
            `rules: DC ${check.dc} outside 10–25 envelope`,
            errors
          );
        }
      });
      break;
    }
  }

  // Forbidden cross-pillar combos
  if (
    run.type === 'item' &&
    draft?.properties?.some?.(
      (e: any) =>
        e.name?.toLowerCase().includes('necrotic') &&
        draft.name?.toLowerCase().includes('ring of spell storing')
    )
  ) {
    errors.push(
      'rules: ring of spell storing cannot add damage riders to natural attacks (cross-pillar stacking)'
    );
  }

  return { ok: errors.length === 0, errors, balance_flags: flags };
}
