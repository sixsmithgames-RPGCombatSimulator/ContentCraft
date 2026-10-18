import { readCurrentSceneContexts, buildSceneTimeContext } from './actionDirectedStoryStore.js';
import { collections, listQuests } from './gmcIntegrationStore.js';
import type { JsonObject } from './storyWorkspaceStore.js';

type Scope = { userId: string; campaignId: string };
export interface CurrentSceneOwnerReaders {
  readContext: (scope: Scope) => Promise<unknown>;
  readState: (scope: Scope) => Promise<any>;
  readEvents: (scope: Scope, clock: any) => Promise<any[]>;
}

/** One supported owner view for the HTTP reader and strict Scene acceptance.
 * Scheduled events and the current clock must not disappear during review. */
export async function readCurrentSceneOwnerContext(scope: Scope, readers: CurrentSceneOwnerReaders = {
  readContext: readCurrentSceneContexts,
  readState: (value) => collections.state().findOne(value),
  readEvents: (value, clock) => listQuests(value.userId, value.campaignId, {}, clock),
}): Promise<JsonObject | null> {
  const owner = { userId: scope.userId, campaignId: scope.campaignId };
  const context = await readers.readContext(owner);
  if (!context) return null;
  const state = await readers.readState(owner), currentClock = state?.gameClock ?? null;
  const pendingEvents = await readers.readEvents(owner, currentClock);
  return { ...(context as JsonObject), gameTimeContext: buildSceneTimeContext({
    gameClockRevision: state?.gameClockRevision ?? 0, currentClock, pendingEvents,
  }) } as JsonObject;
}
