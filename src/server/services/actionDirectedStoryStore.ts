import { createHash } from 'node:crypto';
import {
  applyStoryRecordPatch,
  compileLegacyScenePlanImport,
  type JsonObject,
  type JsonValue,
  PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
  PLAYABLE_SCENE_CONTEXT_V2_MAX_BYTES,
  readActiveStoryWorkspace,
  readStoryWorkspaceRevision,
  replaceStoryWorkspace,
  SCENE_HANDOFF_RECEIPT_CONTRACT_VERSION,
  SCENE_KIT_V2_CONTRACT_VERSION,
  STORY_DELTA_MAX_BYTES,
  STORY_DELTA_V2_CONTRACT_VERSION,
  STORY_GRAPH_CONTRACT_VERSION,
  STORY_GRAPH_MAX_BYTES,
  STORY_PLANNING_STATES,
  STORY_TRUTH_STATES,
  STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
  type StoryRecordPatch,
  StoryWorkspaceStoreError,
  type StoryWorkspaceRevisionCollection,
  emptyStoryWorkspace,
  validateSceneHandoffProposal,
  validateSceneKitV2,
  validateStoryGraphV2,
} from './storyWorkspaceStore.js';

/** D2 authority receipt and service-only projection versions. */
export const STORY_GRAPH_WRITE_RECEIPT_CONTRACT_VERSION = 'gmc.story-graph-write-receipt/1';
export const STORY_MIGRATION_RECEIPT_CONTRACT_VERSION = 'gmc.story-v2-migration-receipt/1';
export const STORY_MIGRATION_PREVIEW_CONTRACT_VERSION = 'gmc.story-migration-preview/1';
export const ACCEPTED_V1_SCENE_SNAPSHOT_CONTRACT_VERSION = 'gma.accepted-v1-scene-snapshot/1';
export const PRIVATE_SCENE_CONTEXT_CONTRACT_VERSION = 'gmc.scene-director-context/1';
export const PRIVATE_SCENE_CONTEXT_MAX_BYTES = 12_288;
export const STORY_AUTHORITY_RECEIPT_CATALOG_CONTRACT_VERSION = 'gmc.story-authority-receipt-catalog/1';
export const STORY_AUTHORITY_RECEIPT_CATALOG_MAX_ENTRIES = 192;
export const SCENE_HANDOFF_AUTHORITY_ENVELOPE_MAX_BYTES = 32_768;

type HandoffMode = 'reuse' | 'select' | 'create' | 'replace';
type StoryImpactEffect = 'advance' | 'complicate' | 'resolve' | 'reopen' | 'retire';

/** Exact accepted player-action evidence bound to a scene handoff. */
export interface PlayerActionReceipt {
  receiptRef: string;
  interactionId: string;
  playerActionFingerprint: string;
  status: 'accepted';
}

/** Committed authority evidence for one proposed source reference. */
export interface SourceAuthorityReceipt {
  sourceRef: string;
  receiptRef: string;
  authority: 'gmc' | 'gma' | 'vcs' | 'studio';
  status: 'committed';
}

/** Physical GMC request envelope around the logical handoff proposal. */
export interface SceneHandoffAuthorityEnvelope {
  proposal: JsonObject;
  playerActionReceipt: PlayerActionReceipt;
  sourceReceipts: SourceAuthorityReceipt[];
  timelineAnchor?: { messageId: string; sequence: number };
}

/** Receipt-backed post-scene Story and beat update contract. */
export interface StoryDeltaV2 {
  schemaVersion: typeof STORY_DELTA_V2_CONTRACT_VERSION;
  deltaId: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
  campaignId: string;
  initiatedBy: string;
  sourceSystem: 'studio' | 'gma';
  targetAuthority: 'gmc';
  visibility: 'gm_only';
  classification: 'no_replan' | 'beat_update' | 'scene_patch' | 'scene_replace' | 'frontier_refresh' | 'graph_review' | 'full_rebuild';
  expectedWorkspaceRevision: number;
  reason: string;
  sourceRevisions: Record<string, string | number>;
  sourceReceiptRefs: string[];
  sceneKitRef: string;
  beatChanges: Array<{ beatRef: string; state: 'available' | 'active' | 'resolved' | 'bypassed'; sourceReceiptRefs: string[] }>;
  actualStoryImpacts: Array<{ storyNodeRef: string; effect: StoryImpactEffect; reason: string; sourceReceiptRefs: string[] }>;
  affectedRecords: StoryRecordPatch[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: JsonValue): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function bytes(value: JsonValue): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function stableId(value: unknown, field: string): string {
  const result = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new StoryWorkspaceStoreError(400, 'STORY_VALIDATION_FAILED', `${field} is not a stable identifier.`, { field });
  }
  return result;
}

function requireExactKeys(value: Record<string, unknown>, field: string, allowed: readonly string[]): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new StoryWorkspaceStoreError(422, 'STORY_CONTRACT_FIELD_UNSUPPORTED', `${field} contains an unsupported field.`, { field: `${field}.${extra}` });
}

function boundedText(value: unknown, fallback: string, maximum = 1_000): string {
  const result = String(value ?? '').trim();
  return (result || fallback).slice(0, maximum);
}

function stringList(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))].slice(0, maximum);
}

function currentSceneRevision(workspace: JsonObject): number {
  return isObject(workspace.activeSceneKitRef) && Number.isSafeInteger(workspace.activeSceneKitRef.revision)
    ? Number(workspace.activeSceneKitRef.revision)
    : 0;
}

function workspaceTimelineAnchor(workspace: JsonObject): { messageId: string; sequence: number } | null {
  if (!isObject(workspace.timelineAnchor) || typeof workspace.timelineAnchor.messageId !== 'string'
    || !Number.isSafeInteger(workspace.timelineAnchor.sequence) || Number(workspace.timelineAnchor.sequence) < 0) return null;
  return { messageId: workspace.timelineAnchor.messageId, sequence: Number(workspace.timelineAnchor.sequence) };
}

function sceneKits(workspace: JsonObject): JsonObject[] {
  return Array.isArray(workspace.sceneKits) ? workspace.sceneKits.filter(isObject).map((kit) => kit as JsonObject) : [];
}

function graphNodes(graph: JsonObject): JsonObject[] {
  return Array.isArray(graph.nodes) ? graph.nodes.filter(isObject).map((node) => node as JsonObject) : [];
}

function planningToGraphState(planningState: string): 'active' | 'dormant' | 'resolved' {
  if (planningState === 'resolved') return 'resolved';
  if (['dormant', 'retired'].includes(planningState)) return 'dormant';
  return 'active';
}

/** Builds the deterministic version 2 graph projection for a legacy workspace. */
export function projectStoryGraphV2(workspace: JsonObject): JsonObject {
  if (isObject(workspace.storyGraph)) {
    validateStoryGraphV2(workspace.storyGraph);
    return clone(workspace.storyGraph as JsonObject);
  }
  const portfolio = isObject(workspace.portfolio) ? workspace.portfolio : {};
  const arcs = (Array.isArray(portfolio.arcs) ? portfolio.arcs.filter(isObject) : []) as Record<string, unknown>[];
  const nodes = arcs.map((arc, index) => {
    const arcId = stableId(arc.arcId, `portfolio.arcs[${index}].arcId`);
    const planningState = (STORY_PLANNING_STATES as readonly string[]).includes(String(arc.planningState))
      ? String(arc.planningState)
      : 'draft';
    const truthState = (STORY_TRUTH_STATES as readonly string[]).includes(String(arc.truthState))
      ? String(arc.truthState)
      : 'gm_preparation';
    const sourceRefs = stringList(arc.sourceRefs, 24);
    return {
      nodeId: arcId,
      scope: 'arc',
      primaryParentRef: null,
      relatedNodeRefs: [],
      title: boundedText(arc.title, 'Untitled Story arc', 300),
      dramaticQuestion: boundedText(arc.dramaticQuestion, 'What will change through play?', 1_000),
      state: planningToGraphState(planningState),
      planningState,
      truthState,
      pressures: stringList(arc.pressures, 8),
      sourceRefs: sourceRefs.length ? sourceRefs : [`gmc:story-migration:${arcId}`],
    } as JsonObject;
  });
  const graph: JsonObject = { schemaVersion: STORY_GRAPH_CONTRACT_VERSION, revision: 1, nodes };
  validateStoryGraphV2(graph);
  return graph;
}

function compatibilityArcs(graph: JsonObject, workspace: JsonObject): JsonObject[] {
  const portfolio = isObject(workspace.portfolio) ? workspace.portfolio : {};
  const current = (Array.isArray(portfolio.arcs) ? portfolio.arcs.filter(isObject) : []) as Record<string, unknown>[];
  const currentById = new Map(current.map((arc) => [String(arc.arcId), arc as JsonObject]));
  const active: JsonObject[] = [];
  const retained: JsonObject[] = [];
  for (const node of graphNodes(graph).filter((candidate) => candidate.scope === 'arc')) {
    const arcId = String(node.nodeId);
    const prior = currentById.get(arcId) ?? {};
    const projected = {
      ...clone(prior),
      arcId,
      title: node.title,
      dramaticQuestion: node.dramaticQuestion,
      planningState: node.planningState,
      truthState: node.truthState,
      pressures: node.pressures,
      sourceRefs: node.sourceRefs,
    } as JsonObject;
    if (node.state === 'active') active.push(projected);
    else retained.push(projected);
  }
  return [...active.slice(0, 6), ...retained.slice(0, 8)];
}

/** Returns the persisted graph or its non-mutating legacy compatibility projection. */
export async function readStoryGraphV2(
  input: { userId: string; campaignId: string },
  records?: StoryWorkspaceRevisionCollection,
) {
  const active = await readActiveStoryWorkspace(input, records);
  const workspace = active?.workspace ?? emptyStoryWorkspace(input.campaignId);
  const graph = projectStoryGraphV2(workspace);
  return {
    schemaVersion: STORY_GRAPH_CONTRACT_VERSION,
    persisted: isObject(workspace.storyGraph),
    storyWorkspaceRef: active?.storyWorkspaceRef ?? null,
    graph,
    graphBytes: bytes(graph),
  };
}

/** Persists one complete graph revision while preserving all unrelated workspace state. */
export async function replaceStoryGraphV2(
  input: {
    userId: string;
    campaignId: string;
    expectedWorkspaceRevision: number;
    expectedGraphRevision: number;
    idempotencyKey: string;
    graph: JsonObject;
    sourceReceiptRefs: string[];
  },
  records?: StoryWorkspaceRevisionCollection,
) {
  validateStoryGraphV2(input.graph);
  const idempotencyKey = stableId(input.idempotencyKey, 'idempotencyKey');
  const requestHash = hash({
    campaignId: input.campaignId,
    expectedWorkspaceRevision: input.expectedWorkspaceRevision,
    expectedGraphRevision: input.expectedGraphRevision,
    graph: input.graph,
    sourceReceiptRefs: input.sourceReceiptRefs,
  } as JsonObject);
  const replay = await readStoryWorkspaceRevision({ userId: input.userId, campaignId: input.campaignId, idempotencyKey }, records);
  if (replay) {
    if (replay.requestHash !== requestHash) throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The graph idempotency key was already used for a different write.', {});
    return { contractVersion: STORY_GRAPH_WRITE_RECEIPT_CONTRACT_VERSION, duplicate: true, storyWorkspaceRef: replay.storyWorkspaceRef, graph: projectStoryGraphV2(replay.workspace) };
  }
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, records);
  const workspace = clone(active?.workspace ?? emptyStoryWorkspace(input.campaignId));
  const current = projectStoryGraphV2(workspace);
  if ((active?.storyWorkspaceRef.revision ?? 0) !== input.expectedWorkspaceRevision) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before the graph write.', { expectedRevision: input.expectedWorkspaceRevision, actualRevision: active?.storyWorkspaceRef.revision ?? 0 });
  if (Number(current.revision) !== input.expectedGraphRevision) throw new StoryWorkspaceStoreError(409, 'STORY_GRAPH_REVISION_CONFLICT', 'The Story graph changed before the graph write.', { expectedRevision: input.expectedGraphRevision, actualRevision: current.revision });
  const currentComparable = clone(current);
  const nextComparable = clone(input.graph);
  delete currentComparable.revision;
  delete nextComparable.revision;
  const changed = canonicalJson(currentComparable) !== canonicalJson(nextComparable);
  const requiredRevision = isObject(workspace.storyGraph)
    ? Number(current.revision) + (changed ? 1 : 0)
    : (changed ? Number(current.revision) + 1 : Number(current.revision));
  if (Number(input.graph.revision) !== requiredRevision) throw new StoryWorkspaceStoreError(409, 'STORY_GRAPH_REVISION_CONFLICT', 'The proposed graph revision does not match its material change.', { expectedRevision: requiredRevision, actualRevision: input.graph.revision });
  const refs = stringList(input.sourceReceiptRefs, 32).map((ref) => stableId(ref, 'sourceReceiptRefs'));
  if (changed && !refs.length) throw new StoryWorkspaceStoreError(422, 'STORY_GRAPH_GROUNDING_REQUIRED', 'A material Story graph write requires an authority receipt.', {});
  if (!changed && isObject(workspace.storyGraph) && active) {
    return {
      contractVersion: STORY_GRAPH_WRITE_RECEIPT_CONTRACT_VERSION,
      status: 'no_change',
      duplicate: false,
      authoritativeStateChanged: false,
      storyWorkspaceRef: active.storyWorkspaceRef,
      graph: clone(current),
    };
  }
  workspace.storyGraph = clone(input.graph);
  const portfolio = isObject(workspace.portfolio) ? workspace.portfolio : {};
  workspace.portfolio = { ...clone(portfolio as JsonObject), arcs: compatibilityArcs(input.graph, workspace) };
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId: input.campaignId,
    expectedRevision: input.expectedWorkspaceRevision,
    idempotencyKey,
    source: 'story_graph',
    timelineAnchor: workspaceTimelineAnchor(workspace),
    workspace,
    changedRecordRefs: changed ? graphNodes(input.graph).map((node) => `story_node:${String(node.nodeId)}`) : ['story_graph:persisted'],
    requestHashOverride: requestHash,
  }, records);
  return { contractVersion: STORY_GRAPH_WRITE_RECEIPT_CONTRACT_VERSION, duplicate: written.duplicate, storyWorkspaceRef: written.storyWorkspaceRef, graph: clone(input.graph) };
}

function safeSegment(value: unknown, fallback: string): string {
  const result = String(value ?? '').trim().replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  return result && /^[A-Za-z0-9]/.test(result) ? result : fallback;
}

function legacyParticipantId(value: unknown): string | null {
  if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return value;
  if (!isObject(value)) return null;
  const candidate = value.entityId ?? value.npcRef ?? value.npcId ?? value.id;
  return typeof candidate === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate) ? candidate : null;
}

function legacyPlayableLocus(kit: JsonObject, sourceRefs: string[]): JsonObject {
  const location = kit.locationRef;
  if (isObject(location)) {
    const reference = location.id ?? location._id ?? location.locationId ?? location.ref;
    const canonicalAnchorRef = typeof reference === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(reference) ? reference : null;
    return {
      kind: canonicalAnchorRef ? 'canonical_location' : 'scene_local_locus',
      label: boundedText(location.label ?? location.name ?? reference, 'Prepared scene location', 500),
      canonicalAnchorRef,
      sourceRefs,
    };
  }
  const label = boundedText(location, boundedText(kit.title, 'Prepared scene location', 500), 500);
  const canonicalAnchorRef = typeof location === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(location)
    && /^(gmc:)?location:/.test(location) ? location : null;
  return { kind: canonicalAnchorRef ? 'canonical_location' : 'scene_local_locus', label, canonicalAnchorRef, sourceRefs };
}

function legacyBeats(kit: JsonObject, sceneKitId: string, graph: JsonObject): JsonObject[] {
  const bindings = new Set(graphNodes(graph).map((node) => String(node.nodeId)));
  const important = Array.isArray(kit.importantBeats) ? kit.importantBeats.slice(0, 5) : [];
  const beats = important.map((entry, index) => {
    const source = isObject(entry) ? entry : {};
    const trigger = boundedText(isObject(entry) ? source.trigger ?? source.summary ?? source.description : entry, `The prepared situation reaches beat ${index + 1}.`, 1_500);
    const potentialRows = (Array.isArray(source.potentialImpacts) ? source.potentialImpacts.filter(isObject) : []) as Record<string, unknown>[];
    const potential = potentialRows.filter((impact) => bindings.has(String(impact.storyNodeRef))).slice(0, 8).map((impact) => ({
      storyNodeRef: impact.storyNodeRef,
      outcome: safeSegment(impact.outcome, `outcome-${index + 1}`),
      effect: ['advance', 'complicate', 'resolve', 'reopen', 'retire'].includes(String(impact.effect)) ? impact.effect : 'advance',
    }));
    return {
      beatId: `beat:${safeSegment(sceneKitId, 'scene')}:${safeSegment(source.beatId ?? source.id, String(index + 1))}`,
      kind: safeSegment(source.kind, 'development'),
      state: index === 0 && kit.planningState === 'active' ? 'active' : 'available',
      trigger,
      changeSurface: boundedText(source.changeSurface ?? source.consequence, 'The situation, its actors, or the available information can materially change.', 1_500),
      potentialImpacts: potential,
    } as JsonObject;
  });
  while (beats.length < 2) {
    const index = beats.length;
    beats.push({
      beatId: `beat:${safeSegment(sceneKitId, 'scene')}:migration-${index + 1}`,
      kind: index === 0 ? 'engagement' : 'response',
      state: index === 0 && kit.planningState === 'active' ? 'active' : 'available',
      trigger: index === 0 ? 'Play engages the prepared dramatic question.' : 'The situation responds to a consequential player action.',
      changeSurface: 'The prepared situation may change without selecting the player’s next action.',
      potentialImpacts: [],
    });
  }
  return beats;
}

function legacyExits(kit: JsonObject): JsonObject[] {
  const supplied = (Array.isArray(kit.exitVectors) ? kit.exitVectors.filter(isObject) : []) as Record<string, unknown>[];
  const byKind = new Map(supplied.filter((exit) => ['completion', 'failure', 'abandonment', 'redirect'].includes(String(exit.kind))).map((exit) => [String(exit.kind), exit]));
  const defaults: Record<string, string> = {
    completion: 'The prepared dramatic question reaches a concrete result.',
    failure: 'A failed attempt changes the situation rather than stalling it.',
    abandonment: 'The player disengages from this situation.',
    redirect: 'The player commits to a different situation or objective.',
  };
  return Object.entries(defaults).map(([kind, fallback]) => ({ kind, condition: boundedText(byKind.get(kind)?.condition, fallback, 1_500) }));
}

/** Converts one legacy Scene kit without inventing cast, Story bindings, or outcomes. */
export function projectLegacySceneKitV2(legacy: JsonObject, graph: JsonObject): JsonObject {
  if (legacy.schemaVersion === SCENE_KIT_V2_CONTRACT_VERSION) {
    validateSceneKitV2(legacy);
    return clone(legacy);
  }
  const sceneKitId = stableId(legacy.sceneKitId, 'sceneKit.sceneKitId');
  const sourceRefs = stringList(legacy.sourceRefs, 24);
  const migrationSources = sourceRefs.length ? sourceRefs : [`gmc:scene-kit-migration:${sceneKitId}`];
  const participants = isObject(legacy.participants) ? legacy.participants : {};
  const presentRows = Array.isArray(participants.present) ? participants.present : [];
  const anticipatedRows = Array.isArray(participants.anticipated) ? participants.anticipated : [];
  const present: string[] = [];
  const sceneLocalRoles: JsonObject[] = [];
  presentRows.slice(0, 32).forEach((row, index) => {
    const source = isObject(row) ? row : {};
    const identityKind = String(source.identityKind ?? 'individual');
    const id = legacyParticipantId(row);
    if (id && !['anonymous_extra', 'collective'].includes(identityKind)) present.push(id);
    else sceneLocalRoles.push({
      roleId: `role:${safeSegment(sceneKitId, 'scene')}:${safeSegment(source.roleId ?? id, String(index + 1))}`,
      label: boundedText(source.publicLabel ?? source.label ?? source.name, 'scene participant', 240),
      count: Number.isSafeInteger(source.count) && Number(source.count) > 0 ? Number(source.count) : 1,
      objective: boundedText(source.objective ?? source.reason, 'Continue the activity prepared for this scene.', 1_000),
    });
  });
  const anticipated = anticipatedRows.map(legacyParticipantId).filter((value): value is string => Boolean(value)).slice(0, 16);
  const legacyInformation = ((Array.isArray(legacy.information) ? legacy.information : []).filter(isObject)) as Record<string, unknown>[];
  const information = legacyInformation.slice(0, 24).map((entry, index) => ({
    informationId: stableId(entry.informationId ?? `information:${safeSegment(sceneKitId, 'scene')}:${index + 1}`, `sceneKit.information[${index}].informationId`),
    state: ['revealed', 'revealed_canon', 'plainly_visible'].includes(String(entry.status ?? entry.state))
      ? 'plainly_visible'
      : (String(entry.status ?? entry.state) === 'absent_in_scope' ? 'absent_in_scope'
        : (String(entry.status ?? entry.state) === 'concealed' ? 'concealed' : 'undetermined')),
    accessVectors: stringList(entry.accessVectors, 8).length
      ? stringList(entry.accessVectors, 8)
      : ['Investigate through a method supported by the original preparation.'],
  }));
  const graphIds = new Set(graphNodes(graph).map((node) => String(node.nodeId)));
  const storyBindings = stringList(legacy.arcRefs, 8).filter((ref) => graphIds.has(ref));
  const planningState = (STORY_PLANNING_STATES as readonly string[]).includes(String(legacy.planningState)) ? String(legacy.planningState) : 'draft';
  const projected: JsonObject = {
    schemaVersion: SCENE_KIT_V2_CONTRACT_VERSION,
    sceneKitId,
    revision: Number.isSafeInteger(legacy.recordRevision) && Number(legacy.recordRevision) > 0 ? Number(legacy.recordRevision) : 1,
    planningState,
    playableLocus: legacyPlayableLocus(legacy, migrationSources),
    purpose: boundedText(legacy.purpose, 'Support play around the prepared situation.', 2_000),
    dramaticQuestion: boundedText(legacy.dramaticQuestion, 'What will change through the player’s actions here?', 1_500),
    participants: { present: [...new Set(present)], sceneLocalRoles: sceneLocalRoles.slice(0, 16), anticipated: [...new Set(anticipated)] },
    establishedElements: [],
    information,
    beats: legacyBeats(legacy, sceneKitId, graph),
    pressures: stringList(legacy.pressures, 8),
    exitVectors: legacyExits(legacy),
    storyBindings,
    sourceRefs: migrationSources,
  };
  validateSceneKitV2(projected);
  return projected;
}

/** Compiles a deterministic, idempotent D2 migration without writing it. */
export function compileStoryWorkspaceV2Migration(workspace: JsonObject): JsonObject {
  const migrated = clone(workspace);
  const graph = projectStoryGraphV2(migrated);
  migrated.storyGraph = graph;
  migrated.sceneKits = sceneKits(migrated).map((kit) => projectLegacySceneKitV2(kit, graph));
  const portfolio = isObject(migrated.portfolio) ? migrated.portfolio : {};
  migrated.portfolio = { ...clone(portfolio as JsonObject), arcs: compatibilityArcs(graph, migrated) };
  if (isObject(migrated.activeSceneKitRef)) {
    const activeId = String(migrated.activeSceneKitRef.sceneKitId ?? '');
    const activeKit = sceneKits(migrated).find((kit) => kit.sceneKitId === activeId);
    if (activeKit) migrated.activeBeatRef = (activeKit.beats as JsonObject[]).find((beat) => beat.state === 'active')?.beatId
      ?? (activeKit.beats as JsonObject[])[0]?.beatId ?? null;
  }
  return migrated;
}

/**
 * Builds the first Story migration preview directly from GMC's immutable
 * legacy scene-plan revision. The returned workspace is never persisted and
 * its revision-zero reference is explicitly marked as a preview.
 * date_of_change: 2026-08-07
 */
export function compileLegacyScenePlanV2MigrationPreview(input: {
  campaignId: string;
  scenePlanRef: { scenePlanId: string; sceneId: string; revision: number; payloadHash: string };
  privatePayload: JsonObject;
}) {
  const imported = compileLegacyScenePlanImport(input);
  const migrated = compileStoryWorkspaceV2Migration(imported);
  const graph = projectStoryGraphV2(migrated);
  const kits = sceneKits(migrated);
  const previewRef = {
    contractVersion: STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
    workspaceId: String(migrated.workspaceId),
    revision: 0,
    payloadHash: hash(migrated),
    status: 'preview',
  };
  const evidenceRef = `gma-scene-plan:${input.scenePlanRef.scenePlanId}:r${input.scenePlanRef.revision}`;
  const catalog = buildStoryAuthorityReceiptCatalog(migrated) as JsonObject;
  catalog.receipts = (catalog.receipts as JsonObject[]).map((receipt) => ({
    ...receipt,
    receiptRef: `gmc:legacy-scene-plan:${hash({
      evidenceRef,
      payloadHash: input.scenePlanRef.payloadHash,
      sourceRef: receipt.sourceRef,
    })}`,
    evidenceRef,
  }));
  return {
    contractVersion: STORY_MIGRATION_PREVIEW_CONTRACT_VERSION,
    dryRun: true,
    mutationApplied: false,
    source: 'legacy_scene_plan',
    migrationPreview: {
      contractVersion: STORY_MIGRATION_RECEIPT_CONTRACT_VERSION,
      dryRun: true,
      changed: true,
      fromWorkspaceRevision: 0,
      graphRevision: graph.revision,
      graphNodeCount: graphNodes(graph).length,
      sceneKitCount: kits.length,
      activeSceneKitId: isObject(migrated.activeSceneKitRef) ? migrated.activeSceneKitRef.sceneKitId ?? null : null,
      storyWorkspaceRef: previewRef,
    },
    sceneContext: {
      storyWorkspaceRef: previewRef,
      playableSceneContext: buildPlayableSceneContextV2(migrated),
      privateSceneContext: buildPrivateSceneDirectorContext(migrated),
      authorityReceiptCatalog: catalog,
    },
    history: {
      revisions: [],
      legacyBackupRef: input.scenePlanRef,
    },
    importedScenePlanRef: input.scenePlanRef,
  };
}

/**
 * Builds a revision-zero Story preview from the bounded public receipts that
 * established a pre-Story GMA scene. This is a migration-only bridge: it does
 * not grant the browser continuing Story authority and it never writes.
 * date_of_change: 2026-08-07
 */
function compileAcceptedV1SceneSnapshotMigration(input: {
  campaignId: string;
  snapshot: JsonObject;
  canonicalAnchor: { locationRef: string; label: string };
}) {
  const campaignId = stableId(input.campaignId, 'campaignId');
  const snapshot = input.snapshot;
  if (!isObject(snapshot) || snapshot.schemaVersion !== ACCEPTED_V1_SCENE_SNAPSHOT_CONTRACT_VERSION
    || String(snapshot.campaignId ?? '') !== campaignId) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'The accepted scene snapshot does not match this campaign.', {});
  }
  const anchor = isObject(snapshot.canonicalAnchor) ? snapshot.canonicalAnchor : {};
  const locationRef = stableId(anchor.locationRef, 'canonicalAnchor.locationRef');
  const anchorLabel = boundedText(anchor.label, '', 300);
  if (locationRef !== stableId(input.canonicalAnchor.locationRef, 'canonicalAnchor.expectedLocationRef')
    || anchorLabel.toLocaleLowerCase() !== boundedText(input.canonicalAnchor.label, '', 300).toLocaleLowerCase()) {
    throw new StoryWorkspaceStoreError(409, 'STORY_ACCEPTED_SCENE_ANCHOR_MISMATCH', 'The accepted scene snapshot does not continue from the campaign current location.', {});
  }
  const locus = isObject(snapshot.playableLocus) ? snapshot.playableLocus : {};
  const locusKind = String(locus.kind ?? '');
  if (!['scene_local_locus', 'directional_target'].includes(locusKind)) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'The accepted scene snapshot has an invalid playable locus.', {});
  }
  const locusLabel = boundedText(locus.label, '', 500);
  const scene = isObject(snapshot.scene) ? snapshot.scene : {};
  if (String(scene.status ?? '') !== 'active') {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'The accepted scene snapshot is not active.', {});
  }
  const sceneId = stableId(scene.sceneId, 'scene.sceneId');
  const participants = (Array.isArray(scene.participants) ? scene.participants : []).slice(0, 32).map((entry, index) => {
    if (!isObject(entry)) throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'A scene participant is invalid.', { index });
    const identityKind = ['individual', 'anonymous_extra', 'collective'].includes(String(entry.identityKind))
      ? String(entry.identityKind) : 'individual';
    const entityRef = entry.entityRef ? stableId(entry.entityRef, `scene.participants[${index}].entityRef`) : `accepted-v1:${sceneId}:participant:${index + 1}`;
    return {
      entityId: entityRef,
      publicLabel: boundedText(entry.label, `Scene participant ${index + 1}`, 240),
      identityKind,
      reason: 'Present in the accepted playable scene at migration time.',
    } as JsonObject;
  });
  if (!participants.length) throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'The accepted scene snapshot has no visible participants.', {});
  const sourceReceipts = (Array.isArray(snapshot.sourceReceipts) ? snapshot.sourceReceipts : []).slice(0, 8);
  if (sourceReceipts.length < 2 || sourceReceipts.some((entry) => !isObject(entry))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_RECEIPTS_REQUIRED', 'The accepted scene snapshot lacks its migration receipts.', {});
  }
  const receiptKinds = new Set(sourceReceipts.map((entry) => String((entry as JsonObject).kind ?? '')));
  if (!receiptKinds.has('transit') || !receiptKinds.has('scene_segment')) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_RECEIPTS_REQUIRED', 'The accepted scene snapshot requires transit and scene-segment receipts.', {});
  }
  const sourceRefs = [...new Set(sourceReceipts.map((entry, index) => stableId((entry as JsonObject).receiptRef, `sourceReceipts[${index}].receiptRef`)))];
  if (sourceRefs.length !== sourceReceipts.length) {
    throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_RECEIPTS_REQUIRED', 'The accepted scene snapshot contains a duplicate receipt.', {});
  }
  const snapshotHash = hash(snapshot);
  const scenePlanRef = {
    scenePlanId: `accepted-v1:${snapshotHash.slice(0, 24)}`,
    sceneId,
    revision: 1,
    payloadHash: snapshotHash,
  };
  const privatePayload: JsonObject = {
    schemaVersion: 'gma.scene-plan/2',
    sceneId,
    scenePlanId: scenePlanRef.scenePlanId,
    title: boundedText(scene.title, 'Accepted playable scene', 300),
    objective: boundedText(scene.purpose ?? scene.objective, 'Continue the accepted playable scene.', 1_000),
    dramaticQuestion: boundedText(scene.dramaticQuestion ?? scene.purpose ?? scene.objective, 'What changes through the player’s next action here?', 1_000),
    locationRef: { id: locationRef, label: locusLabel },
    participants: { present: participants, anticipated: [] },
    doneWhen: stringList(scene.doneWhen, 16),
  };
  const imported = compileLegacyScenePlanImport({ campaignId, scenePlanRef, privatePayload });
  const importedKits = imported.sceneKits as JsonObject[];
  const importedKit = importedKits.find((kit) => kit.sceneKitId === `scene-kit:legacy:${scenePlanRef.scenePlanId}`);
  if (!importedKit) throw new StoryWorkspaceStoreError(422, 'STORY_ACCEPTED_SCENE_SNAPSHOT_INVALID', 'The accepted scene snapshot could not be compiled.', {});
  importedKit.planningState = 'active';
  importedKit.sourceRefs = sourceRefs;
  importedKit.migrationProvenance = {
    sourceSchemaVersion: ACCEPTED_V1_SCENE_SNAPSHOT_CONTRACT_VERSION,
    sourcePayloadHash: snapshotHash,
    authority: 'migration_evidence_only',
  };
  const migrated = compileStoryWorkspaceV2Migration(imported);
  const graph = projectStoryGraphV2(migrated);
  const kits = sceneKits(migrated);
  const previewRef = {
    contractVersion: STORY_WORKSPACE_REFERENCE_CONTRACT_VERSION,
    workspaceId: String(migrated.workspaceId),
    revision: 0,
    payloadHash: hash(migrated),
    status: 'preview',
  };
  const evidenceRef = `${ACCEPTED_V1_SCENE_SNAPSHOT_CONTRACT_VERSION}:${snapshotHash}`;
  const catalog = buildStoryAuthorityReceiptCatalog(migrated) as JsonObject;
  catalog.receipts = (catalog.receipts as JsonObject[]).map((receipt) => ({
    ...receipt,
    receiptRef: `gmc:accepted-v1-scene:${hash({ evidenceRef, sourceRef: receipt.sourceRef })}`,
    evidenceRef,
  }));
  const acceptedV1BackupRef = {
    schemaVersion: ACCEPTED_V1_SCENE_SNAPSHOT_CONTRACT_VERSION,
    sceneId,
    payloadHash: snapshotHash,
    sourceReceiptRefs: sourceRefs,
  };
  const preview = {
    contractVersion: STORY_MIGRATION_PREVIEW_CONTRACT_VERSION,
    dryRun: true,
    mutationApplied: false,
    source: 'accepted_v1_scene_snapshot',
    migrationPreview: {
      contractVersion: STORY_MIGRATION_RECEIPT_CONTRACT_VERSION,
      dryRun: true,
      changed: true,
      fromWorkspaceRevision: 0,
      graphRevision: graph.revision,
      graphNodeCount: graphNodes(graph).length,
      sceneKitCount: kits.length,
      activeSceneKitId: isObject(migrated.activeSceneKitRef) ? migrated.activeSceneKitRef.sceneKitId ?? null : null,
      storyWorkspaceRef: previewRef,
    },
    sceneContext: {
      storyWorkspaceRef: previewRef,
      playableSceneContext: buildPlayableSceneContextV2(migrated),
      privateSceneContext: buildPrivateSceneDirectorContext(migrated),
      authorityReceiptCatalog: catalog,
    },
    history: { revisions: [], acceptedV1BackupRef },
    acceptedV1BackupRef,
  };
  return { preview, workspace: migrated, acceptedV1BackupRef };
}

export function compileAcceptedV1SceneSnapshotMigrationPreview(input: {
  campaignId: string;
  snapshot: JsonObject;
  canonicalAnchor: { locationRef: string; label: string };
}) {
  return compileAcceptedV1SceneSnapshotMigration(input).preview;
}

/**
 * Persists the verified revision-zero bridge as the first immutable Story
 * revision. The accepted snapshot remains migration evidence only; all later
 * scene authority is derived from the committed GMC Scene kit.
 */
export async function importAcceptedV1SceneSnapshotMigration(
  input: {
    userId: string;
    campaignId: string;
    expectedWorkspaceRevision: number;
    idempotencyKey: string;
    snapshot: JsonObject;
    canonicalAnchor: { locationRef: string; label: string };
  },
  records?: StoryWorkspaceRevisionCollection,
) {
  if (Number(input.expectedWorkspaceRevision) !== 0) {
    throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The accepted scene can only initialize an empty Story workspace.', {
      expectedRevision: input.expectedWorkspaceRevision,
      actualRevision: 0,
    });
  }
  const idempotencyKey = stableId(input.idempotencyKey, 'idempotencyKey');
  const compiled = compileAcceptedV1SceneSnapshotMigration({
    campaignId: input.campaignId,
    snapshot: input.snapshot,
    canonicalAnchor: input.canonicalAnchor,
  });
  const requestHash = hash({
    campaignId: input.campaignId,
    expectedWorkspaceRevision: 0,
    acceptedV1SceneSnapshot: input.snapshot,
    canonicalAnchor: input.canonicalAnchor,
    dryRun: false,
  } as JsonObject);
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId: input.campaignId,
    expectedRevision: 0,
    idempotencyKey,
    source: 'migration',
    workspace: compiled.workspace,
    changedRecordRefs: [
      `story_graph:accepted-v1:${String(compiled.acceptedV1BackupRef.payloadHash).slice(0, 24)}`,
      ...sceneKits(compiled.workspace).map((kit) => `scene_kit:${String(kit.sceneKitId)}`),
    ],
    requestHashOverride: requestHash,
  }, records);
  const graph = projectStoryGraphV2(compiled.workspace);
  const kits = sceneKits(compiled.workspace);
  return {
    contractVersion: STORY_MIGRATION_RECEIPT_CONTRACT_VERSION,
    dryRun: false,
    changed: true,
    duplicate: written.duplicate,
    mutationApplied: !written.duplicate,
    source: 'accepted_v1_scene_snapshot',
    fromWorkspaceRevision: 0,
    graphRevision: graph.revision,
    graphNodeCount: graphNodes(graph).length,
    sceneKitCount: kits.length,
    activeSceneKitId: isObject(compiled.workspace.activeSceneKitRef) ? compiled.workspace.activeSceneKitRef.sceneKitId ?? null : null,
    storyWorkspaceRef: written.storyWorkspaceRef,
    acceptedV1BackupRef: compiled.acceptedV1BackupRef,
  };
}

/** Dry-runs or commits the additive version 2 Story migration. */
export async function migrateStoryWorkspaceV2(
  input: { userId: string; campaignId: string; expectedWorkspaceRevision: number; idempotencyKey: string; dryRun: boolean },
  records?: StoryWorkspaceRevisionCollection,
) {
  const idempotencyKey = stableId(input.idempotencyKey || (input.dryRun ? `migration-dry-run:${input.campaignId}` : ''), 'idempotencyKey');
  const requestHash = hash({
    campaignId: input.campaignId,
    expectedWorkspaceRevision: input.expectedWorkspaceRevision,
    dryRun: input.dryRun,
  } as JsonObject);
  if (!input.dryRun) {
    const replay = await readStoryWorkspaceRevision({ userId: input.userId, campaignId: input.campaignId, idempotencyKey }, records);
    if (replay) {
      if (replay.requestHash !== requestHash || replay.source !== 'migration') throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The migration idempotency key was already used for a different write.', {});
      return {
        contractVersion: STORY_MIGRATION_RECEIPT_CONTRACT_VERSION,
        dryRun: false,
        changed: true,
        duplicate: true,
        fromWorkspaceRevision: input.expectedWorkspaceRevision,
        graphRevision: (projectStoryGraphV2(replay.workspace)).revision,
        graphNodeCount: graphNodes(projectStoryGraphV2(replay.workspace)).length,
        sceneKitCount: sceneKits(replay.workspace).length,
        activeSceneKitId: isObject(replay.workspace.activeSceneKitRef) ? replay.workspace.activeSceneKitRef.sceneKitId ?? null : null,
        storyWorkspaceRef: replay.storyWorkspaceRef,
      };
    }
  }
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, records);
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace exists to migrate.', {});
  if (active.storyWorkspaceRef.revision !== input.expectedWorkspaceRevision) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before migration.', { expectedRevision: input.expectedWorkspaceRevision, actualRevision: active.storyWorkspaceRef.revision });
  const migrated = compileStoryWorkspaceV2Migration(active.workspace);
  const changed = canonicalJson(active.workspace) !== canonicalJson(migrated);
  const preview = {
    contractVersion: STORY_MIGRATION_RECEIPT_CONTRACT_VERSION,
    dryRun: input.dryRun,
    changed,
    fromWorkspaceRevision: active.storyWorkspaceRef.revision,
    graphRevision: (migrated.storyGraph as JsonObject).revision,
    graphNodeCount: graphNodes(migrated.storyGraph as JsonObject).length,
    sceneKitCount: sceneKits(migrated).length,
    activeSceneKitId: isObject(migrated.activeSceneKitRef) ? migrated.activeSceneKitRef.sceneKitId ?? null : null,
  };
  if (input.dryRun || !changed) return { ...preview, storyWorkspaceRef: active.storyWorkspaceRef };
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId: input.campaignId,
    expectedRevision: input.expectedWorkspaceRevision,
    idempotencyKey,
    source: 'migration',
    timelineAnchor: workspaceTimelineAnchor(migrated),
    workspace: migrated,
    changedRecordRefs: ['story_graph:migrated', ...sceneKits(migrated).map((kit) => `scene_kit:${String(kit.sceneKitId)}`)],
    requestHashOverride: requestHash,
  }, records);
  return { ...preview, duplicate: written.duplicate, storyWorkspaceRef: written.storyWorkspaceRef };
}

function activeV2SceneKit(workspace: JsonObject): JsonObject | null {
  if (!isObject(workspace.activeSceneKitRef)) return null;
  const activeId = String(workspace.activeSceneKitRef.sceneKitId ?? '');
  const kit = sceneKits(workspace).find((candidate) => candidate.sceneKitId === activeId);
  if (!kit) return null;
  if (kit.schemaVersion !== SCENE_KIT_V2_CONTRACT_VERSION) {
    return projectLegacySceneKitV2(kit, projectStoryGraphV2(workspace));
  }
  validateSceneKitV2(kit);
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

function findForbiddenProjectionField(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenProjectionField(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  const forbidden = new Set(['storyGraph', 'frontier', 'privateCanon', 'private_canon', 'gmNotes', 'gm_only', 'dormantNodes', 'preparationDebt', 'privateCanonicalNameRef']);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) return `${path}.${key}`;
    const found = findForbiddenProjectionField(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

/** Derives the bounded GMA scene context from the one active version 2 Scene kit. */
export function buildPlayableSceneContextV2(workspace: JsonObject): JsonObject {
  const kit = activeV2SceneKit(workspace);
  if (!kit) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_UNAVAILABLE', 'No version 2 current Scene kit is available.', {});
  const graph = projectStoryGraphV2(workspace);
  const nodesById = new Map(graphNodes(graph).map((node) => [String(node.nodeId), node]));
  const beats = kit.beats as JsonObject[];
  const requestedBeatRef = typeof workspace.activeBeatRef === 'string' ? workspace.activeBeatRef : null;
  const activeBeat = beats.find((beat) => beat.beatId === requestedBeatRef)
    ?? beats.find((beat) => beat.state === 'active')
    ?? beats[0];
  const availableBeats = beats.filter((beat) => beat.beatId !== activeBeat.beatId && beat.state === 'available').slice(0, 4);
  const participants = kit.participants as JsonObject;
  const context: JsonObject = {
    schemaVersion: PLAYABLE_SCENE_CONTEXT_V2_CONTRACT_VERSION,
    sceneKitRef: sceneKitReference(String(workspace.campaignId), kit),
    playableLocus: clone(kit.playableLocus as JsonObject),
    presentActors: clone(participants.present as JsonValue[]),
    sceneLocalRoles: clone(participants.sceneLocalRoles as JsonValue[]),
    activeBeat: clone(activeBeat),
    availableBeats: clone(availableBeats),
    establishedElements: (kit.establishedElements as JsonObject[])
      .filter((element) => ['canonical', 'scene_local_established'].includes(String(element.truthState)))
      .slice(0, 24).map((element) => clone(element)),
    information: (kit.information as JsonObject[]).slice(0, 16).map((entry) => clone(entry)),
    storyNodeSummaries: (kit.storyBindings as string[]).slice(0, 8).map((nodeId) => nodesById.get(nodeId)).filter((node): node is JsonObject => Boolean(node)).map((node) => ({
      nodeId: node.nodeId,
      title: node.title,
      dramaticQuestion: node.dramaticQuestion,
    })),
    pressures: clone((kit.pressures as JsonValue[]).slice(0, 8)),
    exitVectors: clone((kit.exitVectors as JsonValue[]).slice(0, 8)),
    restrictions: {
      canonCreation: 'requires_gmc_authority',
      reveal: 'requires_committed_source_receipt',
      presence: 'exact_active_scene_kit',
      mechanics: 'vcs_only',
      preparedPossibilities: 'not_completed_facts',
    },
  };
  const forbidden = findForbiddenProjectionField(context);
  if (forbidden) throw new StoryWorkspaceStoreError(500, 'STORY_PLAYABLE_CONTEXT_PRIVATE_LEAK', 'The playable scene context contains a private field.', { field: forbidden });
  if (bytes(context) > PLAYABLE_SCENE_CONTEXT_V2_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_PLAYABLE_CONTEXT_TOO_LARGE', 'The playable scene context exceeds its prompt bound.', { maximumBytes: PLAYABLE_SCENE_CONTEXT_V2_MAX_BYTES });
  return context;
}

/** Builds a service-only context for later Story Director use. */
export function buildPrivateSceneDirectorContext(workspace: JsonObject): JsonObject {
  const kit = activeV2SceneKit(workspace);
  if (!kit) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_UNAVAILABLE', 'No version 2 current Scene kit is available.', {});
  const bindings = new Set(kit.storyBindings as string[]);
  const hiddenElements = (kit.establishedElements as JsonObject[])
    .filter((element) => ['possible', 'undetermined'].includes(String(element.truthState)))
    .slice(0, 16).map((element) => clone(element));
  const unresolvedInformation = (kit.information as JsonObject[])
    .filter((entry) => ['concealed', 'undetermined'].includes(String(entry.state)))
    .slice(0, 16).map((entry) => clone(entry));
  const potentialImpacts = (kit.beats as JsonObject[]).slice(0, 5).flatMap((beat) => (
    (beat.potentialImpacts as JsonObject[]).slice(0, 8).map((impact) => ({ beatRef: beat.beatId, ...clone(impact) }))
  )).slice(0, 24);
  const context: JsonObject = {
    schemaVersion: PRIVATE_SCENE_CONTEXT_CONTRACT_VERSION,
    workspaceRef: { workspaceId: workspace.workspaceId, revision: workspace.revision },
    sceneKitRef: sceneKitReference(String(workspace.campaignId), kit),
    activeBeatRef: workspace.activeBeatRef ?? null,
    storyNodes: graphNodes(projectStoryGraphV2(workspace)).filter((node) => bindings.has(String(node.nodeId))).slice(0, 8).map((node) => clone(node)),
    scenePreparation: { hiddenElements, unresolvedInformation, potentialImpacts },
  };
  if (bytes(context) > PRIVATE_SCENE_CONTEXT_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_DIRECTOR_CONTEXT_TOO_LARGE', 'The private scene context exceeds its selection bound.', { maximumBytes: PRIVATE_SCENE_CONTEXT_MAX_BYTES });
  return context;
}

function committedStorySourceRefs(workspace: JsonObject): string[] {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) refs.add(value);
  };
  const addList = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(add);
  };
  for (const node of graphNodes(projectStoryGraphV2(workspace))) {
    add(node.nodeId); add(node.primaryParentRef); addList(node.relatedNodeRefs); addList(node.sourceRefs);
  }
  for (const kit of sceneKits(workspace)) {
    const projected = kit.schemaVersion === SCENE_KIT_V2_CONTRACT_VERSION ? kit : projectLegacySceneKitV2(kit, projectStoryGraphV2(workspace));
    add(projected.sceneKitId); addList(projected.sourceRefs); addList(projected.storyBindings);
    if (isObject(projected.playableLocus)) {
      add(projected.playableLocus.canonicalAnchorRef); addList(projected.playableLocus.sourceRefs);
    }
    if (isObject(projected.participants)) {
      addList(projected.participants.present); addList(projected.participants.anticipated);
    }
  }
  const frontier = isObject(workspace.frontier) && Array.isArray(workspace.frontier.candidates)
    ? workspace.frontier.candidates as JsonObject[]
    : [];
  frontier.forEach((candidate) => {
    add(candidate.candidateId); add(candidate.situationId); addList(candidate.sourceRefs); addList(candidate.likelyCastRefs);
  });
  const requirements = isObject(workspace.preparationLedger) && Array.isArray(workspace.preparationLedger.requirements)
    ? workspace.preparationLedger.requirements as JsonObject[]
    : [];
  requirements.forEach((requirement) => {
    add(requirement.requirementId); add(requirement.targetRef); addList(requirement.sourceRefs);
  });
  return [...refs].sort().slice(0, STORY_AUTHORITY_RECEIPT_CATALOG_MAX_ENTRIES);
}

/** Mints bounded receipts for identifiers read from one committed GMC Story revision. */
export function buildStoryAuthorityReceiptCatalog(workspace: JsonObject): JsonObject {
  const workspaceId = String(workspace.workspaceId ?? '');
  const revision = Number(workspace.revision ?? 0);
  const receipts = committedStorySourceRefs(workspace).map((sourceRef) => ({
    sourceRef,
    receiptRef: `gmc:story-source:${hash({ workspaceId, revision, sourceRef })}`,
    authority: 'gmc',
    status: 'committed',
  }));
  return {
    contractVersion: STORY_AUTHORITY_RECEIPT_CATALOG_CONTRACT_VERSION,
    workspaceId,
    workspaceRevision: revision,
    receipts,
  };
}

function validateAuthorityReceipts(envelope: SceneHandoffAuthorityEnvelope, proposal: JsonObject): { receiptRefs: string[]; sources: Map<string, SourceAuthorityReceipt> } {
  const player = envelope.playerActionReceipt;
  if (!isObject(player) || player.status !== 'accepted'
    || player.interactionId !== proposal.interactionId
    || player.playerActionFingerprint !== proposal.playerActionFingerprint) {
    throw new StoryWorkspaceStoreError(422, 'STORY_PLAYER_ACTION_RECEIPT_INVALID', 'The handoff does not match its accepted player-action receipt.', { field: 'playerActionReceipt' });
  }
  requireExactKeys(player, 'playerActionReceipt', ['receiptRef', 'interactionId', 'playerActionFingerprint', 'status']);
  stableId(player.receiptRef, 'playerActionReceipt.receiptRef');
  if (!Array.isArray(envelope.sourceReceipts) || envelope.sourceReceipts.length > 24) {
    throw new StoryWorkspaceStoreError(422, 'STORY_SOURCE_RECEIPTS_INVALID', 'The handoff source receipts are invalid.', { field: 'sourceReceipts' });
  }
  const receipts = new Map<string, SourceAuthorityReceipt>();
  envelope.sourceReceipts.forEach((receipt, index) => {
    if (!isObject(receipt) || receipt.status !== 'committed' || !['gmc', 'gma', 'vcs', 'studio'].includes(String(receipt.authority))) {
      throw new StoryWorkspaceStoreError(422, 'STORY_SOURCE_RECEIPTS_INVALID', 'A handoff source receipt is invalid.', { field: `sourceReceipts[${index}]` });
    }
    requireExactKeys(receipt, `sourceReceipts[${index}]`, ['sourceRef', 'receiptRef', 'authority', 'status']);
    const sourceRef = stableId(receipt.sourceRef, `sourceReceipts[${index}].sourceRef`);
    stableId(receipt.receiptRef, `sourceReceipts[${index}].receiptRef`);
    if (receipts.has(sourceRef)) throw new StoryWorkspaceStoreError(409, 'STORY_SOURCE_RECEIPTS_INVALID', 'A handoff source was supplied more than once.', { sourceRef });
    receipts.set(sourceRef, receipt as SourceAuthorityReceipt);
  });
  for (const sourceRef of proposal.sourceRefs as string[]) {
    if (!receipts.has(sourceRef)) throw new StoryWorkspaceStoreError(422, 'STORY_SOURCE_RECEIPT_REQUIRED', 'A proposed handoff source is missing its committed receipt.', { sourceRef });
  }
  return { receiptRefs: [player.receiptRef, ...[...receipts.values()].map((receipt) => receipt.receiptRef)], sources: receipts };
}

function assertSceneKitAuthority(proposal: JsonObject, graph: JsonObject, sourceReceipts: Map<string, SourceAuthorityReceipt>): void {
  const handoff = proposal.handoff as JsonObject;
  const kit = handoff.sceneKit as JsonObject;
  if (kit.planningState !== 'active') throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_NOT_ACTIVE', 'An accepted handoff must establish an active Scene kit.', { field: 'proposal.handoff.sceneKit.planningState' });
  const proposalSources = new Set(proposal.sourceRefs as string[]);
  const locus = kit.playableLocus as JsonObject;
  for (const sourceRef of [...kit.sourceRefs as string[], ...locus.sourceRefs as string[]]) {
    if (!proposalSources.has(sourceRef)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_SOURCE_UNBOUND', 'The Scene kit contains a source that is not bound to the handoff.', { sourceRef });
  }
  const participants = kit.participants as JsonObject;
  for (const actorRef of [...participants.present as string[], ...participants.anticipated as string[]]) {
    if (!sourceReceipts.has(actorRef)) throw new StoryWorkspaceStoreError(422, 'STORY_PRESENCE_RECEIPT_REQUIRED', 'A durable actor in the proposed cast lacks authority evidence.', { actorRef });
  }
  if (locus.canonicalAnchorRef !== null && !sourceReceipts.has(String(locus.canonicalAnchorRef))) {
    throw new StoryWorkspaceStoreError(422, 'STORY_LOCATION_RECEIPT_REQUIRED', 'The proposed canonical location anchor lacks authority evidence.', { locationRef: locus.canonicalAnchorRef });
  }
  const nodeIds = new Set(graphNodes(graph).map((node) => String(node.nodeId)));
  for (const nodeId of kit.storyBindings as string[]) {
    if (!nodeIds.has(nodeId)) throw new StoryWorkspaceStoreError(422, 'STORY_GRAPH_REFERENCE_INVALID', 'A Scene-kit Story binding does not resolve.', { nodeId });
  }
  for (const beat of kit.beats as JsonObject[]) {
    for (const impact of beat.potentialImpacts as JsonObject[]) {
      if (!nodeIds.has(String(impact.storyNodeRef))) throw new StoryWorkspaceStoreError(422, 'STORY_GRAPH_REFERENCE_INVALID', 'A potential Story impact does not resolve.', { nodeId: impact.storyNodeRef, beatId: beat.beatId });
    }
  }
}

function comparableSceneKit(kit: JsonObject, omitPlanningState = false): JsonObject {
  const value = clone(kit);
  delete value.revision;
  if (omitPlanningState) delete value.planningState;
  return value;
}

function validateHandoffMode(mode: HandoffMode, proposed: JsonObject, current: JsonObject | null, existing: JsonObject | null): void {
  const proposedId = String(proposed.sceneKitId);
  if (mode === 'create') {
    if (existing) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_KIT_ALREADY_EXISTS', 'Create cannot replace an existing Scene kit.', { sceneKitId: proposedId });
    if (proposed.revision !== 1) throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_KIT_REVISION_CONFLICT', 'A created Scene kit must begin at revision one.', { sceneKitId: proposedId });
    return;
  }
  if (!existing) throw new StoryWorkspaceStoreError(404, 'STORY_SCENE_KIT_NOT_FOUND', 'The selected Scene kit does not exist.', { sceneKitId: proposedId });
  if (mode === 'reuse') {
    if (!current || current.sceneKitId !== proposedId) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_CONFLICT', 'Reuse must keep the current Scene kit.', { sceneKitId: proposedId });
    if (canonicalJson(existing) !== canonicalJson(proposed)) throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_REUSE_CHANGED', 'Reuse cannot change the current Scene kit.', { sceneKitId: proposedId });
    return;
  }
  if (mode === 'select') {
    const expectedRevision = Number(existing.revision) + (existing.planningState === 'active' ? 0 : 1);
    if (Number(proposed.revision) !== expectedRevision
      || canonicalJson(comparableSceneKit(existing, true)) !== canonicalJson(comparableSceneKit(proposed, true))) {
      throw new StoryWorkspaceStoreError(422, 'STORY_SCENE_SELECTION_CHANGED', 'Selecting a prepared Scene kit may only activate the existing material.', { sceneKitId: proposedId, expectedRevision });
    }
    return;
  }
  if (Number(proposed.revision) !== Number(existing.revision) + 1) {
    throw new StoryWorkspaceStoreError(409, 'STORY_SCENE_KIT_REVISION_CONFLICT', 'A replacement Scene kit must advance exactly one revision.', { sceneKitId: proposedId, expectedRevision: Number(existing.revision) + 1 });
  }
}

function resultFromCommittedWorkspace(workspace: JsonObject, storyWorkspaceRef: JsonObject, duplicate: boolean): JsonObject {
  const receipt = isObject(workspace.lastSceneHandoffReceipt) ? workspace.lastSceneHandoffReceipt as JsonObject : {};
  return {
    contractVersion: SCENE_HANDOFF_RECEIPT_CONTRACT_VERSION,
    status: 'applied',
    duplicate,
    authoritativeStateChanged: !duplicate,
    storyWorkspaceRef,
    sceneHandoffReceipt: clone(receipt),
    playableSceneContext: buildPlayableSceneContextV2(workspace),
    privateSceneContext: buildPrivateSceneDirectorContext(workspace),
  };
}

/** Commits one exact Scene kit, locus, cast, and beat in one workspace revision. */
export async function commitSceneHandoff(
  input: { userId: string; campaignId: string; envelope: SceneHandoffAuthorityEnvelope },
  records?: StoryWorkspaceRevisionCollection,
): Promise<JsonObject> {
  if (!isObject(input.envelope)) throw new StoryWorkspaceStoreError(400, 'STORY_SCENE_HANDOFF_INVALID', 'The scene-handoff authority envelope must be an object.', {});
  requireExactKeys(input.envelope, 'envelope', ['proposal', 'playerActionReceipt', 'sourceReceipts', 'timelineAnchor']);
  if (bytes(input.envelope as unknown as JsonObject) > SCENE_HANDOFF_AUTHORITY_ENVELOPE_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_SCENE_HANDOFF_TOO_LARGE', 'The scene-handoff authority envelope exceeds its size bound.', { maximumBytes: SCENE_HANDOFF_AUTHORITY_ENVELOPE_MAX_BYTES });
  validateSceneHandoffProposal(input.envelope.proposal);
  const proposal = input.envelope.proposal;
  const idempotencyKey = stableId(proposal.idempotencyKey, 'proposal.idempotencyKey');
  const requestHash = hash(input.envelope as unknown as JsonObject);
  const replay = await readStoryWorkspaceRevision({ userId: input.userId, campaignId: input.campaignId, idempotencyKey }, records);
  if (replay) {
    if (replay.requestHash !== requestHash || replay.source !== 'scene_handoff') throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The handoff idempotency key was already used for a different write.', {});
    return resultFromCommittedWorkspace(replay.workspace, replay.storyWorkspaceRef as unknown as JsonObject, true);
  }
  const authorityReceipts = validateAuthorityReceipts(input.envelope, proposal);
  const authorityReceiptRefs = authorityReceipts.receiptRefs;
  if (input.envelope.timelineAnchor !== undefined && !isObject(input.envelope.timelineAnchor)) throw new StoryWorkspaceStoreError(422, 'STORY_TIMELINE_ANCHOR_INVALID', 'The scene handoff timeline anchor is invalid.', { field: 'timelineAnchor' });
  if (input.envelope.timelineAnchor !== undefined) requireExactKeys(input.envelope.timelineAnchor, 'timelineAnchor', ['messageId', 'sequence']);
  const timelineAnchor = input.envelope.timelineAnchor === undefined ? null : {
    messageId: stableId(input.envelope.timelineAnchor.messageId, 'timelineAnchor.messageId'),
    sequence: Number(input.envelope.timelineAnchor.sequence),
  };
  if (timelineAnchor && (!Number.isSafeInteger(timelineAnchor.sequence) || timelineAnchor.sequence < 0)) throw new StoryWorkspaceStoreError(422, 'STORY_TIMELINE_ANCHOR_INVALID', 'The scene handoff timeline anchor is invalid.', { field: 'timelineAnchor.sequence' });
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, records);
  const workspace = clone(active?.workspace ?? emptyStoryWorkspace(input.campaignId));
  const actualWorkspaceRevision = active?.storyWorkspaceRef.revision ?? 0;
  if (actualWorkspaceRevision !== proposal.expectedWorkspaceRevision) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before the scene handoff.', { expectedRevision: proposal.expectedWorkspaceRevision, actualRevision: actualWorkspaceRevision });
  const actualSceneRevision = currentSceneRevision(workspace);
  if (actualSceneRevision !== proposal.expectedCurrentSceneRevision) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_REVISION_CONFLICT', 'The current Scene kit changed before the handoff.', { expectedRevision: proposal.expectedCurrentSceneRevision, actualRevision: actualSceneRevision });
  const graph = projectStoryGraphV2(workspace);
  workspace.storyGraph = graph;
  const handoff = proposal.handoff as JsonObject;
  const proposedKit = clone(handoff.sceneKit as JsonObject);
  assertSceneKitAuthority(proposal, graph, authorityReceipts.sources);
  const current = activeV2SceneKit(workspace);
  const kits = sceneKits(workspace).map((kit) => kit.schemaVersion === SCENE_KIT_V2_CONTRACT_VERSION ? clone(kit) : projectLegacySceneKitV2(kit, graph));
  const existingIndex = kits.findIndex((kit) => kit.sceneKitId === proposedKit.sceneKitId);
  const existing = existingIndex >= 0 ? kits[existingIndex] : null;
  validateHandoffMode(String(handoff.mode) as HandoffMode, proposedKit, current, existing);
  if (current && current.sceneKitId !== proposedKit.sceneKitId) {
    const requiredExitKind: Record<string, string> = {
      completed: 'completion', failed: 'failure', abandoned: 'abandonment', redirected: 'redirect', superseded: 'redirect',
    };
    const exitKind = requiredExitKind[String(handoff.priorSceneExit)];
    if (!(current.exitVectors as JsonObject[]).some((exit) => exit.kind === exitKind)) throw new StoryWorkspaceStoreError(422, 'STORY_PRIOR_SCENE_EXIT_UNSUPPORTED', 'The prior Scene kit does not support the proposed exit.', { priorSceneKitId: current.sceneKitId, exitKind });
  }
  if (existingIndex >= 0) kits[existingIndex] = proposedKit;
  else kits.push(proposedKit);
  const priorRef = isObject(workspace.activeSceneKitRef) ? clone(workspace.activeSceneKitRef as JsonObject) : null;
  const changingScene = priorRef !== null && priorRef.sceneKitId !== proposedKit.sceneKitId;
  const exitHistory = Array.isArray(workspace.sceneExitHistory) ? clone(workspace.sceneExitHistory as JsonValue[]) : [];
  if (changingScene) exitHistory.push({
    interactionId: proposal.interactionId,
    priorSceneKitId: priorRef.sceneKitId,
    priorSceneRevision: priorRef.revision,
    exit: handoff.priorSceneExit,
    sourceReceiptRefs: authorityReceiptRefs,
    timelineAnchor,
  });
  const receipt: JsonObject = {
    contractVersion: SCENE_HANDOFF_RECEIPT_CONTRACT_VERSION,
    interactionId: proposal.interactionId,
    idempotencyKey,
    requestHash,
    playerActionFingerprint: proposal.playerActionFingerprint,
    handoffMode: handoff.mode,
    candidateRef: handoff.candidateRef,
    priorSceneKitRef: priorRef,
    acceptedSceneKitId: proposedKit.sceneKitId,
    acceptedSceneKitRevision: proposedKit.revision,
    activeBeatRef: handoff.activeBeatRef,
    playableLocusHash: hash(proposedKit.playableLocus as JsonObject),
    sourceReceiptRefs: authorityReceiptRefs,
  };
  const receiptHistory = Array.isArray(workspace.sceneHandoffReceipts) ? clone(workspace.sceneHandoffReceipts as JsonValue[]) : [];
  receiptHistory.push(receipt);
  workspace.sceneKits = kits;
  workspace.activeSceneKitRef = { sceneKitId: proposedKit.sceneKitId };
  workspace.activeBeatRef = handoff.activeBeatRef;
  workspace.sceneExitHistory = exitHistory.slice(-128);
  workspace.sceneHandoffReceipts = receiptHistory.slice(-128);
  workspace.lastSceneHandoffReceipt = receipt;
  if (timelineAnchor) workspace.timelineAnchor = timelineAnchor;
  const portfolio = isObject(workspace.portfolio) ? workspace.portfolio : {};
  workspace.portfolio = { ...clone(portfolio as JsonObject), arcs: compatibilityArcs(graph, workspace) };
  // Projection bounds are part of the atomic authority contract. Validate both
  // contexts before the immutable workspace revision is written so a response
  // serialization failure can never follow a successful handoff commit.
  buildPlayableSceneContextV2(workspace);
  buildPrivateSceneDirectorContext(workspace);
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId: input.campaignId,
    expectedRevision: proposal.expectedWorkspaceRevision as number,
    idempotencyKey,
    source: 'scene_handoff',
    timelineAnchor,
    workspace,
    changedRecordRefs: [`scene_kit:${String(proposedKit.sceneKitId)}`, 'workspace:activeSceneKitRef', 'workspace:activeBeatRef'],
    requestHashOverride: requestHash,
  }, records);
  const committed = await readStoryWorkspaceRevision({ userId: input.userId, campaignId: input.campaignId, revision: written.storyWorkspaceRef.revision }, records);
  if (!committed) throw new StoryWorkspaceStoreError(500, 'STORY_HANDOFF_COMMIT_UNREADABLE', 'The committed scene handoff could not be read back.', {});
  return resultFromCommittedWorkspace(committed.workspace, committed.storyWorkspaceRef as unknown as JsonObject, written.duplicate);
}

function validateStoryDeltaV2(input: unknown, campaignId: string): StoryDeltaV2 {
  if (!isObject(input) || input.schemaVersion !== STORY_DELTA_V2_CONTRACT_VERSION || input.campaignId !== campaignId
    || !['studio', 'gma'].includes(String(input.sourceSystem)) || input.targetAuthority !== 'gmc' || input.visibility !== 'gm_only') {
    throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The version 2 Story delta envelope is invalid.', {});
  }
  if (bytes(input as JsonObject) > STORY_DELTA_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_DELTA_TOO_LARGE', 'The Story delta exceeds its size bound.', { maximumBytes: STORY_DELTA_MAX_BYTES });
  for (const field of ['deltaId', 'operationId', 'idempotencyKey', 'correlationId', 'campaignId', 'initiatedBy', 'sceneKitRef']) stableId(input[field], field);
  if (!['no_replan', 'beat_update', 'scene_patch', 'scene_replace', 'frontier_refresh', 'graph_review', 'full_rebuild'].includes(String(input.classification))) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The Story delta classification is invalid.', { field: 'classification' });
  if (!Number.isSafeInteger(input.expectedWorkspaceRevision) || Number(input.expectedWorkspaceRevision) < 0) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The expected workspace revision is invalid.', { field: 'expectedWorkspaceRevision' });
  if (!String(input.reason ?? '').trim() || String(input.reason).length > 2_000) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The Story delta reason is invalid.', { field: 'reason' });
  if (!isObject(input.sourceRevisions) || !Object.keys(input.sourceRevisions).length || Object.keys(input.sourceRevisions).length > 20) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The Story delta requires bounded source revisions.', { field: 'sourceRevisions' });
  for (const [key, revision] of Object.entries(input.sourceRevisions)) {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(key)
      || !(typeof revision === 'string' && revision.trim() || typeof revision === 'number' && Number.isFinite(revision) && revision >= 0)) {
      throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'A Story delta source revision is invalid.', { field: `sourceRevisions.${key}` });
    }
  }
  if (!Array.isArray(input.sourceReceiptRefs) || input.sourceReceiptRefs.length > 32) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The Story delta source receipts are invalid.', { field: 'sourceReceiptRefs' });
  input.sourceReceiptRefs.forEach((ref, index) => stableId(ref, `sourceReceiptRefs[${index}]`));
  if (!Array.isArray(input.beatChanges) || input.beatChanges.length > 16
    || !Array.isArray(input.actualStoryImpacts) || input.actualStoryImpacts.length > 16
    || !Array.isArray(input.affectedRecords) || input.affectedRecords.length > 16) {
    throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'The Story delta exceeds its change bounds.', {});
  }
  input.beatChanges.forEach((change, index) => {
    if (!isObject(change) || !['available', 'active', 'resolved', 'bypassed'].includes(String(change.state))) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'A beat change is invalid.', { field: `beatChanges[${index}]` });
    stableId(change.beatRef, `beatChanges[${index}].beatRef`);
    const refs = stringList(change.sourceReceiptRefs, 16).map((ref) => stableId(ref, `beatChanges[${index}].sourceReceiptRefs`));
    if (!refs.length) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_GROUNDING_REQUIRED', 'A beat change requires a committed receipt.', { field: `beatChanges[${index}].sourceReceiptRefs` });
  });
  input.actualStoryImpacts.forEach((impact, index) => {
    if (!isObject(impact) || !['advance', 'complicate', 'resolve', 'reopen', 'retire'].includes(String(impact.effect))) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'An actual Story impact is invalid.', { field: `actualStoryImpacts[${index}]` });
    stableId(impact.storyNodeRef, `actualStoryImpacts[${index}].storyNodeRef`);
    if (!String(impact.reason ?? '').trim() || String(impact.reason).length > 1_500) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'An actual Story impact reason is invalid.', { field: `actualStoryImpacts[${index}].reason` });
    const refs = stringList(impact.sourceReceiptRefs, 16).map((ref) => stableId(ref, `actualStoryImpacts[${index}].sourceReceiptRefs`));
    if (!refs.length) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_GROUNDING_REQUIRED', 'An actual Story impact requires a committed receipt.', { field: `actualStoryImpacts[${index}].sourceReceiptRefs` });
  });
  input.affectedRecords.forEach((patch, index) => {
    if (!isObject(patch) || !['workspace', 'arc', 'frontier', 'scene_kit', 'npc_scene_card', 'npc_readiness', 'preparation_requirement'].includes(String(patch.recordType))) {
      throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'A Story record patch has an invalid type.', { field: `affectedRecords[${index}].recordType` });
    }
    stableId(patch.recordId, `affectedRecords[${index}].recordId`);
    if (!Number.isSafeInteger(patch.expectedRevision) || Number(patch.expectedRevision) < 0
      || !Array.isArray(patch.changes) || !patch.changes.length || patch.changes.length > 32) {
      throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'A Story record patch is invalid.', { field: `affectedRecords[${index}]` });
    }
    patch.changes.forEach((change, changeIndex) => {
      if (!isObject(change) || !['set', 'remove'].includes(String(change.op)) || typeof change.path !== 'string') {
        throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'A Story record change is invalid.', { field: `affectedRecords[${index}].changes[${changeIndex}]` });
      }
      if (patch.recordType === 'workspace' && (change.path === '/'
        || /^\/(storyGraph|sceneKits|activeSceneKitRef|activeBeatRef|sceneHandoffReceipts|sceneExitHistory|storyImpactReceipts)(\/|$)/.test(change.path))) {
        throw new StoryWorkspaceStoreError(422, 'STORY_AUTHORITY_PATH_PROTECTED', 'A bounded Story delta cannot replace current-scene or graph authority paths.', { field: `affectedRecords[${index}].changes[${changeIndex}].path` });
      }
    });
  });
  const changeCount = input.beatChanges.length + input.actualStoryImpacts.length + input.affectedRecords.length;
  if (input.classification === 'no_replan' && changeCount) throw new StoryWorkspaceStoreError(422, 'STORY_NO_REPLAN_WRITE_FORBIDDEN', 'A no-replan delta cannot change Story state.', {});
  if (input.classification !== 'no_replan' && !changeCount) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_GROUNDING_REQUIRED', 'A material Story delta requires a receipt-backed change.', {});
  return input as unknown as StoryDeltaV2;
}

function applyImpactToNode(node: JsonObject, effect: StoryImpactEffect): void {
  if (effect === 'resolve') {
    node.state = 'resolved';
    node.planningState = 'resolved';
  } else if (effect === 'reopen') {
    node.state = 'active';
    node.planningState = 'active';
  } else if (effect === 'retire') {
    node.state = 'dormant';
    node.planningState = 'retired';
  }
}

/** Applies receipt-backed beat and actual Story impacts in one immutable revision. */
export async function applyStoryDeltaV2(
  input: { userId: string; campaignId: string; delta: StoryDeltaV2 },
  records?: StoryWorkspaceRevisionCollection,
): Promise<JsonObject> {
  const delta = validateStoryDeltaV2(input.delta, input.campaignId);
  const requestHash = hash(delta as unknown as JsonObject);
  const replay = await readStoryWorkspaceRevision({ userId: input.userId, campaignId: input.campaignId, idempotencyKey: delta.idempotencyKey }, records);
  if (replay) {
    if (replay.requestHash !== requestHash || replay.source !== 'story_delta_v2') throw new StoryWorkspaceStoreError(409, 'STORY_IDEMPOTENCY_CONFLICT', 'The Story-delta idempotency key was already used for a different write.', {});
    return {
      contractVersion: 'gmc.story-delta-receipt/2',
      status: 'applied', duplicate: true, authoritativeStateChanged: false,
      deltaId: delta.deltaId, operationId: delta.operationId, storyWorkspaceRef: replay.storyWorkspaceRef as unknown as JsonValue,
    };
  }
  const active = await readActiveStoryWorkspace({ userId: input.userId, campaignId: input.campaignId }, records);
  const actualRevision = active?.storyWorkspaceRef.revision ?? 0;
  if (actualRevision !== delta.expectedWorkspaceRevision) throw new StoryWorkspaceStoreError(409, 'STORY_WORKSPACE_REVISION_CONFLICT', 'The Story workspace changed before the Story delta.', { expectedRevision: delta.expectedWorkspaceRevision, actualRevision });
  if (delta.classification === 'no_replan') return {
    contractVersion: 'gmc.story-delta-receipt/2', status: 'no_change', duplicate: false,
    authoritativeStateChanged: false, deltaId: delta.deltaId, operationId: delta.operationId,
    storyWorkspaceRef: (active?.storyWorkspaceRef ?? null) as unknown as JsonValue,
  };
  if (!active) throw new StoryWorkspaceStoreError(404, 'STORY_WORKSPACE_NOT_FOUND', 'No Story workspace exists for this delta.', {});
  const workspace = clone(active.workspace);
  const kit = activeV2SceneKit(workspace);
  if (!kit || ![String(kit.sceneKitId), `${String(kit.sceneKitId)}:r${String(kit.revision)}`].includes(delta.sceneKitRef)) throw new StoryWorkspaceStoreError(409, 'STORY_CURRENT_SCENE_CONFLICT', 'The Story delta does not target the current Scene kit.', { sceneKitRef: delta.sceneKitRef });
  const changedRefs: string[] = [];
  for (const patch of delta.affectedRecords) {
    if (patch.recordType === 'scene_kit' && patch.recordId === kit.sceneKitId) throw new StoryWorkspaceStoreError(422, 'STORY_DELTA_V2_INVALID', 'Use beatChanges for the active version 2 Scene kit.', { recordId: patch.recordId });
    changedRefs.push(applyStoryRecordPatch(workspace, patch));
  }
  if (delta.beatChanges.length) {
    const beats = clone(kit.beats as JsonValue[]) as JsonObject[];
    for (const change of delta.beatChanges) {
      const beat = beats.find((candidate) => candidate.beatId === change.beatRef);
      if (!beat) throw new StoryWorkspaceStoreError(404, 'STORY_SCENE_BEAT_NOT_FOUND', 'A beat change does not resolve in the current Scene kit.', { beatRef: change.beatRef });
      beat.state = change.state;
      changedRefs.push(`scene_beat:${change.beatRef}`);
    }
    if (beats.filter((beat) => beat.state === 'active').length > 1) throw new StoryWorkspaceStoreError(422, 'STORY_ACTIVE_BEAT_CONFLICT', 'A Scene kit cannot have more than one active beat.', {});
    kit.beats = beats;
    kit.revision = Number(kit.revision) + 1;
    const index = sceneKits(workspace).findIndex((candidate) => candidate.sceneKitId === kit.sceneKitId);
    const kits = sceneKits(workspace);
    kits[index] = kit;
    workspace.sceneKits = kits;
    const nextActive = beats.find((beat) => beat.state === 'active') ?? beats.find((beat) => beat.state === 'available') ?? beats[0];
    workspace.activeBeatRef = nextActive.beatId;
  }
  const graph = projectStoryGraphV2(workspace);
  const nodes = graphNodes(graph);
  const potential = new Map<string, Set<string>>();
  for (const beat of kit.beats as JsonObject[]) for (const impact of beat.potentialImpacts as JsonObject[]) {
    const key = String(impact.storyNodeRef);
    if (!potential.has(key)) potential.set(key, new Set());
    potential.get(key)!.add(String(impact.effect));
  }
  const history = Array.isArray(workspace.storyImpactReceipts) ? clone(workspace.storyImpactReceipts as JsonValue[]) : [];
  for (const impact of delta.actualStoryImpacts) {
    const node = nodes.find((candidate) => candidate.nodeId === impact.storyNodeRef);
    if (!node) throw new StoryWorkspaceStoreError(404, 'STORY_GRAPH_REFERENCE_INVALID', 'An actual Story impact does not resolve.', { storyNodeRef: impact.storyNodeRef });
    const preparedEffects = potential.get(impact.storyNodeRef);
    if (preparedEffects && preparedEffects.size && !preparedEffects.has(impact.effect)) throw new StoryWorkspaceStoreError(422, 'STORY_IMPACT_NOT_PREPARED', 'The actual Story impact conflicts with this scene’s prepared impact.', { storyNodeRef: impact.storyNodeRef, effect: impact.effect });
    applyImpactToNode(node, impact.effect);
    history.push({ deltaId: delta.deltaId, sceneKitRef: delta.sceneKitRef, ...clone(impact as unknown as JsonObject) });
    changedRefs.push(`story_node:${impact.storyNodeRef}`);
  }
  if (delta.actualStoryImpacts.length) {
    graph.nodes = nodes;
    graph.revision = Number(graph.revision) + 1;
    validateStoryGraphV2(graph);
    workspace.storyGraph = graph;
    workspace.storyImpactReceipts = history.slice(-240);
    const portfolio = isObject(workspace.portfolio) ? workspace.portfolio : {};
    workspace.portfolio = { ...clone(portfolio as JsonObject), arcs: compatibilityArcs(graph, workspace) };
  }
  workspace.lastStoryDeltaRef = delta.deltaId;
  workspace.sourceRevisions = clone(delta.sourceRevisions as unknown as JsonObject);
  const deltaSequence = delta.sourceRevisions.timelineSequence;
  const timelineAnchor = typeof deltaSequence === 'number' && Number.isSafeInteger(deltaSequence) && deltaSequence >= 0
    ? { messageId: `story-delta:${delta.deltaId}`, sequence: deltaSequence }
    : workspaceTimelineAnchor(workspace);
  if (timelineAnchor) workspace.timelineAnchor = timelineAnchor;
  const written = await replaceStoryWorkspace({
    userId: input.userId,
    campaignId: input.campaignId,
    expectedRevision: delta.expectedWorkspaceRevision,
    idempotencyKey: delta.idempotencyKey,
    source: 'story_delta_v2',
    timelineAnchor,
    workspace,
    deltaId: delta.deltaId,
    changedRecordRefs: changedRefs,
    requestHashOverride: requestHash,
  }, records);
  return {
    contractVersion: 'gmc.story-delta-receipt/2', status: 'applied', duplicate: written.duplicate,
    authoritativeStateChanged: !written.duplicate, deltaId: delta.deltaId, operationId: delta.operationId,
    storyWorkspaceRef: written.storyWorkspaceRef as unknown as JsonValue,
  };
}

/** Reads both D2 projections from the same immutable workspace revision. */
export async function readCurrentSceneContexts(
  input: { userId: string; campaignId: string },
  records?: StoryWorkspaceRevisionCollection,
) {
  const active = await readActiveStoryWorkspace(input, records);
  if (!active) return null;
  return {
    storyWorkspaceRef: active.storyWorkspaceRef,
    playableSceneContext: buildPlayableSceneContextV2(active.workspace),
    privateSceneContext: buildPrivateSceneDirectorContext(active.workspace),
    authorityReceiptCatalog: buildStoryAuthorityReceiptCatalog(active.workspace),
  };
}

/** Exposes the documented graph byte bound for deployment health checks. */
export function assertStoryGraphByteBound(graph: JsonObject): void {
  validateStoryGraphV2(graph);
  if (bytes(graph) > STORY_GRAPH_MAX_BYTES) throw new StoryWorkspaceStoreError(413, 'STORY_GRAPH_TOO_LARGE', 'The Story graph exceeds its storage bound.', { maximumBytes: STORY_GRAPH_MAX_BYTES });
}
