import { freeformJsonDigest } from './freeformPlanBinding.js';
import { assertPendingBindingRecord, projectAppliedIntentBindings } from './scenePendingIntentApplication.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(object) : [];
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
function invalid(field = 'lineage'): never { throw Object.assign(new Error('The original settled movement does not prove this viewpoint.'), {
  code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID', details: { field } }); }

/** Receipt/binding references only: this is not a second actor-state store. */
export interface ConfirmedRelocationLineage {
  schemaVersion: 'gmc.confirmed-relocation-lineage/1'; lineageRef: string;
  campaignId: string; programRef: string; moveNodeRef: string; observationNodeRef: string; groupId: string;
  movementReceiptRef: string; movementReceiptFingerprint: string;
  bindingRecordRef: string; bindingRecordFingerprint: string;
  observerRef: string; actorLinkRef: string; destinationRef: string; destinationZoneRef: string;
  sourceHead: { workspaceRevision: number; sceneKitId: string; sceneRevision: number; payloadFingerprint: string };
}

/** Derive only from an authenticated, validated owner artifact. All original
 * binding integrity checks run again; no caller/model success flag is consumed. */
export function deriveConfirmedRelocationLineage(scope: { campaignId: string; programId: string; moveNodeRef: string;
  observationNodeRef: string; groupId: string; observerRef: string; actorLinkRef: string }, artifact: Row,
  sourceHead: ConfirmedRelocationLineage['sourceHead']): ConfirmedRelocationLineage {
  if (Object.keys(sourceHead).sort().join(',') !== 'payloadFingerprint,sceneKitId,sceneRevision,workspaceRevision'
    || !id(sourceHead.sceneKitId) || !/^[a-f0-9]{64}$/.test(sourceHead.payloadFingerprint)
    || !Number.isSafeInteger(sourceHead.workspaceRevision) || sourceHead.workspaceRevision < 0
    || !Number.isSafeInteger(sourceHead.sceneRevision) || sourceHead.sceneRevision < 1) invalid('source_head');
  const raw = artifact.program, instruction = artifact.instruction, cursor = artifact.cursor;
  if (!object(raw) || !object(instruction) || !object(cursor) || raw.programId !== scope.programId
    || !object(raw.authorityBase) || raw.authorityBase.campaignId !== scope.campaignId
    || !Array.isArray(cursor.completedNodeRefs) || !cursor.completedNodeRefs.includes(scope.moveNodeRef)
    || !Array.isArray(cursor.skippedNodeRefs) || cursor.skippedNodeRefs.includes(scope.moveNodeRef)
    || !Array.isArray(artifact.intentBindingApplications) || !Array.isArray(artifact.receipts)) invalid('source_artifact');
  const applications = rows(artifact.intentBindingApplications);
  const effective: Row = projectAppliedIntentBindings(instruction, raw, applications);
  const move = rows(effective.nodes).find((node) => node.nodeId === scope.moveNodeRef);
  const observed = rows(effective.nodes).find((node) => node.nodeId === scope.observationNodeRef);
  const group = rows(observed?.observationGroups).find((row) => row.groupId === scope.groupId);
  if (move?.kind !== 'move' || group?.viewpointBinding !== `after:${scope.moveNodeRef}`) invalid('original_prerequisite');
  const application = [...applications].reverse().find((row) => object(row.record)
    && object(row.record.bindings) && rows(row.record.bindings.nodes).some((node) => node.nodeRef === scope.moveNodeRef));
  const record = application?.record;
  if (!object(record) || !['gmc.scene-pending-intent-binding-record/2', 'gmc.scene-pending-intent-binding-record/3', 'gmc.scene-pending-intent-binding-record/4', 'gmc.scene-pending-intent-binding-record/5', 'gmc.scene-pending-intent-binding-record/6', 'gmc.scene-pending-intent-binding-record/7', 'gmc.scene-pending-intent-binding-record/8', 'gmc.scene-pending-intent-binding-record/9'].includes(String(record.schemaVersion))
    || !object(record.window) || !object(record.sourceCursor)) invalid('original_binding');
  assertPendingBindingRecord(record, { instruction, program: raw, cursor: record.sourceCursor,
    artifactRevision: Number(record.window.artifactRevision), receipts: rows(record.sourceReceipts) });
  const evidence = rows(record.qualifiedObservers).find((row) => row.nodeRef === scope.observationNodeRef && row.groupId === scope.groupId
    && row.observerRef === scope.observerRef && row.actorLinkRef === scope.actorLinkRef);
  const condition = evidence?.viewpointCondition, origin = evidence?.origin;
  const selection = object(record.bindings) ? rows(rows(record.bindings.nodes).find((row) => row.nodeRef === scope.observationNodeRef)?.observations)
    .find((row) => row.ownerEvidenceRef === evidence?.evidenceRef) : undefined;
  if (!evidence || !object(condition) || condition.kind !== 'after_relocation' || condition.nodeRef !== scope.moveNodeRef
    || !id(selection?.viewpointZoneRef)) invalid('original_qualification');
  const actorAliases = [scope.observerRef, ...(object(origin) && origin.kind === 'owner_actor_frame' && Array.isArray(origin.sourceRefs) ? origin.sourceRefs : [])];
  const actors = [move.actorRef, ...rows(move.dataRequirements).filter((row) => row.targetRole === 'actor').map((row) => row.targetRef)].filter((value) => value != null);
  if (!actors.length || actors.some((ref) => !actorAliases.includes(ref))) invalid('original_mover');
  const locations = object(move.semanticLocationBindings) ? rows(move.semanticLocationBindings.bindings).filter((row) => row.role === 'destination') : [];
  if (locations.length !== 1 || !id(locations[0].authorityRef)) invalid('original_destination');
  const receipts = rows(artifact.receipts);
  const matches = receipts.filter((row) => row.programId === scope.programId && row.nodeId === scope.moveNodeRef);
  if (matches.length !== 1 || matches[0].schemaVersion !== 'gma.action-execution-receipt/2'
    || matches[0].lifecycle !== 'settled' || matches[0].result !== 'succeeded' || !id(matches[0].receiptId)) invalid('settled_movement');
  const receipt = matches[0], receiptIndex = receipts.indexOf(receipt);
  for (const later of receipts.slice(receiptIndex + 1)) {
    if (later.result !== 'succeeded') continue;
    const node = rows(effective.nodes).find((row) => row.nodeId === later.nodeId);
    if (node?.kind !== 'move') continue;
    const laterActors = [node.actorRef, ...rows(node.dataRequirements).filter((row) => row.targetRole === 'actor').map((row) => row.targetRef)].filter((value) => value != null);
    if (!laterActors.length || laterActors.some((ref) => actorAliases.includes(ref))) invalid('later_movement');
  }
  const body = { schemaVersion: 'gmc.confirmed-relocation-lineage/1' as const,
    campaignId: scope.campaignId, programRef: scope.programId, moveNodeRef: scope.moveNodeRef,
    observationNodeRef: scope.observationNodeRef, groupId: scope.groupId,
    movementReceiptRef: String(receipt.receiptId), movementReceiptFingerprint: freeformJsonDigest(receipt),
    bindingRecordRef: String(record.recordId), bindingRecordFingerprint: String(record.recordFingerprint),
    observerRef: scope.observerRef, actorLinkRef: scope.actorLinkRef, destinationRef: locations[0].authorityRef,
    destinationZoneRef: selection.viewpointZoneRef, sourceHead: structuredClone(sourceHead) };
  return { ...body, lineageRef: `relocation-lineage:${freeformJsonDigest(body).slice(0, 40)}` };
}

/** Exact comparison rejects added fields as well as altered receipt provenance. */
export function confirmedRelocationLineageIssues(value: ConfirmedRelocationLineage, artifact: Row): string[] {
  try {
    return freeformJsonDigest(value) === freeformJsonDigest(deriveConfirmedRelocationLineage({ campaignId: value.campaignId,
      programId: value.programRef, moveNodeRef: value.moveNodeRef, observationNodeRef: value.observationNodeRef,
      groupId: value.groupId, observerRef: value.observerRef, actorLinkRef: value.actorLinkRef }, artifact, value.sourceHead)) ? [] : ['/relocationLineage'];
  } catch { return ['/relocationLineage']; }
}

/** The model can verify the supplied receipt/window correspondence without a
 * second dossier copy. The owner later checks the referenced examined binding. */
export function relocationLineageContextIssues(value: ConfirmedRelocationLineage, source: { program: Row; cursor: Row; receipts: Row[] }): string[] {
  try {
    const { lineageRef, ...body } = value;
    const keys = ['schemaVersion', 'campaignId', 'programRef', 'moveNodeRef', 'observationNodeRef', 'groupId', 'movementReceiptRef',
      'movementReceiptFingerprint', 'bindingRecordRef', 'bindingRecordFingerprint', 'observerRef', 'actorLinkRef', 'destinationRef', 'destinationZoneRef', 'sourceHead'];
    const receipt = source.receipts.find((row) => row.receiptId === body.movementReceiptRef);
    if (Object.keys(body).length !== keys.length || keys.some((key) => !Object.hasOwn(body, key))
      || body.schemaVersion !== 'gmc.confirmed-relocation-lineage/1' || lineageRef !== `relocation-lineage:${freeformJsonDigest(body).slice(0, 40)}`
      || body.programRef !== source.program.programId || !object(source.program.authorityBase)
      || body.campaignId !== source.program.authorityBase.campaignId || !receipt
      || receipt.programId !== body.programRef || receipt.nodeId !== body.moveNodeRef
      || receipt.schemaVersion !== 'gma.action-execution-receipt/2' || receipt.lifecycle !== 'settled' || receipt.result !== 'succeeded'
      || body.movementReceiptFingerprint !== freeformJsonDigest(receipt)
      || !Array.isArray(source.cursor.completedNodeRefs) || !source.cursor.completedNodeRefs.includes(body.moveNodeRef)
      || !rows(source.program.nodes).some((node) => node.nodeId === body.moveNodeRef && node.kind === 'move')
      || ![body.bindingRecordRef, body.observerRef, body.actorLinkRef, body.destinationRef, body.destinationZoneRef].every(id)
      || !/^[a-f0-9]{64}$/.test(body.bindingRecordFingerprint)) invalid();
    return [];
  } catch { return ['/relocationLineage']; }
}
