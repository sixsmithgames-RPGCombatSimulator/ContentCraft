import { describe, expect, it } from 'vitest';
import { buildScenePresenceContract, contradictionCandidates, selectMemoryContext } from './gmcIntegrationStore.js';

describe('buildScenePresenceContract', () => {
  it('publishes an exclusive revision-bound roster and identifies known absent NPCs', () => {
    const contract = buildScenePresenceContract({
      _id: 'scene-1',
      updatedAt: '2026-07-19T12:00:00.000Z',
      presentNpcIds: ['thorne', 'rusk'],
    }, [
      { _id: 'thorne', canonical_name: 'Captain Thorne' },
      { _id: 'rusk', canonical_name: 'Ward-Reader Rusk' },
      { _id: 'hale', canonical_name: 'Constable Hale' },
    ]);

    expect(contract.authority).toBe('gmc.currentScene.presentNpcIds');
    expect(contract.valid).toBe(true);
    expect(contract.presentNpcs.map((npc) => npc.name)).toEqual(['Captain Thorne', 'Ward-Reader Rusk']);
    expect(contract.knownNonPresentNpcs.map((npc) => npc.name)).toEqual(['Constable Hale']);
    expect(contract.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not silently accept a scene roster that references an unknown NPC id', () => {
    const contract = buildScenePresenceContract({ _id: 'scene-1', presentNpcIds: ['missing'] }, []);
    expect(contract.valid).toBe(false);
    expect(contract.unresolvedPresentNpcIds).toEqual(['missing']);
  });
});

describe('contradictionCandidates', () => {
  it('flags a negated proposal that overlaps a locked fact', () => {
    const result = contradictionCandidates('Lady Erliza has no connection to the vampire lord.', [
      { _id: 'fact-1', text: 'Lady Erliza secretly serves the vampire lord.' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].lockedFactId).toBe('fact-1');
  });

  it('does not flag unrelated statements', () => {
    const result = contradictionCandidates('The docks are crowded tonight.', [
      { _id: 'fact-1', text: 'Lady Erliza secretly serves the vampire lord.' },
    ]);
    expect(result).toEqual([]);
  });
});

describe('selectMemoryContext', () => {
  const locations = [
    { _id: 'city', details: {} },
    { _id: 'district', details: { parentLocationId: 'city' } },
    { _id: 'site', details: { parentLocationId: 'district' } },
    { _id: 'room', details: { parentLocationId: 'site' } },
    { _id: 'elsewhere', details: {} },
  ];

  it('combines macro memory with only the current location ancestry and present minor entities', () => {
    const result = selectMemoryContext({
      locations,
      facts: [
        { _id: 'world-fact', text: 'Magic leaves a blue scar.', scope: { kind: 'geographic', tier: 'world' } },
        { _id: 'site-fact', text: 'The chapel floods.', scope: { kind: 'geographic', tier: 'site', locationId: 'site' } },
        { _id: 'other-room-fact', text: 'A bell waits.', scope: { kind: 'geographic', tier: 'room', locationId: 'elsewhere' } },
        { _id: 'lieutenant-fact', text: 'The Woman carries a seal.', scope: { kind: 'entity', tier: 'lieutenant', entityId: 'lieutenant' } },
        { _id: 'contact-fact', text: 'Mara fears bells.', scope: { kind: 'entity', tier: 'contact', entityId: 'contact' } },
      ],
      items: [
        { _id: 'plot-item', details: { memory: { tier: 'plot', currentLocationId: 'elsewhere' } } },
        { _id: 'furniture-here', details: { memory: { tier: 'furniture', currentLocationId: 'room' } } },
        { _id: 'coins-away', details: { memory: { tier: 'currency', currentLocationId: 'elsewhere' } } },
      ],
      npcs: [
        { _id: 'lieutenant', details: { entityTier: 'lieutenant' } },
        { _id: 'contact', details: { entityTier: 'contact' } },
        { _id: 'absent-contact', details: { entityTier: 'contact' } },
      ],
      events: [
        { _id: 'world-event', scope: { kind: 'geographic', tier: 'world' } },
        { _id: 'site-event', scope: { kind: 'geographic', tier: 'site', locationId: 'site' } },
        { _id: 'away-event', scope: { kind: 'geographic', tier: 'room', locationId: 'elsewhere' } },
        { _id: 'due-away-event', deadlineAt: '2000-01-01T00:00:00.000Z', scope: { kind: 'geographic', tier: 'room', locationId: 'elsewhere' } },
      ],
    }, { currentLocationId: 'room', presentNpcIds: ['contact'] });

    expect(result.locationAncestry).toEqual(['room', 'site', 'district', 'city']);
    expect(result.facts.map((fact) => fact._id)).toEqual(['world-fact', 'site-fact', 'lieutenant-fact', 'contact-fact']);
    expect(result.items.map((item) => item._id)).toEqual(['plot-item', 'furniture-here']);
    expect(result.events.map((event) => event._id)).toEqual(['world-event', 'site-event', 'due-away-event']);
    expect(result.events.find((event) => event._id === 'due-away-event')?.deadlineState).toBe('due');
    expect(result.entities.map((npc) => npc._id)).toEqual(['lieutenant', 'contact']);
    expect(result.retrieval.excluded).toEqual({ facts: 1, items: 1, events: 1, entities: 1 });
  });

  it('keeps unclassified legacy items visible for backward compatibility', () => {
    const result = selectMemoryContext({ facts: [], items: [{ _id: 'legacy-item', details: {} }], npcs: [], locations, events: [] });
    expect(result.items.map((item) => item._id)).toEqual(['legacy-item']);
  });
});
