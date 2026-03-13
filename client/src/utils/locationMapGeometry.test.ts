import { describe, expect, it } from 'vitest';
import type { Door } from '../contexts/locationEditorTypes';
import {
  getConnectedRoomPlacementFt,
  getDoorCenterFt,
  getDoorRenderRectPx,
  projectDoorPositionToTargetWallFt,
  snapConnectedRoomPlacementToGrid,
} from './locationMapGeometry';

describe('locationMapGeometry', () => {
  it('uses half-thickness wall spacing while preserving door alignment', () => {
    const sourceSpace = {
      name: 'Hall',
      position: { x: 10, y: 20 },
      size_ft: { width: 30, height: 20 },
      wall_thickness_ft: 10,
    };
    const targetSpace = {
      name: 'Chamber',
      size_ft: { width: 18, height: 16 },
      wall_thickness_ft: 6,
    };
    const sourceDoor: Door = {
      wall: 'south',
      position_on_wall_ft: 7.5,
      width_ft: 4,
      leads_to: 'Chamber',
    };
    const reciprocalDoor: Door = {
      wall: 'north',
      position_on_wall_ft: 5.5,
      width_ft: 4,
      leads_to: 'Hall',
    };

    const placement = getConnectedRoomPlacementFt(
      sourceSpace,
      targetSpace,
      sourceDoor,
      { thickness_ft: 10 },
      reciprocalDoor
    );
    const snappedPlacement = snapConnectedRoomPlacementToGrid(
      { x: placement.x, y: placement.y },
      sourceDoor.wall,
      5
    );

    expect(placement.gapFt).toBe(8);
    expect(placement.x).toBe(12);
    expect(placement.y).toBe(48);
    expect(snappedPlacement).toEqual({ x: 12, y: 50 });
  });

  it('renders door centers from the interior wall span instead of the outer room bounds', () => {
    const space = {
      name: 'Study',
      position: { x: 10, y: 5 },
      size_ft: { width: 20, height: 10 },
      wall_thickness_ft: 10,
    };
    const door: Door = {
      wall: 'north',
      position_on_wall_ft: 5,
      width_ft: 4,
      leads_to: 'Hall',
    };

    const center = getDoorCenterFt(space, door, { thickness_ft: 10 });
    const rect = getDoorRenderRectPx(space, door, { thickness_ft: 10 }, 2, 6);

    expect(center).toEqual({ x: 15, y: 2.5 });
    expect(rect).toEqual({
      x: 26,
      y: 2,
      width: 8,
      height: 6,
      centerX: 30,
      centerY: 5,
    });
  });

  it('projects door positions onto differently sized target walls and clamps overflow', () => {
    const projectedPosition = projectDoorPositionToTargetWallFt(
      { size_ft: { width: 40, height: 20 } },
      { size_ft: { width: 20, height: 20 } },
      {
        wall: 'north',
        position_on_wall_ft: 39,
        width_ft: 6,
      }
    );

    expect(projectedPosition).toBe(17);
  });
});
