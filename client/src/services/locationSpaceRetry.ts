import { validateAllDoors, convertDoorValidationToErrors } from '../utils/doorSync';
import type { ParentStructure, GeometryProposal } from '../utils/locationGeometry';
import { buildLocationGeometryReview } from './locationSpaceReview';
import type { WorkflowPromptNotice } from '../types/workflowUi';
import type { ValidationError } from '../contexts/locationEditorTypes';
import type { WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';
import { buildWorkflowRetryPromptNotice } from './workflowRetryNotice';

type JsonRecord = Record<string, unknown>;

export interface LocationSpaceRetryContext {
  rejected_space: {
    name: string;
    purpose?: string;
    wall_thickness_ft?: number;
    door_targets: string[];
  };
  user_reason?: string;
  geometry_issues: Array<{
    type: GeometryProposal['type'];
    category: GeometryProposal['category'];
    question: string;
    options: string[];
  }>;
  door_validation_issues: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
  retry_focus: string[];
}

export interface LocationSpaceRejectionSuggestion {
  id: string;
  label: string;
  text: string;
  retrySource: WorkflowRetrySource;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getGeometrySuggestionLabel(category: GeometryProposal['category']): string {
  switch (category) {
    case 'doors':
      return 'Use door issue';
    case 'wall_thickness':
      return 'Use wall thickness issue';
    case 'dimensions':
      return 'Use sizing issue';
    case 'placement':
      return 'Use placement issue';
    case 'connections':
      return 'Use connection issue';
    default:
      return 'Use geometry issue';
  }
}

function getValidationSuggestionLabel(type: ValidationError['type']): string {
  switch (type) {
    case 'invalid-door':
      return 'Use door validation';
    case 'broken-connection':
      return 'Use broken connection';
    case 'out-of-bounds':
      return 'Use out-of-bounds issue';
    case 'overlap':
      return 'Use overlap issue';
    default:
      return 'Use validation issue';
  }
}

function getSuggestionSubject(spaceName?: string): string {
  return spaceName ? `Replace "${spaceName}"` : 'Replace this space';
}

export function buildLocationSpaceProposalRetrySource(args: {
  spaceName?: string;
  proposal: Pick<GeometryProposal, 'category' | 'question'>;
}): WorkflowRetrySource {
  return {
    kind: 'geometry_proposal',
    label: getGeometrySuggestionLabel(args.proposal.category),
    summary: truncateText(args.proposal.question, 160),
    targetName: args.spaceName,
    issueCategory: args.proposal.category,
  };
}

export function buildLocationSpaceProposalRetryText(args: {
  spaceName?: string;
  proposal: Pick<GeometryProposal, 'category' | 'question'>;
}): string {
  return `${getSuggestionSubject(args.spaceName)}. ${buildLocationSpaceProposalRetrySource({
    spaceName: args.spaceName,
    proposal: args.proposal,
  }).summary}`;
}

export function buildLocationSpaceValidationRetrySource(args: {
  spaceName?: string;
  validationError: Pick<ValidationError, 'type' | 'message'>;
}): WorkflowRetrySource {
  return {
    kind: 'door_validation',
    label: getValidationSuggestionLabel(args.validationError.type),
    summary: truncateText(args.validationError.message, 160),
    targetName: args.spaceName,
    issueType: args.validationError.type,
  };
}

export function buildLocationSpaceValidationRetryText(args: {
  spaceName?: string;
  validationError: Pick<ValidationError, 'message'>;
}): string {
  return `${getSuggestionSubject(args.spaceName)}. ${truncateText(args.validationError.message, 160)}`;
}

export function buildLocationSpaceFreeformRetrySource(args: {
  spaceName?: string;
  userReason?: string;
  retryFocus?: string[];
}): WorkflowRetrySource {
  const trimmedReason = args.userReason?.trim();
  const focusSummary = args.retryFocus && args.retryFocus.length > 0
    ? `Focus on ${args.retryFocus.slice(0, 3).map((focus) => focus.replace(/_/g, ' ')).join(', ')}.`
    : 'User requested a different replacement for this space.';

  return {
    kind: trimmedReason ? 'freeform_rejection' : 'detected_issues',
    label: trimmedReason ? 'Freeform rejection' : 'Use detected issues',
    summary: trimmedReason || focusSummary,
    targetName: args.spaceName,
    userReason: trimmedReason,
  };
}

export function buildLocationSpaceRejectionSuggestions(args: {
  spaceName?: string;
  geometryProposals: Array<Pick<GeometryProposal, 'category' | 'question'>>;
  validationErrors: Array<Pick<ValidationError, 'type' | 'message'>>;
}): LocationSpaceRejectionSuggestion[] {
  const suggestions: LocationSpaceRejectionSuggestion[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const subject = getSuggestionSubject(args.spaceName);

  const pushSuggestion = (suggestion: LocationSpaceRejectionSuggestion) => {
    const normalizedText = suggestion.text.trim();
    if (!normalizedText || seenIds.has(suggestion.id) || seenTexts.has(normalizedText)) {
      return;
    }
    seenIds.add(suggestion.id);
    seenTexts.add(normalizedText);
    suggestions.push(suggestion);
  };

  const detectedIssueSnippets = [
    ...args.geometryProposals.slice(0, 2).map((proposal) => truncateText(proposal.question, 110)),
    ...args.validationErrors.slice(0, 2).map((error) => truncateText(error.message, 110)),
  ];

  if (detectedIssueSnippets.length > 0) {
    const retrySource: WorkflowRetrySource = {
      kind: 'detected_issues',
      label: 'Use detected issues',
      summary: `Fix these issues: ${detectedIssueSnippets.join(' ')}`,
      targetName: args.spaceName,
    };
    pushSuggestion({
      id: 'detected-issues',
      label: 'Use detected issues',
      text: `${subject}. ${retrySource.summary}`,
      retrySource,
    });
  }

  for (const proposal of args.geometryProposals.slice(0, 4)) {
    const retrySource = buildLocationSpaceProposalRetrySource({
      spaceName: args.spaceName,
      proposal,
    });
    pushSuggestion({
      id: `geometry-${proposal.category}`,
      label: getGeometrySuggestionLabel(proposal.category),
      text: `${subject}. ${retrySource.summary}`,
      retrySource,
    });
  }

  for (const error of args.validationErrors.slice(0, 3)) {
    const retrySource = buildLocationSpaceValidationRetrySource({
      spaceName: args.spaceName,
      validationError: error,
    });
    pushSuggestion({
      id: `validation-${error.type}`,
      label: getValidationSuggestionLabel(error.type),
      text: `${subject}. ${retrySource.summary}`,
      retrySource,
    });
  }

  return suggestions;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDoorTargets(space: JsonRecord): string[] {
  if (!Array.isArray(space.doors)) {
    return [];
  }

  return space.doors
    .filter(isRecord)
    .map((door) => (typeof door.leads_to === 'string' ? door.leads_to.trim() : ''))
    .filter((target) => target.length > 0);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildLocationSpaceRetryGuidance(args: {
  rejectedSpace: JsonRecord;
  existingSpaces: JsonRecord[];
  parentStructure?: ParentStructure;
  userReason?: string;
  retrySource?: WorkflowRetrySource;
}): {
  rejectionFeedback: string;
  rejectionContext: LocationSpaceRetryContext;
  promptNotice: WorkflowPromptNotice;
  retrySource: WorkflowRetrySource;
} {
  const rejectedSpaceName =
    typeof args.rejectedSpace.name === 'string' && args.rejectedSpace.name.trim().length > 0
      ? args.rejectedSpace.name.trim()
      : 'the rejected space';

  const geometryReview = buildLocationGeometryReview(args.rejectedSpace, args.existingSpaces, {
    parentStructure: args.parentStructure,
    exclude: {
      id: typeof args.rejectedSpace.id === 'string' ? args.rejectedSpace.id : undefined,
      code: typeof args.rejectedSpace.code === 'string' ? args.rejectedSpace.code : undefined,
      name: typeof args.rejectedSpace.name === 'string' ? args.rejectedSpace.name : undefined,
    },
  });

  const doorValidationIssues = convertDoorValidationToErrors(
    validateAllDoors([args.rejectedSpace as any]),
  );

  const retryFocus = unique([
    ...geometryReview.proposals.map((proposal) => proposal.category),
    ...doorValidationIssues.map((issue) => issue.type),
  ]);
  const effectiveRetrySource = args.retrySource
    ? {
        ...args.retrySource,
        userReason: args.userReason?.trim() || args.retrySource.userReason,
      }
    : buildLocationSpaceFreeformRetrySource({
        spaceName: rejectedSpaceName,
        userReason: args.userReason,
        retryFocus,
      });

  const rejectionContext: LocationSpaceRetryContext = {
    rejected_space: {
      name: rejectedSpaceName,
      purpose: typeof args.rejectedSpace.purpose === 'string' ? args.rejectedSpace.purpose : undefined,
      wall_thickness_ft:
        typeof args.rejectedSpace.wall_thickness_ft === 'number'
          ? args.rejectedSpace.wall_thickness_ft
          : undefined,
      door_targets: unique(getDoorTargets(args.rejectedSpace)),
    },
    user_reason: args.userReason?.trim() || undefined,
    geometry_issues: geometryReview.proposals.slice(0, 4).map((proposal) => ({
      type: proposal.type,
      category: proposal.category,
      question: proposal.question,
      options: proposal.options,
    })),
    door_validation_issues: doorValidationIssues.slice(0, 4).map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
    })),
    retry_focus: retryFocus,
  };

  const feedbackLines = [
    `IMPORTANT: The previous space "${rejectedSpaceName}" was rejected. Generate a DIFFERENT replacement for this same chunk.`,
    args.userReason?.trim()
      ? `User feedback: "${args.userReason.trim()}"`
      : `The user rejected "${rejectedSpaceName}" because it did not fit the intended floor plan.`,
  ];

  if (rejectionContext.geometry_issues.length > 0) {
    feedbackLines.push(
      'Address these spatial issues:',
      ...rejectionContext.geometry_issues.map((issue) => `- [${issue.category}] ${issue.question}`),
    );
  }

  if (rejectionContext.door_validation_issues.length > 0) {
    feedbackLines.push(
      'Address these door validation issues:',
      ...rejectionContext.door_validation_issues.map((issue) => `- [${issue.type}] ${issue.message}`),
    );
  }

  feedbackLines.push(
    `Do NOT repeat "${rejectedSpaceName}" unchanged.`,
    'Keep door leads_to values using exact existing room names.',
    'If you connect to an existing room, make that connection easy to pair reciprocally.',
  );

  const promptNoticeParts: string[] = [];
  if (rejectionContext.retry_focus.length > 0) {
    promptNoticeParts.push(
      `Focus on ${rejectionContext.retry_focus
        .slice(0, 3)
        .map((focus) => focus.replace(/_/g, ' '))
        .join(', ')}.`,
    );
  }
  if (rejectionContext.user_reason) {
    promptNoticeParts.push(`User feedback: "${truncateText(rejectionContext.user_reason, 120)}"`);
  }
  if (promptNoticeParts.length === 0) {
    promptNoticeParts.push('This copied prompt already includes the rejection context and spatial issues for the replacement room.');
  }

  return {
    rejectionFeedback: feedbackLines.join('\n'),
    rejectionContext,
    promptNotice: {
      ...buildWorkflowRetryPromptNotice(effectiveRetrySource),
      message: [buildWorkflowRetryPromptNotice(effectiveRetrySource).message, promptNoticeParts.join(' ')].filter(Boolean).join(' '),
    },
    retrySource: effectiveRetrySource,
  };
}
