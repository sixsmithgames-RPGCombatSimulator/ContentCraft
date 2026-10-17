import { describe, expect, it } from 'vitest';
import { sceneDossierReferenceIssues } from './sceneDossierReferences.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';

function dossier() {
  return { zones: [{ zoneId: 'zone:one', adjacentZoneRefs: [] as string[], visibleElementRefs: ['element:one'], thresholds: [] }],
    actorFrames: [{ actorFrameId: 'frame:one', actorRef: 'actor:one', zoneRef: 'zone:one', knowledge: [{ factRefs: ['fact:one'] }] }],
    elements: [{ elementId: 'element:one', zoneRef: 'zone:one', contents: { factRefs: ['fact:one'] } }],
    facts: [{ factId: 'fact:one', targetRef: 'element:one' }],
    sceneReality: { zoneRefs: ['zone:one'], actorFrameRefs: ['frame:one'], elementRefs: ['element:one'], factRefs: ['fact:one'] },
    sceneKit: { participants: { present: ['actor:one'], anticipated: [], sceneLocalRoles: [] },
      establishedElements: [{ elementId: 'element:one' }], information: [{ informationId: 'fact:one' }] },
    sceneStoryDesign: { obligations: [{ factRefs: ['fact:one'] }], affordances: [{ zoneRef: 'zone:one', targetRef: 'element:one', factRefs: ['fact:one'] }] } };
}

describe('complete typed Scene dossier closure', () => {
  it('preserves explicit actor/frame aliases and every indexed native element', () => {
    const p = dossier(), original = structuredClone(p);
    expect(sceneDossierReferenceIssues(p)).toEqual([]); expect(p).toEqual(original);
    p.sceneKit.participants.present = ['frame:one']; expect(sceneDossierReferenceIssues(p)).toEqual([]);
    p.sceneKit.participants.present = ['Mira']; expect(sceneDossierReferenceIssues(p)).toContain('/sceneKit/participants/present/0');
  });
  it('rejects the real missing compact-element shape; a citation or adjacent record is not its record', () => {
    const p = dossier(); p.sceneKit.establishedElements.push({ elementId: 'element:retained' });
    expect(sceneDossierReferenceIssues(p)).toContain('/sceneKit/establishedElements/1/elementId');
    Object.assign(p, { sourceRefs: ['element:retained'] });
    expect(sceneDossierReferenceIssues(p)).toContain('/sceneKit/establishedElements/1/elementId');
    p.elements.push({ elementId: 'element:retained', zoneRef: 'zone:one', contents: { factRefs: [] } });
    expect(sceneDossierReferenceIssues(p)).toContain('/sceneReality/elementRefs');
    p.sceneReality.elementRefs.push('element:retained'); expect(sceneDossierReferenceIssues(p)).toEqual([]);
  });
  it('checks complete merged chunks rather than an unfinished checkpoint', () => {
    const p = dossier(), { zones, actorFrames, ...tail } = p;
    const checkpoint = { zones, actorFrames, elements: [], facts: [] };
    const final = { ...tail, zones: [], actorFrames: [] };
    const merged = { ...final, zones: checkpoint.zones, actorFrames: checkpoint.actorFrames };
    expect(sceneDossierReferenceIssues(merged)).toEqual([]);
    expect(sceneDossierReferenceIssues(final).length).toBeGreaterThan(0);
  });
  it('rejects foreign topology, knowledge, targets and fact references independently', () => {
    for (const change of [
      (p: ReturnType<typeof dossier>) => { p.zones[0].adjacentZoneRefs.push('zone:foreign'); },
      (p: ReturnType<typeof dossier>) => { p.actorFrames[0].knowledge[0].factRefs = ['fact:foreign']; },
      (p: ReturnType<typeof dossier>) => { p.elements[0].zoneRef = 'zone:foreign'; },
      (p: ReturnType<typeof dossier>) => { p.facts[0].targetRef = 'source:citation'; },
      (p: ReturnType<typeof dossier>) => { p.sceneStoryDesign.affordances[0].factRefs = ['fact:foreign']; },
    ]) { const p = dossier(); change(p); expect(sceneDossierReferenceIssues(p).length).toBeGreaterThan(0); }
  });
  it('declares every positive closure rule on original builder and independent examiner policies', () => {
    for (const id of ['story.scene-reality.build.read-effects', 'story.scene-reality.build.checkpoint.read-effects', 'story.scene-readiness.examine.read-effects']) {
      const prompt = getOperationDefinition(id).prompt;
      expect(prompt.version).toMatch(/\/11$/);
      expect(prompt.systemInstruction).toContain('Every sceneKit.establishedElements.elementId has its own elements record');
      expect(prompt.systemInstruction).toContain('source citation as its missing record');
      expect(prompt.systemInstruction).toContain('Complete a second chunk with the retained checkpoint records');
      expect(prompt.systemInstruction).toContain('exact typed reference closure');
    }
  });
});
