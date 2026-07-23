import { describe, expect, it } from 'vitest';
import {
  buildNarrationEvidenceBundle,
  buildProposedScenePresenceContract,
  buildScenePresenceContract,
  CAMPAIGN_MEMORY_CONTRACT_VERSION,
  canonicalEntityIdentityConflicts,
  canonicalEntityIdentityKey,
  classifyWorldGenerationIntent,
  contradictionCandidates,
  NARRATION_EVIDENCE_CONTRACT_VERSION,
  resolveMemoryReferences,
  resolveSceneTransitionContract,
  selectMemoryContext,
  validateMemoryRestorationCandidate,
  validateNarrativePresenceContract,
} from './gmcIntegrationStore.js';

describe('canonical entity identity', () => {
  const records = [
    {
      _id: 'yard',
      canonical_name: 'Flintwake Wage Yard',
      aliases: ['Flintwake Pay Yard'],
      status: 'active',
    },
    {
      _id: 'retired-yard',
      canonical_name: 'Old Flintwake Yard',
      aliases: ['Flintwake Wage Yard'],
      status: 'superseded',
    },
  ];

  it('normalizes punctuation and case while ignoring superseded records', () => {
    expect(canonicalEntityIdentityKey('  FLINTWAKE—Wage Yard ')).toBe('flintwake wage yard');
    expect(canonicalEntityIdentityConflicts(['flintwake wage yard'], records).map((record) => record._id)).toEqual(['yard']);
    expect(canonicalEntityIdentityConflicts(['Flintwake Pay Yard'], records).map((record) => record._id)).toEqual(['yard']);
    expect(canonicalEntityIdentityConflicts(['Old Flintwake Yard'], records)).toEqual([]);
  });

  it('allows an existing record to retain its own canonical identity during update', () => {
    expect(canonicalEntityIdentityConflicts(['Flintwake Wage Yard'], records, 'yard')).toEqual([]);
  });
});

describe('validateNarrativePresenceContract', () => {
  const presenceContract = buildScenePresenceContract({
    _id: 'vesper-scene',
    updatedAt: '2026-07-20T10:00:00.000Z',
    presentNpcIds: ['vesper'],
  }, [
    { _id: 'vesper', canonical_name: 'Old Vesper', aliases: ['Vesper'] },
    { _id: 'guide', canonical_name: 'Dock-Pole Guide' },
    { _id: 'wardwright', canonical_name: 'Unidentified Binding Flux Wardwright' },
    { _id: 'coordinator', canonical_name: 'Unidentified Black Seal Coordinator' },
  ]);

  it('allows present NPCs to discuss, infer, and report on absent people elsewhere', () => {
    const contract = validateNarrativePresenceContract({
      presenceContract,
      responseMode: 'in_character',
      responseText: 'Vesper studies the residue. He suspects the Dock-Pole Guide below carried orders from the Unidentified Black Seal Coordinator, while the Unidentified Binding Flux Wardwright may have stabilized the frame elsewhere.',
      sceneSegment: {
        status: 'active',
        who: ['Kerrigan Brynn', 'Old Vesper'],
      },
    });

    expect(contract.valid).toBe(true);
    expect(contract.issues).toEqual([]);
    expect(contract.references.map((entry) => entry.usage)).toEqual([
      'remote_historical_or_discussed',
      'remote_historical_or_discussed',
      'remote_historical_or_discussed',
    ]);
  });

  it('rejects an absent NPC declared in the exact scene roster', () => {
    const contract = validateNarrativePresenceContract({
      presenceContract,
      responseMode: 'in_character',
      responseText: 'Vesper studies the residue.',
      sceneSegment: { status: 'completed', who: ['Kerrigan Brynn', 'Old Vesper', 'Dock-Pole Guide'] },
    });

    expect(contract.valid).toBe(false);
    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ABSENT_NPC_DECLARED_PRESENT', name: 'Dock-Pole Guide', field: 'sceneSegment.who' }),
    ]));
  });

  it('rejects an unambiguous scene-local action by an absent NPC', () => {
    const contract = validateNarrativePresenceContract({
      presenceContract,
      responseMode: 'in_character',
      responseText: 'The Dock-Pole Guide enters the room and hands Kerrigan a sealed note.',
      sceneSegment: { status: 'completed', who: ['Kerrigan Brynn', 'Old Vesper'] },
    });

    expect(contract.valid).toBe(false);
    expect(contract.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ABSENT_NPC_LOCAL_ROLE', name: 'Dock-Pole Guide', field: 'responseText' }),
    ]));
  });

  it('does not apply scene presence to OOC preparation text', () => {
    const contract = validateNarrativePresenceContract({
      presenceContract,
      responseMode: 'ooc',
      responseText: 'Confirm whether Captain Thorne authorized the modification.',
      sceneSegment: null,
    });

    expect(contract.valid).toBe(true);
    expect(contract.references).toEqual([]);
  });
});

describe('resolveMemoryReferences', () => {
  const bentNail = { _id: 'bent-nail', type: 'location', canonical_name: 'The Bent Nail', tags: ['player-known', 'shop'], details: { type: 'Dock Ward shop', description: 'Mundane trade goods in front and arms, armor, and supplies in the back.' } };
  const saltyTug = { _id: 'salty-tug', type: 'location', canonical_name: 'The Salty Tug', tags: ['player-known', 'tavern'], details: { type: 'Dock Ward tavern' } };
  const mara = { _id: 'mara', type: 'npc', canonical_name: 'Mara Dusk', tags: ['player-known', 'quartermaster'], details: { role: 'Watch-friendly quartermaster and appraiser' } };

  it('authorizes bounded world generation for an open-ended search without inventing a missing canonical reference', () => {
    const instruction = 'I leave Vesper to his work and go looking for a mark, someone cruel and self-absorbed.';
    const result = resolveMemoryReferences({ locations: [], npcs: [], items: [], factions: [], facts: [] }, instruction);

    expect(result.status).toBe('resolved');
    expect(result.references).toEqual([]);
    expect(result.creationPolicy).toEqual(expect.objectContaining({
      authority: 'gmc.worldGenerationPolicy',
      mode: 'world_generation_allowed',
      allowedEntityTypes: ['location', 'npc'],
      allowSceneSettingCreation: true,
    }));
    expect(classifyWorldGenerationIntent('I go back to the same inn.').mode).toBe('canonical_only');
    expect(classifyWorldGenerationIntent('I go back to the same inn and look for someone cruel.')).toEqual(expect.objectContaining({
      mode: 'world_generation_allowed',
      allowedEntityTypes: ['npc'],
      allowSceneSettingCreation: false,
    }));
    expect(classifyWorldGenerationIntent('Kerrigan is in Waterdeep and goes looking for someone cruel and self-absorbed.')).toEqual(expect.objectContaining({
      mode: 'world_generation_allowed',
      allowedEntityTypes: ['location', 'npc'],
      allowSceneSettingCreation: true,
    }));
    expect(classifyWorldGenerationIntent('You can create names for places and people. Create locations for residences, inns, Watch facilities, temples, wizard towers, guild halls, warehouses, and district boundaries.')).toEqual(expect.objectContaining({
      mode: 'world_generation_allowed',
      allowedEntityTypes: ['location', 'npc'],
      allowSceneSettingCreation: true,
    }));
    expect(classifyWorldGenerationIntent('Retrieve the already-established Waterdeep locations and develop those existing records in more detail.')).toEqual(expect.objectContaining({
      mode: 'canonical_only',
      allowedEntityTypes: [],
    }));
  });

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

  it('does not attach explicitly linked evidence to a different record mentioned negatively in its text', () => {
    const tidyTides = { _id: 'tidy-tides', type: 'location', canonical_name: 'Tidy Tides Inn', tags: ['player-known', 'location:lodging'], details: { type: 'inn' } };
    const result = resolveMemoryReferences({
      facts: [{
        _id: 'clarification-fact',
        text: 'Not the Salty Tug. Kerrigan is staying at Tidy Tides Inn.',
        relatedLocationIds: ['tidy-tides'],
        memory: { gameClock: { day: 4, hour: 11, minute: 15 } },
      }],
      items: [], npcs: [], locations: [saltyTug, tidyTides], factions: [],
    }, 'Go back to the inn where Kerrigan has been staying.');

    const lodging = result.references.find((reference) => reference.key === 'lodging_location');
    expect(lodging?.status).toBe('resolved');
    expect(lodging?.selected?.name).toBe('Tidy Tides Inn');
    expect(lodging?.candidates.find((candidate) => candidate.name === 'The Salty Tug')?.evidence).toEqual([]);
  });

  it('resolves an explicitly named canonical item with ownership and memory tags intact', () => {
    const bag = {
      _id: 'bag-of-holding', type: 'item', canonical_name: 'Bag of Holding', aliases: ['Supervisor satchel'],
      tags: ['player-known', 'item:magic', 'rarity:uncommon', 'owner:player', 'source:sump-chapel'],
      details: {
        magical: true, rarity: 'uncommon', ownerName: 'Kerrigan Brynn',
        memory: { recordType: 'ITEM', tier: 'plot', ownerType: 'player' },
      },
    };
    const result = resolveMemoryReferences({
      facts: [], items: [bag], npcs: [], locations: [], factions: [],
    }, 'Kerrigan keeps the Bag of Holding and takes it to her mentor for examination.');

    const reference = result.references.find((entry) => entry.kind === 'item');
    expect(result.status).toBe('resolved');
    expect(reference?.selected?.id).toBe('bag-of-holding');
    expect(reference?.selected?.record.tags).toContain('owner:player');
    expect(reference?.selected?.record.details.memory.tier).toBe('plot');
  });

  it('does not turn ordinary possessive prose into a campaign location reference', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], npcs: [], locations: [bentNail], factions: [],
    }, 'You bargain like someone who has already decided what my shelf space is worth.');

    expect(result.status).toBe('resolved');
    expect(result.references).toEqual([]);
  });

  it('does not turn abstract recency idioms into campaign references', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], npcs: [], locations: [bentNail], factions: [],
    }, 'Make sure we are on the same page, honor the last word on our current plan, and return to form.');

    expect(result.status).toBe('resolved');
    expect(result.references).toEqual([]);
  });

  it('does not invent a location named page from the Old Vesper transaction follow-up', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], npcs: [], locations: [], factions: [],
    }, 'I talk to Vesper about the transaction we just agreed to. Make sure we are on the same page. Then I ask what he thinks the residue we found on the frame below is.');

    expect(result.status).toBe('resolved');
    expect(result.references.some((entry) => entry.key.includes('page'))).toBe(false);
  });

  it('continues to resolve typed implicit places, people, and items', () => {
    const workshop = { _id: 'workshop', type: 'location', canonical_name: "Old Vesper's place", tags: ['player-known', 'workshop'] };
    const mentor = { _id: 'mentor', type: 'npc', canonical_name: 'Old Vesper', tags: ['player-known', 'mentor'] };
    const component = { _id: 'component', type: 'item', canonical_name: 'Phase-Lock Prism', tags: ['player-known', 'component'] };
    const result = resolveMemoryReferences({
      locations: [workshop], npcs: [mentor], items: [component], factions: [],
      facts: [
        { text: "At Day 4, 11:40 AM, Kerrigan returned to Old Vesper's workshop.", relatedLocationIds: ['workshop'] },
        { text: 'Old Vesper is Kerrigan’s established mentor.', relatedEntityIds: ['mentor'] },
        { text: 'The Phase-Lock Prism is the component committed to the bracket.', relatedEntityIds: ['component'] },
      ],
    }, 'I go back to the workshop. I ask the same mentor. I examine the same component.');

    expect(result.status).toBe('resolved');
    expect(result.references.find((entry) => entry.kind === 'location')?.selected?.id).toBe('workshop');
    expect(result.references.find((entry) => entry.kind === 'npc')?.selected?.id).toBe('mentor');
    expect(result.references.find((entry) => entry.kind === 'item')?.selected?.id).toBe('component');
  });

  it('resolves a clarified role alias to the canonical NPC', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], locations: [], factions: [],
      npcs: [{
        _id: 'old-vesper', type: 'npc', canonical_name: 'Old Vesper', aliases: ['magic mentor'],
        tags: ['player-known', 'npc:canonical', 'role:magic-mentor'],
        details: { role: "Kerrigan Brynn's established magic mentor" },
      }],
    }, 'Then I go see my magic mentor.');

    expect(result.status).toBe('resolved');
    expect(result.references.find((entry) => entry.key === 'implicit_npc_magic_mentor')?.selected?.name).toBe('Old Vesper');
    expect(result.references.find((entry) => entry.key === 'implicit_npc_magic_mentor')?.selected?.matchedIdentity).toBe('magic mentor');
  });

  it('returns the exact location alias that bound prose to a canonical destination', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], npcs: [], factions: [],
      locations: [{
        _id: 'vesper-shop', type: 'location', canonical_name: "Old Vesper's Workshop",
        aliases: ["Old Vesper's place"], tags: ['player-known', 'location:workshop'],
      }],
    }, "Kerrigan reaches Old Vesper's place in the Dock Ward.");

    const reference = result.references.find((entry) => entry.kind === 'location');
    expect(reference?.status).toBe('resolved');
    expect(reference?.selected?.id).toBe('vesper-shop');
    expect(reference?.selected?.name).toBe("Old Vesper's Workshop");
    expect(reference?.selected?.matchedIdentity).toBe("Old Vesper's place");
  });

  it('marks an explicitly requested NPC-associated place unresolved when its typed Location entity is missing', () => {
    const result = resolveMemoryReferences({
      facts: [], items: [], locations: [], factions: [],
      npcs: [{
        _id: 'old-vesper', type: 'npc', canonical_name: 'Old Vesper', aliases: ['magic mentor'],
        details: { location: "Old Vesper's place" },
      }],
    }, "I leave the Bent Nail and go to Old Vesper's place.");

    const location = result.references.find((entry) => entry.key === 'linked_location_old_vesper');
    expect(result.status).toBe('clarification_required');
    expect(location?.kind).toBe('location');
    expect(location?.status).toBe('missing');
  });
});

describe('validateMemoryRestorationCandidate', () => {
  const priorResolution = {
    authority: 'gmc.campaign-memory', contractVersion: CAMPAIGN_MEMORY_CONTRACT_VERSION, status: 'clarification_required',
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

  it('keeps the revision stable when equivalent roster inputs arrive in a different order', () => {
    const scene = { _id: 'scene-1', updatedAt: '2026-07-19T12:00:00.000Z', presentNpcIds: ['thorne', 'rusk'] };
    const npcs = [
      { _id: 'thorne', canonical_name: 'Captain Thorne' },
      { _id: 'rusk', canonical_name: 'Ward-Reader Rusk' },
      { _id: 'hale', canonical_name: 'Constable Hale' },
    ];
    const reordered = buildScenePresenceContract(
      { ...scene, presentNpcIds: [...scene.presentNpcIds].reverse() },
      [...npcs].reverse(),
    );

    expect(reordered.revision).toBe(buildScenePresenceContract(scene, npcs).revision);
  });

  it('previews an exact destination roster without replacing current-scene authority', () => {
    const currentContract = buildScenePresenceContract({ _id: 'scene-docks', presentNpcIds: ['thorne'] }, [
      { _id: 'thorne', canonical_name: 'Captain Thorne' },
      { _id: 'vesper', canonical_name: 'Old Vesper' },
    ]);
    const proposed = buildProposedScenePresenceContract({
      currentContract,
      location: { _id: 'vesper-shop', canonical_name: "Old Vesper's Workshop" },
      presentNpcIds: ['vesper'],
      npcs: [{ _id: 'thorne', canonical_name: 'Captain Thorne' }, { _id: 'vesper', canonical_name: 'Old Vesper' }],
    });

    expect(proposed).toEqual(expect.objectContaining({
      authority: 'gmc.proposedScene.presentNpcIds',
      baseRevision: currentContract.revision,
      currentSceneId: 'scene-docks',
      locationId: 'vesper-shop',
      locationName: "Old Vesper's Workshop",
      exactPresentNpcIds: ['vesper'],
      valid: true,
    }));
    expect(proposed.presentNpcs.map((npc) => npc.name)).toEqual(['Old Vesper']);
    expect(proposed.knownNonPresentNpcs.map((npc) => npc.name)).toEqual(['Captain Thorne']);
  });

  it('keeps a proposed roster revision stable when a staged NPC is materialized into sorted canon order', () => {
    const currentContract = buildScenePresenceContract({ _id: 'scene-yard', presentNpcIds: ['dessa', 'factor'] }, [
      { _id: 'dessa', canonical_name: 'Dessa Krail' },
      { _id: 'factor', canonical_name: 'Factor Odran Vale' },
    ]);
    const location = { _id: 'flintwake-yard', canonical_name: 'Flintwake Wage Yard' };
    const stagedDorrik = { _id: 'dorrik', canonical_name: 'Dorrik Siltvein', aliases: ['Silt'] };
    const preview = buildProposedScenePresenceContract({
      currentContract,
      location,
      presentNpcIds: ['dessa', 'dorrik', 'factor'],
      npcs: [
        { _id: 'dessa', canonical_name: 'Dessa Krail' },
        { _id: 'factor', canonical_name: 'Factor Odran Vale' },
        stagedDorrik,
      ],
    });
    const materialized = buildProposedScenePresenceContract({
      currentContract,
      location,
      presentNpcIds: ['dessa', 'dorrik', 'factor'],
      npcs: [
        { _id: 'dessa', canonical_name: 'Dessa Krail' },
        stagedDorrik,
        { _id: 'factor', canonical_name: 'Factor Odran Vale' },
      ],
    });

    expect(materialized.revision).toBe(preview.revision);
    expect(materialized.presentNpcs.map((npc) => npc.id)).toEqual(['dessa', 'dorrik', 'factor']);
  });
});

describe('resolveSceneTransitionContract', () => {
  const currentContract = buildScenePresenceContract({ _id: 'bent-nail-scene', locationId: 'bent-nail', presentNpcIds: ['mara'] }, [
    { _id: 'mara', canonical_name: 'Mara Dusk' },
    { _id: 'vesper', canonical_name: 'Old Vesper', aliases: ['magic mentor'] },
  ]);
  const locations = [
    { _id: 'bent-nail', canonical_name: 'The Bent Nail' },
    { _id: 'vesper-place', canonical_name: "Old Vesper's place", aliases: ['Vesper place'] },
    { _id: 'dock-ward', canonical_name: 'Dock Ward' },
  ];
  const npcs = [
    { _id: 'mara', canonical_name: 'Mara Dusk' },
    { _id: 'vesper', canonical_name: 'Old Vesper', aliases: ['magic mentor'] },
  ];

  it('resolves one exact destination entity and roster without scoring generic memory references', () => {
    const contract = resolveSceneTransitionContract({
      currentContract,
      currentScene: { _id: 'bent-nail-scene', locationId: 'bent-nail', presentNpcIds: ['mara'] },
      locations,
      npcs,
      where: "Old Vesper’s place, Dock Ward, Waterdeep",
      who: ['Kerrigan Brynn', 'Old Vesper', 'Old Vesper'],
      playerCharacterNames: ['Kerrigan Brynn'],
    });

    expect(contract.status).toBe('resolved');
    expect(contract.transitionRequired).toBe(true);
    expect(contract.location).toEqual(expect.objectContaining({ id: 'vesper-place', name: "Old Vesper's place" }));
    expect(contract.presentNpcIds).toEqual(['vesper']);
    expect(contract.presenceContract.exactPresentNpcIds).toEqual(['vesper']);
    expect(contract.nonNpcActors).toEqual(['Kerrigan Brynn']);
  });

  it('stages a new search setting and mark under deterministic GMC identities without mutating canon', () => {
    const contract = resolveSceneTransitionContract({
      userId: 'player-1',
      campaignId: 'campaign-1',
      currentContract,
      currentScene: { _id: 'bent-nail-scene', locationId: 'bent-nail', presentNpcIds: ['mara'] },
      locations,
      npcs,
      instruction: 'I leave and go looking for a mark, someone cruel and self-absorbed.',
      where: 'Gullhook Market',
      who: ['Kerrigan Brynn', 'Darrin Vale'],
      playerCharacterNames: ['Kerrigan Brynn'],
      generatedEntities: [
        { entityType: 'location', mutationId: 'scene-location:gullhook', name: 'Gullhook Market', geographicTier: 'site', payload: { description: 'A crowded Dock Ward market.' } },
        { entityType: 'npc', mutationId: 'scene-npc:darrin', name: 'Darrin Vale', entityTier: 'contact', payload: { role: 'A cruel, self-important merchant selected as a possible mark.' } },
      ],
    });

    expect(contract.status).toBe('resolved');
    expect(contract.location.name).toBe('Gullhook Market');
    expect(contract.presentNpcs.map((npc) => npc.name)).toEqual(['Darrin Vale']);
    expect(contract.generatedEntities).toHaveLength(2);
    expect(contract.generatedEntities.map((entry) => entry.entityType).sort()).toEqual(['location', 'npc']);
    expect(contract.generatedEntityRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.presenceContract.valid).toBe(true);
    expect((contract.generatedEntities.find((entry) => entry.entityType === 'location') as any)?.input?.details?.description).toBe('A crowded Dock Ward market.');
    expect((contract.generatedEntities.find((entry) => entry.entityType === 'npc') as any)?.input?.details?.role).toMatch(/cruel, self-important merchant/);

    const replay = resolveSceneTransitionContract({
      userId: 'player-1',
      campaignId: 'campaign-1',
      currentContract,
      currentScene: { _id: 'bent-nail-scene', locationId: 'bent-nail', presentNpcIds: ['mara'] },
      locations,
      npcs,
      instruction: 'I leave and go looking for a mark, someone cruel and self-absorbed.',
      where: 'Gullhook Market',
      who: ['Kerrigan Brynn', 'Darrin Vale'],
      playerCharacterNames: ['Kerrigan Brynn'],
      generatedEntities: contract.generatedEntities,
    });
    expect(replay.generatedEntityRevision).toBe(contract.generatedEntityRevision);
    expect(replay.revision).toBe(contract.revision);
    expect(replay.presenceContract.revision).toBe(contract.presenceContract.revision);
  });

  it('deduplicates multiple aliases of one location but rejects multiple distinct primary locations', () => {
    const duplicateAlias = resolveSceneTransitionContract({
      currentContract, currentScene: { locationId: 'bent-nail' }, locations, npcs,
      where: 'Vesper place, Dock Ward', who: ['Kerrigan Brynn', 'magic mentor'], playerCharacterNames: ['Kerrigan Brynn'],
    });
    expect(duplicateAlias.location.id).toBe('vesper-place');
    expect(duplicateAlias.presentNpcIds).toEqual(['vesper']);

    expect(() => resolveSceneTransitionContract({
      currentContract, currentScene: { locationId: 'bent-nail' },
      locations: [...locations, { _id: 'other-vesper-place', canonical_name: 'Vesper place' }], npcs,
      where: 'Vesper place, Dock Ward', who: ['Kerrigan Brynn', 'Old Vesper'], playerCharacterNames: ['Kerrigan Brynn'],
    })).toThrowError(expect.objectContaining({ code: 'SCENE_DESTINATION_LOCATION_AMBIGUOUS' }));
  });

  it('fails closed when a declared actor is neither the identified player nor one canonical NPC', () => {
    expect(() => resolveSceneTransitionContract({
      currentContract, currentScene: { locationId: 'bent-nail' }, locations, npcs,
      where: "Old Vesper's place", who: ['Kerrigan Brynn', 'Old Vesper', 'Unknown Assistant'], playerCharacterNames: ['Kerrigan Brynn'],
    })).toThrowError(expect.objectContaining({ code: 'SCENE_DESTINATION_ROSTER_UNRESOLVED' }));
  });

  it('rejects a renamed destination even when the canonical name appears later in the declaration', () => {
    expect(() => resolveSceneTransitionContract({
      currentContract, currentScene: { locationId: 'bent-nail' }, locations, npcs,
      where: "Old Vesper's Workshop, also called Old Vesper's place", who: ['Kerrigan Brynn', 'Old Vesper'], playerCharacterNames: ['Kerrigan Brynn'],
    })).toThrowError(expect.objectContaining({ code: 'SCENE_DESTINATION_LOCATION_UNRESOLVED' }));
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

describe('buildNarrationEvidenceBundle', () => {
  it('returns compact query-specific evidence bound to the complete validation roster', () => {
    const npcs = [
      { _id: 'vesper', canonical_name: 'Old Vesper', aliases: ['Vesper'], details: { role: 'Watchmaker and covert route contact' } },
      { _id: 'mara', canonical_name: 'Mara Thorne', details: { role: 'Watch captain', motivation: 'Keep the courier route contained' } },
      ...Array.from({ length: 50 }, (_, index) => ({
        _id: `unrelated-${index}`,
        canonical_name: `Unrelated Canon NPC ${index}`,
      })),
    ];
    const instruction = 'Retcon that: stay invisible, send my familiar back to Mara, then follow Vesper. If enemies appear, fight nonlethally.';
    const result = buildNarrationEvidenceBundle({
      campaignId: 'campaign-1',
      instruction,
      intentTags: ['retcon', 'familiar', 'invisibility', 'follow', 'conditional_combat'],
      currentScene: {
        _id: 'scene-1',
        name: "Vesper's Workshop",
        locationId: 'workshop',
        presentNpcIds: ['vesper'],
        description: 'A narrow workshop opening onto a rain-dark alley.',
        updatedAt: '2026-07-23T10:00:00.000Z',
      },
      currentLocation: { _id: 'workshop', canonical_name: "Vesper's Workshop" },
      gameClock: { day: 3, hour: 21, minute: 10 },
      npcs,
      locations: [
        { _id: 'workshop', canonical_name: "Vesper's Workshop" },
        { _id: 'docks', canonical_name: 'South Docks' },
      ],
      facts: [
        { _id: 'familiar-fact', text: 'Mara recognizes the familiar and can receive a silent message.', relatedEntityIds: ['mara'], locked: true },
        { _id: 'unrelated-fact', text: 'The northern orchard blooms once each century.', locked: true },
      ],
      items: [
        { _id: 'seal', canonical_name: 'Vesper Seal', details: { description: 'A seal carried by Vesper.' } },
        ...Array.from({ length: 30 }, (_, index) => ({
          _id: `chair-${index}`,
          canonical_name: `Unrelated Chair ${index}`,
          details: { description: 'Ordinary furniture elsewhere.' },
        })),
      ],
      threads: [{ _id: 'thread-1', title: 'Follow Vesper', summary: 'Vesper may lead the group to the hidden route.', status: 'open' }],
      factions: [],
    });

    expect(result.evidence).toEqual(expect.objectContaining({
      authority: 'gmc.narration-evidence',
      contractVersion: NARRATION_EVIDENCE_CONTRACT_VERSION,
      campaignId: 'campaign-1',
    }));
    expect(result.evidence.evidenceRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(result.validation.evidenceRevision).toBe(result.evidence.evidenceRevision);
    expect(result.evidence.scene.presence.presentNpcs.map((npc: any) => npc.name)).toEqual(['Old Vesper']);
    expect(result.evidence.scene.presence.referencedNonPresentNpcs.map((npc: any) => npc.name)).toEqual(['Mara Thorne']);
    expect(result.evidence.canon.npcs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'vesper', role: 'Watchmaker and covert route contact', present: true }),
      expect.objectContaining({ id: 'mara', role: 'Watch captain', present: false }),
    ]));
    expect(result.validation.scenePresenceContract.knownNonPresentNpcs).toHaveLength(51);
    expect(JSON.stringify(result.evidence)).not.toContain('Unrelated Canon NPC 49');
    expect(JSON.stringify(result.evidence)).not.toContain('Unrelated Chair 29');
    expect(Buffer.byteLength(JSON.stringify(result.evidence), 'utf8')).toBeLessThan(16_000);
  });

  it('changes the evidence revision when canon selected for the interaction changes', () => {
    const base = {
      campaignId: 'campaign-1',
      instruction: 'Follow Vesper.',
      currentScene: { _id: 'scene-1', presentNpcIds: ['vesper'] },
      npcs: [{ _id: 'vesper', canonical_name: 'Old Vesper' }],
      locations: [],
      items: [],
      threads: [],
      factions: [],
    };
    const first = buildNarrationEvidenceBundle({
      ...base,
      facts: [{ _id: 'route', text: 'Vesper uses the east route.', relatedEntityIds: ['vesper'] }],
    });
    const second = buildNarrationEvidenceBundle({
      ...base,
      facts: [{ _id: 'route', text: 'Vesper uses the west route.', relatedEntityIds: ['vesper'] }],
    });

    expect(first.evidence.evidenceRevision).not.toBe(second.evidence.evidenceRevision);
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
