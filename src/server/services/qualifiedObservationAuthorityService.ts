import type { Collection } from 'mongodb';
import { assertRelocationPositionContinuity } from './relocationPositionContinuity.js';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { projectAppliedIntentBindings } from '../../shared/llm/scenePendingIntentApplication.js';
import { deriveQualifiedSensoryProjection, type QualifiedSensoryFact, type QualifiedSensoryOutcome } from '../../shared/llm/qualifiedObservation.js';
import { pendingObserverEvidenceIssues, type PendingObserverEvidence } from '../../shared/llm/pendingObserverEvidence.js';
import { confirmedRelocationLineageIssues, type ConfirmedRelocationLineage } from '../../shared/llm/confirmedRelocationLineage.js';
import { actorMechanicsLinkService } from './actorMechanicsLinkStore.js';
import { readActiveCompoundActionArtifact } from './compoundActionArtifactStore.js';
import { readActiveSceneReality } from './sceneRealityReadinessService.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { assertFreeformProgramWorkflowOpen } from './freeformWorkflowAuthority.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';

export const QUALIFIED_OBSERVATION_PROJECTION_VERSION = 'gmc.observation-authority-projection/2';
export const QUALIFIED_OBSERVATION_COMMIT_VERSION = 'gmc.observation-authority-commit/2';
export const QUALIFIED_OBSERVATION_RECEIPT_VERSION = 'gmc.observation-authority-receipt/2';
export const CONTINUATION_OBSERVATION_PROJECTION_VERSION = 'gmc.observation-authority-projection/3';
export const CONTINUATION_OBSERVATION_COMMIT_VERSION = 'gmc.observation-authority-commit/3';
export const CONTINUATION_OBSERVATION_RECEIPT_VERSION = 'gmc.observation-authority-receipt/3';
type Scope = { userId: string; campaignId: string; programId: string; version?: '2' | '3' };
/** Only references, owner heads and a receipt: never a mutable copy of world facts. */
export interface QualifiedObservationActivation extends Scope {
  _id: string; operationId: string; requestFingerprint: string; bindingRecordRef: string; evidenceRef: string;
  nodeRef: string; groupId: string; movementReceiptRef: string; bundleId: string; bundleRevision: number;
  workspaceRevision: number; preparedSceneRevision: number; vcsSubjectRevision: string; vcsCharacterRevision: string;
  receipt: JsonObject; createdAt: Date;
  relocationLineageRef?: string | null;
}
export interface QualifiedObservationDependencies {
  records?: Pick<Collection<QualifiedObservationActivation>, 'findOne' | 'insertOne' | 'find'>;
  readArtifact?: typeof readActiveCompoundActionArtifact;
  readReality?: typeof readActiveSceneReality;
  readLegacy?: typeof readObservationAuthority;
  readLinks?: ReturnType<typeof actorMechanicsLinkService>['read'];
  assertWorkflowOpen?: (scope: Scope, binding: JsonObject | undefined) => Promise<void>;
  assertPositionContinuity?: typeof assertRelocationPositionContinuity;
  writeCampaignAllowlist?: string[];
}
export interface QualifiedObservationCommit extends Scope {
  schemaVersion: typeof QUALIFIED_OBSERVATION_COMMIT_VERSION | typeof CONTINUATION_OBSERVATION_COMMIT_VERSION; operationId: string; idempotencyKey: string;
  expectedArtifactRevision: number; expectedWorkspaceRevision: number; expectedPreparedSceneRevision: number;
  bindingRecordRef: string; evidenceRef: string; nodeRef: string; groupId: string; movementReceiptRef: string;
  relocationLineageRef?: string | null;
  vcsProjection: { status: string; operationRequired: unknown; subjectRef: string; subjectRevision: string; characterRevision: string;
    currentForm: string | null; capabilityRefs: string[]; specialSenseRefs: string[];
    binding: { state: string; ownerRef: string; storyActorRef: string; storyCampaignRef: string; subjectRef: string;
      subjectRevision: string; characterRevision: string; provenanceReceiptRefs: string[] } };
}
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): JsonObject[] => Array.isArray(value) ? value.filter(object) : [];
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
function fail(field: string): never { throw new StoryWorkspaceStoreError(409, 'QUALIFIED_OBSERVATION_AUTHORITY_CONFLICT', 'The saved movement or prepared sensing authority no longer matches this observation.', { field }); }
const duplicate = (error: unknown): boolean => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

/** Receipt-conditioned activation on the existing observation boundary. */
export function qualifiedObservationAuthorityService(deps: QualifiedObservationDependencies = {}) {
  const records = deps.records ?? getDb().collection<QualifiedObservationActivation>('gmc_qualified_observation_activations');
  const readArtifact = deps.readArtifact ?? readActiveCompoundActionArtifact;
  const readReality = deps.readReality ?? readActiveSceneReality;
  const readLegacy = deps.readLegacy ?? readObservationAuthority;
  const readLinks = deps.readLinks ?? actorMechanicsLinkService().read;
  if (deps.readArtifact && !deps.assertWorkflowOpen) throw new Error('Injected action authority requires an explicit workflow guard.');
  const workflow = deps.assertWorkflowOpen ?? assertFreeformProgramWorkflowOpen;
  const allowed = deps.writeCampaignAllowlist ?? (process.env.GMC_PENDING_OBSERVER_QUALIFICATION === '1'
    ? String(process.env.GMC_PENDING_OBSERVER_CAMPAIGN_ALLOWLIST ?? '').split(',').map((row) => row.trim()).filter(Boolean) : []);
  function scopeOf(input: Scope): Scope {
    if (![input.userId, input.campaignId, input.programId].every(id)) fail('scope');
    return { userId: input.userId, campaignId: input.campaignId, programId: input.programId };
  }
  async function readOwners(scope: Scope) {
    const [loaded, active, legacy] = await Promise.all([readArtifact(scope), readReality(scope), readLegacy(scope)]);
    const identity = await readLinks(scope, legacy);
    return { loaded, active, legacy, identity };
  }
  async function current(input: Scope, nodeRef: string, groupId: string, bindingRecordRef: string, evidenceRef: string, movementReceiptRef: string,
    owners?: Awaited<ReturnType<typeof readOwners>>) {
    const scope = scopeOf(input);
    const { loaded, active, legacy, identity } = owners ?? await readOwners(scope);
    if (!loaded?.artifact || !object(active?.bundle)) fail('owners');
    const artifact = loaded.artifact as unknown as JsonObject, bundle = active.bundle;
    const application = rows(artifact.intentBindingApplications).find((row) => object(row.record) && row.record.recordId === bindingRecordRef);
    const record = application?.record;
    if (!object(record) || !['gmc.scene-pending-intent-binding-record/2', 'gmc.scene-pending-intent-binding-record/3', 'gmc.scene-pending-intent-binding-record/4', 'gmc.scene-pending-intent-binding-record/5'].includes(String(record.schemaVersion))
      || !object(bundle.pendingIntentBindingRecord) || bundle.pendingIntentBindingRecord.recordId !== record.recordId
      || !object(record.bindings) || !object(bundle.activeBundle) || !object(bundle.sceneKit)
      || freeformJsonDigest(record) !== freeformJsonDigest(bundle.pendingIntentBindingRecord)) fail('binding_record');
    if (!object(artifact.instruction) || !object(artifact.program)) fail('program');
    const program = projectAppliedIntentBindings(artifact.instruction, artifact.program, rows(artifact.intentBindingApplications)) as JsonObject;
    const evidence = rows(record.qualifiedObservers).find((row) => row.evidenceRef === evidenceRef) as unknown as PendingObserverEvidence;
    const binding = rows(record.bindings.nodes).find((row) => row.nodeRef === nodeRef);
    const selection = rows(binding?.observations).find((row) => row.groupId === groupId);
    const node = rows(program.nodes).find((row) => row.nodeId === nodeRef);
    const group = rows(node?.observationGroups).find((row) => row.groupId === groupId);
    if (!evidence || pendingObserverEvidenceIssues(evidence).length || evidence.nodeRef !== nodeRef || evidence.groupId !== groupId
      || evidence.programRef !== scope.programId || evidence.campaignId !== scope.campaignId
      || !selection || selection.ownerEvidenceRef !== evidence.evidenceRef || !id(selection.viewpointZoneRef)
      || freeformJsonDigest(selection.viewpointCondition) !== freeformJsonDigest(evidence.viewpointCondition)
      || !node || !group || group.observerRef !== evidence.observerRef || group.methodRef !== evidence.methodRef || group.formRef !== evidence.formRef
      || !['after_relocation', 'confirmed_relocation'].includes(evidence.viewpointCondition.kind)) fail('qualification');
    const continuation = ['gmc.scene-pending-intent-binding-record/3', 'gmc.scene-pending-intent-binding-record/4', 'gmc.scene-pending-intent-binding-record/5'].includes(String(record.schemaVersion));
    if (evidence.schemaVersion !== (continuation ? 'gmc.pending-observer-evidence/2' : 'gmc.pending-observer-evidence/1')) fail('evidence_version');
    let lineage: ConfirmedRelocationLineage | null = null;
    if (evidence.viewpointCondition.kind === 'confirmed_relocation') {
      const condition = evidence.viewpointCondition;
      lineage = rows(record.confirmedRelocations).find((row) => row.lineageRef === condition.lineageRef) as unknown as ConfirmedRelocationLineage ?? null;
      if (!continuation || !lineage || confirmedRelocationLineageIssues(lineage, artifact).length
        || lineage.movementReceiptRef !== movementReceiptRef || lineage.observationNodeRef !== nodeRef || lineage.groupId !== groupId
        || lineage.observerRef !== evidence.observerRef || lineage.actorLinkRef !== evidence.actorLinkRef
        || lineage.destinationRef !== condition.destinationRef || lineage.destinationZoneRef !== selection.viewpointZoneRef
        || freeformJsonDigest(lineage.sourceHead) !== freeformJsonDigest(evidence.sourceHead)) fail('relocation_lineage');
    }
    const moveRef = evidence.viewpointCondition.kind === 'after_relocation' ? evidence.viewpointCondition.nodeRef : lineage?.moveNodeRef;
    if (!moveRef) fail('movement_lineage');
    const move = rows(program.nodes).find((row) => row.nodeId === moveRef);
    const cursor = artifact.cursor;
    const receipts = rows(artifact.receipts);
    const receiptIndex = receipts.findIndex((row) => row.receiptId === movementReceiptRef && row.nodeId === moveRef
      && row.programId === scope.programId && row.lifecycle === 'settled' && row.result === 'succeeded');
    const actorRefs = move ? [...rows(move.dataRequirements).filter((row) => row.targetRole === 'actor').map((row) => row.targetRef), move.actorRef].filter(Boolean) : [];
    const frame = rows(bundle.actorFrames).find((row) => row.actorRef === evidence.observerRef);
    if (!move || move.kind !== 'move' || !object(cursor) || !Array.isArray(cursor.completedNodeRefs)
      || !cursor.completedNodeRefs.includes(moveRef) || receiptIndex < 0 || !actorRefs.length
      || actorRefs.some((ref) => ref !== evidence.observerRef && ref !== frame?.actorFrameId)) fail('movement_receipt');
    const laterMoves = receipts.slice(receiptIndex + 1).filter((receipt) => receipt.result === 'succeeded').map((receipt) =>
      rows(program.nodes).find((row) => row.nodeId === receipt.nodeId)).filter((row): row is JsonObject => !!row && row.kind === 'move');
    if (laterMoves.some((row) => row.actorRef === evidence.observerRef || rows(row.dataRequirements).some((requirement) =>
      requirement.targetRole === 'actor' && [evidence.observerRef, frame?.actorFrameId].includes(requirement.targetRef)))) fail('later_movement');
    const location = object(move.semanticLocationBindings) ? rows(move.semanticLocationBindings.bindings).filter((row) => row.role === 'destination') : [];
    const element = rows(bundle.elements).find((row) => row.elementId === location[0]?.authorityRef);
    if (location.length !== 1 || (element?.zoneRef ?? location[0].authorityRef) !== selection.viewpointZoneRef
      || !object(record.bindings.sceneKitRef) || record.bindings.sceneKitRef.sceneKitId !== bundle.sceneKit.sceneKitId
      || record.bindings.sceneKitRef.revision !== bundle.sceneKit.revision) fail('destination');
    const link = identity.links.find((row) => row.linkRef === evidence.actorLinkRef && row.actorRef === evidence.observerRef);
    if (!link || legacy.workspaceRef.revision !== evidence.sourceHead.workspaceRevision
      || legacy.sceneKitRef.payloadFingerprint !== evidence.sourceHead.payloadFingerprint) fail('identity_or_source');
    await (deps.assertPositionContinuity ?? assertRelocationPositionContinuity)(scope, artifact,
      { ...(lineage ?? { sourceHead: evidence.sourceHead, moveNodeRef: moveRef, bindingRecordRef, observerRef: evidence.observerRef,
        destinationRef: String(location[0].authorityRef), destinationZoneRef: String(selection.viewpointZoneRef),
        observationNodeRef: nodeRef, groupId }), requireMovementOutcome: continuation });
    const outcomes = rows(node.dataRequirements).filter((row) => row.kind === 'observation' && object(row.observation)
      && Array.isArray(group.outcomeIds) && group.outcomeIds.includes(row.observation.outcomeId)).map((row) => row.observation) as unknown as QualifiedSensoryOutcome[];
    const affordances = rows(bundle.sceneStoryDesign && object(bundle.sceneStoryDesign) ? bundle.sceneStoryDesign.affordances : []);
    const coverRefs = rows(binding?.coverage).map((row) => row.coverageEntryRef);
    const sensory = affordances.filter((row) => coverRefs.includes(row.coverageEntryId) && row.actionFamily === 'observe'
      && row.accessClass === `pending-viewpoint:${freeformJsonDigest({ evidenceRef: evidence.evidenceRef, condition: evidence.viewpointCondition }).slice(0, 40)}`
      && row.capabilityClass === evidence.capabilityRef && row.zoneRef === selection.viewpointZoneRef);
    if (!sensory.length || !Array.isArray(group.outcomeIds) || outcomes.length !== group.outcomeIds.length) fail('sensory_scope');
    const factRefs = [...new Set(sensory.flatMap((row) => Array.isArray(row.factRefs) ? row.factRefs.map(String) : []))];
    return { scope, loaded, artifact, bundle, legacy, record, evidence, selection, node, group, link, outcomes, factRefs, continuation, lineage,
      affordanceRef: String(sensory[0].affordanceId ?? sensory[0].coverageEntryId) };
  }
  async function operation(input: Scope & { operationId: string }): Promise<JsonObject | null> {
    const scope = scopeOf(input);
    if (!id(input.operationId)) fail('operation');
    const saved = await records.findOne({ ...scope, operationId: input.operationId });
    if (saved && saved.receipt.schemaVersion !== (input.version === '3' ? CONTINUATION_OBSERVATION_RECEIPT_VERSION : QUALIFIED_OBSERVATION_RECEIPT_VERSION)) fail('reader_version');
    return saved ? { ...saved.receipt, duplicate: true } : null;
  }
  async function commit(input: QualifiedObservationCommit): Promise<JsonObject> {
    const scope = scopeOf(input);
    const continuation = input.schemaVersion === CONTINUATION_OBSERVATION_COMMIT_VERSION;
    if (!continuation && input.schemaVersion !== QUALIFIED_OBSERVATION_COMMIT_VERSION || !id(input.operationId)
      || input.idempotencyKey !== input.operationId) fail('operation');
    const requestFingerprint = freeformJsonDigest(input);
    const prior = await records.findOne({ ...scope, operationId: input.operationId });
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('idempotency');
      return { ...prior.receipt, duplicate: true };
    }
    if (!allowed.includes(scope.campaignId)) fail('writes_paused');
    const occupied = await records.findOne({ ...scope, bindingRecordRef: input.bindingRecordRef, nodeRef: input.nodeRef, groupId: input.groupId });
    if (occupied) fail('activation_already_exists');
    const c = await current(scope, input.nodeRef, input.groupId, input.bindingRecordRef, input.evidenceRef, input.movementReceiptRef);
    if (c.continuation !== continuation || continuation && input.relocationLineageRef !== (c.lineage?.lineageRef ?? null)
      || !continuation && Object.hasOwn(input, 'relocationLineageRef')) fail('lineage_version');
    await workflow(scope, object(c.artifact.freeformBinding) ? c.artifact.freeformBinding : undefined);
    if (c.loaded.artifactRef.revision !== input.expectedArtifactRevision || c.legacy.workspaceRef.revision !== input.expectedWorkspaceRevision
      || c.bundle.sceneKit && object(c.bundle.sceneKit) && c.bundle.sceneKit.revision !== input.expectedPreparedSceneRevision
      || !object(c.artifact.cursor) || (c.artifact.cursor.completedNodeRefs as string[]).includes(input.nodeRef)
      || (c.artifact.cursor.skippedNodeRefs as string[]).includes(input.nodeRef)) fail('heads');
    const vcs = input.vcsProjection, e = c.evidence;
    if (vcs?.status !== 'ready' || vcs.operationRequired !== null || vcs.subjectRef !== e.mechanicsSubjectRef
      || vcs.subjectRevision !== e.vcsSubjectRevision || vcs.characterRevision !== e.vcsCharacterRevision || vcs.currentForm !== e.currentForm
      || vcs.binding?.state !== 'active' || vcs.binding.ownerRef !== e.vcsOwnerRef || vcs.binding.storyActorRef !== e.observerRef
      || vcs.binding.storyCampaignRef !== scope.campaignId || vcs.binding.subjectRef !== vcs.subjectRef
      || vcs.binding.subjectRevision !== vcs.subjectRevision || vcs.binding.characterRevision !== vcs.characterRevision
      || !e.ownerReceiptRefs.every((ref) => vcs.binding.provenanceReceiptRefs?.includes(ref))
      || ![...(vcs.capabilityRefs ?? []), ...(vcs.specialSenseRefs ?? [])].includes(e.methodRef)) fail('vcs_head');
    const receiptRef = `qualified-access:${freeformJsonDigest({ ...scope, operationId: input.operationId }).slice(0, 40)}`;
    const accessRef = `qualified-access-row:${freeformJsonDigest({ evidenceRef: e.evidenceRef, receiptRef }).slice(0, 40)}`;
    deriveQualifiedSensoryProjection({ evidence: e, viewpointZoneRef: String(c.selection.viewpointZoneRef), accessRef, activationReceiptRef: receiptRef,
      affordanceRef: c.affordanceRef, factRefs: c.factRefs, facts: rows(c.bundle.facts) as unknown as QualifiedSensoryFact[], outcomes: c.outcomes });
    const activeBundle = c.bundle.activeBundle as JsonObject;
    const receipt: JsonObject = { schemaVersion: continuation ? CONTINUATION_OBSERVATION_RECEIPT_VERSION : QUALIFIED_OBSERVATION_RECEIPT_VERSION, receiptRef, operationId: input.operationId,
      disposition: 'committed', duplicate: false, programId: scope.programId, nodeRef: input.nodeRef, groupId: input.groupId,
      bindingRecordRef: input.bindingRecordRef, evidenceRef: input.evidenceRef, movementReceiptRef: input.movementReceiptRef,
      accessRef, viewpointRef: c.selection.viewpointZoneRef, bundleRef: { bundleId: activeBundle.bundleId, revision: activeBundle.revision },
      ...(continuation ? { relocationLineageRef: c.lineage?.lineageRef ?? null } : {}) };
    const row: QualifiedObservationActivation = { ...scope, _id: receiptRef, operationId: input.operationId, requestFingerprint,
      bindingRecordRef: input.bindingRecordRef, evidenceRef: input.evidenceRef, nodeRef: input.nodeRef, groupId: input.groupId,
      movementReceiptRef: input.movementReceiptRef, bundleId: String(activeBundle.bundleId), bundleRevision: Number(activeBundle.revision),
      workspaceRevision: input.expectedWorkspaceRevision, preparedSceneRevision: input.expectedPreparedSceneRevision,
      vcsSubjectRevision: vcs.subjectRevision, vcsCharacterRevision: vcs.characterRevision, receipt, createdAt: new Date(),
      ...(continuation ? { relocationLineageRef: c.lineage?.lineageRef ?? null } : {}) };
    try { await records.insertOne(row); }
    catch (error) {
      if (!duplicate(error)) throw error;
      const raced = await records.findOne({ ...scope, operationId: input.operationId });
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('idempotency');
      return { ...raced.receipt, duplicate: true };
    }
    return receipt;
  }
  async function read(input: Scope): Promise<JsonObject> {
    const scope = scopeOf(input);
    const owners = await readOwners(scope), { legacy, active } = owners;
    if (!object(active?.bundle) || !object(active.bundle.sceneKit)) fail('prepared_scene');
    const bundle = active.bundle;
    const bindingRecord = bundle.pendingIntentBindingRecord;
    const continuation = object(bindingRecord) && ['gmc.scene-pending-intent-binding-record/3', 'gmc.scene-pending-intent-binding-record/4', 'gmc.scene-pending-intent-binding-record/5'].includes(String(bindingRecord.schemaVersion));
    if (continuation !== (input.version === '3')) fail('reader_version');
    const saved = object(bindingRecord) ? await records.find({ ...scope, bindingRecordRef: String(bindingRecord.recordId) }).limit(33).toArray() : [];
    if (saved.length > 32) fail('budget');
    const access: JsonObject[] = [], observables: JsonObject[] = [], obstructions: JsonObject[] = [], links: JsonObject[] = [], activations: JsonObject[] = [];
    for (const row of saved) {
      const c = await current(scope, row.nodeRef, row.groupId, row.bindingRecordRef, row.evidenceRef, row.movementReceiptRef, owners);
      await workflow(scope, object(c.artifact.freeformBinding) ? c.artifact.freeformBinding : undefined);
      if (row.bundleId !== (c.bundle.activeBundle as JsonObject).bundleId || row.bundleRevision !== (c.bundle.activeBundle as JsonObject).revision
        || row.preparedSceneRevision !== (c.bundle.sceneKit as JsonObject).revision || row.workspaceRevision !== c.legacy.workspaceRef.revision) fail('activation_stale');
      const projection = deriveQualifiedSensoryProjection({ evidence: c.evidence, viewpointZoneRef: String(c.selection.viewpointZoneRef),
        accessRef: String(row.receipt.accessRef), activationReceiptRef: row._id, affordanceRef: c.affordanceRef,
        factRefs: c.factRefs, facts: rows(c.bundle.facts) as unknown as QualifiedSensoryFact[], outcomes: c.outcomes });
      access.push(...projection.observationAccess as JsonObject[]); observables.push(...projection.observables as JsonObject[]);
      obstructions.push(...projection.obstructions as JsonObject[]);
      links.push(c.link as unknown as JsonObject); activations.push(row.receipt);
    }
    const kit = bundle.sceneKit as JsonObject;
    const result = { schemaVersion: continuation ? CONTINUATION_OBSERVATION_PROJECTION_VERSION : QUALIFIED_OBSERVATION_PROJECTION_VERSION, workspaceRef: legacy.workspaceRef as unknown as JsonObject,
      sceneKitRef: { sceneKitId: kit.sceneKitId, revision: kit.revision, schemaVersion: kit.schemaVersion, payloadFingerprint: freeformJsonDigest(kit) },
      preparationState: saved.length ? 'ready' : 'qualified_access_required', programId: scope.programId,
      actorCandidates: rows(bundle.actorFrames).map((frame) => ({ actorRef: frame.actorRef, actorKind: 'present_actor', recordRef: frame.actorFrameId, recordRevision: frame.revision,
        label: frame.publicLabel })), actorMechanicsLinks: [...new Map(links.map((link) => [link.linkRef, link])).values()],
      actorMechanicsBindings: [], derivedActorCandidates: [], observationAccess: access, observables, obstructions,
      referenceCatalog: [...new Set([...rows(bundle.zones).map((row) => row.zoneId), ...rows(bundle.elements).map((row) => row.elementId),
        ...rows(bundle.actorFrames).flatMap((row) => [row.actorFrameId, row.actorRef])])],
      activations, privatePreparationContext: structuredClone(kit) };
    if (observables.length > 64 || obstructions.length > 32 || Buffer.byteLength(JSON.stringify(result), 'utf8') > 65_536) fail('projection_budget');
    return result;
  }
  return { commit, read, operation };
}
