import { describe, expect, it } from 'vitest';
import { conditionalViewpointRef } from '../../shared/llm/scenePendingIntentQualified.js';
import type { Collection } from 'mongodb';
import { pendingObserverEvidenceService, type ObserverEvidenceDependencies, type ObserverEvidenceDocument,
  type ObserverOriginDocument, type ObserverCapabilityEvidence } from './pendingObserverEvidenceStore.js';
import { readScenePendingIntentContext } from './scenePendingIntentService.js';
import { freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { pendingObserverEvidenceIssues } from '../../shared/llm/pendingObserverEvidence.js';
import type { ActorMechanicsLink } from '../../shared/llm/actorMechanicsLink.js';
import type { PendingIntentWindowSource } from '../../shared/llm/pendingIntentWindow.js';
import { continuationPendingFixture } from '../../shared/llm/fixtures/continuationPending.js';
import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';

function memory<T extends { _id: string }>() {
  const rows: T[] = [];
  const matches = (row: T, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => row[key as keyof T] === value);
  const api = {
    async findOne(filter: Record<string, unknown>) { return structuredClone(rows.find((row) => matches(row, filter)) ?? null); },
    async insertOne(row: T) {
      if (rows.some((prior) => prior._id === row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      rows.push(structuredClone(row));
    },
    find(filter: Record<string, unknown>) {
      return { limit(count: number) { return { async toArray() { return structuredClone(rows.filter((row) => matches(row, filter)).slice(0, count)); } }; } };
    },
  };
  return { rows, collection: api as unknown as Pick<Collection<T>, 'findOne' | 'insertOne' | 'find'> };
}
function fixture() {
  const scope = { userId: 'owner:one', campaignId: 'campaign:one', programId: 'program:one' };
  const exactText = 'Send my rat familiar into the tunnel, then watch through its eyes.';
  const instruction = { instructionRef: 'instruction:one', exactText, instructionFingerprint: freeformTextDigest(exactText) };
  const source: PendingIntentWindowSource = { instruction, artifactRevision: 1, receipts: [],
    program: { schemaVersion: 'gma.semantic-action-program/4', programId: scope.programId, instructionRef: instruction.instructionRef,
      instructionFingerprint: instruction.instructionFingerprint, authorityBase: { campaignId: scope.campaignId }, nodes: [
        { nodeId: 'node:enter', kind: 'move', dependsOn: [], evidenceSpans: [{ start: 0, end: 36 }], dataRequirements: [],
          semanticLocationBindings: { bindings: [{ role: 'destination', authorityRef: 'element:tunnel', description: 'the tunnel' }] },
          observationPrerequisite: { groupRefs: ['group:familiar'], dependentObservationNodeRefs: ['node:watch'] } },
        { nodeId: 'node:watch', kind: 'observe', dependsOn: ['node:enter'], evidenceSpans: [{ start: 43, end: exactText.length }],
          observationGroups: [{ groupId: 'group:familiar', observerKind: 'familiar', observerRef: null, methodRef: null, formRef: null,
            formTargetId: 'form:requested', outcomeIds: ['outcome:view'], viewpointBinding: 'after:node:enter' }],
          dataRequirements: [{ kind: 'observation', observation: { outcomeId: 'outcome:view', targetRef: 'element:tunnel',
            facet: 'surface_description', relationOriginRef: null } }] },
      ] },
    cursor: { programId: scope.programId, revision: 1, completedNodeRefs: [], skippedNodeRefs: [], readyNodeRefs: ['node:enter'],
      remainingNodeRefs: ['node:watch'], waiting: null, authorityHead: { storyWorkspaceRevision: 38, sceneRevision: 5, vcsCharacterRevision: 0 } } };
  const authority = { workspaceRef: { campaignId: scope.campaignId, revision: 38 },
    sceneKitRef: { sceneKitId: 'scene:one', revision: 5, payloadFingerprint: 'b'.repeat(64) }, actorMechanicsBindings: [],
    observationAccess: [], observables: [], obstructions: [] };
  const records = memory<ObserverEvidenceDocument>(), origins = memory<ObserverOriginDocument>();
  const link: ActorMechanicsLink = { schemaVersion: 'gmc.actor-mechanics-link/1', linkRef: 'link:familiar', campaignRef: scope.campaignId,
    actorRef: 'actor:familiar', actorRecordRef: 'actor:familiar', actorRecordRevision: 5, subjectKind: 'familiar', parentActorRef: 'actor:player',
    mechanicsSubjectRef: 'vcs:familiar:one', vcsOwnerRef: scope.userId, vcsCharacterRef: 'vcs:character:one',
    vcsRevision: 'a'.repeat(64), vcsCharacterRevision: 'c'.repeat(64), provenanceReceiptRefs: ['vcs:receipt:rat'],
    humanDecisionRef: 'decision:familiar', state: 'active' };
  const links = [link];
  const frames = [{ actorRef: 'actor:familiar', actorFrameId: 'frame:familiar', zoneRef: 'zone:entrance' }];
  const deps: ObserverEvidenceDependencies = { records: records.collection, origins: origins.collection,
    writeCampaignAllowlist: [scope.campaignId], assertWorkflowOpen: async () => {},
    readPending: (input) => readScenePendingIntentContext(input, {
      readArtifact: async () => ({ artifactRef: { ...scope, revision: source.artifactRevision }, artifact: source }),
      readObservation: async () => structuredClone(authority),
    }),
    readLinks: async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 2, links: structuredClone(links),
      sourceHead: { workspaceRevision: 38, sceneKitId: 'scene:one', sceneRevision: 5, payloadFingerprint: 'b'.repeat(64) } }),
    readReality: async () => ({ bundle: { actorFrames: structuredClone(frames) } }),
  };
  const service = pendingObserverEvidenceService(deps);
  const projection: ObserverCapabilityEvidence = { schemaVersion: 'vcs.observation-capability-projection/1', status: 'ready',
    subjectRef: link.mechanicsSubjectRef, subjectRevision: link.vcsRevision, characterRevision: link.vcsCharacterRevision,
    currentForm: 'rat', intendedForm: 'rat', operationRequired: null, modalities: ['visual', 'auditory', 'olfactory'],
    capabilityRefs: ['capability:familiar-observe'], specialSenseRefs: ['method:familiar-eyes'], mobilityRefs: ['mobility:rat'],
    binding: { ownerRef: scope.userId, subjectRef: link.mechanicsSubjectRef, subjectRevision: link.vcsRevision, characterRecordRef: link.vcsCharacterRef,
      characterRevision: link.vcsCharacterRevision, storyActorRef: link.actorRef, storyCampaignRef: scope.campaignId,
      state: 'active', provenanceReceiptRefs: ['vcs:receipt:rat'] } };
  const input = async () => ({ ...scope, nodeRef: 'node:watch', groupId: 'group:familiar', actorLinkRef: link.linkRef,
    expectedWindowFingerprint: String((await deps.readPending!(scope)).window && ((await deps.readPending!(scope)).window as Record<string, unknown>).windowFingerprint),
    vcsProjection: structuredClone(projection) });
  return { service, scope, source, authority, records, origins, link, links, frames, projection, input };
}

describe('ADR 016 pre-execution observer evidence', () => {
  it('reads protected coverage and qualifies a completed-move successor in /3 without rewriting historical evidence', async () => {
    const f = continuationPendingFixture(), base = fixture();
    const scope = { userId: 'owner:one', campaignId: 'campaign:fictional', programId: 'program:one' };
    const artifact = { ...f.source, freeformBinding: f.freeformBinding, intentBindingApplications: [f.application] };
    const loaded = { artifactRef: { ...scope, revision: f.source.artifactRevision }, artifact };
    const authority = { ...base.authority, workspaceRef: { campaignId: scope.campaignId, revision: 2 },
      sceneKitRef: { sceneKitId: 'scene:one', revision: 2, payloadFingerprint: 'c'.repeat(64) } };
    const historical = memory<ObserverEvidenceDocument>(), successors = memory<ObserverEvidenceDocument>();
    const link = { ...base.link, campaignRef: scope.campaignId, actorLinkRef: 'link:familiar',
      vcsRevision: f.evidence.vcsSubjectRevision, vcsCharacterRevision: f.evidence.vcsCharacterRevision };
    const ticket = { _id: f.freeformBinding.ticket, userId: scope.userId, campaignId: scope.campaignId,
      status: 'accepted', interactionId: artifact.instruction.interactionId, instructionFingerprint: artifact.instruction.instructionFingerprint,
      workflowRef: { turnId: 'turn:protected', windowId: 'window:protected' } };
    const projection = { ...base.projection, subjectRevision: f.evidence.vcsSubjectRevision, characterRevision: f.evidence.vcsCharacterRevision,
      binding: { ...base.projection.binding, storyCampaignRef: scope.campaignId,
        subjectRevision: f.evidence.vcsSubjectRevision, characterRevision: f.evidence.vcsCharacterRevision } };
    const readers = { readArtifact: async () => structuredClone(loaded), readObservation: async () => structuredClone(authority) };
    const service = pendingObserverEvidenceService({ records: historical.collection, continuationRecords: successors.collection,
      assertPositionContinuity: async () => {}, // Isolated lineage contract; actual Scene-chain tests cover this reader.
      origins: base.origins.collection, readPending: (input) => readScenePendingIntentContext(input, readers),
      readArtifact: readers.readArtifact as unknown as NonNullable<ObserverEvidenceDependencies['readArtifact']>,
      readLinks: async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 1, links: [link],
        sourceHead: { workspaceRevision: 2, sceneKitId: 'scene:one', sceneRevision: 2, payloadFingerprint: 'c'.repeat(64) } }),
      readReality: async () => ({ bundle: { actorFrames: base.frames } }), assertWorkflowOpen: async () => {},
      writeCampaignAllowlist: [scope.campaignId], instructionCoverage: {
        tickets: { findOne: async () => structuredClone(ticket) } as unknown as FreeformTicketCollection,
        reader: async () => ({ _id: 'turn:protected', userId: scope.userId, campaignId: scope.campaignId,
          rootInteractionId: String(artifact.instruction.interactionId), selectedMechanicsSubjectRef: link.mechanicsSubjectRef,
          selectedMechanicsOwnerRef: scope.userId, selectedActorRef: link.actorRef, answers: [], timelineSequence: 1, updatedAt: new Date(0),
          turn: { schemaVersion: 'gma.freeform-turn/1', turnId: 'turn:protected', campaignId: scope.campaignId, revision: 2,
            status: 'active', activeWindowRef: 'window:protected', rootInstructionRef: String(artifact.instruction.instructionRef),
            windows: [{ windowId: 'window:protected', ordinal: 1, ticketRef: ticket._id, instructionRef: String(artifact.instruction.instructionRef),
              programRef: scope.programId, parentProgramRef: null, pendingDecision: null, status: 'plan_saved' }] } }),
        readInstruction: async () => ({ instruction: artifact.instruction, originCheckpoint: null, stagedAt: new Date('2026-10-15T12:00:00Z') }),
      } });
    const before = structuredClone(loaded), current = await service.context({ ...scope, continuation: true });
    expect(current.schemaVersion).toBe('gmc.scene-pending-intent-context/3');
    expect(current.instructionCoverage).toMatchObject({ deferredTailBytes: 0, rootCompletionPermitted: true });
    expect(current.confirmedRelocations).toEqual([f.lineage]);
    const result = await service.qualify({ ...scope, schemaVersion: 'gmc.pending-observer-qualification/2', nodeRef: 'watch', groupId: 'group:familiar',
      actorLinkRef: link.linkRef, expectedWindowFingerprint: String((current.window as Record<string, unknown>).windowFingerprint), vcsProjection: projection });
    expect(result.evidence).toMatchObject({ schemaVersion: 'gmc.pending-observer-evidence/2', origin: { kind: 'owner_relocation_receipt', zoneRef: 'zone:interior' },
      viewpointCondition: { kind: 'confirmed_relocation', lineageRef: f.lineage.lineageRef, destinationZoneRef: 'zone:interior' } });
    expect((await service.context({ ...scope, continuation: true })).qualifiedObservers).toEqual([result.evidence]);
    expect(historical.rows).toEqual([]); expect(successors.rows).toHaveLength(1); expect(loaded).toEqual(before);
  });
  it('qualifies a present rat without treating its future viewpoint as completed access', async () => {
    const f = fixture(), before = structuredClone({ source: f.source, authority: f.authority, frames: f.frames });
    const result = await f.service.qualify(await f.input());
    expect(pendingObserverEvidenceIssues(result.evidence)).toEqual([]);
    expect(result.evidence).toMatchObject({ observerRef: 'actor:familiar', currentForm: 'rat', formRef: 'vcs:form:rat',
      methodRef: 'method:familiar-eyes', origin: { zoneRef: 'zone:entrance' },
      viewpointCondition: { kind: 'after_relocation', nodeRef: 'node:enter', destinationRef: 'element:tunnel' } });
    expect(f.authority.observationAccess).toEqual([]);
    expect(f.source.receipts).toEqual([]); expect(f.source.cursor.completedNodeRefs).toEqual([]);
    expect({ source: f.source, authority: f.authority, frames: f.frames }).toEqual(before);
    expect((await f.service.qualify(await f.input())).duplicate).toBe(true);
    expect(await f.service.read(f.scope)).toEqual([result.evidence]);
    expect((await f.service.context(f.scope)).qualifiedViewpoints).toEqual([
      { ownerEvidenceRef: result.evidence.evidenceRef, conditionalViewpointRef: conditionalViewpointRef(result.evidence) },
    ]);
  });
  it('stamps fresh capability heads without rewriting the original exact character/familiar identity', async () => {
    const f = fixture(), originalLink = structuredClone(f.link);
    f.projection.subjectRevision = f.projection.binding.subjectRevision = 'e'.repeat(64);
    f.projection.characterRevision = f.projection.binding.characterRevision = 'f'.repeat(64);
    const result = await f.service.qualify(await f.input());
    expect(result.evidence).toMatchObject({ actorLinkRef: f.link.linkRef,
      vcsSubjectRevision: f.projection.subjectRevision, vcsCharacterRevision: f.projection.characterRevision });
    expect(f.link).toEqual(originalLink); expect(f.source.cursor.completedNodeRefs).toEqual([]);
    expect(f.records.rows).toHaveLength(1);
  });
  for (const [name, change] of [
    ['missing identity', (f: ReturnType<typeof fixture>) => { f.links.length = 0; }],
    ['missing starting position', (f: ReturnType<typeof fixture>) => { f.frames.length = 0; }],
    ['activation required', (f: ReturnType<typeof fixture>) => { f.projection.operationRequired = { kind: 'activate_familiar_form' }; }],
    ['absent form', (f: ReturnType<typeof fixture>) => { f.projection.currentForm = null; }],
    ['foreign mechanics owner', (f: ReturnType<typeof fixture>) => { f.projection.binding.ownerRef = 'owner:other'; }],
    ['foreign character provenance', (f: ReturnType<typeof fixture>) => { f.projection.binding.characterRecordRef = 'vcs:character:other'; }],
    ['missing character provenance', (f: ReturnType<typeof fixture>) => { Reflect.deleteProperty(f.projection.binding, 'characterRecordRef'); }],
    ['wrong actor bridge', (f: ReturnType<typeof fixture>) => { f.projection.binding.storyActorRef = 'actor:other'; }],
    ['missing provenance', (f: ReturnType<typeof fixture>) => { f.projection.binding.provenanceReceiptRefs = []; }],
    ['unqualified multiple methods', (f: ReturnType<typeof fixture>) => { f.projection.specialSenseRefs.push('method:telepathy'); }],
  ] as const) it(`refuses ${name} without gameplay or evidence writes`, async () => {
    const f = fixture(); change(f);
    await expect(f.service.qualify(await f.input())).rejects.toBeDefined();
    expect(f.records.rows).toHaveLength(0); expect(f.source.receipts).toEqual([]);
  });
  it('records an explicit human GM starting-position decision without assuming co-location', async () => {
    const f = fixture(); f.frames.length = 0;
    const input = await f.input();
    const decision = await f.service.confirmOrigin({ ...f.scope, operationId: 'origin:one', actorLinkRef: f.link.linkRef,
      expectedWindowFingerprint: input.expectedWindowFingerprint, description: 'The rat is at the drain speaking to the worker, not beside the character.' });
    const result = await f.service.qualify({ ...input, originRef: decision.originRef });
    expect(result.evidence.origin).toEqual(decision.origin);
    expect(result.evidence.origin.zoneRef).toBeNull();
    expect(result.evidence.origin.sourceRefs).toEqual([decision.originRef]);
    expect(f.source.cursor.completedNodeRefs).toEqual([]);
  });
  it('discovers only the original scoped origin after a lost reply, even when new writes are paused', async () => {
    const f = fixture(), input = await f.input(), operationId = 'origin:uncertain';
    f.frames.length = 0;
    expect(await f.service.originOperation({ ...f.scope, operationId })).toBeNull();
    const saved = await f.service.confirmOrigin({ ...f.scope, operationId, actorLinkRef: f.link.linkRef,
      expectedWindowFingerprint: input.expectedWindowFingerprint, description: 'At the drain lip.' });
    const paused = pendingObserverEvidenceService({ origins: f.origins.collection, records: f.records.collection,
      writeCampaignAllowlist: [], readPending: async () => { throw new Error('Discovery must not reopen a workflow.'); },
      assertWorkflowOpen: async () => { throw new Error('Discovery must not reopen a workflow.'); } });
    expect(await paused.originOperation({ ...f.scope, operationId })).toMatchObject({ _id: saved.originRef,
      operationId, actorLinkRef: f.link.linkRef, windowFingerprint: input.expectedWindowFingerprint, origin: saved.origin });
    for (const field of ['userId', 'campaignId', 'programId'] as const)
      expect(await paused.originOperation({ ...f.scope, [field]: 'other:scope', operationId })).toBeNull();
    await expect(paused.originOperation({ ...f.scope, operationId: '../forged' })).rejects.toMatchObject({ code: 'OBSERVER_ORIGIN_DECISION_INVALID' });
    expect(f.origins.rows).toHaveLength(1); expect(f.records.rows).toHaveLength(0);
    expect(f.source.cursor.completedNodeRefs).toEqual([]);
  });
  it('does not overwrite an established position or accept a ruling for another actor or a completed group', async () => {
    const f = fixture(), input = await f.input();
    const request = { ...f.scope, operationId: 'origin:guarded', actorLinkRef: f.link.linkRef,
      expectedWindowFingerprint: input.expectedWindowFingerprint, description: 'At the drain lip.' };
    await expect(f.service.confirmOrigin(request)).rejects.toMatchObject({ code: 'OBSERVER_ORIGIN_ALREADY_ESTABLISHED' });
    f.frames.length = 0;
    f.source.program.nodes[1].observationGroups[0].observerRef = 'actor:other';
    await expect(f.service.confirmOrigin({ ...request, expectedWindowFingerprint: (await f.input()).expectedWindowFingerprint })).rejects.toMatchObject({ code: 'OBSERVER_IDENTITY_LINK_REQUIRED' });
    f.source.program.nodes[1].observationGroups[0].observerRef = null;
    const current = await f.input();
    await f.service.confirmOrigin({ ...request, expectedWindowFingerprint: current.expectedWindowFingerprint });
    await expect(f.service.confirmOrigin({ ...request, operationId: 'origin:replacement', expectedWindowFingerprint: current.expectedWindowFingerprint }))
      .rejects.toMatchObject({ code: 'OBSERVER_ORIGIN_ALREADY_CONFIRMED' });
    expect(f.origins.rows).toHaveLength(1); expect(f.records.rows).toHaveLength(0);
  });
  it('does not silently replace a bound form or method', async () => {
    const f = fixture(); f.source.program.nodes[1].observationGroups[0].formRef = 'vcs:form:owl';
    await expect(f.service.qualify(await f.input())).rejects.toMatchObject({ code: 'OBSERVER_EXISTING_FORM_CONFLICT' });
    f.source.program.nodes[1].observationGroups[0].formRef = null;
    f.source.program.nodes[1].observationGroups[0].methodRef = 'method:telepathy';
    await expect(f.service.qualify(await f.input())).rejects.toMatchObject({ code: 'OBSERVER_METHOD_CONFLICT' });
  });
  it('invalidates qualification on source-head or identity retirement rather than using stale evidence', async () => {
    const f = fixture(); await f.service.qualify(await f.input());
    f.authority.sceneKitRef.payloadFingerprint = 'e'.repeat(64);
    await expect(f.service.read(f.scope)).rejects.toMatchObject({ code: 'OBSERVER_QUALIFICATION_SOURCE_CHANGED' });
    f.authority.sceneKitRef.payloadFingerprint = 'b'.repeat(64); f.links.length = 0;
    await expect(f.service.read(f.scope)).rejects.toMatchObject({ code: 'OBSERVER_QUALIFICATION_SOURCE_CHANGED' });
  });
  it('requires the exact relocation owner prerequisite rather than a dependency alone', async () => {
    const f = fixture(); f.source.program.nodes[0].observationPrerequisite.groupRefs = ['group:other'];
    await expect(f.service.qualify(await f.input())).rejects.toMatchObject({ code: 'OBSERVER_VIEWPOINT_PREREQUISITE_INVALID' });
  });
  it('rejects fields that claim qualification completed movement or discovery', async () => {
    const f = fixture(), result = await f.service.qualify(await f.input());
    expect(pendingObserverEvidenceIssues({ ...result.evidence, movementCompleted: true })).toContain('$');
    expect(pendingObserverEvidenceIssues({ ...result.evidence, viewpointCondition: { ...result.evidence.viewpointCondition, receiptRef: 'receipt:invented' } })).toContain('viewpointCondition');
  });
});
