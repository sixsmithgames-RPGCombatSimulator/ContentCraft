import { describe, expect, it } from 'vitest';
import { buildScenePresenceContract, contradictionCandidates, resolveMemoryReferences, selectMemoryContext, validateMemoryRestorationCandidate } from './gmcIntegrationStore.js';

describe('resolveMemoryReferences', () => {
  const bentNail = { _id: 'bent-nail', type: 'location', canonical_name: 'The Bent Nail', tags: ['player-known', 'shop'], details: { type: 'Dock Ward shop', description: 'Mundane trade goods in front and arms, armor, and supplies in the back.' } };
  const saltyTug = { _id: 'salty-tug', type: 'location', canonical_name: 'The Salty Tug', tags: ['player-known', 'tavern'], details: { type: 'Dock Ward tavern' } };
  const mara = { _id: 'mara', type: 'npc', canonical_name: 'Mara Dusk', tags: ['player-known', 'quartermaster'], details: { role: 'Watch-friendly quartermaster and appraiser' } };

  it('uses typed activity evidence and campaign time to resolve the last established shop and contact', () => {
    const result = resolveMemoryReferences({
      locations: [bentNail], npcs: [mara], items: [], factions: [],
      facts: [{
        _id: 'trade-1',
        text: 'At Day 2, 8:10 PM, Kerrigan trades armor to Mara Dusk at The Bent Nail after haggling over store credit.',
        relatedEntityIds: ['mara'], relatedLocationIds: ['bent-nail'],
      }],
    }, 'In the morning I go back to sell the extra armor at the shop we used before.');

    expect(result.status).toBe('resolved');
    expect(result.references.find((entry) => entry.key === 'commerce_location')?.selected?.name).toBe('The Bent Nail');
    expect(result.references.find((entry) => entry.key === 'commerce_contact')?.selected?.name).toBe('Mara Dusk');
  });

  it('does not mistake a tavern visit for an established lodging relationship', () => {
    const result = resolveMemoryReferences({
      locations: [saltyTug], npcs: [], items: [], factions: [],
      facts: [{ _id: 'meeting-1', text: 'At Day 2, 7:15 PM, Kerrigan meets Captain Thorne at The Salty Tug.', relatedLocationIds: ['salty-tug'] }],
    }, 'I go back to the inn where I stayed and speak with the same innkeeper.');

    expect(result.status).toBe('clarification_required');
    expect(result.references.find((entry) => entry.key === 'lodging_location')?.status).toBe('ambiguous');
    expect(result.references.find((entry) => entry.key === 'lodging_proprietor')?.status).toBe('missing');
    expect(result.clarification?.options).toEqual([{ id: 'salty-tug', name: 'The Salty Tug', kind: 'location' }]);
  });

  it('time-ranks multiple established referents instead of choosing alphabetically', () => {
    const result = resolveMemoryReferences({
      locations: [bentNail, { ...bentNail, _id: 'old-shop', canonical_name: 'Old Lantern Market' }],
      npcs: [], items: [], factions: [],
      facts: [
        { text: 'At Day 1, 9:00 AM, Kerrigan sold gear at Old Lantern Market.', relatedLocationIds: ['old-shop'] },
        { text: 'At Day 3, 8:00 AM, Kerrigan sold armor at The Bent Nail.', relatedLocationIds: ['bent-nail'] },
      ],
    }, 'I return to the shop where I last sold armor.');
    expect(result.references.find((entry) => entry.key === 'commerce_location')?.selected?.name).toBe('The Bent Nail');
  });
});

describe('validateMemoryRestorationCandidate', () => {
  const priorResolution = {
    authority: 'gmc.campaign-memory', contractVersion: '2026-07-19.1', status: 'clarification_required',
    instruction: 'Go back to the inn and speak to the innkeeper.',
    references: [
      { key: 'lodging_location', kind: 'location', activity: 'lodging', label: 'lodging location', status: 'missing' },
      { key: 'lodging_proprietor', kind: 'npc', activity: 'lodging', label: 'innkeeper', status: 'missing' },
    ],
  };

  it('accepts only complete typed names quoted verbatim from the player', () => {
    const result = validateMemoryRestorationCandidate({
      clarificationAnswer: 'The inn is the Tidy Tides Inn. The innkeeper is Vernicle.', priorResolution,
      records: [
        { key: 'lodging_location', kind: 'location', name: 'Tidy Tides Inn', nameEvidence: 'Tidy Tides Inn' },
        { key: 'lodging_proprietor', kind: 'npc', name: 'Vernicle', nameEvidence: 'Vernicle' },
      ],
    });
    expect(result.records.map((record) => record.name)).toEqual(['Tidy Tides Inn', 'Vernicle']);
  });

  it('rejects names that were not present in the clarification', () => {
    expect(() => validateMemoryRestorationCandidate({
      clarificationAnswer: 'The innkeeper is Vernicle.', priorResolution,
      records: [
        { key: 'lodging_location', kind: 'location', name: 'Invented Inn', nameEvidence: 'Invented Inn' },
        { key: 'lodging_proprietor', kind: 'npc', name: 'Vernicle', nameEvidence: 'Vernicle' },
      ],
    })).toThrow(/quoted verbatim/);
  });
});

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
