import {
  assembleFinalWorkflowContent,
  buildFinalWorkflowOutput,
  resolveCompletedWorkflowOutput,
} from './workflowContentAssembler';
import {
  deduplicateWorkflowProposals,
  sanitizeWorkflowProposals,
} from './workflowStageReview';
import type { GenerationRunState } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

export interface WorkflowStageProgression {
  kind: 'advance' | 'complete';
  nextIndex?: number;
}

export interface WorkflowCompletionInput {
  workflowType?: string;
  stageResults: StageResults;
  ruleBase?: string;
  accumulatedAnswers?: Record<string, string>;
  strategy?: 'finalized' | 'resolved';
  baseContentOverride?: JsonRecord;
  workflowRunState?: GenerationRunState | null;
}

export interface WorkflowCompletionResult {
  assembledContent: ReturnType<typeof assembleFinalWorkflowContent>;
  baseContent: JsonRecord;
  proposals: JsonRecord[];
  finalContent: JsonRecord;
}

export function getWorkflowStageProgression(
  currentStageIndex: number,
  totalStages: number,
): WorkflowStageProgression {
  if (currentStageIndex < totalStages - 1) {
    return {
      kind: 'advance',
      nextIndex: currentStageIndex + 1,
    };
  }

  return { kind: 'complete' };
}

export function buildWorkflowCompletionResult(
  input: WorkflowCompletionInput,
): WorkflowCompletionResult {
  const workflowType = input.workflowType ?? 'unknown';
  const assembledContent = assembleFinalWorkflowContent(workflowType, input.stageResults);
  const baseContent = input.baseContentOverride
    ? { ...input.baseContentOverride }
    : { ...assembledContent.content };
  const proposals = deduplicateWorkflowProposals(
    sanitizeWorkflowProposals((baseContent as { proposals?: unknown }).proposals),
    input.accumulatedAnswers ?? {},
  );

  const finalContent = input.strategy === 'resolved'
    ? resolveCompletedWorkflowOutput({
      workflowType,
      fallbackType: workflowType,
      stageResults: input.stageResults,
      ruleBase: input.ruleBase,
      workflowRunState: input.workflowRunState,
    })
    : buildFinalWorkflowOutput({
      baseContent,
      stageResults: input.stageResults,
      workflowType,
      fallbackType: workflowType,
      proposals,
      ruleBase: input.ruleBase,
      workflowRunState: input.workflowRunState,
    });

  return {
    assembledContent,
    baseContent,
    proposals,
    finalContent,
  };
}
