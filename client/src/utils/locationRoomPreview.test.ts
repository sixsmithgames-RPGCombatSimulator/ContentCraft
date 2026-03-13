import { describe, expect, it } from 'vitest';
import { buildRoomPreviewDoorRender, buildRoomPreviewLayout, getPreviewWallThicknessFt } from './locationRoomPreview';

describe('locationRoomPreview', () => {
  it('derives preview wall thickness from explicit room data before legacy wall arrays', () => {
    expect(
      getPreviewWallThicknessFt(
        { name: 'Hall', wall_thickness_ft: 12 },
        [{ side: 'north', thickness: 4 }, { side: 'south', thickness: 6 }]
      )
    ).toBe(12);

    expect(
      getPreviewWallThicknessFt(
        { name: 'Hall' },
        [{ side: 'north', thickness: 4 }, { side: 'south', thickness: 6 }]
      )
    ).toBe(5);
  });

  it('builds preview bounds from outer wall thickness instead of shrinking the room interior', () => {
    const layout = buildRoomPreviewLayout(
      { name: 'Study', wall_thickness_ft: 10 },
      [],
      20,
      10,
      1000,
      512,
      60
    );

    expect(layout.scaleFactor).toBe(8);
    expect(layout.outerWidthPx).toBe(240);
    expect(layout.outerHeightPx).toBe(160);
    expect(layout.interiorWidthPx).toBe(160);
    expect(layout.interiorHeightPx).toBe(80);
    expect(layout.interiorX).toBe(420);
    expect(layout.interiorY).toBe(216);
  });

  it('positions door markers from shared door geometry and renders unlabeled openings', () => {
    const layout = buildRoomPreviewLayout(
      { name: 'Study', wall_thickness_ft: 10 },
      [],
      20,
      10,
      1000,
      512,
      60
    );

    const northDoor = buildRoomPreviewDoorRender(
      { wall: 'north', position_on_wall_ft: 5, width_ft: 4, leads_to: 'Hall', style: 'wooden' },
      layout
    );
    const eastOpening = buildRoomPreviewDoorRender(
      { wall: 'east', position_on_wall_ft: 5, width_ft: 4 },
      layout
    );

    expect(northDoor).toEqual(
      expect.objectContaining({
        x: 444,
        y: 188,
        width: 32,
        height: 16,
        labelX: 460,
        labelY: 166,
        labelAnchor: 'middle',
        leadsTo: 'Hall',
      })
    );

    expect(eastOpening).toEqual(
      expect.objectContaining({
        fill: 'none',
        strokeWidth: 3,
        labelAnchor: 'start',
      })
    );
  });
});
