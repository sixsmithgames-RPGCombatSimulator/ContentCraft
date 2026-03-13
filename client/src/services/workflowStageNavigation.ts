import type { Factpack } from './workflowCanonRetrieval';
import { mergeWorkflowFactpacks as mergeFactpacks } from './workflowFactpack';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

export type WorkflowStageNavigationPlan =
  | {
    kind: 'advance';
    nextIndex: number;
    stageResults: StageResults;
    factpack: Factpack | null;
    resetCurrentGroupIndex: boolean;
  }
  | {
    kind: 'noop';
    stageResults: StageResults;
    factpack: Factpack | null;
    resetCurrentGroupIndex: boolean;
  };

export interface WorkflowAdvancePlanInput {
  currentStageIndex: number;
  totalStages: number;
  stageResults: StageResults;
  factpack: Factpack | null;
  resetCurrentGroupIndex?: boolean;
}

export interface WorkflowCanonContinuationInput {
  currentStageIndex: number;
  totalStages: number;
  currentStageName: string;
  stageResults: StageResults;
  pendingStageResults?: StageResults | null;
  selectedFactpack: Factpack;
  existingFactpack?: Factpack | null;
  wasProcessingRetrievalHints: boolean;
  narrowingKeywords?: string[];
  resetCurrentGroupIndex?: boolean;
}

export function buildWorkflowAdvancePlan(
  input: WorkflowAdvancePlanInput,
): WorkflowStageNavigationPlan {
  if (input.currentStageIndex < input.totalStages - 1) {
    return {
      kind: 'advance',
      nextIndex: input.currentStageIndex + 1,
      stageResults: input.stageResults,
      factpack: input.factpack,
      resetCurrentGroupIndex: Boolean(input.resetCurrentGroupIndex),
    };
  }

  return {
    kind: 'noop',
    stageResults: input.stageResults,
    factpack: input.factpack,
    resetCurrentGroupIndex: Boolean(input.resetCurrentGroupIndex),
  };
}

export function buildWorkflowCanonContinuationPlan(
  input: WorkflowCanonContinuationInput,
): WorkflowStageNavigationPlan {
  if (input.wasProcessingRetrievalHints) {
    const mergedFactpack = input.existingFactpack
      ? mergeFactpacks(input.existingFactpack, input.selectedFactpack)
      : input.selectedFactpack;
    const stageResults = input.pendingStageResults || input.stageResults;

    return buildWorkflowAdvancePlan({
      currentStageIndex: input.currentStageIndex,
      totalStages: input.totalStages,
      stageResults,
      factpack: mergedFactpack,
      resetCurrentGroupIndex: input.resetCurrentGroupIndex,
    });
  }

  const baseStageResults = input.pendingStageResults || input.stageResults;
  const stageKey = input.currentStageName.toLowerCase().replace(/\s+/g, '_');
  const shouldStoreKeywordsOnStage = input.currentStageName === 'Keyword Extractor';
  const stageResults: StageResults = {
    ...baseStageResults,
    ...(shouldStoreKeywordsOnStage
      ? {
        [stageKey]: {
          keywords: input.narrowingKeywords,
        } as JsonRecord,
      }
      : {}),
  };

  return buildWorkflowAdvancePlan({
    currentStageIndex: input.currentStageIndex,
    totalStages: input.totalStages,
    stageResults,
    factpack: input.selectedFactpack,
    resetCurrentGroupIndex: input.resetCurrentGroupIndex,
  });
}
