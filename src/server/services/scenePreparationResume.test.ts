import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { readScenePreparationResume, issueScenePreparationReview, type SceneRealityCollections,
  type ScenePreparationResumeDocument, type ScenePreparationReviewIssue } from './sceneRealityReadinessService.js';
import { SCENE_TEMPORAL_GM as G, createScopedTemporalAuthorityContext } from '../../shared/llm/sceneTemporalGmDecisions.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
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
