import { describe, expect, it } from 'vitest';
import { MemoryExecutionStore } from './executionStore.js';
import { getOperationDefinition, getSemanticValidator, validateOperationOutput } from './operationRegistry.js';
import { createUniversalRequest, executeLlmOperation } from './orchestrator.js';
import { FakeProviderAdapter } from './providers/fakeProvider.js';
import { SCENE_MODEL_METADATA_BINDING, validSceneModelMetadataBinding } from './sceneModelMetadataBinding.js';

// Fictional structural reproductions only: never retain a player's private reply.
function checkpointResult() {
  const identity = { operationId: 'scene-reality:test', campaignId: 'campaign:test', requestedDepth: 'investigative' };
  return {
    schemaVersion: 'gma.scene-reality-builder-result/1', ...identity,
    status: 'continuation_required', proposal: null,
    checkpoint: {
      schemaVersion: 'gma.scene-reality-build-checkpoint/1', ...identity,
      chunkIndex: 1, includedDomains: ['zones', 'actor_frames'], remainingDomains: ['elements', 'facts'],
      requiredSourceRefs: ['source:story'], continuationReason: 'Finish the objects and facts in the final chunk.',
      zones: [{
        schemaVersion: 'gmc.scene-zone/1', zoneId: 'zone:street', revision: 1, campaignId: identity.campaignId,
        label: 'Street', purpose: 'Approach to the shop', sensorySurface: ['A stone street.'],
        ordinaryActivity: ['Foot traffic passes.'], adjacentZoneRefs: [], thresholds: [],
        accessRelations: ['An open approach.'], visibleElementRefs: [], likelyChanges: [],
        storyClassification: 'incidental', sourceRefs: ['source:story'],
      }],
      actorFrames: [], elements: [], facts: [],
    },
  };
}

describe('Manual scene builder first-pass contract', () => {
  it('declares application-owned metadata in the original versioned build and repair policies', () => {
    const build = getOperationDefinition('story.scene-reality.build').prompt;
    expect(build.version).toBe(SCENE_MODEL_METADATA_BINDING.builderPolicyVersion);
    expect(build.systemInstruction).toMatch(/exactly 64 zero characters.*Do not calculate a checksum/);
    expect(build.systemInstruction).toMatch(/canonical JSON string encoded as UTF-8 before examination.*independently verifies it at commit/);
    const repair = getOperationDefinition('story.scene-reality.repair').prompt;
    expect(repair.version).toBe(SCENE_MODEL_METADATA_BINDING.repairPolicyVersion);
    expect(repair.systemInstruction).toMatch(/GMA owns the opening prose checksum/i);
    expect(repair.systemInstruction).toMatch(/opening prose.*target mapping/i);
  });

  it('recognizes only the exact metadata contract and historical absence', () => {
    expect(validSceneModelMetadataBinding(undefined)).toBe(true);
    expect(validSceneModelMetadataBinding({ ...SCENE_MODEL_METADATA_BINDING })).toBe(true);
    for (const marker of [null, [], {}, { ...SCENE_MODEL_METADATA_BINDING, extra: true },
      { ...SCENE_MODEL_METADATA_BINDING, proseFingerprintAlgorithm: 'sha256-raw-text' },
      { ...SCENE_MODEL_METADATA_BINDING, builderPolicyVersion: 'gma.scene-reality-builder-policy/2' }]) {
      expect(validSceneModelMetadataBinding(marker)).toBe(false);
    }
  });

  it('requires the placeholder only for marked complete builds and preserves unmarked validation', async () => {
    const identity = { operationId: 'scene-reality:metadata', campaignId: 'campaign:metadata', requestedDepth: 'interactive' };
    const validator = getSemanticValidator('scene-reality-builder-contract')!;
    const validate = (binding: unknown, hash: unknown) => validator({
      request: createUniversalRequest({ operation: 'story.scene-reality.build', taskId: 'metadata', correlationId: 'metadata', idempotencyKey: 'metadata',
        references: {}, context: { input: { label: 'user_text', value: { buildRequest: { ...identity, deterministicMinimumDepth: 'interactive' },
          ...(binding !== undefined ? { modelMetadataBinding: binding } : {}) } } } }),
      output: { ...identity, status: 'complete', checkpoint: null, proposal: { ...identity,
        zones: [{ zoneId: 'zone:one', sensorySurface: ['Stone.'], ordinaryActivity: ['A passage.'] }],
        actorFrames: [{ actorFrameId: 'frame:one', actorRef: 'actor:one' }], elements: [], facts: [], openingFrame: { prose: 'Stone.', presentedTargetManifest: { proseFingerprint: hash, targets: [] } } } },
    });
    expect((await validate(SCENE_MODEL_METADATA_BINDING, '0'.repeat(64))).valid).toBe(true);
    for (const hash of ['a'.repeat(64), '0'.repeat(63), null]) {
      expect((await validate(SCENE_MODEL_METADATA_BINDING, hash)).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'SCENE_REALITY_PROSE_PLACEHOLDER_REQUIRED' }),
      ]));
    }
    expect((await validate(undefined, 'a'.repeat(64))).valid).toBe(true);
    expect((await validate({ ...SCENE_MODEL_METADATA_BINDING, extra: true }, '0'.repeat(64))).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SCENE_REALITY_MODEL_METADATA_BINDING_INVALID' }),
    ]));
  });

  it('teaches exact prepared actor and threshold refs in the original policy', () => {
    expect(getOperationDefinition('story.scene-reality.build').prompt.systemInstruction).toMatch(
      /every materially addressable actor, place, threshold.*presented-target manifest with an exact prepared ref/,
    );
  });

  it('accepts prepared actor aliases and thresholds but rejects prose-only and source-only refs', async () => {
    const identity = { operationId: 'scene-reality:targets', campaignId: 'campaign:targets', requestedDepth: 'interactive' };
    const proposal = { ...identity,
      zones: [{ zoneId: 'zone:entrance', sensorySurface: ['Stone'], ordinaryActivity: ['Access'], thresholds: [{ boundaryId: 'boundary:entry' }] }],
      actorFrames: [{ actorFrameId: 'frame:familiar', actorRef: 'actor:familiar', publicLabel: 'Rat familiar' }],
      elements: [], facts: [], preparedBoundaries: [{ boundaryId: 'boundary:deep' }], sourceRefs: ['source:unprepared'],
    };
    const request = createUniversalRequest({ operation: 'story.scene-reality.build', taskId: 'targets', correlationId: 'targets', idempotencyKey: 'targets',
      references: {}, context: { input: { label: 'user_text', value: { buildRequest: { ...identity, deterministicMinimumDepth: 'interactive' },
        depthJudgment: { selectedDepth: 'interactive' } } } } });
    const validator = getSemanticValidator('scene-reality-builder-contract');
    expect(validator).toBeTypeOf('function');
    for (const targetRef of ['frame:familiar', 'actor:familiar', 'boundary:entry', 'boundary:deep', 'Rat familiar', 'source:unprepared', 'actor:forged']) {
      const output = { schemaVersion: 'gma.scene-reality-builder-result/1', ...identity, status: 'complete', checkpoint: null,
        proposal: { ...proposal, openingFrame: { presentedTargetManifest: { targets: [{ targetRef, materiallyAddressable: true }] } } } };
      const result = await validator!({ request, output });
      expect(result.valid, targetRef).toBe(['frame:familiar', 'actor:familiar', 'boundary:entry', 'boundary:deep'].includes(targetRef));
      if (!result.valid) expect(result.issues.map((issue) => issue.code)).toContain('SCENE_REALITY_PRESENTED_TARGET_UNBOUND');
    }
  });

  for (const operation of ['story.scene-reality.build', 'story.scene-reality.build.checkpoint']) {
    it(`${operation} teaches the complete wrapper, checkpoint names and nested records before the first reply`, () => {
      const policy = getOperationDefinition(operation).prompt.systemInstruction;
      expect(policy).toContain('exactly these seven keys: schemaVersion, operationId, campaignId, requestedDepth, status, proposal, checkpoint');
      expect(policy).toContain('depthJudgment.selectedDepth');
      expect(policy).toContain('BOTH');
      expect(policy).toContain('chunkIndex, includedDomains, remainingDomains, requiredSourceRefs, continuationReason, zones, actorFrames, elements, facts');
      expect(policy).toContain('includedDomains, never completedDomains');
      expect(policy).toContain('actorFrames, never actor_frames');
      expect(policy).toMatch(/sensorySurface.*ordinaryActivity.*arrays/);
      expect(policy).toMatch(/seed.*scene_local.*canonical/);
      expect(policy).toMatch(/schemaVersion.*campaignId.*sourceRefs/);
    });
  }

  it('accepts fully shaped records but rejects each reported shape defect without inventing fields', () => {
    const operation = 'story.scene-reality.build.checkpoint';
    const valid = checkpointResult();
    expect(validateOperationOutput(operation, valid).valid).toBe(true);
    const missingIdentity = { schemaVersion: valid.schemaVersion, status: valid.status, proposal: null, checkpoint: valid.checkpoint };
    expect(validateOperationOutput(operation, missingIdentity).valid).toBe(false);
    const { includedDomains, actorFrames, ...rest } = valid.checkpoint;
    const aliased = { ...valid, checkpoint: { ...rest, completedDomains: includedDomains, actor_frames: actorFrames } };
    expect(validateOperationOutput(operation, aliased).valid).toBe(false);
    const simplified = { ...valid, checkpoint: { ...valid.checkpoint, zones: [{
      zoneId: 'zone:street', revision: 1, label: 'Street', sensorySurface: 'A stone street.',
      ordinaryOperation: 'Foot traffic.', topology: 'Outside the shop.', access: 'Open.', preparedBoundaries: [],
    }] } };
    expect(validateOperationOutput(operation, simplified).valid).toBe(false);
    const wrongArray = { ...valid, checkpoint: { ...valid.checkpoint, zones: [{ ...valid.checkpoint.zones[0], sensorySurface: 'A stone street.' }] } };
    expect(validateOperationOutput(operation, wrongArray).valid).toBe(false);
    expect(valid.checkpoint.zones[0].sensorySurface).toEqual(['A stone street.']);
  });

  it('checks manual checkpoints with the registered schema and semantics without a provider call', async () => {
    const output = checkpointResult();
    const provider = new FakeProviderAdapter(() => { throw new Error('Manual validation must not call AI.'); });
    const validate = (suffix: string, candidate: unknown) => executeLlmOperation(createUniversalRequest({
      operation: 'story.scene-reality.build.checkpoint', taskId: `manual-scene-${suffix}`,
      correlationId: `manual-scene-${suffix}`, idempotencyKey: `manual-scene-${suffix}`, references: {},
      context: { input: { label: 'user_text', value: {
        buildRequest: { operationId: output.operationId, campaignId: output.campaignId, deterministicMinimumDepth: 'investigative' },
        depthJudgment: { selectedDepth: 'investigative' },
        buildStrategy: { mode: 'two_chunk_required', firstChunkDomains: ['zones', 'actor_frames'], secondChunkDomains: ['elements', 'facts'] },
      } } },
    }), { userId: 'user:test', store: new MemoryExecutionStore(), providers: [provider], manualOutput: candidate });
    const accepted = await validate('valid', output);
    expect(accepted.status).toBe('succeeded');
    expect(accepted.validation.length).toBeGreaterThan(0);
    expect(accepted.validation.every((entry) => entry.valid)).toBe(true);
    const badNested = await validate('nested', { ...output, checkpoint: { ...output.checkpoint, zones: [{ zoneId: 'zone:street' }] } });
    expect(badNested.status).toBe('review_required');
    expect(badNested.error?.code).toBe('OUTPUT_VALIDATION_FAILED');
    const badBinding = await validate('binding', { ...output, campaignId: 'campaign:other' });
    expect(badBinding.status).toBe('review_required');
    expect(badBinding.validation.flatMap((entry) => entry.issues).map((issue) => issue.code)).toContain('SCENE_REALITY_CAMPAIGN_CHANGED');
    expect(provider.calls).toHaveLength(0);
  });
});
