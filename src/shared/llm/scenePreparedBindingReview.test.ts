import { expect, it } from 'vitest';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';
import { PREPARED_BINDING_COMPILATION as C } from './scenePreparedBindingCompilation.js';
import { SCENE_TEMPORAL_VALIDITY as T } from './sceneTemporalValidity.js';
import { SCENE_OWNER_PREMISES as P, ownerPremisesEvidenceRef, ownerPremiseExaminationIssues } from './sceneIndependentOwnerPremises.js';
import { SCENE_PREPARED_OWNER_CITATION_POLICY } from './scenePreparedBindingReview.js';

it.each([C.operation, T.operation])('states the exact owner-premise citation scope on the original %s first pass', (operation) => {
  const prompt = getOperationDefinition(operation)!.prompt.systemInstruction;
  expect(prompt).toContain(SCENE_PREPARED_OWNER_CITATION_POLICY);
  expect(prompt).not.toContain('evidenceRefs contains the supplied ownerPremisesEvidenceRef (1..32 unique refs from that catalog)');
  // The older already-issued policy and cache identity are not rewritten.
  expect(getOperationDefinition(P.operation)!.prompt.systemInstruction).toContain('1..32 unique refs from that catalog');
});
it('keeps the strict check: detailed rationale is valid, extra dossier citations are not an exact owner comparison witness', () => {
  const premises = { fingerprint: 'a'.repeat(64) };
  const assessment = { schemaVersion: P.assessment, ownerPremisesFingerprint: premises.fingerprint, verdict: 'adequate',
    ownerPremiseReview: { verdict: 'supported', rationale: 'The owner establishes the hidden starting posture in actor:player; no pending action is completed.',
      evidenceRefs: [ownerPremisesEvidenceRef(premises)] } };
  expect(ownerPremiseExaminationIssues(assessment, premises)).toEqual([]);
  const original = structuredClone(assessment);
  assessment.ownerPremiseReview.evidenceRefs.push('actor:player');
  expect(ownerPremiseExaminationIssues(assessment, premises)).toEqual(['/ownerPremiseReview']);
  expect(original.ownerPremiseReview.evidenceRefs).toEqual([ownerPremisesEvidenceRef(premises)]);
});
