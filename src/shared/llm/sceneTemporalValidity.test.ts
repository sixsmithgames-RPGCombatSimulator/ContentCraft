import { describe, expect, it } from 'vitest';
import { campaignClockMutationFingerprint } from '../../server/services/campaignClockMutation.js';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { SCENE_TEMPORAL_VALIDITY as T, SCENE_TEMPORAL_REVIEW_POLICY, temporalRecordRefs, campaignInstant,
  createTemporalAuthorityContext, assertTemporalAuthorityContext, assertTemporalCoverageReview,
  createTemporalValidityManifest, evaluateTemporalValidity } from './sceneTemporalValidity.js';
type Row = Record<string, any>;
const scope = { campaignId: 'campaign:test', sceneKitId: 'scene:test' };
const clock = (second = 0) => ({ calendar: 'campaign', day: 5, hour: 5, minute: 59, second });
const proposal = { campaignId: scope.campaignId, sceneKit: { sceneKitId: scope.sceneKitId }, sceneReality: { realityId: 'reality:test' },
  sceneStoryDesign: { designId: 'design:test' }, zones: [{ zoneId: 'zone:drain' }], actorFrames: [{ actorFrameId: 'actor:rat' }],
  elements: [], facts: [{ factId: 'fact:wall' }], preparedBoundaries: [{ boundaryId: 'boundary:bell' }] };
const events = [{ _id: 'event:bell', revision: 3, title: 'Sixth bell', status: 'active',
  campaignDeadline: { calendar: 'campaign', day: 5, hour: 6, minute: 0, second: 0 }, deadlineState: 'due_soon' }];
function fixture(conditional = false, initial: any = clock()) {
  const authority = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: initial }, conditional ? events : []);
  const refs = temporalRecordRefs(proposal), predicate = authority.predicates.find((p: Row) => p.kind === 'clock_before');
  const review: Row = { schemaVersion: T.review, authorityFingerprint: authority.fingerprint, verdict: 'supported', rationale: 'Exact owner time scope, without resolving any action.',
    clockIndependentRecordRefs: conditional ? refs.filter((r) => r !== 'actor:rat' && r !== 'boundary:bell') : refs,
    conditions: conditional ? [{ predicateRefs: [predicate.predicateId], recordRefs: ['actor:rat', 'boundary:bell'] }] : [], unresolvedRecordRefs: [] };
  const assessment = { schemaVersion: T.assessment, verdict: 'adequate', dossierFingerprint: freeformJsonDigest(proposal), temporalCoverageReview: review };
  const manifest = createTemporalValidityManifest(authority, proposal, assessment);
  return { authority, review, assessment, manifest };
}
function advance(f: ReturnType<typeof fixture>, next: any, rawEvents: Row[] = f.authority.events.map((e: Row) => ({ ...e,
  _id: e.eventRef.slice('gmc:event:'.length), revision: e.sourceRevision }))) {
  const mutationId = 'gma-time:interaction:move', expectedRevision = 10;
  const record = { mutationId, expectedRevision, gameClockRevision: 11, previousGameClock: f.authority.currentClock,
    gameClock: next, source: { system: 'gamemaster-assistant', interactionId: 'interaction:move' },
    fingerprint: campaignClockMutationFingerprint({ mutationId, expectedRevision, gameClock: next }) };
  const current = createTemporalAuthorityContext(scope, { gameClockRevision: 11, gameClock: next }, rawEvents);
  return { record, current };
}
describe('owner evaluated temporal Scene validity', () => {
  it('keeps the complete static world usable after one actual owner time operation', () => {
    const f = fixture(), { current, record } = advance(f, clock(5));
    expect(evaluateTemporalValidity(f.manifest, current, [record])).toMatchObject({ decision: 'valid', changedDimensions: [] });
    expect(f.authority.clockRevision).toBe(10);
  });
  it('compares real Mongo Date clock receipts with their equivalent HTTP JSON authority view', () => {
    const previous = { ...clock(), updatedAt: new Date('2026-10-18T00:00:00Z') };
    const next = { ...clock(5), updatedAt: new Date('2026-10-18T00:00:05Z') };
    const f = fixture(false, previous), a = advance(f, next);
    a.record.previousGameClock = previous;
    expect(evaluateTemporalValidity(f.manifest, a.current, [a.record]).decision).toBe('valid');
    a.record.previousGameClock = { ...previous, updatedAt: new Date('2026-10-18T00:00:01Z') };
    expect(evaluateTemporalValidity(f.manifest, a.current, [a.record]).decision).toBe('unresolved');
  });
  it('supports the actual unset-clock initial operation for a timeless Scene only', () => {
    const elapsed = { calendar: 'campaign', day: null, hour: null, minute: null, second: 0, elapsedSeconds: 6,
      label: null, timeOfDay: null, notes: 'Short entry', updatedAt: new Date('2026-10-18T00:00:06Z') };
    const f = fixture(false, null), { current, record } = advance(f, elapsed);
    expect(evaluateTemporalValidity(f.manifest, current, [record]).decision).toBe('valid');
    expect(() => fixture(true, null)).toThrow('SCENE_TEMPORAL_VALIDITY_INVALID');
    expect(() => fixture(true, elapsed)).toThrow('SCENE_TEMPORAL_VALIDITY_INVALID');
    expect(campaignInstant(elapsed)).toBeNull();
  });
  it('verifies elapsed-only continuity without inventing a calendar anchor', () => {
    const elapsed = { calendar: 'campaign', day: null, hour: null, minute: null, second: 0, elapsedSeconds: 6 };
    const f = fixture(false, elapsed), a = advance(f, { ...elapsed, elapsedSeconds: 12 });
    expect(evaluateTemporalValidity(f.manifest, a.current, [a.record]).decision).toBe('valid');
    for (const next of [{ ...elapsed, elapsedSeconds: 5 }, { ...elapsed, elapsedSeconds: -1 },
      { ...elapsed, elapsedSeconds: 6.5 }, { ...elapsed, day: 5 }, clock(12)]) {
      const invalid = advance(f, next);
      expect(evaluateTemporalValidity(f.manifest, invalid.current, [invalid.record]).decision).toBe('unresolved');
    }
    const anchored = fixture(), removed = advance(anchored, elapsed);
    expect(evaluateTemporalValidity(anchored.manifest, removed.current, [removed.record]).decision).toBe('unresolved');
  });
  it('permits time within an exact window but rejects equality at its strict deadline', () => {
    const f = fixture(true), inside = advance(f, clock(59));
    expect(evaluateTemporalValidity(f.manifest, inside.current, [inside.record]).decision).toBe('valid');
    const boundary = advance(f, { ...clock(), hour: 6, minute: 0 });
    expect(evaluateTemporalValidity(f.manifest, boundary.current, [boundary.record])).toMatchObject({ decision: 'boundary_crossed',
      changedDimensions: ['deadline_state_change', 'clock_condition'] });
  });
  it('has inclusive interval starts and exclusive ends', () => {
    const raw = [{ ...events[0], campaignInterval: { start: clock(), end: clock(10) } }];
    const authority = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: clock() }, raw);
    const f = fixture(); f.authority = authority;
    f.review.authorityFingerprint = authority.fingerprint;
    f.review.clockIndependentRecordRefs = [];
    f.review.conditions = [{ predicateRefs: [authority.predicates.find((p: Row) => p.kind === 'clock_interval').predicateId], recordRefs: temporalRecordRefs(proposal) }];
    f.manifest = createTemporalValidityManifest(authority, proposal, f.assessment);
    expect(evaluateTemporalValidity(f.manifest, authority, []).decision).toBe('valid');
    const next = advance(f, clock(10), raw);
    expect(evaluateTemporalValidity(f.manifest, next.current, [next.record]).decision).toBe('boundary_crossed');
  });
  it.each(['removed', 'changed', 'added'])('rejects %s owner event definitions even for otherwise static records', (kind) => {
    const f = fixture(true), raw = kind === 'removed' ? [] : kind === 'added' ? [...events, { ...events[0], _id: 'event:new' }]
      : [{ ...events[0], revision: 4, status: 'completed' }];
    const { current, record } = advance(f, clock(5), raw);
    expect(evaluateTemporalValidity(f.manifest, current, [record]).decision).toBe('owner_changed');
  });
  it.each(['missing', 'duplicate', 'wrong_revision', 'changed_body', 'unknown_source', 'rewind', 'calendar'])('rejects %s clock continuity', (kind) => {
    const f = fixture(), a = advance(f, kind === 'rewind' ? { ...clock(), minute: 58 } : kind === 'calendar' ? { ...clock(5), calendar: 'foreign' } : clock(5));
    const records = kind === 'missing' ? [] : kind === 'duplicate' ? [a.record, a.record] : [a.record];
    if (kind === 'wrong_revision') a.record.expectedRevision = 9;
    if (kind === 'changed_body') a.record.previousGameClock = clock(3);
    if (kind === 'unknown_source') a.record.source.system = 'unknown';
    expect(evaluateTemporalValidity(f.manifest, a.current, records).decision).toBe('unresolved');
  });
  it('rejects foreign owner scope, forged manifests and a removed selected predicate', () => {
    const f = fixture(true), a = advance(f, clock(5));
    const foreign = createTemporalAuthorityContext({ ...scope, campaignId: 'campaign:other' }, { gameClockRevision: 11, gameClock: clock(5) }, events);
    expect(evaluateTemporalValidity(f.manifest, foreign, [a.record]).decision).toBe('owner_changed');
    f.manifest.predicates = [];
    const { fingerprint: _fp, ...body } = f.manifest; f.manifest.fingerprint = freeformJsonDigest(body);
    expect(evaluateTemporalValidity(f.manifest, a.current, [a.record]).decision).toBe('unresolved');
  });
  it.each(['omitted', 'duplicate', 'foreign', 'unknown_predicate', 'unresolved'])('rejects an adequate %s record partition', (kind) => {
    const f = fixture();
    if (kind === 'omitted') f.review.clockIndependentRecordRefs.pop();
    if (kind === 'duplicate') f.review.clockIndependentRecordRefs.push('actor:rat');
    if (kind === 'foreign') f.review.clockIndependentRecordRefs[0] = 'foreign:record';
    if (kind === 'unknown_predicate') { f.review.clockIndependentRecordRefs = []; f.review.conditions = [{ predicateRefs: ['predicate:foreign'], recordRefs: temporalRecordRefs(proposal) }]; }
    if (kind === 'unresolved') { f.review.unresolvedRecordRefs = f.review.clockIndependentRecordRefs.splice(0, 1); }
    expect(() => assertTemporalCoverageReview(f.review, f.authority, proposal, true)).toThrow('SCENE_TEMPORAL_VALIDITY_INVALID');
  });
  it('refuses an incomplete or overflowing event catalog instead of truncating it', () => {
    expect(() => createTemporalAuthorityContext(scope, null, [], false)).toThrow();
    expect(() => createTemporalAuthorityContext(scope, null, Array.from({ length: 65 }, (_, n) => ({ _id: `event:${n}` })))).toThrow();
    const f = fixture(); f.authority.complete = false;
    expect(() => assertTemporalAuthorityContext(f.authority)).toThrow();
  });
  it('does not turn natural-language timing into a guessed numeric predicate', () => {
    const authority = createTemporalAuthorityContext(scope, null, [{ _id: 'event:bell', deadlineDescription: 'After the sixth bell', status: 'active' }]);
    expect(authority.predicates.map((p: Row) => p.kind)).toEqual(['event_state_equal']);
    expect(campaignInstant({ day: 1, hour: 24 })).toBeNull();
  });
  it('keeps ambiguous bell timing unresolved until an explicit owner ruling supplies its meaning', () => {
    const raw = [{ _id: 'bell:gm', revision: 1, deadlineDescription: 'The worker leaves after sixth bell.' }];
    const initial = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: clock() }, raw);
    const refs = temporalRecordRefs(proposal);
    const unresolved = { schemaVersion: T.review, authorityFingerprint: initial.fingerprint, verdict: 'unsupported',
      rationale: 'The GM must establish which campaign instant sixth bell means; no numeric source exists.',
      clockIndependentRecordRefs: [], conditions: [], unresolvedRecordRefs: refs };
    expect(initial.predicates).toEqual([]);
    assertTemporalCoverageReview(unresolved, initial, proposal, false);
    expect(() => createTemporalValidityManifest(initial, proposal, { schemaVersion: T.assessment, verdict: 'adequate',
      dossierFingerprint: freeformJsonDigest(proposal), temporalCoverageReview: unresolved })).toThrow();
    // Explicit structured owner evidence, not a parser or model-invented clock.
    const ruled = [{ ...raw[0], revision: 2, campaignDeadline: events[0].campaignDeadline }];
    const authority = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: clock() }, ruled);
    expect(() => assertTemporalCoverageReview(unresolved, authority, proposal, false)).toThrow();
    const review = { ...unresolved, authorityFingerprint: authority.fingerprint, verdict: 'supported',
      rationale: 'The GM owner now explicitly defines sixth bell as day 5 at 06:00 in this calendar.', unresolvedRecordRefs: [],
      conditions: [{ predicateRefs: [authority.predicates[0].predicateId], recordRefs: refs }] };
    const assessment = { schemaVersion: T.assessment, verdict: 'adequate', dossierFingerprint: freeformJsonDigest(proposal), temporalCoverageReview: review };
    const manifest = createTemporalValidityManifest(authority, proposal, assessment);
    const f = { ...fixture(), authority, manifest }, crossed = advance(f, { ...clock(), hour: 6, minute: 0 }, ruled);
    expect(evaluateTemporalValidity(manifest, crossed.current, [crossed.record]).decision).toBe('boundary_crossed');
    expect(raw).toEqual([{ _id: 'bell:gm', revision: 1, deadlineDescription: 'The worker leaves after sixth bell.' }]);
  });
  it('preserves actual Mongo date meanings across HTTP JSON and includes the fingerprint in its byte bound', () => {
    const authority = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: { ...clock(), updatedAt: new Date('2026-10-18T00:00:00Z') } },
      [{ _id: 'event:date', updatedAt: new Date('2026-10-18T00:00:00Z'), deadlineAt: new Date('2026-10-19T00:00:00Z') }]);
    expect(authority.events[0].deadlineAt).toBe('2026-10-19T00:00:00.000Z');
    assertTemporalAuthorityContext(JSON.parse(JSON.stringify(authority)));
    const empty = createTemporalAuthorityContext(scope, null, [{ _id: 'sized', summary: '' }]);
    const available = 16384 - Buffer.byteLength(JSON.stringify(empty));
    expect(Buffer.byteLength(JSON.stringify(createTemporalAuthorityContext(scope, null, [{ _id: 'sized', summary: 'x'.repeat(available) }])))).toBe(16384);
    expect(() => createTemporalAuthorityContext(scope, null, [{ _id: 'sized', summary: 'x'.repeat(available + 1) }])).toThrow();
  });
  it('includes the ninth source, accepts 64 complete small records, and rejects byte overflow', () => {
    for (const count of [9, 64]) {
      const raw = Array.from({ length: count }, (_, n) => ({ _id: `e${n}` }));
      const authority = createTemporalAuthorityContext(scope, null, raw);
      expect(authority.events).toHaveLength(count); assertTemporalAuthorityContext(authority);
    }
    const f = fixture(), raw = Array.from({ length: 9 }, (_, n) => ({ _id: `e${n}` }));
    f.authority = createTemporalAuthorityContext(scope, { gameClockRevision: 10, gameClock: clock() }, raw);
    f.review.authorityFingerprint = f.authority.fingerprint;
    f.manifest = createTemporalValidityManifest(f.authority, proposal, f.assessment);
    raw[8] = { ...raw[8], title: 'Changed ninth source' } as any;
    const a = advance(f, clock(5), raw);
    expect(evaluateTemporalValidity(f.manifest, a.current, [a.record]).decision).toBe('owner_changed');
    expect(() => createTemporalAuthorityContext(scope, null, [{ _id: 'oversized', summary: 'x'.repeat(16384) }])).toThrow();
  });
  it('puts implicit and explicit timing, complete source comparison and unresolved behavior in the first-pass policy', () => {
    for (const text of ['EVERY', 'worker leaving at a bell', 'all world/prose fields', 'Do not invent time values', 'repair_required', 'every /8 semantic review'])
      expect(SCENE_TEMPORAL_REVIEW_POLICY).toContain(text);
  });
});
