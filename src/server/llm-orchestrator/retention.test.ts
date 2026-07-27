import { describe, expect, it, vi } from 'vitest';
import { deleteUserOrchestratorData } from './retention.js';

describe('orchestrator retention and deletion', () => {
  it('requires exact confirmation before deleting user-scoped data', async () => {
    const collection = vi.fn();
    await expect(deleteUserOrchestratorData({
      userId: 'user-1',
      confirmation: 'no',
      database: { collection } as any,
    })).rejects.toMatchObject({ code: 'DELETION_CONFIRMATION_REQUIRED' });
    expect(collection).not.toHaveBeenCalled();
  });

  it('deletes every orchestrator collection using the authenticated user scope', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 2 });
    const collection = vi.fn(() => ({ deleteMany }));
    const result = await deleteUserOrchestratorData({
      userId: 'user-1',
      confirmation: 'delete-my-orchestrator-data',
      database: { collection } as any,
    });
    expect(collection).toHaveBeenCalledTimes(5);
    expect(deleteMany).toHaveBeenCalledTimes(5);
    expect(deleteMany.mock.calls.every(([filter]) => filter.userId === 'user-1')).toBe(true);
    expect(result.deleted.llm_executions).toBe(2);
    expect(result.deleted.gma_mechanics_ledger).toBe(2);
  });
});
