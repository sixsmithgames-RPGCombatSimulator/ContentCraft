import type { WorkflowContentType } from './workflowTypes';

const CONFIG_TYPE_TO_WORKFLOW: Record<string, WorkflowContentType> = {
  unknown: 'unknown',
  npc: 'npc',
  monster: 'monster',
  encounter: 'encounter',
  location: 'location',
  item: 'item',
  story_arc: 'story_arc',
  scene: 'scene',
  adventure: 'adventure',
  homebrew: 'homebrew',
  nonfiction: 'nonfiction',
  outline: 'outline',
  chapter: 'chapter',
  memoir: 'memoir',
  journal_entry: 'journal_entry',
  diet_log_entry: 'diet_log_entry',
  other_writing: 'other_writing',
};

const KNOWN_WORKFLOW_CONTENT_TYPES = new Set<WorkflowContentType>(
  Object.values(CONFIG_TYPE_TO_WORKFLOW),
);

export function resolveWorkflowContentType(
  value: string | WorkflowContentType | undefined | null,
): WorkflowContentType {
  if (!value) {
    return 'unknown';
  }

  if (KNOWN_WORKFLOW_CONTENT_TYPES.has(value as WorkflowContentType)) {
    return value as WorkflowContentType;
  }

  return CONFIG_TYPE_TO_WORKFLOW[value] ?? 'unknown';
}
