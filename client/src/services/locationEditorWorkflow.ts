import type { LiveMapSpace } from '../types/liveMapTypes';
import type { StageChunkState } from '../utils/generationProgress';
import {
  mergeUpdatedLocationSpaces,
  type MergeableLocationSpace,
} from '../utils/locationSpaceMerge';
import { mergeWorkflowStageChunks } from './workflowStageChunkRuntime';

type JsonRecord = Record<string, unknown>;
type StageResultsRecord = Record<string, JsonRecord>;

interface ApplyLocationEditorUpdatesArgs {
  accumulatedChunkResults: LiveMapSpace[];
  updatedSpaces: LiveMapSpace[];
  stageResults: StageResultsRecord;
  stageChunkState?: StageChunkState;
  isStageChunking: boolean;
  currentStageChunk: number;
  totalStageChunks: number;
  showLiveMap: boolean;
  reviewSpaceIndex?: number;
  mergeStrategy?: 'identity' | 'identity-or-index';
}

export interface LocationEditorUpdateResult {
  updatedResults: MergeableLocationSpace[];
  updatedStageResults: StageResultsRecord;
  updatedStageChunkState: StageChunkState;
  updatedPendingSpace?: MergeableLocationSpace;
}

export function applyLocationEditorUpdates(
  args: ApplyLocationEditorUpdatesArgs
): LocationEditorUpdateResult {
  const updatedResults = mergeUpdatedLocationSpaces(
    args.accumulatedChunkResults,
    args.updatedSpaces,
    { strategy: args.mergeStrategy ?? 'identity' }
  );

  const updatedStageResults: StageResultsRecord = {
    ...args.stageResults,
    spaces: mergeWorkflowStageChunks(updatedResults as JsonRecord[], 'Spaces'),
  };

  const updatedStageChunkState: StageChunkState = {
    isStageChunking: args.stageChunkState?.isStageChunking ?? args.isStageChunking,
    currentStageChunk: args.stageChunkState?.currentStageChunk ?? args.currentStageChunk,
    totalStageChunks: args.stageChunkState?.totalStageChunks ?? args.totalStageChunks,
    showLiveMap: args.stageChunkState?.showLiveMap ?? args.showLiveMap,
    liveMapSpaces: updatedResults,
    accumulatedChunkResults: updatedResults,
  };

  const updatedPendingSpace =
    typeof args.reviewSpaceIndex === 'number' &&
    args.reviewSpaceIndex >= 0 &&
    args.reviewSpaceIndex < updatedResults.length
      ? updatedResults[args.reviewSpaceIndex]
      : undefined;

  return {
    updatedResults,
    updatedStageResults,
    updatedStageChunkState,
    updatedPendingSpace,
  };
}
