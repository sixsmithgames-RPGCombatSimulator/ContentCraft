import { describe, expect, it } from 'vitest';
import type { LiveMapSpace } from '../types/liveMapTypes';
import {
  buildLocationEditorProviderKey,
  buildLocationMapSpacesHash,
  generateLocationMapHtml,
} from './locationMapHtml';

describe('locationMapHtml', () => {
  it('generates inline and full HTML map output from shared room previews', () => {
    const spaces: LiveMapSpace[] = [
      {
        name: 'Hall',
        function: 'Hallway',
        size_ft: { width: 20, height: 15 },
        doors: [{ wall: 'east', position_on_wall_ft: 7, width_ft: 4, leads_to: 'Chamber' }],
      },
    ];

    const inlineHtml = generateLocationMapHtml('Moon Keep', spaces, 3, 1, true);
    const fullHtml = generateLocationMapHtml('Moon Keep', spaces, 3, 1, false);

    expect(inlineHtml).toContain('Moon Keep');
    expect(inlineHtml).toContain('1 of 3 spaces generated');
    expect(inlineHtml).not.toContain('<html');
    expect(fullHtml).toContain('<html');
    expect(fullHtml).toContain('Hall');
  });

  it('treats door geometry and room wall settings as meaningful preview hash changes', () => {
    const baseSpaces: LiveMapSpace[] = [
      {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        doors: [{ wall: 'east', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Chamber' }],
      },
    ];

    const movedDoorHash = buildLocationMapSpacesHash([
      {
        ...baseSpaces[0],
        doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Chamber' }],
      },
    ]);
    const thickerWallHash = buildLocationMapSpacesHash([
      {
        ...baseSpaces[0],
        wall_thickness_ft: 12,
      },
    ]);

    expect(buildLocationMapSpacesHash(baseSpaces)).not.toBe(movedDoorHash);
    expect(buildLocationMapSpacesHash(baseSpaces)).not.toBe(thickerWallHash);
  });

  it('uses door geometry, positions, and wall metadata in the editor provider key', () => {
    const baseSpaces: LiveMapSpace[] = [
      {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
        position: { x: 10, y: 10 },
        wall_thickness_ft: 10,
        wall_material: 'stone',
        doors: [{ wall: 'east', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Chamber' }],
      },
    ];

    const baseKey = buildLocationEditorProviderKey(baseSpaces);
    const movedRoomKey = buildLocationEditorProviderKey([
      { ...baseSpaces[0], position: { x: 15, y: 10 } },
    ]);
    const movedDoorKey = buildLocationEditorProviderKey([
      {
        ...baseSpaces[0],
        doors: [{ wall: 'east', position_on_wall_ft: 8, width_ft: 4, leads_to: 'Chamber' }],
      },
    ]);

    expect(baseKey).not.toBe(movedRoomKey);
    expect(baseKey).not.toBe(movedDoorKey);
  });
});
