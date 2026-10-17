import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import type { SceneMovementOutcomeDocument } from './sceneMovementOutcomeStore.js';
import type { ActiveSceneStateDocument, SceneTurnReceiptDocument } from './activeSceneStateStore.js';
import type { ConfirmedRelocationLineage } from '../../shared/llm/confirmedRelocationLineage.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';

/** Owner-only readers; never a caller assertion about current position. */
export interface RelocationPositionReaders {
  states: Pick<Collection<ActiveSceneStateDocument>, 'findOne'>;
  receipts: Pick<Collection<SceneTurnReceiptDocument>, 'find'>;
  outcomes?: Pick<Collection<SceneMovementOutcomeDocument>, 'findOne'>;
}
/** The qualified Scene reader must not resurrect a position superseded outside
 * its action program. Historical receipts are correlated by their exact
 * application-issued interaction identity, never actor names or narration. */
export async function assertRelocationPositionContinuity(
  scope: { userId: string; campaignId: string }, artifact: JsonObject,
  lineage: Pick<ConfirmedRelocationLineage, 'sourceHead' | 'moveNodeRef' | 'bindingRecordRef' | 'observerRef'>
    & Partial<Pick<ConfirmedRelocationLineage, 'destinationRef' | 'destinationZoneRef' | 'observationNodeRef' | 'groupId'>> & { requireMovementOutcome?: boolean },
  stores: RelocationPositionReaders = { states: getDb().collection('gmc_active_scene_states'), receipts: getDb().collection('gmc_scene_turn_receipts') },
): Promise<void> {
  const invalid = (): never => { throw new StoryWorkspaceStoreError(409, 'CONFIRMED_RELOCATION_LINEAGE_INVALID',
    'The original movement no longer proves the current observer position.', { field: 'position_continuity' }); };
  const instruction = artifact.instruction as JsonObject | undefined;
  if (!instruction || typeof instruction.interactionId !== 'string') invalid();
  const sceneScope = { userId: scope.userId, campaignId: scope.campaignId, sceneKitId: lineage.sourceHead.sceneKitId };
  const program = artifact.program as JsonObject | undefined;
  const execution = (artifact.receipts as JsonObject[] | undefined)?.find((row) => row.nodeId === lineage.moveNodeRef && row.programId === program?.programId);
  const ownerRefs = (execution?.authorityReceipts as JsonObject[] | undefined)?.filter((row) => row.authority === 'gmc' && row.operation === 'scene-movement-outcome') ?? [];
  const requiresOutcome = lineage.requireMovementOutcome || ownerRefs.length > 0;
  let saved: SceneMovementOutcomeDocument | null = null;
  let sourceReceiptRef: string | null = null;
  if (requiresOutcome) {
    if (lineage.requireMovementOutcome && (!lineage.destinationRef || !lineage.destinationZoneRef
      || !lineage.observationNodeRef || !lineage.groupId)) invalid();
    if (!program || !execution || execution.schemaVersion !== 'gma.action-execution-receipt/2' || execution.lifecycle !== 'settled'
      || execution.result !== 'succeeded' || ownerRefs.length !== 1 || typeof ownerRefs[0].receiptRef !== 'string') invalid();
    const outcomes = stores.outcomes ?? getDb().collection<SceneMovementOutcomeDocument>('gmc_scene_movement_outcomes');
    saved = await outcomes.findOne({ userId: scope.userId, campaignId: scope.campaignId, programId: String(program!.programId), _id: String(ownerRefs[0].receiptRef) });
    const reference = saved?.receipt.sourceSceneTurnReceiptRef;
    sourceReceiptRef = typeof reference === 'string' ? reference : invalid();
  }
  // A settled typed outcome already names its exact original Scene turn,
  // including a shared presentation. Do not reconstruct that authority from
  // a singleton interaction-ID pattern. Historical untyped reads stay exact.
  const prefix = `${instruction!.interactionId}:compound:${lineage.moveNodeRef}:`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = await stores.receipts.find({ ...sceneScope, ...(requiresOutcome
    ? { receiptRef: sourceReceiptRef! }
    : { interactionId: { $regex: `^${prefix}[0-9]+$` } }) }).limit(2).toArray();
  if (matches.length !== 1) invalid();
  const movement = matches[0];
  if (requiresOutcome) {
    const outcome = saved?.receipt, expectation = outcome?.expectation as JsonObject | undefined;
    if (!outcome || outcome.schemaVersion !== 'gmc.scene-movement-outcome-receipt/1' || outcome.disposition !== 'committed'
      || outcome.programRef !== program!.programId || outcome.campaignId !== scope.campaignId || outcome.nodeRef !== lineage.moveNodeRef
      || outcome.result !== 'reached' || outcome.executionResult !== 'succeeded' || outcome.receiptRef !== ownerRefs[0].receiptRef
      || outcome.sourceSceneTurnReceiptRef !== movement.receiptRef || outcome.sourceSceneTurnFingerprint !== freeformJsonDigest(movement)
      || expectation?.bindingRecordRef !== lineage.bindingRecordRef || expectation.moverRef !== lineage.observerRef
      || lineage.destinationRef && expectation.destinationRef !== lineage.destinationRef
      || lineage.destinationZoneRef && expectation.destinationZoneRef !== lineage.destinationZoneRef) invalid();
    const original = (artifact.intentBindingApplications as JsonObject[]).map((entry) => entry.record as JsonObject)
      .find((entry) => entry.recordId === lineage.bindingRecordRef);
    const qualifications = (original?.qualifiedObservers as JsonObject[] | undefined)?.filter((row) => row.observerRef === lineage.observerRef
      && (!lineage.observationNodeRef || row.nodeRef === lineage.observationNodeRef) && (!lineage.groupId || row.groupId === lineage.groupId)
      && (row.viewpointCondition as JsonObject)?.nodeRef === lineage.moveNodeRef) ?? [];
    const selections = ((original?.bindings as JsonObject)?.nodes as JsonObject[] | undefined)?.flatMap((node) => node.observations as JsonObject[]) ?? [];
    if (!original || expectation!.bindingRecordFingerprint !== original.recordFingerprint
      || !selections.some((selection) => selection.viewpointZoneRef === expectation!.destinationZoneRef
        && qualifications.some((qualification) => qualification.evidenceRef === selection.ownerEvidenceRef))) invalid();
  }
  const applications = artifact.intentBindingApplications as JsonObject[] | undefined;
  const record = applications?.map((entry) => entry.record as JsonObject).find((entry) => entry.recordId === lineage.bindingRecordRef);
  const bindingKit = (record?.bindings as JsonObject | undefined)?.sceneKitRef as JsonObject | undefined;
  if (!bindingKit || movement.phase !== 'completed' || movement.sceneKitRef.sceneKitId !== bindingKit.sceneKitId
    || movement.sceneKitRef.revision !== bindingKit.revision || movement.stateRevisionAfter !== movement.stateRevisionBefore + 1) invalid();
  const state = await stores.states.findOne(sceneScope);
  if (!state || state.revision < movement.stateRevisionAfter) invalid();
  const later = await stores.receipts.find({ ...sceneScope,
    stateRevisionAfter: { $gt: movement.stateRevisionAfter, $lte: state!.revision } }).sort({ stateRevisionAfter: 1 }).limit(65).toArray();
  if (later.length > 64 || later.length !== state!.revision - movement.stateRevisionAfter) invalid();
  let revision = movement.stateRevisionAfter, latest = movement.receiptRef;
  for (const turn of later) {
    if (turn.stateRevisionBefore !== revision || turn.stateRevisionAfter !== revision + 1
      || !Array.isArray(turn.readinessChangedDimensions)
      || turn.readinessChangedDimensions.some((dimension) => ['zone', 'presence', 'access'].includes(dimension))) invalid();
    revision = turn.stateRevisionAfter; latest = turn.receiptRef;
  }
  // Actor activity is free prose, so a later changed observer cannot be treated
  // as proof that its physical position stayed the same.
  if (state!.latestReceiptRef !== latest || state!.actorStates.some((actor) => actor.actorRef === lineage.observerRef
    && Number(actor.sourceSequence) > movement.timelineSequence && actor.sourceTurnRef !== movement.receiptRef)) invalid();
  const reread = await stores.states.findOne(sceneScope);
  if (!reread || reread.revision !== state!.revision || reread.latestReceiptRef !== latest) invalid();
}
