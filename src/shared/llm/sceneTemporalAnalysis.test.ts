import { describe, expect, it } from 'vitest';
import { SCENE_TEMPORAL_ANALYSIS as A, SCENE_TEMPORAL_ANALYSIS_POLICY, temporalAnalysisCatalog,
  assertTemporalRulingChoice, createAnalyzedTemporalAuthority, assertAnalyzedTemporalAuthority,
  assertTemporalSourceAnalysis } from './sceneTemporalAnalysis.js';
import { temporalSourceCatalog } from './sceneTemporalGmDecisions.js';
import { temporalRecordRefs } from './sceneTemporalValidity.js';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { compileScenePreparationWorkingSet, decodeScenePreparationWorkingSet, decodeSceneShapeTable,
  encodeSceneShapeTable, SCENE_SHAPE_TABLE_POLICY } from './scenePreparationWorkingSet.js';
import { getOperationDefinition, getSemanticValidator } from '../../server/llm-orchestrator/operationRegistry.js';
import '../../server/llm-orchestrator/semanticValidators.js';

function fixture(count = 43) {
  const scope = { campaignId: 'campaign:test', sceneKitId: 'scene:test' };
  const state = { gameClockRevision: 141, gameClock: { calendar: 'campaign', day: 5, hour: 5, minute: 35, second: 30 } };
  const boundary = { boundaryId: 'boundary:sixth-bell', kind: 'temporal', beyondScope: 'After sixth bell the paid window closes.' };
  const constraint = { constraintRef: boundary.boundaryId, bodyFingerprint: freeformJsonDigest(boundary), label: boundary.beyondScope,
    campaignDeadline: null, campaignInterval: null };
  const raw = Array.from({ length: count }, (_, n) => ({ _id: `event:${n}`, revision: 1, status: n === 42 ? 'redirected' : 'open',
    title: `Exact event ${n}`, summary: `Unmodified owner evidence ${n}. A different source is not implicitly irrelevant.` }));
  const original = temporalSourceCatalog(scope, { sceneKitId: scope.sceneKitId }, raw, [constraint]);
  const catalog = temporalAnalysisCatalog(original);
  const choice = { schemaVersion: A.choice, rulings: [{ constraintRef: constraint.constraintRef, bodyFingerprint: constraint.bodyFingerprint,
    explanation: 'The GM already confirmed sixth bell is 6 AM, campaign day 5.', kind: 'clock_before',
    deadline: { calendar: 'campaign', day: 5, hour: 6, minute: 0, second: 0 } }] };
  const ruling = { schemaVersion: A.ruling, rulingRef: 'ruling:test', decisionRef: 'decision:test', operationId: 'operation:test',
    ...choice.rulings[0], humanIdentity: 'owner:test', createdAt: '2026-10-19T16:00:00Z', receiptRef: 'receipt:test', constraint };
  const authority = createAnalyzedTemporalAuthority(scope, state, catalog, [ruling]);
  const proposal = { campaignId: scope.campaignId, sceneKit: { sceneKitId: scope.sceneKitId }, sceneReality: { realityId: 'reality:test' },
    sceneStoryDesign: { designId: 'design:test' }, zones: [], actorFrames: [], elements: [], facts: [], preparedBoundaries: [boundary] };
  const refs = temporalRecordRefs(proposal);
  const review: any = { verdict: 'supported', clockIndependentRecordRefs: refs.filter((r) => r !== boundary.boundaryId),
    conditions: [{ recordRefs: [boundary.boundaryId], predicateRefs: authority.predicates.map((p: any) => p.predicateId) }], unresolvedRecordRefs: [],
    sourceAnalysis: catalog.sources.map((r: any, n: number) => ({ sourceRef: r.eventRef, disposition: n === 0 ? 'material' : 'background',
      rationale: n === 0 ? 'The named worker deadline constrains the prepared boundary.' : `This source concerns a different place and has no dependency on this scout (${n}).`,
      recordRefs: n === 0 ? [boundary.boundaryId] : [], question: null })) };
  return { scope, state, boundary, constraint, original, catalog, choice, ruling, authority, proposal, review };
}

describe('ADR 031 corrected analysis/human-ruling boundary', () => {
  it.each([0, 9, 43, 64])('retains every exact source for machine analysis (%i), with no human partition', (count) => {
    const f = fixture(count);
    expect(f.catalog.sources).toEqual(f.original.sources.map((r: any) => r.evidence));
    expect(f.catalog).not.toHaveProperty('included'); expect(f.catalog).not.toHaveProperty('excluded');
    expect(f.authority.sourceCount).toBe(count); expect(f.authority.catalogFingerprint).toBe(f.original.fingerprint);
    expect(() => assertAnalyzedTemporalAuthority(f.authority)).not.toThrow();
    expect(() => assertTemporalRulingChoice(f.choice, f.catalog, f.state.gameClock)).not.toThrow();
  });
  it('rejects the old checklist shape rather than filling it automatically or claiming model consent', () => {
    const f = fixture();
    expect(() => assertTemporalRulingChoice({ ...f.choice, included: [], excluded: [] }, f.catalog, f.state.gameClock)).toThrow();
    expect(() => assertTemporalRulingChoice({ included: [], excluded: [], rulings: f.choice.rulings }, f.catalog, f.state.gameClock)).toThrow();
  });
  it('requires unique complete source analysis with exact dependencies and concrete rationale', () => {
    const f = fixture(); expect(() => assertTemporalSourceAnalysis(f.review, f.catalog, f.authority, f.proposal, true)).not.toThrow();
    for (const mutate of [(r: any) => r.sourceAnalysis.pop(), (r: any) => r.sourceAnalysis.push(r.sourceAnalysis[0]),
      (r: any) => r.sourceAnalysis[0].sourceRef = 'event:foreign', (r: any) => r.sourceAnalysis[0].rationale = ' ',
      (r: any) => r.sourceAnalysis[0].recordRefs = [], (r: any) => r.sourceAnalysis[1].recordRefs = [f.boundary.boundaryId],
      (r: any) => r.sourceAnalysis[0].recordRefs = ['record:foreign'], (r: any) => r.sourceAnalysis[0].humanConfirmed = true]) {
      const r = structuredClone(f.review); mutate(r); expect(() => assertTemporalSourceAnalysis(r, f.catalog, f.authority, f.proposal, true)).toThrow();
    }
  });
  it('distinguishes explicit unresolved world facts from implicit requests and never calls them adequate', () => {
    const f = fixture(), r = structuredClone(f.review), row = r.sourceAnalysis[0];
    row.disposition = 'unresolved_fact'; r.conditions = []; r.unresolvedRecordRefs = [f.boundary.boundaryId]; r.verdict = 'unsupported';
    expect(() => assertTemporalSourceAnalysis(r, f.catalog, f.authority, f.proposal, false)).toThrow();
    row.question = 'Did the worker already leave the drain before the familiar entered?';
    expect(() => assertTemporalSourceAnalysis(r, f.catalog, f.authority, f.proposal, false)).not.toThrow();
    expect(() => assertTemporalSourceAnalysis(r, f.catalog, f.authority, f.proposal, true)).toThrow();
    r.verdict = 'supported'; expect(() => assertTemporalSourceAnalysis(r, f.catalog, f.authority, f.proposal, false)).toThrow();
  });
  it('keeps large prose outside the executable cap without omitting it or replacing it with a summary', () => {
    const f = fixture(); f.original.sources[0].evidence.summary = 'Exact source evidence. '.repeat(2000);
    const catalog = temporalAnalysisCatalog(f.original);
    const a = createAnalyzedTemporalAuthority(f.scope, f.state, catalog, [f.ruling]);
    expect(catalog.sources[0].summary).toBe(f.original.sources[0].evidence.summary);
    expect(Buffer.byteLength(JSON.stringify(catalog))).toBeGreaterThan(16384);
    expect(Buffer.byteLength(JSON.stringify(a))).toBeLessThanOrEqual(16384);
  });
  it('rejects changed catalog, wrong owner/rule/constraint and forged numeric predicates', () => {
    const f = fixture();
    for (const mutate of [(a: any) => a.predicates[0].deadline.hour = 7, (a: any) => a.sourceCount = 65,
      (a: any) => a.catalogFingerprint = 'not a hash', (a: any) => a.events[0].campaignDeadline.hour = 7]) {
      const a = structuredClone(f.authority); mutate(a); expect(() => assertAnalyzedTemporalAuthority(a)).toThrow();
    }
    expect(() => createAnalyzedTemporalAuthority({ ...f.scope, campaignId: 'campaign:other' }, f.state, f.catalog, [f.ruling])).toThrow();
    const rule = structuredClone(f.ruling); rule.constraint.label = 'Different constraint';
    expect(() => createAnalyzedTemporalAuthority(f.scope, f.state, f.catalog, [rule])).toThrow();
    const catalog = { ...f.catalog, catalogFingerprint: 'f'.repeat(64) };
    expect(() => assertTemporalSourceAnalysis(f.review, catalog, f.authority, f.proposal, true)).toThrow();
  });
  it('states the positive first-pass obligations, not just correction instructions', () => {
    const operation = getOperationDefinition(A.operation);
    expect(operation.prompt.version).toBe(A.examinerPolicy);
    expect(operation.prompt.systemInstruction).toContain(SCENE_TEMPORAL_ANALYSIS_POLICY);
    expect(operation.prompt.systemInstruction).toContain(SCENE_SHAPE_TABLE_POLICY);
    expect(operation.prompt.systemInstruction).not.toContain('exhaustive human-GM scope decision');
    expect(operation.context.inputHardLimitBytes).toBe(131072);
    for (const text of ['EVERY source', 'material', 'background', 'unresolved_fact', 'exactly one row',
      'Never ask the GM which sources are relevant', 'pending and completed mechanics', 'known answer is reused', 'no new calls or larger limits'])
      expect(SCENE_TEMPORAL_ANALYSIS_POLICY).toContain(text);
    for (const text of ['shapes[N]', 'null', 'Primitives stay literal', 'literal normal registered JSON']) expect(SCENE_SHAPE_TABLE_POLICY).toContain(text);
  });
});

describe('new-operation-only lossless shape-table working set', () => {
  const logical = () => ({ pendingIntentContext: { window: { windowFingerprint: 'a'.repeat(64) }, ownerReadSet: { revision: 1 } },
    proposal: { operationId: 'build:test' }, nullValue: null, array: [null, 0, false, [], {}],
    rows: Array.from({ length: 100 }, (_, i) => ({ originalFieldName: `value:${i}`, exactNull: null, literalUnicode: '隠れる → Éowyn' })) });
  it.each([14, 15])('decodes profile %i before the actual registered validator without a spurious profile mismatch', async (profile) => {
    const value = compileScenePreparationWorkingSet({ ...logical(), preparationPolicyVersion: profile }, A.operation, 'examine');
    const validator = getSemanticValidator('authority-boundary')!;
    const result = await validator({ request: { operation: A.operation, context: { input: { value } }, authority: { canon: 'GMC', mechanics: 'none', commit: 'proposal_only' } }, output: {} } as any);
    expect(result.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SCENE_INFORMATION_PROFILE_MISMATCH' })]));
    expect(result.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SCENE_WORKING_SET_INVALID' })]));
  });
  it('preserves every byte, array/object distinction and null, deterministically', () => {
    const input = logical(), original = structuredClone(input), result = compileScenePreparationWorkingSet(input, A.operation, 'examine');
    expect(result.schemaVersion).toBe(A.workingSet); expect(decodeScenePreparationWorkingSet(result, A.operation)).toEqual(input);
    expect(input).toEqual(original);
    expect(compileScenePreparationWorkingSet(Object.fromEntries(Object.entries(input).reverse()), A.operation, 'examine')).toEqual(result);
    const old = A.operation.replace('.analysis', '.gm-decisions');
    expect(compileScenePreparationWorkingSet(input, old, 'examine').schemaVersion).toBe('gma.scene-preparation-working-set/1');
    expect(() => decodeScenePreparationWorkingSet(result, old)).toThrow();
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(Buffer.byteLength(JSON.stringify(compileScenePreparationWorkingSet(input, old, 'examine'))));
  });
  it.each(['index', 'arity', 'object', 'unused', 'duplicate', 'pollution', 'depth', 'bytes'])('rejects malformed %s instead of dropping fields', (kind) => {
    const v = encodeSceneShapeTable({ literal: [null], nested: { a: 'exact' } });
    if (kind === 'index') v.value[0] = 999999;
    if (kind === 'arity') v.value.pop();
    if (kind === 'object') v.value[1] = { surprise: 'not encoded' };
    if (kind === 'unused') v.shapes.push(['unused']);
    if (kind === 'duplicate') v.shapes.push(v.shapes[0]);
    if (kind === 'pollution') v.shapes[0][0] = '__proto__';
    if (kind === 'depth') { let node: any = null; for (let i = 0; i < 70; i++) node = [null, node]; v.value = node; }
    if (kind === 'bytes') v.value = 'x'.repeat(1_048_576);
    expect(() => decodeSceneShapeTable(v)).toThrow('SCENE_WORKING_SET_INVALID');
  });
});
