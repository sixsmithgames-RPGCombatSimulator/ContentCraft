import { describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { sceneTemporalGmDecisionService, temporalGmOwnerFromRecords, type TemporalGmDocument, type TemporalGmPreparedDocument } from './sceneTemporalGmDecisionStore.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';

function memory<T extends { _id: string; userId: string; campaignId: string; operationId: string; revision?: number }>() {
  const rows: T[] = [];
  const api = { async findOne(filter: Record<string, unknown>, options?: { sort?: { revision?: number } }) {
    const matches = rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key as keyof T] === value));
    if (options?.sort?.revision) matches.sort((a, b) => Number(b.revision) - Number(a.revision));
    return structuredClone(matches[0] ?? null);
  }, async insertOne(row: T) {
    if (rows.some((r) => r._id === row._id || r.userId === row.userId && r.campaignId === row.campaignId
      && (r.operationId === row.operationId || row.revision !== undefined && r.revision === row.revision))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    rows.push(structuredClone(row));
  } };
  return { rows, collection: api as unknown as Pick<Collection<T>, 'findOne' | 'insertOne'> };
}
async function fixture(count = 43) {
  const scope = { userId: 'owner:one', campaignId: 'campaign:one' };
  const records = memory<TemporalGmDocument>(), preparations = memory<TemporalGmPreparedDocument>();
  const sources = Array.from({ length: count }, (_, n) => ({ _id: `${n < 9 ? 'quest' : 'event'}:${n}`,
    title: `Exact source ${n}`, summary: `Complete evidence ${n}`, revision: 1, status: n === 42 ? 'redirected' : 'active' }));
  const owner = { sourceHead: { sceneKitId: 'scene:one', sceneRevision: 12, workspaceRevision: 38, pointerRevision: 1,
    payloadFingerprint: 'a'.repeat(64) }, currentClock: { calendar: 'campaign', day: 5, hour: 5, minute: 35, second: 30 },
    constraints: [{ constraintRef: 'boundary:sixth-bell', bodyFingerprint: freeformJsonDigest('exact constraint'),
      label: 'After sixth bell the paid window closes.', campaignDeadline: null, campaignInterval: null }] };
  const seen: unknown[] = [], audit: Record<string, any>[] = [];
  let time = new Date('2026-10-19T12:00:00Z');
  const deps = { records: records.collection, preparations: preparations.collection,
    readOwner: async (s: unknown) => { seen.push(s); return structuredClone(owner); },
    readSources: async (s: unknown) => { seen.push(s); return structuredClone(sources); },
    now: () => time, writeCampaignAllowlist: [scope.campaignId], audit: (event: Record<string, any>) => { audit.push(event); } };
  const service = sceneTemporalGmDecisionService(deps), { catalog } = await service.readCatalog(scope);
  const choice = { included: [], excluded: catalog.sources.map((r: any) => ({ sourceRef: r.sourceRef, rationale: 'GM: unrelated to this scene.' })),
    rulings: [{ constraintRef: owner.constraints[0].constraintRef, bodyFingerprint: owner.constraints[0].bodyFingerprint,
      explanation: 'The GM confirms sixth bell means 6 AM on campaign day 5.', kind: 'clock_before',
      deadline: { calendar: 'campaign', day: 5, hour: 6, minute: 0, second: 0 } }] };
  const input = { ...scope, operationId: 'timing:one', expectedRevision: 0, expectedSourceHead: catalog.sourceHead,
    catalogFingerprint: catalog.fingerprint, choice, confirmationToken: 'Z'.repeat(40) };
  return { scope, service, deps, records, preparations, sources, owner, seen, input, audit,
    expire: () => { time = new Date('2026-10-20T12:00:00Z'); } };
}
describe('ADR 031 protected human Scene timing decisions', () => {
  it('audits complete counts, byte bounds and replay disposition without private source or GM prose', async () => {
    const f = await fixture(); await f.service.choices({ ...f.scope, offset: 0 });
    const prepared = await f.service.prepare(f.input);
    const input = { ...f.scope, decisionRef: prepared.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true };
    await f.service.confirm(input); await f.service.confirm(input);
    expect(f.audit.map((row) => row.stage)).toEqual(['choices', 'prepared', 'confirmed', 'confirmed']);
    expect(f.audit[0]).toMatchObject({ complete: true, sourceCount: 43, constraintCount: 1 });
    expect(f.audit[0].pageBytes).toBeLessThanOrEqual(32768);
    expect(f.audit.at(-1)).toMatchObject({ duplicate: true, revision: 1 });
    expect(JSON.stringify(f.audit)).not.toMatch(/Exact source|Complete evidence|sixth bell|owner:one|campaign:one|unrelated|ZZZZ/);
  });
  it('projects exact current owner heads and only actual named temporal constraints, never a model-only target', () => {
    const scene = { storyWorkspaceRef: { revision: 38 }, playableSceneContext: { sceneKitRef: {
      sceneKitId: 'scene:one', revision: 12, payloadHash: 'a'.repeat(64) } }, activeSceneContext: { state: { revision: 17 } } };
    const boundary = { boundaryId: 'boundary:bell', kind: 'temporal', beyondScope: 'At sixth bell the window closes.' };
    const reality = { pointerRevision: 3, bundle: { sceneReality: { preparedBoundaries: [boundary, { ...boundary, boundaryId: 'boundary:wall', kind: 'spatial' }] } } };
    const state = { gameClockRevision: 141, gameClock: { calendar: 'campaign', day: 5, hour: 5, minute: 35, second: 30 } };
    const owner = temporalGmOwnerFromRecords(scene, reality, state);
    expect(owner.sourceHead).toMatchObject({ workspaceRevision: 38, sceneRevision: 12, activeSceneStateRevision: 17, clockRevision: 141, pointerRevision: 3 });
    expect(owner.constraints).toHaveLength(1); expect(owner.constraints[0].bodyFingerprint).toBe(freeformJsonDigest(boundary));
    expect(owner.sourceHead.payloadFingerprint).toBe(scene.playableSceneContext.sceneKitRef.payloadHash);
    expect(() => temporalGmOwnerFromRecords({ ...scene, playableSceneContext: { sceneKitRef: {
      sceneKitId: 'scene:one', revision: 12, payloadFingerprint: 'a'.repeat(64) } } }, reality, state)).toThrow();
    expect(() => temporalGmOwnerFromRecords(null, reality, state)).toThrow();
    expect(() => temporalGmOwnerFromRecords({ ...scene, storyWorkspaceRef: {} }, reality, state)).toThrow();
    expect(() => temporalGmOwnerFromRecords(scene, { ...reality, bundle: { sceneReality: { preparedBoundaries: [{ ...boundary, boundaryId: null }] } } }, state)).toThrow();
    expect(() => temporalGmOwnerFromRecords(scene, { ...reality, bundle: { preparedBoundaries: [boundary] } }, state)).toThrow();
  });
  it('pages all 43 complete namespaced records; visiting a page grants no consent or write', async () => {
    const f = await fixture(), refs: string[] = []; let offset: number | null = 0;
    while (offset !== null) {
      const page = await f.service.choices({ ...f.scope, offset, catalogFingerprint: f.input.catalogFingerprint });
      expect(page.sources.length).toBeLessThanOrEqual(8); expect(page.total).toBe(43);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(32768);
      refs.push(...page.sources.map((r: any) => r.sourceRef)); offset = page.nextOffset;
    }
    expect(new Set(refs).size).toBe(43); expect(f.records.rows).toEqual([]); expect(f.preparations.rows).toEqual([]);
    expect(f.seen.every((s) => JSON.stringify(s) === JSON.stringify(f.scope))).toBe(true);
  });
  it('prepares without committing, then confirms once without changing the clock, source, Scene or event', async () => {
    const f = await fixture(), before = structuredClone({ owner: f.owner, sources: f.sources });
    const prepared = await f.service.prepare(f.input);
    expect(await f.service.prepare(f.input)).toEqual(prepared); expect(f.records.rows).toEqual([]);
    const confirm = { ...f.scope, decisionRef: prepared.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true };
    const receipt = await f.service.confirm(confirm);
    expect(receipt).toMatchObject({ schemaVersion: 'gmc.scene-temporal-decision-receipt/1', revision: 1, duplicate: false });
    expect(await f.service.confirm(confirm)).toMatchObject({ ...receipt, duplicate: true });
    expect(f.records.rows).toHaveLength(1); expect(await f.service.read(f.scope)).toMatchObject({ decision: { revision: 1 } });
    expect({ owner: f.owner, sources: f.sources }).toEqual(before);
    expect(JSON.stringify(f.records.rows)).not.toContain('Complete evidence');
  });
  it('reconciles lost prepare/confirm with writes paused and after unused preparation expires or is deleted', async () => {
    const f = await fixture(), prepared = await f.service.prepare(f.input);
    const confirm = { ...f.scope, decisionRef: prepared.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true };
    await f.service.confirm(confirm);
    const paused = sceneTemporalGmDecisionService({ ...f.deps, writeCampaignAllowlist: [] });
    expect(await paused.preparationOperation(f.input)).toMatchObject({ _id: prepared.decisionRef });
    f.expire(); f.preparations.rows.length = 0;
    expect(await paused.operation(f.input)).toMatchObject({ revision: 1 });
    expect(await paused.confirm(confirm)).toMatchObject({ duplicate: true });
    expect(f.records.rows).toHaveLength(1);
  });
  it('rejects omitted, duplicate, implicit, rationale-free and invented scope choices', async () => {
    for (const mutate of [
      (c: any) => c.excluded.pop(), (c: any) => c.included.push(c.excluded[0].sourceRef),
      (c: any) => c.excluded[0].rationale = '', (c: any) => c.excluded[0].sourceRef = 'gmc:event:event:invented',
      (c: any) => c.rulings[0].constraintRef = 'boundary:guessed',
      (c: any) => c.rulings[0].deadline.calendar = 'guessed',
      (c: any) => c.rulings[0].deadline.hour = 24,
    ]) {
      const f = await fixture(), input = structuredClone(f.input); mutate(input.choice);
      await expect(f.service.prepare(input)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_CHOICE_INVALID' });
      expect(f.records.rows).toEqual([]);
    }
  });
  it.each(['included', 'excluded', 'added', 'constraint', 'head'])('rejects changed %s after prepare and invalidates saved decisions', async (kind) => {
    const f = await fixture();
    if (kind === 'included') { f.input.choice.included = [f.input.choice.excluded.shift()!.sourceRef] as never[]; }
    const prepared = await f.service.prepare(f.input);
    if (kind === 'constraint') f.owner.constraints[0].bodyFingerprint = 'b'.repeat(64);
    else if (kind === 'head') f.owner.sourceHead.sceneRevision++;
    else if (kind === 'added') f.sources.push({ ...f.sources[0], _id: 'event:new' });
    else f.sources[0].revision++;
    await expect(f.service.confirm({ ...f.scope, decisionRef: prepared.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true }))
      .rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_SOURCE_CHANGED' });
    expect(f.records.rows).toEqual([]);
  });
  it('requires the exact human confirmation, owner scope and unused preparation lifetime', async () => {
    const f = await fixture(), prepared = await f.service.prepare(f.input);
    const confirm = { ...f.scope, decisionRef: prepared.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true };
    await expect(f.service.confirm({ ...confirm, humanConfirmed: false })).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_HUMAN_REQUIRED' });
    await expect(f.service.confirm({ ...confirm, confirmationToken: 'forged' })).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_CONFIRMATION_INVALID' });
    await expect(f.service.confirm({ ...confirm, userId: 'owner:foreign' })).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_CONFIRMATION_INVALID' });
    expect(await f.service.operation({ ...f.input, campaignId: 'campaign:foreign' })).toBeNull();
    f.expire(); await expect(f.service.confirm(confirm)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_PREPARATION_EXPIRED' });
    expect(f.records.rows).toEqual([]);
  });
  it('defaults writes off and rejects conflicting operation reuse', async () => {
    const f = await fixture(), paused = sceneTemporalGmDecisionService({ ...f.deps, writeCampaignAllowlist: [] });
    await expect(paused.prepare(f.input)).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_WRITES_PAUSED' });
    await f.service.prepare(f.input);
    await expect(f.service.prepare({ ...f.input, choice: { ...f.input.choice, rulings: [] } })).rejects.toMatchObject({ code: 'SCENE_TEMPORAL_GM_IDEMPOTENCY_CONFLICT' });
  });
  it('supersedes explicitly while preserving old receipts; time/ordinary Scene revision alone does not change applicability', async () => {
    const f = await fixture(), p = await f.service.prepare(f.input);
    await f.service.confirm({ ...f.scope, decisionRef: p.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true });
    const old = structuredClone(f.records.rows[0]);
    f.owner.currentClock.minute++; f.owner.sourceHead.sceneRevision++;
    expect((await f.service.read(f.scope)).decision?.revision).toBe(1);
    const { catalog } = await f.service.readCatalog(f.scope);
    const p2 = await f.service.prepare({ ...f.input, operationId: 'timing:two', expectedRevision: 1,
      expectedSourceHead: catalog.sourceHead, catalogFingerprint: catalog.fingerprint, choice: { ...f.input.choice, rulings: [] } });
    await f.service.confirm({ ...f.scope, decisionRef: p2.decisionRef, confirmationToken: f.input.confirmationToken, humanConfirmed: true });
    expect(f.records.rows[1].scopeDecision.supersedes).toBe(old.scopeDecision.decisionRef);
    expect(f.records.rows[0]).toEqual(old);
    f.sources[42].summary += ' changed'; expect((await f.service.read(f.scope)).decision).toBeNull();
  });
});
