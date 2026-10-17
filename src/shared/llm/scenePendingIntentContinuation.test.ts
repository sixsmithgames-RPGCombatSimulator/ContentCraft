import { describe, expect, it } from 'vitest';
import { continuationPendingFixture } from './fixtures/continuationPending.js';
import { createPendingBindingRecord, createIntentBindingReceipt, assertPendingBindingRecord, projectAppliedIntentBindings } from './scenePendingIntentApplication.js';
import { scenePendingIntentBindingIssues, scenePendingIntentExaminationIssues,
  mergeScenePendingIntentBindingRepair, CONTINUATION_BINDING_POLICY, CONTINUATION_EXAMINER_POLICY } from './scenePendingIntentQualified.js';
import { getOperationDefinition, validateOperationOutput } from '../../server/llm-orchestrator/operationRegistry.js';

const fixture = continuationPendingFixture;
describe('ADR 017 pending-only continuation', () => {
  it('binds the receipt-proven current destination without including or repeating the completed move', () => {
    const f = fixture(), before = structuredClone({ source: f.source, bindings: f.bindings, context: f.context });
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.f.policyFingerprint)).toEqual([]);
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.f.policyFingerprint);
    expect(record.schemaVersion).toBe('gmc.scene-pending-intent-binding-record/3');
    expect(() => assertPendingBindingRecord(record, f.source)).not.toThrow();
    expect(record.bindings.nodes.map((row: { nodeRef: string }) => row.nodeRef)).toEqual(['cover', 'watch']);
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:two', revision: 2, sceneKitRef: f.bindings.sceneKitRef }, {
      schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: 'program:one', priorCursorRevision: 3,
      resultingCursorRevision: 4, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 4, vcsCharacterRevision: 0 }, receiptId: 'rebase:two' });
    expect(receipt.schemaVersion).toBe('gma.action-intent-binding-receipt/3');
    const effective = projectAppliedIntentBindings(f.source.instruction, f.source.program, [f.application, { record, receipt }]);
    expect(effective.nodes[0]).toEqual(projectAppliedIntentBindings(f.source.instruction, f.source.program, [f.application]).nodes[0]);
    expect({ source: f.source, bindings: f.bindings, context: f.context }).toEqual(before);
  });
  for (const [name, mutate] of [
    ['old origin', (f: ReturnType<typeof fixture>) => { f.context.proposal.actorFrames[1].zoneRef = 'zone:entrance'; }],
    ['failed movement', (f: ReturnType<typeof fixture>) => { f.source.receipts[0].result = 'failed'; }],
    ['changed destination', (f: ReturnType<typeof fixture>) => { f.evidence.viewpointCondition.destinationRef = 'element:foreign'; }],
    ['missing lineage', (f: ReturnType<typeof fixture>) => { f.context.confirmedRelocations = []; }],
    ['completed node included', (f: ReturnType<typeof fixture>) => { f.bindings.nodes.push(f.f.bindings.nodes[0] as unknown as typeof f.bindings.nodes[number]); }],
    ['old schema substitution', (f: ReturnType<typeof fixture>) => { f.bindings.schemaVersion = 'gma.scene-pending-intent-bindings/2'; }],
  ] as const) it(`rejects ${name}`, () => {
    const f = fixture(); mutate(f); expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
  });
  it('has the complete hierarchy and no-replay rules in the actual registered first-pass policies', () => {
    const builder = getOperationDefinition('story.scene-reality.build.continuation');
    const examiner = getOperationDefinition('story.scene-readiness.examine.continuation');
    expect(builder.prompt.systemInstruction).toContain(CONTINUATION_BINDING_POLICY);
    expect(examiner.prompt.systemInstruction).toContain(CONTINUATION_EXAMINER_POLICY);
    for (const text of [builder.prompt.systemInstruction, examiner.prompt.systemInstruction]) {
      expect(text).toMatch(/deferred tail|deferredTail/); expect(text).toContain('program_end'); expect(text).toContain('confirmed_relocation');
    }
    const f = fixture();
    expect(validateOperationOutput(examiner.id, f.assessment()).valid).toBe(true);
    expect(validateOperationOutput('story.scene-readiness.examine.qualified', f.assessment()).valid).toBe(false);
  });
  it('compact repair changes only the failed binding row, leaving the completed receipt and other row exact', () => {
    const f = fixture(), bad = structuredClone(f.bindings);
    bad.nodes[1].references[0].selectedRef = 'element:foreign';
    const fixed = mergeScenePendingIntentBindingRepair(bad, [f.bindings.nodes[1]], ['watch'], f.context);
    expect(fixed).toEqual(f.bindings); expect(fixed.nodes[0]).toEqual(bad.nodes[0]);
    expect(f.source.receipts[0].receiptId).toBe('receipt:move');
    expect(() => mergeScenePendingIntentBindingRepair(bad, [f.bindings.nodes[0]], ['watch'], f.context)).toThrow();
  });
});
