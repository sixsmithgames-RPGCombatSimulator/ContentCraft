import { describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { qualifiedPendingFixture } from '../../shared/llm/fixtures/qualifiedPending.js';
import { createPendingBindingRecord, createIntentBindingReceipt } from '../../shared/llm/scenePendingIntentApplication.js';
import { deriveSceneMovementExpectation, sceneMovementOutcomeIssues, SCENE_MOVEMENT_OUTCOME_POLICY,
  SCENE_MOVEMENT_EXPECTATION_SCHEMA, SCENE_MOVEMENT_COMMIT_SCHEMA, SCENE_MOVEMENT_RECEIPT_SCHEMA, sceneMovementSchemaIssues,
  type SceneMovementOutcomeProposal } from '../../shared/llm/sceneMovementOutcome.js';
import { sceneMovementOutcomeService, type SceneMovementOutcomeCommit, type SceneMovementOutcomeDocument,
  type SceneMovementOutcomeDependencies } from './sceneMovementOutcomeStore.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import { createPendingIntentWindow } from '../../shared/llm/pendingIntentWindow.js';
import { freeformJsonDigest, freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { parallelPresentationId, parallelPresentationNodeRefs } from '../../shared/llm/parallelPresentation.js';
import { preparedCheckOutcomeId, preparedMovementResultIssues, PREPARED_MOVEMENT_RESULT_POLICY } from '../../shared/llm/preparedCheckCompletion.js';

function fixture({ cohort = false } = {}) {
  const f = qualifiedPendingFixture(), scope = { userId: 'owner:one', campaignId: 'campaign:fictional', programId: 'program:one' };
  if (cohort) {
    Object.assign(f.context.source.program, { schemaVersion: 'gma.semantic-action-program/6',
      planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/13' } });
    for (const node of f.context.source.program.nodes) Object.assign(node, { requestedEffects: [],
      parallelWith: node.nodeId === 'enter' ? ['cover'] : node.nodeId === 'cover' ? ['enter', 'watch'] : ['cover'] });
    const window = createPendingIntentWindow(f.context.source);
    f.bindings.windowId = window.windowId; f.bindings.windowFingerprint = window.windowFingerprint;
    f.evidence.windowRef = window.windowId; f.evidence.windowFingerprint = window.windowFingerprint;
  }
  const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
  const rebase = { schemaVersion: 'gma.action-program-rebase-receipt/2', programRef: scope.programId, priorCursorRevision: 1,
    resultingCursorRevision: 2, authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 3, vcsCharacterRevision: 0 }, receiptId: 'rebase:one' };
  const artifact: JsonObject = { instruction: { ...f.context.source.instruction, interactionId: 'turn:one' }, program: f.context.source.program,
    cursor: f.context.source.cursor, receipts: [], intentBindingApplications: [{ record,
      receipt: createIntentBindingReceipt(record, { bundleId: 'bundle:one', revision: 1, sceneKitRef: f.bindings.sceneKitRef }, rebase) }] };
  const bundle = structuredClone(f.context.proposal);
  const expected = deriveSceneMovementExpectation(artifact, bundle, 'enter');
  const { bindingRecordFingerprint: _recordHash, ...identity } = expected;
  const proposal: SceneMovementOutcomeProposal = { ...identity, schemaVersion: 'gma.scene-movement-outcome-proposal/1',
    result: 'reached', narrationEvidence: 'Your rat familiar reaches the tunnel just inside the entrance.' };
  const source: JsonObject = { ...scope, sceneKitId: 'scene:one', receiptRef: 'scene-turn:move', interactionId: 'turn:one:compound:enter:2',
    phase: 'completed', stateRevisionBefore: 0, stateRevisionAfter: 1, sceneKitRef: { sceneKitId: 'scene:one', revision: 3 },
    publishedExchange: { assistantNarration: proposal.narrationEvidence } };
  if (cohort) {
    const refs = parallelPresentationNodeRefs(artifact.program, artifact.cursor, 'enter');
    source.interactionId = `turn:one:compound:${parallelPresentationId(refs)}:${(artifact.cursor as JsonObject).revision}`;
    source.playerActionFingerprint = freeformTextDigest('Send the familiar inside while I remain behind cover.');
    const responseText = `${proposal.narrationEvidence} You remain behind cover at the entrance.`;
    (source.publishedExchange as JsonObject).assistantNarration = responseText;
    source.narrationFingerprint = freeformTextDigest(responseText);
    const candidate = { schemaVersion: 'gma.compound-story-settlement-candidate/1', programId: scope.programId,
      instructionFingerprint: (artifact.instruction as JsonObject).instructionFingerprint, interactionId: source.interactionId,
      playerActionFingerprint: source.playerActionFingerprint, sceneKitRef: source.sceneKitRef,
      nodeRefs: refs, slice: { sliceId: `slice:${scope.programId}:${(artifact.cursor as JsonObject).revision}`,
        programId: scope.programId, nodeRefs: refs, expectedAuthority: (artifact.cursor as JsonObject).authorityHead }, compiled: {
        schemaVersion: 'gma.current-scene-narration-compiled/13', responseText, rollRequest: null, movementOutcome: { ...proposal } } };
    const fingerprint = freeformJsonDigest(candidate);
    (artifact.cursor as JsonObject).revision = Number((artifact.cursor as JsonObject).revision) + 1;
    artifact.saga = { cursorRevision: (artifact.cursor as JsonObject).revision, currentWaitingReason: 'story_presentation_settlement',
      acceptedModelCandidateRefs: [fingerprint], pendingModelCandidate: {
      schemaVersion: 'gma.accepted-model-candidate/2', kind: 'story_narration', candidate,
      inputFingerprint: 'a'.repeat(64), operationKey: 'story:checked', candidateFingerprint: fingerprint } };
  }
  const state: JsonObject = { revision: 1, latestReceiptRef: source.receiptRef };
  const records: SceneMovementOutcomeDocument[] = [];
  const matches = (row: SceneMovementOutcomeDocument, filter: Record<string, unknown>): boolean => Object.entries(filter).every(([key, value]) => row[key as keyof SceneMovementOutcomeDocument] === value);
  let loseReply = false, open = true, race = false, reads = 0;
  const api = { async findOne(filter: Record<string, unknown>) { return structuredClone(records.find((row) => matches(row, filter)) ?? null); },
    async insertOne(row: SceneMovementOutcomeDocument) {
      if (records.some((prior) => prior.operationId === row.operationId || prior.nodeRef === row.nodeRef)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.push(structuredClone(row)); if (loseReply) throw new Error('accepted reply lost');
    } };
  const deps: SceneMovementOutcomeDependencies = {
    records: api as unknown as Pick<Collection<SceneMovementOutcomeDocument>, 'findOne' | 'insertOne'>,
    // Cast only the Mongo/owner adapter boundary; all consumed fixture values remain explicit.
    states: { findOne: async () => structuredClone(state) } as unknown as SceneMovementOutcomeDependencies['states'],
    sceneTurns: { findOne: async (filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => source[key] === value) ? structuredClone(source) : null } as unknown as SceneMovementOutcomeDependencies['sceneTurns'],
    readArtifact: async () => { reads++; return { artifact, artifactRef: { revision: race && reads > 1 ? 4 : 3 } } as unknown as Awaited<ReturnType<NonNullable<SceneMovementOutcomeDependencies['readArtifact']>>>; },
    readReality: async () => ({ bundle }),
    readLegacy: async () => ({ workspaceRef: { revision: 2 } }) as unknown as Awaited<ReturnType<NonNullable<SceneMovementOutcomeDependencies['readLegacy']>>>,
    assertWorkflowOpen: async () => { if (!open) throw Object.assign(new Error('closed'), { code: 'FREEFORM_TURN_CLOSED' }); },
    writeCampaignAllowlist: [scope.campaignId],
  };
  const input: SceneMovementOutcomeCommit = { ...scope, schemaVersion: 'gmc.scene-movement-outcome-commit/1', operationId: 'outcome:one',
    idempotencyKey: 'outcome:one', nodeRef: 'enter', expectedArtifactRevision: 3, expectedWorkspaceRevision: 2,
    expectedPreparedSceneRevision: 3, expectedActiveSceneRevision: 1, sourceSceneTurnReceiptRef: String(source.receiptRef),
    expectation: expected, proposal, sourceKind: 'manual_proposal', humanDecision: null };
  return { scope, artifact, bundle, source, state, records, input, deps, service: sceneMovementOutcomeService(deps),
    loseReply: () => { loseReply = true; }, close: () => { open = false; }, race: () => { race = true; } };
}

function selectedFixture(result: 'reached' | 'not_reached' = 'not_reached', retained = false) {
  const f = fixture();
  const prose = result === 'reached' ? 'Your rat familiar reaches the tunnel just inside the entrance.' : 'Your rat stops outside the tunnel and does not enter.';
  f.input.proposal.result = result; f.input.proposal.narrationEvidence = prose;
  Object.assign(f.source, { phase: 'owner_confirmed_mechanic', operationId: `scene-turn:${f.source.interactionId}:resolved`,
    playerActionFingerprint: 'b'.repeat(64), sourceReceiptRefs: ['vcs:check:one'],
    sceneKitRef: { campaignId: f.scope.campaignId, sceneKitId: 'scene:one', revision: 3, payloadHash: 'c'.repeat(64) },
    publishedExchange: { assistantNarration: prose } });
  const branch = { responseText: prose, movementResult: { schemaVersion: 'gma.prepared-movement-result/1', result, narrationEvidence: prose } };
  if (retained) delete (branch as JsonObject).movementResult;
  const candidate = { schemaVersion: 'gma.compound-story-settlement-candidate/2', programId: f.scope.programId,
    interactionId: f.source.interactionId, playerActionFingerprint: f.source.playerActionFingerprint, sceneKitRef: f.source.sceneKitRef,
    nodeRefs: ['enter'], compiled: { schemaVersion: `gma.current-scene-narration-compiled/${retained ? 13 : 14}`,
      rollRequest: { dc: 15, modifier: 2, preparedOutcome: { branches: { criticalFailure: branch } } } },
    terminalTransport: { schemaVersion: 'gma.compound-story-terminal-transport/2', movementExpectation: { ...f.input.expectation } } };
  const fingerprint = freeformJsonDigest(candidate);
  f.artifact.saga = { pendingModelCandidate: { schemaVersion: 'gma.accepted-model-candidate/2', kind: 'story_narration', candidate, candidateFingerprint: fingerprint } };
  const raw = { interactionId: f.source.interactionId, selected: 1, total: 3, dc: 15, modifier: 2, success: false };
  const ledger = { campaignId: f.scope.campaignId, interactionId: f.source.interactionId, response: {
    mechanicalResult: { ...raw, authorityReceipt: { contractVersion: 'vcs.mechanics-authority-receipt/1', authority: 'vcs', status: 'committed',
      operationId: f.source.interactionId, receiptRef: 'vcs:check:one', resultFingerprint: freeformJsonDigest(raw) } } } };
  Object.assign(f.input, { schemaVersion: 'gmc.scene-movement-outcome-commit/2', selectedCheckSource: {
    schemaVersion: 'gma.selected-prepared-movement-proof/1', programRef: f.scope.programId, nodeRef: 'enter',
    candidateFingerprint: fingerprint, mechanicsInteractionId: f.source.interactionId, mechanicsReceiptRef: 'vcs:check:one',
    outcomeId: 'criticalFailure', branchFingerprint: freeformJsonDigest(branch), sourceSceneTurnReceiptRef: f.source.receiptRef } });
  f.deps.readMechanicsLedger = async () => ledger as unknown as Awaited<ReturnType<NonNullable<typeof f.deps.readMechanicsLedger>>>;
  return { ...f, ledger, candidate, branch, service: sceneMovementOutcomeService(f.deps) };
}

describe('selected prepared check movement authority', () => {
  it.each(['reached', 'not_reached'] as const)('uses explicit %s even when the saved check failed, never the check success flag', async (result) => {
    const f = selectedFixture(result), before = structuredClone({ artifact: f.artifact, source: f.source, ledger: f.ledger });
    expect(await f.service.commit(f.input)).toMatchObject({ result, executionResult: result === 'reached' ? 'succeeded' : 'failed' });
    expect((await f.service.commit(f.input)).duplicate).toBe(true); expect(f.records).toHaveLength(1);
    expect({ artifact: f.artifact, source: f.source, ledger: f.ledger }).toEqual(before);
  });
  it.each(['candidate', 'branch', 'receipt', 'result', 'source', 'actor', 'proposal', 'pending', 'foreign', 'implicit', 'unknown'])('rejects altered %s before writing', async (kind) => {
    const f = selectedFixture();
    if (kind === 'candidate') f.input.selectedCheckSource!.candidateFingerprint = 'd'.repeat(64);
    if (kind === 'branch') f.input.selectedCheckSource!.branchFingerprint = 'd'.repeat(64);
    if (kind === 'receipt') f.ledger.response.mechanicalResult.authorityReceipt.resultFingerprint = 'd'.repeat(64);
    if (kind === 'result') f.input.selectedCheckSource!.outcomeId = 'success';
    if (kind === 'source') (f.source.publishedExchange as JsonObject).assistantNarration = 'A changed scene.';
    if (kind === 'actor') f.input.proposal.moverRef = 'actor:other';
    if (kind === 'proposal') f.input.proposal.result = 'reached';
    if (kind === 'pending') f.source.phase = 'pending_mechanic';
    if (kind === 'foreign') f.ledger.campaignId = 'campaign:other';
    if (kind === 'implicit') delete (f.branch as JsonObject).movementResult;
    if (kind === 'unknown') f.input.selectedCheckSource!.extra = true;
    await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error); expect(f.records).toEqual([]);
  });
  it('keeps retained /13 bytes and requires the explicit GM decision after the exact resolved Scene', async () => {
    const f = selectedFixture('not_reached', true), before = freeformJsonDigest(f.candidate);
    await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error);
    f.input.sourceKind = 'human_gm'; f.input.humanDecision = { schemaVersion: 'gma.scene-movement-gm-decision/1',
      decisionId: 'gm:arrival', result: 'not_reached', reason: 'The GM confirms this original saved result stopped short.' };
    expect(await f.service.commit(f.input)).toMatchObject({ result: 'not_reached', sourceKind: 'human_gm' });
    expect(freeformJsonDigest(f.candidate)).toBe(before);
  });
  it('discovers a lost selected-movement save by its original operation after closure without a second event', async () => {
    const f = selectedFixture(); f.loseReply();
    await expect(f.service.commit(f.input)).rejects.toThrow('accepted reply lost');
    f.close();
    const receipt = await f.service.operation({ ...f.scope, operationId: f.input.operationId });
    expect(receipt).toMatchObject({ duplicate: true, result: 'not_reached' });
    expect((await f.service.commit(f.input)).receiptRef).toBe(receipt!.receiptRef);
    expect(f.records).toHaveLength(1);
    await expect(f.service.commit({ ...f.input, proposal: { ...f.input.proposal, result: 'reached' } })).rejects.toBeInstanceOf(Error);
    expect(f.records).toHaveLength(1);
  });
  it('validates explicit evidence, closed fields, no-effect null and unchanged outcome bands', () => {
    expect(PREPARED_MOVEMENT_RESULT_POLICY).toContain('not merely because its check succeeds');
    expect(preparedMovementResultIssues(null, {}, 'The rat stopped.')).not.toEqual([]);
    expect(preparedMovementResultIssues(null, null, 'No movement.')).toEqual([]);
    expect(preparedMovementResultIssues({ schemaVersion: 'gma.prepared-movement-result/1', result: 'reached', narrationEvidence: 'Invented' }, {}, 'The rat stopped.')).not.toEqual([]);
    expect(preparedCheckOutcomeId({ total: 3, dc: 15, selected: 1 })).toBe('criticalFailure');
    expect(preparedCheckOutcomeId({ total: 3, dc: 15, selected: 20 })).toBe('criticalSuccess');
  });
});

describe('explicit protected Scene movement outcomes', () => {
  it.each(['reached', 'not_reached'] as const)('confirms only the exact %s move within one parallel presentation and preserves all other members', async (result) => {
    const f = fixture({ cohort: true });
    if (result === 'not_reached') {
      f.input.proposal.result = result;
      f.input.proposal.narrationEvidence = 'Your rat stops outside the tunnel and does not enter.';
      const pending = (f.artifact.saga as JsonObject).pendingModelCandidate as JsonObject;
      const candidate = pending.candidate as JsonObject, compiled = candidate.compiled as JsonObject;
      compiled.responseText = `${f.input.proposal.narrationEvidence} You remain behind cover at the entrance.`;
      compiled.movementOutcome = { ...f.input.proposal };
      pending.candidateFingerprint = freeformJsonDigest(candidate);
      (f.artifact.saga as JsonObject).acceptedModelCandidateRefs = [pending.candidateFingerprint];
      (f.source.publishedExchange as JsonObject).assistantNarration = compiled.responseText;
      f.source.narrationFingerprint = freeformTextDigest(String(compiled.responseText));
    }
    const before = structuredClone({ artifact: f.artifact, source: f.source });
    expect(await f.service.commit(f.input)).toMatchObject({ nodeRef: 'enter', result, executionResult: result === 'reached' ? 'succeeded' : 'failed' });
    expect(f.records).toHaveLength(1);
    expect({ artifact: f.artifact, source: f.source }).toEqual(before);
    expect((await f.service.commit(f.input)).duplicate).toBe(true);
    expect(f.records).toHaveLength(1);
  });
  it.each(['missing_candidate', 'bad_hash', 'wrong_order', 'missing_member', 'foreign_member', 'wrong_program',
    'wrong_instruction', 'wrong_action', 'wrong_scene', 'changed_prose', 'changed_proposal', 'pending_roll',
    'singleton_turn', 'wrong_cursor', 'invented_cohort'] as const)('rejects cohort %s without any movement write', async (kind) => {
    const f = fixture({ cohort: true }), saga = f.artifact.saga as JsonObject;
    const pending = saga.pendingModelCandidate as JsonObject, candidate = pending.candidate as JsonObject;
    const slice = candidate.slice as JsonObject, compiled = candidate.compiled as JsonObject;
    if (kind === 'missing_candidate') saga.pendingModelCandidate = null;
    if (kind === 'wrong_order') slice.nodeRefs = ['cover', 'enter'];
    if (kind === 'missing_member') slice.nodeRefs = ['enter'];
    if (kind === 'foreign_member') slice.nodeRefs = ['enter', 'watch'];
    if (kind === 'wrong_program') candidate.programId = 'program:other';
    if (kind === 'wrong_instruction') candidate.instructionFingerprint = 'd'.repeat(64);
    if (kind === 'wrong_action') candidate.playerActionFingerprint = 'd'.repeat(64);
    if (kind === 'wrong_scene') candidate.sceneKitRef = { sceneKitId: 'scene:other', revision: 3 };
    if (kind === 'changed_prose') compiled.responseText = 'A different move happened.';
    if (kind === 'changed_proposal') compiled.movementOutcome = { ...f.input.proposal, result: 'not_reached' };
    if (kind === 'pending_roll') compiled.rollRequest = { nodeRef: 'cover' };
    if (kind === 'singleton_turn') f.source.interactionId = 'turn:one:compound:enter:1';
    if (kind === 'wrong_cursor') (f.artifact.cursor as JsonObject).revision = 3;
    if (kind === 'invented_cohort') f.source.interactionId = 'turn:one:compound:cohort:invented:1';
    if (kind !== 'bad_hash') {
      pending.candidateFingerprint = freeformJsonDigest(candidate);
      saga.acceptedModelCandidateRefs = [pending.candidateFingerprint];
    } else pending.candidateFingerprint = 'd'.repeat(64);
    await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error);
    expect(f.records).toEqual([]);
  });
  it('confirms an exact arrived mover without changing its original Scene turn, program or receipts', async () => {
    const f = fixture(), before = structuredClone({ artifact: f.artifact, bundle: f.bundle, source: f.source });
    const receipt = await f.service.commit(f.input);
    expect(receipt).toMatchObject({ schemaVersion: 'gmc.scene-movement-outcome-receipt/1', result: 'reached', executionResult: 'succeeded', sourceSceneTurnReceiptRef: 'scene-turn:move' });
    expect(sceneMovementSchemaIssues(f.input.expectation, SCENE_MOVEMENT_EXPECTATION_SCHEMA)).toEqual([]);
    const { userId: _userId, campaignId: _campaignId, ...transport } = f.input;
    expect(sceneMovementSchemaIssues(transport, SCENE_MOVEMENT_COMMIT_SCHEMA)).toEqual([]);
    expect(sceneMovementSchemaIssues(receipt, SCENE_MOVEMENT_RECEIPT_SCHEMA)).toEqual([]);
    expect(sceneMovementSchemaIssues({ ...receipt, arbitraryPosition: 'inside' }, SCENE_MOVEMENT_RECEIPT_SCHEMA)).not.toEqual([]);
    expect(f.records).toHaveLength(1); expect(JSON.stringify(f.records)).not.toContain(f.input.proposal.narrationEvidence);
    expect({ artifact: f.artifact, bundle: f.bundle, source: f.source }).toEqual(before);
    expect((await f.service.commit(f.input)).duplicate).toBe(true); expect(f.records).toHaveLength(1);
  });
  it('records an explicit failed arrival without granting sensing', async () => {
    const f = fixture(); f.input.proposal.result = 'not_reached'; f.input.proposal.narrationEvidence = 'The rat stops outside the barred entrance and cannot enter.';
    (f.source.publishedExchange as JsonObject).assistantNarration = f.input.proposal.narrationEvidence;
    expect(await f.service.commit(f.input)).toMatchObject({ result: 'not_reached', executionResult: 'failed' });
    expect(f.artifact.receipts).toEqual([]);
  });
  it('accepts only an explicit audited GM choice for an older saved candidate', async () => {
    const f = fixture(); f.input.sourceKind = 'human_gm';
    f.input.humanDecision = { schemaVersion: 'gma.scene-movement-gm-decision/1', decisionId: 'decision:arrival', result: 'reached', reason: 'The GM confirms this original saved arrival.' };
    expect(await f.service.commit(f.input)).toMatchObject({ sourceKind: 'human_gm', executionResult: 'succeeded' });
    expect(f.records[0].receipt.humanDecisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('reconciles a lost response by the original operation while new writes or the workflow are off', async () => {
    const f = fixture(); f.loseReply(); await expect(f.service.commit(f.input)).rejects.toThrow('accepted reply lost'); f.close();
    const paused = sceneMovementOutcomeService({ ...f.deps, writeCampaignAllowlist: [] });
    expect(await paused.operation({ ...f.scope, operationId: 'outcome:one' })).toMatchObject({ disposition: 'committed', duplicate: true });
    expect((await paused.commit(f.input)).duplicate).toBe(true); expect(f.records).toHaveLength(1);
    expect(await paused.operation({ ...f.scope, userId: 'owner:foreign', operationId: 'outcome:one' })).toBeNull();
    await expect(paused.commit({ ...f.input, proposal: { ...f.input.proposal, result: 'not_reached' } })).rejects.toBeInstanceOf(Error);
  });
  for (const [name, mutate] of [
    ['foreign campaign', (f: ReturnType<typeof fixture>) => { f.input.campaignId = 'campaign:other'; }],
    ['changed actor', (f: ReturnType<typeof fixture>) => { f.input.proposal.moverRef = 'actor:player'; }],
    ['different destination', (f: ReturnType<typeof fixture>) => { f.input.proposal.destinationZoneRef = 'zone:entrance'; }],
    ['unknown nested field', (f: ReturnType<typeof fixture>) => { Object.assign(f.input.proposal, { succeeded: true }); }],
    ['unknown expectation field', (f: ReturnType<typeof fixture>) => { Object.assign(f.input.expectation, { arrived: true }); }],
    ['unbounded Unicode evidence', (f: ReturnType<typeof fixture>) => { f.input.proposal.narrationEvidence = '🐀'.repeat(501); }],
    ['negative revision', (f: ReturnType<typeof fixture>) => { f.input.expectedActiveSceneRevision = -1; }],
    ['implicit prose without an explicit proposal', (f: ReturnType<typeof fixture>) => { f.input.proposal = null as unknown as SceneMovementOutcomeProposal; }],
    ['missing lived evidence', (f: ReturnType<typeof fixture>) => { f.input.proposal.narrationEvidence = 'Not present in the saved narration.'; }],
    ['pending mechanic', (f: ReturnType<typeof fixture>) => { f.source.phase = 'pending_mechanic'; }],
    ['foreign Scene turn', (f: ReturnType<typeof fixture>) => { f.source.interactionId = 'turn:other:compound:enter:2'; }],
    ['stale action revision', (f: ReturnType<typeof fixture>) => { f.input.expectedArtifactRevision = 2; }],
    ['stale Scene revision', (f: ReturnType<typeof fixture>) => { f.input.expectedPreparedSceneRevision = 2; }],
    ['later active Scene turn', (f: ReturnType<typeof fixture>) => { f.state.latestReceiptRef = 'turn:later'; }],
    ['already settled move', (f: ReturnType<typeof fixture>) => { (f.artifact.cursor as JsonObject).completedNodeRefs = ['enter']; }],
    ['skipped move', (f: ReturnType<typeof fixture>) => { (f.artifact.cursor as JsonObject).skippedNodeRefs = ['enter']; }],
    ['missing GM choice', (f: ReturnType<typeof fixture>) => { f.input.sourceKind = 'human_gm'; }],
    ['cancelled workflow', (f: ReturnType<typeof fixture>) => { f.close(); }],
    ['concurrent action change', (f: ReturnType<typeof fixture>) => { f.race(); }],
  ] as const) it(`rejects ${name} without an outcome write`, async () => {
    const f = fixture(); mutate(f); await expect(f.service.commit(f.input)).rejects.toBeInstanceOf(Error); expect(f.records).toEqual([]);
  });
  it('keeps pending mechanics distinct and states the positive rule in the first-pass policy', () => {
    const f = fixture();
    expect(sceneMovementOutcomeIssues(f.input.proposal, f.input.expectation, f.input.proposal.narrationEvidence, true)).not.toEqual([]);
    expect(sceneMovementOutcomeIssues(null, f.input.expectation, '', true)).toEqual([]);
    for (const text of ['reached only', 'exact destination zone', 'not_reached', 'prose must state', 'pending mechanic', 'completed action is not automatically']) {
      expect(SCENE_MOVEMENT_OUTCOME_POLICY).toContain(text);
    }
  });
});
