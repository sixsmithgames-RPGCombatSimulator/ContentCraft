import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { readActiveSceneReality } from './sceneRealityReadinessService.js';
import { readPendingSceneTemporalEvents } from './sceneTemporalAuthorityService.js';
import { StoryWorkspaceStoreError } from './storyWorkspaceStore.js';
import { freeformJsonDigest, canonicalFreeformJson } from '../../shared/llm/freeformPlanBinding.js';
import { SCENE_TEMPORAL_GM as G, SCENE_TEMPORAL_GM_LIMITS as L, temporalSourceCatalog,
  temporalCatalogIdentities, temporalCatalogPage, assertTemporalGmChoice } from '../../shared/llm/sceneTemporalGmDecisions.js';
import { SCENE_TEMPORAL_ANALYSIS as A, assertTemporalRulingChoice } from '../../shared/llm/sceneTemporalAnalysis.js';

type Scope = { userId: string; campaignId: string };
type Row = Record<string, any>;
export interface TemporalGmDocument extends Scope { _id: string; operationId: string; requestFingerprint: string;
  preparationRef: string; confirmationTokenHash: string;
  revision: number; scopeDecision: Row; rulings: Row[]; receipt: Row; createdAt: Date }
export interface TemporalGmPreparedDocument extends Scope { _id: string; operationId: string; requestFingerprint: string;
  expectedRevision: number; sourceHead: Row; catalogFingerprint: string; catalogIdentities: Row[];
  choice: Row; confirmationTokenHash: string; createdAt: Date; expiresAt: Date }
export interface TemporalGmReaders {
  readSources(scope: Scope): Promise<Row[]>;
  readOwner(scope: Scope): Promise<{ sourceHead: Row; constraints: Row[]; currentClock: Row | null }>;
}
export interface TemporalGmDependencies extends Partial<TemporalGmReaders> {
  records?: Pick<Collection<TemporalGmDocument>, 'findOne' | 'insertOne'>;
  preparations?: Pick<Collection<TemporalGmPreparedDocument>, 'findOne' | 'insertOne'>;
  writeCampaignAllowlist?: string[]; now?: () => Date; nonce?: () => string;
  audit?: (event: Row) => void;
}
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const id = (v: any) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const ruleOnly = (choice: Row) => choice?.schemaVersion === A.choice;
const assertChoice = (choice: Row, catalog: Row, clock: Row | null) => ruleOnly(choice)
  ? assertTemporalRulingChoice(choice, catalog, clock) : assertTemporalGmChoice(choice, catalog, clock);
function fail(code: string, field = '', status = 409): never {
  throw new StoryWorkspaceStoreError(status, code, 'The GM scene timing decision could not be saved safely.', { field });
}
const scopeOf = (input: Scope): Scope => {
  if (!id(input.userId) || !id(input.campaignId)) fail('SCENE_TEMPORAL_GM_SCOPE_INVALID', 'scope', 422);
  return { userId: input.userId, campaignId: input.campaignId };
};
const isDuplicate = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === 11000;
/** Constraint identities come from actual owner records, never model proposals. */
export async function readTemporalGmOwner(scope: Scope) {
  const [scene, reality, state] = await Promise.all([readCurrentSceneContexts(scope), readActiveSceneReality(scope),
    getDb().collection('gmc_campaign_state').findOne(scope, { projection: { gameClock: 1, gameClockRevision: 1 } })]);
  return temporalGmOwnerFromRecords(scene, reality, state);
}
/** Shared projection for real owners and isolated owner-backed rehearsals. */
export function temporalGmOwnerFromRecords(scene: any, reality: any, state: any) {
  const kit = scene?.playableSceneContext?.sceneKitRef as Row | undefined;
  if (!scene || !kit || typeof kit.sceneKitId !== 'string') fail('SCENE_TEMPORAL_GM_SCENE_UNAVAILABLE');
  const bundle = reality?.bundle as Row | undefined;
  const boundaries = bundle?.sceneReality?.preparedBoundaries;
  if (bundle && !Array.isArray(boundaries)) fail('SCENE_TEMPORAL_GM_CONSTRAINT_INVALID');
  const constraints = (boundaries ?? [])
    .filter((row: Row) => row.kind === 'temporal').map((row: Row) => {
      const body = { boundaryId: row.boundaryId, kind: row.kind, beyondScope: row.beyondScope };
      if (!id(row.boundaryId) || typeof row.beyondScope !== 'string' || !row.beyondScope.trim()) fail('SCENE_TEMPORAL_GM_CONSTRAINT_INVALID');
      return { constraintRef: row.boundaryId, label: row.beyondScope, bodyFingerprint: freeformJsonDigest(body),
        campaignDeadline: row.campaignDeadline ?? null, campaignInterval: row.campaignInterval ?? null };
    }).sort((a: Row, b: Row) => a.constraintRef.localeCompare(b.constraintRef));
  if (constraints.length > L.rulings || new Set(constraints.map((c: Row) => c.constraintRef)).size !== constraints.length) fail('SCENE_TEMPORAL_GM_CONSTRAINT_INVALID');
  const sourceHead = { sceneKitId: kit.sceneKitId, sceneRevision: kit.revision,
    payloadFingerprint: kit.payloadHash, workspaceRevision: scene.storyWorkspaceRef.revision,
    pointerRevision: reality?.pointerRevision ?? 0, activeSceneStateRevision: scene.activeSceneContext?.state?.revision ?? 0,
    clockRevision: state?.gameClockRevision ?? 0 };
  if (![sourceHead.sceneRevision, sourceHead.workspaceRevision, sourceHead.pointerRevision, sourceHead.activeSceneStateRevision,
    sourceHead.clockRevision].every((n) => Number.isSafeInteger(n) && n >= 0)
    || !/^[a-f0-9]{64}$/.test(sourceHead.payloadFingerprint)) fail('SCENE_TEMPORAL_GM_SOURCE_INVALID');
  return json({ sourceHead, constraints, currentClock: state?.gameClock ?? null });
}
/** Human-only immutable scope/ruling ledger. No clock, Scene, event or action
 * writer is called. The unique revision is the owner CAS acceptance boundary. */
export function sceneTemporalGmDecisionService(deps: TemporalGmDependencies = {}) {
  const records = deps.records ?? getDb().collection<TemporalGmDocument>('gmc_scene_temporal_gm_decisions');
  const preparations = deps.preparations ?? getDb().collection<TemporalGmPreparedDocument>('gmc_scene_temporal_gm_preparations');
  const readSources = deps.readSources ?? readPendingSceneTemporalEvents;
  const readOwner = deps.readOwner ?? readTemporalGmOwner;
  const now = deps.now ?? (() => new Date());
  const audit = (stage: string, scope: Scope, metadata: Row) => (deps.audit ?? ((event) => console.info('[gmc:scene-timing]', JSON.stringify(event))))({
    schemaVersion: G.receipt, stage, scopeHash: freeformJsonDigest(scope).slice(0, 16), ...metadata });
  const allowlist = deps.writeCampaignAllowlist ?? (process.env.GMC_SCENE_TEMPORAL_GM_WRITES === '1'
    ? String(process.env.GMC_SCENE_TEMPORAL_GM_CAMPAIGN_ALLOWLIST ?? '').split(',').map((v) => v.trim()).filter((v) => v && v !== '*') : []);
  const requireWrite = (scope: Scope) => { if (!allowlist.includes(scope.campaignId)) fail('SCENE_TEMPORAL_GM_WRITES_PAUSED', '', 503); };
  const current = (scope: Scope) => records.findOne(scope, { sort: { revision: -1 } });
  async function readCatalog(input: Scope) {
    const scope = scopeOf(input);
    const [owner, sources] = await Promise.all([readOwner(scope), readSources(scope)]);
    const [after, latestSources] = await Promise.all([readOwner(scope), readSources(scope)]);
    if (!same(owner, after) || !same(json(sources), json(latestSources))) fail('SCENE_TEMPORAL_GM_SOURCE_CHANGED');
    return { catalog: temporalSourceCatalog(scope, owner.sourceHead, sources, owner.constraints), currentClock: owner.currentClock };
  }
  async function operation(input: Scope & { operationId: string }) {
    if (!id(input.operationId)) fail('SCENE_TEMPORAL_GM_OPERATION_INVALID', '', 422);
    return records.findOne({ ...scopeOf(input), operationId: input.operationId });
  }
  async function preparationOperation(input: Scope & { operationId: string }) {
    if (!id(input.operationId)) fail('SCENE_TEMPORAL_GM_OPERATION_INVALID', '', 422);
    return preparations.findOne({ ...scopeOf(input), operationId: input.operationId });
  }
  async function choices(input: Scope & { offset: number; catalogFingerprint?: string }): Promise<Row> {
    const scope = scopeOf(input), { catalog, currentClock } = await readCatalog(scope), saved = await current(scope);
    if (input.catalogFingerprint && catalog.fingerprint !== input.catalogFingerprint) fail('SCENE_TEMPORAL_GM_SOURCE_CHANGED');
    const page = temporalCatalogPage(catalog, input.offset, { currentClock, revision: saved?.revision ?? 0 });
    audit('choices', scope, { catalogFingerprint: catalog.fingerprint, complete: true, sourceCount: catalog.sources.length,
      sourceKinds: [...new Set(catalog.sources.map((row: Row) => row.kind))], offset: input.offset,
      pageBytes: Buffer.byteLength(JSON.stringify(page)), constraintCount: catalog.constraints.length,
      sceneRevision: catalog.sourceHead.sceneRevision, clockRevision: catalog.sourceHead.clockRevision });
    return page;
  }
  async function prepare(input: Scope & { operationId: string; expectedRevision: number; expectedSourceHead: Row;
    catalogFingerprint: string; choice: Row; confirmationToken: string }) {
    const scope = scopeOf(input);
    if (!id(input.operationId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !/^[a-f0-9]{64}$/.test(input.catalogFingerprint) || typeof input.confirmationToken !== 'string'
      || !/^[A-Za-z0-9_-]{32,128}$/.test(input.confirmationToken)) fail('SCENE_TEMPORAL_GM_INPUT_INVALID', '', 422);
    const requestFingerprint = freeformJsonDigest({ ...scope, operationId: input.operationId, expectedRevision: input.expectedRevision,
      expectedSourceHead: input.expectedSourceHead, catalogFingerprint: input.catalogFingerprint, choice: input.choice,
      confirmationTokenHash: freeformJsonDigest(input.confirmationToken) });
    const prior = await preparationOperation(input);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('SCENE_TEMPORAL_GM_IDEMPOTENCY_CONFLICT');
      return { decisionRef: prior._id, expiresAt: prior.expiresAt, requestFingerprint };
    }
    requireWrite(scope);
    const [{ catalog, currentClock }, saved] = await Promise.all([readCatalog(scope), current(scope)]);
    if (catalog.fingerprint !== input.catalogFingerprint || !same(catalog.sourceHead, input.expectedSourceHead)
      || (saved?.revision ?? 0) !== input.expectedRevision) fail('SCENE_TEMPORAL_GM_SOURCE_CHANGED');
    try { assertChoice(input.choice, catalog, currentClock); }
    catch (error) { fail('SCENE_TEMPORAL_GM_CHOICE_INVALID', (error as any)?.details?.field ?? 'choice', 422); }
    const createdAt = now();
    const document: TemporalGmPreparedDocument = { ...scope, _id: `temporal-gm-prepare:${(deps.nonce ?? randomUUID)()}`,
      operationId: input.operationId, requestFingerprint, expectedRevision: input.expectedRevision, sourceHead: catalog.sourceHead,
      catalogFingerprint: catalog.fingerprint, catalogIdentities: temporalCatalogIdentities(catalog), choice: json(input.choice),
      confirmationTokenHash: freeformJsonDigest(input.confirmationToken), createdAt,
      expiresAt: new Date(createdAt.getTime() + L.prepareMinutes * 60_000) };
    if (Buffer.byteLength(JSON.stringify(document)) > L.decisionBytes) fail('SCENE_TEMPORAL_GM_DECISION_TOO_LARGE');
    try { await preparations.insertOne(document); }
    catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = await preparationOperation(input);
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('SCENE_TEMPORAL_GM_IDEMPOTENCY_CONFLICT');
      return { decisionRef: raced._id, expiresAt: raced.expiresAt, requestFingerprint };
    }
    audit('prepared', scope, { requestFingerprint, catalogFingerprint: catalog.fingerprint,
      mode: ruleOnly(input.choice) ? 'world_rulings_only' : 'historical_human_scope',
      includedCount: input.choice.included?.length ?? null, excludedCount: input.choice.excluded?.length ?? null,
      rulingCount: input.choice.rulings.length, revision: input.expectedRevision, duplicate: false });
    return { decisionRef: document._id, expiresAt: document.expiresAt, requestFingerprint };
  }
  async function confirm(input: Scope & { decisionRef: string; confirmationToken: string; humanConfirmed: boolean }) {
    const scope = scopeOf(input);
    if (!id(input.decisionRef) || input.humanConfirmed !== true || typeof input.confirmationToken !== 'string') fail('SCENE_TEMPORAL_GM_HUMAN_REQUIRED', '', 422);
    const prior = await records.findOne({ ...scope, preparationRef: input.decisionRef });
    if (prior) {
      if (prior.confirmationTokenHash !== freeformJsonDigest(input.confirmationToken)) fail('SCENE_TEMPORAL_GM_CONFIRMATION_INVALID');
      audit('confirmed', scope, { requestFingerprint: prior.requestFingerprint, revision: prior.revision, duplicate: true });
      return { ...prior.receipt, duplicate: true };
    }
    const prepared = await preparations.findOne({ ...scope, _id: input.decisionRef });
    if (!prepared || prepared.confirmationTokenHash !== freeformJsonDigest(input.confirmationToken)) fail('SCENE_TEMPORAL_GM_CONFIRMATION_INVALID');
    const committed = await operation({ ...scope, operationId: prepared.operationId });
    if (committed) {
      if (committed.requestFingerprint !== prepared.requestFingerprint) fail('SCENE_TEMPORAL_GM_IDEMPOTENCY_CONFLICT');
      return { ...committed.receipt, duplicate: true };
    }
    requireWrite(scope);
    if (prepared.expiresAt.getTime() <= now().getTime()) fail('SCENE_TEMPORAL_GM_PREPARATION_EXPIRED');
    const [{ catalog, currentClock }, saved] = await Promise.all([readCatalog(scope), current(scope)]);
    if (!same(catalog.sourceHead, prepared.sourceHead) || catalog.fingerprint !== prepared.catalogFingerprint
      || (saved?.revision ?? 0) !== prepared.expectedRevision) fail('SCENE_TEMPORAL_GM_SOURCE_CHANGED');
    try { assertChoice(prepared.choice, catalog, currentClock); }
    catch { fail('SCENE_TEMPORAL_GM_CHOICE_INVALID'); }
    const revision = prepared.expectedRevision + 1, createdAt = now();
    const decisionRef = `temporal-gm-scope:${freeformJsonDigest({ ...scope, revision })}`;
    const receiptRef = `temporal-gm-receipt:${freeformJsonDigest({ ...scope, operationId: prepared.operationId })}`;
    const onlyRulings = ruleOnly(prepared.choice);
    const scopeDecision: Row = { schemaVersion: onlyRulings ? A.decision : G.scope, decisionRef, operationId: prepared.operationId,
      campaignId: scope.campaignId, sourceHead: catalog.sourceHead, catalogFingerprint: catalog.fingerprint,
      sourceIdentities: temporalCatalogIdentities(catalog), ...(onlyRulings ? { applicability: 'not_a_human_decision' }
        : { included: prepared.choice.included, excluded: prepared.choice.excluded }),
      humanIdentity: scope.userId, createdAt: createdAt.toISOString(), receiptRef,
      supersedes: saved?.scopeDecision.decisionRef ?? null };
    const rulings = prepared.choice.rulings.map((r: Row) => ({ schemaVersion: onlyRulings ? A.ruling : G.ruling,
      rulingRef: `temporal-gm-ruling:${freeformJsonDigest({ decisionRef, constraintRef: r.constraintRef })}`,
      ...(onlyRulings ? { decisionRef } : { scopeDecisionRef: decisionRef }), operationId: prepared.operationId, ...r,
      humanIdentity: scope.userId, createdAt: createdAt.toISOString(), receiptRef }));
    const receipt = { schemaVersion: onlyRulings ? A.receipt : G.receipt, receiptRef, operationId: prepared.operationId,
      requestFingerprint: prepared.requestFingerprint, decisionRef, rulingRefs: rulings.map((r: Row) => r.rulingRef),
      sourceHead: catalog.sourceHead, catalogFingerprint: catalog.fingerprint, revision, duplicate: false };
    const document: TemporalGmDocument = { ...scope, _id: decisionRef, operationId: prepared.operationId,
      requestFingerprint: prepared.requestFingerprint, preparationRef: prepared._id,
      confirmationTokenHash: prepared.confirmationTokenHash, revision, scopeDecision, rulings, receipt, createdAt };
    if (Buffer.byteLength(JSON.stringify(document)) > L.decisionBytes) fail('SCENE_TEMPORAL_GM_DECISION_TOO_LARGE');
    try { await records.insertOne(document); }
    catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = await operation({ ...scope, operationId: prepared.operationId });
      if (!raced || raced.requestFingerprint !== prepared.requestFingerprint) fail('SCENE_TEMPORAL_GM_SOURCE_CHANGED');
      return { ...raced.receipt, duplicate: true };
    }
    audit('confirmed', scope, { requestFingerprint: prepared.requestFingerprint, catalogFingerprint: catalog.fingerprint,
      revision, mode: onlyRulings ? 'world_rulings_only' : 'historical_human_scope',
      includedCount: scopeDecision.included?.length ?? null, excludedCount: scopeDecision.excluded?.length ?? null,
      rulingCount: rulings.length, duplicate: false });
    return receipt;
  }
  async function read(input: Scope) {
    const scope = scopeOf(input), [{ catalog, currentClock }, saved] = await Promise.all([readCatalog(scope), current(scope)]);
    if (!saved) return { catalog, currentClock, decision: null };
    const onlyRulings = saved.scopeDecision.schemaVersion === A.decision;
    // Relevance analysis expires on any source edit. A GM's numeric meaning of
    // this unchanged named constraint does not expire because a remote event
    // changed. Keep the original receipt, never ask the same known fact again.
    if (onlyRulings ? saved.scopeDecision.sourceHead.sceneKitId !== catalog.sourceHead.sceneKitId
      : saved.scopeDecision.catalogFingerprint !== catalog.fingerprint
        || !same(saved.scopeDecision.sourceIdentities, temporalCatalogIdentities(catalog))) return { catalog, currentClock, decision: null };
    const choices = saved.rulings.map(({ constraintRef, bodyFingerprint, explanation, kind, deadline, start, end }: Row) =>
      kind === 'clock_before' ? { constraintRef, bodyFingerprint, explanation, kind, deadline } : { constraintRef, bodyFingerprint, explanation, kind, start, end });
    const choice = onlyRulings ? { schemaVersion: A.choice, rulings: choices }
      : { included: saved.scopeDecision.included, excluded: saved.scopeDecision.excluded, rulings: choices };
    try { assertChoice(choice, catalog, currentClock); }
    catch { return { catalog, currentClock, decision: null }; }
    return { catalog, currentClock, decision: saved };
  }
  return { read, readCatalog, choices, prepare, confirm, operation, preparationOperation };
}
