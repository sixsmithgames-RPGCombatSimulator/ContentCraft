import { describe, expect, it } from 'vitest';
import { assertRelocationPositionContinuity, type RelocationPositionReaders } from './relocationPositionContinuity.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';

function fixture() {
  const scope = { userId: 'owner:one', campaignId: 'campaign:one', programId: 'program:one' };
  const lineage = { sourceHead: { sceneKitId: 'scene:one', sceneRevision: 2, workspaceRevision: 3, payloadFingerprint: 'a'.repeat(64) },
    moveNodeRef: 'move:one', bindingRecordRef: 'binding:one', observerRef: 'actor:rat' };
  const artifact: JsonObject = { instruction: { interactionId: 'turn:one' }, intentBindingApplications: [
    { record: { recordId: lineage.bindingRecordRef, bindings: { sceneKitRef: { sceneKitId: 'scene:one', revision: 5 } } } }] };
  const receipts: JsonObject[] = [{ userId: scope.userId, campaignId: scope.campaignId, sceneKitId: 'scene:one',
    interactionId: 'turn:one:compound:move:one:2', receiptRef: 'turn:move', phase: 'completed',
    sceneKitRef: { sceneKitId: 'scene:one', revision: 5 }, stateRevisionBefore: 0, stateRevisionAfter: 1,
    timelineSequence: 2, readinessChangedDimensions: [] }];
  const state: JsonObject = { revision: 1, latestReceiptRef: 'turn:move', actorStates: [] };
  let stateReads = 0, race = false;
  const matches = (row: JsonObject, filter: Record<string, unknown>): boolean => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object') return Object.entries(value).every(([op, bound]) => op === '$regex'
      ? new RegExp(String(bound)).test(String(row[key])) : op === '$gt' ? Number(row[key]) > Number(bound) : Number(row[key]) <= Number(bound));
    return row[key] === value;
  });
  const readers = { states: { async findOne(filter: Record<string, unknown>) {
    expect(filter).toEqual({ userId: scope.userId, campaignId: scope.campaignId, sceneKitId: 'scene:one' });
    stateReads++; return structuredClone({ ...state, ...(race && stateReads > 1 ? { revision: 99 } : {}) });
  } }, receipts: { find(filter: Record<string, unknown>) {
    const selected = receipts.filter((row) => matches(row, filter)); let maximum = Infinity;
    const cursor = { limit(count: number) { maximum = count; return cursor; }, sort() {
      selected.sort((a, b) => Number(a.stateRevisionAfter) - Number(b.stateRevisionAfter)); return cursor;
    }, async toArray() { return structuredClone(selected.slice(0, maximum)); } }; return cursor;
  } } } as unknown as RelocationPositionReaders;
  const later = (dimensions: string[]) => {
    receipts.push({ ...structuredClone(receipts[0]), interactionId: 'turn:other', receiptRef: 'turn:later', stateRevisionBefore: 1,
      stateRevisionAfter: 2, timelineSequence: 3, readinessChangedDimensions: dimensions });
    state.revision = 2; state.latestReceiptRef = 'turn:later';
  };
  return { scope, lineage, artifact, receipts, state, readers, later, race: () => { race = true; },
    run: () => assertRelocationPositionContinuity(scope, artifact, lineage, readers) };
}
describe('current owner position after a confirmed relocation', () => {
  it('accepts one actual completed movement despite a later preparation revision', async () => { await expect(fixture().run()).resolves.toBeUndefined(); });
  it('accepts a complete later non-position history without replaying movement', async () => {
    const f = fixture(); f.later(['story_source']); await expect(f.run()).resolves.toBeUndefined(); expect(f.receipts).toHaveLength(2);
  });
  for (const dimension of ['zone', 'presence', 'access']) it(`rejects a later GM ${dimension} change`, async () => {
    const f = fixture(); f.later([dimension]); await expect(f.run()).rejects.toMatchObject({ code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
  });
  for (const [name, mutate] of [
    ['missing owner receipt', (f: ReturnType<typeof fixture>) => { f.receipts.length = 0; }],
    ['foreign owner', (f: ReturnType<typeof fixture>) => { f.receipts[0].userId = 'owner:foreign'; }],
    ['another instruction', (f: ReturnType<typeof fixture>) => { f.receipts[0].interactionId = 'turn:other:compound:move:one:2'; }],
    ['ambiguous repeated movement', (f: ReturnType<typeof fixture>) => { f.receipts.push(structuredClone(f.receipts[0])); }],
    ['pending movement', (f: ReturnType<typeof fixture>) => { f.receipts[0].phase = 'pending_mechanic'; }],
    ['different examined Scene', (f: ReturnType<typeof fixture>) => { (f.receipts[0].sceneKitRef as JsonObject).revision = 4; }],
    ['later unclassified change', (f: ReturnType<typeof fixture>) => { f.later([]); delete f.receipts[1].readinessChangedDimensions; }],
    ['missing intermediate receipt', (f: ReturnType<typeof fixture>) => { f.state.revision = 2; }],
    ['later observer activity', (f: ReturnType<typeof fixture>) => { f.later(['material_actor_objective']); f.state.actorStates = [{ actorRef: 'actor:rat', sourceSequence: 3, sourceTurnRef: 'turn:later' }]; }],
    ['concurrent owner change', (f: ReturnType<typeof fixture>) => { f.race(); }],
  ] as const) it(`rejects ${name}`, async () => {
    const f = fixture(); mutate(f); await expect(f.run()).rejects.toMatchObject({ code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
  });
});

function outcomeFixture() {
  const f = fixture();
  const lineage = { ...f.lineage, destinationRef: 'element:drain', destinationZoneRef: 'zone:inside',
    observationNodeRef: 'observe:one', groupId: 'group:one', requireMovementOutcome: true };
  const record = (f.artifact.intentBindingApplications as JsonObject[])[0].record as JsonObject;
  record.recordFingerprint = 'b'.repeat(64);
  record.qualifiedObservers = [{ observerRef: lineage.observerRef, nodeRef: lineage.observationNodeRef, groupId: lineage.groupId,
    evidenceRef: 'evidence:one', viewpointCondition: { kind: 'after_relocation', nodeRef: lineage.moveNodeRef } }];
  (record.bindings as JsonObject).nodes = [{ nodeRef: lineage.observationNodeRef,
    observations: [{ ownerEvidenceRef: 'evidence:one', viewpointZoneRef: lineage.destinationZoneRef }] }];
  f.artifact.program = { programId: f.scope.programId };
  f.artifact.receipts = [{ schemaVersion: 'gma.action-execution-receipt/2', programId: f.scope.programId,
    nodeId: lineage.moveNodeRef, lifecycle: 'settled', result: 'succeeded', authorityReceipts: [
      { authority: 'gmc', operation: 'scene-movement-outcome', receiptRef: 'outcome:one' }] }];
  const outcome: JsonObject = { schemaVersion: 'gmc.scene-movement-outcome-receipt/1', receiptRef: 'outcome:one', disposition: 'committed',
    campaignId: f.scope.campaignId, programRef: f.scope.programId, nodeRef: lineage.moveNodeRef, result: 'reached', executionResult: 'succeeded',
    sourceSceneTurnReceiptRef: f.receipts[0].receiptRef, sourceSceneTurnFingerprint: freeformJsonDigest(f.receipts[0]),
    expectation: { bindingRecordRef: lineage.bindingRecordRef, bindingRecordFingerprint: record.recordFingerprint,
      moverRef: lineage.observerRef, destinationRef: lineage.destinationRef, destinationZoneRef: lineage.destinationZoneRef } };
  let exists = true;
  const readers = { ...f.readers, outcomes: { async findOne(filter: Record<string, unknown>) {
    expect(filter).toEqual({ userId: f.scope.userId, campaignId: f.scope.campaignId, programId: f.scope.programId, _id: 'outcome:one' });
    return exists ? { receipt: structuredClone(outcome) } : null;
  } } } as unknown as RelocationPositionReaders;
  return { ...f, lineage, outcome, missing: () => { exists = false; },
    run: () => assertRelocationPositionContinuity(f.scope, f.artifact, lineage, readers) };
}
describe('protected outcome association before observer activation', () => {
  it('accepts only the exact owner-confirmed successful move and original Scene turn', async () => {
    await expect(outcomeFixture().run()).resolves.toBeUndefined();
  });
  it('follows the exact protected source receipt for a shared presentation, without matching an ID pattern', async () => {
    const f = outcomeFixture();
    f.receipts[0].interactionId = 'turn:one:compound:cohort:owner-verified:2';
    f.outcome.sourceSceneTurnFingerprint = freeformJsonDigest(f.receipts[0]);
    await expect(f.run()).resolves.toBeUndefined();
    f.outcome.sourceSceneTurnReceiptRef = 'turn:foreign';
    await expect(f.run()).rejects.toMatchObject({ code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
  });
  for (const [name, mutate] of [
    ['missing outcome', (f: ReturnType<typeof outcomeFixture>) => f.missing()],
    ['foreign campaign', (f: ReturnType<typeof outcomeFixture>) => { f.outcome.campaignId = 'campaign:other'; }],
    ['different destination threshold', (f: ReturnType<typeof outcomeFixture>) => { (f.outcome.expectation as JsonObject).destinationRef = 'element:lip'; }],
    ['wrong destination zone', (f: ReturnType<typeof outcomeFixture>) => { (f.outcome.expectation as JsonObject).destinationZoneRef = 'zone:outside'; }],
    ['another mover', (f: ReturnType<typeof outcomeFixture>) => { (f.outcome.expectation as JsonObject).moverRef = 'actor:pc'; }],
    ['old binding hash', (f: ReturnType<typeof outcomeFixture>) => { (f.outcome.expectation as JsonObject).bindingRecordFingerprint = 'c'.repeat(64); }],
    ['different actual source turn', (f: ReturnType<typeof outcomeFixture>) => { f.outcome.sourceSceneTurnFingerprint = 'd'.repeat(64); }],
    ['failed arrival', (f: ReturnType<typeof outcomeFixture>) => { f.outcome.result = 'not_reached'; f.outcome.executionResult = 'failed'; }],
    ['ungraded completed receipt', (f: ReturnType<typeof outcomeFixture>) => { (f.artifact.receipts as JsonObject[])[0].result = 'completed'; }],
    ['unrelated observation selection', (f: ReturnType<typeof outcomeFixture>) => {
      const record = (f.artifact.intentBindingApplications as JsonObject[])[0].record as JsonObject;
      (record.qualifiedObservers as JsonObject[])[0].groupId = 'group:other';
    }],
  ] as const) it(`rejects ${name} without revealing sensory facts`, async () => {
    const f = outcomeFixture(); mutate(f); await expect(f.run()).rejects.toMatchObject({ code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
  });
});
