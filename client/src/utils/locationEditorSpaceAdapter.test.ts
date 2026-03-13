import { describe, expect, it } from 'vitest';
import type { Space } from '../contexts/locationEditorTypes';
import {
  convertEditorSpacesToLiveMapSpaces,
  convertLiveMapSpacesToEditorSpaces,
} from './locationEditorSpaceAdapter';

describe('locationEditorSpaceAdapter', () => {
  it('re-bases manual positions into the local canvas while respecting explicit position lock overrides', () => {
    const editorSpaces = convertLiveMapSpacesToEditorSpaces([
      {
        name: 'Atrium',
        id: 'atrium-id',
        size_ft: { width: 20, height: 20 },
        position: { x: 100, y: 150 },
        position_locked: false,
      },
      {
        name: 'Tower',
        code: 'T-1',
        size_ft: { width: 15, height: 25 },
        position: { x: 140, y: 150 },
      },
    ]);

    expect(editorSpaces).toHaveLength(2);
    expect(editorSpaces[0]).toEqual(expect.objectContaining({
      code: 'atrium-id',
      position: { x: 10, y: 10 },
      position_locked: false,
    }));
    expect(editorSpaces[1]).toEqual(expect.objectContaining({
      code: 'T-1',
      position: { x: 50, y: 10 },
      position_locked: true,
    }));
  });

  it('uses shared spatial layout placement for connected rooms and preserves wall metadata', () => {
    const editorSpaces = convertLiveMapSpacesToEditorSpaces([
      {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        wall_material: 'stone',
        doors: [{ wall: 'east', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Chamber' }],
      },
      {
        name: 'Chamber',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        wall_material: 'brick',
        doors: [{ wall: 'west', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall' }],
      },
    ]);

    expect(editorSpaces).toEqual([
      expect.objectContaining({
        name: 'Hall',
        position: { x: 10, y: 10 },
        wall_thickness_ft: 10,
        wall_material: 'stone',
      }),
      expect.objectContaining({
        name: 'Chamber',
        position: { x: 40, y: 20 },
        wall_thickness_ft: 10,
        wall_material: 'brick',
      }),
    ]);
  });

  it('normalizes editor spaces back into live map data with dimensions and connections', () => {
    const liveSpaces = convertEditorSpacesToLiveMapSpaces([
      {
        index: 0,
        name: 'Kitchen',
        code: 'K-1',
        level: 0,
        size_ft: { width: 15, height: 10 },
        position: { x: 20, y: 25 },
        position_locked: true,
        purpose: 'Cooking',
        doors: [
          { wall: 'east', position_on_wall_ft: 4, width_ft: 5, leads_to: 'Pantry' },
          { wall: 'south', position_on_wall_ft: 9, width_ft: 5, leads_to: 'Hall' },
        ],
      } satisfies Space,
    ]);

    expect(liveSpaces).toEqual([
      expect.objectContaining({
        name: 'Kitchen',
        code: 'K-1',
        purpose: 'Cooking',
        function: 'Cooking',
        size_ft: { width: 15, height: 10 },
        dimensions: { width: 15, height: 10, unit: 'ft' },
        position: { x: 20, y: 25 },
        position_locked: true,
        connections: ['Pantry', 'Hall'],
      }),
    ]);
  });
});
