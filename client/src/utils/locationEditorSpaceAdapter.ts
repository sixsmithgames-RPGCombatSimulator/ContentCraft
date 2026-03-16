import type { Door, Space, WallSettings } from '../contexts/locationEditorTypes';
import type { LiveMapSpace } from '../types/liveMapTypes';
import { buildLocationSpatialLayout } from './locationSpatialLayout';

const DEFAULT_WALL_SETTINGS: WallSettings = { thickness_ft: 10, material: 'stone' };

function getEditorSpaceCode(space: LiveMapSpace): string {
  if (typeof space.code === 'string' && space.code.trim().length > 0) {
    return space.code;
  }

  if (typeof space.id === 'string' && space.id.trim().length > 0) {
    return space.id;
  }

  return space.name;
}

export function convertLiveMapSpacesToEditorSpaces(
  spaces: LiveMapSpace[],
  globalWallSettings: WallSettings = DEFAULT_WALL_SETTINGS
): Space[] {
  if (spaces.length === 0) return [];

  const layout = buildLocationSpatialLayout(spaces, globalWallSettings);

  return layout.rooms.map((room) => {
    const space = room.originalSpace;
    const spaceRecord = space as LiveMapSpace & { position_locked?: boolean } & Record<string, unknown>;

    return {
      ...spaceRecord,
      index: room.index,
      level: 0,
      code: getEditorSpaceCode(space),
      name: room.name,
      size_ft: { width: room.widthFt, height: room.heightFt },
      doors: Array.isArray(space.doors) ? (space.doors as Door[]) : undefined,
      position: { x: room.positionFt.x, y: room.positionFt.y },
      position_locked: typeof spaceRecord.position_locked === 'boolean'
        ? spaceRecord.position_locked
        : room.placementSource === 'manual',
      ...(spaceRecord.wall_thickness_ft !== undefined && { wall_thickness_ft: spaceRecord.wall_thickness_ft }),
      ...(spaceRecord.wall_material !== undefined && { wall_material: spaceRecord.wall_material }),
    } as unknown as Space;
  });
}

export function convertEditorSpacesToLiveMapSpaces(spaces: Space[]): LiveMapSpace[] {
  return spaces.map((space) => {
    const normalizedSize = { width: space.size_ft.width, height: space.size_ft.height };
    const dimensions = { width: normalizedSize.width, height: normalizedSize.height, unit: 'ft' };
    const preservedFields = space as unknown as Record<string, unknown>;
    const liveMapSpace: LiveMapSpace = {
      ...preservedFields,
      name: space.name,
      code: space.code,
      purpose: space.purpose,
      description: space.description,
      size_ft: normalizedSize,
      dimensions,
      function: space.purpose,
      doors: Array.isArray(space.doors) ? space.doors.map((door) => ({ ...door })) : undefined,
      features: Array.isArray(space.features) ? [...space.features] : undefined,
      position: space.position ? { ...space.position } : undefined,
      connections: Array.isArray(space.doors)
        ? space.doors
          .map((door: Door) => door.leads_to)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [],
      wall_thickness_ft: space.wall_thickness_ft,
      wall_material: space.wall_material,
    };

    return liveMapSpace;
  });
}
