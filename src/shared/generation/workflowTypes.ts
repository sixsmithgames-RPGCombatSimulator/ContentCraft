export type WorkflowContentType =
  | 'story_arc'
  | 'scene'
  | 'encounter'
  | 'npc'
  | 'monster'
  | 'item'
  | 'adventure'
  | 'homebrew'
  | 'location'
  | 'outline'
  | 'chapter'
  | 'nonfiction'
  | 'memoir'
  | 'journal_entry'
  | 'diet_log_entry'
  | 'other_writing'
  | 'unknown';

export type ExecutionMode = 'integrated' | 'manual';

export type WorkflowRetrySourceKind =
  | 'freeform_rejection'
  | 'detected_issues'
  | 'geometry_proposal'
  | 'door_validation';

export interface WorkflowRetrySource {
  kind: WorkflowRetrySourceKind;
  label: string;
  summary: string;
  targetName?: string;
  issueCategory?: string;
  issueType?: string;
  userReason?: string;
}

export type RetrievalPolicy = 'none' | 'initial' | 'hints_allowed' | 'required_for_grounded_mode';

export type RetrievalGroundingStatus = 'project' | 'library' | 'ungrounded';

export type WorkflowClaimStatus = 'aligned' | 'additive_unverified' | 'ambiguous' | 'conflicting' | 'unsupported_ungrounded';

export type WorkflowAcceptanceState =
  | 'accepted'
  | 'accepted_with_additions'
  | 'review_required_conflict'
  | 'review_required_ambiguity'
  | 'accepted_ungrounded_warning'
  | 'invalid_response';

export type StageFieldValidationPolicy =
  | 'required'
  | 'present_if_applicable'
  | 'may_be_empty'
  | 'non_empty_if_present';

export type StageValueType = 'array' | 'object' | 'string' | 'number' | 'boolean' | 'string_or_object';

export interface StageFieldRule {
  policy: StageFieldValidationPolicy;
  type?: StageValueType;
}

export interface StageRetryPolicy {
  autoRetryable: boolean;
  maxAttempts: number;
  cooldownMs: number;
  retryOnStructuralFailure: boolean;
}

export interface StageContract {
  outputAllowedKeys: readonly string[];
  requiredKeys: readonly string[];
  proxyAllowedKeys?: readonly string[];
  zeroRawGuard?: boolean;
  fieldRules?: Readonly<Record<string, StageFieldRule>>;
}

export interface StageDefinition<TStageKey extends string = string> {
  key: TStageKey;
  label: string;
  aliases: readonly string[];
  contentTypes: readonly WorkflowContentType[];
  manualModeSupported: boolean;
  retrievalPolicy: RetrievalPolicy;
  retryPolicy: StageRetryPolicy;
  contract?: StageContract;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkflowDefinition<TStageKey extends string = string> {
  contentType: WorkflowContentType;
  label: string;
  stageKeys: readonly TStageKey[];
  rulesPackId?: string;
  manualModeSupported: boolean;
  retrievalFallbackOrder: readonly RetrievalGroundingStatus[];
  resourceCheckTarget?: string;
}

export interface RulesPack {
  id: string;
  label: string;
  contentTypes: readonly WorkflowContentType[];
  primaryRuleBase?: string;
  supportedRuleBases?: readonly string[];
  description?: string;
}

export type StageAttemptStatus =
  | 'compiled'
  | 'sending'
  | 'awaiting_response'
  | 'received'
  | 'applying'
  | 'accepted'
  | 'awaiting_user_input'
  | 'error';

export interface StageAttempt {
  attemptId: string;
  stageKey: string;
  stageLabel: string;
  status: StageAttemptStatus;
  compiledRequestId?: string;
  error?: string;
  warnings?: string[];
  retrySource?: WorkflowRetrySource;
  transport?: ExecutionMode | 'server';
  acceptanceState?: WorkflowAcceptanceState;
  canon?: WorkflowCanonSummary;
  conflicts?: WorkflowConflictSummary;
  startedAt: number;
  updatedAt: number;
  acceptedAt?: number;
  completedAt?: number;
}

export interface RetrievalStatus {
  groundingStatus: RetrievalGroundingStatus;
  warningMessage?: string;
  resourceCheckTarget?: string;
  factsFound: number;
  provenance: RetrievalGroundingStatus;
  lastUpdatedAt: number;
}

export interface WorkflowCanonSummary {
  groundingStatus: RetrievalGroundingStatus;
  factCount: number;
  entityNames: string[];
  gaps: string[];
  lastUpdatedAt?: number;
}

export interface WorkflowConflictItem {
  key: string;
  status: WorkflowClaimStatus;
  message: string;
  fieldPath?: string;
  severity?: string;
  currentValue?: string;
  proposedValue?: string;
}

export interface WorkflowConflictSummary {
  reviewRequired: boolean;
  alignedCount: number;
  additiveCount: number;
  ambiguityCount: number;
  conflictCount: number;
  unsupportedCount: number;
  items: WorkflowConflictItem[];
  updatedAt?: number;
}

export interface WorkflowStageMemorySummary {
  request: {
    prompt: string;
    type?: string;
    stageKey?: string;
    stageLabel?: string;
    schemaVersion?: string;
  };
  completedStages: string[];
  currentStageData: unknown;
  priorStageSummaries: Record<string, unknown>;
  previousDecisions: Record<string, string>;
  factpack: {
    factCount: number;
    entityNames: string[];
    gaps: string[];
    groundingStatus: RetrievalGroundingStatus;
  };
  canon: WorkflowCanonSummary;
  conflicts: WorkflowConflictSummary;
  execution: {
    workflowType?: WorkflowContentType;
    executionMode?: ExecutionMode;
    currentStageIndex?: number;
  };
}

export interface WorkflowMemoryState {
  request: {
    prompt: string;
    generatorType?: string;
    schemaVersion?: string;
  };
  stage: {
    currentStageKey?: string;
    currentStageLabel?: string;
    currentStageIndex: number;
    completedStages: string[];
    currentStageData: unknown;
    summaries: Record<string, unknown>;
  };
  decisions: {
    confirmed: Record<string, string>;
    unresolvedQuestions: string[];
  };
  canon: WorkflowCanonSummary;
  conflicts: WorkflowConflictSummary;
}

export type GenerationRunStatus =
  | 'idle'
  | 'ready'
  | 'running'
  | 'awaiting_user_input'
  | 'awaiting_user_decisions'
  | 'error'
  | 'complete';

export interface GenerationRunState {
  runId: string;
  workflowType: WorkflowContentType;
  workflowLabel: string;
  executionMode: ExecutionMode;
  status: GenerationRunStatus;
  stageSequence: string[];
  stageLabels: Record<string, string>;
  currentStageKey?: string;
  currentStageLabel?: string;
  currentStageIndex: number;
  currentAttemptId?: string;
  lastAcceptedStageKey?: string;
  attempts: StageAttempt[];
  retrieval: RetrievalStatus;
  acceptanceState?: WorkflowAcceptanceState;
  memory?: WorkflowMemoryState;
  warnings: string[];
  resourceCheckTarget?: string;
  projectId?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}
