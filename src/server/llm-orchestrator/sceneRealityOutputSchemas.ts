const identifier = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' } as const;
const revision = { type: 'integer', minimum: 1 } as const;
const nonNegativeRevision = { type: 'integer', minimum: 0 } as const;
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;
const depth = { enum: ['transit_thumbnail', 'interactive', 'investigative', 'encounter_set_piece'] } as const;
const actionFamily = { enum: ['observe', 'investigate', 'social', 'move', 'wait', 'interact', 'purchase', 'manipulate', 'use_capability', 'combat', 'chase', 'withdraw'] } as const;
const storyClassification = { enum: ['connected', 'incidental', 'latent'] } as const;
const text = (maximum = 1_000) => ({ type: 'string', minLength: 1, maxLength: maximum });
const idList = (maximum: number, minimum = 0) => ({ type: 'array', minItems: minimum, maxItems: maximum, uniqueItems: true, items: identifier });
const textList = (maximum: number, minimum = 0) => ({ type: 'array', minItems: minimum, maxItems: maximum, items: text() });
const strictObject = (required: readonly string[], properties: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, required, properties,
});
const nullableIdentifier = { anyOf: [identifier, { type: 'null' }] } as const;

const exactRef = (idField: string) => strictObject([idField, 'revision'], { [idField]: identifier, revision });

const preparedBoundary = strictObject(
  ['boundaryId', 'fromZoneRef', 'kind', 'beyondScope', 'committedBeforeInstructionSequence'],
  {
    boundaryId: identifier,
    fromZoneRef: identifier,
    kind: { enum: ['spatial', 'social', 'informational', 'temporal', 'capability', 'actor_profile'] },
    beyondScope: text(),
    committedBeforeInstructionSequence: nonNegativeRevision,
  },
);

const preparationProfile = strictObject(
  ['depth', 'minimumDepth', 'reason', 'expectedDwell', 'judgmentUncertainty'],
  {
    depth,
    minimumDepth: depth,
    reason: text(),
    expectedDwell: { enum: ['glimpse', 'brief', 'sustained', 'extended'] },
    judgmentUncertainty: { enum: ['low', 'medium', 'high'] },
  },
);

const storyAlignment = strictObject(
  ['classification', 'storyNodeRefs', 'basis'],
  { classification: storyClassification, storyNodeRefs: idList(24), basis: text() },
);

const sceneZone = strictObject(
  ['schemaVersion', 'zoneId', 'revision', 'campaignId', 'label', 'purpose', 'sensorySurface', 'ordinaryActivity', 'adjacentZoneRefs', 'thresholds', 'accessRelations', 'visibleElementRefs', 'likelyChanges', 'storyClassification', 'sourceRefs'],
  {
    schemaVersion: { const: 'gmc.scene-zone/1' }, zoneId: identifier, revision, campaignId: identifier,
    label: text(240), purpose: text(), sensorySurface: textList(16, 1), ordinaryActivity: textList(16, 1),
    adjacentZoneRefs: idList(24), thresholds: { type: 'array', maxItems: 24, items: preparedBoundary },
    accessRelations: textList(24, 1), visibleElementRefs: idList(64), likelyChanges: textList(24),
    storyClassification, sourceRefs: idList(64, 1),
  },
);

const actorKnowledge = strictObject(
  ['domain', 'factRefs', 'evidenceState'],
  { domain: text(500), factRefs: idList(32), evidenceState: { enum: ['knows', 'believes', 'suspects', 'does_not_know'] } },
);

const sceneActorFrame = strictObject(
  ['schemaVersion', 'actorFrameId', 'revision', 'campaignId', 'kind', 'actorRef', 'zoneRef', 'count', 'role', 'sharedActivity', 'identityMaturity', 'privateName', 'publicLabel', 'appearance', 'reasonPresent', 'currentObjective', 'affiliationRefs', 'knowledge', 'ignoranceBoundaries', 'disclosurePosture', 'hardLimits', 'approachSensitivities', 'likelyActions', 'relationshipRefs', 'promotionPolicy', 'sourceRefs'],
  {
    schemaVersion: { const: 'gmc.scene-actor-frame/1' }, actorFrameId: identifier, revision, campaignId: identifier,
    kind: { enum: ['individual', 'cohort'] }, actorRef: identifier, zoneRef: identifier,
    count: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    role: { anyOf: [text(500), { type: 'null' }] }, sharedActivity: { anyOf: [text(), { type: 'null' }] },
    identityMaturity: { enum: ['seed', 'scene_local', 'canonical'] },
    privateName: { anyOf: [text(240), { type: 'null' }] }, publicLabel: text(), appearance: text(),
    reasonPresent: text(), currentObjective: text(), affiliationRefs: idList(16),
    knowledge: { type: 'array', minItems: 1, maxItems: 32, items: actorKnowledge },
    ignoranceBoundaries: textList(24), disclosurePosture: text(), hardLimits: textList(24),
    approachSensitivities: textList(24), likelyActions: textList(24), relationshipRefs: idList(24),
    promotionPolicy: text(), sourceRefs: idList(64, 1),
  },
);

const sceneElement = strictObject(
  ['schemaVersion', 'elementId', 'revision', 'campaignId', 'concreteType', 'zoneRef', 'placement', 'controllerRef', 'visibleSurface', 'condition', 'contents', 'interactionSurface', 'accessRelations', 'validity', 'promotionPolicy', 'sourceRefs'],
  {
    schemaVersion: { const: 'gmc.scene-element/1' }, elementId: identifier, revision, campaignId: identifier,
    concreteType: text(), zoneRef: identifier, placement: text(), controllerRef: nullableIdentifier,
    visibleSurface: text(), condition: text(),
    contents: strictObject(['kind', 'description', 'factRefs'], {
      kind: { enum: ['fixed', 'class_bounded', 'empty'] }, description: text(), factRefs: idList(32),
    }),
    interactionSurface: text(), accessRelations: textList(24, 1), validity: text(), promotionPolicy: text(),
    sourceRefs: idList(64, 1),
  },
);

const sceneFact = strictObject(
  ['schemaVersion', 'factId', 'revision', 'campaignId', 'targetRef', 'facet', 'valueKind', 'value', 'epistemicState', 'visibility', 'accessVectors', 'observerRestrictions', 'modalityRestrictions', 'storyRelevance', 'validity', 'provenanceRefs', 'revealPolicy', 'negativeScope'],
  {
    schemaVersion: { const: 'gmc.scene-fact/1' }, factId: identifier, revision, campaignId: identifier,
    targetRef: identifier, facet: text(240),
    valueKind: { enum: ['description', 'classification', 'identity_ref', 'measurement', 'measurement_range', 'relation', 'boolean', 'count', 'set', 'statement', 'bounded_negative'] },
    value: { not: { type: 'null' } },
    epistemicState: { enum: ['canonical', 'prepared_private_world', 'scene_local_stable', 'prepared_possibility', 'future_contingent', 'revealed', 'deliberate_unknown'] },
    visibility: { enum: ['gm_only', 'revealed', 'public_surface'] }, accessVectors: textList(24, 1),
    observerRestrictions: textList(16), modalityRestrictions: textList(16), storyRelevance: storyClassification,
    validity: text(500), provenanceRefs: idList(64, 1), revealPolicy: text(),
    negativeScope: { anyOf: [text(), { type: 'null' }] },
  },
);

const storyAffordance = strictObject(
  ['affordanceId', 'coverageEntryId', 'zoneRef', 'targetRef', 'actionFamily', 'accessClass', 'thresholdRef', 'capabilityClass', 'factRefs', 'condition'],
  {
    affordanceId: identifier, coverageEntryId: identifier, zoneRef: identifier, targetRef: identifier,
    actionFamily, accessClass: nullableIdentifier, thresholdRef: nullableIdentifier, capabilityClass: nullableIdentifier,
    factRefs: idList(32, 1), condition: { anyOf: [text(), { type: 'null' }] },
  },
);

const sceneStoryDesign = strictObject(
  ['schemaVersion', 'designId', 'revision', 'campaignId', 'sceneKitRef', 'obligations', 'affordances', 'storyAlignment', 'sourceRefs'],
  {
    schemaVersion: { const: 'gmc.scene-story-design/3' }, designId: identifier, revision, campaignId: identifier,
    sceneKitRef: exactRef('sceneKitId'),
    obligations: {
      type: 'array', maxItems: 32, items: strictObject(['obligationId', 'storyNodeRef', 'description', 'factRefs'], {
        obligationId: identifier, storyNodeRef: identifier, description: text(), factRefs: idList(32),
      }),
    },
    affordances: { type: 'array', minItems: 1, maxItems: 64, items: storyAffordance },
    storyAlignment, sourceRefs: idList(128, 1),
  },
);

const sceneReality = strictObject(
  ['schemaVersion', 'realityId', 'revision', 'campaignId', 'sceneKitRef', 'timelineAnchor', 'preparationProfile', 'zoneRefs', 'actorFrameRefs', 'elementRefs', 'factRefs', 'storyAlignment', 'preparedBoundaries', 'deliberateUnknowns', 'sourceRefs'],
  {
    schemaVersion: { const: 'gmc.scene-reality/1' }, realityId: identifier, revision, campaignId: identifier,
    sceneKitRef: exactRef('sceneKitId'),
    timelineAnchor: strictObject(['workspaceRevision', 'clockRevision', 'activeSceneStateRevision', 'turnSequence'], {
      workspaceRevision: nonNegativeRevision, clockRevision: nonNegativeRevision,
      activeSceneStateRevision: nonNegativeRevision, turnSequence: nonNegativeRevision,
    }),
    preparationProfile, zoneRefs: idList(64, 1), actorFrameRefs: idList(64), elementRefs: idList(128), factRefs: idList(256),
    storyAlignment, preparedBoundaries: { type: 'array', maxItems: 64, items: preparedBoundary },
    deliberateUnknowns: textList(32), sourceRefs: idList(128, 1),
  },
);

const playableLocus = strictObject(['kind', 'label', 'canonicalAnchorRef', 'sourceRefs'], {
  kind: { enum: ['canonical_location', 'canonical_subarea', 'scene_local_locus', 'directional_target'] },
  label: text(500), canonicalAnchorRef: nullableIdentifier, sourceRefs: idList(24, 1),
});

const sceneParticipants = strictObject(['present', 'sceneLocalRoles', 'anticipated'], {
  present: idList(32),
  sceneLocalRoles: {
    type: 'array', maxItems: 16, items: strictObject(['roleId', 'label', 'count', 'objective'], {
      roleId: identifier, label: text(240), count: { type: 'integer', minimum: 1 }, objective: text(),
    }),
  },
  anticipated: idList(16),
});

const compactElement = strictObject(['elementId', 'truthState', 'summary'], {
  elementId: identifier, truthState: { enum: ['canonical', 'scene_local_established'] }, summary: text(1_500),
});

const compactInformation = strictObject(['informationId', 'state', 'factText', 'accessVectors'], {
  informationId: identifier, state: { enum: ['concealed', 'plainly_visible', 'absent_in_scope'] },
  factText: text(800), accessVectors: textList(8, 1),
});

const sceneBeat = strictObject(['beatId', 'kind', 'state', 'trigger', 'changeSurface', 'potentialImpacts'], {
  beatId: identifier, kind: identifier, state: { enum: ['available', 'active', 'resolved', 'bypassed'] },
  trigger: text(1_500), changeSurface: text(1_500),
  potentialImpacts: {
    type: 'array', maxItems: 8, items: strictObject(['storyNodeRef', 'outcome', 'effect'], {
      storyNodeRef: identifier, outcome: identifier, effect: { enum: ['advance', 'complicate', 'resolve', 'reopen', 'retire'] },
    }),
  },
});

const sceneExit = strictObject(['kind', 'condition'], {
  kind: { enum: ['completion', 'failure', 'abandonment', 'redirect'] }, condition: text(1_500),
});

const emptyOwnerProjection = { type: 'array', maxItems: 0 } as const;

const sceneKit = strictObject(
  ['schemaVersion', 'sceneKitId', 'sceneId', 'campaignId', 'revision', 'planningState', 'truthState', 'playableLocus', 'purpose', 'dramaticQuestion', 'participants', 'establishedElements', 'information', 'actorMechanicsBindings', 'observationAccess', 'observables', 'obstructions', 'beats', 'pressures', 'exitVectors', 'storyBindings', 'sourceRefs', 'sceneRealityRef', 'sceneStoryDesignRef'],
  {
    schemaVersion: { const: 'gmc.scene-kit/5' }, sceneKitId: identifier, sceneId: identifier, campaignId: identifier, revision,
    planningState: { enum: ['prepared', 'active', 'resolved', 'dormant'] }, truthState: { enum: ['gm_preparation', 'private_canon', 'revealed_canon'] },
    playableLocus, purpose: text(2_000), dramaticQuestion: text(1_500), participants: sceneParticipants,
    establishedElements: { type: 'array', maxItems: 32, items: compactElement },
    information: { type: 'array', maxItems: 24, items: compactInformation },
    actorMechanicsBindings: emptyOwnerProjection, observationAccess: emptyOwnerProjection,
    observables: emptyOwnerProjection, obstructions: emptyOwnerProjection,
    beats: { type: 'array', minItems: 2, maxItems: 5, items: sceneBeat }, pressures: textList(8),
    exitVectors: { type: 'array', minItems: 4, maxItems: 8, items: sceneExit },
    storyBindings: idList(8), sourceRefs: idList(24, 1),
    sceneRealityRef: exactRef('realityId'), sceneStoryDesignRef: exactRef('designId'),
  },
);

const presentedTargetManifest = strictObject(
  ['schemaVersion', 'manifestId', 'campaignId', 'certificateRef', 'proseFingerprint', 'targets'],
  {
    schemaVersion: { const: 'gma.presented-target-manifest/1' }, manifestId: identifier, campaignId: identifier,
    certificateRef: exactRef('certificateId'), proseFingerprint: sha256,
    targets: {
      type: 'array', maxItems: 64, items: strictObject(['surfaceText', 'targetRef', 'targetKind', 'materiallyAddressable'], {
        surfaceText: text(500), targetRef: nullableIdentifier,
        targetKind: { enum: ['actor', 'place', 'threshold', 'container', 'vehicle', 'structure', 'object', 'texture'] },
        materiallyAddressable: { type: 'boolean' },
      }),
    },
  },
);

const activeSceneState = strictObject(
  ['revision', 'receiptChain'],
  { revision: nonNegativeRevision, receiptChain: idList(64) },
);

export const sceneRealityDepthOutput = {
  schemaVersion: { const: 'gma.scene-reality-depth-judgment/1' },
  deterministicMinimumDepth: depth, selectedDepth: depth,
  reason: text(), expectedDwell: { enum: ['glimpse', 'brief', 'sustained', 'extended'] },
  uncertainty: { enum: ['low', 'medium', 'high'] },
} as const;

export const sceneRealityBuilderOutput = {
  schemaVersion: { const: 'gma.scene-reality-proposal/1' }, operationId: identifier, campaignId: identifier,
  requestedDepth: depth, sceneKit, sceneReality,
  zones: { type: 'array', minItems: 1, maxItems: 64, items: sceneZone },
  actorFrames: { type: 'array', maxItems: 64, items: sceneActorFrame },
  elements: { type: 'array', maxItems: 128, items: sceneElement }, facts: { type: 'array', maxItems: 256, items: sceneFact },
  sceneStoryDesign, activeSceneState, preparationProfile,
  preparedBoundaries: { type: 'array', maxItems: 64, items: preparedBoundary }, storyAlignment,
  sourceRefs: idList(128, 1),
  openingFrame: strictObject(['prose', 'presentedTargetManifest'], { prose: text(8_000), presentedTargetManifest }),
} as const;

const buildChunkDomain = { enum: ['zones', 'actor_frames', 'elements', 'facts'] } as const;
const buildRecordArrays = {
  zones: { type: 'array', maxItems: 64, items: sceneZone },
  actorFrames: { type: 'array', maxItems: 64, items: sceneActorFrame },
  elements: { type: 'array', maxItems: 128, items: sceneElement },
  facts: { type: 'array', maxItems: 256, items: sceneFact },
} as const;
const checkpointBuildRecordArrays = {
  zones: { type: 'array', maxItems: 8, items: sceneZone },
  actorFrames: { type: 'array', maxItems: 12, items: sceneActorFrame },
  elements: { type: 'array', maxItems: 16, items: sceneElement },
  facts: { type: 'array', maxItems: 32, items: sceneFact },
} as const;
const sceneRealityBuilderCandidate = strictObject(
  Object.keys(sceneRealityBuilderOutput),
  { ...sceneRealityBuilderOutput, ...buildRecordArrays },
);
const sceneRealityBuildCheckpoint = strictObject(
  ['schemaVersion', 'operationId', 'campaignId', 'requestedDepth', 'chunkIndex', 'includedDomains', 'remainingDomains', 'requiredSourceRefs', 'continuationReason', 'zones', 'actorFrames', 'elements', 'facts'],
  {
    schemaVersion: { const: 'gma.scene-reality-build-checkpoint/1' },
    operationId: identifier, campaignId: identifier, requestedDepth: depth,
    chunkIndex: { const: 1 },
    includedDomains: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: buildChunkDomain },
    remainingDomains: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: buildChunkDomain },
    requiredSourceRefs: idList(128, 1), continuationReason: text(1_000),
    ...checkpointBuildRecordArrays,
  },
);

export const sceneRealityBuilderCheckpointResultOutput = {
  schemaVersion: { const: 'gma.scene-reality-builder-result/1' },
  operationId: identifier,
  campaignId: identifier,
  requestedDepth: depth,
  status: { const: 'continuation_required' },
  proposal: { type: 'null' },
  checkpoint: sceneRealityBuildCheckpoint,
} as const;

/**
 * Provider-only wrapper. The owner contract remains one complete
 * gma.scene-reality-proposal/1 after GMA deterministically merges at most one
 * checkpoint with the final candidate.
 */
export const sceneRealityBuilderResultOutput = {
  schemaVersion: { const: 'gma.scene-reality-builder-result/1' },
  operationId: identifier, campaignId: identifier, requestedDepth: depth,
  status: { enum: ['complete', 'continuation_required'] },
  proposal: { anyOf: [sceneRealityBuilderCandidate, { type: 'null' }] },
  checkpoint: { anyOf: [sceneRealityBuildCheckpoint, { type: 'null' }] },
} as const;

export const sceneReadinessAssessmentOutput = strictObject(
  ['schemaVersion', 'assessmentId', 'operationId', 'campaignId', 'dossierFingerprint', 'policyFingerprint', 'selectedDepth', 'verdict', 'confidence', 'counterfactualProbes', 'debt', 'rationale', 'evidenceRefs'],
  {
    schemaVersion: { const: 'gma.scene-readiness-assessment/1' }, assessmentId: identifier, operationId: identifier, campaignId: identifier,
    dossierFingerprint: sha256, policyFingerprint: sha256, selectedDepth: depth,
    verdict: { enum: ['adequate', 'repair_required'] }, confidence: { enum: ['low', 'medium', 'high'] },
    counterfactualProbes: {
      type: 'array', minItems: 3, maxItems: 16, items: strictObject(['probe', 'status', 'evidenceRefs'], {
        probe: text(), status: { enum: ['supported', 'unsupported'] }, evidenceRefs: idList(32),
      }),
    },
    debt: {
      type: 'array', maxItems: 32, items: strictObject(['debtId', 'domain', 'description', 'blocking', 'affectedRefs'], {
        debtId: identifier,
        domain: { enum: ['locus', 'topology', 'actors', 'elements', 'information', 'operations', 'story_alignment', 'consequences', 'capabilities', 'unknowns', 'timeline'] },
        description: text(), blocking: { type: 'boolean' }, affectedRefs: idList(32, 1),
      }),
    },
    rationale: text(2_000), evidenceRefs: idList(128, 1),
  },
);

export const sceneRealityExaminerOutput = sceneReadinessAssessmentOutput.properties as Record<string, Record<string, unknown>>;

export const sceneRealityRepairOutput = {
  schemaVersion: { const: 'gma.scene-reality-repair/1' }, correctionId: identifier,
  failedDomains: { type: 'array', minItems: 1, maxItems: 11, uniqueItems: true, items: { enum: ['locus', 'topology', 'actors', 'elements', 'information', 'operations', 'story_alignment', 'consequences', 'capabilities', 'unknowns', 'timeline'] } },
  recordPatches: {
    type: 'array', minItems: 1, maxItems: 64, items: strictObject(['recordRef', 'replacement'], {
      recordRef: identifier, replacement: { anyOf: [sceneZone, sceneActorFrame, sceneElement, sceneFact] },
    }),
  },
  assessment: sceneReadinessAssessmentOutput,
} as const;
