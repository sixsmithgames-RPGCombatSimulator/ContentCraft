import { getDb } from '../config/mongo.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { questWithTimeState } from './gmcIntegrationStore.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';
import { createTemporalAuthorityContext, evaluateTemporalValidity, SCENE_TEMPORAL_VALIDITY as T } from '../../shared/llm/sceneTemporalValidity.js';
import { canonicalFreeformJson } from '../../shared/llm/freeformPlanBinding.js';
import { SCENE_TEMPORAL_GM as G, createScopedTemporalAuthorityContext } from '../../shared/llm/sceneTemporalGmDecisions.js';
import { sceneTemporalGmDecisionService } from './sceneTemporalGmDecisionStore.js';

type Scope = { userId: string; campaignId: string; gmDecisions?: boolean };
type Row = Record<string, any>;
const snapshotJson = (value: unknown) => canonicalFreeformJson(JSON.parse(JSON.stringify(value)));
export const TEMPORAL_TERMINAL_SOURCE_STATUSES = ['completed', 'resolved', 'failed', 'abandoned', 'cancelled', 'closed', 'superseded'];
export interface TemporalEventSourceReaders {
  readQuests(scope: Scope, limit: number): Promise<Row[]>;
  readThreads(scope: Scope, limit: number): Promise<Row[]>;
}
const eventSourceReaders: TemporalEventSourceReaders = {
  readQuests: (scope, limit) => getDb().collection('gmc_quests').find({ ...scope,
    status: { $nin: TEMPORAL_TERMINAL_SOURCE_STATUSES } }).sort({ _id: 1 }).limit(limit).toArray(),
  readThreads: (scope, limit) => getDb().collection('gmc_threads').find({ ...scope,
    status: { $nin: TEMPORAL_TERMINAL_SOURCE_STATUSES } }).sort({ _id: 1 }).limit(limit).toArray(),
};
/** QUEST and EVENT/thread are separate owners. Unknown lifecycle meanings stay
 * included; a bounded display or one owner's subset cannot claim completeness. */
export async function readPendingSceneTemporalEvents(scope: Scope, deps: TemporalEventSourceReaders = eventSourceReaders): Promise<Row[]> {
  scope = { userId: scope.userId, campaignId: scope.campaignId };
  const [quests, threads] = await Promise.all([deps.readQuests(scope, 65), deps.readThreads(scope, 65)]);
  if (quests.length + threads.length > 64) throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE', 'The complete current timing conditions exceed the supported review.',
    { field: 'events.complete', questCount: quests.length, eventCount: threads.length });
  const sourceId = (kind: string, row: Row) => {
    const id = String(row._id ?? row.id ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,223}$/.test(id)) throw new StoryWorkspaceStoreError(409,
      'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE', 'An exact timing source could not be identified.', { field: 'events.sourceId' });
    return `${kind}:${id}`;
  };
  return [...quests.map((row) => ({ ...row, _id: sourceId('quest', row) })),
    ...threads.map((row) => ({ ...row, _id: sourceId('event', row), summary: row.description ?? row.summary ?? '' }))]
    .sort((a, b) => a._id.localeCompare(b._id));
}
export interface SceneTemporalReaders {
  readState(scope: Scope): Promise<Row | null>;
  readEvents(scope: Scope): Promise<Row[]>;
  readScene(scope: Scope): Promise<any>;
  readClockRecords?(scope: Scope, fromRevision: number, toRevision: number): Promise<Row[]>;
  readGmDecision?(scope: Scope): Promise<Row>;
}
const readers: SceneTemporalReaders = {
  readState: (scope) => getDb().collection('gmc_campaign_state').findOne(scope, { projection: { gameClock: 1, gameClockRevision: 1 } }),
  readEvents: readPendingSceneTemporalEvents,
  readScene: readCurrentSceneContexts,
  readClockRecords: async (scope, from, to) => {
    const rows = await getDb().collection('gmc_campaign_state').aggregate<Row>([
      { $match: scope }, { $limit: 1 },
      { $project: { records: { $slice: [{ $filter: { input: { $objectToArray: { $ifNull: ['$timeMutationLedger', {}] } },
        as: 'entry', cond: { $and: [{ $gt: ['$$entry.v.gameClockRevision', from] }, { $lte: ['$$entry.v.gameClockRevision', to] }] } } }, 65] } } },
    ]).toArray();
    return (rows[0]?.records ?? []).map((entry: Row) => entry.v).sort((a: Row, b: Row) => a.gameClockRevision - b.gameClockRevision);
  },
};
export async function readSceneTemporalAuthority(scope: Scope, deps: SceneTemporalReaders = readers): Promise<JsonObject> {
  const gmDecisions = scope.gmDecisions === true;
  scope = { userId: scope.userId, campaignId: scope.campaignId };
  if (gmDecisions) {
    const readDecision = deps.readGmDecision ?? sceneTemporalGmDecisionService().read;
    const [state, prepared] = await Promise.all([deps.readState(scope), readDecision(scope)]);
    if (!prepared.decision) throw new StoryWorkspaceStoreError(409, 'SCENE_TEMPORAL_GM_REVIEW_REQUIRED',
      'A GM must review which pending events and timing rulings apply to this Scene.', {});
    const [after, latest] = await Promise.all([deps.readState(scope), readDecision(scope)]);
    if (snapshotJson(state) !== snapshotJson(after) || snapshotJson(prepared) !== snapshotJson(latest)) throw new StoryWorkspaceStoreError(409,
      'SCENE_TEMPORAL_GM_SOURCE_CHANGED', 'The timing sources changed during the Scene check.', {});
    const saved = prepared.decision, catalog = prepared.catalog;
    const included = new Set(saved.scopeDecision.included);
    const summary = { schemaVersion: G.scope, decisionRef: saved.scopeDecision.decisionRef,
      receiptRef: saved.scopeDecision.receiptRef, catalogFingerprint: catalog.fingerprint,
      includedSources: saved.scopeDecision.sourceIdentities.filter((r: Row) => included.has(r.sourceRef)), excludedCount: saved.scopeDecision.excluded.length };
    const raw = catalog.sources.filter((r: Row) => included.has(r.sourceRef)).map((r: Row) => ({ ...r.evidence,
      _id: r.sourceRef.slice('gmc:event:'.length), revision: r.sourceRevision }));
    const rulings = saved.rulings.map((r: Row) => ({ ...r, constraint: catalog.constraints.find((c: Row) => c.constraintRef === r.constraintRef) }));
    try { return createScopedTemporalAuthorityContext({ campaignId: scope.campaignId, sceneKitId: catalog.sourceHead.sceneKitId },
      state, raw.map((e: Row) => questWithTimeState(e, state?.gameClock ?? null)), summary, rulings) as JsonObject; }
    catch (error) { throw new StoryWorkspaceStoreError(409, 'SCENE_TEMPORAL_GM_AUTHORITY_INCOMPLETE',
      'The included timing evidence does not fit the complete Scene review.', { field: (error as any)?.details?.field ?? 'authority' }); }
  }
  const [scene, before, events] = await Promise.all([deps.readScene(scope), deps.readState(scope), deps.readEvents(scope)]);
  const [after, currentEvents] = await Promise.all([deps.readState(scope), deps.readEvents(scope)]);
  if (Number(before?.gameClockRevision ?? 0) !== Number(after?.gameClockRevision ?? 0)
    || snapshotJson(before?.gameClock ?? null) !== snapshotJson(after?.gameClock ?? null)
    || snapshotJson(events) !== snapshotJson(currentEvents)) throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_AUTHORITY_CHANGED', 'Campaign time changed while its current conditions were being checked.', {});
  const sceneKitId = scene?.playableSceneContext?.sceneKitRef?.sceneKitId;
  if (typeof sceneKitId !== 'string') throw new StoryWorkspaceStoreError(409, 'SCENE_TEMPORAL_AUTHORITY_UNAVAILABLE',
    'The current Scene could not be verified for its timing check.', {});
  try {
    return createTemporalAuthorityContext({ campaignId: scope.campaignId, sceneKitId }, before,
      events.map((event) => questWithTimeState(event, before?.gameClock ?? null))) as JsonObject;
  } catch (error) {
    throw new StoryWorkspaceStoreError(409, 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE',
      'The complete current timing conditions do not fit the supported review.', { field: (error as any)?.details?.field ?? 'authority' });
  }
}
/** Every call rereads actual owners. A browser/GMA evaluation is never trusted. */
export async function evaluateCurrentSceneTemporalValidity(scope: Scope, bundle: JsonObject,
  deps: SceneTemporalReaders = readers): Promise<JsonObject | null> {
  // Callers such as qualified observation carry a program scope. Campaign clock
  // reads must not accidentally query that unrelated key and appear missing.
  scope = { userId: scope.userId, campaignId: scope.campaignId };
  const certificate = bundle.readinessCertificate as Row;
  if (![T.certificate, G.certificate].includes(certificate?.schemaVersion)) return null;
  const manifest = certificate.temporalValidity;
  if (!manifest || manifest.dossierFingerprint !== (bundle.readinessAssessment as Row)?.dossierFingerprint
    || manifest.assessmentFingerprint !== (bundle.pendingIntentBindingRecord as Row)?.assessmentFingerprint) {
    throw new StoryWorkspaceStoreError(409, 'SCENE_TEMPORAL_VALIDITY_INVALID', 'The prepared timing review could not be verified.', {});
  }
  const authority = await readSceneTemporalAuthority({ ...scope, gmDecisions: certificate.schemaVersion === G.certificate }, deps);
  const state = await deps.readState(scope);
  const baseline = Number(manifest.authority?.clockRevision), revision = Number(authority.clockRevision);
  if (Number(state?.gameClockRevision ?? 0) !== revision) throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_AUTHORITY_CHANGED', 'Campaign time changed during the current timing check.', {});
  if (revision !== baseline && (!deps.readClockRecords || revision - baseline > 64 || revision < baseline)) throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_VALIDITY_STALE', 'The complete saved time history cannot be verified within this Scene review.', {});
  const records = revision === baseline ? [] : await deps.readClockRecords!(scope, baseline, revision);
  const after = await deps.readState(scope);
  if (Number(after?.gameClockRevision ?? 0) !== revision) throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_AUTHORITY_CHANGED', 'Campaign time changed before the timing decision was complete.', {});
  return evaluateTemporalValidity(manifest, authority, records) as JsonObject;
}
export async function assertCurrentSceneTemporalValidity(scope: Scope, bundle: JsonObject,
  deps: SceneTemporalReaders = readers): Promise<void> {
  const evaluation = await evaluateCurrentSceneTemporalValidity(scope, bundle, deps);
  if (evaluation && evaluation.decision !== 'valid') throw new StoryWorkspaceStoreError(409,
    'SCENE_TEMPORAL_VALIDITY_STALE', 'The prepared situation no longer has confirmed current timing conditions.',
    { decision: evaluation.decision, changedDimensions: evaluation.changedDimensions });
}
