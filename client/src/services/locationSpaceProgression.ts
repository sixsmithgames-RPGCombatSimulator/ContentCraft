import type { LiveMapDimensions, LiveMapSpace } from '../types/liveMapTypes';
import type { Door } from '../contexts/locationEditorTypes';
import type { StageChunkState } from '../utils/generationProgress';
import { synchronizeReciprocalDoors, type SpaceLike } from '../utils/doorSync';
import { getNormalizedWallMetadata } from '../utils/locationWallMetadata';
import {
  getNextWorkflowStageChunkStep,
  mergeWorkflowStageChunks,
  type WorkflowStageChunkStep,
} from './workflowStageChunkRuntime';

type JsonRecord = Record<string, unknown>;
type StageResultsRecord = Record<string, JsonRecord>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseDimensionString(dimensions: string): { width?: number; height?: number } {
  const numbers = dimensions.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) {
    return {};
  }

  const width = Number(numbers[0]);
  const height = Number(numbers[1]);
  return {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
  };
}

function normalizeDimensions(record: Record<string, unknown>): LiveMapDimensions | undefined {
  const rawDimensions = record.dimensions;
  if (typeof rawDimensions === 'string') {
    const parsed = parseDimensionString(rawDimensions);
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { width: parsed.width, height: parsed.height, unit: 'ft' };
    }
    return rawDimensions;
  }

  if (isRecord(rawDimensions)) {
    const width = getNumber(rawDimensions.width);
    const height = getNumber(rawDimensions.height);
    return {
      width,
      height,
      unit: typeof rawDimensions.unit === 'string' ? rawDimensions.unit : 'ft',
    };
  }

  const rawSizeFt = record.size_ft;
  if (isRecord(rawSizeFt)) {
    return {
      width: getNumber(rawSizeFt.width),
      height: getNumber(rawSizeFt.height),
      unit: 'ft',
    };
  }

  return undefined;
}

function normalizeSizeFt(record: Record<string, unknown>, dimensions: LiveMapDimensions | undefined) {
  const rawSizeFt = record.size_ft;
  if (isRecord(rawSizeFt)) {
    return {
      width: getNumber(rawSizeFt.width),
      height: getNumber(rawSizeFt.height),
    };
  }

  if (dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions)) {
    return {
      width: getNumber(dimensions.width),
      height: getNumber(dimensions.height),
    };
  }

  return undefined;
}

function normalizeDoors(record: Record<string, unknown>): Door[] | undefined {
  if (!Array.isArray(record.doors)) {
    return undefined;
  }

  const doors = record.doors
    .filter(isRecord)
    .map((doorRecord) => {
      if (
        (doorRecord.wall !== 'north' && doorRecord.wall !== 'south' && doorRecord.wall !== 'east' && doorRecord.wall !== 'west') ||
        typeof doorRecord.leads_to !== 'string'
      ) {
        return null;
      }

      return {
        wall: doorRecord.wall,
        position_on_wall_ft: getNumber(doorRecord.position_on_wall_ft) ?? 0,
        width_ft: getNumber(doorRecord.width_ft) ?? 5,
        leads_to: doorRecord.leads_to,
        style: typeof doorRecord.style === 'string' ? doorRecord.style as Door['style'] : undefined,
        door_type: typeof doorRecord.door_type === 'string' ? doorRecord.door_type : undefined,
        material: typeof doorRecord.material === 'string' ? doorRecord.material : undefined,
        state: typeof doorRecord.state === 'string' ? doorRecord.state as Door['state'] : undefined,
        color: typeof doorRecord.color === 'string' ? doorRecord.color : undefined,
        is_reciprocal: doorRecord.is_reciprocal === true,
        reciprocal_parent_signature:
          typeof doorRecord.reciprocal_parent_signature === 'string'
            ? doorRecord.reciprocal_parent_signature
            : undefined,
      } satisfies Door;
    })
    .filter((door): door is Door => door !== null);

  return doors;
}

function resolveSpaceRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.space)) return value.space;
  if (Array.isArray(value.spaces) && isRecord(value.spaces[0])) return value.spaces[0];
  return value;
}

export function extractLocationSpaceForMap(value: unknown): LiveMapSpace | null {
  const record = resolveSpaceRecord(value);
  if (!record) return null;

  const name = typeof record.name === 'string' && record.name.trim().length > 0
    ? record.name.trim()
    : null;
  if (!name) {
    return null;
  }

  const dimensions = normalizeDimensions(record);
  const size_ft = normalizeSizeFt(record, dimensions);
  const doors = normalizeDoors(record);
  const wallMetadata = getNormalizedWallMetadata(record);

  return {
    ...record,
    name,
    purpose: typeof record.purpose === 'string' ? record.purpose : undefined,
    function:
      typeof record.function === 'string'
        ? record.function
        : (typeof record.purpose === 'string' ? record.purpose : undefined),
    dimensions,
    size_ft,
    doors,
    connections: Array.isArray(record.connections)
      ? record.connections.filter((value): value is string => typeof value === 'string')
      : (doors ? doors.map((door) => door.leads_to).filter(Boolean) : []),
    wall_thickness_ft: wallMetadata.wallThicknessFt,
    wall_material: wallMetadata.wallMaterial,
  };
}

export function syncLocationLiveMapSpaces(
  spaces: Array<LiveMapSpace | null | undefined>
): LiveMapSpace[] {
  const filteredSpaces = spaces.filter((space): space is LiveMapSpace => !!space);
  return synchronizeReciprocalDoors(filteredSpaces as unknown as SpaceLike[]) as LiveMapSpace[];
}

export function appendLocationSpaceToLiveMap(
  liveMapSpaces: LiveMapSpace[],
  candidateSpace: unknown
): {
  spaceData: LiveMapSpace | null;
  updatedLiveMapSpaces: LiveMapSpace[];
} {
  const spaceData = extractLocationSpaceForMap(candidateSpace);
  if (!spaceData) {
    return {
      spaceData: null,
      updatedLiveMapSpaces: liveMapSpaces,
    };
  }

  return {
    spaceData,
    updatedLiveMapSpaces: syncLocationLiveMapSpaces([...liveMapSpaces, spaceData]),
  };
}

interface BuildAcceptedLocationSpaceProgressArgs {
  acceptedSpace: JsonRecord;
  accumulatedChunkResults: JsonRecord[];
  liveMapSpaces: LiveMapSpace[];
  stageResults: StageResultsRecord;
  stageName: string;
  currentStageChunk: number;
  totalStageChunks: number;
  showLiveMap: boolean;
}

export interface AcceptedLocationSpaceProgress {
  newAccumulated: JsonRecord[];
  updatedLiveMapSpaces: LiveMapSpace[];
  updatedStageResults: StageResultsRecord;
  updatedStageChunkState: StageChunkState;
  nextChunkStep: WorkflowStageChunkStep | null;
  stageComplete: boolean;
  appendedSpaceData: LiveMapSpace | null;
}

export function buildAcceptedLocationSpaceProgress(
  args: BuildAcceptedLocationSpaceProgressArgs
): AcceptedLocationSpaceProgress {
  const newAccumulated = [...args.accumulatedChunkResults, args.acceptedSpace];
  const { spaceData, updatedLiveMapSpaces } = appendLocationSpaceToLiveMap(args.liveMapSpaces, args.acceptedSpace);
  const normalizedStageKey = args.stageName.toLowerCase().replace(/\s+/g, '_');
  const updatedStageResults: StageResultsRecord = {
    ...args.stageResults,
    [normalizedStageKey]: mergeWorkflowStageChunks(newAccumulated, args.stageName),
  };

  const nextChunkStep = getNextWorkflowStageChunkStep(args.currentStageChunk, args.totalStageChunks);
  const stageComplete = nextChunkStep === null;

  const updatedStageChunkState: StageChunkState = stageComplete
    ? {
        isStageChunking: false,
        currentStageChunk: 0,
        totalStageChunks: 0,
        accumulatedChunkResults: newAccumulated,
        liveMapSpaces: updatedLiveMapSpaces,
        showLiveMap: args.showLiveMap || updatedLiveMapSpaces.length > 0,
      }
    : {
        isStageChunking: true,
        currentStageChunk: nextChunkStep.nextChunkIndex,
        totalStageChunks: args.totalStageChunks,
        accumulatedChunkResults: newAccumulated,
        liveMapSpaces: updatedLiveMapSpaces,
        showLiveMap: args.showLiveMap || updatedLiveMapSpaces.length > 0,
      };

  return {
    newAccumulated,
    updatedLiveMapSpaces,
    updatedStageResults,
    updatedStageChunkState,
    nextChunkStep,
    stageComplete,
    appendedSpaceData: spaceData,
  };
}
