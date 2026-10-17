import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { PENDING_OBSERVER_EVIDENCE_VERSION, CONTINUATION_OBSERVER_EVIDENCE_VERSION, pendingObserverEvidenceIssues, type PendingObserverEvidence,
  type ObserverOrigin, type ObserverViewpointCondition } from '../../shared/llm/pendingObserverEvidence.js';
import { actorMechanicsLinkService } from './actorMechanicsLinkStore.js';
import { readScenePendingIntentContext } from './scenePendingIntentService.js';
import { readActiveSceneReality } from './sceneRealityReadinessService.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';
import type { PendingIntentWindowSource } from '../../shared/llm/pendingIntentWindow.js';
import { readActiveCompoundActionArtifact } from './compoundActionArtifactStore.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { assertFreeformProgramWorkflowOpen } from './freeformWorkflowAuthority.js';
import { conditionalViewpointRef } from '../../shared/llm/scenePendingIntentQualified.js';
import { deriveConfirmedRelocationLineage } from '../../shared/llm/confirmedRelocationLineage.js';
import { readInstructionWindowCoverage, type InstructionCoverageDependencies } from './instructionWindowCoverageService.js';
import { assertRelocationPositionContinuity } from './relocationPositionContinuity.js';

type Scope = { userId: string; campaignId: string; programId: string; continuation?: boolean };
/** Immutable human-GM starting-position provenance for one exact window. */
export interface ObserverOriginDocument extends Scope { _id: string; operationId: string; windowFingerprint: string;
  actorLinkRef: string; origin: ObserverOrigin; requestFingerprint: string; createdAt: Date }
/** Owner qualification never asserts movement or observation completion. */
export interface ObserverEvidenceDocument extends Scope { _id: string; windowFingerprint: string; groupId: string;
  evidence: PendingObserverEvidence; requestFingerprint: string; createdAt: Date }
/** Injected authoritative readers, guarded writers and scoped ledgers. */
export interface ObserverEvidenceDependencies {
  records?: Pick<Collection<ObserverEvidenceDocument>, 'findOne' | 'insertOne' | 'find'>;
  continuationRecords?: Pick<Collection<ObserverEvidenceDocument>, 'findOne' | 'insertOne' | 'find'>;
  readArtifact?: typeof readActiveCompoundActionArtifact;
  instructionCoverage?: InstructionCoverageDependencies;
  assertPositionContinuity?: typeof assertRelocationPositionContinuity;
  origins?: Pick<Collection<ObserverOriginDocument>, 'findOne' | 'insertOne' | 'find'>;
  readPending?: typeof readScenePendingIntentContext;
  readLinks?: ReturnType<typeof actorMechanicsLinkService>['read'];
  readReality?: typeof readActiveSceneReality;
  assertWorkflowOpen?: (scope: Scope) => Promise<void>;
  writeCampaignAllowlist?: string[];
}
/** Current VCS capability projection, distinct from historical identity stamps. */
export interface ObserverCapabilityEvidence {
  schemaVersion: string; status: string; subjectRef: string; subjectRevision: string; characterRevision: string;
  currentForm: string | null; intendedForm: string | null; operationRequired: unknown;
  modalities: string[]; capabilityRefs: string[]; specialSenseRefs: string[]; mobilityRefs: string[];
  binding: { ownerRef: string; subjectRef: string; subjectRevision: string; characterRecordRef: string; characterRevision: string;
    storyActorRef: string; storyCampaignRef: string; state: string; provenanceReceiptRefs: string[] };
}
/** Existing exact pending group and current VCS proof; no model-authored truth. */
export interface PendingObserverQualificationInput extends Scope {
  schemaVersion?: 'gmc.pending-observer-qualification/2'; nodeRef: string; groupId: string; actorLinkRef: string;
  originRef?: string; expectedWindowFingerprint: string; vcsProjection: ObserverCapabilityEvidence;
}
/** Protected qualification/origin API, with discovery retained during rollback. */
export interface PendingObserverEvidenceService {
  qualify(input: PendingObserverQualificationInput): Promise<{ evidence: PendingObserverEvidence; duplicate: boolean }>;
  read(input: Scope): Promise<PendingObserverEvidence[]>;
  context(input: Scope): Promise<JsonObject>;
  confirmOrigin(input: Scope & { operationId: string; actorLinkRef: string; expectedWindowFingerprint: string; description: string }): Promise<{ originRef: string; origin: ObserverOrigin; duplicate: boolean }>;
  originOperation(input: Scope & { operationId: string }): Promise<ObserverOriginDocument | null>;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
function fail(code: string): never { throw new StoryWorkspaceStoreError(409, code, 'The familiar starting state or sensing ability could not be confirmed safely.', {}); }
const duplicate = (e: unknown): boolean => !!e && typeof e === 'object' && 'code' in e && e.code === 11000;
const scopeOf = (input: Scope): Scope => {
  if (![input.userId, input.campaignId, input.programId].every(id)) fail('OBSERVER_QUALIFICATION_SCOPE_INVALID');
  return { userId: input.userId, campaignId: input.campaignId, programId: input.programId };
};
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);

/** Owner-stamped immutable qualification. No provider, VCS mutation or action advancement. */
export function pendingObserverEvidenceService(deps: ObserverEvidenceDependencies = {}): PendingObserverEvidenceService {
  const records = deps.records ?? getDb().collection<ObserverEvidenceDocument>('gma_pending_observers');
  const continuationRecords = (): NonNullable<ObserverEvidenceDependencies['continuationRecords']> => deps.continuationRecords
    ?? getDb().collection<ObserverEvidenceDocument>('gma_pending_observers_v2');
  const origins = deps.origins ?? getDb().collection<ObserverOriginDocument>('gma_observer_origins');
  const readReality = deps.readReality ?? readActiveSceneReality;
  if (deps.readPending && !deps.assertWorkflowOpen) throw new Error('Injected pending ownership requires an explicit workflow guard.');
  const allowed = deps.writeCampaignAllowlist ?? (process.env.GMC_PENDING_OBSERVER_QUALIFICATION === '1'
    ? String(process.env.GMC_PENDING_OBSERVER_CAMPAIGN_ALLOWLIST ?? '').split(',').map((row) => row.trim()).filter(Boolean) : []);
  const requireWrite = (scope: Scope): void => { if (!allowed.includes(scope.campaignId)) fail('OBSERVER_QUALIFICATION_WRITES_PAUSED'); };
  /** Discover an uncertain origin save without reopening a closed workflow or writing again. */
  async function originOperation(input: Scope & { operationId: string }): Promise<ObserverOriginDocument | null> {
    const scope = scopeOf(input);
    if (!id(input.operationId)) fail('OBSERVER_ORIGIN_DECISION_INVALID');
    return origins.findOne({ ...scope, operationId: input.operationId });
  }
  async function current(input: Scope) {
    const scope = scopeOf(input);
    let pending: JsonObject;
    let readLinks: () => ReturnType<ReturnType<typeof actorMechanicsLinkService>['read']>;
    if (deps.readPending) {
      await deps.assertWorkflowOpen!(scope);
      pending = await deps.readPending(scope);
      readLinks = () => (deps.readLinks ?? actorMechanicsLinkService().read)(scope);
    } else {
      const loaded = await readActiveCompoundActionArtifact(scope);
      if (!loaded?.artifact) fail('OBSERVER_QUALIFICATION_CONTEXT_INVALID');
      await assertFreeformProgramWorkflowOpen(scope, loaded.artifact.freeformBinding);
      const authority = await readObservationAuthority(scope);
      pending = await readScenePendingIntentContext(scope, { readArtifact: async () => loaded, readObservation: async () => authority });
      readLinks = () => (deps.readLinks ?? actorMechanicsLinkService().read)(scope, authority);
    }
    if (!object(pending.window) || !object(pending.source) || !object(pending.typedObservationAuthority)
      || !object(pending.typedObservationAuthority.sceneKitRef)) fail('OBSERVER_QUALIFICATION_CONTEXT_INVALID');
    const window = pending.window, sceneRef = pending.typedObservationAuthority.sceneKitRef;
    const source = pending.source as unknown as PendingIntentWindowSource;
    const readIdentity = readLinks;
    let identityRead: ReturnType<typeof readLinks> | undefined;
    readLinks = () => identityRead ??= readIdentity();
    if (input.continuation) {
      const loaded = await (deps.readArtifact ?? readActiveCompoundActionArtifact)(scope);
      if (!loaded?.artifact) fail('OBSERVER_QUALIFICATION_CONTEXT_INVALID');
      const hierarchy = await readInstructionWindowCoverage(scope, loaded.artifact as unknown as JsonObject, deps.instructionCoverage);
      const links = await readLinks();
      const lineages = [];
      for (const slot of (pending.slots as JsonObject[])) for (const group of (slot.observationGroups as JsonObject[])) {
        const moveRef = String(group.viewpointBinding ?? '').startsWith('after:') ? String(group.viewpointBinding).slice(6) : null;
        if (!moveRef || !source.cursor.completedNodeRefs.includes(moveRef)) continue;
        const matching = links.links.filter((link) => link.subjectKind === group.observerKind
          && (group.observerRef === null || group.observerRef === link.actorRef));
        if (matching.length !== 1) fail('OBSERVER_IDENTITY_LINK_REQUIRED');
        const link = matching[0], ref = sceneRef;
        const lineage = deriveConfirmedRelocationLineage({ ...scope, moveNodeRef: moveRef,
          observationNodeRef: String(slot.nodeRef), groupId: String(group.groupId), observerRef: link.actorRef, actorLinkRef: link.linkRef },
        loaded.artifact as unknown as JsonObject, { workspaceRevision: Number((pending.ownerReadSet as JsonObject).storyWorkspaceRevision),
          sceneKitId: String(ref.sceneKitId), sceneRevision: Number(ref.revision), payloadFingerprint: String(ref.payloadFingerprint) });
        await (deps.assertPositionContinuity ?? assertRelocationPositionContinuity)(scope, loaded.artifact as unknown as JsonObject, { ...lineage, requireMovementOutcome: true });
        lineages.push(lineage);
      }
      pending = { ...pending, schemaVersion: 'gmc.scene-pending-intent-context/3',
        instructionCoverage: hierarchy.instructionCoverage as unknown as JsonObject,
        confirmedRelocations: lineages as unknown as JsonObject[] };
    }
    return { scope, pending, source, window, sceneRef, readLinks };
  }
  async function confirmOrigin(input: Scope & { operationId: string; actorLinkRef: string; expectedWindowFingerprint: string; description: string }) {
    const { scope, window, readLinks } = await current(input);
    requireWrite(scope);
    if (!id(input.operationId) || !id(input.actorLinkRef) || input.expectedWindowFingerprint !== window.windowFingerprint
      || typeof input.description !== 'string' || !input.description.trim() || Buffer.byteLength(input.description) > 2_048) fail('OBSERVER_ORIGIN_DECISION_INVALID');
    const links = await readLinks();
    const link = links.links.find((row) => row.linkRef === input.actorLinkRef);
    if (!link || link.subjectKind !== 'familiar' || !(window.nodes as JsonObject[]).some((node) =>
      ((node.node as JsonObject)?.observationGroups as JsonObject[] ?? []).some((group) => group.observerKind === link.subjectKind
        && (group.observerRef === null || group.observerRef === link.actorRef)))) fail('OBSERVER_IDENTITY_LINK_REQUIRED');
    const requestFingerprint = freeformJsonDigest({ ...scope, operationId: input.operationId, actorLinkRef: input.actorLinkRef,
      windowFingerprint: window.windowFingerprint, description: input.description });
    const _id = `observer-origin:${freeformJsonDigest({ ...scope, windowFingerprint: window.windowFingerprint, actorLinkRef: link.linkRef }).slice(0, 40)}`;
    const prior = await origins.findOne({ ...scope, operationId: input.operationId });
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('OBSERVER_ORIGIN_IDEMPOTENCY_CONFLICT');
      return { originRef: prior._id, origin: prior.origin, duplicate: true };
    }
    const active = await readReality(scope), bundle = object(active?.bundle) ? active.bundle : null;
    const frames = Array.isArray(bundle?.actorFrames) ? bundle.actorFrames.filter(object).filter((row) => row.actorRef === link.actorRef) : [];
    if (frames.length) fail('OBSERVER_ORIGIN_ALREADY_ESTABLISHED');
    const existing = await origins.findOne({ ...scope, windowFingerprint: String(window.windowFingerprint), actorLinkRef: link.linkRef });
    if (existing) fail('OBSERVER_ORIGIN_ALREADY_CONFIRMED');
    const origin: ObserverOrigin = { kind: 'human_gm', zoneRef: null, description: input.description, sourceRefs: [_id] };
    const row: ObserverOriginDocument = { ...scope, _id, operationId: input.operationId, windowFingerprint: String(window.windowFingerprint),
      actorLinkRef: input.actorLinkRef, origin, requestFingerprint, createdAt: new Date() };
    try { await origins.insertOne(row); }
    catch (error) {
      if (!duplicate(error)) throw error;
      const raced = await origins.findOne({ ...scope, operationId: input.operationId });
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('OBSERVER_ORIGIN_IDEMPOTENCY_CONFLICT');
      return { originRef: raced._id, origin: raced.origin, duplicate: true };
    }
    return { originRef: _id, origin, duplicate: false };
  }
  async function qualify(input: PendingObserverQualificationInput) {
    const continuation = input.schemaVersion === 'gmc.pending-observer-qualification/2';
    const { scope, pending, source, window, sceneRef, readLinks } = await current({ ...input, continuation });
    const evidenceRecords = continuation ? continuationRecords() : records;
    requireWrite(scope);
    if (![input.nodeRef, input.groupId, input.actorLinkRef].every(id) || input.expectedWindowFingerprint !== window.windowFingerprint) fail('OBSERVER_QUALIFICATION_CONTEXT_INVALID');
    const node = source.program.nodes.find((row: { nodeId: string }) => row.nodeId === input.nodeRef);
    const group = node?.observationGroups?.find((row: { groupId: string }) => row.groupId === input.groupId);
    if (!group || source.cursor.completedNodeRefs.includes(input.nodeRef) || source.cursor.skippedNodeRefs.includes(input.nodeRef)) fail('OBSERVER_QUALIFICATION_NODE_NOT_PENDING');
    const links = await readLinks(), link = links.links.find((row) => row.linkRef === input.actorLinkRef);
    if (!link || group.observerKind !== link.subjectKind || group.observerRef !== null && group.observerRef !== link.actorRef) fail('OBSERVER_IDENTITY_LINK_REQUIRED');
    const vcs = input.vcsProjection, proof = vcs?.binding;
    if (vcs?.schemaVersion !== 'vcs.observation-capability-projection/1' || vcs.status !== 'ready' || vcs.operationRequired !== null
      || vcs.subjectRef !== link.mechanicsSubjectRef || proof?.subjectRef !== vcs.subjectRef || proof.subjectRevision !== vcs.subjectRevision
      || proof.characterRecordRef !== link.vcsCharacterRef || proof.characterRevision !== vcs.characterRevision
      || proof.ownerRef !== link.vcsOwnerRef || proof.storyActorRef !== link.actorRef
      || proof.storyCampaignRef !== scope.campaignId || proof.state !== 'active' || !proof.provenanceReceiptRefs?.length
      || !/^[a-f0-9]{64}$/.test(vcs.subjectRevision) || !/^[a-f0-9]{64}$/.test(vcs.characterRevision)
      || !Array.isArray(vcs.modalities) || !vcs.modalities.length) fail('OBSERVER_CAPABILITY_UNAVAILABLE');
    const methods = link.subjectKind === 'familiar' ? vcs.specialSenseRefs : vcs.capabilityRefs;
    if (!Array.isArray(methods) || methods.length !== 1 || !id(methods[0])) fail('OBSERVER_METHOD_SELECTION_REQUIRED');
    const methodRef = methods[0];
    if (group.methodRef !== null && group.methodRef !== methodRef) fail('OBSERVER_METHOD_CONFLICT');
    if (link.subjectKind === 'familiar' && !id(vcs.currentForm)) fail('OBSERVER_EXISTING_FORM_REQUIRED');
    const formRef = vcs.currentForm ? `vcs:form:${vcs.currentForm}` : null;
    if (group.formRef != null && group.formRef !== formRef) fail('OBSERVER_EXISTING_FORM_CONFLICT');
    let origin: ObserverOrigin | null = null;
    const active = await readReality(scope), bundle = object(active?.bundle) ? active.bundle : null;
    const frames = Array.isArray(bundle?.actorFrames) ? bundle.actorFrames.filter(object).filter((row) => row.actorRef === link.actorRef) : [];
    if (frames.length === 1 && id(frames[0].zoneRef)) {
      origin = { kind: 'owner_actor_frame', zoneRef: frames[0].zoneRef,
        description: 'The observer remains in its exact currently prepared starting zone.', sourceRefs: [String(frames[0].actorFrameId)] };
    } else {
      const saved = await origins.find({ ...scope, actorLinkRef: link.linkRef, windowFingerprint: String(window.windowFingerprint),
        ...(input.originRef ? { _id: input.originRef } : {}) }).limit(2).toArray();
      if (saved.length > 1 || input.originRef && saved.length !== 1) fail('OBSERVER_ORIGIN_DECISION_INVALID');
      if (saved.length === 1) origin = saved[0].origin;
    }
    if (!origin && !continuation) fail('OBSERVER_STARTING_POSITION_REQUIRED');
    let viewpointCondition: ObserverViewpointCondition;
    if (String(group.viewpointBinding).startsWith('after:')) {
      const nodeRef = String(group.viewpointBinding).slice(6);
      const predecessor = source.program.nodes.find((row: { nodeId: string }) => row.nodeId === nodeRef);
      if (!predecessor || predecessor.kind !== 'move' || !continuation && source.cursor.completedNodeRefs.includes(nodeRef)
        || source.cursor.skippedNodeRefs.includes(nodeRef)
        || !predecessor.observationPrerequisite?.groupRefs?.includes(group.groupId)
        || !predecessor.observationPrerequisite?.dependentObservationNodeRefs?.includes(node.nodeId)) fail('OBSERVER_VIEWPOINT_PREREQUISITE_INVALID');
      const destination = predecessor.semanticLocationBindings?.bindings?.filter((row: { role: string }) => row.role === 'destination') ?? [];
      if (destination.length !== 1) fail('OBSERVER_VIEWPOINT_DESTINATION_REQUIRED');
      if (source.cursor.completedNodeRefs.includes(nodeRef)) {
        const lineage = (pending.confirmedRelocations as JsonObject[]).find((row) => row.moveNodeRef === nodeRef
          && row.observationNodeRef === node.nodeId && row.groupId === group.groupId
          && row.observerRef === link.actorRef && row.actorLinkRef === link.linkRef);
        if (!lineage) fail('CONFIRMED_RELOCATION_LINEAGE_INVALID');
        viewpointCondition = { kind: 'confirmed_relocation', lineageRef: String(lineage.lineageRef),
          destinationRef: String(lineage.destinationRef), destinationZoneRef: String(lineage.destinationZoneRef) };
        origin = { kind: 'owner_relocation_receipt', zoneRef: String(lineage.destinationZoneRef),
          description: 'The observer is at the exact destination of its saved successful movement.',
          sourceRefs: [String(lineage.lineageRef), String(lineage.movementReceiptRef)] };
      } else viewpointCondition = { kind: 'after_relocation', nodeRef,
          destinationTargetId: `pending-destination:${freeformJsonDigest({ nodeRef, location: destination[0] }).slice(0, 40)}`,
          destinationRef: destination[0].authorityRef ?? null };
    } else {
      if (!origin) fail('OBSERVER_STARTING_POSITION_REQUIRED');
      const currentOrigin = origin;
      const authority = pending.typedObservationAuthority as JsonObject;
      const access = Array.isArray(authority.observationAccess) ? authority.observationAccess.filter(object).filter((row) =>
        Array.isArray(row.requiredCapabilityRefs) && row.requiredCapabilityRefs.includes(methodRef)
        && row.candidateViewpointRef === currentOrigin.zoneRef) : [];
      if (access.length !== 1) fail('OBSERVER_CURRENT_ACCESS_REQUIRED');
      viewpointCondition = { kind: 'current_access', accessRef: String(access[0].accessId) };
    }
    if (!origin) fail('OBSERVER_STARTING_POSITION_REQUIRED');
    const body: Omit<PendingObserverEvidence, 'evidenceRef'> = { schemaVersion: continuation ? CONTINUATION_OBSERVER_EVIDENCE_VERSION : PENDING_OBSERVER_EVIDENCE_VERSION, campaignId: scope.campaignId, programRef: scope.programId,
      instructionFingerprint: String(source.instruction.instructionFingerprint), windowRef: String(window.windowId), windowFingerprint: String(window.windowFingerprint),
      nodeRef: input.nodeRef, groupId: input.groupId, observerKind: link.subjectKind, observerRef: link.actorRef, actorLinkRef: link.linkRef,
      methodRef, formRef, currentForm: vcs.currentForm, capabilityRef: methodRef, availableModalities: [...vcs.modalities], mobilityRefs: [...vcs.mobilityRefs],
      vcsOwnerRef: link.vcsOwnerRef, mechanicsSubjectRef: vcs.subjectRef, vcsSubjectRevision: vcs.subjectRevision, vcsCharacterRevision: vcs.characterRevision,
      ownerReceiptRefs: [...proof.provenanceReceiptRefs], sourceHead: { workspaceRevision: Number((pending.ownerReadSet as JsonObject).storyWorkspaceRevision),
        sceneKitId: String(sceneRef.sceneKitId), sceneRevision: Number(sceneRef.revision), payloadFingerprint: String(sceneRef.payloadFingerprint) }, origin, viewpointCondition };
    const evidence: PendingObserverEvidence = { ...body, evidenceRef: `qualified-observer:${freeformJsonDigest(body).slice(0, 40)}` };
    if (pendingObserverEvidenceIssues(evidence).length) fail('OBSERVER_QUALIFICATION_EVIDENCE_INVALID');
    const requestFingerprint = freeformJsonDigest(evidence), filter = { ...scope, windowFingerprint: evidence.windowFingerprint, groupId: evidence.groupId };
    const prior = await evidenceRecords.findOne(filter);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('OBSERVER_QUALIFICATION_SOURCE_CHANGED');
      return { evidence: prior.evidence, duplicate: true };
    }
    try { await evidenceRecords.insertOne({ ...filter, _id: evidence.evidenceRef, evidence, requestFingerprint, createdAt: new Date() }); }
    catch (error) {
      if (!duplicate(error)) throw error;
      const raced = await evidenceRecords.findOne(filter);
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('OBSERVER_QUALIFICATION_SOURCE_CHANGED');
      return { evidence: raced.evidence, duplicate: true };
    }
    return { evidence, duplicate: false };
  }
  async function context(input: Scope): Promise<JsonObject> {
    const { scope, pending, window, sceneRef, readLinks } = await current(input);
    const rows = await (input.continuation ? continuationRecords() : records).find({ ...scope, windowFingerprint: String(window.windowFingerprint) }).limit(33).toArray();
    if (rows.length > 32) fail('OBSERVER_QUALIFICATION_BUDGET_EXCEEDED');
    const links = await readLinks();
    for (const row of rows) {
      const evidence = row.evidence;
      if (pendingObserverEvidenceIssues(evidence).length || row.requestFingerprint !== freeformJsonDigest(evidence)
        || evidence.sourceHead.workspaceRevision !== Number((pending.ownerReadSet as JsonObject).storyWorkspaceRevision)
        || evidence.sourceHead.sceneRevision !== sceneRef.revision || evidence.sourceHead.payloadFingerprint !== sceneRef.payloadFingerprint
        || !links.links.some((link) => link.linkRef === evidence.actorLinkRef && link.actorRef === evidence.observerRef)) fail('OBSERVER_QUALIFICATION_SOURCE_CHANGED');
    }
    const result = { ...pending, schemaVersion: input.continuation ? 'gmc.scene-pending-intent-context/3' : 'gmc.scene-pending-intent-context/2',
      observerIdentityLinks: links.links.filter((link) => (pending.slots as unknown as Array<{ observationGroups: Array<{ observerKind: string; observerRef: string | null }> }>)
        .some((slot) => slot.observationGroups.some((group) => group.observerKind === link.subjectKind
          && (group.observerRef === null || group.observerRef === link.actorRef)))) as unknown as JsonObject[],
      qualifiedObservers: rows.map((row) => row.evidence) as unknown as JsonObject[],
      // Exact deterministic symbols are application data, never a hash exercise
      // for a Manual model or a new claim that the viewpoint is already active.
      qualifiedViewpoints: rows.filter((row) => row.evidence.viewpointCondition.kind !== 'current_access')
        .map((row) => ({ ownerEvidenceRef: row.evidence.evidenceRef, conditionalViewpointRef: conditionalViewpointRef(row.evidence) })) };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 65_536) fail('OBSERVER_QUALIFICATION_BUDGET_EXCEEDED');
    return result;
  }
  async function read(input: Scope): Promise<PendingObserverEvidence[]> {
    return (await context(input)).qualifiedObservers as unknown as PendingObserverEvidence[];
  }
  return { qualify, read, context, confirmOrigin, originOperation };
}
