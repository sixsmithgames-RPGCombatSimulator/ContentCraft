import { canonicalFreeformJson, freeformJsonDigest, freeformTextDigest } from './freeformPlanBinding.js';

/** ADR 014 foundation: application metadata only. Not an LLM-output validator,
 * permission check, binding receipt, or authority to execute/modify a program.
 * Callers must supply the authenticated owner's already-validated artifact. */
export const PENDING_INTENT_WINDOW_VERSION = 'gma.pending-intent-window/1';
export const PENDING_INTENT_WINDOW_LIMITS = Object.freeze({ nodes: 8, requirements: 32, bytes: 24_576 });
type Row = Record<string, any>;
export interface PendingIntentWindowSource {
  instruction: Row;
  program: Row;
  cursor: Row;
  artifactRevision: number;
  receipts: Row[];
}

export class PendingIntentWindowError extends Error {
  readonly code = 'GMA_PENDING_INTENT_WINDOW_INVALID';
  constructor(readonly field: string) {
    super('The pending intent window does not match a complete saved action artifact.');
    this.name = 'PendingIntentWindowError';
  }
}

const check = (condition: unknown, field: string): void => { if (!condition) throw new PendingIntentWindowError(field); };
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const digest = (value: unknown) => freeformJsonDigest(value);

function sourceNodes(source: PendingIntentWindowSource): Row[] {
  const { instruction, program, cursor, artifactRevision } = source;
  check(instruction && program && cursor, 'source');
  check(['gma.semantic-action-program/4', 'gma.semantic-action-program/5'].includes(program.schemaVersion), 'program.schemaVersion');
  check(isId(program.programId) && cursor.programId === program.programId, 'programId');
  check(isId(instruction.instructionRef) && instruction.instructionRef === program.instructionRef, 'instructionRef');
  check(typeof instruction.exactText === 'string' && instruction.exactText.length > 0
    && Buffer.byteLength(instruction.exactText, 'utf8') <= 32_768, 'instruction.exactText');
  check(instruction.instructionFingerprint === freeformTextDigest(instruction.exactText)
    && program.instructionFingerprint === instruction.instructionFingerprint, 'instructionFingerprint');
  check(Number.isSafeInteger(artifactRevision) && artifactRevision >= 1 && cursor.revision === artifactRevision, 'artifactRevision');
  check(cursor.authorityHead && ['storyWorkspaceRevision', 'sceneRevision', 'vcsCharacterRevision']
    .every((field) => Number.isSafeInteger(cursor.authorityHead[field]) && cursor.authorityHead[field] >= 0), 'cursor.authorityHead');
  check(isId(program.authorityBase?.campaignId), 'campaignId');
  check(Array.isArray(program.nodes) && program.nodes.length > 0 && program.nodes.length <= PENDING_INTENT_WINDOW_LIMITS.nodes, 'program.nodes');
  const nodes = program.nodes as Row[];
  const nodeRefs = new Set(nodes.map((node) => node.nodeId));
  check(nodeRefs.size === nodes.length && nodes.every((node) => isId(node.nodeId)), 'program.nodes.nodeId');
  let requirements = 0;
  for (const node of nodes) {
    check(Array.isArray(node.dependsOn) && node.dependsOn.every((ref: unknown) => nodeRefs.has(ref) && ref !== node.nodeId)
      && new Set(node.dependsOn).size === node.dependsOn.length, 'program.nodes.dependsOn');
    check(Array.isArray(node.dataRequirements), 'program.nodes.dataRequirements');
    requirements += node.dataRequirements.length;
  }
  check(requirements <= PENDING_INTENT_WINDOW_LIMITS.requirements, 'program.requirements');
  const visiting = new Set<string>(), visited = new Set<string>();
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const visit = (ref: string): void => {
    check(!visiting.has(ref), 'program.nodes.dependsOn.cycle');
    if (visited.has(ref)) return;
    visiting.add(ref);
    for (const parent of byId.get(ref)!.dependsOn) visit(parent);
    visiting.delete(ref); visited.add(ref);
  };
  for (const ref of nodeRefs) visit(ref);
  const owned = new Set<string>();
  for (const field of ['completedNodeRefs', 'skippedNodeRefs', 'readyNodeRefs', 'remainingNodeRefs']) {
    check(Array.isArray(cursor[field]), `cursor.${field}`);
    for (const ref of cursor[field]) {
      check(nodeRefs.has(ref) && !owned.has(ref), `cursor.${field}`);
      owned.add(ref);
    }
  }
  if (cursor.waiting?.nodeRef && !owned.has(cursor.waiting.nodeRef)) {
    check(nodeRefs.has(cursor.waiting.nodeRef), 'cursor.waiting.nodeRef');
    owned.add(cursor.waiting.nodeRef);
  }
  check(owned.size === nodeRefs.size, 'cursor.nodePartition');
  check(Array.isArray(source.receipts) && source.receipts.every((receipt) => receipt.programId === program.programId
    && isId(receipt.receiptId) && cursor.completedNodeRefs.includes(receipt.nodeId)), 'receipts');
  check(new Set(source.receipts.map((receipt) => receipt.receiptId)).size === source.receipts.length, 'receipts.duplicate');
  return nodes;
}

function executionWindow(nodes: Row[], cursor: Row): { nodeRefs: string[]; stopReason: string } {
  const settled = new Set([...cursor.completedNodeRefs, ...cursor.skippedNodeRefs]);
  const pending = nodes.filter((node) => !settled.has(node.nodeId));
  const remaining = new Set(pending.map((node) => node.nodeId));
  const selected: string[] = [];
  let stopReason = 'program_end';
  while (remaining.size) {
    const ready = pending.filter((node) => remaining.has(node.nodeId)
      && node.dependsOn.every((ref: string) => !remaining.has(ref) || selected.includes(ref)));
    check(ready.length > 0, 'executionWindow.dependencies');
    for (const node of ready) {
      selected.push(node.nodeId); remaining.delete(node.nodeId);
      const boundary = String(node.suspensionBoundary ?? node.completionBoundary ?? node.resultBoundary ?? '');
      if (/player_choice|choice_required/i.test(boundary)) stopReason = 'player_choice';
      else if (/roll|mechanic/i.test(boundary) || node.requiresMechanics === true) stopReason = 'unresolved_mechanic';
      else if (/semantic_stop|scene_commitment/i.test(boundary)) stopReason = 'semantic_stop';
      if (stopReason !== 'program_end') return { nodeRefs: selected, stopReason };
    }
  }
  check(selected.length > 0, 'executionWindow.empty');
  return { nodeRefs: selected, stopReason };
}

export function createPendingIntentWindow(source: PendingIntentWindowSource): Row {
  const nodes = sourceNodes(source);
  const { instruction, program, cursor } = source;
  const selected = executionWindow(nodes, cursor);
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  const prerequisiteNodeRefs = new Set<string>();
  const scan = (ref: string): void => {
    if (prerequisiteNodeRefs.has(ref)) return;
    prerequisiteNodeRefs.add(ref);
    for (const parent of nodeMap.get(ref)!.dependsOn) scan(parent);
  };
  for (const ref of selected.nodeRefs) scan(ref);
  for (const ref of prerequisiteNodeRefs) {
    if (cursor.completedNodeRefs.includes(ref)) check(source.receipts.some((receipt) => receipt.nodeId === ref), 'prerequisiteReceipts.missing');
  }
  const projections = selected.nodeRefs.map((nodeRef) => {
    const original = nodeMap.get(nodeRef)!;
    check(Array.isArray(original.evidenceSpans) && original.evidenceSpans.length > 0, 'node.evidenceSpans');
    const instructionEvidence = original.evidenceSpans.map((span: Row) => {
      check(Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end)
        && span.start >= 0 && span.end > span.start && span.end <= instruction.exactText.length, 'node.evidenceSpans');
      return { start: span.start, end: span.end, quote: instruction.exactText.slice(span.start, span.end) };
    });
    const { dataRequirements, ...node } = structuredClone(original);
    const occurrences = new Map<string, number>();
    const requirements = dataRequirements.map((value: Row) => {
      const requirementFingerprint = digest(value);
      const occurrence = occurrences.get(requirementFingerprint) ?? 0;
      occurrences.set(requirementFingerprint, occurrence + 1);
      const requirementId = `requirement:${digest({ nodeRef, requirementFingerprint, occurrence }).slice(0, 32)}`;
      return { requirementId, requirementFingerprint, value };
    });
    return { nodeRef, nodeFingerprint: digest(original), node, instructionEvidence, requirements };
  });
  const body = {
    schemaVersion: PENDING_INTENT_WINDOW_VERSION,
    campaignId: program.authorityBase.campaignId,
    programId: program.programId,
    instructionRef: instruction.instructionRef,
    instructionFingerprint: instruction.instructionFingerprint,
    programFingerprint: digest(program),
    cursorFingerprint: digest(cursor),
    artifactRevision: source.artifactRevision,
    cursorRevision: cursor.revision,
    authorityHead: structuredClone(cursor.authorityHead),
    completedNodeRefs: [...cursor.completedNodeRefs],
    skippedNodeRefs: [...cursor.skippedNodeRefs],
    remainingNodeRefs: nodes.filter((node) => !cursor.completedNodeRefs.includes(node.nodeId)
      && !cursor.skippedNodeRefs.includes(node.nodeId)).map((node) => node.nodeId),
    executionWindow: selected,
    nodes: projections,
    prerequisiteReceipts: source.receipts.filter((receipt) => prerequisiteNodeRefs.has(receipt.nodeId)).map((receipt) => ({
      nodeRef: receipt.nodeId, receiptRef: receipt.receiptId, receiptFingerprint: digest(receipt),
      ownerReceiptRefs: [...(receipt.authorityReceipts ?? [])],
    })),
  };
  const windowFingerprint = digest(body);
  const result = { ...body, windowId: `pending-intent:${windowFingerprint}`, windowFingerprint };
  check(Buffer.byteLength(JSON.stringify(result), 'utf8') <= PENDING_INTENT_WINDOW_LIMITS.bytes, 'window.bytes');
  return result;
}

/** Compare with trusted owner input, not with caller-supplied fingerprints.
 * Recompute the complete projection so omitted/added rows and stale evidence
 * fail even if a caller recalculates every checksum. No owner write occurs. */
export function pendingIntentWindowIssues(value: unknown, source: PendingIntentWindowSource): string[] {
  try {
    return canonicalFreeformJson(value) === canonicalFreeformJson(createPendingIntentWindow(source)) ? [] : ['/pendingIntentWindow'];
  } catch (error) {
    if (error instanceof PendingIntentWindowError) return [`/source/${error.field}`];
    return ['/source'];
  }
}
