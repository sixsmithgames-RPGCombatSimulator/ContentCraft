import {
  getStageDefinition,
  getWorkflowStageDefinition,
} from './workflowRegistry';
import { resolveWorkflowContentType } from './workflowContentType';
import type { StageDefinition, WorkflowContentType } from './workflowTypes';

export type WorkflowStageJsonRecord = Record<string, unknown>;

export interface WorkflowStageContractView {
  key: string;
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
}

function resolveStageDefinition(
  stageIdOrName: string,
  workflowType?: WorkflowContentType | string | null,
): StageDefinition | null {
  if (workflowType) {
    const scoped = getWorkflowStageDefinition(resolveWorkflowContentType(workflowType), stageIdOrName);
    if (scoped) {
      return scoped;
    }
  }

  return getStageDefinition(stageIdOrName);
}

export function resolveWorkflowStageContractKey(
  stageIdOrName: string,
  workflowType?: WorkflowContentType | string | null,
): string | null {
  return resolveStageDefinition(stageIdOrName, workflowType)?.key ?? null;
}

export function getWorkflowStageContract(
  stageIdOrName: string,
  workflowType?: WorkflowContentType | string | null,
): WorkflowStageContractView | null {
  const contract = resolveStageDefinition(stageIdOrName, workflowType)?.contract;
  if (!contract) {
    return null;
  }

  return {
    key: resolveStageDefinition(stageIdOrName, workflowType)?.key ?? stageIdOrName,
    allowedKeys: contract.outputAllowedKeys,
    requiredKeys: contract.requiredKeys,
  };
}

export function pruneWorkflowStageOutput<T extends Record<string, unknown>>(
  obj: T,
  allowedKeys: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key as keyof T] = obj[key] as T[keyof T];
    }
  }
  return out;
}

export function validateWorkflowStageContractPayload(
  stageIdOrName: string,
  obj: WorkflowStageJsonRecord,
  workflowType?: WorkflowContentType | string | null,
): { ok: true } | { ok: false; error: string } {
  const definition = resolveStageDefinition(stageIdOrName, workflowType);
  const contract = definition?.contract;

  if (!contract) {
    return { ok: true };
  }

  const missing = contract.requiredKeys.filter((key) => obj[key] === undefined || obj[key] === null);

  if (definition?.key === 'basic_info') {
    const hasSpecies = typeof obj.species === 'string' && obj.species.trim().length > 0;
    const hasRace = typeof obj.race === 'string' && obj.race.trim().length > 0;
    const filteredMissing = missing.filter((key) => key !== 'species');

    if (!hasSpecies && !hasRace) {
      filteredMissing.push('species or race');
    }

    if (filteredMissing.length > 0) {
      return { ok: false, error: `Missing required keys: ${filteredMissing.join(', ')}` };
    }
  } else if (missing.length > 0) {
    return { ok: false, error: `Missing required keys: ${missing.join(', ')}` };
  }

  const fieldRules = contract.fieldRules ?? {};
  for (const [field, rule] of Object.entries(fieldRules)) {
    const value = obj[field];
    if (value === undefined || value === null) {
      continue;
    }

    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        return { ok: false, error: `Field ${field} must be an array.` };
      }
      if (rule.policy === 'non_empty_if_present' && value.length === 0) {
        return { ok: false, error: `Field ${field} must be a non-empty array.` };
      }
      continue;
    }

    if (rule.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false, error: `Field ${field} must be an object.` };
      }
      continue;
    }

    if (rule.type === 'string' && typeof value !== 'string') {
      return { ok: false, error: `Field ${field} must be a string.` };
    }

    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return { ok: false, error: `Field ${field} must be a finite number.` };
    }

    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      return { ok: false, error: `Field ${field} must be a boolean.` };
    }
  }

  if (definition?.key === 'planner') {
    const retrievalHints = obj.retrieval_hints;
    if (typeof retrievalHints !== 'object' || retrievalHints === null || Array.isArray(retrievalHints)) {
      return { ok: false, error: 'Field retrieval_hints must be an object.' };
    }
    if (!Array.isArray(obj.proposals)) {
      return { ok: false, error: 'Field proposals must be an array.' };
    }
  }

  return { ok: true };
}
