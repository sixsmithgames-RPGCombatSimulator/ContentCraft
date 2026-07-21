import { describe, expect, it } from 'vitest';
import {
  WATERDEEP_COLLECTION_ID,
  WATERDEEP_CANON_COLLECTIONS,
  WATERDEEP_CANON_ENTITIES,
  WATERDEEP_CIVIC_ENTITIES,
  WATERDEEP_HIGH_LEVEL_COLLECTION,
  WATERDEEP_HIGH_LEVEL_ENTITIES,
} from './waterdeepCanon.js';

describe('Waterdeep high-level canon pack', () => {
  it('contains the city, every ward layer, and the major underground gateways', () => {
    const names = new Set(WATERDEEP_HIGH_LEVEL_ENTITIES.map((entity) => entity.canonical_name));

    expect(Array.from(names)).toEqual(expect.arrayContaining([
      'Waterdeep',
      'Castle Ward',
      'Dock Ward',
      'Trades Ward',
      'North Ward',
      'Sea Ward',
      'Southern Ward',
      'City of the Dead',
      'Field Ward',
      'Deepwater Harbor',
      'Mount Waterdeep',
      'The Yawning Portal',
      'Undermountain',
      'Skullport',
      'Lords of Waterdeep',
      'City Watch of Waterdeep',
    ]));
  });

  it('uses unique library IDs and only relationships resolved by this pack', () => {
    const ids = WATERDEEP_HIGH_LEVEL_ENTITIES.map((entity) => entity._id);
    const idSet = new Set(ids);

    expect(idSet.size).toBe(ids.length);
    for (const entity of WATERDEEP_HIGH_LEVEL_ENTITIES) {
      expect(entity._id.startsWith('lib.')).toBe(true);
      for (const relationship of entity.relationships ?? []) {
        expect(idSet.has(relationship.target_id)).toBe(true);
      }
    }
  });

  it('keeps claims atomic, attributed, era-scoped, and campaign-neutral', () => {
    for (const entity of WATERDEEP_HIGH_LEVEL_ENTITIES) {
      expect(entity.era).toBe('late-15th-century-dr');
      expect(entity.region).toBe('sword-coast');
      expect(entity.claims.length).toBeGreaterThanOrEqual(3);
      for (const entityClaim of entity.claims) {
        expect(entityClaim.text.length).toBeGreaterThan(20);
        expect(entityClaim.source.length).toBeGreaterThan(20);
        expect(entityClaim.text).not.toMatch(/Kerrigan|Old One|black tube|campaign truth/i);
      }
    }
  });

  it('collects every entity into one stable expansion unit', () => {
    expect(WATERDEEP_HIGH_LEVEL_COLLECTION._id).toBe(WATERDEEP_COLLECTION_ID);
    expect(new Set(WATERDEEP_HIGH_LEVEL_COLLECTION.entity_ids)).toEqual(
      new Set(WATERDEEP_HIGH_LEVEL_ENTITIES.map((entity) => entity._id)),
    );
  });

  it('adds a separate civic and landmark detail layer with resolved relationships', () => {
    const allIds = new Set(WATERDEEP_CANON_ENTITIES.map((entity) => entity._id));
    const detailNames = WATERDEEP_CIVIC_ENTITIES.map((entity) => entity.canonical_name);

    expect(detailNames).toEqual(expect.arrayContaining([
      'Castle Waterdeep',
      'Palace of Waterdeep',
      'Blackstaff Tower',
      'Walking Statues of Waterdeep',
      'Field of Triumph',
      'Waterdeep Code Legal',
      'City Guard of Waterdeep',
      'Griffon Cavalry of Waterdeep',
      'Force Grey',
      'Watchful Order of Magists and Protectors',
    ]));
    for (const entity of WATERDEEP_CIVIC_ENTITIES) {
      expect(entity.details?.canonLayer).toBe('civic-detail');
      for (const relationship of entity.relationships ?? []) {
        expect(allIds.has(relationship.target_id)).toBe(true);
      }
    }
    expect(WATERDEEP_CANON_COLLECTIONS).toHaveLength(2);
  });
});
