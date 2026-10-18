import { freeformJsonDigest, canonicalFreeformJson } from './freeformPlanBinding.js';
import { createPendingIntentWindow, type PendingIntentWindowSource } from './pendingIntentWindow.js';
import { pendingIntentBindingSlotsFromWindow,
  QUALIFIED_BINDING_VERSION, QUALIFIED_BINDING_POLICY_VERSION, QUALIFIED_EXAMINER_POLICY_VERSION,
  CONTINUATION_BINDING_VERSION, CONTINUATION_BINDING_POLICY_VERSION, CONTINUATION_EXAMINER_POLICY_VERSION,
  type ScenePendingBindingContext } from './scenePendingIntentQualified.js';
import { scenePendingIntentBindingIssues, scenePendingIntentExaminationIssues,
  READ_EFFECT_BINDINGS_VERSION, READ_EFFECT_BINDING_POLICY_VERSION, READ_EFFECT_EXAMINER_POLICY_VERSION } from './sceneReadEffectBindings.js';
import { pendingRequirementRoleIssues, projectClassifiedPendingNode, pendingRoleApplicationIssues } from './pendingRequirementRoles.js';
import { READ_EFFECT_CONTRACTS, readEffectProgramIssues } from './readEffectContracts.js';
import { pendingObserverEvidenceIssues, type PendingObserverEvidence } from './pendingObserverEvidence.js';
import { instructionCoverageContextIssues, type InstructionWindowCoverage } from './instructionWindowCoverage.js';
import { relocationLineageContextIssues, type ConfirmedRelocationLineage } from './confirmedRelocationLineage.js';
import { TYPED_REFERENCE_AUTHORITY_BUNDLE as TYPED, isTypedReferenceProgram } from './typedReferenceBindings.js';
import { pendingReferenceQualificationIssues } from './pendingReferenceQualification.js';
import { historicalTypedPendingBinding, typedEffectSlotId } from './typedPendingReferenceProjection.js';

type Row = Record<string, any>;
export const PENDING_BINDING_RECORD_VERSION = 'gmc.scene-pending-intent-binding-record/1';
export const INTENT_BINDING_RECEIPT_VERSION = 'gma.action-intent-binding-receipt/1';
export const QUALIFIED_PENDING_BINDING_RECORD_VERSION = 'gmc.scene-pending-intent-binding-record/2';
export const QUALIFIED_INTENT_BINDING_RECEIPT_VERSION = 'gma.action-intent-binding-receipt/2';
export const CONTINUATION_PENDING_BINDING_RECORD_VERSION = 'gmc.scene-pending-intent-binding-record/3';
export const CONTINUATION_INTENT_BINDING_RECEIPT_VERSION = 'gma.action-intent-binding-receipt/3';
export const READ_EFFECT_PENDING_BINDING_RECORD_VERSION = 'gmc.scene-pending-intent-binding-record/4';
export const READ_EFFECT_INTENT_BINDING_RECEIPT_VERSION = 'gma.action-intent-binding-receipt/4';
const readEffectRecord = (record: Row) => [READ_EFFECT_PENDING_BINDING_RECORD_VERSION, TYPED.pendingRecord].includes(record?.schemaVersion);
const bindingReceiptVersion = (record: Row) => record.schemaVersion === TYPED.pendingRecord ? TYPED.pendingReceipt : readEffectRecord(record)
  ? READ_EFFECT_INTENT_BINDING_RECEIPT_VERSION : record.schemaVersion === CONTINUATION_PENDING_BINDING_RECORD_VERSION ? CONTINUATION_INTENT_BINDING_RECEIPT_VERSION
    : record.schemaVersion === QUALIFIED_PENDING_BINDING_RECORD_VERSION ? QUALIFIED_INTENT_BINDING_RECEIPT_VERSION : INTENT_BINDING_RECEIPT_VERSION;
export const INTENT_BINDING_APPLICATION_LIMITS = Object.freeze({ count: 8, bytes: 131_072 });
/** Historical fingerprints are stable; qualified packets have a distinct policy identity. */
export const pendingScenePolicyFingerprint = (depth: string, qualified: boolean | 'continuation' | 'read_effects' = false, preparationPolicyVersion: 9 | 10 | 11 | 12 | 13 = 9) => freeformJsonDigest({
  builder: qualified === 'read_effects' ? `gma.scene-reality-builder-policy/${preparationPolicyVersion}` : qualified === 'continuation' ? 'gma.scene-reality-builder-policy/7' : qualified ? 'gma.scene-reality-builder-policy/6' : 'gma.scene-reality-builder-policy/4',
  examiner: qualified === 'read_effects' ? `gma.scene-readiness-examiner-policy/${preparationPolicyVersion}` : qualified === 'continuation' ? 'gma.scene-readiness-examiner-policy/7' : qualified ? 'gma.scene-readiness-examiner-policy/6' : 'gma.scene-readiness-examiner-policy/3', depth,
  binding: preparationPolicyVersion === 13 ? 'gma.scene-pending-intent-binding-policy/8' : qualified === 'read_effects' ? READ_EFFECT_BINDING_POLICY_VERSION : qualified === 'continuation' ? CONTINUATION_BINDING_POLICY_VERSION : qualified ? QUALIFIED_BINDING_POLICY_VERSION : 'gma.scene-pending-intent-binding-policy/2',
  ...(qualified ? { qualificationExaminer: preparationPolicyVersion === 13 ? 'gma.scene-pending-intent-examiner-policy/8' : qualified === 'read_effects' ? READ_EFFECT_EXAMINER_POLICY_VERSION : qualified === 'continuation' ? CONTINUATION_EXAMINER_POLICY_VERSION : QUALIFIED_EXAMINER_POLICY_VERSION } : {}) });
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const requireMatch = (condition: unknown) => { if (!condition) throw new Error('Pending intent application does not match its owner evidence.'); };

/** Called only after the Scene owner validates the complete dossier and heads. */
export function createPendingBindingRecord(context: ScenePendingBindingContext & { qualifiedObservers?: PendingObserverEvidence[];
  instructionCoverage?: InstructionWindowCoverage; confirmedRelocations?: ConfirmedRelocationLineage[] }, bindings: Row, assessment: Row, policyFingerprint: string): Row {
  requireMatch(!scenePendingIntentBindingIssues(bindings, context).length
    && !scenePendingIntentExaminationIssues(assessment, bindings, context, policyFingerprint).length && assessment.verdict === 'adequate');
  const typed = bindings.schemaVersion === TYPED.pendingBindings;
  const readEffects = typed || bindings.schemaVersion === READ_EFFECT_BINDINGS_VERSION;
  const continuation = readEffects || bindings.schemaVersion === CONTINUATION_BINDING_VERSION;
  const qualified = continuation || bindings.schemaVersion === QUALIFIED_BINDING_VERSION;
  const body = { schemaVersion: typed ? TYPED.pendingRecord : readEffects ? READ_EFFECT_PENDING_BINDING_RECORD_VERSION : continuation ? CONTINUATION_PENDING_BINDING_RECORD_VERSION : qualified ? QUALIFIED_PENDING_BINDING_RECORD_VERSION : PENDING_BINDING_RECORD_VERSION, operationId: context.operationId,
    ...(typed ? { referenceQualification: structuredClone(context.pendingReferenceQualification) } : {}),
    window: createPendingIntentWindow(context.source), bindings: structuredClone(bindings),
    sourceCursor: structuredClone(context.source.cursor), sourceReceipts: structuredClone(context.source.receipts),
    ownerReadSet: structuredClone(context.ownerReadSet), observations: structuredClone(context.observations),
    dossierFingerprint: assessment.dossierFingerprint, assessmentRef: assessment.assessmentId,
    assessmentFingerprint: freeformJsonDigest(assessment), policyFingerprint,
    ...(qualified ? { qualifiedObservers: structuredClone(context.qualifiedObservers) } : {}), ...(continuation ? {
      instructionCoverage: structuredClone(context.instructionCoverage), confirmedRelocations: structuredClone(context.confirmedRelocations) } : {}) };
  const recordFingerprint = freeformJsonDigest(body);
  return { ...body, recordId: `pending-binding:${recordFingerprint}`, recordFingerprint };
}

export function assertPendingBindingRecord(record: Row, source: PendingIntentWindowSource): void {
  const { recordId, recordFingerprint, ...body } = record ?? {};
  const typed = record?.schemaVersion === TYPED.pendingRecord;
  const readEffects = readEffectRecord(record);
  const continuation = readEffects || record?.schemaVersion === CONTINUATION_PENDING_BINDING_RECORD_VERSION;
  const qualified = continuation || record?.schemaVersion === QUALIFIED_PENDING_BINDING_RECORD_VERSION;
  requireMatch((qualified || record?.schemaVersion === PENDING_BINDING_RECORD_VERSION) && recordFingerprint === freeformJsonDigest(body)
    && recordId === `pending-binding:${recordFingerprint}` && same(record.window, createPendingIntentWindow(source))
    && same(record.sourceCursor, source.cursor) && same(record.sourceReceipts, source.receipts));
  requireMatch(record.bindings?.schemaVersion === (typed ? TYPED.pendingBindings : readEffects ? READ_EFFECT_BINDINGS_VERSION : continuation ? CONTINUATION_BINDING_VERSION : qualified ? QUALIFIED_BINDING_VERSION : 'gma.scene-pending-intent-bindings/1'));
  if (typed) requireMatch(!pendingReferenceQualificationIssues(record.referenceQualification, source).length
    && record.referenceQualification.fingerprint === record.bindings.referenceQualificationFingerprint);
  else requireMatch(!Object.hasOwn(record, 'referenceQualification'));
  if (readEffects) requireMatch(!pendingRequirementRoleIssues(record.bindings.requirementRoles, source).length);
  if (continuation) requireMatch(!instructionCoverageContextIssues(record.instructionCoverage, source.instruction, source.program).length
    && Array.isArray(record.confirmedRelocations) && record.confirmedRelocations.length <= 32
    && record.confirmedRelocations.every((row: ConfirmedRelocationLineage) => !relocationLineageContextIssues(row, source).length));
  else requireMatch(!Object.hasOwn(record, 'instructionCoverage') && !Object.hasOwn(record, 'confirmedRelocations'));
  if (qualified) {
    requireMatch(Array.isArray(record.qualifiedObservers) && record.qualifiedObservers.length <= 32);
    const seen = new Set<string>();
    for (const evidence of record.qualifiedObservers as PendingObserverEvidence[]) {
      requireMatch(!pendingObserverEvidenceIssues(evidence).length && evidence.schemaVersion === (continuation ? 'gmc.pending-observer-evidence/2' : 'gmc.pending-observer-evidence/1') && !seen.has(evidence.evidenceRef)
        && evidence.campaignId === record.window.campaignId && evidence.programRef === record.window.programId
        && evidence.windowFingerprint === record.window.windowFingerprint
        && evidence.instructionFingerprint === record.window.instructionFingerprint
        && evidence.sourceHead.workspaceRevision === record.ownerReadSet.storyWorkspaceRevision
        && evidence.sourceHead.sceneRevision === record.ownerReadSet.sceneRevision);
      seen.add(evidence.evidenceRef);
    }
    for (const node of record.bindings.nodes) for (const selection of node.observations) {
      const evidence = record.qualifiedObservers.find((row: PendingObserverEvidence) => row.evidenceRef === selection.ownerEvidenceRef);
      const current = record.observations.find((row: Row) => row.evidenceRef === selection.ownerEvidenceRef);
      requireMatch(evidence ? evidence.nodeRef === node.nodeRef && evidence.groupId === selection.groupId
        && same(evidence.viewpointCondition, selection.viewpointCondition)
        : current?.groupId === selection.groupId && same(selection.viewpointCondition, { kind: 'current_access', accessRef: current.accessRef }));
    }
  } else requireMatch(!Object.hasOwn(record, 'qualifiedObservers'));
}

export function createIntentBindingReceipt(record: Row, bundle: Row, rebase: Row): Row {
  requireMatch(rebase?.schemaVersion === 'gma.action-program-rebase-receipt/2'
    && rebase.programRef === record.window.programId && rebase.priorCursorRevision === record.window.cursorRevision
    && same(record.bindings.sceneKitRef, { sceneKitId: bundle.sceneKitRef.sceneKitId, revision: bundle.sceneKitRef.revision }));
  const body = { schemaVersion: bindingReceiptVersion(record), programRef: record.window.programId,
    instructionFingerprint: record.window.instructionFingerprint, programFingerprint: record.window.programFingerprint,
    bindingRecordRef: { recordId: record.recordId, fingerprint: record.recordFingerprint }, windowFingerprint: record.window.windowFingerprint,
    bundleRef: { bundleId: bundle.bundleId, revision: bundle.revision },
    priorCursorRevision: rebase.priorCursorRevision, resultingCursorRevision: rebase.resultingCursorRevision,
    authorityHead: structuredClone(rebase.authorityHead), rebaseReceiptRef: rebase.receiptId,
    ...(record.schemaVersion === TYPED.pendingRecord ? { referenceQualificationApplication: { qualificationRef: record.referenceQualification.qualificationRef,
      fingerprint: record.referenceQualification.fingerprint } } : {}),
    ...(readEffectRecord(record) ? { requirementRoleApplication: {
      schemaVersion: READ_EFFECT_CONTRACTS.application, classificationFingerprint: freeformJsonDigest(record.bindings.requirementRoles),
      assessmentFingerprint: record.assessmentFingerprint, recordFingerprint: record.recordFingerprint,
    } } : {}) };
  return { ...body, receiptId: `intent-binding:${freeformJsonDigest(body)}` };
}

/** One projection algorithm for application and subsequent exact-node witnesses. */
function recordProjection(record: Row): { bindings: Row; slots: Row[] } {
  if (record.schemaVersion !== TYPED.pendingRecord) return { bindings: record.bindings, slots: pendingIntentBindingSlotsFromWindow(record.window) };
  // Restore the exact immutable source from its accepted window plus completed
  // source nodes is unnecessary here: full source validation happens above.
  // Slot qualification itself is checked against that source in record assert.
  const slots = pendingIntentBindingSlotsFromWindow(record.window).map((node: Row) => ({ ...node, typedReferences: true,
    references: node.references.map((slot: Row) => record.referenceQualification.fields.some((field: Row) => field.nodeRef === node.nodeRef && field.slotId === slot.slotId)
      ? { ...slot, originalRef: null } : slot),
    coverage: node.coverage.flatMap((slot: Row) => {
      const effect = record.referenceQualification.effects.find((effect: Row) => effect.nodeRef === node.nodeRef && effect.effectId === slot.effectId);
      return effect?.targets.length ? effect.targets.map((target: Row) => ({ ...slot, ...target,
        slotId: typedEffectSlotId(node.nodeRef, effect.effectId, target.targetSlotId, target.role) })) : [slot];
    }),
  }));
  return { bindings: historicalTypedPendingBinding(record.bindings, slots), slots };
}

function projectPendingNode(sourceNode: Row, row: Row, slot: Row, original: Row): Row {
  const node = structuredClone(sourceNode);
  if (slot.typedReferences) node.requestedEffects = (node.requestedEffects ?? []).map(({ targets: _targets, ...effect }: Row) => effect);
  const selected = new Map(row.references.map((r: Row) => [r.slotId, r.selectedRef]));
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
    } else if (!entry.targetSlotId || entry.role === 'destination' || node.coverageEntryRef === undefined) node.coverageEntryRef = coverage.coverageEntryRef;
  }
  return node;
}

/** Exact coverage witness from an authenticated owner-accepted binding record.
 * An actor is the performer, not necessarily the world object of an action.
 * This verifies identity/integrity only; it creates no semantic or effect authority. */
export function acceptedPendingNodeCoverage(record: Row | null | undefined, node: Row, sceneKitRef: Row): string[] | null {
  if (!record) return null;
  try {
    const { recordId, recordFingerprint, ...body } = record;
    requireMatch([PENDING_BINDING_RECORD_VERSION, QUALIFIED_PENDING_BINDING_RECORD_VERSION, CONTINUATION_PENDING_BINDING_RECORD_VERSION, READ_EFFECT_PENDING_BINDING_RECORD_VERSION, TYPED.pendingRecord].includes(record.schemaVersion)
      && recordFingerprint === freeformJsonDigest(body) && recordId === `pending-binding:${recordFingerprint}`
      && same(record.bindings.sceneKitRef, { sceneKitId: sceneKitRef.sceneKitId, revision: sceneKitRef.revision }));
    const original = record.window.nodes.find((row: Row) => row.nodeRef === node.nodeId);
    const projection = recordProjection(record);
    const binding = projection.bindings.nodes.find((row: Row) => row.nodeRef === node.nodeId);
    const slot = projection.slots.find((row: Row) => row.nodeRef === node.nodeId);
    requireMatch(original && binding?.disposition === 'bound' && slot);
    const sourceNode = { ...structuredClone(original.node), dataRequirements: original.requirements.map((row: Row) => structuredClone(row.value)) };
    let projected = projectPendingNode(sourceNode, binding, slot!, original);
    if (readEffectRecord(record)) projected = projectClassifiedPendingNode(original, projected,
      record.bindings.requirementRoles.nodes.find((row: Row) => row.nodeRef === node.nodeId));
    requireMatch(original.nodeFingerprint === freeformJsonDigest(sourceNode) && same(projected, node));
    return [...new Set<string>(binding.coverage.map((row: Row) => row.coverageEntryRef))];
  } catch { return null; }
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
    requireMatch(receipt.schemaVersion === bindingReceiptVersion(record) && receiptId === `intent-binding:${freeformJsonDigest(body)}`
      && receipt.programRef === program.programId && receipt.programFingerprint === freeformJsonDigest(program)
      && receipt.instructionFingerprint === instruction.instructionFingerprint
      && receipt.bindingRecordRef.recordId === record.recordId && receipt.bindingRecordRef.fingerprint === record.recordFingerprint
      && receipt.windowFingerprint === record.window.windowFingerprint
      && receipt.priorCursorRevision === record.window.cursorRevision && receipt.resultingCursorRevision === receipt.priorCursorRevision + 1
      && receipt.priorCursorRevision >= lastAppliedRevision);
    lastAppliedRevision = receipt.resultingCursorRevision;
    if (readEffectRecord(record)) requireMatch(!pendingRoleApplicationIssues(record, receipt).length);
    if (record.schemaVersion === TYPED.pendingRecord) requireMatch(same(receipt.referenceQualificationApplication,
      { qualificationRef: record.referenceQualification.qualificationRef, fingerprint: record.referenceQualification.fingerprint }));
    const projection = recordProjection(record), slots = projection.slots;
    const applied = new Set<string>();
    for (const row of projection.bindings.nodes) {
      requireMatch(row.disposition === 'bound' && !applied.has(row.nodeRef));
      applied.add(row.nodeRef);
      const slot = slots.find((s) => s.nodeRef === row.nodeRef)!;
      const node = projected.nodes.find((n: Row) => n.nodeId === row.nodeRef);
      const original = record.window.nodes.find((n: Row) => n.nodeRef === row.nodeRef);
      requireMatch(node && slot && original);
      const sourceNode = program.nodes.find((n: Row) => n.nodeId === row.nodeRef);
      let bound = projectPendingNode(sourceNode, row, slot, original);
      if (readEffectRecord(record)) bound = projectClassifiedPendingNode(original, bound,
        record.bindings.requirementRoles.nodes.find((entry: Row) => entry.nodeRef === row.nodeRef));
      Object.assign(node, bound);
    }
  }
  if (applications.some(({ record }) => readEffectRecord(record))) {
    projected.schemaVersion = READ_EFFECT_CONTRACTS.program;
    projected.planner = { source: 'freeform_intent_compiler', policyVersion: READ_EFFECT_CONTRACTS.compiler };
    for (const node of projected.nodes) node.requestedEffects ??= [];
    if (isTypedReferenceProgram(program)) for (const node of projected.nodes) node.requestedEffects = node.requestedEffects.map(({ targets: _targets, ...effect }: Row) => effect);
    requireMatch(!readEffectProgramIssues(projected, instruction).length);
  }
  return projected;
}

/** An accepted association is the only bridge between the preserved typed
 * source version and prepared world version. Neither is relabeled as the other. */
export function appliedObservationBinding(head: Row, applications: Row[], gmc: Row, entry: Row): Row | null {
  const matches = applications.filter((application) => application.record.bindings.nodes.some((row: Row) => row.nodeRef === entry.nodeId));
  if (!matches.length) return null;
  const { record, receipt } = matches.at(-1)!;
  if ([QUALIFIED_PENDING_BINDING_RECORD_VERSION, CONTINUATION_PENDING_BINDING_RECORD_VERSION, READ_EFFECT_PENDING_BINDING_RECORD_VERSION, TYPED.pendingRecord].includes(record.schemaVersion)) {
    requireMatch(gmc.schemaVersion === ([CONTINUATION_PENDING_BINDING_RECORD_VERSION, READ_EFFECT_PENDING_BINDING_RECORD_VERSION, TYPED.pendingRecord].includes(record.schemaVersion) ? 'gmc.observation-authority-projection/3' : 'gmc.observation-authority-projection/2')
      && record.bindings.sceneKitRef.sceneKitId === gmc.sceneKitRef.sceneKitId
      && record.bindings.sceneKitRef.revision === head.sceneRevision && gmc.sceneKitRef.revision === head.sceneRevision
      && receipt.authorityHead.sceneRevision === head.sceneRevision
      && record.ownerReadSet.storyWorkspaceRevision === gmc.workspaceRef.revision);
    const selected = record.bindings.nodes.find((row: Row) => row.nodeRef === entry.nodeId)?.observations.find((row: Row) => row.groupId === entry.group.groupId);
    const evidence = record.qualifiedObservers.find((row: PendingObserverEvidence) => row.evidenceRef === selected?.ownerEvidenceRef);
    const activation = gmc.activations?.find((row: Row) => row.bindingRecordRef === record.recordId && row.evidenceRef === evidence?.evidenceRef
      && row.nodeRef === entry.nodeId && row.groupId === entry.group.groupId && row.disposition === 'committed');
    requireMatch(evidence && activation && evidence.observerRef === entry.actorCandidate.actorRef
      && evidence.methodRef === entry.group.methodRef && evidence.formRef === entry.group.formRef
      && ['after_relocation', 'confirmed_relocation'].includes(evidence.viewpointCondition.kind) && selected.viewpointZoneRef === activation.viewpointRef
      && (gmc.observationAccess ?? []).some((access: Row) => access.accessId === activation.accessRef && access.candidateViewpointRef === activation.viewpointRef));
    return { ...structuredClone(evidence), accessRef: activation.accessRef, zoneRef: activation.viewpointRef,
      activationReceiptRef: activation.receiptRef, movementReceiptRef: activation.movementReceiptRef };
  }
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
