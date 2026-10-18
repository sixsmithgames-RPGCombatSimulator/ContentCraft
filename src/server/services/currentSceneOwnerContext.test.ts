import { describe, expect, it } from 'vitest';
import { readCurrentSceneOwnerContext } from './currentSceneOwnerContext.js';
import { buildSceneTimeContext } from './actionDirectedStoryStore.js';
import { createSceneOwnerPremises, assertSceneOwnerPremises } from '../../shared/llm/sceneIndependentOwnerPremises.js';

describe('the exact HTTP / strict-save current owner reader', () => {
  it('uses the same clock and scheduled-event projection without dropping the raw owner views', async () => {
    const scope = { userId: 'user:one', campaignId: 'campaign:one' }, seen: unknown[] = [];
    const raw = { storyWorkspaceRef: { campaignId: scope.campaignId, revision: 4 }, playableSceneContext: { sceneKitRef: { revision: 3 } },
      activeSceneContext: { state: { revision: 2, lastTurnSequence: 9, latestReceiptRef: 'gm:one' }, recentTurnReceipts: [{ receiptRef: 'gm:one' }] },
      privateSceneContext: { distinctCurrentConstraints: ['A future action is unresolved.'] } };
    const clock = { day: 5, hour: 5, minute: 35 }, events = [{ _id: 'event:bell', title: 'Sixth bell', status: 'active', deadlineDescription: 'Before sixth bell' }];
    const readers = { readContext: async (value: unknown) => { seen.push(value); return structuredClone(raw); },
      readState: async (value: unknown) => { seen.push(value); return { gameClockRevision: 141, gameClock: clock }; },
      readEvents: async (value: unknown, current: unknown) => { seen.push(value, current); return structuredClone(events); } };
    const current = await readCurrentSceneOwnerContext({ ...scope, ignoredCommitField: true } as typeof scope, readers);
    expect(current).toEqual({ ...raw, gameTimeContext: buildSceneTimeContext({ gameClockRevision: 141, currentClock: clock, pendingEvents: events }) });
    expect(seen).toEqual([scope, scope, scope, clock]);
    const request = { operationId: 'build:one', campaignId: scope.campaignId, programRef: { programId: 'program:one' },
      authorityReadSet: [{ owner: 'gmc', ref: `gmc:story-workspace:${scope.campaignId}`, revision: 4 },
        { owner: 'gmc', ref: `gmc:campaign-clock:${scope.campaignId}`, revision: 141 }] };
    const pending = { window: { campaignId: scope.campaignId, programId: 'program:one', authorityHead: { sceneRevision: 3 }, windowFingerprint: 'a'.repeat(64) },
      ownerReadSet: { storyWorkspaceRevision: 4, sceneRevision: 2 } };
    const premises = createSceneOwnerPremises(request, pending, current!, null);
    assertSceneOwnerPremises(premises, request, pending, await readCurrentSceneOwnerContext(scope, readers) as any, null);
    expect(() => assertSceneOwnerPremises(premises, request, pending, raw, null)).toThrow();
    expect(() => createSceneOwnerPremises({ ...request, authorityReadSet: [{ ...request.authorityReadSet[1], revision: 140 }] }, pending, current!, null)).toThrow();
    const changed = structuredClone(current!); (changed.gameTimeContext as any).pendingEvents = [];
    expect(() => assertSceneOwnerPremises(premises, request, pending, changed, null)).toThrow();
  });
  it('propagates unavailable owners and does not manufacture a clock if no Scene exists', async () => {
    const unused = async () => { throw new Error('must not read'); };
    expect(await readCurrentSceneOwnerContext({ userId: 'u', campaignId: 'c' }, { readContext: async () => null, readState: unused, readEvents: unused })).toBeNull();
    await expect(readCurrentSceneOwnerContext({ userId: 'u', campaignId: 'c' }, { readContext: unused, readState: unused, readEvents: unused })).rejects.toThrow('must not read');
  });
});
