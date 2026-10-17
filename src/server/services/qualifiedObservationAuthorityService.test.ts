import { describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { qualifiedPendingFixture } from '../../shared/llm/fixtures/qualifiedPending.js';
import { continuationPendingFixture } from '../../shared/llm/fixtures/continuationPending.js';
import { createPendingBindingRecord, createIntentBindingReceipt } from '../../shared/llm/scenePendingIntentApplication.js';
import { qualifiedObservationAuthorityService, type QualifiedObservationActivation, type QualifiedObservationCommit,
  type QualifiedObservationDependencies } from './qualifiedObservationAuthorityService.js';
import type { ActorMechanicsLink } from '../../shared/llm/actorMechanicsLink.js';
import type { JsonObject } from './storyWorkspaceStore.js';

function fixture(continuation = false, typedFuture = false) {
  const f = continuation ? continuationPendingFixture() : qualifiedPendingFixture(), scope = { userId: 'owner:one', campaignId: 'campaign:fictional', programId: 'program:one' };
  if (typedFuture) {
    const originalAssessment = f.assessment;
    Object.assign(f.context, { instructionCoverage: continuationPendingFixture().context.instructionCoverage, confirmedRelocations: [] });
    f.evidence.schemaVersion = 'gmc.pending-observer-evidence/2';
    f.bindings.schemaVersion = 'gma.scene-pending-intent-bindings/3';
    f.assessment = () => ({ ...originalAssessment(), schemaVersion: 'gma.scene-readiness-assessment/4',
      qualificationReview: { ...originalAssessment().qualificationReview, viewpointState: 'pending_and_confirmed_lineage_preserved' } });
  }
  f.context.proposal.sceneKit.schemaVersion = 'gmc.scene-kit/5';
  f.context.proposal.actorFrames.forEach((row: JsonObject) => { row.publicLabel = row.actorRef; row.revision = 1; });
  const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
  const activeBundle = { bundleId: 'bundle:qualified', revision: 1, sceneKitRef: f.bindings.sceneKitRef };
  const priorRevision = f.context.source.artifactRevision;
  const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: scope.programId, priorCursorRevision: priorRevision,
    resultingCursorRevision: priorRevision + 1, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: f.bindings.sceneKitRef.revision, vcsCharacterRevision: 0 }, receiptId: 'rebase:current' };
  const application = { record, receipt: createIntentBindingReceipt(record, activeBundle, rebase) };
  const bundle: JsonObject = { ...f.context.proposal, activeBundle, pendingIntentBindingRecord: record };
  const artifact = { instruction: f.context.source.instruction, program: f.context.source.program,
    cursor: { ...structuredClone(f.context.source.cursor), revision: priorRevision + 2, authorityHead: rebase.authorityHead,
      completedNodeRefs: ['enter'], readyNodeRefs: ['cover', 'watch'], remainingNodeRefs: [] },
    receipts: [{ schemaVersion: 'gma.action-execution-receipt/2', receiptId: 'receipt:move', programId: scope.programId,
      nodeId: 'enter', lifecycle: 'settled', result: 'succeeded' }], intentBindingApplications: [
        ...('application' in f ? [f.application] : []), application] };
  const loaded = { artifactRef: { contractVersion: 'gma.interaction-artifact-ref/1', campaignId: scope.campaignId, programId: scope.programId,
    interactionId: 'interaction:one', payloadHash: 'a'.repeat(64), status: 'available' as const, revision: priorRevision + 2 }, artifact };
  const nativeKit = { schemaVersion: 'gmc.scene-kit/3', sceneKitId: 'scene:one', revision: 2,
    observables: [{ observableId: 'native:saved-observation', value: 'Historical data without new precision metadata.' }] };
  const legacy = { schemaVersion: 'gmc.observation-authority-projection/1', writerBundle: 'gmc.observation-writer-bundle/1',
    preparationState: 'scene_kit_upgrade_required', actorCandidates: [], derivedActorCandidates: [], actorMechanicsBindings: [],
    observationAccess: [], observables: [], obstructions: [], workspaceRef: { workspaceId: 'workspace:one', revision: 2, campaignId: scope.campaignId },
    sceneKitRef: { sceneKitId: 'scene:one', revision: 2, schemaVersion: 'gmc.scene-kit/3', payloadFingerprint: 'c'.repeat(64) }, privatePreparationContext: nativeKit };
  const e = f.evidence;
  const link: ActorMechanicsLink = { schemaVersion: 'gmc.actor-mechanics-link/1', linkRef: e.actorLinkRef, campaignRef: scope.campaignId,
    actorRef: e.observerRef, actorRecordRef: e.observerRef, actorRecordRevision: 2, subjectKind: 'familiar', parentActorRef: 'actor:player',
    mechanicsSubjectRef: e.mechanicsSubjectRef, vcsOwnerRef: e.vcsOwnerRef, vcsCharacterRef: 'vcs:character:one',
    vcsRevision: e.vcsSubjectRevision, vcsCharacterRevision: e.vcsCharacterRevision, provenanceReceiptRefs: e.ownerReceiptRefs,
    humanDecisionRef: 'decision:familiar', state: 'active' };
  const links = [link];
  const rows: QualifiedObservationActivation[] = [];
  const matches = (row: QualifiedObservationActivation, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => row[key as keyof QualifiedObservationActivation] === value);
  const api = {
    async findOne(filter: Record<string, unknown>) { return structuredClone(rows.find((row) => matches(row, filter)) ?? null); },
    async insertOne(row: QualifiedObservationActivation) {
      if (rows.some((prior) => prior._id === row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      rows.push(structuredClone(row));
    },
    find(filter: Record<string, unknown>) { return { limit(count: number) { return { async toArray() { return structuredClone(rows.filter((row) => matches(row, filter)).slice(0, count)); } }; } }; },
  };
  let workflowOpen = true;
  const deps: QualifiedObservationDependencies = { records: api as unknown as Collection<QualifiedObservationActivation>,
    readArtifact: async () => structuredClone(loaded),
    readReality: async () => ({ bundle: structuredClone(bundle) }),
    readLegacy: async () => structuredClone(legacy),
    readLinks: async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 1, sourceHead: { workspaceRevision: 2, sceneKitId: 'scene:one', sceneRevision: 2, payloadFingerprint: 'c'.repeat(64) }, links: structuredClone(links) }),
    assertWorkflowOpen: async () => { if (!workflowOpen) throw Object.assign(new Error('cancelled'), { code: 'FREEFORM_TURN_CLOSED' }); },
    assertPositionContinuity: async () => {}, // Position reader is tested independently against owner Scene turns.
    writeCampaignAllowlist: [scope.campaignId] };
  const input: QualifiedObservationCommit = { ...scope, schemaVersion: continuation || typedFuture ? 'gmc.observation-authority-commit/3' : 'gmc.observation-authority-commit/2', operationId: 'activate:watch', idempotencyKey: 'activate:watch',
    expectedArtifactRevision: priorRevision + 2, expectedWorkspaceRevision: 2, expectedPreparedSceneRevision: f.bindings.sceneKitRef.revision,
    bindingRecordRef: record.recordId, evidenceRef: e.evidenceRef, nodeRef: 'watch', groupId: e.groupId, movementReceiptRef: 'receipt:move',
    ...(continuation || typedFuture ? { relocationLineageRef: e.viewpointCondition.kind === 'confirmed_relocation' ? e.viewpointCondition.lineageRef : null } : {}),
    vcsProjection: { status: 'ready', operationRequired: null, subjectRef: e.mechanicsSubjectRef, subjectRevision: e.vcsSubjectRevision,
      characterRevision: e.vcsCharacterRevision, currentForm: e.currentForm, capabilityRefs: [], specialSenseRefs: [e.methodRef],
      binding: { state: 'active', ownerRef: e.vcsOwnerRef, storyActorRef: e.observerRef, storyCampaignRef: scope.campaignId,
        subjectRef: e.mechanicsSubjectRef, subjectRevision: e.vcsSubjectRevision, characterRevision: e.vcsCharacterRevision, provenanceReceiptRefs: e.ownerReceiptRefs } } };
  const service = qualifiedObservationAuthorityService(deps);
  return { f, scope, bundle, loaded, legacy, nativeKit, links, rows, api, deps, input, service, close: () => { workflowOpen = false; } };
}

describe('ADR 016 receipt-conditioned sensing activation', () => {
  it('passes the complete exact arrival identity to the protected position reader for a newly finished move', async () => {
    const f = fixture(false, true), checks: JsonObject[] = [];
    f.deps.assertPositionContinuity = async (_scope, _artifact, lineage) => {
      expect(lineage).toMatchObject({ sourceHead: f.f.evidence.sourceHead, moveNodeRef: 'enter', bindingRecordRef: f.input.bindingRecordRef,
        observerRef: 'actor:familiar', destinationRef: 'element:tunnel', destinationZoneRef: 'zone:interior',
        observationNodeRef: 'watch', groupId: 'group:familiar', requireMovementOutcome: true });
      checks.push(structuredClone(lineage) as unknown as JsonObject);
    };
    const before = structuredClone(f.loaded.artifact);
    expect(await f.service.commit(f.input)).toMatchObject({ schemaVersion: 'gmc.observation-authority-receipt/3', disposition: 'committed', relocationLineageRef: null });
    expect(checks).toHaveLength(1);
    expect(f.loaded.artifact).toEqual(before);
  });
  it('cannot replace the typed arrival reader with a generic completed-action claim', async () => {
    const f = fixture(false, true);
    f.deps.assertPositionContinuity = async (_scope, _artifact, lineage) => {
      expect(lineage.requireMovementOutcome).toBe(true);
      throw Object.assign(new Error('No owner-confirmed arrival'), { code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
    };
    await expect(f.service.commit(f.input)).rejects.toMatchObject({ code: 'CONFIRMED_RELOCATION_LINEAGE_INVALID' });
    expect(f.rows).toEqual([]);
  });
  it('activates ADR 017 sensing from the original move lineage after a pending-only rebuild, without repeating movement', async () => {
    const f = fixture(true), before = structuredClone(f.loaded.artifact);
    const readScope = { ...f.scope, version: '3' as const };
    expect((await f.service.read(readScope)).preparationState).toBe('qualified_access_required');
    const receipt = await f.service.commit(f.input);
    expect(receipt).toMatchObject({ schemaVersion: 'gmc.observation-authority-receipt/3', movementReceiptRef: 'receipt:move', relocationLineageRef: f.input.relocationLineageRef });
    expect((await f.service.read(readScope)).schemaVersion).toBe('gmc.observation-authority-projection/3');
    expect((await f.service.operation({ ...readScope, operationId: f.input.operationId }))?.duplicate).toBe(true);
    expect((await f.service.commit(f.input)).duplicate).toBe(true); expect(f.rows).toHaveLength(1);
    expect(f.loaded.artifact).toEqual(before);
    await expect(f.service.read(f.scope)).rejects.toBeInstanceOf(Error);
  });
  for (const [name, mutate] of [
    ['forged lineage ref', (f: ReturnType<typeof fixture>) => { f.input.relocationLineageRef = 'lineage:foreign'; }],
    ['old commit version', (f: ReturnType<typeof fixture>) => { f.input.schemaVersion = 'gmc.observation-authority-commit/2'; }],
    ['changed settled receipt', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.receipts[0].result = 'failed'; }],
    ['missing completed move binding', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.intentBindingApplications.shift(); }],
  ] as const) it(`rejects continuation ${name}`, async () => {
    const f = fixture(true); mutate(f); await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error); expect(f.rows).toEqual([]);
  });
  it('derives only the examined sensory scope after the exact settled movement; native /3 observations stay unchanged', async () => {
    const f = fixture(), before = structuredClone({ nativeKit: f.nativeKit, bundle: f.bundle, loaded: f.loaded });
    expect((await f.service.read(f.scope)).preparationState).toBe('qualified_access_required');
    const receipt = await f.service.commit(f.input);
    expect(receipt).toMatchObject({ schemaVersion: 'gmc.observation-authority-receipt/2', disposition: 'committed', movementReceiptRef: 'receipt:move', viewpointRef: 'zone:interior' });
    const projection = await f.service.read(f.scope);
    expect(projection).toMatchObject({ schemaVersion: 'gmc.observation-authority-projection/2', preparationState: 'ready', sceneKitRef: { schemaVersion: 'gmc.scene-kit/5', revision: 3 } });
    expect((projection.observables as JsonObject[])[0]).toMatchObject({ facet: 'surface_description', viewpointRef: 'zone:interior',
      value: { kind: 'description', text: 'A shallow channel passes a chalk-marked iron grate.' } });
    expect(f.rows).toHaveLength(1); expect(f.rows[0]).not.toHaveProperty('facts'); expect(f.rows[0]).not.toHaveProperty('actorPosition');
    expect({ nativeKit: f.nativeKit, bundle: f.bundle, loaded: f.loaded }).toEqual(before);
    expect((await f.service.commit(f.input)).duplicate).toBe(true); expect(f.rows).toHaveLength(1);
  });
  for (const [name, change] of [
    ['missing movement receipt', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.receipts.length = 0; }],
    ['failed move', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.receipts[0].result = 'failed'; }],
    ['unsettled move', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.receipts[0].lifecycle = 'pending'; }],
    ['unfinished move', (f: ReturnType<typeof fixture>) => { f.loaded.artifact.cursor.completedNodeRefs = []; }],
    ['foreign saved actor link', (f: ReturnType<typeof fixture>) => { f.links[0].actorRef = 'actor:foreign'; }],
    ['changed VCS form', (f: ReturnType<typeof fixture>) => { f.input.vcsProjection.currentForm = 'owl'; }],
    ['stale VCS revision', (f: ReturnType<typeof fixture>) => { f.input.vcsProjection.subjectRevision = 'f'.repeat(64); }],
    ['foreign VCS owner', (f: ReturnType<typeof fixture>) => { f.input.vcsProjection.binding.ownerRef = 'owner:foreign'; }],
    ['stale saved action head', (f: ReturnType<typeof fixture>) => { f.loaded.artifactRef.revision++; }],
    ['changed source Scene', (f: ReturnType<typeof fixture>) => { f.legacy.sceneKitRef.payloadFingerprint = 'f'.repeat(64); }],
    ['cancelled plan', (f: ReturnType<typeof fixture>) => { f.close(); }],
  ] as const) it(`rejects ${name} without creating access`, async () => {
    const f = fixture(); change(f);
    await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error); expect(f.rows).toHaveLength(0);
  });
  it('reconciles a lost successful reply by the original operation, even while new writes are off', async () => {
    const f = fixture(), insert = f.api.insertOne;
    f.api.insertOne = async (row) => { await insert(row); throw new Error('reply lost'); };
    await expect(f.service.commit(f.input)).rejects.toThrow('reply lost');
    const paused = qualifiedObservationAuthorityService({ ...f.deps, writeCampaignAllowlist: [] });
    expect((await paused.operation({ ...f.scope, operationId: f.input.operationId }))?.disposition).toBe('committed');
    expect((await paused.commit(f.input)).duplicate).toBe(true); expect(f.rows).toHaveLength(1);
    await expect(paused.commit({ ...f.input, movementReceiptRef: 'receipt:invented' })).rejects.toBeInstanceOf(Error);
  });
  it('keeps all other private facts out of the read model and rejects stale access after rewind/cancellation', async () => {
    const f = fixture();
    const facts = f.bundle.facts as JsonObject[];
    facts.push({ ...facts[0], factId: 'fact:secret', value: 'The concealed surveyors work for a private patron.' });
    await f.service.commit(f.input);
    expect(JSON.stringify((await f.service.read(f.scope)).observables)).not.toContain('private patron');
    f.loaded.artifact.receipts.length = 0;
    await expect(f.service.read(f.scope)).rejects.toBeInstanceOf(Error);
    const cancelled = fixture(); await cancelled.service.commit(cancelled.input); cancelled.close();
    await expect(cancelled.service.read(cancelled.scope)).rejects.toMatchObject({ code: 'FREEFORM_TURN_CLOSED' });
  });
  it('retains a concrete sensory barrier in the derived owner projection instead of dropping it', async () => {
    const f = fixture(), fact = (f.bundle.facts as JsonObject[])[0];
    fact.value = { schemaVersion: 'gmc.scene-sensory-answer/1', resultKind: 'blocked', value: null,
      playerFacingStatement: 'Opaque silt blocks the rat’s view beyond the grate.', supportedPrecision: null, modality: 'visual' };
    await f.service.commit(f.input);
    const projection = await f.service.read(f.scope);
    expect(projection.observables).toEqual([]);
    expect(projection.obstructions).toHaveLength(1);
    expect((projection.obstructions as JsonObject[])[0]).toMatchObject({ mobilityEffect: 'none', affectedFacets: ['surface_description'],
      playerFacingStatement: 'Opaque silt blocks the rat’s view beyond the grate.' });
    expect(f.rows[0]).not.toHaveProperty('obstructions');
  });
});
