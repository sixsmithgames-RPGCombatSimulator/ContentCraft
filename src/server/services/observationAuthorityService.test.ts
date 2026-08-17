import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  commitObservationAuthority,
  readObservationAuthority,
  readObservationAuthorityOperation,
} from './observationAuthorityService.js';
import {
  emptyStoryWorkspace,
  type JsonObject,
  replaceStoryWorkspace,
  type StoryWorkspaceRevisionDocument,
  validateSceneKitV4,
} from './storyWorkspaceStore.js';

function matches(document: StoryWorkspaceRevisionDocument, filter: Filter<StoryWorkspaceRevisionDocument>): boolean {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, document);
    return actual === wanted;
  });
}

function memoryCollection() {
  const documents: StoryWorkspaceRevisionDocument[] = [];
  const api = {
    async findOne(filter: Filter<StoryWorkspaceRevisionDocument>, options?: { sort?: { revision?: number } }) {
      const selected = documents.filter((document) => matches(document, filter));
      if (options?.sort?.revision) selected.sort((left, right) => right.revision - left.revision);
      return structuredClone(selected[0] ?? null);
    },
    async insertOne(document: StoryWorkspaceRevisionDocument) {
      if (documents.some((candidate) => candidate.userId === document.userId && candidate.campaignId === document.campaignId
        && (candidate.idempotencyKey === document.idempotencyKey || candidate.revision === document.revision))) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
  };
  return { records: api as unknown as Collection<StoryWorkspaceRevisionDocument>, documents };
}

function sceneKitV3(): JsonObject {
  return {
    schemaVersion: 'gmc.scene-kit/3', sceneKitId: 'scene-kit:second-mouth', revision: 1, planningState: 'active',
    playableLocus: { kind: 'scene_local_locus', label: 'SECOND MOUTH apron', canonicalAnchorRef: 'gmc:location:second-mouth', sourceRefs: ['gmc:scene:second-mouth'] },
    purpose: 'Observe the drain entrance without being detected.', dramaticQuestion: 'What is the worker signaling into the drain?',
    participants: {
      present: ['gmc:actor:kerrigan', 'gmc:actor:kerrigan-familiar'], anticipated: [],
      sceneLocalRoles: [{ roleId: 'gmc:scene-role:drain-worker', label: 'drain worker', count: 1, objective: 'wait at the entrance' }],
    },
    establishedElements: [{ elementId: 'gmc:element:drain-mouth', truthState: 'scene_local_established', summary: 'The passage bends out of sight shortly inside.' }],
    information: [{ informationId: 'gmc:information:worker-signal', state: 'plainly_visible', factText: 'The worker has given two low whistles toward the bend.', accessVectors: ['observe the entrance'] }],
    observables: [], obstructions: [],
    beats: [
      { beatId: 'beat:recon', kind: 'reconnaissance', state: 'active', trigger: 'Kerrigan observes the entrance.', changeSurface: 'The signal response may become known.', potentialImpacts: [] },
      { beatId: 'beat:answer', kind: 'response', state: 'available', trigger: 'Something answers the signal.', changeSurface: 'The entrance activity changes.', potentialImpacts: [] },
    ],
    pressures: ['The worker may finish waiting.'],
    exitVectors: [
      { kind: 'completion', condition: 'Kerrigan establishes what follows the signal.' },
      { kind: 'failure', condition: 'Observation is specifically prevented.' },
      { kind: 'abandonment', condition: 'Kerrigan leaves without observing.' },
      { kind: 'redirect', condition: 'Kerrigan pursues another route.' },
    ],
    storyBindings: ['gmc:story:second-mouth'], sourceRefs: ['gmc:scene:second-mouth'],
  };
}

function sceneKitV4(): JsonObject {
  const prior = sceneKitV3();
  return {
    ...prior,
    schemaVersion: 'gmc.scene-kit/4', revision: 2,
    actorMechanicsBindings: [
      {
        schemaVersion: 'gmc.actor-mechanics-binding/1', bindingRef: 'gmc:binding:kerrigan', campaignRef: 'campaign-a',
        actorRef: 'gmc:actor:kerrigan', actorRecordRef: 'gmc:actor:kerrigan', actorRecordRevision: 1,
        mechanicsSubjectRef: 'vcs:character:kerrigan', vcsOwnerRef: 'tenant-a', vcsRevision: 'revision:kerrigan:7',
        provenanceReceiptRefs: ['vcs:binding-receipt:kerrigan'], visibility: 'gm_only', state: 'active',
      },
      {
        schemaVersion: 'gmc.actor-mechanics-binding/1', bindingRef: 'gmc:binding:kerrigan-familiar', campaignRef: 'campaign-a',
        actorRef: 'gmc:actor:kerrigan-familiar', actorRecordRef: 'gmc:actor:kerrigan-familiar', actorRecordRevision: 1,
        mechanicsSubjectRef: 'vcs:familiar:kerrigan', vcsOwnerRef: 'tenant-a', vcsRevision: 'revision:kerrigan:7',
        provenanceReceiptRefs: ['vcs:binding-receipt:familiar'], visibility: 'gm_only', state: 'active',
      },
    ],
    observationAccess: [
      {
        accessId: 'gmc:access:kerrigan-worker', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:kerrigan-cover',
        accessMode: 'stationary', pathRef: null, requiredCapabilityRefs: ['vcs:sense:ordinary-vision'], availableModalities: ['visual'],
        subjectRefs: ['gmc:scene-role:drain-worker'], facets: ['spatial_relation'], epistemicState: 'scene_local_established',
        sourceRefs: ['gmc:scene-role:drain-worker'], playerFacingStatement: 'The worker is visible across the narrow apron from Kerrigan’s cover.',
      },
      {
        accessId: 'gmc:access:rat-worker', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:drain-apron',
        accessMode: 'remote_sensor', pathRef: 'gmc:path:cover-to-drain', requiredCapabilityRefs: ['vcs:mobility:rat', 'vcs:sense:familiar-link'], availableModalities: ['visual', 'auditory', 'olfactory'],
        subjectRefs: ['gmc:scene-role:drain-worker', 'gmc:element:drain-mouth'], facets: ['surface_description', 'apparent_classification', 'activity', 'extent'], epistemicState: 'scene_local_established',
        sourceRefs: ['gmc:scene:second-mouth'], playerFacingStatement: 'The rat can cross the apron and observe from the drain entrance.',
      },
    ],
    observables: [
      {
        observableId: 'gmc:observable:worker-appearance', subjectRef: 'gmc:scene-role:drain-worker', facet: 'surface_description', resultKind: 'observed',
        value: { kind: 'description', text: 'A broad-shouldered human worker in an oilskin coat, with a shaved head and a brass drain badge.' },
        playerFacingStatement: 'Up close, the worker is visibly human: broad-shouldered, shaved-headed, and wearing an oilskin coat with a brass drain badge.',
        perceptibility: { modalities: ['visual'], accessCondition: 'declared_method', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'] },
        supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:drain-apron', epistemicState: 'scene_local_established', sourceRefs: ['gmc:scene-role:drain-worker'],
      },
      {
        observableId: 'gmc:observable:worker-distance', subjectRef: 'gmc:scene-role:drain-worker', facet: 'spatial_relation', resultKind: 'observed',
        value: { kind: 'measurement_range', minimum: 25, maximum: 35, unit: 'feet' }, playerFacingStatement: 'The worker is roughly thirty feet from Kerrigan’s cover.',
        perceptibility: { modalities: ['visual'], accessCondition: 'ordinary_view', observerRefs: ['gmc:actor:kerrigan'], methodRefs: [] },
        supportedPrecision: 'approximate', modality: 'visual', viewpointRef: 'gmc:viewpoint:kerrigan-cover', epistemicState: 'scene_local_established', sourceRefs: ['gmc:scene-role:drain-worker'],
      },
    ],
    obstructions: [],
  };
}

function reciprocal(subjectRef: string, storyActorRef: string, revision = 'revision:kerrigan:7'): JsonObject {
  return {
    schemaVersion: 'vcs.story-subject-binding/1', bindingRef: `vcs:binding:${subjectRef.split(':').at(-1)}`,
    ownerRef: 'tenant-a', subjectRef, subjectRevision: revision, characterRecordRef: 'vcs:character:kerrigan', characterRevision: revision,
    storyCampaignRef: 'campaign-a', storyActorRef, provenanceReceiptRefs: [`vcs:binding-receipt:${storyActorRef.endsWith('familiar') ? 'familiar' : 'kerrigan'}`], state: 'active',
  };
}

async function prepared() {
  const store = memoryCollection();
  const workspace = emptyStoryWorkspace('campaign-a');
  workspace.sceneKits = [sceneKitV3()];
  workspace.activeSceneKitRef = { sceneKitId: 'scene-kit:second-mouth' };
  await replaceStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'prepare:scene', workspace }, store.records);
  return store;
}

describe('observation owner authority', () => {
  it('projects exact owner refs and requires a Scene-kit upgrade without inventing access', async () => {
    const store = await prepared();
    const projection = await readObservationAuthority({ userId: 'tenant-a', campaignId: 'campaign-a', actorRefs: ['gmc:actor:kerrigan-familiar'] }, store.records);
    expect(projection).toMatchObject({ preparationState: 'scene_kit_upgrade_required', sceneKitRef: { revision: 1 }, actorCandidates: [{ actorRef: 'gmc:actor:kerrigan-familiar' }], observationAccess: [] });
    expect(JSON.stringify(projection.actorCandidates)).not.toContain('drain worker');
  });

  it('derives a stable familiar actor only from the exact current parent and mechanics subject', async () => {
    const store = await prepared();
    const first = await readObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a',
      derivedSubject: { parentActorRef: 'gmc:actor:kerrigan', mechanicsSubjectRef: 'vcs:familiar:kerrigan', subjectKind: 'familiar' },
    }, store.records);
    const second = await readObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a',
      derivedSubject: { parentActorRef: 'gmc:actor:kerrigan', mechanicsSubjectRef: 'vcs:familiar:kerrigan', subjectKind: 'familiar' },
    }, store.records);
    expect(first.derivedActorCandidates).toHaveLength(1);
    expect(first.derivedActorCandidates).toEqual(second.derivedActorCandidates);
    expect(first.derivedActorCandidates[0]).toMatchObject({
      schemaVersion: 'gmc.observation-derived-actor-candidate/1',
      actorKind: 'familiar', parentActorRef: 'gmc:actor:kerrigan', mechanicsSubjectRef: 'vcs:familiar:kerrigan',
    });
    await expect(readObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a',
      derivedSubject: { parentActorRef: 'gmc:actor:not-present', mechanicsSubjectRef: 'vcs:familiar:kerrigan', subjectKind: 'familiar' },
    }, store.records)).rejects.toMatchObject({ code: 'STORY_OBSERVATION_DERIVED_ACTOR_INVALID' });
  });

  it('atomically commits and reconciles reciprocal Scene observation authority', async () => {
    const store = await prepared();
    const kit = sceneKitV4();
    expect(() => validateSceneKitV4(kit)).not.toThrow();
    const request = {
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
      operationId: 'operation:prepare-second-mouth', idempotencyKey: 'observation:prepare-second-mouth', sceneKit: kit,
      vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:kerrigan-familiar')],
      sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'],
    };
    const committed = await commitObservationAuthority(request, store.records);
    expect(committed).toMatchObject({ disposition: 'committed', duplicate: false, storyWorkspaceRef: { revision: 2 }, sceneKitRef: { revision: 2 } });
    const replay = await commitObservationAuthority(request, store.records);
    expect(replay).toMatchObject({ disposition: 'committed', duplicate: true, storyWorkspaceRef: { revision: 2 } });
    await expect(readObservationAuthorityOperation({ userId: 'tenant-a', campaignId: 'campaign-a', operationId: request.operationId }, store.records))
      .resolves.toMatchObject({ disposition: 'committed', storyWorkspaceRef: { revision: 2 } });
    const projection = await readObservationAuthority({ userId: 'tenant-a', campaignId: 'campaign-a', subjectRefs: ['gmc:scene-role:drain-worker'] }, store.records);
    expect(projection).toMatchObject({ preparationState: 'ready', observables: [{ observableId: 'gmc:observable:worker-appearance' }, { observableId: 'gmc:observable:worker-distance' }] });
  });

  it('rejects split reciprocal bindings and leaves the prior Scene head intact', async () => {
    const store = await prepared();
    await expect(commitObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
      operationId: 'operation:mismatch', idempotencyKey: 'observation:mismatch', sceneKit: sceneKitV4(),
      vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:wrong')],
      sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'],
    }, store.records)).rejects.toMatchObject({ code: 'STORY_ACTOR_MECHANICS_BINDING_MISMATCH' });
    expect(store.documents).toHaveLength(1);
  });
});
