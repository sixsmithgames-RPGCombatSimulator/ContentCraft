/**
 * Item Stage Merger - Intelligent merging of multi-stage magic item generation
 *
 * Handles conflicts, tracks provenance, and merges data according to item schema
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

type JsonRecord = Record<string, unknown>;

interface FieldConflict {
  field: string;
  stages: Array<{
    stageName: string;
    value: unknown;
  }>;
  resolvedValue: unknown;
  resolution: 'last-wins' | 'merged-arrays' | 'user-choice-needed';
}

export interface ItemMergeResult {
  merged: JsonRecord;
  conflicts: FieldConflict[];
  warnings: string[];
}

/**
 * Check if a value is an array
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if a value is a plain object
 */
function isPlainObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep equality check for detecting actual conflicts
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => deepEqual((a as any)[key], (b as any)[key]));
  }

  return false;
}

/**
 * Intelligently merge two values based on their types
 */
function mergeValues(field: string, oldValue: unknown, newValue: unknown): {
  merged: unknown;
  hadConflict: boolean;
  resolution: FieldConflict['resolution'];
} {
  if (field === 'schema_version') {
    const oldVersion = typeof oldValue === 'string' ? oldValue.trim() : '';
    const newVersion = typeof newValue === 'string' ? newValue.trim() : '';
    if (oldVersion === newVersion) {
      return { merged: newValue, hadConflict: false, resolution: 'last-wins' };
    }
    if (oldVersion === '1.1' || newVersion === '1.1') {
      return { merged: '1.1', hadConflict: true, resolution: 'last-wins' };
    }
    return { merged: newVersion || oldVersion, hadConflict: true, resolution: 'last-wins' };
  }

  if (deepEqual(oldValue, newValue)) {
    return { merged: newValue, hadConflict: false, resolution: 'last-wins' };
  }

  if (isArray(oldValue) && isArray(newValue)) {
    if (field === 'proposals') {
      const toKey = (item: unknown): string => {
        if (typeof item === 'string') return item.trim().toLowerCase();
        if (isPlainObject(item) && typeof item.question === 'string') {
          return item.question.trim().toLowerCase();
        }
        return JSON.stringify(item);
      };
      const merged: unknown[] = [];
      const seen = new Set<string>();
      for (const item of [...oldValue, ...newValue]) {
        const key = toKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return { merged, hadConflict: true, resolution: 'merged-arrays' };
    }

    if (newValue.every(item => typeof item !== 'object')) {
      const merged = [...new Set([...oldValue, ...newValue])];
      return { merged, hadConflict: true, resolution: 'merged-arrays' };
    }

    const oldObjects = oldValue.filter(isPlainObject);
    const newObjects = newValue.filter(isPlainObject);
    const newNames = new Set(newObjects.map(obj => (obj.name as string) || ''));
    const merged = [
      ...newObjects,
      ...oldObjects.filter(obj => !newNames.has((obj.name as string) || ''))
    ];
    return { merged, hadConflict: true, resolution: 'merged-arrays' };
  }

  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const merged: JsonRecord = { ...oldValue };
    for (const [key, val] of Object.entries(newValue)) {
      if (val !== undefined && val !== null) {
        merged[key] = val;
      }
    }
    return { merged, hadConflict: true, resolution: 'last-wins' };
  }

  return { merged: newValue, hadConflict: true, resolution: 'last-wins' };
}

/**
 * Normalize stage key to handle different formats
 */
function normalizeStageKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/:\s*/g, ': ')
    .trim();
}

/**
 * Find stage data by normalized key matching
 */
function findStageData(stageResults: Record<string, JsonRecord>, targetStage: string): JsonRecord | null {
  const normalizedTarget = normalizeStageKey(targetStage);
  for (const [key, value] of Object.entries(stageResults)) {
    if (normalizeStageKey(key) === normalizedTarget) {
      return value;
    }
  }
  return null;
}

/**
 * Merge item stages with conflict detection
 */
export function mergeItemStages(stageResults: Record<string, JsonRecord>): ItemMergeResult {
  const merged: JsonRecord = {};
  const conflicts: FieldConflict[] = [];
  const warnings: string[] = [];
  const fieldProvenance: Record<string, Array<{ stage: string; value: unknown }>> = {};

  const stageOrder = [
    'item concept',
    'item mechanics',
    'item lore',
  ];

  console.log('[Item Stage Merger] Available stage keys:', Object.keys(stageResults));

  for (const stageName of stageOrder) {
    const stageData = findStageData(stageResults, stageName);
    if (!stageData) continue;

    const metadataFields = ['retrieval_hints'];

    for (const [field, value] of Object.entries(stageData)) {
      if (metadataFields.includes(field)) continue;
      if (value === undefined || value === null) continue;

      if (!fieldProvenance[field]) {
        fieldProvenance[field] = [];
      }
      fieldProvenance[field].push({ stage: stageName, value });
    }
  }

  for (const [field, provenance] of Object.entries(fieldProvenance)) {
    if (provenance.length === 1) {
      merged[field] = provenance[0].value;
    } else {
      let currentValue = provenance[0].value;
      const conflictStages: FieldConflict['stages'] = [
        { stageName: provenance[0].stage, value: provenance[0].value }
      ];

      for (let i = 1; i < provenance.length; i++) {
        const { stage, value } = provenance[i];
        const mergeResult = mergeValues(field, currentValue, value);
        currentValue = mergeResult.merged;
        if (mergeResult.hadConflict) {
          conflictStages.push({ stageName: stage, value });
        }
      }

      merged[field] = currentValue;

      if (conflictStages.length > 1) {
        const resolution = isArray(currentValue) ? 'merged-arrays' : 'last-wins';
        conflicts.push({
          field,
          stages: conflictStages,
          resolvedValue: currentValue,
          resolution,
        });
      }
    }
  }

  const foundStages = stageOrder.filter(s => findStageData(stageResults, s) !== null);
  const missingStages = stageOrder.filter(s => findStageData(stageResults, s) === null);

  if (missingStages.length > 0) {
    warnings.push(`Missing stages: ${missingStages.join(', ')}`);
  }

  console.log('[Item Stage Merger] Merge complete:', {
    totalFields: Object.keys(merged).length,
    conflicts: conflicts.length,
    warnings: warnings.length,
    stagesProcessed: foundStages.length,
  });

  return { merged, conflicts, warnings };
}

/**
 * Format conflicts for user review
 */
export function formatItemConflictsForReview(conflicts: FieldConflict[]): string {
  if (conflicts.length === 0) {
    return 'No conflicts detected during item stage merging.';
  }

  const lines = ['**Item Stage Merge Conflicts:**\n'];

  for (const conflict of conflicts) {
    lines.push(`\n**Field: \`${conflict.field}\`**`);
    lines.push(`Resolution: ${conflict.resolution}`);

    for (const stage of conflict.stages) {
      const valuePreview = typeof stage.value === 'object'
        ? JSON.stringify(stage.value).substring(0, 100) + '...'
        : String(stage.value);
      lines.push(`  - ${stage.stageName}: ${valuePreview}`);
    }

    const finalPreview = typeof conflict.resolvedValue === 'object'
      ? JSON.stringify(conflict.resolvedValue).substring(0, 100) + '...'
      : String(conflict.resolvedValue);
    lines.push(`  → **Final value**: ${finalPreview}`);
  }

  return lines.join('\n');
}
