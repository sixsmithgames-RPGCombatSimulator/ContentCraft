import { describe, expect, it } from 'vitest';

import {
  assessNpcIdentity,
  generateStableNpcName,
  maxNpcMechanicalDepth,
  maxNpcNarrativeDepth,
  normalizeNpcIdentitySeed,
} from './npcIdentity.js';

describe('NPC identity policy', () => {
  it.each([
    'Anchor Handler One',
    'Below-route crate dragger',
    'Unidentified Black-Seal Ledger-Carrier',
    'Blue-Headscarf Watcher',
    'Dockside enforcer',
    'The Quartermaster',
    'The imprisoned gnome',
  ])('classifies %s as a role descriptor', (name) => {
    expect(assessNpcIdentity(name).kind).toBe('role_descriptor');
  });

  it.each([
    ['Captain Elara Thorne', 'personal_name'],
    ['Ward-Reader Elowen Rusk', 'personal_name'],
    ['Durn', 'mononym'],
    ['The Old One', 'public_alias'],
    ['Old Vesper', 'public_alias'],
  ])('preserves legitimate identity %s', (name, kind) => {
    expect(assessNpcIdentity(name).kind).toBe(kind);
  });

  it('creates a stable hidden identity while preserving the player-facing label', () => {
    const first = normalizeNpcIdentitySeed({
      name: 'Blue-Headscarf Watcher',
      role: 'Gilded Hands lookout',
      details: { location: 'Dock Ward' },
    }, { campaignId: 'campaign-1', mutationId: 'scene-actor-1' });
    const replay = normalizeNpcIdentitySeed({
      name: 'Blue-Headscarf Watcher',
      role: 'Gilded Hands lookout',
      details: { location: 'Dock Ward' },
    }, { campaignId: 'campaign-1', mutationId: 'scene-actor-1' });

    expect(first.name).toBe(replay.name);
    expect(first.name).not.toBe('Blue-Headscarf Watcher');
    expect(first.aliases).toContain('Blue-Headscarf Watcher');
    expect(first.details.displayLabel).toBe('Blue-Headscarf Watcher');
    expect(first.details.identity.nameKnownToPlayers).toBe(false);
    expect(first.details.profession).toBe('Gilded Hands lookout');
    expect(first.details.narrativeDepth).toBe('surface');
    expect(first.details.mechanicalDepth).toBe('none');
  });

  it('does not manufacture a mechanical title note for an ordinary job', () => {
    const result = normalizeNpcIdentitySeed({ name: 'Jessa Marr', title: 'Captain', profession: 'harbor pilot' }, {
      campaignId: 'campaign-1', mutationId: 'captain-1',
    });
    expect(result.details.mechanicalTitleBasis).toBeUndefined();
  });

  it('records title mechanics only when the build supplies them', () => {
    const result = normalizeNpcIdentitySeed({
      name: 'Jessa Marr', title: 'Captain', profession: 'Watch officer', class_levels: [{ class: 'Fighter', level: 5 }], hit_dice: '5d10',
    }, { campaignId: 'campaign-1', mutationId: 'captain-2' });
    expect(result.details.mechanicalTitleBasis).toMatchObject({ title: 'Captain', hitDice: '5d10', source: 'explicit_npc_mechanics' });
  });

  it.each(['Red-thread dice players', 'The Red-Thread Players'])('rejects collective label %s as one NPC', (name) => {
    expect(() => normalizeNpcIdentitySeed({ name }, { campaignId: 'campaign-1' }))
      .toThrow(/group label/i);
  });

  it('keeps profile depth monotonic', () => {
    expect(maxNpcNarrativeDepth('developed', 'surface')).toBe('developed');
    expect(maxNpcMechanicalDepth('combat_ready', 'template')).toBe('combat_ready');
  });

  it('avoids occupied generated names', () => {
    const first = generateStableNpcName('same-seed');
    expect(generateStableNpcName('same-seed', [first])).not.toBe(first);
  });
});
