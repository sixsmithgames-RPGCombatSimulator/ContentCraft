/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

type GuardResult = { ok: boolean; errors: string[]; flags?: string[] };

export async function runPhysicsGuard(draft: any): Promise<GuardResult> {
  const errors: string[] = [];
  const flags: string[] = [];

  // Travel sanity (if present)
  const travel = draft.travel || draft.environment?.travel;
  if (travel?.distance_miles != null && travel?.time_minutes != null) {
    const mph = travel.distance_miles / (travel.time_minutes / 60);
    // On foot typical ~3 mph; difficult terrain ~1–2 mph; mounted 5–8+ mph
    if (!travel.magic && mph > 5) {
      errors.push(
        `physics: implied speed ${mph.toFixed(1)} mph exceeds plausible non-magical travel`
      );
    }
  }

  // Combat movement sanity
  if (draft.tactics_rounds) {
    draft.tactics_rounds.forEach((r: any, i: number) => {
      const moves = (r.moves || []).filter((m: any) => typeof m.distance_ft === 'number');
      moves.forEach((m: any) => {
        const spd = m.speed_ft_per_round ?? 30; // default assumption
        if (m.distance_ft > spd && !m.dash && !m.magic) {
          errors.push(
            `physics: round ${i + 1} movement ${m.distance_ft}ft exceeds speed ${spd}ft without Dash or magic`
          );
        }
      });
    });
  }

  // Falls
  const hazards = draft.environment?.hazards || [];
  hazards.forEach((h: any) => {
    if (h.type === 'fall' && typeof h.height_ft === 'number' && !h.magic) {
      if (h.height_ft > 10 && h.damage_dice == null) {
        flags.push(
          'physics: fall listed without damage—ensure damage or Feather Fall/slow-fall effect'
        );
      }
    }
  });

  // Projectile ranges
  const attacks =
    draft.attacks ||
    draft.combatants?.flatMap((e: any) => e.abilities || []) ||
    [];
  attacks.forEach((a: any) => {
    if (
      typeof a.range_ft === 'number' &&
      a.range_ft > 600 &&
      !a.trait?.includes?.('artillery') &&
      !a.magic
    ) {
      flags.push(
        `physics: projectile range ${a.range_ft}ft seems high—verify (magic? siege?)`
      );
    }
  });

  return { ok: errors.length === 0, errors, flags };
}
