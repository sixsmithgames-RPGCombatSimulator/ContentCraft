import { describe, expect, it } from 'vitest';
import {
  MemoryAuthorityOutboxStore,
  createAuthorityOperation,
  recordAuthorityCompensation,
  recordAuthorityFailure,
  recordAuthorityReceipt,
} from './authorityOutbox.js';

function steps() {
  return [
    {
      stepId: 'vcs-sheet',
      authority: 'VCS' as const,
      mutationId: 'vcs-mutation-1',
      preconditions: { revision: 'sheet-r1' },
      compensation: { authority: 'VCS' as const, mutationId: 'vcs-revert-1', action: 'restore_sheet' },
    },
    {
      stepId: 'gmc-canon',
      authority: 'GMC' as const,
      mutationId: 'gmc-mutation-1',
      preconditions: { revision: 'canon-r1' },
    },
  ];
}

const proposal = {
  status: 'validated' as const,
  validationVersion: 'gma.manual-reconciliation/1',
  sourceOperation: 'narration.generate',
  resultFingerprint: 'result-1',
};

describe('authority outbox', () => {
  it('replays an identical saga and rejects an operation ID conflict', async () => {
    const store = new MemoryAuthorityOutboxStore();
    const first = await createAuthorityOperation({ store, userId: 'user-1', operationId: 'op-1', correlationId: 'corr-1', proposal, steps: steps() });
    const replay = await createAuthorityOperation({ store, userId: 'user-1', operationId: 'op-1', correlationId: 'corr-1', proposal, steps: steps() });
    expect(replay.fingerprint).toBe(first.fingerprint);
    await expect(createAuthorityOperation({
      store,
      userId: 'user-1',
      operationId: 'op-1',
      correlationId: 'corr-1',
      proposal,
      steps: [{ ...steps()[0], mutationId: 'different' }],
    })).rejects.toMatchObject({ code: 'AUTHORITY_OPERATION_CONFLICT' });
  });

  it('records authority receipts once and completes only after every step', async () => {
    const store = new MemoryAuthorityOutboxStore();
    await createAuthorityOperation({ store, userId: 'user-1', operationId: 'op-1', correlationId: 'corr-1', proposal, steps: steps() });
    const partial = await recordAuthorityReceipt({ store, userId: 'user-1', operationId: 'op-1', stepId: 'vcs-sheet', mutationId: 'vcs-mutation-1', receipt: { revision: 'sheet-r2' } });
    expect(partial.status).toBe('pending');
    const completed = await recordAuthorityReceipt({ store, userId: 'user-1', operationId: 'op-1', stepId: 'gmc-canon', mutationId: 'gmc-mutation-1', receipt: { revision: 'canon-r2' } });
    expect(completed.status).toBe('completed');
  });

  it('surfaces a durable compensation requirement after a partial crash', async () => {
    const store = new MemoryAuthorityOutboxStore();
    await createAuthorityOperation({ store, userId: 'user-1', operationId: 'op-1', correlationId: 'corr-1', proposal, steps: steps() });
    await recordAuthorityReceipt({ store, userId: 'user-1', operationId: 'op-1', stepId: 'vcs-sheet', mutationId: 'vcs-mutation-1', receipt: { revision: 'sheet-r2' } });
    const failed = await recordAuthorityFailure({
      store,
      userId: 'user-1',
      operationId: 'op-1',
      stepId: 'gmc-canon',
      error: { code: 'STALE_CANON', message: 'Canon changed.', retryable: false },
    });
    expect(failed.status).toBe('compensation_required');
    const compensated = await recordAuthorityCompensation({
      store,
      userId: 'user-1',
      operationId: 'op-1',
      stepId: 'vcs-sheet',
      receipt: { revision: 'sheet-r3', restored: true },
    });
    expect(compensated.status).toBe('compensated');
  });

  it('rejects an unvalidated proposal before creating an authority operation', async () => {
    const store = new MemoryAuthorityOutboxStore();
    await expect(createAuthorityOperation({
      store,
      userId: 'user-1',
      operationId: 'op-1',
      correlationId: 'corr-1',
      proposal: { ...proposal, status: 'unreviewed' } as any,
      steps: steps(),
    })).rejects.toMatchObject({ code: 'AUTHORITY_PROPOSAL_NOT_VALIDATED' });
    expect(await store.get('user-1', 'op-1')).toBeNull();
  });
});
