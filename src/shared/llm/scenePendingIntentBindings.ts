import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow, type PendingIntentWindowSource } from './pendingIntentWindow.js';
import { createHash } from 'node:crypto';
import type { ActorMechanicsLink } from './actorMechanicsLink.js';

/** Accepted ADR 014. Pure proposal checks, not a permission check, owner write,
 * examination certificate or execution receipt. Context is authenticated owner
 * input, never a model-authored catalog. */
export const SCENE_PENDING_INTENT_BINDINGS_VERSION = 'gma.scene-pending-intent-bindings/1';
export const SCENE_PENDING_INTENT_BINDING_POLICY_VERSION = 'gma.scene-pending-intent-binding-policy/2';
export const SCENE_PENDING_INTENT_BINDING_LIMITS = Object.freeze({ bytes: 24_576, nodes: 8, referencesPerNode: 64, coveragePerNode: 32 });
export const SCENE_PENDING_INTENT_BINDING_POLICY = [
  'Propose bindings only for every node of the supplied exact pending intent window. In the final complete gma.scene-reality-builder-result/2, put gma.scene-pending-intent-bindings/1 in pendingIntentBindings. The outer result has exactly schemaVersion, operationId, campaignId, requestedDepth, status, proposal, checkpoint, intentWindowFingerprint and pendingIntentBindings. Copy the window fingerprint exactly. A complete result has one complete proposal, checkpoint null and pendingIntentBindings; a continuation has proposal null, one existing versioned checkpoint and pendingIntentBindings null. Do not return bindings early or request a third chunk. The binding object has exactly schemaVersion, bindingId, operationId, campaignId, windowId, windowFingerprint, sceneKitRef and nodes. Copy operationId, campaignId, windowId, windowFingerprint and sceneKitRef exactly from the packet.',
  'Return exactly one node row for each pending nodeRef, never a completed, skipped, omitted or added action. Each node row has nodeRef, disposition, references, coverage, observations, instructionEvidence, rationale and question. Use the supplied reference and coverage slot IDs exactly; these are application-derived identities, not list positions or prose joins.',
  'For bound rows, return every reference slot exactly once as {slotId, selectedRef}, every coverage slot exactly once as {slotId, coverageEntryRef}, and every observation group exactly once as {groupId, ownerEvidenceRef}. Select only exact refs in the supplied dossier or confirmed owner observation evidence. Preserve every non-null original ref and explicit coverage selection byte-for-byte. Null means unresolved, not permission to guess. Do not add fields or return implicit labels instead of explicit refs.',
  'Select the exact prepared affordance for each requirement. Its action family must agree with the original action kind. The existing other kind uses interact; the independent examiner must assess its original meaning. Do not replace it with wait, rewrite the action or claim guaranteed concealment. The selected subject, destination or area must agree with that affordance. Exact actorRef/actorFrameId aliases may close only through their supplied owner record. A sole candidate, nearby record, similar name or first array item is not evidence of intent. Never turn a cover position into contact with unrelated pebbles.',
  'For each observation group, select one supplied confirmed owner evidence record for the same group and observer kind, exact observer, method and optional form. Bind all that group’s outcomes using that record’s exact zone, access and capability tuple. The original group outcomeIds, not array order or target identity, determine which group owns an outcome. Preserve separate observers and every outcome. Entrance sight cannot replace familiar sight, and a missing capability cannot become ordinary access. Do not manufacture presence, a method, form activation, capability or receipt.',
  'instructionEvidence must be one exact {start,end,quote} span supplied for that node. Give a concrete concise rationale explaining correspondence, not a claim of completed play. If any reference or method genuinely cannot be matched, return clarification_required for that node with empty references, coverage and observations and one concrete question; preserve the original plan and completed work. Bound rows have question null.',
  'This is proposal-only preparation. Preserve instruction, kind, purpose, graph, conditions, dependencies, parallel actions, completed receipts and pending mechanics. No roll, concealment, movement, observation, discovery or action is resolved by a binding. Never output execution results, narration, certificates or accepted receipts.',
  'Use at most eight node rows, sixty-four reference slots and thirty-two coverage slots per node and 24,576 UTF-8 bytes for the binding proposal. Complete data must fit the existing full preparation envelope; do not truncate evidence, drop a parallel action, increase budgets or request an extra model call. In a two-chunk build, preserve the same window and emit bindings only with the final complete dossier.',
  'Repair only the exact failed node rows named in a correction; preserve every other row and the original window, dossier, prose, targets and owner evidence exactly. Independent examination must review the complete successor, not only the repaired fragment.',
  'The supplied pendingIntentContext.typedObservationAuthority is already accepted owner evidence outside the world proposal. Keep proposal.sceneKit.actorMechanicsBindings, observationAccess, observables and obstructions empty as required by Scene-kit /5; do not duplicate mutable authority there or replace typed observation truth with dossier facts. The bindings select the exact owner seed separately. Coverage slots for actor identity and origin prerequisites are not additional player actions: for an observation node select the same qualified original-observation affordance for these slots, using its confirmed zone/access/capability, not an invented actor-presence observation or the entrance view. The acting player and familiar observer remain distinct. New reusable ordinary scene-local world preparation is permitted within the current locus and creation policy, without inventing canon, mechanics or guaranteed outcomes.',
].join(' ');
export const SCENE_PENDING_INTENT_EXAMINER_POLICY_VERSION = 'gma.scene-readiness-examiner-policy/3';
export const SCENE_PENDING_INTENT_EXAMINER_POLICY = [
  'Independently examine the complete private Scene dossier, exact pending intent window, proposed bindings and confirmed owner evidence together. Return exactly gma.scene-readiness-assessment/2 with the supplied identity fingerprints, selected depth, verdict, confidence, counterfactualProbes, debt, rationale, evidenceRefs and bindingReviews. Never upgrade a historical assessment to cover new bindings.',
  'Judge whether a competent human GM can run five to ten minutes of plausible play at the selected depth without inventing missing fundamentals. Review locus, topology, thresholds and their next layer, actors and purposes, information, ordinary operations, Story alignment, consequences, capabilities, unknowns and timeline. Do not lower the selected depth. Low confidence at investigative or encounter_set_piece depth requires repair_required.',
  'Return at least three Scene-specific counterfactual probes with supported or unsupported status and exact zone, actor-frame, element or fact evidenceRefs from the dossier. No affordance, Story, source or prose ref substitutes for probe evidence. Unsupported probes or blocking debt require repair_required. Debt rows have debtId, domain, description, blocking and affectedRefs; use pending_intent for binding debt.',
  'Return exactly one bindingReviews row per pending node, with nodeRef, bindingRowFingerprint, verdict supported or unsupported, rationale, evidenceRefs and mechanicsState not_resolved. Copy the application-supplied binding-row fingerprint exactly. Positively verify original action meaning and purpose, every requirement and retained null, target/position correspondence, exact access and method, observer, capability, full-window and parallel coverage, conditions and completed receipt preservation. Cite exact supplied binding, slot, owner-evidence or dossier refs, not invented labels.',
  'A structurally valid reference is not semantic proof. A cover request bound to pebbles, an entrance observation substituted for familiar sight, a dropped parallel action or a missing capability must be unsupported with blocking pending_intent debt, never adequate. Keep other actions in their original meaning; do not silently turn them into waiting or guaranteed stealth.',
  'Pending mechanics remain unresolved. Completed prerequisite receipts are immutable evidence, not permission to replay their actions. Preparation and bindings alone do not complete a roll, concealment, movement, observation or discovery. Review pending and completed cases separately and never report an unexecuted action as completed.',
  'adequate requires every pending row bound and supported, no unsupported probe, no blocking debt, exact dossier/window/binding/owner-read-set/policy fingerprints and complete reference closure. Otherwise return repair_required. An unsupported binding review requires blocking pending_intent debt. Use unique debt IDs and exact non-duplicated evidence refs, one to thirty-two per review and debt row, and one to 128 for the assessment. Keep the assessment within 32,768 UTF-8 bytes. Diagnose only; do not edit prose, bind a missing reference yourself, create facts, narration, certificates or owner receipts. Preserve the full dossier and token limits. The five-operation maximum allows one separate independent full-successor examination after a single-chunk repair; no sixth operation, second repair or extra qualification call. A two-chunk build stops on blocking examination debt.',
].join(' ');

type Row = Record<string, any>;
export interface ScenePendingBindingContext {
  source: PendingIntentWindowSource;
  operationId: string;
  proposal: Row;
  /** Exact current owner read set; revalidation at persistence remains required. */
  ownerReadSet: { campaignId: string; storyWorkspaceRevision: number; sceneRevision: number; vcsCharacterRevision: number };
  /** Authenticated owner projection, not an LLM assertion of authority. */
  observations: Row[];
  /** Citation identities from the authenticated typed projection, not new authority. */
  ownerEvidenceRefs?: string[];
  /** Immutable identity evidence supplied by the authenticated /4 owner read. */
  observerIdentityLinks?: ActorMechanicsLink[];
  /** Pure /4 role closure derived only from authenticated observer identity.
   * Historical contexts omit this; it grants neither sensing nor execution. */
  remoteViewerCoverage?: ReadonlyArray<{ nodeRef: string; slotId: string; recipientRef: string }>;
  /** Internal, independently derived from protected /5 qualification only. */
  qualifiedBindingSlots?: Row[];
  pendingReferenceQualification?: Row;
}
/** owner must be the current authenticated GMC context, never model output.
 * A new zone's semantic placement is reviewed with the complete dossier. */
export function scenePendingBindingContextFromOwner(owner: Row, operationId: string, proposal: Row): ScenePendingBindingContext {
  const observations = owner.observationSeeds.map((seed: Row) => {
    const frames = proposal.actorFrames.filter((frame: Row) => frame.actorRef === seed.observerRef);
    if (frames.length !== 1) throw new Error('The confirmed observer needs one exact prepared actor frame.');
    return { ...Object.fromEntries(['evidenceRef', 'campaignId', 'groupId', 'observerKind', 'observerRef', 'methodRef', 'formRef',
      'accessRef', 'capabilityRef', 'vcsCharacterRevision', 'ownerReceiptRefs'].map((key) => [key, structuredClone(seed[key])])), zoneRef: frames[0].zoneRef };
  });
  const typed = owner.typedObservationAuthority ?? {};
  const ownerEvidenceRefs = [...new Set([
    ...(typed.actorMechanicsBindings ?? []).map((row: Row) => row.bindingRef),
    ...(typed.observables ?? []).map((row: Row) => row.observableId),
    ...(typed.obstructions ?? []).map((row: Row) => row.obstructionId),
  ].filter((ref): ref is string => typeof ref === 'string'))];
  return { source: owner.source, operationId, proposal, ownerReadSet: owner.ownerReadSet, observations, ownerEvidenceRefs };
}
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = (value: unknown, keys: string[]): value is Row => object(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const text = (value: unknown, maximum = 1_000) => typeof value === 'string' && !!value.trim() && [...value].length <= maximum;
const same = (left: unknown, right: unknown) => canonicalFreeformJson(left) === canonicalFreeformJson(right);
const FAMILY: Record<string, string> = { observe: 'observe', inspect: 'investigate', investigate: 'investigate', search: 'investigate',
  communicate: 'social', converse: 'social', social: 'social', exchange_information: 'social', relocate_actor: 'move', move: 'move', travel: 'move',
  wait: 'wait', interact: 'interact', purchase: 'purchase', manipulate: 'manipulate', invoke_capability: 'use_capability', use_capability: 'use_capability',
  attack: 'combat', combat: 'combat', chase: 'chase', withdraw: 'withdraw', retreat: 'withdraw', other: 'interact' };
const FAMILIES = new Set(Object.values(FAMILY));
const slotId = (value: unknown) => `binding-slot:${freeformJsonDigest(value).slice(0, 40)}`;

/** Stable slots preserve original values; they do not infer missing meaning.
 * Repeated location rows get an occurrence qualifier in addition to their hash. */
export function pendingIntentBindingSlots(source: PendingIntentWindowSource): Row[] {
  return pendingIntentBindingSlotsFromWindow(createPendingIntentWindow(source));
}

/** Reuse stable slots from an authenticated, already accepted immutable window.
 * This pure projection is not permission to accept a caller-authored window. */
export function pendingIntentBindingSlotsFromWindow(window: Row): Row[] {
  return window.nodes.map((projection: Row) => {
    const references: Row[] = [], coverage: Row[] = [];
    const groups = projection.node.observationGroups ?? [];
    const outcomes = projection.requirements.filter((r: Row) => r.value.kind === 'observation').map((r: Row) => r.value.observation?.outcomeId);
    if (!Array.isArray(groups) || groups.length > 8 || new Set(groups.map((g: Row) => g.groupId)).size !== groups.length
      || outcomes.some((ref: unknown) => !id(ref)) || new Set(outcomes).size !== outcomes.length
      || groups.some((g: Row) => !id(g.groupId) || !Array.isArray(g.outcomeIds) || !g.outcomeIds.length
        || new Set(g.outcomeIds).size !== g.outcomeIds.length || g.outcomeIds.some((ref: unknown) => !outcomes.includes(ref)))
      || outcomes.some((ref: string) => groups.filter((g: Row) => g.outcomeIds.includes(ref)).length !== 1)) throw new Error('Incomplete owner observation grouping.');
    const add = (identity: Row, role: string, originalRef: unknown) => {
      if (originalRef !== null && !id(originalRef)) throw new Error('Invalid owner reference slot.');
      references.push({ slotId: slotId({ nodeRef: projection.nodeRef, ...identity, role }), ...identity, role, originalRef });
    };
    for (const requirement of projection.requirements) {
      const value = requirement.value, identity = { requirementId: requirement.requirementId };
      if (Object.hasOwn(value, 'targetRef')) add(identity, value.targetRole ?? 'subject', value.targetRef);
      const observation = value.kind === 'observation' ? value.observation : null;
      const groupId = observation ? groups.find((g: Row) => g.outcomeIds.includes(observation.outcomeId)).groupId : null;
      if (observation) {
        if (observation.groupId !== undefined && observation.groupId !== groupId) throw new Error('Conflicting owner observation grouping.');
        add({ ...identity, outcomeId: observation.outcomeId }, 'subject', observation.targetRef);
        if (observation.relationOriginRef !== null && observation.relationOriginRef !== undefined
          || observation.facet === 'spatial_relation') add({ ...identity, outcomeId: observation.outcomeId }, 'relation_origin', observation.relationOriginRef);
      }
      coverage.push({ slotId: slotId({ nodeRef: projection.nodeRef, ...identity, kind: 'coverage' }), ...identity,
        groupId, outcomeId: observation?.outcomeId ?? null,
        originalCoverageEntryRef: value.coverageEntryRef ?? null });
    }
    const occurrences = new Map<string, number>();
    for (const location of projection.node.semanticLocationBindings?.bindings ?? []) {
      const fingerprint = freeformJsonDigest(location), occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      add({ locationFingerprint: fingerprint, occurrence }, location.role, location.authorityRef);
    }
    for (const group of projection.node.observationGroups ?? []) {
      add({ groupId: group.groupId }, 'observer', group.observerRef);
      add({ groupId: group.groupId }, 'method', group.methodRef);
      if (group.formRef !== null && group.formRef !== undefined || group.formTargetId) add({ groupId: group.groupId }, 'form', group.formRef);
    }
    for (const [field, role] of Object.entries({ targetRef: 'subject', subjectRef: 'subject', zoneRef: 'area', locusRef: 'area', actorRef: 'actor' })) {
      if (Object.hasOwn(projection.node, field)) add({ field }, role, projection.node[field]);
    }
    // /6 explicit effects need feasibility coverage of their own, not a fact
    // requirement saying the desired result has already happened. Historical
    // nodes have no requestedEffects and retain their original slot identities.
    for (const effect of projection.node.requestedEffects ?? []) {
      if (!id(effect.effectId)) throw new Error('Invalid owner effect slot.');
      coverage.push({ slotId: slotId({ nodeRef: projection.nodeRef, effectId: effect.effectId, kind: 'effect_surface' }),
        requirementId: null, effectId: effect.effectId, groupId: null, outcomeId: null, originalCoverageEntryRef: null });
    }
    if (!coverage.length) coverage.push({ slotId: slotId({ nodeRef: projection.nodeRef, kind: 'coverage' }),
      requirementId: null, groupId: null, outcomeId: null, originalCoverageEntryRef: null });
    if (references.length > SCENE_PENDING_INTENT_BINDING_LIMITS.referencesPerNode
      || coverage.length > SCENE_PENDING_INTENT_BINDING_LIMITS.coveragePerNode) throw new Error('Pending binding slots exceed their complete projection limit.');
    return { nodeRef: projection.nodeRef, references, coverage, instructionEvidence: projection.instructionEvidence,
      observationGroups: structuredClone(projection.node.observationGroups ?? []) };
  });
}

function contextCatalog(context: ScenePendingBindingContext): Row {
  const window = createPendingIntentWindow(context.source), p = context.proposal;
  if (!id(context.operationId) || p.operationId !== context.operationId || p.campaignId !== window.campaignId
    || !closed(context.ownerReadSet, ['campaignId', 'storyWorkspaceRevision', 'sceneRevision', 'vcsCharacterRevision'])
    || context.ownerReadSet.campaignId !== window.campaignId
    || ['storyWorkspaceRevision', 'sceneRevision', 'vcsCharacterRevision'].some((key) => !Number.isSafeInteger((context.ownerReadSet as Row)[key]) || (context.ownerReadSet as Row)[key] < 0)
    || !id(p.sceneKit?.sceneKitId) || !Number.isSafeInteger(p.sceneKit?.revision) || p.sceneKit.revision < 1) throw new Error('Invalid owner binding context.');
  const zones = new Set<string>(), actors = new Set<string>(), targets = new Set<string>(), aliases = new Map<string, string>();
  for (const [field, key] of [['zones', 'zoneId'], ['actorFrames', 'actorFrameId'], ['elements', 'elementId']]) {
    if (!Array.isArray(p[field])) throw new Error('Incomplete owner dossier.');
    for (const record of p[field]) {
      if (!id(record[key]) || targets.has(record[key]) || record.campaignId !== window.campaignId) throw new Error('Foreign or duplicate owner dossier record.');
      targets.add(record[key]);
      if (field === 'zones') zones.add(record[key]);
      if (field === 'actorFrames') {
        if (!id(record.actorRef) || aliases.has(record.actorRef)) throw new Error('Invalid owner actor.');
        actors.add(record.actorRef); actors.add(record[key]); targets.add(record.actorRef);
        aliases.set(record.actorRef, record[key]); aliases.set(record[key], record[key]);
      }
    }
  }
  for (const boundary of [...(p.preparedBoundaries ?? []), ...p.zones.flatMap((zone: Row) => zone.thresholds ?? [])]) {
    if (!id(boundary.boundaryId)) throw new Error('Invalid owner boundary.'); targets.add(boundary.boundaryId);
  }
  const affordances = new Map<string, Row>();
  for (const a of p.sceneStoryDesign?.affordances ?? []) {
    if (!id(a.coverageEntryId) || affordances.has(a.coverageEntryId) || !zones.has(a.zoneRef) || !targets.has(a.targetRef)
      || !FAMILIES.has(a.actionFamily) || ['accessClass', 'thresholdRef', 'capabilityClass'].some((key) => a[key] !== null && !id(a[key]))) throw new Error('Invalid owner affordance.');
    affordances.set(a.coverageEntryId, a);
  }
  const evidence = new Map<string, Row>();
  if (!Array.isArray(context.observations) || context.observations.length > 64) throw new Error('Invalid owner observation projection.');
  for (const row of context.observations) {
    if (!closed(row, ['evidenceRef', 'campaignId', 'groupId', 'observerKind', 'observerRef', 'methodRef', 'formRef', 'zoneRef', 'accessRef', 'capabilityRef', 'vcsCharacterRevision', 'ownerReceiptRefs'])
      || !id(row.evidenceRef) || evidence.has(row.evidenceRef) || row.campaignId !== window.campaignId
      || !id(row.groupId) || !['character', 'familiar', 'sensor', 'ally'].includes(row.observerKind)
      || !actors.has(row.observerRef) || !id(row.methodRef) || !zones.has(row.zoneRef) || !id(row.accessRef)
      || row.formRef !== null && !id(row.formRef) || row.capabilityRef !== null && !id(row.capabilityRef)
      || ['familiar', 'sensor'].includes(row.observerKind) && row.capabilityRef === null
      || row.vcsCharacterRevision !== context.ownerReadSet.vcsCharacterRevision
      || !Array.isArray(row.ownerReceiptRefs) || !row.ownerReceiptRefs.length || row.ownerReceiptRefs.length > 16 || row.ownerReceiptRefs.some((ref: unknown) => !id(ref))) throw new Error('Invalid confirmed owner observation evidence.');
    evidence.set(row.evidenceRef, row);
  }
  return { window, zones, actors, targets, aliases, affordances, evidence };
}

export function scenePendingIntentBindingIssues(value: unknown, context: ScenePendingBindingContext): string[] {
  try {
    const catalog = contextCatalog(context), slots = context.qualifiedBindingSlots ?? pendingIntentBindingSlots(context.source), window = catalog.window;
    if (!closed(value, ['schemaVersion', 'bindingId', 'operationId', 'campaignId', 'windowId', 'windowFingerprint', 'sceneKitRef', 'nodes'])) return ['/'];
    if (value.schemaVersion !== SCENE_PENDING_INTENT_BINDINGS_VERSION || !id(value.bindingId)
      || value.operationId !== context.operationId || value.campaignId !== window.campaignId
      || value.windowId !== window.windowId || value.windowFingerprint !== window.windowFingerprint
      || !same(value.sceneKitRef, { sceneKitId: context.proposal.sceneKit.sceneKitId, revision: context.proposal.sceneKit.revision })) return ['/identity'];
    if (!Array.isArray(value.nodes) || value.nodes.length !== slots.length || value.nodes.length > SCENE_PENDING_INTENT_BINDING_LIMITS.nodes
      || new Set(value.nodes.map((row: Row) => row?.nodeRef)).size !== slots.length) return ['/nodes'];
    const issues: string[] = [];
    for (const slot of slots) {
      const row = value.nodes.find((entry: Row) => entry?.nodeRef === slot.nodeRef), path = `/nodes/${slot.nodeRef}`;
      if (!closed(row, ['nodeRef', 'disposition', 'references', 'coverage', 'observations', 'instructionEvidence', 'rationale', 'question'])
        || !text(row.rationale) || !slot.instructionEvidence.some((span: Row) => same(span, row.instructionEvidence))
        || !Array.isArray(row.references) || !Array.isArray(row.coverage) || !Array.isArray(row.observations)) { issues.push(path); continue; }
      if (row.disposition === 'clarification_required') {
        if (!text(row.question, 500) || row.references.length || row.coverage.length || row.observations.length) issues.push(`${path}/clarification`);
        continue;
      }
      if (row.disposition !== 'bound' || row.question !== null) { issues.push(`${path}/disposition`); continue; }
      const selected = new Map<string, string>();
      if (row.references.length !== slot.references.length) issues.push(`${path}/references`);
      for (const binding of row.references) {
        const original = slot.references.find((entry: Row) => entry.slotId === binding?.slotId);
        if (!closed(binding, ['slotId', 'selectedRef']) || !original || selected.has(binding.slotId) || !id(binding.selectedRef)
          || original.originalRef !== null && binding.selectedRef !== original.originalRef) { issues.push(`${path}/references`); continue; }
        const allowed = original.role === 'method' ? [...catalog.evidence.values()].some((e: Row) => e.methodRef === binding.selectedRef)
          : original.role === 'form' ? [...catalog.evidence.values()].some((e: Row) => e.formRef === binding.selectedRef)
          : ['actor', 'observer'].includes(original.role) ? catalog.actors.has(binding.selectedRef) : catalog.targets.has(binding.selectedRef);
        if (!allowed) issues.push(`${path}/references`);
        selected.set(binding.slotId, binding.selectedRef);
      }
      const observed = new Map<string, Row>();
      if (row.observations.length !== slot.observationGroups.length) issues.push(`${path}/observations`);
      for (const binding of row.observations) {
        const group = slot.observationGroups.find((entry: Row) => entry.groupId === binding?.groupId), evidence = catalog.evidence.get(binding?.ownerEvidenceRef);
        if (!closed(binding, ['groupId', 'ownerEvidenceRef']) || !group || !evidence || observed.has(binding.groupId)
          || evidence.groupId !== group.groupId || evidence.observerKind !== group.observerKind) { issues.push(`${path}/observations`); continue; }
        for (const role of ['observer', 'method', 'form']) {
          const reference = slot.references.find((entry: Row) => entry.groupId === group.groupId && entry.role === role);
          if (reference && selected.get(reference.slotId) !== evidence[`${role}Ref`]) issues.push(`${path}/observations`);
        }
        observed.set(group.groupId, evidence);
      }
      const covered = new Set<string>();
      if (row.coverage.length !== slot.coverage.length) issues.push(`${path}/coverage`);
      const originalNode = window.nodes.find((entry: Row) => entry.nodeRef === slot.nodeRef);
      const kind = originalNode.node.actionFamily ?? originalNode.node.kind, family = FAMILY[kind];
      for (const binding of row.coverage) {
        const original = slot.coverage.find((entry: Row) => entry.slotId === binding?.slotId), a = catalog.affordances.get(binding?.coverageEntryRef);
        if (!closed(binding, ['slotId', 'coverageEntryRef']) || !original || !a || covered.has(binding.slotId)
          || original.originalCoverageEntryRef !== null && binding.coverageEntryRef !== original.originalCoverageEntryRef
          || !family || a.actionFamily !== family) { issues.push(`${path}/coverage`); continue; }
        covered.add(binding.slotId);
        for (const reference of slot.references) {
          // /5 supplies one exact role-qualified surface per material effect
          // target. Other roles close through their own surface, never through
          // a convenient endpoint shared with the entire node.
          if (original.targetSlotId && reference.slotId !== original.targetSlotId) continue;
          if (original.targetSlotId && ['actor', 'origin'].includes(reference.role)) {
            const ref = selected.get(reference.slotId);
            if (ref !== a.targetRef && !(catalog.aliases.has(ref) && catalog.aliases.get(ref) === catalog.aliases.get(a.targetRef))) issues.push(`${path}/coverage`);
          }
          // An explicit /6 effect has its own surface. References owned by
          // separate information reads (for example the worker's identity)
          // are checked by those reads, not equated with the effect's target.
          // Node-level location bindings still constrain this effect below.
          if (['gma.semantic-action-program/6', 'gma.semantic-action-program/7'].includes(context.source.program.schemaVersion)
            && original.effectId !== undefined && !original.targetSlotId && reference.requirementId !== undefined) continue;
          // A /6 prerequisite read closes against its own requirement slots.
          // Node-level future location is still checked by the explicit effect
          // surface; it must not relocate an identity or method read.
          if (['gma.semantic-action-program/6', 'gma.semantic-action-program/7'].includes(context.source.program.schemaVersion)
            && original.requirementId !== null && original.requirementId !== undefined
            && reference.locationFingerprint !== undefined) continue;
          if (original.requirementId !== null && reference.requirementId !== undefined && reference.requirementId !== original.requirementId) continue;
          // /6 separates present-state reads from requested effects. A node's
          // destination is checked by its location/effect surfaces, not by the
          // independent "who is here now?" prerequisite. Historical bindings
          // keep their existing closure rules; no selected destination changes.
          const requirement = originalNode.requirements.find((entry: Row) => entry.requirementId === original.requirementId)?.value;
          if (['gma.semantic-action-program/6', 'gma.semantic-action-program/7'].includes(context.source.program.schemaVersion)
            && requirement?.kind === 'scene_presence' && requirement.dimension === 'who'
            && reference.locationFingerprint !== undefined && ['destination', 'area'].includes(reference.role)) continue;
          const ref = selected.get(reference.slotId);
          const remoteViewer = reference.role === 'recipient' && family === 'observe'
            && context.remoteViewerCoverage?.some((witness) => witness.nodeRef === slot.nodeRef
              && witness.slotId === reference.slotId && witness.recipientRef === ref);
          if (['subject', 'recipient', 'object'].includes(reference.role) && ref !== a.targetRef
            && !remoteViewer && !(catalog.aliases.has(ref) && catalog.aliases.get(ref) === catalog.aliases.get(a.targetRef))) issues.push(`${path}/coverage`);
          if (['destination', 'area'].includes(reference.role) && ref !== a.zoneRef && ref !== a.targetRef) issues.push(`${path}/coverage`);
        }
        if (slot.observationGroups.length) {
          const candidates = original.groupId === null ? [...observed.values()] : [observed.get(original.groupId)].filter((e): e is Row => e !== undefined);
          if (!candidates.some((e: Row) => e.zoneRef === a.zoneRef && e.accessRef === a.accessClass && e.capabilityRef === a.capabilityClass)) issues.push(`${path}/coverage`);
        }
      }
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > SCENE_PENDING_INTENT_BINDING_LIMITS.bytes) issues.push('/bytes');
    return [...new Set(issues)];
  } catch { return ['/context']; }
}

/** Repair is a pure full-successor merge, not a retry/model operation. */
export function mergeScenePendingIntentBindingRepair(value: Row, replacements: Row[], failedNodeRefs: string[], context: ScenePendingBindingContext): Row {
  if (!failedNodeRefs.length || new Set(failedNodeRefs).size !== failedNodeRefs.length
    || replacements.length !== failedNodeRefs.length || new Set(replacements.map((row) => row.nodeRef)).size !== replacements.length
    || failedNodeRefs.some((ref) => !value.nodes?.some((row: Row) => row.nodeRef === ref))
    || replacements.some((row) => !failedNodeRefs.includes(row.nodeRef))) throw new Error('Binding repair exceeds its failed-node scope.');
  const result = structuredClone(value);
  result.nodes = result.nodes.map((row: Row) => structuredClone(replacements.find((replacement) => replacement.nodeRef === row.nodeRef) ?? row));
  if (scenePendingIntentBindingIssues(result, context).length) throw new Error('Binding repair does not produce a valid complete successor.');
  return result;
}

const identifierSchema = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' } as const;
const strictSchema = (properties: Row) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const stringSchema = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
export const SCENE_PENDING_INTENT_BINDINGS_SCHEMA = strictSchema({
  schemaVersion: { const: SCENE_PENDING_INTENT_BINDINGS_VERSION }, bindingId: identifierSchema, operationId: identifierSchema,
  campaignId: identifierSchema, windowId: identifierSchema, windowFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  sceneKitRef: strictSchema({ sceneKitId: identifierSchema, revision: { type: 'integer', minimum: 1 } }),
  nodes: { type: 'array', minItems: 1, maxItems: SCENE_PENDING_INTENT_BINDING_LIMITS.nodes, items: strictSchema({
    nodeRef: identifierSchema, disposition: { enum: ['bound', 'clarification_required'] },
    references: { type: 'array', maxItems: SCENE_PENDING_INTENT_BINDING_LIMITS.referencesPerNode,
      items: strictSchema({ slotId: identifierSchema, selectedRef: identifierSchema }) },
    coverage: { type: 'array', maxItems: SCENE_PENDING_INTENT_BINDING_LIMITS.coveragePerNode,
      items: strictSchema({ slotId: identifierSchema, coverageEntryRef: identifierSchema }) },
    observations: { type: 'array', maxItems: 8, items: strictSchema({ groupId: identifierSchema, ownerEvidenceRef: identifierSchema }) },
    instructionEvidence: strictSchema({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 }, quote: stringSchema(32_768) }),
    rationale: stringSchema(1_000), question: { anyOf: [stringSchema(500), { type: 'null' }] },
  }) },
});

const canonicalScene = (value: any): string => Array.isArray(value) ? `[${value.map(canonicalScene).join(',')}]`
  : object(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalScene(value[key])}`).join(',')}}` : JSON.stringify(value);
/** Same canonical dossier digest as the existing Scene owner, not raw text. */
const sceneDigest = (value: unknown) => createHash('sha256').update(canonicalScene(value), 'utf8').digest('hex');

export function scenePendingIntentExaminationIdentity(bindings: Row, context: ScenePendingBindingContext, policyFingerprint: string): Row {
  if (scenePendingIntentBindingIssues(bindings, context).length || !/^[a-f0-9]{64}$/.test(policyFingerprint)) throw new Error('Invalid pending binding examination input.');
  const window = createPendingIntentWindow(context.source);
  return { operationId: context.operationId, campaignId: window.campaignId, dossierFingerprint: sceneDigest(context.proposal), policyFingerprint,
    intentWindowFingerprint: window.windowFingerprint, bindingFingerprint: freeformJsonDigest(bindings), ownerReadSetFingerprint: freeformJsonDigest({
      ownerReadSet: context.ownerReadSet, observations: context.observations }),
    pendingIntentPolicyFingerprint: freeformJsonDigest({ binding: SCENE_PENDING_INTENT_BINDING_POLICY_VERSION,
      examiner: SCENE_PENDING_INTENT_EXAMINER_POLICY_VERSION }),
    selectedDepth: context.proposal.requestedDepth };
}

/** Combined /2 assessment checks supplement, never replace, authenticated
 * Scene validation and current-owner checks at the later atomic save. */
export function scenePendingIntentExaminationIssues(value: unknown, bindings: Row, context: ScenePendingBindingContext, policyFingerprint: string): string[] {
  try {
    const identity = scenePendingIntentExaminationIdentity(bindings, context, policyFingerprint), catalog = contextCatalog(context);
    if (!closed(value, ['schemaVersion', 'assessmentId', ...Object.keys(identity), 'verdict', 'confidence', 'counterfactualProbes', 'debt', 'rationale', 'evidenceRefs', 'bindingReviews'])
      || value.schemaVersion !== 'gma.scene-readiness-assessment/2' || !id(value.assessmentId)
      || Object.entries(identity).some(([key, expected]) => value[key] !== expected)) return ['/identity'];
    const probeRefs = new Set([...(context.proposal.zones ?? []).map((r: Row) => r.zoneId),
      ...(context.proposal.actorFrames ?? []).map((r: Row) => r.actorFrameId), ...(context.proposal.elements ?? []).map((r: Row) => r.elementId),
      ...(context.proposal.facts ?? []).map((r: Row) => r.factId)]);
    const reviewRefs = new Set([...probeRefs, ...catalog.targets, ...catalog.affordances.keys(), ...catalog.evidence.keys(), bindings.bindingId,
      catalog.window.windowId, context.proposal.sceneReality?.realityId, context.proposal.sceneStoryDesign?.designId,
      ...(context.proposal.sceneStoryDesign?.affordances ?? []).map((row: Row) => row.affordanceId),
      ...context.observations.flatMap((row) => [row.groupId, row.observerRef, row.methodRef, row.accessRef, row.capabilityRef, ...row.ownerReceiptRefs]),
      ...catalog.window.prerequisiteReceipts.flatMap((row: Row) => [row.receiptRef,
        ...row.ownerReceiptRefs.map((receipt: unknown) => typeof receipt === 'string' ? receipt : object(receipt) ? receipt.receiptRef : null)]),
      ...catalog.window.nodes.flatMap((row: Row) => row.requirements.flatMap((r: Row) => [r.requirementId, r.value.observation?.outcomeId]).filter(Boolean)),
      ...(context.ownerEvidenceRefs ?? []),
      ...pendingIntentBindingSlots(context.source).flatMap((r) => [r.nodeRef, ...r.references.map((s: Row) => s.slotId), ...r.coverage.map((s: Row) => s.slotId)])]);
    const refs = (entries: unknown, maximum: number, allowed: Set<string>, minimum = 1) => Array.isArray(entries)
      && entries.length >= minimum && entries.length <= maximum && new Set(entries).size === entries.length
      && entries.every((ref) => id(ref) && allowed.has(ref));
    const issues: string[] = [];
    if (!['adequate', 'repair_required'].includes(value.verdict) || !['low', 'medium', 'high'].includes(value.confidence)
      || !text(value.rationale, 2_000) || !refs(value.evidenceRefs, 128, reviewRefs)) issues.push('/assessment');
    if (!Array.isArray(value.counterfactualProbes) || value.counterfactualProbes.length < 3 || value.counterfactualProbes.length > 16
      || value.counterfactualProbes.some((p: Row) => !closed(p, ['probe', 'status', 'evidenceRefs']) || !text(p.probe)
        || !['supported', 'unsupported'].includes(p.status) || !refs(p.evidenceRefs, 32, probeRefs, p.status === 'supported' ? 1 : 0))) issues.push('/counterfactualProbes');
    const domains = ['locus', 'topology', 'actors', 'elements', 'information', 'operations', 'story_alignment', 'consequences', 'capabilities', 'unknowns', 'timeline', 'pending_intent'];
    if (!Array.isArray(value.debt) || value.debt.length > 32 || new Set(value.debt.map((d: Row) => d?.debtId)).size !== value.debt.length
      || value.debt.some((d: Row) => !closed(d, ['debtId', 'domain', 'description', 'blocking', 'affectedRefs']) || !id(d.debtId)
        || !domains.includes(d.domain) || !text(d.description) || typeof d.blocking !== 'boolean' || !refs(d.affectedRefs, 32, reviewRefs))) issues.push('/debt');
    if (!Array.isArray(value.bindingReviews) || value.bindingReviews.length !== bindings.nodes.length
      || new Set(value.bindingReviews.map((r: Row) => r?.nodeRef)).size !== bindings.nodes.length) issues.push('/bindingReviews');
    else for (const row of bindings.nodes) {
      const r = value.bindingReviews.find((entry: Row) => entry?.nodeRef === row.nodeRef);
      if (!closed(r, ['nodeRef', 'bindingRowFingerprint', 'verdict', 'rationale', 'evidenceRefs', 'mechanicsState'])
        || r.bindingRowFingerprint !== freeformJsonDigest(row) || !['supported', 'unsupported'].includes(r.verdict)
        || !text(r.rationale) || !refs(r.evidenceRefs, 32, reviewRefs) || r.mechanicsState !== 'not_resolved'
        || row.disposition !== 'bound' && r.verdict === 'supported') issues.push('/bindingReviews');
    }
    if (value.verdict === 'adequate' && (bindings.nodes.some((r: Row) => r.disposition !== 'bound')
      || value.bindingReviews?.some((r: Row) => r.verdict !== 'supported') || value.debt?.some((d: Row) => d.blocking)
      || value.counterfactualProbes?.some((p: Row) => p.status !== 'supported')
      || ['investigative', 'encounter_set_piece'].includes(value.selectedDepth) && value.confidence === 'low')) issues.push('/verdict');
    if (value.verdict === 'repair_required' && value.bindingReviews?.some((r: Row) => r.verdict === 'unsupported')
      && !value.debt?.some((d: Row) => d.domain === 'pending_intent' && d.blocking)) issues.push('/debt');
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32_768) issues.push('/bytes');
    return [...new Set(issues)];
  } catch { return ['/context']; }
}
