import { describe, expect, it } from 'vitest';
import { SCENE_TEMPORAL_GM as G, temporalSourceCatalog, temporalCatalogPage, assertTemporalGmChoice,
  createScopedTemporalAuthorityContext, assertScopedTemporalAuthorityContext } from './sceneTemporalGmDecisions.js';
import { SCENE_TEMPORAL_VALIDITY as T, temporalRecordRefs, assertTemporalCoverageReview,
  createTemporalValidityManifest, evaluateTemporalValidity } from './sceneTemporalValidity.js';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';

function fixture() {
  const scope = { campaignId: 'campaign:test', sceneKitId: 'scene:test' };
  const clock = { calendar: 'campaign', day: 5, hour: 5, minute: 59, second: 59 };
  const state = { gameClockRevision: 0, gameClock: clock };
  const boundary = { boundaryId: 'boundary:sixth-bell', kind: 'temporal', beyondScope: 'After sixth bell the window closes.' };
  const constraint = { constraintRef: 'boundary:sixth-bell', bodyFingerprint: freeformJsonDigest(boundary),
    label: 'After sixth bell the window closes.', campaignDeadline: null, campaignInterval: null };
  const summary = { schemaVersion: G.scope, decisionRef: 'scope:test', receiptRef: 'receipt:test',
    catalogFingerprint: 'a'.repeat(64), includedSources: [{ kind: 'quest', sourceRef: 'gmc:event:quest:one', sourceRevision: 1, bodyFingerprint: 'c'.repeat(64) }], excludedCount: 42 };
  const events = [{ _id: 'quest:one', revision: 1, title: 'An explicitly included source', summary: 'Trigger-based evidence', status: 'active' }];
  const ruling = { schemaVersion: G.ruling, rulingRef: 'ruling:test', scopeDecisionRef: summary.decisionRef,
    operationId: 'timing:test', constraintRef: constraint.constraintRef, bodyFingerprint: constraint.bodyFingerprint,
    explanation: 'The GM confirms sixth bell means 6 AM on campaign day 5.', kind: 'clock_before',
    deadline: { calendar: 'campaign', day: 5, hour: 6, minute: 0, second: 0 },
    humanIdentity: 'owner:test', createdAt: '2026-10-19T12:00:00Z', receiptRef: summary.receiptRef, constraint };
  const authority = createScopedTemporalAuthorityContext(scope, state, events, summary, [ruling]);
  const proposal = { campaignId: scope.campaignId, sceneKit: { sceneKitId: scope.sceneKitId }, sceneReality: { realityId: 'reality:test' },
    sceneStoryDesign: { designId: 'design:test' }, zones: [], actorFrames: [], elements: [], facts: [], preparedBoundaries: [boundary] };
  const refs = temporalRecordRefs(proposal);
  const review = { schemaVersion: G.review, authorityFingerprint: authority.fingerprint, verdict: 'supported',
    rationale: 'The actual GM deadline binds this exact prepared temporal boundary; every other record is clock independent.',
    clockIndependentRecordRefs: refs.filter((r) => r !== constraint.constraintRef),
    conditions: [{ predicateRefs: authority.predicates.filter((p: any) => p.kind === 'clock_before').map((p: any) => p.predicateId), recordRefs: [constraint.constraintRef] }], unresolvedRecordRefs: [] };
  const assessment = { schemaVersion: G.assessment, dossierFingerprint: freeformJsonDigest(proposal), temporalCoverageReview: review, verdict: 'adequate' };
  return { scope, state, events, summary, ruling, authority, proposal, review, assessment };
}
describe('ADR 031 GM-owned temporal evidence and independent-review policy', () => {
  it('carries exact rulings and included evidence, without replacing them with a hash or parsing bell prose', () => {
    const f = fixture(); expect(() => assertScopedTemporalAuthorityContext(f.authority)).not.toThrow();
    expect(f.authority.rulings[0]).toEqual(f.ruling); expect(f.authority.scopeDecision.excludedCount).toBe(42);
    expect(f.authority.events[0].summary).toBe(f.events[0].summary);
    expect(Buffer.byteLength(JSON.stringify(f.authority))).toBeLessThanOrEqual(16384);
    expect(() => assertTemporalCoverageReview(f.review, f.authority, f.proposal, true)).not.toThrow();
  });
  it('uses the explicit GM predicate, valid before the deadline and false at exact equality', () => {
    const f = fixture(), manifest = createTemporalValidityManifest(f.authority, f.proposal, f.assessment);
    expect(manifest.schemaVersion).toBe(G.manifest);
    expect(evaluateTemporalValidity(manifest, f.authority, []).decision).toBe('valid');
    const reached = createScopedTemporalAuthorityContext(f.scope, { ...f.state, gameClock: f.ruling.deadline }, f.events, f.summary, [f.ruling]);
    const reachedReview = { ...f.review, authorityFingerprint: reached.fingerprint };
    expect(() => assertTemporalCoverageReview(reachedReview, reached, f.proposal, true)).toThrow();
  });
  it.each(['catalog', 'rule', 'constraint', 'included'])('invalidates changed %s rather than silently reusing the old scope', (kind) => {
    const f = fixture(), manifest = createTemporalValidityManifest(f.authority, f.proposal, f.assessment);
    if (kind === 'catalog') f.summary.catalogFingerprint = 'b'.repeat(64);
    if (kind === 'rule') f.ruling.deadline.minute = 1;
    if (kind === 'constraint') f.ruling.constraint.label += ' changed';
    if (kind === 'included') { f.events[0].revision++; f.summary.includedSources[0].sourceRevision++; }
    const changed = createScopedTemporalAuthorityContext(f.scope, f.state, f.events, f.summary, [f.ruling]);
    expect(evaluateTemporalValidity(manifest, changed, []).decision).toBe('owner_changed');
  });
  it('rejects fabricated/extra evidence, wrong owner provenance and a mismatched rule body', () => {
    const f = fixture();
    for (const mutate of [(a: any) => a.events[0].summary = 'forged', (a: any) => a.rulings[0].humanIdentity = null,
      (a: any) => a.rulings[0].bodyFingerprint = 'b'.repeat(64), (a: any) => a.rulings[0].authoritative = true,
      (a: any) => a.scopeDecision.includedSources = []]) {
      const a = structuredClone(f.authority); mutate(a); expect(() => assertScopedTemporalAuthorityContext(a)).toThrow();
    }
  });
  it('does not relabel an older review/assessment or allow implicit unsupported timing to be adequate', () => {
    const f = fixture();
    expect(() => assertTemporalCoverageReview({ ...f.review, schemaVersion: T.review }, f.authority, f.proposal, true)).toThrow();
    expect(() => createTemporalValidityManifest(f.authority, f.proposal, { ...f.assessment, schemaVersion: T.assessment })).toThrow();
    expect(() => assertTemporalCoverageReview({ ...f.review, conditions: [], unresolvedRecordRefs: [f.ruling.constraintRef], verdict: 'unsupported' }, f.authority, f.proposal, true)).toThrow();
    expect(() => assertTemporalCoverageReview({ ...f.review, conditions: [], unresolvedRecordRefs: [f.ruling.constraintRef], verdict: 'unsupported' }, f.authority, f.proposal, false)).not.toThrow();
  });
  it('states every new requirement in the original additive policy, retaining the old operation', () => {
    const op = getOperationDefinition(G.operation), old = getOperationDefinition(T.operation);
    expect(op.prompt.version).toBe(G.examinerPolicy); expect(old.prompt.version).toBe(T.examinerPolicy);
    for (const text of [G.assessment, G.review, 'human-GM scope', 'every included source', 'conflicting structured owner deadline', 'Unsupported or implicit timing', 'does not advance time'])
      expect(op.prompt.systemInstruction).toContain(text);
    expect(old.prompt.systemInstruction).not.toContain('human-GM scope decision');
    expect(op.context.inputHardLimitBytes).toBe(old.context.inputHardLimitBytes);
  });
  it.each([9, 43, 64])('shows every complete source in the %i-record catalog', (count) => {
    const raw = Array.from({ length: count }, (_, n) => ({ _id: `event:${n}`, summary: 'Full exact evidence', status: 'unknown' }));
    const catalog = temporalSourceCatalog({ campaignId: 'campaign:one' }, { sceneKitId: 'scene:one' }, raw, []);
    expect(catalog.sources).toHaveLength(count);
    const all: Record<string, any>[] = []; let offset = 0;
    while (offset < count) { const p = temporalCatalogPage(catalog, offset); all.push(...p.sources); offset += p.sources.length; }
    expect(all).toEqual(catalog.sources);
    expect(() => assertTemporalGmChoice({ included: all.map((r) => r.sourceRef), excluded: [], rulings: [] }, catalog, null)).not.toThrow();
  });
  it('stops on 65 sources, an oversized single human row, and oversized included model evidence', () => {
    expect(() => temporalSourceCatalog({ campaignId: 'campaign:one' }, { sceneKitId: 'scene:one' }, Array.from({ length: 65 }, (_, n) => ({ _id: `event:${n}` })), [])).toThrow();
    const catalog = temporalSourceCatalog({ campaignId: 'campaign:one' }, { sceneKitId: 'scene:one' }, [{ _id: 'event:one', summary: 'x'.repeat(32768) }], []);
    expect(() => temporalCatalogPage(catalog, 0)).toThrow();
    const f = fixture(); f.events[0].summary = 'x'.repeat(16384);
    expect(() => createScopedTemporalAuthorityContext(f.scope, f.state, f.events, f.summary, [f.ruling])).toThrow();
  });
  it('counts the displayed owner clock and decision revision inside the human page byte ceiling', () => {
    const catalog = temporalSourceCatalog({ campaignId: 'campaign:one' }, { sceneKitId: 'scene:one' }, [{ _id: 'event:one', summary: 'Exact evidence' }], []);
    const initial = temporalCatalogPage(catalog, 0);
    catalog.sources[0].evidence.summary += 'x'.repeat(32768 - Buffer.byteLength(JSON.stringify(initial)));
    expect(Buffer.byteLength(JSON.stringify(temporalCatalogPage(catalog, 0)))).toBe(32768);
    expect(() => temporalCatalogPage(catalog, 0, { currentClock: { calendar: 'campaign', day: 5, hour: 5, minute: 35, second: 30 }, revision: 100 })).toThrow();
    const empty = { ...catalog, sources: [], constraints: [{ label: 'x'.repeat(32768) }] };
    expect(() => temporalCatalogPage(empty, 0, { currentClock: null, revision: 0 })).toThrow();
  });
});
