import { describe, expect, it } from 'vitest';
import { buildLocationGeometryReview } from './locationSpaceReview';

describe('locationSpaceReview', () => {
  it('flags missing connections to unknown spaces', () => {
    const review = buildLocationGeometryReview(
      {
        name: 'Study',
        size_ft: { width: 20, height: 20 },
        doors: [{ leads_to: 'Secret Hall' }],
      },
      [{ name: 'Kitchen', size_ft: { width: 15, height: 15 } }],
    );

    expect(review.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'connections',
        }),
      ]),
    );
  });

  it('excludes the current room identity so edits do not self-report as duplicates', () => {
    const review = buildLocationGeometryReview(
      {
        id: 'room-1',
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
      },
      [
        {
          id: 'room-1',
          name: 'Hall',
          size_ft: { width: 20, height: 20 },
        },
      ],
      {
        exclude: { id: 'room-1', name: 'Hall' },
      },
    );

    expect(review.proposals).toEqual([]);
  });

  it('flags duplicate names when a different room already uses the same name', () => {
    const review = buildLocationGeometryReview(
      {
        id: 'room-2',
        name: 'Hall',
        size_ft: { width: 18, height: 18 },
      },
      [
        {
          id: 'room-1',
          name: 'Hall',
          size_ft: { width: 20, height: 20 },
        },
      ],
      {
        exclude: { id: 'room-2', name: 'Hall' },
      },
    );

    expect(review.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
        }),
      ]),
    );
  });

  it('flags missing reciprocal doors for an existing connected room', () => {
    const review = buildLocationGeometryReview(
      {
        name: 'Study',
        size_ft: { width: 20, height: 20 },
        doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Hall' }],
      },
      [
        {
          name: 'Hall',
          size_ft: { width: 30, height: 20 },
          doors: [{ wall: 'north', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Courtyard' }],
        },
      ],
    );

    expect(review.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'doors',
        }),
      ]),
    );
  });

  it('derives wall thickness from walls[] and flags large thickness mismatches', () => {
    const review = buildLocationGeometryReview(
      {
        name: 'Vault',
        size_ft: { width: 20, height: 20 },
        walls: [
          { side: 'north', thickness: 12, material: 'stone' },
          { side: 'south', thickness: 12, material: 'stone' },
        ],
        doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Hall' }],
      },
      [
        {
          name: 'Hall',
          size_ft: { width: 30, height: 20 },
          wall_thickness_ft: 4,
          doors: [{ wall: 'west', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Vault' }],
        },
      ],
    );

    expect(review.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'wall_thickness',
        }),
      ]),
    );
  });
});
