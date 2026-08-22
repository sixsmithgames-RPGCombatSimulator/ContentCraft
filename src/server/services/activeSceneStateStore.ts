import { createHash } from 'node:crypto';
import type { Collection, WithId } from 'mongodb';
import { getDb } from '../config/mongo.js';
import {
  readActiveStoryWorkspace,
  StoryWorkspaceStoreError,
  type JsonObject,
  type JsonValue,
  type StoryWorkspaceRevisionCollection,
} from './storyWorkspaceStore.js';

export const ACTIVE_SCENE_STATE_CONTRACT_VERSION = 'gmc.active-scene-state/1';
export const ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION = 'gma.active-scene-context/1';
export const SCENE_STATE_DELTA_CONTRACT_VERSION = 'gma.scene-state-delta/1';
export const SCENE_TURN_PROPOSAL_CONTRACT_VERSION = 'gma.scene-turn-proposal/1';
export const SCENE_TURN_RECEIPT_CONTRACT_VERSION = 'gmc.scene-turn-receipt/1';
export const ACTIVE_SCENE_STATE_MAX_BYTES = 32_768;
export const ACTIVE_SCENE_CONTEXT_MAX_BYTES = 24_576;
export const SCENE_TURN_PROPOSAL_MAX_BYTES = 24_576;
export const SCENE_TURN_RECEIPT_MAX_BYTES = 8_192;
export const ACTIVE_SCENE_RECENT_RECEIPT_LIMIT = 8;
export const ACTIVE_SCENE_CAPABILITIES = Object.freeze([
  'durable-active-scene/1',
  'scene-turn-receipts/1',
] as const);

type ScenePhase = 'completed' | 'pending_mechanic' | 'owner_confirmed_mechanic';

export interface ActiveSceneStateDocument {
  userId: string;
  campaignId: string;
  sceneKitId: string;
  schemaVersion: typeof ACTIVE_SCENE_STATE_CONTRACT_VERSION;
  sceneKitRef: JsonObject;
  revision: number;
  lastTurnSequence: number;
  acceptedTurnCount: number;
  compactedThroughSequence: number;
  actorStates: JsonObject[];
  continuityStates: JsonObject[];
  revealedInformationRefs: string[];
  settledFacts: JsonObject[];
  openThreads: JsonObject[];
  recentEvents: JsonObject[];
  latestReceiptRef: string | null;
  latestOperationId: string | null;
  latestRequestHash: string | null;
  latestReceipt: JsonObject | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneTurnReceiptDocument {
  userId: string;
  campaignId: string;
  sceneKitId: string;
  operationId: string;
  idempotencyKey: string;
  requestHash: string;
  schemaVersion: typeof SCENE_TURN_RECEIPT_CONTRACT_VERSION;
  receiptRef: string;
  interactionId: string;
  playerActionFingerprint: string;
  sceneKitRef: JsonObject;
  stateRevisionBefore: number;
  stateRevisionAfter: number;
  timelineSequence: number;
  phase: ScenePhase;
  narrationFingerprint: string;
  deltaFingerprint: string;
  actionSummary: string;
  outcomeSummary: string;
  sourceReceiptRefs: string[];
  committedAt: Date;
}

export interface ActiveSceneStateCollections {
  states: Collection<ActiveSceneStateDocument>;
  receipts: Collection<SceneTurnReceiptDocument>;
}

function collections(): ActiveSceneStateCollections {
  return {
    states: getDb().collection<ActiveSceneStateDocument>('gmc_active_scene_states'),
    receipts: getDb().collection<SceneTurnReceiptDocument>('gmc_scene_turn_receipts'),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function bytes(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function exactKeys(value: Record<string, unknown>, field: string, allowed: readonly string[]): void {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new StoryWorkspaceStoreError(422, 'STORY_CONTRACT_FIELD_UNSUPPORTED', `${field} contains an unsupported field.`, { field: `${field}.${unsupported}` });
}

function stableId(value: unknown, field: string, maximum = 240): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > maximum || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} is not a stable identifier.`, { field });
  }
  return result;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > maximum || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(result)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} is invalid.`, { field });
  }
  return result;
}

function wholeNumber(value: unknown, field: string, minimum = 0): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} must be a whole number.`, { field });
  }
  return result;
}

function identifierList(value: unknown, field: string, maximum: number, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} must be a bounded array.`, { field, minimum, maximum });
  }
  const result = value.map((entry, index) => stableId(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_STATE_DUPLICATE_REF', `${field} contains a duplicate reference.`, { field });
  return result;
}

function activeSceneKit(workspace: JsonObject): JsonObject {
  const activeRef = isObject(workspace.activeSceneKitRef) ? workspace.activeSceneKitRef : null;
  const sceneKitId = String(activeRef?.sceneKitId ?? '');
  const kits = Array.isArray(workspace.sceneKits) ? workspace.sceneKits.filter(isObject) as JsonObject[] : [];
  const kit = kits.find((candidate) => candidate.sceneKitId === sceneKitId);
  if (!kit) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_UNAVAILABLE', 'No current Scene kit is available for this campaign.', {});
  return kit;
}

function sceneKitReference(campaignId: string, kit: JsonObject): JsonObject {
  return {
    contractVersion: 'gmc.scene-kit-ref/1',
    campaignId,
    sceneId: kit.sceneKitId,
    sceneKitId: kit.sceneKitId,
    revision: kit.revision,
    payloadHash: hash(kit),
  };
}

function addRef(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) target.add(value);
}

function addRefs(target: Set<string>, value: unknown): void {
  if (Array.isArray(value)) value.forEach((entry) => addRef(target, entry));
}

function sceneAuthorityRefs(workspace: JsonObject, kit: JsonObject, state?: ActiveSceneStateDocument | null): {
  all: Set<string>;
  actorRefs: Set<string>;
  informationRefs: Set<string>;
  threadRefs: Set<string>;
} {
  const all = new Set<string>();
  const actorRefs = new Set<string>();
  const informationRefs = new Set<string>();
  const threadRefs = new Set<string>();
  addRef(all, kit.sceneKitId);
  addRefs(all, kit.sourceRefs);
  addRefs(all, kit.storyBindings);
  addRefs(threadRefs, kit.storyBindings);
  if (isObject(kit.playableLocus)) {
    addRef(all, kit.playableLocus.canonicalAnchorRef);
    addRefs(all, kit.playableLocus.sourceRefs);
  }
  if (isObject(kit.participants)) {
    for (const value of [...(Array.isArray(kit.participants.present) ? kit.participants.present : []), ...(Array.isArray(kit.participants.anticipated) ? kit.participants.anticipated : [])]) {
      const ref = typeof value === 'string' ? value : isObject(value) ? value.actorRef ?? value.entityId ?? value.npcRef : null;
      addRef(actorRefs, ref);
      addRef(all, ref);
    }
    for (const role of (Array.isArray(kit.participants.sceneLocalRoles) ? kit.participants.sceneLocalRoles : [])) {
      if (!isObject(role)) continue;
      addRef(actorRefs, role.roleId);
      addRef(all, role.roleId);
    }
  }
  for (const element of (Array.isArray(kit.establishedElements) ? kit.establishedElements : [])) {
    if (!isObject(element)) continue;
    addRef(all, element.elementId);
    addRefs(all, element.sourceRefs);
  }
  for (const information of (Array.isArray(kit.information) ? kit.information : [])) {
    if (!isObject(information)) continue;
    addRef(informationRefs, information.informationId);
    addRef(all, information.informationId);
    addRefs(all, information.sourceRefs);
  }
  for (const beat of (Array.isArray(kit.beats) ? kit.beats : [])) {
    if (!isObject(beat)) continue;
    addRef(threadRefs, beat.beatId);
    addRef(all, beat.beatId);
  }
  for (const field of ['observables', 'obstructions', 'observationAccess', 'actorMechanicsBindings']) {
    for (const entry of (Array.isArray(kit[field]) ? kit[field] : [])) {
      if (!isObject(entry)) continue;
      for (const idField of ['observableId', 'obstructionId', 'accessId', 'bindingRef']) addRef(all, entry[idField]);
      addRefs(all, entry.sourceRefs);
    }
  }
  const designs = Array.isArray(workspace.sceneStoryDesigns) ? workspace.sceneStoryDesigns.filter(isObject) as JsonObject[] : [];
  const design = designs.find((candidate) => isObject(candidate.sceneKitRef)
    && candidate.sceneKitRef.sceneKitId === kit.sceneKitId
    && Number(candidate.sceneKitRef.sceneKitRevision) === Number(kit.revision));
  if (design) {
    addRef(all, design.designId);
    addRefs(all, design.sourceRefs);
    for (const obligation of (Array.isArray(design.obligations) ? design.obligations : [])) {
      if (!isObject(obligation)) continue;
      addRef(threadRefs, obligation.obligationId);
      addRef(all, obligation.obligationId);
      addRef(all, obligation.storyNodeRef);
      addRefs(all, obligation.sourceRefs);
    }
    for (const affordance of (Array.isArray(design.affordances) ? design.affordances : [])) {
      if (!isObject(affordance)) continue;
      addRef(all, affordance.affordanceId);
      addRef(all, affordance.targetRef);
      addRefs(all, affordance.factRefs);
      addRefs(all, affordance.obligationRefs);
    }
  }
  if (state) {
    state.actorStates.forEach((entry) => {
      addRef(all, entry.actorRef);
      addRefs(all, entry.sourceFactRefs);
      addRef(all, entry.sourceTurnRef);
    });
    state.continuityStates.forEach((entry) => {
      addRef(all, entry.aspect);
      addRefs(all, entry.sourceFactRefs);
      addRef(all, entry.sourceTurnRef);
    });
    state.settledFacts.forEach((entry) => {
      addRef(all, entry.factKey);
      addRefs(all, entry.sourceFactRefs);
      addRef(all, entry.sourceTurnRef);
    });
    state.openThreads.forEach((entry) => {
      addRef(all, entry.threadRef);
      addRefs(all, entry.sourceFactRefs);
      addRef(all, entry.sourceTurnRef);
    });
    state.revealedInformationRefs.forEach((ref) => addRef(all, ref));
    addRef(all, state.latestReceiptRef);
  }
  actorRefs.forEach((ref) => all.add(ref));
  informationRefs.forEach((ref) => all.add(ref));
  threadRefs.forEach((ref) => all.add(ref));
  return { all, actorRefs, informationRefs, threadRefs };
}

function emptyState(campaignId: string, kit: JsonObject): ActiveSceneStateDocument {
  const now = new Date();
  return {
    userId: '',
    campaignId,
    sceneKitId: String(kit.sceneKitId),
    schemaVersion: ACTIVE_SCENE_STATE_CONTRACT_VERSION,
    sceneKitRef: sceneKitReference(campaignId, kit),
    revision: 0,
    lastTurnSequence: 0,
    acceptedTurnCount: 0,
    compactedThroughSequence: 0,
    actorStates: [],
    continuityStates: [],
    revealedInformationRefs: [],
    settledFacts: [],
    openThreads: [],
    recentEvents: [],
    latestReceiptRef: null,
    latestOperationId: null,
    latestRequestHash: null,
    latestReceipt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function publicState(state: ActiveSceneStateDocument): JsonObject {
  return {
    schemaVersion: state.schemaVersion,
    sceneKitRef: clone(state.sceneKitRef),
    revision: state.revision,
    lastTurnSequence: state.lastTurnSequence,
    acceptedTurnCount: state.acceptedTurnCount,
    compactedThroughSequence: state.compactedThroughSequence,
    actorStates: clone(state.actorStates),
    continuityStates: clone(state.continuityStates),
    revealedInformationRefs: clone(state.revealedInformationRefs),
    settledFacts: clone(state.settledFacts),
    openThreads: clone(state.openThreads),
    recentEvents: clone(state.recentEvents),
    latestReceiptRef: state.latestReceiptRef,
  };
}

function promptState(state: ActiveSceneStateDocument): JsonObject {
  return {
    schemaVersion: state.schemaVersion,
    sceneKitRef: clone(state.sceneKitRef),
    revision: state.revision,
    lastTurnSequence: state.lastTurnSequence,
    acceptedTurnCount: state.acceptedTurnCount,
    compactedThroughSequence: state.compactedThroughSequence,
    actorStates: state.actorStates.map((entry) => ({
      actorRef: entry.actorRef,
      activity: entry.activity,
      decision: entry.decision,
      sourceTurnRef: entry.sourceTurnRef,
    })),
    continuityStates: state.continuityStates.map((entry) => ({
      aspect: entry.aspect,
      status: entry.status,
      basis: entry.basis,
      sourceTurnRef: entry.sourceTurnRef,
    })),
    revealedInformationRefs: clone(state.revealedInformationRefs),
    settledFacts: state.settledFacts.slice(-48).map((entry) => ({
      factKey: entry.factKey,
      claimText: entry.claimText,
      sourceFactRefs: clone((entry.sourceFactRefs ?? []) as JsonValue[]),
      sourceTurnRef: entry.sourceTurnRef,
    })),
    openThreads: state.openThreads.map((entry) => ({
      threadRef: entry.threadRef,
      status: entry.status,
      summary: entry.summary,
      sourceTurnRef: entry.sourceTurnRef,
    })),
    recentEvents: state.recentEvents.slice(-8).map((entry) => clone(entry)),
    latestReceiptRef: state.latestReceiptRef,
  };
}

function receiptSummary(receipt: SceneTurnReceiptDocument | JsonObject): JsonObject {
  return {
    receiptRef: receipt.receiptRef as JsonValue,
    interactionId: receipt.interactionId as JsonValue,
    stateRevisionAfter: receipt.stateRevisionAfter as JsonValue,
    timelineSequence: receipt.timelineSequence as JsonValue,
    phase: receipt.phase as JsonValue,
    actionSummary: receipt.actionSummary as JsonValue,
    outcomeSummary: receipt.outcomeSummary as JsonValue,
  };
}

function publicReceipt(receipt: SceneTurnReceiptDocument | JsonObject): JsonObject {
  return {
    schemaVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
    receiptRef: receipt.receiptRef as JsonValue,
    operationId: receipt.operationId as JsonValue,
    idempotencyKey: receipt.idempotencyKey as JsonValue,
    interactionId: receipt.interactionId as JsonValue,
    playerActionFingerprint: receipt.playerActionFingerprint as JsonValue,
    sceneKitRef: clone(receipt.sceneKitRef as JsonObject),
    stateRevisionBefore: receipt.stateRevisionBefore as JsonValue,
    stateRevisionAfter: receipt.stateRevisionAfter as JsonValue,
    timelineSequence: receipt.timelineSequence as JsonValue,
    phase: receipt.phase as JsonValue,
    narrationFingerprint: receipt.narrationFingerprint as JsonValue,
    deltaFingerprint: receipt.deltaFingerprint as JsonValue,
    actionSummary: receipt.actionSummary as JsonValue,
    outcomeSummary: receipt.outcomeSummary as JsonValue,
    sourceReceiptRefs: clone(receipt.sourceReceiptRefs as JsonValue[]),
  };
}

export function buildActiveSceneContext(
  campaignId: string,
  kit: JsonObject,
  state?: ActiveSceneStateDocument | null,
  receipts: Array<SceneTurnReceiptDocument | JsonObject> = [],
): JsonObject {
  const projectedState = promptState(state ?? emptyState(campaignId, kit));
  const currentSceneKitRef = sceneKitReference(campaignId, kit);
  // Scene preparation can replace the durable Scene kit without ending the
  // active scene. Project the retained continuity state against the exact
  // current kit so GMA never has to join an older revision to current truth.
  projectedState.sceneKitRef = clone(currentSceneKitRef);
  const context: JsonObject = {
    schemaVersion: ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
    sceneKitRef: currentSceneKitRef,
    state: projectedState,
    recentTurnReceipts: receipts.slice(0, ACTIVE_SCENE_RECENT_RECEIPT_LIMIT).map(receiptSummary),
    authority: {
      owner: 'gmc',
      transcriptIsAuthority: false,
      mechanicsOwner: 'vcs',
    },
  };
  while (bytes(context) > ACTIVE_SCENE_CONTEXT_MAX_BYTES && (projectedState.settledFacts as JsonValue[]).length) {
    (projectedState.settledFacts as JsonValue[]).shift();
  }
  while (bytes(context) > ACTIVE_SCENE_CONTEXT_MAX_BYTES && (projectedState.recentEvents as JsonValue[]).length > 1) {
    (projectedState.recentEvents as JsonValue[]).shift();
  }
  if (bytes(context) > ACTIVE_SCENE_CONTEXT_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_ACTIVE_SCENE_CONTEXT_TOO_LARGE', 'The active Scene context exceeds its prompt bound.', { maximumBytes: ACTIVE_SCENE_CONTEXT_MAX_BYTES });
  return context;
}

function validateDelta(value: unknown, refs: ReturnType<typeof sceneAuthorityRefs>): JsonObject {
  if (!isObject(value)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'The scene-state delta must be an object.', { field: 'stateDelta' });
  exactKeys(value, 'stateDelta', ['schemaVersion', 'phase', 'actorUpdates', 'continuityUpdates', 'revealInformationRefs', 'settledFacts', 'threadUpdates']);
  if (value.schemaVersion !== SCENE_STATE_DELTA_CONTRACT_VERSION) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'The scene-state delta version is unsupported.', { field: 'stateDelta.schemaVersion' });
  if (!['completed', 'pending_mechanic', 'owner_confirmed_mechanic'].includes(String(value.phase))) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'The scene-state phase is invalid.', { field: 'stateDelta.phase' });
  const actorUpdates = Array.isArray(value.actorUpdates) ? value.actorUpdates : null;
  if (!actorUpdates || actorUpdates.length > 32) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'Actor updates exceed their bound.', { field: 'stateDelta.actorUpdates' });
  const seenActors = new Set<string>();
  actorUpdates.forEach((entry, index) => {
    const field = `stateDelta.actorUpdates[${index}]`;
    if (!isObject(entry)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'An actor update must be an object.', { field });
    exactKeys(entry, field, ['actorRef', 'activity', 'decision', 'narrationEvidence', 'sourceFactRefs']);
    const actorRef = stableId(entry.actorRef, `${field}.actorRef`);
    if (!refs.actorRefs.has(actorRef)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_REF_UNBOUND', 'An actor update does not belong to the current Scene.', { field: `${field}.actorRef`, actorRef });
    if (seenActors.has(actorRef)) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_STATE_DUPLICATE_REF', 'An actor is updated more than once.', { actorRef });
    seenActors.add(actorRef);
    boundedText(entry.activity, `${field}.activity`, 1_000);
    boundedText(entry.decision, `${field}.decision`, 1_000);
    boundedText(entry.narrationEvidence, `${field}.narrationEvidence`, 2_000);
    const sourceRefs = identifierList(entry.sourceFactRefs, `${field}.sourceFactRefs`, 16, 1);
    sourceRefs.forEach((ref) => {
      if (!refs.all.has(ref)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_SOURCE_UNBOUND', 'An actor update source is not part of the current Scene authority.', { field: `${field}.sourceFactRefs`, sourceRef: ref });
    });
  });
  const continuityUpdates = Array.isArray(value.continuityUpdates) ? value.continuityUpdates : null;
  if (!continuityUpdates || continuityUpdates.length > 16) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'Continuity updates exceed their bound.', { field: 'stateDelta.continuityUpdates' });
  const seenAspects = new Set<string>();
  continuityUpdates.forEach((entry, index) => {
    const field = `stateDelta.continuityUpdates[${index}]`;
    if (!isObject(entry)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'A continuity update must be an object.', { field });
    exactKeys(entry, field, ['aspect', 'status', 'basis', 'narrationEvidence', 'sourceFactRefs']);
    const aspect = stableId(entry.aspect, `${field}.aspect`, 80);
    if (seenAspects.has(aspect)) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_STATE_DUPLICATE_REF', 'A continuity aspect is updated more than once.', { aspect });
    seenAspects.add(aspect);
    stableId(entry.status, `${field}.status`, 80);
    boundedText(entry.basis, `${field}.basis`, 1_000);
    boundedText(entry.narrationEvidence, `${field}.narrationEvidence`, 2_000);
    const sourceRefs = identifierList(entry.sourceFactRefs, `${field}.sourceFactRefs`, 16);
    sourceRefs.forEach((ref) => {
      if (!refs.all.has(ref)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_SOURCE_UNBOUND', 'A continuity source is not part of the current Scene authority.', { field: `${field}.sourceFactRefs`, sourceRef: ref });
    });
  });
  const revealInformationRefs = identifierList(value.revealInformationRefs, 'stateDelta.revealInformationRefs', 64);
  revealInformationRefs.forEach((ref) => {
    if (!refs.informationRefs.has(ref)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_REF_UNBOUND', 'A revealed information ref does not belong to the current Scene.', { informationRef: ref });
  });
  const settledFacts = Array.isArray(value.settledFacts) ? value.settledFacts : null;
  if (!settledFacts || settledFacts.length > 24) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'Settled facts exceed their per-turn bound.', { field: 'stateDelta.settledFacts' });
  const seenFacts = new Set<string>();
  settledFacts.forEach((entry, index) => {
    const field = `stateDelta.settledFacts[${index}]`;
    if (!isObject(entry)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'A settled fact must be an object.', { field });
    exactKeys(entry, field, ['factKey', 'claimText', 'sourceFactRefs']);
    const factKey = stableId(entry.factKey, `${field}.factKey`);
    if (seenFacts.has(factKey)) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_STATE_DUPLICATE_REF', 'A settled fact key is duplicated.', { factKey });
    seenFacts.add(factKey);
    boundedText(entry.claimText, `${field}.claimText`, 2_000);
    const sourceRefs = identifierList(entry.sourceFactRefs, `${field}.sourceFactRefs`, 16, 1);
    sourceRefs.forEach((ref) => {
      if (!refs.all.has(ref)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_SOURCE_UNBOUND', 'A settled fact source is not part of the current Scene authority.', { field: `${field}.sourceFactRefs`, sourceRef: ref });
    });
  });
  const threadUpdates = Array.isArray(value.threadUpdates) ? value.threadUpdates : null;
  if (!threadUpdates || threadUpdates.length > 24) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'Thread updates exceed their bound.', { field: 'stateDelta.threadUpdates' });
  const seenThreads = new Set<string>();
  threadUpdates.forEach((entry, index) => {
    const field = `stateDelta.threadUpdates[${index}]`;
    if (!isObject(entry)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'A thread update must be an object.', { field });
    exactKeys(entry, field, ['threadRef', 'status', 'summary', 'sourceFactRefs']);
    const threadRef = stableId(entry.threadRef, `${field}.threadRef`);
    if (!refs.threadRefs.has(threadRef)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_REF_UNBOUND', 'A thread update is not bound to prepared Scene or Story authority.', { field: `${field}.threadRef`, threadRef });
    if (seenThreads.has(threadRef)) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_STATE_DUPLICATE_REF', 'A thread is updated more than once.', { threadRef });
    seenThreads.add(threadRef);
    if (!['open', 'advanced', 'resolved', 'bypassed'].includes(String(entry.status))) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_DELTA_INVALID', 'A thread status is invalid.', { field: `${field}.status` });
    boundedText(entry.summary, `${field}.summary`, 1_500);
    const sourceRefs = identifierList(entry.sourceFactRefs, `${field}.sourceFactRefs`, 16);
    sourceRefs.forEach((ref) => {
      if (!refs.all.has(ref)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_STATE_SOURCE_UNBOUND', 'A thread source is not part of the current Scene authority.', { field: `${field}.sourceFactRefs`, sourceRef: ref });
    });
  });
  return clone(value as JsonObject);
}

function validateProposal(value: unknown, campaignId: string, workspace: JsonObject, kit: JsonObject, state?: ActiveSceneStateDocument | null): JsonObject {
  if (!isObject(value)) throw new StoryWorkspaceStoreError(400, 'STORY_SCENE_TURN_INVALID', 'The scene-turn proposal must be an object.', {});
  if (bytes(value) > SCENE_TURN_PROPOSAL_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_SCENE_TURN_TOO_LARGE', 'The scene-turn proposal exceeds its size bound.', { maximumBytes: SCENE_TURN_PROPOSAL_MAX_BYTES });
  exactKeys(value, 'proposal', [
    'schemaVersion', 'operationId', 'idempotencyKey', 'correlationId', 'campaignId', 'interactionId',
    'playerActionFingerprint', 'expectedWorkspaceRevision', 'expectedStateRevision', 'sceneKitRef',
    'timelineSequence', 'narrationFingerprint', 'actionSummary', 'outcomeSummary', 'sourceReceiptRefs', 'stateDelta',
  ]);
  if (value.schemaVersion !== SCENE_TURN_PROPOSAL_CONTRACT_VERSION || value.campaignId !== campaignId) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_TURN_ENVELOPE_INVALID', 'The scene-turn proposal does not match this campaign.', {});
  for (const field of ['operationId', 'idempotencyKey', 'correlationId', 'campaignId', 'interactionId', 'playerActionFingerprint', 'narrationFingerprint']) stableId(value[field], `proposal.${field}`);
  const workspaceRevision = wholeNumber(value.expectedWorkspaceRevision, 'proposal.expectedWorkspaceRevision');
  if (workspaceRevision !== Number(workspace.revision)) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before this scene turn.', { expectedRevision: workspaceRevision, actualRevision: workspace.revision });
  wholeNumber(value.expectedStateRevision, 'proposal.expectedStateRevision');
  wholeNumber(value.timelineSequence, 'proposal.timelineSequence');
  boundedText(value.actionSummary, 'proposal.actionSummary', 1_000);
  boundedText(value.outcomeSummary, 'proposal.outcomeSummary', 2_000);
  identifierList(value.sourceReceiptRefs, 'proposal.sourceReceiptRefs', 32, 1);
  if (!isObject(value.sceneKitRef)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_TURN_ENVELOPE_INVALID', 'The scene-turn proposal requires an exact Scene-kit reference.', { field: 'proposal.sceneKitRef' });
  exactKeys(value.sceneKitRef, 'proposal.sceneKitRef', ['sceneKitId', 'revision', 'payloadHash']);
  const currentRef = sceneKitReference(campaignId, kit);
  if (value.sceneKitRef.sceneKitId !== currentRef.sceneKitId
    || Number(value.sceneKitRef.revision) !== Number(currentRef.revision)
    || value.sceneKitRef.payloadHash !== currentRef.payloadHash) {
    throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_CONFLICT', 'The current Scene changed before this scene turn.', { expectedSceneKitRef: value.sceneKitRef, actualSceneKitRef: currentRef });
  }
  const delta = validateDelta(value.stateDelta, sceneAuthorityRefs(workspace, kit, state));
  if ((delta.phase === 'owner_confirmed_mechanic')
    && !(value.sourceReceiptRefs as string[]).some((ref) => /^vcs[:.-]/i.test(ref))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_TURN_MECHANICS_RECEIPT_REQUIRED', 'An owner-confirmed mechanical result requires its VCS receipt.', {});
  }
  return clone(value as JsonObject);
}

function keyedMerge(current: JsonObject[], updates: JsonObject[], key: string, maximum: number): JsonObject[] {
  const merged = new Map(current.map((entry) => [String(entry[key]), clone(entry)]));
  updates.forEach((entry) => merged.set(String(entry[key]), clone(entry)));
  return [...merged.values()].slice(-maximum);
}

function materializeNextState(
  previous: ActiveSceneStateDocument,
  proposal: JsonObject,
  receipt: JsonObject,
  campaignId: string,
  kit: JsonObject,
): ActiveSceneStateDocument {
  const delta = proposal.stateDelta as JsonObject;
  const sequence = Number(proposal.timelineSequence);
  const receiptRef = String(receipt.receiptRef);
  const turnFields = { sourceTurnRef: receiptRef, sourceSequence: sequence };
  const actorUpdates = (delta.actorUpdates as JsonObject[]).map((entry) => ({ ...clone(entry), ...turnFields } as JsonObject));
  const continuityUpdates = (delta.continuityUpdates as JsonObject[]).map((entry) => ({ ...clone(entry), ...turnFields } as JsonObject));
  const factUpdates = (delta.settledFacts as JsonObject[]).map((entry) => ({ ...clone(entry), ...turnFields } as JsonObject));
  const threadUpdates = (delta.threadUpdates as JsonObject[]).map((entry) => ({ ...clone(entry), ...turnFields } as JsonObject));
  const threadMap = new Map(previous.openThreads.map((entry) => [String(entry.threadRef), clone(entry)]));
  for (const entry of threadUpdates) {
    if (['resolved', 'bypassed'].includes(String(entry.status))) threadMap.delete(String(entry.threadRef));
    else threadMap.set(String(entry.threadRef), entry);
  }
  const priorEvents = previous.recentEvents;
  const event = {
    receiptRef,
    interactionId: proposal.interactionId,
    timelineSequence: sequence,
    phase: delta.phase,
    actionSummary: proposal.actionSummary,
    outcomeSummary: proposal.outcomeSummary,
  } as JsonObject;
  const recentEvents = [...priorEvents, event].slice(-24);
  const compactedThroughSequence = priorEvents.length >= 24 && recentEvents.length
    ? Math.max(previous.compactedThroughSequence, Number(recentEvents[0].timelineSequence ?? 0))
    : previous.compactedThroughSequence;
  const now = new Date();
  const next: ActiveSceneStateDocument = {
    ...clone(previous),
    userId: previous.userId,
    campaignId,
    sceneKitId: String(kit.sceneKitId),
    schemaVersion: ACTIVE_SCENE_STATE_CONTRACT_VERSION,
    sceneKitRef: sceneKitReference(campaignId, kit),
    revision: previous.revision + 1,
    lastTurnSequence: Math.max(previous.lastTurnSequence, sequence),
    acceptedTurnCount: previous.acceptedTurnCount + 1,
    compactedThroughSequence,
    actorStates: keyedMerge(previous.actorStates, actorUpdates, 'actorRef', 32),
    continuityStates: keyedMerge(previous.continuityStates, continuityUpdates, 'aspect', 16),
    revealedInformationRefs: [...new Set([...previous.revealedInformationRefs, ...(delta.revealInformationRefs as string[])])].slice(-64),
    settledFacts: keyedMerge(previous.settledFacts, factUpdates, 'factKey', 96),
    openThreads: [...threadMap.values()].slice(-24),
    recentEvents,
    latestReceiptRef: receiptRef,
    latestOperationId: String(proposal.operationId),
    latestRequestHash: String(receipt.requestHash),
    latestReceipt: clone(receipt),
    createdAt: previous.revision === 0 ? now : previous.createdAt,
    updatedAt: now,
  };
  if (bytes(publicState(next)) > ACTIVE_SCENE_STATE_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_ACTIVE_SCENE_STATE_TOO_LARGE', 'The active Scene state exceeds its storage bound.', { maximumBytes: ACTIVE_SCENE_STATE_MAX_BYTES });
  return next;
}

function receiptFromProposal(proposal: JsonObject, requestHash: string): JsonObject {
  const before = Number(proposal.expectedStateRevision);
  const deltaFingerprint = hash(proposal.stateDelta);
  const receiptRef = `gmc:scene-turn:${hash({ campaignId: proposal.campaignId, operationId: proposal.operationId, requestHash }).slice(0, 40)}`;
  return {
    schemaVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
    receiptRef,
    operationId: proposal.operationId,
    idempotencyKey: proposal.idempotencyKey,
    requestHash,
    interactionId: proposal.interactionId,
    playerActionFingerprint: proposal.playerActionFingerprint,
    sceneKitRef: clone(proposal.sceneKitRef as JsonObject),
    stateRevisionBefore: before,
    stateRevisionAfter: before + 1,
    timelineSequence: proposal.timelineSequence,
    phase: (proposal.stateDelta as JsonObject).phase,
    narrationFingerprint: proposal.narrationFingerprint,
    deltaFingerprint,
    actionSummary: proposal.actionSummary,
    outcomeSummary: proposal.outcomeSummary,
    sourceReceiptRefs: clone(proposal.sourceReceiptRefs as JsonValue[]),
  } as JsonObject;
}

function receiptResponse(receipt: JsonObject, state: ActiveSceneStateDocument, kit: JsonObject, duplicate: boolean): JsonObject {
  return {
    contractVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
    status: 'applied',
    duplicate,
    authoritativeStateChanged: !duplicate,
    receipt: publicReceipt(receipt),
    activeSceneContext: buildActiveSceneContext(state.campaignId, kit, state, [receipt]),
  };
}

async function insertReceiptIfMissing(
  receipt: JsonObject,
  identity: { userId: string; campaignId: string; sceneKitId: string },
  records: Collection<SceneTurnReceiptDocument>,
): Promise<void> {
  const existing = await records.findOne({ userId: identity.userId, campaignId: identity.campaignId, operationId: String(receipt.operationId) });
  if (existing) {
    if (existing.requestHash !== receipt.requestHash) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_TURN_IDEMPOTENCY_CONFLICT', 'The scene-turn operation was already used for a different result.', {});
    return;
  }
  const document: SceneTurnReceiptDocument = {
    userId: identity.userId,
    campaignId: identity.campaignId,
    sceneKitId: identity.sceneKitId,
    operationId: String(receipt.operationId),
    idempotencyKey: String(receipt.idempotencyKey),
    requestHash: String(receipt.requestHash),
    schemaVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION,
    receiptRef: String(receipt.receiptRef),
    interactionId: String(receipt.interactionId),
    playerActionFingerprint: String(receipt.playerActionFingerprint),
    sceneKitRef: clone(receipt.sceneKitRef as JsonObject),
    stateRevisionBefore: Number(receipt.stateRevisionBefore),
    stateRevisionAfter: Number(receipt.stateRevisionAfter),
    timelineSequence: Number(receipt.timelineSequence),
    phase: receipt.phase as ScenePhase,
    narrationFingerprint: String(receipt.narrationFingerprint),
    deltaFingerprint: String(receipt.deltaFingerprint),
    actionSummary: String(receipt.actionSummary),
    outcomeSummary: String(receipt.outcomeSummary),
    sourceReceiptRefs: clone(receipt.sourceReceiptRefs as string[]),
    committedAt: new Date(),
  };
  if (bytes(publicReceipt(document)) > SCENE_TURN_RECEIPT_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_SCENE_TURN_RECEIPT_TOO_LARGE', 'The scene-turn receipt exceeds its storage bound.', { maximumBytes: SCENE_TURN_RECEIPT_MAX_BYTES });
  try {
    await records.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const replay = await records.findOne({ userId: identity.userId, campaignId: identity.campaignId, operationId: document.operationId });
    if (!replay || replay.requestHash !== document.requestHash) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_TURN_IDEMPOTENCY_CONFLICT', 'The scene-turn operation was already used for a different result.', {});
  }
}

export async function readActiveSceneContext(
  input: { userId: string; campaignId: string; workspace?: JsonObject },
  stores: ActiveSceneStateCollections = collections(),
  storyRecords?: StoryWorkspaceRevisionCollection,
): Promise<JsonObject> {
  const active = input.workspace
    ? { workspace: input.workspace }
    : await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, storyRecords);
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace has been prepared for this campaign.', {});
  const kit = activeSceneKit(active.workspace);
  const state = await stores.states.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) });
  const receipts = await stores.receipts.find({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) })
    .sort({ stateRevisionAfter: -1 }).limit(ACTIVE_SCENE_RECENT_RECEIPT_LIMIT).toArray();
  return buildActiveSceneContext(input.campaignId, kit, state, receipts);
}

export async function readSceneTurnOperation(
  input: { userId: string; campaignId: string; operationId: string },
  stores: ActiveSceneStateCollections = collections(),
): Promise<JsonObject | null> {
  const operationId = stableId(input.operationId, 'operationId');
  const receipt = await stores.receipts.findOne({ userId: input.userId, campaignId: input.campaignId, operationId });
  if (receipt) return { contractVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION, status: 'applied', duplicate: true, authoritativeStateChanged: false, receipt: publicReceipt(receipt) };
  const state = await stores.states.findOne({ userId: input.userId, campaignId: input.campaignId, latestOperationId: operationId });
  if (!state?.latestReceipt) return null;
  await insertReceiptIfMissing(state.latestReceipt, { userId: input.userId, campaignId: input.campaignId, sceneKitId: state.sceneKitId }, stores.receipts);
  return { contractVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION, status: 'applied', duplicate: true, authoritativeStateChanged: false, receipt: publicReceipt(state.latestReceipt) };
}

export async function commitSceneTurn(
  input: { userId: string; campaignId: string; proposal: unknown },
  stores: ActiveSceneStateCollections = collections(),
  storyRecords?: StoryWorkspaceRevisionCollection,
): Promise<JsonObject> {
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, storyRecords);
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace has been prepared for this campaign.', {});
  const kit = activeSceneKit(active.workspace);
  const current = await stores.states.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) });
  const proposal = validateProposal(input.proposal, input.campaignId, active.workspace, kit, current);
  const requestHash = hash(proposal);
  const existingReceipt = await stores.receipts.findOne({ userId: input.userId, campaignId: input.campaignId, operationId: String(proposal.operationId) });
  if (existingReceipt) {
    if (existingReceipt.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_TURN_IDEMPOTENCY_CONFLICT', 'The scene-turn operation was already used for a different result.', {});
    const state = await stores.states.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) });
    if (!state) throw new StoryWorkspaceStoreError(409, 'STORY_ACTIVE_SCENE_STATE_MISSING', 'The accepted scene-turn receipt has no current Scene state.', {});
    return receiptResponse(existingReceipt as unknown as JsonObject, state, kit, true);
  }
  const previous = current ?? { ...emptyState(input.campaignId, kit), userId: input.userId };
  const expectedStateRevision = Number(proposal.expectedStateRevision);
  if (previous.revision !== expectedStateRevision) {
    if (previous.latestOperationId === proposal.operationId && previous.latestRequestHash === requestHash && previous.latestReceipt) {
      await insertReceiptIfMissing(previous.latestReceipt, { userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) }, stores.receipts);
      return receiptResponse(previous.latestReceipt, previous, kit, true);
    }
    throw new StoryWorkspaceStoreError(409, 'STORY_ACTIVE_SCENE_STATE_REVISION_CONFLICT', 'The active Scene changed before this turn was saved.', { expectedRevision: expectedStateRevision, actualRevision: previous.revision });
  }
  if (Number(proposal.timelineSequence) < previous.lastTurnSequence) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_TURN_SEQUENCE_CONFLICT', 'The scene turn is older than the current active Scene state.', { lastTurnSequence: previous.lastTurnSequence, suppliedSequence: proposal.timelineSequence });
  const receipt = receiptFromProposal(proposal, requestHash);
  const next = materializeNextState(previous, proposal, receipt, input.campaignId, kit);
  let written: WithId<ActiveSceneStateDocument> | ActiveSceneStateDocument | null = null;
  try {
    written = await stores.states.findOneAndReplace(
      { userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId), revision: expectedStateRevision },
      next,
      { upsert: expectedStateRevision === 0, returnDocument: 'after' },
    );
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
  }
  if (!written) {
    const raced = await stores.states.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) });
    if (raced?.latestOperationId === proposal.operationId && raced.latestRequestHash === requestHash && raced.latestReceipt) {
      await insertReceiptIfMissing(raced.latestReceipt, { userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) }, stores.receipts);
      return receiptResponse(raced.latestReceipt, raced, kit, true);
    }
    throw new StoryWorkspaceStoreError(409, 'STORY_ACTIVE_SCENE_STATE_REVISION_CONFLICT', 'The active Scene changed before this turn was saved.', { expectedRevision: expectedStateRevision, actualRevision: raced?.revision ?? 0 });
  }
  await insertReceiptIfMissing(receipt, { userId: input.userId, campaignId: input.campaignId, sceneKitId: String(kit.sceneKitId) }, stores.receipts);
  return receiptResponse(receipt, next, kit, false);
}
