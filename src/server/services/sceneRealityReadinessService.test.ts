import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  commitSceneReality,
  decideSceneCoverage,
  readActiveSceneReality,
  readSceneRealityInspection,
  readSceneRealityOperation,
  SCENE_REALITY_CONTRACTS,
  sceneRealityMatchesStoryHead,
  selectPreparedStoryFacts,
  type ActiveSceneRealityPointerDocument,
  type SceneFactSelectionDocument,
  type SceneRealityBundleDocument,
  type SceneRealityCollections,
  type SceneRealityOperationDocument,
} from './sceneRealityReadinessService.js';
import type { JsonObject } from './storyWorkspaceStore.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function get(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, record);
}

function matches<T extends object>(record: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = get(record as Record<string, unknown>, key);
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
      const range = wanted as { $gte?: number; $lte?: number };
      if (range.$gte !== undefined && Number(actual) < range.$gte) return false;
      if (range.$lte !== undefined && Number(actual) > range.$lte) return false;
      return range.$gte !== undefined || range.$lte !== undefined;
    }
    return actual === wanted;
  });
}

function collectionMemory<T extends object>(unique: (document: T) => string) {
  const documents: T[] = [];
  const api = {
    async findOne(filter: Filter<T>) {
      return structuredClone(documents.find((entry) => matches(entry, filter)) ?? null);
    },
    async insertOne(document: T) {
      if (documents.some((entry) => unique(entry) === unique(document))) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    async updateOne(filter: Filter<T>, update: { $set: Partial<T> }) {
      const index = documents.findIndex((entry) => matches(entry, filter));
      if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
      documents[index] = { ...documents[index], ...structuredClone(update.$set) };
      return { matchedCount: 1, modifiedCount: 1 };
    },
    find(filter: Filter<T>) {
      let selected = documents.filter((entry) => matches(entry, filter));
      const cursor = {
        sort(sort: Record<string, number>) {
          const [field, direction] = Object.entries(sort)[0] ?? [];
          if (field) selected.sort((left, right) => (Number(get(left as Record<string, unknown>, field)) - Number(get(right as Record<string, unknown>, field))) * Number(direction));
          return cursor;
        },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
  };
  return { api: api as unknown as Collection<T>, documents };
}

function memory() {
  const bundles = collectionMemory<SceneRealityBundleDocument>((entry) => `${entry.userId}:${entry.campaignId}:${entry.bundleId}`);
  const pointers = collectionMemory<ActiveSceneRealityPointerDocument>((entry) => `${entry.userId}:${entry.campaignId}`);
  const operations = collectionMemory<SceneRealityOperationDocument>((entry) => `${entry.userId}:${entry.campaignId}:${entry.operationId}`);
  const factSelections = collectionMemory<SceneFactSelectionDocument>((entry) => `${entry.userId}:${entry.campaignId}:${entry.operationId}`);
  const turns = collectionMemory<Record<string, unknown>>((entry) => `${entry.userId}:${entry.campaignId}:${entry.receiptRef}`);
  const activeStates = collectionMemory<Record<string, unknown>>((entry) => `${entry.userId}:${entry.campaignId}:${entry.sceneKitId}`);
  const stores: SceneRealityCollections = {
    bundles: bundles.api, pointers: pointers.api, operations: operations.api,
    factSelections: factSelections.api,
    sceneTurnReceipts: turns.api as unknown as SceneRealityCollections['sceneTurnReceipts'],
    activeSceneStates: activeStates.api as unknown as SceneRealityCollections['activeSceneStates'],
  };
  return {
    stores,
    bundles, pointers, operations, factSelections, turns, activeStates,
  };
}

const dependency = { owner: 'gmc', ref: 'gmc:campaign-clock:campaign:one', revision: 18, invalidateOn: ['deadline_state_change'] };
const boundary = {
  boundaryId: 'boundary:deeper-drain', fromZoneRef: 'scene-zone:second-mouth:first-bend:one', kind: 'spatial',
  beyondScope: 'The network beyond the first meaningful junction is outside this certificate.', committedBeforeInstructionSequence: 20,
};
const profile = { depth: 'investigative', minimumDepth: 'investigative', reason: 'Reconnaissance at a guarded hidden route requires investigative preparation.', expectedDwell: 'sustained', judgmentUncertainty: 'low' };
const alignment = { classification: 'connected', storyNodeRefs: ['story:arc:three-anchors'], basis: 'The route can confirm or narrow one ledger lead without forcing an outcome.' };

function buildRequest(overrides: Partial<JsonObject> = {}): JsonObject {
  return {
    schemaVersion: SCENE_REALITY_CONTRACTS.buildRequest,
    operationId: 'operation:scene-reality:one', idempotencyKey: 'idempotency:scene-reality:one', correlationId: 'correlation:one', campaignId: 'campaign:one',
    trigger: 'activation', instructionRef: 'instruction:20', playerDirection: 'Travel to SECOND MOUTH and investigate the guarded drain.', deterministicMinimumDepth: 'investigative',
    judgmentInputs: { expectedDwell: 'sustained', guardedThresholds: 1, informationObligations: 1 }, authorityReadSet: [dependency], receiptRefs: [],
    retrievalRequirements: ['current world', 'active Story', 'location', 'actors', 'timeline'], creationPolicyRef: 'gmc:preparation-generation-policy:current',
    preexistingCertificateRef: null, crossedBoundaryRef: null, programRef: null,
    ...overrides,
  };
}

function proposal(request = buildRequest(), suffix = 'one'): JsonObject {
  const preparedBoundary = { ...boundary, fromZoneRef: `scene-zone:second-mouth:first-bend:${suffix}` };
  const prose = 'A broad-shouldered drain worker waits beside a brass cleanout plate while the passage bends out of sight.';
  const zones: JsonObject[] = [{
    schemaVersion: SCENE_REALITY_CONTRACTS.zone, zoneId: `scene-zone:second-mouth:approach:${suffix}`, revision: 1, campaignId: 'campaign:one', label: 'SECOND MOUTH approach',
    purpose: 'A guarded municipal drain approach used for covert signaling.', sensorySurface: ['Wet stone, lamplight, and slow black water.'], ordinaryActivity: ['The worker checks runoff and waits for a scheduled relief.'],
    adjacentZoneRefs: [`scene-zone:second-mouth:first-bend:${suffix}`], thresholds: [preparedBoundary], accessRelations: ['The apron permits direct conversation and ordinary sight.'],
    visibleElementRefs: [`scene-element:cleanout:${suffix}`], likelyChanges: ['The relief shift arrives after the sixth bell.'], storyClassification: 'connected', sourceRefs: ['gmc:location:second-mouth'],
  }, {
    schemaVersion: SCENE_REALITY_CONTRACTS.zone, zoneId: `scene-zone:second-mouth:first-bend:${suffix}`, revision: 1, campaignId: 'campaign:one', label: 'First drain bend',
    purpose: 'The first concealed observation pocket inside the drain.', sensorySurface: ['Water echoes around a tight masonry bend.'], ordinaryActivity: ['Runoff carries scraps toward the lower junction.'],
    adjacentZoneRefs: [`scene-zone:second-mouth:approach:${suffix}`], thresholds: [preparedBoundary], accessRelations: ['A rat-sized familiar can enter; a person must move the plate.'],
    visibleElementRefs: [], likelyChanges: ['The water rises after rain.'], storyClassification: 'connected', sourceRefs: ['gmc:location:second-mouth'],
  }];
  const actors: JsonObject[] = [{
    schemaVersion: SCENE_REALITY_CONTRACTS.actorFrame, actorFrameId: `scene-actor:worker:${suffix}`, revision: 1, campaignId: 'campaign:one', kind: 'individual', actorRef: `scene-actor:worker:${suffix}`,
    zoneRef: `scene-zone:second-mouth:approach:${suffix}`, count: null, role: null, sharedActivity: null,
    identityMaturity: 'scene_local', privateName: 'Mara Venn', publicLabel: 'drain worker', appearance: 'A broad-shouldered woman in patched oilskins with a brass drain badge.',
    reasonPresent: 'She is covering an illicit signal watch during her legitimate maintenance shift.', currentObjective: 'Confirm whether the expected courier answers without drawing attention.',
    affiliationRefs: ['faction:waterworks'], knowledge: [{ domain: 'drain operations', factRefs: [`scene-fact:worker-purpose:${suffix}`], evidenceState: 'knows' }],
    ignoranceBoundaries: ['She does not know who directs the courier beyond her immediate handler.'], disclosurePosture: 'Guarded with strangers; practical with another waterworks employee.',
    hardLimits: ['She will not abandon the post before relief without a credible emergency.'], approachSensitivities: ['Official authority makes her cautious.', 'Quiet professional curiosity may earn routine details.'],
    likelyActions: ['Challenge anyone entering the drain.', 'Answer the relief whistle if it comes.'], relationshipRefs: [], promotionPolicy: 'Promote this same identity after naming, material conversation, or later reference.', sourceRefs: ['gmc:location:second-mouth', 'story:arc:three-anchors'],
  }];
  const elements: JsonObject[] = [{
    schemaVersion: SCENE_REALITY_CONTRACTS.element, elementId: `scene-element:cleanout:${suffix}`, revision: 1, campaignId: 'campaign:one', concreteType: 'brass cleanout plate', zoneRef: `scene-zone:second-mouth:approach:${suffix}`,
    placement: 'Bolted into the right wall at knee height.', controllerRef: 'faction:waterworks', visibleSurface: 'Scratched brass with recent tool marks.', condition: 'Serviceable but frequently opened.',
    contents: { kind: 'fixed', description: 'A shallow access throat leading to the first bend.', factRefs: [`scene-fact:bend:${suffix}`] }, interactionSurface: 'The plate can be inspected, unbolted, blocked, or watched.',
    accessRelations: ['Ordinary inspection is visible; opening it requires tools or cooperation.'], validity: 'Present until physically changed in accepted play.', promotionPolicy: 'Retain as a scene-local stable element.', sourceRefs: ['gmc:location:second-mouth'],
  }];
  const facts: JsonObject[] = [{
    schemaVersion: SCENE_REALITY_CONTRACTS.fact, factId: `scene-fact:worker-purpose:${suffix}`, revision: 1, campaignId: 'campaign:one', targetRef: `scene-actor:worker:${suffix}`, facet: 'current purpose', valueKind: 'statement',
    value: 'Mara is combining a legitimate maintenance shift with an illicit signal watch.', epistemicState: 'prepared_private_world', visibility: 'gm_only', accessVectors: ['Earn her confidence.', 'Observe the full signal exchange.'], observerRestrictions: [], modalityRestrictions: [], storyRelevance: 'connected', validity: 'Until her relief arrives or the watch is exposed.', provenanceRefs: ['story:arc:three-anchors'], revealPolicy: 'Reveal only through a supported social or observational route.', negativeScope: null,
  }, {
    schemaVersion: SCENE_REALITY_CONTRACTS.fact, factId: `scene-fact:bend:${suffix}`, revision: 1, campaignId: 'campaign:one', targetRef: `scene-zone:second-mouth:first-bend:${suffix}`, facet: 'space beyond the bend', valueKind: 'description',
    value: 'Beyond the bend is a six-foot maintenance pocket, a descending channel, and a chalk mark at rat-eye level.', epistemicState: 'prepared_private_world', visibility: 'gm_only', accessVectors: ['Send a small observer through the plate.', 'Enter the first bend.'], observerRestrictions: [], modalityRestrictions: ['visual', 'auditory'], storyRelevance: 'connected', validity: 'Until accepted play changes the drain.', provenanceRefs: ['gmc:location:second-mouth', 'story:arc:three-anchors'], revealPolicy: 'Reveal from a viewpoint with access to the first bend.', negativeScope: null,
  }];
  const sceneReality: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.reality, realityId: `scene-reality:second-mouth:${suffix}`, revision: 1, campaignId: 'campaign:one',
    sceneKitRef: { sceneKitId: `scene-kit:second-mouth:${suffix}`, revision: 1 }, timelineAnchor: { workspaceRevision: 62, clockRevision: 18, activeSceneStateRevision: 0, turnSequence: 20 }, preparationProfile: profile,
    zoneRefs: zones.map((entry) => entry.zoneId), actorFrameRefs: actors.map((entry) => entry.actorFrameId), elementRefs: elements.map((entry) => entry.elementId), factRefs: facts.map((entry) => entry.factId),
    storyAlignment: alignment, preparedBoundaries: [preparedBoundary], deliberateUnknowns: [], sourceRefs: ['story:arc:three-anchors', 'gmc:campaign-clock:campaign:one'],
  };
  const design: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.storyDesign, designId: `scene-design:second-mouth:${suffix}`, revision: 1, campaignId: 'campaign:one', sceneKitRef: { sceneKitId: `scene-kit:second-mouth:${suffix}`, revision: 1 }, obligations: [],
    affordances: [{ affordanceId: `affordance:worker:social:${suffix}`, coverageEntryId: `coverage:worker:social:${suffix}`, zoneRef: `scene-zone:second-mouth:approach:${suffix}`, targetRef: `scene-actor:worker:${suffix}`, actionFamily: 'social', accessClass: 'direct_conversation', thresholdRef: null, capabilityClass: null, factRefs: [`scene-fact:worker-purpose:${suffix}`], condition: null },
      { affordanceId: `affordance:bend:observe:${suffix}`, coverageEntryId: `coverage:bend:observe:${suffix}`, zoneRef: `scene-zone:second-mouth:first-bend:${suffix}`, targetRef: `scene-zone:second-mouth:first-bend:${suffix}`, actionFamily: 'observe', accessClass: null, thresholdRef: 'boundary:deeper-drain', capabilityClass: 'small_remote_observer', factRefs: [`scene-fact:bend:${suffix}`], condition: 'The observer can pass through the cleanout plate.' }],
    storyAlignment: alignment, sourceRefs: ['story:arc:three-anchors'],
  };
  const sceneKit: JsonObject = {
    schemaVersion: SCENE_REALITY_CONTRACTS.sceneKit, sceneKitId: `scene-kit:second-mouth:${suffix}`, sceneId: 'scene:second-mouth', campaignId: 'campaign:one', revision: 1,
    planningState: 'active', truthState: 'gm_preparation', playableLocus: { kind: 'canonical_subarea', label: 'SECOND MOUTH', canonicalAnchorRef: 'gmc:location:second-mouth', sourceRefs: ['gmc:location:second-mouth'] }, purpose: 'Investigate the guarded drain.', dramaticQuestion: 'What uses the signal route?',
    participants: { present: actors.map((entry) => entry.actorFrameId), sceneLocalRoles: [], anticipated: [] },
    establishedElements: [{ elementId: `scene-element:cleanout:${suffix}`, truthState: 'scene_local_established', summary: 'A brass cleanout plate opens onto the first drain bend.' }],
    information: facts.map((entry) => ({ informationId: entry.factId, state: entry.visibility === 'gm_only' ? 'concealed' : 'plainly_visible', factText: String(entry.value), accessVectors: entry.accessVectors })),
    actorMechanicsBindings: [], observationAccess: [], observables: [], obstructions: [],
    beats: [
      { beatId: 'beat:signal', kind: 'signal_watch', state: 'active', trigger: 'The courier signal or a direct challenge changes the watch.', changeSurface: 'Mara must decide whether to preserve her cover or answer the signal.', potentialImpacts: [{ storyNodeRef: 'story:arc:three-anchors', outcome: 'signal-route-narrowed', effect: 'advance' }] },
      { beatId: 'beat:entry', kind: 'drain_entry', state: 'available', trigger: 'A character or remote observer enters the cleanout.', changeSurface: 'The concealed first bend and chalk mark become reachable.', potentialImpacts: [] },
    ],
    pressures: ['The relief shift will arrive after the sixth bell.'],
    exitVectors: [
      { kind: 'completion', condition: 'The signal route is identified or ruled out with prepared evidence.' },
      { kind: 'failure', condition: 'A detected or conspicuous approach causes Mara to close access and warn her handler.' },
      { kind: 'abandonment', condition: 'The characters leave before committing to the watch or drain.' },
      { kind: 'redirect', condition: 'The relief schedule or chalk mark points the investigation toward another waterworks site.' },
    ],
    storyBindings: ['story:arc:three-anchors'], sourceRefs: ['gmc:location:second-mouth', 'story:arc:three-anchors'],
    sceneRealityRef: { realityId: sceneReality.realityId, revision: 1 }, sceneStoryDesignRef: { designId: design.designId, revision: 1 },
  };
  const manifest = {
    schemaVersion: SCENE_REALITY_CONTRACTS.presentedTargetManifest, manifestId: `manifest:opening:${suffix}`, campaignId: 'campaign:one', certificateRef: { certificateId: `scene-ready:${fingerprint({ reality: sceneReality.realityId, realityRevision: sceneReality.revision, pointerRevision: 1 }).slice(0, 40)}`, revision: 1 },
    proseFingerprint: fingerprint(prose), targets: [
      { surfaceText: 'drain worker', targetRef: `scene-actor:worker:${suffix}`, targetKind: 'actor', materiallyAddressable: true },
      { surfaceText: 'brass cleanout plate', targetRef: `scene-element:cleanout:${suffix}`, targetKind: 'object', materiallyAddressable: true },
    ],
  };
  return {
    schemaVersion: SCENE_REALITY_CONTRACTS.proposal, operationId: request.operationId, campaignId: 'campaign:one', requestedDepth: 'investigative', sceneKit, sceneReality,
    zones, actorFrames: actors, elements, facts, sceneStoryDesign: design, activeSceneState: { revision: 0, receiptChain: [] }, preparationProfile: profile,
    preparedBoundaries: [preparedBoundary], storyAlignment: alignment, sourceRefs: ['story:arc:three-anchors', 'gmc:campaign-clock:campaign:one'], openingFrame: { prose, presentedTargetManifest: manifest },
  };
}

function assessment(candidate: JsonObject, request = buildRequest()): JsonObject {
  const reality = candidate.sceneReality as JsonObject;
  return {
    schemaVersion: SCENE_REALITY_CONTRACTS.assessment, assessmentId: `assessment:${String(request.operationId)}`, operationId: request.operationId, campaignId: 'campaign:one',
    dossierFingerprint: fingerprint(candidate), policyFingerprint: 'a'.repeat(64), selectedDepth: 'investigative', verdict: 'adequate', confidence: 'high',
    counterfactualProbes: [
      { probe: 'What lies around the first bend?', status: 'supported', evidenceRefs: [(reality.factRefs as string[])[1]] },
      { probe: 'Why is the worker here?', status: 'supported', evidenceRefs: [(reality.actorFrameRefs as string[])[0]] },
      { probe: 'What can a small familiar reach?', status: 'supported', evidenceRefs: [(reality.zoneRefs as string[])[1]] },
    ], debt: [], rationale: 'The complete dossier supports sustained investigative play without inventing fundamentals.',
    evidenceRefs: [...(reality.zoneRefs as string[]), ...(reality.actorFrameRefs as string[]), ...(reality.factRefs as string[])],
  };
}

async function commitReady(mem = memory()) {
  const request = buildRequest(); const candidate = proposal(request);
  const receipt = await commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores);
  return { mem, request, candidate, receipt };
}

describe('Scene reality owner authority', () => {
  it('stages a complete dossier and exposes it through one current pointer', async () => {
    const { mem, receipt } = await commitReady();
    expect(receipt.schemaVersion).toBe(SCENE_REALITY_CONTRACTS.commitReceipt);
    expect(receipt.authoritativeStateChanged).toBe(true);
    expect(mem.bundles.documents).toHaveLength(1);
    expect(mem.pointers.documents).toHaveLength(1);
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    expect((active?.bundle as JsonObject).readinessCertificate).toMatchObject({ status: 'certified' });
  });

  it('returns the original receipt for duplicate delivery and rejects changed reuse', async () => {
    const { mem, request, candidate } = await commitReady();
    const duplicate = await commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores);
    expect(duplicate.duplicate).toBe(true);
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 1, buildRequest: { ...request, playerDirection: 'Different request.' }, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_IDEMPOTENCY_CONFLICT' });
    expect(await readSceneRealityOperation({ userId: 'user:one', campaignId: 'campaign:one', operationId: String(request.operationId) }, mem.stores)).toMatchObject({ duplicate: true });
  });

  it('rejects thin investigative preparation and unprepared narration targets', async () => {
    const mem = memory(); const request = buildRequest(); const candidate = proposal(request);
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: { ...candidate, facts: [] }, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_INVESTIGATIVE_FACTS_REQUIRED' });
    const opening = candidate.openingFrame as JsonObject;
    const manifest = opening.presentedTargetManifest as JsonObject;
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: { ...candidate, openingFrame: { ...opening, presentedTargetManifest: { ...manifest, targets: [{ surfaceText: 'an unexplained door', targetRef: 'scene-element:invented-door', targetKind: 'object', materiallyAddressable: true }] } } }, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_PRESENTED_TARGET_UNBOUND' });
  });

  it('matches coverage by exact tuple and treats an ordinary gap as a readiness defect', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const certificate = (active?.bundle as JsonObject).readinessCertificate as JsonObject;
    const base = {
      schemaVersion: SCENE_REALITY_CONTRACTS.coverageQuery, queryId: 'query:one', operationId: 'operation:coverage:one', campaignId: 'campaign:one', instructionRef: 'instruction:21', playerActionFingerprint: 'b'.repeat(64), instructionSequence: 21,
      certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision }, ownerHeads: { 'gmc:campaign-clock:campaign:one': 18, activeSceneState: 0 },
      executionWindow: { programId: null, cursorRevision: 0, nodeRefs: ['node:talk'], stopReason: 'program_end' },
    };
    const social = ((active?.bundle as JsonObject).sceneStoryDesign as JsonObject).affordances as JsonObject[];
    const requirement = { coverageEntryId: 'requirement:one', zoneRef: social[0].zoneRef, targetRef: social[0].targetRef, actionFamily: social[0].actionFamily, accessClass: social[0].accessClass, thresholdRef: social[0].thresholdRef, capabilityClass: social[0].capabilityClass };
    expect(await decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query: { ...base, requirements: [requirement] } }, mem.stores)).toMatchObject({ decision: 'covered' });
    expect(await decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query: { ...base, requirements: [{ ...requirement, actionFamily: 'investigate' }] } }, mem.stores)).toMatchObject({ decision: 'inside_envelope_defect', mutationApplied: false });
  });

  it('provides a GM inspection projection with depth, coverage, dependencies, examiner evidence, and live validity', async () => {
    const { mem } = await commitReady();
    mem.stores.readClockAuthority = async () => ({ gameClockRevision: 18 });
    const inspection = await readSceneRealityInspection({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    expect(inspection).toMatchObject({
      schemaVersion: SCENE_REALITY_CONTRACTS.inspection,
      campaignId: 'campaign:one',
      status: 'ready',
      pointerRevision: 1,
      changedDimensions: [],
      recordCounts: { zones: 2, actorFrames: 1, elements: 1, facts: 2, affordances: 2 },
      examinerAssessment: { verdict: 'adequate' },
      preparationProfile: { depth: 'investigative' },
    });
    expect(inspection?.coverageEntries).toHaveLength(2);
    expect(inspection?.preparedBoundaries).toHaveLength(1);
    expect(inspection?.dependencies).toEqual([dependency]);
    expect(inspection?.actorFrames).toHaveLength(1);
    expect(inspection?.elements).toHaveLength(1);
    expect(inspection?.history).toHaveLength(1);

    mem.stores.readClockAuthority = async () => ({ gameClockRevision: 19 });
    const stale = await readSceneRealityInspection({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    expect(stale).toMatchObject({ status: 'stale', changedDimensions: ['deadline_state_change'] });
  });

  it('marks a historical current Scene as legacy unassessed until its first full certificate replaces it', async () => {
    const mem = memory();
    const candidate = proposal();
    const sceneKit = candidate.sceneKit as JsonObject;
    mem.stores.readStoryAuthority = async () => ({
      storyWorkspaceRef: {
        contractVersion: 'gmc.story-workspace-ref/1', campaignId: 'campaign:one', workspaceId: 'story-workspace:campaign:one', revision: 62, payloadHash: 'a'.repeat(64),
      },
      workspace: { activeSceneKitRef: { sceneKitId: sceneKit.sceneKitId, revision: sceneKit.revision }, sceneKits: [sceneKit] },
    });
    await expect(readSceneRealityInspection({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores)).resolves.toMatchObject({
      schemaVersion: SCENE_REALITY_CONTRACTS.inspection,
      campaignId: 'campaign:one', status: 'legacy_unassessed',
      sceneKitRef: { sceneKitId: sceneKit.sceneKitId, revision: sceneKit.revision },
    });
    expect(mem.bundles.documents).toHaveLength(0);
  });

  it('uses the owner campaign-clock head instead of trusting the supplied coverage head', async () => {
    const { mem } = await commitReady();
    mem.stores.readClockAuthority = async () => ({ gameClockRevision: 19 });
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject;
    const certificate = bundle.readinessCertificate as JsonObject;
    const affordance = ((bundle.sceneStoryDesign as JsonObject).affordances as JsonObject[])[0];
    const decision = await decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query: {
      schemaVersion: SCENE_REALITY_CONTRACTS.coverageQuery,
      queryId: 'query:owner-clock', operationId: 'operation:coverage:owner-clock', campaignId: 'campaign:one', instructionRef: 'instruction:21',
      playerActionFingerprint: 'f'.repeat(64), instructionSequence: 21,
      certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision },
      ownerHeads: { 'gmc:campaign-clock:campaign:one': 18, activeSceneState: 0 },
      requirements: [{ coverageEntryId: affordance.coverageEntryId, zoneRef: affordance.zoneRef, targetRef: affordance.targetRef, actionFamily: affordance.actionFamily, accessClass: affordance.accessClass, thresholdRef: affordance.thresholdRef, capabilityClass: affordance.capabilityClass }],
      executionWindow: { programId: null, cursorRevision: 0, nodeRefs: ['node:talk'], stopReason: 'program_end' },
    } }, mem.stores);
    expect(decision).toMatchObject({ decision: 'certificate_stale', changedDimensions: ['deadline_state_change'] });
  });

  it('allows expansion only across a boundary committed before the instruction', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const certificate = (active?.bundle as JsonObject).readinessCertificate as JsonObject;
    const decision = await decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query: {
      schemaVersion: SCENE_REALITY_CONTRACTS.coverageQuery, queryId: 'query:boundary', operationId: 'operation:coverage:boundary', campaignId: 'campaign:one', instructionRef: 'instruction:21', playerActionFingerprint: 'c'.repeat(64), instructionSequence: 21,
      certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision }, ownerHeads: { 'gmc:campaign-clock:campaign:one': 18, activeSceneState: 0 },
      requirements: [{ coverageEntryId: 'requirement:beyond', zoneRef: 'scene-zone:second-mouth:first-bend:one', targetRef: 'boundary:deeper-drain', actionFamily: 'move', accessClass: null, thresholdRef: 'boundary:deeper-drain', capabilityClass: 'small_remote_observer' }],
      executionWindow: { programId: 'program:one', cursorRevision: 3, nodeRefs: ['node:move', 'node:observe'], stopReason: 'unresolved_mechanic' },
    } }, mem.stores);
    expect(decision).toMatchObject({ decision: 'boundary_crossing', crossedBoundaryRef: 'boundary:deeper-drain' });
  });

  it('expands the same stable Scene authority without dropping established reality', async () => {
    const { mem, candidate } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const certificate = (active?.bundle as JsonObject).readinessCertificate as JsonObject;
    const request = buildRequest({
      operationId: 'operation:scene-reality:expansion', idempotencyKey: 'idempotency:scene-reality:expansion',
      trigger: 'emergent_expansion', instructionRef: 'instruction:21',
      preexistingCertificateRef: { certificateId: certificate.certificateId, revision: certificate.revision },
      crossedBoundaryRef: 'boundary:deeper-drain', programRef: { programId: 'program:one', cursorRevision: 3 },
    });
    const replacementIdentity = proposal(request, 'replacement');
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 1, buildRequest: request, proposal: replacementIdentity, assessment: assessment(replacementIdentity, request) }, mem.stores))
      .rejects.toMatchObject({ code: 'SCENE_REALITY_SUCCESSOR_IDENTITY_CONFLICT' });

    const successor = structuredClone(candidate);
    successor.operationId = request.operationId;
    (successor.sceneKit as JsonObject).revision = 2;
    (successor.sceneReality as JsonObject).revision = 2;
    ((successor.sceneReality as JsonObject).sceneKitRef as JsonObject).revision = 2;
    (successor.sceneStoryDesign as JsonObject).revision = 2;
    ((successor.sceneStoryDesign as JsonObject).sceneKitRef as JsonObject).revision = 2;
    ((successor.sceneKit as JsonObject).sceneRealityRef as JsonObject).revision = 2;
    ((successor.sceneKit as JsonObject).sceneStoryDesignRef as JsonObject).revision = 2;
    const manifest = ((successor.openingFrame as JsonObject).presentedTargetManifest as JsonObject);
    manifest.certificateRef = {
      certificateId: `scene-ready:${fingerprint({ reality: (successor.sceneReality as JsonObject).realityId, realityRevision: 2, pointerRevision: 2 }).slice(0, 40)}`,
      revision: 2,
    };
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 1, buildRequest: request, proposal: successor, assessment: assessment(successor, request) }, mem.stores))
      .resolves.toMatchObject({ schemaVersion: SCENE_REALITY_CONTRACTS.expansionReceipt, pointerSwapRevision: 2 });
    expect(mem.bundles.documents[1].bundle.facts).toHaveLength((candidate.facts as JsonObject[]).length);
  });

  it('invalidates coverage when an owner dependency changes or the active-state receipt chain is incomplete', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject; const certificate = bundle.readinessCertificate as JsonObject; const affordance = ((bundle.sceneStoryDesign as JsonObject).affordances as JsonObject[])[0];
    const query = { schemaVersion: SCENE_REALITY_CONTRACTS.coverageQuery, queryId: 'query:stale', operationId: 'operation:coverage:stale', campaignId: 'campaign:one', instructionRef: 'instruction:21', playerActionFingerprint: 'd'.repeat(64), instructionSequence: 21, certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision }, ownerHeads: { 'gmc:campaign-clock:campaign:one': 19, activeSceneState: 1 }, requirements: [{ coverageEntryId: 'requirement:stale', zoneRef: affordance.zoneRef, targetRef: affordance.targetRef, actionFamily: affordance.actionFamily, accessClass: affordance.accessClass, thresholdRef: affordance.thresholdRef, capabilityClass: affordance.capabilityClass }], executionWindow: { programId: null, cursorRevision: 0, nodeRefs: ['node:talk'], stopReason: 'program_end' } };
    expect(await decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query }, mem.stores)).toMatchObject({ decision: 'certificate_stale' });
  });

  it('retains coverage across classified compatible receipts and invalidates material active-state changes', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject;
    const certificate = bundle.readinessCertificate as JsonObject;
    const affordance = ((bundle.sceneStoryDesign as JsonObject).affordances as JsonObject[])[0];
    const sceneKitId = String((bundle.sceneKit as JsonObject).sceneKitId);
    mem.turns.documents.push({
      userId: 'user:one', campaignId: 'campaign:one', sceneKitId,
      stateRevisionBefore: 0, stateRevisionAfter: 1, receiptRef: 'gmc:scene-turn:compatible',
      readinessChangedDimensions: [],
    });
    const query = {
      schemaVersion: SCENE_REALITY_CONTRACTS.coverageQuery, queryId: 'query:receipt-compatibility', operationId: 'operation:coverage:receipt-compatibility',
      campaignId: 'campaign:one', instructionRef: 'instruction:21', playerActionFingerprint: '9'.repeat(64), instructionSequence: 21,
      certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision },
      ownerHeads: { 'gmc:campaign-clock:campaign:one': 18, activeSceneState: 1 },
      requirements: [{ coverageEntryId: 'requirement:compatible', zoneRef: affordance.zoneRef, targetRef: affordance.targetRef, actionFamily: affordance.actionFamily, accessClass: affordance.accessClass, thresholdRef: affordance.thresholdRef, capabilityClass: affordance.capabilityClass }],
      executionWindow: { programId: null, cursorRevision: 0, nodeRefs: ['node:talk'], stopReason: 'program_end' },
    };
    await expect(decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query }, mem.stores)).resolves.toMatchObject({ decision: 'covered' });
    mem.turns.documents[0].readinessChangedDimensions = ['access'];
    await expect(decideSceneCoverage({ userId: 'user:one', campaignId: 'campaign:one', query }, mem.stores)).resolves.toMatchObject({ decision: 'certificate_stale', changedDimensions: ['access'] });
  });

  it('issues immutable read-only Story-fact selection receipts without advancing the Scene pointer', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject; const certificate = bundle.readinessCertificate as JsonObject; const design = bundle.sceneStoryDesign as JsonObject; const affordance = (design.affordances as JsonObject[])[0];
    const receipt = await selectPreparedStoryFacts({ userId: 'user:one', campaignId: 'campaign:one', proposal: {
      schemaVersion: SCENE_REALITY_CONTRACTS.factSelectionProposal, selectionId: 'selection:one', operationId: 'operation:selection:one', campaignId: 'campaign:one', instructionRef: 'instruction:21', instructionFingerprint: 'e'.repeat(64), requirementFingerprint: 'f'.repeat(64),
      sceneStoryDesignRef: { designId: design.designId, revision: design.revision }, certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision }, selections: [{ requirementRef: affordance.coverageEntryId, affordanceRef: affordance.affordanceId, factRefs: affordance.factRefs }],
    } }, mem.stores);
    expect(receipt).toMatchObject({ schemaVersion: SCENE_REALITY_CONTRACTS.factSelectionReceipt, mutationApplied: false });
    expect(mem.pointers.documents[0].revision).toBe(1);
    expect(mem.factSelections.documents).toHaveLength(1);
  });

  it('rejects cross-campaign records and dangling staged references', async () => {
    const mem = memory(); const request = buildRequest(); const candidate = proposal(request);
    const zones = structuredClone(candidate.zones as JsonObject[]);
    zones[0].campaignId = 'campaign:other';
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: { ...candidate, zones }, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_CAMPAIGN_CONFLICT' });

    const elements = structuredClone(candidate.elements as JsonObject[]);
    elements[0].zoneRef = 'scene-zone:not-staged';
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: { ...candidate, elements }, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_REF_CLOSURE_FAILED' });
  });

  it('rejects uncontracted active-state fields instead of persisting model-shaped state', async () => {
    const request = buildRequest(); const candidate = proposal(request);
    candidate.activeSceneState = { revision: 0, receiptChain: [], inventedState: 'not owner state' };
    const mem = memory();
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores))
      .rejects.toMatchObject({ code: 'SCENE_REALITY_FIELD_UNSUPPORTED', details: { field: 'proposal.activeSceneState.inventedState' } });
  });

  it('binds certification to GMC current active-state revision and its latest receipt', async () => {
    const request = buildRequest(); const candidate = proposal(request);
    const sceneKitId = String((candidate.sceneKit as JsonObject).sceneKitId);
    const receiptRef = 'gmc:scene-turn:four';
    const mem = memory();
    mem.activeStates.documents.push({ userId: 'user:one', campaignId: 'campaign:one', sceneKitId, revision: 4, latestReceiptRef: receiptRef });
    mem.turns.documents.push({ userId: 'user:one', campaignId: 'campaign:one', sceneKitId, stateRevisionBefore: 3, stateRevisionAfter: 4, receiptRef });

    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores))
      .rejects.toMatchObject({ code: 'SCENE_REALITY_ACTIVE_STATE_CONFLICT' });

    candidate.activeSceneState = { revision: 4, receiptChain: [receiptRef] };
    ((candidate.sceneReality as JsonObject).timelineAnchor as JsonObject).activeSceneStateRevision = 4;
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores))
      .resolves.toMatchObject({ resultingOwnerHeads: { activeSceneState: 4 } });
  });

  it('compares the build read-set to the current GMC Story head and keeps duplicate retry idempotent', async () => {
    const mem = memory();
    mem.stores.readStoryAuthority = async () => ({ storyWorkspaceRef: { revision: 7 } });
    const request = buildRequest({ authorityReadSet: [{ owner: 'gmc', ref: 'gmc:story-workspace:campaign:one', revision: 6, invalidateOn: ['story_source'] }] });
    const candidate = proposal(request);
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_REALITY_STORY_AUTHORITY_CONFLICT' });

    const currentRequest = buildRequest({ authorityReadSet: [{ owner: 'gmc', ref: 'gmc:story-workspace:campaign:one', revision: 7, invalidateOn: ['story_source'] }] });
    const currentCandidate = proposal(currentRequest);
    await commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: currentRequest, proposal: currentCandidate, assessment: assessment(currentCandidate, currentRequest) }, mem.stores);
    mem.stores.readStoryAuthority = async () => ({ storyWorkspaceRef: { revision: 8 } });
    await expect(commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: currentRequest, proposal: currentCandidate, assessment: assessment(currentCandidate, currentRequest) }, mem.stores)).resolves.toMatchObject({ duplicate: true });
  });

  it('allows Scene-turn settlement only while the certificate proves the exact current Story head', async () => {
    const request = buildRequest({ authorityReadSet: [{ owner: 'gmc', ref: 'gmc:story-workspace:campaign:one', revision: 7, invalidateOn: ['story_source'] }] });
    const candidate = proposal(request);
    ((candidate.sceneReality as JsonObject).timelineAnchor as JsonObject).workspaceRevision = 7;
    const mem = memory();
    mem.stores.readStoryAuthority = async () => ({ storyWorkspaceRef: { revision: 7 } });
    await commitSceneReality({ userId: 'user:one', campaignId: 'campaign:one', expectedPointerRevision: 0, buildRequest: request, proposal: candidate, assessment: assessment(candidate, request) }, mem.stores);
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    expect(sceneRealityMatchesStoryHead(active, 'campaign:one', { revision: 7 })).toBe(true);
    expect(sceneRealityMatchesStoryHead(active, 'campaign:one', { revision: 8 })).toBe(false);
    expect(sceneRealityMatchesStoryHead(active, 'campaign:other', { revision: 7 })).toBe(false);
  });

  it('rejects fact selection that is not bound to certified coverage or established fact state', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject; const certificate = bundle.readinessCertificate as JsonObject; const design = bundle.sceneStoryDesign as JsonObject; const affordance = (design.affordances as JsonObject[])[0];
    const selection = {
      schemaVersion: SCENE_REALITY_CONTRACTS.factSelectionProposal, selectionId: 'selection:bad', operationId: 'operation:selection:bad', campaignId: 'campaign:one', instructionRef: 'instruction:21', instructionFingerprint: 'e'.repeat(64), requirementFingerprint: 'f'.repeat(64),
      sceneStoryDesignRef: { designId: design.designId, revision: design.revision }, certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision }, selections: [{ requirementRef: 'coverage:not-current', affordanceRef: affordance.affordanceId, factRefs: affordance.factRefs }],
    };
    await expect(selectPreparedStoryFacts({ userId: 'user:one', campaignId: 'campaign:one', proposal: selection }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_FACT_SELECTION_REQUIREMENT_UNBOUND' });

    const storedFacts = ((mem.bundles.documents[0].bundle as JsonObject).facts as JsonObject[]);
    storedFacts[0].epistemicState = 'future_contingent';
    await expect(selectPreparedStoryFacts({ userId: 'user:one', campaignId: 'campaign:one', proposal: { ...selection, operationId: 'operation:selection:unsafe', selections: [{ requirementRef: affordance.coverageEntryId, affordanceRef: affordance.affordanceId, factRefs: affordance.factRefs }] } }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_FACT_SELECTION_EPISTEMIC_UNSAFE' });
  });

  it('closes the coverage-to-selection race when active Scene state invalidates the certificate', async () => {
    const { mem } = await commitReady();
    const active = await readActiveSceneReality({ userId: 'user:one', campaignId: 'campaign:one' }, mem.stores);
    const bundle = active?.bundle as JsonObject;
    const certificate = bundle.readinessCertificate as JsonObject;
    const design = bundle.sceneStoryDesign as JsonObject;
    const affordance = (design.affordances as JsonObject[])[0];
    const sceneKitId = String((bundle.sceneKit as JsonObject).sceneKitId);
    mem.activeStates.documents.push({ userId: 'user:one', campaignId: 'campaign:one', sceneKitId, revision: 1, latestReceiptRef: 'gmc:scene-turn:access-changed' });
    mem.turns.documents.push({
      userId: 'user:one', campaignId: 'campaign:one', sceneKitId,
      stateRevisionBefore: 0, stateRevisionAfter: 1, receiptRef: 'gmc:scene-turn:access-changed',
      readinessChangedDimensions: ['access'],
    });
    await expect(selectPreparedStoryFacts({ userId: 'user:one', campaignId: 'campaign:one', proposal: {
      schemaVersion: SCENE_REALITY_CONTRACTS.factSelectionProposal, selectionId: 'selection:raced', operationId: 'operation:selection:raced', campaignId: 'campaign:one', instructionRef: 'instruction:21', instructionFingerprint: 'a'.repeat(64), requirementFingerprint: 'b'.repeat(64),
      sceneStoryDesignRef: { designId: design.designId, revision: design.revision }, certificateRef: { certificateId: certificate.certificateId, revision: certificate.revision },
      selections: [{ requirementRef: affordance.coverageEntryId, affordanceRef: affordance.affordanceId, factRefs: affordance.factRefs }],
    } }, mem.stores)).rejects.toMatchObject({ code: 'SCENE_READINESS_CERTIFICATE_STALE', details: { changedDimensions: ['access'] } });
  });
});
