import {
  buildNpcDynamicStagePlan,
  type GeneratorStage,
  type GeneratorStageCatalog,
  type NpcDynamicStagePlan,
} from './generatorWorkflow';
import {
  buildWorkflowCompletionResult,
  type WorkflowCompletionResult,
} from './workflowStageTransition';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

type LegendaryPreference = 'yes' | 'no' | 'unknown';

export type WorkflowStageContinuationResult =
  | {
    kind: 'advance';
    nextIndex: number;
    nextStage: GeneratorStage;
    effectiveStages: GeneratorStage[];
    routingPlan?: NpcDynamicStagePlan;
  }
  | {
    kind: 'complete';
    effectiveStages: GeneratorStage[];
    routingPlan?: NpcDynamicStagePlan;
    completionResult: WorkflowCompletionResult;
  };

interface ResolveWorkflowStageContinuationInput {
  currentStageIndex: number;
  currentStage: GeneratorStage;
  stages: GeneratorStage[];
  workflowType?: string;
  userPrompt?: string;
  stageResults: StageResults;
  currentStageOutput?: JsonRecord;
  accumulatedAnswers?: Record<string, string>;
  ruleBase?: string;
  dynamicNpcStages?: GeneratorStage[] | null;
  catalog?: Pick<GeneratorStageCatalog, 'genericStages' | 'npcStages' | 'npcStageRouterMap'>;
  completionStrategy?: 'finalized' | 'resolved';
  completionBaseContentOverride?: JsonRecord;
  onLegendaryDecisionRequired?: () => boolean;
}

function inferWorkflowLegendaryPreference(prompt: string): LegendaryPreference {
  const negativePatterns = [
    /no\s+legendary/i,
    /not\s+legendary/i,
    /without\s+legendary/i,
    /skip\s+legendary/i,
    /non-legendary/i,
    /no\s+mythic/i,
  ];
  if (negativePatterns.some((re) => re.test(prompt))) return 'no';

  const positivePatterns = [
    /legendary\s+actions?/i,
    /mythic\s+actions?/i,
    /has\s+legendary/i,
    /is\s+legendary/i,
    /legendary\s+creature/i,
  ];
  if (positivePatterns.some((re) => re.test(prompt))) return 'yes';

  return 'unknown';
}

function getStageIdentity(stage: GeneratorStage): string {
  return String(stage.workflowStageKey || stage.routerKey || stage.name);
}

function findStageIndex(
  stages: GeneratorStage[],
  currentStage: GeneratorStage,
  fallbackIndex: number,
): number {
  const identity = getStageIdentity(currentStage);
  const byIdentity = stages.findIndex((stage) => getStageIdentity(stage) === identity);
  if (byIdentity >= 0) {
    return byIdentity;
  }

  const byName = stages.findIndex((stage) => stage.name === currentStage.name);
  if (byName >= 0) {
    return byName;
  }

  return fallbackIndex;
}

function shouldSkipLegendaryStage(
  nextStage: GeneratorStage | undefined,
  userPrompt: string | undefined,
  onLegendaryDecisionRequired?: () => boolean,
): boolean {
  if (nextStage?.routerKey !== 'legendary') {
    return false;
  }

  const preference = inferWorkflowLegendaryPreference(userPrompt || '');
  if (preference === 'no') {
    return true;
  }

  if (preference === 'unknown' && onLegendaryDecisionRequired) {
    return !onLegendaryDecisionRequired();
  }

  return false;
}

export function resolveWorkflowStageContinuation(
  input: ResolveWorkflowStageContinuationInput,
): WorkflowStageContinuationResult {
  let routingPlan: NpcDynamicStagePlan | undefined;
  let effectiveStages = input.stages;

  if (
    input.workflowType === 'npc'
    && input.currentStage.name === 'Creator: Basic Info'
    && !input.dynamicNpcStages
    && input.currentStageOutput
    && input.catalog
  ) {
    routingPlan = buildNpcDynamicStagePlan({
      basicInfoOutput: input.currentStageOutput,
      userPrompt: input.userPrompt || '',
      catalog: input.catalog,
    });
    effectiveStages = routingPlan.dynamicStages;
  }

  const currentEffectiveIndex = findStageIndex(
    effectiveStages,
    input.currentStage,
    input.currentStageIndex,
  );

  let nextIndex = currentEffectiveIndex + 1;
  if (shouldSkipLegendaryStage(effectiveStages[nextIndex], input.userPrompt, input.onLegendaryDecisionRequired)) {
    nextIndex += 1;
  }

  if (nextIndex < effectiveStages.length) {
    return {
      kind: 'advance',
      nextIndex,
      nextStage: effectiveStages[nextIndex],
      effectiveStages,
      routingPlan,
    };
  }

  return {
    kind: 'complete',
    effectiveStages,
    routingPlan,
    completionResult: buildWorkflowCompletionResult({
      workflowType: input.workflowType,
      stageResults: input.stageResults,
      accumulatedAnswers: input.accumulatedAnswers,
      strategy: input.completionStrategy,
      ruleBase: input.ruleBase,
      baseContentOverride: input.completionBaseContentOverride,
    }),
  };
}
