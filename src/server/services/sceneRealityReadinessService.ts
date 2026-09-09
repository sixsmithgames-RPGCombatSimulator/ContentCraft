import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { readActiveStoryWorkspace, StoryWorkspaceStoreError, validateSceneKitV4, type JsonObject, type JsonValue } from './storyWorkspaceStore.js';

export const SCENE_REALITY_CONTRACTS = Object.freeze({
  buildRequest: 'gma.scene-reality-build-request/1',
  proposal: 'gma.scene-reality-proposal/1',
  sceneKit: 'gmc.scene-kit/5',
  activeBundle: 'gmc.active-scene-bundle/1',
  reality: 'gmc.scene-reality/1',
  zone: 'gmc.scene-zone/1',
  actorFrame: 'gmc.scene-actor-frame/1',
  element: 'gmc.scene-element/1',
  fact: 'gmc.scene-fact/1',
  certificate: 'gmc.scene-readiness-certificate/1',
  assessment: 'gma.scene-readiness-assessment/1',
  expansionRequest: 'gma.world-expansion-request/1',
  coverageQuery: 'gma.scene-coverage-query/1',
  coverageDecision: 'gmc.scene-coverage-decision/1',
  expansionReceipt: 'gmc.world-expansion-receipt/1',
  commitReceipt: 'gmc.scene-reality-commit-receipt/1',
  storyDesign: 'gmc.scene-story-design/3',
  factSelectionProposal: 'gma.story-fact-selection-proposal/1',
  factSelectionReceipt: 'gmc.story-fact-selection-receipt/1',
  rebaseReceipt: 'gma.action-program-rebase-receipt/1',
  presentedTargetManifest: 'gma.presented-target-manifest/1',
  inspection: 'gmc.scene-reality-inspection/1',
} as const);

export const SCENE_REALITY_CAPABILITIES = Object.freeze([
  'scene-reality-read/1',
  'scene-reality-write/1',
  'scene-readiness-certificate/1',
  'dependency-scoped-readiness/1',
  'atomic-world-expansion/1',
  'read-only-story-fact-selection/1',
  'presented-target-closure/1',
  'compound-window-coverage/1',
  'scene-reality-inspection/1',
] as const);

export const SCENE_REALITY_LIMITS = Object.freeze({
  realityIndexBytes: 32_768,
  zoneBytes: 24_576,
  individualActorFrameBytes: 12_288,
  cohortActorFrameBytes: 8_192,
  factBytes: 4_096,
  elementBytes: 4_096,
  aggregateRealityBytes: 524_288,
  certificateEnvelopeBytes: 96_000,
  certificateBytes: 32_768,
  expansionRequestBytes: 24_576,
  receiptBytes: 32_768,
  privateProjectionBytes: 65_536,
} as const);

export const SCENE_REALITY_WRITE_ENABLED = process.env.GMC_SCENE_REALITY_WRITES === '1'
  || (process.env.GMC_SCENE_REALITY_WRITES === undefined && process.env.NODE_ENV === 'test');

const DEPTHS = ['transit_thumbnail', 'interactive', 'investigative', 'encounter_set_piece'] as const;
const ACTION_FAMILIES = new Set([
  'observe', 'investigate', 'social', 'move', 'wait', 'interact',
  'purchase', 'manipulate', 'use_capability', 'combat', 'chase', 'withdraw',
]);
const MATERIAL_INVALIDATION_DIMENSIONS = new Set([
  'presence', 'access', 'zone', 'material_actor_objective', 'active_pressure',
  'story_source', 'fact_source', 'deadline_state_change', 'clock_condition',
]);
const CREATION_POLICY_REF = 'gmc:preparation-generation-policy:current';
const EPISTEMIC_STATES = new Set([
  'canonical', 'prepared_private_world', 'scene_local_stable',
  'prepared_possibility', 'future_contingent', 'revealed',
  'deliberate_unknown', 'missing_preparation',
]);
const SELECTABLE_EPISTEMIC_STATES = new Set([
  'canonical', 'prepared_private_world', 'scene_local_stable', 'revealed',
]);
const STORY_CLASSIFICATIONS = new Set(['connected', 'incidental', 'latent']);
const SHA256 = /^[a-f0-9]{64}$/;

export interface SceneRealityBundleDocument {
  userId: string;
  campaignId: string;
  sceneKitId: string;
  bundleId: string;
  bundleRevision: number;
  operationId: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'staged';
  bundle: JsonObject;
  receipt: JsonObject;
  createdAt: Date;
}

export interface ActiveSceneRealityPointerDocument {
  userId: string;
  campaignId: string;
  pointerId: string;
  revision: number;
  activeBundleId: string;
  activeBundleRevision: number;
  latestOperationId: string;
  latestRequestHash: string;
  latestReceipt: JsonObject;
  updatedAt: Date;
}

export interface SceneRealityOperationDocument {
  userId: string;
  campaignId: string;
  operationId: string;
  idempotencyKey: string;
  requestHash: string;
  receipt: JsonObject;
  bundleId: string;
  createdAt: Date;
}

export interface SceneFactSelectionDocument {
  userId: string;
  campaignId: string;
  operationId: string;
  requestHash: string;
  receipt: JsonObject;
  createdAt: Date;
}

interface SceneTurnReceiptLink {
  userId: string;
  campaignId: string;
  sceneKitId: string;
  stateRevisionBefore: number;
  stateRevisionAfter: number;
  receiptRef: string;
  readinessChangedDimensions?: string[];
}

interface ActiveSceneStateHead {
  userId: string;
  campaignId: string;
  sceneKitId: string;
  revision: number;
  latestReceiptRef: string | null;
}

export interface SceneRealityCollections {
  bundles: Collection<SceneRealityBundleDocument>;
  pointers: Collection<ActiveSceneRealityPointerDocument>;
  operations: Collection<SceneRealityOperationDocument>;
  factSelections: Collection<SceneFactSelectionDocument>;
  sceneTurnReceipts: Collection<SceneTurnReceiptLink>;
  activeSceneStates: Collection<ActiveSceneStateHead>;
  readStoryAuthority?: (input: { userId: string; campaignId: string }) => Promise<JsonObject | null>;
  readClockAuthority?: (input: { userId: string; campaignId: string }) => Promise<JsonObject | null>;
}

function collections(): SceneRealityCollections {
  return {
    bundles: getDb().collection<SceneRealityBundleDocument>('gmc_scene_reality_bundles'),
    pointers: getDb().collection<ActiveSceneRealityPointerDocument>('gmc_active_scene_reality'),
    operations: getDb().collection<SceneRealityOperationDocument>('gmc_scene_reality_operations'),
    factSelections: getDb().collection<SceneFactSelectionDocument>('gmc_scene_fact_selections'),
    sceneTurnReceipts: getDb().collection<SceneTurnReceiptLink>('gmc_scene_turn_receipts'),
    activeSceneStates: getDb().collection<ActiveSceneStateHead>('gmc_active_scene_states'),
    readStoryAuthority: async (input) => clone(await readActiveStoryWorkspace(input) as unknown as JsonObject | null),
    readClockAuthority: async (input) => clone(await getDb().collection<JsonObject>('gmc_campaign_state').findOne({
      userId: input.userId,
      campaignId: input.campaignId,
    }) as unknown as JsonObject | null),
  };
}

async function currentStoryAuthority(
  input: { userId: string; campaignId: string },
  stores: SceneRealityCollections,
): Promise<{ ref: string; revision: number } | null> {
  if (typeof stores.readStoryAuthority !== 'function') return null;
  const current = await stores.readStoryAuthority(input);
  if (!current) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_STORY_WORKSPACE_REQUIRED', 'Scene preparation requires the current saved Story workspace.', { field: 'buildRequest.authorityReadSet' });
  const storyWorkspaceRef = current.storyWorkspaceRef as JsonObject;
  const revision = Number(storyWorkspaceRef?.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new StoryWorkspaceStoreError(503, 'SCENE_REALITY_STORY_AUTHORITY_INVALID', 'The current saved Story head could not be verified.', { field: 'storyWorkspaceRef.revision' });
  return { ref: `gmc:story-workspace:${input.campaignId}`, revision };
}

async function currentClockAuthority(
  input: { userId: string; campaignId: string },
  stores: SceneRealityCollections,
): Promise<{ ref: string; revision: number } | null> {
  if (typeof stores.readClockAuthority !== 'function') return null;
  const current = await stores.readClockAuthority(input);
  const revision = Number(current?.gameClockRevision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new StoryWorkspaceStoreError(503, 'SCENE_REALITY_CLOCK_AUTHORITY_INVALID', 'The current saved campaign clock head could not be verified.', { field: 'gameTimeContext.gameClockRevision' });
  return { ref: `gmc:campaign-clock:${input.campaignId}`, revision };
}

async function validateCurrentGmcReadSet(
  request: JsonObject,
  input: { userId: string; campaignId: string },
  stores: SceneRealityCollections,
): Promise<void> {
  const [story, clock] = await Promise.all([
    currentStoryAuthority(input, stores),
    currentClockAuthority(input, stores),
  ]);
  for (const current of [story, clock].filter((entry): entry is { ref: string; revision: number } => entry !== null)) {
    const dependency = (request.authorityReadSet as JsonObject[]).find((entry) => entry.ref === current.ref && entry.owner === 'gmc');
    if (!dependency || Number(dependency.revision) !== current.revision) {
      const clockConflict = current.ref.startsWith('gmc:campaign-clock:');
      throw new StoryWorkspaceStoreError(409, clockConflict ? 'SCENE_REALITY_CLOCK_AUTHORITY_CONFLICT' : 'SCENE_REALITY_STORY_AUTHORITY_CONFLICT', clockConflict
        ? 'The saved campaign clock changed before Scene preparation could be committed.'
        : 'The saved Story changed before Scene preparation could be committed.', {
        field: clockConflict
          ? 'buildRequest.authorityReadSet.campaignClock.revision'
          : 'buildRequest.authorityReadSet.storyWorkspace.revision',
        expectedRevision: dependency?.revision ?? null,
        actualRevision: current.revision,
      });
    }
  }
}

function object(value: unknown): value is Record<string, unknown> {
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
  if (unsupported) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FIELD_UNSUPPORTED', 'Scene preparation included a field that this GMC version does not accept.', { field: `${field}.${unsupported}` });
  const missing = allowed.find((key) => !(key in value));
  if (missing) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FIELD_REQUIRED', 'Scene preparation omitted a required field.', { field: `${field}.${missing}` });
}

function stableId(value: unknown, field: string): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > 240 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ID_INVALID', 'Scene preparation contains an invalid stable reference.', { field });
  }
  return result;
}

function text(value: unknown, field: string, maximum = 2_000): string {
  const result = String(value ?? '').trim();
  if (!result || result.length > maximum || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(result)) {
    throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_TEXT_INVALID', 'Scene preparation contains invalid text.', { field, maximum });
  }
  return result;
}

function whole(value: unknown, field: string, minimum = 0): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REVISION_INVALID', 'Scene preparation contains an invalid revision.', { field, minimum });
  return result;
}

function idList(value: unknown, field: string, maximum: number, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_LIST_INVALID', 'Scene preparation contains an invalid reference list.', { field, minimum, maximum });
  const result = value.map((entry, index) => stableId(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DUPLICATE_REF', 'Scene preparation repeats a stable reference.', { field });
  return result;
}

function objectList(value: unknown, field: string, maximum: number, minimum = 0): JsonObject[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || value.some((entry) => !object(entry))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_LIST_INVALID', 'Scene preparation contains an invalid record list.', { field, minimum, maximum });
  return clone(value as JsonObject[]);
}

function textList(value: unknown, field: string, maximum: number, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_LIST_INVALID', 'Scene preparation contains an invalid text list.', { field, minimum, maximum });
  return value.map((entry, index) => text(entry, `${field}[${index}]`, 1_000));
}

function requireCampaign(value: Record<string, unknown>, campaignId: string, field: string): void {
  stableId(value.campaignId, `${field}.campaignId`);
  if (value.campaignId !== campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'Scene preparation contains material from a different campaign.', { field: `${field}.campaignId` });
}

function version(value: Record<string, unknown>, expected: string, field: string): void {
  if (value.schemaVersion !== expected) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SCHEMA_UNSUPPORTED', 'This Scene preparation version is not supported.', { field: `${field}.schemaVersion`, expected, actual: value.schemaVersion });
}

function depth(value: unknown, field: string): typeof DEPTHS[number] {
  if (!DEPTHS.includes(value as typeof DEPTHS[number])) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPTH_INVALID', 'Scene preparation uses an unsupported depth.', { field, supported: DEPTHS });
  return value as typeof DEPTHS[number];
}

function ref(value: unknown, idField: string, field: string): { id: string; revision: number } {
  if (!object(value)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_INVALID', 'Scene preparation is missing an exact owner reference.', { field });
  exactKeys(value, field, [idField, 'revision']);
  return { id: stableId(value[idField], `${field}.${idField}`), revision: whole(value.revision, `${field}.revision`, 1) };
}

function assertByteBound(value: unknown, maximum: number, code: string, field: string): void {
  const suppliedBytes = bytes(value);
  if (suppliedBytes > maximum) throw new StoryWorkspaceStoreError(413, code, 'Scene preparation exceeded its safe size limit.', { field, maximumBytes: maximum, suppliedBytes });
}

function validateDependency(value: JsonObject, field: string): JsonObject {
  exactKeys(value, field, ['owner', 'ref', 'revision', 'invalidateOn']);
  if (!['gmc', 'vcs'].includes(String(value.owner))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPENDENCY_INVALID', 'A Scene dependency names an unsupported authority.', { field: `${field}.owner` });
  stableId(value.ref, `${field}.ref`);
  if (!(Number.isSafeInteger(value.revision) && Number(value.revision) >= 0) && !(typeof value.revision === 'string' && value.revision.trim())) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPENDENCY_INVALID', 'A Scene dependency has no usable owner revision.', { field: `${field}.revision` });
  if (!Array.isArray(value.invalidateOn) || value.invalidateOn.length < 1 || value.invalidateOn.length > 16) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPENDENCY_INVALID', 'A Scene dependency needs bounded invalidation dimensions.', { field: `${field}.invalidateOn` });
  value.invalidateOn.forEach((entry, index) => text(entry, `${field}.invalidateOn[${index}]`, 240));
  return clone(value);
}

function validateCoverageEntry(value: JsonObject, field: string): JsonObject {
  exactKeys(value, field, ['coverageEntryId', 'zoneRef', 'targetRef', 'actionFamily', 'accessClass', 'thresholdRef', 'capabilityClass']);
  stableId(value.coverageEntryId, `${field}.coverageEntryId`);
  stableId(value.zoneRef, `${field}.zoneRef`);
  stableId(value.targetRef, `${field}.targetRef`);
  if (!ACTION_FAMILIES.has(String(value.actionFamily))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTION_FAMILY_INVALID', 'A Scene affordance uses an unsupported action family.', { field: `${field}.actionFamily` });
  for (const key of ['accessClass', 'thresholdRef', 'capabilityClass']) if (value[key] !== null) stableId(value[key], `${field}.${key}`);
  if (value.accessClass === null && value.thresholdRef === null) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACCESS_UNBOUND', 'A Scene affordance must bind exact access or a prepared threshold.', { field });
  return clone(value);
}

function validateStoryAffordance(value: JsonObject, field: string): JsonObject {
  exactKeys(value, field, ['affordanceId', 'coverageEntryId', 'zoneRef', 'targetRef', 'actionFamily', 'accessClass', 'thresholdRef', 'capabilityClass', 'factRefs', 'condition']);
  stableId(value.affordanceId, `${field}.affordanceId`);
  const coverage = validateCoverageEntry({
    coverageEntryId: value.coverageEntryId as JsonValue,
    zoneRef: value.zoneRef as JsonValue,
    targetRef: value.targetRef as JsonValue,
    actionFamily: value.actionFamily as JsonValue,
    accessClass: value.accessClass as JsonValue,
    thresholdRef: value.thresholdRef as JsonValue,
    capabilityClass: value.capabilityClass as JsonValue,
  }, field);
  idList(value.factRefs, `${field}.factRefs`, 32, 1);
  if (value.condition !== null) text(value.condition, `${field}.condition`, 1_000);
  return { ...clone(value), ...coverage } as JsonObject;
}

function validateBuildRequest(value: unknown, campaignId: string): JsonObject {
  if (!object(value)) throw new StoryWorkspaceStoreError(400, 'SCENE_REALITY_BUILD_REQUEST_INVALID', 'The Scene preparation request is missing.', {});
  version(value, SCENE_REALITY_CONTRACTS.buildRequest, 'buildRequest');
  assertByteBound(value, 65_536, 'SCENE_REALITY_BUILD_REQUEST_TOO_LARGE', 'buildRequest');
  exactKeys(value, 'buildRequest', [
    'schemaVersion', 'operationId', 'idempotencyKey', 'correlationId', 'campaignId',
    'trigger', 'instructionRef', 'playerDirection', 'deterministicMinimumDepth',
    'judgmentInputs', 'authorityReadSet', 'receiptRefs', 'retrievalRequirements',
    'creationPolicyRef', 'preexistingCertificateRef', 'crossedBoundaryRef', 'programRef',
  ]);
  for (const field of ['operationId', 'idempotencyKey', 'correlationId', 'campaignId', 'instructionRef', 'creationPolicyRef']) stableId(value[field], `buildRequest.${field}`);
  if (value.campaignId !== campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'The Scene preparation request belongs to a different campaign.', {});
  if (value.creationPolicyRef !== CREATION_POLICY_REF) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_CREATION_POLICY_UNSUPPORTED', 'The Scene preparation request does not use the current bounded creation policy.', { field: 'buildRequest.creationPolicyRef', expected: CREATION_POLICY_REF });
  if (!['activation', 'anticipatory_refresh', 'legacy_migration', 'emergent_expansion'].includes(String(value.trigger))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_TRIGGER_INVALID', 'The Scene preparation trigger is unsupported.', { field: 'buildRequest.trigger' });
  text(value.playerDirection, 'buildRequest.playerDirection', 4_096);
  depth(value.deterministicMinimumDepth, 'buildRequest.deterministicMinimumDepth');
  if (!object(value.judgmentInputs)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_JUDGMENT_INPUT_INVALID', 'The preparation-depth judgment inputs are missing.', { field: 'buildRequest.judgmentInputs' });
  objectList(value.authorityReadSet, 'buildRequest.authorityReadSet', 64, 1).forEach((entry, index) => validateDependency(entry, `buildRequest.authorityReadSet[${index}]`));
  idList(value.receiptRefs, 'buildRequest.receiptRefs', 64);
  if (!Array.isArray(value.retrievalRequirements) || value.retrievalRequirements.length < 1 || value.retrievalRequirements.length > 32) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_RETRIEVAL_INVALID', 'The Scene preparation request needs bounded retrieval requirements.', { field: 'buildRequest.retrievalRequirements' });
  value.retrievalRequirements.forEach((entry, index) => text(entry, `buildRequest.retrievalRequirements[${index}]`, 1_000));
  if (value.preexistingCertificateRef !== null) ref(value.preexistingCertificateRef, 'certificateId', 'buildRequest.preexistingCertificateRef');
  if (value.crossedBoundaryRef !== null) stableId(value.crossedBoundaryRef, 'buildRequest.crossedBoundaryRef');
  if (value.programRef !== null) {
    if (!object(value.programRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PROGRAM_REF_INVALID', 'The saved action-program reference is invalid.', { field: 'buildRequest.programRef' });
    exactKeys(value.programRef, 'buildRequest.programRef', ['programId', 'cursorRevision']);
    stableId(value.programRef.programId, 'buildRequest.programRef.programId'); whole(value.programRef.cursorRevision, 'buildRequest.programRef.cursorRevision');
  }
  if (value.trigger === 'emergent_expansion' && (value.preexistingCertificateRef === null || value.crossedBoundaryRef === null)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_EXPANSION_BOUNDARY_REQUIRED', 'World expansion requires the earlier readiness certificate and crossed boundary.', {});
  return clone(value as JsonObject);
}

function validateBoundary(value: JsonObject, field: string): JsonObject {
  exactKeys(value, field, ['boundaryId', 'fromZoneRef', 'kind', 'beyondScope', 'committedBeforeInstructionSequence']);
  stableId(value.boundaryId, `${field}.boundaryId`); stableId(value.fromZoneRef, `${field}.fromZoneRef`);
  if (!['spatial', 'social', 'informational', 'temporal', 'capability', 'actor_profile'].includes(String(value.kind))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_BOUNDARY_INVALID', 'A prepared boundary uses an unsupported kind.', { field: `${field}.kind` });
  text(value.beyondScope, `${field}.beyondScope`, 1_000); whole(value.committedBeforeInstructionSequence, `${field}.committedBeforeInstructionSequence`);
  return clone(value);
}

function validateProfile(value: unknown, minimumDepth: string): JsonObject {
  if (!object(value)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PROFILE_INVALID', 'The Scene preparation profile is missing.', {});
  exactKeys(value, 'preparationProfile', ['depth', 'minimumDepth', 'reason', 'expectedDwell', 'judgmentUncertainty']);
  const selected = depth(value.depth, 'preparationProfile.depth');
  const minimum = depth(value.minimumDepth, 'preparationProfile.minimumDepth');
  if (minimum !== minimumDepth || DEPTHS.indexOf(selected) < DEPTHS.indexOf(minimum)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPTH_BELOW_FLOOR', 'The proposed Scene is shallower than its required preparation depth.', { minimumDepth, selectedDepth: selected });
  text(value.reason, 'preparationProfile.reason', 1_000);
  if (!['glimpse', 'brief', 'sustained', 'extended'].includes(String(value.expectedDwell))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PROFILE_INVALID', 'The expected Scene dwell is invalid.', { field: 'preparationProfile.expectedDwell' });
  if (!['low', 'medium', 'high'].includes(String(value.judgmentUncertainty))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PROFILE_INVALID', 'The depth-judgment uncertainty is invalid.', { field: 'preparationProfile.judgmentUncertainty' });
  return clone(value as JsonObject);
}

function validateStoryAlignment(value: unknown): JsonObject {
  if (!object(value)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_ALIGNMENT_INVALID', 'The Scene needs an explicit Story relationship.', {});
  exactKeys(value, 'storyAlignment', ['classification', 'storyNodeRefs', 'basis']);
  if (!['connected', 'incidental', 'latent'].includes(String(value.classification))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_ALIGNMENT_INVALID', 'The Scene Story relationship is invalid.', { field: 'storyAlignment.classification' });
  const refs = idList(value.storyNodeRefs, 'storyAlignment.storyNodeRefs', 24);
  if (value.classification === 'connected' && refs.length === 0) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_SOURCE_REQUIRED', 'A connected Scene must name its Story source.', {});
  text(value.basis, 'storyAlignment.basis', 1_000);
  return clone(value as JsonObject);
}

function recordId(record: JsonObject, kind: string): string {
  const fields: Record<string, string> = { zone: 'zoneId', actor: 'actorFrameId', element: 'elementId', fact: 'factId' };
  return stableId(record[fields[kind]], `${kind}.${fields[kind]}`);
}

function validateRecords(proposal: JsonObject, profile: JsonObject, campaignId: string): { zones: JsonObject[]; actors: JsonObject[]; elements: JsonObject[]; facts: JsonObject[] } {
  const zones = objectList(proposal.zones, 'proposal.zones', 64, 1);
  const actors = objectList(proposal.actorFrames, 'proposal.actorFrames', 64);
  const elements = objectList(proposal.elements, 'proposal.elements', 128);
  const facts = objectList(proposal.facts, 'proposal.facts', 256);
  const ids = new Set<string>();
  for (const [kind, records, contract, maximum] of [
    ['zone', zones, SCENE_REALITY_CONTRACTS.zone, SCENE_REALITY_LIMITS.zoneBytes],
    ['actor', actors, SCENE_REALITY_CONTRACTS.actorFrame, SCENE_REALITY_LIMITS.individualActorFrameBytes],
    ['element', elements, SCENE_REALITY_CONTRACTS.element, SCENE_REALITY_LIMITS.elementBytes],
    ['fact', facts, SCENE_REALITY_CONTRACTS.fact, SCENE_REALITY_LIMITS.factBytes],
  ] as const) {
    records.forEach((record, index) => {
      version(record, contract, `proposal.${kind}[${index}]`);
      const id = recordId(record, kind);
      if (ids.has(id)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DUPLICATE_REF', 'Scene preparation repeats a record identity.', { ref: id });
      ids.add(id);
      requireCampaign(record, campaignId, `proposal.${kind}[${index}]`);
      whole(record.revision, `proposal.${kind}[${index}].revision`, 1);
      assertByteBound(record, kind === 'actor' && record.kind === 'cohort' ? SCENE_REALITY_LIMITS.cohortActorFrameBytes : maximum, 'SCENE_REALITY_RECORD_TOO_LARGE', `proposal.${kind}[${index}]`);
    });
  }
  zones.forEach((zone, index) => {
    const field = `proposal.zones[${index}]`;
    exactKeys(zone, `proposal.zones[${index}]`, ['schemaVersion', 'zoneId', 'revision', 'campaignId', 'label', 'purpose', 'sensorySurface', 'ordinaryActivity', 'adjacentZoneRefs', 'thresholds', 'accessRelations', 'visibleElementRefs', 'likelyChanges', 'storyClassification', 'sourceRefs']);
    text(zone.label, `${field}.label`, 240); text(zone.purpose, `${field}.purpose`, 1_000);
    textList(zone.sensorySurface, `${field}.sensorySurface`, 16, 1);
    textList(zone.ordinaryActivity, `${field}.ordinaryActivity`, 16, 1);
    idList(zone.adjacentZoneRefs, `${field}.adjacentZoneRefs`, 24);
    objectList(zone.thresholds, `${field}.thresholds`, 24).forEach((entry, thresholdIndex) => validateBoundary(entry, `${field}.thresholds[${thresholdIndex}]`));
    textList(zone.accessRelations, `${field}.accessRelations`, 24, 1);
    idList(zone.visibleElementRefs, `${field}.visibleElementRefs`, 64);
    textList(zone.likelyChanges, `${field}.likelyChanges`, 24);
    if (!STORY_CLASSIFICATIONS.has(String(zone.storyClassification))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_ALIGNMENT_INVALID', 'A prepared zone has an invalid Story relationship.', { field: `${field}.storyClassification` });
    idList(zone.sourceRefs, `${field}.sourceRefs`, 64, 1);
  });
  actors.forEach((actor, index) => {
    const field = `proposal.actorFrames[${index}]`;
    exactKeys(actor, field, ['schemaVersion', 'actorFrameId', 'revision', 'campaignId', 'kind', 'actorRef', 'zoneRef', 'count', 'role', 'sharedActivity', 'identityMaturity', 'privateName', 'publicLabel', 'appearance', 'reasonPresent', 'currentObjective', 'affiliationRefs', 'knowledge', 'ignoranceBoundaries', 'disclosurePosture', 'hardLimits', 'approachSensitivities', 'likelyActions', 'relationshipRefs', 'promotionPolicy', 'sourceRefs']);
    stableId(actor.actorRef, `${field}.actorRef`); stableId(actor.zoneRef, `${field}.zoneRef`);
    if (!['individual', 'cohort'].includes(String(actor.kind))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTOR_KIND_INVALID', 'A prepared actor has an invalid actor kind.', { field: `${field}.kind` });
    if (actor.kind === 'cohort') {
      whole(actor.count, `${field}.count`, 1); text(actor.role, `${field}.role`, 500); text(actor.sharedActivity, `${field}.sharedActivity`, 1_000);
    } else if (actor.count !== null || actor.role !== null || actor.sharedActivity !== null) {
      throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTOR_KIND_INVALID', 'An individual actor cannot carry cohort-only fields.', { field });
    }
    if (!['seed', 'scene_local', 'canonical'].includes(String(actor.identityMaturity))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTOR_IDENTITY_INVALID', 'A prepared actor has an invalid identity maturity.', { field: `${field}.identityMaturity` });
    if (actor.privateName !== null) text(actor.privateName, `${field}.privateName`, 240);
    for (const key of ['publicLabel', 'appearance', 'reasonPresent', 'currentObjective', 'disclosurePosture', 'promotionPolicy']) text(actor[key], `${field}.${key}`, 1_000);
    idList(actor.affiliationRefs, `${field}.affiliationRefs`, 16);
    objectList(actor.knowledge, `${field}.knowledge`, 32, 1).forEach((entry, knowledgeIndex) => {
      const knowledgeField = `${field}.knowledge[${knowledgeIndex}]`;
      exactKeys(entry, knowledgeField, ['domain', 'factRefs', 'evidenceState']);
      text(entry.domain, `${knowledgeField}.domain`, 500); idList(entry.factRefs, `${knowledgeField}.factRefs`, 32);
      if (!['knows', 'believes', 'suspects', 'does_not_know'].includes(String(entry.evidenceState))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTOR_KNOWLEDGE_INVALID', 'A prepared actor has an invalid knowledge state.', { field: `${knowledgeField}.evidenceState` });
    });
    for (const key of ['ignoranceBoundaries', 'hardLimits', 'approachSensitivities', 'likelyActions']) textList(actor[key], `${field}.${key}`, 24);
    idList(actor.relationshipRefs, `${field}.relationshipRefs`, 24); idList(actor.sourceRefs, `${field}.sourceRefs`, 64, 1);
  });
  elements.forEach((element, index) => {
    const field = `proposal.elements[${index}]`;
    exactKeys(element, field, ['schemaVersion', 'elementId', 'revision', 'campaignId', 'concreteType', 'zoneRef', 'placement', 'controllerRef', 'visibleSurface', 'condition', 'contents', 'interactionSurface', 'accessRelations', 'validity', 'promotionPolicy', 'sourceRefs']);
    stableId(element.zoneRef, `${field}.zoneRef`); if (element.controllerRef !== null) stableId(element.controllerRef, `${field}.controllerRef`);
    for (const key of ['concreteType', 'placement', 'visibleSurface', 'condition', 'interactionSurface', 'validity', 'promotionPolicy']) text(element[key], `${field}.${key}`, 1_000);
    if (!object(element.contents)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ELEMENT_CONTENTS_REQUIRED', 'Every material element needs fixed, class-bounded, or concretely empty contents.', { field: `${field}.contents` });
    exactKeys(element.contents, `${field}.contents`, ['kind', 'description', 'factRefs']);
    if (!['fixed', 'class_bounded', 'empty'].includes(String(element.contents.kind))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ELEMENT_CONTENTS_REQUIRED', 'Every material element needs fixed, class-bounded, or concretely empty contents.', { field: `${field}.contents.kind` });
    text(element.contents.description, `${field}.contents.description`, 1_000); idList(element.contents.factRefs, `${field}.contents.factRefs`, 32);
    textList(element.accessRelations, `${field}.accessRelations`, 24, 1); idList(element.sourceRefs, `${field}.sourceRefs`, 64, 1);
  });
  facts.forEach((fact, index) => {
    const field = `proposal.facts[${index}]`;
    exactKeys(fact, field, ['schemaVersion', 'factId', 'revision', 'campaignId', 'targetRef', 'facet', 'valueKind', 'value', 'epistemicState', 'visibility', 'accessVectors', 'observerRestrictions', 'modalityRestrictions', 'storyRelevance', 'validity', 'provenanceRefs', 'revealPolicy', 'negativeScope']);
    stableId(fact.targetRef, `${field}.targetRef`); text(fact.facet, `${field}.facet`, 240);
    if (!['description', 'classification', 'identity_ref', 'measurement', 'measurement_range', 'relation', 'boolean', 'count', 'set', 'statement', 'bounded_negative'].includes(String(fact.valueKind))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FACT_VALUE_INVALID', 'A prepared fact has an invalid value kind.', { field: `${field}.valueKind` });
    if (fact.value === undefined || fact.value === null || (typeof fact.value === 'string' && !fact.value.trim())) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FACT_VALUE_INVALID', 'A prepared fact needs a concrete typed value.', { field: `${field}.value` });
    if (!EPISTEMIC_STATES.has(String(fact.epistemicState))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FACT_EPISTEMIC_INVALID', 'A prepared fact has an invalid epistemic state.', { field: `${field}.epistemicState` });
    if (fact.epistemicState === 'missing_preparation') throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_MISSING_PREPARATION_AS_FACT', 'Missing preparation cannot be accepted as an in-world fact.', { field: `${field}.epistemicState` });
    if (!['gm_only', 'revealed', 'public_surface'].includes(String(fact.visibility))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_FACT_VISIBILITY_INVALID', 'A prepared fact has an invalid visibility state.', { field: `${field}.visibility` });
    textList(fact.accessVectors, `${field}.accessVectors`, 24, 1); textList(fact.observerRestrictions, `${field}.observerRestrictions`, 16); textList(fact.modalityRestrictions, `${field}.modalityRestrictions`, 16);
    if (!STORY_CLASSIFICATIONS.has(String(fact.storyRelevance))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_ALIGNMENT_INVALID', 'A prepared fact has an invalid Story relationship.', { field: `${field}.storyRelevance` });
    text(fact.validity, `${field}.validity`, 500); idList(fact.provenanceRefs, `${field}.provenanceRefs`, 64, 1); text(fact.revealPolicy, `${field}.revealPolicy`, 1_000);
    if (fact.valueKind === 'bounded_negative') text(fact.negativeScope, `${field}.negativeScope`, 1_000);
    else if (fact.negativeScope !== null) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_NEGATIVE_SCOPE_INVALID', 'Only a bounded negative may define a negative scope.', { field: `${field}.negativeScope` });
  });
  if (DEPTHS.indexOf(profile.depth as typeof DEPTHS[number]) >= DEPTHS.indexOf('interactive') && actors.length + elements.length === 0) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_INTERACTION_SURFACE_REQUIRED', 'An interactive Scene needs at least one material actor or element.', {});
  if (DEPTHS.indexOf(profile.depth as typeof DEPTHS[number]) >= DEPTHS.indexOf('investigative') && facts.length < 2) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_INVESTIGATIVE_FACTS_REQUIRED', 'An investigative Scene needs multiple concrete facts or bounded negatives.', {});
  const zoneIds = new Set(zones.map((entry) => recordId(entry, 'zone')));
  const actorIds = new Set(actors.map((entry) => recordId(entry, 'actor')));
  const elementIds = new Set(elements.map((entry) => recordId(entry, 'element')));
  const factIds = new Set(facts.map((entry) => recordId(entry, 'fact')));
  const materialTargets = new Set([...zoneIds, ...actorIds, ...elementIds]);
  const assertKnown = (refs: string[], catalog: Set<string>, field: string) => refs.forEach((entry) => {
    if (!catalog.has(entry)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'Scene preparation contains a reference outside the staged dossier.', { field, ref: entry });
  });
  zones.forEach((zone, index) => {
    assertKnown(zone.adjacentZoneRefs as string[], zoneIds, `proposal.zones[${index}].adjacentZoneRefs`);
    assertKnown(zone.visibleElementRefs as string[], elementIds, `proposal.zones[${index}].visibleElementRefs`);
    (zone.thresholds as JsonObject[]).forEach((entry, thresholdIndex) => {
      if (!zoneIds.has(String(entry.fromZoneRef))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'A prepared threshold starts outside the staged topology.', { field: `proposal.zones[${index}].thresholds[${thresholdIndex}].fromZoneRef`, ref: entry.fromZoneRef });
    });
  });
  actors.forEach((actor, index) => {
    assertKnown([String(actor.zoneRef)], zoneIds, `proposal.actorFrames[${index}].zoneRef`);
    (actor.knowledge as JsonObject[]).forEach((entry, knowledgeIndex) => assertKnown(entry.factRefs as string[], factIds, `proposal.actorFrames[${index}].knowledge[${knowledgeIndex}].factRefs`));
  });
  elements.forEach((element, index) => {
    assertKnown([String(element.zoneRef)], zoneIds, `proposal.elements[${index}].zoneRef`);
    assertKnown(((element.contents as JsonObject).factRefs ?? []) as string[], factIds, `proposal.elements[${index}].contents.factRefs`);
  });
  facts.forEach((fact, index) => assertKnown([String(fact.targetRef)], materialTargets, `proposal.facts[${index}].targetRef`));
  return { zones, actors, elements, facts };
}

function validatePresentedTargets(frame: unknown, currentRefs: Set<string>, campaignId: string): JsonObject {
  if (!object(frame)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_OPENING_FRAME_INVALID', 'The proposed opening frame is missing.', {});
  exactKeys(frame, 'openingFrame', ['prose', 'presentedTargetManifest']);
  text(frame.prose, 'openingFrame.prose', 8_000);
  if (!object(frame.presentedTargetManifest)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_TARGET_MANIFEST_INVALID', 'Opening narration needs a presented-target manifest.', {});
  const manifest = frame.presentedTargetManifest;
  version(manifest, SCENE_REALITY_CONTRACTS.presentedTargetManifest, 'openingFrame.presentedTargetManifest');
  exactKeys(manifest, 'openingFrame.presentedTargetManifest', ['schemaVersion', 'manifestId', 'campaignId', 'certificateRef', 'proseFingerprint', 'targets']);
  stableId(manifest.manifestId, 'openingFrame.presentedTargetManifest.manifestId');
  if (manifest.campaignId !== campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'The opening narration manifest belongs to a different campaign.', {});
  if (hash(frame.prose) !== manifest.proseFingerprint) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PROSE_FINGERPRINT_MISMATCH', 'The opening narration changed after its targets were identified.', {});
  objectList(manifest.targets, 'openingFrame.presentedTargetManifest.targets', 64).forEach((target, index) => {
    exactKeys(target, `openingFrame.presentedTargetManifest.targets[${index}]`, ['surfaceText', 'targetRef', 'targetKind', 'materiallyAddressable']);
    text(target.surfaceText, `openingFrame.presentedTargetManifest.targets[${index}].surfaceText`, 500);
    if (typeof target.materiallyAddressable !== 'boolean') throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_TARGET_MANIFEST_INVALID', 'Every presented target must say whether it is materially addressable.', { field: `openingFrame.presentedTargetManifest.targets[${index}].materiallyAddressable` });
    if (!['actor', 'place', 'threshold', 'container', 'vehicle', 'structure', 'object', 'texture'].includes(String(target.targetKind))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_TARGET_MANIFEST_INVALID', 'A presented target has an invalid target kind.', { field: `openingFrame.presentedTargetManifest.targets[${index}].targetKind` });
    if (target.materiallyAddressable === true) {
      const targetRef = stableId(target.targetRef, `openingFrame.presentedTargetManifest.targets[${index}].targetRef`);
      if (!currentRefs.has(targetRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_PRESENTED_TARGET_UNBOUND', 'Opening narration introduced an addressable target that is not prepared.', { field: `openingFrame.presentedTargetManifest.targets[${index}].targetRef`, targetRef });
    }
  });
  return clone(frame as JsonObject);
}

function validateProposal(value: unknown, request: JsonObject, campaignId: string): JsonObject {
  if (!object(value)) throw new StoryWorkspaceStoreError(400, 'SCENE_REALITY_PROPOSAL_INVALID', 'The Scene reality proposal is missing.', {});
  version(value, SCENE_REALITY_CONTRACTS.proposal, 'proposal');
  assertByteBound(value, SCENE_REALITY_LIMITS.certificateEnvelopeBytes, 'SCENE_REALITY_PROPOSAL_TOO_LARGE', 'proposal');
  exactKeys(value, 'proposal', ['schemaVersion', 'operationId', 'campaignId', 'requestedDepth', 'sceneKit', 'sceneReality', 'zones', 'actorFrames', 'elements', 'facts', 'sceneStoryDesign', 'activeSceneState', 'preparationProfile', 'preparedBoundaries', 'storyAlignment', 'sourceRefs', 'openingFrame']);
  if (value.operationId !== request.operationId || value.campaignId !== campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_OPERATION_CONFLICT', 'The Scene proposal does not match its preparation request.', {});
  const requestedDepth = depth(value.requestedDepth, 'proposal.requestedDepth');
  const profile = validateProfile(value.preparationProfile, String(request.deterministicMinimumDepth));
  if (requestedDepth !== profile.depth) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DEPTH_MISMATCH', 'The proposal and preparation profile disagree about depth.', {});
  const alignment = validateStoryAlignment(value.storyAlignment);
  const records = validateRecords(value as JsonObject, profile, campaignId);
  if (!object(value.sceneReality)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_INDEX_INVALID', 'The Scene reality index is missing.', {});
  version(value.sceneReality, SCENE_REALITY_CONTRACTS.reality, 'proposal.sceneReality');
  exactKeys(value.sceneReality, 'proposal.sceneReality', ['schemaVersion', 'realityId', 'revision', 'campaignId', 'sceneKitRef', 'timelineAnchor', 'preparationProfile', 'zoneRefs', 'actorFrameRefs', 'elementRefs', 'factRefs', 'storyAlignment', 'preparedBoundaries', 'deliberateUnknowns', 'sourceRefs']);
  assertByteBound(value.sceneReality, SCENE_REALITY_LIMITS.realityIndexBytes, 'SCENE_REALITY_INDEX_TOO_LARGE', 'proposal.sceneReality');
  const realityId = stableId(value.sceneReality.realityId, 'proposal.sceneReality.realityId');
  whole(value.sceneReality.revision, 'proposal.sceneReality.revision', 1);
  if (value.sceneReality.campaignId !== campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'The Scene reality belongs to a different campaign.', {});
  if (hash(value.preparationProfile) !== hash(value.sceneReality.preparationProfile) || hash(alignment) !== hash(value.sceneReality.storyAlignment)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_INDEX_MISMATCH', 'The Scene reality index does not match its proposed preparation profile and Story relationship.', {});
  const zoneIds = records.zones.map((entry) => recordId(entry, 'zone'));
  const actorIds = records.actors.map((entry) => recordId(entry, 'actor'));
  const elementIds = records.elements.map((entry) => recordId(entry, 'element'));
  const factIds = records.facts.map((entry) => recordId(entry, 'fact'));
  for (const [key, ids] of [['zoneRefs', zoneIds], ['actorFrameRefs', actorIds], ['elementRefs', elementIds], ['factRefs', factIds]] as const) {
    if (hash(value.sceneReality[key]) !== hash(ids)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'The Scene reality index does not exactly reference its staged records.', { field: `proposal.sceneReality.${key}` });
  }
  const boundaries = objectList(value.preparedBoundaries, 'proposal.preparedBoundaries', 64).map((entry, index) => validateBoundary(entry, `proposal.preparedBoundaries[${index}]`));
  if (hash(boundaries) !== hash(value.sceneReality.preparedBoundaries)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_BOUNDARY_MISMATCH', 'The Scene reality index does not match the prepared boundaries.', {});
  if (!object(value.sceneKit)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SCENE_KIT_INVALID', 'A Scene-kit /5 proposal is required.', {});
  version(value.sceneKit, SCENE_REALITY_CONTRACTS.sceneKit, 'proposal.sceneKit');
  exactKeys(value.sceneKit, 'proposal.sceneKit', ['schemaVersion', 'sceneKitId', 'sceneId', 'campaignId', 'revision', 'planningState', 'truthState', 'playableLocus', 'purpose', 'dramaticQuestion', 'participants', 'establishedElements', 'information', 'actorMechanicsBindings', 'observationAccess', 'observables', 'obstructions', 'beats', 'pressures', 'exitVectors', 'storyBindings', 'sourceRefs', 'sceneRealityRef', 'sceneStoryDesignRef']);
  const sceneKitId = stableId(value.sceneKit.sceneKitId, 'proposal.sceneKit.sceneKitId');
  stableId(value.sceneKit.sceneId, 'proposal.sceneKit.sceneId'); requireCampaign(value.sceneKit, campaignId, 'proposal.sceneKit');
  const sceneKitRevision = whole(value.sceneKit.revision, 'proposal.sceneKit.revision', 1);
  if (!['prepared', 'active', 'resolved', 'dormant'].includes(String(value.sceneKit.planningState))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SCENE_KIT_INVALID', 'The Scene kit has an invalid planning state.', { field: 'proposal.sceneKit.planningState' });
  if (!['gm_preparation', 'private_canon', 'revealed_canon'].includes(String(value.sceneKit.truthState))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SCENE_KIT_INVALID', 'The Scene kit has an invalid truth state.', { field: 'proposal.sceneKit.truthState' });
  const compactKit = clone(value.sceneKit);
  compactKit.schemaVersion = 'gmc.scene-kit/4';
  for (const field of ['sceneId', 'campaignId', 'truthState', 'sceneRealityRef', 'sceneStoryDesignRef']) delete compactKit[field];
  validateSceneKitV4(compactKit);
  for (const field of ['actorMechanicsBindings', 'observationAccess', 'observables', 'obstructions']) {
    if ((value.sceneKit[field] as JsonValue[]).length !== 0) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DERIVED_AUTHORITY_INVALID', 'Scene-kit /5 cannot duplicate mutable observation or mechanics authority; Scene reality facts and VCS remain authoritative.', { field: `proposal.sceneKit.${field}` });
  }
  const realityRef = ref(value.sceneKit.sceneRealityRef, 'realityId', 'proposal.sceneKit.sceneRealityRef');
  if (realityRef.id !== realityId || realityRef.revision !== Number(value.sceneReality.revision)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SCENE_KIT_REF_MISMATCH', 'The Scene kit does not bind the exact staged Scene reality.', {});
  if (!object(value.sceneStoryDesign)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_DESIGN_INVALID', 'An instruction-independent Scene Story design is required.', {});
  version(value.sceneStoryDesign, SCENE_REALITY_CONTRACTS.storyDesign, 'proposal.sceneStoryDesign');
  exactKeys(value.sceneStoryDesign, 'proposal.sceneStoryDesign', ['schemaVersion', 'designId', 'revision', 'campaignId', 'sceneKitRef', 'obligations', 'affordances', 'storyAlignment', 'sourceRefs']);
  const designId = stableId(value.sceneStoryDesign.designId, 'proposal.sceneStoryDesign.designId');
  requireCampaign(value.sceneStoryDesign, campaignId, 'proposal.sceneStoryDesign');
  const designRevision = whole(value.sceneStoryDesign.revision, 'proposal.sceneStoryDesign.revision', 1);
  const designRef = ref(value.sceneKit.sceneStoryDesignRef, 'designId', 'proposal.sceneKit.sceneStoryDesignRef');
  if (designRef.id !== designId || designRef.revision !== designRevision) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_DESIGN_REF_MISMATCH', 'The Scene kit does not bind the exact staged Story design.', {});
  const designKitRef = ref(value.sceneStoryDesign.sceneKitRef, 'sceneKitId', 'proposal.sceneStoryDesign.sceneKitRef');
  if (designKitRef.id !== sceneKitId || designKitRef.revision !== sceneKitRevision) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_STORY_DESIGN_REF_MISMATCH', 'The Story design does not bind the exact staged Scene kit.', {});
  const currentRefs = new Set([...zoneIds, ...actorIds, ...elementIds, ...factIds, ...boundaries.map((entry) => String(entry.boundaryId)), sceneKitId, realityId, designId]);
  const actorRefs = new Set(records.actors.flatMap((entry) => [recordId(entry, 'actor'), String(entry.actorRef)]));
  const participants = value.sceneKit.participants as JsonObject;
  const participantRefs = [
    ...idList(participants.present, 'proposal.sceneKit.participants.present', 32),
    ...objectList(participants.sceneLocalRoles, 'proposal.sceneKit.participants.sceneLocalRoles', 16).map((entry) => String(entry.roleId)),
  ];
  participantRefs.forEach((participantRef) => { if (!actorRefs.has(participantRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'The Scene kit names a participant without a staged actor frame.', { field: 'proposal.sceneKit.participants', ref: participantRef }); });
  const elementRefSet = new Set(elementIds);
  objectList(value.sceneKit.establishedElements, 'proposal.sceneKit.establishedElements', 32).forEach((entry, index) => {
    if (!elementRefSet.has(String(entry.elementId))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'The compact Scene kit names an element outside the staged dossier.', { field: `proposal.sceneKit.establishedElements[${index}].elementId`, ref: entry.elementId });
  });
  const factRefSet = new Set(factIds);
  const factById = new Map(records.facts.map((entry) => [String(entry.factId), entry]));
  objectList(value.sceneKit.information, 'proposal.sceneKit.information', 24).forEach((entry, index) => {
    if (!factRefSet.has(String(entry.informationId))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'The compact Scene kit names information outside the staged facts.', { field: `proposal.sceneKit.information[${index}].informationId`, ref: entry.informationId });
    const fact = factById.get(String(entry.informationId)) as JsonObject;
    const expectedState = fact.valueKind === 'bounded_negative' ? 'absent_in_scope'
      : ['revealed', 'public_surface'].includes(String(fact.visibility)) ? 'plainly_visible' : 'concealed';
    const expectedText = typeof fact.value === 'string' ? fact.value : canonicalJson(fact.value);
    if (entry.state !== expectedState || entry.factText !== expectedText) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DERIVED_INFORMATION_MISMATCH', 'The compact Scene information contradicts its staged fact.', { field: `proposal.sceneKit.information[${index}]`, factRef: fact.factId });
    const factAccess = new Set(textList(fact.accessVectors, `proposal.facts.${String(fact.factId)}.accessVectors`, 24, 1));
    textList(entry.accessVectors, `proposal.sceneKit.information[${index}].accessVectors`, 8, 1).forEach((vector) => {
      if (!factAccess.has(vector)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DERIVED_INFORMATION_MISMATCH', 'The compact Scene information invented an access route outside its staged fact.', { field: `proposal.sceneKit.information[${index}].accessVectors`, factRef: fact.factId });
    });
  });
  const obligationIds = new Set<string>();
  objectList(value.sceneStoryDesign.obligations, 'proposal.sceneStoryDesign.obligations', 32).forEach((entry, index) => {
    const field = `proposal.sceneStoryDesign.obligations[${index}]`;
    exactKeys(entry, field, ['obligationId', 'storyNodeRef', 'description', 'factRefs']);
    const obligationId = stableId(entry.obligationId, `${field}.obligationId`);
    if (obligationIds.has(obligationId)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DUPLICATE_REF', 'The Story design repeats an obligation.', { field: `${field}.obligationId`, ref: obligationId });
    obligationIds.add(obligationId); stableId(entry.storyNodeRef, `${field}.storyNodeRef`); text(entry.description, `${field}.description`, 1_000);
    idList(entry.factRefs, `${field}.factRefs`, 32).forEach((factRef) => { if (!factIds.includes(factRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_REF_CLOSURE_FAILED', 'A Story obligation cites an unprepared fact.', { field: `${field}.factRefs`, ref: factRef }); });
  });
  const affordances = objectList(value.sceneStoryDesign.affordances, 'proposal.sceneStoryDesign.affordances', 64, 1);
  const affordanceIds = new Set<string>(); const coverageIds = new Set<string>();
  affordances.forEach((entry, index) => {
    const coverage = validateStoryAffordance(entry, `proposal.sceneStoryDesign.affordances[${index}]`);
    const affordanceId = String(coverage.affordanceId); const coverageId = String(coverage.coverageEntryId);
    if (affordanceIds.has(affordanceId) || coverageIds.has(coverageId)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_DUPLICATE_REF', 'The Story design repeats an affordance or coverage identity.', { field: `proposal.sceneStoryDesign.affordances[${index}]` });
    affordanceIds.add(affordanceId); coverageIds.add(coverageId);
    if (!currentRefs.has(String(coverage.zoneRef)) || !currentRefs.has(String(coverage.targetRef))) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_AFFORDANCE_REF_UNBOUND', 'A Scene affordance points outside the proposed dossier.', { field: `proposal.sceneStoryDesign.affordances[${index}]` });
    idList(coverage.factRefs, `proposal.sceneStoryDesign.affordances[${index}].factRefs`, 32, 1).forEach((factRef) => { if (!currentRefs.has(factRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_AFFORDANCE_REF_UNBOUND', 'A Scene affordance points to an unprepared fact.', { factRef }); });
  });
  validatePresentedTargets(value.openingFrame, currentRefs, campaignId);
  if (!object(value.activeSceneState)) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTIVE_STATE_INVALID', 'The Scene proposal needs an active-state initialization or compatible patch.', {});
  exactKeys(value.activeSceneState, 'proposal.activeSceneState', ['revision', 'receiptChain']);
  whole(value.activeSceneState.revision, 'proposal.activeSceneState.revision');
  idList(value.activeSceneState.receiptChain, 'proposal.activeSceneState.receiptChain', 64);
  idList(value.sourceRefs, 'proposal.sourceRefs', 128, 1);
  return clone(value as JsonObject);
}

function withoutRevision(value: JsonObject): JsonObject {
  const result = clone(value);
  delete result.revision;
  return result;
}

function validateSuccessorContinuity(proposal: JsonObject, priorBundle: JsonObject | null, trigger: unknown): void {
  if (!priorBundle || !['anticipatory_refresh', 'emergent_expansion'].includes(String(trigger))) return;
  for (const [field, idField] of [
    ['sceneKit', 'sceneKitId'], ['sceneReality', 'realityId'], ['sceneStoryDesign', 'designId'],
  ] as const) {
    const prior = priorBundle[field] as JsonObject;
    const successor = proposal[field] as JsonObject;
    if (successor[idField] !== prior[idField] || Number(successor.revision) !== Number(prior.revision) + 1) {
      throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_SUCCESSOR_IDENTITY_CONFLICT', 'A Scene refresh or expansion must advance the same stable Scene authority exactly one revision.', {
        field: `proposal.${field}.${idField}`,
        expectedId: prior[idField], actualId: successor[idField],
        expectedRevision: Number(prior.revision) + 1, actualRevision: successor.revision,
      });
    }
  }
  for (const [field, idField] of [
    ['zones', 'zoneId'], ['actorFrames', 'actorFrameId'], ['elements', 'elementId'], ['facts', 'factId'],
  ] as const) {
    const priorRows = priorBundle[field] as JsonObject[];
    const successorRows = proposal[field] as JsonObject[];
    const priorById = new Map(priorRows.map((entry) => [String(entry[idField]), entry]));
    const successorById = new Map(successorRows.map((entry) => [String(entry[idField]), entry]));
    for (const [id, prior] of priorById) {
      const successor = successorById.get(id);
      if (!successor) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SUCCESSOR_RECORD_DROPPED', 'A Scene refresh or expansion cannot discard established Scene reality.', { field: `proposal.${field}`, ref: id });
      if (field === 'actorFrames' && successor.actorRef !== prior.actorRef) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SUCCESSOR_IDENTITY_CONFLICT', 'A Scene refresh cannot replace an established actor identity under the same frame ID.', { field: `proposal.${field}.${id}.actorRef`, ref: id });
      const changed = canonicalJson(withoutRevision(successor)) !== canonicalJson(withoutRevision(prior));
      const expectedRevision = changed ? Number(prior.revision) + 1 : Number(prior.revision);
      if (Number(successor.revision) !== expectedRevision) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_SUCCESSOR_RECORD_REVISION_CONFLICT', 'A retained Scene record must keep its revision when unchanged or advance exactly once when changed.', { field: `proposal.${field}.${id}.revision`, ref: id, expectedRevision, actualRevision: successor.revision });
    }
    for (const [id, successor] of successorById) {
      if (!priorById.has(id) && Number(successor.revision) !== 1) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_SUCCESSOR_RECORD_REVISION_CONFLICT', 'A newly prepared Scene record must begin at revision one.', { field: `proposal.${field}.${id}.revision`, ref: id, expectedRevision: 1, actualRevision: successor.revision });
    }
  }
  const priorDesign = priorBundle.sceneStoryDesign as JsonObject;
  const successorDesign = proposal.sceneStoryDesign as JsonObject;
  for (const [field, idField] of [['obligations', 'obligationId'], ['affordances', 'affordanceId']] as const) {
    const successorRows = successorDesign[field] as JsonObject[];
    const successorById = new Map(successorRows.map((entry) => [String(entry[idField]), entry]));
    for (const prior of priorDesign[field] as JsonObject[]) {
      const id = String(prior[idField]);
      const successor = successorById.get(id);
      if (!successor) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SUCCESSOR_DESIGN_RECORD_DROPPED', 'A Scene refresh or expansion cannot discard an established Story obligation or prepared affordance.', { field: `proposal.sceneStoryDesign.${field}`, ref: id });
      if (field === 'affordances' && successor.coverageEntryId !== prior.coverageEntryId) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_SUCCESSOR_COVERAGE_IDENTITY_CONFLICT', 'A retained Scene affordance must preserve its certified coverage identity.', { field: `proposal.sceneStoryDesign.${field}.${id}.coverageEntryId`, ref: id });
    }
  }
}

function validateAssessment(value: unknown, proposal: JsonObject, request: JsonObject): JsonObject {
  if (!object(value)) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_ASSESSMENT_REQUIRED', 'The Scene was not independently examined for playability.', {});
  version(value, SCENE_REALITY_CONTRACTS.assessment, 'assessment');
  assertByteBound(value, 32_768, 'SCENE_READINESS_ASSESSMENT_TOO_LARGE', 'assessment');
  exactKeys(value, 'assessment', ['schemaVersion', 'assessmentId', 'operationId', 'campaignId', 'dossierFingerprint', 'policyFingerprint', 'selectedDepth', 'verdict', 'confidence', 'counterfactualProbes', 'debt', 'rationale', 'evidenceRefs']);
  stableId(value.assessmentId, 'assessment.assessmentId');
  if (value.operationId !== request.operationId || value.campaignId !== request.campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_READINESS_ASSESSMENT_CONFLICT', 'The readiness assessment does not belong to this Scene build.', {});
  if (value.dossierFingerprint !== hash(proposal)) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_DOSSIER_MISMATCH', 'The readiness assessment examined a different Scene dossier.', {});
  if (typeof value.policyFingerprint !== 'string' || !SHA256.test(value.policyFingerprint)) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_POLICY_UNBOUND', 'The readiness assessment is missing its versioned policy fingerprint.', {});
  const selectedDepth = depth(value.selectedDepth, 'assessment.selectedDepth');
  if (selectedDepth !== proposal.requestedDepth) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_DEPTH_MISMATCH', 'The readiness assessment examined the wrong preparation depth.', {});
  if (value.verdict !== 'adequate') throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_REPAIR_REQUIRED', 'The independent readiness examination found blocking preparation debt.', { debt: value.debt });
  if (!['low', 'medium', 'high'].includes(String(value.confidence))) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_CONFIDENCE_INVALID', 'The readiness assessment confidence is invalid.', {});
  if (['investigative', 'encounter_set_piece'].includes(selectedDepth) && value.confidence === 'low') throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_LOW_CONFIDENCE', 'The Scene needs repair because investigative readiness was not established confidently.', {});
  const debt = objectList(value.debt, 'assessment.debt', 32);
  if (debt.some((entry) => entry.blocking === true)) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_BLOCKING_DEBT', 'The Scene still has blocking preparation debt.', { debtRefs: debt.map((entry) => entry.debtId) });
  const probes = objectList(value.counterfactualProbes, 'assessment.counterfactualProbes', 16, 3);
  const sourceCatalog = new Set<string>([
    ...idList((proposal.sceneReality as JsonObject).zoneRefs, 'proposal.sceneReality.zoneRefs', 64, 1),
    ...idList((proposal.sceneReality as JsonObject).actorFrameRefs, 'proposal.sceneReality.actorFrameRefs', 64),
    ...idList((proposal.sceneReality as JsonObject).elementRefs, 'proposal.sceneReality.elementRefs', 128),
    ...idList((proposal.sceneReality as JsonObject).factRefs, 'proposal.sceneReality.factRefs', 256),
  ]);
  probes.forEach((probe, index) => {
    text(probe.probe, `assessment.counterfactualProbes[${index}].probe`, 1_000);
    if (probe.status !== 'supported') throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_PROBE_UNSUPPORTED', 'The Scene cannot answer one of its playability probes from prepared reality.', { field: `assessment.counterfactualProbes[${index}]` });
    idList(probe.evidenceRefs, `assessment.counterfactualProbes[${index}].evidenceRefs`, 32, 1).forEach((sourceRef) => { if (!sourceCatalog.has(sourceRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_READINESS_PROBE_REF_UNBOUND', 'A readiness probe cites material outside the examined dossier.', { sourceRef }); });
  });
  idList(value.evidenceRefs, 'assessment.evidenceRefs', 128, 1);
  text(value.rationale, 'assessment.rationale', 2_000);
  return clone(value as JsonObject);
}

function certificateFrom(proposal: JsonObject, request: JsonObject, assessment: JsonObject, pointerRevision: number): JsonObject {
  const reality = proposal.sceneReality as JsonObject;
  const sceneKit = proposal.sceneKit as JsonObject;
  const storyDesign = proposal.sceneStoryDesign as JsonObject;
  const zones = proposal.zones as JsonObject[];
  const profile = proposal.preparationProfile as JsonObject;
  const affordances = storyDesign.affordances as JsonObject[];
  const boundaries = proposal.preparedBoundaries as JsonObject[];
  const depthByZone = Object.fromEntries(zones.map((zone) => [String(zone.zoneId), String(profile.depth)])) as JsonObject;
  const coverageEntries = affordances.map((entry) => ({
    coverageEntryId: entry.coverageEntryId,
    zoneRef: entry.zoneRef,
    targetRef: entry.targetRef,
    actionFamily: entry.actionFamily,
    accessClass: entry.accessClass,
    thresholdRef: entry.thresholdRef,
    capabilityClass: entry.capabilityClass,
  } as JsonObject));
  const dependencySet = clone(request.authorityReadSet as JsonObject[]);
  const timelineAnchor = reality.timelineAnchor as JsonObject;
  const certificate: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.certificate,
    certificateId: `scene-ready:${hash({ reality: reality.realityId, realityRevision: reality.revision, pointerRevision }).slice(0, 40)}`,
    revision: pointerRevision,
    campaignId: request.campaignId as JsonValue,
    sceneRealityRef: { realityId: reality.realityId as JsonValue, revision: reality.revision as JsonValue },
    sceneKitRef: { sceneKitId: sceneKit.sceneKitId as JsonValue, revision: sceneKit.revision as JsonValue },
    depthByZone,
    coveredActionFamilies: [...new Set(coverageEntries.map((entry) => String(entry.actionFamily)))],
    coveredTargetRefs: [...new Set(coverageEntries.map((entry) => String(entry.targetRef)))],
    coveredThresholdRefs: [...new Set(coverageEntries.map((entry) => entry.thresholdRef).filter((entry): entry is string => typeof entry === 'string'))],
    coverageEntries,
    dependencySet,
    activeStateCompatibility: {
      minimumRevision: Number(timelineAnchor.activeSceneStateRevision ?? 0),
      invalidateOnDimensions: [...MATERIAL_INVALIDATION_DIMENSIONS],
    },
    validThrough: null,
    preparedBoundaryRefs: boundaries.map((entry) => entry.boundaryId as JsonValue),
    blockingDebtRefs: [],
    examinerAssessmentRef: assessment.assessmentId as JsonValue,
    status: 'certified',
    issuedAt: new Date().toISOString(),
    issuedBeforeInstructionSequence: Number(timelineAnchor.turnSequence ?? 0) + 1,
  };
  assertByteBound(certificate, SCENE_REALITY_LIMITS.certificateBytes, 'SCENE_READINESS_CERTIFICATE_TOO_LARGE', 'certificate');
  return certificate;
}

function bundleFrom(proposal: JsonObject, request: JsonObject, assessment: JsonObject, certificate: JsonObject, pointerRevision: number, priorBundle: JsonObject | null): JsonObject {
  const sceneKit = proposal.sceneKit as JsonObject;
  const reality = proposal.sceneReality as JsonObject;
  const design = proposal.sceneStoryDesign as JsonObject;
  const now = new Date().toISOString();
  const bundleId = `scene-bundle:${hash({ campaignId: request.campaignId, operationId: request.operationId, pointerRevision }).slice(0, 40)}`;
  const activeBundle: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.activeBundle,
    bundleId,
    revision: pointerRevision,
    campaignId: request.campaignId as JsonValue,
    sceneKitRef: { sceneKitId: sceneKit.sceneKitId as JsonValue, revision: sceneKit.revision as JsonValue },
    sceneRealityRef: { realityId: reality.realityId as JsonValue, revision: reality.revision as JsonValue },
    sceneStoryDesignRef: { designId: design.designId as JsonValue, revision: design.revision as JsonValue },
    readinessCertificateRef: { certificateId: certificate.certificateId as JsonValue, revision: certificate.revision as JsonValue },
    activeSceneStateRef: { stateId: `active-scene:${String(sceneKit.sceneKitId)}`, revision: ((proposal.activeSceneState as JsonObject).revision ?? 0) as JsonValue },
    timelineRef: clone((reality.timelineAnchor ?? {}) as JsonObject),
    clockConditionRefs: [],
    sourceBundleRef: priorBundle ? { bundleId: priorBundle.bundleId as JsonValue, revision: priorBundle.revision as JsonValue } : null,
    committedAt: now,
  };
  return {
    schemaVersion: 'gmc.scene-reality-bundle-payload/1',
    activeBundle,
    sceneKit: clone(sceneKit),
    sceneReality: clone(reality),
    zones: clone(proposal.zones as JsonObject[]),
    actorFrames: clone(proposal.actorFrames as JsonObject[]),
    elements: clone(proposal.elements as JsonObject[]),
    facts: clone(proposal.facts as JsonObject[]),
    sceneStoryDesign: clone(design),
    activeSceneState: clone(proposal.activeSceneState as JsonObject),
    readinessAssessment: clone(assessment),
    readinessCertificate: clone(certificate),
    openingFrame: clone(proposal.openingFrame as JsonObject),
  };
}

function publicReceipt(receipt: JsonObject, duplicate: boolean): JsonObject {
  return { ...clone(receipt), duplicate, authoritativeStateChanged: !duplicate } as JsonObject;
}

async function readBundleForPointer(pointer: ActiveSceneRealityPointerDocument, stores: SceneRealityCollections): Promise<SceneRealityBundleDocument> {
  const bundle = await stores.bundles.findOne({ userId: pointer.userId, campaignId: pointer.campaignId, bundleId: pointer.activeBundleId, bundleRevision: pointer.activeBundleRevision });
  if (!bundle) throw new StoryWorkspaceStoreError(503, 'SCENE_REALITY_ACTIVE_BUNDLE_INCOMPLETE', 'The current Scene bundle could not be loaded completely.', { pointerRevision: pointer.revision });
  return bundle;
}

export async function readActiveSceneReality(
  input: { userId: string; campaignId: string },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject | null> {
  const pointer = await stores.pointers.findOne({ userId: input.userId, campaignId: input.campaignId });
  if (!pointer) return null;
  const bundle = await readBundleForPointer(pointer, stores);
  return {
    contractVersion: SCENE_REALITY_CONTRACTS.activeBundle,
    pointerRevision: pointer.revision,
    bundle: clone(bundle.bundle),
    receipt: clone(pointer.latestReceipt),
  };
}

export async function readSceneRealityInspection(
  input: { userId: string; campaignId: string },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject | null> {
  const active = await readActiveSceneReality(input, stores);
  if (!active) {
    if (typeof stores.readStoryAuthority !== 'function') return null;
    const story = await stores.readStoryAuthority(input);
    const workspace = story?.workspace as JsonObject | undefined;
    const storyWorkspaceRef = story?.storyWorkspaceRef as JsonObject | undefined;
    const activeSceneKitRef = workspace?.activeSceneKitRef as JsonObject | undefined;
    const sceneKitId = typeof activeSceneKitRef?.sceneKitId === 'string' ? activeSceneKitRef.sceneKitId : '';
    const sceneKit = ((workspace?.sceneKits as JsonObject[] | undefined) ?? []).find((entry) => entry?.sceneKitId === sceneKitId);
    const sceneKitRevision = Number(sceneKit?.revision ?? activeSceneKitRef?.revision);
    if (!storyWorkspaceRef || !sceneKitId || !Number.isSafeInteger(sceneKitRevision) || sceneKitRevision < 1) return null;
    return {
      schemaVersion: SCENE_REALITY_CONTRACTS.inspection,
      campaignId: input.campaignId,
      status: 'legacy_unassessed',
      storyWorkspaceRef: clone(storyWorkspaceRef),
      sceneKitRef: { sceneKitId, revision: sceneKitRevision },
      reason: 'This historical current Scene has not yet received a full Scene-reality assessment and certificate.',
    };
  }
  const bundle = active.bundle as JsonObject;
  const certificate = bundle.readinessCertificate as JsonObject;
  const sceneKit = bundle.sceneKit as JsonObject;
  const [story, clock, activeState] = await Promise.all([
    currentStoryAuthority(input, stores),
    currentClockAuthority(input, stores),
    stores.activeSceneStates.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(sceneKit.sceneKitId) }),
  ]);
  const changedDimensions: string[] = [];
  for (const dependency of certificate.dependencySet as JsonObject[]) {
    const current = story?.ref === dependency.ref ? story : clock?.ref === dependency.ref ? clock : null;
    if (current && current.revision !== Number(dependency.revision)) changedDimensions.push(...dependency.invalidateOn as string[]);
  }
  const minimumStateRevision = Number((certificate.activeStateCompatibility as JsonObject).minimumRevision ?? 0);
  const currentStateRevision = Number(activeState?.revision ?? minimumStateRevision);
  const chain = await activeReceiptChainStatus(certificate, {
    userId: input.userId,
    campaignId: input.campaignId,
    ownerHeads: { activeSceneState: currentStateRevision },
  } as JsonObject, String(sceneKit.sceneKitId), stores);
  if (!chain.valid) changedDimensions.push('active_state_receipt_chain');
  else {
    const invalidating = new Set(((certificate.activeStateCompatibility as JsonObject).invalidateOnDimensions as string[]) ?? []);
    changedDimensions.push(...chain.changedDimensions.filter((dimension) => invalidating.has(dimension)));
  }
  const uniqueChanges = [...new Set(changedDimensions)];
  const reality = bundle.sceneReality as JsonObject;
  const design = bundle.sceneStoryDesign as JsonObject;
  const actorFrames = bundle.actorFrames as JsonObject[];
  const elements = bundle.elements as JsonObject[];
  const history: JsonObject[] = [];
  let historyRef: JsonObject | null = bundle.activeBundle as JsonObject;
  while (historyRef && history.length < 20) {
    const document = await stores.bundles.findOne({
      userId: input.userId,
      campaignId: input.campaignId,
      bundleId: String(historyRef.bundleId),
      bundleRevision: Number(historyRef.revision),
    });
    if (!document) break;
    const receipt = document.receipt;
    const acceptedBundle = document.bundle.activeBundle as JsonObject;
    history.push({
      bundleId: document.bundleId,
      revision: document.bundleRevision,
      operationId: document.operationId,
      trigger: receipt.schemaVersion === SCENE_REALITY_CONTRACTS.expansionReceipt ? 'emergent_expansion' : String(receipt.trigger),
      certificateRef: clone(acceptedBundle.readinessCertificateRef as JsonObject),
      sourceBundleRef: acceptedBundle.sourceBundleRef === null ? null : clone(acceptedBundle.sourceBundleRef as JsonObject),
      committedAt: String(receipt.committedAt),
    });
    historyRef = acceptedBundle.sourceBundleRef === null ? null : acceptedBundle.sourceBundleRef as JsonObject;
  }
  const inspection: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.inspection,
    campaignId: input.campaignId,
    status: certificate.status === 'certified' && uniqueChanges.length === 0 ? 'ready' : 'stale',
    pointerRevision: active.pointerRevision as JsonValue,
    activeBundleRef: clone((bundle.activeBundle as JsonObject)),
    sceneKitRef: { sceneKitId: sceneKit.sceneKitId as JsonValue, revision: sceneKit.revision as JsonValue },
    sceneRealityRef: { realityId: reality.realityId as JsonValue, revision: reality.revision as JsonValue },
    sceneStoryDesignRef: { designId: design.designId as JsonValue, revision: design.revision as JsonValue },
    certificateRef: { certificateId: certificate.certificateId as JsonValue, revision: certificate.revision as JsonValue },
    depthByZone: clone(certificate.depthByZone as JsonObject),
    coverageEntries: clone(certificate.coverageEntries as JsonObject[]),
    blockingDebtRefs: clone(certificate.blockingDebtRefs as JsonValue[]),
    preparedBoundaries: clone((reality.preparedBoundaries ?? []) as JsonObject[]),
    dependencies: clone(certificate.dependencySet as JsonObject[]),
    activeStateCompatibility: clone(certificate.activeStateCompatibility as JsonObject),
    currentOwnerHeads: {
      ...(story ? { [story.ref]: story.revision } : {}),
      ...(clock ? { [clock.ref]: clock.revision } : {}),
      activeSceneState: currentStateRevision,
    },
    changedDimensions: uniqueChanges,
    examinerAssessment: clone(bundle.readinessAssessment as JsonObject),
    preparationProfile: clone((reality.preparationProfile ?? {}) as JsonObject),
    storyAlignment: clone((design.storyAlignment ?? reality.storyAlignment ?? {}) as JsonObject),
    actorFrames: clone(actorFrames),
    elements: clone(elements),
    deliberateUnknowns: clone((reality.deliberateUnknowns ?? []) as JsonValue[]),
    history,
    recordCounts: {
      zones: (bundle.zones as JsonObject[]).length,
      actorFrames: (bundle.actorFrames as JsonObject[]).length,
      elements: (bundle.elements as JsonObject[]).length,
      facts: (bundle.facts as JsonObject[]).length,
      affordances: (design.affordances as JsonObject[]).length,
    },
    latestCommitReceipt: clone(active.receipt as JsonObject),
  };
  assertByteBound(inspection, SCENE_REALITY_LIMITS.aggregateRealityBytes, 'SCENE_REALITY_INSPECTION_TOO_LARGE', 'inspection');
  return inspection;
}

/**
 * A certified dossier may replace the Story workspace's compact Scene only
 * while it still proves the exact current Story head. This is deliberately a
 * pure, fail-closed check so every read and mutation route can make the same
 * decision without trusting a stale active Scene-reality pointer.
 */
export function sceneRealityMatchesStoryHead(
  sceneReality: unknown,
  campaignId: string,
  storyWorkspaceRef: unknown,
): boolean {
  if (!object(sceneReality) || !object(sceneReality.bundle) || !object(storyWorkspaceRef)) return false;
  const bundle = sceneReality.bundle;
  const certificate = object(bundle.readinessCertificate) ? bundle.readinessCertificate : null;
  const reality = object(bundle.sceneReality) ? bundle.sceneReality : null;
  const timelineAnchor = reality && object(reality.timelineAnchor) ? reality.timelineAnchor : null;
  const revision = Number(storyWorkspaceRef.revision);
  if (!certificate || certificate.status !== 'certified' || !Number.isSafeInteger(revision) || revision < 0) return false;
  const expectedRef = `gmc:story-workspace:${campaignId}`;
  const dependencies = Array.isArray(certificate.dependencySet) ? certificate.dependencySet : [];
  const storyDependencies = dependencies.filter((entry) => object(entry)
    && entry.owner === 'gmc'
    && entry.ref === expectedRef);
  return storyDependencies.length === 1
    && Number((storyDependencies[0] as JsonObject).revision) === revision
    && Number(timelineAnchor?.workspaceRevision) === revision;
}

export async function readSceneRealityOperation(
  input: { userId: string; campaignId: string; operationId: string },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject | null> {
  const operation = await stores.operations.findOne({ userId: input.userId, campaignId: input.campaignId, operationId: input.operationId });
  if (operation) return publicReceipt(operation.receipt, true);
  const pointer = await stores.pointers.findOne({ userId: input.userId, campaignId: input.campaignId, latestOperationId: input.operationId });
  return pointer ? publicReceipt(pointer.latestReceipt, true) : null;
}

async function insertOperation(document: SceneRealityOperationDocument, stores: SceneRealityCollections): Promise<void> {
  try {
    await stores.operations.insertOne(document);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const existing = await stores.operations.findOne({ userId: document.userId, campaignId: document.campaignId, operationId: document.operationId });
    if (!existing || existing.requestHash !== document.requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_IDEMPOTENCY_CONFLICT', 'This Scene preparation operation was already used for different material.', {});
  }
}

export async function commitSceneReality(
  input: {
    userId: string;
    campaignId: string;
    expectedPointerRevision: number;
    buildRequest: unknown;
    proposal: unknown;
    assessment: unknown;
  },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject> {
  if (!SCENE_REALITY_WRITE_ENABLED) throw new StoryWorkspaceStoreError(503, 'SCENE_REALITY_WRITES_DISABLED', 'Scene preparation is not enabled for this campaign yet.', {});
  const request = validateBuildRequest(input.buildRequest, input.campaignId);
  const requestHash = hash({ buildRequest: request, proposal: input.proposal, assessment: input.assessment });
  const existing = await stores.operations.findOne({ userId: input.userId, campaignId: input.campaignId, operationId: String(request.operationId) });
  if (existing) {
    if (existing.idempotencyKey !== request.idempotencyKey || existing.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_IDEMPOTENCY_CONFLICT', 'This Scene preparation operation was already used for different material.', {});
    return publicReceipt(existing.receipt, true);
  }
  await validateCurrentGmcReadSet(request, { userId: input.userId, campaignId: input.campaignId }, stores);
  const pointer = await stores.pointers.findOne({ userId: input.userId, campaignId: input.campaignId });
  const actualPointerRevision = pointer?.revision ?? 0;
  if (whole(input.expectedPointerRevision, 'expectedPointerRevision') !== actualPointerRevision) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_POINTER_CONFLICT', 'The prepared Scene changed before this bundle could be committed.', { field: 'activeSceneBundle.revision', expectedRevision: input.expectedPointerRevision, actualRevision: actualPointerRevision });
  const priorDocument = pointer ? await readBundleForPointer(pointer, stores) : null;
  if (request.trigger === 'emergent_expansion') {
    if (!priorDocument) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_EXPANSION_WITHOUT_CERTIFICATE', 'World expansion requires an earlier certified Scene.', {});
    const priorCertificate = priorDocument.bundle.readinessCertificate as JsonObject;
    const requestedCertificate = ref(request.preexistingCertificateRef, 'certificateId', 'buildRequest.preexistingCertificateRef');
    if (requestedCertificate.id !== priorCertificate.certificateId || requestedCertificate.revision !== priorCertificate.revision) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CERTIFICATE_CONFLICT', 'The Scene readiness certificate changed before world expansion.', {
      field: 'buildRequest.preexistingCertificateRef.revision',
      expectedRevision: requestedCertificate.revision,
      actualRevision: priorCertificate.revision,
    });
    const priorReality = priorDocument.bundle.sceneReality as JsonObject;
    const matchedBoundary = (priorReality.preparedBoundaries as JsonObject[]).find((entry) => entry.boundaryId === request.crossedBoundaryRef);
    if (!matchedBoundary) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_BOUNDARY_NOT_PREEXISTING', 'The requested world expansion did not cross an earlier prepared boundary.', { field: 'buildRequest.crossedBoundaryRef' });
  }
  const proposal = validateProposal(input.proposal, request, input.campaignId);
  validateSuccessorContinuity(proposal, priorDocument?.bundle ?? null, request.trigger);
  const sceneKit = proposal.sceneKit as JsonObject;
  const proposedActiveState = proposal.activeSceneState as JsonObject;
  const timelineAnchor = (proposal.sceneReality as JsonObject).timelineAnchor as JsonObject;
  const currentActiveState = await stores.activeSceneStates.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(sceneKit.sceneKitId) });
  const currentActiveRevision = Number(currentActiveState?.revision ?? 0);
  if (Number(proposedActiveState.revision) !== currentActiveRevision || Number(timelineAnchor.activeSceneStateRevision) !== currentActiveRevision) {
    throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_ACTIVE_STATE_CONFLICT', 'Accepted play changed before this Scene preparation could be committed.', {
      field: 'proposal.activeSceneState.revision', expectedRevision: proposedActiveState.revision, actualRevision: currentActiveRevision,
    });
  }
  const receiptChain = idList(proposedActiveState.receiptChain, 'proposal.activeSceneState.receiptChain', 64);
  if (currentActiveRevision === 0 && receiptChain.length) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_ACTIVE_STATE_CHAIN_INVALID', 'A new Scene cannot claim an earlier accepted turn receipt.', { field: 'proposal.activeSceneState.receiptChain' });
  if (currentActiveState?.latestReceiptRef && !receiptChain.includes(currentActiveState.latestReceiptRef)) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_ACTIVE_STATE_CHAIN_INCOMPLETE', 'The Scene preparation omitted the latest accepted turn receipt.', { field: 'proposal.activeSceneState.receiptChain', latestReceiptRef: currentActiveState.latestReceiptRef });
  for (const receiptRef of receiptChain) {
    const receipt = await stores.sceneTurnReceipts.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId: String(sceneKit.sceneKitId), receiptRef });
    if (!receipt || receipt.stateRevisionAfter > currentActiveRevision) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_ACTIVE_STATE_CHAIN_INVALID', 'The Scene preparation cited an unverified accepted-turn receipt.', { field: 'proposal.activeSceneState.receiptChain', receiptRef });
  }
  const assessment = validateAssessment(input.assessment, proposal, request);
  const pointerRevision = actualPointerRevision + 1;
  const certificate = certificateFrom(proposal, request, assessment, pointerRevision);
  const manifestCertificate = ref(((proposal.openingFrame as JsonObject).presentedTargetManifest as JsonObject).certificateRef, 'certificateId', 'proposal.openingFrame.presentedTargetManifest.certificateRef');
  if (manifestCertificate.id !== certificate.certificateId || manifestCertificate.revision !== certificate.revision) throw new StoryWorkspaceStoreError(422, 'SCENE_REALITY_MANIFEST_CERTIFICATE_MISMATCH', 'The prepared opening is not bound to the exact readiness certificate being issued.', { field: 'proposal.openingFrame.presentedTargetManifest.certificateRef.revision', expectedRevision: certificate.revision, actualRevision: manifestCertificate.revision });
  const priorBundle = priorDocument ? priorDocument.bundle.activeBundle as JsonObject : null;
  const bundle = bundleFrom(proposal, request, assessment, certificate, pointerRevision, priorBundle);
  assertByteBound(bundle, SCENE_REALITY_LIMITS.aggregateRealityBytes, 'SCENE_REALITY_BUNDLE_TOO_LARGE', 'bundle');
  const activeBundle = bundle.activeBundle as JsonObject;
  const now = new Date();
  const committedRefs = [
    String((bundle.sceneKit as JsonObject).sceneKitId), String((bundle.sceneReality as JsonObject).realityId),
    ...(bundle.zones as JsonObject[]).map((entry) => String(entry.zoneId)), ...(bundle.actorFrames as JsonObject[]).map((entry) => String(entry.actorFrameId)),
    ...(bundle.elements as JsonObject[]).map((entry) => String(entry.elementId)), ...(bundle.facts as JsonObject[]).map((entry) => String(entry.factId)),
    String((bundle.sceneStoryDesign as JsonObject).designId), String(certificate.certificateId), String(activeBundle.bundleId),
  ];
  const priorHeads: JsonObject = pointer ? { activeSceneBundle: pointer.revision } : { activeSceneBundle: 0 };
  const resultingHeads: JsonObject = {
    activeSceneBundle: pointerRevision,
    sceneKit: (bundle.sceneKit as JsonObject).revision as JsonValue,
    sceneReality: (bundle.sceneReality as JsonObject).revision as JsonValue,
    readinessCertificate: certificate.revision as JsonValue,
    activeSceneState: ((bundle.activeSceneState as JsonObject).revision ?? 0) as JsonValue,
  };
  const isExpansion = request.trigger === 'emergent_expansion';
  const receipt: JsonObject = {
    schemaVersion: isExpansion ? SCENE_REALITY_CONTRACTS.expansionReceipt : SCENE_REALITY_CONTRACTS.commitReceipt,
    receiptId: `${isExpansion ? 'world-expansion' : 'scene-reality-commit'}:${hash({ operationId: request.operationId, requestHash }).slice(0, 40)}`,
    operationId: request.operationId as JsonValue,
    idempotencyKey: request.idempotencyKey as JsonValue,
    correlationId: request.correlationId as JsonValue,
    campaignId: input.campaignId,
    priorOwnerHeads: priorHeads,
    resultingOwnerHeads: resultingHeads,
    priorBundleRef: priorBundle ? { bundleId: priorBundle.bundleId as JsonValue, revision: priorBundle.revision as JsonValue } : null,
    resultingBundleRef: { bundleId: activeBundle.bundleId as JsonValue, revision: activeBundle.revision as JsonValue },
    committedRefs,
    invalidatedRefs: priorBundle ? [String((priorDocument?.bundle.readinessCertificate as JsonObject).certificateId)] : [],
    promotionRecords: [],
    duplicate: false,
    pointerSwapRevision: pointerRevision,
    committedAt: now.toISOString(),
    ...(isExpansion ? { worldExpansionRequestRef: String(request.operationId), rebaseRequired: request.programRef !== null } : { buildRequestRef: String(request.operationId), trigger: request.trigger as JsonValue }),
  };
  assertByteBound(receipt, SCENE_REALITY_LIMITS.receiptBytes, 'SCENE_REALITY_RECEIPT_TOO_LARGE', 'receipt');
  const bundleDocument: SceneRealityBundleDocument = {
    userId: input.userId, campaignId: input.campaignId, sceneKitId: String((bundle.sceneKit as JsonObject).sceneKitId),
    bundleId: String(activeBundle.bundleId), bundleRevision: pointerRevision, operationId: String(request.operationId),
    idempotencyKey: String(request.idempotencyKey), requestHash, status: 'staged', bundle, receipt, createdAt: now,
  };
  try {
    await stores.bundles.insertOne(bundleDocument);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const staged = await stores.bundles.findOne({ userId: input.userId, campaignId: input.campaignId, bundleId: bundleDocument.bundleId });
    if (!staged || staged.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_IDEMPOTENCY_CONFLICT', 'The staged Scene bundle belongs to a different operation.', {});
  }
  if (!pointer) {
    try {
      await stores.pointers.insertOne({
        userId: input.userId, campaignId: input.campaignId, pointerId: `active-scene-reality:${input.campaignId}`, revision: pointerRevision,
        activeBundleId: bundleDocument.bundleId, activeBundleRevision: pointerRevision, latestOperationId: bundleDocument.operationId,
        latestRequestHash: requestHash, latestReceipt: receipt, updatedAt: now,
      });
    } catch (error: unknown) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      const raced = await stores.pointers.findOne({ userId: input.userId, campaignId: input.campaignId });
      if (!raced || raced.latestOperationId !== bundleDocument.operationId || raced.latestRequestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_POINTER_CONFLICT', 'Another complete Scene bundle became current first.', { field: 'activeSceneBundle.revision', expectedRevision: 0, actualRevision: raced?.revision ?? 1 });
    }
  } else {
    const swapped = await stores.pointers.updateOne(
      { userId: input.userId, campaignId: input.campaignId, revision: actualPointerRevision, activeBundleId: pointer.activeBundleId },
      { $set: { revision: pointerRevision, activeBundleId: bundleDocument.bundleId, activeBundleRevision: pointerRevision, latestOperationId: bundleDocument.operationId, latestRequestHash: requestHash, latestReceipt: receipt, updatedAt: now } },
    );
    if (swapped.modifiedCount !== 1) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_POINTER_CONFLICT', 'Another complete Scene bundle became current first.', { field: 'activeSceneBundle.revision', expectedRevision: actualPointerRevision });
  }
  await insertOperation({ userId: input.userId, campaignId: input.campaignId, operationId: bundleDocument.operationId, idempotencyKey: bundleDocument.idempotencyKey, requestHash, receipt, bundleId: bundleDocument.bundleId, createdAt: now }, stores);
  return publicReceipt(receipt, false);
}

function sameCoverage(left: JsonObject, right: JsonObject): boolean {
  return left.zoneRef === right.zoneRef
    && left.targetRef === right.targetRef
    && left.actionFamily === right.actionFamily
    && left.accessClass === right.accessClass
    && left.thresholdRef === right.thresholdRef
    && left.capabilityClass === right.capabilityClass;
}

async function activeReceiptChainStatus(
  certificate: JsonObject,
  query: JsonObject,
  sceneKitId: string,
  stores: SceneRealityCollections,
): Promise<{ valid: boolean; changedDimensions: string[] }> {
  const minimum = Number((certificate.activeStateCompatibility as JsonObject).minimumRevision ?? 0);
  const current = Number((query.ownerHeads as JsonObject).activeSceneState ?? minimum);
  if (current === minimum) return { valid: true, changedDimensions: [] };
  if (!Number.isSafeInteger(current) || current < minimum) return { valid: false, changedDimensions: [] };
  const receipts = await stores.sceneTurnReceipts.find({
    userId: query.userId as string,
    campaignId: query.campaignId as string,
    sceneKitId,
    stateRevisionBefore: { $gte: minimum },
    stateRevisionAfter: { $lte: current },
  }).sort({ stateRevisionBefore: 1 }).toArray();
  let head = minimum;
  const changedDimensions = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.stateRevisionBefore !== head || receipt.stateRevisionAfter !== head + 1
      || !Array.isArray(receipt.readinessChangedDimensions)) return { valid: false, changedDimensions: [] };
    receipt.readinessChangedDimensions.forEach((dimension) => changedDimensions.add(String(dimension)));
    head = receipt.stateRevisionAfter;
  }
  return { valid: head === current, changedDimensions: [...changedDimensions] };
}

export async function decideSceneCoverage(
  input: { userId: string; campaignId: string; query: unknown },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject> {
  if (!object(input.query)) throw new StoryWorkspaceStoreError(400, 'SCENE_COVERAGE_QUERY_INVALID', 'The Scene coverage check is missing.', {});
  const query = clone(input.query as JsonObject);
  version(query, SCENE_REALITY_CONTRACTS.coverageQuery, 'query');
  exactKeys(query, 'query', ['schemaVersion', 'queryId', 'operationId', 'campaignId', 'instructionRef', 'playerActionFingerprint', 'instructionSequence', 'certificateRef', 'ownerHeads', 'requirements', 'executionWindow']);
  for (const field of ['queryId', 'operationId', 'campaignId', 'instructionRef']) stableId(query[field], `query.${field}`);
  if (query.campaignId !== input.campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'The coverage check belongs to a different campaign.', {});
  if (typeof query.playerActionFingerprint !== 'string' || !SHA256.test(query.playerActionFingerprint)) throw new StoryWorkspaceStoreError(422, 'SCENE_COVERAGE_FINGERPRINT_INVALID', 'The coverage check is not bound to the saved player instruction.', {});
  const instructionSequence = whole(query.instructionSequence, 'query.instructionSequence', 1);
  const requestedCertificate = ref(query.certificateRef, 'certificateId', 'query.certificateRef');
  if (!object(query.ownerHeads)) throw new StoryWorkspaceStoreError(422, 'SCENE_COVERAGE_OWNER_HEADS_INVALID', 'The coverage check needs current owner heads.', {});
  const requirements = objectList(query.requirements, 'query.requirements', 64, 1).map((entry, index) => validateCoverageEntry(entry, `query.requirements[${index}]`));
  if (!object(query.executionWindow) || !Array.isArray(query.executionWindow.nodeRefs) || query.executionWindow.nodeRefs.length < 1) throw new StoryWorkspaceStoreError(422, 'SCENE_COVERAGE_WINDOW_INVALID', 'Coverage must include the complete executable action window.', {});
  const active = await readActiveSceneReality({ userId: input.userId, campaignId: input.campaignId }, stores);
  if (!active) throw new StoryWorkspaceStoreError(409, 'SCENE_READINESS_CERTIFICATE_REQUIRED', 'The current Scene has not been certified for play.', {});
  const bundle = active.bundle as JsonObject;
  const certificate = bundle.readinessCertificate as JsonObject;
  const reality = bundle.sceneReality as JsonObject;
  const currentCertificateRevision = Number(certificate.revision);
  const decisionBase = {
    schemaVersion: SCENE_REALITY_CONTRACTS.coverageDecision,
    decisionId: `coverage-decision:${hash({ queryId: query.queryId, certificate: certificate.certificateId }).slice(0, 40)}`,
    queryId: query.queryId,
    campaignId: input.campaignId,
    certificateRef: { certificateId: certificate.certificateId, revision: currentCertificateRevision },
    matchingCoverageEntryRefs: [] as JsonValue[], crossedBoundaryRef: null as JsonValue,
    changedDimensions: [] as JsonValue[], ambiguousTargetRefs: [] as JsonValue[], defectRefs: [] as JsonValue[],
    ownerHeads: clone(query.ownerHeads as JsonObject), mutationApplied: false,
  };
  if (requestedCertificate.id !== certificate.certificateId || requestedCertificate.revision !== currentCertificateRevision || certificate.status !== 'certified') {
    return { ...decisionBase, decision: 'certificate_stale', changedDimensions: ['certificate'] } as JsonObject;
  }
  const changedDimensions: string[] = [];
  const [currentStory, currentClock] = await Promise.all([
    currentStoryAuthority({ userId: input.userId, campaignId: input.campaignId }, stores),
    currentClockAuthority({ userId: input.userId, campaignId: input.campaignId }, stores),
  ]);
  for (const dependency of certificate.dependencySet as JsonObject[]) {
    const dependencyRef = String(dependency.ref);
    const supplied = currentStory?.ref === dependencyRef
      ? currentStory.revision
      : currentClock?.ref === dependencyRef
        ? currentClock.revision
      : (query.ownerHeads as JsonObject)[dependencyRef];
    if (supplied !== dependency.revision) changedDimensions.push(...(dependency.invalidateOn as string[]));
  }
  const chainQuery = { ...query, userId: input.userId } as JsonObject;
  const chain = await activeReceiptChainStatus(certificate, chainQuery, String((bundle.sceneKit as JsonObject).sceneKitId), stores);
  if (!chain.valid) changedDimensions.push('active_state_receipt_chain');
  else {
    const invalidating = new Set(((certificate.activeStateCompatibility as JsonObject).invalidateOnDimensions as string[]) ?? []);
    changedDimensions.push(...chain.changedDimensions.filter((dimension) => invalidating.has(dimension)));
  }
  if (changedDimensions.length) return { ...decisionBase, decision: 'certificate_stale', changedDimensions: [...new Set(changedDimensions)] } as JsonObject;
  const entries = certificate.coverageEntries as JsonObject[];
  const matched: string[] = [];
  const missing: JsonObject[] = [];
  for (const requirement of requirements) {
    const found = entries.find((entry) => sameCoverage(entry, requirement));
    if (found) matched.push(String(found.coverageEntryId));
    else missing.push(requirement);
  }
  if (missing.length === 0) return { ...decisionBase, decision: 'covered', matchingCoverageEntryRefs: matched } as JsonObject;
  const boundaries = reality.preparedBoundaries as JsonObject[];
  for (const requirement of missing) {
    const possibleRefs = [requirement.thresholdRef, requirement.targetRef].filter((entry): entry is string => typeof entry === 'string');
    const crossed = boundaries.find((entry) => possibleRefs.includes(String(entry.boundaryId)) && Number(entry.committedBeforeInstructionSequence) < instructionSequence);
    if (crossed) return { ...decisionBase, decision: 'boundary_crossing', matchingCoverageEntryRefs: matched, crossedBoundaryRef: crossed.boundaryId as JsonValue } as JsonObject;
  }
  const defectRef = `readiness-defect:${hash({ certificate: certificate.certificateId, missing }).slice(0, 40)}`;
  return { ...decisionBase, decision: 'inside_envelope_defect', matchingCoverageEntryRefs: matched, defectRefs: [defectRef] } as JsonObject;
}

export async function selectPreparedStoryFacts(
  input: { userId: string; campaignId: string; proposal: unknown },
  stores: SceneRealityCollections = collections(),
): Promise<JsonObject> {
  if (!SCENE_REALITY_WRITE_ENABLED) throw new StoryWorkspaceStoreError(503, 'SCENE_REALITY_WRITES_DISABLED', 'Scene preparation is not enabled for this campaign yet.', {});
  if (!object(input.proposal)) throw new StoryWorkspaceStoreError(400, 'SCENE_FACT_SELECTION_INVALID', 'The prepared-fact selection is missing.', {});
  const proposal = clone(input.proposal as JsonObject);
  version(proposal, SCENE_REALITY_CONTRACTS.factSelectionProposal, 'proposal');
  exactKeys(proposal, 'proposal', ['schemaVersion', 'selectionId', 'operationId', 'campaignId', 'instructionRef', 'instructionFingerprint', 'requirementFingerprint', 'sceneStoryDesignRef', 'certificateRef', 'selections']);
  for (const field of ['selectionId', 'operationId', 'campaignId', 'instructionRef']) stableId(proposal[field], `proposal.${field}`);
  if (proposal.campaignId !== input.campaignId) throw new StoryWorkspaceStoreError(409, 'SCENE_REALITY_CAMPAIGN_CONFLICT', 'The prepared-fact selection belongs to a different campaign.', {});
  for (const field of ['instructionFingerprint', 'requirementFingerprint']) if (typeof proposal[field] !== 'string' || !SHA256.test(proposal[field])) throw new StoryWorkspaceStoreError(422, 'SCENE_FACT_SELECTION_FINGERPRINT_INVALID', 'The prepared-fact selection is not bound to the saved instruction and requirements.', { field: `proposal.${field}` });
  const requestHash = hash(proposal);
  const existing = await stores.factSelections.findOne({ userId: input.userId, campaignId: input.campaignId, operationId: String(proposal.operationId) });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_FACT_SELECTION_IDEMPOTENCY_CONFLICT', 'This fact-selection operation was already used for a different request.', {});
    return { ...clone(existing.receipt), duplicate: true } as JsonObject;
  }
  const active = await readActiveSceneReality({ userId: input.userId, campaignId: input.campaignId }, stores);
  if (!active) throw new StoryWorkspaceStoreError(409, 'SCENE_READINESS_CERTIFICATE_REQUIRED', 'The current Scene has not been certified for prepared-fact selection.', {});
  const bundle = active.bundle as JsonObject;
  const certificate = bundle.readinessCertificate as JsonObject;
  const design = bundle.sceneStoryDesign as JsonObject;
  const certificateRef = ref(proposal.certificateRef, 'certificateId', 'proposal.certificateRef');
  const designRef = ref(proposal.sceneStoryDesignRef, 'designId', 'proposal.sceneStoryDesignRef');
  if (certificateRef.id !== certificate.certificateId || certificateRef.revision !== certificate.revision || certificate.status !== 'certified') throw new StoryWorkspaceStoreError(409, 'SCENE_READINESS_CERTIFICATE_STALE', 'The Scene readiness certificate changed before prepared facts were selected.', { field: 'proposal.certificateRef.revision', expectedRevision: certificateRef.revision, actualRevision: certificate.revision });
  const changedDimensions: string[] = [];
  const [currentStory, currentClock] = await Promise.all([
    currentStoryAuthority({ userId: input.userId, campaignId: input.campaignId }, stores),
    currentClockAuthority({ userId: input.userId, campaignId: input.campaignId }, stores),
  ]);
  for (const dependency of certificate.dependencySet as JsonObject[]) {
    const ownerRevision = currentStory?.ref === dependency.ref
      ? currentStory.revision
      : currentClock?.ref === dependency.ref
        ? currentClock.revision
        : null;
    if (ownerRevision !== null && ownerRevision !== Number(dependency.revision)) {
      changedDimensions.push(...dependency.invalidateOn as string[]);
    }
  }
  const sceneKitId = String((bundle.sceneKit as JsonObject).sceneKitId);
  const activeState = await stores.activeSceneStates.findOne({ userId: input.userId, campaignId: input.campaignId, sceneKitId });
  const minimumStateRevision = Number((certificate.activeStateCompatibility as JsonObject).minimumRevision ?? 0);
  const currentStateRevision = Number(activeState?.revision ?? minimumStateRevision);
  const chain = await activeReceiptChainStatus(certificate, {
    userId: input.userId,
    campaignId: input.campaignId,
    ownerHeads: { activeSceneState: currentStateRevision },
  } as JsonObject, sceneKitId, stores);
  if (!chain.valid) changedDimensions.push('active_state_receipt_chain');
  else {
    const invalidating = new Set(((certificate.activeStateCompatibility as JsonObject).invalidateOnDimensions as string[]) ?? []);
    changedDimensions.push(...chain.changedDimensions.filter((dimension) => invalidating.has(dimension)));
  }
  if (changedDimensions.length) {
    throw new StoryWorkspaceStoreError(409, 'SCENE_READINESS_CERTIFICATE_STALE', 'The prepared Scene changed before its facts could be selected.', {
      field: 'proposal.certificateRef.revision',
      changedDimensions: [...new Set(changedDimensions)],
    });
  }
  if (designRef.id !== design.designId || designRef.revision !== design.revision) throw new StoryWorkspaceStoreError(409, 'SCENE_STORY_DESIGN_CONFLICT', 'The Scene Story design changed before prepared facts were selected.', { field: 'proposal.sceneStoryDesignRef.revision', expectedRevision: designRef.revision, actualRevision: design.revision });
  const factRecords = new Map((bundle.facts as JsonObject[]).map((entry) => [String(entry.factId), entry]));
  const affordances = new Map((design.affordances as JsonObject[]).map((entry) => [String(entry.affordanceId), entry]));
  const certifiedCoverageRefs = new Set((certificate.coverageEntries as JsonObject[]).map((entry) => String(entry.coverageEntryId)));
  const selections = objectList(proposal.selections, 'proposal.selections', 64, 1);
  const selectedAffordanceRefs: string[] = [];
  const selectedFactRefs: string[] = [];
  selections.forEach((selection, index) => {
    exactKeys(selection, `proposal.selections[${index}]`, ['requirementRef', 'affordanceRef', 'factRefs']);
    const requirementRef = stableId(selection.requirementRef, `proposal.selections[${index}].requirementRef`);
    const affordanceRef = stableId(selection.affordanceRef, `proposal.selections[${index}].affordanceRef`);
    const affordance = affordances.get(affordanceRef);
    if (!affordance) throw new StoryWorkspaceStoreError(422, 'SCENE_FACT_SELECTION_AFFORDANCE_UNBOUND', 'The selection names an affordance outside the current prepared Scene.', { affordanceRef });
    if (requirementRef !== affordance.coverageEntryId || !certifiedCoverageRefs.has(requirementRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_FACT_SELECTION_REQUIREMENT_UNBOUND', 'The selection is not bound to the exact certified affordance requirement.', { field: `proposal.selections[${index}].requirementRef`, requirementRef });
    const allowedFacts = new Set(affordance.factRefs as string[]);
    idList(selection.factRefs, `proposal.selections[${index}].factRefs`, 32, 1).forEach((factRef) => {
      const fact = factRecords.get(factRef);
      if (!fact || !allowedFacts.has(factRef)) throw new StoryWorkspaceStoreError(422, 'SCENE_FACT_SELECTION_FACT_UNBOUND', 'The selection names a fact outside the chosen prepared affordance.', { factRef });
      if (!SELECTABLE_EPISTEMIC_STATES.has(String(fact.epistemicState))) throw new StoryWorkspaceStoreError(422, 'SCENE_FACT_SELECTION_EPISTEMIC_UNSAFE', 'The selected preparation is not an established fact that can be disclosed for this action.', { factRef, epistemicState: fact.epistemicState });
      selectedFactRefs.push(factRef);
    });
    selectedAffordanceRefs.push(affordanceRef);
  });
  const now = new Date();
  const receipt: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.factSelectionReceipt,
    receiptId: `story-fact-selection:${hash({ operationId: proposal.operationId, requestHash }).slice(0, 40)}`,
    selectionId: proposal.selectionId as JsonValue, operationId: proposal.operationId as JsonValue, campaignId: input.campaignId,
    sceneStoryDesignRef: clone(proposal.sceneStoryDesignRef as JsonObject), certificateRef: clone(proposal.certificateRef as JsonObject),
    selectedAffordanceRefs: [...new Set(selectedAffordanceRefs)], selectedFactRefs: [...new Set(selectedFactRefs)],
    ownerHeads: { activeSceneBundle: active.pointerRevision as JsonValue }, mutationApplied: false, createdAt: now.toISOString(), duplicate: false,
  };
  assertByteBound(receipt, SCENE_REALITY_LIMITS.receiptBytes, 'SCENE_FACT_SELECTION_RECEIPT_TOO_LARGE', 'receipt');
  try {
    await stores.factSelections.insertOne({ userId: input.userId, campaignId: input.campaignId, operationId: String(proposal.operationId), requestHash, receipt, createdAt: now });
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const raced = await stores.factSelections.findOne({ userId: input.userId, campaignId: input.campaignId, operationId: String(proposal.operationId) });
    if (!raced || raced.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'SCENE_FACT_SELECTION_IDEMPOTENCY_CONFLICT', 'This fact-selection operation was already used for a different request.', {});
    return { ...clone(raced.receipt), duplicate: true } as JsonObject;
  }
  return receipt;
}

export function sceneRealityHealthAdvertisement(): JsonObject {
  return {
    capabilities: clone(SCENE_REALITY_CAPABILITIES as unknown as string[]),
    contracts: clone(SCENE_REALITY_CONTRACTS as unknown as JsonObject),
    limits: clone(SCENE_REALITY_LIMITS as unknown as JsonObject),
    authority: 'gmc',
    routeEnabled: true,
    writeEnabled: SCENE_REALITY_WRITE_ENABLED,
  };
}
