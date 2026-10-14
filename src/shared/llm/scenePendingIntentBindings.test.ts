import Ajv from 'ajv';
import { createPendingBindingRecord, assertPendingBindingRecord, createIntentBindingReceipt, projectAppliedIntentBindings,
  appliedObservationBinding, observationSettlementAuthorityHead } from './scenePendingIntentApplication.js';
import { describe, expect, it } from 'vitest';
import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';
import { preparedPendingRequirementProjection } from '../../server/services/scenePendingIntentService.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';
import { sceneReadinessPendingAssessmentOutput, sceneRealityPendingBuilderResultOutput } from '../../server/llm-orchestrator/sceneRealityOutputSchemas.js';
import { mergeScenePendingIntentBindingRepair, pendingIntentBindingSlots, scenePendingIntentBindingIssues,
  scenePendingIntentExaminationIdentity, scenePendingIntentExaminationIssues, SCENE_PENDING_INTENT_BINDINGS_SCHEMA,
  SCENE_PENDING_INTENT_BINDING_POLICY, SCENE_PENDING_INTENT_EXAMINER_POLICY,
  type ScenePendingBindingContext } from './scenePendingIntentBindings.js';

function fixture(modify?: (context: ScenePendingBindingContext) => void) {
  const campaignId = 'campaign:fictional', operationId = 'scene-reality:pending:test';
  const exactText = 'Send the familiar in; stay behind cover; watch through its eyes.';
  const instruction = { instructionRef: 'instruction:scout', exactText, instructionFingerprint: freeformTextDigest(exactText) };
  const context: ScenePendingBindingContext = {
    source: { instruction, artifactRevision: 5,
      program: { schemaVersion: 'gma.semantic-action-program/4', programId: 'program:scout', instructionRef: instruction.instructionRef,
        instructionFingerprint: instruction.instructionFingerprint, authorityBase: { campaignId }, nodes: [
          { nodeId: 'enter', kind: 'move', dependsOn: [], dataRequirements: [], evidenceSpans: [{ start: 0, end: 20 }] },
          { nodeId: 'cover', kind: 'other', dependsOn: [], evidenceSpans: [{ start: 22, end: 39 }],
            dataRequirements: [{ targetRole: 'actor', targetRef: 'actor:player' }, { targetRole: 'area', targetRef: null }],
            semanticLocationBindings: { bindings: [{ role: 'area', authorityRef: null, description: 'behind cover' }] } },
          { nodeId: 'watch', kind: 'observe', dependsOn: ['enter', 'cover'], evidenceSpans: [{ start: 41, end: exactText.length }],
            dataRequirements: [{ kind: 'observation', observation: { outcomeId: 'outcome:tunnel', groupId: 'group:familiar', targetRef: 'element:tunnel',
              relationOriginRef: null, facet: 'surface_description' } }],
            observationGroups: [{ groupId: 'group:familiar', observerKind: 'familiar', observerRef: null, methodRef: null, formRef: null,
              formTargetId: null, outcomeIds: ['outcome:tunnel'], viewpointBinding: 'after:enter' }] },
        ] },
      cursor: { programId: 'program:scout', revision: 5, completedNodeRefs: ['enter'], skippedNodeRefs: [], readyNodeRefs: ['cover'], remainingNodeRefs: ['watch'],
        waiting: null, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 12 } },
      receipts: [{ programId: 'program:scout', nodeId: 'enter', receiptId: 'receipt:entry', authorityReceipts: ['gmc:receipt:entry'], result: 'succeeded' }],
    }, operationId,
    proposal: { operationId, campaignId, requestedDepth: 'investigative', sceneKit: { sceneKitId: 'scene:scout', revision: 3 },
      zones: [{ zoneId: 'zone:approach', campaignId }, { zoneId: 'zone:passage', campaignId }],
      actorFrames: [{ actorFrameId: 'frame:player', actorRef: 'actor:player', campaignId }, { actorFrameId: 'frame:familiar', actorRef: 'actor:familiar', campaignId }],
      elements: [{ elementId: 'element:cover', campaignId }, { elementId: 'element:tunnel', campaignId }, { elementId: 'element:pebbles', campaignId }],
      facts: [{ factId: 'fact:cover' }, { factId: 'fact:tunnel' }], preparedBoundaries: [], sceneStoryDesign: { affordances: [
        { coverageEntryId: 'coverage:cover', zoneRef: 'zone:approach', targetRef: 'element:cover', actionFamily: 'interact', accessClass: null, thresholdRef: null, capabilityClass: null },
        { coverageEntryId: 'coverage:pebbles', zoneRef: 'zone:approach', targetRef: 'element:pebbles', actionFamily: 'interact', accessClass: null, thresholdRef: null, capabilityClass: null },
        { coverageEntryId: 'coverage:entrance', zoneRef: 'zone:approach', targetRef: 'element:tunnel', actionFamily: 'observe', accessClass: 'ordinary_view', thresholdRef: null, capabilityClass: null },
        { coverageEntryId: 'coverage:familiar', zoneRef: 'zone:passage', targetRef: 'element:tunnel', actionFamily: 'observe', accessClass: 'access:familiar', thresholdRef: null, capabilityClass: 'capability:link' },
      ] } }, ownerReadSet: { campaignId, storyWorkspaceRevision: 3, sceneRevision: 3, vcsCharacterRevision: 12 },
    observations: [{ evidenceRef: 'evidence:familiar', campaignId, groupId: 'group:familiar', observerKind: 'familiar', observerRef: 'actor:familiar',
      methodRef: 'method:link', formRef: null, zoneRef: 'zone:passage', accessRef: 'access:familiar', capabilityRef: 'capability:link', vcsCharacterRevision: 12,
      ownerReceiptRefs: ['gmc:receipt:entry', 'vcs:receipt:link'] }],
  };
  modify?.(context);
  const window = createPendingIntentWindow(context.source), slots = pendingIntentBindingSlots(context.source);
  const bindings = { schemaVersion: 'gma.scene-pending-intent-bindings/1', bindingId: 'binding:scout', operationId, campaignId,
    windowId: window.windowId, windowFingerprint: window.windowFingerprint, sceneKitRef: { sceneKitId: 'scene:scout', revision: 3 },
    nodes: slots.map((slot) => ({ nodeRef: slot.nodeRef, disposition: 'bound',
      references: slot.references.map((s: any) => ({ slotId: s.slotId, selectedRef: s.originalRef ?? (slot.nodeRef === 'cover'
        ? 'element:cover' : s.role === 'observer' ? 'actor:familiar' : 'method:link') })),
      coverage: slot.coverage.map((s: any) => ({ slotId: s.slotId, coverageEntryRef: slot.nodeRef === 'cover' ? 'coverage:cover'
        : s.groupId === 'group:player' ? 'coverage:entrance' : 'coverage:familiar' })),
      observations: slot.observationGroups.map((g: any) => ({ groupId: g.groupId, ownerEvidenceRef: g.groupId === 'group:player' ? 'evidence:player' : 'evidence:familiar' })),
      instructionEvidence: slot.instructionEvidence[0], rationale: slot.nodeRef === 'cover' ? 'The prepared ledge is the requested cover, without resolving concealment.' : 'The confirmed familiar link supplies this tunnel view.', question: null })),
  };
  const policyFingerprint = 'a'.repeat(64);
  const assessment = () => ({ schemaVersion: 'gma.scene-readiness-assessment/2', assessmentId: 'assessment:scout',
    ...scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint), verdict: 'adequate', confidence: 'high',
    counterfactualProbes: ['Where is cover?', 'What lies inside?', 'Who observes?'].map((probe) => ({ probe, status: 'supported', evidenceRefs: ['element:tunnel'] })),
    debt: [], rationale: 'Both pending actions match the prepared scene without resolving play.', evidenceRefs: ['element:tunnel'],
    bindingReviews: bindings.nodes.map((row) => ({ nodeRef: row.nodeRef, bindingRowFingerprint: freeformJsonDigest(row), verdict: 'supported',
      rationale: 'Meaning, position, observer and access match the original action; entry stays completed.', evidenceRefs: [row.nodeRef], mechanicsState: 'not_resolved' })),
  });
  return { context, bindings, policyFingerprint, assessment };
}
const shape = new Ajv({ strict: false, allErrors: true }).compile(SCENE_PENDING_INTENT_BINDINGS_SCHEMA);

describe('ADR 014 staged pending binding contracts (no runtime route or owner write)', () => {
  it('keeps ordered earlier bindings as audit history and uses only a fresh pending successor for a new Scene', () => {
    const f = fixture(), source = structuredClone(f.context.source);
    const make = (prior: number, revision: number) => {
      f.context.source.cursor.revision = prior; f.context.source.artifactRevision = prior;
      f.context.proposal.sceneKit.revision = revision; f.bindings.sceneKitRef.revision = revision;
      const window = createPendingIntentWindow(f.context.source); f.bindings.windowId = window.windowId; f.bindings.windowFingerprint = window.windowFingerprint;
      const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
      const head = { storyWorkspaceRevision: 3, sceneRevision: revision, vcsCharacterRevision: 12 };
      return { record, receipt: createIntentBindingReceipt(record, { bundleId: `bundle:${revision}`, revision, sceneKitRef: f.bindings.sceneKitRef },
        { schemaVersion: 'gma.action-program-rebase-receipt/2', receiptId: `rebase:${revision}`, programRef: 'program:scout', priorCursorRevision: prior, resultingCursorRevision: prior + 1, authorityHead: head }) };
    };
    const first = make(5, 3), savedFirst = structuredClone(first), second = make(6, 4);
    const projected = projectAppliedIntentBindings(source.instruction, source.program, [first, second]);
    expect(projected.nodes[0]).toEqual(source.program.nodes[0]); expect(first).toEqual(savedFirst);
    expect(projected.nodes[1].semanticLocationBindings.bindings[0].authorityRef).toBe('element:cover');
    const gmc = { workspaceRef: { revision: 3 }, sceneKitRef: { sceneKitId: 'scene:scout', revision: 3 }, observationAccess: [{ accessId: 'access:familiar' }] };
    const entry = { nodeId: 'watch', group: { groupId: 'group:familiar', methodRef: 'method:link' }, actorCandidate: { actorRef: 'actor:familiar' } };
    expect(appliedObservationBinding(second.receipt.authorityHead, [first, second], gmc, entry)?.evidenceRef).toBe('evidence:familiar');
    expect(() => appliedObservationBinding(first.receipt.authorityHead, [first, second], gmc, entry)).toThrow();
    expect(() => projectAppliedIntentBindings(source.instruction, source.program, [second, first])).toThrow();
    expect(() => projectAppliedIntentBindings(source.instruction, source.program, [first, first])).toThrow();
  });
  it('resolves prepared requirement existence only from accepted owner overlays, never labels or completed play', () => {
    const f = fixture((c) => {
      Object.assign(c.source.program.nodes[1].dataRequirements[0], { kind: 'scene_presence', dimension: 'who', query: 'I' });
      Object.assign(c.source.program.nodes[1].dataRequirements[1], { kind: 'current_location', dimension: 'where', query: 'behind cover' });
      c.source.program.nodes[1].dataRequirements.push({ kind: 'story_fact', dimension: 'what', query: 'remain behind cover' });
      c.proposal.sceneStoryDesign.affordances[0].factRefs = ['fact:cover'];
      c.proposal.facts[0].epistemicState = 'scene_local_stable';
    });
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
    const head = { storyWorkspaceRevision: 3, sceneRevision: 3, vcsCharacterRevision: 12 };
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef },
      { schemaVersion: 'gma.action-program-rebase-receipt/2', receiptId: 'rebase:one', programRef: 'program:scout', priorCursorRevision: 5, resultingCursorRevision: 6, authorityHead: head });
    const applications = [{ record, receipt }], projected = projectAppliedIntentBindings(f.context.source.instruction, f.context.source.program, applications);
    const loaded: any = { artifactRef: { campaignId: 'campaign:fictional', programId: 'program:scout' }, artifact: { ...f.context.source,
      cursor: { ...f.context.source.cursor, revision: 6, authorityHead: head }, intentBindingApplications: applications } };
    const active: any = { bundle: { ...f.context.proposal, pendingIntentBindingRecord: record } };
    const scene: any = { storyWorkspaceRef: { revision: 3 }, playableSceneContext: { sceneKitRef: { revision: 3 }, presentActors: ['actor:player'] } };
    const input = { campaignId: 'campaign:fictional', programId: 'program:scout', nodeId: 'cover',
      requirements: projected.nodes[1].dataRequirements.map((row: any, i: number) => ({ ...row, requirementId: `cover:requirement:${i + 1}` })) };
    const before = structuredClone({ loaded, active, scene });
    const result = preparedPendingRequirementProjection(input, loaded, active, scene)!;
    expect(result.requirementResults).toHaveLength(3);
    expect(result.requirementResults.every((r: any) => r.status === 'resolved' && r.reasonCode.endsWith('NOT_EXECUTED'))).toBe(true);
    expect({ loaded, active, scene }).toEqual(before);
    for (const wrong of ['foreign', 'missing_binding', 'stale_scene', 'stale_workspace', 'absent_actor', 'completed', 'tampered_requirement', 'missing_fact']) {
      const l = structuredClone(loaded), a = structuredClone(active), s = structuredClone(scene), body = structuredClone(input);
      if (wrong === 'foreign') body.campaignId = 'campaign:other';
      if (wrong === 'missing_binding') delete a.bundle.pendingIntentBindingRecord;
      if (wrong === 'stale_scene') a.bundle.sceneKit.revision++;
      if (wrong === 'stale_workspace') s.storyWorkspaceRef.revision++;
      if (wrong === 'absent_actor') s.playableSceneContext.presentActors = [];
      if (wrong === 'completed') l.artifact.cursor.completedNodeRefs.push('cover');
      if (wrong === 'tampered_requirement') body.requirements[1].targetRef = 'element:pebbles';
      if (wrong === 'missing_fact') a.bundle.facts = [];
      expect(() => preparedPendingRequirementProjection(body, l, a, s), wrong).toThrow();
    }
  });
  it('accepts exact supplied dossier and owner evidence citations while keeping probes strictly on scene records', () => {
    const f = fixture(); f.context.ownerEvidenceRefs = ['observable:confirmed', 'mechanics-binding:confirmed'];
    f.context.proposal.sceneReality = { realityId: 'reality:one' }; f.context.proposal.sceneStoryDesign.designId = 'design:one';
    const assessment = f.assessment();
    const window = createPendingIntentWindow(f.context.source);
    const refs = [window.nodes[0].requirements[0].requirementId, 'outcome:tunnel', 'observable:confirmed', 'mechanics-binding:confirmed', 'receipt:entry', 'gmc:receipt:entry', 'vcs:receipt:link',
      'group:familiar', 'method:link', 'access:familiar', 'capability:link', 'reality:one', 'design:one', createPendingIntentWindow(f.context.source).windowId];
    assessment.evidenceRefs = refs; assessment.bindingReviews[1].evidenceRefs = refs;
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    assessment.counterfactualProbes[0].evidenceRefs = ['observable:confirmed'];
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toContain('/counterfactualProbes');
    assessment.evidenceRefs = ['observable:invented'];
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toContain('/assessment');
  });
  it('recognizes exact structured completed owner receipt citations without rewriting their immutable window evidence', () => {
    const f = fixture((c) => { c.source.receipts[0].authorityReceipts = [{ authority: 'gmc', receiptRef: 'gmc:receipt:structured', revision: 3 }]; });
    const before = createPendingIntentWindow(f.context.source), assessment = f.assessment();
    assessment.evidenceRefs = ['gmc:receipt:structured']; assessment.bindingReviews[0].evidenceRefs = ['gmc:receipt:structured'];
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(createPendingIntentWindow(f.context.source)).toEqual(before);
  });
  it('keeps typed source heads exact and retains a newer prepared head only through its accepted association', () => {
    const f = fixture(); f.context.proposal.sceneKit.revision = 4; f.bindings.sceneKitRef.revision = 4;
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
    const head = { storyWorkspaceRevision: 3, sceneRevision: 4, vcsCharacterRevision: 12 };
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef },
      { schemaVersion: 'gma.action-program-rebase-receipt/2', receiptId: 'rebase:one', programRef: 'program:scout', priorCursorRevision: 5, resultingCursorRevision: 6, authorityHead: head });
    const applications = [{ record, receipt }], gmc = { workspaceRef: { revision: 3 }, sceneKitRef: { sceneKitId: 'scene:scout', revision: 3 }, observationAccess: [{ accessId: 'access:familiar' }] };
    const entry = { nodeId: 'watch', group: { groupId: 'group:familiar', methodRef: 'method:link' }, actorCandidate: { actorRef: 'actor:familiar' } };
    expect(appliedObservationBinding(head, applications, gmc, entry)?.accessRef).toBe('access:familiar');
    expect(observationSettlementAuthorityHead(head, applications, gmc, [entry])).toEqual(head);
    expect(observationSettlementAuthorityHead(head, [], gmc, [entry]).sceneRevision).toBe(3);
    expect(() => appliedObservationBinding({ ...head, sceneRevision: 5 }, applications, gmc, entry)).toThrow();
    expect(() => appliedObservationBinding(head, applications, { ...gmc, workspaceRef: { revision: 4 } }, entry)).toThrow();
    expect(() => appliedObservationBinding(head, applications, { ...gmc, sceneKitRef: { sceneKitId: 'scene:scout', revision: 4 } }, entry)).toThrow();
    expect(() => appliedObservationBinding(head, applications, gmc, { ...entry, group: { ...entry.group, groupId: 'foreign' } })).toThrow();
    expect(() => appliedObservationBinding(head, applications, gmc, { ...entry, group: { ...entry.group, methodRef: 'method:ordinary' } })).toThrow();
    expect(() => observationSettlementAuthorityHead(head, applications, gmc, [entry, { ...entry, nodeId: 'unbound' }])).toThrow();
  });
  it('projects only examined reference and coverage fields while preserving original work', () => {
    const { context, bindings, policyFingerprint, assessment } = fixture();
    const before = structuredClone(context.source), record = createPendingBindingRecord(context, bindings, assessment(), policyFingerprint);
    assertPendingBindingRecord(record, context.source);
    const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', receiptId: 'rebase:scout', programRef: 'program:scout',
      priorCursorRevision: 5, resultingCursorRevision: 6, authorityHead: { storyWorkspaceRevision: 3, sceneRevision: 3, vcsCharacterRevision: 12 } };
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:scout', revision: 1, sceneKitRef: bindings.sceneKitRef }, rebase);
    const projected = projectAppliedIntentBindings(context.source.instruction, context.source.program, [{ record, receipt }]);
    expect(projected.nodes[0]).toEqual(context.source.program.nodes[0]);
    expect(projected.nodes[1].kind).toBe('other');
    expect(projected.nodes[1].semanticLocationBindings.bindings[0].authorityRef).toBe('element:cover');
    expect(projected.nodes[2].observationGroups[0]).toMatchObject({ observerRef: 'actor:familiar', methodRef: 'method:link', bindingStatus: 'exact' });
    expect(projected.nodes[2].dataRequirements[0].coverageEntryRef).toBe('coverage:familiar');
    expect(context.source).toEqual(before);
    expect(() => projectAppliedIntentBindings(context.source.instruction, { ...context.source.program, status: 'changed' }, [{ record, receipt }])).toThrow();
    expect(() => projectAppliedIntentBindings(context.source.instruction, context.source.program, [{ record: { ...record, assessmentRef: 'forged' }, receipt }])).toThrow();
    expect(() => createPendingBindingRecord(context, bindings, { ...assessment(), verdict: 'repair_required' }, policyFingerprint)).toThrow();
  });
  it('accepts explicit full-window cover and qualified familiar bindings without changing source or receipts', () => {
    const { context, bindings, policyFingerprint, assessment } = fixture(), before = structuredClone(context);
    expect(shape(bindings)).toBe(true); expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(assessment(), bindings, context, policyFingerprint)).toEqual([]);
    expect(new Ajv({ strict: false }).compile(sceneReadinessPendingAssessmentOutput)(assessment())).toBe(true);
    expect(context).toEqual(before); expect(context.source.cursor.completedNodeRefs).toEqual(['enter']);
  });
  for (const mutation of ['omit', 'completed', 'duplicate', 'foreign', 'implicit', 'change_bound', 'invent_slot', 'wrong_family', 'entrance', 'evidence', 'execution']) {
    it(`rejects ${mutation} rather than guessing or silently dropping intent`, () => {
      const { context, bindings } = fixture(), changed: any = structuredClone(bindings);
      switch (mutation) {
        case 'omit': changed.nodes.pop(); break;
        case 'completed': changed.nodes[0].nodeRef = 'enter'; break;
        case 'duplicate': changed.nodes[1].nodeRef = 'cover'; break;
        case 'foreign': changed.campaignId = 'campaign:foreign'; break;
        case 'implicit': changed.nodes[0].references[1].selectedRef = 'the ledge'; break;
        case 'change_bound': changed.nodes[0].references[0].selectedRef = 'actor:familiar'; break;
        case 'invent_slot': changed.nodes[0].references[0].slotId = 'slot:invented'; break;
        case 'wrong_family': context.proposal.sceneStoryDesign.affordances[3].actionFamily = 'interact'; break;
        case 'entrance': changed.nodes[1].coverage[0].coverageEntryRef = 'coverage:entrance'; break;
        case 'evidence': changed.nodes[0].instructionEvidence.quote = 'Touch the pebbles.'; break;
        case 'execution': changed.nodes[0].result = 'concealed'; break;
      }
      expect(scenePendingIntentBindingIssues(changed, context).length).toBeGreaterThan(0);
    });
  }
  it('does not select an entrance tuple by order when both views share the exact tunnel', () => {
    const { context, bindings } = fixture(); context.proposal.sceneStoryDesign.affordances.reverse(); context.observations.reverse();
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    bindings.nodes[1].coverage[0].coverageEntryRef = 'coverage:entrance';
    expect(scenePendingIntentBindingIssues(bindings, context)).toContain('/nodes/watch/coverage');
  });
  it('derives outcome ownership from exact group outcomeIds and keeps two views of the same target distinct', () => {
    const { context, bindings } = fixture((c) => {
      const watch = c.source.program.nodes[2]; delete watch.dataRequirements[0].observation.groupId;
      watch.dataRequirements.push({ kind: 'observation', observation: { outcomeId: 'outcome:entrance', targetRef: 'element:tunnel', relationOriginRef: null, facet: 'surface_description' } });
      watch.observationGroups.push({ groupId: 'group:player', observerKind: 'character', observerRef: 'actor:player', methodRef: 'method:sight', formRef: null,
        formTargetId: null, outcomeIds: ['outcome:entrance'], viewpointBinding: 'current' });
      c.observations.push({ ...c.observations[0], evidenceRef: 'evidence:player', groupId: 'group:player', observerKind: 'character', observerRef: 'actor:player',
        methodRef: 'method:sight', zoneRef: 'zone:approach', accessRef: 'ordinary_view', capabilityRef: null });
    });
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    const slots = pendingIntentBindingSlots(context.source)[1];
    expect(slots.coverage.map((s: any) => s.groupId)).toEqual(['group:familiar', 'group:player']);
    bindings.nodes[1].coverage.reverse(); context.observations.reverse(); context.source.program.nodes[2].observationGroups.reverse();
    // Source-array changes also invalidate the frozen window; rebuilding only
    // that identity lets us test order-independent exact group selection.
    const window = createPendingIntentWindow(context.source); bindings.windowId = window.windowId; bindings.windowFingerprint = window.windowFingerprint;
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    bindings.nodes[1].coverage[0].coverageEntryRef = 'coverage:familiar';
    expect(scenePendingIntentBindingIssues(bindings, context)).toContain('/nodes/watch/coverage');
  });
  it('rejects switching other to wait even if an unrelated valid wait affordance exists', () => {
    const { context, bindings } = fixture(); context.proposal.sceneStoryDesign.affordances[0].actionFamily = 'wait';
    expect(scenePendingIntentBindingIssues(bindings, context)).toContain('/nodes/cover/coverage');
  });
  it('preserves an explicit coverage binding and exact actor aliases without name matching', () => {
    const { context, bindings } = fixture((c) => { c.source.program.nodes[2].dataRequirements[0].coverageEntryRef = 'coverage:familiar'; });
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    context.proposal.sceneStoryDesign.affordances[3].coverageEntryId = 'coverage:alternate';
    bindings.nodes[1].coverage[0].coverageEntryRef = 'coverage:alternate';
    expect(scenePendingIntentBindingIssues(bindings, context)).toContain('/nodes/watch/coverage');
  });
  it('rejects duplicate or missing outcome ownership instead of collapsing observers', () => {
    const { context } = fixture(); context.source.program.nodes[2].observationGroups[0].outcomeIds = [];
    expect(() => pendingIntentBindingSlots(context.source)).toThrow(/grouping/);
  });
  it('closes actorRef/actorFrameId only through the exact owner record, not its label', () => {
    const { context, bindings } = fixture((c) => {
      c.source.program.nodes[1].dataRequirements[1] = { targetRole: 'recipient', targetRef: 'actor:player' };
      c.source.program.nodes[1].semanticLocationBindings.bindings = [];
      c.proposal.sceneStoryDesign.affordances[0].targetRef = 'frame:player';
    });
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    context.proposal.actorFrames[0].actorRef = 'actor:someone-else'; context.proposal.actorFrames[0].label = 'actor:player';
    expect(scenePendingIntentBindingIssues(bindings, context).length).toBeGreaterThan(0);
  });
  it('bounds UTF-8 proposal bytes independently of character and slot limits', () => {
    const { context, bindings } = fixture((c) => {
      const prefix = '🐀'.repeat(4_000), instruction = c.source.instruction;
      instruction.exactText = prefix + instruction.exactText;
      instruction.instructionFingerprint = freeformTextDigest(instruction.exactText);
      c.source.program.instructionFingerprint = instruction.instructionFingerprint;
      c.source.program.nodes[1].evidenceSpans = [{ start: 0, end: prefix.length }];
      c.source.program.nodes[2].evidenceSpans = [{ start: prefix.length + 41, end: instruction.exactText.length }];
    });
    for (const row of bindings.nodes) row.rationale = '🐀'.repeat(1_000);
    expect(scenePendingIntentBindingIssues(bindings, context)).toContain('/bytes');
  });
  for (const mutation of ['stale_capability', 'foreign_evidence', 'missing_receipt', 'missing_link', 'different_observer', 'different_method']) {
    it(`rejects ${mutation} without downgrading familiar access`, () => {
      const { context, bindings } = fixture();
      const e = context.observations[0];
      switch (mutation) {
        case 'stale_capability': e.vcsCharacterRevision = 11; break;
        case 'foreign_evidence': e.campaignId = 'campaign:foreign'; break;
        case 'missing_receipt': e.ownerReceiptRefs = []; break;
        case 'missing_link': e.capabilityRef = null; break;
        case 'different_observer': e.observerRef = 'actor:player'; break;
        case 'different_method': e.methodRef = 'method:ordinary'; break;
      }
      expect(scenePendingIntentBindingIssues(bindings, context).length).toBeGreaterThan(0);
    });
  }
  it('allows a truthful clarification but never an adequate assessment or action advancement', () => {
    const { context, bindings, policyFingerprint, assessment } = fixture();
    Object.assign(bindings.nodes[0], { disposition: 'clarification_required', references: [], coverage: [], observations: [], question: 'Which prepared position do you mean by cover?' });
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(assessment(), bindings, context, policyFingerprint)).toContain('/verdict');
  });
  it('requires semantic examination even when unrelated pebbles form a structurally closed tuple', () => {
    const { context, bindings, policyFingerprint, assessment } = fixture();
    for (const r of bindings.nodes[0].references) if (r.selectedRef === 'element:cover') r.selectedRef = 'element:pebbles';
    for (const c of bindings.nodes[0].coverage) c.coverageEntryRef = 'coverage:pebbles';
    expect(scenePendingIntentBindingIssues(bindings, context)).toEqual([]); // Not semantic proof or authority.
    const reviewed: any = assessment(); reviewed.bindingReviews[0].verdict = 'unsupported';
    reviewed.bindingReviews[0].rationale = 'Contact with pebbles does not keep the player behind cover.';
    reviewed.debt = [{ debtId: 'debt:cover', domain: 'pending_intent', description: reviewed.bindingReviews[0].rationale, blocking: true, affectedRefs: ['cover'] }];
    expect(scenePendingIntentExaminationIssues(reviewed, bindings, context, policyFingerprint)).toContain('/verdict');
    reviewed.verdict = 'repair_required';
    expect(scenePendingIntentExaminationIssues(reviewed, bindings, context, policyFingerprint)).toEqual([]);
  });
  for (const field of ['intentWindowFingerprint', 'bindingFingerprint', 'ownerReadSetFingerprint', 'dossierFingerprint', 'policyFingerprint', 'pendingIntentPolicyFingerprint']) {
    it(`rejects stale or forged ${field}`, () => {
      const { context, bindings, policyFingerprint, assessment } = fixture(); const result: any = assessment(); result[field] = 'f'.repeat(64);
      expect(scenePendingIntentExaminationIssues(result, bindings, context, policyFingerprint)).toEqual(['/identity']);
    });
  }
  it('invalidates examination after a dossier, owner-read-set or accepted prerequisite receipt change', () => {
    for (const change of [
      (c: ScenePendingBindingContext) => { c.proposal.elements[0].visibleSurface = 'A different ledge.'; },
      (c: ScenePendingBindingContext) => { c.ownerReadSet.storyWorkspaceRevision += 1; },
      (c: ScenePendingBindingContext) => { c.source.receipts[0].authorityReceipts = ['gmc:receipt:other']; },
    ]) {
      const { context, bindings, policyFingerprint, assessment } = fixture(), original = assessment(); change(context);
      expect(scenePendingIntentExaminationIssues(original, bindings, context, policyFingerprint).length).toBeGreaterThan(0);
    }
  });
  for (const mutation of ['old_version', 'missing_review', 'completed_review', 'foreign_probe', 'implicit_review', 'resolved_mechanics', 'low_confidence', 'blocking_debt']) {
    it(`does not certify ${mutation}`, () => {
      const { context, bindings, policyFingerprint, assessment } = fixture(); const result: any = assessment();
      switch (mutation) {
        case 'old_version': result.schemaVersion = 'gma.scene-readiness-assessment/1'; break;
        case 'missing_review': result.bindingReviews.pop(); break;
        case 'completed_review': result.bindingReviews[0].nodeRef = 'enter'; break;
        case 'foreign_probe': result.counterfactualProbes[0].evidenceRefs = ['coverage:cover']; break;
        case 'implicit_review': delete result.bindingReviews[0].bindingRowFingerprint; break;
        case 'resolved_mechanics': result.bindingReviews[0].mechanicsState = 'completed'; break;
        case 'low_confidence': result.confidence = 'low'; break;
        case 'blocking_debt': result.debt = [{ debtId: 'debt:cover', domain: 'pending_intent', description: 'Cover is not supported.', blocking: true, affectedRefs: ['cover'] }]; break;
      }
      expect(scenePendingIntentExaminationIssues(result, bindings, context, policyFingerprint).length).toBeGreaterThan(0);
    });
  }
  it('repairs only a named failed row and preserves all other rows byte-for-byte', () => {
    const { context, bindings } = fixture(), bad: any = structuredClone(bindings), before = structuredClone(bindings);
    bad.nodes[0].coverage[0].coverageEntryRef = 'coverage:entrance';
    const fixed = mergeScenePendingIntentBindingRepair(bad, [bindings.nodes[0]], ['cover'], context);
    expect(fixed).toEqual(bindings); expect(fixed.nodes[1]).toEqual(bad.nodes[1]); expect(bindings).toEqual(before);
    expect(() => mergeScenePendingIntentBindingRepair(bad, [bindings.nodes[1]], ['cover'], context)).toThrow(/scope/);
    expect(() => mergeScenePendingIntentBindingRepair(bad, [bindings.nodes[0]], ['enter'], context)).toThrow(/scope/);
  });
  it('keeps staged /2 schemas separate and leaves all existing registered operations unchanged', () => {
    expect(sceneRealityPendingBuilderResultOutput.schemaVersion.const).toBe('gma.scene-reality-builder-result/2');
    expect(getOperationDefinition('story.scene-reality.build').prompt.version).toBe('gma.scene-reality-builder-policy/3');
    expect(getOperationDefinition('story.scene-readiness.examine').prompt.version).toBe('gma.scene-readiness-examiner-policy/1');
    expect((getOperationDefinition('story.scene-reality.build').outputSchema.schema.properties as Record<string, unknown>).schemaVersion).toEqual({ const: 'gma.scene-reality-builder-result/1' });
  });
  it('states positive binding, evidence, pending mechanics and failed-row repair requirements before a correction', () => {
    for (const rule of [/every node/, /every reference slot exactly once/, /Preserve every non-null original ref/, /instructionEvidence/, /exact zone, access and capability tuple/,
      /clarification_required/, /completed receipts and pending mechanics/, /24,576 UTF-8 bytes/, /Repair only the exact failed node rows/]) expect(SCENE_PENDING_INTENT_BINDING_POLICY).toMatch(rule);
    for (const rule of [/one bindingReviews row per pending node/, /Pending mechanics remain unresolved/, /Completed prerequisite receipts are immutable/, /pebbles/, /repair_required/, /five-operation/, /no sixth operation/]) expect(SCENE_PENDING_INTENT_EXAMINER_POLICY).toMatch(rule);
  });
});
