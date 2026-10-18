import { describe, expect, it } from 'vitest';
import { ensureFreeformTicketRetention, FREEFORM_TICKET_EXPIRY_INDEX } from './freeformTicketRetention.js';

describe('accepted interpretation proof lifetime', () => {
  it('replaces only the exact historical TTL index, preserving accepted replies and every original expiry', async () => {
    const calls: any[] = [];
    const records = { listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } },
      { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 }] }),
    dropIndex: async (name: string) => calls.push(['dropIndex', name]),
    createIndex: async (...args: any[]) => calls.push(['createIndex', ...args]) };
    await ensureFreeformTicketRetention({ collection: (name: string) => { expect(name).toBe('llm_freeform_tickets'); return records; } } as any);
    expect(calls).toEqual([['dropIndex', 'expiresAt_1'], ['createIndex', { expiresAt: 1 }, FREEFORM_TICKET_EXPIRY_INDEX]]);
    expect(FREEFORM_TICKET_EXPIRY_INDEX.partialFilterExpression.status.$in).not.toContain('accepted');
  });
  it('is idempotent and does not drop unrelated, partial, changed or non-TTL indexes', async () => {
    const calls: string[] = [];
    const indexes = [{ name: 'other', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { name: 'expiresAt_1', key: { expiresAt: 1, userId: 1 }, expireAfterSeconds: 0 }];
    await ensureFreeformTicketRetention({ collection: () => ({ listIndexes: () => ({ toArray: async () => indexes }),
      dropIndex: async () => calls.push('drop'), createIndex: async () => calls.push('create') }) } as any);
    expect(calls).toEqual(['create']);
  });
});
