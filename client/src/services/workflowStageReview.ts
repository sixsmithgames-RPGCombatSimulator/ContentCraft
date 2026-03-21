type JsonRecord = Record<string, unknown>;

export interface WorkflowStageProposal {
  id?: string;
  topic?: string;
  question?: string;
  default?: string;
  required?: boolean;
  options?: (string | { choice: string; description: string })[];
  rule_impact?: string;
  field_path?: string;
  current_value?: string;
  reason?: string;
  clarification_needed?: string;
  recommended_revision?: string;
}

interface FactCheckAmbiguityOut {
  field_path: string;
  text?: string;
  clarification_needed?: string;
  recommended_revision?: string;
}

interface FactCheckUnassociatedOut {
  field_path: string;
  text?: string;
  reason?: string;
  suggested_action?: 'ask_user' | 'discard' | 'keep';
}

interface FactCheckOutput {
  user_questions?: string[];
  ambiguities?: FactCheckAmbiguityOut[];
  unassociated?: FactCheckUnassociatedOut[];
}

export interface PrepareWorkflowStageReviewInput {
  parsed: JsonRecord;
  stageName: string;
  workflowType?: string;
  accumulatedAnswers?: Record<string, string>;
  isMultiPartGeneration?: boolean;
}

export interface PrepareWorkflowStageReviewResult {
  parsed: JsonRecord;
  hasProposals: boolean;
  hasCriticalIssues: boolean;
  shouldPauseForPlannerDecisions: boolean;
  shouldPauseForReview: boolean;
}

export interface WorkflowStageFailureHandling {
  userMessage: string;
  retryIssues: string[];
  shouldAutoRetry: boolean;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const slugifyProposalKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

const normalizeProposal = (proposal: unknown, index: number): JsonRecord | null => {
  if (proposal === null || proposal === undefined) return null;

  if (typeof proposal === 'string') {
    const question = proposal.trim();
    if (question.length === 0) return null;
    return {
      id: slugifyProposalKey(question || `proposal-${index}`),
      topic: `Decision ${index + 1}`,
      question,
      options: [question],
      default: question,
      required: false,
    };
  }

  if (!isRecord(proposal)) return null;

  const topic = typeof proposal.topic === 'string' && proposal.topic.trim().length > 0
    ? proposal.topic.trim()
    : typeof proposal.question === 'string'
      ? proposal.question.trim()
      : `Decision ${index + 1}`;
  const question = typeof proposal.question === 'string' && proposal.question.trim().length > 0
    ? proposal.question.trim()
    : topic;

  if (question.length === 0) return null;

  const choices = Array.isArray(proposal.choices)
    ? proposal.choices
      .map((choice) => {
        if (typeof choice === 'string') {
          const trimmed = choice.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (isRecord(choice) && typeof choice.choice === 'string' && choice.choice.trim().length > 0) {
          return choice.choice.trim();
        }
        return null;
      })
      .filter((choice): choice is string => choice !== null)
    : [];

  const optionsRaw = Array.isArray(proposal.options)
    ? proposal.options
      .map((option) => {
        if (typeof option === 'string') {
          const trimmed = option.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (isRecord(option) && typeof option.choice === 'string' && option.choice.trim().length > 0) {
          return option.choice.trim();
        }
        return null;
      })
      .filter((option): option is string => option !== null)
    : [];

  const options = optionsRaw.length > 0 ? optionsRaw : choices;
  if (options.length === 0) return null;

  const defaultValue = (() => {
    if (typeof proposal.default === 'string' && proposal.default.trim().length > 0) {
      const candidate = proposal.default.trim();
      if (options.includes(candidate)) return candidate;
    }
    return options[0];
  })();

  let proposalId = typeof proposal.id === 'string' && proposal.id.trim().length > 0
    ? proposal.id.trim()
    : slugifyProposalKey(topic || question || `proposal-${index}`);

  if (proposalId === 'prayer-bead-type') {
    proposalId = 'prayer-beads-type';
  }

  return {
    id: proposalId,
    topic,
    question,
    options,
    default: defaultValue,
    required: Boolean(proposal.required ?? false),
    rule_impact: typeof proposal.rule_impact === 'string' ? proposal.rule_impact : undefined,
    field_path: typeof proposal.field_path === 'string' ? proposal.field_path : undefined,
    current_value: typeof proposal.current_value === 'string' ? proposal.current_value : undefined,
    reason: typeof proposal.reason === 'string' ? proposal.reason : undefined,
    clarification_needed: typeof proposal.clarification_needed === 'string' ? proposal.clarification_needed : undefined,
    recommended_revision: typeof proposal.recommended_revision === 'string' ? proposal.recommended_revision : undefined,
  };
};

function buildFactCheckProposals(output: FactCheckOutput): WorkflowStageProposal[] {
  const proposals: WorkflowStageProposal[] = [];
  const seenFieldPaths = new Set<string>();

  if (Array.isArray(output.ambiguities)) {
    output.ambiguities.forEach((ambiguity) => {
      const fieldPath = ambiguity?.field_path || 'unknown field';
      const clarification = ambiguity?.clarification_needed;

      if (typeof clarification !== 'string' || clarification.trim().length === 0) {
        return;
      }

      if (fieldPath && fieldPath !== 'unknown field') {
        seenFieldPaths.add(fieldPath);
      }

      const options: Array<string | { choice: string; description: string }> = [];
      if (ambiguity?.recommended_revision) {
        options.push({
          choice: 'Keep current value',
          description: ambiguity?.text
            ? `Keep: "${ambiguity.text.substring(0, 100)}${ambiguity.text.length > 100 ? '...' : ''}"`
            : 'Keep the current implementation as-is',
        });
        options.push({
          choice: 'Use recommended revision',
          description: `${ambiguity.recommended_revision.substring(0, 150)}${ambiguity.recommended_revision.length > 150 ? '...' : ''}`,
        });
      }

      proposals.push({
        question: clarification,
        field_path: ambiguity?.field_path,
        current_value: ambiguity?.text,
        clarification_needed: ambiguity?.clarification_needed,
        recommended_revision: ambiguity?.recommended_revision,
        options: options.length > 0 ? options : undefined,
      });
    });
  }

  if (Array.isArray(output.user_questions)) {
    output.user_questions.forEach((question) => {
      if (typeof question !== 'string' || question.trim().length === 0) {
        return;
      }

      const isDuplicate = Array.from(seenFieldPaths).some((fieldPath) => (
        fieldPath !== 'unknown field' && question.includes(fieldPath)
      ));

      if (!isDuplicate) {
        proposals.push({ question });
      }
    });
  }

  if (Array.isArray(output.unassociated)) {
    output.unassociated.forEach((unassociated) => {
      if (unassociated?.suggested_action !== 'ask_user') {
        return;
      }

      const fieldPath = unassociated?.field_path || 'unknown field';
      if (fieldPath && fieldPath !== 'unknown field' && seenFieldPaths.has(fieldPath)) {
        return;
      }

      const text = typeof unassociated?.text === 'string' ? unassociated.text : '';
      const reason = typeof unassociated?.reason === 'string' ? unassociated.reason : '';
      const question = text
        ? `Review unassociated content: "${text}" at ${fieldPath}`
        : `Review ${fieldPath} (not backed by canon)`;

      proposals.push({
        question,
        field_path: unassociated?.field_path,
        current_value: text,
        reason,
        options: [
          { choice: 'Keep as-is', description: 'Keep this content even though it lacks direct canon support' },
          { choice: 'Remove this', description: 'Remove this content entirely' },
          { choice: 'Revise based on canon', description: 'Modify to align better with canon facts' },
        ],
      });
    });
  }

  return proposals;
}

export function sanitizeWorkflowProposals(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => normalizeProposal(item, index))
    .filter((proposal): proposal is JsonRecord => proposal !== null)
    .filter((proposal) => Array.isArray(proposal.options) && proposal.options.length > 0);
}

export function deduplicateWorkflowConflicts(conflicts: unknown[]): unknown[] {
  const seen = new Set<string>();
  const deduplicated: unknown[] = [];

  for (const conflict of conflicts) {
    if (!isRecord(conflict)) {
      deduplicated.push(conflict);
      continue;
    }

    const keySource = typeof conflict.description === 'string' && conflict.description.trim().length > 0
      ? conflict.description
      : typeof conflict.new_claim === 'string' && conflict.new_claim.trim().length > 0
        ? conflict.new_claim
        : typeof conflict.summary === 'string'
          ? conflict.summary
          : JSON.stringify(conflict);
    const key = keySource.trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(conflict);
  }

  return deduplicated;
}

export function deduplicateWorkflowProposals(
  proposals: unknown[],
  accumulatedAnswers: Record<string, string> = {},
): JsonRecord[] {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return [];
  }

  const answered = new Set(Object.keys(accumulatedAnswers));
  const answeredNormalized = new Set(
    Object.keys(accumulatedAnswers)
      .map((key) => key.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ''))
      .filter((key) => key.length > 0),
  );
  const seen = new Set<string>();
  const seenNormalizedQuestions = new Set<string>();
  const deduplicated: JsonRecord[] = [];

  proposals.forEach((proposal, index) => {
    if (!isRecord(proposal)) {
      return;
    }

    const id = typeof proposal.id === 'string' && proposal.id.trim().length > 0
      ? proposal.id.trim()
      : slugifyProposalKey(
        typeof proposal.topic === 'string'
          ? proposal.topic
          : typeof proposal.question === 'string'
            ? proposal.question
            : `proposal-${index}`,
      );
    const question = typeof proposal.question === 'string' ? proposal.question.trim() : '';
    const normalizedQuestion = question.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    const topic = typeof proposal.topic === 'string' ? proposal.topic.trim() : '';
    const dedupKey = id || topic || question;

    if (dedupKey && answered.has(dedupKey)) {
      if (normalizedQuestion) seenNormalizedQuestions.add(normalizedQuestion);
      return;
    }
    if (question && answered.has(question)) {
      if (normalizedQuestion) seenNormalizedQuestions.add(normalizedQuestion);
      return;
    }
    if (topic && answered.has(topic)) {
      if (normalizedQuestion) seenNormalizedQuestions.add(normalizedQuestion);
      return;
    }
    if (normalizedQuestion && answeredNormalized.has(normalizedQuestion)) return;
    if (dedupKey && seen.has(dedupKey)) return;
    if (normalizedQuestion && seenNormalizedQuestions.has(normalizedQuestion)) return;
    if (dedupKey) seen.add(dedupKey);
    if (normalizedQuestion) seenNormalizedQuestions.add(normalizedQuestion);

    deduplicated.push({ ...proposal, id });
  });

  return deduplicated;
}

export function filterAnsweredWorkflowProposals(
  proposals: unknown,
  answers: Record<string, string>,
): JsonRecord[] | undefined {
  const sanitized = sanitizeWorkflowProposals(proposals);
  const filtered = deduplicateWorkflowProposals(sanitized, answers);
  return filtered.length > 0 ? filtered : undefined;
}

function deduplicateTextValues(values: string[]): string[] {
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduplicated.push(trimmed);
  }

  return deduplicated;
}

function buildWorkflowStageUserMessage(stageName: string, errorMessage: string): string {
  const normalizedStageName = stageName.trim().toLowerCase();
  const normalizedError = errorMessage.trim().toLowerCase();

  if (
    normalizedStageName.includes('character build')
    && (
      normalizedError.includes('placeholder modifiers')
      || normalizedError.includes('description repeats the feature name')
    )
  ) {
    return 'The last attempt returned incomplete character mechanics. Review the suggested fixes below, then retry the stage.';
  }

  if (normalizedStageName.includes('spellcasting')) {
    return 'The last attempt returned spellcasting data the app could not use yet. Review the suggested fixes below, then retry the stage.';
  }

  if (normalizedStageName.includes('core details')) {
    return 'The last attempt left out some required personality details. Review the suggested fixes below, then retry the stage.';
  }

  if (normalizedError.includes('missing') || normalizedError.includes('incomplete') || normalizedError.includes('invalid')) {
    return 'The last attempt returned incomplete structured data for this stage. Review the suggested fixes below, then retry the stage.';
  }

  return 'This stage needs another pass before it can continue. Review the suggested fixes below, then retry the stage.';
}

function collectWorkflowStageRetryIssues(parsed: JsonRecord | undefined, errorMessage: string): string[] {
  const issuesFromParsed = Array.isArray(parsed?.conflicts)
    ? parsed.conflicts.flatMap((issue) => {
      if (!isRecord(issue)) {
        return [];
      }

      const candidates = [issue.details, issue.description, issue.new_claim]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return candidates.slice(0, 1);
    })
    : [];

  if (issuesFromParsed.length > 0) {
    return deduplicateTextValues(issuesFromParsed);
  }

  return deduplicateTextValues(errorMessage.split(/;\s*/));
}

export function resolveWorkflowStageFailureHandling(input: {
  stageName: string;
  errorMessage: string;
  parsed?: JsonRecord;
  allowAutomaticRetry: boolean;
  automaticRetryAlreadyUsed: boolean;
}): WorkflowStageFailureHandling {
  const retryIssues = collectWorkflowStageRetryIssues(input.parsed, input.errorMessage);

  return {
    userMessage: buildWorkflowStageUserMessage(input.stageName, input.errorMessage),
    retryIssues,
    shouldAutoRetry: input.allowAutomaticRetry
      && !input.automaticRetryAlreadyUsed
      && Boolean(input.parsed)
      && retryIssues.length > 0,
  };
}

export function buildWorkflowStageErrorOutput(input: {
  stageName: string;
  errorMessage: string;
  displayErrorMessage?: string;
  technicalErrorMessage?: string;
  rawSnippet?: string;
  parsed?: JsonRecord;
}): JsonRecord {
  if (input.parsed) {
    return {
      ...input.parsed,
      error: input.displayErrorMessage ?? input.errorMessage,
      technicalErrorMessage: input.technicalErrorMessage,
      rawResponseSnippet: input.rawSnippet,
    };
  }

  return {
    stage: input.stageName,
    error: input.displayErrorMessage ?? input.errorMessage,
    technicalErrorMessage: input.technicalErrorMessage,
    rawResponseSnippet: input.rawSnippet,
  };
}

export function prepareWorkflowStageForReview(
  input: PrepareWorkflowStageReviewInput,
): PrepareWorkflowStageReviewResult {
  const parsed: JsonRecord = { ...input.parsed };
  const accumulatedAnswers = input.accumulatedAnswers ?? {};

  const isFactCheckStage = input.stageName === 'Fact Checker'
    || input.stageName === 'Editor & Style';

  if (isFactCheckStage) {
    parsed.proposals = buildFactCheckProposals(parsed as FactCheckOutput) as unknown as JsonRecord[];
  }

  if (parsed.proposals !== undefined) {
    parsed.proposals = sanitizeWorkflowProposals(parsed.proposals);
  }

  if (Array.isArray(parsed.conflicts) && parsed.conflicts.length > 0) {
    parsed.conflicts = deduplicateWorkflowConflicts(parsed.conflicts);
  }

  if (Array.isArray(parsed.proposals) && parsed.proposals.length > 0) {
    parsed.proposals = deduplicateWorkflowProposals(parsed.proposals, accumulatedAnswers);
  }

  const hasProposals = Array.isArray(parsed.proposals) && parsed.proposals.length > 0;
  const hasCriticalPhysics = Array.isArray(parsed.physics_issues)
    && parsed.physics_issues.some((issue) => isRecord(issue) && issue.severity === 'critical');
  const hasCriticalConflicts = Array.isArray(parsed.conflicts)
    && parsed.conflicts.some((conflict) => isRecord(conflict) && conflict.severity === 'critical');
  const hasCriticalIssues = hasCriticalPhysics || hasCriticalConflicts;
  const isLocationSpacesStage = input.stageName === 'Spaces' && input.workflowType === 'location';
  const shouldPauseForPlannerDecisions = input.stageName === 'Planner'
    && hasProposals
    && Object.keys(accumulatedAnswers).length === 0;
  const shouldPauseForReview = !shouldPauseForPlannerDecisions
    && (hasProposals || hasCriticalIssues)
    && !input.isMultiPartGeneration
    && !isLocationSpacesStage;

  return {
    parsed,
    hasProposals,
    hasCriticalIssues,
    shouldPauseForPlannerDecisions,
    shouldPauseForReview,
  };
}
