import type { Factpack } from './workflowCanonRetrieval';
import type { WorkflowResumeAction } from './workflowResume';
import type { WorkflowChunkInfo } from './workflowChunking';
import type { AiCompiledStageRequest } from '../contexts/AiAssistantContext';
import type { WorkflowPromptNotice } from '../types/workflowUi';
import type { WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

export type WorkflowStageLaunchPlan =
  | {
    kind: 'show_prompt';
    stageIndex: number;
    stageResults: StageResults;
    factpack: Factpack | null;
    prompt: string;
    promptNotice: WorkflowPromptNotice | null;
    retrySource: WorkflowRetrySource | null;
    compiledStageRequest?: AiCompiledStageRequest | null;
    alertMessage?: string;
    clearCompiledStageRequest: true;
    modalMode: 'input' | 'output';
  }
  | {
    kind: 'show_stage';
    stageIndex: number;
    stageResults: StageResults;
    factpack: Factpack | null;
    chunkInfo?: WorkflowChunkInfo;
    alertMessage?: string;
    isComplete?: boolean;
    finalOutput?: JsonRecord | null;
    sessionStatus?: 'idle' | 'running';
    currentGroupIndex?: number;
    currentNpcSectionIndex?: number;
    accumulatedNpcSections?: JsonRecord;
  }
  | {
    kind: 'show_completed';
    finalOutput: JsonRecord;
    alertMessage?: string;
  };

export function buildWorkflowJumpToStageLaunchPlan(input: {
  stageIndex: number;
  stageResults: StageResults;
  factpack: Factpack | null;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_stage',
    stageIndex: input.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
  };
}

export function buildWorkflowPromptLaunchPlan(input: {
  stageIndex: number;
  stageResults: StageResults;
  factpack: Factpack | null;
  prompt: string;
  promptNotice?: WorkflowPromptNotice | null;
  retrySource?: WorkflowRetrySource | null;
  compiledStageRequest?: AiCompiledStageRequest | null;
  alertMessage?: string;
  modalMode?: 'input' | 'output';
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_prompt',
    stageIndex: input.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
    prompt: input.prompt,
    promptNotice: input.promptNotice ?? null,
    retrySource: input.retrySource ?? null,
    compiledStageRequest: input.compiledStageRequest,
    alertMessage: input.alertMessage,
    clearCompiledStageRequest: true,
    modalMode: input.modalMode ?? 'input',
  };
}

export function buildWorkflowCompletedLaunchPlan(input: {
  finalOutput: JsonRecord;
  alertMessage?: string;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_completed',
    finalOutput: input.finalOutput,
    alertMessage: input.alertMessage,
  };
}

export function buildWorkflowResumeLaunchPlan(input: {
  resumeAction: WorkflowResumeAction;
  stageResults: StageResults;
  factpack: Factpack | null;
  retryNoticeBuilder: (retrySource: WorkflowRetrySource) => WorkflowPromptNotice | null;
  compiledStageRequest?: AiCompiledStageRequest | null;
}): WorkflowStageLaunchPlan {
  const { resumeAction } = input;

  if (resumeAction.kind === 'pending_prompt') {
    return buildWorkflowPromptLaunchPlan({
      stageIndex: resumeAction.stageIndex,
      stageResults: input.stageResults,
      factpack: input.factpack,
      prompt: resumeAction.prompt,
      promptNotice: resumeAction.retrySource ? input.retryNoticeBuilder(resumeAction.retrySource) : null,
      retrySource: resumeAction.retrySource ?? null,
      compiledStageRequest: input.compiledStageRequest,
      alertMessage: resumeAction.alertMessage,
      modalMode: 'input',
    });
  }

  if (resumeAction.kind === 'completed') {
    return {
      kind: 'show_completed',
      finalOutput: resumeAction.finalOutput,
      alertMessage: resumeAction.alertMessage,
    };
  }

  if (resumeAction.kind === 'stage_chunk') {
    return {
      kind: 'show_stage',
      stageIndex: resumeAction.stageIndex,
      stageResults: input.stageResults,
      factpack: input.factpack,
      chunkInfo: resumeAction.chunkInfo,
      alertMessage: resumeAction.alertMessage,
    };
  }

  return {
    kind: 'show_stage',
    stageIndex: resumeAction.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
    alertMessage: resumeAction.alertMessage,
  };
}

export function buildWorkflowFactChunkRestartLaunchPlan(input: {
  plannerStageIndex: number;
  nextChunkIndex: number;
  nextFactpack: Factpack;
  chunkInfo: WorkflowChunkInfo;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_stage',
    stageIndex: input.plannerStageIndex,
    stageResults: {},
    factpack: input.nextFactpack,
    chunkInfo: input.chunkInfo,
    isComplete: false,
    finalOutput: null,
    sessionStatus: 'idle',
    currentGroupIndex: input.nextChunkIndex,
  };
}

export function buildWorkflowFactChunkStartLaunchPlan(input: {
  stageIndex: number;
  stageResults: StageResults;
  factpack: Factpack;
  chunkInfo: WorkflowChunkInfo;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_stage',
    stageIndex: input.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
    chunkInfo: input.chunkInfo,
    currentGroupIndex: 0,
  };
}

export function buildWorkflowNpcSectionStartLaunchPlan(input: {
  stageIndex: number;
  stageResults: StageResults;
  factpack: Factpack | null;
  chunkInfo: WorkflowChunkInfo;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_stage',
    stageIndex: input.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
    chunkInfo: input.chunkInfo,
    currentNpcSectionIndex: 0,
    accumulatedNpcSections: {},
  };
}

export function buildWorkflowSameStageLaunchPlan(input: {
  stageIndex: number;
  stageResults: StageResults;
  factpack: Factpack | null;
  chunkInfo?: WorkflowChunkInfo;
  currentGroupIndex?: number;
  currentNpcSectionIndex?: number;
  accumulatedNpcSections?: JsonRecord;
}): WorkflowStageLaunchPlan {
  return {
    kind: 'show_stage',
    stageIndex: input.stageIndex,
    stageResults: input.stageResults,
    factpack: input.factpack,
    chunkInfo: input.chunkInfo,
    currentGroupIndex: input.currentGroupIndex,
    currentNpcSectionIndex: input.currentNpcSectionIndex,
    accumulatedNpcSections: input.accumulatedNpcSections,
  };
}
