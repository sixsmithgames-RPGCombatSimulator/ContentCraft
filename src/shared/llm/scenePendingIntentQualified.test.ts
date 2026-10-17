import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { scenePendingIntentBindingIssues,
  scenePendingIntentExaminationIssues, mergeScenePendingIntentBindingRepair,
  QUALIFIED_BINDINGS_SCHEMA, QUALIFIED_BINDING_POLICY, QUALIFIED_EXAMINER_POLICY, qualificationReviewEvidenceRefs } from './scenePendingIntentQualified.js';
import { qualifiedPendingFixture } from './fixtures/qualifiedPending.js';
import { getOperationDefinition, MANUAL_PENDING_SCENE_OPERATIONS } from '../../server/llm-orchestrator/operationRegistry.js';
import { createPendingBindingRecord, assertPendingBindingRecord, createIntentBindingReceipt,
  projectAppliedIntentBindings, pendingScenePolicyFingerprint } from './scenePendingIntentApplication.js';

const fixture = qualifiedPendingFixture;

describe('ADR 016 qualified pending Scene contracts', () => {
  it('negotiates separate first-pass prompts and closed outputs without changing historical packets', () => {
    for (const operation of ['story.scene-reality.build.qualified', 'story.scene-reality.build.checkpoint.qualified']) {
      const definition = getOperationDefinition(operation);
      expect(MANUAL_PENDING_SCENE_OPERATIONS).toContain(operation);
      expect(definition.prompt.version).toBe('gma.scene-reality-builder-policy/6');
      expect(definition.prompt.systemInstruction).toContain(QUALIFIED_BINDING_POLICY);
      expect(definition.prompt.systemInstruction).not.toMatch(/gma\.scene-reality-builder-result\/[12]\b/);
      expect(definition.outputSchema.schema.additionalProperties).toBe(false);
      expect((definition.outputSchema.schema.properties as Record<string, unknown>).schemaVersion).toEqual({ const: 'gma.scene-reality-builder-result/3' });
    }
    const examiner = getOperationDefinition('story.scene-readiness.examine.qualified');
    expect(examiner.prompt.systemInstruction).toContain(QUALIFIED_EXAMINER_POLICY);
    expect(examiner.prompt.version).toBe('gma.scene-readiness-examiner-policy/6');
    expect(examiner.prompt.systemInstruction).toContain('qualificationReviewEvidenceRefs');
    expect(examiner.prompt.systemInstruction).not.toContain('gma.scene-readiness-assessment/2');
    expect(examiner.outputSchema.schema.required).toContain('qualificationReview');
    expect(getOperationDefinition('story.scene-reality.build.pending').prompt.version).toBe('gma.scene-reality-builder-policy/4');
    expect(getOperationDefinition('story.scene-reality.build').prompt.version).toBe('gma.scene-reality-builder-policy/3');
    const repair = getOperationDefinition('story.scene-reality.repair.qualified');
    expect(repair.prompt.systemInstruction).toContain('complete merged successor');
    expect(repair.prompt.systemInstruction).toContain('only one replacement for each named');
    expect(repair.outputSchema.schema.additionalProperties).toBe(false);
    expect(MANUAL_PENDING_SCENE_OPERATIONS).toContain(repair.id);
  });
  it('accepts a pending future viewpoint while keeping the current familiar frame at its origin', () => {
    const f = fixture(), before = structuredClone(f.context);
    expect(new Ajv({ strict: false }).compile(QUALIFIED_BINDINGS_SCHEMA)(f.bindings)).toBe(true);
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(f.context).toEqual(before);
  });
  for (const [name, change] of [
    ['already-moved familiar', (f: ReturnType<typeof fixture>) => { f.context.proposal.actorFrames[1].zoneRef = 'zone:interior'; }],
    ['ordinary entrance substitution', (f: ReturnType<typeof fixture>) => { f.bindings.nodes[2].observations[0].viewpointZoneRef = 'zone:entrance'; }],
    ['altered prerequisite', (f: ReturnType<typeof fixture>) => { f.bindings.nodes[2].observations[0].viewpointCondition = { kind: 'current_access', accessRef: 'access:invented' }; }],
    ['stationary-controller relocation', (f: ReturnType<typeof fixture>) => { f.bindings.nodes[0].references[0].selectedRef = 'actor:player'; }],
    ['wrong owner form', (f: ReturnType<typeof fixture>) => { const row = f.bindings.nodes[2].references.find((r: { selectedRef: string }) => r.selectedRef === 'vcs:form:rat')!; row.selectedRef = 'vcs:form:owl'; }],
    ['foreign qualification', (f: ReturnType<typeof fixture>) => { f.evidence.programRef = 'program:other'; }],
    ['missing qualification', (f: ReturnType<typeof fixture>) => { f.context.qualifiedObservers.length = 0; }],
  ] as const) it(`rejects ${name} without relabeling it as current access`, () => {
    const f = fixture(); change(f); expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
  });
  it('requires the actual human GM origin source in the prepared actor frame', () => {
    const f = fixture(); f.evidence.origin = { kind: 'human_gm', zoneRef: null, description: 'At the worker, not beside the character.', sourceRefs: ['gm:origin'] };
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).not.toEqual([]);
    f.context.proposal.actorFrames[1].sourceRefs.push('gm:origin');
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
  });
  it('separates an unexecuted remote answer from movement and cover facts in first-pass policy and validation', () => {
    const f = fixture();
    expect(QUALIFIED_BINDING_POLICY).toContain('no non-observation affordance');
    expect(QUALIFIED_EXAMINER_POLICY).toContain('duplicate fact IDs');
    for (const index of [0, 1]) {
      const broken = structuredClone(f.context);
      broken.proposal.sceneStoryDesign.affordances[index].factRefs = ['fact:interior'];
      expect(scenePendingIntentBindingIssues(f.bindings, broken)).not.toEqual([]);
    }
    f.context.proposal.facts.push({ ...f.context.proposal.facts[0], factId: 'fact:route', targetRef: 'element:tunnel',
      value: 'An open entrance admits rat-sized passage.', visibility: 'public_surface' });
    f.context.proposal.sceneStoryDesign.affordances[0].factRefs = ['fact:route'];
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    const before = structuredClone(f.context);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(f.context).toEqual(before);
  });
  it('binds the independent assessment to the full qualification and unedited /2 rows', () => {
    const f = fixture(), accepted = f.assessment();
    f.evidence.vcsSubjectRevision = 'e'.repeat(64);
    expect(scenePendingIntentExaminationIssues(accepted, f.bindings, f.context, f.policyFingerprint)).toEqual(['/identity']);
    const refreshed = f.assessment(); refreshed.bindingReviews[0].bindingRowFingerprint = 'f'.repeat(64);
    expect(scenePendingIntentExaminationIssues(refreshed, f.bindings, f.context, f.policyFingerprint)).toEqual(['/bindingReviews']);
  });
  it('rejects a claim that movement was resolved and requires blocking debt for an unsupported qualification', () => {
    const f = fixture(), a = f.assessment(); a.bindingReviews[2].mechanicsState = 'resolved';
    expect(scenePendingIntentExaminationIssues(a, f.bindings, f.context, f.policyFingerprint)).not.toEqual([]);
    const b = f.assessment(); b.verdict = 'repair_required'; b.qualificationReview.originState = 'unsupported';
    expect(scenePendingIntentExaminationIssues(b, f.bindings, f.context, f.policyFingerprint)).toEqual(['/debt']);
  });
  it('shares one exact first-pass citation catalog with qualification validation, including dossier and capability refs', () => {
    const f = fixture(), before = structuredClone(f.context);
    const catalog = qualificationReviewEvidenceRefs(f.bindings, f.context);
    const citations = ['evidence:rat', 'link:familiar', 'frame:familiar', 'zone:interior', 'element:tunnel', 'fact:interior',
      'coverage:remote', 'vcs:form:rat', 'method:familiar-eyes', 'mobility:rat', 'vcs:receipt:rat'];
    expect(catalog).toEqual([...new Set(catalog)].sort());
    for (const ref of citations) expect(catalog).toContain(ref);
    const assessment = f.assessment(); assessment.qualificationReview.evidenceRefs = citations;
    assessment.bindingReviews[2].evidenceRefs = ['vcs:form:rat', 'mobility:rat'];
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(f.context).toEqual(before);
    for (const foreign of ['fact:another-campaign', 'mobility:invented', 'vcs:form:owl', 'receipt:invented']) {
      const rejected = structuredClone(assessment); rejected.qualificationReview.evidenceRefs.push(foreign);
      expect(catalog).not.toContain(foreign);
      expect(scenePendingIntentExaminationIssues(rejected, f.bindings, f.context, f.policyFingerprint)).toEqual(['/qualificationReview']);
    }
    const duplicate = structuredClone(assessment); duplicate.qualificationReview.evidenceRefs.push('evidence:rat');
    expect(scenePendingIntentExaminationIssues(duplicate, f.bindings, f.context, f.policyFingerprint)).toEqual(['/qualificationReview']);
  });
  it('repairs only the named failed binding row, preserving the complete rest exactly', () => {
    const f = fixture(), original = structuredClone(f.bindings), broken = structuredClone(f.bindings);
    broken.nodes[2].observations[0].viewpointZoneRef = 'zone:entrance';
    expect(mergeScenePendingIntentBindingRepair(broken, [original.nodes[2]], ['watch'], f.context)).toEqual(original);
    expect(() => mergeScenePendingIntentBindingRepair(broken, [original.nodes[0], original.nodes[2]], ['watch'], f.context)).toThrow();
  });
  it('states new origin, form, movement, scope and repair requirements in the original versioned policies', () => {
    for (const phrase of ['viewpointCondition', 'original owner-established', 'future destination', 'existing form', 'factRefs', 'failed binding rows']) expect(QUALIFIED_BINDING_POLICY).toContain(phrase);
    for (const phrase of ['qualificationReview', 'already-rat', 'unfinished relocation', 'unsupported private identity', 'do not repair']) expect(QUALIFIED_EXAMINER_POLICY).toContain(phrase);
  });
  it('persists qualified evidence separately and replays only exact pending overlays, not gameplay', () => {
    const f = fixture(), original = structuredClone(f.context.source);
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
    expect(record.schemaVersion).toBe('gmc.scene-pending-intent-binding-record/2');
    expect(record.qualifiedObservers).toEqual([f.evidence]);
    expect(record.observations).toEqual([]);
    expect(() => assertPendingBindingRecord(record, f.context.source)).not.toThrow();
    const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: 'program:one', priorCursorRevision: 1,
      resultingCursorRevision: 2, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 3, vcsCharacterRevision: 0 }, receiptId: 'rebase:one' };
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef }, rebase);
    expect(receipt.schemaVersion).toBe('gma.action-intent-binding-receipt/2');
    const projected = projectAppliedIntentBindings(f.context.source.instruction, f.context.source.program, [{ record, receipt }]);
    expect(projected.nodes[0].dataRequirements[0].targetRef).toBe('actor:familiar');
    expect(projected.nodes[1].dataRequirements[0].targetRef).toBe('actor:player');
    expect(projected.nodes[2].observationGroups[0].observerRef).toBe('actor:familiar');
    expect(projected.nodes[2].dependsOn).toEqual(['enter']);
    expect(f.context.source).toEqual(original);
    const forged = structuredClone(record);
    forged.qualifiedObservers[0].viewpointCondition = { kind: 'current_access', accessRef: 'access:invented' };
    const { recordId: _id, recordFingerprint: _hash, ...body } = forged;
    forged.recordFingerprint = freeformJsonDigest(body); forged.recordId = `pending-binding:${forged.recordFingerprint}`;
    expect(() => assertPendingBindingRecord(forged, f.context.source)).toThrow();
    const wrongVersion = { ...receipt, schemaVersion: 'gma.action-intent-binding-receipt/1' };
    expect(() => projectAppliedIntentBindings(f.context.source.instruction, f.context.source.program, [{ record, receipt: wrongVersion }])).toThrow();
  });
  it('keeps the historical policy identity stable and gives qualification its own identity', () => {
    expect(pendingScenePolicyFingerprint('investigative')).toBe(freeformJsonDigest({ builder: 'gma.scene-reality-builder-policy/4',
      examiner: 'gma.scene-readiness-examiner-policy/3', depth: 'investigative', binding: 'gma.scene-pending-intent-binding-policy/2' }));
    expect(pendingScenePolicyFingerprint('investigative', true)).not.toBe(pendingScenePolicyFingerprint('investigative'));
  });
});
