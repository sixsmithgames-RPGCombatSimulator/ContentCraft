import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { createTemporalAuthorityContext, temporalRecordRefs } from './sceneTemporalValidity.js';
import { assertTemporalGmChoice, requireTemporalGm } from './sceneTemporalGmDecisions.js';

type Row = Record<string, any>;
/** ADR 031 correction. Analysis is not a human applicability decision. */
export const SCENE_TEMPORAL_ANALYSIS = Object.freeze({
  capability: 'scene-temporal-analysis/1', catalog: 'gmc.scene-temporal-analysis-catalog/1',
  choice: 'gma.scene-temporal-ruling-choice/1', decision: 'gmc.scene-temporal-ruling-decision/1',
  ruling: 'gmc.scene-temporal-ruling/2', receipt: 'gmc.scene-temporal-decision-receipt/2',
  context: 'gmc.scene-temporal-authority-context/3', review: 'gma.scene-temporal-coverage-review/3',
  read: 'gmc.scene-temporal-analysis-context/1',
  manifest: 'gmc.scene-temporal-validity-manifest/3', assessment: 'gma.scene-readiness-assessment/11',
  certificate: 'gmc.scene-readiness-certificate/4', preparedReview: 'gma.scene-prepared-binding-review/4',
  record: 'gmc.scene-pending-intent-binding-record/9', bindingReceipt: 'gma.action-intent-binding-receipt/9',
  manualState: 'gma.scene-reality-manual-state/13', examinerPolicy: 'gma.scene-readiness-examiner-policy/19',
  workingSet: 'gma.scene-preparation-working-set/2',
  operation: 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation.temporal-validity.analysis',
});
const A = SCENE_TEMPORAL_ANALYSIS;
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const exact = (v: any, keys: string[]) => !!v && typeof v === 'object' && !Array.isArray(v)
  && same(Object.keys(v).sort(), [...keys].sort());
const id = (v: any) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const hash = (v: any) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const strings = (v: any, max: number) => Array.isArray(v) && v.length <= max && v.every(id) && new Set(v).size === v.length;
export const SCENE_TEMPORAL_ANALYSIS_POLICY = 'Return assessment gma.scene-readiness-assessment/11 with temporal coverage review gma.scene-temporal-coverage-review/3, retaining every prior semantic review. temporalAnalysisCatalog is complete owner evidence, not a human relevance decision. Analyze EVERY source against the full instruction, current owner premises and prepared successor, including remote and unknown-status sources. Add sourceAnalysis to temporalCoverageReview: exactly one row per catalog.sources eventRef, each exactly {sourceRef,disposition,rationale,recordRefs,question}. disposition is material, background, or unresolved_fact. Give concrete evidence-based rationale (1..240 characters); no blanket default or lexical filter. recordRefs are unique exact temporalRecordRefs; material and unresolved_fact require at least one dependency, background requires none. question is null unless unresolved_fact, when it is a focused plain-language question (1..500 characters) about an actually missing world fact that affects the named dependencies. Never ask the GM which sources are relevant, to classify entries, confirm your analysis, or review a checklist. Background is your analyzed conclusion, not a human exclusion. Supported requires no unresolved_fact and every material source dependency included in your complete record partition. Supplied predicates alone authorize numeric time conditions; status or prose cannot prove an unstated deadline has not passed. Consider all temporal assertions, pending and completed mechanics separately. Compare every actual owner-confirmed ruling to its exact named constraint and original body, explanation and calendar; keep it unchanged in proposal.preparedBoundaries. A known answer is reused, not asked again. Missing or conflicting world facts require unsupported, repair_required and blocking timeline debt naming affected records. Do not invent dates, consequences, arrival, observations, owner receipts or human confirmation. Relevance is app/LLM work; only genuine missing world facts are GM rulings. Full catalog and current owners are rechecked before save/execution; no new calls or larger limits.';

/** All exact public evidence, once. The owner separately binds raw body hashes. */
export function temporalAnalysisCatalog(catalog: Row): Row {
  requireTemporalGm(catalog.complete === true && hash(catalog.fingerprint) && Array.isArray(catalog.sources)
    && catalog.sources.length <= 64 && new Set(catalog.sources.map((r: Row) => r.sourceRef)).size === catalog.sources.length,
  'analysis.catalog');
  const result = { schemaVersion: A.catalog, campaignId: catalog.campaignId, sceneKitId: catalog.sourceHead.sceneKitId,
    catalogFingerprint: catalog.fingerprint, complete: true,
    sources: catalog.sources.map((r: Row) => {
      requireTemporalGm(r.sourceRef === r.evidence?.eventRef && same(r.sourceRevision, r.evidence?.sourceRevision), 'analysis.catalogSource');
      return structuredClone(r.evidence);
    }), constraints: structuredClone(catalog.constraints) };
  requireTemporalGm(Buffer.byteLength(JSON.stringify(result)) <= 1_048_576, 'analysis.catalogBytes');
  return result;
}
/** A ruling-only choice cannot silently become a human applicability partition. */
export function assertTemporalRulingChoice(choice: Row, catalog: Row, clock: Row | null): void {
  requireTemporalGm(exact(choice, ['schemaVersion', 'rulings']) && choice.schemaVersion === A.choice, 'rulings.choice');
  assertTemporalGmChoice({ included: [], excluded: [], rulings: choice.rulings }, { sources: [], constraints: catalog.constraints }, clock);
}

/** Executable numeric conditions only; full prose remains in the analysis catalog.
 * Each input ruling must already be authenticated by the independent owner writer. */
export function createAnalyzedTemporalAuthority(scope: { campaignId: string; sceneKitId: string }, state: Row | null,
  catalog: Row, rulings: Row[]): Row {
  requireTemporalGm(catalog.schemaVersion === A.catalog && catalog.complete === true && catalog.campaignId === scope.campaignId
    && catalog.sceneKitId === scope.sceneKitId && hash(catalog.catalogFingerprint) && Array.isArray(catalog.sources)
    && catalog.sources.length <= 64 && Array.isArray(rulings) && rulings.length <= 16, 'analysis.authorityCatalog');
  const ruleEvents = rulings.map((r: Row) => {
    requireTemporalGm(exact(r, ['schemaVersion', 'rulingRef', 'decisionRef', 'operationId', 'constraintRef', 'bodyFingerprint',
      'explanation', 'kind', ...(r.kind === 'clock_before' ? ['deadline'] : ['start', 'end']), 'humanIdentity', 'createdAt', 'receiptRef', 'constraint'])
      && r.schemaVersion === A.ruling && [r.rulingRef, r.decisionRef, r.operationId, r.humanIdentity, r.receiptRef].every(id)
      && typeof r.createdAt === 'string' && catalog.constraints.some((c: Row) => same(c, r.constraint))
      && r.constraint.constraintRef === r.constraintRef && r.constraint.bodyFingerprint === r.bodyFingerprint, 'analysis.ruling');
    const { constraintRef, bodyFingerprint, explanation, kind, deadline, start, end } = r;
    assertTemporalRulingChoice({ schemaVersion: A.choice, rulings: [kind === 'clock_before'
      ? { constraintRef, bodyFingerprint, explanation, kind, deadline }
      : { constraintRef, bodyFingerprint, explanation, kind, start, end }] }, catalog, state?.gameClock ?? null);
    return { _id: `ruling:${freeformJsonDigest(r.rulingRef)}`, revision: r.bodyFingerprint,
      ...(kind === 'clock_before' ? { campaignDeadline: deadline } : { campaignInterval: { start, end } }) };
  });
  requireTemporalGm(new Set(rulings.map((r) => r.rulingRef)).size === rulings.length, 'analysis.duplicateRuling');
  // Each source is evaluated separately so the prose catalog is not forced into
  // the executable record. No event is filtered by semantic relevance here.
  const numeric = [...catalog.sources.map((e: Row) => ({ _id: e.eventRef.slice('gmc:event:'.length), revision: e.sourceRevision,
    campaignDeadline: e.campaignDeadline, campaignInterval: e.campaignInterval })), ...ruleEvents];
  const parts = numeric.map((e) => createTemporalAuthorityContext(scope, state, [e]));
  const base = createTemporalAuthorityContext(scope, state, []);
  const { fingerprint: _old, ...body } = base;
  const events = parts.flatMap((p) => p.events).filter((e) => e.campaignDeadline !== null || e.campaignInterval !== null);
  const predicates = parts.flatMap((p) => p.predicates).filter((p) => ['clock_before', 'clock_interval'].includes(p.kind));
  const result: Row = { ...body, schemaVersion: A.context, selectionScope: 'application_llm_analysis',
    catalogFingerprint: catalog.catalogFingerprint, sourceCount: catalog.sources.length, rulings: structuredClone(rulings), events, predicates,
    eventDefinitionsFingerprint: freeformJsonDigest({ catalogFingerprint: catalog.catalogFingerprint, rulings }) };
  result.fingerprint = freeformJsonDigest(result);
  requireTemporalGm(Buffer.byteLength(JSON.stringify(result)) <= 16384 && predicates.length <= 64, 'analysis.authorityBytes');
  return result;
}

export function assertAnalyzedTemporalAuthority(value: Row): void {
  requireTemporalGm(exact(value, ['schemaVersion', 'campaignId', 'sceneKitId', 'selectionScope', 'complete', 'clockRevision',
    'currentClock', 'calendar', 'events', 'eventDefinitionsFingerprint', 'predicates', 'fingerprint', 'catalogFingerprint', 'sourceCount', 'rulings'])
    && value.schemaVersion === A.context && value.selectionScope === 'application_llm_analysis' && value.complete === true
    && hash(value.catalogFingerprint) && Number.isSafeInteger(value.sourceCount) && value.sourceCount >= 0 && value.sourceCount <= 64
    && Array.isArray(value.events) && Array.isArray(value.rulings), 'analysis.authorityShape');
  const { fingerprint, ...body } = value;
  requireTemporalGm(fingerprint === freeformJsonDigest(body) && value.eventDefinitionsFingerprint === freeformJsonDigest({
    catalogFingerprint: value.catalogFingerprint, rulings: value.rulings }), 'analysis.authorityFingerprint');
  // Reconstruct every numeric predicate, not a model's claimed truth result.
  const parts = value.events.map((e: Row) => createTemporalAuthorityContext({ campaignId: value.campaignId, sceneKitId: value.sceneKitId },
    { gameClockRevision: value.clockRevision, gameClock: value.currentClock }, [{ ...e, _id: e.eventRef.slice('gmc:event:'.length), revision: e.sourceRevision }]));
  requireTemporalGm(new Set(value.events.map((e: Row) => e.eventRef)).size === value.events.length
    && same(parts.flatMap((p: Row) => p.events), value.events)
    && same(parts.flatMap((p: Row) => p.predicates).filter((p: Row) => ['clock_before', 'clock_interval'].includes(p.kind)), value.predicates)
    && Buffer.byteLength(JSON.stringify(value)) <= 16384 && value.predicates.length <= 64, 'analysis.authorityPredicates');
}

export function assertTemporalSourceAnalysis(review: Row, catalog: Row, authority: Row, proposal: Row, adequate: boolean): void {
  requireTemporalGm(catalog?.schemaVersion === A.catalog && catalog.complete === true
    && catalog.catalogFingerprint === authority.catalogFingerprint && catalog.campaignId === authority.campaignId
    && catalog.sceneKitId === authority.sceneKitId && catalog.sources.length === authority.sourceCount, 'analysis.reviewCatalog');
  const rows = review.sourceAnalysis, refs = new Set(temporalRecordRefs(proposal));
  const covered = new Set([...review.clockIndependentRecordRefs, ...review.conditions.flatMap((r: Row) => r.recordRefs), ...review.unresolvedRecordRefs]);
  requireTemporalGm(Array.isArray(rows) && rows.length === catalog.sources.length && rows.length <= 64
    && new Set(rows.map((r: Row) => r.sourceRef)).size === rows.length
    && same(rows.map((r: Row) => r.sourceRef).sort(), catalog.sources.map((r: Row) => r.eventRef).sort()), 'analysis.partition');
  for (const r of rows) {
    requireTemporalGm(exact(r, ['sourceRef', 'disposition', 'rationale', 'recordRefs', 'question'])
      && ['material', 'background', 'unresolved_fact'].includes(r.disposition)
      && typeof r.rationale === 'string' && r.rationale.trim().length > 0 && r.rationale.length <= 240
      && strings(r.recordRefs, 512) && r.recordRefs.every((ref: string) => refs.has(ref) && covered.has(ref))
      && (r.disposition === 'background' ? r.recordRefs.length === 0 : r.recordRefs.length > 0)
      && (r.disposition === 'unresolved_fact' ? typeof r.question === 'string' && r.question.trim().length > 0 && r.question.length <= 500
        && review.verdict === 'unsupported' && !adequate && r.recordRefs.every((ref: string) => review.unresolvedRecordRefs.includes(ref))
        : r.question === null), 'analysis.row');
  }
  if (adequate || review.verdict === 'supported') requireTemporalGm(!rows.some((r: Row) => r.disposition === 'unresolved_fact'), 'analysis.unresolved');
}
