import { describe, expect, it } from 'vitest';
import { continuationPendingFixture } from './fixtures/continuationPending.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';
import { READ_EFFECT_CONTRACTS } from './readEffectContracts.js';
import { scenePendingIntentBindingIssues, scenePendingIntentExaminationIdentity, scenePendingIntentExaminationIssues, readEffectAssessmentEvidenceRefs,
  scenePendingBindingContextFromOwner, mergeScenePendingIntentBindingRepair } from './sceneReadEffectBindings.js';
import { pendingIntentBindingSlots, scenePendingIntentBindingIssues as legacyIssues } from './scenePendingIntentBindings.js';
import type { ActorMechanicsLink } from './actorMechanicsLink.js';
import type { PendingObserverEvidence } from './pendingObserverEvidence.js';
import { createPendingBindingRecord, createIntentBindingReceipt, projectAppliedIntentBindings, pendingScenePolicyFingerprint } from './scenePendingIntentApplication.js';
import { getOperationDefinition, validateOperationOutput } from '../../server/llm-orchestrator/operationRegistry.js';
import { preparedReceiverSlots, remoteReceiverWitnesses } from './scenePreparedBindingCompilation.js';

function fixture() {
  const f = continuationPendingFixture(), context = f.context;
  context.proposal.sceneStoryDesign.schemaVersion = 'gmc.scene-story-design/4';
  for (const surface of context.proposal.sceneStoryDesign.affordances) {
    surface.surfaceKind = surface.actionFamily === 'observe' ? 'information' : 'action_surface';
    surface.interactionSurface = surface.actionFamily === 'observe' ? null : surface.actionFamily === 'interact' ? 'self_action' : 'owner_action';
    surface.factRefs ??= [];
    surface.condition ??= null;
    if (surface.interactionSurface === 'self_action') surface.accessClass = 'ordinary_self_action';
  }
  const window = createPendingIntentWindow(context.source);
  const bindings = { ...structuredClone(f.bindings), schemaVersion: 'gma.scene-pending-intent-bindings/4',
    requirementRoles: { schemaVersion: READ_EFFECT_CONTRACTS.classification, classificationId: 'roles:fixture',
      windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint,
      nodes: window.nodes.map((node: any) => ({ nodeRef: node.nodeRef, roles: node.requirements.map((row: any) => ({
        requirementRef: row.requirementId, role: 'read', resolution: null, instructionEvidence: node.instructionEvidence[0],
      })) })),
    } };
  const policyFingerprint = pendingScenePolicyFingerprint('investigative', 'read_effects');
  const assessment = () => ({ ...f.assessment(), schemaVersion: 'gma.scene-readiness-assessment/5',
    ...scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint),
    requirementRoleReviews: bindings.requirementRoles.nodes.flatMap((node: Record<string, any>) => node.roles.map((role: Record<string, any>) => ({
      requirementRef: role.requirementRef, verdict: 'supported', rationale: 'This is existing identity or sensory information, not an attempted effect.',
      evidenceRefs: [role.requirementRef],
    }))),
  });
  return { f, context, bindings, policyFingerprint, assessment };
}

/** Owner-bound synthetic self-action isolates explicit effect feasibility from
 * the separate blind-browser semantic quality gate. */
function explicitEffectFixture(exactText = 'I raise my hand.') {
  const f = fixture(), source = f.context.source;
  source.instruction.exactText = exactText;
  const bytes = Buffer.byteLength(exactText);
  source.instruction.instructionFingerprint = freeformTextDigest(source.instruction.exactText);
  source.program.schemaVersion = READ_EFFECT_CONTRACTS.program;
  source.program.instructionFingerprint = source.instruction.instructionFingerprint;
  source.program.planner.policyVersion = READ_EFFECT_CONTRACTS.compiler;
  const effect = { effectId: 'effect:raise-hand', attempt: 'Raise my hand', resolution: 'narrative_self_action',
    evidenceSpans: [{ start: 0, end: bytes, quote: source.instruction.exactText }] };
  source.program.nodes = [{ ...source.program.nodes.find((node: Record<string, unknown>) => node.nodeId === 'cover'),
    evidenceSpans: [{ start: 0, end: bytes }], requestedEffects: [effect] }];
  source.cursor.completedNodeRefs = []; source.cursor.readyNodeRefs = ['cover']; source.cursor.remainingNodeRefs = [];
  source.receipts = [];
  f.context.qualifiedObservers = []; f.context.confirmedRelocations = [];
  const { coverageRef: _oldRef, ...coverageBody } = f.context.instructionCoverage;
  const body = { ...coverageBody, instructionFingerprint: source.instruction.instructionFingerprint,
    rootInstructionFingerprint: source.instruction.instructionFingerprint,
    currentInstructionRange: { start: 0, end: bytes }, prefixRange: { start: 0, end: bytes }, deferredTailRange: { start: bytes, end: bytes } };
  f.context.instructionCoverage = { ...body, coverageRef: `instruction-coverage:${freeformJsonDigest(body).slice(0, 40)}` };
  const window = createPendingIntentWindow(source), slots = pendingIntentBindingSlots(source);
  f.bindings.windowId = window.windowId; f.bindings.windowFingerprint = window.windowFingerprint;
  f.bindings.requirementRoles = { ...f.bindings.requirementRoles, windowFingerprint: window.windowFingerprint,
    programFingerprint: window.programFingerprint, nodes: window.nodes.map((node: Record<string, any>) => ({ nodeRef: node.nodeRef,
      roles: node.requirements.map((row: Record<string, any>) => ({ requirementRef: row.requirementId,
        role: 'read', resolution: null, instructionEvidence: node.instructionEvidence[0] })) })) };
  const bound = f.bindings.nodes.find((row) => row.nodeRef === 'cover')!;
  bound.coverage = slots[0].coverage.map((slot: Record<string, string>) => ({ slotId: slot.slotId, coverageEntryRef: 'coverage:cover' }));
  bound.instructionEvidence = window.nodes[0].instructionEvidence[0];
  f.bindings.nodes = [bound];
  return { ...f, slots, effect };
}

function remoteViewerFixture(recipientRef = 'actor:player', targetRole = 'recipient') {
  const f = fixture(), oldAssessment = f.assessment(), source = f.context.source;
  const watch = source.program.nodes.find((node: { nodeId: string }) => node.nodeId === 'watch');
  watch.dataRequirements.unshift({ dimension: 'who', kind: 'scene_presence', targetRole, targetRef: recipientRef });
  const window = createPendingIntentWindow(source), slots = pendingIntentBindingSlots(source);
  const evidence = f.context.qualifiedObservers[0];
  evidence.windowRef = window.windowId; evidence.windowFingerprint = window.windowFingerprint;
  const link: ActorMechanicsLink = { schemaVersion: 'gmc.actor-mechanics-link/1', linkRef: evidence.actorLinkRef,
    campaignRef: window.campaignId, actorRef: evidence.observerRef, actorRecordRef: 'frame:familiar', actorRecordRevision: 1,
    subjectKind: 'familiar', parentActorRef: 'actor:player', mechanicsSubjectRef: 'vcs:familiar:one', vcsCharacterRef: 'vcs:character:one',
    vcsOwnerRef: evidence.vcsOwnerRef, vcsRevision: evidence.vcsSubjectRevision, vcsCharacterRevision: evidence.vcsCharacterRevision,
    provenanceReceiptRefs: [...evidence.ownerReceiptRefs], humanDecisionRef: 'decision:owner', state: 'active' };
  const context = { ...f.context, observerIdentityLinks: [link] };
  Object.assign(f.bindings, { windowId: window.windowId, windowFingerprint: window.windowFingerprint });
  const row = f.bindings.nodes.find((entry) => entry.nodeRef === 'watch')!, slot = slots.find((entry) => entry.nodeRef === 'watch')!;
  const recipient = slot.references.find((entry: { role: string; requirementId?: string }) => entry.role === targetRole
    && entry.requirementId === window.nodes.find((node: any) => node.nodeRef === 'watch')!.requirements[0].requirementId);
  row.references.push({ slotId: recipient.slotId, selectedRef: recipientRef });
  row.coverage = slot.coverage.map((entry: { slotId: string }) => ({ slotId: entry.slotId, coverageEntryRef: 'coverage:remote' }));
  Object.assign(f.bindings.requirementRoles, { windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint,
    nodes: window.nodes.map((node: { nodeRef: string; requirements: { requirementId: string }[]; instructionEvidence: unknown[] }) => ({ nodeRef: node.nodeRef, roles: node.requirements.map((requirement) => ({
      requirementRef: requirement.requirementId, role: 'read', resolution: null, instructionEvidence: node.instructionEvidence[0] })) })) });
  const assessment = () => ({ ...oldAssessment, ...scenePendingIntentExaminationIdentity(f.bindings, context, f.policyFingerprint),
    bindingReviews: f.bindings.nodes.map((entry) => ({ nodeRef: entry.nodeRef, bindingRowFingerprint: freeformJsonDigest(entry),
      verdict: 'supported', mechanicsState: 'not_resolved', rationale: 'The exact controller receives the separately qualified familiar view.', evidenceRefs: [entry.nodeRef] })),
    requirementRoleReviews: f.bindings.requirementRoles.nodes.flatMap((node: { roles: { requirementRef: string }[] }) => node.roles.map((role) => ({ requirementRef: role.requirementRef,
      verdict: 'supported', rationale: 'Existing controller identity is distinct from the sensed target.', evidenceRefs: [role.requirementRef] }))) });
  return { ...f, context, link, row, recipient, assessment };
}

describe('independent read/effect preparation and immutable application', () => {
  it.each(['recipient', 'actor'])('derives only the original %s receiving-controller slot from exact owner relationships', (targetRole) => {
    const f = remoteViewerFixture('actor:player', targetRole), original = structuredClone(f.bindings);
    const slots = preparedReceiverSlots(f.context), witnesses = remoteReceiverWitnesses(f.bindings, f.context);
    expect(slots).toHaveLength(1); expect(witnesses).toHaveLength(1);
    expect(witnesses[0]).toMatchObject({ nodeRef: 'watch', recipientRef: 'actor:player', linkRef: f.link.linkRef,
      evidenceRef: f.context.qualifiedObservers[0].evidenceRef, referenceSlotId: f.recipient.slotId });
    expect(f.bindings).toEqual(original);
    f.link.parentActorRef = 'actor:other';
    if (targetRole === 'recipient') expect(() => remoteReceiverWitnesses(f.bindings, f.context)).toThrow();
    else expect(preparedReceiverSlots(f.context)).toEqual([]);
  });
  it.each(['scene_presence', 'canonical_reference'])('checks present %s identity separately from the requested destination, without weakening destination or effect closure', (kind) => {
    const f = explicitEffectFixture('I enter the tunnel.'), source = f.context.source, node = source.program.nodes[0];
    node.kind = 'move';
    node.requestedEffects[0].attempt = source.instruction.exactText;
    node.requestedEffects[0].resolution = 'owner_resolution';
    node.dataRequirements = [
      { kind: 'scene_presence', dimension: 'who', targetRole: 'actor', targetRef: 'actor:player' },
      { kind, dimension: kind === 'scene_presence' ? 'who' : 'what', targetRole: 'subject', targetRef: 'actor:familiar' },
      { kind: 'destination_location', dimension: 'where', targetRole: 'destination', targetRef: null },
    ];
    node.semanticLocationBindings = { schemaVersion: 'gma.semantic-location-bindings/1',
      bindings: [{ role: 'destination', description: 'The tunnel', authorityRef: null }] };
    const window = createPendingIntentWindow(source), slot = pendingIntentBindingSlots(source)[0];
    Object.assign(f.bindings, { windowId: window.windowId, windowFingerprint: window.windowFingerprint });
    Object.assign(f.bindings.requirementRoles, { windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint,
      nodes: [{ nodeRef: node.nodeId, roles: window.nodes[0].requirements.map((row: Record<string, any>) => ({
        requirementRef: row.requirementId, role: 'read', resolution: null, instructionEvidence: window.nodes[0].instructionEvidence[0] })) }] });
    const row = f.bindings.nodes[0];
    row.references = slot.references.map((ref: Record<string, any>) => ({ slotId: ref.slotId,
      selectedRef: ref.role === 'actor' ? 'actor:player' : ref.role === 'subject' ? 'actor:familiar' : 'element:tunnel' }));
    row.coverage = slot.coverage.map((ref: Record<string, any>, index: number) => ({ slotId: ref.slotId, coverageEntryRef: ['coverage:present', 'coverage:subject', 'coverage:route', 'coverage:entry'][index] }));
    f.context.proposal.sceneStoryDesign.affordances = [
      { coverageEntryId: 'coverage:present', affordanceId: 'surface:present', zoneRef: 'zone:entrance', targetRef: 'actor:player',
        actionFamily: 'move', accessClass: null, thresholdRef: null, capabilityClass: null, factRefs: ['fact:present'], condition: null, surfaceKind: 'information', interactionSurface: null },
      { coverageEntryId: 'coverage:subject', affordanceId: 'surface:subject', zoneRef: 'zone:entrance', targetRef: 'actor:familiar',
        actionFamily: 'move', accessClass: null, thresholdRef: null, capabilityClass: null, factRefs: ['fact:subject'], condition: null, surfaceKind: 'information', interactionSurface: null },
      { coverageEntryId: 'coverage:route', affordanceId: 'surface:route', zoneRef: 'zone:interior', targetRef: 'element:tunnel',
        actionFamily: 'move', accessClass: null, thresholdRef: null, capabilityClass: null, factRefs: ['fact:route'], condition: null, surfaceKind: 'information', interactionSurface: null },
      { coverageEntryId: 'coverage:entry', affordanceId: 'surface:entry', zoneRef: 'zone:interior', targetRef: 'element:tunnel',
        actionFamily: 'move', accessClass: null, thresholdRef: null, capabilityClass: null, factRefs: [], condition: null, surfaceKind: 'action_surface', interactionSurface: 'owner_action' },
    ];
    const before = structuredClone({ source, bindings: f.bindings });
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect({ source, bindings: f.bindings }).toEqual(before);
    for (const index of [1, 2, 3]) {
      const changed = structuredClone(f.context);
      changed.proposal.sceneStoryDesign.affordances[index].targetRef = 'actor:player';
      expect(scenePendingIntentBindingIssues(f.bindings, changed)).toContain('/nodes/cover/coverage');
    }
    const changed = structuredClone(f.bindings);
    changed.nodes[0].references.find((ref: { slotId: string }) => ref.slotId === slot.references.find((ref: Record<string, any>) => ref.locationFingerprint)!.slotId)!.selectedRef = 'actor:player';
    expect(scenePendingIntentBindingIssues(changed, f.context)).toContain('/nodes/cover/coverage');
  });
  it.each(['actor:player', 'frame:player'])('closes the remote receiver %s through owner identity without changing the sensory target or original program', (ref) => {
    const f = remoteViewerFixture(ref), before = structuredClone({ context: f.context, bindings: f.bindings });
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
    expect(record.window.nodes.find((node: { nodeRef: string }) => node.nodeRef === 'watch').requirements[0].value.targetRef).toBe(ref);
    expect(f.context.proposal.sceneStoryDesign.affordances.find((surface: { coverageEntryId: string }) => surface.coverageEntryId === 'coverage:remote').targetRef).toBe('element:tunnel');
    expect({ context: f.context, bindings: f.bindings }).toEqual(before);
  });
  it('preserves the authenticated relationship on the new owner adapter only', () => {
    const f = remoteViewerFixture(), owner = { schemaVersion: 'gmc.scene-pending-intent-context/4', source: f.context.source,
      ownerReadSet: f.context.ownerReadSet, observationSeeds: [], qualifiedObservers: f.context.qualifiedObservers,
      instructionCoverage: f.context.instructionCoverage, confirmedRelocations: f.context.confirmedRelocations,
      observerIdentityLinks: [f.link] };
    expect(scenePendingBindingContextFromOwner(owner, f.context.operationId, f.context.proposal).observerIdentityLinks).toEqual([f.link]);
    expect(scenePendingBindingContextFromOwner({ ...owner, schemaVersion: 'gmc.scene-pending-intent-context/3' }, f.context.operationId, f.context.proposal).observerIdentityLinks).toBeUndefined();
  });
  it('keeps immutable identity provenance usable with freshly qualified current capability heads', () => {
    const f = remoteViewerFixture(), originalLink = structuredClone(f.link);
    // A later form/character update requires new owner qualification, not a
    // rewrite of the human's stable actor/subject identity decision (ADR 016).
    f.context.qualifiedObservers[0].vcsSubjectRevision = 'e'.repeat(64);
    f.context.qualifiedObservers[0].vcsCharacterRevision = 'f'.repeat(64);
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(f.link).toEqual(originalLink);
  });
  it('keeps a confirmed current viewpoint separate from both its recipient and sensory target', () => {
    const f = remoteViewerFixture();
    const evidence: PendingObserverEvidence = f.context.qualifiedObservers[0];
    evidence.viewpointCondition = { kind: 'current_access', accessRef: 'access:confirmed' };
    Object.assign(f.row.observations[0], { viewpointCondition: structuredClone(evidence.viewpointCondition) });
    f.context.proposal.sceneStoryDesign.affordances.find((surface: { coverageEntryId: string }) => surface.coverageEntryId === 'coverage:remote').accessClass = 'access:confirmed';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(f.row.references.find((entry: { slotId: string }) => entry.slotId === f.recipient.slotId).selectedRef).toBe('actor:player');
    expect(f.row.observations).toHaveLength(1);
  });
  it('still requires an exact social recipient, independently of the observation branch', () => {
    const f = explicitEffectFixture(), node = f.context.source.program.nodes[0];
    node.kind = 'social'; node.requestedEffects = [];
    node.dataRequirements.push({ dimension: 'who', kind: 'scene_presence', targetRole: 'recipient', targetRef: 'actor:player' });
    const window = createPendingIntentWindow(f.context.source), slot = pendingIntentBindingSlots(f.context.source)[0];
    Object.assign(f.bindings, { windowId: window.windowId, windowFingerprint: window.windowFingerprint });
    Object.assign(f.bindings.requirementRoles, { windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint,
      nodes: [{ nodeRef: node.nodeId, roles: window.nodes[0].requirements.map((entry: { requirementId: string }) => ({
        requirementRef: entry.requirementId, role: 'read', resolution: null, instructionEvidence: window.nodes[0].instructionEvidence[0] })) }] });
    f.bindings.nodes[0].references = slot.references.map((entry: { slotId: string; originalRef: string }) => ({ slotId: entry.slotId, selectedRef: entry.originalRef }));
    f.bindings.nodes[0].coverage = slot.coverage.map((entry: { slotId: string }) => ({ slotId: entry.slotId, coverageEntryRef: 'coverage:cover' }));
    const surface = f.context.proposal.sceneStoryDesign.affordances.find((entry: { coverageEntryId: string }) => entry.coverageEntryId === 'coverage:cover');
    surface.actionFamily = 'social'; surface.interactionSurface = 'owner_action';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    surface.targetRef = 'actor:familiar';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toContain('/nodes/cover/coverage');
  });
  it.each(['missing', 'retired', 'foreign', 'other_parent', 'other_actor', 'other_link', 'malformed_subject_head', 'malformed_character_head', 'other_subject', 'other_owner', 'duplicate'])('rejects %s remote viewer identity evidence', (kind) => {
    const f = remoteViewerFixture();
    if (kind === 'missing') f.context.observerIdentityLinks = [];
    if (kind === 'retired') f.link.state = 'retired';
    if (kind === 'foreign') f.link.campaignRef = 'campaign:foreign';
    if (kind === 'other_parent') f.link.parentActorRef = 'actor:other';
    if (kind === 'other_actor') f.link.actorRef = 'actor:other';
    if (kind === 'other_link') f.link.linkRef = 'link:other';
    if (kind === 'malformed_subject_head') f.link.vcsRevision = '';
    if (kind === 'malformed_character_head') f.link.vcsCharacterRevision = '';
    if (kind === 'other_subject') {
      f.link.mechanicsSubjectRef = 'vcs:familiar:other'; f.link.vcsCharacterRef = 'vcs:character:other';
    }
    if (kind === 'other_owner') f.link.vcsOwnerRef = 'owner:other';
    if (kind === 'duplicate') f.context.observerIdentityLinks.push(structuredClone(f.link));
    expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
  });
  it.each(['group', 'method', 'recipient', 'sensory_target'])('does not weaken exact %s closure', (kind) => {
    const f = remoteViewerFixture();
    if (kind === 'group') f.row.observations[0].groupId = 'group:foreign';
    if (kind === 'method') f.row.references.find((entry: { selectedRef: string }) => entry.selectedRef === f.context.qualifiedObservers[0].methodRef)!.selectedRef = 'method:foreign';
    if (kind === 'recipient') f.row.references.find((entry: { slotId: string }) => entry.slotId === f.recipient.slotId)!.selectedRef = 'actor:familiar';
    if (kind === 'sensory_target') f.context.proposal.sceneStoryDesign.affordances.find((surface: { coverageEntryId: string }) => surface.coverageEntryId === 'coverage:remote').targetRef = 'actor:player';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
  });
  it('keeps historical/social target closure and repairs only the named failed row', () => {
    const f = remoteViewerFixture(), before = structuredClone(f.bindings);
    const replacement = structuredClone(f.row);
    f.row.references.find((entry: { slotId: string }) => entry.slotId === f.recipient.slotId)!.selectedRef = 'actor:familiar';
    const repaired = mergeScenePendingIntentBindingRepair(f.bindings, [replacement], ['watch'], f.context);
    expect(repaired).toEqual(before);
    const { requirementRoles: _roles, ...historical } = before;
    const legacy = { ...historical, schemaVersion: 'gma.scene-pending-intent-bindings/1' };
    expect(legacyIssues(legacy, f.context)).toContain('/nodes/watch/coverage');
    // A social action never receives the observation-only role witness.
    f.context.source.program.nodes.find((node: { nodeId: string }) => node.nodeId === 'watch').kind = 'social';
    expect(scenePendingIntentBindingIssues(before, f.context).length).toBeGreaterThan(0);
  });
  it('teaches the exact recipient distinction in both original versioned prompts', () => {
    for (const operation of ['story.scene-reality.build.read-effects', 'story.scene-readiness.examine.read-effects']) {
      const definition = getOperationDefinition(operation);
      expect(definition.prompt.version).toMatch(/policy\/11$/);
      expect(definition.prompt.systemInstruction).toContain('not the sensory target or a second observer');
      expect(definition.prompt.systemInstruction).toContain('Social recipients still match their social target');
      expect(definition.prompt.systemInstruction).toContain('exact parentActorRef');
      expect(definition.prompt.systemInstruction).toContain('immutable human-decision provenance, not current capability heads');
      expect(definition.prompt.systemInstruction).toContain('Stale qualification still blocks execution');
    }
  });
  it('uses the same exact instruction, classification and slot citation catalog at every /5 review layer', () => {
    const f = fixture(), original = structuredClone(f.context), assessment = f.assessment();
    const refs = [f.context.source.instruction.instructionRef, f.context.instructionCoverage.coverageRef,
      f.bindings.requirementRoles.classificationId, pendingIntentBindingSlots(f.context.source)[0].references[0].slotId];
    expect(readEffectAssessmentEvidenceRefs(f.bindings, f.context)).toEqual(expect.arrayContaining(refs));
    assessment.evidenceRefs.push(...refs);
    assessment.bindingReviews[0].evidenceRefs.push(...refs);
    assessment.requirementRoleReviews[0].evidenceRefs.push(...refs);
    expect(scenePendingIntentExaminationIssues(assessment, f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    expect(f.context).toEqual(original);
    for (const section of ['evidenceRefs', 'bindingReviews', 'requirementRoleReviews'] as const) {
      const foreign = structuredClone(assessment);
      if (section === 'evidenceRefs') foreign.evidenceRefs.push('instruction:foreign');
      else foreign[section][0].evidenceRefs.push('instruction:foreign');
      expect(scenePendingIntentExaminationIssues(foreign, f.bindings, f.context, f.policyFingerprint).length).toBeGreaterThan(0);
    }
    expect(getOperationDefinition('story.scene-readiness.examine.read-effects').prompt.systemInstruction).toContain('supplied assessmentEvidenceRefs catalog');
  });
  it('requires a separate feasibility slot for each explicit effect, not a read-fact substitution', () => {
    const f = explicitEffectFixture();
    expect(f.slots[0].coverage.filter((slot: Record<string, unknown>) => slot.effectId === f.effect.effectId)).toHaveLength(1);
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    f.bindings.nodes[0].coverage.pop();
    expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
  });
  it('rejects information, wrong actor, wrong zone and false owner categories for explicit self-effects', () => {
    for (const patch of [
      { surfaceKind: 'information', factRefs: ['fact:future'] }, { targetRef: 'actor:familiar' },
      { zoneRef: 'zone:interior' }, { interactionSurface: 'owner_action' },
    ]) {
      const f = explicitEffectFixture();
      Object.assign(f.context.proposal.sceneStoryDesign.affordances.find((surface: Record<string, unknown>) => surface.coverageEntryId === 'coverage:cover'), patch);
      expect(scenePendingIntentBindingIssues(f.bindings, f.context).length).toBeGreaterThan(0);
    }
  });
  it('cannot grant an owner-resolved effect the narrative-only self-action surface', () => {
    const f = explicitEffectFixture(); f.effect.resolution = 'owner_resolution';
    const window = createPendingIntentWindow(f.context.source);
    f.bindings.windowId = window.windowId; f.bindings.windowFingerprint = window.windowFingerprint;
    f.bindings.requirementRoles.windowFingerprint = window.windowFingerprint;
    f.bindings.requirementRoles.programFingerprint = window.programFingerprint;
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toContain('/nodes/cover/effectSurface');
    f.context.proposal.sceneStoryDesign.affordances.find((surface: Record<string, unknown>) => surface.coverageEntryId === 'coverage:cover').interactionSurface = 'owner_action';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
  });
  it('requires an explicit complete semantic review rather than just classification metadata', () => {
    const f = fixture();
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toEqual([]);
    expect(scenePendingIntentExaminationIssues(f.assessment(), f.bindings, f.context, f.policyFingerprint)).toEqual([]);
    const missing = f.assessment(); missing.requirementRoleReviews.pop();
    expect(scenePendingIntentExaminationIssues(missing, f.bindings, f.context, f.policyFingerprint)).toContain('/requirementRoleReviews');
    const unsupported = f.assessment(); unsupported.requirementRoleReviews[0].verdict = 'unsupported';
    expect(scenePendingIntentExaminationIssues(unsupported, f.bindings, f.context, f.policyFingerprint)).toContain('/verdict');
  });
  it('cannot use a structural surface to replace an information answer or publish future truth', () => {
    const f = fixture();
    f.context.proposal.sceneStoryDesign.affordances.find((row: Record<string, any>) => row.actionFamily === 'observe').surfaceKind = 'action_surface';
    expect(scenePendingIntentBindingIssues(f.bindings, f.context)).toContain('/nodes/watch/readSurface');
  });
  it('projects a new explicit version only after an exact independently examined application; original receipts and program survive', () => {
    const f = fixture(), before = structuredClone(f.context.source);
    const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
    expect(record.schemaVersion).toBe('gmc.scene-pending-intent-binding-record/4');
    const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: f.context.source.program.programId,
      priorCursorRevision: 3, resultingCursorRevision: 4, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 4, vcsCharacterRevision: 0 }, receiptId: 'rebase:new' };
    const receipt = createIntentBindingReceipt(record, { bundleId: 'bundle:new', revision: 2, sceneKitRef: f.bindings.sceneKitRef }, rebase);
    expect(receipt.schemaVersion).toBe('gma.action-intent-binding-receipt/4');
    expect(receipt.requirementRoleApplication).toEqual({ schemaVersion: READ_EFFECT_CONTRACTS.application,
      classificationFingerprint: freeformJsonDigest(f.bindings.requirementRoles), assessmentFingerprint: record.assessmentFingerprint,
      recordFingerprint: record.recordFingerprint });
    const projected = projectAppliedIntentBindings(f.context.source.instruction, f.context.source.program, [{ record, receipt }]);
    expect(projected.schemaVersion).toBe(READ_EFFECT_CONTRACTS.program);
    expect(projected.planner.policyVersion).toBe(READ_EFFECT_CONTRACTS.compiler);
    expect(projected.nodes[0]).toEqual({ ...before.program.nodes[0], requestedEffects: [] });
    expect(f.context.source).toEqual(before);
    const changed = structuredClone(receipt); changed.requirementRoleApplication.classificationFingerprint = 'a'.repeat(64);
    expect(() => projectAppliedIntentBindings(f.context.source.instruction, f.context.source.program, [{ record, receipt: changed }])).toThrow();
  });
  it('registers the original role policy and closed independent-review schema without widening old operations', () => {
    const build = getOperationDefinition('story.scene-reality.build.read-effects');
    const examine = getOperationDefinition('story.scene-readiness.examine.read-effects');
    expect(build.prompt.systemInstruction).toContain('Partition every exact original pending requirement once');
    expect(build.prompt.systemInstruction).toContain('mechanicsPreparationContext');
    expect(examine.prompt.systemInstruction).toContain('still-unresolved check');
    expect(pendingScenePolicyFingerprint('investigative', 'read_effects')).toBe(pendingScenePolicyFingerprint('investigative', 'read_effects', 9));
    expect(pendingScenePolicyFingerprint('investigative', 'read_effects', 10)).not.toBe(pendingScenePolicyFingerprint('investigative', 'read_effects', 9));
    expect(examine.prompt.systemInstruction).toContain('not merely fingerprint agreement');
    expect(build.provider.maxAttempts).toBe(1);
    const f = fixture();
    expect(validateOperationOutput(examine.id, f.assessment()).valid).toBe(true);
    expect(validateOperationOutput('story.scene-readiness.examine.continuation', f.assessment()).valid).toBe(false);
  });
});
