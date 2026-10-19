import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { pendingObserverEvidenceIssues } from '../../shared/llm/pendingObserverEvidence.js';
import { pendingIntentBindingSlotsFromWindow } from '../../shared/llm/scenePendingIntentBindings.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';
import { parallelPresentationNodeRefs, sceneMovementCohortSourceIssues } from '../../shared/llm/parallelPresentation.js';
import { readActiveCompoundActionArtifact } from './compoundActionArtifactStore.js';
import { assertFreeformProgramWorkflowOpen } from './freeformWorkflowAuthority.js';

const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
const rows = (v: unknown): JsonObject[] => Array.isArray(v) ? v.filter(object) : [];
const fail = (): never => { throw new StoryWorkspaceStoreError(409, 'QUALIFIED_SCENE_TURN_SOURCE_CONFLICT',
  'The prepared mover identity no longer matches this saved scene result.', {}); };

/** Exact identity citations for the original move, not presence/disclosure authority.
 * Call only with the owner-read bundle after its current settlement-head check. */
export function qualifiedSceneTurnIdentitySources(bundle: JsonObject, proposal: unknown, artifact?: JsonObject): string[] {
  const record = bundle.pendingIntentBindingRecord;
  if (!object(record) || ![2, 3, 4].map((version) => `gmc.scene-pending-intent-binding-record/${version}`).includes(String(record.schemaVersion))) return [];
  const modern = record.schemaVersion !== 'gmc.scene-pending-intent-binding-record/2';
  if (!object(proposal) || !object(bundle.sceneKit) || !object(record.window) || !object(record.bindings)
    || !object(record.bindings.sceneKitRef) || !object(proposal.sceneKitRef)) return fail();
  const { recordId, recordFingerprint, ...body } = record;
  if (recordFingerprint !== freeformJsonDigest(body) || recordId !== `pending-binding:${recordFingerprint}`
    || record.window.campaignId !== proposal.campaignId || record.bindings.sceneKitRef.sceneKitId !== bundle.sceneKit.sceneKitId
    || record.bindings.sceneKitRef.revision !== bundle.sceneKit.revision
    || proposal.sceneKitRef.sceneKitId !== bundle.sceneKit.sceneKitId || proposal.sceneKitRef.revision !== bundle.sceneKit.revision) return fail();
  // Ordinary later turns need no special mover citation. An empty owner-saved
  // witness set grants nothing and must not depend on a completed preparation
  // program remaining open. Scope/hash/head checks above still apply.
  if (Array.isArray(record.qualifiedObservers) && record.qualifiedObservers.length === 0) return [];
  if (modern && (!object(artifact) || !object(artifact.program) || !object(artifact.instruction) || !object(artifact.cursor)
    || artifact.program.programId !== record.window.programId
    || artifact.instruction.instructionFingerprint !== record.window.instructionFingerprint
    || !rows(artifact.intentBindingApplications).some((entry) => object(entry.record)
      && entry.record.recordId === recordId && entry.record.recordFingerprint === recordFingerprint))) return fail();
  const sources = new Set<string>();
  for (const evidence of rows(record.qualifiedObservers)) {
    if (pendingObserverEvidenceIssues(evidence).length || !object(evidence.viewpointCondition)
      || !object(evidence.origin) || evidence.programRef !== record.window.programId
      || evidence.windowFingerprint !== record.window.windowFingerprint) return fail();
    if (evidence.viewpointCondition.kind !== 'after_relocation') continue;
    const condition = evidence.viewpointCondition;
    const move = rows(record.window.nodes).find((row) => row.nodeRef === condition.nodeRef);
    if (!move || !object(move.node) || move.node.kind !== 'move') continue;
    const rootInteraction = modern && object(artifact?.instruction) ? artifact.instruction.interactionId
      : String(record.window.programId).replace(/^program:/, '');
    const prefix = `${rootInteraction}:compound:${String(move.nodeRef)}:`;
    let cohort = false;
    if (modern && artifact) {
      const cursor = artifact.cursor as JsonObject;
      if ((!Array.isArray(cursor.readyNodeRefs) || !cursor.readyNodeRefs.includes(move.nodeRef))
        && (!object(cursor.waiting) || cursor.waiting.nodeRef !== move.nodeRef)) continue;
      if (Array.isArray(cursor.completedNodeRefs) && cursor.completedNodeRefs.includes(move.nodeRef)
        || Array.isArray(cursor.skippedNodeRefs) && cursor.skippedNodeRefs.includes(move.nodeRef)) continue;
      const refs = parallelPresentationNodeRefs(artifact.program, artifact.cursor, String(move.nodeRef));
      if (refs.length > 1) {
        const saga = artifact.saga, pending = object(saga) ? saga.pendingModelCandidate : null;
        const candidate = object(pending) ? pending.candidate : null;
        const compiled = object(candidate) ? candidate.compiled : null;
        cohort = !sceneMovementCohortSourceIssues(artifact, proposal, String(move.nodeRef), object(compiled) ? compiled.movementOutcome : null).length;
        if (!cohort) continue;
      }
    }
    if (!cohort && (move.node.summary !== proposal.actionSummary || typeof proposal.interactionId !== 'string'
      || !proposal.interactionId.startsWith(prefix) || !/^[1-9]\d*$/.test(proposal.interactionId.slice(prefix.length)))) continue;
    const frame = rows(bundle.actorFrames).filter((row) => row.actorRef === evidence.observerRef);
    if (frame.length !== 1 || evidence.origin.zoneRef !== null && frame[0].zoneRef !== evidence.origin.zoneRef
      || evidence.origin.kind === 'human_gm' && (!Array.isArray(evidence.origin.sourceRefs)
        || !evidence.origin.sourceRefs.every((ref) => Array.isArray(frame[0].sourceRefs) && frame[0].sourceRefs.includes(ref)))) return fail();
    const binding = rows(record.bindings.nodes).find((row) => row.nodeRef === move.nodeRef);
    const slot = pendingIntentBindingSlotsFromWindow(record.window).find((row) => row.nodeRef === move.nodeRef);
    const actorSlots = slot?.references.filter((row: { role: string }) => row.role === 'actor') ?? [];
    if (!actorSlots.length || actorSlots.some((slot: { slotId: string }) => !rows(binding?.references).some((ref) =>
      ref.slotId === slot.slotId && [evidence.observerRef, frame[0].actorFrameId].includes(ref.selectedRef)))) return fail();
    sources.add(String(evidence.observerRef));
  }
  return [...sources].sort();
}

/** Modern identity citations require current owner membership and cancellation
 * checks; injectable readers are only for isolated owner-bound verification. */
export async function readQualifiedSceneTurnIdentitySources(input: { userId: string; campaignId: string; bundle: JsonObject; proposal: unknown },
  deps: { readArtifact?: typeof readActiveCompoundActionArtifact; assertWorkflowOpen?: typeof assertFreeformProgramWorkflowOpen } = {}): Promise<string[]> {
  const record = input.bundle.pendingIntentBindingRecord;
  if (!object(record) || !['gmc.scene-pending-intent-binding-record/3', 'gmc.scene-pending-intent-binding-record/4', 'gmc.scene-pending-intent-binding-record/5', 'gmc.scene-pending-intent-binding-record/6', 'gmc.scene-pending-intent-binding-record/7', 'gmc.scene-pending-intent-binding-record/8'].includes(String(record.schemaVersion))) {
    return qualifiedSceneTurnIdentitySources(input.bundle, input.proposal);
  }
  if (deps.readArtifact && !deps.assertWorkflowOpen) throw new Error('Injected Scene identity ownership requires an explicit workflow guard.');
  if (Array.isArray(record.qualifiedObservers) && record.qualifiedObservers.length === 0) {
    return qualifiedSceneTurnIdentitySources(input.bundle, input.proposal);
  }
  if (!object(record.window) || typeof record.window.programId !== 'string') return fail();
  const scope = { userId: input.userId, campaignId: input.campaignId, programId: record.window.programId };
  const loaded = await (deps.readArtifact ?? readActiveCompoundActionArtifact)(scope);
  if (!loaded?.artifact) return fail();
  await (deps.assertWorkflowOpen ?? assertFreeformProgramWorkflowOpen)(scope, loaded.artifact.freeformBinding);
  return qualifiedSceneTurnIdentitySources(input.bundle, input.proposal, loaded.artifact as unknown as JsonObject);
}
