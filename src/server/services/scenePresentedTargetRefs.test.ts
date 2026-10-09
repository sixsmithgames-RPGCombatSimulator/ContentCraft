import { describe, expect, it } from 'vitest';
import { scenePresentedTargetRefs } from './scenePresentedTargetRefs.js';

describe('exact prepared opening-target references', () => {
  const proposal = {
    zones: [{ zoneId: 'zone:entrance', label: 'Tunnel mouth', thresholds: [{ boundaryId: 'boundary:entry' }] }],
    actorFrames: [{ actorFrameId: 'frame:familiar', actorRef: 'actor:familiar', publicLabel: 'Rat familiar' }],
    elements: [{ elementId: 'element:cover' }], facts: [{ factId: 'fact:surface' }],
    preparedBoundaries: [{ boundaryId: 'boundary:deep' }], sourceRefs: ['source:unprepared'],
  };

  it('retains both exact actor identities and root or zone-local threshold identities', () => {
    expect([...scenePresentedTargetRefs(proposal)].sort()).toEqual([
      'actor:familiar', 'boundary:deep', 'boundary:entry', 'element:cover', 'fact:surface', 'frame:familiar', 'zone:entrance',
    ]);
  });

  it('does not bind labels, arbitrary sources, removed records or invalid identities', () => {
    const refs = scenePresentedTargetRefs({ ...proposal, actorFrames: [], zones: [{ label: 'Tunnel mouth' }],
      elements: [{ elementId: null }, { elementId: 4 }, { elementId: '' }] });
    for (const unprepared of ['actor:familiar', 'frame:familiar', 'boundary:entry', 'Rat familiar', 'Tunnel mouth', 'source:unprepared', '4', '']) {
      expect(refs.has(unprepared)).toBe(false);
    }
    expect(scenePresentedTargetRefs(null).size).toBe(0);
  });
});
