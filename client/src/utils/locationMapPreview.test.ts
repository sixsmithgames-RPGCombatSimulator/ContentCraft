import { describe, expect, it } from 'vitest';
import {
  generateFullWidthLocationFloorPlan,
  getLocationSpaceDimsForKey,
  requireLocationSpaceSizeFt,
} from './locationMapPreview';

describe('locationMapPreview', () => {
  it('parses room size from size_ft or string dimensions', () => {
    expect(requireLocationSpaceSizeFt({ name: 'Hall', size_ft: { width: 20, height: 10 } })).toEqual({
      width: 20,
      height: 10,
    });

    expect(requireLocationSpaceSizeFt({ name: 'Hall', dimensions: '30 x 15 ft' })).toEqual({
      width: 30,
      height: 15,
    });
  });

  it('returns stable dimensions for space hashing', () => {
    expect(getLocationSpaceDimsForKey({ name: 'Hall', size_ft: { width: 20, height: 10 } })).toEqual({
      width: 20,
      height: 10,
    });

    expect(getLocationSpaceDimsForKey({ name: 'Hall', dimensions: { width: 12, height: 8 } })).toEqual({
      width: 12,
      height: 8,
    });
  });

  it('renders a full-width floor plan with doors and room labels', () => {
    const html = generateFullWidthLocationFloorPlan(
      {
        name: 'Kitchen',
        purpose: 'Meal prep',
        size_ft: { width: 20, height: 10 },
        doors: [{ wall: 'north', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall', style: 'wooden' }],
      },
      { bg: '#fff9c4', border: '#f57f17' },
      1,
      false
    );

    expect(html).toContain('#2');
    expect(html).toContain('Kitchen');
    expect(html).toContain('20×10 ft');
    expect(html).toContain('Meal prep');
    expect(html).toContain('→ Hall');
  });
});
