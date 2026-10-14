import { describe, expect, it } from 'vitest';
import { freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { readScenePendingIntentContext, pendingBindingContext, assertPendingIntentContextCurrent } from './scenePendingIntentService.js';

function fixture() {
  const scope = { userId: 'user:one', campaignId: 'campaign:one', programId: 'program:one' };
  const exactText = 'Watch through my familiar.';
  const instruction = { instructionRef: 'instruction:one', exactText, instructionFingerprint: freeformTextDigest(exactText) };
  const loaded: any = { artifactRef: { ...scope, revision: 1 }, artifact: { instruction,
    program: { schemaVersion: 'gma.semantic-action-program/4', programId: scope.programId, instructionRef: instruction.instructionRef,
      instructionFingerprint: instruction.instructionFingerprint, authorityBase: { campaignId: scope.campaignId }, nodes: [
        { nodeId: 'node:watch', kind: 'observe', dependsOn: [], evidenceSpans: [{ start: 0, end: exactText.length }],
          observationGroups: [{ groupId: 'group:familiar', observerKind: 'familiar', observerRef: null, methodRef: null, formRef: null, formTargetId: null, outcomeIds: ['outcome:view'] }],
          dataRequirements: [{ kind: 'observation', observation: { outcomeId: 'outcome:view', targetRef: 'element:tunnel', facet: 'surface_description', relationOriginRef: null } }] },
      ] }, cursor: { programId: scope.programId, revision: 1, completedNodeRefs: [], skippedNodeRefs: [], readyNodeRefs: ['node:watch'], remainingNodeRefs: [], waiting: null,
      authorityHead: { storyWorkspaceRevision: 2, sceneRevision: 3, vcsCharacterRevision: 12 } }, receipts: [] } };
  const binding = { state: 'active', campaignRef: scope.campaignId, actorRef: 'actor:familiar', mechanicsSubjectRef: 'vcs:familiar:one',
    vcsRevision: 'a'.repeat(64), provenanceReceiptRefs: ['receipt:link'] };
  const authority: any = { workspaceRef: { campaignId: scope.campaignId, revision: 2 }, sceneKitRef: { revision: 3 },
    actorMechanicsBindings: [binding], observationAccess: [{ accessId: 'access:interior', candidateViewpointRef: 'viewpoint:interior', requiredCapabilityRefs: ['method:link'] }],
    observables: [{ subjectRef: 'element:tunnel', facet: 'surface_description', viewpointRef: 'viewpoint:interior',
      perceptibility: { observerRefs: ['actor:familiar'], methodRefs: ['method:link'] } }] };
  const readers = { readArtifact: async () => structuredClone(loaded), readObservation: async () => structuredClone(authority) };
  return { scope, loaded, authority, readers };
}

describe('current owner pending-intent context', () => {
  it('reads actual singular viewpointRef and keeps opaque subject head separate from numeric character head', async () => {
    const f = fixture(), owner: any = await readScenePendingIntentContext(f.scope, f.readers);
    expect(owner.observationSeeds).toHaveLength(1);
    expect(owner.observationSeeds[0]).toMatchObject({ observerRef: 'actor:familiar', methodRef: 'method:link', accessRef: 'access:interior',
      capabilityRef: 'method:link', vcsCharacterRevision: 12, mechanicsBinding: { vcsRevision: 'a'.repeat(64) } });
    expect(owner.source.program).toEqual(f.loaded.artifact.program);
    const proposal = { actorFrames: [{ actorRef: 'actor:familiar', zoneRef: 'zone:interior' }] };
    expect(pendingBindingContext(owner, 'operation:one', proposal).observations[0].zoneRef).toBe('zone:interior');
    expect(() => pendingBindingContext(owner, 'operation:one', { actorFrames: [] })).toThrow(/exact prepared actor/);
    expect(() => pendingBindingContext(owner, 'operation:one', { actorFrames: [proposal.actorFrames[0], proposal.actorFrames[0]] })).toThrow();
  });
  for (const wrong of ['viewpoint', 'subject', 'facet', 'observer', 'method', 'receipts', 'inactive', 'foreign', 'unconfirmed_form']) {
    it(`does not fabricate observation evidence when ${wrong} is unconfirmed`, async () => {
      const f = fixture(), o = f.authority.observables[0], b = f.authority.actorMechanicsBindings[0];
      if (wrong === 'viewpoint') { delete o.viewpointRef; o.viewpointRefs = ['viewpoint:interior']; }
      if (wrong === 'subject') o.subjectRef = 'element:other';
      if (wrong === 'facet') o.facet = 'hidden_contents';
      if (wrong === 'observer') o.perceptibility.observerRefs = ['actor:other'];
      if (wrong === 'method') o.perceptibility.methodRefs = [];
      if (wrong === 'receipts') b.provenanceReceiptRefs = [];
      if (wrong === 'inactive') b.state = 'inactive';
      if (wrong === 'foreign') b.campaignRef = 'campaign:other';
      if (wrong === 'unconfirmed_form') f.loaded.artifact.program.nodes[0].observationGroups[0].formRef = 'form:owl';
      expect((await readScenePendingIntentContext(f.scope, f.readers) as any).observationSeeds).toEqual([]);
    });
  }
  it('rejects cross-campaign context and stale full owner data, even with matching counters', async () => {
    const f = fixture(), owner = await readScenePendingIntentContext(f.scope, f.readers);
    f.authority.observables[0].perceptibility.methodRefs = ['method:other'];
    const changed = await readScenePendingIntentContext(f.scope, f.readers);
    expect(() => assertPendingIntentContextCurrent(owner, changed)).toThrow();
    f.loaded.artifactRef.campaignId = 'campaign:other';
    await expect(readScenePendingIntentContext(f.scope, f.readers)).rejects.toMatchObject({ code: 'SCENE_PENDING_INTENT_AUTHORITY_CONFLICT' });
  });
});
