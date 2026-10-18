import { freeformJsonDigest, freeformTextDigest } from '../freeformPlanBinding.js';

/** Minimal unit fixture of the two original blind failures, not a success
 * receipt or a replacement for a real-owner browser rehearsal. */
export function typedReferenceFixture() {
  const exactText = 'Send my familiar across the slick lip into the drain, then look around through its eyes.';
  const instruction = { instructionRef: 'instruction:typed', interactionId: 'interaction:typed', exactText,
    instructionFingerprint: freeformTextDigest(exactText) };
  const evidence = [{ start: 0, end: Buffer.byteLength(exactText), quote: exactText }];
  const proposal: Record<string, any> = { schemaVersion: 'gma.freeform-intent-proposal/2', ticket: 'ticket:typed', windowText: exactText,
    referents: [{ kind: 'actor', text: 'I', catalogKey: 'selected_actor', methodKind: null },
      { kind: 'actor', text: 'my familiar', catalogKey: null, methodKind: null },
      { kind: 'place', text: 'the drain', catalogKey: null, methodKind: null },
      { kind: 'method', text: 'through its eyes', catalogKey: null, methodKind: 'capability' },
      { kind: 'place', text: 'the slick lip', catalogKey: 'slick_lip', methodKind: null }],
    steps: [{ kind: 'action', purpose: 'relocate_actor', goal: 'Send the familiar across the lip into the drain.', actor: 1,
      targets: [{ ref: 4, role: 'area' }, { ref: 2, role: 'destination' }],
      effects: [{ attempt: 'Cross the lip into the drain.', resolution: 'owner_resolution', evidence: [exactText] }] },
    { kind: 'action', purpose: 'observe_situation', goal: 'Look around through the familiar.', actor: 1, targets: [{ ref: 2, role: 'area' }], effects: [] }],
    observations: [{ step: 1, observer: 1, observerKind: 'familiar', subject: 2, origin: 2, method: 3,
      facet: 'surface_description', valueKind: 'description', precision: 'ordinary' }], clarification: null };
  const base = { campaignId: 'campaign:typed', storyWorkspaceRevision: 1, sceneRevision: 1, vcsCharacterRevision: 1 };
  const program: Record<string, any> = { schemaVersion: 'gma.semantic-action-program/6', programId: 'program:typed',
    instructionRef: instruction.instructionRef, instructionFingerprint: instruction.instructionFingerprint,
    authorityBase: base, planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/13' },
    nodes: [{ nodeId: 'freeform:step:0', kind: 'move', dependsOn: [], evidenceSpans: evidence,
      dataRequirements: [{ kind: 'current_location', dimension: 'where', query: 'the slick lip', targetRole: 'area', targetRef: 'element:lip' },
        { kind: 'destination_location', dimension: 'where', query: 'the drain', targetRole: 'destination', targetRef: null }],
      semanticLocationBindings: { schemaVersion: 'gma.semantic-location-bindings/1', bindings: [
        { role: 'area', description: 'the slick lip', authorityRef: 'element:lip' }, { role: 'destination', description: 'the drain', authorityRef: null }] },
      requestedEffects: [{ effectId: 'freeform:step:0:effect:1', attempt: proposal.steps[0].effects[0].attempt, resolution: 'owner_resolution', evidenceSpans: evidence }] },
    { nodeId: 'freeform:step:1', kind: 'observe', dependsOn: ['freeform:step:0'], evidenceSpans: evidence,
      dataRequirements: [{ kind: 'observation', dimension: 'what', query: 'surface_description of the drain', observation: {
        outcomeId: 'freeform:outcome:0', sourceIndex: 0, targetId: 'freeform:referent:2', targetRef: 'freeform:referent:2',
        relationOriginTargetId: 'freeform:referent:2', relationOriginRef: 'freeform:referent:2',
        facet: 'surface_description', valueKind: 'description', requestedPrecision: 'ordinary' } }],
      observationGroups: [{ groupId: 'group:watch', outcomeIds: ['freeform:outcome:0'], observerKind: 'familiar', observerRef: null, methodRef: null, formRef: null,
        observerTargetId: 'freeform:referent:1', methodId: 'freeform:referent:3', formTargetId: null }],
      requestedEffects: [] }] };
  const cursor = { programId: program.programId, revision: 1, authorityHead: base,
    completedNodeRefs: [], skippedNodeRefs: [], readyNodeRefs: ['freeform:step:0'], remainingNodeRefs: ['freeform:step:1'], waiting: null };
  const catalog = [{ key: 'selected_actor', kind: 'actor', ref: 'actor:hero' }, { key: 'slick_lip', kind: 'place', ref: 'element:lip' }];
  const request = { context: { input: { value: { instruction: exactText, mode: 'action' } } } };
  const ticket = { _id: 'ticket:typed', userId: 'user:typed', campaignId: base.campaignId, interactionId: instruction.interactionId,
    instructionFingerprint: instruction.instructionFingerprint, status: 'accepted', transport: 'manual', policyVersion: 'gma.freeform-intake-policy/7',
    registryVersion: '2026-10-15.1', request, requestDigest: freeformJsonDigest(request), outputDigest: freeformJsonDigest(proposal),
    catalogContextRef: { sceneKitRef: { revision: 1 } }, catalogBindings: catalog,
    response: { status: 'succeeded', route: { provider: 'manual' }, output: proposal } };
  const freeformBinding = { ticketDisposition: 'owner_accepted', ticket: ticket._id, policyVersion: ticket.policyVersion,
    registryVersion: ticket.registryVersion, requestDigest: ticket.requestDigest, proposalDigest: ticket.outputDigest,
    sourceReferences: catalog, authorityBase: base, compiledStepIds: program.nodes.map((node: any) => node.nodeId) };
  const artifact = { instruction, program, cursor, freeformBinding, receipts: [] };
  const loaded = { artifactRef: { programId: program.programId, campaignId: base.campaignId, revision: 1 }, artifact };
  return { artifact, loaded, ticket, proposal, catalog, scope: { userId: ticket.userId, campaignId: base.campaignId, programId: program.programId },
    source: { instruction, program, cursor, receipts: [], artifactRevision: 1 } };
}
