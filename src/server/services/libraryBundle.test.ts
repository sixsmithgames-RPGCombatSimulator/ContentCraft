import { describe, expect, it } from 'vitest';
import { createLibraryBundle, createLibraryImportPlan, LIBRARY_BUNDLE_SCHEMA } from './libraryBundle.js';
import type { CanonEntity } from '../models/CanonEntity.js';

const city: CanonEntity = {
  _id: 'lib.location.waterdeep',
  userId: 'private-user',
  scope: 'lib',
  type: 'location',
  canonical_name: 'Waterdeep',
  aliases: ['City of Splendors'],
  relationships: [],
  claims: [{ text: 'Waterdeep is a major Sword Coast city.', source: 'Official source' }],
  tags: ['waterdeep'],
  version: '1.0.0',
};

const ward: CanonEntity = {
  _id: 'lib.location.dock_ward',
  userId: 'private-user',
  scope: 'lib',
  type: 'location',
  canonical_name: 'Dock Ward',
  aliases: [],
  relationships: [{ target_id: city._id, kind: 'part_of' }],
  claims: [{ text: 'Dock Ward occupies the working waterfront.', source: 'Official source' }],
  tags: ['waterdeep', 'ward'],
  version: '1.0.0',
};

describe('GMC library bundles', () => {
  it('exports collection dependencies without tenant IDs or embeddings', () => {
    const bundle = createLibraryBundle({
      _id: 'collection.dock_ward', userId: 'private-user', name: 'Dock Ward',
      description: 'Dock Ward canon', entity_ids: [ward._id], created_at: new Date(), updated_at: new Date(),
    }, [ward, city], [{
      _id: `${ward._id}#c1`, userId: 'private-user', entity_id: ward._id,
      text: ward.claims[0].text, metadata: { source: 'Official source' }, embedding: [0.1, 0.2],
    }]);

    expect(bundle.schema).toBe(LIBRARY_BUNDLE_SCHEMA);
    expect(bundle.collection.entity_ids).toEqual([ward._id]);
    expect(bundle.dependency_entity_ids).toEqual([city._id]);
    expect(bundle.entities).toHaveLength(2);
    expect(bundle.entities[0]).not.toHaveProperty('userId');
    expect(bundle.chunks[0]).not.toHaveProperty('embedding');
  });

  it('imports stable library IDs, relationships, membership, and supplied chunks', () => {
    const exported = createLibraryBundle({
      _id: 'collection.dock_ward', name: 'Dock Ward', description: 'Dock Ward canon',
      entity_ids: [ward._id], created_at: new Date(), updated_at: new Date(),
    }, [ward, city], [{
      _id: `${ward._id}#c9`, entity_id: ward._id, text: 'Searchable waterfront detail.', metadata: { tags: ['harbor'] },
    }]);
    const plan = createLibraryImportPlan(exported);

    expect(plan.collection._id).toBe('collection.dock_ward');
    expect(plan.collection.entity_ids).toEqual(['lib.location.dock_ward']);
    expect(plan.dependencyEntityIds).toEqual(['lib.location.waterdeep']);
    expect(plan.entities.find((entity) => entity.canonical_name === 'Dock Ward')?.relationships[0].target_id)
      .toBe('lib.location.waterdeep');
    expect(plan.chunks.find((chunk) => chunk.entity_id === ward._id)?.text).toBe('Searchable waterfront detail.');
  });

  it('rejects malformed and duplicate canonical identities', () => {
    expect(() => createLibraryImportPlan({ schema: 'wrong' })).toThrow();
    const exported = createLibraryBundle({
      _id: 'collection.dupes', name: 'Dupes', description: 'Duplicate test',
      entity_ids: [ward._id], created_at: new Date(), updated_at: new Date(),
    }, [ward, { ...ward, _id: 'legacy.other-id' }], []);
    expect(() => createLibraryImportPlan(exported)).toThrow(/duplicate canonical entity identity/i);
  });
});
