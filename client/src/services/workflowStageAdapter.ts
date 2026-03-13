import {
  getWorkflowStageDefinition,
  resolveWorkflowStageKey,
} from '../../../src/shared/generation/workflowRegistry';
import type { WorkflowContentType } from '../../../src/shared/generation/workflowTypes';
import type { GeneratorStage } from './generatorWorkflow';

export function normalizeWorkflowStage<TStage extends GeneratorStage>(
  workflowType: WorkflowContentType,
  stage: TStage,
): TStage {
  const lookupKey =
    typeof stage.routerKey === 'string' && stage.routerKey.trim().length > 0
      ? stage.routerKey
      : stage.name;
  const workflowStageKey =
    resolveWorkflowStageKey(workflowType, lookupKey)
    || resolveWorkflowStageKey(workflowType, stage.name);

  if (!workflowStageKey) {
    return stage;
  }

  const workflowStageLabel =
    getWorkflowStageDefinition(workflowType, workflowStageKey)?.label
    || stage.name;

  return {
    ...stage,
    routerKey: stage.routerKey || workflowStageKey,
    workflowStageKey,
    workflowStageLabel,
  };
}

export function normalizeWorkflowStageSet<TStage extends GeneratorStage>(
  workflowType: WorkflowContentType,
  stages: TStage[],
): TStage[] {
  return stages.map((stage) => normalizeWorkflowStage(workflowType, stage));
}

export function normalizeWorkflowStageMap<TStage extends GeneratorStage>(
  workflowType: WorkflowContentType,
  stageMap: Record<string, TStage>,
): Record<string, TStage> {
  return Object.fromEntries(
    Object.entries(stageMap).map(([key, stage]) => [key, normalizeWorkflowStage(workflowType, stage)]),
  );
}
