import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { pendingIntentBindingSlots } from './scenePendingIntentBindings.js';
import { qualifiedPendingReferenceSlots } from './typedPendingReferenceProjection.js';
import { actorMechanicsLinkIssues } from './actorMechanicsLink.js';

type Row = Record<string, any>;
export const PREPARED_BINDING_COMPILATION = Object.freeze({
  capability: 'application-owned-prepared-binding-compilation/1',
  policy: 'gma.scene-prepared-binding-compilation-policy/1',
  selections: 'gma.scene-prepared-binding-selections/1',
  compilation: 'gma.scene-prepared-binding-compilation/1',
  request: 'gma.scene-prepared-binding-compile-request/1',
  response: 'gma.scene-prepared-binding-compile-response/1',
  review: 'gma.scene-prepared-binding-review/1',
  assessment: 'gma.scene-readiness-assessment/8',
  builder: 'gma.scene-reality-builder-result/8',
  manualState: 'gma.scene-reality-manual-state/10',
  record: 'gmc.scene-pending-intent-binding-record/6',
  receipt: 'gma.action-intent-binding-receipt/6',
  preparationPolicyVersion: 15,
  examinerPolicy: 'gma.scene-readiness-examiner-policy/16',
  operationSuffix: '.binding-compilation',
  operation: 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation',
});
const C = PREPARED_BINDING_COMPILATION;
const legacy = 'gma.scene-pending-intent-bindings/5';
const keys = (v: Row, expected: string[]) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === [...expected].sort().join(',');
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
function requireMatch(ok: unknown, field: string): asserts ok { if (!ok) throw Object.assign(new Error('SCENE_PREPARED_BINDING_COMPILATION_INVALID'), {
  code: 'SCENE_PREPARED_BINDING_COMPILATION_INVALID', details: { field },
}); }
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const slotsFor = (context: Row): Row[] => context.pendingReferenceQualification
  ? qualifiedPendingReferenceSlots(context.source, context.pendingReferenceQualification) : pendingIntentBindingSlots(context.source);

/** Structural slots supplied before model generation. Authority is checked again
 * against actual selections and owner relationships, not inferred from this list. */
export function preparedReceiverSlots(context: Row): Row[] {
  const window = createPendingIntentWindow(context.source);
  return slotsFor(context).flatMap((slot) => {
    const node = window.nodes.find((row: Row) => row.nodeRef === slot.nodeRef)!;
    if ((node.node.actionFamily ?? node.node.kind) !== 'observe') return [];
    return slot.references.filter((ref: Row) => {
      if (ref.role === 'recipient') return true;
      if (ref.role !== 'actor' || !ref.requirementId || !ref.originalRef) return false;
      // Freeform "I watch through its eyes" can retain the controller as the
      // grammatical actor rather than an explicit recipient. Identify that
      // exact existing parent from owner links, never the word "I" or a name.
      const requirement = node.requirements.find((row: Row) => row.requirementId === ref.requirementId)?.value;
      if (requirement?.kind !== 'scene_presence' || requirement.dimension !== 'who' || !slot.observationGroups.length) return false;
      return slot.observationGroups.every((group: Row) => group.observerKind === 'familiar'
        && context.qualifiedObservers?.some((evidence: Row) => evidence.nodeRef === slot.nodeRef && evidence.groupId === group.groupId
          && context.observerIdentityLinks?.some((link: Row) => !actorMechanicsLinkIssues(link).length && link.state === 'active'
            && link.campaignRef === window.campaignId && link.subjectKind === 'familiar' && link.linkRef === evidence.actorLinkRef
            && link.actorRef === evidence.observerRef && link.vcsOwnerRef === evidence.vcsOwnerRef
            && link.mechanicsSubjectRef === evidence.mechanicsSubjectRef
            && (ref.originalRef === link.parentActorRef || context.observerIdentityLinks.some((parent: Row) =>
              !actorMechanicsLinkIssues(parent).length && parent.state === 'active' && parent.campaignRef === window.campaignId
              && parent.actorRef === link.parentActorRef && parent.actorRecordRef === ref.originalRef)))));
    }).map((ref: Row) => {
      const requirement = node.requirements.find((row: Row) => row.requirementId === ref.requirementId)?.value;
      requireMatch(requirement?.kind === 'scene_presence' && requirement.dimension === 'who'
        && slot.observationGroups.length > 0 && slot.observationGroups.every((group: Row) => group.observerKind === 'familiar'), '/receiver/requirement');
      const coverage = slot.coverage.filter((row: Row) => row.requirementId === ref.requirementId && !row.targetSlotId);
      requireMatch(coverage.length === 1, '/receiver/coverageSlot');
      return { nodeRef: slot.nodeRef, referenceSlotId: ref.slotId, referenceRole: ref.role, slotId: coverage[0].slotId,
        groupIds: slot.observationGroups.map((group: Row) => group.groupId) };
    });
  });
}

/** The same exact relationship witness is used by the historical semantic gate
 * and the new compiler. Identity decision revisions are not capability heads. */
export function remoteReceiverWitnesses(bindings: Row, context: Row): Row[] {
  const window = createPendingIntentWindow(context.source);
  return preparedReceiverSlots(context).flatMap((receiver) => {
    const row = bindings.nodes.find((node: Row) => node.nodeRef === receiver.nodeRef);
    if (row?.disposition !== 'bound') return [];
    const recipientRef = row.references.find((ref: Row) => ref.slotId === receiver.referenceSlotId)?.selectedRef;
    const frames = context.proposal.actorFrames.filter((frame: Row) => [frame.actorRef, frame.actorFrameId].includes(recipientRef));
    requireMatch(frames.length === 1, '/receiver/actor');
    return receiver.groupIds.map((groupId: string) => {
      const selection = row.observations.find((ref: Row) => ref.groupId === groupId);
      const evidence = context.qualifiedObservers?.filter((ref: Row) => ref.evidenceRef === selection?.ownerEvidenceRef
        && ref.nodeRef === receiver.nodeRef && ref.groupId === groupId);
      requireMatch(evidence?.length === 1, '/receiver/qualification');
      const qualified = evidence[0];
      const links = context.observerIdentityLinks?.filter((link: Row) => !actorMechanicsLinkIssues(link).length
        && link.state === 'active' && link.campaignRef === window.campaignId && link.linkRef === qualified.actorLinkRef
        && link.subjectKind === 'familiar' && link.actorRef === qualified.observerRef
        && link.parentActorRef === frames[0].actorRef && link.vcsOwnerRef === qualified.vcsOwnerRef
        && link.mechanicsSubjectRef === qualified.mechanicsSubjectRef);
      requireMatch(links?.length === 1, '/receiver/link');
      return { ...receiver, groupId, recipientRef, evidenceRef: qualified.evidenceRef, linkRef: links[0].linkRef };
    });
  });
}

/** Pure typed compilation. No world edits, fuzzy matching, fallback surface or
 * independently authored normalization exists in the application layers. */
export function compilePreparedBindings(source: Row, context: Row, sourcePolicy: string): { bindings: Row; compilation: Row } {
  const fresh = source?.schemaVersion === C.selections;
  requireMatch(fresh ? sourcePolicy === 'gma.scene-reality-builder-policy/15'
    : source?.schemaVersion === legacy && sourcePolicy === 'gma.scene-reality-builder-policy/14', '/sourceProfile');
  requireMatch(keys(source, ['schemaVersion', 'bindingId', 'operationId', 'campaignId', 'windowId', 'windowFingerprint', 'sceneKitRef', 'nodes', 'requirementRoles', 'referenceQualificationFingerprint'])
    && Array.isArray(source.nodes) && source.nodes.length <= 8 && Buffer.byteLength(JSON.stringify(source)) <= 24576, '/sourceShape');
  const slots = slotsFor(context), window = createPendingIntentWindow(context.source);
  requireMatch(source.operationId === context.operationId && source.campaignId === window.campaignId
    && source.windowId === window.windowId && source.windowFingerprint === window.windowFingerprint
    && source.referenceQualificationFingerprint === context.pendingReferenceQualification?.fingerprint
    && same(source.sceneKitRef, { sceneKitId: context.proposal.sceneKit.sceneKitId, revision: context.proposal.sceneKit.revision }), '/sourceIdentity');
  const affordances = new Map<string, Row>(), coverage = new Map<string, Row>();
  for (const row of context.proposal.sceneStoryDesign.affordances) {
    requireMatch(identifier(row.affordanceId) && identifier(row.coverageEntryId)
      && !affordances.has(row.affordanceId) && !coverage.has(row.coverageEntryId), '/catalog');
    affordances.set(row.affordanceId, row); coverage.set(row.coverageEntryId, row);
  }
  for (const [ref, row] of affordances) requireMatch(!coverage.has(ref) || coverage.get(ref) === row, '/catalogCollision');
  const bindings = structuredClone(source); bindings.schemaVersion = legacy;
  const derivations: Row[] = [];
  for (const [nodeIndex, node] of bindings.nodes.entries()) {
    requireMatch(keys(node, ['nodeRef', 'disposition', 'references', 'coverage', 'observations', 'instructionEvidence', 'rationale', 'question', 'effectCoverage'])
      && Array.isArray(node.coverage) && Array.isArray(node.effectCoverage), '/nodeShape');
    for (const collection of ['coverage', 'effectCoverage']) {
      requireMatch(node[collection].length <= 32, '/coverageCount');
      for (const [rowIndex, row] of node[collection].entries()) {
        const field = fresh ? 'affordanceRef' : 'coverageEntryRef';
        requireMatch(keys(row, collection === 'coverage' ? ['slotId', field] : ['effectId', 'targetSlotId', 'role', field]), '/selectionShape');
        const selected = fresh ? affordances.get(row[field]) : coverage.get(row[field]) ?? affordances.get(row[field]);
        requireMatch(selected, '/selectionReference');
        const originalValue = row[field];
        if (fresh) delete row.affordanceRef;
        row.coverageEntryRef = selected.coverageEntryId;
        if (fresh || originalValue !== row.coverageEntryRef) derivations.push({ nodeIndex, collection, rowIndex,
          originalValue, compiledValue: row.coverageEntryRef, rule: 'affordance_to_coverage', evidenceRefs: [selected.affordanceId, selected.coverageEntryId] });
      }
    }
  }
  for (const receiver of preparedReceiverSlots(context)) {
    const nodeIndex = bindings.nodes.findIndex((row: Row) => row.nodeRef === receiver.nodeRef);
    const node = bindings.nodes[nodeIndex];
    if (node?.disposition !== 'bound') continue;
    const witnesses = remoteReceiverWitnesses(bindings, context).filter((row) => row.nodeRef === receiver.nodeRef && row.slotId === receiver.slotId);
    requireMatch(witnesses.length === receiver.groupIds.length, '/receiver/witness');
    const slot = slots.find((row) => row.nodeRef === receiver.nodeRef)!;
    const groupSelections = witnesses.flatMap((witness) => {
      const groupSlots = slot.coverage.filter((row: Row) => row.groupId === witness.groupId && row.slotId !== receiver.slotId);
      requireMatch(groupSlots.length > 0, '/receiver/sensorySlot');
      return groupSlots.map((groupSlot: Row) => {
        const choices = node.coverage.filter((row: Row) => row.slotId === groupSlot.slotId);
        requireMatch(choices.length === 1, '/receiver/sensorySelection');
        const surface = coverage.get(choices[0].coverageEntryRef);
        requireMatch(surface?.surfaceKind === 'information' && surface.factRefs?.length > 0, '/receiver/sensorySurface');
        return surface!;
      });
    });
    requireMatch(new Set(groupSelections.map((row) => row.coverageEntryId)).size === 1, '/receiver/ambiguousSurface');
    const surface = groupSelections[0], selected = node.coverage.filter((row: Row) => row.slotId === receiver.slotId);
    requireMatch(fresh ? selected.length === 0 : selected.length === 1, '/receiver/selection');
    const rowIndex = fresh ? node.coverage.length : node.coverage.indexOf(selected[0]);
    const originalValue = fresh ? null : selected[0].coverageEntryRef;
    if (fresh) node.coverage.push({ slotId: receiver.slotId, coverageEntryRef: surface.coverageEntryId });
    else selected[0].coverageEntryRef = surface.coverageEntryId;
    if (fresh || originalValue !== surface.coverageEntryId) derivations.push({ nodeIndex, collection: 'coverage', rowIndex,
      originalValue, compiledValue: surface.coverageEntryId, rule: 'remote_receiver',
      evidenceRefs: [...new Set([receiver.slotId, surface.affordanceId, surface.coverageEntryId,
        ...witnesses.flatMap((row) => [row.groupId, row.evidenceRef, row.linkRef])])] });
  }
  requireMatch(Buffer.byteLength(JSON.stringify(bindings)) <= 24576 && derivations.length <= 512, '/compiledBytes');
  const body = { schemaVersion: C.compilation, policy: C.policy, operationId: context.operationId,
    campaignId: window.campaignId, windowFingerprint: window.windowFingerprint,
    ownerReadSetFingerprint: freeformJsonDigest(context.ownerReadSet),
    qualificationFingerprint: context.pendingReferenceQualification.fingerprint,
    identityLinksFingerprint: freeformJsonDigest(context.observerIdentityLinks ?? []),
    dossierFingerprint: freeformJsonDigest(context.proposal), sourceSyntax: fresh ? C.selections : legacy, sourcePolicy,
    sourceFingerprint: freeformJsonDigest(source), compiledFingerprint: freeformJsonDigest(bindings), derivations };
  return { bindings, compilation: { ...body, fingerprint: freeformJsonDigest(body) } };
}

/** Inverse derivations reconstruct the whole original choice object. Recompiling
 * it is mandatory; an untrusted list of fields never authorizes arbitrary edits. */
export function restorePreparedBindingSource(bindings: Row, compilation: Row): Row {
  requireMatch(compilation?.schemaVersion === C.compilation && compilation.policy === C.policy
    && Array.isArray(compilation.derivations) && compilation.derivations.length <= 512
    && compilation.compiledFingerprint === freeformJsonDigest(bindings), '/compilationShape');
  const source = structuredClone(bindings);
  for (const row of [...compilation.derivations].reverse()) {
    requireMatch(keys(row, ['nodeIndex', 'collection', 'rowIndex', 'originalValue', 'compiledValue', 'rule', 'evidenceRefs'])
      && Number.isSafeInteger(row.nodeIndex) && row.nodeIndex >= 0 && Number.isSafeInteger(row.rowIndex) && row.rowIndex >= 0
      && ['coverage', 'effectCoverage'].includes(row.collection) && ['affordance_to_coverage', 'remote_receiver'].includes(row.rule), '/derivationShape');
    const list = source.nodes[row.nodeIndex]?.[row.collection];
    requireMatch(list?.[row.rowIndex]?.coverageEntryRef === row.compiledValue, '/derivationValue');
    if (row.originalValue === null) { requireMatch(row.rule === 'remote_receiver' && compilation.sourceSyntax === C.selections, '/derivationAbsent'); list.splice(row.rowIndex, 1); }
    else { requireMatch(identifier(row.originalValue), '/derivationOriginal'); list[row.rowIndex].coverageEntryRef = row.originalValue; }
  }
  if (compilation.sourceSyntax === C.selections) {
    source.schemaVersion = C.selections;
    for (const node of source.nodes) for (const field of ['coverage', 'effectCoverage']) for (const row of node[field]) {
      row.affordanceRef = row.coverageEntryRef; delete row.coverageEntryRef;
    }
  } else requireMatch(compilation.sourceSyntax === legacy, '/sourceSyntax');
  requireMatch(freeformJsonDigest(source) === compilation.sourceFingerprint, '/sourceFingerprint');
  return source;
}

export function assertPreparedBindingCompilation(bindings: Row, compilation: Row, context: Row): void {
  const source = restorePreparedBindingSource(bindings, compilation);
  const expected = compilePreparedBindings(source, context, compilation.sourcePolicy);
  requireMatch(same(bindings, expected.bindings) && same(compilation, expected.compilation), '/compilationRecheck');
}

/** Compare the original materialized world with the application-bound view.
 * Only bookkeeping already owned by ADR 013/014 is excluded; every word,
 * world identity, target, access vector and source stays in this comparison.
 * The protected Scene writer still checks the excluded owner metadata. */
export function preparedWorldMeaningFingerprint(proposal: Row): string {
  const value = structuredClone(proposal);
  for (const name of ['sceneKit', 'sceneReality', 'sceneStoryDesign']) delete value[name].revision;
  for (const ref of [value.sceneReality.sceneKitRef, value.sceneStoryDesign.sceneKitRef,
    value.sceneKit.sceneRealityRef, value.sceneKit.sceneStoryDesignRef]) if (ref) delete ref.revision;
  for (const name of ['zones', 'actorFrames', 'elements', 'facts']) for (const row of value[name]) delete row.revision;
  delete value.activeSceneState;
  for (const name of ['activeSceneStateRevision', 'workspaceRevision', 'clockRevision']) delete value.sceneReality.timelineAnchor[name];
  delete value.openingFrame.presentedTargetManifest.certificateRef;
  delete value.openingFrame.presentedTargetManifest.proseFingerprint;
  return freeformJsonDigest(value);
}
