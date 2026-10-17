import { freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => Array.isArray(value) && value.every(object) ? value : [];
const same = (left: unknown, right: unknown): boolean => freeformJsonDigest(left) === freeformJsonDigest(right);
function invalid(): never { throw new Error('The saved parallel presentation cannot be matched to its current owner actions.'); }

/** One pure projection for the scheduler, Story presentation and outcome owner.
 * It selects only currently eligible original members and grants no effects. */
export function parallelPresentationNodeRefs(program: unknown, cursor: unknown, nodeRef: string, includeWaiting = true): string[] {
  if (!object(program) || !object(cursor)) invalid();
  const nodes = rows(program.nodes), byId = new Map(nodes.map((node) => [node.nodeId, node]));
  if (!byId.has(nodeRef)) invalid();
  if (!['gma.semantic-action-program/5', 'gma.semantic-action-program/6'].includes(String(program.schemaVersion))) return [nodeRef];
  if (!Array.isArray(cursor.readyNodeRefs)) invalid();
  const eligible = new Set(cursor.readyNodeRefs);
  if (includeWaiting && object(cursor.waiting) && cursor.waiting.nodeRef) eligible.add(cursor.waiting.nodeRef);
  if (!eligible.has(nodeRef)) return [nodeRef];
  const selected = new Set<string>(), pending = [nodeRef];
  while (pending.length) {
    const current = pending.shift()!;
    if (selected.has(current) || !eligible.has(current)) continue;
    selected.add(current);
    const relations = byId.get(current)?.parallelWith;
    if (relations != null && !Array.isArray(relations)) invalid();
    for (const ref of Array.isArray(relations) ? relations : []) {
      if (typeof ref !== 'string' || !byId.has(ref)) invalid();
      if (eligible.has(ref) && !selected.has(ref)) pending.push(ref);
    }
  }
  return nodes.map((node) => String(node.nodeId)).filter((ref) => selected.has(ref));
}

/** Presentation identity is distinct from each member's execution identity. */
export function parallelPresentationId(nodeRefs: string[]): string {
  if (!nodeRefs.length || new Set(nodeRefs).size !== nodeRefs.length) invalid();
  return nodeRefs.length === 1 ? nodeRefs[0] : `cohort:${freeformJsonDigest(nodeRefs).slice(0, 24)}`;
}

/** A cohort-looking turn ID is insufficient: bind the actual owner-held checked
 * candidate, unchanged member order, Scene and prose to the one movement result.
 * Singleton historical source checks remain with the existing owner writer. */
export function sceneMovementCohortSourceIssues(artifact: Row, source: Row, nodeRef: string, proposal: unknown): string[] {
  try {
    const program = artifact.program, cursor = artifact.cursor, instruction = artifact.instruction;
    if (!object(program) || !object(cursor) || !object(instruction)) return ['/owners'];
    const refs = parallelPresentationNodeRefs(program, cursor, nodeRef);
    if (refs.length < 2 || refs.length > 8) return ['/members'];
    const moves = rows(program.nodes).filter((node) => refs.includes(String(node.nodeId)) && node.kind === 'move');
    if (moves.length !== 1 || moves[0].nodeId !== nodeRef) return ['/movement'];
    const saga = artifact.saga, pending = object(saga) ? saga.pendingModelCandidate : null;
    const candidate = object(pending) ? pending.candidate : null;
    if (!object(saga) || !object(pending) || pending.schemaVersion !== 'gma.accepted-model-candidate/2'
      || pending.kind !== 'story_narration' || !object(candidate)
      || candidate.schemaVersion !== 'gma.compound-story-settlement-candidate/1'
      || pending.candidateFingerprint !== freeformJsonDigest(candidate)
      || !Array.isArray(saga.acceptedModelCandidateRefs) || !saga.acceptedModelCandidateRefs.includes(pending.candidateFingerprint)) return ['/candidate'];
    const slice = candidate.slice, compiled = candidate.compiled, scene = candidate.sceneKitRef;
    const sourceScene = source.sceneKitRef, exchange = source.publishedExchange;
    if (!object(slice) || !object(compiled) || !object(scene) || !object(sourceScene) || !object(exchange)) return ['/association/shape'];
    const slicePrefix = `slice:${program.programId}:`;
    const originText = typeof slice.sliceId === 'string' && slice.sliceId.startsWith(slicePrefix) ? slice.sliceId.slice(slicePrefix.length) : '';
    const originRevision = /^[1-9]\d*$/.test(originText) ? Number(originText) : NaN;
    const checks = {
      compiledVersion: ['gma.current-scene-narration-compiled/13', 'gma.current-scene-narration-compiled/14'].includes(String(compiled.schemaVersion)), pendingMechanic: compiled.rollRequest == null,
      program: candidate.programId === program.programId && slice.programId === program.programId,
      members: same(slice.nodeRefs, refs) && same(candidate.nodeRefs, refs),
      instruction: candidate.instructionFingerprint === instruction.instructionFingerprint, interaction: candidate.interactionId === source.interactionId,
      // One checked-candidate checkpoint advances the protected cursor without
      // changing the original presentation identity. Never substitute a newer
      // cursor ID or accept an arbitrary earlier revision.
      checkpoint: Number.isSafeInteger(originRevision) && cursor.revision === originRevision + 1
        && saga.cursorRevision === cursor.revision && saga.currentWaitingReason === 'story_presentation_settlement'
        && same(slice.expectedAuthority, cursor.authorityHead),
      presentation: source.interactionId === `${instruction.interactionId}:compound:${parallelPresentationId(refs)}:${originRevision}`,
      playerAction: candidate.playerActionFingerprint === source.playerActionFingerprint,
      scene: scene.sceneKitId === sourceScene.sceneKitId && scene.revision === sourceScene.revision,
      narration: typeof compiled.responseText === 'string' && compiled.responseText === exchange.assistantNarration,
      narrationFingerprint: typeof compiled.responseText === 'string' && source.narrationFingerprint === freeformTextDigest(compiled.responseText.trim().slice(0, 16_000)),
      movement: same(compiled.movementOutcome, proposal),
    };
    return Object.entries(checks).filter(([, valid]) => !valid).map(([field]) => `/association/${field}`);
  } catch { return ['/context']; }
}
