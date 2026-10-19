import { freeformJsonDigest, canonicalFreeformJson } from './freeformPlanBinding.js';
import { PREPARED_BINDING_COMPILATION as C, assertPreparedBindingCompilation } from './scenePreparedBindingCompilation.js';
import { createSceneOwnerReviewBinding } from './sceneIndependentOwnerPremises.js';
import { SCENE_TEMPORAL_VALIDITY as T, historicalTemporalAssessment } from './sceneTemporalValidity.js';
import { SCENE_TEMPORAL_GM as G } from './sceneTemporalGmDecisions.js';

type Row = Record<string, any>;
export const SCENE_PREPARED_OWNER_CITATION_POLICY = 'ownerPremiseReview.evidenceRefs must be exactly [ownerPremisesEvidenceRef], the one-element array containing the supplied owner-premises reference and no other refs. Discuss particular owner records in rationale; do not add their IDs to this array';
export const preparedBindingEvidenceRef = (compilation: Row) => `prepared-bindings:${compilation.fingerprint}`;
export const SCENE_PREPARED_SELECTION_POLICY = 'Use gma.scene-prepared-binding-selections/1 in pendingIntentBindings. For each non-derived coverage slot select exactly {slotId,affordanceRef}; effectCoverage selects exactly {effectId,targetSlotId,role,affordanceRef}. An affordanceRef is the exact affordanceId of one complete prepared surface, not its coverageEntryId, a display name or an index. Return every required slot except the exact supplied derivedReceiverSlots. Omit those receiver coverage rows only; still return their original references, observations and requirement-role rows. The receiving controller can be an explicit recipient or the grammatical actor in an implicit instruction such as watching through the familiar; only exact owner links identify it. The app derives its redundant coverage from the same group\'s single explicitly selected sensory surface and verified relationship. Do not select a second observer, change the sensory target, invent a link, guess an ambiguous surface or resolve an effect. Clarification keeps all selection arrays empty. Every existing semantic, world, role, source, size and operation limit still applies. The full compiled successor needs independent review and strict owner acceptance.';
export const SCENE_PREPARED_REVIEW_POLICY = 'Return assessment /8 with every /7 review. Reconstruct the complete original choices from canonical bindings and inverse derivations. Review each original versus compiled choice against instruction, world, owner premises, role and exact observer/group/link. Only same-row typed IDs and redundant receiver coverage from one already-selected sensory surface may differ; no target, access, method/form, outcome, world fact or completed receipt may change. Reject ambiguity, stale/foreign links and semantic changes despite matching hashes. Copy preparedBindingCompilationFingerprint from expectedAssessmentIdentity. Add preparedBindingReview exactly {verdict,rationale,evidenceRefs}: supported or unsupported, concrete nonempty rationale <=2000 characters, evidenceRefs exactly [preparedBindingEvidenceRef]. Unsupported requires repair_required and blocking pending_intent debt. Do not repair, compute hashes, invent sources or resolve mechanics; all limits remain.';
export const SCENE_PREPARED_INFORMATION_REVIEW_POLICY = 'Verify every compact information row against its exact staged fact and explicit informationSelections: fact ID, selected route indexes/order, exact string value or canonical JSON, and state (bounded_negative -> absent_in_scope; else revealed/public_surface -> plainly_visible; else concealed). All retained prior information IDs must be explicitly selected. Reject dangling/invalid indexes, paraphrase, truncation, widened visibility or omissions. Verify application informationProjection provenance, not model hashes. Routes prove feasibility only, not arrival, sensing or disclosure. Return assessment /8, never a construction proposal.';
export const SCENE_PREPARED_MECHANICS_REVIEW_POLICY = 'mechanicsPreparationContext is read-only owner evidence for this exact window, sheet, node and requirement. A ready structured match proves only that prerequisite; no duplicate Scene skill fact or generic ownership claim substitutes. Check structural surfaces against original actor/action/location, separately from capability, resources, permission and pending rolls/outcomes. Missing, stale, blocked or ambiguous evidence is unsupported. Cite exact original requirement refs from the supplied catalog. The app rechecks owners before execution; this review grants no roll, resource, movement, disclosure or world-write authority.';

export function historicalPreparedBindingAssessment(assessment: Row): Row {
  const { preparedBindingCompilationFingerprint: _fingerprint, preparedBindingReview: _review, ...body } = assessment;
  return { ...body, schemaVersion: 'gma.scene-readiness-assessment/7' };
}

export function preparedBindingReviewIssues(assessment: Row, bindings: Row, compilation: Row, context: Row): string[] {
  try {
    assertPreparedBindingCompilation(bindings, compilation, context);
    const r = assessment?.preparedBindingReview;
    if (assessment.schemaVersion !== C.assessment || assessment.preparedBindingCompilationFingerprint !== compilation.fingerprint
      || !r || Object.keys(r).sort().join(',') !== 'evidenceRefs,rationale,verdict'
      || !['supported', 'unsupported'].includes(r.verdict) || typeof r.rationale !== 'string' || !r.rationale.trim() || r.rationale.length > 2000
      || !Array.isArray(r.evidenceRefs) || r.evidenceRefs.length !== 1 || r.evidenceRefs[0] !== preparedBindingEvidenceRef(compilation)
      || r.verdict === 'unsupported' && !(assessment.verdict === 'repair_required'
        && assessment.debt?.some((row: Row) => row.domain === 'pending_intent' && row.blocking === true))) return ['/preparedBindingReview'];
    return [];
  } catch { return ['/preparedBindingCompilation']; }
}

export function createPreparedBindingReview(compilation: Row, assessment: Row): Row {
  const family = assessment.schemaVersion === G.assessment ? G : T;
  const temporal = [T.assessment, G.assessment].includes(assessment.schemaVersion);
  return { schemaVersion: temporal ? family.preparedReview : C.review, compilation: structuredClone(compilation), assessmentIdentity: {
    assessmentId: assessment.assessmentId, fingerprint: freeformJsonDigest(assessment),
    dossierFingerprint: assessment.dossierFingerprint, policyFingerprint: assessment.policyFingerprint,
  }, reviewPolicy: temporal ? family.examinerPolicy : C.examinerPolicy,
  ...(temporal ? { temporalReviewFingerprint: freeformJsonDigest(assessment.temporalCoverageReview),
    temporalAuthorityFingerprint: assessment.temporalCoverageReview.authorityFingerprint } : {}) };
}
export function assertPreparedBindingReview(value: Row, compilation: Row, assessment: Row): void {
  if (canonicalFreeformJson(value) !== canonicalFreeformJson(createPreparedBindingReview(compilation, assessment))) {
    throw new Error('SCENE_PREPARED_BINDING_REVIEW_INVALID');
  }
}

/** Keep the older owner-premise contract immutable; this explicit new-family
 * wrapper binds the actual /8 assessment, not its structural /7 projection. */
export function createPreparedOwnerReviewBinding(premises: Row, assessment: Row): Row {
  const family = assessment.schemaVersion === G.assessment ? G : T;
  const temporal = [T.assessment, G.assessment].includes(assessment.schemaVersion);
  const result = createSceneOwnerReviewBinding(premises, historicalPreparedBindingAssessment(temporal ? historicalTemporalAssessment(assessment) : assessment));
  return { ...result, assessmentIdentity: { ...result.assessmentIdentity, fingerprint: freeformJsonDigest(assessment) }, reviewPolicy: temporal ? family.examinerPolicy : C.examinerPolicy };
}
export function assertPreparedOwnerReviewBinding(value: Row, premises: Row, assessment: Row): void {
  if (canonicalFreeformJson(value) !== canonicalFreeformJson(createPreparedOwnerReviewBinding(premises, assessment))) {
    throw new Error('SCENE_OWNER_PREMISES_INVALID');
  }
}
