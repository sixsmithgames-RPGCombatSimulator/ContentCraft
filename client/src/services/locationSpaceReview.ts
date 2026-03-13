import type { LiveMapDimensions } from '../types/liveMapTypes';
import {
  validateSpaceGeometry,
  type GeometryProposal,
  type ParentStructure,
} from '../utils/locationGeometry';
import { getNormalizedWallMetadata } from '../utils/locationWallMetadata';

type JsonRecord = Record<string, unknown>;

interface LocationGeometryReviewInput extends JsonRecord {
  id?: string;
  code?: string;
  name?: string;
  dimensions?: LiveMapDimensions;
  size_ft?: { width?: number; height?: number };
  floor?: number | string;
  connections?: string[];
  doors?: Array<{
    wall?: string;
    position_on_wall_ft?: number;
    width_ft?: number;
    leads_to?: string;
  }>;
  walls?: unknown[];
  wall_thickness_ft?: number;
  wall_material?: string;
}

interface IdentityRef {
  id?: string;
  code?: string;
  name?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeDimensions(
  dimensions: LiveMapDimensions | undefined,
  sizeFt: { width?: number; height?: number } | undefined,
): { width: number; height: number; unit?: string } | undefined {
  if (dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions)) {
    const width = getNumber(dimensions.width);
    const height = getNumber(dimensions.height);
    if (typeof width === 'number' && typeof height === 'number') {
      return {
        width,
        height,
        unit: typeof dimensions.unit === 'string' ? dimensions.unit : 'ft',
      };
    }
  }

  if (sizeFt && typeof sizeFt === 'object') {
    const width = getNumber(sizeFt.width);
    const height = getNumber(sizeFt.height);
    if (typeof width === 'number' && typeof height === 'number') {
      return { width, height, unit: 'ft' };
    }
  }

  return undefined;
}

function normalizeConnections(space: LocationGeometryReviewInput): string[] | undefined {
  if (Array.isArray(space.connections)) {
    return space.connections.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  if (Array.isArray(space.doors)) {
    const connections = space.doors
      .map((door) => (isRecord(door) && typeof door.leads_to === 'string' ? door.leads_to : null))
      .filter((value): value is string => !!value && value !== 'Pending');

    return connections.length > 0 ? connections : undefined;
  }

  return undefined;
}

function normalizeDoors(space: LocationGeometryReviewInput) {
  if (!Array.isArray(space.doors)) {
    return undefined;
  }

  const doors = space.doors
    .filter(isRecord)
    .map((door) => {
      if (
        (door.wall !== 'north' && door.wall !== 'south' && door.wall !== 'east' && door.wall !== 'west') ||
        typeof door.position_on_wall_ft !== 'number' ||
        !Number.isFinite(door.position_on_wall_ft) ||
        typeof door.width_ft !== 'number' ||
        !Number.isFinite(door.width_ft) ||
        typeof door.leads_to !== 'string' ||
        door.leads_to.trim().length === 0
      ) {
        return null;
      }

      return {
        wall: door.wall,
        position_on_wall_ft: door.position_on_wall_ft,
        width_ft: door.width_ft,
        leads_to: door.leads_to,
      };
    })
    .filter((door): door is NonNullable<typeof door> => door !== null);

  return doors.length > 0 ? doors : undefined;
}

function matchesIdentity(space: LocationGeometryReviewInput, exclude: IdentityRef | undefined): boolean {
  if (!exclude) return false;

  if (exclude.id || exclude.code) {
    if (exclude.id && typeof space.id === 'string' && space.id === exclude.id) return true;
    if (exclude.code && typeof space.code === 'string' && space.code === exclude.code) return true;
    return false;
  }

  if (exclude.name && typeof space.name === 'string' && space.name === exclude.name) return true;
  return false;
}

export function buildLocationGeometryReview(
  candidateSpace: LocationGeometryReviewInput,
  existingSpaces: LocationGeometryReviewInput[],
  options?: {
    parentStructure?: ParentStructure;
    exclude?: IdentityRef;
  },
): {
  proposals: GeometryProposal[];
  warnings: string[];
} {
  if (typeof candidateSpace.name !== 'string' || candidateSpace.name.trim().length === 0) {
    return { proposals: [], warnings: [] };
  }

  const candidateWallMetadata = getNormalizedWallMetadata(candidateSpace);

  const normalizedCandidate = {
    name: candidateSpace.name,
    dimensions: normalizeDimensions(candidateSpace.dimensions, candidateSpace.size_ft),
    floor: candidateSpace.floor,
    connections: normalizeConnections(candidateSpace),
    doors: normalizeDoors(candidateSpace),
    wall_thickness_ft: candidateWallMetadata.wallThicknessFt,
    wall_material: candidateWallMetadata.wallMaterial,
  };

  const normalizedExisting = existingSpaces
    .filter((space) => !matchesIdentity(space, options?.exclude))
    .map((space) => {
      const wallMetadata = getNormalizedWallMetadata(space);

      return {
        name: typeof space.name === 'string' ? space.name : '',
        dimensions: normalizeDimensions(space.dimensions, space.size_ft),
        floor: space.floor,
        connections: normalizeConnections(space),
        doors: normalizeDoors(space),
        wall_thickness_ft: wallMetadata.wallThicknessFt,
        wall_material: wallMetadata.wallMaterial,
      };
    })
    .filter((space) => space.name.length > 0);

  const validation = validateSpaceGeometry(
    normalizedCandidate,
    normalizedExisting,
    options?.parentStructure,
  );

  return {
    proposals: validation.proposals,
    warnings: validation.warnings,
  };
}
