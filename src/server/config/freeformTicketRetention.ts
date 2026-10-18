import type { Db } from 'mongodb';

/** Accepted interpretation is durable program provenance, not an unused
 * expiring prompt. Keep its original logical expiry/bytes unchanged. */
export const FREEFORM_TICKET_EXPIRY_INDEX = Object.freeze({
  name: 'llm_freeform_tickets_unaccepted_expiry', expireAfterSeconds: 0,
  partialFilterExpression: { status: { $in: ['active', 'running', 'retired'] } },
});

export async function ensureFreeformTicketRetention(database: Pick<Db, 'collection'>): Promise<void> {
  const records = database.collection('llm_freeform_tickets');
  let indexes;
  try { indexes = await records.listIndexes().toArray(); }
  catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 26) throw error;
    indexes = [];
  }
  const legacy = indexes.find((index) => index.name === 'expiresAt_1' && index.expireAfterSeconds === 0
    && !index.partialFilterExpression && Object.keys(index.key).length === 1 && index.key.expiresAt === 1);
  if (legacy) {
    try { await records.dropIndex('expiresAt_1'); }
    catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 27) throw error; }
  }
  // No record deletion, date extension, reply copy or gameplay mutation. If
  // interrupted between indexes, accepted proof is retained, never erased.
  await records.createIndex({ expiresAt: 1 }, FREEFORM_TICKET_EXPIRY_INDEX);
}
