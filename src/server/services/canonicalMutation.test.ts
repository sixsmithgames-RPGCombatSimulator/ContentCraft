import { describe, expect, it } from 'vitest';
import {
  CanonicalMutationError,
  canonicalSemanticFingerprint,
  insertCanonicalMutation,
} from './canonicalMutation.js';

function collection() {
  const records: Array<Record<string, any>> = [];
  const matches = (record: Record<string, any>, filter: Record<string, any>): boolean => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((branch: Record<string, any>) => matches(record, branch));
    return record[key] === value;
  });
  return {
    records,
    async findOne(filter: Record<string, any>) { return records.find((record) => matches(record, filter)) ?? null; },
    async insertOne(document: Record<string, any>) {
      if (records.some((record) => record._id === document._id || record.canonicalFingerprint === document.canonicalFingerprint)) {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
      records.push(document);
      return { acknowledged: true };
    },
  };
}

function insert(store: ReturnType<typeof collection>, mutationId: string, input: Record<string, any>) {
  return insertCanonicalMutation({
    collection: store,
    userId: 'user-1',
    campaignId: 'campaign-1',
    recordKind: 'FACT',
    mutationId,
    input,
    now: () => new Date('2026-07-16T12:00:00.000Z'),
    buildDocument: ({ documentId, timestamp, semanticFingerprint, creationMutation }) => ({
      _id: documentId,
      userId: 'user-1',
      campaignId: 'campaign-1',
      ...input,
      canonicalFingerprint: semanticFingerprint,
      creationMutation,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  });
}

describe('canonical mutation writes', () => {
  it('ignores volatile tracing fields in the semantic fingerprint', () => {
    expect(canonicalSemanticFingerprint('FACT', {
      text: 'The gate is sealed.',
      source: { system: 'gma', correlationId: 'first' },
      updatedAt: 'first',
    })).toBe(canonicalSemanticFingerprint('FACT', {
      source: { correlationId: 'retry', system: 'gma' },
      text: 'The gate is sealed.',
      updatedAt: 'retry',
    }));
  });

  it('returns the original record for a lost-response retry', async () => {
    const store = collection();
    const first = await insert(store, 'canon-1', { text: 'The gate is sealed.' });
    const retry = await insert(store, 'canon-1', { text: 'The gate is sealed.' });
    expect(first.duplicate).toBe(false);
    expect(retry).toMatchObject({ duplicate: true, duplicateReason: 'mutation_replay' });
    expect(retry.record._id).toBe(first.record._id);
    expect(store.records).toHaveLength(1);
  });

  it('deduplicates the same canon meaning even when a caller supplies a new mutationId', async () => {
    const store = collection();
    const first = await insert(store, 'canon-1', { text: 'The gate is sealed.' });
    const retry = await insert(store, 'canon-2', { text: 'The gate is sealed.' });
    expect(retry).toMatchObject({ duplicate: true, duplicateReason: 'semantic_duplicate' });
    expect(retry.record._id).toBe(first.record._id);
    expect(store.records).toHaveLength(1);
  });

  it('collapses concurrent double-submits into one durable canon record', async () => {
    const store = collection();
    const [left, right] = await Promise.all([
      insert(store, 'canon-concurrent', { text: 'The gate is sealed.' }),
      insert(store, 'canon-concurrent', { text: 'The gate is sealed.' }),
    ]);
    expect([left.duplicate, right.duplicate].sort()).toEqual([false, true]);
    expect(left.record._id).toBe(right.record._id);
    expect(store.records).toHaveLength(1);
  });

  it('rejects reuse of one mutationId with different canon data', async () => {
    const store = collection();
    await insert(store, 'canon-1', { text: 'The gate is sealed.' });
    await expect(insert(store, 'canon-1', { text: 'The gate is open.' }))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' } satisfies Partial<CanonicalMutationError>);
    expect(store.records).toHaveLength(1);
  });
});
