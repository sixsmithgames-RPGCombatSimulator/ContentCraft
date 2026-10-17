import { describe, expect, it } from 'vitest';
import { deriveInstructionWindowCoverage, instructionWindowCoverageIssues } from './instructionWindowCoverage.js';
import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';

function fixture(rootText = 'I nod. Then I smile.', text = rootText, suffixText = ' Then I smile.') {
  const instruction = { interactionId: 'turn:one', instructionRef: 'instruction:one', exactText: text, instructionFingerprint: freeformTextDigest(text) };
  const root = { exactText: rootText, instructionFingerprint: freeformTextDigest(rootText) };
  const authorityBase = { campaignId: 'campaign:one', storyWorkspaceRevision: 1, sceneRevision: 1, vcsCharacterRevision: 0 };
  const program = { programId: 'program:one', authorityBase, nodes: [{ nodeId: 'step:one', dataRequirements: [] }],
    planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/12' } };
  const prefix = text.slice(0, text.length - suffixText.length);
  const binding = { schemaVersion: 'gma.freeform-plan-binding/1', instructionRef: instruction.instructionRef,
    interactionId: instruction.interactionId, instructionFingerprint: instruction.instructionFingerprint,
    windowId: `window:${freeformTextDigest(prefix)}`, windowBytes: Buffer.byteLength(prefix), suffixText,
    continuationFingerprint: freeformTextDigest(suffixText), policyVersion: 'gma.freeform-intake-policy/3', registryVersion: '2026-10-15.1',
    proposalDigest: 'a'.repeat(64), requestDigest: 'b'.repeat(64), ticket: 'ticket:one', ticketDisposition: 'owner_accepted',
    authorityBase, sourceReferences: [], compiledStepIds: ['step:one'], operationRequirements: [{ nodeRef: 'step:one', requirements: [] }] };
  return { root, instruction, binding, program };
}

describe('owner instruction-window coverage', () => {
  it('distinguishes current program end from a retained exact deferred tail', () => {
    const f = fixture(), before = structuredClone(f);
    const row = deriveInstructionWindowCoverage(f.root, f.instruction, f.binding, f.program);
    expect(row).toMatchObject({ prefixRange: { start: 0, end: 6 }, deferredTailRange: { start: 6, end: 20 },
      deferredTailBytes: 14, rootCompletionPermitted: false });
    expect(row.bindingFingerprint).toBe(freeformJsonDigest(f.binding));
    expect(f).toEqual(before);
    expect(instructionWindowCoverageIssues(row, f.root, f.instruction, f.binding, f.program)).toEqual([]);
    expect(instructionWindowCoverageIssues({ ...row, rootCompletionPermitted: true }, f.root, f.instruction, f.binding, f.program)).not.toEqual([]);
    expect(instructionWindowCoverageIssues({ ...row, invented: true }, f.root, f.instruction, f.binding, f.program)).not.toEqual([]);
  });
  it('retains absolute UTF-8 ranges for repeated phrases and a multibyte successor', () => {
    const rootText = '🐀 I nod. Then I nod. Then I smile. 🐀';
    const text = ' Then I nod. Then I smile. 🐀', tail = ' Then I smile. 🐀';
    const f = fixture(rootText, text, tail);
    const row = deriveInstructionWindowCoverage(f.root, f.instruction, f.binding, f.program), bytes = Buffer.from(rootText);
    expect(bytes.subarray(row.currentInstructionRange.start, row.currentInstructionRange.end).toString('utf8')).toBe(text);
    expect(bytes.subarray(row.deferredTailRange.start, row.deferredTailRange.end).toString('utf8')).toBe(tail);
    expect(row.deferredTailBytes).toBe(Buffer.byteLength(tail));
    expect(JSON.stringify(row)).not.toContain(tail);
  });
  it('permits root completion only for an empty exact tail', () => {
    const f = fixture('I nod.', 'I nod.', '');
    expect(deriveInstructionWindowCoverage(f.root, f.instruction, f.binding, f.program).rootCompletionPermitted).toBe(true);
  });
  for (const key of ['suffixText', 'windowBytes', 'continuationFingerprint', 'instructionFingerprint'] as const) it(`rejects altered ${key}`, () => {
    const f = fixture(), changed: Record<string, unknown> = structuredClone(f.binding);
    changed[key] = key === 'windowBytes' ? 7 : 'changed';
    expect(() => deriveInstructionWindowCoverage(f.root, f.instruction, changed, f.program)).toThrow();
  });
  it('rejects a foreign root instead of matching a convenient repeated substring', () => {
    const f = fixture(); f.root.exactText = 'I nod. Then I smile. Foreign ending'; f.root.instructionFingerprint = freeformTextDigest(f.root.exactText);
    expect(() => deriveInstructionWindowCoverage(f.root, f.instruction, f.binding, f.program)).toThrow();
  });
});
