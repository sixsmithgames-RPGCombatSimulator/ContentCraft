import { freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { pendingRequirementRoleIssues } from './pendingRequirementRoles.js';
import { readEffectSurfaceIssues } from './readEffectSurfaces.js';
import { qualifiedPendingReferenceSlots, historicalTypedPendingBinding } from './typedPendingReferenceProjection.js';
import { TYPED_REFERENCE_AUTHORITY_BUNDLE as TYPED } from './typedReferenceBindings.js';
import { actorMechanicsLinkIssues, type ActorMechanicsLink } from './actorMechanicsLink.js';
import { scenePendingIntentBindingIssues as historicalBindingIssues, scenePendingIntentExaminationIdentity as historicalIdentity,
  scenePendingIntentExaminationIssues as historicalExaminationIssues, pendingIntentBindingSlots,
  scenePendingBindingContextFromOwner as historicalContext, qualificationReviewEvidenceRefs as historicalReviewEvidenceRefs,
  mergeScenePendingIntentBindingRepair as historicalRepair, futureSensoryFactRefs as historicalFutureSensoryFacts } from './scenePendingIntentQualified.js';
export * from './scenePendingIntentQualified.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => {
  if (!Array.isArray(value) || !value.every(object)) throw new Error('Read/effect records must be complete objects.');
  return value;
};
const record = (value: unknown): Row => { if (!object(value)) throw new Error('A complete read/effect record is required.'); return value; };
const referenceText = (value: unknown): string => { if (typeof value !== 'string') throw new Error('An exact read/effect reference is required.'); return value; };
const identityLink = (value: unknown): ActorMechanicsLink => {
  if (actorMechanicsLinkIssues(value).length) throw new Error('A valid owner identity link is required.');
  // The closed canonical validator above checks every ActorMechanicsLink field.
  return value as ActorMechanicsLink;
};
type Context = Parameters<typeof historicalBindingIssues>[1];
export const READ_EFFECT_BINDINGS_VERSION = 'gma.scene-pending-intent-bindings/4';
export const READ_EFFECT_BINDING_POLICY_VERSION = 'gma.scene-pending-intent-binding-policy/7';
export const READ_EFFECT_EXAMINER_POLICY_VERSION = 'gma.scene-pending-intent-examiner-policy/7';
const closed = (value: unknown, keys: string[]): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const requireMatch = (value: unknown): void => { if (!value) throw new Error('The read/effect preparation does not match the original pending window.'); };

/** Remove only registered /4 fields for structural reuse; never mutate a reply. */
export function historicalReadEffectBinding(value: Row): Row {
  const { requirementRoles: _roles, ...original } = value;
  return { ...original, schemaVersion: 'gma.scene-pending-intent-bindings/3' };
}

/** Authenticated owner context uses the same exact source, heads and coverage. */
export function scenePendingBindingContextFromOwner(owner: Row, operationId: string, proposal: Row): Context {
  const typed = owner.schemaVersion === TYPED.context;
  const context = historicalContext(typed || owner.schemaVersion === 'gmc.scene-pending-intent-context/4'
    ? { ...owner, schemaVersion: 'gmc.scene-pending-intent-context/3' } : owner, operationId, proposal);
  return typed || owner.schemaVersion === 'gmc.scene-pending-intent-context/4'
    ? { ...context, observerIdentityLinks: structuredClone(rows(owner.observerIdentityLinks ?? []).map(identityLink)),
      ...(typed ? { pendingReferenceQualification: structuredClone(record(owner.referenceQualification)),
        qualifiedBindingSlots: qualifiedPendingReferenceSlots(context.source, record(owner.referenceQualification)) } : {}) } : context;
}

function typedProjection(binding: Row, context: Context): { binding: Row; context: Context } {
  requireMatch(binding.schemaVersion === TYPED.pendingBindings && context.pendingReferenceQualification
    && binding.referenceQualificationFingerprint === context.pendingReferenceQualification.fingerprint);
  const slots = qualifiedPendingReferenceSlots(context.source, context.pendingReferenceQualification!);
  const projected = historicalTypedPendingBinding(binding, slots);
  // One original local symbol must not acquire competing selected world IDs.
  const selected = new Map<string, unknown>();
  for (const node of rows(projected.nodes)) for (const ref of rows(node.references)) {
    const symbol = slots.find((slot: any) => slot.nodeRef === node.nodeRef)?.references.find((slot: any) => slot.slotId === ref.slotId)?.symbolRef;
    if (symbol) { requireMatch(!selected.has(symbol) || selected.get(symbol) === ref.selectedRef); selected.set(symbol, ref.selectedRef); }
  }
  return { binding: projected, context: { ...context, qualifiedBindingSlots: slots } };
}

/** A receiving controller is not the sensed subject. Derive the narrow closure
 * witness from the exact immutable owner link, never model rationale or names.
 * Existing qualification checks still gate method, origin and future access. */
function remoteViewerContext(bindings: Row, context: Context): Context {
  const witnesses: NonNullable<Context['remoteViewerCoverage']>[number][] = [];
  const window = createPendingIntentWindow(context.source);
  for (const slot of pendingIntentBindingSlots(context.source)) {
    const row = rows(bindings.nodes).find((entry) => entry.nodeRef === slot.nodeRef);
    if (row?.disposition !== 'bound') continue;
    const original = window.nodes.find((entry: { nodeRef: string }) => entry.nodeRef === slot.nodeRef)!;
    if ((original.node.actionFamily ?? original.node.kind) !== 'observe') continue;
    for (const reference of slot.references.filter((entry: Row) => entry.role === 'recipient')) {
      const requirement = original.requirements.find((entry: { requirementId: string }) => entry.requirementId === reference.requirementId)?.value;
      requireMatch(requirement?.kind === 'scene_presence' && requirement.dimension === 'who' && slot.observationGroups.length);
      const recipientRef = rows(row.references).find((entry) => entry.slotId === reference.slotId)?.selectedRef;
      const frames = context.proposal.actorFrames.filter((frame: Row) => [frame.actorRef, frame.actorFrameId].includes(recipientRef));
      requireMatch(frames.length === 1);
      for (const group of slot.observationGroups) {
        const selection = rows(row.observations).find((entry) => entry.groupId === group.groupId);
        const qualified = context.qualifiedObservers?.filter((entry) => entry.evidenceRef === selection?.ownerEvidenceRef
          && entry.nodeRef === slot.nodeRef && entry.groupId === group.groupId);
        requireMatch(group.observerKind === 'familiar' && qualified?.length === 1);
        const evidence = qualified![0];
        // Link heads describe the original identity decision. Fresh capability
        // heads are independently checked by qualification and execution; a
        // later character/form revision must not invalidate a stable pairing.
        const links = context.observerIdentityLinks?.filter((link) => !actorMechanicsLinkIssues(link).length
          && link.state === 'active' && link.campaignRef === window.campaignId && link.linkRef === evidence.actorLinkRef
          && link.subjectKind === 'familiar' && link.actorRef === evidence.observerRef
          && link.parentActorRef === frames[0].actorRef && link.vcsOwnerRef === evidence.vcsOwnerRef
          && link.mechanicsSubjectRef === evidence.mechanicsSubjectRef);
        requireMatch(links?.length === 1);
      }
      // Preserve original slot identity; the shape checks above reject a missing
      // selection rather than manufacturing a fallback receiver.
      witnesses.push({ nodeRef: slot.nodeRef, slotId: referenceText(reference.slotId), recipientRef: referenceText(recipientRef) });
    }
  }
  return { ...context, remoteViewerCoverage: witnesses };
}

/** Versioned semantic projection does not treat prepared possibilities as truth. */
export function scenePendingIntentBindingIssues(value: unknown, context: Context): string[] {
  if ((value as Row)?.schemaVersion === TYPED.pendingBindings) {
    try {
      requireMatch(closed(value, ['schemaVersion', 'bindingId', 'operationId', 'campaignId', 'windowId', 'windowFingerprint', 'sceneKitRef', 'nodes', 'requirementRoles', 'referenceQualificationFingerprint']));
      const projected = typedProjection(value as Row, context);
      return scenePendingIntentBindingIssues(projected.binding, projected.context);
    } catch { return ['/typedReferences']; }
  }
  if ((value as Row)?.schemaVersion !== READ_EFFECT_BINDINGS_VERSION) return historicalBindingIssues(value, context);
  try {
    if (!closed(value, ['schemaVersion', 'bindingId', 'operationId', 'campaignId', 'windowId', 'windowFingerprint', 'sceneKitRef', 'nodes', 'requirementRoles'])) return ['/identity'];
    const classification = record(value.requirementRoles);
    const issues = [...pendingRequirementRoleIssues(classification, context.source),
      ...historicalBindingIssues(historicalReadEffectBinding(value), remoteViewerContext(value, context))];
    requireMatch(context.proposal.sceneStoryDesign?.schemaVersion === 'gmc.scene-story-design/4');
    for (const [index, surface] of context.proposal.sceneStoryDesign.affordances.entries()) {
      issues.push(...readEffectSurfaceIssues(surface, context.proposal.actorFrames).map((path) => `/sceneStoryDesign/affordances/${index}${path}`));
    }
    const slots = context.qualifiedBindingSlots ?? pendingIntentBindingSlots(context.source), window = createPendingIntentWindow(context.source);
    for (const node of rows(classification.nodes)) {
      const binding = rows(value.nodes).find((row) => row.nodeRef === node.nodeRef);
      if (binding?.disposition !== 'bound') continue;
      const slot = slots.find((row: Row) => row.nodeRef === node.nodeRef)!;
      const original = window.nodes.find((row: Row) => row.nodeRef === node.nodeRef)!;
      for (const effect of original.node.requestedEffects ?? []) {
        for (const effectSlot of slot.coverage.filter((row: Row) => row.effectId === effect.effectId)) {
        const selected = rows(binding.coverage).find((row) => row.slotId === effectSlot?.slotId);
        const surface = context.proposal.sceneStoryDesign.affordances.find((row: Row) => row.coverageEntryId === selected?.coverageEntryRef);
        if (!effectSlot || surface?.surfaceKind !== 'action_surface' || surface.factRefs?.length
          || surface.interactionSurface !== (effect.resolution === 'narrative_self_action' ? 'self_action' : 'owner_action')) issues.push(`/nodes/${node.nodeRef}/effectSurface`);
        if (effect.resolution === 'narrative_self_action') {
          const actors = slot.references.filter((row: Row) => row.role === 'actor').map((row: Row) => rows(binding.references).find((r) => r.slotId === row.slotId)?.selectedRef);
          const frame = context.proposal.actorFrames.find((row: Row) => actors.includes(row.actorRef) || actors.includes(row.actorFrameId));
          if (!frame || ![frame.actorRef, frame.actorFrameId].includes(surface?.targetRef) || surface?.zoneRef !== frame.zoneRef) issues.push(`/nodes/${node.nodeRef}/selfSurface`);
        }
        }
      }
      for (const role of rows(node.roles)) {
        const coverageSlot = slot.coverage.find((row: Row) => row.requirementId === role.requirementRef);
        if (!coverageSlot) continue; // VCS-owned prerequisites have no Scene fact slot.
        const coverage = rows(binding.coverage).find((row) => row.slotId === coverageSlot.slotId);
        const surface = context.proposal.sceneStoryDesign.affordances.find((row: Row) => row.coverageEntryId === coverage?.coverageEntryRef);
        const requirement = original.requirements.find((row: Row) => row.requirementId === role.requirementRef)!.value;
        if (role.role === 'effect') {
          if (surface?.surfaceKind !== 'action_surface' || surface.factRefs?.length
            || surface.interactionSurface !== (role.resolution === 'narrative_self_action' ? 'self_action' : 'owner_action')) issues.push(`/nodes/${node.nodeRef}/effectSurface`);
          if (role.resolution === 'narrative_self_action') {
            const actors = slot.references.filter((row: Row) => row.role === 'actor').map((row: Row) => rows(binding.references).find((r) => r.slotId === row.slotId)?.selectedRef);
            const frame = context.proposal.actorFrames.find((row: Row) => actors.includes(row.actorRef) || actors.includes(row.actorFrameId));
            if (surface?.interactionSurface !== 'self_action' || !frame || ![frame.actorRef, frame.actorFrameId].includes(surface.targetRef) || surface.zoneRef !== frame.zoneRef) issues.push(`/nodes/${node.nodeRef}/selfSurface`);
          }
        } else if (['story_fact', 'observation'].includes(requirement.kind)
          && (surface?.surfaceKind !== 'information' || !surface.factRefs?.length)) issues.push(`/nodes/${node.nodeRef}/readSurface`);
      }
    }
    return [...new Set(issues)];
  } catch { return ['/readEffects']; }
}

/** Independent review fingerprints both meaning partition and prepared dossier. */
export function scenePendingIntentExaminationIdentity(bindings: Row, context: Context, policyFingerprint: string): Row {
  if (bindings.schemaVersion === TYPED.pendingBindings) {
    requireMatch(!scenePendingIntentBindingIssues(bindings, context).length);
    const p = typedProjection(bindings, context);
    return { ...scenePendingIntentExaminationIdentity(p.binding, p.context, policyFingerprint), bindingFingerprint: freeformJsonDigest(bindings),
      referenceQualificationFingerprint: bindings.referenceQualificationFingerprint,
      effectTargetFingerprint: freeformJsonDigest(context.pendingReferenceQualification!.effects),
      pendingIntentPolicyFingerprint: freeformJsonDigest({ binding: 'gma.scene-pending-intent-binding-policy/8', examiner: 'gma.scene-pending-intent-examiner-policy/8' }) };
  }
  if (bindings.schemaVersion !== READ_EFFECT_BINDINGS_VERSION) return historicalIdentity(bindings, context, policyFingerprint);
  requireMatch(!scenePendingIntentBindingIssues(bindings, context).length);
  return { ...historicalIdentity(historicalReadEffectBinding(bindings), remoteViewerContext(bindings, context), policyFingerprint),
    bindingFingerprint: freeformJsonDigest(bindings), requirementRoleFingerprint: freeformJsonDigest(bindings.requirementRoles),
    pendingIntentPolicyFingerprint: freeformJsonDigest({ binding: READ_EFFECT_BINDING_POLICY_VERSION, examiner: READ_EFFECT_EXAMINER_POLICY_VERSION }) };
}

/** Normalization for the historical structural examiner, never new acceptance. */
export function historicalReadEffectAssessment(value: Row, bindings: Row, context: Context, policyFingerprint: string): Row {
  const { requirementRoleFingerprint: _fingerprint, requirementRoleReviews: _reviews, ...original } = value;
  return { ...original, schemaVersion: 'gma.scene-readiness-assessment/4',
    ...historicalIdentity(historicalReadEffectBinding(bindings), remoteViewerContext(bindings, context), policyFingerprint) };
}

/** One closed citation vocabulary for the original /5 prompt and every review
 * layer. Exact instruction/role records are evidence, not execution authority. */
export function readEffectAssessmentEvidenceRefs(bindings: Row, context: Context): string[] {
  if (bindings.schemaVersion === TYPED.pendingBindings) {
    const p = typedProjection(bindings, context);
    return [...new Set([...readEffectAssessmentEvidenceRefs(p.binding, p.context), context.pendingReferenceQualification!.qualificationRef,
      ...p.context.qualifiedBindingSlots!.flatMap((node: any) => node.coverage.map((slot: any) => slot.slotId))])].sort();
  }
  const window = createPendingIntentWindow(context.source);
  return [...new Set<string>([
    ...historicalReviewEvidenceRefs(historicalReadEffectBinding(bindings), remoteViewerContext(bindings, context)),
    bindings.bindingId, record(bindings.requirementRoles).classificationId, window.windowId,
    context.source.instruction.instructionRef, context.instructionCoverage?.coverageRef,
    context.proposal.sceneReality?.realityId, context.proposal.sceneStoryDesign?.designId,
    ...window.nodes.flatMap((node: { nodeRef: string; requirements: { requirementId: string }[] }) => [
      node.nodeRef, ...node.requirements.map((row) => row.requirementId),
    ]),
    ...pendingIntentBindingSlots(context.source).flatMap((node) => [
      ...node.references.map((slot: Row) => slot.slotId), ...node.coverage.map((slot: Row) => slot.slotId),
    ]),
  ].filter((ref): ref is string => typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(ref)))].sort();
}

/** Metadata integrity supplements actual semantic review; it is not its substitute. */
export function scenePendingIntentExaminationIssues(value: unknown, bindings: Row, context: Context, policyFingerprint: string): string[] {
  if (bindings.schemaVersion === TYPED.pendingBindings) {
    try {
      const expected = scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint), a = record(value);
      requireMatch(a.schemaVersion === TYPED.assessment && Object.entries(expected).every(([key, v]) => a[key] === v));
      const review = record(a.referenceReview), allowed = new Set(readEffectAssessmentEvidenceRefs(bindings, context));
      requireMatch(closed(review, ['verdict', 'rationale', 'evidenceRefs']) && ['supported', 'unsupported'].includes(String(review.verdict))
        && typeof review.rationale === 'string' && review.rationale.trim() && review.rationale.length <= 2000
        && Array.isArray(review.evidenceRefs) && review.evidenceRefs.length > 0 && review.evidenceRefs.length <= 32
        && new Set(review.evidenceRefs).size === review.evidenceRefs.length
        && review.evidenceRefs.includes(context.pendingReferenceQualification!.qualificationRef)
        && review.evidenceRefs.every((ref: any) => allowed.has(ref)));
      requireMatch(review.verdict === 'supported' || a.verdict === 'repair_required' && rows(a.debt).some((row) => row.domain === 'pending_intent' && row.blocking));
      const qualificationRefs = new Set(qualificationReviewEvidenceRefs(bindings, context));
      const observerReview = record(a.qualificationReview);
      requireMatch(Array.isArray(observerReview.evidenceRefs)
        && observerReview.evidenceRefs.every((ref: unknown) => typeof ref === 'string' && qualificationRefs.has(ref)));
      for (const node of rows(bindings.nodes)) requireMatch(rows(a.bindingReviews).find((row) => row.nodeRef === node.nodeRef)?.bindingRowFingerprint === freeformJsonDigest(node));
      const p = typedProjection(bindings, context);
      // The original /6 prompt supplies this exact additive citation catalog.
      // Keep it through structural reuse; do not strip a valid qualification
      // citation from general/binding/role reviews. The narrower observer-review
      // vocabulary was independently checked above before this projection.
      const reviewContext = { ...p.context, ownerEvidenceRefs: [...new Set([...(p.context.ownerEvidenceRefs ?? []), ...allowed])] };
      const { referenceReview: _review, referenceQualificationFingerprint: _qualification, effectTargetFingerprint: _targets, ...body } = a;
      return scenePendingIntentExaminationIssues({ ...body, ...scenePendingIntentExaminationIdentity(p.binding, reviewContext, policyFingerprint),
        schemaVersion: 'gma.scene-readiness-assessment/5', bindingReviews: rows(a.bindingReviews).map((row) => ({ ...row,
          bindingRowFingerprint: freeformJsonDigest(rows(p.binding.nodes).find((node) => node.nodeRef === row.nodeRef)) })) }, p.binding, reviewContext, policyFingerprint);
    } catch { return ['/typedReferenceReview']; }
  }
  if (bindings.schemaVersion !== READ_EFFECT_BINDINGS_VERSION) return historicalExaminationIssues(value, bindings, context, policyFingerprint);
  try {
    const expected = scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint);
    if (!value || typeof value !== 'object') return ['/identity'];
    const assessment = value as Row;
    if (assessment.schemaVersion !== 'gma.scene-readiness-assessment/5' || Object.entries(expected).some(([key, entry]) => assessment[key] !== entry)) return ['/identity'];
    const evidenceRefs = readEffectAssessmentEvidenceRefs(bindings, context);
    // Historical validators remain unchanged. Their structural reuse receives
    // only the exact /5 citation catalog, never model-selected additions or
    // filtered reply fields. Identity/head fingerprints remain unchanged.
    const reviewContext = { ...remoteViewerContext(bindings, context), ownerEvidenceRefs: [...new Set([...(context.ownerEvidenceRefs ?? []), ...evidenceRefs])] };
    const issues = historicalExaminationIssues(historicalReadEffectAssessment(assessment, bindings, context, policyFingerprint), historicalReadEffectBinding(bindings), reviewContext, policyFingerprint);
    // Reusing the historical structural checker must not widen the separately
    // supplied qualification citation vocabulary to all /5 review evidence.
    const qualificationRefs = new Set(qualificationReviewEvidenceRefs(bindings, context));
    const qualificationReview = record(assessment.qualificationReview);
    if (!Array.isArray(qualificationReview.evidenceRefs)
      || qualificationReview.evidenceRefs.some((ref: unknown) => typeof ref !== 'string' || !qualificationRefs.has(ref))) issues.push('/qualificationReview');
    const originals = rows(record(bindings.requirementRoles).nodes).flatMap((row) => rows(row.roles).map((role) => referenceText(role.requirementRef)));
    const reviews = Array.isArray(assessment.requirementRoleReviews) ? rows(assessment.requirementRoleReviews) : [];
    const allowed = new Set(evidenceRefs);
    if (!Array.isArray(assessment.requirementRoleReviews) || reviews.length !== originals.length || new Set(reviews.map((row) => row.requirementRef)).size !== originals.length
      || reviews.some((row) => !closed(row, ['requirementRef', 'verdict', 'rationale', 'evidenceRefs']) || typeof row.requirementRef !== 'string' || !originals.includes(row.requirementRef)
        || !['supported', 'unsupported'].includes(String(row.verdict)) || typeof row.rationale !== 'string' || !row.rationale.trim() || row.rationale.length > 1000
        || !Array.isArray(row.evidenceRefs) || !row.evidenceRefs.includes(row.requirementRef) || row.evidenceRefs.length > 32
        || new Set(row.evidenceRefs).size !== row.evidenceRefs.length || row.evidenceRefs.some((ref: unknown) => typeof ref !== 'string' || !allowed.has(ref)))) issues.push('/requirementRoleReviews');
    if (reviews.some((row) => row.verdict === 'unsupported') && (assessment.verdict !== 'repair_required'
      || !rows(assessment.debt ?? []).some((row) => row.domain === 'pending_intent' && row.blocking))) issues.push('/verdict');
    return [...new Set(issues)];
  } catch { return ['/readEffects']; }
}

/** Use the new partition's original refs along with the unchanged owner evidence. */
export function qualificationReviewEvidenceRefs(bindings: Row, context: Context): string[] {
  if (bindings.schemaVersion === TYPED.pendingBindings) { const p = typedProjection(bindings, context); return qualificationReviewEvidenceRefs(p.binding, p.context); }
  return bindings.schemaVersion === READ_EFFECT_BINDINGS_VERSION
    ? [...new Set<string>([...historicalReviewEvidenceRefs(historicalReadEffectBinding(bindings), remoteViewerContext(bindings, context)),
      ...rows(record(bindings.requirementRoles).nodes).flatMap((node) => rows(node.roles).map((role) => referenceText(role.requirementRef)))])].sort()
    : historicalReviewEvidenceRefs(bindings, context);
}

/** New binding versions retain the original execution/discovery safety gate. */
export function futureSensoryFactRefs(bindings: Row, proposal: Row): string[] {
  if (bindings?.schemaVersion === TYPED.pendingBindings) {
    const { referenceQualificationFingerprint: _q, ...body } = bindings;
    return futureSensoryFactRefs({ ...body, schemaVersion: READ_EFFECT_BINDINGS_VERSION,
      nodes: rows(body.nodes).map(({ effectCoverage: _coverage, ...node }) => node) }, proposal);
  }
  return historicalFutureSensoryFacts(bindings?.schemaVersion === READ_EFFECT_BINDINGS_VERSION ? historicalReadEffectBinding(bindings) : bindings, proposal);
}

/** One compact repair can replace only named binding/role node rows, preserving
 * every valid row and requiring review of the complete merged successor. */
export function mergeScenePendingIntentBindingRepair(value: Row, replacements: Row[], failedNodeRefs: string[], context: Context,
  roleReplacements: Row[] = [], failedRoleNodeRefs: string[] = []): Row {
  if (value.schemaVersion === TYPED.pendingBindings) {
    const exact = (replacements: Row[], refs: string[], originals: Row[]) => new Set(refs).size === refs.length && replacements.length === refs.length
      && new Set(replacements.map((row) => row.nodeRef)).size === refs.length && replacements.every((row) => typeof row.nodeRef === 'string'
        && refs.includes(row.nodeRef) && originals.some((original) => original.nodeRef === row.nodeRef));
    requireMatch(exact(replacements, failedNodeRefs, rows(value.nodes)) && exact(roleReplacements, failedRoleNodeRefs, rows(record(value.requirementRoles).nodes)));
    const result = structuredClone(value); result.nodes = rows(result.nodes).map((node) => replacements.find((r) => r.nodeRef === node.nodeRef) ?? node);
    record(result.requirementRoles).nodes = rows(record(result.requirementRoles).nodes).map((node) => roleReplacements.find((r) => r.nodeRef === node.nodeRef) ?? node);
    requireMatch(!scenePendingIntentBindingIssues(result, context).length); return result;
  }
  if (value.schemaVersion !== READ_EFFECT_BINDINGS_VERSION) {
    requireMatch(!roleReplacements.length && !failedRoleNodeRefs.length);
    return historicalRepair(value, replacements, failedNodeRefs, context);
  }
  const within = (rows: Row[], refs: string[], originals: Row[]): boolean => Array.isArray(rows)
    && new Set(refs).size === refs.length && rows.length === refs.length && new Set(rows.map((row) => row.nodeRef)).size === refs.length
    && rows.every((row) => typeof row.nodeRef === 'string' && refs.includes(row.nodeRef)) && refs.every((ref) => originals.some((row) => row.nodeRef === ref));
  requireMatch(within(replacements, failedNodeRefs, rows(value.nodes))
    && within(roleReplacements, failedRoleNodeRefs, rows(record(value.requirementRoles).nodes)));
  const result = structuredClone(value);
  result.nodes = rows(result.nodes).map((node) => structuredClone(replacements.find((row) => row.nodeRef === node.nodeRef) ?? node));
  const roles = record(result.requirementRoles);
  roles.nodes = rows(roles.nodes).map((node) => structuredClone(roleReplacements.find((row) => row.nodeRef === node.nodeRef) ?? node));
  requireMatch(!scenePendingIntentBindingIssues(result, context).length);
  return result;
}
