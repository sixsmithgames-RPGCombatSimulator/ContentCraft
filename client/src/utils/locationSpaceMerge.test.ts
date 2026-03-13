import { describe, expect, it } from 'vitest';
import { mergeUpdatedLocationSpaces } from './locationSpaceMerge';

describe('locationSpaceMerge', () => {
  it('merges editor geometry into original spaces while preserving existing metadata', () => {
    const merged = mergeUpdatedLocationSpaces(
      [
        {
          name: 'Hall',
          description: 'Original AI description',
          size_ft: { width: 20, height: 20 },
          dimensions: { width: 20, height: 20, unit: 'ft' },
          features: [{ label: 'Banner' }],
          wall_material: 'stone',
        },
      ],
      [
        {
          name: 'Hall',
          size_ft: { width: 25, height: 20 },
          position: { x: 40, y: 30 },
          position_locked: true,
          wall_thickness_ft: 8,
          doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 5, leads_to: 'Chamber' }],
        },
      ]
    );

    expect(merged).toEqual([
      expect.objectContaining({
        name: 'Hall',
        description: 'Original AI description',
        features: [{ label: 'Banner' }],
        size_ft: { width: 25, height: 20 },
        dimensions: { width: 25, height: 20 },
        position: { x: 40, y: 30 },
        position_locked: true,
        wall_material: 'stone',
        wall_thickness_ft: 8,
        doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 5, leads_to: 'Chamber' }],
      }),
    ]);
  });

  it('falls back to original size information when edited spaces omit geometry payloads', () => {
    const merged = mergeUpdatedLocationSpaces(
      [
        {
          name: 'Library',
          size_ft: { width: 18, height: 14 },
          dimensions: { width: 18, height: 14, unit: 'ft' },
        },
      ],
      [
        {
          name: 'Library',
          description: 'Quiet and dusty.',
        },
      ]
    );

    expect(merged).toEqual([
      expect.objectContaining({
        name: 'Library',
        description: 'Quiet and dusty.',
        size_ft: { width: 18, height: 14 },
        dimensions: { width: 18, height: 14, unit: 'ft' },
      }),
    ]);
  });

  it('can fall back to index matching when a room is renamed during review editing', () => {
    const merged = mergeUpdatedLocationSpaces(
      [
        {
          name: 'Old Name',
          description: 'Original metadata',
          size_ft: { width: 12, height: 12 },
        },
      ],
      [
        {
          name: 'New Name',
          size_ft: { width: 14, height: 12 },
        },
      ],
      { strategy: 'identity-or-index' }
    );

    expect(merged).toEqual([
      expect.objectContaining({
        name: 'New Name',
        description: 'Original metadata',
        size_ft: { width: 14, height: 12 },
      }),
    ]);
  });
});
