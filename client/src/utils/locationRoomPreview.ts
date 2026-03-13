import type { Door } from '../contexts/locationEditorTypes';
import type { LiveMapSpace } from '../types/liveMapTypes';
import {
  getDoorRenderRectPx,
  getSpaceOuterBoundsFt,
} from './locationMapGeometry';
import { getNormalizedWallMetadata } from './locationWallMetadata';

type Wall = Door['wall'];

export interface RoomPreviewLayout {
  localSpace: {
    position: { x: number; y: number };
    size_ft: { width: number; height: number };
    wall_thickness_ft: number;
  };
  wallThicknessFt: number;
  wallThicknessPx: number;
  doorVisualThicknessPx: number;
  scaleFactor: number;
  outerX: number;
  outerY: number;
  outerWidthPx: number;
  outerHeightPx: number;
  interiorX: number;
  interiorY: number;
  interiorWidthPx: number;
  interiorHeightPx: number;
}

export interface RoomPreviewDoorRender {
  wall: Wall;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  strokeWidth: number;
  rx: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'middle' | 'start' | 'end';
  leadsTo?: string;
}

const DEFAULT_WALL_THICKNESS_FT = 10;
const BASE_PIXELS_PER_FOOT = 8;

export function getPreviewWallThicknessFt(
  space: LiveMapSpace,
  walls: unknown[] = [],
  fallbackFt: number = DEFAULT_WALL_THICKNESS_FT
): number {
  return getNormalizedWallMetadata({
    ...space,
    walls,
  }).wallThicknessFt ?? fallbackFt;
}

export function buildRoomPreviewLayout(
  space: LiveMapSpace,
  walls: unknown[],
  roomWidthFt: number,
  roomHeightFt: number,
  svgWidth: number,
  svgHeight: number,
  padding: number
): RoomPreviewLayout {
  const wallThicknessFt = getPreviewWallThicknessFt(space, walls);
  const localSpace = {
    position: { x: wallThicknessFt / 2, y: wallThicknessFt / 2 },
    size_ft: { width: roomWidthFt, height: roomHeightFt },
    wall_thickness_ft: wallThicknessFt,
  };
  const outerBoundsFt = getSpaceOuterBoundsFt(localSpace, { thickness_ft: wallThicknessFt });
  const maxOuterWidthPx = svgWidth - padding * 2;
  const maxOuterHeightPx = svgHeight - padding * 2;
  const scaleFactor = Math.min(
    BASE_PIXELS_PER_FOOT,
    maxOuterWidthPx / outerBoundsFt.width,
    maxOuterHeightPx / outerBoundsFt.height
  );
  const outerWidthPx = outerBoundsFt.width * scaleFactor;
  const outerHeightPx = outerBoundsFt.height * scaleFactor;
  const outerX = (svgWidth - outerWidthPx) / 2;
  const outerY = (svgHeight - outerHeightPx) / 2;
  const wallThicknessPx = wallThicknessFt * scaleFactor;
  const doorVisualThicknessPx = Math.max(8, Math.min(16, wallThicknessPx));

  return {
    localSpace,
    wallThicknessFt,
    wallThicknessPx,
    doorVisualThicknessPx,
    scaleFactor,
    outerX,
    outerY,
    outerWidthPx,
    outerHeightPx,
    interiorX: outerX + outerBoundsFt.interiorX * scaleFactor,
    interiorY: outerY + outerBoundsFt.interiorY * scaleFactor,
    interiorWidthPx: roomWidthFt * scaleFactor,
    interiorHeightPx: roomHeightFt * scaleFactor,
  };
}

function normalizeDoor(doorUnknown: unknown): (Pick<Door, 'wall' | 'position_on_wall_ft' | 'width_ft' | 'leads_to'> & {
  style: string;
  color: string;
}) | null {
  if (!doorUnknown || typeof doorUnknown !== 'object') {
    return null;
  }

  const door = doorUnknown as Record<string, unknown>;
  const wall = door.wall;
  const position = door.position_on_wall_ft;
  const widthFt = door.width_ft;

  if (
    (wall !== 'north' && wall !== 'south' && wall !== 'east' && wall !== 'west') ||
    typeof position !== 'number' ||
    !Number.isFinite(position) ||
    typeof widthFt !== 'number' ||
    !Number.isFinite(widthFt) ||
    widthFt <= 0
  ) {
    return null;
  }

  const rawStyle = typeof door.door_type === 'string'
    ? door.door_type
    : (typeof door.style === 'string' ? door.style : 'opening');

  return {
    wall,
    position_on_wall_ft: position,
    width_ft: widthFt,
    leads_to: typeof door.leads_to === 'string' ? door.leads_to : '',
    style: rawStyle.trim().length > 0 ? rawStyle : 'opening',
    color: typeof door.color === 'string' ? door.color : '#8B4513',
  };
}

export function buildRoomPreviewDoorRender(
  doorUnknown: unknown,
  layout: RoomPreviewLayout
): RoomPreviewDoorRender | null {
  const door = normalizeDoor(doorUnknown);
  if (!door) {
    return null;
  }

  const rect = getDoorRenderRectPx(
    layout.localSpace,
    door,
    { thickness_ft: layout.wallThicknessFt },
    layout.scaleFactor,
    layout.doorVisualThicknessPx
  );

  const x = layout.outerX + rect.x;
  const y = layout.outerY + rect.y;
  let labelX = x + rect.width / 2;
  let labelY = y - 10;
  let labelAnchor: 'middle' | 'start' | 'end' = 'middle';

  switch (door.wall) {
    case 'south':
      labelY = layout.outerY + layout.outerHeightPx + 16;
      break;
    case 'east':
      labelX = layout.outerX + layout.outerWidthPx + 12;
      labelY = y + rect.height / 2 + 3;
      labelAnchor = 'start';
      break;
    case 'west':
      labelX = layout.outerX - 12;
      labelY = y + rect.height / 2 + 3;
      labelAnchor = 'end';
      break;
    default:
      labelY = layout.outerY - 10;
      break;
  }

  let fill = door.color;
  if (door.style === 'iron' || door.style === 'portcullis') {
    fill = '#4A4A4A';
  } else if (door.style === 'archway' || door.style === 'opening') {
    fill = 'none';
  }

  return {
    wall: door.wall,
    x,
    y,
    width: rect.width,
    height: rect.height,
    fill,
    strokeWidth: door.style === 'archway' || door.style === 'opening' ? 3 : 2,
    rx: door.style === 'archway' || door.style === 'opening'
      ? (door.wall === 'north' || door.wall === 'south' ? rect.height / 2 : rect.width / 2)
      : 1,
    labelX,
    labelY,
    labelAnchor,
    leadsTo: door.leads_to && door.leads_to !== 'Pending' ? door.leads_to : undefined,
  };
}
