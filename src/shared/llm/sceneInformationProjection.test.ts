import { describe, expect, it } from 'vitest';
import { materializeSceneInformation, bindSceneInformationProjection, sceneInformationProjectionIssues, repairSceneInformationSelections, SCENE_INFORMATION_PROJECTION as P } from './sceneInformationProjection.js';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { getOperationDefinition, getSemanticValidator } from '../../server/llm-orchestrator/operationRegistry.js';
import { compileScenePreparationWorkingSet } from './scenePreparationWorkingSet.js';
import '../../server/llm-orchestrator/semanticValidators.js';

const model = () => ({ schemaVersion: P.modelProposal, sceneKit: { informationSelections: [{ informationId: 'fact:one', accessVectorIndexes: [9, 2] }] },
  facts: [{ factId: 'fact:one', visibility: 'gm_only', valueKind: 'description', value: 'A rough stone passage.',
    accessVectors: Array.from({ length: 12 }, (_, i) => `Exact route ${i}.`) }], zones: [], actorFrames: [], elements: [] });
describe('application-owned compact Scene information', () => {
  it('rejects mixed legacy/new profiles and never erases a foreign window error when projection also fails', async () => {
    for (const [suffix, version] of [['', 14], ['.information-projection', 13], ['.information-projection', 14]] as const) {
      const operation = `story.scene-reality.build.read-effects.typed-references.working-set${suffix}`;
      const logical = { preparationPolicyVersion: version, pendingIntentContext: { window: { windowFingerprint: 'expected' }, ownerReadSet: {} }, buildRequest: { operationId: 'test' } };
      const request: any = { operation, context: { input: { value: compileScenePreparationWorkingSet(logical, operation, 'build') } } };
      const output = { status: 'complete', intentWindowFingerprint: 'foreign', proposal: {} };
      const checked = await getSemanticValidator('scene-pending-intent-builder')!({ request, output });
      expect(checked.valid).toBe(false);
      expect(checked.issues?.[0].path).toBe(suffix && version === 14 ? '/intentWindowFingerprint' : '/context/input/preparationPolicyVersion');
    }
  });
  it('declares selection and repair rules in every original new operation without rewriting historical policies', () => {
    for (const base of ['story.scene-reality.build', 'story.scene-reality.build.checkpoint', 'story.scene-readiness.examine', 'story.scene-reality.repair']) {
      const id = `${base}.read-effects.typed-references.working-set`, old = getOperationDefinition(id), next = getOperationDefinition(`${id}.information-projection`);
      expect(next.prompt.systemInstruction).toContain('unique zero-based integer indexes');
      expect(next.prompt.systemInstruction).toContain('Select every retained prior sceneKit.information ID explicitly');
      expect(next.prompt.systemInstruction).toContain('not arrival, successful perception or permission to disclose');
      expect(next.provider).toEqual(old.provider); expect(next.context).toEqual(old.context);
      expect(old.prompt.systemInstruction).not.toContain('informationSelections');
      if (base.includes('repair')) expect(next.prompt.systemInstruction).toContain('selectionIndex,replacement');
    }
  });
  it('copies only explicit exact routes in selected order without changing source or granting disclosure', () => {
    const input = model(), original = structuredClone(input), p = materializeSceneInformation(input);
    expect(p.sceneKit.information).toEqual([{ informationId: 'fact:one', state: 'concealed', factText: 'A rough stone passage.', accessVectors: ['Exact route 9.', 'Exact route 2.'] }]);
    expect(input).toEqual(original); expect(p.facts).toEqual(original.facts); expect(p.schemaVersion).toBe(P.ownerProposal);
    const b = bindSceneInformationProjection(freeformJsonDigest(input), input.sceneKit.informationSelections, p);
    expect(sceneInformationProjectionIssues(p, input.sceneKit.informationSelections, b)).toEqual([]);
    p.sceneKit.information[0].accessVectors[0] = 'A semantically similar route.';
    expect(sceneInformationProjectionIssues(p, input.sceneKit.informationSelections, b).length).toBeGreaterThan(0);
  });
  it.each([['public_surface', 'description', 'plainly_visible'], ['revealed', 'description', 'plainly_visible'],
    ['gm_only', 'bounded_negative', 'absent_in_scope']])('derives %s/%s without altering the fact', (visibility, valueKind, state) => {
    const input = model(); Object.assign(input.facts[0], { visibility, valueKind });
    expect(materializeSceneInformation(input).sceneKit.information[0].state).toBe(state);
  });
  it('canonicalizes typed values, retaining Unicode, quotes and escapes exactly', () => {
    const input: any = model(); input.facts[0].value = { z: 'é\n"\\', a: { kind: 'description', text: '石' } };
    expect(materializeSceneInformation(input).sceneKit.information[0].factText).toBe('{"a":{"kind":"description","text":"石"},"z":"é\\n\\\"\\\\"}');
  });
  it.each([[-1], [12], [0.5], [0, 0], [], Array.from({ length: 9 }, (_, i) => i)].map((indexes) => [indexes]))('rejects invalid index selection %j', (indexes) => {
    const input = model(); input.sceneKit.informationSelections[0].accessVectorIndexes = indexes;
    expect(() => materializeSceneInformation(input)).toThrow();
  });
  it('rehydrates facts first, requires every retained compact row, and never copies an old compact value', () => {
    const input = model(), prior: any = { facts: input.facts, sceneKit: { information: [{ informationId: 'fact:one', factText: 'Old compact text.' }] } };
    input.facts = []; expect(materializeSceneInformation(input, prior).sceneKit.information[0].factText).toBe('A rough stone passage.');
    input.sceneKit.informationSelections = []; expect(() => materializeSceneInformation(input, prior)).toThrow();
  });
  it('rejects foreign, duplicate, legacy copied and overlong compact rows rather than silently repairing them', () => {
    for (const mutate of [(p: any) => p.sceneKit.informationSelections[0].informationId = 'foreign',
      (p: any) => p.sceneKit.informationSelections.push(p.sceneKit.informationSelections[0]),
      (p: any) => p.sceneKit.information = [], (p: any) => p.facts[0].value = 'x'.repeat(801),
      (p: any) => p.schemaVersion = P.ownerProposal]) { const input = model(); mutate(input); expect(() => materializeSceneInformation(input)).toThrow(); }
  });
  it('repairs only named selection indexes and requires reconfirmation of changed selected facts', () => {
    const input = model(), selections = input.sceneKit.informationSelections;
    const changed = { ...input.facts[0], value: 'A changed passage.' }, patches = [{ recordRef: 'fact:one', replacement: changed }];
    expect(() => repairSceneInformationSelections(selections, [], [], input, patches)).toThrow();
    const replacements = [{ selectionIndex: 0, replacement: selections[0] }];
    expect(repairSceneInformationSelections(selections, replacements, [], input, patches)).toEqual(selections);
    expect(() => repairSceneInformationSelections(selections, replacements, [], input, [])).toThrow();
    expect(() => repairSceneInformationSelections(selections, [{ selectionIndex: 0, replacement: { ...selections[0], informationId: 'fact:other' } }], [], input, patches)).toThrow();
    expect(() => repairSceneInformationSelections(selections, [replacements[0], replacements[0]], [0], input, [])).toThrow();
    const next = repairSceneInformationSelections(selections, [{ selectionIndex: 0, replacement: { ...selections[0], accessVectorIndexes: [2] } }], [0], input, []);
    expect(next[0].accessVectorIndexes).toEqual([2]); expect(selections[0].accessVectorIndexes).toEqual([9, 2]);
  });
});
