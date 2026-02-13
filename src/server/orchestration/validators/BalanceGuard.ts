/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

type GuardResult = { ok: boolean; errors: string[]; flags: string[] };

function tierFromPartyLevel(avg: number) {
  if (avg <= 4) return 1;
  if (avg <= 8) return 2;
  if (avg <= 12) return 3;
  return 4;
}

export async function runBalanceGuard(draft: any): Promise<GuardResult> {
  const errors: string[] = [];
  const flags: string[] = [];

  // Encounter heuristics
  if (draft.combatants || draft.difficulty_tier) {
    const difficultyTier = draft.difficulty_tier || 'standard';

    // Save DC sanity
    if (draft.combatants) {
      draft.combatants.forEach((combatant: any) => {
        if (combatant.abilities) {
          combatant.abilities.forEach((ability: any) => {
            if (ability.save_dc && typeof ability.save_dc === 'number') {
              if (ability.save_dc > 20) {
                flags.push(
                  `balance: save DC ${ability.save_dc} is very high—review for party level appropriateness`
                );
              }
            }
          });
        }
      });
    }

    // Treasure sanity
    if (draft.treasure?.items) {
      const rareItems = draft.treasure.items.filter((item: string) =>
        /very rare|legendary|artifact/i.test(item)
      );
      if (rareItems.length > 2) {
        flags.push(
          'balance: multiple high-rarity rewards—ensure appropriate for party tier'
        );
      }
    }
  }

  // Item balance
  if (draft.type === 'item' || draft.rarity) {
    // Check for always-on detection
    if (draft.properties?.some?.((p: any) =>
      p.description?.toLowerCase().includes('detect thoughts') &&
      !p.charges &&
      p.action_type === 'passive'
    )) {
      errors.push(
        'balance: always-on detection is forbidden—gate behind uses/charges or remove'
      );
    }

    // Check for inappropriate damage riders
    if (draft.properties?.some?.((p: any) =>
      p.description?.toLowerCase().includes('add') &&
      p.description?.toLowerCase().includes('damage') &&
      !p.charges
    )) {
      flags.push(
        'balance: free damage rider detected—ensure gated by charges/attunement or situational'
      );
    }
  }

  return { ok: errors.length === 0, errors, flags };
}
