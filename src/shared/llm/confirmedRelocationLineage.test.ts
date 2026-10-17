import { describe, expect, it } from 'vitest';
import { qualifiedPendingFixture } from './fixtures/qualifiedPending.js';
import { createPendingBindingRecord, createIntentBindingReceipt } from './scenePendingIntentApplication.js';
import { deriveConfirmedRelocationLineage, confirmedRelocationLineageIssues } from './confirmedRelocationLineage.js';

function fixture() {
  const f = qualifiedPendingFixture(), record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
  const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: 'program:one', priorCursorRevision: 1,
    resultingCursorRevision: 2, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 3, vcsCharacterRevision: 0 }, receiptId: 'rebase:one' };
  const artifact = { instruction: f.context.source.instruction, program: f.context.source.program,
    cursor: { ...f.context.source.cursor, revision: 3, completedNodeRefs: ['enter'], readyNodeRefs: ['cover', 'watch'], remainingNodeRefs: [] },
    receipts: [{ schemaVersion: 'gma.action-execution-receipt/2', receiptId: 'receipt:move', programId: 'program:one',
      nodeId: 'enter', lifecycle: 'settled', result: 'succeeded' }],
    intentBindingApplications: [{ record, receipt: createIntentBindingReceipt(record,
      { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef }, rebase) }] };
  const scope = { campaignId: 'campaign:fictional', programId: 'program:one', moveNodeRef: 'enter', observationNodeRef: 'watch',
    groupId: 'group:familiar', observerRef: 'actor:familiar', actorLinkRef: 'link:familiar' };
  return { artifact, scope, sourceHead: f.evidence.sourceHead };
}

describe('confirmed relocation lineage', () => {
  it('references a genuine receipt and examined binding without mutating either or resolving observation', () => {
    const f = fixture(), before = structuredClone(f), row = deriveConfirmedRelocationLineage(f.scope, f.artifact, f.sourceHead);
    expect(row).toMatchObject({ movementReceiptRef: 'receipt:move', destinationRef: 'element:tunnel', destinationZoneRef: 'zone:interior', observerRef: 'actor:familiar' });
    expect(confirmedRelocationLineageIssues(row, f.artifact)).toEqual([]);
    expect(f).toEqual(before); expect(row).not.toHaveProperty('observationSucceeded');
    expect(row).not.toHaveProperty('facts'); expect(row).not.toHaveProperty('character');
    expect(confirmedRelocationLineageIssues({ ...row, destinationRef: 'element:foreign' }, f.artifact)).not.toEqual([]);
  });
  for (const [name, mutate] of [
    ['failed move', (f: ReturnType<typeof fixture>) => { f.artifact.receipts[0].result = 'failed'; }],
    ['unknown receipt version', (f: ReturnType<typeof fixture>) => { f.artifact.receipts[0].schemaVersion = 'gma.action-execution-receipt/3'; }],
    ['ungraded completed movement', (f: ReturnType<typeof fixture>) => { f.artifact.receipts[0].result = 'completed'; }],
    ['historical /1 receipt without this qualified contract', (f: ReturnType<typeof fixture>) => { f.artifact.receipts[0].schemaVersion = 'gma.action-execution-receipt/1'; }],
    ['unsettled move', (f: ReturnType<typeof fixture>) => { f.artifact.receipts[0].lifecycle = 'pending'; }],
    ['missing receipt', (f: ReturnType<typeof fixture>) => { f.artifact.receipts.length = 0; }],
    ['duplicate receipt', (f: ReturnType<typeof fixture>) => { f.artifact.receipts.push({ ...f.artifact.receipts[0] }); }],
    ['unfinished cursor', (f: ReturnType<typeof fixture>) => { f.artifact.cursor.completedNodeRefs = []; }],
    ['foreign actor', (f: ReturnType<typeof fixture>) => { f.scope.observerRef = 'actor:other'; }],
    ['foreign campaign', (f: ReturnType<typeof fixture>) => { f.scope.campaignId = 'campaign:other'; }],
    ['altered binding', (f: ReturnType<typeof fixture>) => { f.artifact.intentBindingApplications[0].record.bindings.nodes[0].references[0].selectedRef = 'actor:other'; }],
    ['absent examined binding', (f: ReturnType<typeof fixture>) => { f.artifact.intentBindingApplications.length = 0; }],
  ] as const) it(`rejects ${name} without creating owner state`, () => {
    const f = fixture(); mutate(f); const before = structuredClone(f);
    expect(() => deriveConfirmedRelocationLineage(f.scope, f.artifact, f.sourceHead)).toThrow(); expect(f).toEqual(before);
  });
});
