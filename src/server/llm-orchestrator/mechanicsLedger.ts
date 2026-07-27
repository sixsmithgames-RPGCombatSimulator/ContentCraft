import { getDb } from '../config/mongo.js';

/**
 * Durable receipt for a mechanics operation that GMA may need to narrate
 * after the original request has crossed a Vercel instance boundary.
 *
 * The ledger deliberately stores only the bounded reconstruction envelope:
 * VCS mechanics, the original interaction context, and the GMC scene inputs.
 * It is not a second authority for game state; VCS and GMC remain authoritative
 * for mechanics and canon respectively.
 */
export interface MechanicsLedgerDocument {
  schemaVersion: 'gma.mechanics-ledger/1';
  userId: string;
  campaignId: string;
  interactionId: string;
  kind: 'skill_check' | 'combat_action';
  requestFingerprint: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MechanicsLedgerStore {
  findOne(filter: Record<string, unknown>): Promise<MechanicsLedgerDocument | null>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export class MechanicsLedgerConflictError extends Error {
  status = 409;
  code = 'GMA_MECHANICS_LEDGER_CONFLICT';
}

function collection(store?: MechanicsLedgerStore) {
  return store ?? getDb().collection<MechanicsLedgerDocument>('gma_mechanics_ledger');
}

function requireText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 512) {
    throw Object.assign(new Error(`${label} is required and must be at most 512 characters.`), {
      status: 400,
      code: 'GMA_MECHANICS_LEDGER_INPUT_INVALID',
    });
  }
  return text;
}

function assertEnvelopeSize(request: Record<string, unknown>, response: Record<string, unknown>) {
  // Keep a damaged or malicious client from turning the campaign ledger into
  // an unbounded document store. The GMA client already sends bounded history.
  const bytes = Buffer.byteLength(JSON.stringify({ request, response }), 'utf8');
  if (bytes > 512 * 1024) {
    const error = new Error('The mechanics ledger envelope exceeds the 512 KiB safety limit.');
    Object.assign(error, { status: 413, code: 'GMA_MECHANICS_LEDGER_TOO_LARGE' });
    throw error;
  }
}

export async function upsertMechanicsLedger(input: {
  store?: MechanicsLedgerStore;
  userId: string;
  campaignId: string;
  interactionId: string;
  kind: 'skill_check' | 'combat_action';
  requestFingerprint: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}) {
  const userId = requireText(input.userId, 'userId');
  const campaignId = requireText(input.campaignId, 'campaignId');
  const interactionId = requireText(input.interactionId, 'interactionId');
  const requestFingerprint = requireText(input.requestFingerprint, 'requestFingerprint');
  if (!['skill_check', 'combat_action'].includes(input.kind)) throw new Error('kind must be skill_check or combat_action.');
  assertEnvelopeSize(input.request, input.response);

  const ledger = collection(input.store);
  const key = { userId, campaignId, interactionId };
  const existing = await ledger.findOne(key);
  if (existing && existing.requestFingerprint !== requestFingerprint) {
    throw new MechanicsLedgerConflictError('The interaction ID already has a different mechanics request.');
  }
  const now = new Date();
  const document: MechanicsLedgerDocument = {
    schemaVersion: 'gma.mechanics-ledger/1',
    ...key,
    kind: input.kind,
    requestFingerprint,
    request: input.request,
    response: input.response,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await ledger.updateOne(key, {
    $set: {
      schemaVersion: document.schemaVersion,
      kind: document.kind,
      requestFingerprint: document.requestFingerprint,
      request: document.request,
      response: document.response,
      updatedAt: document.updatedAt,
    },
    $setOnInsert: { createdAt: document.createdAt },
  }, { upsert: true });
  return { ledger: (await ledger.findOne(key)) ?? document, created: !existing };
}

export async function findMechanicsLedger(input: {
  store?: MechanicsLedgerStore;
  userId: string;
  campaignId: string;
  interactionId: string;
}) {
  return collection(input.store).findOne({
    userId: requireText(input.userId, 'userId'),
    campaignId: requireText(input.campaignId, 'campaignId'),
    interactionId: requireText(input.interactionId, 'interactionId'),
  });
}
