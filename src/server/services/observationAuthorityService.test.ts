import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  commitObservationAuthority,
  readObservationAuthority,
  readObservationAuthorityOperation,
} from './observationAuthorityService.js';
import {
  emptyStoryWorkspace,
  SCENE_KIT_V4_OBSERVABLE_MAXIMUM,
  SCENE_KIT_V4_OBSERVATION_ACCESS_MAXIMUM,
  type JsonObject,
  replaceStoryWorkspace,
  type StoryWorkspaceRevisionDocument,
  validateSceneKitV3,
  validateSceneKitV4,
} from './storyWorkspaceStore.js';
import { buildPlayableSceneContextV2 } from './actionDirectedStoryStore.js';

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

function compactObservable(index: number): JsonObject {
  return {
    observableId: `gmc:observable:capacity-${index}`, subjectRef: 'gmc:scene-role:drain-worker', facet: 'surface_description', resultKind: 'observed',
    value: { kind: 'description', text: `Visible detail ${index}.` }, playerFacingStatement: `Kerrigan can see visible detail ${index} from cover.`,
    perceptibility: { modalities: ['visual'], accessCondition: 'ordinary_view', observerRefs: ['gmc:actor:kerrigan'], methodRefs: [] },
    supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:kerrigan-cover', epistemicState: 'scene_local_established', sourceRefs: ['gmc:scene-role:drain-worker'],
  };
}

function compactAccess(index: number): JsonObject {
  return {
    accessId: `gmc:access:capacity-${index}`, originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: `gmc:viewpoint:capacity-${index}`,
    accessMode: 'stationary', pathRef: null, requiredCapabilityRefs: [], availableModalities: ['visual'], subjectRefs: ['gmc:scene-role:drain-worker'],
    facets: ['surface_description'], epistemicState: 'scene_local_established', sourceRefs: ['gmc:scene-role:drain-worker'],
    playerFacingStatement: `Kerrigan has a bounded line of sight for detail ${index}.`,
  };
}

function reciprocal(subjectRef: string, storyActorRef: string, revision = 'revision:kerrigan:7'): JsonObject {
  return {
    schemaVersion: 'vcs.story-subject-binding/1', bindingRef: `vcs:binding:${subjectRef.split(':').at(-1)}`,
    ownerRef: 'tenant-a', subjectRef, subjectRevision: revision, characterRecordRef: 'vcs:character:kerrigan', characterRevision: revision,
    storyCampaignRef: 'campaign-a', storyActorRef, provenanceReceiptRefs: [`vcs:binding-receipt:${storyActorRef.endsWith('familiar') ? 'familiar' : 'kerrigan'}`], state: 'active',
  };
}

function sceneStoryDesign(): JsonObject {
  return {
    schemaVersion: 'gmc.scene-story-design/1', designId: 'scene-design:second-mouth', revision: 1,
    sceneKitRef: { sceneKitId: 'scene-kit:second-mouth', sceneKitRevision: 1 },
    scenePromise: {
      whyNow: 'Kerrigan can learn what the worker is signaling before the entrance activity changes.',
      meaningfulDevelopments: ['answer', 'complication', 'decision'],
    },
    obligations: [{
      obligationId: 'obligation:second-mouth-signal', storyNodeRef: 'gmc:story:second-mouth',
      question: 'What answers the worker at SECOND MOUTH?', state: 'open',
      allowedContributions: ['answer', 'complication', 'decision'],
      completionConditions: ['Kerrigan establishes what follows the signal.'],
      sourceRefs: ['gmc:scene:second-mouth'],
    }],
    affordances: [{
      affordanceId: 'affordance:observe-second-mouth', targetRef: 'gmc:element:drain-mouth',
      targetLabel: 'SECOND MOUTH drain', mode: 'observe',
      access: 'The entrance and accessible drain passage can be observed from cover or by a mobile familiar.',
      factRefs: ['gmc:information:worker-signal'], changeDimensions: ['knowledge', 'options'],
      obligationRefs: ['obligation:second-mouth-signal'],
    }],
    sourceRefs: ['gmc:scene:second-mouth'],
  };
}

async function prepared(withStoryDesign = false) {
  const store = memoryCollection();
  const workspace = emptyStoryWorkspace('campaign-a');
  workspace.sceneKits = [sceneKitV3()];
  if (withStoryDesign) workspace.sceneStoryDesigns = [sceneStoryDesign()];
  workspace.activeSceneKitRef = { sceneKitId: 'scene-kit:second-mouth' };
  await replaceStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'prepare:scene', workspace }, store.records);
  return store;
}

describe('observation owner authority', () => {
  it('keeps version 3 at 24 while version 4 accepts and projects 64 complete rows', () => {
    const v3 = sceneKitV3();
    v3.observables = Array.from({ length: 24 }, (_, index) => {
      const observable = compactObservable(index);
      delete observable.supportedPrecision;
      delete observable.modality;
      delete observable.viewpointRef;
      return observable;
    });
    expect(() => validateSceneKitV3(v3)).not.toThrow();
    expect(() => validateSceneKitV3({ ...v3, observables: [...v3.observables as JsonObject[], compactObservable(24)] }))
      .toThrowError(expect.objectContaining({ code: 'STORY_SCENE_KIT_V3_INVALID', details: expect.objectContaining({ field: 'sceneKit.observables' }) }));

    const observableBoundary = sceneKitV4();
    observableBoundary.observables = Array.from({ length: SCENE_KIT_V4_OBSERVABLE_MAXIMUM }, (_, index) => compactObservable(index));
    expect(JSON.stringify(observableBoundary).length).toBeGreaterThan(32_768);
    expect(() => validateSceneKitV4(observableBoundary)).not.toThrow();
    expect(() => validateSceneKitV4({ ...observableBoundary, observables: [...observableBoundary.observables as JsonObject[], compactObservable(64)] }))
      .toThrowError(expect.objectContaining({ code: 'STORY_SCENE_KIT_V4_INVALID', details: expect.objectContaining({ field: 'sceneKit.observables', maximum: 64 }) }));

    const accessBoundary = sceneKitV4();
    accessBoundary.observationAccess = Array.from({ length: SCENE_KIT_V4_OBSERVATION_ACCESS_MAXIMUM }, (_, index) => compactAccess(index));
    expect(() => validateSceneKitV4(accessBoundary)).not.toThrow();
    expect(() => validateSceneKitV4({ ...accessBoundary, observationAccess: [...accessBoundary.observationAccess as JsonObject[], compactAccess(64)] }))
      .toThrowError(expect.objectContaining({ code: 'STORY_SCENE_KIT_V4_INVALID', details: expect.objectContaining({ field: 'sceneKit.observationAccess', maximum: 64 }) }));

    const projectedKit = sceneKitV4();
    projectedKit.observables = Array.from({ length: 26 }, (_, index) => compactObservable(index));
    projectedKit.observationAccess = Array.from({ length: 26 }, (_, index) => compactAccess(index));
    const workspace = emptyStoryWorkspace('campaign-a');
    workspace.sceneKits = [projectedKit];
    workspace.activeSceneKitRef = { sceneKitId: projectedKit.sceneKitId, revision: projectedKit.revision };
    workspace.activeBeatRef = 'beat:recon';
    const projection = buildPlayableSceneContextV2(workspace);
    expect(projection.schemaVersion).toBe('gma.playable-scene-context/4');
    expect(projection.observables).toHaveLength(26);
    expect(projection.observationAccess).toHaveLength(26);
  });

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
    const store = await prepared(true);
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
    const writtenWorkspace = store.documents.find((document) => document.revision === 2)?.workspace;
    const reboundDesign = (writtenWorkspace?.sceneStoryDesigns as JsonObject[])[0];
    expect(reboundDesign).toMatchObject({
      designId: 'scene-design:second-mouth', revision: 2,
      sceneKitRef: { sceneKitId: 'scene-kit:second-mouth', sceneKitRevision: 2 },
    });
    const originalDesign = sceneStoryDesign();
    expect(reboundDesign.scenePromise).toEqual(originalDesign.scenePromise);
    expect(reboundDesign.obligations).toEqual(originalDesign.obligations);
    expect(reboundDesign.affordances).toEqual(originalDesign.affordances);
    expect(reboundDesign.sourceRefs).toEqual(originalDesign.sourceRefs);
    const replay = await commitObservationAuthority(request, store.records);
    expect(replay).toMatchObject({ disposition: 'committed', duplicate: true, storyWorkspaceRef: { revision: 2 } });
    expect(store.documents).toHaveLength(2);
    await expect(readObservationAuthorityOperation({ userId: 'tenant-a', campaignId: 'campaign-a', operationId: request.operationId }, store.records))
      .resolves.toMatchObject({ disposition: 'committed', storyWorkspaceRef: { revision: 2 } });
    const projection = await readObservationAuthority({ userId: 'tenant-a', campaignId: 'campaign-a', subjectRefs: ['gmc:scene-role:drain-worker'] }, store.records);
    expect(projection).toMatchObject({ preparationState: 'ready', observables: [{ observableId: 'gmc:observable:worker-appearance' }, { observableId: 'gmc:observable:worker-distance' }] });
  });

  it('atomically appends only exact action-matched prepared targets and closes their observation authority', async () => {
    const store = await prepared(true);
    const kit = sceneKitV4();
    const targetRef = 'gmc:scene-role:interior-drain-worker';
    (kit.participants as JsonObject).sceneLocalRoles = [
      ...((kit.participants as JsonObject).sceneLocalRoles as JsonObject[]),
      { roleId: targetRef, label: 'interior drain worker', count: 1, objective: 'Inspect the runoff grating.' },
    ];
    (kit.observationAccess as JsonObject[]).push({
      accessId: 'gmc:access:rat-interior-worker', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:drain-interior',
      accessMode: 'remote_sensor', pathRef: 'gmc:path:cover-to-drain', requiredCapabilityRefs: ['vcs:mobility:rat', 'vcs:sense:familiar-link'], availableModalities: ['visual'],
      subjectRefs: [targetRef], facets: ['surface_description'], epistemicState: 'scene_local_established',
      sourceRefs: [targetRef], playerFacingStatement: 'The rat can approach the worker inside the drain.',
    });
    (kit.observables as JsonObject[]).push({
      observableId: 'gmc:observable:interior-worker-appearance', subjectRef: targetRef, facet: 'surface_description', resultKind: 'observed',
      value: { kind: 'description', text: 'A lean worker in dark drain-service clothing.' }, playerFacingStatement: 'The worker is lean and wears dark drain-service clothing.',
      perceptibility: { modalities: ['visual'], accessCondition: 'declared_method', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'], mechanicRef: null },
      supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:drain-interior', epistemicState: 'scene_local_established', sourceRefs: [targetRef],
    });
    const request = {
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
      operationId: 'operation:prepare-interior-worker', idempotencyKey: 'observation:prepare-interior-worker', sceneKit: kit,
      vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:kerrigan-familiar')],
      sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'], preparedTargetRefs: [targetRef],
    };
    await expect(commitObservationAuthority(request, store.records)).resolves.toMatchObject({ disposition: 'committed', duplicate: false });
    const written = store.documents.find((document) => document.revision === 2)?.workspace;
    const writtenKit = (written?.sceneKits as JsonObject[])[0];
    expect(((writtenKit.participants as JsonObject).sceneLocalRoles as JsonObject[]).at(-1)).toMatchObject({ roleId: targetRef });
    expect((writtenKit.observables as JsonObject[]).at(-1)).toMatchObject({ subjectRef: targetRef, sourceRefs: [targetRef] });
    await expect(commitObservationAuthority(request, store.records)).resolves.toMatchObject({ disposition: 'committed', duplicate: true });
    expect(store.documents).toHaveLength(2);
  });

  it('atomically appends an action-matched prepared element with exact source closure', async () => {
    const store = await prepared(true);
    const kit = sceneKitV4();
    const targetRef = 'gmc:element:interior-service-hatch';
    kit.establishedElements = [
      ...(kit.establishedElements as JsonObject[]),
      { elementId: targetRef, truthState: 'scene_local_established', summary: 'An iron service hatch is set into the drain wall.' },
    ];
    (kit.observationAccess as JsonObject[]).push({
      accessId: 'gmc:access:rat-interior-hatch', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:drain-interior',
      accessMode: 'remote_sensor', pathRef: 'gmc:path:cover-to-drain', requiredCapabilityRefs: ['vcs:mobility:rat', 'vcs:sense:familiar-link'], availableModalities: ['visual'],
      subjectRefs: [targetRef], facets: ['surface_description'], epistemicState: 'scene_local_established',
      sourceRefs: [targetRef], playerFacingStatement: 'The rat can see the service hatch inside the drain.',
    });
    (kit.observables as JsonObject[]).push({
      observableId: 'gmc:observable:interior-service-hatch', subjectRef: targetRef, facet: 'surface_description', resultKind: 'observed',
      value: { kind: 'description', text: 'An iron service hatch is set into the wall.' }, playerFacingStatement: 'An iron service hatch is set into the drain wall.',
      perceptibility: { modalities: ['visual'], accessCondition: 'declared_method', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'], mechanicRef: null },
      supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:drain-interior', epistemicState: 'scene_local_established', sourceRefs: [targetRef],
    });
    await expect(commitObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
      operationId: 'operation:prepare-interior-hatch', idempotencyKey: 'observation:prepare-interior-hatch', sceneKit: kit,
      vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:kerrigan-familiar')],
      sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'], preparedTargetRefs: [targetRef],
    }, store.records)).resolves.toMatchObject({ disposition: 'committed', duplicate: false });
    const written = store.documents.find((document) => document.revision === 2)?.workspace;
    const writtenKit = (written?.sceneKits as JsonObject[])[0];
    expect((writtenKit.establishedElements as JsonObject[]).at(-1)).toMatchObject({ elementId: targetRef });
    expect((writtenKit.observationAccess as JsonObject[]).at(-1)).toMatchObject({ subjectRefs: [targetRef], sourceRefs: [targetRef] });
    expect((writtenKit.observables as JsonObject[]).at(-1)).toMatchObject({ subjectRef: targetRef, sourceRefs: [targetRef] });
  });

  it('commits distinct bounded-negative subjects that cite one exact owner scope without appending targets', async () => {
    const store = await prepared(true);
    const kit = sceneKitV4();
    const voiceSubjectRef = 'gma:observation-subject:voices';
    const magicSubjectRef = 'gma:observation-subject:magic-signs';
    (kit.observationAccess as JsonObject[]).push({
      accessId: 'gmc:access:rat-scoped-negatives', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:drain-interior',
      accessMode: 'remote_sensor', pathRef: 'gmc:path:cover-to-drain', requiredCapabilityRefs: ['vcs:mobility:rat', 'vcs:sense:familiar-link'], availableModalities: ['visual', 'auditory'],
      subjectRefs: [voiceSubjectRef, magicSubjectRef], facets: ['signal'], epistemicState: 'scene_local_established',
      sourceRefs: ['gmc:element:drain-mouth'], playerFacingStatement: 'The rat can check the accessible drain interior for voices and visible magic.',
    });
    (kit.observables as JsonObject[]).push(
      {
        observableId: 'gmc:observable:no-voices', subjectRef: voiceSubjectRef, facet: 'signal', resultKind: 'bounded_negative',
        value: { kind: 'statement', text: 'No voices are audible in the accessible drain interior.' }, playerFacingStatement: 'No voices are audible in the accessible drain interior.',
        perceptibility: { modalities: ['auditory'], accessCondition: 'ordinary_hearing', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'], mechanicRef: null },
        supportedPrecision: 'ordinary', modality: 'auditory', viewpointRef: 'gmc:viewpoint:drain-interior', epistemicState: 'scene_local_established', sourceRefs: ['gmc:element:drain-mouth'],
      },
      {
        observableId: 'gmc:observable:no-magic-signs', subjectRef: magicSubjectRef, facet: 'signal', resultKind: 'bounded_negative',
        value: { kind: 'statement', text: 'No visible signs of magic mark the accessible drain interior.' }, playerFacingStatement: 'No visible signs of magic mark the accessible drain interior.',
        perceptibility: { modalities: ['visual'], accessCondition: 'ordinary_view', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'], mechanicRef: null },
        supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:drain-interior', epistemicState: 'scene_local_established', sourceRefs: ['gmc:element:drain-mouth'],
      },
    );
    await expect(commitObservationAuthority({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
      operationId: 'operation:prepare-scoped-negatives', idempotencyKey: 'observation:prepare-scoped-negatives', sceneKit: kit,
      vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:kerrigan-familiar')],
      sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'], preparedTargetRefs: [],
    }, store.records)).resolves.toMatchObject({ disposition: 'committed', duplicate: false });
    const written = store.documents.find((document) => document.revision === 2)?.workspace;
    const writtenKit = (written?.sceneKits as JsonObject[])[0];
    const negatives = (writtenKit.observables as JsonObject[]).filter((row) => row.resultKind === 'bounded_negative');
    expect(negatives.map((row) => row.subjectRef)).toEqual([voiceSubjectRef, magicSubjectRef]);
    expect(negatives.every((row) => (row.sourceRefs as string[])[0] === 'gmc:element:drain-mouth')).toBe(true);
    expect(((writtenKit.participants as JsonObject).sceneLocalRoles as JsonObject[])).toHaveLength(1);
    expect(writtenKit.establishedElements).toHaveLength(1);
  });

  it('rejects mismatched, orphaned, or unrelated prepared targets without publishing a partial Scene', async () => {
    async function rejected(mutator: (kit: JsonObject) => void, preparedTargetRefs: string[], code: string) {
      const store = await prepared();
      const kit = sceneKitV4();
      const targetRef = 'gmc:scene-role:prepared-worker';
      (kit.participants as JsonObject).sceneLocalRoles = [
        ...((kit.participants as JsonObject).sceneLocalRoles as JsonObject[]),
        { roleId: targetRef, label: 'prepared worker', count: 1, objective: 'Inspect the drain.' },
      ];
      (kit.observationAccess as JsonObject[]).push({
        accessId: 'gmc:access:prepared-worker', originViewpointRef: 'gmc:viewpoint:kerrigan-cover', candidateViewpointRef: 'gmc:viewpoint:drain-apron',
        accessMode: 'remote_sensor', pathRef: 'gmc:path:cover-to-drain', requiredCapabilityRefs: ['vcs:sense:familiar-link'], availableModalities: ['visual'],
        subjectRefs: [targetRef], facets: ['surface_description'], epistemicState: 'scene_local_established', sourceRefs: [targetRef], playerFacingStatement: 'The rat can see the prepared worker.',
      });
      (kit.observables as JsonObject[]).push({
        observableId: 'gmc:observable:prepared-worker', subjectRef: targetRef, facet: 'surface_description', resultKind: 'observed',
        value: { kind: 'description', text: 'A worker in dark clothing.' }, playerFacingStatement: 'The worker wears dark clothing.',
        perceptibility: { modalities: ['visual'], accessCondition: 'declared_method', observerRefs: ['gmc:actor:kerrigan-familiar'], methodRefs: ['vcs:sense:familiar-link'], mechanicRef: null },
        supportedPrecision: 'ordinary', modality: 'visual', viewpointRef: 'gmc:viewpoint:drain-apron', epistemicState: 'scene_local_established', sourceRefs: [targetRef],
      });
      mutator(kit);
      await expect(commitObservationAuthority({
        userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, expectedSceneRevision: 1,
        operationId: `operation:${code.toLowerCase()}`, idempotencyKey: `observation:${code.toLowerCase()}`, sceneKit: kit,
        vcsBindings: [reciprocal('vcs:character:kerrigan', 'gmc:actor:kerrigan'), reciprocal('vcs:familiar:kerrigan', 'gmc:actor:kerrigan-familiar')],
        sourceReceiptRefs: ['vcs:binding-receipt:kerrigan', 'vcs:binding-receipt:familiar'], preparedTargetRefs,
      }, store.records)).rejects.toMatchObject({ code });
      expect(store.documents).toHaveLength(1);
    }

    await rejected(() => {}, [], 'STORY_OBSERVATION_PREPARED_TARGET_INVALID');
    await rejected((kit) => { (kit.observationAccess as JsonObject[]).pop(); }, ['gmc:scene-role:prepared-worker'], 'STORY_OBSERVATION_PREPARED_TARGET_ORPHANED');
    await rejected((kit) => {
      (kit.observationAccess as JsonObject[]).pop();
      (kit.observables as JsonObject[]).pop();
      (kit.obstructions as JsonObject[]).push({
        obstructionId: 'gmc:obstruction:prepared-worker-only', subjectRefs: ['gmc:scene-role:prepared-worker'],
        affectedFacets: ['surface_description'], affectedModalities: ['visual'], affectedAccessRefs: [], pathRefs: [], viewpointRefs: [],
        mobilityEffect: 'none', observerRefs: [], formRefs: [], methodRefs: [], playerFacingStatement: 'The worker is blocked from view.',
        sourceRefs: ['gmc:scene-role:prepared-worker'], provenanceReceiptRefs: ['vcs:binding-receipt:familiar'],
      });
    }, ['gmc:scene-role:prepared-worker'], 'STORY_OBSERVATION_PREPARED_TARGET_ORPHANED');
    await rejected((kit) => { kit.purpose = 'An unrelated changed purpose.'; }, ['gmc:scene-role:prepared-worker'], 'STORY_OBSERVATION_UNRELATED_CHANGE_FORBIDDEN');
  });

  it('accepts only exact Scene observation-access identifiers in obstruction access bindings', () => {
    const kit = sceneKitV4();
    kit.obstructions = [{
      obstructionId: 'gmc:obstruction:entrance-bend', subjectRefs: ['gmc:element:drain-mouth'],
      affectedFacets: ['extent'], affectedModalities: ['visual'], affectedAccessRefs: ['gmc:access:rat-worker'],
      pathRefs: [], viewpointRefs: [], mobilityEffect: 'none', observerRefs: [], formRefs: [], methodRefs: [],
      playerFacingStatement: 'The entrance bend blocks the origin sightline.',
      sourceRefs: ['gmc:scene:second-mouth'], provenanceReceiptRefs: ['gmc:scene:second-mouth'],
    }];
    expect(() => validateSceneKitV4(kit)).not.toThrow();

    const wrongVocabulary = structuredClone(kit);
    (wrongVocabulary.obstructions as JsonObject[])[0].affectedAccessRefs = ['gmc:information:worker-signal'];
    expect(() => validateSceneKitV4(wrongVocabulary)).toThrowError(expect.objectContaining({
      code: 'STORY_OBSERVATION_ACCESS_REFERENCE_INVALID',
    }));
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
