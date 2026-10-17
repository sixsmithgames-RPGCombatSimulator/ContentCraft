import { describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { actorMechanicsLinkService, type ActorLinkDecisionDocument, type ActorLinkRevisionDocument,
  type ActorLinkRecords, type ActorLinkDecisions, type VcsLinkEvidence } from './actorMechanicsLinkStore.js';
import type { readObservationAuthority } from './observationAuthorityService.js';
import { actorMechanicsLinkIssues } from '../../shared/llm/actorMechanicsLink.js';

function memory<T extends { _id: string; userId: string; campaignId: string; operationId: string; revision?: number }>() {
  const rows: T[] = [];
  const api = {
    async findOne(filter: Record<string, unknown>, options?: { sort?: { revision?: number } }) {
      const matches = rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key as keyof T] === value));
      if (options?.sort?.revision) matches.sort((a, b) => Number(b.revision) - Number(a.revision));
      return structuredClone(matches[0] ?? null);
    },
    async insertOne(row: T) {
      if (rows.some((other) => other._id === row._id || other.userId === row.userId && other.campaignId === row.campaignId
        && (other.operationId === row.operationId || row.revision !== undefined && other.revision === row.revision))) {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
      rows.push(structuredClone(row));
    },
  };
  // Only the Mongo collection overload boundary is cast; fixture records stay typed.
  return { rows, collection: api as unknown as Pick<Collection<T>, 'findOne' | 'insertOne'> };
}
function fixture() {
  const revisions = memory<ActorLinkRevisionDocument>(), decisions = memory<ActorLinkDecisionDocument>();
  const scope = { userId: 'owner:one', campaignId: 'campaign:one' };
  const authority: Awaited<ReturnType<typeof readObservationAuthority>> = {
    schemaVersion: 'gmc.observation-authority-projection/1', writerBundle: 'gmc.observation-writer-bundle/1',
    workspaceRef: { campaignId: scope.campaignId, revision: 38 },
    sceneKitRef: { sceneKitId: 'scene:one', revision: 5, schemaVersion: 'gmc.scene-kit/3', payloadFingerprint: 'a'.repeat(64) },
    preparationState: 'scene_kit_upgrade_required', derivedActorCandidates: [],
    actorCandidates: ['actor:player', 'actor:familiar', 'actor:second'].map((actorRef) => ({
      actorRef, actorKind: 'present_actor', actorRecordRef: actorRef, actorRecordRevision: 5 })),
    actorMechanicsBindings: [], observationAccess: [], observables: [], obstructions: [],
    privatePreparationContext: { schemaVersion: 'gmc.scene-kit/3', sceneKitId: 'scene:one', revision: 5,
      observables: [{ observableId: 'observation:legacy', value: { kind: 'description', text: 'Preserved legacy sight.' },
        perceptibility: { modalities: ['visual'], observerRefs: ['actor:familiar'], methodRefs: [] } }] },
  };
  const readAuthority = vi.fn(async () => structuredClone(authority));
  let time = new Date('2026-10-15T12:00:00Z');
  const service = actorMechanicsLinkService({ records: revisions.collection as ActorLinkRecords,
    decisions: decisions.collection as ActorLinkDecisions, readAuthority, now: () => time, writeCampaignAllowlist: [scope.campaignId] });
  const vcsBinding: VcsLinkEvidence = { schemaVersion: 'vcs.story-subject-binding/1', bindingRef: 'vcs:binding:one',
    ownerRef: scope.userId, subjectRef: 'vcs:character:one', subjectRevision: 'vcs:revision:one',
    characterRecordRef: 'vcs:character:one', characterRevision: 'vcs:character-revision:one',
    storyCampaignRef: scope.campaignId, storyActorRef: 'actor:player', state: 'active', provenanceReceiptRefs: ['vcs:receipt:one'] };
  const input = { ...scope, operationId: 'link:one', actorRef: 'actor:player', subjectKind: 'character' as const,
    parentActorRef: null, expectedRegistryRevision: 0, expectedWorkspaceRevision: 38, expectedSceneRevision: 5, vcsBinding };
  return { service, scope, authority, readAuthority, revisions, decisions, input,
    expire: () => { time = new Date('2026-10-17T12:00:00Z'); } };
}

describe('ADR 016 independent character identity links', () => {
  it('discovers an uncertain prepared choice by original scope/operation without refreshing proof, expiry or writes', async () => {
    const f = fixture();
    expect(await f.service.decisionOperation(f.input)).toBeNull();
    const prepared = await f.service.prepare(f.input), before = structuredClone(f.decisions.rows);
    const paused = actorMechanicsLinkService({ records: f.revisions.collection as ActorLinkRecords,
      decisions: f.decisions.collection as ActorLinkDecisions, writeCampaignAllowlist: [],
      readAuthority: async () => { throw new Error('Discovery must not reconstruct the old choice from current heads.'); } });
    f.expire();
    expect(await paused.decisionOperation(f.input)).toMatchObject({ _id: prepared.decisionRef,
      operationId: f.input.operationId, link: prepared.link, expiresAt: prepared.expiresAt });
    for (const key of ['userId', 'campaignId', 'operationId'] as const)
      expect(await paused.decisionOperation({ ...f.input, [key]: 'foreign:scope' })).toBeNull();
    await expect(paused.decisionOperation({ ...f.input, operationId: '../forged' })).rejects.toMatchObject({ code: 'ACTOR_LINK_OPERATION_INVALID' });
    expect(f.decisions.rows).toEqual(before); expect(f.revisions.rows).toEqual([]);
  });
  it('defaults new identity writes off while preserving exact discovery, committed replay and retirement', async () => {
    const f = fixture();
    const paused = actorMechanicsLinkService({ records: f.revisions.collection as ActorLinkRecords,
      decisions: f.decisions.collection as ActorLinkDecisions, readAuthority: f.readAuthority, writeCampaignAllowlist: [] });
    await expect(paused.prepare(f.input)).rejects.toMatchObject({ code: 'ACTOR_LINK_WRITES_PAUSED' });
    expect(f.decisions.rows).toHaveLength(0);
    const decision = await f.service.prepare(f.input);
    await expect(paused.confirm({ ...f.scope, decisionRef: decision.decisionRef })).rejects.toMatchObject({ code: 'ACTOR_LINK_WRITES_PAUSED' });
    expect(f.revisions.rows).toHaveLength(0);
    const receipt = await f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef });
    expect((await paused.confirm({ ...f.scope, decisionRef: decision.decisionRef })).duplicate).toBe(true);
    expect(await paused.operation(f.input)).toMatchObject({ revision: receipt.revision });
    expect((await paused.read(f.scope)).links).toEqual([receipt.link]);
    expect(await paused.retire({ ...f.scope, operationId: 'retire:paused', linkRef: receipt.link.linkRef,
      expectedRegistryRevision: receipt.revision })).toMatchObject({ revision: receipt.revision + 1 });
    expect((await paused.read(f.scope)).links).toEqual([]);
  });
  it('confirms one explicit pair without changing a legacy Scene, observations or owner heads', async () => {
    const f = fixture(), before = structuredClone(f.authority);
    const decision = await f.service.prepare(f.input);
    expect(f.revisions.rows).toHaveLength(0);
    expect(actorMechanicsLinkIssues(decision.link)).toEqual([]);
    const result = await f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef });
    expect(result.duplicate).toBe(false);
    expect(result.link.actorRef).toBe('actor:player');
    expect((await f.service.read(f.scope)).links).toEqual([decision.link]);
    expect(f.authority).toEqual(before);
    expect(f.revisions.rows).toHaveLength(1);
    expect(JSON.stringify(f.revisions.rows)).not.toContain('Preserved legacy sight.');
  });
  it('replays the exact decision and reconciles a lost commit even after decision expiry/deletion', async () => {
    const f = fixture(), first = await f.service.prepare(f.input);
    expect(await f.service.prepare(f.input)).toEqual(first);
    await f.service.confirm({ ...f.scope, decisionRef: first.decisionRef });
    f.expire(); f.decisions.rows.length = 0;
    expect((await f.service.confirm({ ...f.scope, decisionRef: first.decisionRef })).duplicate).toBe(true);
    expect(f.revisions.rows).toHaveLength(1);
  });
  it('rejects changed reuse of an issuance operation', async () => {
    const f = fixture(); await f.service.prepare(f.input);
    await expect(f.service.prepare({ ...f.input, actorRef: 'actor:second' })).rejects.toMatchObject({ code: 'ACTOR_LINK_IDEMPOTENCY_CONFLICT' });
    expect(f.revisions.rows).toHaveLength(0);
  });
  it('does not confirm an expired unused decision', async () => {
    const f = fixture(), decision = await f.service.prepare(f.input); f.expire();
    await expect(f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef })).rejects.toMatchObject({ code: 'ACTOR_LINK_DECISION_EXPIRED' });
    expect(f.revisions.rows).toHaveLength(0);
  });
  for (const [name, change] of [
    ['foreign owner', (input: ReturnType<typeof fixture>['input']) => { input.vcsBinding.ownerRef = 'owner:other'; }],
    ['foreign campaign', (input: ReturnType<typeof fixture>['input']) => { input.vcsBinding.storyCampaignRef = 'campaign:other'; }],
    ['familiar substitution', (input: ReturnType<typeof fixture>['input']) => { input.vcsBinding.subjectRef = 'vcs:familiar:one'; }],
    ['wrong actor evidence', (input: ReturnType<typeof fixture>['input']) => { input.vcsBinding.storyActorRef = 'actor:familiar'; }],
    ['missing provenance', (input: ReturnType<typeof fixture>['input']) => { input.vcsBinding.provenanceReceiptRefs = []; }],
    ['unknown actor', (input: ReturnType<typeof fixture>['input']) => { input.actorRef = 'actor:missing'; }],
  ] as const) it(`rejects ${name} before creating any link`, async () => {
    const f = fixture(); change(f.input);
    await expect(f.service.prepare(f.input)).rejects.toBeDefined();
    expect(f.revisions.rows).toHaveLength(0); expect(f.decisions.rows).toHaveLength(0);
  });
  it('checks current source heads again at confirmation', async () => {
    const f = fixture(), decision = await f.service.prepare(f.input);
    f.authority.sceneKitRef.revision = Number(f.authority.sceneKitRef.revision) + 1;
    await expect(f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef })).rejects.toMatchObject({ code: 'ACTOR_LINK_SOURCE_CONFLICT' });
    expect(f.revisions.rows).toHaveLength(0);
  });
  it('isolates decisions and operation discovery by owner and campaign', async () => {
    const f = fixture(), decision = await f.service.prepare(f.input);
    await expect(f.service.confirm({ ...f.scope, userId: 'owner:other', decisionRef: decision.decisionRef })).rejects.toMatchObject({ code: 'ACTOR_LINK_DECISION_UNAVAILABLE' });
    expect(await f.service.operation({ ...f.scope, campaignId: 'campaign:other', operationId: f.input.operationId })).toBeNull();
  });
  it('allows only one concurrent registry successor', async () => {
    const f = fixture(), first = await f.service.prepare(f.input);
    const second = await f.service.prepare({ ...f.input, operationId: 'link:two', actorRef: 'actor:second', vcsBinding: {
      ...f.input.vcsBinding, subjectRef: 'vcs:character:two', characterRecordRef: 'vcs:character:two', storyActorRef: 'actor:second' } });
    const results = await Promise.allSettled([first, second].map((row) => f.service.confirm({ ...f.scope, decisionRef: row.decisionRef })));
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(f.revisions.rows).toHaveLength(1);
  });
  it('detects contradictory embedded links instead of picking precedence', async () => {
    const f = fixture(), decision = await f.service.prepare(f.input);
    f.authority.actorMechanicsBindings.push({ state: 'active', actorRef: 'actor:familiar', mechanicsSubjectRef: 'vcs:character:one', vcsOwnerRef: f.scope.userId });
    await expect(f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef })).rejects.toMatchObject({ code: 'ACTOR_LINK_EMBEDDED_CONFLICT' });
    expect(f.revisions.rows).toHaveLength(0);
  });
  it('keeps the familiar separate and requires an exact confirmed parent link', async () => {
    const f = fixture();
    const familiar = { ...f.input, operationId: 'link:familiar', actorRef: 'actor:familiar', subjectKind: 'familiar' as const,
      parentActorRef: 'actor:player', vcsBinding: { ...f.input.vcsBinding, subjectRef: 'vcs:familiar:one', storyActorRef: 'actor:familiar' } };
    await expect(f.service.prepare(familiar)).rejects.toMatchObject({ code: 'ACTOR_LINK_PARENT_REQUIRED' });
    const character = await f.service.prepare(f.input); await f.service.confirm({ ...f.scope, decisionRef: character.decisionRef });
    const decision = await f.service.prepare({ ...familiar, expectedRegistryRevision: 1 });
    await f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef });
    expect((await f.service.read(f.scope)).links.map((row) => [row.actorRef, row.subjectKind])).toEqual([
      ['actor:player', 'character'], ['actor:familiar', 'familiar']]);
  });
  it('preserves history on retirement and makes absent actors unusable after rewind', async () => {
    const f = fixture(), decision = await f.service.prepare(f.input); await f.service.confirm({ ...f.scope, decisionRef: decision.decisionRef });
    const candidates = structuredClone(f.authority.actorCandidates); f.authority.actorCandidates = [];
    expect((await f.service.read(f.scope)).links).toEqual([]);
    f.authority.actorCandidates = candidates;
    expect((await f.service.read(f.scope)).links).toHaveLength(1);
    const request = { ...f.scope, operationId: 'retire:one', linkRef: decision.link.linkRef, expectedRegistryRevision: 1 };
    expect((await f.service.retire(request)).duplicate).toBe(false);
    expect((await f.service.retire(request)).duplicate).toBe(true);
    expect((await f.service.read(f.scope)).links).toEqual([]);
    expect(f.revisions.rows[0].links[0].state).toBe('active');
    expect(f.revisions.rows[1].links[0].state).toBe('retired');
  });
});
