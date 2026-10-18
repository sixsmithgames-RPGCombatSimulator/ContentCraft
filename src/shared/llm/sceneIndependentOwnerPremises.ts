import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';

type Row = Record<string, any>;
export const SCENE_OWNER_PREMISES = Object.freeze({
  capability: 'independent-scene-owner-premises/1',
  premises: 'gma.scene-independent-owner-premises/1',
  binding: 'gma.scene-owner-premises-review-binding/1',
  assessment: 'gma.scene-readiness-assessment/7',
  policy: 'gma.scene-readiness-examiner-policy/15',
  operation: 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises',
});
export const SCENE_OWNER_PREMISES_POLICY = 'independentOwnerPremises is authenticated current_before_pending_actions evidence, separate from the complete proposed successor and unresolved actions. Compare every material successor assertion with the exact ownerContext, complete priorBundle, current state and supplied GM/Scene receipt bodies. Distinguish an established starting fact from a new model claim, and current truth from future maintenance or requested effects. Empty receipts in the current program do not negate an older owner-established condition. A phrase such as GM-established is not authority: verify its actual owner sources. Narrative exploration posture is not a VCS tactical condition. Earlier movement/resource receipts establish only their confirmed outcome, not success of a later attempt; never repeat completed effects. Preserve distinct or conflicting owner views and report real contradiction, unsupported change, stale sources, forbidden discovery, mechanics or binding debt. The baseline does not waive any existing review. Return assessment /7 with every /6 review plus ownerPremisesFingerprint copied from expectedAssessmentIdentity and ownerPremiseReview exactly {verdict,rationale,evidenceRefs}; verdict is supported or unsupported, rationale explains the temporal/source comparison (1..2000 characters), evidenceRefs contains the supplied ownerPremisesEvidenceRef (1..32 unique refs from that catalog). Unsupported requires repair_required and blocking pending_intent debt. The app computes all fingerprints; do not invent evidence, compute hashes, alter premises or resolve pending effects. All previous limits and independent-review requirements remain unchanged.';
const exact = (value: Row, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const requireMatch = (ok: unknown, field = 'ownerPremises') => { if (!ok) throw Object.assign(new Error('SCENE_OWNER_PREMISES_INVALID'), {
  code: 'SCENE_OWNER_PREMISES_INVALID', details: { field },
}); };

/** Exact owner views, not a model-selected summary or a second mutable world. */
export function createSceneOwnerPremises(request: Row, pending: Row, ownerContext: Row, priorBundle: Row | null): Row {
  requireMatch(request.campaignId === pending.window?.campaignId && request.programRef?.programId === pending.window?.programId
    && ownerContext?.storyWorkspaceRef?.campaignId === request.campaignId
    && Number(ownerContext.storyWorkspaceRef.revision) === pending.ownerReadSet.storyWorkspaceRevision
    && Number(ownerContext.playableSceneContext?.sceneKitRef?.revision) === pending.window.authorityHead?.sceneRevision);
  const state = ownerContext.activeSceneContext?.state;
  requireMatch(state && Number.isSafeInteger(state.revision) && Number.isSafeInteger(state.lastTurnSequence));
  for (const dependency of request.authorityReadSet) {
    if (dependency.owner === 'gmc' && dependency.ref === `gmc:story-workspace:${request.campaignId}`) requireMatch(dependency.revision === ownerContext.storyWorkspaceRef.revision, 'authorityReadSet.storyWorkspace');
    if (dependency.owner === 'gmc' && dependency.ref === `gmc:campaign-clock:${request.campaignId}`) requireMatch(dependency.revision === ownerContext.gameTimeContext?.gameClockRevision, 'authorityReadSet.campaignClock');
  }
  const body = { schemaVersion: SCENE_OWNER_PREMISES.premises, operationId: request.operationId, campaignId: request.campaignId,
    intentWindowFingerprint: pending.window.windowFingerprint, authorityReadSet: structuredClone(request.authorityReadSet),
    ownerReadSet: structuredClone(pending.ownerReadSet), ownerReadSetFingerprint: freeformJsonDigest(pending.ownerReadSet),
    temporalScope: 'current_before_pending_actions', timelineAnchor: { storyWorkspaceRef: structuredClone(ownerContext.storyWorkspaceRef),
      sceneKitRef: structuredClone(ownerContext.playableSceneContext.sceneKitRef), activeSceneStateRevision: state.revision,
      turnSequence: state.lastTurnSequence, latestReceiptRef: state.latestReceiptRef },
    ownerContext: structuredClone(ownerContext), priorBundle: structuredClone(priorBundle) };
  return { ...body, fingerprint: freeformJsonDigest(body) };
}

export function assertSceneOwnerPremises(value: Row, request: Row, pending: Row, ownerContext: Row, priorBundle: Row | null): void {
  const expected = createSceneOwnerPremises(request, pending, ownerContext, priorBundle);
  requireMatch(exact(value, Object.keys(expected)), 'ownerPremises.keys');
  for (const key of Object.keys(expected)) requireMatch(same(value[key], expected[key]), `ownerPremises.${key}`);
}

export const ownerPremisesEvidenceRef = (premises: Row) => `owner-premises:${premises.fingerprint}`;
export function ownerPremiseExaminationIssues(assessment: Row, premises: Row): string[] {
  const review = assessment?.ownerPremiseReview;
  return assessment?.schemaVersion === SCENE_OWNER_PREMISES.assessment && assessment.ownerPremisesFingerprint === premises?.fingerprint
    && exact(review, ['verdict', 'rationale', 'evidenceRefs']) && ['supported', 'unsupported'].includes(review.verdict)
    && typeof review.rationale === 'string' && review.rationale.trim().length > 0 && review.rationale.length <= 2000
    && Array.isArray(review.evidenceRefs) && review.evidenceRefs.length === 1 && review.evidenceRefs[0] === ownerPremisesEvidenceRef(premises)
    && (review.verdict === 'supported' || assessment.verdict === 'repair_required'
      && assessment.debt?.some((row: Row) => row.blocking === true && row.domain === 'pending_intent')) ? [] : ['/ownerPremiseReview'];
}

/** Only structural reuse of /6; the actual assessment remains /7 in receipts. */
export function historicalOwnerPremiseAssessment(value: Row): Row {
  const { ownerPremisesFingerprint: _fingerprint, ownerPremiseReview: _review, ...body } = value;
  return { ...body, schemaVersion: 'gma.scene-readiness-assessment/6' };
}

export function createSceneOwnerReviewBinding(premises: Row, assessment: Row): Row {
  requireMatch(!ownerPremiseExaminationIssues(assessment, premises).length);
  return { schemaVersion: SCENE_OWNER_PREMISES.binding, operationId: premises.operationId, campaignId: premises.campaignId,
    intentWindowFingerprint: premises.intentWindowFingerprint, ownerReadSet: structuredClone(premises.ownerReadSet),
    premises: structuredClone(premises), ownerPremisesFingerprint: premises.fingerprint,
    assessmentIdentity: { assessmentId: assessment.assessmentId, fingerprint: freeformJsonDigest(assessment),
      dossierFingerprint: assessment.dossierFingerprint, policyFingerprint: assessment.policyFingerprint }, reviewPolicy: SCENE_OWNER_PREMISES.policy };
}
export function assertSceneOwnerReviewBinding(value: Row, premises: Row, assessment: Row): void {
  const expected = createSceneOwnerReviewBinding(premises, assessment);
  requireMatch(exact(value, Object.keys(expected)), 'ownerPremisesReview.keys');
  for (const key of Object.keys(expected)) requireMatch(same(value[key], expected[key]), `ownerPremisesReview.${key}`);
}
