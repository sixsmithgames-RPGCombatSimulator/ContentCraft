import { createHash } from 'node:crypto';
import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { SCENE_TEMPORAL_GM as G, assertScopedTemporalAuthorityContext, assertGmRulingContinuity } from './sceneTemporalGmDecisions.js';
import { SCENE_TEMPORAL_ANALYSIS as A, assertAnalyzedTemporalAuthority, assertTemporalSourceAnalysis } from './sceneTemporalAnalysis.js';

type Row = Record<string, any>;
export const SCENE_TEMPORAL_VALIDITY = Object.freeze({
  capability: 'owner-evaluated-scene-temporal-validity/1',
  context: 'gmc.scene-temporal-authority-context/1', review: 'gma.scene-temporal-coverage-review/1',
  manifest: 'gmc.scene-temporal-validity-manifest/1', evaluation: 'gmc.scene-temporal-validity-evaluation/1',
  assessment: 'gma.scene-readiness-assessment/9', certificate: 'gmc.scene-readiness-certificate/2',
  preparedReview: 'gma.scene-prepared-binding-review/2', record: 'gmc.scene-pending-intent-binding-record/7',
  receipt: 'gma.action-intent-binding-receipt/7', manualState: 'gma.scene-reality-manual-state/11',
  examinerPolicy: 'gma.scene-readiness-examiner-policy/17',
  operation: 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation.temporal-validity',
});
export const SCENE_TEMPORAL_REVIEW_POLICY = 'Return assessment /9 retaining every /8 semantic review. temporalCoverageReview is exactly {schemaVersion,authorityFingerprint,verdict,rationale,clockIndependentRecordRefs,conditions,unresolvedRecordRefs}. Copy authorityFingerprint from temporalAuthority.fingerprint and schemaVersion gma.scene-temporal-coverage-review/1. Partition EVERY exact temporalRecordRefs entry once: either clockIndependentRecordRefs, a conditions row recordRefs, or unresolvedRecordRefs. Each conditions row is exactly {predicateRefs,recordRefs}, both nonempty unique arrays; predicateRefs copies only supplied temporalAuthority.predicates predicateId values and means conjunction. Do not invent time values, parse a bell into a date, create events or resolve effects. Mark clock-independent only records whose complete meaning has no material clock assumption; a worker leaving at a bell, changing light, expiring access or event-driven obstruction needs exact owner predicates. Review temporal assertions in all world/prose fields, not merely explicit temporal boundaries. Event text is evidence, not an executable deadline. Ambiguous or unsupported timing, missing anchors/calendars and incomplete event evidence are unresolved. Every relevant event must be considered, including events without numeric deadlines. Supported requires no unresolved refs and all selected predicates true on supplied current owners; otherwise return unsupported, repair_required and blocking timeline debt naming unresolved/unsupported records. Explain actual temporal meaning and source evidence in rationale (1..2000 characters). The partition proves completeness, not truth; never manufacture a temporal fact. This review does not advance time, schedule consequences, grant observation or replace any earlier review. The app compiles the manifest and rechecks actual owners; no additional calls or larger limits.';
const T = SCENE_TEMPORAL_VALIDITY;
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const object = (v: any): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: any, keys: string[]) => object(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
function requireValid(ok: unknown, field: string): asserts ok {
  if (!ok) throw Object.assign(new Error('SCENE_TEMPORAL_VALIDITY_INVALID'), { code: 'SCENE_TEMPORAL_VALIDITY_INVALID', details: { field } });
}
const bounded = (v: unknown, max: number, field: string) => requireValid(Buffer.byteLength(JSON.stringify(v)) <= max, field);
const uniqueStrings = (v: any, max: number, min = 0): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max
  && v.every((x: any) => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(x)) && new Set(v).size === v.length;
export function campaignInstant(clock: any): number | null {
  if (!object(clock)) return null;
  const { day, hour, minute = 0, second = 0 } = clock;
  if (![day, hour, minute, second].every(Number.isSafeInteger) || day < 0 || hour < 0 || hour > 23
    || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const value = day * 86400 + hour * 3600 + minute * 60 + second;
  return Number.isSafeInteger(value) ? value : null;
}
const calendar = (clock: any) => clock?.calendar ?? 'campaign';
const eventDefinition = ({ deadlineState: _derived, ...v }: Row) => v;
/** Exact public owner evidence, also used by the paged human catalog. This
 * projection is not a model authority record and does not waive its byte cap. */
export function temporalEventDefinitions(rawEvents: Row[]): Row[] {
  requireValid(Array.isArray(rawEvents) && rawEvents.length <= 64, 'events.complete');
  return JSON.parse(JSON.stringify(rawEvents)).map((e: Row) => {
    const sourceId = String(e._id ?? e.id ?? e.eventId ?? '');
    requireValid(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,229}$/.test(sourceId), 'events.sourceId');
    return { eventRef: `gmc:event:${sourceId}`, sourceRevision: e.revision ?? e.updatedAt ?? null,
      title: e.title ?? e.name ?? '', summary: e.summary ?? '', status: e.status ?? null,
      campaignDeadline: e.campaignDeadline ?? null, campaignInterval: e.campaignInterval ?? null,
      deadlineAt: e.deadlineAt ?? null, deadlineDescription: e.deadlineDescription ?? e.deadline ?? null,
      deadlineState: e.deadlineState ?? null, consequence: e.consequence ?? null };
  }).sort((a: Row, b: Row) => a.eventRef.localeCompare(b.eventRef));
}
export function temporalRecordRefs(proposal: Row): string[] {
  const refs = [proposal.sceneKit?.sceneKitId, proposal.sceneReality?.realityId, proposal.sceneStoryDesign?.designId,
    'temporal-record:opening-frame', ...['zones', 'actorFrames', 'elements', 'facts', 'preparedBoundaries'].flatMap((field) =>
      (proposal[field] ?? []).map((v: Row) => v[{ zones: 'zoneId', actorFrames: 'actorFrameId', elements: 'elementId', facts: 'factId', preparedBoundaries: 'boundaryId' }[field]!]))];
  requireValid(uniqueStrings(refs, 512, 4), 'recordCatalog');
  return refs.sort();
}

/** Complete owner evidence only. A bounded display projection is not an input. */
export function createTemporalAuthorityContext(scope: { campaignId: string; sceneKitId: string }, state: Row | null,
  rawEvents: Row[], complete = true): Row {
  requireValid(complete && Array.isArray(rawEvents) && rawEvents.length <= 64, 'events.complete');
  state = state === null ? null : JSON.parse(JSON.stringify(state));
  rawEvents = JSON.parse(JSON.stringify(rawEvents));
  const clockRevision = state?.gameClockRevision ?? 0;
  requireValid(Number.isSafeInteger(clockRevision) && clockRevision >= 0, 'clockRevision');
  const events = rawEvents.map((e) => {
    const sourceId = String(e._id ?? e.id ?? e.eventId ?? '');
    requireValid(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,229}$/.test(sourceId), 'events.sourceId');
    return { eventRef: `gmc:event:${sourceId}`, sourceRevision: e.revision ?? e.updatedAt?.toISOString?.() ?? e.updatedAt ?? null,
      title: e.title ?? e.name ?? '', summary: e.summary ?? '', status: e.status ?? null,
      campaignDeadline: e.campaignDeadline ?? null, campaignInterval: e.campaignInterval ?? null,
      deadlineAt: e.deadlineAt ?? null, deadlineDescription: e.deadlineDescription ?? e.deadline ?? null,
      deadlineState: e.deadlineState ?? null, consequence: e.consequence ?? null };
  }).sort((a, b) => a.eventRef.localeCompare(b.eventRef));
  requireValid(new Set(events.map((e) => e.eventRef)).size === events.length, 'events.duplicates');
  const predicates: Row[] = [];
  for (const e of events) {
    const add = (kind: string, body: Row) => { const value = { kind, eventRef: e.eventRef, ...body };
      predicates.push({ predicateId: `temporal-predicate:${freeformJsonDigest(value)}`, ...value }); };
    if (campaignInstant(e.campaignDeadline) !== null && calendar(e.campaignDeadline) === calendar(state?.gameClock))
      add('clock_before', { deadline: e.campaignDeadline });
    if (object(e.campaignInterval) && campaignInstant(e.campaignInterval.start) !== null && campaignInstant(e.campaignInterval.end) !== null
      && campaignInstant(e.campaignInterval.start)! < campaignInstant(e.campaignInterval.end)!
      && [e.campaignInterval.start, e.campaignInterval.end].every((c) => calendar(c) === calendar(state?.gameClock)))
      add('clock_interval', { start: e.campaignInterval.start, end: e.campaignInterval.end });
    for (const field of ['status', 'deadlineState']) if (typeof e[field as keyof typeof e] === 'string')
      add('event_state_equal', { field, value: e[field as keyof typeof e] });
  }
  // Match the owner's public JSON representation before hashing. Mongo dates
  // must not hash as empty objects and then change identity on HTTP transport.
  const body = JSON.parse(JSON.stringify({ schemaVersion: T.context, campaignId: scope.campaignId, sceneKitId: scope.sceneKitId,
    selectionScope: 'all_pending_campaign_events', complete: true, clockRevision, currentClock: state?.gameClock ?? null,
    calendar: calendar(state?.gameClock), events, predicates }));
  body.eventDefinitionsFingerprint = freeformJsonDigest(body.events.map(eventDefinition));
  const value = { ...body, fingerprint: freeformJsonDigest(body) };
  bounded(value, 16384, 'authority.bytes');
  return value;
}
export function assertTemporalAuthorityContext(value: Row): void {
  if (value?.schemaVersion === A.context) return assertAnalyzedTemporalAuthority(value);
  if (value?.schemaVersion === G.context) return assertScopedTemporalAuthorityContext(value);
  requireValid(exact(value, ['schemaVersion', 'campaignId', 'sceneKitId', 'selectionScope', 'complete', 'clockRevision', 'currentClock',
    'calendar', 'events', 'eventDefinitionsFingerprint', 'predicates', 'fingerprint']) && value.schemaVersion === T.context
    && value.complete === true && value.selectionScope === 'all_pending_campaign_events'
    && Array.isArray(value.events) && value.events.length <= 64 && value.events.every((e: any) => object(e)
      && typeof e.eventRef === 'string' && e.eventRef.startsWith('gmc:event:')), 'authority.shape');
  const { fingerprint, ...body } = value;
  requireValid(fingerprint === freeformJsonDigest(body), 'authority.fingerprint');
  const raw = value.events.map((e: Row) => ({ ...e, _id: e.eventRef.slice('gmc:event:'.length), revision: e.sourceRevision }));
  requireValid(same(value, createTemporalAuthorityContext({ campaignId: value.campaignId, sceneKitId: value.sceneKitId }, { gameClockRevision: value.clockRevision, gameClock: value.currentClock }, raw)), 'authority.source');
}
export function temporalPredicateTrue(predicate: Row, authority: Row): boolean {
  const event = authority.events.find((e: Row) => e.eventRef === predicate.eventRef);
  if (!event) return false;
  if (predicate.kind === 'event_state_equal') return ['status', 'deadlineState'].includes(predicate.field) && event[predicate.field] === predicate.value;
  const now = campaignInstant(authority.currentClock);
  if (now === null) return false;
  if (predicate.kind === 'clock_before') return same(event.campaignDeadline, predicate.deadline) && calendar(predicate.deadline) === authority.calendar
    && now < campaignInstant(predicate.deadline)!;
  if (predicate.kind === 'clock_interval') return same(event.campaignInterval, { start: predicate.start, end: predicate.end })
    && now >= campaignInstant(predicate.start)! && now < campaignInstant(predicate.end)!;
  return false;
}
export function assertTemporalCoverageReview(review: Row, authority: Row, proposal: Row, adequate: boolean, analysisCatalog?: Row): void {
  assertTemporalAuthorityContext(authority);
  const catalog = temporalRecordRefs(proposal), predicates = new Map(authority.predicates.map((p: Row) => [p.predicateId, p]));
  const analyzed = authority.schemaVersion === A.context;
  requireValid(exact(review, ['schemaVersion', 'authorityFingerprint', 'verdict', 'rationale', 'clockIndependentRecordRefs', 'conditions', 'unresolvedRecordRefs', ...(analyzed ? ['sourceAnalysis'] : [])])
    && review.schemaVersion === (analyzed ? A.review : authority.schemaVersion === G.context ? G.review : T.review) && review.authorityFingerprint === authority.fingerprint
    && ['supported', 'unsupported'].includes(review.verdict) && typeof review.rationale === 'string' && review.rationale.trim().length > 0
    && review.rationale.length <= 2000 && uniqueStrings(review.clockIndependentRecordRefs, 512)
    && uniqueStrings(review.unresolvedRecordRefs, 512) && Array.isArray(review.conditions) && review.conditions.length <= 64, 'review.shape');
  const refs = [...review.clockIndependentRecordRefs, ...review.unresolvedRecordRefs];
  const selectedPredicates = new Set<string>();
  for (const row of review.conditions) {
    requireValid(exact(row, ['predicateRefs', 'recordRefs']) && uniqueStrings(row.predicateRefs, 64, 1) && uniqueStrings(row.recordRefs, 512, 1), 'review.conditions');
    refs.push(...row.recordRefs);
    for (const ref of row.predicateRefs) { requireValid(predicates.has(ref), 'review.predicate'); selectedPredicates.add(ref); }
  }
  requireValid(selectedPredicates.size <= 64 && uniqueStrings(refs, 512) && same([...refs].sort(), catalog), 'review.partition');
  bounded(review, 16384, 'review.bytes');
  if (adequate || review.verdict === 'supported') requireValid(review.verdict === 'supported' && !review.unresolvedRecordRefs.length
    && [...selectedPredicates].every((ref) => temporalPredicateTrue(predicates.get(ref) as Row, authority)), 'review.unsupported');
  if ([A.context, G.context].includes(authority.schemaVersion) && (adequate || review.verdict === 'supported')) assertGmRulingContinuity(authority, proposal);
  if (analyzed) assertTemporalSourceAnalysis(review, analysisCatalog!, authority, proposal, adequate);
}
export function historicalTemporalAssessment(value: Row): Row {
  const { temporalCoverageReview: _review, ...body } = value;
  return { ...body, schemaVersion: 'gma.scene-readiness-assessment/8' };
}
export function createTemporalValidityManifest(authority: Row, proposal: Row, assessment: Row, analysisCatalog?: Row): Row {
  const family = authority.schemaVersion === A.context ? A : authority.schemaVersion === G.context ? G : T;
  requireValid(assessment.schemaVersion === family.assessment && assessment.dossierFingerprint === freeformJsonDigest(proposal)
    && authority.campaignId === proposal.campaignId && authority.sceneKitId === proposal.sceneKit?.sceneKitId, 'assessment.identity');
  assertTemporalCoverageReview(assessment.temporalCoverageReview, authority, proposal, assessment.verdict === 'adequate', analysisCatalog);
  requireValid(assessment.verdict === 'adequate', 'assessment.verdict');
  const selected = new Set(assessment.temporalCoverageReview.conditions.flatMap((r: Row) => r.predicateRefs));
  const body = { schemaVersion: family.manifest, campaignId: authority.campaignId, sceneKitId: authority.sceneKitId,
    dossierFingerprint: freeformJsonDigest(proposal), assessmentFingerprint: freeformJsonDigest(assessment),
    authority: structuredClone(authority), review: structuredClone(assessment.temporalCoverageReview),
    predicates: authority.predicates.filter((r: Row) => selected.has(r.predicateId)) };
  const value = { ...body, fingerprint: freeformJsonDigest(body) };
  bounded(value, 32768, 'manifest.bytes');
  return value;
}

const durableClock = (clock: any) => clock === null ? null : ({ calendar: clock?.calendar ?? 'campaign', day: clock?.day ?? null,
  hour: clock?.hour ?? null, minute: clock?.minute ?? null, second: clock?.second ?? 0, elapsedSeconds: clock?.elapsedSeconds ?? null,
  label: clock?.label ?? null, timeOfDay: clock?.timeOfDay ?? null, notes: clock?.notes ?? '' });
// The owner also supports an elapsed-only clock before the GM establishes a
// calendar instant. It proves monotonic duration, never an absolute deadline.
const relativeInstant = (clock: any): number | null => object(clock) && ['day', 'hour', 'minute'].every((key) => clock[key] == null)
  && (clock.second == null || clock.second === 0) && Number.isSafeInteger(clock.elapsedSeconds) && clock.elapsedSeconds >= 0
  ? clock.elapsedSeconds : null;
function forwardClock(previous: any, next: any): boolean {
  const nextAbsolute = campaignInstant(next), nextRelative = relativeInstant(next);
  if (previous === null) return nextAbsolute !== null || nextRelative !== null;
  const priorAbsolute = campaignInstant(previous), priorRelative = relativeInstant(previous);
  if (priorAbsolute !== null) return nextAbsolute !== null && nextAbsolute >= priorAbsolute
    && !(Number.isSafeInteger(previous.elapsedSeconds) && Number.isSafeInteger(next.elapsedSeconds)
      && next.elapsedSeconds < previous.elapsedSeconds);
  return priorRelative !== null && nextRelative !== null && nextRelative >= priorRelative;
}
function validClockChain(baseline: Row, current: Row, records: Row[]): boolean {
  const count = current.clockRevision - baseline.clockRevision;
  if (!Number.isSafeInteger(count) || count < 0 || count > 64 || records.length !== count || current.calendar !== baseline.calendar) return false;
  let revision = baseline.clockRevision, clock = baseline.currentClock;
  for (const record of records) {
    const body = { mutationId: record.mutationId, expectedRevision: record.expectedRevision, gameClock: durableClock(record.gameClock) };
    const fp = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (record.expectedRevision !== revision || record.gameClockRevision !== revision + 1 || !same(record.previousGameClock, clock)
      || record.source?.system !== 'gamemaster-assistant' || typeof record.source.interactionId !== 'string'
      || record.source.kind != null || record.mutationId !== `gma-time:${record.source.interactionId}`.slice(0, 200)
      || record.fingerprint !== fp || calendar(record.gameClock) !== current.calendar || !forwardClock(clock, record.gameClock)) return false;
    revision++; clock = record.gameClock;
  }
  return revision === current.clockRevision && same(clock, current.currentClock);
}
export function evaluateTemporalValidity(manifest: Row, current: Row, clockRecords: Row[]): Row {
  let decision = 'unresolved', changedDimensions = ['clock_condition'];
  try {
    // The owner ledger contains Mongo dates; the authority context uses their
    // exact public JSON form. Compare the same representation, never Date -> {}.
    clockRecords = JSON.parse(JSON.stringify(clockRecords));
    assertTemporalAuthorityContext(current); assertTemporalAuthorityContext(manifest.authority);
    const { fingerprint, ...body } = manifest;
    requireValid(exact(manifest, ['schemaVersion', 'campaignId', 'sceneKitId', 'dossierFingerprint', 'assessmentFingerprint',
      'authority', 'review', 'predicates', 'fingerprint']) && manifest.schemaVersion === (manifest.authority?.schemaVersion === A.context ? A.manifest : manifest.authority?.schemaVersion === G.context ? G.manifest : T.manifest)
      && fingerprint === freeformJsonDigest(body) && manifest.review?.verdict === 'supported'
      && manifest.review.authorityFingerprint === manifest.authority.fingerprint && !manifest.review.unresolvedRecordRefs?.length, 'manifest.fingerprint');
    const selected = new Set(manifest.review.conditions.flatMap((r: Row) => r.predicateRefs));
    requireValid(same(manifest.predicates, manifest.authority.predicates.filter((p: Row) => selected.has(p.predicateId)))
      && selected.size === manifest.predicates.length, 'manifest.predicates');
    const base = manifest.authority;
    if (manifest.campaignId !== current.campaignId || manifest.sceneKitId !== current.sceneKitId
      || base.eventDefinitionsFingerprint !== current.eventDefinitionsFingerprint) decision = 'owner_changed';
    else if (!validClockChain(base, current, clockRecords)) decision = 'unresolved';
    else if (!manifest.predicates.every((p: Row) => temporalPredicateTrue(p, current))) decision = 'boundary_crossed';
    else { decision = 'valid'; changedDimensions = []; }
  } catch { decision = 'unresolved'; }
  return { schemaVersion: T.evaluation, manifestFingerprint: manifest?.fingerprint ?? null,
    currentAuthorityFingerprint: current?.fingerprint ?? null, clockRevision: current?.clockRevision ?? null,
    evaluatedPredicateRefs: (manifest?.predicates ?? []).map((p: Row) => p.predicateId), decision,
    changedDimensions: decision === 'boundary_crossed' ? ['deadline_state_change', 'clock_condition'] : changedDimensions };
}
