import { describe, expect, it } from 'vitest';
import {
  applyCampaignClockMutation,
  campaignClockMutationFingerprint,
  campaignClockMutationKey,
  CampaignClockMutationError,
  durableClockSnapshot,
} from './campaignClockMutation.js';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
  cursor[parts.at(-1)!] = value;
}

function fakeStateCollection(initial: Record<string, any> | null = null) {
  let state = initial ? copy(initial) : null;
  return {
    async updateOne(filter: Record<string, any>, update: Record<string, any>) {
      if (!state) state = { ...filter, ...(update.$setOnInsert ?? {}) };
      return { acknowledged: true };
    },
    async findOne() {
      return state ? copy(state) : null;
    },
    async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>) {
      if (!state) return null;
      const expectedRevision = Number(filter.gameClockRevision ?? 0);
      const acceptsMissingRevision = Array.isArray(filter.$or) && state.gameClockRevision === undefined;
      if (!acceptsMissingRevision && Number(state.gameClockRevision ?? 0) !== expectedRevision) return null;
      const ledgerPath = Object.keys(filter).find((key) => key.startsWith('timeMutationLedger.'));
      if (ledgerPath) {
        const key = ledgerPath.split('.')[1];
        if (state.timeMutationLedger?.[key]) return null;
      }
      for (const [path, value] of Object.entries(update.$set ?? {})) setPath(state, path, value);
      return copy(state);
    },
    snapshot() {
      return state ? copy(state) : null;
    },
  };
}

describe('campaign clock mutation', () => {
  it('removes volatile timestamps from the durable clock fingerprint', () => {
    const first = { day: 3, hour: 10, minute: 30, elapsedSeconds: 210600, updatedAt: 'first' };
    const second = { day: 3, hour: 10, minute: 30, elapsedSeconds: 210600, updatedAt: 'second' };
    expect(durableClockSnapshot(first)).toEqual(durableClockSnapshot(second));
    expect(campaignClockMutationFingerprint({ mutationId: 'time-1', expectedRevision: 0, gameClock: first }))
      .toBe(campaignClockMutationFingerprint({ mutationId: 'time-1', expectedRevision: 0, gameClock: second }));
    expect(campaignClockMutationKey('time-1')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('applies once and returns the durable result for an identical retry', async () => {
    const collection = fakeStateCollection({
      userId: 'user-1', campaignId: 'campaign-1', gameClockRevision: 0,
      gameClock: { day: 3, hour: 10, minute: 20, elapsedSeconds: 210000 },
    });
    const request = {
      stateCollection: collection,
      userId: 'user-1', campaignId: 'campaign-1', mutationId: 'gma-time:turn-1', expectedRevision: 0,
      source: { system: 'test' },
      createGameClock: () => ({ day: 3, hour: 10, minute: 28, elapsedSeconds: 210480, updatedAt: new Date() }),
      now: () => new Date('2026-07-16T20:00:00.000Z'),
    };
    const first = await applyCampaignClockMutation(request);
    const replay = await applyCampaignClockMutation(request);

    expect(first.duplicate).toBe(false);
    expect(first.gameClockRevision).toBe(1);
    expect(replay.duplicate).toBe(true);
    expect(replay.gameClock).toEqual(first.gameClock);
    expect(collection.snapshot()?.gameClockRevision).toBe(1);
  });

  it('rejects reuse with different data and rejects a stale distinct writer', async () => {
    const collection = fakeStateCollection({ userId: 'user-1', campaignId: 'campaign-1', gameClockRevision: 0, gameClock: null });
    await applyCampaignClockMutation({
      stateCollection: collection,
      userId: 'user-1', campaignId: 'campaign-1', mutationId: 'gma-time:turn-1', expectedRevision: 0,
      createGameClock: () => ({ day: 1, hour: 8, minute: 5, elapsedSeconds: 29100 }),
    });

    await expect(applyCampaignClockMutation({
      stateCollection: collection,
      userId: 'user-1', campaignId: 'campaign-1', mutationId: 'gma-time:turn-1', expectedRevision: 0,
      createGameClock: () => ({ day: 1, hour: 9, minute: 5, elapsedSeconds: 32700 }),
    })).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' } satisfies Partial<CampaignClockMutationError>);

    await expect(applyCampaignClockMutation({
      stateCollection: collection,
      userId: 'user-1', campaignId: 'campaign-1', mutationId: 'gma-time:turn-2', expectedRevision: 0,
      createGameClock: () => ({ day: 1, hour: 8, minute: 10, elapsedSeconds: 29400 }),
    })).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_CLOCK_CONFLICT' } satisfies Partial<CampaignClockMutationError>);
    expect(collection.snapshot()?.gameClockRevision).toBe(1);
  });
});
