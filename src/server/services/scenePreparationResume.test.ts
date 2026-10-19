import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { readScenePreparationResume, issueScenePreparationReview, type SceneRealityCollections,
  type ScenePreparationResumeDocument, type ScenePreparationReviewIssue } from './sceneRealityReadinessService.js';
import { SCENE_TEMPORAL_GM as G, createScopedTemporalAuthorityContext } from '../../shared/llm/sceneTemporalGmDecisions.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { SCENE_TEMPORAL_ANALYSIS as A, createAnalyzedTemporalAuthority, temporalAnalysisCatalog } from '../../shared/llm/sceneTemporalAnalysis.js';
import { temporalSourceCatalog } from '../../shared/llm/sceneTemporalGmDecisions.js';
import { SCENE_REVIEW_CAPACITY as R, sceneReviewContextBytes } from '../../shared/llm/sceneReviewCapacity.js';
import { createSceneOwnerPremises } from '../../shared/llm/sceneIndependentOwnerPremises.js';
beforeEach(() => { vi.stubEnv('GMC_MANUAL_READ_EFFECTS_ENABLED', '1');
  vi.stubEnv('GMC_MANUAL_READ_EFFECTS_CAMPAIGN_ALLOWLIST', 'campaign:test'); vi.stubEnv('GMC_TYPED_REFERENCE_BINDINGS', '1'); });
afterEach(() => vi.unstubAllEnvs());

function memory<T extends { _id: string }>() {
  const rows: T[] = [];
  const collection = { async findOne(filter: Record<string, unknown>) {
    return structuredClone(rows.find((row) => Object.entries(filter).every(([key, value]) => (row as any)[key] === value)) ?? null);
  }, async insertOne(row: T) { if (rows.some((r) => r._id === row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); rows.push(structuredClone(row)); } };
  return { rows, collection: collection as unknown as Collection<T> };
}
function fixture(builderCallCount = 1) {
  const scope = { userId: 'owner:test', campaignId: 'campaign:test' };
  const resumes = memory<ScenePreparationResumeDocument>(), issues = memory<ScenePreparationReviewIssue>();
  const window = { windowFingerprint: 'a'.repeat(64) }, request = { campaignId: scope.campaignId,
    operationId: 'preparation:original', programRef: { programId: 'program:original' }, authorityReadSet: [
      { owner: 'gmc', ref: `gmc:story-workspace:${scope.campaignId}`, revision: 1 },
      { owner: 'gmc', ref: `gmc:campaign-clock:${scope.campaignId}`, revision: 0 }] };
  const proposal = { campaignId: scope.campaignId, operationId: request.operationId }, bindings = { original: 'choices' }, compilation = { fingerprint: 'b'.repeat(64) };
  const result = { schemaVersion: G.compileResponse, requestFingerprint: 'c'.repeat(64), outputFingerprint: 'd'.repeat(64), proposal, bindings, compilation };
  const resumeRef = `scene-preparation-resume:${freeformJsonDigest({ ...scope, response: result })}`;
  resumes.rows.push({ ...scope, _id: resumeRef, schemaVersion: G.resume, request,
    sourceValidation: { operation: 'original:build', idempotencyKey: 'validation:original' },
    sourceWindowFingerprint: window.windowFingerprint, builderCallCount, result, createdAt: new Date() });
  let authority = createScopedTemporalAuthorityContext({ campaignId: scope.campaignId, sceneKitId: 'scene:test' }, null, [],
    { schemaVersion: G.scope, decisionRef: 'scope:test', receiptRef: 'receipt:test', catalogFingerprint: 'e'.repeat(64), includedSources: [], excludedCount: 43 }, []);
  const stores = { preparationResumes: resumes.collection, reviewIssues: issues.collection,
    readStoryAuthority: async () => ({ storyWorkspaceRef: { revision: 1 } }), readClockAuthority: async () => ({ gameClockRevision: 0 }),
    readPendingIntent: async () => ({ window }), readTemporalAuthority: async () => structuredClone(authority) } as unknown as SceneRealityCollections;
  const body = { schemaVersion: 'gma.scene-preparation-review-issuance-request/1', resumeRef,
    packet: { buildRequest: request, proposal, pendingIntentBindings: bindings, preparedBindingCompilation: compilation,
      pendingIntentContext: { window }, temporalAuthority: structuredClone(authority) } };
  return { scope, stores, resumes, issues, window, request, result, resumeRef, body,
    changeTiming: () => { authority = { ...authority, fingerprint: 'f'.repeat(64) }; body.packet.temporalAuthority = structuredClone(authority); } };
}
describe('owner-cached Manual timing continuation and issued-stage budget', () => {
  it.each([1, 2])('recovers the exact original %i-part construction without mutating a world or call count', async (calls) => {
    const f = fixture(calls), before = structuredClone(f.resumes.rows);
    const read = await readScenePreparationResume({ ...f.scope, resumeRef: f.resumeRef }, f.stores);
    expect(read).toMatchObject({ ...f.result, resumeRef: f.resumeRef, builderCallCount: calls, sourceWindowFingerprint: f.window.windowFingerprint, buildRequest: f.request });
    expect(f.resumes.rows).toEqual(before); expect(f.issues.rows).toEqual([]);
  });
  it('rejects foreign, altered-cache, changed-window and unknown references rather than rebuilding', async () => {
    const f = fixture();
    await expect(readScenePreparationResume({ ...f.scope, userId: 'owner:foreign', resumeRef: f.resumeRef }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_RESUME_UNAVAILABLE' });
    f.window.windowFingerprint = 'b'.repeat(64);
    await expect(readScenePreparationResume({ ...f.scope, resumeRef: f.resumeRef }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_RESUME_CONFLICT' });
    f.window.windowFingerprint = 'a'.repeat(64); (f.resumes.rows[0].result.proposal as any).changed = true;
    await expect(readScenePreparationResume({ ...f.scope, resumeRef: f.resumeRef }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_RESUME_CONFLICT' });
    await expect(readScenePreparationResume({ ...f.scope, resumeRef: 'guessed' }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_RESUME_INVALID' });
  });
  it('reserves and replays exactly one initial independent review with its original consumed ledger', async () => {
    const f = fixture(2);
    const first = await issueScenePreparationReview({ ...f.scope, body: f.body }, f.stores);
    expect(first).toMatchObject({ schemaVersion: G.reviewIssue, consumedCalls: { depth: 1, builder: 2, independentReview: 1 }, duplicate: false });
    expect(await issueScenePreparationReview({ ...f.scope, body: f.body }, f.stores)).toMatchObject({ ...first, duplicate: true });
    expect(f.issues.rows).toHaveLength(1); expect(f.resumes.rows).toHaveLength(1);
  });
  it('a new ruling after issue cannot reopen a prior timing pause for a free replacement examination', async () => {
    const f = fixture(); await issueScenePreparationReview({ ...f.scope, body: f.body }, f.stores);
    f.changeTiming();
    await expect(issueScenePreparationReview({ ...f.scope, body: f.body }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_REVIEW_ALREADY_ISSUED' });
    expect(f.issues.rows).toHaveLength(1);
  });
  it.each(['proposal', 'pendingIntentBindings', 'preparedBindingCompilation', 'buildRequest', 'temporalAuthority'])('changed %s cannot be issued from the immutable construction cache', async (field) => {
    const f = fixture(); (f.body.packet as any)[field] = { changed: true };
    await expect(issueScenePreparationReview({ ...f.scope, body: f.body }, f.stores)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_REVIEW_ISSUE_INVALID' });
    expect(f.issues.rows).toEqual([]);
  });
});

function capacityFixture() {
  const f=fixture(2), request=f.request as any;
  const pending:any={window:{...f.window,campaignId:f.scope.campaignId,programId:request.programRef.programId,authorityHead:{sceneRevision:1}},
    ownerReadSet:{storyWorkspaceRevision:1}};
  const owner:any={storyWorkspaceRef:{campaignId:f.scope.campaignId,revision:1},playableSceneContext:{sceneKitRef:{sceneKitId:'scene:test',revision:1}},
    activeSceneContext:{state:{revision:0,lastTurnSequence:0,latestReceiptRef:null}},gameTimeContext:{gameClockRevision:0}};
  const catalog=temporalAnalysisCatalog(temporalSourceCatalog({campaignId:f.scope.campaignId},{sceneKitId:'scene:test'},[],[]));
  const authority=createAnalyzedTemporalAuthority({campaignId:f.scope.campaignId,sceneKitId:'scene:test'},null,catalog,[]);
  const body:any={...f.body,schemaVersion:R.issueRequest,reviewCapacityProfile:R,packet:{...f.body.packet,preparationPolicyVersion:14,
    pendingIntentContext:pending,temporalAuthority:authority,temporalAnalysisCatalog:catalog,
    independentOwnerPremises:createSceneOwnerPremises(request,pending,owner,null)}};
  f.stores.readPendingIntent=async()=>structuredClone(pending);
  f.stores.readSceneOwnerContext=async()=>structuredClone(owner);
  f.stores.readTemporalAuthority=async()=>({schemaVersion:A.read,authority,catalog});
  f.stores.pointers=memory<any>().collection;
  return {...f,body,owner,pending};
}
describe('protected complete-owner capacity issuance',()=>{
  it('binds one exact profile and measured context to the same original consumed calls; identical replay is discovery',async()=>{
    const f=capacityFixture(), first=await issueScenePreparationReview({...f.scope,body:f.body},f.stores);
    expect(first).toMatchObject({schemaVersion:R.issueReceipt,reviewCapacityProfile:R,contextBytes:sceneReviewContextBytes(f.body.packet,R.operation),
      consumedCalls:{depth:1,builder:2,independentReview:1},duplicate:false});
    expect(await issueScenePreparationReview({...f.scope,body:f.body},f.stores)).toEqual({...first,duplicate:true});
    expect(f.issues.rows).toHaveLength(1);
  });
  it('rejects changed profile, absent baseline, stale owner and over-capacity before reserving a review',async()=>{
    for(const change of [(f:any)=>f.body.reviewCapacityProfile={...R,hardLimitBytes:1_048_576},
      (f:any)=>delete f.body.packet.independentOwnerPremises,(f:any)=>f.owner.activeSceneContext.state.revision++,
      (f:any)=>f.body.packet.unbounded='z'.repeat(262144)]){
      const f=capacityFixture();change(f);
      await expect(issueScenePreparationReview({...f.scope,body:f.body},f.stores)).rejects.toThrow();
      expect(f.issues.rows).toEqual([]);
    }
  });
  it('cannot change profile or return to the old writer for a free original review',async()=>{
    const f=capacityFixture();await issueScenePreparationReview({...f.scope,body:f.body},f.stores);
    const body={...f.body,schemaVersion:'gma.scene-preparation-review-issuance-request/1'};delete body.reviewCapacityProfile;
    await expect(issueScenePreparationReview({...f.scope,body},f.stores)).rejects.toMatchObject({code:'SCENE_TEMPORAL_GM_REVIEW_ALREADY_ISSUED'});
    expect(f.issues.rows).toHaveLength(1);
  });
  it('cannot upgrade an already-issued historical review or issue against a foreign owner',async()=>{
    const f=capacityFixture(),old={...f.body,schemaVersion:'gma.scene-preparation-review-issuance-request/1'};delete old.reviewCapacityProfile;
    await issueScenePreparationReview({...f.scope,body:old},f.stores);
    await expect(issueScenePreparationReview({...f.scope,body:f.body},f.stores)).rejects.toMatchObject({code:'SCENE_TEMPORAL_GM_REVIEW_ALREADY_ISSUED'});
    await expect(issueScenePreparationReview({...f.scope,userId:'foreign',body:f.body},f.stores)).rejects.toMatchObject({code:'SCENE_TEMPORAL_GM_RESUME_UNAVAILABLE'});
    expect(f.issues.rows).toHaveLength(1);
  });
});
