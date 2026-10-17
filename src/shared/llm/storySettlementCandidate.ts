import { freeformJsonDigest } from './freeformPlanBinding.js';
import { SCENE_MOVEMENT_EXPECTATION_SCHEMA, sceneMovementSchemaIssues } from './sceneMovementOutcome.js';
import { PREPARED_CHECK_COMPLETION_AUTHORITY, preparedMovementResultIssues } from './preparedCheckCompletion.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => freeformJsonDigest(a) === freeformJsonDigest(b);
export const STORY_SETTLEMENT_CANDIDATE_V2 = 'gma.compound-story-settlement-candidate/2';
export const STORY_TERMINAL_TRANSPORT_V1 = 'gma.compound-story-terminal-transport/1';
export const STORY_SETTLEMENT_V2_CAPABILITY = 'durable-story-settlement-candidate/2';
export const STORY_SETTLEMENT_CANDIDATE_VERSIONS = ['gma.compound-story-settlement-candidate/1', STORY_SETTLEMENT_CANDIDATE_V2] as const;
const outer = ['schemaVersion', 'programId', 'instructionFingerprint', 'slice', 'nodeRefs', 'interactionId',
  'playerActionFingerprint', 'timelineSequence', 'sceneTimelineSequence', 'declaredActionFingerprint',
  'originStoryWorkspaceRef', 'sceneKitRef', 'originActiveSceneStateRef', 'activeBeatRef', 'sceneHandoffReceiptRef', 'compiled', 'terminalTransport'];
const checkKeys = ['transportSchemaVersion', 'kind', 'status', 'visibility', 'interactionId', 'instruction'];
const pendingKeys = ['schemaVersion', 'interactionId', 'playerActionFingerprint', 'storyWorkspaceRef', 'sceneKitRef', 'activeBeatRef', 'mechanicsRequired', 'preparedBranches'];
const outcomeKeys = ['criticalFailure', 'partial', 'success', 'greatSuccess', 'criticalSuccess'];
const exact = (row: Row, keys: string[]): boolean => Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key));

/** Pure closed transport validation. The owning writer still verifies workflow,
 * program, revision, fingerprint and authorization before storing anything. */
export function storySettlementTransportIssues(value: unknown): string[] {
  if (!object(value) || value.schemaVersion !== STORY_SETTLEMENT_CANDIDATE_V2) return ['/schemaVersion'];
  if (!exact(value, outer)) return ['/fields'];
  const transport = value.terminalTransport, compiled = value.compiled, slice = value.slice;
  const selected = object(transport) && transport.schemaVersion === PREPARED_CHECK_COMPLETION_AUTHORITY.terminalTransport;
  if (!object(transport) || !exact(transport, ['schemaVersion', 'check', 'pendingStoryOutcome', ...(selected ? ['movementExpectation'] : [])])
    || ![STORY_TERMINAL_TRANSPORT_V1, PREPARED_CHECK_COMPLETION_AUTHORITY.terminalTransport].includes(String(transport.schemaVersion)) || !object(compiled) || !object(slice)) return ['/terminalTransport'];
  if (selected) {
    const expectation = transport.movementExpectation;
    if (compiled.schemaVersion !== 'gma.current-scene-narration-compiled/14' || expectation !== null
      && (sceneMovementSchemaIssues(expectation, SCENE_MOVEMENT_EXPECTATION_SCHEMA).length || !object(expectation)
        || expectation.programRef !== value.programId || !Array.isArray(value.nodeRefs) || !value.nodeRefs.includes(expectation.nodeRef)
        || !object(value.sceneKitRef) || expectation.campaignId !== value.sceneKitRef.campaignId)) return ['/terminalTransport/movementExpectation'];
    const branches = object(compiled.rollRequest) && object(compiled.rollRequest.preparedOutcome) ? compiled.rollRequest.preparedOutcome.branches : null;
    if (compiled.rollRequest != null && (!object(branches) || !exact(branches, outcomeKeys)
      || Object.values(branches).some((branch) => !object(branch)
        || preparedMovementResultIssues(branch.movementResult, expectation, branch.responseText).length))) return ['/compiled/rollRequest/preparedOutcome/branches'];
  }
  if (slice.programId !== value.programId || !Array.isArray(value.nodeRefs) || !same(slice.nodeRefs, value.nodeRefs)) return ['/slice'];
  if (compiled.rollRequest == null) return transport.check === null && transport.pendingStoryOutcome === null ? [] : ['/terminalTransport/check'];
  const check = transport.check, pending = transport.pendingStoryOutcome, roll = compiled.rollRequest;
  if (!object(roll) || !object(check) || !exact(check, checkKeys)
    || check.transportSchemaVersion !== 'gma.player-check-transport/1' || check.kind !== 'skill_check'
    || check.status !== 'pending' || check.visibility !== 'player'
    || check.interactionId !== value.interactionId || (roll.interactionId != null && roll.interactionId !== check.interactionId)
    || typeof check.instruction !== 'string' || check.instruction.length > 4_000) return ['/terminalTransport/check'];
  if (!object(pending) || !exact(pending, pendingKeys) || pending.schemaVersion !== 'gma.pending-story-outcome/1'
    || pending.interactionId !== value.interactionId || pending.playerActionFingerprint !== value.playerActionFingerprint
    || !same(pending.storyWorkspaceRef, value.originStoryWorkspaceRef) || !same(pending.sceneKitRef, value.sceneKitRef)
    || pending.activeBeatRef !== value.activeBeatRef || pending.mechanicsRequired !== true
    || !object(pending.preparedBranches) || selected && !exact(pending.preparedBranches, outcomeKeys)) return ['/terminalTransport/pendingStoryOutcome'];
  const prepared = object(roll.preparedOutcome) && object(roll.preparedOutcome.branches) ? roll.preparedOutcome.branches : {};
  if (Object.entries(pending.preparedBranches).some(([key, branch]) => !object(prepared[key]) || !same(branch, prepared[key].storyOutcome))) return ['/terminalTransport/preparedBranches'];
  return [];
}

function invalid(paths: string[]): never {
  throw Object.assign(new Error('The durable Story transport does not match its compiled presentation.'),
    { code: 'STORY_SETTLEMENT_TRANSPORT_INVALID', issues: paths.map((path) => ({ path })) });
}

export function rehydrateStoryTerminalProjection(value: unknown): Row {
  if (!object(value)) invalid(['/candidate']);
  if (value.schemaVersion === STORY_SETTLEMENT_CANDIDATE_VERSIONS[0]) {
    if (object(value.terminalProjection)) return structuredClone(value.terminalProjection);
    return { rollRequest: object(value.compiled) ? value.compiled.rollRequest ?? null : null, pendingStoryOutcome: null };
  }
  const issues = storySettlementTransportIssues(value);
  if (issues.length) invalid(issues);
  const transport = value.terminalTransport as Row, compiled = value.compiled as Row;
  return { rollRequest: transport.check === null ? null : {
    ...(compiled.rollRequest as Row), pendingStoryOutcome: structuredClone(transport.pendingStoryOutcome),
    ...(structuredClone(transport.check) as Row),
  }, pendingStoryOutcome: structuredClone(transport.pendingStoryOutcome) };
}

/** Lossless, application-only compaction: no branch is edited or summarized. */
export function compactStorySettlementCandidate(value: unknown, movementExpectation?: unknown): Row {
  if (!object(value) || value.schemaVersion !== STORY_SETTLEMENT_CANDIDATE_VERSIONS[0]
    || !object(value.compiled) || !object(value.terminalProjection)) invalid(['/candidate']);
  const projection = value.terminalProjection;
  if (!exact(projection, ['rollRequest', 'pendingStoryOutcome'])) invalid(['/terminalProjection']);
  const roll = projection.rollRequest;
  if (roll !== null && !object(roll)) invalid(['/terminalProjection/rollRequest']);
  const check = object(roll) ? Object.fromEntries(checkKeys.map((key) => [key, structuredClone(roll[key])])) : null;
  const result: Row = { ...structuredClone(value), schemaVersion: STORY_SETTLEMENT_CANDIDATE_V2 };
  delete result.terminalProjection;
  result.terminalTransport = { schemaVersion: movementExpectation === undefined ? STORY_TERMINAL_TRANSPORT_V1 : PREPARED_CHECK_COMPLETION_AUTHORITY.terminalTransport, check,
    pendingStoryOutcome: structuredClone(projection.pendingStoryOutcome),
    ...(movementExpectation === undefined ? {} : { movementExpectation: structuredClone(movementExpectation) }) };
  const restored = rehydrateStoryTerminalProjection(result);
  if (JSON.stringify(restored) !== JSON.stringify(projection)) invalid(['/terminalProjection/lossless']);
  return result;
}
