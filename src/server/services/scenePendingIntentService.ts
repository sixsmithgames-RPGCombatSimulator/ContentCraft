import { freeformJsonDigest, canonicalFreeformJson } from '../../shared/llm/freeformPlanBinding.js';
import { createPendingIntentWindow } from '../../shared/llm/pendingIntentWindow.js';
import { pendingIntentBindingSlots } from '../../shared/llm/scenePendingIntentBindings.js';
import { projectAppliedIntentBindings } from '../../shared/llm/scenePendingIntentApplication.js';
export { scenePendingBindingContextFromOwner as pendingBindingContext } from '../../shared/llm/sceneReadEffectBindings.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';

type Row = Record<string, any>;
type Scope = { userId: string; campaignId: string; programId: string; qualified?: boolean; continuation?: boolean; readEffects?: boolean };
export const PENDING_INTENT_CONTEXT_VERSION = 'gmc.scene-pending-intent-context/1';
export const PENDING_INTENT_WRITES_ENABLED = process.env.GMC_SCENE_PENDING_INTENT_BINDINGS !== '0';
export { pendingScenePolicyFingerprint } from '../../shared/llm/scenePendingIntentApplication.js';
export interface PendingIntentReaders {
  readArtifact: (scope: Scope) => Promise<any>;
  readObservation: (scope: Scope) => Promise<any>;
}
const fail = (field = 'pendingIntent') => { throw new StoryWorkspaceStoreError(409, 'SCENE_PENDING_INTENT_AUTHORITY_CONFLICT', 'The unfinished action or its observation authority changed.', { field }); };
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);

export async function readScenePendingIntentContext(input: Scope, readers?: PendingIntentReaders): Promise<JsonObject> {
  if (input.readEffects) {
    const current = await (await import('./pendingObserverEvidenceStore.js')).pendingObserverEvidenceService().context({ ...input, continuation: true });
    return { ...current, schemaVersion: 'gmc.scene-pending-intent-context/4' };
  }
  if (input.qualified || input.continuation) return (await import('./pendingObserverEvidenceStore.js')).pendingObserverEvidenceService().context(input);
  const owners = readers ?? {
    readArtifact: async (scope: Scope) => (await import('./compoundActionArtifactStore.js')).readActiveCompoundActionArtifact(scope),
    readObservation: async (scope: Scope) => (await import('./observationAuthorityService.js')).readObservationAuthority(scope),
  };
  const [loaded, authority] = await Promise.all([owners.readArtifact(input), owners.readObservation(input)]);
  if (!loaded?.artifact || !authority || loaded.artifactRef?.campaignId !== input.campaignId
    || loaded.artifactRef?.programId !== input.programId) return fail();
  const artifact = loaded.artifact;
  const source = { instruction: artifact.instruction, program: artifact.program, cursor: artifact.cursor,
    artifactRevision: loaded.artifactRef.revision, receipts: artifact.receipts };
  const window = createPendingIntentWindow(source), slots = pendingIntentBindingSlots(source);
  if (window.campaignId !== input.campaignId || authority.workspaceRef?.campaignId !== input.campaignId) return fail();
  const ownerReadSet = { campaignId: input.campaignId, storyWorkspaceRevision: authority.workspaceRef.revision,
    sceneRevision: authority.sceneKitRef.revision, vcsCharacterRevision: artifact.cursor.authorityHead.vcsCharacterRevision };
  const observationSeeds: Row[] = [];
  const groupRefs = slots.flatMap((slot) => slot.observationGroups.map((group: Row) => group.groupId));
  if (new Set(groupRefs).size !== groupRefs.length) return fail();
  for (const slot of slots) for (const group of slot.observationGroups) {
    // The existing projection confirms an already-active observer, not an
    // arbitrary form ID copied from a plan. Never manufacture that evidence.
    if (group.formRef != null || group.formTargetId != null) continue;
    const outcomes = window.nodes.find((n: Row) => n.nodeRef === slot.nodeRef)!.requirements
      .filter((r: Row) => group.outcomeIds.includes(r.value.observation?.outcomeId)).map((r: Row) => r.value.observation);
    for (const binding of authority.actorMechanicsBindings ?? []) {
      if (binding.state !== 'active' || binding.campaignRef !== input.campaignId
        || group.observerRef !== null && group.observerRef !== binding.actorRef) continue;
      for (const access of authority.observationAccess ?? []) {
        const visible = outcomes.map((outcome: Row) => (authority.observables ?? []).filter((o: Row) => o.subjectRef === outcome.targetRef
          && o.facet === outcome.facet && o.viewpointRef === access.candidateViewpointRef
          && o.perceptibility?.observerRefs?.includes(binding.actorRef)));
        if (visible.some((rows: Row[]) => !rows.length)) continue;
        const methods = (visible[0] as Row[]).flatMap((o) => o.perceptibility.methodRefs ?? [])
          .filter((method: string) => visible.every((rows: Row[]) => rows.some((o) => o.perceptibility.methodRefs?.includes(method))));
        for (const methodRef of new Set<string>(methods)) {
          if (group.methodRef !== null && group.methodRef !== methodRef) continue;
          const body = { nodeRef: slot.nodeRef, campaignId: input.campaignId, groupId: group.groupId, observerKind: group.observerKind,
            observerRef: binding.actorRef, methodRef, formRef: group.formRef ?? null, accessRef: access.accessId,
            capabilityRef: access.requiredCapabilityRefs?.includes(methodRef) ? methodRef : null,
            vcsCharacterRevision: ownerReadSet.vcsCharacterRevision,
            ownerReceiptRefs: [...new Set<string>(binding.provenanceReceiptRefs ?? [])],
            mechanicsBinding: structuredClone(binding), access: structuredClone(access),
            subjectRefs: outcomes.map((o: Row) => o.targetRef), outcomeIds: [...group.outcomeIds] };
          if (!body.ownerReceiptRefs.length || ['familiar', 'sensor'].includes(group.observerKind) && body.capabilityRef === null) continue;
          observationSeeds.push({ ...body, evidenceRef: `pending-observation:${freeformJsonDigest(body).slice(0, 40)}` });
        }
      }
    }
  }
  const result = { schemaVersion: PENDING_INTENT_CONTEXT_VERSION, artifactRef: structuredClone(loaded.artifactRef),
    source, window, slots, ownerReadSet, observationSeeds,
    typedObservationAuthority: { sceneKitRef: structuredClone(authority.sceneKitRef),
      actorMechanicsBindings: structuredClone(authority.actorMechanicsBindings ?? []), observationAccess: structuredClone(authority.observationAccess ?? []),
      observables: structuredClone(authority.observables ?? []), obstructions: structuredClone(authority.obstructions ?? []) } };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 65_536) return fail();
  return result as JsonObject;
}

export function assertPendingIntentContextCurrent(expected: Row, current: Row): void {
  if (!same(expected, current)) fail();
}

/** Scene /5 admits both exact actor/frame participant refs and explicit local
 * roles. This checks scene membership only, never arrival in a prepared zone,
 * a capability, concealment, or access to information. No name matching. */
export function preparedReadEffectActorIsPresent(actor: Row | undefined, context: Row | null): boolean {
  if (!actor) return false;
  const aliases = new Set([actor.actorRef, actor.actorFrameId].filter((ref) => typeof ref === 'string' && ref.length));
  return (context?.presentActors ?? []).some((ref: unknown) => aliases.has(ref))
    || (context?.sceneLocalRoles ?? []).some((role: Row) => Number.isSafeInteger(role.count) && role.count > 0 && aliases.has(role.roleId));
}

/** Exact examined read coverage, never an attempted effect or resolved check. */
export function preparedReadEffectReadEvidence(row: Row, affordance: Row | undefined, bundle: Row, present: boolean) {
  const ref = row.targetRef ?? (row.kind === 'current_location' ? affordance?.targetRef : undefined);
  const target = [...bundle.actorFrames, ...bundle.elements, ...bundle.zones]
    .find((record: Row) => [record.actorRef, record.actorFrameId, record.elementId, record.zoneId].includes(ref) && ref != null);
  const facts = (affordance?.factRefs ?? []).map((factRef: string) => bundle.facts.find((fact: Row) => fact.factId === factRef));
  const factRead = ['story_fact', 'recent_continuity'].includes(row.kind);
  const available = row.kind === 'scene_presence' ? present : factRead
    ? facts.length > 0 && facts.every((fact: Row) => fact && !['missing_preparation', 'deliberate_unknown'].includes(fact.epistemicState))
    : Boolean(target);
  return { available: Boolean(affordance) && available
    && ['scene_presence', 'actor_identity', 'current_location', 'destination_location', 'canonical_reference', 'story_fact', 'recent_continuity'].includes(row.kind),
  sourceRef: ref ?? null };
}

/** Existence/preparation checks only. Never resolves cover, a roll or discovery.
 * Supplied rows must equal the owner-saved effective node, not client guesses. */
export function preparedPendingRequirementProjection(input: Row, loaded: Row, active: Row, sceneContext: Row): Row | null {
  const artifact = loaded?.artifact, applications = artifact?.intentBindingApplications ?? [];
  const application = [...applications].reverse().find((entry: Row) => entry.record.bindings.nodes.some((row: Row) => row.nodeRef === input.nodeId));
  if (!application) return null;
  const bundle = active?.bundle, head = artifact.cursor.authorityHead;
  const checks = { scope: loaded.artifactRef.campaignId === input.campaignId && loaded.artifactRef.programId === input.programId,
    pendingNode: !artifact.cursor.completedNodeRefs.includes(input.nodeId) && !artifact.cursor.skippedNodeRefs.includes(input.nodeId),
    bindingRecord: bundle?.pendingIntentBindingRecord?.recordId === application.record.recordId,
    preparedScene: bundle?.sceneKit.sceneKitId === application.record.bindings.sceneKitRef.sceneKitId && bundle.sceneKit.revision === head.sceneRevision,
    workspaceHead: sceneContext.storyWorkspaceRef?.revision === head.storyWorkspaceRevision,
    sceneHead: sceneContext.playableSceneContext?.sceneKitRef?.revision === head.sceneRevision };
  const failed = Object.entries(checks).find(([, valid]) => !valid);
  if (failed) return fail(`preparedRequirements.${failed[0]}`);
  const effective = projectAppliedIntentBindings(artifact.instruction, artifact.program, applications);
  const node = effective.nodes.find((row: Row) => row.nodeId === input.nodeId);
  const requirements = node.dataRequirements.map((row: Row, index: number) => ({ ...row,
    requirementId: row.requirementId ?? `${node.nodeId}:requirement:${index + 1}` }))
    .filter((row: Row) => !['character_capability', 'resource', 'mechanic'].includes(row.kind));
  if (!same(requirements, input.requirements)) return fail('preparedRequirements.source');
  const requirementResults = requirements.map((row: Row) => {
    const affordance = bundle.sceneStoryDesign.affordances.find((a: Row) => a.coverageEntryId === row.coverageEntryRef);
    const actor = bundle.actorFrames.find((a: Row) => a.actorRef === row.targetRef || a.actorFrameId === row.targetRef);
    const target = actor ?? [...bundle.elements, ...bundle.zones].find((r: Row) => (r.elementId ?? r.zoneId) === row.targetRef);
    const facts = (affordance?.factRefs ?? []).map((ref: string) => bundle.facts.find((fact: Row) => fact.factId === ref));
    const present = application.record.schemaVersion === 'gmc.scene-pending-intent-binding-record/4'
      ? preparedReadEffectActorIsPresent(actor, sceneContext.playableSceneContext)
      : actor && (sceneContext.playableSceneContext?.presentActors ?? []).some((ref: unknown) => ref === actor.actorRef);
    const readEffectEvidence = application.record.schemaVersion === 'gmc.scene-pending-intent-binding-record/4'
      ? preparedReadEffectReadEvidence(row, affordance, bundle, Boolean(present)) : null;
    const available = readEffectEvidence ? readEffectEvidence.available : row.kind === 'scene_presence' ? present : row.kind === 'story_fact'
      ? facts.length > 0 && facts.every((fact: Row) => fact && !['missing_preparation', 'deliberate_unknown'].includes(fact.epistemicState)) : target;
    if (!affordance || !available || !readEffectEvidence && !['scene_presence', 'actor_identity', 'current_location', 'destination_location', 'canonical_reference', 'story_fact'].includes(row.kind)) return fail('preparedRequirements.reference');
    return { requirementId: row.requirementId, dimension: row.dimension, kind: row.kind, status: 'resolved', authority: 'gmc',
      sourceRefs: [...new Set([readEffectEvidence?.sourceRef ?? row.targetRef, affordance.coverageEntryId, ...(affordance.factRefs ?? [])].filter(Boolean))],
      revision: head.sceneRevision, reasonCode: 'PREPARED_PENDING_REFERENCE_CONFIRMED_NOT_EXECUTED' };
  });
  return { contractVersion: 'gmc.compound-action-requirement-projection/1', programId: input.programId, nodeId: input.nodeId,
    authority: 'gmc', authorityHead: { storyWorkspaceRevision: head.storyWorkspaceRevision, sceneRevision: head.sceneRevision }, requirementResults };
}
