import { describe, expect, it } from 'vitest';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { SCENE_OWNER_PREMISES as P, SCENE_OWNER_PREMISES_POLICY, createSceneOwnerPremises, assertSceneOwnerPremises,
  ownerPremisesEvidenceRef, ownerPremiseExaminationIssues, createSceneOwnerReviewBinding, assertSceneOwnerReviewBinding } from './sceneIndependentOwnerPremises.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';
import { compileScenePreparationWorkingSet, decodeScenePreparationWorkingSet } from './scenePreparationWorkingSet.js';

function fixture() {
  const request = { operationId: 'build:one', campaignId: 'campaign:one', programRef: { programId: 'program:one' }, authorityReadSet: [{ owner: 'gmc', ref: 'workspace:one', revision: 4 }] };
  const pending = { window: { campaignId: 'campaign:one', programId: 'program:one', windowFingerprint: 'a'.repeat(64), authorityHead: { sceneRevision: 3 } },
    ownerReadSet: { storyWorkspaceRevision: 4, sceneRevision: 3 } };
  const owner: any = { storyWorkspaceRef: { campaignId: request.campaignId, revision: 4 }, playableSceneContext: { sceneKitRef: { revision: 3 } },
    activeSceneContext: { state: { revision: 2, lastTurnSequence: 9, latestReceiptRef: 'gm:earlier', actorStates: [{ actorRef: 'actor:hero', posture: 'hidden' }] },
      recentTurnReceipts: [{ receiptRef: 'gm:earlier', sourceKind: 'human_gm', ruling: 'The hero is concealed at the entrance.' }] },
    latestSceneTurnReceipt: { receiptRef: 'gm:earlier' }, authorityReceiptCatalog: { receipts: ['gm:earlier'] } };
  const prior: any = { actorFrames: [{ actorRef: 'actor:hero', objective: 'Maintain the established concealed position.' }], readinessAssessment: { schemaVersion: 'old' } };
  const premises = createSceneOwnerPremises(request, pending, owner, prior);
  const assessment: any = { schemaVersion: P.assessment, assessmentId: 'review:one', dossierFingerprint: 'b'.repeat(64), policyFingerprint: 'c'.repeat(64),
    ownerPremisesFingerprint: premises.fingerprint, verdict: 'adequate', debt: [], ownerPremiseReview: { verdict: 'supported',
      rationale: 'The saved GM ruling establishes the starting posture; maintaining it remains unresolved.', evidenceRefs: [ownerPremisesEvidenceRef(premises)] } };
  return { request, pending, owner, prior, premises, assessment };
}
describe('owner-proven current premises, ADR 028 / GMC 011', () => {
  it('preserves every distinct source body and its original receipt, without mutating owners', () => {
    const f = fixture(), original = structuredClone(f);
    assertSceneOwnerPremises(f.premises, f.request, f.pending, f.owner, f.prior);
    expect(f.premises.ownerContext).toEqual(f.owner); expect(f.premises.priorBundle).toEqual(f.prior);
    expect(f.premises.temporalScope).toBe('current_before_pending_actions'); expect(f).toEqual(original);
    const wire = compileScenePreparationWorkingSet({ preparationPolicyVersion: 14, buildRequest: f.request, pendingIntentContext: f.pending,
      independentOwnerPremises: f.premises }, P.operation, 'examine');
    expect(decodeScenePreparationWorkingSet(wire, P.operation).independentOwnerPremises).toEqual(f.premises);
  });
  it.each(['ownerContext', 'priorBundle', 'operationId', 'campaignId', 'intentWindowFingerprint', 'authorityReadSet', 'ownerReadSet', 'ownerReadSetFingerprint', 'timelineAnchor', 'temporalScope', 'fingerprint'])('rejects tampered %s even with a recomputed client digest', (field) => {
    const f = fixture(), changed = structuredClone(f.premises); changed[field] = null;
    const { fingerprint: _old, ...body } = changed; if (field !== 'fingerprint') changed.fingerprint = freeformJsonDigest(body);
    expect(() => assertSceneOwnerPremises(changed, f.request, f.pending, f.owner, f.prior)).toThrow();
  });
  it.each(['missing_receipts', 'actor', 'current_state', 'workspace', 'scene', 'conflicting_prior'])('rejects %s fresh sources rather than trusting old hashes', (kind) => {
    const f = fixture();
    if (kind === 'missing_receipts') f.owner.activeSceneContext.recentTurnReceipts = [];
    if (kind === 'actor') f.owner.activeSceneContext.state.actorStates[0].actorRef = 'actor:other';
    if (kind === 'current_state') f.owner.activeSceneContext.state.revision++;
    if (kind === 'workspace') f.owner.storyWorkspaceRef.revision++;
    if (kind === 'scene') f.owner.playableSceneContext.sceneKitRef.revision++;
    if (kind === 'conflicting_prior') f.prior.actorFrames[0].objective = 'A distinct conflicting current condition';
    expect(() => assertSceneOwnerPremises(f.premises, f.request, f.pending, f.owner, f.prior)).toThrow();
  });
  it('requires the complete /7 review and exact commit binding, including policy and assessment identity', () => {
    const f = fixture(), binding = createSceneOwnerReviewBinding(f.premises, f.assessment);
    expect(ownerPremiseExaminationIssues(f.assessment, f.premises)).toEqual([]);
    assertSceneOwnerReviewBinding(binding, f.premises, f.assessment);
    for (const field of Object.keys(binding)) {
      expect(() => assertSceneOwnerReviewBinding({ ...binding, [field]: null }, f.premises, f.assessment)).toThrow();
    }
    expect(() => assertSceneOwnerReviewBinding({ ...binding, extra: true }, f.premises, f.assessment)).toThrow();
    expect(ownerPremiseExaminationIssues({ ...f.assessment, schemaVersion: 'gma.scene-readiness-assessment/6' }, f.premises).length).toBeGreaterThan(0);
    f.assessment.ownerPremiseReview.verdict = 'unsupported';
    expect(ownerPremiseExaminationIssues(f.assessment, f.premises).length).toBeGreaterThan(0);
    f.assessment.verdict = 'repair_required'; f.assessment.debt = [{ domain: 'pending_intent', blocking: true }];
    expect(ownerPremiseExaminationIssues(f.assessment, f.premises)).toEqual([]);
  });
  it('teaches the positive temporal/source rule in the original new policy, retaining historical operations and bounds', () => {
    const fresh = getOperationDefinition(P.operation), old = getOperationDefinition(P.operation.replace('.owner-premises', ''));
    expect(fresh.prompt.version).toBe(P.policy); expect(fresh.prompt.systemInstruction).toContain(SCENE_OWNER_PREMISES_POLICY);
    for (const rule of ['Empty receipts in the current program do not negate', 'current truth from future maintenance', 'verify its actual owner sources', 'conflicting owner views', 'VCS tactical condition']) expect(fresh.prompt.systemInstruction).toContain(rule);
    expect(fresh.context.inputHardLimitBytes).toBe(131072); expect(fresh.provider).toEqual(old.provider);
    expect(old.prompt.version).toBe('gma.scene-readiness-examiner-policy/14');
    expect((old.outputSchema.schema.properties as Record<string, unknown>).schemaVersion).toEqual({ const: 'gma.scene-readiness-assessment/6' });
  });
});
