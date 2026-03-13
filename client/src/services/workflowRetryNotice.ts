import type { WorkflowPromptNotice } from '../types/workflowUi';
import type { WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function getWorkflowRetryBadgeLabel(retrySource: WorkflowRetrySource): string {
  return retrySource.label;
}

export function getWorkflowRetryDetail(
  retrySource: WorkflowRetrySource,
  maxLength = 160,
): string {
  const detail = retrySource.targetName
    ? `${retrySource.targetName}: ${retrySource.summary}`
    : retrySource.summary;

  return truncateText(detail, maxLength);
}

export function buildWorkflowRetryPromptNotice(retrySource: WorkflowRetrySource): WorkflowPromptNotice {
  const title = retrySource.targetName
    ? `Retrying rejected space: ${retrySource.targetName}`
    : `Retrying from ${retrySource.label}`;

  let message = truncateText(retrySource.summary, 180);
  if (retrySource.userReason && !message.includes(retrySource.userReason)) {
    message = `${message} User feedback: "${truncateText(retrySource.userReason, 120)}"`;
  }

  return {
    title,
    message,
    tone: 'warning',
  };
}
