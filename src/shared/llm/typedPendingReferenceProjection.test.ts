import { describe, expect, it } from 'vitest';
import { typedReferenceFixture } from './fixtures/typedReferences.js';
import { derivePendingReferenceQualification } from './pendingReferenceQualification.js';
import { qualifiedPendingReferenceSlots, historicalTypedPendingBinding } from './typedPendingReferenceProjection.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';
import { SCENE_OWNER_PREMISES, ownerPremisesEvidenceRef } from './sceneIndependentOwnerPremises.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { createProgramReferenceLedger } from './typedReferenceBindings.js';
import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';
import { scenePendingIntentBindingIssues, scenePendingIntentExaminationIdentity, scenePendingIntentExaminationIssues } from './sceneReadEffectBindings.js';
import { createPendingBindingRecord, createIntentBindingReceipt, projectAppliedIntentBindings, acceptedPendingNodeCoverage, pendingScenePolicyFingerprint } from './scenePendingIntentApplication.js';
import { PREPARED_BINDING_COMPILATION as COMPILED, compilePreparedBindings, restorePreparedBindingSource, assertPreparedBindingCompilation } from './scenePreparedBindingCompilation.js';
import { preparedBindingEvidenceRef, createPreparedBindingReview, assertPreparedBindingReview, createPreparedOwnerReviewBinding,
  SCENE_PREPARED_SELECTION_POLICY, SCENE_PREPARED_REVIEW_POLICY } from './scenePreparedBindingReview.js';
import { SCENE_TEMPORAL_VALIDITY as TEMPORAL, createTemporalAuthorityContext, temporalRecordRefs } from './sceneTemporalValidity.js';

function movementFixture(fresh = false) {
  const f = typedReferenceFixture();
  f.proposal.steps = f.proposal.steps.slice(0, 1); f.proposal.observations = [];
  f.artifact.program.nodes = f.artifact.program.nodes.slice(0, 1); f.artifact.cursor.remainingNodeRefs = [];
  f.artifact.freeformBinding.compiledStepIds = f.artifact.program.nodes.map((node: any) => node.nodeId);
  if (fresh) {
    f.proposal.schemaVersion = 'gma.freeform-intent-proposal/3';
    f.proposal.steps[0].effects[0].targets = structuredClone(f.proposal.steps[0].targets);
    f.artifact.program.schemaVersion = 'gma.semantic-action-program/7';
    f.artifact.program.planner.policyVersion = 'gma.semantic-action-compiler-policy/14';
    f.artifact.program.referenceLedger = createProgramReferenceLedger(f.proposal, f.catalog, 1);
    f.artifact.program.nodes[0].dataRequirements.forEach((row: any, index: number) => row.symbolRef = `freeform:referent:${index === 0 ? 4 : 2}`);
    f.artifact.program.nodes[0].semanticLocationBindings.bindings.forEach((row: any, index: number) => row.symbolRef = `freeform:referent:${index === 0 ? 4 : 2}`);
    f.artifact.program.nodes[0].requestedEffects[0].targets = f.proposal.steps[0].targets.map((row: any) => ({ symbolRef: `freeform:referent:${row.ref}`, role: row.role }));
  }
  f.ticket.outputDigest = f.artifact.freeformBinding.proposalDigest = freeformJsonDigest(f.proposal);
  const q = derivePendingReferenceQualification(f.artifact, 1, f.ticket), window = createPendingIntentWindow(f.source);
  const slots = qualifiedPendingReferenceSlots(f.source, q), campaignId = f.scope.campaignId, bytes = Buffer.byteLength(f.source.instruction.exactText);
  const coverageBody = { schemaVersion: 'gmc.instruction-window-coverage/1', campaignId, programRef: f.scope.programId,
    rootInstructionFingerprint: f.source.instruction.instructionFingerprint, instructionFingerprint: f.source.instruction.instructionFingerprint,
    bindingFingerprint: 'a'.repeat(64), currentInstructionRange: { start: 0, end: bytes }, prefixRange: { start: 0, end: bytes },
    deferredTailRange: { start: bytes, end: bytes }, deferredTailBytes: 0, deferredTailFingerprint: freeformTextDigest(''), rootCompletionPermitted: true };
  const context: any = { source: f.source, operationId: 'prepare:typed', ownerReadSet: { ...f.artifact.program.authorityBase },
    observations: [], qualifiedObservers: [], confirmedRelocations: [], pendingReferenceQualification: q, qualifiedBindingSlots: slots,
    instructionCoverage: { ...coverageBody, coverageRef: `instruction-coverage:${freeformJsonDigest(coverageBody).slice(0, 40)}` },
    proposal: { operationId: 'prepare:typed', campaignId, requestedDepth: 'investigative', sceneKit: { sceneKitId: 'scene:typed', revision: 2 },
      zones: [{ zoneId: 'zone:lip', campaignId }, { zoneId: 'zone:drain', campaignId }], actorFrames: [], facts: [],
      elements: [{ elementId: 'element:lip', campaignId, zoneRef: 'zone:lip' }, { elementId: 'element:drain', campaignId, zoneRef: 'zone:drain' }],
      sceneStoryDesign: { schemaVersion: 'gmc.scene-story-design/4', affordances: ['lip', 'drain'].map((name) => ({
        coverageEntryId: `coverage:${name}`, targetRef: `element:${name}`, zoneRef: `zone:${name}`, actionFamily: 'move',
        surfaceKind: 'action_surface', interactionSurface: 'owner_action', factRefs: [], accessClass: null, capabilityClass: null, thresholdRef: null, condition: null })) } } };
  const binding: any = { schemaVersion: 'gma.scene-pending-intent-bindings/5', bindingId: 'binding:typed', operationId: context.operationId,
    campaignId, windowId: window.windowId, windowFingerprint: window.windowFingerprint, sceneKitRef: { sceneKitId: 'scene:typed', revision: 2 },
    referenceQualificationFingerprint: q.fingerprint,
    requirementRoles: { schemaVersion: 'gma.pending-requirement-role-classification/1', classificationId: 'roles:typed',
      windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint, nodes: window.nodes.map((node: any) => ({
        nodeRef: node.nodeRef, roles: node.requirements.map((row: any) => ({ requirementRef: row.requirementId, role: 'read', resolution: null, instructionEvidence: node.instructionEvidence[0] })) })) },
    nodes: slots.map((node: any) => ({ nodeRef: node.nodeRef, disposition: 'bound',
      references: node.references.map((slot: any) => ({ slotId: slot.slotId, selectedRef: slot.originalRef ?? 'element:drain' })),
      coverage: node.coverage.filter((slot: any) => !slot.targetSlotId).map((slot: any) => ({ slotId: slot.slotId,
        coverageEntryRef: window.nodes[0].requirements.find((row: any) => row.requirementId === slot.requirementId)?.value.targetRole === 'area' ? 'coverage:lip' : 'coverage:drain' })),
      effectCoverage: node.coverage.filter((slot: any) => slot.targetSlotId).map((slot: any) => ({ effectId: slot.effectId,
        targetSlotId: slot.targetSlotId, role: slot.role, coverageEntryRef: slot.role === 'area' ? 'coverage:lip' : 'coverage:drain' })),
      observations: [], instructionEvidence: node.instructionEvidence[0], rationale: 'Cross the separate lip to the drain without claiming arrival.', question: null })) };
  const policy = pendingScenePolicyFingerprint('investigative', 'read_effects', 13);
  const assessment = () => ({ schemaVersion: 'gma.scene-readiness-assessment/6', assessmentId: 'assessment:typed',
    ...scenePendingIntentExaminationIdentity(binding, context, policy), verdict: 'adequate', confidence: 'high', debt: [],
    counterfactualProbes: ['Where is the crossed lip?', 'Where is the endpoint?', 'Which action is unexecuted?'].map((probe) => ({ probe, status: 'supported', evidenceRefs: ['zone:lip', 'zone:drain'] })),
    rationale: 'The route and endpoint remain separate and unresolved.', evidenceRefs: ['zone:lip', 'zone:drain'],
    bindingReviews: binding.nodes.map((node: any) => ({ nodeRef: node.nodeRef, bindingRowFingerprint: freeformJsonDigest(node), verdict: 'supported',
      rationale: 'Exact area and destination have independent feasibility surfaces, not successful arrival.', evidenceRefs: [node.nodeRef], mechanicsState: 'not_resolved' })),
    requirementRoleReviews: binding.requirementRoles.nodes.flatMap((node: any) => node.roles.map((role: any) => ({ requirementRef: role.requirementRef,
      verdict: 'supported', rationale: 'This is a structural prerequisite, not completed movement.', evidenceRefs: [role.requirementRef] }))),
    qualificationReview: { verdict: 'supported', originState: 'preserved', viewpointState: 'pending_and_confirmed_lineage_preserved', rationale: 'No observer or arrival is activated.', evidenceRefs: ['zone:lip'] },
    referenceReview: { verdict: 'supported', rationale: 'The lip is the crossed area; the separate drain is the destination. The original ledger proves only which refs were unresolved.', evidenceRefs: [q.qualificationRef] } });
  return { f, q, context, binding, policy, assessment };
}

describe('exact prepared binding compilation, ADR 029', () => {
  function compilerFixture(fresh = false) {
    const f = movementFixture(true);
    for (const row of f.context.proposal.sceneStoryDesign.affordances) row.affordanceId = row.coverageEntryId.replace('coverage:', 'affordance:');
    const source = structuredClone(f.binding);
    for (const node of source.nodes) for (const collection of ['coverage', 'effectCoverage']) for (const row of node[collection]) {
      const literal = row.coverageEntryRef.replace('coverage:', 'affordance:');
      if (fresh) { row.affordanceRef = literal; delete row.coverageEntryRef; } else row.coverageEntryRef = literal;
    }
    if (fresh) source.schemaVersion = COMPILED.selections;
    return { ...f, source, sourcePolicy: `gma.scene-reality-builder-policy/${fresh ? 15 : 14}` };
  }
  it.each([false, true])('compiles the exact %s source without changing world or semantic choices', (fresh) => {
    const f = compilerFixture(fresh), original = structuredClone(f.source), world = structuredClone(f.context.proposal);
    const result = compilePreparedBindings(f.source, f.context, f.sourcePolicy);
    expect(result.bindings).toEqual(f.binding);
    expect(scenePendingIntentBindingIssues(result.bindings, f.context)).toEqual([]);
    expect(restorePreparedBindingSource(result.bindings, result.compilation)).toEqual(original);
    assertPreparedBindingCompilation(result.bindings, result.compilation, f.context);
    expect(f.source).toEqual(original); expect(f.context.proposal).toEqual(world);
    expect(result.compilation.derivations.every((row: any) => row.rule === 'affordance_to_coverage')).toBe(true);
  });
  it('retains an already canonical historical choice without a fake derivation', () => {
    const f = compilerFixture();
    const result = compilePreparedBindings(f.binding, f.context, f.sourcePolicy);
    expect(result.bindings).toEqual(f.binding); expect(result.compilation.derivations).toEqual([]);
  });
  it.each(['unknown', 'display_name', 'foreign', 'duplicate_id', 'namespace_collision', 'profile', 'field', 'window'])('rejects %s without searching for an alternative', (kind) => {
    const f = compilerFixture(), row = f.source.nodes[0].coverage[0];
    if (kind === 'unknown') row.coverageEntryRef = 'affordance:unknown';
    if (kind === 'display_name') row.coverageEntryRef = 'drain';
    if (kind === 'foreign') f.source.campaignId = 'campaign:other';
    if (kind === 'duplicate_id') f.context.proposal.sceneStoryDesign.affordances[1].affordanceId = f.context.proposal.sceneStoryDesign.affordances[0].affordanceId;
    if (kind === 'namespace_collision') f.context.proposal.sceneStoryDesign.affordances[1].affordanceId = f.context.proposal.sceneStoryDesign.affordances[0].coverageEntryId;
    if (kind === 'profile') f.sourcePolicy = 'gma.scene-reality-builder-policy/13';
    if (kind === 'field') row.extra = 'not accepted';
    if (kind === 'window') f.source.windowFingerprint = '0'.repeat(64);
    expect(() => compilePreparedBindings(f.source, f.context, f.sourcePolicy)).toThrow();
  });
  it.each(['proof', 'source', 'owner', 'dossier', 'qualification', 'link', 'result'])('independently rejects changed %s bodies even when a client rehashes metadata', (kind) => {
    const f = compilerFixture(), result = compilePreparedBindings(f.source, f.context, f.sourcePolicy);
    if (kind === 'proof') result.compilation.derivations[0].evidenceRefs = ['invented:source'];
    if (kind === 'source') result.compilation.derivations[0].originalValue = 'affordance:drain';
    if (kind === 'owner') f.context.ownerReadSet.storyWorkspaceRevision++;
    if (kind === 'dossier') f.context.proposal.elements[0].zoneRef = 'zone:drain';
    if (kind === 'qualification') f.context.pendingReferenceQualification.fingerprint = 'e'.repeat(64);
    if (kind === 'link') f.context.observerIdentityLinks = [{ linkRef: 'invented:link' }];
    if (kind === 'result') result.bindings.nodes[0].references[0].selectedRef = 'element:drain';
    const { fingerprint: _old, ...body } = result.compilation; result.compilation.fingerprint = freeformJsonDigest(body);
    expect(() => assertPreparedBindingCompilation(result.bindings, result.compilation, f.context)).toThrow();
  });
  it('does not repair a legal but semantically wrong target selection', () => {
    const f = compilerFixture(); f.source.nodes[0].effectCoverage[0].coverageEntryRef = 'affordance:drain';
    // Pick the opposite area/destination, without changing any original target.
    f.source.nodes[0].effectCoverage.find((row: any) => row.role === 'area').coverageEntryRef = 'affordance:drain';
    const result = compilePreparedBindings(f.source, f.context, f.sourcePolicy);
    expect(scenePendingIntentBindingIssues(result.bindings, f.context).length).toBeGreaterThan(0);
  });
  it.each([false, true])('binds the actual independent review and new record/receipt while preserving the original program (temporal %s)', (temporal) => {
    const f = compilerFixture(), original = structuredClone(f.context.source.program);
    if (temporal) {
      f.context.proposal.sceneReality = { realityId: 'reality:temporal' };
      f.context.proposal.sceneStoryDesign.designId = 'design:temporal';
      f.context.proposal.preparedBoundaries = [];
    }
    f.policy = pendingScenePolicyFingerprint('investigative', 'read_effects', 14);
    const compiled = compilePreparedBindings(f.source, f.context, f.sourcePolicy);
    const premises = { fingerprint: 'd'.repeat(64) };
    const authority = temporal ? createTemporalAuthorityContext({ campaignId: f.context.proposal.campaignId, sceneKitId: 'scene:typed' }, null, []) : null;
    const context = { ...f.context, independentOwnerPremises: premises, preparedBindingCompilation: compiled.compilation,
      ...(authority ? { temporalAuthority: authority } : {}) };
    const assessment: any = { ...f.assessment(), ...scenePendingIntentExaminationIdentity(compiled.bindings, context, f.policy), schemaVersion: temporal ? TEMPORAL.assessment : COMPILED.assessment,
      ...(authority ? { temporalCoverageReview: { schemaVersion: TEMPORAL.review, authorityFingerprint: authority.fingerprint,
        verdict: 'supported', rationale: 'Structural world records are independent of elapsed campaign time.',
        clockIndependentRecordRefs: temporalRecordRefs(f.context.proposal), conditions: [], unresolvedRecordRefs: [] } } : {}),
      ownerPremisesFingerprint: premises.fingerprint, ownerPremiseReview: { verdict: 'supported',
        rationale: 'The original current position is distinct from pending movement.', evidenceRefs: [ownerPremisesEvidenceRef(premises)] },
      preparedBindingCompilationFingerprint: compiled.compilation.fingerprint,
      preparedBindingReview: { verdict: 'supported', rationale: 'Each literal ID selects its own exact row; no target or world change occurs.',
        evidenceRefs: [preparedBindingEvidenceRef(compiled.compilation)] } };
    expect(scenePendingIntentExaminationIssues(assessment, compiled.bindings, context, f.policy)).toEqual([]);
    const review = createPreparedBindingReview(compiled.compilation, assessment);
    assertPreparedBindingReview(review, compiled.compilation, assessment);
    expect(createPreparedOwnerReviewBinding(premises, assessment).assessmentIdentity.fingerprint).toBe(freeformJsonDigest(assessment));
    expect(scenePendingIntentExaminationIssues(assessment, compiled.bindings, f.context, f.policy).length).toBeGreaterThan(0);
    const record = createPendingBindingRecord(context, compiled.bindings, assessment, f.policy);
    expect(record.schemaVersion).toBe(temporal ? TEMPORAL.record : COMPILED.record); expect(record.preparedBindingReview).toEqual(review);
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:compiled', revision: 2, sceneKitRef: compiled.bindings.sceneKitRef }, {
      schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: record.window.programId,
      priorCursorRevision: record.window.cursorRevision, resultingCursorRevision: record.window.cursorRevision + 1,
      authorityHead: record.ownerReadSet, receiptId: 'rebase:compiled' });
    expect(receipt.schemaVersion).toBe(temporal ? TEMPORAL.receipt : COMPILED.receipt);
    if (temporal) expect(receipt.temporalValidityApplication.fingerprint).toBe(record.temporalValidityFingerprint);
    const applied = projectAppliedIntentBindings(f.context.source.instruction, original, [{ record, receipt }]);
    expect(applied.nodes[0].semanticLocationBindings.bindings.map((row: any) => row.authorityRef)).toEqual(['element:lip', 'element:drain']);
    expect(f.context.source.program).toEqual(original);
    const tampered = structuredClone(assessment); tampered.preparedBindingReview.verdict = 'unsupported';
    expect(scenePendingIntentExaminationIssues(tampered, compiled.bindings, context, f.policy).length).toBeGreaterThan(0);
    tampered.verdict = 'repair_required'; tampered.debt = [{ debtId: 'debt:compiled', domain: 'pending_intent',
      description: 'The mechanical derivation changes the intended choice.', blocking: true, affectedRefs: [compiled.bindings.nodes[0].nodeRef] }];
    expect(scenePendingIntentExaminationIssues(tampered, compiled.bindings, context, f.policy)).toEqual([]);
  });
  it('teaches exact selectors and independent derivation review on the original first pass', () => {
    const builder = getOperationDefinition('story.scene-reality.build.read-effects.typed-references.working-set.information-projection.binding-compilation');
    const examiner = getOperationDefinition(COMPILED.operation);
    expect(builder.prompt.systemInstruction).toContain(SCENE_PREPARED_SELECTION_POLICY);
    expect(builder.prompt.systemInstruction).not.toContain("Reuse that group's original sensory affordance for its identity coverage");
    expect(builder.prompt.systemInstruction).toContain('affordanceId');
    expect(builder.prompt.version).toBe('gma.scene-reality-builder-policy/15');
    expect(examiner.prompt.systemInstruction).toContain(SCENE_PREPARED_REVIEW_POLICY);
    expect(examiner.prompt.version).toBe(COMPILED.examinerPolicy); expect(examiner.context.inputHardLimitBytes).toBe(131072);
    expect(getOperationDefinition('story.scene-reality.build.read-effects.typed-references.working-set.information-projection').prompt.version)
      .toBe('gma.scene-reality-builder-policy/14');
  });
});

describe('typed pending projection, without rewriting an accepted source', () => {
  it('retains every existing review for /7, requires the separate bound baseline, and saves the actual assessment fingerprint', () => {
    const { context, binding, policy, assessment } = movementFixture(true);
    const premises = { fingerprint: 'd'.repeat(64) }, scoped = { ...context, independentOwnerPremises: premises };
    const reviewed = { ...assessment(), schemaVersion: SCENE_OWNER_PREMISES.assessment, ownerPremisesFingerprint: premises.fingerprint,
      ownerPremiseReview: { verdict: 'supported', rationale: 'Current owner evidence is distinct from future requested movement.', evidenceRefs: [ownerPremisesEvidenceRef(premises)] } };
    expect(scenePendingIntentExaminationIssues(reviewed, binding, scoped, policy)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(reviewed, binding, context, policy).length).toBeGreaterThan(0);
    expect(scenePendingIntentExaminationIssues(assessment(), binding, scoped, policy).length).toBeGreaterThan(0);
    const record = createPendingBindingRecord(scoped, binding, reviewed, policy);
    expect(record.assessmentFingerprint).toBe(freeformJsonDigest(reviewed));
    for (const key of ['referenceReview', 'requirementRoleReviews', 'bindingReviews', 'qualificationReview']) {
      expect(scenePendingIntentExaminationIssues({ ...reviewed, [key]: null }, binding, scoped, policy).length).toBeGreaterThan(0);
    }
  });
  it('preserves the exact advertised typed review citation catalog without widening observer qualification evidence', () => {
    const { q, context, binding, policy, assessment } = movementFixture(true), reviewed = assessment();
    reviewed.evidenceRefs.push(q.qualificationRef);
    reviewed.bindingReviews[0].evidenceRefs.push(q.qualificationRef);
    reviewed.requirementRoleReviews[0].evidenceRefs.push(q.qualificationRef);
    expect(scenePendingIntentExaminationIssues(reviewed, binding, context, policy)).toEqual([]);
    const unknown = structuredClone(reviewed); unknown.bindingReviews[0].evidenceRefs.push('qualification:invented');
    expect(scenePendingIntentExaminationIssues(unknown, binding, context, policy).length).toBeGreaterThan(0);
    reviewed.qualificationReview.evidenceRefs.push(q.qualificationRef);
    expect(scenePendingIntentExaminationIssues(reviewed, binding, context, policy).length).toBeGreaterThan(0);
  });
  it.each([false, true])('independently examines, saves and reloads distinct route/endpoint surfaces without altering original program or receipts (fresh %s)', (fresh) => {
    const { f, context, binding, policy, assessment } = movementFixture(fresh), before = structuredClone(f.source);
    expect(scenePendingIntentBindingIssues(binding, context)).toEqual([]);
    const reviewed = assessment(); expect(scenePendingIntentExaminationIssues(reviewed, binding, context, policy)).toEqual([]);
    const record = createPendingBindingRecord(context, binding, reviewed, policy);
    expect(record.schemaVersion).toBe('gmc.scene-pending-intent-binding-record/5');
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:typed', revision: 1, sceneKitRef: binding.sceneKitRef }, {
      schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: f.scope.programId, priorCursorRevision: 1, resultingCursorRevision: 2,
      authorityHead: { storyWorkspaceRevision: 1, sceneRevision: 2, vcsCharacterRevision: 1 }, receiptId: 'rebase:typed' });
    const applications = [{ record, receipt }], effective = projectAppliedIntentBindings(f.source.instruction, f.source.program, applications);
    expect(effective.nodes[0].coverageEntryRef).toBe('coverage:drain');
    expect(effective.nodes[0].semanticLocationBindings.bindings.map((row: any) => row.authorityRef)).toEqual(['element:lip', 'element:drain']);
    expect(acceptedPendingNodeCoverage(record, effective.nodes[0], binding.sceneKitRef)).toEqual(['coverage:lip', 'coverage:drain']);
    expect(projectAppliedIntentBindings(f.source.instruction, f.source.program, structuredClone(applications))).toEqual(effective);
    expect(f.source).toEqual(before);
    const bad = structuredClone(binding); bad.nodes[0].effectCoverage[0].coverageEntryRef = 'coverage:drain';
    expect(scenePendingIntentBindingIssues(bad, context).length).toBeGreaterThan(0);
  });
  it('retains original identities, qualifies only proven fields, and exposes distinct exact area/destination slots', () => {
    const f = typedReferenceFixture(), before = structuredClone(f), q = derivePendingReferenceQualification(f.artifact, 1, f.ticket);
    const slots = qualifiedPendingReferenceSlots(f.source, q);
    const subject = slots[1].references.find((row: any) => row.outcomeId && row.role === 'subject');
    expect(subject.originalRef).toBe(null); expect(subject.sourceOriginalRef).toBe('freeform:referent:2');
    const effects = slots[0].coverage.filter((row: any) => row.effectId);
    expect(effects.map((row: any) => row.role)).toEqual(['area', 'destination']);
    expect(new Set(effects.map((row: any) => row.targetSlotId)).size).toBe(2);
    expect(f).toEqual(before);
    const binding: any = { schemaVersion: 'gma.scene-pending-intent-bindings/5', referenceQualificationFingerprint: q.fingerprint,
      nodes: slots.map((node: any) => ({ nodeRef: node.nodeRef, disposition: 'bound', coverage: [],
        effectCoverage: node.coverage.filter((row: any) => row.targetSlotId).map((row: any) => ({ effectId: row.effectId,
          targetSlotId: row.targetSlotId, role: row.role, coverageEntryRef: `coverage:${row.role}` })) })) };
    const normalized = historicalTypedPendingBinding(binding, slots);
    expect(normalized.nodes[0].coverage.map((row: any) => row.coverageEntryRef)).toEqual(['coverage:area', 'coverage:destination']);
    binding.nodes[0].effectCoverage[0].role = 'destination';
    expect(() => historicalTypedPendingBinding(binding, slots)).toThrow();
  });
  it('rejects omitted, duplicate, extra and foreign per-effect coverage rather than silently merging roles', () => {
    const f = typedReferenceFixture(), q = derivePendingReferenceQualification(f.artifact, 1, f.ticket), slots = qualifiedPendingReferenceSlots(f.source, q);
    const rows = slots[0].coverage.filter((row: any) => row.targetSlotId).map((row: any) => ({ effectId: row.effectId,
      targetSlotId: row.targetSlotId, role: row.role, coverageEntryRef: `coverage:${row.role}` }));
    for (const effectCoverage of [rows.slice(0, 1), [rows[0], rows[0]], [...rows, rows[0]], [{ ...rows[0], targetSlotId: 'slot:foreign' }, rows[1]]]) {
      expect(() => historicalTypedPendingBinding({ schemaVersion: 'gma.scene-pending-intent-bindings/5',
        nodes: [{ nodeRef: slots[0].nodeRef, disposition: 'bound', coverage: [], effectCoverage }] }, slots)).toThrow();
    }
  });
  it('puts positive typed reference, exact effect role and independent review rules in every original new operation', () => {
    for (const base of ['story.scene-reality.build', 'story.scene-reality.build.checkpoint', 'story.scene-readiness.examine', 'story.scene-reality.repair']) {
      const op = getOperationDefinition(`${base}.read-effects.typed-references.working-set`)!;
      expect(op.prompt.systemInstruction).toContain('Local semantic symbols and owner references are different types');
      expect(op.prompt.systemInstruction).toContain('A crossed area, origin and destination have distinct roles');
      expect(op.prompt.systemInstruction).not.toContain('effect surfaces still match all node-level location bindings');
      expect(op.prompt.systemInstruction).toContain(base.includes('examine') ? 'referenceReview' : 'effectCoverage');
      expect(op.context.inputHardLimitBytes).toBe(base.includes('repair') ? 96000 : 131072);
      expect(op.provider.maxAttempts).toBe(1);
    }
  });
});
