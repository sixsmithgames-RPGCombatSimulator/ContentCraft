export const LLM_REQUEST_SCHEMA_VERSION = 'gma-gmc.llm-request/1' as const;
export const LLM_RESPONSE_SCHEMA_VERSION = 'gma-gmc.llm-response/1' as const;
export const LLM_REGISTRY_SCHEMA_VERSION = 'gma-gmc.llm-registry/1' as const;

export const LLM_OPERATION_CLASSES = [
  'deterministic_rule',
  'deterministic_lookup',
  'structured_low',
  'narrative',
  'world_generation',
  'reasoning_high',
] as const;

export type LlmOperationClass = typeof LLM_OPERATION_CLASSES[number];
export type LlmCommitPolicy = 'proposal_only' | 'gmc_commit' | 'vcs_commit' | 'no_write';
export type LlmTrustLabel = 'trusted_policy' | 'retrieved_authority_data' | 'user_text' | 'untrusted_external_data';

export interface LlmAuthorityContract {
  canon: 'GMC' | 'none';
  mechanics: 'VCS' | 'none';
  commit: LlmCommitPolicy;
}

export interface LlmReferences {
  campaignId?: string;
  sceneId?: string;
  actorIds?: string[];
  locationIds?: string[];
  canonVersion?: string;
  sceneVersion?: string;
  mechanicsVersion?: string;
  workflowMemoryIds?: string[];
}

export interface LlmContextLayer {
  label: LlmTrustLabel;
  value: unknown;
  revision?: string;
}

export interface LlmRequestEnvelope {
  schemaVersion: typeof LLM_REQUEST_SCHEMA_VERSION;
  taskId: string;
  correlationId: string;
  idempotencyKey: string;
  operation: string;
  stage: string;
  operationClass: LlmOperationClass;
  authority: LlmAuthorityContract;
  references: LlmReferences;
  context: Record<string, LlmContextLayer>;
  constraints: Record<string, unknown>;
  outputSchema: {
    id: string;
    version: string;
  };
  compatibility?: {
    sourceRoute?: string;
    adapterVersion: string;
    removeAfterVersion?: string;
  };
}

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  source: 'provider' | 'estimate' | 'unavailable';
  priceVersion: string | null;
  costUsd: number | null;
}

export interface LlmValidationResult {
  validatorId: string;
  version: string;
  valid: boolean;
  issues: Array<{ code: string; message: string; path?: string }>;
}

export interface LlmResponseEnvelope {
  schemaVersion: typeof LLM_RESPONSE_SCHEMA_VERSION;
  taskId: string;
  correlationId: string;
  idempotencyKey: string;
  operation: string;
  stage: string;
  status: 'succeeded' | 'failed' | 'review_required';
  output: unknown | null;
  validation: LlmValidationResult[];
  route: {
    provider: string | null;
    model: string | null;
    capabilityTier: string | null;
    fallbackUsed: boolean;
    registryVersion: string;
    operationVersion: string;
  };
  usage: LlmUsage;
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    attempts: number;
  };
  cache: {
    status: 'miss' | 'hit' | 'joined' | 'bypass';
    key: string | null;
  };
  error: null | {
    code: string;
    category: 'contract' | 'policy' | 'context' | 'provider' | 'validation' | 'persistence' | 'commit';
    message: string;
    retryable: boolean;
    source: string;
    providerStatus?: number;
  };
}

export const llmRequestJsonSchema = {
  $id: LLM_REQUEST_SCHEMA_VERSION,
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'taskId',
    'correlationId',
    'idempotencyKey',
    'operation',
    'stage',
    'operationClass',
    'authority',
    'references',
    'context',
    'constraints',
    'outputSchema',
  ],
  properties: {
    schemaVersion: { const: LLM_REQUEST_SCHEMA_VERSION },
    taskId: { type: 'string', minLength: 1, maxLength: 200 },
    correlationId: { type: 'string', minLength: 1, maxLength: 200 },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 300 },
    operation: { type: 'string', pattern: '^[a-z][a-z0-9.-]+$', maxLength: 160 },
    stage: { type: 'string', minLength: 1, maxLength: 120 },
    operationClass: { enum: [...LLM_OPERATION_CLASSES] },
    authority: {
      type: 'object',
      additionalProperties: false,
      required: ['canon', 'mechanics', 'commit'],
      properties: {
        canon: { enum: ['GMC', 'none'] },
        mechanics: { enum: ['VCS', 'none'] },
        commit: { enum: ['proposal_only', 'gmc_commit', 'vcs_commit', 'no_write'] },
      },
    },
    references: {
      type: 'object',
      additionalProperties: false,
      properties: {
        campaignId: { type: 'string', minLength: 1 },
        sceneId: { type: 'string', minLength: 1 },
        actorIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 }, maxItems: 50 },
        locationIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 }, maxItems: 50 },
        canonVersion: { type: 'string', minLength: 1 },
        sceneVersion: { type: 'string', minLength: 1 },
        mechanicsVersion: { type: 'string', minLength: 1 },
        workflowMemoryIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 }, maxItems: 50 },
      },
    },
    context: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: {
          label: { enum: ['trusted_policy', 'retrieved_authority_data', 'user_text', 'untrusted_external_data'] },
          value: {},
          revision: { type: 'string', minLength: 1 },
        },
      },
    },
    constraints: { type: 'object' },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version'],
      properties: {
        id: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
      },
    },
    compatibility: {
      type: 'object',
      additionalProperties: false,
      required: ['adapterVersion'],
      properties: {
        sourceRoute: { type: 'string' },
        adapterVersion: { type: 'string', minLength: 1 },
        removeAfterVersion: { type: 'string' },
      },
    },
  },
} as const;
export const llmResponseJsonSchema = {
  $id: LLM_RESPONSE_SCHEMA_VERSION,
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'taskId',
    'correlationId',
    'idempotencyKey',
    'operation',
    'stage',
    'status',
    'output',
    'validation',
    'route',
    'usage',
    'timing',
    'cache',
    'error',
  ],
  properties: {
    schemaVersion: { const: LLM_RESPONSE_SCHEMA_VERSION },
    taskId: { type: 'string' },
    correlationId: { type: 'string' },
    idempotencyKey: { type: 'string' },
    operation: { type: 'string' },
    stage: { type: 'string' },
    status: { enum: ['succeeded', 'failed', 'review_required'] },
    output: {},
    validation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['validatorId', 'version', 'valid', 'issues'],
        properties: {
          validatorId: { type: 'string' },
          version: { type: 'string' },
          valid: { type: 'boolean' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                path: { type: 'string' },
              },
            },
          },
        },
      },
    },
    route: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'model', 'capabilityTier', 'fallbackUsed', 'registryVersion', 'operationVersion'],
      properties: {
        provider: { type: ['string', 'null'] },
        model: { type: ['string', 'null'] },
        capabilityTier: { type: ['string', 'null'] },
        fallbackUsed: { type: 'boolean' },
        registryVersion: { type: 'string' },
        operationVersion: { type: 'string' },
      },
    },
    usage: {
      type: 'object',
      additionalProperties: false,
      required: ['inputTokens', 'outputTokens', 'reasoningTokens', 'cachedInputTokens', 'source', 'priceVersion', 'costUsd'],
      properties: {
        inputTokens: { type: ['integer', 'null'], minimum: 0 },
        outputTokens: { type: ['integer', 'null'], minimum: 0 },
        reasoningTokens: { type: ['integer', 'null'], minimum: 0 },
        cachedInputTokens: { type: ['integer', 'null'], minimum: 0 },
        source: { enum: ['provider', 'estimate', 'unavailable'] },
        priceVersion: { type: ['string', 'null'] },
        costUsd: { type: ['number', 'null'], minimum: 0 },
      },
    },
    timing: {
      type: 'object',
      additionalProperties: false,
      required: ['startedAt', 'completedAt', 'durationMs', 'attempts'],
      properties: {
        startedAt: { type: 'string' },
        completedAt: { type: 'string' },
        durationMs: { type: 'number', minimum: 0 },
        attempts: { type: 'integer', minimum: 0 },
      },
    },
    cache: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'key'],
      properties: {
        status: { enum: ['miss', 'hit', 'joined', 'bypass'] },
        key: { type: ['string', 'null'] },
      },
    },
    error: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'category', 'message', 'retryable', 'source'],
          properties: {
            code: { type: 'string' },
            category: { enum: ['contract', 'policy', 'context', 'provider', 'validation', 'persistence', 'commit'] },
            message: { type: 'string' },
            retryable: { type: 'boolean' },
            source: { type: 'string' },
            providerStatus: { type: 'integer' },
          },
        },
      ],
    },
  },
} as const;
