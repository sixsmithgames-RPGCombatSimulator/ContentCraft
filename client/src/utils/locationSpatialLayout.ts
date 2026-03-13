import type { Door, WallSettings } from '../contexts/locationEditorTypes';
import type { LiveMapSpace } from '../types/liveMapTypes';
import {
  getConnectedRoomPlacementFt,
  getDoorCenterFt,
  getOppositeWall,
  projectDoorPositionToTargetWallFt,
  snapConnectedRoomPlacementToGrid,
} from './locationMapGeometry';

type Wall = Door['wall'];
type PlacementSource = 'manual' | 'connected' | 'fallback';

interface InternalRoom {
  index: number;
  id: string;
  name: string;
  code?: string;
  widthFt: number;
  heightFt: number;
  doors: Door[];
  layoutDoors: Door[];
  originalSpace: LiveMapSpace;
  identifiers: string[];
  positionFt?: { x: number; y: number };
  placed: boolean;
  placementSource?: PlacementSource;
  wallThicknessFt?: number;
}

export interface SpatialLayoutRoom {
  index: number;
  id: string;
  name: string;
  code?: string;
  widthFt: number;
  heightFt: number;
  doors: Door[];
  originalSpace: LiveMapSpace;
  positionFt: { x: number; y: number };
  placementSource: PlacementSource;
  wallThicknessFt?: number;
}

export interface SpatialLayoutConnectionLine {
  key: string;
  fromRoomId: string;
  toRoomId: string;
  fromWall: Wall;
  toWall: Wall;
  fromFt: { x: number; y: number };
  toFt: { x: number; y: number };
}

export interface SpatialLayoutIssue {
  from: string;
  to: string;
  wall: string;
}

export interface SpatialLayoutResult {
  rooms: SpatialLayoutRoom[];
  connectionLines: SpatialLayoutConnectionLine[];
  brokenConnections: SpatialLayoutIssue[];
  externalConnections: SpatialLayoutIssue[];
  hasManualPositions: boolean;
  unplacedRoomCount: number;
}

const DEFAULT_GRID_SIZE_FT = 5;
const DEFAULT_PADDING_FT = DEFAULT_GRID_SIZE_FT * 2;
const DEFAULT_START_FT = DEFAULT_GRID_SIZE_FT * 10;
const DEFAULT_FALLBACK_GAP_FT = DEFAULT_GRID_SIZE_FT * 3;

function requireSizeFt(space: LiveMapSpace): { width: number; height: number } {
  const sizeFt = space.size_ft;
  if (sizeFt && typeof sizeFt === 'object') {
    const width = (sizeFt as { width?: unknown }).width;
    const height = (sizeFt as { height?: unknown }).height;
    if (typeof width === 'number' && Number.isFinite(width) && typeof height === 'number' && Number.isFinite(height)) {
      return { width, height };
    }
  }

  const dims = space.dimensions;
  if (dims && typeof dims === 'object') {
    const width = (dims as { width?: unknown }).width;
    const height = (dims as { height?: unknown }).height;
    if (typeof width === 'number' && Number.isFinite(width) && typeof height === 'number' && Number.isFinite(height)) {
      return { width, height };
    }
  }

  if (typeof dims === 'string') {
    const numbers = dims.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      const width = Number(numbers[0]);
      const height = Number(numbers[1]);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }
    }
  }

  throw new Error(
    `Space "${space.name}" is missing valid size_ft or dimensions { width, height } (feet). ` +
      `Got size_ft=${JSON.stringify(space.size_ft)} dimensions=${JSON.stringify(space.dimensions)}`
  );
}

function normalizeWall(value: unknown): Wall | null {
  if (typeof value !== 'string') return null;
  const wall = value.toLowerCase();
  if (wall === 'north' || wall === 'south' || wall === 'east' || wall === 'west') {
    return wall;
  }
  return null;
}

function normalizeLayoutDoor(doorUnknown: unknown): Door | null {
  if (!doorUnknown || typeof doorUnknown !== 'object') return null;
  const doorRecord = doorUnknown as Record<string, unknown>;
  const wall = normalizeWall(doorRecord.wall);
  const positionOnWallFt = typeof doorRecord.position_on_wall_ft === 'number'
    ? doorRecord.position_on_wall_ft
    : NaN;
  const widthFt = typeof doorRecord.width_ft === 'number' && Number.isFinite(doorRecord.width_ft) && doorRecord.width_ft > 0
    ? doorRecord.width_ft
    : 5;

  if (!wall || !Number.isFinite(positionOnWallFt)) {
    return null;
  }

  return {
    ...(doorRecord as Partial<Door>),
    wall,
    position_on_wall_ft: positionOnWallFt,
    width_ft: widthFt,
    leads_to: typeof doorRecord.leads_to === 'string' ? doorRecord.leads_to : '',
  };
}

function addLookupKey(lookup: Map<string, InternalRoom>, value: string | undefined, room: InternalRoom) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!lookup.has(trimmed)) {
    lookup.set(trimmed, room);
  }
  const lower = trimmed.toLowerCase();
  if (!lookup.has(lower)) {
    lookup.set(lower, room);
  }
}

function matchesRoomIdentifier(room: InternalRoom, value: string): boolean {
  const lowerValue = value.toLowerCase();
  return room.identifiers.some((identifier) => identifier.toLowerCase() === lowerValue);
}

function findReciprocalDoor(
  room: InternalRoom,
  targetRoom: InternalRoom,
  preferredWall?: Wall,
  referenceDoor?: Door
): Door | undefined {
  const matchingDoors = room.layoutDoors.filter((door) => matchesRoomIdentifier(targetRoom, door.leads_to));
  const candidateDoors = preferredWall
    ? matchingDoors.filter((door) => door.wall === preferredWall)
    : matchingDoors;

  if (candidateDoors.length === 0) {
    return matchingDoors[0];
  }

  if (candidateDoors.length === 1 || !referenceDoor) {
    return candidateDoors[0];
  }

  const projectedPosition = projectDoorPositionToTargetWallFt(
    { size_ft: { width: targetRoom.widthFt, height: targetRoom.heightFt } },
    { size_ft: { width: room.widthFt, height: room.heightFt } },
    referenceDoor
  );

  return candidateDoors.reduce((bestDoor, candidateDoor) => {
    const bestDistance = Math.abs(bestDoor.position_on_wall_ft - projectedPosition);
    const candidateDistance = Math.abs(candidateDoor.position_on_wall_ft - projectedPosition);
    return candidateDistance < bestDistance ? candidateDoor : bestDoor;
  });
}

function isExternalConnectionTarget(targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return lower.includes('exterior') || lower.includes('outside') || lower.includes('courtyard');
}

function createSyntheticDoor(
  sourceRoom: InternalRoom,
  targetRoom: InternalRoom,
  sourceDoor: Door
): Door {
  return {
    wall: getOppositeWall(sourceDoor.wall),
    position_on_wall_ft: projectDoorPositionToTargetWallFt(
      { size_ft: { width: sourceRoom.widthFt, height: sourceRoom.heightFt } },
      { size_ft: { width: targetRoom.widthFt, height: targetRoom.heightFt } },
      sourceDoor
    ),
    width_ft: sourceDoor.width_ft,
    leads_to: sourceRoom.name,
  };
}

function buildRoomDoorCenterFt(room: InternalRoom, door: Door, globalWallSettings: WallSettings) {
  return getDoorCenterFt(
    {
      position: room.positionFt!,
      size_ft: { width: room.widthFt, height: room.heightFt },
      wall_thickness_ft: room.wallThicknessFt,
    },
    door,
    globalWallSettings
  );
}

function buildDoorSignature(room: InternalRoom, door: Door): string {
  return [
    room.id,
    door.wall,
    Math.round(door.position_on_wall_ft * 100),
    Math.round(door.width_ft * 100),
  ].join(':');
}

export function buildLocationSpatialLayout(
  spaces: LiveMapSpace[],
  globalWallSettings: WallSettings = { thickness_ft: 10, material: 'stone' }
): SpatialLayoutResult {
  if (spaces.length === 0) {
    return {
      rooms: [],
      connectionLines: [],
      brokenConnections: [],
      externalConnections: [],
      hasManualPositions: false,
      unplacedRoomCount: 0,
    };
  }

  const rooms: InternalRoom[] = spaces.map((space, index) => {
    const requiredSize = requireSizeFt(space);
    const widthFt = Math.max(5, requiredSize.width);
    const heightFt = Math.max(5, requiredSize.height);
    const id = typeof space.id === 'string' && space.id.trim().length > 0 ? space.id : space.name;
    const code = typeof space.code === 'string' && space.code.trim().length > 0 ? space.code : undefined;
    const hasManualPosition = !!(
      space.position &&
      typeof space.position === 'object' &&
      typeof space.position.x === 'number' &&
      Number.isFinite(space.position.x) &&
      typeof space.position.y === 'number' &&
      Number.isFinite(space.position.y)
    );
    const rawDoors = Array.isArray(space.doors) ? (space.doors as Door[]) : [];

    return {
      index,
      id,
      name: space.name,
      code,
      widthFt,
      heightFt,
      doors: rawDoors,
      layoutDoors: rawDoors.map(normalizeLayoutDoor).filter((door): door is Door => door !== null),
      originalSpace: space,
      identifiers: [space.name, id, code].filter((value): value is string => typeof value === 'string' && value.length > 0),
      positionFt: hasManualPosition ? { x: space.position!.x, y: space.position!.y } : undefined,
      placed: hasManualPosition,
      placementSource: hasManualPosition ? 'manual' : undefined,
      wallThicknessFt: typeof space.wall_thickness_ft === 'number' && Number.isFinite(space.wall_thickness_ft)
        ? space.wall_thickness_ft
        : undefined,
    };
  });

  const roomLookup = new Map<string, InternalRoom>();
  rooms.forEach((room) => {
    room.identifiers.forEach((identifier) => addLookupKey(roomLookup, identifier, room));
  });

  const findRoom = (value: string): InternalRoom | undefined => {
    return roomLookup.get(value) ?? roomLookup.get(value.toLowerCase());
  };

  const brokenConnections: SpatialLayoutIssue[] = [];
  const externalConnections: SpatialLayoutIssue[] = [];

  rooms.forEach((room) => {
    room.layoutDoors.forEach((door) => {
      if (!door.leads_to || door.leads_to === 'Pending') return;
      if (findRoom(door.leads_to)) return;
      if (isExternalConnectionTarget(door.leads_to)) {
        externalConnections.push({ from: room.name, to: door.leads_to, wall: door.wall });
        return;
      }
      brokenConnections.push({ from: room.name, to: door.leads_to, wall: door.wall });
    });
  });

  const hasManualPositions = rooms.some((room) => room.placementSource === 'manual');

  if (!hasManualPositions && rooms.length > 0) {
    rooms[0].positionFt = { x: DEFAULT_START_FT, y: DEFAULT_START_FT };
    rooms[0].placed = true;
    rooms[0].placementSource = 'connected';

    const queue: InternalRoom[] = [rooms[0]];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const currentRoom = queue.shift()!;
      if (processed.has(currentRoom.id)) continue;
      processed.add(currentRoom.id);

      currentRoom.layoutDoors.forEach((door) => {
        if (!door.leads_to || door.leads_to === 'Pending') return;
        const targetRoom = findRoom(door.leads_to);
        if (!targetRoom || targetRoom.placed) return;

        const reciprocalDoor = findReciprocalDoor(targetRoom, currentRoom, getOppositeWall(door.wall), door);
        const placement = getConnectedRoomPlacementFt(
          {
            position: currentRoom.positionFt!,
            size_ft: { width: currentRoom.widthFt, height: currentRoom.heightFt },
            wall_thickness_ft: currentRoom.wallThicknessFt,
          },
          {
            size_ft: { width: targetRoom.widthFt, height: targetRoom.heightFt },
            wall_thickness_ft: targetRoom.wallThicknessFt,
          },
          door,
          globalWallSettings,
          reciprocalDoor
        );

        targetRoom.positionFt = snapConnectedRoomPlacementToGrid(
          { x: placement.x, y: placement.y },
          door.wall,
          DEFAULT_GRID_SIZE_FT
        );
        targetRoom.placed = true;
        targetRoom.placementSource = 'connected';
        queue.push(targetRoom);
      });

      rooms.forEach((otherRoom) => {
        if (otherRoom.placed) return;

        for (const door of otherRoom.layoutDoors) {
          if (!door.leads_to || door.leads_to === 'Pending') continue;
          if (!matchesRoomIdentifier(currentRoom, door.leads_to)) continue;

          const reciprocalDoor = findReciprocalDoor(currentRoom, otherRoom, getOppositeWall(door.wall), door);
          const currentDoor = reciprocalDoor ?? createSyntheticDoor(otherRoom, currentRoom, door);

          const placement = getConnectedRoomPlacementFt(
            {
              position: currentRoom.positionFt!,
              size_ft: { width: currentRoom.widthFt, height: currentRoom.heightFt },
              wall_thickness_ft: currentRoom.wallThicknessFt,
            },
            {
              size_ft: { width: otherRoom.widthFt, height: otherRoom.heightFt },
              wall_thickness_ft: otherRoom.wallThicknessFt,
            },
            currentDoor,
            globalWallSettings,
            door
          );

          otherRoom.positionFt = snapConnectedRoomPlacementToGrid(
            { x: placement.x, y: placement.y },
            currentDoor.wall,
            DEFAULT_GRID_SIZE_FT
          );
          otherRoom.placed = true;
          otherRoom.placementSource = 'connected';
          queue.push(otherRoom);
          break;
        }
      });
    }
  }

  const unplacedRooms = rooms.filter((room) => !room.placed);
  const unplacedRoomCount = unplacedRooms.length;

  if (unplacedRooms.length > 0) {
    const placedRooms = rooms.filter((room) => room.placed && room.positionFt);
    const maxPlacedRightFt = placedRooms.length > 0
      ? Math.max(...placedRooms.map((room) => room.positionFt!.x + room.widthFt))
      : DEFAULT_START_FT;
    const maxUnplacedWidthFt = Math.max(...unplacedRooms.map((room) => room.widthFt));
    const maxUnplacedHeightFt = Math.max(...unplacedRooms.map((room) => room.heightFt));
    const fallbackStartXFt = maxPlacedRightFt + DEFAULT_FALLBACK_GAP_FT;
    const fallbackStartYFt = placedRooms.length > 0
      ? Math.min(...placedRooms.map((room) => room.positionFt!.y))
      : DEFAULT_START_FT;
    const fallbackCellWidthFt = maxUnplacedWidthFt + DEFAULT_FALLBACK_GAP_FT;
    const fallbackCellHeightFt = maxUnplacedHeightFt + DEFAULT_FALLBACK_GAP_FT;
    const gridCols = Math.ceil(Math.sqrt(unplacedRooms.length));

    unplacedRooms.forEach((room, index) => {
      const col = index % gridCols;
      const row = Math.floor(index / gridCols);
      room.positionFt = {
        x: fallbackStartXFt + col * fallbackCellWidthFt,
        y: fallbackStartYFt + row * fallbackCellHeightFt,
      };
      room.placed = true;
      room.placementSource = 'fallback';
    });
  }

  const minXFt = Math.min(...rooms.map((room) => room.positionFt!.x));
  const minYFt = Math.min(...rooms.map((room) => room.positionFt!.y));

  rooms.forEach((room) => {
    room.positionFt = {
      x: room.positionFt!.x - minXFt + DEFAULT_PADDING_FT,
      y: room.positionFt!.y - minYFt + DEFAULT_PADDING_FT,
    };
  });

  const connectionLines: SpatialLayoutConnectionLine[] = [];
  const drawnConnections = new Set<string>();

  rooms.forEach((room) => {
    room.layoutDoors.forEach((door) => {
      if (!door.leads_to || door.leads_to === 'Pending') return;

      const targetRoom = findRoom(door.leads_to);
      if (!targetRoom || !targetRoom.positionFt) return;

      const reciprocalDoor = findReciprocalDoor(targetRoom, room, getOppositeWall(door.wall), door);
      const targetDoor = reciprocalDoor ?? createSyntheticDoor(room, targetRoom, door);

      const fromSignature = buildDoorSignature(room, door);
      const toSignature = buildDoorSignature(targetRoom, targetDoor);
      const key = [fromSignature, toSignature].sort().join('|');
      if (drawnConnections.has(key)) return;
      drawnConnections.add(key);

      connectionLines.push({
        key,
        fromRoomId: room.id,
        toRoomId: targetRoom.id,
        fromWall: door.wall,
        toWall: targetDoor.wall,
        fromFt: buildRoomDoorCenterFt(room, door, globalWallSettings),
        toFt: buildRoomDoorCenterFt(targetRoom, targetDoor, globalWallSettings),
      });
    });
  });

  return {
    rooms: rooms.map((room) => ({
      index: room.index,
      id: room.id,
      name: room.name,
      code: room.code,
      widthFt: room.widthFt,
      heightFt: room.heightFt,
      doors: room.doors,
      originalSpace: room.originalSpace,
      positionFt: room.positionFt!,
      placementSource: room.placementSource!,
      wallThicknessFt: room.wallThicknessFt,
    })),
    connectionLines,
    brokenConnections,
    externalConnections,
    hasManualPositions,
    unplacedRoomCount,
  };
}
