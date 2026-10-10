import { describe, expect, it } from 'vitest';
import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow, pendingIntentWindowIssues, PENDING_INTENT_WINDOW_LIMITS,
  PendingIntentWindowError, type PendingIntentWindowSource } from './pendingIntentWindow.js';

function source(): PendingIntentWindowSource {
  const exactText = 'Send the familiar in; stay behind cover; watch through its eyes. 🐀';
  const instruction = { instructionRef: 'instruction:scout', exactText, instructionFingerprint: freeformTextDigest(exactText) };
  const common = { kind: 'other', condition: null, completionBoundary: 'immediate_result', parallelWith: [],
    evidenceSpans: [{ start: 0, end: 20 }], dataRequirements: [] };
  return {
    instruction, artifactRevision: 5,
    program: { schemaVersion: 'gma.semantic-action-program/4', programId: 'program:scout',
      instructionRef: instruction.instructionRef, instructionFingerprint: instruction.instructionFingerprint,
      authorityBase: { campaignId: 'campaign:fictional', storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 12 },
      nodes: [{ ...common, nodeId: 'enter', kind: 'move', dependsOn: [] },
        { ...common, nodeId: 'cover', dependsOn: [], evidenceSpans: [{ start: 22, end: 39 }],
          dataRequirements: [{ targetRole: 'area', targetRef: null, query: 'behind cover' }],
          semanticLocationBindings: { bindings: [{ role: 'area', authorityRef: null, description: 'behind cover' }] } },
        { ...common, nodeId: 'watch', kind: 'observe', dependsOn: ['enter', 'cover'], evidenceSpans: [{ start: 41, end: exactText.length }],
          dataRequirements: [{ kind: 'observation', observation: { targetRef: 'element:tunnel', relationOriginRef: 'element:tunnel' } }],
          observationGroups: [{ groupId: 'group:familiar', observerKind: 'familiar', observerRef: null,
            methodRef: null, methodDescription: 'watch through its eyes', viewpointBinding: 'after:enter' }] }],
    },
    cursor: { programId: 'program:scout', revision: 5, completedNodeRefs: ['enter'], skippedNodeRefs: [],
      readyNodeRefs: ['cover'], remainingNodeRefs: ['watch'], waiting: null,
      authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 12 } },
    receipts: [{ programId: 'program:scout', nodeId: 'enter', receiptId: 'receipt:entry', authorityReceipts: ['gmc:receipt:entry'], result: 'succeeded' }],
  };
}

describe('ADR 014 application-owned pending intent window foundation', () => {
  it('preserves unresolved cover, exact tunnel, remote method and completed entry without rewriting any source', () => {
    const input = source(), before = structuredClone(input);
    const window = createPendingIntentWindow(input);
    expect(window.schemaVersion).toBe('gma.pending-intent-window/1');
    expect(window.executionWindow).toEqual({ nodeRefs: ['cover', 'watch'], stopReason: 'program_end' });
    expect(window.completedNodeRefs).toEqual(['enter']);
    expect(window.nodes.map((row: any) => row.nodeRef)).toEqual(['cover', 'watch']);
    expect(window.nodes[0].requirements[0].value.targetRef).toBeNull();
    expect(window.nodes[0].node.semanticLocationBindings.bindings[0].authorityRef).toBeNull();
    expect(window.nodes[1].requirements[0].value.observation.targetRef).toBe('element:tunnel');
    expect(window.nodes[1].node.observationGroups[0].methodRef).toBeNull();
    expect(window.nodes[1].node.observationGroups[0].methodDescription).toBe('watch through its eyes');
    expect(window.nodes[1].instructionEvidence[0].quote).toBe(input.instruction.exactText.slice(41));
    expect(window.prerequisiteReceipts).toEqual([{ nodeRef: 'enter', receiptRef: 'receipt:entry',
      receiptFingerprint: freeformJsonDigest(input.receipts[0]), ownerReceiptRefs: ['gmc:receipt:entry'] }]);
    expect(input).toEqual(before);
    expect(pendingIntentWindowIssues(window, input)).toEqual([]);
    window.nodes[0].requirements[0].value.targetRef = 'element:pebbles';
    expect(input).toEqual(before);
    expect(pendingIntentWindowIssues(window, input)).toEqual(['/pendingIntentWindow']);
  });

  it('does not trust recalculated caller checksums, extra fields or omitted actions', () => {
    const input = source();
    for (const modify of [
      (value: any) => { value.nodes.pop(); },
      (value: any) => { value.nodes[0].requirements[0].value.targetRef = 'element:pebbles'; },
      (value: any) => { value.extra = 'not permitted'; },
      (value: any) => { value.prerequisiteReceipts[0].ownerReceiptRefs = ['gmc:foreign']; },
    ]) {
      const window = createPendingIntentWindow(input);
      modify(window);
      const { windowId: _id, windowFingerprint: _hash, ...body } = window;
      window.windowFingerprint = freeformJsonDigest(body);
      window.windowId = `pending-intent:${window.windowFingerprint}`;
      expect(pendingIntentWindowIssues(window, input)).toEqual(['/pendingIntentWindow']);
    }
  });

  it('qualifies duplicate identical requirements by stable identity, not their position alone', () => {
    const input = source();
    const row = input.program.nodes[1].dataRequirements[0];
    input.program.nodes[1].dataRequirements = [row, structuredClone(row)];
    const first = createPendingIntentWindow(input), second = createPendingIntentWindow(structuredClone(input));
    expect(first).toEqual(second);
    const [left, right] = first.nodes[0].requirements;
    expect(left.requirementFingerprint).toBe(right.requirementFingerprint);
    expect(left.requirementId).not.toBe(right.requirementId);
    expect(left.requirementId).toMatch(/^requirement:[a-f0-9]{32}$/);
  });

  it('binds changes in owner head, artifact revision, completed receipt and condition', () => {
    const original = source(), window = createPendingIntentWindow(original);
    for (const modify of [
      (value: PendingIntentWindowSource) => { value.cursor.authorityHead.sceneRevision += 1; },
      (value: PendingIntentWindowSource) => { value.artifactRevision += 1; value.cursor.revision += 1; },
      (value: PendingIntentWindowSource) => { value.receipts[0].authorityReceipts = ['gmc:new-receipt']; },
      (value: PendingIntentWindowSource) => { value.program.nodes[2].condition = { type: 'after_succeeded', actionRef: 'cover' }; },
    ]) {
      const current = structuredClone(original); modify(current);
      expect(createPendingIntentWindow(current).windowFingerprint).not.toBe(window.windowFingerprint);
      expect(pendingIntentWindowIssues(window, current)).toEqual(['/pendingIntentWindow']);
    }
  });

  for (const [boundary, expected] of [['player_choice', 'player_choice'], ['mechanic', 'unresolved_mechanic'], ['semantic_stop', 'semantic_stop']]) {
    it(`stops at the real ${boundary} boundary without including downstream nodes`, () => {
      const input = source(); input.program.nodes[1].completionBoundary = boundary;
      expect(createPendingIntentWindow(input).executionWindow).toEqual({ nodeRefs: ['cover'], stopReason: expected });
    });
  }

  for (const [name, modify] of [
    ['instruction bytes', (value: PendingIntentWindowSource) => { value.instruction.exactText += 'changed'; }],
    ['revision mismatch', (value: PendingIntentWindowSource) => { value.artifactRevision += 1; }],
    ['missing authority head', (value: PendingIntentWindowSource) => { value.cursor.authorityHead = null; }],
    ['foreign instruction', (value: PendingIntentWindowSource) => { value.program.instructionRef = 'foreign:instruction'; }],
    ['duplicate cursor node', (value: PendingIntentWindowSource) => { value.cursor.readyNodeRefs.push('enter'); }],
    ['omitted pending node', (value: PendingIntentWindowSource) => { value.cursor.remainingNodeRefs = []; }],
    ['cycle', (value: PendingIntentWindowSource) => { value.program.nodes[0].dependsOn = ['watch']; }],
    ['foreign dependency', (value: PendingIntentWindowSource) => { value.program.nodes[2].dependsOn.push('foreign'); }],
    ['evidence outside instruction', (value: PendingIntentWindowSource) => { value.program.nodes[1].evidenceSpans[0].end = 9999; }],
    ['foreign receipt', (value: PendingIntentWindowSource) => { value.receipts[0].programId = 'foreign'; }],
    ['missing prerequisite receipt', (value: PendingIntentWindowSource) => { value.receipts = []; }],
    ['receipt on unfinished node', (value: PendingIntentWindowSource) => { value.receipts[0].nodeId = 'cover'; }],
    ['duplicate receipt', (value: PendingIntentWindowSource) => { value.receipts.push(structuredClone(value.receipts[0])); }],
    ['empty pending window', (value: PendingIntentWindowSource) => { value.cursor.completedNodeRefs = ['enter', 'cover', 'watch']; value.cursor.readyNodeRefs = []; value.cursor.remainingNodeRefs = []; }],
    ['unknown program version', (value: PendingIntentWindowSource) => { value.program.schemaVersion = 'gma.semantic-action-program/99'; }],
    ['aggregate requirement bound', (value: PendingIntentWindowSource) => { value.program.nodes[1].dataRequirements = Array.from({ length: 33 }, () => ({ targetRef: null })); }],
    ['byte ceiling', (value: PendingIntentWindowSource) => { value.program.nodes[1].summary = '🐀'.repeat(PENDING_INTENT_WINDOW_LIMITS.bytes); }],
  ] as Array<[string, (value: PendingIntentWindowSource) => void]>) {
    it(`rejects ${name} without changing source or claiming an owner write`, () => {
      const input = source(); modify(input); const before = structuredClone(input);
      expect(() => createPendingIntentWindow(input)).toThrow(PendingIntentWindowError);
      expect(pendingIntentWindowIssues({}, input)[0]).toMatch(/^\/source\//);
      expect(input).toEqual(before);
    });
  }
});
