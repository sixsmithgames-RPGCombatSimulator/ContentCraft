import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import {
  ACTOR_MECHANICS_BINDING_CONTRACT_VERSION,
  type JsonObject,
  type JsonValue,
  readActiveStoryWorkspace,
  readStoryWorkspaceOperation,
  replaceStoryWorkspace,
  SCENE_KIT_V4_CONTRACT_VERSION,
  StoryWorkspaceStoreError,
  type StoryWorkspaceRevisionDocument,
  validateSceneKit,
} from './storyWorkspaceStore.js';

export const OBSERVATION_AUTHORITY_PROJECTION_CONTRACT_VERSION = 'gmc.observation-authority-projection/1';
export const OBSERVATION_AUTHORITY_COMMIT_CONTRACT_VERSION = 'gmc.observation-authority-commit/1';
export const OBSERVATION_AUTHORITY_RECEIPT_CONTRACT_VERSION = 'gmc.observation-authority-receipt/1';
export const OBSERVATION_AUTHORITY_READER_BUNDLE_VERSION = 'gmc.observation-reader-bundle/1';
export const OBSERVATION_AUTHORITY_WRITER_BUNDLE_VERSION = 'gmc.observation-writer-bundle/1';
export const VCS_STORY_SUBJECT_BINDING_CONTRACT_VERSION = 'vcs.story-subject-binding/1';
export const DERIVED_ACTOR_CANDIDATE_CONTRACT_VERSION = 'gmc.observation-derived-actor-candidate/1';
export const OBSERVATION_SAGA_SHARED_WRITER_BUNDLE_VERSION = 'studio.observation-saga-writer-bundle/1';
export const OBSERVATION_SAGA_CAPABILITIES = Object.freeze([
  'cross-service-observation-saga/1', 'multi-observer-observation-groups/1',
  'owner-reconciled-observation-writes/1', 'atomic-observation-presentation/1',
] as const);
export const OBSERVATION_SAGA_SHARED_CONTRACTS = Object.freeze({
  playerInstructionArtifact: 'gma.player-instruction-artifact/1', semanticIntentIr: 'gma.semantic-intent-ir/3',
  semanticActionProgram: 'gma.semantic-action-program/4', observationPrerequisite: 'gma.observation-prerequisite/1',
  authorityReadSet: 'gma.authority-read-set/1', perceptionProfile: 'gma.perception-profile/1',
  observationRequest: 'gma.observation-request/2', observationResolution: 'gma.observation-resolution/2',
  actionSaga: 'gma.action-saga/1', acceptedModelCandidate: 'gma.accepted-model-candidate/1',
  gmcActorMechanicsBinding: 'gmc.actor-mechanics-binding/1', vcsStorySubjectBinding: 'vcs.story-subject-binding/1',
  vcsCapabilityProjection: 'vcs.observation-capability-projection/1', vcsOperation: 'vcs.observation-operation/1',
  vcsOperationReceipt: 'vcs.observation-operation-receipt/1', gmcAuthorityProjection: 'gmc.observation-authority-projection/1',
  gmcAuthorityCommit: 'gmc.observation-authority-commit/1', gmcAuthorityReceipt: 'gmc.observation-authority-receipt/1',
  sceneKit: 'gmc.scene-kit/4', playableSceneContext: 'gma.playable-scene-context/4', actionBoundReveal: 'gma.action-bound-reveal/4',
  substantiveOutcome: 'gma.substantive-outcome/2', actionExecutionReceipt: 'gma.action-execution-receipt/2',
  observationPreparationPacket: 'gma.observation-authority-preparation-packet/1',
  observationPreparationCandidate: 'gma.observation-authority-preparation-candidate/1',
  narrationPacket: 'gma.current-scene-narration-packet/8', narrationResult: 'gma.current-scene-narration-result/8',
  narrationRepair: 'gma.current-scene-narration-repair/8',
});

function object(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_AUTHORITY_INVALID', 'The observation authority request contains an invalid reference.', { field });
  }
  return value;
}

function revision(value: unknown, field: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_AUTHORITY_INVALID', 'The observation authority request contains an invalid revision.', { field });
  }
  return Number(value);
}

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fingerprint(value: JsonObject): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function clone<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

function sceneKits(workspace: JsonObject): JsonObject[] {
  return Array.isArray(workspace.sceneKits) ? workspace.sceneKits.filter(object) : [];
}

function activeSceneKit(workspace: JsonObject): JsonObject {
  if (!object(workspace.activeSceneKitRef)) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_UNAVAILABLE', 'No current Scene is available for observation.', {});
  const sceneKitId = requiredId(workspace.activeSceneKitRef.sceneKitId, 'workspace.activeSceneKitRef.sceneKitId');
  const kit = sceneKits(workspace).find((candidate) => candidate.sceneKitId === sceneKitId);
  if (!kit) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_UNAVAILABLE', 'The current Scene reference does not resolve.', {});
  return kit;
}

function actorCandidates(kit: JsonObject) {
  const participants = object(kit.participants) ? kit.participants : {};
  const present = Array.isArray(participants.present) ? participants.present.filter((value): value is string => typeof value === 'string') : [];
  const roles = Array.isArray(participants.sceneLocalRoles) ? participants.sceneLocalRoles.filter(object) : [];
  return [
    ...present.map((actorRef) => ({ actorRef, actorKind: 'present_actor', actorRecordRef: actorRef, actorRecordRevision: Number(kit.revision) })),
    ...roles.map((role) => ({ actorRef: String(role.roleId), actorKind: 'scene_local_role', actorRecordRef: String(role.roleId), actorRecordRevision: Number(kit.revision) })),
  ];
}

function derivedActorCandidate(campaignId: string, kit: JsonObject, input: { parentActorRef: string; mechanicsSubjectRef: string; subjectKind: string }): JsonObject {
  const parentActorRef = requiredId(input.parentActorRef, 'parentActorRef');
  const mechanicsSubjectRef = requiredId(input.mechanicsSubjectRef, 'mechanicsSubjectRef');
  if (!['familiar', 'sensor', 'ally'].includes(input.subjectKind)) throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_DERIVED_ACTOR_INVALID', 'The requested derived observer kind is not supported.', {});
  if (!actorCandidates(kit).some((candidate) => candidate.actorRef === parentActorRef)) throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_DERIVED_ACTOR_INVALID', 'The derived observer parent is not an exact current-Scene actor.', {});
  const actorRef = `gmc:observation-actor:${createHash('sha256').update(canonical({ campaignId, sceneKitId: kit.sceneKitId, parentActorRef, mechanicsSubjectRef, subjectKind: input.subjectKind })).digest('hex').slice(0, 32)}`;
  const base: JsonObject = {
    schemaVersion: DERIVED_ACTOR_CANDIDATE_CONTRACT_VERSION,
    campaignRef: campaignId,
    sceneKitId: kit.sceneKitId,
    sceneRevision: kit.revision,
    actorRef,
    actorKind: input.subjectKind,
    actorRecordRef: actorRef,
    actorRecordRevision: kit.revision,
    parentActorRef,
    mechanicsSubjectRef,
  };
  return { ...base, candidateFingerprint: fingerprint(base) };
}

function filtered<T extends { [key: string]: JsonValue }>(rows: T[], key: keyof T, requestedRefs: string[]): T[] {
  if (!requestedRefs.length) return rows;
  const requested = new Set(requestedRefs);
  return rows.filter((row) => requested.has(String(row[key])));
}

function currentSourceCatalog(kit: JsonObject): Set<string> {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) refs.add(value);
  };
  const addList = (value: unknown) => Array.isArray(value) && value.forEach(add);
  add(kit.sceneKitId); addList(kit.sourceRefs); addList(kit.storyBindings);
  if (object(kit.playableLocus)) { add(kit.playableLocus.canonicalAnchorRef); addList(kit.playableLocus.sourceRefs); }
  if (object(kit.participants)) {
    addList(kit.participants.present); addList(kit.participants.anticipated);
    if (Array.isArray(kit.participants.sceneLocalRoles)) kit.participants.sceneLocalRoles.filter(object).forEach((row) => add(row.roleId));
  }
  for (const [collection, id] of [['establishedElements', 'elementId'], ['information', 'informationId'], ['observables', 'observableId'], ['obstructions', 'obstructionId'], ['observationAccess', 'accessId']] as const) {
    if (!Array.isArray(kit[collection])) continue;
    kit[collection].filter(object).forEach((row) => { add(row[id]); addList(row.sourceRefs); });
  }
  return refs;
}

function validateReciprocalBindings(campaignId: string, kit: JsonObject, evidence: JsonObject[], derivedEvidence: JsonObject[]): void {
  const bySubject = new Map(evidence.map((row) => [String(row.subjectRef), row]));
  const candidates = new Set([...actorCandidates(kit).map((row) => row.actorRef), ...derivedEvidence.map((row) => String(row.actorRef))]);
  for (const [index, raw] of (kit.actorMechanicsBindings as JsonObject[]).entries()) {
    if (raw.schemaVersion !== ACTOR_MECHANICS_BINDING_CONTRACT_VERSION || raw.state !== 'active') continue;
    if (raw.campaignRef !== campaignId || !candidates.has(String(raw.actorRef))) {
      throw new StoryWorkspaceStoreError(422, 'STORY_ACTOR_MECHANICS_BINDING_UNGROUNDED', 'An active actor mechanics binding is outside the current campaign or Scene.', { index });
    }
    const reciprocal = bySubject.get(String(raw.mechanicsSubjectRef));
    if (!reciprocal
      || reciprocal.schemaVersion !== VCS_STORY_SUBJECT_BINDING_CONTRACT_VERSION
      || reciprocal.state !== 'active'
      || reciprocal.storyCampaignRef !== campaignId
      || reciprocal.storyActorRef !== raw.actorRef
      || reciprocal.ownerRef !== raw.vcsOwnerRef
      || String(reciprocal.subjectRevision) !== String(raw.vcsRevision)) {
      throw new StoryWorkspaceStoreError(409, 'STORY_ACTOR_MECHANICS_BINDING_MISMATCH', 'The Story actor and mechanics subject do not have matching owner bindings.', { bindingRef: raw.bindingRef });
    }
    const receipts = new Set(Array.isArray(reciprocal.provenanceReceiptRefs) ? reciprocal.provenanceReceiptRefs.map(String) : []);
    if (!(raw.provenanceReceiptRefs as string[]).some((ref) => receipts.has(ref))) {
      throw new StoryWorkspaceStoreError(409, 'STORY_ACTOR_MECHANICS_BINDING_MISMATCH', 'The reciprocal binding evidence does not share accepted provenance.', { bindingRef: raw.bindingRef });
    }
  }
}

/** Returns only owner-stamped candidates; display labels never participate in joins. */
export async function readObservationAuthority(input: {
  userId: string;
  campaignId: string;
  actorRefs?: string[];
  subjectRefs?: string[];
  derivedSubject?: { parentActorRef: string; mechanicsSubjectRef: string; subjectKind: string } | null;
}, records?: Collection<StoryWorkspaceRevisionDocument>) {
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, records);
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace has been prepared for this campaign.', {});
  const kit = activeSceneKit(active.workspace);
  const isV4 = kit.schemaVersion === SCENE_KIT_V4_CONTRACT_VERSION;
  const requestedActors = (input.actorRefs ?? []).map((ref, index) => requiredId(ref, `actorRefs[${index}]`));
  const requestedSubjects = (input.subjectRefs ?? []).map((ref, index) => requiredId(ref, `subjectRefs[${index}]`));
  const bindings = isV4 && Array.isArray(kit.actorMechanicsBindings) ? kit.actorMechanicsBindings.filter(object) : [];
  const access = isV4 && Array.isArray(kit.observationAccess) ? kit.observationAccess.filter(object) : [];
  const observables = isV4 && Array.isArray(kit.observables) ? kit.observables.filter(object) : [];
  const obstructions = isV4 && Array.isArray(kit.obstructions) ? kit.obstructions.filter(object) : [];
  const derivedActorCandidates = input.derivedSubject ? [derivedActorCandidate(input.campaignId, kit, input.derivedSubject)] : [];
  return {
    schemaVersion: OBSERVATION_AUTHORITY_PROJECTION_CONTRACT_VERSION,
    writerBundle: OBSERVATION_AUTHORITY_WRITER_BUNDLE_VERSION,
    workspaceRef: clone(active.storyWorkspaceRef as unknown as JsonObject),
    sceneKitRef: {
      sceneKitId: kit.sceneKitId,
      revision: kit.revision,
      schemaVersion: kit.schemaVersion,
      payloadFingerprint: fingerprint(kit),
    },
    preparationState: isV4 ? 'ready' : 'scene_kit_upgrade_required',
    actorCandidates: [...filtered(actorCandidates(kit), 'actorRef', requestedActors), ...derivedActorCandidates],
    derivedActorCandidates,
    actorMechanicsBindings: filtered(bindings, 'actorRef', requestedActors),
    observationAccess: clone(access),
    observables: filtered(observables, 'subjectRef', requestedSubjects),
    obstructions: clone(obstructions),
    // This service-authenticated owner route is the bounded private
    // preparation reader. GMA needs the complete current kit even after an
    // earlier V4 commit so a later request can replace it without dropping
    // unrelated observation authority.
    privatePreparationContext: clone(kit),
  };
}

/** Commits one complete same-locus Scene replacement under workspace and Scene CAS. */
export async function commitObservationAuthority(input: {
  userId: string;
  campaignId: string;
  expectedWorkspaceRevision: number;
  expectedSceneRevision: number;
  operationId: string;
  idempotencyKey: string;
  requestFingerprint?: string;
  sceneKit: JsonObject;
  vcsBindings: JsonObject[];
  sourceReceiptRefs: string[];
  derivedActorEvidence?: JsonObject[];
}, records?: Collection<StoryWorkspaceRevisionDocument>) {
  const campaignId = requiredId(input.campaignId, 'campaignId');
  const expectedWorkspaceRevision = revision(input.expectedWorkspaceRevision, 'expectedWorkspaceRevision', true);
  const expectedSceneRevision = revision(input.expectedSceneRevision, 'expectedSceneRevision');
  const operationId = requiredId(input.operationId, 'operationId');
  const idempotencyKey = requiredId(input.idempotencyKey, 'idempotencyKey');
  const requestPayload: JsonObject = {
    campaignId,
    expectedWorkspaceRevision,
    expectedSceneRevision,
    operationId,
    idempotencyKey,
    sceneKit: input.sceneKit,
    vcsBindings: input.vcsBindings,
    sourceReceiptRefs: input.sourceReceiptRefs,
    derivedActorEvidence: input.derivedActorEvidence ?? [],
  };
  const requestFingerprint = fingerprint(requestPayload);
  if (input.requestFingerprint !== undefined && input.requestFingerprint !== requestFingerprint) {
    throw new StoryWorkspaceStoreError(409, 'STORY_OBSERVATION_REQUEST_FINGERPRINT_MISMATCH', 'The observation authority request does not match its fingerprint.', {});
  }
  const priorOperation = await readStoryWorkspaceOperation({ userId: input.userId, campaignId, operationId }, records);
  if (priorOperation) {
    if (priorOperation.requestFingerprint !== requestFingerprint) throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The observation operation was already used for a different write.', {});
    return { schemaVersion: OBSERVATION_AUTHORITY_RECEIPT_CONTRACT_VERSION, duplicate: true, ...priorOperation };
  }
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId }, records);
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace has been prepared for this campaign.', {});
  if (active.storyWorkspaceRef.revision !== expectedWorkspaceRevision) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before observation preparation.', { expectedRevision: expectedWorkspaceRevision, actualRevision: active.storyWorkspaceRef.revision });
  const current = activeSceneKit(active.workspace);
  if (Number(current.revision) !== expectedSceneRevision) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_CONFLICT', 'The current Scene changed before observation preparation.', { expectedRevision: expectedSceneRevision, actualRevision: current.revision });
  if (input.sceneKit.schemaVersion !== SCENE_KIT_V4_CONTRACT_VERSION
    || input.sceneKit.sceneKitId !== current.sceneKitId
    || Number(input.sceneKit.revision) !== expectedSceneRevision + 1
    || canonical(input.sceneKit.playableLocus as JsonValue) !== canonical(current.playableLocus as JsonValue)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_SCENE_REPLACEMENT_INVALID', 'Observation preparation must replace the complete current Scene at the same playable locus.', {});
  }
  const unrelatedCurrent = clone(current);
  const unrelatedProposed = clone(input.sceneKit);
  for (const record of [unrelatedCurrent, unrelatedProposed]) {
    delete record.schemaVersion;
    delete record.revision;
    delete record.actorMechanicsBindings;
    delete record.observationAccess;
    delete record.observables;
    delete record.obstructions;
  }
  if (canonical(unrelatedCurrent) !== canonical(unrelatedProposed)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_UNRELATED_CHANGE_FORBIDDEN', 'Observation preparation changed unrelated current-Scene fields.', {});
  }
  validateSceneKit(input.sceneKit);
  const derivedEvidence = input.derivedActorEvidence ?? [];
  for (const [index, candidate] of derivedEvidence.entries()) {
    const expected = derivedActorCandidate(campaignId, current, {
      parentActorRef: String(candidate.parentActorRef), mechanicsSubjectRef: String(candidate.mechanicsSubjectRef), subjectKind: String(candidate.actorKind),
    });
    if (candidate.schemaVersion !== DERIVED_ACTOR_CANDIDATE_CONTRACT_VERSION || canonical(candidate) !== canonical(expected)) throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_DERIVED_ACTOR_INVALID', 'A derived observer candidate does not match the current GMC projection.', { index });
  }
  validateReciprocalBindings(campaignId, input.sceneKit, input.vcsBindings, derivedEvidence);
  const allowedSources = currentSourceCatalog(current);
  input.sourceReceiptRefs.forEach((ref, index) => allowedSources.add(requiredId(ref, `sourceReceiptRefs[${index}]`)));
  for (const [collection, idField] of [['observationAccess', 'accessId'], ['observables', 'observableId'], ['obstructions', 'obstructionId']] as const) {
    for (const row of input.sceneKit[collection] as JsonObject[]) {
      for (const sourceRef of row.sourceRefs as string[]) if (!allowedSources.has(sourceRef)) throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_SOURCE_UNGROUNDED', 'Observation authority cites a source outside the accepted owner evidence.', { recordRef: row[idField], sourceRef });
      if (collection === 'obstructions') for (const receiptRef of row.provenanceReceiptRefs as string[]) if (!allowedSources.has(receiptRef)) throw new StoryWorkspaceStoreError(422, 'STORY_OBSERVATION_BLOCKER_UNGROUNDED', 'An observation blocker lacks preexisting provenance.', { obstructionId: row.obstructionId, receiptRef });
    }
  }
  const workspace = clone(active.workspace);
  workspace.sceneKits = sceneKits(workspace).map((kit) => kit.sceneKitId === current.sceneKitId ? clone(input.sceneKit) : kit);
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId,
    expectedRevision: expectedWorkspaceRevision,
    idempotencyKey,
    source: 'observation_authority',
    workspace,
    deltaId: operationId,
    changedRecordRefs: [`scene_kit:${String(current.sceneKitId)}`],
    requestHashOverride: requestFingerprint,
  }, records);
  return {
    schemaVersion: OBSERVATION_AUTHORITY_RECEIPT_CONTRACT_VERSION,
    operationId,
    disposition: 'committed',
    duplicate: written.duplicate,
    requestFingerprint,
    receiptRef: `gmc:observation-receipt:${requestFingerprint}`,
    storyWorkspaceRef: written.storyWorkspaceRef,
    sceneKitRef: { sceneKitId: input.sceneKit.sceneKitId, revision: input.sceneKit.revision },
  };
}

export async function readObservationAuthorityOperation(input: {
  userId: string;
  campaignId: string;
  operationId: string;
}, records?: Collection<StoryWorkspaceRevisionDocument>) {
  const result = await readStoryWorkspaceOperation(input, records);
  return result ?? {
    contractVersion: 'gmc.observation-operation-status/1',
    operationId: requiredId(input.operationId, 'operationId'),
    disposition: 'unresolved',
  };
}
