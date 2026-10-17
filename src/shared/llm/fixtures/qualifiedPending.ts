import { freeformJsonDigest, freeformTextDigest } from '../freeformPlanBinding.js';
import { createPendingIntentWindow } from '../pendingIntentWindow.js';
import { conditionalViewpointRef, pendingIntentBindingSlots, scenePendingIntentExaminationIdentity, type ScenePendingBindingContext } from '../scenePendingIntentQualified.js';
import type { PendingObserverEvidence } from '../pendingObserverEvidence.js';

export function qualifiedPendingFixture() {
  const campaignId = 'campaign:fictional', operationId = 'prepare:qualified';
  const exactText = 'Send my rat familiar inside. I remain hidden and watch through its eyes.';
  const instruction = { instructionRef: 'instruction:one', exactText, instructionFingerprint: freeformTextDigest(exactText) };
  const source: ScenePendingBindingContext['source'] = { instruction, artifactRevision: 1, receipts: [],
    program: { schemaVersion: 'gma.semantic-action-program/4', programId: 'program:one', instructionRef: instruction.instructionRef,
      instructionFingerprint: instruction.instructionFingerprint, authorityBase: { campaignId }, nodes: [
        { nodeId: 'enter', kind: 'move', summary: 'Send my rat familiar inside.', dependsOn: [], evidenceSpans: [{ start: 0, end: 27 }],
          dataRequirements: [{ targetRole: 'actor', targetRef: null }, { targetRole: 'destination', targetRef: 'element:tunnel' }],
          semanticLocationBindings: { bindings: [{ role: 'destination', description: 'inside', authorityRef: 'element:tunnel' }] } },
        { nodeId: 'cover', kind: 'other', dependsOn: [], evidenceSpans: [{ start: 28, end: 43 }],
          dataRequirements: [{ targetRole: 'actor', targetRef: 'actor:player' }], semanticLocationBindings: { bindings: [] } },
        { nodeId: 'watch', kind: 'observe', dependsOn: ['enter'], evidenceSpans: [{ start: 48, end: exactText.length }],
          dataRequirements: [{ kind: 'observation', observation: { outcomeId: 'outcome:interior', targetRef: 'element:tunnel',
            relationOriginRef: null, facet: 'surface_description', valueKind: 'description', requestedPrecision: 'ordinary' } }],
          observationGroups: [{ groupId: 'group:familiar', observerKind: 'familiar', observerRef: null, methodRef: null,
            formRef: null, formTargetId: 'form:requested', outcomeIds: ['outcome:interior'], viewpointBinding: 'after:enter' }] },
      ] },
    cursor: { programId: 'program:one', revision: 1, completedNodeRefs: [], skippedNodeRefs: [], readyNodeRefs: ['enter', 'cover'],
      remainingNodeRefs: ['watch'], waiting: null, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 0 } } };
  const window = createPendingIntentWindow(source);
  const evidence: PendingObserverEvidence = { schemaVersion: 'gmc.pending-observer-evidence/1', evidenceRef: 'evidence:rat', campaignId,
    programRef: 'program:one', instructionFingerprint: instruction.instructionFingerprint, windowRef: window.windowId,
    windowFingerprint: window.windowFingerprint, nodeRef: 'watch', groupId: 'group:familiar', observerKind: 'familiar', observerRef: 'actor:familiar',
    actorLinkRef: 'link:familiar', methodRef: 'method:familiar-eyes', formRef: 'vcs:form:rat', currentForm: 'rat', capabilityRef: 'method:familiar-eyes',
    availableModalities: ['visual'], mobilityRefs: ['mobility:rat'], vcsOwnerRef: 'owner:one', mechanicsSubjectRef: 'vcs:familiar:one',
    vcsSubjectRevision: 'a'.repeat(64), vcsCharacterRevision: 'b'.repeat(64), ownerReceiptRefs: ['vcs:receipt:rat'],
    sourceHead: { workspaceRevision: 2, sceneKitId: 'scene:one', sceneRevision: 2, payloadFingerprint: 'c'.repeat(64) },
    origin: { kind: 'owner_actor_frame', zoneRef: 'zone:entrance', description: 'At the entrance.', sourceRefs: ['frame:familiar'] },
    viewpointCondition: { kind: 'after_relocation', nodeRef: 'enter', destinationTargetId: 'destination:interior', destinationRef: 'element:tunnel' } };
  const context: ScenePendingBindingContext & { qualifiedObservers: PendingObserverEvidence[] } = { source, operationId,
    ownerReadSet: { campaignId, storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 0 }, observations: [], qualifiedObservers: [evidence],
    proposal: { operationId, campaignId, requestedDepth: 'investigative', sceneKit: { sceneKitId: 'scene:one', revision: 3 },
      zones: [{ zoneId: 'zone:entrance', campaignId }, { zoneId: 'zone:interior', campaignId }],
      actorFrames: [{ actorFrameId: 'frame:player', actorRef: 'actor:player', campaignId, zoneRef: 'zone:entrance', sourceRefs: ['actor:player'] },
        { actorFrameId: 'frame:familiar', actorRef: 'actor:familiar', campaignId, zoneRef: 'zone:entrance', sourceRefs: ['actor:familiar'] }],
      elements: [{ elementId: 'element:tunnel', campaignId, zoneRef: 'zone:interior' }], facts: [{ factId: 'fact:interior', targetRef: 'element:tunnel',
        facet: 'surface_description', valueKind: 'description', value: 'A shallow channel passes a chalk-marked iron grate.',
        epistemicState: 'prepared_private_world', visibility: 'gm_only', observerRestrictions: [], modalityRestrictions: ['visual'], negativeScope: null }], preparedBoundaries: [],
      sceneStoryDesign: { affordances: [
        { coverageEntryId: 'coverage:move', zoneRef: 'zone:interior', targetRef: 'element:tunnel', actionFamily: 'move', accessClass: null, capabilityClass: null, thresholdRef: null },
        { coverageEntryId: 'coverage:cover', zoneRef: 'zone:entrance', targetRef: 'actor:player', actionFamily: 'interact', accessClass: null, capabilityClass: null, thresholdRef: null },
        { coverageEntryId: 'coverage:remote', zoneRef: 'zone:interior', targetRef: 'element:tunnel', actionFamily: 'observe',
          accessClass: conditionalViewpointRef(evidence), capabilityClass: evidence.capabilityRef, thresholdRef: null, factRefs: ['fact:interior'] },
      ] } } };
  const slots = pendingIntentBindingSlots(source);
  const bindings = { schemaVersion: 'gma.scene-pending-intent-bindings/2', bindingId: 'binding:qualified', operationId, campaignId,
    windowId: window.windowId, windowFingerprint: window.windowFingerprint, sceneKitRef: { sceneKitId: 'scene:one', revision: 3 },
    nodes: slots.map((slot) => ({ nodeRef: slot.nodeRef, disposition: 'bound',
      references: slot.references.map((s: ScenePendingBindingContext['proposal']) => ({ slotId: s.slotId, selectedRef: s.originalRef
        ?? (s.role === 'actor' || s.role === 'observer' ? 'actor:familiar' : s.role === 'method' ? evidence.methodRef : evidence.formRef) })),
      coverage: slot.coverage.map((s: ScenePendingBindingContext['proposal']) => ({ slotId: s.slotId,
        coverageEntryRef: slot.nodeRef === 'enter' ? 'coverage:move' : slot.nodeRef === 'cover' ? 'coverage:cover' : 'coverage:remote' })),
      observations: slot.observationGroups.map((g: ScenePendingBindingContext['proposal']) => ({ groupId: g.groupId, ownerEvidenceRef: evidence.evidenceRef,
        viewpointZoneRef: 'zone:interior', viewpointCondition: structuredClone(evidence.viewpointCondition) })),
      instructionEvidence: slot.instructionEvidence[0], rationale: 'Preserve the action and conditional future viewpoint without resolving it.', question: null })),
  };
  const policyFingerprint = 'd'.repeat(64);
  const assessment = () => ({ schemaVersion: 'gma.scene-readiness-assessment/3', assessmentId: 'assessment:qualified',
    ...scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint), verdict: 'adequate', confidence: 'high',
    counterfactualProbes: ['Where does the familiar start?', 'Where could it arrive?', 'What remains unresolved?'].map((probe) => ({ probe, status: 'supported', evidenceRefs: ['frame:familiar'] })),
    debt: [], rationale: 'Starting position and unexecuted movement are distinct.', evidenceRefs: ['frame:familiar'],
    bindingReviews: bindings.nodes.map((row) => ({ nodeRef: row.nodeRef, bindingRowFingerprint: freeformJsonDigest(row), verdict: 'supported',
      rationale: 'The original meaning is preserved and no gameplay is resolved.', evidenceRefs: [row.nodeRef], mechanicsState: 'not_resolved' })),
    qualificationReview: { verdict: 'supported', originState: 'preserved', viewpointState: 'unexecuted_conditions_preserved',
      rationale: 'The confirmed rat remains at its original entrance until the exact move succeeds.', evidenceRefs: [evidence.evidenceRef, 'frame:familiar'] },
  });
  return { context, bindings, evidence, policyFingerprint, assessment };
}
