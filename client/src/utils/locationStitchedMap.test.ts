import { describe, expect, it } from 'vitest';
import { generateStitchedLocationMap } from './locationStitchedMap';

describe('locationStitchedMap', () => {
  it('renders a stitched layout using shared room placement and door-center lines', () => {
    const html = generateStitchedLocationMap(
      [
        {
          name: 'Hall',
          size_ft: { width: 20, height: 20 },
          wall_thickness_ft: 10,
          doors: [{ wall: 'east', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Chamber' }],
        },
        {
          name: 'Chamber',
          size_ft: { width: 20, height: 20 },
          wall_thickness_ft: 10,
          doors: [{ wall: 'west', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall' }],
        },
      ],
      'Moon Keep'
    );

    expect(html).toContain('Moon Keep - Spatial Layout');
    expect(html).toContain('Showing 2 spaces positioned by connections');
    expect(html).toContain('x1="65" y1="50" x2="75" y2="50"');
  });

  it('returns a validation message when a space lacks size information', () => {
    const html = generateStitchedLocationMap([{ name: 'Broken Room' }], 'Moon Keep');

    expect(html).toContain('missing valid size_ft or dimensions');
  });
});
