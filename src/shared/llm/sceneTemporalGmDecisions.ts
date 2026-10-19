import { freeformJsonDigest, canonicalFreeformJson } from './freeformPlanBinding.js';
import { campaignInstant, temporalEventDefinitions, createTemporalAuthorityContext } from './sceneTemporalValidity.js';

type Row = Record<string, any>;
export const SCENE_TEMPORAL_GM = Object.freeze({
  capability: 'scene-temporal-gm-decisions/1', catalog: 'gmc.scene-temporal-source-catalog/1',
  scope: 'gmc.scene-temporal-scope-decision/1', ruling: 'gmc.scene-temporal-ruling/1',
  receipt: 'gmc.scene-temporal-decision-receipt/1', context: 'gmc.scene-temporal-authority-context/2',
  compileRequest: 'gma.scene-prepared-binding-compile-request/2', compileResponse: 'gma.scene-prepared-binding-compile-response/2',
  resume: 'gmc.scene-preparation-resume/1',
  reviewIssue: 'gmc.scene-preparation-review-issuance/1',
  review: 'gma.scene-temporal-coverage-review/2', manifest: 'gmc.scene-temporal-validity-manifest/2',
  assessment: 'gma.scene-readiness-assessment/10', certificate: 'gmc.scene-readiness-certificate/3',
  preparedReview: 'gma.scene-prepared-binding-review/3', record: 'gmc.scene-pending-intent-binding-record/8',
  bindingReceipt: 'gma.action-intent-binding-receipt/8', manualState: 'gma.scene-reality-manual-state/12',
  examinerPolicy: 'gma.scene-readiness-examiner-policy/18',
  operation: 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation.temporal-validity.gm-decisions',
});
export const SCENE_TEMPORAL_GM_LIMITS = Object.freeze({ sources: 64, probe: 65, pageRows: 8,
  pageBytes: 32768, decisionBytes: 32768, rationaleChars: 240, rulingChars: 2000, rulings: 16, prepareMinutes: 15 });
export const SCENE_TEMPORAL_GM_POLICY = 'Use assessment gma.scene-readiness-assessment/10 and temporal coverage review gma.scene-temporal-coverage-review/2. The complete source catalog has an exhaustive human-GM scope decision. Its excluded sources are outside this Scene only; they are not closed or resolved. Review every included source and every exact owner-confirmed timing ruling. Only supplied predicates authorize time-dependent prepared records. Compare the exact constraint reference, source body fingerprint, human explanation and calendar fields. Every owner constraint targeted by a ruling must remain in proposal.preparedBoundaries with its exact original boundaryId, temporal kind and beyondScope text; a changed or retired constraint requires unsupported review and blocking timeline debt, not a renamed or inferred rule. A model may not author, reinterpret or override scope, a ruling or a conflicting structured owner deadline. Unsupported or implicit timing remains unresolved with blocking timeline debt; do not treat event status as proof that an unstated clock deadline is in the future. All original prepared-record partition, pending/completed separation and player-facing evidence requirements remain mandatory. A ruling does not advance time, establish arrival or reveal findings.';
const G = SCENE_TEMPORAL_GM, L = SCENE_TEMPORAL_GM_LIMITS;
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const object = (v: any): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: any, keys: string[]) => object(v) && same(Object.keys(v).sort(), [...keys].sort());
const id = (v: any) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
export function requireTemporalGm(ok: unknown, field: string): asserts ok {
  if (!ok) throw Object.assign(new Error('SCENE_TEMPORAL_GM_DECISION_INVALID'), {
    code: 'SCENE_TEMPORAL_GM_DECISION_INVALID', details: { field } });
}
export function temporalSourceCatalog(scope: { campaignId: string }, sourceHead: Row, raw: Row[], constraints: Row[]): Row {
  const events = temporalEventDefinitions(raw);
  requireTemporalGm(new Set(events.map((e) => e.eventRef)).size === events.length, 'catalog.duplicates');
  const rawById = new Map(raw.map((row) => [String(row._id ?? row.id ?? row.eventId ?? ''), JSON.parse(JSON.stringify(row))]));
  const sources = events.map((e) => ({ kind: e.eventRef.startsWith('gmc:event:quest:') ? 'quest' : 'event',
    sourceRef: e.eventRef, sourceRevision: e.sourceRevision,
    bodyFingerprint: freeformJsonDigest(rawById.get(e.eventRef.slice('gmc:event:'.length))), evidence: e }));
  const body = { schemaVersion: G.catalog, campaignId: scope.campaignId, sourceHead, complete: true, sources, constraints };
  // Clock and transient workspace/Scene revision heads are checked at human
  // confirmation. Reuse depends on source/constraint bodies, not ordinary turns.
  return { ...body, fingerprint: freeformJsonDigest({ campaignId: scope.campaignId,
    sceneKitId: sourceHead.sceneKitId, sources, constraints }) };
}
/** Store refs and fingerprints, never a second mutable event world. */
export function temporalCatalogIdentities(catalog: Row): Row[] {
  return catalog.sources.map(({ kind, sourceRef, sourceRevision, bodyFingerprint }: Row) => ({ kind, sourceRef, sourceRevision, bodyFingerprint }));
}
export function temporalCatalogPage(catalog: Row, offset: number, display?: { currentClock: Row | null; revision: number }): Row {
  requireTemporalGm(Number.isSafeInteger(offset) && offset >= 0 && offset <= catalog.sources.length, 'catalog.offset');
  const sources: Row[] = [];
  const base = { schemaVersion: G.catalog, campaignId: catalog.campaignId, sourceHead: catalog.sourceHead,
    fingerprint: catalog.fingerprint, complete: true, total: catalog.sources.length, offset,
    constraints: catalog.constraints, ...display };
  for (const source of catalog.sources.slice(offset, offset + L.pageRows)) {
    const candidate = { ...base, sources: [...sources, source], nextOffset: offset + sources.length + 1 < catalog.sources.length ? offset + sources.length + 1 : null };
    if (Buffer.byteLength(JSON.stringify(candidate)) > L.pageBytes) break;
    sources.push(source);
  }
  requireTemporalGm(sources.length > 0 || offset === catalog.sources.length, 'catalog.pageBytes');
  const page = { ...base, sources, nextOffset: offset + sources.length < catalog.sources.length ? offset + sources.length : null };
  requireTemporalGm(Buffer.byteLength(JSON.stringify(page)) <= L.pageBytes, 'catalog.pageBytes');
  return page;
}
/** No omitted rows, implicit exclusions, duplicate refs or guessed constraints. */
export function assertTemporalGmChoice(choice: Row, catalog: Row, currentClock: Row | null): void {
  requireTemporalGm(exact(choice, ['included', 'excluded', 'rulings']) && Array.isArray(choice.included)
    && Array.isArray(choice.excluded) && Array.isArray(choice.rulings) && choice.rulings.length <= L.rulings, 'choice.shape');
  requireTemporalGm(choice.included.every(id) && choice.excluded.every((r: Row) => exact(r, ['sourceRef', 'rationale'])
    && id(r.sourceRef) && typeof r.rationale === 'string' && r.rationale.trim().length > 0 && r.rationale.length <= L.rationaleChars), 'choice.exclusions');
  const refs = [...choice.included, ...choice.excluded.map((r: Row) => r.sourceRef)];
  requireTemporalGm(refs.length <= L.sources && new Set(refs).size === refs.length
    && same([...refs].sort(), catalog.sources.map((r: Row) => r.sourceRef).sort()), 'choice.partition');
  requireTemporalGm(new Set(choice.rulings.map((r: Row) => r.constraintRef)).size === choice.rulings.length, 'choice.rulingDuplicates');
  for (const r of choice.rulings) {
    const keys = r.kind === 'clock_before' ? ['constraintRef', 'bodyFingerprint', 'explanation', 'kind', 'deadline']
      : ['constraintRef', 'bodyFingerprint', 'explanation', 'kind', 'start', 'end'];
    const constraint = catalog.constraints.find((c: Row) => c.constraintRef === r.constraintRef);
    requireTemporalGm(exact(r, keys) && ['clock_before', 'clock_interval'].includes(r.kind)
      && constraint && constraint.bodyFingerprint === r.bodyFingerprint
      && typeof r.explanation === 'string' && r.explanation.trim().length > 0 && r.explanation.length <= L.rulingChars, 'choice.constraint');
    const clocks = r.kind === 'clock_before' ? [r.deadline] : [r.start, r.end];
    requireTemporalGm(clocks.every((c) => exact(c, ['calendar', 'day', 'hour', 'minute', 'second'])
      && typeof c.calendar === 'string' && c.calendar.length > 0 && c.calendar === (currentClock?.calendar ?? 'campaign')
      && campaignInstant(c) !== null), 'choice.calendar');
    requireTemporalGm(r.kind !== 'clock_interval' || campaignInstant(r.start)! < campaignInstant(r.end)!, 'choice.interval');
    if (constraint.campaignDeadline != null) requireTemporalGm(r.kind === 'clock_before' && same(r.deadline, constraint.campaignDeadline), 'choice.ownerConflict');
    if (constraint.campaignInterval != null) requireTemporalGm(r.kind === 'clock_interval' && same({ start: r.start, end: r.end }, constraint.campaignInterval), 'choice.ownerConflict');
  }
  requireTemporalGm(Buffer.byteLength(JSON.stringify(choice)) <= L.decisionBytes, 'choice.bytes');
}

/** Only the owner service may select these inputs from its verified decision.
 * The LLM gets the included evidence plus immutable provenance, not a guessed
 * summary or the complete oversized campaign catalog. */
export function createScopedTemporalAuthorityContext(scope: { campaignId: string; sceneKitId: string }, state: Row | null,
  rawIncludedEvents: Row[], scopeDecision: Row, rulings: Row[]): Row {
  requireTemporalGm(exact(scopeDecision, ['schemaVersion', 'decisionRef', 'receiptRef', 'catalogFingerprint', 'includedSources', 'excludedCount'])
    && scopeDecision.schemaVersion === G.scope && id(scopeDecision.decisionRef) && id(scopeDecision.receiptRef)
    && /^[a-f0-9]{64}$/.test(scopeDecision.catalogFingerprint)
    && Array.isArray(scopeDecision.includedSources) && scopeDecision.includedSources.length <= L.sources
    && scopeDecision.includedSources.every((r: Row) => exact(r, ['kind', 'sourceRef', 'sourceRevision', 'bodyFingerprint'])
      && ['quest', 'event'].includes(r.kind) && id(r.sourceRef) && r.sourceRef.startsWith(`gmc:event:${r.kind}:`)
      && /^[a-f0-9]{64}$/.test(r.bodyFingerprint))
    && new Set(scopeDecision.includedSources.map((r: Row) => r.sourceRef)).size === scopeDecision.includedSources.length
    && Number.isSafeInteger(scopeDecision.excludedCount) && scopeDecision.excludedCount >= 0
    && scopeDecision.excludedCount + scopeDecision.includedSources.length <= L.sources, 'authority.scope');
  const included = temporalEventDefinitions(rawIncludedEvents);
  requireTemporalGm(same(included.map((e) => [e.eventRef, e.sourceRevision]).sort(),
    scopeDecision.includedSources.map((r: Row) => [r.sourceRef, r.sourceRevision]).sort()), 'authority.included');
  requireTemporalGm(Array.isArray(rulings) && rulings.length <= L.rulings
    && new Set(rulings.map((r) => r.rulingRef)).size === rulings.length, 'authority.rulings');
  const rulingEvents = rulings.map((r) => {
    requireTemporalGm(exact(r, ['schemaVersion', 'rulingRef', 'scopeDecisionRef', 'operationId', 'constraintRef', 'bodyFingerprint',
      'explanation', 'kind', ...(r.kind === 'clock_before' ? ['deadline'] : ['start', 'end']), 'humanIdentity', 'createdAt', 'receiptRef', 'constraint'])
      && r.schemaVersion === G.ruling && id(r.rulingRef) && id(r.operationId) && r.scopeDecisionRef === scopeDecision.decisionRef
      && r.receiptRef === scopeDecision.receiptRef && id(r.humanIdentity) && typeof r.createdAt === 'string'
      && object(r.constraint) && r.constraint.constraintRef === r.constraintRef && r.constraint.bodyFingerprint === r.bodyFingerprint,
    'authority.rulingProvenance');
    const choice = r.kind === 'clock_before' ? { constraintRef: r.constraintRef, bodyFingerprint: r.bodyFingerprint,
      explanation: r.explanation, kind: r.kind, deadline: r.deadline }
      : { constraintRef: r.constraintRef, bodyFingerprint: r.bodyFingerprint, explanation: r.explanation, kind: r.kind, start: r.start, end: r.end };
    assertTemporalGmChoice({ included: [], excluded: [], rulings: [choice] }, { sources: [], constraints: [r.constraint] }, state?.gameClock ?? null);
    return { _id: `ruling:${freeformJsonDigest(r.rulingRef)}`, revision: r.bodyFingerprint,
      title: r.constraint.label, summary: r.explanation, status: 'owner_confirmed_scene_constraint',
      ...(r.kind === 'clock_before' ? { campaignDeadline: r.deadline } : { campaignInterval: { start: r.start, end: r.end } }) };
  });
  // The total number of actual catalog sources is still <=64. Rule records
  // have their separate bound; build the events independently without hiding
  // any source or increasing the authority envelope.
  const base = createTemporalAuthorityContext(scope, state, rawIncludedEvents);
  const ruleBase = createTemporalAuthorityContext(scope, state, rulingEvents);
  const { fingerprint: _base, eventDefinitionsFingerprint: _events, ...body } = base;
  const value: Row = { ...body, schemaVersion: G.context, selectionScope: 'human_gm_scene_scope',
    scopeDecision: structuredClone(scopeDecision), rulings: structuredClone(rulings),
    events: [...base.events, ...ruleBase.events].sort((a, b) => a.eventRef.localeCompare(b.eventRef)),
    predicates: [...base.predicates, ...ruleBase.predicates] };
  value.eventDefinitionsFingerprint = freeformJsonDigest({ scopeDecision: value.scopeDecision, rulings: value.rulings,
    events: value.events.map(({ deadlineState: _derived, ...e }: Row) => e) });
  value.fingerprint = freeformJsonDigest(value);
  requireTemporalGm(Buffer.byteLength(JSON.stringify(value)) <= 16384 && value.predicates.length <= 64, 'authority.bytes');
  return value;
}
export function assertScopedTemporalAuthorityContext(value: Row): void {
  requireTemporalGm(exact(value, ['schemaVersion', 'campaignId', 'sceneKitId', 'selectionScope', 'complete', 'clockRevision',
    'currentClock', 'calendar', 'events', 'eventDefinitionsFingerprint', 'predicates', 'fingerprint', 'scopeDecision', 'rulings'])
    && value.schemaVersion === G.context && value.selectionScope === 'human_gm_scene_scope' && value.complete === true, 'authority.shape');
  const refs = new Set(value.scopeDecision?.includedSources.map((r: Row) => r.sourceRef));
  const raw = value.events.filter((e: Row) => refs.has(e.eventRef)).map((e: Row) => ({ ...e,
    _id: e.eventRef.slice('gmc:event:'.length), revision: e.sourceRevision }));
  requireTemporalGm(same(value, createScopedTemporalAuthorityContext({ campaignId: value.campaignId, sceneKitId: value.sceneKitId },
    { gameClockRevision: value.clockRevision, gameClock: value.currentClock }, raw, value.scopeDecision, value.rulings)), 'authority.source');
}

export function assertGmRulingContinuity(authority: Row, proposal: Row): void {
  for (const rule of authority.rulings) {
    const rows = (proposal.preparedBoundaries ?? []).filter((r: Row) => r.boundaryId === rule.constraintRef);
    requireTemporalGm(rows.length === 1 && rows[0].kind === 'temporal' && freeformJsonDigest({ boundaryId: rows[0].boundaryId,
      kind: rows[0].kind, beyondScope: rows[0].beyondScope }) === rule.bodyFingerprint, 'review.constraintContinuity');
  }
}
