import { freeformJsonDigest } from './freeformPlanBinding.js';
import { SCENE_MOVEMENT_COMMIT_SCHEMA, sceneMovementSchemaIssues } from './sceneMovementOutcome.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => freeformJsonDigest(a) === freeformJsonDigest(b);
const idSchema = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const digestSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const closed = (properties: Row): Row => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const PREPARED_CHECK_COMPLETION_AUTHORITY = Object.freeze({
  capability: 'selected-prepared-movement/1', proof: 'gma.selected-prepared-movement-proof/1',
  movementResult: 'gma.prepared-movement-result/1', commit: 'gmc.scene-movement-outcome-commit/2',
  terminalTransport: 'gma.compound-story-terminal-transport/2',
});
export const PREPARED_MOVEMENT_RESULT_POLICY = 'For each of the five provisional preparedOutcome branches, include movementResult. If movementExpectation is null use null. Otherwise use {schemaVersion:"gma.prepared-movement-result/1",result:"reached"|"not_reached",narrationEvidence}. Choose reached only if that exact named mover reaches the exact expected destination zone in that branch, not merely because its check succeeds. A failed check may or may not arrive; state the actual branch result explicitly. narrationEvidence must quote a nonempty exact excerpt of that branch responseText which concretely states arrival or failed arrival. Keep the outer movementOutcome null while the roll is pending. Do not apply these hypothetical outcomes to present narration, change another actor, resolve later observations, or invent additional movement. The app binds movement identity once from the owner and verifies the selected branch against the saved VCS result before any effect.';
export const PREPARED_MOVEMENT_RESULT_SCHEMA = closed({ schemaVersion: { const: PREPARED_CHECK_COMPLETION_AUTHORITY.movementResult },
  result: { enum: ['reached', 'not_reached'] }, narrationEvidence: { type: 'string', minLength: 1, maxLength: 2_000 } });
export const SELECTED_PREPARED_MOVEMENT_PROOF_SCHEMA = closed({
  schemaVersion: { const: PREPARED_CHECK_COMPLETION_AUTHORITY.proof }, programRef: idSchema, nodeRef: idSchema,
  candidateFingerprint: digestSchema, mechanicsInteractionId: idSchema, mechanicsReceiptRef: idSchema,
  outcomeId: { enum: ['criticalFailure', 'partial', 'success', 'greatSuccess', 'criticalSuccess'] },
  branchFingerprint: digestSchema, sourceSceneTurnReceiptRef: idSchema,
});
export const SELECTED_PREPARED_MOVEMENT_COMMIT_SCHEMA = closed({
  ...(SCENE_MOVEMENT_COMMIT_SCHEMA.properties as Row), schemaVersion: { const: PREPARED_CHECK_COMPLETION_AUTHORITY.commit },
  selectedCheckSource: SELECTED_PREPARED_MOVEMENT_PROOF_SCHEMA,
});

/** Existing GMA check bands, shared without changing the VCS die or rules. */
export function preparedCheckOutcomeId(mechanics: unknown): string | null {
  if (!object(mechanics) || typeof mechanics.total !== 'number' || !Number.isFinite(mechanics.total)
    || typeof mechanics.dc !== 'number' || !Number.isFinite(mechanics.dc)) return null;
  if (mechanics.selected === 20) return 'criticalSuccess';
  const margin = mechanics.total - mechanics.dc;
  return margin <= -6 ? 'criticalFailure' : margin < 0 ? 'partial' : margin < 5 ? 'success' : margin < 10 ? 'greatSuccess' : 'criticalSuccess';
}

export function preparedMovementResultIssues(value: unknown, expectation: unknown, narration: unknown): string[] {
  if (expectation == null) return value === null ? [] : ['/movementResult'];
  const issues = sceneMovementSchemaIssues(value, PREPARED_MOVEMENT_RESULT_SCHEMA)
    .map((path) => `/movementResult${path === '/' ? '' : path}`);
  if (!object(value) || typeof narration !== 'string' || typeof value.narrationEvidence !== 'string'
    || !value.narrationEvidence.trim() || !narration.includes(value.narrationEvidence)) issues.push('/movementResult/narrationEvidence');
  return issues;
}

/** All inputs are reloaded by the owner. A browser proof never supplies them. */
export function selectedPreparedMovementSourceIssues({ artifact, source, ledger, proof, expectation, human = false }: {
  artifact: Row; source: Row; ledger: Row; proof: unknown; expectation: Row | null; human?: boolean;
}): string[] {
  try {
    if (sceneMovementSchemaIssues(proof, SELECTED_PREPARED_MOVEMENT_PROOF_SCHEMA).length || !object(proof)) return ['/proof'];
    const saga = artifact.saga, program = artifact.program;
    const pending = object(saga) ? saga.pendingModelCandidate : null;
    const candidate = object(pending) ? pending.candidate : null;
    if (!object(program) || !object(pending) || pending.schemaVersion !== 'gma.accepted-model-candidate/2'
      || pending.kind !== 'story_narration' || !object(candidate)
      || !['gma.compound-story-settlement-candidate/1', 'gma.compound-story-settlement-candidate/2'].includes(String(candidate.schemaVersion))
      || pending.candidateFingerprint !== freeformJsonDigest(candidate) || proof.candidateFingerprint !== pending.candidateFingerprint
      || candidate.programId !== program.programId || proof.programRef !== program.programId
      || expectation && proof.nodeRef !== expectation.nodeRef || !Array.isArray(candidate.nodeRefs) || !candidate.nodeRefs.includes(proof.nodeRef)) return ['/candidate'];
    const response = ledger.response, compiled = candidate.compiled;
    if (!object(response) || !object(compiled) || !object(compiled.rollRequest) || !object(compiled.rollRequest.preparedOutcome)
      || !object(compiled.rollRequest.preparedOutcome.branches) || ledger.interactionId !== candidate.interactionId
      || !object(candidate.sceneKitRef) || ledger.campaignId !== candidate.sceneKitRef.campaignId || proof.mechanicsInteractionId !== candidate.interactionId) return ['/ledger'];
    const mechanics = response.mechanicalResult;
    if (!object(mechanics) || !object(mechanics.authorityReceipt)) return ['/mechanics'];
    const { authorityReceipt: receipt, ...raw } = mechanics;
    if (receipt.contractVersion !== 'vcs.mechanics-authority-receipt/1' || receipt.authority !== 'vcs' || receipt.status !== 'committed'
      || receipt.operationId !== candidate.interactionId || receipt.receiptRef !== proof.mechanicsReceiptRef
      || receipt.resultFingerprint !== freeformJsonDigest(raw) || raw.interactionId !== candidate.interactionId
      || raw.dc !== compiled.rollRequest.dc || raw.modifier !== compiled.rollRequest.modifier
      || proof.outcomeId !== preparedCheckOutcomeId(raw)) return ['/mechanics'];
    const branch = compiled.rollRequest.preparedOutcome.branches[String(proof.outcomeId)];
    if (!object(branch) || proof.branchFingerprint !== freeformJsonDigest(branch)) return ['/branch'];
    const exchange = source.publishedExchange, scene = source.sceneKitRef, originScene = candidate.sceneKitRef;
    if (!object(exchange) || !object(scene) || !object(originScene) || source.receiptRef !== proof.sourceSceneTurnReceiptRef
      || source.interactionId !== candidate.interactionId || source.operationId !== `scene-turn:${candidate.interactionId}:resolved`
      || source.phase !== 'owner_confirmed_mechanic' || source.playerActionFingerprint !== candidate.playerActionFingerprint
      || scene.sceneKitId !== originScene.sceneKitId || scene.revision !== originScene.revision || scene.payloadHash !== originScene.payloadHash
      || exchange.assistantNarration !== branch.responseText || !Array.isArray(source.sourceReceiptRefs)
      || !source.sourceReceiptRefs.includes(receipt.receiptRef)) return ['/scene'];
    if (human) return ['gma.current-scene-narration-compiled/11', 'gma.current-scene-narration-compiled/13'].includes(String(compiled.schemaVersion)) ? [] : ['/retainedVersion'];
    const terminal = candidate.terminalTransport;
    if (compiled.schemaVersion !== 'gma.current-scene-narration-compiled/14' || !object(terminal)
      || terminal.schemaVersion !== PREPARED_CHECK_COMPLETION_AUTHORITY.terminalTransport
      || !same(terminal.movementExpectation, expectation)
      || preparedMovementResultIssues(branch.movementResult, expectation, branch.responseText).length) return ['/movementResult'];
    return [];
  } catch { return ['/context']; }
}
