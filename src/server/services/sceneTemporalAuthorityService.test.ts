import { describe, expect, it } from 'vitest';
import { readSceneTemporalAuthority, evaluateCurrentSceneTemporalValidity, assertCurrentSceneTemporalValidity,
  readPendingSceneTemporalEvents, TEMPORAL_TERMINAL_SOURCE_STATUSES } from './sceneTemporalAuthorityService.js';
import { createTemporalValidityManifest, temporalRecordRefs, SCENE_TEMPORAL_VALIDITY as T } from '../../shared/llm/sceneTemporalValidity.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
const scope = { userId: 'user:test', campaignId: 'campaign:test' };
const scene = { playableSceneContext: { sceneKitRef: { sceneKitId: 'scene:test', revision: 1 } } };
function fixture() {
  const state: any = { gameClockRevision: 0, gameClock: { day: 5, hour: 5, minute: 30, second: 0 } };
  const events: any[] = [{ _id: 'bell', status: 'active', title: 'Sixth bell', campaignDeadline: { day: 5, hour: 6, minute: 0, second: 0 } }];
  const seen: unknown[] = [];
  const deps = { readState: async (s: unknown) => { seen.push(s); return structuredClone(state); },
    readEvents: async (s: unknown) => { seen.push(s); return structuredClone(events); }, readScene: async (s: unknown) => { seen.push(s); return scene; } };
  return { state, events, deps, seen };
}
describe('complete current-owner temporal evidence', () => {
  it('includes separate QUEST and EVENT owners, their exact descriptions and distinct IDs even when raw IDs collide', async () => {
    const seen: unknown[] = [];
    const rows = await readPendingSceneTemporalEvents({ ...scope, programId: 'ignored' } as typeof scope, {
      readQuests: async (s, limit) => { seen.push([s, limit]); return [{ _id: 'same', summary: 'Quest evidence', status: 'active' }]; },
      readThreads: async (s, limit) => { seen.push([s, limit]); return [{ _id: 'same', description: 'Exact event deadline evidence', status: 'legacy_unknown' }]; },
    });
    expect(rows.map((row) => row._id)).toEqual(['event:same', 'quest:same']);
    expect(rows[0].summary).toBe('Exact event deadline evidence');
    expect(rows[0].status).toBe('legacy_unknown');
    expect(seen).toEqual([[scope, 65], [scope, 65]]);
    expect(TEMPORAL_TERMINAL_SOURCE_STATUSES).toContain('superseded');
    expect(TEMPORAL_TERMINAL_SOURCE_STATUSES).not.toContain('redirected');
  });
  it('counts the combined catalog rather than accepting 64 from each owner or silently dropping EVENT rows', async () => {
    const read = (q: number, t: number) => readPendingSceneTemporalEvents(scope, {
      readQuests: async () => Array.from({ length: q }, (_, n) => ({ _id: `q${n}` })),
      readThreads: async () => Array.from({ length: t }, (_, n) => ({ _id: `t${n}` })),
    });
    expect(await read(9, 34)).toHaveLength(43);
    expect(await read(32, 32)).toHaveLength(64);
    await expect(read(9, 56)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE' });
    await expect(read(65, 0)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE' });
    await expect(readPendingSceneTemporalEvents(scope, { readQuests: async () => [{}], readThreads: async () => [] }))
      .rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE', details: { field: 'events.sourceId' } });
  });
  it('stops combined full-evidence byte overflow without replacing event descriptions with empty summaries', async () => {
    const f = fixture();
    f.deps.readEvents = () => readPendingSceneTemporalEvents(scope, {
      readQuests: async () => Array.from({ length: 9 }, (_, n) => ({ _id: `q${n}`, summary: 'q'.repeat(500) })),
      readThreads: async () => Array.from({ length: 34 }, (_, n) => ({ _id: `t${n}`, description: 'e'.repeat(500) })),
    });
    await expect(readSceneTemporalAuthority(scope, f.deps)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE' });
  });
  it('reads unsliced evidence with exact owner scope and derives predicates from actual fields', async () => {
    const f = fixture(), authority = await readSceneTemporalAuthority({ ...scope, untrusted: 'ignored' } as typeof scope, f.deps);
    expect(authority.complete).toBe(true); expect(authority.events).toHaveLength(1);
    expect((authority.predicates as any[]).some((p) => p.kind === 'clock_before')).toBe(true);
    expect(f.seen).toEqual(Array.from({ length: 5 }, () => scope));
  });
  it.each(['clock', 'event'])('rejects a raced %s without issuing a new authority snapshot', async (kind) => {
    const f = fixture(); let stateReads = 0, eventReads = 0;
    if (kind === 'clock') f.deps.readState = async () => ({ ...f.state, gameClockRevision: stateReads++ });
    else f.deps.readEvents = async () => [{ ...f.events[0], revision: eventReads++ }];
    await expect(readSceneTemporalAuthority(scope, f.deps)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_CHANGED' });
  });
  it('fails closed on incomplete event bounds and unavailable owners', async () => {
    const f = fixture(); f.events.push(...Array.from({ length: 64 }, (_, n) => ({ _id: `bell:${n}` })));
    await expect(readSceneTemporalAuthority(scope, f.deps)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_AUTHORITY_INCOMPLETE' });
    f.deps.readEvents = async () => { throw new Error('owner unavailable'); };
    await expect(readSceneTemporalAuthority(scope, f.deps)).rejects.toThrow('owner unavailable');
  });
  it('validates a new certificate on actual owners and refuses a changed event source', async () => {
    const f = fixture(), authority = await readSceneTemporalAuthority(scope, f.deps) as any;
    const proposal = { campaignId: scope.campaignId, sceneKit: { sceneKitId: 'scene:test' }, sceneReality: { realityId: 'reality:test' },
      sceneStoryDesign: { designId: 'design:test' }, zones: [], actorFrames: [], facts: [], elements: [], preparedBoundaries: [] };
    const assessment = { schemaVersion: T.assessment, verdict: 'adequate', dossierFingerprint: freeformJsonDigest(proposal),
      temporalCoverageReview: { schemaVersion: T.review, authorityFingerprint: authority.fingerprint, verdict: 'supported', rationale: 'The stable scope has explicit timing evidence.',
        clockIndependentRecordRefs: temporalRecordRefs(proposal), conditions: [], unresolvedRecordRefs: [] } };
    const manifest = createTemporalValidityManifest(authority, proposal, assessment);
    const bundle: any = { readinessCertificate: { schemaVersion: T.certificate, temporalValidity: manifest }, readinessAssessment: assessment,
      pendingIntentBindingRecord: { assessmentFingerprint: freeformJsonDigest(assessment) } };
    f.seen.length = 0;
    expect(await evaluateCurrentSceneTemporalValidity({ ...scope, programId: 'program:scout', version: '3' } as typeof scope,
      bundle, f.deps)).toMatchObject({ decision: 'valid' });
    expect(f.seen).toHaveLength(7);
    expect(f.seen.every((s) => JSON.stringify(s) === JSON.stringify(scope))).toBe(true);
    f.events[0].status = 'completed';
    await expect(assertCurrentSceneTemporalValidity(scope, bundle, f.deps)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_VALIDITY_STALE' });
    bundle.pendingIntentBindingRecord.assessmentFingerprint = '0'.repeat(64);
    await expect(assertCurrentSceneTemporalValidity(scope, bundle, f.deps)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_VALIDITY_INVALID' });
  });
  it('does not reinterpret a historical certificate or require a new owner read for it', async () => {
    const unused = async () => { throw new Error('not permitted'); };
    expect(await evaluateCurrentSceneTemporalValidity(scope, { readinessCertificate: { schemaVersion: 'gmc.scene-readiness-certificate/1' } },
      { readState: unused, readScene: unused, readEvents: unused })).toBeNull();
  });
});
