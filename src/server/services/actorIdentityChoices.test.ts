import { describe, expect, it } from 'vitest';
import { readActorIdentityChoices, type ActorIdentityChoiceDependencies } from './actorIdentityChoices.js';
import type { readObservationAuthority } from './observationAuthorityService.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import type { ActorMechanicsLink } from '../../shared/llm/actorMechanicsLink.js';

/** Isolated reader contract, not evidence of independently staged gameplay. */
function fixture() {
  const scope = { userId: 'owner:one', campaignId: 'campaign:one', subjectKind: 'character' as const, mechanicsSubjectRef: 'vcs:character:one' };
  const authority: Awaited<ReturnType<typeof readObservationAuthority>> = {
    schemaVersion: 'gmc.observation-authority-projection/1', writerBundle: 'gmc.observation-writer-bundle/1',
    workspaceRef: { campaignId: scope.campaignId, revision: 38 },
    sceneKitRef: { sceneKitId: 'scene:one', revision: 5, schemaVersion: 'gmc.scene-kit/3', payloadFingerprint: 'a'.repeat(64) },
    preparationState: 'scene_kit_upgrade_required', derivedActorCandidates: [],
    actorCandidates: ['actor:player', 'actor:familiar', 'role:worker'].map((actorRef) => ({
      actorRef, actorKind: actorRef.startsWith('role:') ? 'scene_local_role' : 'present_actor', actorRecordRef: actorRef, actorRecordRevision: 5 })),
    actorMechanicsBindings: [], observationAccess: [], observables: [], obstructions: [],
    privatePreparationContext: { participants: { present: ['actor:player', 'actor:familiar'],
      sceneLocalRoles: [{ roleId: 'role:worker', label: 'Drain worker', privateName: 'DO NOT EXPOSE Tomas' }] } },
  };
  const frames: JsonObject[] = [
    { actorRef: 'actor:player', actorFrameId: 'frame:player', revision: 1, kind: 'individual', count: 1, publicLabel: 'Mira', privateName: 'PRIVATE_PLAYER' },
    { actorRef: 'actor:familiar', actorFrameId: 'frame:familiar', revision: 1, kind: 'individual', count: 1, publicLabel: 'Rat familiar' },
    { actorRef: 'actor:hidden', actorFrameId: 'frame:hidden', revision: 1, kind: 'individual', count: 1, publicLabel: 'HIDDEN_ACTOR' },
  ];
  const bundle: JsonObject = { sceneKit: { campaignId: scope.campaignId, sceneKitId: 'scene:one', revision: 6 },
    readinessCertificate: { campaignId: scope.campaignId, status: 'certified' }, actorFrames: frames };
  const sourceHead = { workspaceRevision: 38, sceneKitId: 'scene:one', sceneRevision: 5, payloadFingerprint: 'a'.repeat(64) };
  const deps: ActorIdentityChoiceDependencies = { readAuthority: async () => structuredClone(authority),
    readReality: async () => ({ bundle: structuredClone(bundle) }),
    readLinks: async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 2, links: [], sourceHead: structuredClone(sourceHead) }),
    writeCampaignAllowlist: [scope.campaignId] };
  return { scope, deps, authority, bundle, frames, sourceHead };
}

describe('read-only human identity choices', () => {
  it('returns only the selected sheet family and separates character from familiar choices', async () => {
    const f = fixture();
    const character: ActorMechanicsLink = { schemaVersion: 'gmc.actor-mechanics-link/1', linkRef: 'link:character',
      campaignRef: f.scope.campaignId, actorRef: 'actor:player', actorRecordRef: 'actor:player', actorRecordRevision: 5,
      subjectKind: 'character', parentActorRef: null, mechanicsSubjectRef: 'vcs:character:one', vcsOwnerRef: f.scope.userId,
      vcsCharacterRef: 'vcs:character:one', vcsRevision: 'a'.repeat(64), vcsCharacterRevision: 'b'.repeat(64),
      provenanceReceiptRefs: ['receipt:character'], humanDecisionRef: 'decision:character', state: 'active' };
    const other: ActorMechanicsLink = { ...character, linkRef: 'link:other', actorRef: 'role:worker', actorRecordRef: 'role:worker',
      mechanicsSubjectRef: 'vcs:character:other', vcsCharacterRef: 'vcs:character:other' };
    f.deps.readLinks = async () => ({ schemaVersion: 'gmc.actor-mechanics-links/1', revision: 2,
      links: structuredClone([character, other]), sourceHead: f.sourceHead });
    const current = await readActorIdentityChoices(f.scope, f.deps);
    expect(current.candidates.map((row) => row.actorRef)).toEqual(['actor:player']);
    expect(current.links).toEqual([character]); expect(JSON.stringify(current.links)).not.toContain('link:other');
    const familiar = await readActorIdentityChoices({ ...f.scope, subjectKind: 'familiar', mechanicsSubjectRef: 'vcs:familiar:one' }, f.deps);
    expect(familiar.candidates.map((row) => row.actorRef)).toEqual(['actor:familiar']);
    expect(familiar.links).toEqual([character]);
    expect(familiar.candidates[0].choiceRef).not.toBe(current.candidates[0].choiceRef);
  });
  it('rejects incompatible existing owner bindings instead of choosing a convenient pair', async () => {
    const f = fixture();
    f.authority.actorMechanicsBindings = [
      { state: 'active', actorRef: 'actor:player', mechanicsSubjectRef: f.scope.mechanicsSubjectRef },
      { state: 'active', actorRef: 'actor:familiar', mechanicsSubjectRef: f.scope.mechanicsSubjectRef },
    ];
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_PAIR_CONFLICT' });
    f.authority.actorMechanicsBindings[1] = { state: 'active', actorRef: 'actor:player', mechanicsSubjectRef: 'vcs:character:other' };
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_PAIR_CONFLICT' });
  });
  it('offers exact named native actors without private names, hidden actors, mutations or automatic selection', async () => {
    const f = fixture(), before = structuredClone({ authority: f.authority, bundle: f.bundle });
    const result = await readActorIdentityChoices(f.scope, f.deps);
    expect(result.candidates.map((row) => row.label)).toEqual(['Mira', 'Rat familiar', 'Drain worker']);
    expect(result.candidates.map((row) => row.actorRef)).toEqual(['actor:player', 'actor:familiar', 'role:worker']);
    expect(result.candidates[0]).toMatchObject({ labelSourceRef: 'frame:player', labelSourceRevision: 1 });
    expect(result.candidates[2]).toMatchObject({ labelSourceRef: 'role:worker', labelSourceRevision: 5 });
    expect(result.writesAvailable).toBe(true); expect(result.unlabeledCount).toBe(0);
    expect(result).not.toHaveProperty('selectedActorRef');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PLAYER|HIDDEN_ACTOR|DO NOT EXPOSE|privateName/);
    expect({ authority: f.authority, bundle: f.bundle }).toEqual(before);
    expect(await readActorIdentityChoices(f.scope, f.deps)).toEqual(result);
  });
  it('keeps choices read-only when writes are paused', async () => {
    const f = fixture(), result = await readActorIdentityChoices(f.scope, { ...f.deps, writeCampaignAllowlist: [] });
    expect(result.candidates).toHaveLength(3); expect(result.writesAvailable).toBe(false);
  });
  it('never derives a name from an ID, privateName, or first candidate position', async () => {
    const f = fixture(); delete f.frames[0].publicLabel;
    f.authority.actorCandidates[0].actorRef = 'actor:mira-visible-looking-id';
    const result = await readActorIdentityChoices(f.scope, f.deps);
    expect(result.candidates.map((row) => row.label)).toEqual(['Rat familiar', 'Drain worker']);
    expect(result.unlabeledCount).toBe(1); expect(JSON.stringify(result)).not.toContain('PRIVATE_PLAYER');
  });
  it.each(['foreign_campaign', 'foreign_scene', 'uncertified', 'absent_bundle'])('does not use %s prepared labels', async (kind) => {
    const f = fixture();
    if (kind === 'foreign_campaign') (f.bundle.sceneKit as JsonObject).campaignId = 'campaign:other';
    if (kind === 'foreign_scene') (f.bundle.sceneKit as JsonObject).sceneKitId = 'scene:other';
    if (kind === 'uncertified') (f.bundle.readinessCertificate as JsonObject).status = 'draft';
    if (kind === 'absent_bundle') f.deps.readReality = async () => null;
    const result = await readActorIdentityChoices(f.scope, f.deps);
    expect(result.candidates.map((row) => row.label)).toEqual(['Drain worker']); expect(result.unlabeledCount).toBe(2);
  });
  it('does not offer an individual sheet as a cohort or a non-native derived actor', async () => {
    const f = fixture(); f.frames[1].kind = 'cohort'; f.frames[1].count = 5;
    f.authority.derivedActorCandidates = [{ actorRef: 'derived:familiar', publicLabel: 'Derived rat' }];
    expect((await readActorIdentityChoices(f.scope, f.deps)).candidates.map((row) => row.actorRef)).toEqual(['actor:player', 'role:worker']);
  });
  it.each(['duplicate_frame', 'duplicate_actor', 'malformed_frames', 'invalid_individual_count', 'invalid_record_revision'])('rejects %s rather than filtering corrupted owner data', async (kind) => {
    const f = fixture();
    if (kind === 'duplicate_frame') f.frames.push(structuredClone(f.frames[0]));
    if (kind === 'duplicate_actor') f.authority.actorCandidates.push(structuredClone(f.authority.actorCandidates[0]));
    if (kind === 'malformed_frames') f.bundle.actorFrames = 'unreadable';
    if (kind === 'invalid_individual_count') f.frames[0].count = 2;
    if (kind === 'invalid_record_revision') f.authority.actorCandidates[0].actorRecordRevision = 0;
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toBeDefined();
  });
  it('binds choices to exact current owner heads, registry and public label provenance', async () => {
    const f = fixture(), first = await readActorIdentityChoices(f.scope, f.deps);
    f.sourceHead.workspaceRevision += 1; f.authority.workspaceRef.revision = f.sourceHead.workspaceRevision;
    expect((await readActorIdentityChoices(f.scope, f.deps)).candidates[0].choiceRef).not.toBe(first.candidates[0].choiceRef);
    f.frames[0].publicLabel = 'Mira in disguise';
    expect((await readActorIdentityChoices(f.scope, f.deps)).candidates[0].choiceRef).not.toBe(first.candidates[0].choiceRef);
    f.sourceHead.sceneRevision += 1;
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_SOURCE_CONFLICT' });
  });
  it('rejects foreign scope and excessive catalogs without truncation', async () => {
    const f = fixture();
    await expect(readActorIdentityChoices({ ...f.scope, campaignId: 'campaign:other' }, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_SOURCE_CONFLICT' });
    f.authority.actorCandidates = Array.from({ length: 129 }, (_, i) => ({ actorRef: `actor:${i}`, actorKind: 'present_actor', actorRecordRef: `actor:${i}`, actorRecordRevision: 1 }));
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_CHOICES_INVALID' });
  });
  it('counts the complete UTF-8 catalog and rejects an oversized indivisible view', async () => {
    const f = fixture();
    f.authority.actorCandidates = Array.from({ length: 128 }, (_, i) => ({ actorRef: `actor:${i}`, actorKind: 'present_actor', actorRecordRef: `actor:${i}`, actorRecordRevision: 1 }));
    f.bundle.actorFrames = f.authority.actorCandidates.map((actor, i) => ({ actorRef: actor.actorRef,
      actorFrameId: `frame:${i}`, revision: 1, kind: 'individual', count: 1, publicLabel: '界'.repeat(180) }));
    await expect(readActorIdentityChoices(f.scope, f.deps)).rejects.toMatchObject({ code: 'ACTOR_LINK_CHOICES_OVER_BUDGET' });
  });
});
