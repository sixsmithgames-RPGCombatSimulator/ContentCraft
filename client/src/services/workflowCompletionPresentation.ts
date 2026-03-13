import { resolveCompletedWorkflowOutput } from './workflowContentAssembler';
import type { WorkflowCompletionResult } from './workflowStageTransition';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

export function buildResolvedWorkflowFinalContent(input: {
  workflowType: string;
  stageResults: StageResults;
  fallbackType?: string;
  ruleBase?: string;
}): JsonRecord {
  return resolveCompletedWorkflowOutput({
    workflowType: input.workflowType,
    fallbackType: input.fallbackType ?? input.workflowType,
    stageResults: input.stageResults,
    ruleBase: input.ruleBase,
  });
}

export function logWorkflowCompletionResult(
  prefix: string,
  completionResult: WorkflowCompletionResult,
  fallbackDetails: JsonRecord,
): void {
  const { assembledContent, baseContent } = completionResult;

  if (Object.keys(baseContent).length === 0 && assembledContent.logLabel.includes('No content found')) {
    console.error(`${prefix} No content found in stage results!`, assembledContent.logDetails ?? fallbackDetails);
  } else if (assembledContent.logDetails) {
    console.log(`${prefix} ${assembledContent.logLabel}`, assembledContent.logDetails);
  } else {
    console.log(`${prefix} ${assembledContent.logLabel}`);
  }

  if (assembledContent.conflicts && assembledContent.conflicts.length > 0) {
    console.warn(`${prefix}[NPC Merge Conflicts]`, assembledContent.conflicts);
  }
}

export function getWorkflowCompletionTitle(finalContent: JsonRecord): string {
  if (typeof finalContent.title === 'string' && finalContent.title.trim().length > 0) {
    return finalContent.title;
  }

  if (typeof finalContent.canonical_name === 'string' && finalContent.canonical_name.trim().length > 0) {
    return finalContent.canonical_name;
  }

  return 'Generated Content';
}

export function buildWorkflowCompletionAlertMessage(input: {
  finalContent: JsonRecord;
  variant: 'validation_summary' | 'simple';
}): string {
  const title = getWorkflowCompletionTitle(input.finalContent);

  if (input.variant === 'simple') {
    return `✅ Generation Complete!\n\nTitle: ${title}\n\nScroll down to review and save the content.`;
  }

  const conflictCount = Array.isArray(input.finalContent.conflicts)
    ? input.finalContent.conflicts.length
    : 0;
  const issueCount = Array.isArray(input.finalContent.physics_issues)
    ? input.finalContent.physics_issues.length
    : 0;
  const canonAlignText = typeof input.finalContent.canon_alignment_score === 'number'
    ? String(input.finalContent.canon_alignment_score)
    : 'N/A';
  const logicScoreText = typeof input.finalContent.logic_score === 'number'
    ? String(input.finalContent.logic_score)
    : 'N/A';

  return `✅ Generation Complete!\n\nTitle: ${title}\n\nValidation Results:\n• ${conflictCount} canon conflicts detected\n• ${issueCount} physics/logic issues found\n• Canon Alignment: ${canonAlignText}/100\n• Logic Score: ${logicScoreText}/100\n\nReview the results below before saving.`;
}
