import type { GenerationProgress, ProgressEntry, StageChunkState } from '../utils/generationProgress';
import {
  resolveWorkflowStageIdentity,
  resolveWorkflowTypeFromConfigType,
  type GeneratorStage,
} from './generatorWorkflow';
import type { WorkflowChunkInfo } from './workflowChunking';
import { resolveWorkflowStageKey } from '../../../src/shared/generation/workflowRegistry';

type JsonRecord = Record<string, unknown>;

export type ResumeStageChunkInfo = WorkflowChunkInfo;

export type WorkflowResumeAction =
  | {
    kind: 'pending_prompt';
    stageIndex: number;
    prompt: string;
    stageName: string;
    alertMessage: string;
    retrySource?: ProgressEntry['retrySource'];
  }
  | {
    kind: 'stage_chunk';
    stageIndex: number;
    chunkInfo: ResumeStageChunkInfo;
    alertMessage: string;
  }
  | {
    kind: 'stage';
    stageIndex: number;
    alertMessage: string;
  }
  | {
    kind: 'completed';
    finalOutput: JsonRecord;
    alertMessage: string;
  }
  | {
    kind: 'final_stage';
    stageIndex: number;
    alertMessage: string;
  };

function findIncompleteEntry(progress: ProgressEntry[]): ProgressEntry | undefined {
  return progress.find((entry) => entry.status === 'pending' && entry.response === null);
}

function getLatestConfirmedStageLabel(progress: ProgressEntry[]): string | null {
  const latestConfirmedEntry = [...progress].reverse().find(
    (entry) => typeof entry.confirmedStageId === 'string' || typeof entry.confirmedStageKey === 'string',
  );

  if (!latestConfirmedEntry) {
    return null;
  }

  const stageLabel = latestConfirmedEntry.confirmedStageId || latestConfirmedEntry.confirmedStageKey || null;
  if (!stageLabel) {
    return null;
  }

  if (
    latestConfirmedEntry.confirmedStageKey
    && latestConfirmedEntry.confirmedStageId
    && latestConfirmedEntry.confirmedStageId !== latestConfirmedEntry.confirmedStageKey
  ) {
    return `${latestConfirmedEntry.confirmedStageId} (${latestConfirmedEntry.confirmedStageKey})`;
  }

  return stageLabel;
}

function resolveSavedStageIndex(
  session: GenerationProgress,
  stages: GeneratorStage[],
  stageIdOrAlias: string,
): number {
  const exactStageIndex = stages.findIndex((stage) => stage.name === stageIdOrAlias);
  if (exactStageIndex !== -1) {
    return exactStageIndex;
  }

  const workflowType = resolveWorkflowTypeFromConfigType(
    (typeof session.workflowType === 'string' && session.workflowType)
      || (typeof session.config?.type === 'string' ? session.config.type : undefined),
  );
  const stageKey = resolveWorkflowStageKey(workflowType, stageIdOrAlias);
  if (!stageKey) {
    return -1;
  }

  const keyedStageIndex = stages.findIndex((stage) => resolveWorkflowStageIdentity(workflowType, stage).stageKey === stageKey);
  if (keyedStageIndex !== -1) {
    return keyedStageIndex;
  }

  return Array.isArray(session.workflowStageSequence)
    ? session.workflowStageSequence.indexOf(stageKey)
    : -1;
}

export function resolveWorkflowResumeAction(input: {
  session: GenerationProgress;
  stages: GeneratorStage[];
  effectiveChunkState: StageChunkState | null;
  finalOutput: JsonRecord;
}): WorkflowResumeAction {
  const incompleteEntry = findIncompleteEntry(input.session.progress || []);
  const latestConfirmedStage = getLatestConfirmedStageLabel(input.session.progress || []);
  const spacesStageIndex = resolveSavedStageIndex(input.session, input.stages, 'Spaces');

  if (incompleteEntry) {
    const expectedStageIndex = resolveSavedStageIndex(input.session, input.stages, incompleteEntry.stage);
    const stageIndex = expectedStageIndex !== -1 ? expectedStageIndex : input.session.currentStageIndex;

    return {
      kind: 'pending_prompt',
      stageIndex,
      prompt: incompleteEntry.prompt,
      stageName: incompleteEntry.stage,
      alertMessage: `✅ Session Resumed!\n\nResuming at an incomplete prompt.\nCurrent stage: ${incompleteEntry.stage}\nTotal stages: ${input.stages.length}${latestConfirmedStage ? `\nLast server-confirmed stage: ${latestConfirmedStage}` : ''}\n\nYou can continue from where you left off.`,
      retrySource: incompleteEntry.retrySource,
    };
  }

  if (
    input.effectiveChunkState
    && input.effectiveChunkState.isStageChunking
    && input.effectiveChunkState.currentStageChunk < input.effectiveChunkState.totalStageChunks
    && spacesStageIndex !== -1
  ) {
    const nextChunkIndex = input.effectiveChunkState.currentStageChunk + 1;
    return {
      kind: 'stage_chunk',
      stageIndex: spacesStageIndex,
      chunkInfo: {
        isChunked: true,
        currentChunk: nextChunkIndex,
        totalChunks: input.effectiveChunkState.totalStageChunks,
        chunkLabel: `Space ${nextChunkIndex} of ${input.effectiveChunkState.totalStageChunks}`,
      },
      alertMessage: `✅ Session Resumed!\n\nResumed at Spaces stage\nGenerating Space ${nextChunkIndex} of ${input.effectiveChunkState.totalStageChunks}\n\n${input.effectiveChunkState.liveMapSpaces?.length || 0} spaces already generated.`,
    };
  }

  if (input.session.currentStageIndex < input.stages.length - 1) {
    return {
      kind: 'stage',
      stageIndex: input.session.currentStageIndex,
      alertMessage: `✅ Session Resumed!\n\nResumed at Stage ${input.session.currentStageIndex + 1} of ${input.stages.length}${latestConfirmedStage ? `\nLast server-confirmed stage: ${latestConfirmedStage}` : ''}\n\nYou can continue from where you left off.`,
    };
  }

  if (Object.keys(input.finalOutput).length > 0) {
    return {
      kind: 'completed',
      finalOutput: input.finalOutput,
      alertMessage: `⚠️ Session Was Already Complete!\n\nThis generation finished all ${input.stages.length} stages.\n\nThe completed content is shown below. You cannot resume a completed session, but you can view and save the results.`,
    };
  }

  return {
    kind: 'final_stage',
    stageIndex: input.session.currentStageIndex,
    alertMessage: `✅ Session Resumed!\n\nResumed at final stage (${input.stages[input.session.currentStageIndex]?.name || 'Unknown'})\nStage ${input.session.currentStageIndex + 1} of ${input.stages.length}${latestConfirmedStage ? `\nLast server-confirmed stage: ${latestConfirmedStage}` : ''}\n\nComplete this stage to finish generation.`,
  };
}
