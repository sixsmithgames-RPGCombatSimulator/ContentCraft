import { freeformJsonDigest, canonicalFreeformJson } from './freeformPlanBinding.js';
import { createPendingIntentWindow, type PendingIntentWindowSource } from './pendingIntentWindow.js';
import { pendingIntentBindingSlots, scenePendingIntentBindingIssues, scenePendingIntentExaminationIssues,
  type ScenePendingBindingContext } from './scenePendingIntentBindings.js';

type Row = Record<string, any>;
export const PENDING_BINDING_RECORD_VERSION = 'gmc.scene-pending-intent-binding-record/1';
export const INTENT_BINDING_RECEIPT_VERSION = 'gma.action-intent-binding-receipt/1';
export const INTENT_BINDING_APPLICATION_LIMITS = Object.freeze({ count: 8, bytes: 131_072 });
export const pendingScenePolicyFingerprint = (depth: string) => freeformJsonDigest({ builder: 'gma.scene-reality-builder-policy/4',
  examiner: 'gma.scene-readiness-examiner-policy/3', depth, binding: 'gma.scene-pending-intent-binding-policy/2' });
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const requireMatch = (condition: unknown) => { if (!condition) throw new Error('Pending intent application does not match its owner evidence.'); };

/** Called only after the Scene owner validates the complete dossier and heads. */
export function createPendingBindingRecord(context: ScenePendingBindingContext, bindings: Row, assessment: Row, policyFingerprint: string): Row {
  requireMatch(!scenePendingIntentBindingIssues(bindings, context).length
    && !scenePendingIntentExaminationIssues(assessment, bindings, context, policyFingerprint).length && assessment.verdict === 'adequate');
  const body = { schemaVersion: PENDING_BINDING_RECORD_VERSION, operationId: context.operationId,
    window: createPendingIntentWindow(context.source), bindings: structuredClone(bindings),
    sourceCursor: structuredClone(context.source.cursor), sourceReceipts: structuredClone(context.source.receipts),
    ownerReadSet: structuredClone(context.ownerReadSet), observations: structuredClone(context.observations),
    dossierFingerprint: assessment.dossierFingerprint, assessmentRef: assessment.assessmentId,
    assessmentFingerprint: freeformJsonDigest(assessment), policyFingerprint };
  const recordFingerprint = freeformJsonDigest(body);
  return { ...body, recordId: `pending-binding:${recordFingerprint}`, recordFingerprint };
}

export function assertPendingBindingRecord(record: Row, source: PendingIntentWindowSource): void {
  const { recordId, recordFingerprint, ...body } = record ?? {};
  requireMatch(record?.schemaVersion === PENDING_BINDING_RECORD_VERSION && recordFingerprint === freeformJsonDigest(body)
    && recordId === `pending-binding:${recordFingerprint}` && same(record.window, createPendingIntentWindow(source))
    && same(record.sourceCursor, source.cursor) && same(record.sourceReceipts, source.receipts));
}

export function createIntentBindingReceipt(record: Row, bundle: Row, rebase: Row): Row {
  requireMatch(rebase?.schemaVersion === 'gma.action-program-rebase-receipt/2'
    && rebase.programRef === record.window.programId && rebase.priorCursorRevision === record.window.cursorRevision
    && same(record.bindings.sceneKitRef, { sceneKitId: bundle.sceneKitRef.sceneKitId, revision: bundle.sceneKitRef.revision }));
  const body = { schemaVersion: INTENT_BINDING_RECEIPT_VERSION, programRef: record.window.programId,
    instructionFingerprint: record.window.instructionFingerprint, programFingerprint: record.window.programFingerprint,
    bindingRecordRef: { recordId: record.recordId, fingerprint: record.recordFingerprint }, windowFingerprint: record.window.windowFingerprint,
    bundleRef: { bundleId: bundle.bundleId, revision: bundle.revision },
    priorCursorRevision: rebase.priorCursorRevision, resultingCursorRevision: rebase.resultingCursorRevision,
    authorityHead: structuredClone(rebase.authorityHead), rebaseReceiptRef: rebase.receiptId };
  return { ...body, receiptId: `intent-binding:${freeformJsonDigest(body)}` };
}

/** Immutable owner-accepted overlays only. Never rewrite the stored program,
 * action kinds, dependencies, conditions, evidence or completed receipts. */
export function projectAppliedIntentBindings(instruction: Row, program: Row, applications: Row[] = []): Row {
  requireMatch(Array.isArray(applications) && applications.length <= INTENT_BINDING_APPLICATION_LIMITS.count
    && Buffer.byteLength(JSON.stringify(applications), 'utf8') <= INTENT_BINDING_APPLICATION_LIMITS.bytes);
  const projected = structuredClone(program);
  let lastAppliedRevision = 0;
  for (const { record, receipt } of applications) {
    const source = { instruction, program, cursor: record.sourceCursor, receipts: record.sourceReceipts, artifactRevision: record.window.artifactRevision };
    assertPendingBindingRecord(record, source);
    const { receiptId, ...body } = receipt ?? {};
    requireMatch(receipt.schemaVersion === INTENT_BINDING_RECEIPT_VERSION && receiptId === `intent-binding:${freeformJsonDigest(body)}`
      && receipt.programRef === program.programId && receipt.programFingerprint === freeformJsonDigest(program)
      && receipt.instructionFingerprint === instruction.instructionFingerprint
      && receipt.bindingRecordRef.recordId === record.recordId && receipt.bindingRecordRef.fingerprint === record.recordFingerprint
      && receipt.windowFingerprint === record.window.windowFingerprint
      && receipt.priorCursorRevision === record.window.cursorRevision && receipt.resultingCursorRevision === receipt.priorCursorRevision + 1
      && receipt.priorCursorRevision >= lastAppliedRevision);
    lastAppliedRevision = receipt.resultingCursorRevision;
    const slots = pendingIntentBindingSlots(source);
    const applied = new Set<string>();
    for (const row of record.bindings.nodes) {
      requireMatch(row.disposition === 'bound' && !applied.has(row.nodeRef));
      applied.add(row.nodeRef);
      const slot = slots.find((s) => s.nodeRef === row.nodeRef)!;
      const node = projected.nodes.find((n: Row) => n.nodeId === row.nodeRef);
      const original = record.window.nodes.find((n: Row) => n.nodeRef === row.nodeRef);
      requireMatch(node && slot && original);
      const selected = new Map(row.references.map((r: Row) => [r.slotId, r.selectedRef]));
      const sourceNode = program.nodes.find((n: Row) => n.nodeId === row.nodeRef);
      const locations = (sourceNode.semanticLocationBindings?.bindings ?? []).map((value: Row, index: number) => ({
        value: node.semanticLocationBindings.bindings[index], fingerprint: freeformJsonDigest(value) }));
      for (const reference of slot.references) {
        const ref = selected.get(reference.slotId);
        requireMatch(typeof ref === 'string' && (reference.originalRef === null || reference.originalRef === ref));
        if (reference.field) node[reference.field] = ref;
        else if (reference.groupId) {
          const group = node.observationGroups.find((g: Row) => g.groupId === reference.groupId);
          group[`${reference.role}Ref`] = ref; group.bindingStatus = 'exact';
        } else if (reference.locationFingerprint) {
          const matches = locations.filter((l: Row) => l.fingerprint === reference.locationFingerprint);
          requireMatch(matches[reference.occurrence]); matches[reference.occurrence].value.authorityRef = ref;
        } else {
          const index = original.requirements.findIndex((r: Row) => r.requirementId === reference.requirementId);
          requireMatch(index >= 0);
          const requirement = node.dataRequirements[index];
          if (reference.outcomeId) requirement.observation[reference.role === 'relation_origin' ? 'relationOriginRef' : 'targetRef'] = ref;
          else requirement.targetRef = ref;
        }
      }
      for (const coverage of row.coverage) {
        const entry = slot.coverage.find((s: Row) => s.slotId === coverage.slotId);
        requireMatch(entry);
        if (entry.requirementId) {
          const index = original.requirements.findIndex((r: Row) => r.requirementId === entry.requirementId);
          node.dataRequirements[index].coverageEntryRef = coverage.coverageEntryRef;
        } else node.coverageEntryRef = coverage.coverageEntryRef;
      }
    }
  }
  return projected;
}

/** An accepted association is the only bridge between the preserved typed
 * source version and prepared world version. Neither is relabeled as the other. */
export function appliedObservationBinding(head: Row, applications: Row[], gmc: Row, entry: Row): Row | null {
  const matches = applications.filter((application) => application.record.bindings.nodes.some((row: Row) => row.nodeRef === entry.nodeId));
  if (!matches.length) return null;
  const { record, receipt } = matches.at(-1)!;
  requireMatch(record.bindings.sceneKitRef.sceneKitId === gmc.sceneKitRef.sceneKitId
    && record.bindings.sceneKitRef.revision === head.sceneRevision
    && receipt.authorityHead.sceneRevision === head.sceneRevision
    && record.ownerReadSet.storyWorkspaceRevision === gmc.workspaceRef.revision
    && record.ownerReadSet.sceneRevision === gmc.sceneKitRef.revision);
  const row = record.bindings.nodes.find((r: Row) => r.nodeRef === entry.nodeId);
  const selection = row.observations.find((o: Row) => o.groupId === entry.group.groupId);
  requireMatch(selection);
  const evidence = record.observations.find((o: Row) => o.evidenceRef === selection.ownerEvidenceRef);
  requireMatch(evidence && evidence.observerRef === entry.actorCandidate.actorRef
    && evidence.methodRef === entry.group.methodRef && evidence.groupId === entry.group.groupId
    && (gmc.observationAccess ?? []).some((access: Row) => access.accessId === evidence.accessRef));
  return structuredClone(evidence);
}

export function observationSettlementAuthorityHead(head: Row, applications: Row[], gmc: Row, groups: Row[]): Row {
  const qualified = groups.map((entry) => appliedObservationBinding(head, applications, gmc, entry));
  if (qualified.some(Boolean)) {
    requireMatch(qualified.every(Boolean));
    return { ...structuredClone(head), storyWorkspaceRevision: gmc.workspaceRef.revision };
  }
  return { ...structuredClone(head), storyWorkspaceRevision: gmc.workspaceRef.revision, sceneRevision: gmc.sceneKitRef.revision };
}
