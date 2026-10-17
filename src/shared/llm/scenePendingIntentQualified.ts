import { createHash } from 'node:crypto';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { pendingObserverEvidenceIssues, type PendingObserverEvidence, type ObserverViewpointCondition } from './pendingObserverEvidence.js';
import { deriveQualifiedSensoryProjection } from './qualifiedObservation.js';
import { instructionCoverageContextIssues, type InstructionWindowCoverage } from './instructionWindowCoverage.js';
import { relocationLineageContextIssues, type ConfirmedRelocationLineage } from './confirmedRelocationLineage.js';
import { scenePendingBindingContextFromOwner as legacyContext, scenePendingIntentBindingIssues as legacyIssues,
  scenePendingIntentExaminationIdentity as legacyIdentity, scenePendingIntentExaminationIssues as legacyExamination,
  mergeScenePendingIntentBindingRepair as legacyRepair, pendingIntentBindingSlots, SCENE_PENDING_INTENT_BINDINGS_SCHEMA,
  type ScenePendingBindingContext } from './scenePendingIntentBindings.js';
export * from './scenePendingIntentBindings.js';

export const QUALIFIED_BINDING_VERSION = 'gma.scene-pending-intent-bindings/2';
export const CONTINUATION_BINDING_VERSION = 'gma.scene-pending-intent-bindings/3';
export const CONTINUATION_BINDING_POLICY_VERSION = 'gma.scene-pending-intent-binding-policy/5';
export const CONTINUATION_EXAMINER_POLICY_VERSION = 'gma.scene-pending-intent-examiner-policy/5';
export const QUALIFIED_BINDING_POLICY_VERSION = 'gma.scene-pending-intent-binding-policy/4';
export const QUALIFIED_EXAMINER_POLICY_VERSION = 'gma.scene-pending-intent-examiner-policy/4';
export const QUALIFIED_BINDING_POLICY = [
  'Use gma.scene-reality-builder-result/3 and gma.scene-pending-intent-bindings/2 for this qualified pending context. Preserve all original pending-window, slot, evidence, full-Scene and actor/parallel-action rules. The outer wrapper and binding top-level fields stay exactly as supplied by the schema.',
  'The outer wrapper has exactly schemaVersion, operationId, campaignId, requestedDepth, status, proposal, checkpoint, intentWindowFingerprint and pendingIntentBindings. A complete result has one full proposal, checkpoint null and the full bindings; a continuation has proposal null, one versioned checkpoint and bindings null. At most two construction chunks. Copy the exact operation, campaign, depth, window fingerprint and proposed Scene ref; never add another payload or invent an identity.',
  'Return exactly one binding node row for every pending nodeRef, with nodeRef, disposition, references, coverage, observations, instructionEvidence, rationale and question. Never include a completed or skipped node, omit a parallel action, change its meaning or resolve its mechanics. For a bound row, select every reference slot and coverage slot exactly once using the application-supplied slotId, and every observation group once. References are {slotId,selectedRef}; coverage is {slotId,coverageEntryRef}. Copy every non-null original ref/coverage choice unchanged. Select only exact dossier or supplied owner refs, not similar names, nearest candidates or list positions.',
  'Every coverage selection must match the original action family (other uses interact), selected subject/recipient/object and destination/area. A selected actor or actor-frame alias must close through its exact actor record. Bind the move actor to the qualified sensory observer, never its stationary controller. Observation identity/origin requirements select the same original observation affordance for their exact group, not an invented second search. Keep every original outcome and distinct observer/method tuple.',
  'instructionEvidence is one unchanged supplied UTF-8 byte span with its exact quote, start and end. A clarification row has empty references, coverage and observations, a concrete consequential question, and preserved original evidence. A bound row has question null. Keep bindings within 24576 UTF-8 bytes, eight pending nodes, 64 reference slots and 32 coverage slots per node. Missing owner evidence cannot be repaired by dropping an action or pretending a condition succeeded.',
  'Each bound observation selection is exactly {groupId, ownerEvidenceRef, viewpointZoneRef, viewpointCondition}. Select one supplied currently-active observation seed or qualifiedObservers record for that exact group. Copy its complete viewpointCondition exactly. A current seed uses {kind:"current_access",accessRef:<its exact accessRef>}. Do not fabricate an evidence ref, movement receipt, completion flag, form, capability or method.',
  'Qualification confirms only an existing identity, form and sensing capability. It does not move the observer, restore concealment, resolve a roll or reveal a fact. Keep each qualified observer actor frame at its original owner-established origin.zoneRef. For a human_gm origin, stage the actor consistently with the exact GM description and cite its origin.sourceRefs in the actor frame. Do not put it at the future destination before movement. Preserve the stationary character separately.',
  'An after_relocation viewpoint is an explicitly unexecuted condition on the exact original move node and destinationTargetId/destinationRef. viewpointZoneRef is the prepared destination zone selected by that move binding, or the zone of its selected destination element. It must differ from the observer starting zone. The observer frame stays at its start; future access belongs to the selected affordance and supplemental condition only.',
  'For conditional observation affordances, accessClass is the exact conditionalViewpointRef supplied in pendingIntentContext.qualifiedViewpoints for that ownerEvidenceRef, and capabilityClass is the exact qualified capabilityRef. Select those supplied symbols; never compute hashes or ask the player to invent an internal reference. For current access use the original accepted accessRef and original current zone. Copy the owner method and existing form refs into their exact slots; a requested different form or method requires clarification, not activation, ordinary entrance sight or silently changing the request.',
  'Keep Scene /5 actorMechanicsBindings, observationAccess, observables and obstructions empty. The app will activate actual access only after the required movement receipt. Prepare reusable world facts and possibilities, not a successful player action. The observation affordance factRefs must contain only facts obtainable by the requested sensory method from its qualified viewpoint. Exclude concealed identities, exhaustive hidden-contents negatives and unsupported senses even when those private facts remain prepared elsewhere in the dossier.',
  'Separate execution and discovery: no non-observation affordance may include a factRef from an after_relocation sensory affordance. Prepare distinct already-available route or action facts for movement and concealment; future interior surfaces, occupants and discoveries belong only to the conditional observation. Arrival does not authorize remote sensory publication. Do not evade this rule with duplicate sensory facts under different IDs: the independent examiner checks actual meaning and starting-view availability.',
  'For each qualified observation outcome, its selected affordance must reference exactly one sensory fact with the exact selected targetRef and original typed facet. Use explicit nonempty modalityRestrictions matching the confirmed senses and observerRestrictions empty or containing the exact observer. A positive fact has the original valueKind and negativeScope null. For ordinary-precision description, classification, relation or statement only, value may be a nonblank string of at most 800 characters that itself states the concrete sensory result. Permission to look or a private explanation is not an answer. Other values require the explicit gmc.scene-sensory-answer/1 envelope below; never derive numeric, identity, set, higher-precision or negative answers from untyped private prose.',
  'An explicit sensory fact value has exactly {schemaVersion:"gmc.scene-sensory-answer/1",resultKind,value,playerFacingStatement,supportedPrecision,modality}. resultKind is observed, bounded_negative or blocked. playerFacingStatement is a finished concrete sensory sentence of at most 800 characters, faithfully stating the typed value without revealing unsupported private information. modality is visual, auditory, olfactory, tactile or magical and must match both the fact restrictions and confirmed senses. supportedPrecision is bounded, ordinary, approximate or exact and must meet the existing order bounded < ordinary/approximate < exact. Ordinary prose satisfies bounded or ordinary requests, never exact. For observed, value has the requested kind and negativeScope is null. For bounded_negative, outer fact.valueKind is bounded_negative, inner value has the requested kind, and fact.negativeScope is a nonblank bounded observed scope quoted unchanged in playerFacingStatement; state what is absent within that scope, never an exhaustive absence beyond it. For blocked, outer fact.valueKind is the requested kind, value and supportedPrecision and negativeScope are null, and playerFacingStatement names the specific sensory obstruction, not a failed movement or a resolved roll.',
  'Explicit typed values have exactly these kind-specific keys: description/classification/relation/statement {kind,text}, identity_ref {kind,ref}, boolean/count {kind,value}, set {kind,values}, measurement {kind,value,unit}, measurement_range {kind,minimum,maximum,unit}. Text is nonblank and at most 800 characters; refs are exact supplied identities of at most 240 characters, count is a nonnegative safe integer, measurement bounds are finite and ordered, unit is nonblank at most 40 characters, set has one to 16 unique nonblank strings of at most 240 characters. A measurement_or_relation request uses a concrete measurement, measurement_range or relation kind in both the positive fact.valueKind and inner value.kind; use one of those concrete fact kinds for a blocked answer too. Identity facts require visibility revealed or public_surface. Do not include other private facts in the sensory affordance just because they are in the same Scene. Unsupported evidence requires clarification_required, not invented precision or information.',
  'Return clarification_required for a node whose identity, original form/method, GM starting position or future destination cannot be matched faithfully. Keep every unresolved action and its original evidence. Do not reinterpret missing owner evidence as permission to invent it. One repair may change only the failed binding rows or permitted world records; all unaffected material remains exact.',
].join(' ');
export const QUALIFIED_EXAMINER_POLICY = [
  'Return gma.scene-readiness-assessment/3 with the full supplied identity, qualifiedObserverFingerprint and qualificationReview. Independently examine the complete Scene, original pending window, proposed bindings and owner qualification; do not trust fluent binding rationale or model-authored authority claims.',
  'qualificationReview has exactly verdict, originState, viewpointState, rationale and evidenceRefs. verdict is supported or unsupported. originState is preserved or unsupported. viewpointState is unexecuted_conditions_preserved or unsupported. For qualificationReview.evidenceRefs select one to 32 unique exact refs from the application-supplied qualificationReviewEvidenceRefs catalog. It contains only supplied qualification, origin, capability/form/mobility, conditional-viewpoint and dossier record/affordance refs; no invented ref is permitted. A citation does not grant execution or disclosure authority. Adequate requires supported, preserved and unexecuted_conditions_preserved, every pending row supported, and no blocking debt.',
  'Check the actual observer starting actor frame against each owner zone or exact human GM origin ruling. Its current frame must not already occupy the future move destination. Check the original requested form and method semantically against the supplied existing owner form/capability; an owl cannot silently satisfy an already-rat request. Check stationary character, parallel concealment and the single coupled remote observation separately.',
  'Check the exact unfinished relocation dependency, selected destination zone and conditional access/capability tuple for every observation. No qualification, affordance or prepared fact is a movement, concealment or observation-success receipt. Entrance sight cannot substitute for remote familiar sight. Prepared sensory fact scope must exclude unsupported private identity, hidden contents and exhaustive absence claims. Unsupported qualification or conditional binding requires blocking pending_intent or capabilities debt; diagnose, do not repair it yourself.',
  'Independently check execution versus discovery across every selected affordance: non-observation factRefs must not overlap after_relocation sensory facts or disclose the same future answer through duplicate fact IDs. Movement and concealment may use only their already-available route/action facts. A future zone is not permission to reveal all its elements, occupants or surfaces before the exact movement receipt and qualified observation resolution. Unsupported first-step disclosure requires blocking facts or pending_intent debt.',
  'Independently check every gmc.scene-sensory-answer/1 typed value against its playerFacingStatement, confirmed modality, requested precision and actual viewpoint. An implicit prose answer supports ordinary precision only. Exact numeric or identity answers require explicit supported evidence; a bounded negative must name the actual observed scope and absence, and a blocked answer must identify a concrete sensory barrier without resolving pending mechanics. Metadata cannot substitute for the concrete player-facing result. Reject contradictions, unsupported precision, private identity disclosure or an unlimited negative as blocking facts or capabilities debt.',
].join(' ');

/** New policies keep the historical policy text unchanged and make the owner
 * hierarchy explicit on the first pass, not only after a failed examination. */
export const CONTINUATION_BINDING_POLICY = QUALIFIED_BINDING_POLICY
  .replaceAll('gma.scene-reality-builder-result/3', 'gma.scene-reality-builder-result/4')
  .replaceAll('gma.scene-pending-intent-bindings/2', CONTINUATION_BINDING_VERSION)
  + ' This is pending context /3. instructionCoverage is protected owner evidence: its prefixRange covers this current program and deferredTailRange retains the exact unexecuted tail of source.instruction.exactText (subtract currentInstructionRange.start for local byte offsets). program_end ends only this program. Never claim the whole root instruction complete while deferredTailBytes is nonzero, drop its tail, execute it early or invent a summary in its place. The supplied program nodes cover the accepted prefix; preparation binds only its pending window nodes. '
  + ' A confirmed_relocation condition is exactly {kind:"confirmed_relocation",lineageRef,destinationRef,destinationZoneRef} copied from owner evidence /2. The matching confirmedRelocations row cites an actual settled successful original move and independently examined binding. It is not an unfinished move to bind or repeat. Stage that observer at its receipt-proven current origin zone, cite all origin.sourceRefs, and keep the stationary controller separate. Select the exact confirmed destination zone and supplied conditionalViewpointRef/capability tuple. Do not include the completed move as a new binding row or generate a new receipt. Still-pending after_relocation conditions retain all original unexecuted-origin rules. '
  + ' Confirmed movement is not completed observation. Keep actual observationAccess/observables empty in the new Scene; only owner activation and observation resolution authorize sensory publication. Apply the execution-versus-discovery separation to both pending and confirmed relocation sensing affordances. Missing, foreign, failed or conflicting lineage requires clarification or blocking debt, never a guessed position or success.';
export const CONTINUATION_EXAMINER_POLICY = QUALIFIED_EXAMINER_POLICY
  .replaceAll('gma.scene-readiness-assessment/3', 'gma.scene-readiness-assessment/4')
  .replaceAll('unexecuted_conditions_preserved', 'pending_and_confirmed_lineage_preserved')
  + ' Also return the exact supplied instructionCoverageFingerprint and confirmedRelocationFingerprint. Independently distinguish root instruction, current prefix program, its pending-only window and exact deferred tail using instructionCoverage. A nonempty tail is intentionally deferred, not dropped or completed by program_end. Do not require current binding rows for later tail actions or for already-completed nodes. '
  + ' For confirmed_relocation, verify its supplied settled successful receipt and original examined binding lineage, exact actor and destination, and preserved owner_relocation_receipt origin. That move is already completed: its current destination is not premature staging, and it must not be repeated. For after_relocation retain the unexecuted condition and original origin. Both conditions leave observation unresolved and preserve disclosure scope. Adequate requires pending_and_confirmed_lineage_preserved plus exact coverage/lineage fingerprints. Missing or inconsistent coverage or lineage requires blocking pending_intent/capabilities debt.';

interface QualifiedSelection { groupId: string; ownerEvidenceRef: string; viewpointZoneRef: string; viewpointCondition: ObserverViewpointCondition }
type QualifiedContext = ScenePendingBindingContext & { qualifiedObservers?: PendingObserverEvidence[];
  instructionCoverage?: InstructionWindowCoverage; confirmedRelocations?: ConfirmedRelocationLineage[] };
type LegacyRow = ScenePendingBindingContext['proposal']; // Boundary to the existing, closed legacy dossier validator.
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => freeformJsonDigest(a) === freeformJsonDigest(b);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const closed = (v: unknown, fields: string[]): v is Record<string, unknown> => object(v)
  && Object.keys(v).length === fields.length && fields.every((key) => Object.hasOwn(v, key));

/** A prepared condition identity, deliberately not an active access record. */
export function conditionalViewpointRef(evidence: PendingObserverEvidence): string {
  return `pending-viewpoint:${freeformJsonDigest({ evidenceRef: evidence.evidenceRef, condition: evidence.viewpointCondition }).slice(0, 40)}`;
}
/** Identify future sensory scope without granting access or copying world data.
 * Also guards already-saved preparations before selecting an executable action. */
export function futureSensoryFactRefs(bindings: LegacyRow, proposal: LegacyRow): string[] {
  if (![QUALIFIED_BINDING_VERSION, CONTINUATION_BINDING_VERSION].includes(bindings?.schemaVersion)) return [];
  const futureCoverage = new Set((bindings.nodes ?? []).filter((row: LegacyRow) =>
    row.observations?.some((selection: LegacyRow) => ['after_relocation', 'confirmed_relocation'].includes(selection.viewpointCondition?.kind)))
    .flatMap((row: LegacyRow) => row.coverage.map((selection: LegacyRow) => selection.coverageEntryRef)));
  return [...new Set<string>((proposal.sceneStoryDesign?.affordances ?? [])
    .filter((row: LegacyRow) => row.actionFamily === 'observe' && futureCoverage.has(row.coverageEntryId))
    .flatMap((row: LegacyRow) => row.factRefs ?? []))].sort();
}
export function scenePendingBindingContextFromOwner(owner: LegacyRow, operationId: string, proposal: LegacyRow): QualifiedContext {
  const base = legacyContext(owner, operationId, proposal);
  return ['gmc.scene-pending-intent-context/2', 'gmc.scene-pending-intent-context/3'].includes(owner.schemaVersion)
    ? { ...base, qualifiedObservers: structuredClone(owner.qualifiedObservers), ...(owner.schemaVersion === 'gmc.scene-pending-intent-context/3'
      ? { instructionCoverage: structuredClone(owner.instructionCoverage), confirmedRelocations: structuredClone(owner.confirmedRelocations) } : {}) } : base;
}

/** Reuse only pure legacy reference/coverage closure, never its current-access authority.
 * The owner-stamped /2 records and actual viewpoint conditions remain separate. */
function structural(value: unknown, context: QualifiedContext) {
  if (!object(value) || !Array.isArray(value.nodes) || !Array.isArray(context.qualifiedObservers)) throw new Error('Incomplete qualified binding context.');
  const rawNodes = value.nodes;
  const window = createPendingIntentWindow(context.source), qualifications = context.qualifiedObservers;
  const continuation = value.schemaVersion === CONTINUATION_BINDING_VERSION;
  if (continuation && (!context.instructionCoverage || instructionCoverageContextIssues(context.instructionCoverage, context.source.instruction, context.source.program).length
    || !Array.isArray(context.confirmedRelocations) || context.confirmedRelocations.length > 32
    || context.confirmedRelocations.some((row) => relocationLineageContextIssues(row, context.source).length))) throw new Error('Invalid continuation hierarchy.');
  const evidenceIds = new Set<string>();
  for (const evidence of qualifications) {
    if (pendingObserverEvidenceIssues(evidence).length || evidence.schemaVersion !== (continuation ? 'gmc.pending-observer-evidence/2' : 'gmc.pending-observer-evidence/1') || evidenceIds.has(evidence.evidenceRef)
      || evidence.campaignId !== window.campaignId || evidence.programRef !== window.programId
      || evidence.windowFingerprint !== window.windowFingerprint || evidence.instructionFingerprint !== window.instructionFingerprint) throw new Error('Foreign qualified observer.');
    evidenceIds.add(evidence.evidenceRef);
    const frames = context.proposal.actorFrames.filter((frame: LegacyRow) => frame.actorRef === evidence.observerRef);
    if (frames.length !== 1 || evidence.origin.zoneRef !== null && frames[0].zoneRef !== evidence.origin.zoneRef
      || ['human_gm', 'owner_relocation_receipt'].includes(evidence.origin.kind) && !evidence.origin.sourceRefs.every((ref) => frames[0].sourceRefs?.includes(ref))) throw new Error('Observer origin changed.');
  }
  const observations = [...context.observations], selections: QualifiedSelection[] = [];
  const nodes: Record<string, unknown>[] = rawNodes.map((node) => {
    if (!object(node) || !Array.isArray(node.observations)) throw new Error('Incomplete qualified observation selections.');
    const selected = node.observations.map((raw) => {
      if (!closed(raw, ['groupId', 'ownerEvidenceRef', 'viewpointZoneRef', 'viewpointCondition'])
        || !id(raw.groupId) || !id(raw.ownerEvidenceRef) || !id(raw.viewpointZoneRef)) throw new Error('Invalid qualified selection.');
      const evidence = qualifications.find((row) => row.evidenceRef === raw.ownerEvidenceRef);
      const existing = context.observations.find((row) => row.evidenceRef === raw.ownerEvidenceRef);
      if (evidence) {
        if (evidence.nodeRef !== node.nodeRef || evidence.groupId !== raw.groupId
          || !same(raw.viewpointCondition, evidence.viewpointCondition)) throw new Error('Changed viewpoint condition.');
        const frame = context.proposal.actorFrames.find((row: LegacyRow) => row.actorRef === evidence.observerRef);
        const condition = evidence.viewpointCondition;
        if (condition.kind === 'after_relocation') {
          const moved = rawNodes.find((row) => object(row) && row.nodeRef === condition.nodeRef);
          const slot = pendingIntentBindingSlots(context.source).find((row) => row.nodeRef === condition.nodeRef);
          const destinations = slot?.references.filter((row: LegacyRow) => row.role === 'destination' && row.locationFingerprint) ?? [];
          if (!object(moved) || !Array.isArray(moved.references) || destinations.length !== 1) throw new Error('Missing relocation binding.');
          const moveReferences = moved.references;
          const destination = moveReferences.find((row) => object(row) && row.slotId === destinations[0].slotId);
          if (!object(destination) || !id(destination.selectedRef)) throw new Error('Missing exact destination.');
          const actorSlots = slot?.references.filter((row: LegacyRow) => row.role === 'actor') ?? [];
          if (!actorSlots.length || actorSlots.some((actorSlot: LegacyRow) => {
            const selectedActor = moveReferences.find((row) => object(row) && row.slotId === actorSlot.slotId);
            return !object(selectedActor) || ![evidence.observerRef, frame.actorFrameId].includes(selectedActor.selectedRef);
          })) throw new Error('Relocation must move the qualified observer only.');
          const target = context.proposal.elements.find((row: LegacyRow) => row.elementId === destination.selectedRef);
          if (raw.viewpointZoneRef !== (target?.zoneRef ?? destination.selectedRef)
            || frame.zoneRef === raw.viewpointZoneRef) throw new Error('Future viewpoint is not the exact unexecuted destination.');
        } else if (condition.kind === 'confirmed_relocation') {
          const lineage = continuation ? context.confirmedRelocations?.find((row) => row.lineageRef === condition.lineageRef) : null;
          if (!lineage || lineage.observationNodeRef !== node.nodeRef || lineage.groupId !== raw.groupId
            || lineage.observerRef !== evidence.observerRef || lineage.actorLinkRef !== evidence.actorLinkRef
            || lineage.destinationRef !== condition.destinationRef || lineage.destinationZoneRef !== condition.destinationZoneRef
            || !same(lineage.sourceHead, evidence.sourceHead)
            || raw.viewpointZoneRef !== lineage.destinationZoneRef || frame.zoneRef !== lineage.destinationZoneRef
            || rawNodes.some((row) => object(row) && row.nodeRef === lineage.moveNodeRef)) throw new Error('Unconfirmed relocation lineage.');
        } else if (raw.viewpointZoneRef !== frame.zoneRef) throw new Error('Current viewpoint changed.');
        observations.push({ evidenceRef: evidence.evidenceRef, campaignId: evidence.campaignId, groupId: evidence.groupId,
          observerKind: evidence.observerKind, observerRef: evidence.observerRef, methodRef: evidence.methodRef, formRef: evidence.formRef,
          zoneRef: raw.viewpointZoneRef, accessRef: condition.kind === 'current_access' ? condition.accessRef : conditionalViewpointRef(evidence),
          capabilityRef: evidence.capabilityRef, vcsCharacterRevision: context.ownerReadSet.vcsCharacterRevision,
          ownerReceiptRefs: evidence.ownerReceiptRefs });
      } else if (!existing || existing.groupId !== raw.groupId || raw.viewpointZoneRef !== existing.zoneRef
        || !same(raw.viewpointCondition, { kind: 'current_access', accessRef: existing.accessRef })) throw new Error('Missing current owner access.');
      selections.push(raw as unknown as QualifiedSelection);
      return { groupId: raw.groupId, ownerEvidenceRef: raw.ownerEvidenceRef };
    });
    return { ...node, observations: selected };
  });
  const legacyBindings = { ...value, schemaVersion: 'gma.scene-pending-intent-bindings/1', nodes };
  const futureSensoryFactRefs = new Set<string>();
  for (const selection of selections) {
    const evidence = qualifications.find((row) => row.evidenceRef === selection.ownerEvidenceRef);
    if (!evidence) continue;
    const node = rawNodes.find((row) => object(row) && row.nodeRef === evidence.nodeRef) as LegacyRow;
    const slot = pendingIntentBindingSlots(context.source).find((row) => row.nodeRef === evidence.nodeRef)!;
    const original = window.nodes.find((row: LegacyRow) => row.nodeRef === evidence.nodeRef)!;
    for (const requirement of original.requirements.filter((row: LegacyRow) => row.value.kind === 'observation')) {
      const outcome = requirement.value.observation;
      if (!slot.observationGroups.find((group: LegacyRow) => group.groupId === evidence.groupId)?.outcomeIds.includes(outcome.outcomeId)) continue;
      const subject = slot.references.find((row: LegacyRow) => row.outcomeId === outcome.outcomeId && row.role === 'subject');
      const targetRef = node.references.find((row: LegacyRow) => row.slotId === subject?.slotId)?.selectedRef;
      const coverageSlot = slot.coverage.find((row: LegacyRow) => row.outcomeId === outcome.outcomeId);
      const coverage = node.coverage.find((row: LegacyRow) => row.slotId === coverageSlot?.slotId)?.coverageEntryRef;
      const affordance = context.proposal.sceneStoryDesign.affordances.find((row: LegacyRow) => row.coverageEntryId === coverage);
      if (!affordance) throw new Error('Missing qualified sensory scope.');
      if (selection.viewpointCondition.kind !== 'current_access') {
        for (const factRef of affordance.factRefs ?? []) futureSensoryFactRefs.add(String(factRef));
      }
      deriveQualifiedSensoryProjection({ evidence, viewpointZoneRef: selection.viewpointZoneRef,
        accessRef: conditionalViewpointRef(evidence), activationReceiptRef: 'pending:unexecuted',
        affordanceRef: affordance.affordanceId ?? affordance.coverageEntryId, factRefs: affordance.factRefs ?? [], facts: context.proposal.facts,
        outcomes: [{ outcomeId: outcome.outcomeId, targetRef, facet: outcome.facet, valueKind: outcome.valueKind,
          requestedPrecision: outcome.requestedPrecision ?? 'ordinary' }] });
    }
  }
  for (const affordance of context.proposal.sceneStoryDesign.affordances) {
    if (affordance.actionFamily !== 'observe' && (affordance.factRefs ?? []).some((ref: unknown) => futureSensoryFactRefs.has(String(ref)))) {
      throw new Error('Future sensory answer leaked through a non-observation affordance.');
    }
  }
  const projectedContext: ScenePendingBindingContext = { ...context, observations,
    ownerEvidenceRefs: [...new Set([...(context.ownerEvidenceRefs ?? []), ...qualifications.flatMap((row) => [row.evidenceRef, row.actorLinkRef,
      row.observerRef, row.methodRef, row.capabilityRef, ...(row.formRef ? [row.formRef] : []), ...row.mobilityRefs,
      ...row.ownerReceiptRefs, ...row.origin.sourceRefs]), ...(continuation ? [context.instructionCoverage!.coverageRef,
        ...context.confirmedRelocations!.flatMap((row) => [row.lineageRef, row.movementReceiptRef, row.bindingRecordRef])] : [])])] };
  return { legacyBindings, projectedContext, qualifications, selections };
}

function qualificationReviewRefs(bindings: LegacyRow, context: QualifiedContext, projected: ReturnType<typeof structural>): string[] {
  return [...new Set([...(projected.projectedContext.ownerEvidenceRefs ?? []), bindings.bindingId,
    ...context.proposal.actorFrames.flatMap((row: LegacyRow) => [row.actorFrameId, row.actorRef]),
    ...context.proposal.zones.map((row: LegacyRow) => row.zoneId),
    ...context.proposal.elements.map((row: LegacyRow) => row.elementId),
    ...context.proposal.facts.map((row: LegacyRow) => row.factId),
    ...(context.proposal.preparedBoundaries ?? []).map((row: LegacyRow) => row.boundaryId),
    ...(context.proposal.sceneStoryDesign?.affordances ?? []).flatMap((row: LegacyRow) => [row.coverageEntryId, row.affordanceId]),
    ...projected.projectedContext.observations.flatMap((row) => [row.evidenceRef, row.accessRef]),
  ].filter(id))].sort();
}

/** One bounded citation vocabulary for the original prompt and its validator.
 * Citations identify supplied evidence; they confer no authority to execute it. */
export function qualificationReviewEvidenceRefs(bindings: LegacyRow, context: QualifiedContext): string[] {
  return qualificationReviewRefs(bindings, context, structural(bindings, context));
}
export function scenePendingIntentBindingIssues(value: unknown, context: QualifiedContext): string[] {
  if (!object(value) || ![QUALIFIED_BINDING_VERSION, CONTINUATION_BINDING_VERSION].includes(String(value.schemaVersion))) return legacyIssues(value, context);
  try {
    const projected = structural(value, context);
    return legacyIssues(projected.legacyBindings, projected.projectedContext);
  } catch { return ['/qualifiedObservers']; }
}
export function scenePendingIntentExaminationIdentity(bindings: LegacyRow, context: QualifiedContext, policyFingerprint: string): LegacyRow {
  if (![QUALIFIED_BINDING_VERSION, CONTINUATION_BINDING_VERSION].includes(bindings.schemaVersion)) return legacyIdentity(bindings, context, policyFingerprint);
  if (scenePendingIntentBindingIssues(bindings, context).length) throw new Error('Invalid qualified bindings.');
  const projected = structural(bindings, context), original = legacyIdentity(projected.legacyBindings, projected.projectedContext, policyFingerprint);
  const continuation = bindings.schemaVersion === CONTINUATION_BINDING_VERSION;
  return { ...original, bindingFingerprint: freeformJsonDigest(bindings),
    ownerReadSetFingerprint: freeformJsonDigest({ ownerReadSet: context.ownerReadSet, observations: context.observations, qualifiedObservers: projected.qualifications }),
    pendingIntentPolicyFingerprint: freeformJsonDigest({ binding: continuation ? CONTINUATION_BINDING_POLICY_VERSION : QUALIFIED_BINDING_POLICY_VERSION,
      examiner: continuation ? CONTINUATION_EXAMINER_POLICY_VERSION : QUALIFIED_EXAMINER_POLICY_VERSION }),
    qualifiedObserverFingerprint: freeformJsonDigest(projected.qualifications), ...(continuation ? {
      instructionCoverageFingerprint: freeformJsonDigest(context.instructionCoverage), confirmedRelocationFingerprint: freeformJsonDigest(context.confirmedRelocations) } : {}) };
}
export function scenePendingIntentExaminationIssues(value: unknown, bindings: LegacyRow, context: QualifiedContext, policyFingerprint: string): string[] {
  if (![QUALIFIED_BINDING_VERSION, CONTINUATION_BINDING_VERSION].includes(bindings.schemaVersion)) return legacyExamination(value, bindings, context, policyFingerprint);
  try {
    const continuation = bindings.schemaVersion === CONTINUATION_BINDING_VERSION;
    const identity = scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint);
    if (!continuation && object(value) && (Object.hasOwn(value, 'instructionCoverageFingerprint') || Object.hasOwn(value, 'confirmedRelocationFingerprint'))) return ['/identity'];
    if (!object(value) || value.schemaVersion !== (continuation ? 'gma.scene-readiness-assessment/4' : 'gma.scene-readiness-assessment/3')
      || Object.entries(identity).some(([key, expected]) => value[key] !== expected)
      || !Array.isArray(value.bindingReviews)) return ['/identity'];
    const review = value.qualificationReview;
    if (!closed(review, ['verdict', 'originState', 'viewpointState', 'rationale', 'evidenceRefs'])
      || !['supported', 'unsupported'].includes(String(review.verdict)) || !['preserved', 'unsupported'].includes(String(review.originState))
      || ![continuation ? 'pending_and_confirmed_lineage_preserved' : 'unexecuted_conditions_preserved', 'unsupported'].includes(String(review.viewpointState))
      || typeof review.rationale !== 'string' || !review.rationale.trim() || review.rationale.length > 2_000
      || !Array.isArray(review.evidenceRefs) || !review.evidenceRefs.length || review.evidenceRefs.length > 32
      || new Set(review.evidenceRefs).size !== review.evidenceRefs.length) return ['/qualificationReview'];
    if (value.verdict === 'adequate' && (review.verdict !== 'supported' || review.originState !== 'preserved'
      || review.viewpointState !== (continuation ? 'pending_and_confirmed_lineage_preserved' : 'unexecuted_conditions_preserved'))) return ['/qualificationReview'];
    if ((review.verdict === 'unsupported' || review.originState === 'unsupported' || review.viewpointState === 'unsupported')
      && (!Array.isArray(value.debt) || !value.debt.some((row) => object(row) && row.blocking === true
        && ['pending_intent', 'capabilities'].includes(String(row.domain))))) return ['/debt'];
    const projected = structural(bindings, context);
    const allowed = new Set(qualificationReviewRefs(bindings, context, projected));
    if (review.evidenceRefs.some((ref) => !id(ref) || !allowed.has(ref))) return ['/qualificationReview'];
    for (const row of bindings.nodes) {
      const reviewRow = value.bindingReviews.find((entry) => object(entry) && entry.nodeRef === row.nodeRef);
      if (!object(reviewRow) || reviewRow.bindingRowFingerprint !== freeformJsonDigest(row)) return ['/bindingReviews'];
    }
    const { qualifiedObserverFingerprint: _qualified, qualificationReview: _review,
      instructionCoverageFingerprint: _coverage, confirmedRelocationFingerprint: _lineage, ...legacyShape } = value;
    const translated = { ...legacyShape, ...legacyIdentity(projected.legacyBindings, projected.projectedContext, policyFingerprint),
      schemaVersion: 'gma.scene-readiness-assessment/2', bindingReviews: value.bindingReviews.map((row) => ({ ...(row as Record<string, unknown>),
        bindingRowFingerprint: freeformJsonDigest(projected.legacyBindings.nodes.find((node) => node.nodeRef === (row as Record<string, unknown>).nodeRef)) })) };
    return legacyExamination(translated, projected.legacyBindings, projected.projectedContext, policyFingerprint);
  } catch { return ['/context']; }
}
export function mergeScenePendingIntentBindingRepair(value: LegacyRow, replacements: LegacyRow[], failedNodeRefs: string[], context: QualifiedContext): LegacyRow {
  if (![QUALIFIED_BINDING_VERSION, CONTINUATION_BINDING_VERSION].includes(value.schemaVersion)) return legacyRepair(value, replacements, failedNodeRefs, context);
  if (!failedNodeRefs.length || new Set(failedNodeRefs).size !== failedNodeRefs.length || replacements.length !== failedNodeRefs.length
    || new Set(replacements.map((row) => row.nodeRef)).size !== replacements.length
    || replacements.some((row) => !failedNodeRefs.includes(row.nodeRef)) || failedNodeRefs.some((ref) => !value.nodes.some((row: LegacyRow) => row.nodeRef === ref))) throw new Error('Qualified repair widened scope.');
  const result = { ...structuredClone(value), nodes: value.nodes.map((row: LegacyRow) => structuredClone(replacements.find((replacement) => replacement.nodeRef === row.nodeRef) ?? row)) };
  if (scenePendingIntentBindingIssues(result, context).length) throw new Error('Qualified repair remains invalid.');
  return result;
}

const identifier = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const strict = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const QUALIFIED_VIEWPOINT_CONDITION_SCHEMA = { anyOf: [strict({ kind: { const: 'current_access' }, accessRef: identifier }),
  strict({ kind: { const: 'after_relocation' }, nodeRef: identifier, destinationTargetId: identifier,
    destinationRef: { anyOf: [identifier, { type: 'null' }] } })] };
export const QUALIFIED_BINDINGS_SCHEMA = { ...SCENE_PENDING_INTENT_BINDINGS_SCHEMA,
  properties: { ...SCENE_PENDING_INTENT_BINDINGS_SCHEMA.properties, schemaVersion: { const: QUALIFIED_BINDING_VERSION },
    nodes: { ...SCENE_PENDING_INTENT_BINDINGS_SCHEMA.properties.nodes, items: {
      ...SCENE_PENDING_INTENT_BINDINGS_SCHEMA.properties.nodes.items,
      properties: { ...SCENE_PENDING_INTENT_BINDINGS_SCHEMA.properties.nodes.items.properties,
        observations: { type: 'array', maxItems: 8, items: strict({ groupId: identifier, ownerEvidenceRef: identifier,
          viewpointZoneRef: identifier, viewpointCondition: QUALIFIED_VIEWPOINT_CONDITION_SCHEMA }) } } } } } };
export const QUALIFICATION_REVIEW_SCHEMA = strict({ verdict: { enum: ['supported', 'unsupported'] }, originState: { enum: ['preserved', 'unsupported'] },
  viewpointState: { enum: ['unexecuted_conditions_preserved', 'unsupported'] }, rationale: { type: 'string', minLength: 1, maxLength: 2_000 },
  evidenceRefs: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true, items: identifier } });

/** Negotiated ADR 017 output; no new keys are accepted by historical schemas. */
export const CONTINUATION_BINDINGS_SCHEMA = { ...QUALIFIED_BINDINGS_SCHEMA,
  properties: { ...QUALIFIED_BINDINGS_SCHEMA.properties, schemaVersion: { const: CONTINUATION_BINDING_VERSION },
    nodes: { ...QUALIFIED_BINDINGS_SCHEMA.properties.nodes, items: { ...QUALIFIED_BINDINGS_SCHEMA.properties.nodes.items,
      properties: { ...QUALIFIED_BINDINGS_SCHEMA.properties.nodes.items.properties,
        observations: { type: 'array', maxItems: 8, items: strict({ groupId: identifier, ownerEvidenceRef: identifier,
          viewpointZoneRef: identifier, viewpointCondition: { anyOf: [...QUALIFIED_VIEWPOINT_CONDITION_SCHEMA.anyOf,
            strict({ kind: { const: 'confirmed_relocation' }, lineageRef: identifier, destinationRef: identifier, destinationZoneRef: identifier })] } }) } } } } } };
export const CONTINUATION_QUALIFICATION_REVIEW_SCHEMA = { ...QUALIFICATION_REVIEW_SCHEMA,
  properties: { ...QUALIFICATION_REVIEW_SCHEMA.properties,
    viewpointState: { enum: ['pending_and_confirmed_lineage_preserved', 'unsupported'] } } };

/** Same canonical whole-dossier hash; exposed for qualified operation identity tests. */
export function qualifiedDossierFingerprint(value: unknown): string {
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : object(v) ? `{${Object.keys(v).sort().map((key) => `${JSON.stringify(key)}:${canonical(v[key])}`).join(',')}}` : JSON.stringify(v);
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}
