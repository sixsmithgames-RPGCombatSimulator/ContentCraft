import { describe, expect, it } from 'vitest';
import { compileScenePreparationWorkingSet, decodeScenePreparationWorkingSet, rehydrateScenePreparationProposal, SCENE_WORKING_SET_POLICY } from './scenePreparationWorkingSet.js';
import { getOperationDefinition, MANUAL_PENDING_SCENE_OPERATIONS, getSemanticValidator } from '../../server/llm-orchestrator/operationRegistry.js';
import '../../server/llm-orchestrator/semanticValidators.js';
const operation = 'story.scene-reality.build.read-effects.working-set';
const fixture = () => {
  const record = { schemaVersion: 'fictional.record/1', actorRef: 'actor:fictional-scout', revision: 4,
    detail: 'A fictional canal runs below an old warehouse. '.repeat(15), currentPosition: null };
  return { buildRequest: { operationId: 'build:fictional' }, pendingIntentContext: {
    window: { windowFingerprint: 'c'.repeat(64), nodes: [{ requestedEffects: ['move', 'remain hidden', 'observe'], destination: null }] },
    ownerReadSet: { sceneRevision: 2, storyWorkspaceRevision: 3 } },
    priorBundle: { zones: [record], actorFrames: [record], facts: [record], elements: [record],
      readinessCertificate: { dependencySet: ['exact:owner'], status: 'certified' },
      openingFrame: { prose: 'Old immutable presentation.' }, readinessAssessment: { verdict: 'adequate' } },
    ownerContext: { current: [record], differingView: { ...record, currentPosition: 'zone:actual' } } };
};
describe('accepted ADR 024 lossless preparation source compiler', () => {
  it('rehydrates all exact retained material before review, while a changed row replaces only its stable ID', () => {
    const prior = { zones: [{ zoneId: 'z1', revision: 1 }], actorFrames: [{ actorFrameId: 'a1', count: null }],
      elements: [{ elementId: 'e1' }], facts: [{ factId: 'f1', value: 'old' }, { factId: 'f2', value: 'unchanged' }],
      sceneKit: { information: [{ informationId: 'f2', factText: 'A different view of the unchanged fact.' }] },
      sceneStoryDesign: { affordances: [{ affordanceId: 'aff1' }], obligations: [{ obligationId: 'ob1' }] } };
    const patch = { zones: [], actorFrames: [], elements: [], facts: [{ factId: 'f1', value: 'new' }],
      sceneKit: { information: [] }, sceneStoryDesign: { affordances: [], obligations: [] } };
    const full = rehydrateScenePreparationProposal(patch, prior);
    expect(full.facts).toEqual([{ factId: 'f1', value: 'new' }, { factId: 'f2', value: 'unchanged' }]);
    expect(full.sceneKit).toEqual(prior.sceneKit); expect(full.sceneStoryDesign).toEqual(prior.sceneStoryDesign);
    expect(full.zones).toEqual(prior.zones); expect(full.actorFrames).toEqual(prior.actorFrames);
    expect(prior.facts[0].value).toBe('old'); expect(patch.facts).toHaveLength(1);
    expect(() => rehydrateScenePreparationProposal({ ...patch, facts: [patch.facts[0], patch.facts[0]] }, prior)).toThrow();
  });
  it('preserves every world value, distinguishing view, unresolved null and certificate without mutating originals', () => {
    const input = fixture(), original = structuredClone(input);
    const packed = compileScenePreparationWorkingSet(input, operation, 'build');
    const decoded = decodeScenePreparationWorkingSet(packed, operation);
    expect(input).toEqual(original);
    delete (original.priorBundle as any).openingFrame; delete (original.priorBundle as any).readinessAssessment;
    expect(decoded).toEqual(original);
    expect(packed.manifest.retained).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThan(Buffer.byteLength(JSON.stringify(input)));
    expect(decoded.ownerContext.differingView.currentPosition).toBe('zone:actual');
  });
  it('is deterministic across property ordering and exactly preserves UTF-8 and repeated instructions', () => {
    const input: any = fixture(); input.playerText = 'Éowyn: 隠れる → observe; observe.';
    const reversed = Object.fromEntries(Object.entries(input).reverse());
    expect(compileScenePreparationWorkingSet(input, operation, 'build')).toEqual(compileScenePreparationWorkingSet(reversed, operation, 'build'));
    expect(decodeScenePreparationWorkingSet(compileScenePreparationWorkingSet(input, operation, 'build'), operation).playerText).toBe(input.playerText);
  });
  it('optimizes only the typed layout, inlining single-edge graph entries and preserving every expanded byte', () => {
    const input: any = fixture();
    input.roleRows = Array.from({ length: 60 }, (_, n) => ({ label: 'exactly-shared-role-reference-12345', ordinal: n, originalRef: null }));
    const historical = compileScenePreparationWorkingSet(input, operation, 'build');
    const typedOperation = 'story.scene-reality.build.read-effects.typed-references.working-set';
    const typed = compileScenePreparationWorkingSet(input, typedOperation, 'build');
    expect(decodeScenePreparationWorkingSet(typed, typedOperation)).toEqual(decodeScenePreparationWorkingSet(historical, operation));
    expect(Buffer.byteLength(JSON.stringify(typed))).toBeLessThan(Buffer.byteLength(JSON.stringify(historical)));
    expect(compileScenePreparationWorkingSet(input, operation, 'build')).toEqual(historical);
    const uses = typed.sources.map(() => 0);
    const visit = (value: any) => { if (value && typeof value === 'object' && Object.keys(value).join() === '$s') uses[value.$s]++;
      else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
    visit(typed.input); typed.sources.forEach(visit);
    expect(uses.every((count: number) => count >= 2)).toBe(true);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(compileScenePreparationWorkingSet(reordered, typedOperation, 'build')).toEqual(typed);
  });
  it('shares short exact values only in the unissued profile-14 continuation, preserving historical and first-chunk identities', () => {
    const typed = 'story.scene-reality.build.read-effects.typed-references.working-set.information-projection';
    const input: any = { ...fixture(), preparationPolicyVersion: 14,
      shortRows: Array.from({ length: 100 }, (_, index) => ({ index, value: 'exact-short-shared-source' })) };
    const original = structuredClone(input);
    const first = compileScenePreparationWorkingSet(input, typed, 'build');
    const continuation = compileScenePreparationWorkingSet(input, typed, 'build_continuation');
    expect(decodeScenePreparationWorkingSet(first, typed)).toEqual(decodeScenePreparationWorkingSet(continuation, typed));
    expect(input).toEqual(original);
    expect(continuation.sources).toContain('exact-short-shared-source');
    expect(first.sources).not.toContain('exact-short-shared-source');
    expect(Buffer.byteLength(JSON.stringify(continuation))).toBeLessThan(Buffer.byteLength(JSON.stringify(first)) - 500);
    for (const version of [12, 13]) {
      const historical = compileScenePreparationWorkingSet({ ...input, preparationPolicyVersion: version }, typed, 'build_continuation');
      expect(historical.sources).toEqual(first.sources);
    }
    expect(compileScenePreparationWorkingSet(input, typed, 'build')).toEqual(first);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(compileScenePreparationWorkingSet(reordered, typed, 'build_continuation')).toEqual(continuation);
    expect(continuation.manifest.deferred).toEqual([]);
  });
  for (const kind of ['dangling', 'cycle', 'extra_ref_key', 'foreign_operation', 'stage', 'duplicate_retained', 'window', 'bytes', 'body', 'hash', 'unknown_key', 'unclassified_retained']) {
    it(`rejects ${kind} instead of guessing or dropping evidence`, () => {
      const packed = compileScenePreparationWorkingSet(fixture(), operation, 'build');
      if (kind === 'dangling') packed.input = { $s: 999999 };
      if (kind === 'cycle') packed.sources[0] = { $s: 0 };
      if (kind === 'extra_ref_key') packed.input = { $s: 0, other: 'not a literal' };
      if (kind === 'stage') packed.manifest.stage = 'examine';
      if (kind === 'duplicate_retained') packed.manifest.retained.push(packed.manifest.retained[0]);
      if (kind === 'window') packed.manifest.windowFingerprint = 'd'.repeat(64);
      if (kind === 'bytes') packed.manifest.expandedBytes++;
      if (kind === 'body') packed.sources[0] = 'An altered source.';
      if (kind === 'hash') packed.manifest.sourceFingerprint = 'a'.repeat(64);
      if (kind === 'unknown_key') packed.unknown = true;
      if (kind === 'unclassified_retained') packed.manifest.retained.push({ path: '/priorBundle/facts', disposition: 'historical_attestation', fingerprint: 'a'.repeat(64) });
      expect(() => decodeScenePreparationWorkingSet(packed, kind === 'foreign_operation' ? 'story.scene-readiness.examine.read-effects.working-set' : operation)).toThrow('SCENE_WORKING_SET_INVALID');
    });
  }
  it('rejects reserved input shapes, cycles and non-JSON values', () => {
    for (const bad of [{ $s: 0 }, { impossible: NaN }, { missing: undefined }]) expect(() => compileScenePreparationWorkingSet({ ...fixture(), bad }, operation, 'build')).toThrow();
    const cyclic: any = fixture(); cyclic.self = cyclic;
    expect(() => compileScenePreparationWorkingSet(cyclic, operation, 'build')).toThrow();
  });
  it('uses a new first-pass policy and keeps every new operation Manual-only with unchanged limits', async () => {
    for (const name of ['story.scene-reality.build', 'story.scene-reality.build.checkpoint', 'story.scene-readiness.examine', 'story.scene-reality.repair']) {
      const old = getOperationDefinition(`${name}.read-effects`), fresh = getOperationDefinition(`${name}.read-effects.working-set`);
      expect(fresh.prompt.version).not.toBe(old.prompt.version);
      expect(fresh.prompt.systemInstruction).toContain(SCENE_WORKING_SET_POLICY);
      expect(fresh.provider).toEqual(old.provider);
      expect(fresh.context).toEqual(old.context);
      expect({ ...fresh.outputSchema.schema, $id: 'compared-independent-of-operation-id' })
        .toEqual({ ...old.outputSchema.schema, $id: 'compared-independent-of-operation-id' });
      expect(MANUAL_PENDING_SCENE_OPERATIONS).toContain(fresh.id);
    }
    const validator = getSemanticValidator('authority-boundary')!;
    const result = await validator({ request: { operation, context: { input: { value: fixture() } } } as any, output: {} });
    expect(result.valid).toBe(false);
  });
  it('teaches the exact typed compiler provenance in every original preparation policy, without an inherited exclusion', () => {
    for (const name of ['story.scene-reality.build', 'story.scene-reality.build.checkpoint', 'story.scene-readiness.examine', 'story.scene-reality.repair']) {
      const policy = getOperationDefinition(`${name}.read-effects.typed-references.working-set`).prompt.systemInstruction;
      expect(policy).toContain('typed-reference program /7 with compiler policy /14');
      expect(policy).not.toContain('or an explicit program /6 with compiler policy /13.');
      expect(policy).toContain('original source program');
    }
  });
});
