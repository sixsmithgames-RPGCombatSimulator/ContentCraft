export type OrchestratorErrorCategory =
  | 'contract'
  | 'policy'
  | 'context'
  | 'provider'
  | 'validation'
  | 'persistence'
  | 'commit';

export class OrchestratorError extends Error {
  readonly code: string;
  readonly category: OrchestratorErrorCategory;
  readonly retryable: boolean;
  readonly status: number;
  readonly source: string;
  readonly providerStatus?: number;
  readonly details?: unknown;

  constructor(input: {
    code: string;
    category: OrchestratorErrorCategory;
    message: string;
    retryable?: boolean;
    status?: number;
    source?: string;
    providerStatus?: number;
    details?: unknown;
  }) {
    super(input.message);
    this.name = 'OrchestratorError';
    this.code = input.code;
    this.category = input.category;
    this.retryable = Boolean(input.retryable);
    this.status = input.status ?? 500;
    this.source = input.source ?? 'gmc.llm-orchestrator';
    this.providerStatus = input.providerStatus;
    this.details = input.details;
  }
}

export function normalizeOrchestratorError(error: unknown): OrchestratorError {
  if (error instanceof OrchestratorError) return error;
  const candidate = error as any;
  return new OrchestratorError({
    code: String(candidate?.code ?? 'ORCHESTRATOR_FAILURE'),
    category: candidate?.category ?? (candidate?.status >= 500 ? 'provider' : 'contract'),
    message: error instanceof Error ? error.message : String(candidate?.message ?? error),
    retryable: Boolean(candidate?.retryable),
    status: Number(candidate?.status ?? 500),
    source: String(candidate?.source ?? 'gmc.llm-orchestrator'),
    providerStatus: Number.isFinite(Number(candidate?.providerStatus)) ? Number(candidate.providerStatus) : undefined,
    details: candidate?.details,
  });
}
