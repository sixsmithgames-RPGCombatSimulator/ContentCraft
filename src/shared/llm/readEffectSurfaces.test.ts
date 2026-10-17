import { describe, expect, it } from 'vitest';
import { READ_EFFECT_SURFACE_POLICY, readEffectSurfaceIssues } from './readEffectSurfaces.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';

const surface = () => ({ surfaceKind: 'action_surface', interactionSurface: 'self_action', factRefs: [],
  targetRef: 'actor:player', zoneRef: 'zone:entrance', actionFamily: 'interact', accessClass: 'ordinary_self_action', capabilityClass: null, thresholdRef: null, condition: null });
const actors = [{ actorRef: 'actor:player', actorFrameId: 'frame:player', zoneRef: 'zone:entrance' }];

describe('shared first-pass self-action surface policy', () => {
  it('permits only a present actor surface, never an implied completed result', () => {
    expect(readEffectSurfaceIssues(surface(), actors)).toEqual([]);
    expect(readEffectSurfaceIssues({ ...surface(), targetRef: 'frame:player' }, actors)).toEqual([]);
    expect(readEffectSurfaceIssues({ ...surface(), targetRef: 'actor:foreign' }, actors)).toContain('/actorZone');
    expect(readEffectSurfaceIssues({ ...surface(), zoneRef: 'zone:future' }, actors)).toContain('/actorZone');
  });
  it.each(['condition', 'capabilityClass', 'thresholdRef', 'actionFamily'] as const)('rejects an implicit consequential %s gate', (field) => {
    expect(readEffectSurfaceIssues({ ...surface(), [field]: 'requires-owner-resolution' }, actors)).toContain(`/${field}`);
  });
  it('requires exact already-available access instead of a null or malformed permission', () => {
    for (const accessClass of [null, '', 'freeform permission']) expect(readEffectSurfaceIssues({ ...surface(), accessClass })).toContain('/accessClass');
  });
  it('requires explicit empty action facts and real information facts, keeping owner-action gates separate', () => {
    expect(readEffectSurfaceIssues({ ...surface(), factRefs: ['fact:future'] })).toContain('/actionSurface');
    expect(readEffectSurfaceIssues({ ...surface(), interactionSurface: 'owner_action', condition: 'An owner check is needed.' })).toEqual([]);
    expect(readEffectSurfaceIssues({ ...surface(), surfaceKind: 'information', interactionSurface: null, factRefs: ['fact:existing'] })).toEqual([]);
    expect(readEffectSurfaceIssues({ ...surface(), surfaceKind: 'information', interactionSurface: null })).toContain('/information');
  });
  it('teaches every shared rule in the original builder and independent examiner, not just a repair', () => {
    for (const operation of ['story.scene-reality.build.read-effects', 'story.scene-readiness.examine.read-effects']) {
      expect(getOperationDefinition(operation).prompt.systemInstruction).toContain(READ_EFFECT_SURFACE_POLICY);
    }
    expect(READ_EFFECT_SURFACE_POLICY).toContain('capabilityClass, thresholdRef and condition all null');
  });
});
