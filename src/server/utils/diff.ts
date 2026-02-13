/**
 * Simple diff utility for comparing objects and generating deltas
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface DiffResult {
  added: Record<string, any>;
  modified: Record<string, { old: any; new: any }>;
  removed: Record<string, any>;
}

/**
 * Compare two objects and return differences
 */
export function diffObjects(oldObj: Record<string, any>, newObj: Record<string, any>): DiffResult {
  const added: Record<string, any> = {};
  const modified: Record<string, { old: any; new: any }> = {};
  const removed: Record<string, any> = {};

  // Find added and modified keys
  for (const key in newObj) {
    if (!(key in oldObj)) {
      added[key] = newObj[key];
    } else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      modified[key] = { old: oldObj[key], new: newObj[key] };
    }
  }

  // Find removed keys
  for (const key in oldObj) {
    if (!(key in newObj)) {
      removed[key] = oldObj[key];
    }
  }

  return { added, modified, removed };
}

/**
 * Format diff for human-readable display
 */
export function formatDiff(diff: DiffResult): string {
  const lines: string[] = [];

  if (Object.keys(diff.added).length > 0) {
    lines.push('**Added:**');
    for (const [key, value] of Object.entries(diff.added)) {
      lines.push(`  + ${key}: ${JSON.stringify(value)}`);
    }
  }

  if (Object.keys(diff.modified).length > 0) {
    lines.push('**Modified:**');
    for (const [key, change] of Object.entries(diff.modified)) {
      lines.push(`  ~ ${key}:`);
      lines.push(`    - ${JSON.stringify(change.old)}`);
      lines.push(`    + ${JSON.stringify(change.new)}`);
    }
  }

  if (Object.keys(diff.removed).length > 0) {
    lines.push('**Removed:**');
    for (const [key, value] of Object.entries(diff.removed)) {
      lines.push(`  - ${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No changes detected.';
}

/**
 * Check if diff is empty (no changes)
 */
export function isDiffEmpty(diff: DiffResult): boolean {
  return (
    Object.keys(diff.added).length === 0 &&
    Object.keys(diff.modified).length === 0 &&
    Object.keys(diff.removed).length === 0
  );
}
