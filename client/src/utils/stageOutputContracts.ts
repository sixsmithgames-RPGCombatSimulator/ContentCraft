import {
  getWorkflowStageContract,
  pruneWorkflowStageOutput,
  resolveWorkflowStageContractKey,
  validateWorkflowStageContractPayload,
  type WorkflowStageJsonRecord as JsonRecord,
} from '../../../src/shared/generation/workflowStageValidation';

export type { JsonRecord };
export type StageKey = string;

export interface StageContract {
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
}

export function resolveStageContractKey(stageIdOrName: string, workflowType?: string | null): StageKey | null {
  return resolveWorkflowStageContractKey(stageIdOrName, workflowType);
}

export function getStageContract(stageIdOrName: string, workflowType?: string | null): StageContract | null {
  const contract = getWorkflowStageContract(stageIdOrName, workflowType);
  if (!contract) {
    return null;
  }

  return {
    allowedKeys: contract.allowedKeys,
    requiredKeys: contract.requiredKeys,
  };
}

export function pruneToAllowedKeys<T extends Record<string, unknown>>(obj: T, allowedKeys: readonly string[]): Partial<T> {
  return pruneWorkflowStageOutput(obj, allowedKeys);
}

export function validateStageOutput(
  stageIdOrName: string,
  obj: JsonRecord,
  workflowType?: string | null,
): { ok: boolean; error?: string } {
  const result = validateWorkflowStageContractPayload(stageIdOrName, obj, workflowType);
  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    error: result.error,
  };
}
