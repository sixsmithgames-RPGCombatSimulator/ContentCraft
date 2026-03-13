import { describe, expect, it } from 'vitest';
import { getNormalizedWallMetadata } from './locationWallMetadata';

describe('locationWallMetadata', () => {
  it('derives wall thickness and material from walls[] when top-level values are absent', () => {
    const metadata = getNormalizedWallMetadata({
      walls: [
        { side: 'north', thickness: 12, material: 'stone' },
        { side: 'south', thickness: 8, material: 'stone' },
      ],
    });

    expect(metadata).toEqual({
      walls: [
        { side: 'north', thickness: 12, material: 'stone' },
        { side: 'south', thickness: 8, material: 'stone' },
      ],
      wallThicknessFt: 10,
      wallMaterial: 'stone',
    });
  });

  it('prefers explicit top-level wall metadata over derived wall values', () => {
    const metadata = getNormalizedWallMetadata({
      wall_thickness_ft: 6,
      wall_material: 'brick',
      walls: [
        { side: 'north', thickness: 12, material: 'stone' },
      ],
    });

    expect(metadata.wallThicknessFt).toBe(6);
    expect(metadata.wallMaterial).toBe('brick');
  });
});
