/**
 * Shared geometry helpers for location layout, wall thickness, and door placement.
 *
 * These helpers intentionally work in feet so the editor, live-map conversion,
 * and reciprocal-door synchronization all agree on one coordinate model.
 */

import type { Door, Space, WallSettings } from '../contexts/locationEditorTypes';

type Wall = Door['wall'];

interface SpaceWithGeometry {
  name?: string;
  code?: string;
  size_ft: { width: number; height: number };
  position?: { x: number; y: number };
  wall_thickness_ft?: number;
}

type WallSettingsLike = Pick<WallSettings, 'thickness_ft'> | number | undefined;

export interface SpaceOuterBoundsFt {
  x: number;
  y: number;
  width: number;
  height: number;
  interiorX: number;
  interiorY: number;
  interiorWidth: number;
  interiorHeight: number;
  wallThicknessFt: number;
  wallOutsetFt: number;
}

export interface DoorCenterFt {
  x: number;
  y: number;
}

export interface DoorRenderRectPx {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ConnectedRoomPlacementFt {
  x: number;
  y: number;
  gapFt: number;
  fromDoorPositionFt: number;
  toDoorPositionFt: number;
}

const DEFAULT_WALL_THICKNESS_FT = 10;

export function getOppositeWall(wall: Wall): Wall {
  const opposites = {
    north: 'south' as const,
    south: 'north' as const,
    east: 'west' as const,
    west: 'east' as const,
  };
  return opposites[wall];
}

export function getEffectiveWallThicknessFt(
  space: SpaceWithGeometry,
  globalWallSettings?: WallSettingsLike
): number {
  if (
    typeof space.wall_thickness_ft === 'number' &&
    Number.isFinite(space.wall_thickness_ft) &&
    space.wall_thickness_ft > 0
  ) {
    return space.wall_thickness_ft;
  }

  if (typeof globalWallSettings === 'number' && Number.isFinite(globalWallSettings) && globalWallSettings > 0) {
    return globalWallSettings;
  }

  if (
    globalWallSettings &&
    typeof globalWallSettings.thickness_ft === 'number' &&
    Number.isFinite(globalWallSettings.thickness_ft) &&
    globalWallSettings.thickness_ft > 0
  ) {
    return globalWallSettings.thickness_ft;
  }

  return DEFAULT_WALL_THICKNESS_FT;
}

export function getWallOutsetFt(space: SpaceWithGeometry, globalWallSettings?: WallSettingsLike): number {
  return getEffectiveWallThicknessFt(space, globalWallSettings) / 2;
}

export function getRoomInteriorGapFt(
  sourceSpace: SpaceWithGeometry,
  targetSpace: SpaceWithGeometry,
  globalWallSettings?: WallSettingsLike
): number {
  return getWallOutsetFt(sourceSpace, globalWallSettings) + getWallOutsetFt(targetSpace, globalWallSettings);
}

export function getDoorWallLengthFt(space: Pick<SpaceWithGeometry, 'size_ft'>, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? space.size_ft.width : space.size_ft.height;
}

export function projectDoorPositionToTargetWallFt(
  sourceRoom: Pick<SpaceWithGeometry, 'size_ft'>,
  targetRoom: Pick<SpaceWithGeometry, 'size_ft'>,
  sourceDoor: Pick<Door, 'wall' | 'position_on_wall_ft' | 'width_ft'>
): number {
  const sourceDimension = getDoorWallLengthFt(sourceRoom, sourceDoor.wall);
  const targetDimension = getDoorWallLengthFt(targetRoom, sourceDoor.wall);

  if (sourceDimension === targetDimension) {
    return sourceDoor.position_on_wall_ft;
  }

  const relativePosition = sourceDoor.position_on_wall_ft / sourceDimension;
  let calculatedPosition = relativePosition * targetDimension;

  const minValidPosition = sourceDoor.width_ft / 2;
  const maxValidPosition = targetDimension - (sourceDoor.width_ft / 2);

  if (calculatedPosition < minValidPosition) {
    calculatedPosition = minValidPosition;
  } else if (calculatedPosition > maxValidPosition) {
    calculatedPosition = maxValidPosition;
  }

  return calculatedPosition;
}

export function getDoorPositionRatio(space: Pick<SpaceWithGeometry, 'size_ft'>, door: Pick<Door, 'wall' | 'position_on_wall_ft'>): number {
  return door.position_on_wall_ft / getDoorWallLengthFt(space, door.wall);
}

export function getSpaceOuterBoundsFt(
  space: Required<Pick<SpaceWithGeometry, 'size_ft' | 'position'>> & Pick<SpaceWithGeometry, 'wall_thickness_ft'>,
  globalWallSettings?: WallSettingsLike
): SpaceOuterBoundsFt {
  const wallThicknessFt = getEffectiveWallThicknessFt(space, globalWallSettings);
  const wallOutsetFt = wallThicknessFt / 2;

  return {
    x: space.position.x - wallOutsetFt,
    y: space.position.y - wallOutsetFt,
    width: space.size_ft.width + wallThicknessFt,
    height: space.size_ft.height + wallThicknessFt,
    interiorX: space.position.x,
    interiorY: space.position.y,
    interiorWidth: space.size_ft.width,
    interiorHeight: space.size_ft.height,
    wallThicknessFt,
    wallOutsetFt,
  };
}

export function getDoorCenterFt(
  space: Required<Pick<SpaceWithGeometry, 'size_ft' | 'position'>> & Pick<SpaceWithGeometry, 'wall_thickness_ft'>,
  door: Pick<Door, 'wall' | 'position_on_wall_ft'>,
  globalWallSettings?: WallSettingsLike
): DoorCenterFt {
  const wallStripCenterOffsetFt = getWallOutsetFt(space, globalWallSettings) / 2;

  switch (door.wall) {
    case 'north':
      return {
        x: space.position.x + door.position_on_wall_ft,
        y: space.position.y - wallStripCenterOffsetFt,
      };
    case 'south':
      return {
        x: space.position.x + door.position_on_wall_ft,
        y: space.position.y + space.size_ft.height + wallStripCenterOffsetFt,
      };
    case 'east':
      return {
        x: space.position.x + space.size_ft.width + wallStripCenterOffsetFt,
        y: space.position.y + door.position_on_wall_ft,
      };
    case 'west':
      return {
        x: space.position.x - wallStripCenterOffsetFt,
        y: space.position.y + door.position_on_wall_ft,
      };
    default:
      return {
        x: space.position.x,
        y: space.position.y,
      };
  }
}

export function getDoorRenderRectPx(
  space: Required<Pick<SpaceWithGeometry, 'size_ft' | 'position'>> & Pick<SpaceWithGeometry, 'wall_thickness_ft'>,
  door: Pick<Door, 'wall' | 'position_on_wall_ft' | 'width_ft'>,
  globalWallSettings: WallSettingsLike,
  pixelsPerFoot: number,
  visualThicknessPx: number
): DoorRenderRectPx {
  const centerFt = getDoorCenterFt(space, door, globalWallSettings);
  const centerX = centerFt.x * pixelsPerFoot;
  const centerY = centerFt.y * pixelsPerFoot;
  const doorWidthPx = door.width_ft * pixelsPerFoot;

  if (door.wall === 'north' || door.wall === 'south') {
    return {
      x: centerX - (doorWidthPx / 2),
      y: centerY - (visualThicknessPx / 2),
      width: doorWidthPx,
      height: visualThicknessPx,
      centerX,
      centerY,
    };
  }

  return {
    x: centerX - (visualThicknessPx / 2),
    y: centerY - (doorWidthPx / 2),
    width: visualThicknessPx,
    height: doorWidthPx,
    centerX,
    centerY,
  };
}

export function getConnectedRoomPlacementFt(
  sourceSpace: Required<Pick<SpaceWithGeometry, 'size_ft' | 'position'>> & Pick<SpaceWithGeometry, 'wall_thickness_ft'>,
  targetSpace: Pick<SpaceWithGeometry, 'size_ft' | 'wall_thickness_ft'>,
  sourceDoor: Pick<Door, 'wall' | 'position_on_wall_ft' | 'width_ft'>,
  globalWallSettings?: WallSettingsLike,
  reciprocalDoor?: Pick<Door, 'position_on_wall_ft'>
): ConnectedRoomPlacementFt {
  const gapFt = getRoomInteriorGapFt(sourceSpace, targetSpace, globalWallSettings);
  const fromDoorPositionFt = sourceDoor.position_on_wall_ft;
  const toDoorPositionFt = reciprocalDoor?.position_on_wall_ft ?? projectDoorPositionToTargetWallFt(sourceSpace, targetSpace, sourceDoor);

  let x = sourceSpace.position.x;
  let y = sourceSpace.position.y;

  switch (sourceDoor.wall) {
    case 'north':
      x = sourceSpace.position.x + fromDoorPositionFt - toDoorPositionFt;
      y = sourceSpace.position.y - targetSpace.size_ft.height - gapFt;
      break;
    case 'south':
      x = sourceSpace.position.x + fromDoorPositionFt - toDoorPositionFt;
      y = sourceSpace.position.y + sourceSpace.size_ft.height + gapFt;
      break;
    case 'east':
      x = sourceSpace.position.x + sourceSpace.size_ft.width + gapFt;
      y = sourceSpace.position.y + fromDoorPositionFt - toDoorPositionFt;
      break;
    case 'west':
      x = sourceSpace.position.x - targetSpace.size_ft.width - gapFt;
      y = sourceSpace.position.y + fromDoorPositionFt - toDoorPositionFt;
      break;
  }

  return {
    x,
    y,
    gapFt,
    fromDoorPositionFt,
    toDoorPositionFt,
  };
}

export function snapConnectedRoomPlacementToGrid(
  position: { x: number; y: number },
  wall: Wall,
  gridSize: number
): { x: number; y: number } {
  const snap = (value: number) => Math.round(value / gridSize) * gridSize;

  if (wall === 'north' || wall === 'south') {
    return { x: position.x, y: snap(position.y) };
  }

  return { x: snap(position.x), y: position.y };
}
