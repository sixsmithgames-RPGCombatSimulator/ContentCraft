import { describe, expect, it } from 'vitest';
import { buildLocationSpatialLayout } from './locationSpatialLayout';

describe('locationSpatialLayout', () => {
  it('places connected rooms using reciprocal door positions and wall thickness', () => {
    const layout = buildLocationSpatialLayout([
      {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        doors: [
          { wall: 'east', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Chamber' },
        ],
      },
      {
        name: 'Chamber',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        doors: [
          { wall: 'west', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall' },
        ],
      },
    ]);

    const hall = layout.rooms.find((room) => room.name === 'Hall');
    const chamber = layout.rooms.find((room) => room.name === 'Chamber');

    expect(hall?.positionFt).toEqual({ x: 10, y: 10 });
    expect(chamber?.positionFt).toEqual({ x: 40, y: 20 });
  });

  it('uses reverse-only door connections to place rooms with projected alignment', () => {
    const layout = buildLocationSpatialLayout([
      {
        name: 'Anchor',
        size_ft: { width: 20, height: 20 },
      },
      {
        name: 'Side Room',
        size_ft: { width: 15, height: 10 },
        doors: [
          { wall: 'west', position_on_wall_ft: 8, width_ft: 4, leads_to: 'Anchor' },
        ],
      },
    ]);

    const anchor = layout.rooms.find((room) => room.name === 'Anchor');
    const sideRoom = layout.rooms.find((room) => room.name === 'Side Room');

    expect(anchor?.positionFt).toEqual({ x: 10, y: 10 });
    expect(sideRoom?.positionFt).toEqual({ x: 40, y: 18 });
  });

  it('emits one connection line per distinct door pair between the same rooms', () => {
    const layout = buildLocationSpatialLayout([
      {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        doors: [
          { wall: 'east', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Chamber' },
          { wall: 'east', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Chamber' },
        ],
      },
      {
        name: 'Chamber',
        size_ft: { width: 20, height: 20 },
        wall_thickness_ft: 10,
        doors: [
          { wall: 'west', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall' },
          { wall: 'west', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Hall' },
        ],
      },
    ]);

    expect(layout.connectionLines).toHaveLength(2);
    expect(layout.connectionLines).toEqual([
      expect.objectContaining({
        fromFt: { x: 32.5, y: 15 },
        toFt: { x: 37.5, y: 15 },
      }),
      expect.objectContaining({
        fromFt: { x: 32.5, y: 25 },
        toFt: { x: 37.5, y: 25 },
      }),
    ]);
  });
});
