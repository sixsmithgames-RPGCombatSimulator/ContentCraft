import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../config/mongo.js';

export const MERCHANT_OFFER_CONTRACT_VERSION = '2026-07-30.1';
export const MERCHANT_OFFER_AUTHORITY = 'gmc.merchant-offer';
export const MERCHANT_PURCHASE_AUTHORITY = 'gmc.merchant-purchase';

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const COIN_VALUE_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1_000 } as const;

type MerchantDocument = Record<string, any>;
type MerchantCollection = {
  findOne(filter: Record<string, unknown>): Promise<MerchantDocument | null>;
  insertOne(document: MerchantDocument): Promise<unknown>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount?: number }>;
};

export class MerchantOfferError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'MerchantOfferError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function collection(): MerchantCollection {
  return getDb().collection('gmc_merchant_offers') as unknown as MerchantCollection;
}

function cleanText(value: unknown, maximum = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function requireText(value: unknown, name: string, maximum = 254) {
  const normalized = cleanText(value, maximum);
  if (!normalized) throw new MerchantOfferError(400, 'VALIDATION_ERROR', `${name} is required.`);
  return normalized;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function referenceKey(value: unknown) {
  return cleanText(value, 200)
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePrice(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const denominations = Object.fromEntries(COINS.map((coin) => [coin, Math.max(0, integer(source[coin]))]));
  const totalCp = COINS.reduce((sum, coin) => sum + denominations[coin] * COIN_VALUE_CP[coin], 0);
  if (totalCp < 1) {
    throw new MerchantOfferError(400, 'MERCHANT_OFFER_PRICE_REQUIRED', 'A merchant offer requires a positive coin price.');
  }
  return { ...denominations, totalCp };
}

export function normalizeMerchantOfferProposal(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  const sellerSource = source.seller && typeof source.seller === 'object' ? source.seller : {};
  const itemSource = source.item && typeof source.item === 'object' ? source.item : {};
  const name = requireText(itemSource.name ?? source.itemName, 'item.name', 200);
  const aliases = [...new Set([
    name,
    ...(Array.isArray(itemSource.aliases) ? itemSource.aliases : []),
    ...(Array.isArray(source.referenceLabels) ? source.referenceLabels : []),
  ].map((entry) => cleanText(entry, 200)).filter(Boolean))];
  return {
    seller: {
      name: requireText(sellerSource.name ?? source.sellerName, 'seller.name', 200),
      entityId: cleanText(sellerSource.entityId ?? source.sellerId, 254) || null,
    },
    item: {
      name,
      aliases,
      quantity: Math.max(1, Math.min(999, integer(itemSource.quantity ?? source.quantity) || 1)),
      canonicalItemId: cleanText(itemSource.canonicalItemId, 254) || null,
      type: cleanText(itemSource.type, 80) || null,
      rarity: cleanText(itemSource.rarity, 40) || null,
      magical: itemSource.magical === true,
      description: cleanText(itemSource.description, 1_000) || null,
    },
    price: normalizePrice(source.price),
    sceneId: cleanText(source.sceneId, 254) || null,
    locationId: cleanText(source.locationId, 254) || null,
    notes: cleanText(source.notes, 500) || null,
  };
}

function publicOffer(offer: Record<string, any>) {
  return {
    authority: MERCHANT_OFFER_AUTHORITY,
    contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
    offerId: offer.offerId,
    revision: offer.revision,
    status: offer.status,
    seller: structuredClone(offer.seller),
    item: structuredClone(offer.item),
    price: structuredClone(offer.price),
    sceneId: offer.sceneId ?? null,
    locationId: offer.locationId ?? null,
    notes: offer.notes ?? null,
    createdAt: offer.createdAt,
    soldAt: offer.soldAt ?? null,
  };
}

function publicContract(document: MerchantDocument, extra: Record<string, unknown> = {}): Record<string, any> {
  return {
    authority: MERCHANT_OFFER_AUTHORITY,
    contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
    stateRevision: Number(document.stateRevision ?? 0),
    offers: (Array.isArray(document.offers) ? document.offers : []).map(publicOffer),
    ...extra,
  };
}

function requestFingerprint(value: unknown) {
  return fingerprint(value);
}

async function retryingUpdate<T>(action: () => Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await action();
    if (result) return result;
  }
  throw new MerchantOfferError(
    409,
    'MERCHANT_OFFER_CONFLICT',
    'Merchant offers changed during this request. Refresh and retry.',
  );
}

async function loadOrCreate(
  offers: MerchantCollection,
  userId: string,
  campaignId: string,
  now: () => Date,
) {
  const existing = await offers.findOne({ userId, campaignId });
  if (existing) return existing;
  const timestamp = now();
  const initial = {
    _id: randomUUID(),
    userId,
    campaignId,
    stateRevision: 1,
    offers: [],
    mutationLedger: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    await offers.insertOne(initial);
    return initial;
  } catch (error: any) {
    if (error?.code === 11000) {
      const raced = await offers.findOne({ userId, campaignId });
      if (raced) return raced;
    }
    throw error;
  }
}

export function preflightMerchantOffers(input: { proposals: unknown[] }) {
  const proposals = (Array.isArray(input.proposals) ? input.proposals : [])
    .slice(0, 20)
    .map(normalizeMerchantOfferProposal);
  if (!proposals.length) {
    throw new MerchantOfferError(400, 'MERCHANT_OFFER_REQUIRED', 'At least one merchant offer is required.');
  }
  return {
    authority: MERCHANT_OFFER_AUTHORITY,
    contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
    valid: true,
    fingerprint: fingerprint(proposals),
    proposals,
  };
}

export async function commitMerchantOffers(input: {
  merchantCollection?: MerchantCollection;
  userId: string;
  campaignId: string;
  mutationId: string;
  expectedFingerprint: string;
  proposals: unknown[];
  now?: () => Date;
}) {
  const offers = input.merchantCollection ?? collection();
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const mutationId = requireText(input.mutationId, 'mutationId');
  const expectedFingerprint = requireText(input.expectedFingerprint, 'expectedFingerprint', 128);
  const preflight = preflightMerchantOffers({ proposals: input.proposals });
  if (preflight.fingerprint !== expectedFingerprint) {
    throw new MerchantOfferError(
      409,
      'MERCHANT_OFFER_PREFLIGHT_MISMATCH',
      'The merchant offers changed after preflight. Reconcile the result again.',
    );
  }
  const now = input.now ?? (() => new Date());
  const requestHash = requestFingerprint({ mutationId, expectedFingerprint, proposals: preflight.proposals });

  return retryingUpdate(async () => {
    const existing = await loadOrCreate(offers, userId, campaignId, now);
    const prior = (Array.isArray(existing.mutationLedger) ? existing.mutationLedger : [])
      .find((entry: any) => entry.mutationId === mutationId);
    if (prior) {
      if (prior.requestFingerprint !== requestHash) {
        throw new MerchantOfferError(409, 'IDEMPOTENCY_CONFLICT', 'This merchant mutation ID was already used for different offers.');
      }
      const committed = (Array.isArray(existing.offers) ? existing.offers : [])
        .filter((offer: any) => offer.createdByMutationId === mutationId);
      if (committed.length && committed.every((offer: any) => offer.status === 'reverted')) {
        const timestamp = now();
        const committedIds = new Set(committed.map((offer: any) => offer.offerId));
        const nextOffers = existing.offers.map((offer: any) => committedIds.has(offer.offerId)
          ? { ...offer, status: 'active', revision: Number(offer.revision) + 1, updatedAt: timestamp }
          : offer);
        const reappliedReceipt = {
          mutationId: `${mutationId}:reapply:${Number(existing.stateRevision ?? 0) + 1}`,
          operation: 'reapply_offers',
          originalMutationId: mutationId,
          requestFingerprint: requestHash,
          offerIds: [...committedIds],
          at: timestamp,
        };
        const ledger = [...existing.mutationLedger, reappliedReceipt].slice(-500);
        const update = await offers.updateOne(
          { _id: existing._id, stateRevision: existing.stateRevision },
          {
            $set: {
              offers: nextOffers,
              mutationLedger: ledger,
              stateRevision: Number(existing.stateRevision ?? 0) + 1,
              updatedAt: timestamp,
            },
          },
        );
        if (!update.modifiedCount) return null;
        const reactivated = nextOffers.filter((offer: any) => committedIds.has(offer.offerId));
        const next = { ...existing, offers: nextOffers, mutationLedger: ledger, stateRevision: Number(existing.stateRevision ?? 0) + 1 };
        return { contract: publicContract(next, { committed: reactivated.map(publicOffer) }), duplicate: false, reapplied: true };
      }
      return { contract: publicContract(existing, { committed: committed.map(publicOffer) }), duplicate: true };
    }

    const timestamp = now();
    const committed = preflight.proposals.map((proposal, index) => ({
      ...structuredClone(proposal),
      offerId: `offer:${fingerprint({ campaignId, mutationId, index, proposal }).slice(0, 32)}`,
      revision: 1,
      status: 'active',
      createdByMutationId: mutationId,
      createdAt: timestamp,
      updatedAt: timestamp,
      soldAt: null,
      soldByMutationId: null,
    }));
    const nextOffers = [...(Array.isArray(existing.offers) ? existing.offers : []), ...committed].slice(-500);
    const receipt = {
      mutationId,
      operation: 'commit_offers',
      requestFingerprint: requestHash,
      offerIds: committed.map((offer) => offer.offerId),
      at: timestamp,
    };
    const ledger = [...(Array.isArray(existing.mutationLedger) ? existing.mutationLedger : []), receipt].slice(-500);
    const update = await offers.updateOne(
      { _id: existing._id, stateRevision: existing.stateRevision },
      {
        $set: {
          offers: nextOffers,
          mutationLedger: ledger,
          stateRevision: Number(existing.stateRevision ?? 0) + 1,
          updatedAt: timestamp,
        },
      },
    );
    if (!update.modifiedCount) return null;
    const next = { ...existing, offers: nextOffers, mutationLedger: ledger, stateRevision: Number(existing.stateRevision ?? 0) + 1 };
    return { contract: publicContract(next, { committed: committed.map(publicOffer) }), duplicate: false };
  });
}

function paymentCp(currency: unknown) {
  const source = currency && typeof currency === 'object' && !Array.isArray(currency)
    ? currency as Record<string, unknown>
    : {};
  return -COINS.reduce((sum, coin) => sum + integer(source[coin]) * COIN_VALUE_CP[coin], 0);
}

function purchaseClarification(query: string, active: Record<string, any>[]) {
  const options = active.slice(0, 10).map((offer) => ({
    offerId: offer.offerId,
    label: `${offer.item.name} from ${offer.seller.name}`,
    price: structuredClone(offer.price),
  }));
  const listed = options.map((option) => option.label).join('; ');
  return {
    authority: MERCHANT_PURCHASE_AUTHORITY,
    contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
    status: 'clarification_required' as const,
    code: 'MERCHANT_OFFER_NOT_FOUND',
    question: active.length
      ? `I could not match “${query || 'that item'}” to an active merchant offer. Which offer did you mean? ${listed}`
      : `I could not find an active merchant offer for “${query || 'that item'}”. Ask the seller for an exact item and price first.`,
    options,
  };
}

export async function resolveMerchantPurchase(input: {
  merchantCollection?: MerchantCollection;
  userId: string;
  campaignId: string;
  itemName: string;
  quantity?: number;
  currency: unknown;
}) {
  const offers = input.merchantCollection ?? collection();
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const itemName = cleanText(input.itemName, 200);
  const quantity = Math.max(1, Math.min(999, integer(input.quantity) || 1));
  const document = await offers.findOne({ userId, campaignId });
  const active = (Array.isArray(document?.offers) ? document.offers : []).filter((offer: any) => offer.status === 'active');
  const query = referenceKey(itemName);
  const matches = active.filter((offer: any) => (
    [offer.item?.name, ...(Array.isArray(offer.item?.aliases) ? offer.item.aliases : [])]
      .some((reference) => referenceKey(reference) === query)
  ));
  if (!query || matches.length !== 1) return purchaseClarification(itemName, matches.length > 1 ? matches : active);

  const offer = matches[0];
  if (quantity !== Number(offer.item?.quantity ?? 1)) {
    throw new MerchantOfferError(
      409,
      'MERCHANT_OFFER_QUANTITY_MISMATCH',
      `${offer.item.name} is offered in a quantity of ${offer.item.quantity}. Nothing was purchased.`,
      { offeredQuantity: offer.item.quantity, requestedQuantity: quantity, offer: publicOffer(offer) },
    );
  }
  const proposedPaymentCp = paymentCp(input.currency);
  if (proposedPaymentCp !== Number(offer.price?.totalCp ?? 0)) {
    throw new MerchantOfferError(
      409,
      'MERCHANT_OFFER_PRICE_MISMATCH',
      `${offer.item.name} costs ${offer.price.totalCp} copper pieces in total, but the proposed payment totals ${proposedPaymentCp}. Nothing was purchased.`,
      {
        offeredPrice: structuredClone(offer.price),
        proposedPaymentCp,
        differenceCp: proposedPaymentCp - Number(offer.price.totalCp ?? 0),
        offer: publicOffer(offer),
      },
    );
  }
  const contract = {
    authority: MERCHANT_PURCHASE_AUTHORITY,
    contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
    status: 'resolved' as const,
    offer: publicOffer(offer),
    expectedOfferRevision: offer.revision,
    item: structuredClone(offer.item),
    price: structuredClone(offer.price),
  };
  return { ...contract, fingerprint: fingerprint(contract) };
}

export async function consumeMerchantOffer(input: {
  merchantCollection?: MerchantCollection;
  userId: string;
  campaignId: string;
  offerId: string;
  expectedOfferRevision: number;
  expectedPurchaseFingerprint: string;
  mutationId: string;
  itemName: string;
  quantity?: number;
  currency: unknown;
  sheetMutationReceipt?: unknown;
  now?: () => Date;
}) {
  const offers = input.merchantCollection ?? collection();
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const offerId = requireText(input.offerId, 'offerId');
  const mutationId = requireText(input.mutationId, 'mutationId');
  const expectedPurchaseFingerprint = requireText(input.expectedPurchaseFingerprint, 'expectedPurchaseFingerprint', 128);
  const normalizedCurrency = Object.fromEntries(COINS.map((coin) => [coin, integer((input.currency as any)?.[coin])]));
  const now = input.now ?? (() => new Date());
  const requestHash = requestFingerprint({
    offerId,
    expectedOfferRevision: input.expectedOfferRevision,
    expectedPurchaseFingerprint,
    mutationId,
    itemName: cleanText(input.itemName, 200),
    quantity: Math.max(1, Math.min(999, integer(input.quantity) || 1)),
    currency: normalizedCurrency,
    sheetMutationReceipt: input.sheetMutationReceipt ?? null,
  });
  const initial = await offers.findOne({ userId, campaignId });
  const initialPrior = (Array.isArray(initial?.mutationLedger) ? initial.mutationLedger : [])
    .find((entry: any) => entry.mutationId === mutationId);
  if (initialPrior) {
    if (initialPrior.requestFingerprint !== requestHash) {
      throw new MerchantOfferError(409, 'IDEMPOTENCY_CONFLICT', 'This purchase mutation ID was already used for another purchase.');
    }
    const sold = initial?.offers.find((offer: any) => offer.offerId === offerId);
    if (!sold) throw new MerchantOfferError(409, 'IDEMPOTENCY_CONFLICT', 'The original purchased offer is no longer available.');
    return {
      purchase: {
        authority: MERCHANT_PURCHASE_AUTHORITY,
        contractVersion: MERCHANT_OFFER_CONTRACT_VERSION,
        status: 'resolved',
        offer: publicOffer(sold),
        expectedOfferRevision: input.expectedOfferRevision,
        item: structuredClone(sold.item),
        price: structuredClone(sold.price),
        fingerprint: expectedPurchaseFingerprint,
      },
      duplicate: true,
    };
  }
  const resolved = await resolveMerchantPurchase({
    merchantCollection: offers,
    userId,
    campaignId,
    itemName: input.itemName,
    quantity: input.quantity,
    currency: input.currency,
  });
  if (resolved.status !== 'resolved' || resolved.offer.offerId !== offerId) {
    throw new MerchantOfferError(409, 'MERCHANT_PURCHASE_CONTRACT_STALE', 'The selected merchant offer is no longer available.');
  }
  if (resolved.fingerprint !== expectedPurchaseFingerprint) {
    throw new MerchantOfferError(409, 'MERCHANT_PURCHASE_PREFLIGHT_MISMATCH', 'The purchase contract changed after preflight.');
  }

  return retryingUpdate(async () => {
    const existing = await offers.findOne({ userId, campaignId });
    if (!existing) throw new MerchantOfferError(404, 'MERCHANT_OFFER_NOT_FOUND', 'Merchant offer not found.');
    const prior = (Array.isArray(existing.mutationLedger) ? existing.mutationLedger : [])
      .find((entry: any) => entry.mutationId === mutationId);
    if (prior) {
      if (prior.requestFingerprint !== requestHash) {
        throw new MerchantOfferError(409, 'IDEMPOTENCY_CONFLICT', 'This purchase mutation ID was already used for another purchase.');
      }
      const sold = existing.offers.find((offer: any) => offer.offerId === offerId);
      return { purchase: { ...resolved, offer: publicOffer(sold) }, duplicate: true };
    }
    const index = existing.offers.findIndex((offer: any) => offer.offerId === offerId);
    const offer = existing.offers[index];
    if (!offer || offer.status !== 'active') {
      throw new MerchantOfferError(409, 'MERCHANT_OFFER_UNAVAILABLE', 'This merchant offer is no longer active. Nothing was purchased.');
    }
    if (Number(offer.revision) !== Number(input.expectedOfferRevision)) {
      throw new MerchantOfferError(
        409,
        'MERCHANT_OFFER_REVISION_CONFLICT',
        'This merchant offer changed before the purchase was committed. Nothing was purchased.',
      );
    }
    const timestamp = now();
    const sold = {
      ...offer,
      status: 'sold',
      revision: Number(offer.revision) + 1,
      soldAt: timestamp,
      soldByMutationId: mutationId,
      sheetMutationReceipt: structuredClone(input.sheetMutationReceipt ?? null),
      updatedAt: timestamp,
    };
    const nextOffers = [...existing.offers];
    nextOffers[index] = sold;
    const receipt = {
      mutationId,
      operation: 'consume_offer',
      requestFingerprint: requestHash,
      offerId,
      at: timestamp,
    };
    const ledger = [...(Array.isArray(existing.mutationLedger) ? existing.mutationLedger : []), receipt].slice(-500);
    const update = await offers.updateOne(
      { _id: existing._id, stateRevision: existing.stateRevision },
      {
        $set: {
          offers: nextOffers,
          mutationLedger: ledger,
          stateRevision: Number(existing.stateRevision ?? 0) + 1,
          updatedAt: timestamp,
        },
      },
    );
    if (!update.modifiedCount) return null;
    return { purchase: { ...resolved, offer: publicOffer(sold) }, duplicate: false };
  });
}

export async function compensateMerchantMutation(input: {
  merchantCollection?: MerchantCollection;
  userId: string;
  campaignId: string;
  originalMutationId: string;
  compensationId: string;
  now?: () => Date;
}) {
  const offers = input.merchantCollection ?? collection();
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const originalMutationId = requireText(input.originalMutationId, 'originalMutationId');
  const compensationId = requireText(input.compensationId, 'compensationId');
  const now = input.now ?? (() => new Date());

  return retryingUpdate(async () => {
    const existing = await offers.findOne({ userId, campaignId });
    if (!existing) return { compensated: false, reason: 'not_found', duplicate: false };
    const priorCompensation = (Array.isArray(existing.mutationLedger) ? existing.mutationLedger : [])
      .find((entry: any) => entry.mutationId === compensationId);
    if (priorCompensation) return { compensated: true, duplicate: true, receipt: priorCompensation };
    const original = (Array.isArray(existing.mutationLedger) ? existing.mutationLedger : [])
      .find((entry: any) => entry.mutationId === originalMutationId);
    if (!original) return { compensated: false, reason: 'original_mutation_not_found', duplicate: false };

    const timestamp = now();
    let changed = false;
    const nextOffers = existing.offers.map((offer: any) => {
      if (original.operation === 'consume_offer' && offer.soldByMutationId === originalMutationId && offer.status === 'sold') {
        changed = true;
        return {
          ...offer,
          status: 'active',
          revision: Number(offer.revision) + 1,
          soldAt: null,
          soldByMutationId: null,
          sheetMutationReceipt: null,
          updatedAt: timestamp,
        };
      }
      if (original.operation === 'commit_offers' && offer.createdByMutationId === originalMutationId && offer.status === 'active') {
        changed = true;
        return { ...offer, status: 'reverted', revision: Number(offer.revision) + 1, updatedAt: timestamp };
      }
      return offer;
    });
    const receipt = {
      mutationId: compensationId,
      operation: 'compensate_merchant_mutation',
      originalMutationId,
      originalOperation: original.operation,
      changed,
      at: timestamp,
    };
    const ledger = [...existing.mutationLedger, receipt].slice(-500);
    const update = await offers.updateOne(
      { _id: existing._id, stateRevision: existing.stateRevision },
      {
        $set: {
          offers: nextOffers,
          mutationLedger: ledger,
          stateRevision: Number(existing.stateRevision ?? 0) + 1,
          updatedAt: timestamp,
        },
      },
    );
    if (!update.modifiedCount) return null;
    return { compensated: true, changed, duplicate: false, receipt };
  });
}

export async function listMerchantOffers(input: {
  merchantCollection?: MerchantCollection;
  userId: string;
  campaignId: string;
  status?: string;
}) {
  const offers = input.merchantCollection ?? collection();
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const document = await offers.findOne({ userId, campaignId });
  const status = cleanText(input.status, 40);
  const selected = (Array.isArray(document?.offers) ? document.offers : [])
    .filter((offer: any) => !status || offer.status === status);
  return publicContract({ ...(document ?? {}), offers: selected });
}
