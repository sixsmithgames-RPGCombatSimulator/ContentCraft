import { describe, expect, it } from 'vitest';
import {
  EncounterPlanError,
  assertEncounterPlanTransition,
  evaluateEncounterReadiness,
  normalizeEncounterMap,
  normalizeEncounterRoster,
} from './encounterPlan.js';

describe('encounter plan', () => {
  it('normalizes a mixed roster with tactical token state', () => {
    const roster = normalizeEncounterRoster([
      {
        actorId: 'pc:aria',
        name: 'Aria',
        role: 'player',
        sourceRef: { system: 'vcs', id: 'character:aria', revision: 'character-r4', entityType: 'character' },
        token: { x: 4, y: 8, assetUrl: 'https://assets.example/aria.png' },
      },
      {
        actorId: 'monster:owlbear',
        name: 'Owlbear',
        role: 'hostile',
        sourceRef: { system: 'gmc', id: 'monster:owlbear', revision: 'entity-r2' },
        maxHp: 59,
        armorClass: 13,
      },
    ]);
    expect(roster).toHaveLength(2);
    expect(roster[0].token.x).toBe(4);
    expect(roster[0].sourceRef?.entityType).toBe('character');
    expect(roster[1].maxHp).toBe(59);
  });

  it('reports exact blockers without hiding safe token defaults', () => {
    const readiness = evaluateEncounterReadiness({
      title: 'Bridge Ambush',
      roster: [
        { actorId: 'pc:aria', name: 'Aria', role: 'player', token: {} },
        { actorId: 'monster:owlbear', name: 'Owlbear', role: 'hostile', token: {} },
      ],
      map: normalizeEncounterMap({}),
      vcsBinding: null,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((item) => item.code)).toContain('MAP_REQUIRED');
    expect(readiness.warnings.map((item) => item.code)).toContain('TOKEN_NOT_PLACED');
  });

  it('accepts a runnable map and opposing sides', () => {
    const readiness = evaluateEncounterReadiness({
      title: 'Bridge Ambush',
      roster: [
        { actorId: 'pc:aria', name: 'Aria', role: 'player', token: { x: 1, y: 1 } },
        { actorId: 'monster:owlbear', name: 'Owlbear', role: 'hostile', token: { x: 4, y: 4 } },
      ],
      map: normalizeEncounterMap({
        id: 'map:bridge',
        width: 30,
        height: 20,
        gridSize: 5,
      }),
      vcsBinding: null,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it('guards lifecycle skips and permits iterative tactical setup', () => {
    expect(assertEncounterPlanTransition('draft', 'tactical_setup')).toBe(true);
    expect(assertEncounterPlanTransition('ready', 'tactical_setup')).toBe(true);
    expect(() => assertEncounterPlanTransition('draft', 'active')).toThrowError(EncounterPlanError);
  });

  it('rejects duplicate actor identifiers', () => {
    expect(() => normalizeEncounterRoster([
      { actorId: 'actor:one', name: 'One', role: 'player' },
      { actorId: 'actor:one', name: 'Two', role: 'hostile' },
    ])).toThrowError(/must be unique/);
  });
});
