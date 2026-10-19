import { describe, expect, it } from 'vitest';
import { SCENE_REVIEW_CAPACITY as R, assertSceneReviewCapacityProfile, admitSceneReviewCapacity, sceneReviewContextBytes } from './sceneReviewCapacity.js';
import { SCENE_TEMPORAL_ANALYSIS as A } from './sceneTemporalAnalysis.js';
import { compileScenePreparationWorkingSet, decodeScenePreparationWorkingSet } from './scenePreparationWorkingSet.js';
import { getOperationDefinition, getSemanticValidator, MANUAL_PENDING_SCENE_OPERATIONS } from '../../server/llm-orchestrator/operationRegistry.js';
import '../../server/llm-orchestrator/semanticValidators.js';
import { executeLlmOperation } from '../../server/llm-orchestrator/orchestrator.js';
const logical = () => ({ preparationPolicyVersion: 14, pendingIntentContext: {
  window: { windowFingerprint: 'a'.repeat(64) }, ownerReadSet: { sceneRevision: 1 } },
proposal: { operationId: 'build:capacity' }, completeEvidence: '', originalNull: null });
function sized(bytes: number, operation = R.operation) {
  const packet = logical(), base = sceneReviewContextBytes(packet, operation);
  packet.completeEvidence = 'x'.repeat(bytes-base);
  for (let n=0;n<8;n++) {
    const difference=bytes-sceneReviewContextBytes(packet,operation);
    if (!difference) break;
    packet.completeEvidence='x'.repeat(packet.completeEvidence.length+difference);
  }
  expect(sceneReviewContextBytes(packet, operation)).toBe(bytes);
  return packet;
}
describe('versioned complete-owner review capacity', () => {
  it('denies provider execution before routing, even when a caller selects the new operation', async () => {
    await expect(executeLlmOperation({operation:R.operation} as any,{userId:'owner:capacity'} as any))
      .rejects.toMatchObject({code:'MANUAL_SCENE_OPERATION_REQUIRED'});
  });
  it('adds one immutable Manual-only operation with exactly the original semantic policy and output reserve', () => {
    const old = getOperationDefinition(A.operation), next = getOperationDefinition(R.operation);
    expect(old.context.inputHardLimitBytes).toBe(131072);
    expect(next.context.inputHardLimitBytes).toBe(262144); expect(next.context.inputTargetBytes).toBe(131072);
    expect(next.prompt).toEqual({...old.prompt,id:`${R.operation}.prompt`}); expect(next.validators).toEqual(old.validators);
    expect(next.provider).toEqual(old.provider);
    expect(MANUAL_PENDING_SCENE_OPERATIONS).toContain(R.operation);
  });
  it.each([131072, 131073, 262144])('admits exactly measured %i-byte evidence without changing a value', (bytes) => {
    const packet = sized(bytes), original = structuredClone(packet);
    expect(admitSceneReviewCapacity(packet,R)).toBe(bytes);
    const wire = compileScenePreparationWorkingSet(packet,R.operation,'examine');
    expect(decodeScenePreparationWorkingSet(wire,R.operation)).toEqual(original);
    expect(packet).toEqual(original);
    expect(() => decodeScenePreparationWorkingSet(wire,A.operation)).toThrow();
  });
  it('does not grow the ceiling or accept a model-selected limit', () => {
    expect(() => admitSceneReviewCapacity(sized(262145),R)).toThrow('SCENE_REVIEW_CAPACITY_EXCEEDED');
    for (const profile of [{...R,hardLimitBytes:1_048_576},{...R,operation:A.operation},{...R,manualOnly:false},{profileId:R.profileId},null])
      expect(() => assertSceneReviewCapacityProfile(profile)).toThrow('SCENE_REVIEW_CAPACITY_INVALID');
  });
  it.each([14,15])('decodes profile %i through the same canonical validators, not a different semantic path', async profile => {
    const packet = {...logical(),preparationPolicyVersion:profile};
    const validator = getSemanticValidator('authority-boundary')!;
    const check = (operation:string) => validator({request:{operation,context:{input:{value:compileScenePreparationWorkingSet(packet,operation,'examine')}}},output:{commit:true}} as any);
    expect(await check(R.operation)).toEqual(await check(A.operation));
    expect((await check(R.operation)).valid).toBe(false);
  });
});
