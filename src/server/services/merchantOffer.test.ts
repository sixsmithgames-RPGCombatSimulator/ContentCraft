import { describe, expect, it } from 'vitest';
import {
  commitMerchantOffers,
  compensateMerchantMutation,
  consumeMerchantOffer,
  preflightMerchantOffers,
  resolveMerchantPurchase,
} from './merchantOffer.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fakeMerchantCollection() {
  let document: Record<string, any> | null = null;
  return {
    async findOne(filter: Record<string, any>) {
      if (!document) return null;
      if (filter.userId && filter.userId !== document.userId) return null;
      if (filter.campaignId && filter.campaignId !== document.campaignId) return null;
      return clone(document);
    },
    async insertOne(value: Record<string, any>) {
      if (document) throw Object.assign(new Error('duplicate'), { code: 11000 });
      document = clone(value);
      return { acknowledged: true };
    },
    async updateOne(filter: Record<string, any>, update: Record<string, any>) {
      if (!document || filter._id !== document._id || filter.stateRevision !== document.stateRevision) {
        return { modifiedCount: 0 };
      }
      document = { ...document, ...clone(update.$set ?? {}) };
      return { modifiedCount: 1 };
    },
    snapshot() {
      return document ? clone(document) : null;
    },
  };
}

const goggles = {
  seller: { name: 'Falia', entityId: 'npc-falia' },
  item: {
    name: 'Goggles of Night',
    aliases: ['goggles', 'night goggles'],
    quantity: 1,
    type: 'wondrous item',
    rarity: 'uncommon',
    magical: true,
  },
  price: { sp: 50, gp: 245, pp: 5 },
  sceneId: 'scene-shop',
};

async function committedOffer(merchantCollection: ReturnType<typeof fakeMerchantCollection>) {
  const preflight = preflightMerchantOffers({ proposals: [goggles] });
  const result = await commitMerchantOffers({
    merchantCollection,
    userId: 'user-1',
    campaignId: 'campaign-1',
    mutationId: 'offer-mutation-1',
    expectedFingerprint: preflight.fingerprint,
    proposals: [goggles],
  });
  return result.contract.committed[0];
}

describe('merchant offer authority', () => {
  it('commits an exact offer idempotently', async () => {
    const merchantCollection = fakeMerchantCollection();
    const preflight = preflightMerchantOffers({ proposals: [goggles] });
    const request = {
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      mutationId: 'offer-mutation-1',
      expectedFingerprint: preflight.fingerprint,
      proposals: [goggles],
    };
    const first = await commitMerchantOffers(request);
    const replay = await commitMerchantOffers(request);

    expect(first.duplicate).toBe(false);
    expect(first.contract.committed[0]).toMatchObject({
      status: 'active',
      item: { name: 'Goggles of Night' },
      price: { totalCp: 30_000 },
    });
    expect(replay.duplicate).toBe(true);
    expect(merchantCollection.snapshot()?.offers).toHaveLength(1);
  });

  it('reactivates the same exact offer when a compensated transaction is safely retried', async () => {
    const merchantCollection = fakeMerchantCollection();
    const offer = await committedOffer(merchantCollection);
    const compensation = await compensateMerchantMutation({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      originalMutationId: 'offer-mutation-1',
      compensationId: 'compensate-offer-1',
    });
    expect(compensation).toMatchObject({ compensated: true, changed: true });
    expect(merchantCollection.snapshot()?.offers[0].status).toBe('reverted');

    const preflight = preflightMerchantOffers({ proposals: [goggles] });
    const retried = await commitMerchantOffers({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      mutationId: 'offer-mutation-1',
      expectedFingerprint: preflight.fingerprint,
      proposals: [goggles],
    });
    expect(retried).toMatchObject({ duplicate: false, reapplied: true });
    expect(retried.contract.committed[0]).toMatchObject({
      offerId: offer.offerId,
      status: 'active',
      revision: 3,
    });
  });

  it('resolves a player reference through explicit aliases and preserves the exact price', async () => {
    const merchantCollection = fakeMerchantCollection();
    const offer = await committedOffer(merchantCollection);
    const result = await resolveMerchantPurchase({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      itemName: 'goggles',
      quantity: 1,
      currency: { cp: 0, sp: -50, ep: 0, gp: -245, pp: -5 },
    });

    expect(result).toMatchObject({
      status: 'resolved',
      offer: { offerId: offer.offerId, item: { name: 'Goggles of Night' } },
      price: { totalCp: 30_000 },
    });
    if (result.status !== 'resolved') throw new Error('Expected a resolved purchase.');
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns a specific clarification when no active offer matches', async () => {
    const merchantCollection = fakeMerchantCollection();
    await committedOffer(merchantCollection);
    const result = await resolveMerchantPurchase({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      itemName: 'boots',
      currency: { gp: -1 },
    });

    expect(result).toMatchObject({
      status: 'clarification_required',
      code: 'MERCHANT_OFFER_NOT_FOUND',
    });
    if (result.status !== 'clarification_required') throw new Error('Expected a merchant clarification.');
    expect(result.question).toContain('Goggles of Night from Falia');
  });

  it('rejects a price mismatch with exact expected and proposed totals', async () => {
    const merchantCollection = fakeMerchantCollection();
    await committedOffer(merchantCollection);
    await expect(resolveMerchantPurchase({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      itemName: 'goggles',
      currency: { gp: -245 },
    })).rejects.toMatchObject({
      code: 'MERCHANT_OFFER_PRICE_MISMATCH',
      details: { proposedPaymentCp: 24_500 },
    });
  });

  it('consumes once, rejects stale availability, and can compensate without erasing history', async () => {
    const merchantCollection = fakeMerchantCollection();
    const offer = await committedOffer(merchantCollection);
    const preflight = await resolveMerchantPurchase({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      itemName: 'goggles',
      currency: { sp: -50, gp: -245, pp: -5 },
    });
    if (preflight.status !== 'resolved') throw new Error('Expected a resolved purchase.');
    const request = {
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      offerId: offer.offerId,
      expectedOfferRevision: offer.revision,
      expectedPurchaseFingerprint: preflight.fingerprint,
      mutationId: 'purchase-mutation-1',
      itemName: 'goggles',
      currency: { sp: -50, gp: -245, pp: -5 },
      sheetMutationReceipt: { revision: 'vcs-revision-after-purchase' },
    };
    const first = await consumeMerchantOffer(request);
    const replay = await consumeMerchantOffer(request);

    expect(first.purchase.offer.status).toBe('sold');
    expect(replay.duplicate).toBe(true);
    await expect(consumeMerchantOffer({
      ...request,
      mutationId: 'purchase-mutation-2',
    })).rejects.toMatchObject({ code: 'MERCHANT_PURCHASE_CONTRACT_STALE' });
    const compensation = await compensateMerchantMutation({
      merchantCollection,
      userId: 'user-1',
      campaignId: 'campaign-1',
      originalMutationId: 'purchase-mutation-1',
      compensationId: 'compensate-purchase-1',
    });
    expect(compensation).toMatchObject({ compensated: true, changed: true });
    expect(merchantCollection.snapshot()?.offers[0]).toMatchObject({
      status: 'active',
      soldByMutationId: null,
      revision: 3,
    });
  });
});
