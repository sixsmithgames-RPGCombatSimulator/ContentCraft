import {
  getStageDefinition,
  getWorkflowStageDefinition,
} from './workflowRegistry.js';
import { resolveWorkflowContentType } from './workflowContentType.js';
import type { StageDefinition, WorkflowContentType } from './workflowTypes.js';

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

const CHARACTER_BUILD_DESCRIPTION_FIELDS = [
  'class_features',
  'subclass_features',
  'racial_features',
  'feats',
  'fighting_styles',
] as const;

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'".,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectCharacterBuildPlaceholderDescriptionIssues(obj: WorkflowStageJsonRecord): string[] {
  const issues: string[] = [];

  for (const field of CHARACTER_BUILD_DESCRIPTION_FIELDS) {
    const value = obj[field];
    if (!Array.isArray(value)) {
      continue;
    }

    value.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return;
      }

      const record = entry as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const description = typeof record.description === 'string' ? record.description.trim() : '';
      if (!name || !description) {
        return;
      }

      if (normalizeComparableText(name) === normalizeComparableText(description)) {
        issues.push(`${field}[${index}] description repeats the feature name. Provide concrete effect text instead.`);
      }
    });
  }

  return issues;
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
    let value = obj[field];
    if (value === undefined || value === null) {
      continue;
    }

    if (rule.type === 'array') {
      // Auto-normalize: convert string to single-element array
      if (typeof value === 'string' && value.trim().length > 0) {
        obj[field] = [value.trim()];
        value = obj[field];
      }
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

    if (rule.type === 'string_or_object') {
      const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
      if (typeof value !== 'string' && !isObject) {
        return { ok: false, error: `Field ${field} must be a string or object.` };
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
    const deliverable = typeof obj.deliverable === 'string' ? obj.deliverable.trim() : '';
    const resolvedDeliverable = resolveWorkflowContentType(deliverable);
    const resolvedWorkflowType = workflowType ? resolveWorkflowContentType(workflowType) : 'unknown';

    if (!deliverable || resolvedDeliverable === 'unknown') {
      return { ok: false, error: 'Field deliverable must be a known workflow content type.' };
    }

    if (resolvedWorkflowType !== 'unknown' && resolvedDeliverable !== resolvedWorkflowType) {
      return { ok: false, error: `Field deliverable must match workflow type ${resolvedWorkflowType}.` };
    }

    const retrievalHints = obj.retrieval_hints;
    if (typeof retrievalHints !== 'object' || retrievalHints === null || Array.isArray(retrievalHints)) {
      return { ok: false, error: 'Field retrieval_hints must be an object.' };
    }
    if (!Array.isArray(obj.proposals)) {
      return { ok: false, error: 'Field proposals must be an array.' };
    }
    if (obj.proposals.some((proposal) => typeof proposal !== 'object' || proposal === null || Array.isArray(proposal))) {
      return { ok: false, error: 'Field proposals must contain only proposal objects.' };
    }
  }

  if (
    definition?.key === 'character_build'
    || definition?.key === 'character_build_feature_enrichment'
  ) {
    const placeholderDescriptionIssues = collectCharacterBuildPlaceholderDescriptionIssues(obj);
    if (placeholderDescriptionIssues.length > 0) {
      return { ok: false, error: placeholderDescriptionIssues.join('; ') };
    }
  }

  return { ok: true };
}
