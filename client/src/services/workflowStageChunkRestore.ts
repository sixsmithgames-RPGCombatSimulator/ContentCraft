import type { GenerationProgress, StageChunkState } from '../utils/generationProgress';
import type { LiveMapSpace } from '../types/liveMapTypes';
import { resolveWorkflowTypeFromConfigType } from './generatorWorkflow';
import { resolveWorkflowStageKey } from '../../../src/shared/generation/workflowRegistry';

type JsonRecord = Record<string, unknown>;

export interface RestoredWorkflowStageChunkState {
  accumulatedChunks: JsonRecord[];
  savedLiveMapSpaces: LiveMapSpace[];
  normalizedStageChunkState: StageChunkState | null;
  effectiveChunkState: StageChunkState | null;
  needsMigration: boolean;
  restoreSource: 'stageChunkState' | 'legacy' | 'progress' | 'derived' | 'none';
  shouldRebuildLiveMapFromChunks: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asLiveMapSpaces(value: unknown): LiveMapSpace[] {
  return Array.isArray(value)
    ? value.filter((space): space is LiveMapSpace => Boolean(space && typeof space === 'object' && typeof (space as LiveMapSpace).name === 'string'))
    : [];
}

function parseTotalSpacesFromPrompt(prompt: string): number {
  const match = prompt.match(/Space\s+(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (!match) return 0;
  const total = Number.parseInt(match[2], 10);
  return Number.isFinite(total) ? total : 0;
}

function reconstructChunksFromProgress(
  progress: GenerationProgress['progress'],
  workflowType: GenerationProgress['workflowType'] | string,
): {
  accumulatedChunks: JsonRecord[];
  totalStageChunks: number;
} {
  const normalizedWorkflowType = typeof workflowType === 'string' ? workflowType : '';
  if (!normalizedWorkflowType) {
    return {
      accumulatedChunks: [],
      totalStageChunks: 0,
    };
  }

  const spacesStageKey = resolveWorkflowStageKey(normalizedWorkflowType, 'Spaces');
  if (!spacesStageKey) {
    return {
      accumulatedChunks: [],
      totalStageChunks: 0,
    };
  }

  const spacesEntries = progress.filter((entry) =>
    resolveWorkflowStageKey(normalizedWorkflowType, entry.stage) === spacesStageKey
      && entry.status === 'completed'
      && typeof entry.response === 'string'
      && entry.response.length > 0,
  );

  if (spacesEntries.length === 0) {
    return {
      accumulatedChunks: [],
      totalStageChunks: 0,
    };
  }

  const accumulatedChunks: JsonRecord[] = [];
  for (const entry of spacesEntries) {
    try {
      const parsed = JSON.parse(entry.response || '{}');
      if (isRecord(parsed)) {
        accumulatedChunks.push(parsed);
      }
    } catch {
      // Ignore malformed saved responses and keep reconstructing what we can.
    }
  }

  const lastEntry = spacesEntries[spacesEntries.length - 1];
  const totalStageChunks = lastEntry?.prompt ? parseTotalSpacesFromPrompt(lastEntry.prompt) : 0;

  return {
    accumulatedChunks,
    totalStageChunks,
  };
}

function deriveEstimatedLocationSpaces(stageResults: JsonRecord, accumulatedChunkCount: number): number {
  const purposeData = isRecord(stageResults.purpose) ? stageResults.purpose : null;
  let estimatedSpaces = accumulatedChunkCount + 1;

  const directEstimate = purposeData?.estimated_spaces;
  if (typeof directEstimate === 'number' && Number.isFinite(directEstimate)) {
    return directEstimate;
  }
  if (typeof directEstimate === 'string') {
    const parsed = Number.parseInt(directEstimate, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const scale = typeof purposeData?.scale === 'string' ? purposeData.scale.toLowerCase() : '';
  if (scale.includes('simple')) estimatedSpaces = Math.max(4, accumulatedChunkCount + 1);
  else if (scale.includes('moderate')) estimatedSpaces = Math.max(12, accumulatedChunkCount + 1);
  else if (scale.includes('complex')) estimatedSpaces = Math.max(30, accumulatedChunkCount + 1);
  else if (scale.includes('massive')) estimatedSpaces = Math.max(50, accumulatedChunkCount + 1);

  return estimatedSpaces;
}

export function restoreWorkflowStageChunkState(session: GenerationProgress): RestoredWorkflowStageChunkState {
  let accumulatedChunks: JsonRecord[] = [];
  let savedLiveMapSpaces: LiveMapSpace[] = [];
  let needsMigration = false;
  let restoreSource: RestoredWorkflowStageChunkState['restoreSource'] = 'none';
  const workflowType = resolveWorkflowTypeFromConfigType(
    (typeof session.workflowType === 'string' && session.workflowType)
      || (typeof session.config?.type === 'string' ? session.config.type : undefined),
  );

  if (session.stageChunkState?.liveMapSpaces || session.stageChunkState?.accumulatedChunkResults) {
    accumulatedChunks = asJsonRecordArray(session.stageChunkState.accumulatedChunkResults);
    savedLiveMapSpaces = asLiveMapSpaces(session.stageChunkState.liveMapSpaces);
    restoreSource = 'stageChunkState';
  } else if (session.liveMapSpaces || session.accumulatedChunkResults) {
    accumulatedChunks = asJsonRecordArray(session.accumulatedChunkResults);
    savedLiveMapSpaces = asLiveMapSpaces(session.liveMapSpaces);
    needsMigration = true;
    restoreSource = 'legacy';
  }

  let reconstructedMetadata: Pick<StageChunkState, 'isStageChunking' | 'currentStageChunk' | 'totalStageChunks'> | null = null;

  if (accumulatedChunks.length === 0 && session.progress?.length > 0) {
    const reconstructed = reconstructChunksFromProgress(session.progress, workflowType);
    if (reconstructed.accumulatedChunks.length > 0) {
      accumulatedChunks = reconstructed.accumulatedChunks;
      if (reconstructed.totalStageChunks > 0) {
        reconstructedMetadata = {
          isStageChunking: true,
          currentStageChunk: reconstructed.accumulatedChunks.length,
          totalStageChunks: reconstructed.totalStageChunks,
        };
      }
      if (restoreSource === 'none') {
        restoreSource = 'progress';
      }
    }
  }

  if (!session.stageChunkState && !reconstructedMetadata && accumulatedChunks.length > 0 && session.config.type === 'location') {
    const estimatedSpaces = deriveEstimatedLocationSpaces(session.stageResults, accumulatedChunks.length);
    if (accumulatedChunks.length < estimatedSpaces) {
      reconstructedMetadata = {
        isStageChunking: true,
        currentStageChunk: accumulatedChunks.length,
        totalStageChunks: estimatedSpaces,
      };
      if (restoreSource === 'none' || (restoreSource === 'legacy' && savedLiveMapSpaces.length === 0)) {
        restoreSource = 'derived';
      }
    }
  }

  const normalizedStageChunkState: StageChunkState | null = session.stageChunkState
    ? {
      isStageChunking: session.stageChunkState.isStageChunking,
      currentStageChunk: session.stageChunkState.currentStageChunk,
      totalStageChunks: session.stageChunkState.totalStageChunks,
      accumulatedChunkResults: accumulatedChunks,
      liveMapSpaces: savedLiveMapSpaces,
      showLiveMap:
        session.stageChunkState.showLiveMap
        || savedLiveMapSpaces.length > 0
        || accumulatedChunks.length > 0,
    }
    : (accumulatedChunks.length > 0 || savedLiveMapSpaces.length > 0 || reconstructedMetadata)
      ? {
        isStageChunking: reconstructedMetadata?.isStageChunking ?? false,
        currentStageChunk: reconstructedMetadata?.currentStageChunk ?? 0,
        totalStageChunks: reconstructedMetadata?.totalStageChunks ?? 0,
        accumulatedChunkResults: accumulatedChunks,
        liveMapSpaces: savedLiveMapSpaces,
        showLiveMap: savedLiveMapSpaces.length > 0 || accumulatedChunks.length > 0,
      }
      : null;

  return {
    accumulatedChunks,
    savedLiveMapSpaces,
    normalizedStageChunkState,
    effectiveChunkState: normalizedStageChunkState,
    needsMigration,
    restoreSource,
    shouldRebuildLiveMapFromChunks: savedLiveMapSpaces.length === 0 && accumulatedChunks.length > 0,
  };
}
