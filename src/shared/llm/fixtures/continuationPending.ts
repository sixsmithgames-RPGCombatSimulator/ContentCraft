import { qualifiedPendingFixture } from './qualifiedPending.js';
import { createPendingIntentWindow } from '../pendingIntentWindow.js';
import { freeformJsonDigest, freeformTextDigest } from '../freeformPlanBinding.js';
import { deriveConfirmedRelocationLineage } from '../confirmedRelocationLineage.js';
import type { InstructionWindowCoverage } from '../instructionWindowCoverage.js';
import { createPendingBindingRecord, createIntentBindingReceipt } from '../scenePendingIntentApplication.js';
import { scenePendingIntentExaminationIdentity, conditionalViewpointRef } from '../scenePendingIntentQualified.js';

/** Fictional immutable owner records for continuation contract regressions. */
export function continuationPendingFixture() {
  const f = qualifiedPendingFixture();
  f.context.source.instruction.interactionId = 'turn:one';
  f.context.source.instruction.instructionRef = 'gma:instruction:turn:one';
  f.context.source.program.instructionRef = f.context.source.instruction.instructionRef;
  f.context.source.program.planner = { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/12' };
  f.context.source.program.nodes[0].observationPrerequisite = { groupRefs: ['group:familiar'], dependentObservationNodeRefs: ['watch'] };
  const originalWindow = createPendingIntentWindow(f.context.source);
  f.bindings.windowId = originalWindow.windowId; f.bindings.windowFingerprint = originalWindow.windowFingerprint;
  f.evidence.windowRef = originalWindow.windowId; f.evidence.windowFingerprint = originalWindow.windowFingerprint;
  const prior = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
  const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: 'program:one', priorCursorRevision: 1,
    resultingCursorRevision: 2, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 3, vcsCharacterRevision: 0 }, receiptId: 'rebase:one' };
  const application = { record: prior, receipt: createIntentBindingReceipt(prior, { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef }, rebase) };
  const receipt = { schemaVersion: 'gma.action-execution-receipt/2', receiptId: 'receipt:move', programId: 'program:one', nodeId: 'enter', lifecycle: 'settled', result: 'succeeded' };
  const source = { ...structuredClone(f.context.source), artifactRevision: 3, receipts: [receipt],
    cursor: { ...structuredClone(f.context.source.cursor), revision: 3, completedNodeRefs: ['enter'], readyNodeRefs: ['cover', 'watch'], remainingNodeRefs: [] } };
  const artifact = { ...source, intentBindingApplications: [application] };
  const lineage = deriveConfirmedRelocationLineage({ campaignId: 'campaign:fictional', programId: 'program:one', moveNodeRef: 'enter',
    observationNodeRef: 'watch', groupId: 'group:familiar', observerRef: 'actor:familiar', actorLinkRef: 'link:familiar' }, artifact, f.evidence.sourceHead);
  const window = createPendingIntentWindow(source), bytes = Buffer.byteLength(source.instruction.exactText);
  const coverageBody = { schemaVersion: 'gmc.instruction-window-coverage/1' as const, campaignId: 'campaign:fictional', programRef: 'program:one',
    rootInstructionFingerprint: source.instruction.instructionFingerprint, instructionFingerprint: source.instruction.instructionFingerprint,
    bindingFingerprint: 'f'.repeat(64), currentInstructionRange: { start: 0, end: bytes }, prefixRange: { start: 0, end: bytes },
    deferredTailRange: { start: bytes, end: bytes }, deferredTailBytes: 0, deferredTailFingerprint: freeformTextDigest(''), rootCompletionPermitted: true };
  const instructionCoverage: InstructionWindowCoverage = { ...coverageBody, coverageRef: `instruction-coverage:${freeformJsonDigest(coverageBody).slice(0, 40)}` };
  const freeformBinding = { schemaVersion: 'gma.freeform-plan-binding/1', instructionRef: source.instruction.instructionRef,
    interactionId: source.instruction.interactionId, instructionFingerprint: source.instruction.instructionFingerprint,
    windowId: `window:${freeformTextDigest(source.instruction.exactText)}`, windowBytes: bytes, suffixText: '', continuationFingerprint: freeformTextDigest(''),
    policyVersion: 'gma.freeform-intake-policy/3', registryVersion: '2026-10-15.1', proposalDigest: 'a'.repeat(64), requestDigest: 'b'.repeat(64),
    ticket: 'ticket:continuation', ticketDisposition: 'owner_accepted', authorityBase: { campaignId: 'campaign:fictional', storyWorkspaceRevision: 2, sceneRevision: 2, vcsCharacterRevision: 0 },
    sourceReferences: [], compiledStepIds: source.program.nodes.map((node: { nodeId: string }) => node.nodeId),
    operationRequirements: source.program.nodes.map((node: { nodeId: string; dataRequirements: unknown[] }) => ({ nodeRef: node.nodeId, requirements: node.dataRequirements })) };
  const evidence = { ...structuredClone(f.evidence), schemaVersion: 'gmc.pending-observer-evidence/2' as const,
    windowRef: window.windowId, windowFingerprint: window.windowFingerprint, evidenceRef: 'evidence:confirmed',
    origin: { kind: 'owner_relocation_receipt' as const, zoneRef: 'zone:interior', description: 'At the saved movement destination.', sourceRefs: [lineage.lineageRef, receipt.receiptId] },
    viewpointCondition: { kind: 'confirmed_relocation' as const, lineageRef: lineage.lineageRef, destinationRef: lineage.destinationRef, destinationZoneRef: lineage.destinationZoneRef } };
  const context = { ...structuredClone(f.context), source, qualifiedObservers: [evidence], instructionCoverage, confirmedRelocations: [lineage] };
  context.proposal.sceneKit.revision = 4;
  const frame = context.proposal.actorFrames.find((row: { actorRef: string }) => row.actorRef === evidence.observerRef);
  frame.zoneRef = 'zone:interior'; frame.sourceRefs = [...evidence.origin.sourceRefs];
  context.proposal.sceneStoryDesign.affordances.find((row: { actionFamily: string }) => row.actionFamily === 'observe').accessClass = conditionalViewpointRef(evidence);
  const bindings = { ...structuredClone(f.bindings), schemaVersion: 'gma.scene-pending-intent-bindings/3', bindingId: 'binding:continuation',
    windowId: window.windowId, windowFingerprint: window.windowFingerprint, sceneKitRef: { sceneKitId: 'scene:one', revision: 4 },
    nodes: f.bindings.nodes.filter((row) => row.nodeRef !== 'enter').map((row) => ({ ...structuredClone(row),
      observations: row.observations.map((selected: { groupId: string; ownerEvidenceRef: string; viewpointZoneRef: string }) => ({ ...selected, ownerEvidenceRef: evidence.evidenceRef, viewpointCondition: evidence.viewpointCondition })) })) };
  const assessment = () => ({ ...f.assessment(), schemaVersion: 'gma.scene-readiness-assessment/4',
    ...scenePendingIntentExaminationIdentity(bindings, context, f.policyFingerprint),
    bindingReviews: bindings.nodes.map((row) => ({ nodeRef: row.nodeRef, bindingRowFingerprint: freeformJsonDigest(row), verdict: 'supported',
      rationale: 'Only the unfinished action is prepared.', evidenceRefs: [row.nodeRef], mechanicsState: 'not_resolved' })),
    qualificationReview: { verdict: 'supported', originState: 'preserved', viewpointState: 'pending_and_confirmed_lineage_preserved',
      rationale: 'The saved move is not repeated and observation remains unresolved.', evidenceRefs: [evidence.evidenceRef, lineage.lineageRef] } });
  return { f, source, context, bindings, evidence, lineage, assessment, application, freeformBinding, policyFingerprint: f.policyFingerprint };
}
