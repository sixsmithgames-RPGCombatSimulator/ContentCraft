import { describe, expect, it } from 'vitest';
import { findMechanicsLedger, upsertMechanicsLedger } from './mechanicsLedger.js';

function fakeCollection() {
  const records = new Map<string, any>();
  const key = (filter: any) => `${filter.userId}\0${filter.campaignId}\0${filter.interactionId}`;
  return {
    async findOne(filter: any) {
      return records.get(key(filter)) ?? null;
    },
    async insertOne(document: any) {
      records.set(key(document), document);
      return { acknowledged: true, insertedId: document.interactionId };
    },
    async updateOne(filter: any, update: any) {
      const current = records.get(key(filter));
      const next = {
        ...(current ?? filter),
        ...(update.$set ?? {}),
        ...(current ? {} : (update.$setOnInsert ?? {})),
      };
      records.set(key(filter), next);
      return {
        acknowledged: true,
        matchedCount: current ? 1 : 0,
        modifiedCount: 1,
        upsertedCount: current ? 0 : 1,
        upsertedId: current ? null : filter.interactionId,
      };
    },
  };
}

const input = {
  userId: 'user-1',
  campaignId: 'campaign-1',
  interactionId: 'interaction-1',
  kind: 'combat_action' as const,
  requestFingerprint: 'fingerprint-1',
  request: { campaignId: 'campaign-1', sessionId: 'room-1', conversationHistory: [] },
  response: { mechanicsSaved: true, mechanicalResult: { hit: true }, rollRequest: { interactionId: 'interaction-1', kind: 'combat_action' } },
};

describe('GMA mechanics ledger', () => {
  it('stores a receipt durably and replays an identical upsert', async () => {
    const store = fakeCollection();
    const first = await upsertMechanicsLedger({ ...input, store });
    const second = await upsertMechanicsLedger({ ...input, store, response: { ...input.response, narrationFailure: { retryable: true } } });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect((await findMechanicsLedger({ store, userId: input.userId, campaignId: input.campaignId, interactionId: input.interactionId }))?.response.narrationFailure).toEqual({ retryable: true });
  });

  it('rejects a different request under the same interaction identity', async () => {
    const store = fakeCollection();
    await upsertMechanicsLedger({ ...input, store });
    await expect(upsertMechanicsLedger({ ...input, store, requestFingerprint: 'different' })).rejects.toMatchObject({ code: 'GMA_MECHANICS_LEDGER_CONFLICT', status: 409 });
  });
});
