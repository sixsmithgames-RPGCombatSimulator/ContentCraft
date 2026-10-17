import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { deriveSceneMovementExpectation, sceneMovementOutcomeIssues, SCENE_MOVEMENT_OUTCOME_AUTHORITY,
  SCENE_MOVEMENT_COMMIT_SCHEMA, sceneMovementSchemaIssues,
  type SceneMovementExpectation, type SceneMovementOutcomeProposal } from '../../shared/llm/sceneMovementOutcome.js';
import { readActiveCompoundActionArtifact } from './compoundActionArtifactStore.js';
import { readActiveSceneReality } from './sceneRealityReadinessService.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { assertFreeformProgramWorkflowOpen } from './freeformWorkflowAuthority.js';
import type { ActiveSceneStateDocument, SceneTurnReceiptDocument } from './activeSceneStateStore.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';
import { parallelPresentationNodeRefs, sceneMovementCohortSourceIssues } from '../../shared/llm/parallelPresentation.js';
import { findMechanicsLedger } from '../llm-orchestrator/mechanicsLedger.js';
import { PREPARED_CHECK_COMPLETION_AUTHORITY, SELECTED_PREPARED_MOVEMENT_COMMIT_SCHEMA,
  selectedPreparedMovementSourceIssues } from '../../shared/llm/preparedCheckCompletion.js';

type Scope = { userId: string; campaignId: string; programId: string };
/** One immutable result, not a second mutable actor-position store. */
export interface SceneMovementOutcomeDocument extends Scope {
  _id: string; operationId: string; nodeRef: string; requestFingerprint: string; receipt: JsonObject; createdAt: Date;
}
/** Protected service input; scope is always supplied by authentication. */
export interface SceneMovementOutcomeCommit extends Scope {
  schemaVersion: 'gmc.scene-movement-outcome-commit/1' | 'gmc.scene-movement-outcome-commit/2'; operationId: string; idempotencyKey: string; nodeRef: string;
  selectedCheckSource?: JsonObject;
  expectedArtifactRevision: number; expectedWorkspaceRevision: number; expectedPreparedSceneRevision: number; expectedActiveSceneRevision: number;
  sourceSceneTurnReceiptRef: string; expectation: SceneMovementExpectation; proposal: SceneMovementOutcomeProposal;
  sourceKind: 'manual_proposal' | 'human_gm';
  humanDecision: { schemaVersion: 'gma.scene-movement-gm-decision/1'; decisionId: string; result: 'reached' | 'not_reached'; reason: string } | null;
}
/** Explicit injected owner readers enable isolated, no-provider certification. */
export interface SceneMovementOutcomeDependencies {
  records?: Pick<Collection<SceneMovementOutcomeDocument>, 'findOne' | 'insertOne'>;
  states?: Pick<Collection<ActiveSceneStateDocument>, 'findOne'>;
  sceneTurns?: Pick<Collection<SceneTurnReceiptDocument>, 'findOne'>;
  readArtifact?: typeof readActiveCompoundActionArtifact;
  readReality?: typeof readActiveSceneReality;
  readLegacy?: typeof readObservationAuthority;
  readMechanicsLedger?: typeof findMechanicsLedger;
  assertWorkflowOpen?: typeof assertFreeformProgramWorkflowOpen;
  writeCampaignAllowlist?: string[];
}
/** Public operations are independently guarded and retain original IDs on retry. */
export interface SceneMovementOutcomeService {
  expectation(input: Scope & { nodeRef: string }): Promise<JsonObject>;
  commit(input: SceneMovementOutcomeCommit): Promise<JsonObject>;
  operation(input: Scope & { operationId: string }): Promise<JsonObject | null>;
}
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
function fail(field: string): never { throw new StoryWorkspaceStoreError(409, 'SCENE_MOVEMENT_OUTCOME_INVALID',
  'The exact saved movement result could not be confirmed safely.', { field }); }
const duplicate = (error: unknown): boolean => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

/** Default-off protected owner confirmation, with read-only original-operation recovery. */
export function sceneMovementOutcomeService(deps: SceneMovementOutcomeDependencies = {}): SceneMovementOutcomeService {
  const records = deps.records ?? getDb().collection<SceneMovementOutcomeDocument>('gmc_scene_movement_outcomes');
  const states = deps.states ?? getDb().collection<ActiveSceneStateDocument>('gmc_active_scene_states');
  const sceneTurns = deps.sceneTurns ?? getDb().collection<SceneTurnReceiptDocument>('gmc_scene_turn_receipts');
  const readArtifact = deps.readArtifact ?? readActiveCompoundActionArtifact;
  const readReality = deps.readReality ?? readActiveSceneReality;
  const readLegacy = deps.readLegacy ?? readObservationAuthority;
  const readLedger = deps.readMechanicsLedger ?? findMechanicsLedger;
  if (deps.readArtifact && !deps.assertWorkflowOpen) throw new Error('Injected movement ownership requires an explicit workflow guard.');
  const workflow = deps.assertWorkflowOpen ?? assertFreeformProgramWorkflowOpen;
  const allowed = deps.writeCampaignAllowlist ?? (process.env.GMC_PENDING_OBSERVER_QUALIFICATION === '1'
    ? String(process.env.GMC_PENDING_OBSERVER_CAMPAIGN_ALLOWLIST ?? '').split(',').map((row) => row.trim()).filter(Boolean) : []);
  const scopeOf = (input: Scope): Scope => {
    if (![input.userId, input.campaignId, input.programId].every(id)) fail('scope');
    return { userId: input.userId, campaignId: input.campaignId, programId: input.programId };
  };
  async function current(input: Scope & { nodeRef: string }): Promise<{ scope: Scope; artifact: JsonObject; expectation: SceneMovementExpectation;
    artifactRevision: number; workspaceRevision: number; preparedSceneRevision: number; sceneKitId: string; active: ActiveSceneStateDocument | null; labels: JsonObject }> {
    const scope = scopeOf(input);
    const [loaded, prepared, legacy] = await Promise.all([readArtifact(scope), readReality(scope), readLegacy(scope)]);
    if (!loaded?.artifact || !object(prepared?.bundle) || !object(prepared.bundle.sceneKit)) fail('owners');
    const artifact = loaded.artifact as unknown as JsonObject;
    await workflow(scope, object(artifact.freeformBinding) ? artifact.freeformBinding : undefined);
    if (!object(artifact.cursor) || !Array.isArray(artifact.cursor.completedNodeRefs) || !Array.isArray(artifact.cursor.skippedNodeRefs)
      || artifact.cursor.completedNodeRefs.includes(input.nodeRef) || artifact.cursor.skippedNodeRefs.includes(input.nodeRef)) fail('node_not_pending');
    const expectation = deriveSceneMovementExpectation(artifact, prepared.bundle, input.nodeRef);
    if (expectation.programRef !== scope.programId || expectation.campaignId !== scope.campaignId) fail('expectation_scope');
    const sceneKitId = String(prepared.bundle.sceneKit.sceneKitId);
    const workspaceRevision = legacy.workspaceRef.revision;
    if (typeof workspaceRevision !== 'number' || !Number.isSafeInteger(workspaceRevision) || workspaceRevision < 0) fail('workspace_head');
    const active = await states.findOne({ userId: scope.userId, campaignId: scope.campaignId, sceneKitId });
    const frames = Array.isArray(prepared.bundle.actorFrames) ? prepared.bundle.actorFrames.filter(object) : [];
    const elements = Array.isArray(prepared.bundle.elements) ? prepared.bundle.elements.filter(object) : [];
    const zones = Array.isArray(prepared.bundle.zones) ? prepared.bundle.zones.filter(object) : [];
    const mover = frames.find((row) => row.actorRef === expectation.moverRef);
    const destination = elements.find((row) => row.elementId === expectation.destinationRef)
      ?? zones.find((row) => row.zoneId === expectation.destinationZoneRef);
    const labels = { mover: String(mover?.publicLabel ?? 'The moving character'), destination: String(destination?.label ?? 'the selected position') };
    return { scope, artifact, expectation, artifactRevision: loaded.artifactRef.revision,
      workspaceRevision, preparedSceneRevision: Number(prepared.bundle.sceneKit.revision), sceneKitId, active, labels };
  }
  async function expectation(input: Scope & { nodeRef: string }): Promise<JsonObject> {
    const c = await current(input);
    return { schemaVersion: 'gmc.scene-movement-expectation-context/1', expectation: c.expectation as unknown as JsonObject,
      labels: c.labels,
      heads: { artifactRevision: c.artifactRevision, workspaceRevision: c.workspaceRevision,
        preparedSceneRevision: c.preparedSceneRevision, activeSceneRevision: c.active?.revision ?? 0 } };
  }
  async function operation(input: Scope & { operationId: string }): Promise<JsonObject | null> {
    const scope = scopeOf(input); if (!id(input.operationId)) fail('operation_id');
    const saved = await records.findOne({ ...scope, operationId: input.operationId });
    return saved ? { ...saved.receipt, duplicate: true } : null;
  }
  async function commit(input: SceneMovementOutcomeCommit): Promise<JsonObject> {
    const scope = scopeOf(input);
    const { userId: _userId, campaignId: _campaignId, ...transport } = input;
    const selected = input.schemaVersion === PREPARED_CHECK_COMPLETION_AUTHORITY.commit;
    if (sceneMovementSchemaIssues(transport, selected ? SELECTED_PREPARED_MOVEMENT_COMMIT_SCHEMA : SCENE_MOVEMENT_COMMIT_SCHEMA).length) fail('input');
    const expectedKeys = ['userId', 'campaignId', 'programId', 'schemaVersion', 'operationId', 'idempotencyKey', 'nodeRef',
      'expectedArtifactRevision', 'expectedWorkspaceRevision', 'expectedPreparedSceneRevision', 'expectedActiveSceneRevision',
      'sourceSceneTurnReceiptRef', 'expectation', 'proposal', 'sourceKind', 'humanDecision', ...(selected ? ['selectedCheckSource'] : [])];
    if (Object.keys(input).length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(input, key))
      || ![SCENE_MOVEMENT_OUTCOME_AUTHORITY.commit, PREPARED_CHECK_COMPLETION_AUTHORITY.commit].includes(input.schemaVersion) || !id(input.operationId)
      || input.idempotencyKey !== input.operationId || !id(input.nodeRef) || !id(input.sourceSceneTurnReceiptRef)) fail('input');
    const requestFingerprint = freeformJsonDigest(input);
    const prior = await records.findOne({ ...scope, operationId: input.operationId });
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('idempotency');
      return { ...prior.receipt, duplicate: true };
    }
    if (!allowed.includes(scope.campaignId)) fail('writes_paused');
    if (await records.findOne({ ...scope, nodeRef: input.nodeRef })) fail('outcome_already_exists');
    const c = await current(input);
    if (freeformJsonDigest(c.expectation) !== freeformJsonDigest(input.expectation)
      || input.expectedArtifactRevision !== c.artifactRevision || input.expectedWorkspaceRevision !== c.workspaceRevision
      || input.expectedPreparedSceneRevision !== c.preparedSceneRevision || !c.active
      || input.expectedActiveSceneRevision !== c.active.revision || c.active.latestReceiptRef !== input.sourceSceneTurnReceiptRef) fail('heads');
    const source = await sceneTurns.findOne({ userId: scope.userId, campaignId: scope.campaignId, sceneKitId: c.sceneKitId, receiptRef: input.sourceSceneTurnReceiptRef });
    const instruction = c.artifact.instruction as JsonObject;
    const expectedPrefix = `${instruction.interactionId}:compound:${input.nodeRef}:`;
    const memberRefs = parallelPresentationNodeRefs(c.artifact.program, c.artifact.cursor, input.nodeRef);
    const singletonSource = memberRefs.length === 1 && source?.interactionId.startsWith(expectedPrefix) && /^[0-9]+$/.test(source.interactionId.slice(expectedPrefix.length));
    const cohortSource = memberRefs.length > 1 && source && !sceneMovementCohortSourceIssues(c.artifact, source as unknown as JsonObject, input.nodeRef, input.proposal).length;
    let selectedSource = false;
    if (selected && source) {
      const ledger = await readLedger({ userId: scope.userId, campaignId: scope.campaignId,
        interactionId: String(input.selectedCheckSource?.mechanicsInteractionId ?? '') });
      selectedSource = !!ledger && !selectedPreparedMovementSourceIssues({ artifact: c.artifact,
        source: source as unknown as JsonObject, ledger: ledger as unknown as JsonObject,
        proof: input.selectedCheckSource, expectation: c.expectation as unknown as JsonObject, human: input.sourceKind === 'human_gm' }).length;
      if (selectedSource && input.sourceKind === 'manual_proposal') {
        const candidate = (c.artifact.saga as JsonObject).pendingModelCandidate as JsonObject;
        const compiled = (candidate.candidate as JsonObject).compiled as JsonObject;
        const branches = ((compiled.rollRequest as JsonObject).preparedOutcome as JsonObject).branches as JsonObject;
        const result = (branches[String(input.selectedCheckSource?.outcomeId)] as JsonObject).movementResult as JsonObject;
        if (input.proposal.result !== result.result || input.proposal.narrationEvidence !== result.narrationEvidence) fail('selected_proposal');
      }
    }
    if (!source || (selected ? !selectedSource : !(singletonSource || cohortSource))
      || source.phase !== (selected ? 'owner_confirmed_mechanic' : 'completed') || source.stateRevisionAfter !== c.active.revision
      || source.sceneKitRef.revision !== c.preparedSceneRevision || !object(source.publishedExchange)
      || typeof source.publishedExchange.assistantNarration !== 'string'
      || sceneMovementOutcomeIssues(input.proposal, c.expectation, source.publishedExchange.assistantNarration).length) fail('source_turn');
    if (input.sourceKind === 'human_gm') {
      const decision = input.humanDecision;
      if (!decision || Object.keys(decision).sort().join(',') !== 'decisionId,reason,result,schemaVersion'
        || decision.schemaVersion !== 'gma.scene-movement-gm-decision/1' || !id(decision.decisionId)
        || decision.result !== input.proposal.result || typeof decision.reason !== 'string' || !decision.reason.trim()
        || Buffer.byteLength(decision.reason, 'utf8') > 2_000) fail('human_decision');
    } else if (input.sourceKind !== 'manual_proposal' || input.humanDecision !== null) fail('source_kind');
    // Compare again after all read/validation work. No stale result can authorize
    // sensing; activation also rechecks this immutable outcome and current heads.
    const latest = await current(input);
    if (latest.artifactRevision !== c.artifactRevision || latest.workspaceRevision !== c.workspaceRevision
      || latest.preparedSceneRevision !== c.preparedSceneRevision || latest.active?.revision !== c.active.revision
      || latest.active.latestReceiptRef !== source.receiptRef || freeformJsonDigest(latest.expectation) !== freeformJsonDigest(c.expectation)) fail('concurrent_heads');
    const _id = `movement-outcome:${freeformJsonDigest({ ...scope, operationId: input.operationId }).slice(0, 40)}`;
    const receipt: JsonObject = { schemaVersion: SCENE_MOVEMENT_OUTCOME_AUTHORITY.receipt, receiptRef: _id,
      operationId: input.operationId, requestFingerprint, disposition: 'committed', duplicate: false, campaignId: scope.campaignId,
      programRef: scope.programId, nodeRef: input.nodeRef, expectation: c.expectation as unknown as JsonObject,
      sourceSceneTurnReceiptRef: source.receiptRef, sourceSceneTurnFingerprint: freeformJsonDigest(source),
      result: input.proposal.result, executionResult: input.proposal.result === 'reached' ? 'succeeded' : 'failed',
      proposalFingerprint: freeformJsonDigest(input.proposal), sourceKind: input.sourceKind,
      humanDecisionFingerprint: input.humanDecision ? freeformJsonDigest(input.humanDecision) : null,
      authorityHead: { artifactRevision: c.artifactRevision, workspaceRevision: c.workspaceRevision,
        preparedSceneRevision: c.preparedSceneRevision, activeSceneRevision: c.active.revision } };
    try { await records.insertOne({ ...scope, _id, operationId: input.operationId, nodeRef: input.nodeRef, requestFingerprint, receipt, createdAt: new Date() }); }
    catch (error) {
      if (!duplicate(error)) throw error;
      const raced = await records.findOne({ ...scope, operationId: input.operationId });
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('concurrent_outcome');
      return { ...raced.receipt, duplicate: true };
    }
    return receipt;
  }
  return { expectation, commit, operation };
}
