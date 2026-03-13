import type { LiveMapSpace } from '../types/liveMapTypes';
import type { StageChunkState } from '../utils/generationProgress';
import {
  getNextWorkflowStageChunkStep,
  mergeWorkflowStageChunks,
  type WorkflowStageChunkStep,
} from './workflowStageChunkRuntime';

type JsonRecord = Record<string, unknown>;
type StageResultsRecord = Record<string, JsonRecord>;

function getStageStorageKey(stageName: string): string {
  return stageName.toLowerCase().replace(/\s+/g, '_');
}

interface BuildWorkflowStageChunkProgressArgs {
  stageName: string;
  stageResults: StageResultsRecord;
  accumulatedChunks: JsonRecord[];
  currentStageChunk: number;
  totalStageChunks: number;
  liveMapSpaces?: LiveMapSpace[];
  showLiveMap?: boolean;
}

export interface WorkflowStageChunkProgressResult {
  mergedStageOutput: JsonRecord;
  updatedStageResults: StageResultsRecord;
  nextChunkStep: WorkflowStageChunkStep | null;
  updatedStageChunkState?: StageChunkState;
  stageComplete: boolean;
}

export function buildWorkflowStageChunkProgress(
  args: BuildWorkflowStageChunkProgressArgs
): WorkflowStageChunkProgressResult {
  const mergedStageOutput = mergeWorkflowStageChunks(args.accumulatedChunks, args.stageName);
  const updatedStageResults: StageResultsRecord = {
    ...args.stageResults,
    [getStageStorageKey(args.stageName)]: mergedStageOutput,
  };

  const nextChunkStep = getNextWorkflowStageChunkStep(args.currentStageChunk, args.totalStageChunks);
  if (!nextChunkStep) {
    return {
      mergedStageOutput,
      updatedStageResults,
      nextChunkStep: null,
      updatedStageChunkState: undefined,
      stageComplete: true,
    };
  }

  return {
    mergedStageOutput,
    updatedStageResults,
    nextChunkStep,
    updatedStageChunkState: {
      isStageChunking: true,
      currentStageChunk: nextChunkStep.nextChunkIndex,
      totalStageChunks: args.totalStageChunks,
      accumulatedChunkResults: args.accumulatedChunks,
      liveMapSpaces: args.liveMapSpaces ?? [],
      showLiveMap: args.showLiveMap ?? false,
    },
    stageComplete: false,
  };
}
