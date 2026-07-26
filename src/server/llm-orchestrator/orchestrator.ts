import { createHash, randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import {
  LLM_REQUEST_SCHEMA_VERSION,
  LLM_RESPONSE_SCHEMA_VERSION,
  llmRequestJsonSchema,
  type LlmRequestEnvelope,
  type LlmResponseEnvelope,
  type LlmValidationResult,
} from '../../shared/llm/orchestratorContracts.js';
import {
  hydrateReferenceContext,
  resolveOperationContext,
  type ReferenceContextLoader,
} from './contextResolver.js';
import { OrchestratorError, normalizeOrchestratorError } from './errors.js';
import {
  MemoryExecutionStore,
  MongoExecutionStore,
  type ExecutionStore,
} from './executionStore.js';
import { priceUsage, routeProviders } from './modelPolicy.js';
import {
  OPERATION_REGISTRY_VERSION,
  applyOperationRuntime,
  assertOperationRegistryComplete,
  getOperationDefinition,
  getSemanticValidator,
  type LlmOperationDefinition,
  type LlmOperationRuntimeOverride,
  validateOperationOutput,
} from './operationRegistry.js';
import type { LlmProviderAdapter } from './provider.js';
import { unavailableUsage } from './provider.js';
import { GeminiProviderAdapter } from './providers/geminiProvider.js';
import { OpenAiProviderAdapter } from './providers/openAiProvider.js';
import { resolveRolloutDecision } from './rolloutPolicy.js';
import { MongoReferenceContextLoader } from './mongoContextLoader.js';
import './semanticValidators.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateRequest = ajv.compile(llmRequestJsonSchema);
const inFlight = new Map<string, { fingerprint: string; promise: Promise<LlmResponseEnvelope> }>();
const circuitState = new Map<string, { failures: number; openUntil: number }>();

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(request: LlmRequestEnvelope) {
  return createHash('sha256').update(stable(request)).digest('hex');
}

function operationKey(userId: string, request: LlmRequestEnvelope) {
  return `${userId}\0${request.operation}\0${request.idempotencyKey}`;
}

function emptyResponse(request: LlmRequestEnvelope, startedAt: Date): LlmResponseEnvelope {
  return {
    schemaVersion: LLM_RESPONSE_SCHEMA_VERSION,
    taskId: request.taskId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    operation: request.operation,
    stage: request.stage,
    status: 'failed',
    output: null,
    validation: [],
    route: {
      provider: null,
      model: null,
      capabilityTier: null,
      fallbackUsed: false,
      registryVersion: OPERATION_REGISTRY_VERSION,
      operationVersion: 'unknown',
    },
    usage: unavailableUsage(),
    timing: {
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      durationMs: 0,
      attempts: 0,
    },
    cache: { status: 'miss', key: null },
    error: null,
  };
}

function validateContract(request: LlmRequestEnvelope) {
  if (!validateRequest(request)) {
    throw new OrchestratorError({
      code: 'REQUEST_SCHEMA_INVALID',
      category: 'contract',
      message: ajv.errorsText(validateRequest.errors, { separator: '; ' }),
      status: 400,
      source: 'gmc.llm-contract',
      details: validateRequest.errors,
    });
  }
  const operation = getOperationDefinition(request.operation);
  if (operation.operationClass !== request.operationClass) {
    throw new OrchestratorError({
      code: 'OPERATION_CLASS_MISMATCH',
      category: 'policy',
      message: `Operation '${request.operation}' must use class '${operation.operationClass}'.`,
      status: 400,
      source: 'gmc.operation-registry',
    });
  }
  if (request.operationClass.startsWith('deterministic_')) {
    throw new OrchestratorError({
      code: 'MODEL_FORBIDDEN',
      category: 'policy',
      message: `Operation class '${request.operationClass}' may not execute a model.`,
      status: 400,
      source: 'gmc.operation-registry',
    });
  }
  if (request.authority.commit !== operation.authority.commit || request.authority.commit !== 'proposal_only') {
    throw new OrchestratorError({
      code: 'AUTHORITY_POLICY_MISMATCH',
      category: 'policy',
      message: 'Model execution is proposal-only and cannot authorize an authority write.',
      status: 403,
      source: 'gmc.authority-policy',
    });
  }
  if (request.outputSchema.id !== operation.outputSchema.id || request.outputSchema.version !== operation.outputSchema.version) {
    throw new OrchestratorError({
      code: 'OUTPUT_SCHEMA_VERSION_MISMATCH',
      category: 'contract',
      message: `Operation '${operation.id}' requires output schema ${operation.outputSchema.id}/${operation.outputSchema.version}.`,
      status: 409,
      source: 'gmc.operation-registry',
    });
  }
  return operation;
}

async function runValidation(
  request: LlmRequestEnvelope,
  output: unknown,
  operation: LlmOperationDefinition,
): Promise<LlmValidationResult[]> {
  const schema = validateOperationOutput(operation.id, output, operation.outputSchema.schema);
  const results: LlmValidationResult[] = [{
    validatorId: `${operation.outputSchema.id}.json-schema`,
    version: operation.outputSchema.version,
    valid: schema.valid,
    issues: schema.issues,
  }];
  if (!schema.valid) return results;
  for (const validatorId of operation.validators) {
    const validator = getSemanticValidator(validatorId);
    if (!validator) throw new Error(`Missing registered semantic validator ${validatorId}`);
    results.push(await validator({ request, output }));
  }
  return results;
}

async function waitForDurableResult(store: ExecutionStore, userId: string, request: LlmRequestEnvelope, maximumMs: number) {
  const deadline = Date.now() + maximumMs;
  while (Date.now() < deadline) {
    const record = await store.find(userId, request.operation, request.idempotencyKey);
    if (record?.response) return record.response;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new OrchestratorError({
    code: 'IN_FLIGHT_WAIT_TIMEOUT',
    category: 'persistence',
    message: 'A matching operation is still running. Retry with the same idempotency key.',
    retryable: true,
    status: 409,
    source: 'gmc.execution-store',
  });
}

export interface ExecuteOptions {
  userId: string;
  store?: ExecutionStore;
  providers?: LlmProviderAdapter[];
  signal?: AbortSignal;
  manualOutput?: unknown;
  shadow?: boolean;
  runtimeOverride?: LlmOperationRuntimeOverride;
  contextLoader?: ReferenceContextLoader;
}

export async function executeLlmOperation(request: LlmRequestEnvelope, options: ExecuteOptions): Promise<LlmResponseEnvelope> {
  const requestFingerprint = fingerprint(request);
  const key = operationKey(options.userId, request);
  const existingFlight = inFlight.get(key);
  if (existingFlight) {
    if (existingFlight.fingerprint !== requestFingerprint) {
      throw new OrchestratorError({
        code: 'IDEMPOTENCY_CONFLICT',
        category: 'persistence',
        message: 'This idempotency key is already associated with a different request.',
        status: 409,
        source: 'gmc.execution-store',
      });
    }
    const joined = await existingFlight.promise;
    return { ...joined, cache: { ...joined.cache, status: 'joined' } };
  }

  const promise = executeClaimed(request, { ...options, store: options.store ?? new MongoExecutionStore() }, requestFingerprint);
  inFlight.set(key, { fingerprint: requestFingerprint, promise });
  try {
    return await promise;
  } finally {
    if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
  }
}

async function executeClaimed(
  request: LlmRequestEnvelope,
  options: ExecuteOptions & { store: ExecutionStore },
  requestFingerprint: string,
): Promise<LlmResponseEnvelope> {
  const startedAt = new Date();
  let response = emptyResponse(request, startedAt);
  let operation;
  let cacheKey: string | undefined;
  try {
    assertOperationRegistryComplete();
    const registeredOperation = validateContract(request);
    const rollout = resolveRolloutDecision(registeredOperation.id, request.correlationId || request.taskId);
    if (rollout.mode === 'disabled') {
      throw new OrchestratorError({
        code: 'OPERATION_ROLLOUT_DISABLED',
        category: 'policy',
        message: `Operation '${registeredOperation.id}' is disabled by rollout policy ${rollout.policyVersion}.`,
        retryable: true,
        status: 503,
        source: 'gmc.rollout-policy',
      });
    }
    operation = options.runtimeOverride && rollout.mode === 'compatibility'
      ? applyOperationRuntime(registeredOperation, options.runtimeOverride)
      : registeredOperation;
    response.route.capabilityTier = operation.capabilityTier;
    response.route.operationVersion = operation.version;
    const executionRequest = await hydrateReferenceContext({
      userId: options.userId,
      request,
      operation,
      loader: options.contextLoader ?? new MongoReferenceContextLoader(),
    });
    const resolved = resolveOperationContext(executionRequest, operation);
    cacheKey = resolved.cacheKey;
    response.cache.key = cacheKey;

    const claim = await options.store.claim({
      userId: options.userId,
      request,
      requestFingerprint,
      leaseMs: operation.provider.timeoutMs * operation.provider.maxAttempts + 30_000,
      retentionMs: Number(process.env.LLM_EXECUTION_RETENTION_DAYS ?? 30) * 86_400_000,
    });
    if (claim.kind === 'conflict') {
      throw new OrchestratorError({
        code: 'IDEMPOTENCY_CONFLICT',
        category: 'persistence',
        message: 'This idempotency key is already associated with a different request.',
        status: 409,
        source: 'gmc.execution-store',
      });
    }
    if (claim.kind === 'replay' && claim.record.response) {
      return { ...claim.record.response, cache: { ...claim.record.response.cache, status: 'hit' } };
    }
    if (claim.kind === 'running') {
      const joined = await waitForDurableResult(options.store, options.userId, request, operation.provider.timeoutMs * operation.provider.maxAttempts + 30_000);
      return { ...joined, cache: { ...joined.cache, status: 'joined' } };
    }
    await options.store.appendEvent(
      options.userId,
      request.operation,
      request.idempotencyKey,
      'context_resolved',
      {
        ...Object.fromEntries(
          Object.entries(resolved.bytesByLayer).map(([layer, bytes]) => [`${layer}Bytes`, bytes]),
        ),
        totalBytes: resolved.totalBytes,
        inputTargetBytes: operation.context.inputTargetBytes,
        targetExceeded: resolved.targetExceeded,
      },
    );
    await options.store.appendEvent(
      options.userId,
      request.operation,
      request.idempotencyKey,
      'rollout_selected',
      {
        policyVersion: rollout.policyVersion,
        mode: options.shadow ? 'shadow' : rollout.mode,
        canaryPercent: rollout.canaryPercent,
        canaryBucket: rollout.canaryBucket,
      },
    );

    if (operation.cache.enabled && !options.shadow) {
      const cached = await options.store.findCache(options.userId, operation.id, cacheKey);
      if (cached?.response) {
        const replay = {
          ...cached.response,
          taskId: request.taskId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
          cache: { status: 'hit' as const, key: cacheKey },
        };
        await options.store.complete({ userId: options.userId, request, requestFingerprint, response: replay, cacheKey });
        return replay;
      }
    }

    if (options.manualOutput !== undefined) {
      const validation = await runValidation(executionRequest, options.manualOutput, operation);
      const valid = validation.every((item) => item.valid);
      response = {
        ...response,
        status: valid ? 'succeeded' : 'review_required',
        output: valid ? options.manualOutput : null,
        validation,
        route: {
          ...response.route,
          provider: 'manual',
          model: null,
        },
        cache: { status: 'bypass', key: cacheKey },
      };
      if (!valid) {
        response.error = {
          code: 'OUTPUT_VALIDATION_FAILED',
          category: 'validation',
          message: 'The supplied result did not pass the registered operation contract.',
          retryable: true,
          source: 'gmc.manual-adapter',
        };
      }
    } else {
      const adapters = options.providers ?? [new GeminiProviderAdapter(), new OpenAiProviderAdapter()];
      const routes = routeProviders({
        adapters,
        tier: operation.capabilityTier,
        operationClass: operation.operationClass,
        premiumAllowed: operation.provider.premiumAllowed,
        fallbackAllowed: operation.provider.fallbackAllowed,
      });
      let lastError: unknown;
      let attempts = 0;
      for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
        const route = routes[routeIndex];
        const circuit = circuitState.get(route.adapter.id);
        if (circuit && circuit.openUntil > Date.now()) continue;
        for (let attempt = 1; attempt <= operation.provider.maxAttempts; attempt += 1) {
          attempts += 1;
          response.timing.attempts = attempts;
          try {
            const generated = await route.adapter.generateStructured({
              requestId: randomUUID(),
              operation: operation.id,
              operationClass: operation.operationClass,
              model: route.model,
              systemInstruction: attempt === 1
                ? operation.prompt.systemInstruction
                : `${operation.prompt.systemInstruction}\nThe previous result failed the registered JSON or semantic contract. Return a complete corrected object only.`,
              input: resolved.providerInput,
              outputSchema: operation.outputSchema.schema,
              temperature: operation.provider.temperature,
              maxOutputTokens: operation.provider.maxOutputTokens,
              timeoutMs: operation.provider.timeoutMs,
              signal: options.signal,
            });
            const validation = await runValidation(executionRequest, generated.output, operation);
            if (!validation.every((item) => item.valid)) {
              lastError = new OrchestratorError({
                code: 'OUTPUT_VALIDATION_FAILED',
                category: 'validation',
                message: 'The provider result did not pass the registered output contract.',
                retryable: true,
                status: 502,
                source: 'gmc.output-validator',
                details: validation,
              });
              if (attempt < operation.provider.maxAttempts) continue;
              throw lastError;
            }
            circuitState.delete(route.adapter.id);
            response = {
              ...response,
              status: 'succeeded',
              output: generated.output,
              validation,
              route: {
                ...response.route,
                provider: route.adapter.id,
                model: route.model,
                fallbackUsed: routeIndex > 0,
              },
              usage: priceUsage(generated.usage, route),
            };
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            const normalized = normalizeOrchestratorError(error);
            if (normalized.category === 'provider') {
              const current = circuitState.get(route.adapter.id) ?? { failures: 0, openUntil: 0 };
              current.failures += 1;
              if (current.failures >= 5) current.openUntil = Date.now() + 30_000;
              circuitState.set(route.adapter.id, current);
            }
            if (!normalized.retryable || attempt >= operation.provider.maxAttempts) break;
          }
        }
        if (response.status === 'succeeded') break;
      }
      if (response.status !== 'succeeded') throw lastError ?? new Error('No provider route completed the operation.');
    }
  } catch (error) {
    const normalized = normalizeOrchestratorError(error);
    response.status = normalized.category === 'validation' ? 'review_required' : 'failed';
    if (normalized.category === 'validation' && Array.isArray(normalized.details)) {
      response.validation = normalized.details as LlmValidationResult[];
    }
    response.error = {
      code: normalized.code,
      category: normalized.category,
      message: normalized.message,
      retryable: normalized.retryable,
      source: normalized.source,
      providerStatus: normalized.providerStatus,
    };
  }

  const completedAt = new Date();
  response.timing.completedAt = completedAt.toISOString();
  response.timing.durationMs = completedAt.getTime() - startedAt.getTime();
  try {
    await options.store.complete({
      userId: options.userId,
      request,
      requestFingerprint,
      response,
      cacheKey,
    });
  } catch (error) {
    if (response.status === 'succeeded') {
      const normalized = normalizeOrchestratorError(error);
      response = {
        ...response,
        status: 'failed',
        output: null,
        error: {
          code: 'EXECUTION_PERSISTENCE_FAILED',
          category: 'persistence',
          message: 'The generated proposal could not be stored durably, so it was not returned.',
          retryable: true,
          source: normalized.source,
        },
      };
    }
  }
  return response;
}

export function createUniversalRequest(input: {
  operation: string;
  taskId: string;
  correlationId: string;
  idempotencyKey: string;
  context: Record<string, any>;
  references?: LlmRequestEnvelope['references'];
  constraints?: Record<string, unknown>;
  compatibility?: LlmRequestEnvelope['compatibility'];
}): LlmRequestEnvelope {
  const operation = getOperationDefinition(input.operation);
  return {
    schemaVersion: LLM_REQUEST_SCHEMA_VERSION,
    taskId: input.taskId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    operation: operation.id,
    stage: 'generate',
    operationClass: operation.operationClass,
    authority: { ...operation.authority },
    references: input.references ?? {},
    context: input.context,
    constraints: input.constraints ?? {},
    outputSchema: {
      id: operation.outputSchema.id,
      version: operation.outputSchema.version,
    },
    compatibility: input.compatibility,
  };
}

export async function executeLegacyOperation(input: {
  operation: string;
  userId: string;
  correlationId: string;
  idempotencyKey: string;
  body: unknown;
  sourceRoute: string;
  store?: ExecutionStore;
  providers?: LlmProviderAdapter[];
  runtime?: LlmOperationRuntimeOverride;
}) {
  const response = await executeLegacyOperationResponse(input);
  if (response.status !== 'succeeded') {
    throw new OrchestratorError({
      code: response.error?.code ?? 'ORCHESTRATOR_FAILURE',
      category: response.error?.category ?? 'provider',
      message: response.error?.message ?? 'The AI operation failed.',
      retryable: response.error?.retryable,
      status: response.error?.code === 'PROVIDER_RATE_LIMIT' ? 429 : response.error?.category === 'validation' ? 502 : 503,
      source: response.error?.source,
      providerStatus: response.error?.providerStatus,
    });
  }
  return response.output;
}

export async function executeLegacyOperationResponse(input: {
  operation: string;
  userId: string;
  correlationId: string;
  idempotencyKey: string;
  body: unknown;
  sourceRoute: string;
  store?: ExecutionStore;
  providers?: LlmProviderAdapter[];
  runtime?: LlmOperationRuntimeOverride;
}) {
  const adapterVersion = input.runtime
    ? `1-${createHash('sha256').update(stable(input.runtime)).digest('hex').slice(0, 16)}`
    : '1';
  const request = createUniversalRequest({
    operation: input.operation,
    taskId: input.idempotencyKey,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    context: {
      input: { label: 'user_text', value: input.body },
    },
    compatibility: {
      sourceRoute: input.sourceRoute,
      adapterVersion,
      removeAfterVersion: '2.0.0',
    },
  });
  const response = await executeLlmOperation(request, {
    userId: input.userId,
    store: input.store,
    providers: input.providers,
    runtimeOverride: input.runtime,
  });
  return response;
}

export function memoryStoreForTests() {
  return new MemoryExecutionStore();
}

export async function executeShadowComparison(input: {
  request: LlmRequestEnvelope;
  baselineOutput: unknown;
  options: ExecuteOptions;
}) {
  const shadowRequest: LlmRequestEnvelope = {
    ...structuredClone(input.request),
    taskId: `${input.request.taskId}:shadow`,
    idempotencyKey: `${input.request.idempotencyKey}:shadow:${OPERATION_REGISTRY_VERSION}`,
    stage: 'shadow',
  };
  const response = await executeLlmOperation(shadowRequest, { ...input.options, shadow: true });
  const baseline = stable(input.baselineOutput);
  const candidate = stable(response.output);
  const baselineObject = input.baselineOutput && typeof input.baselineOutput === 'object' && !Array.isArray(input.baselineOutput)
    ? input.baselineOutput as Record<string, unknown>
    : {};
  const candidateObject = response.output && typeof response.output === 'object' && !Array.isArray(response.output)
    ? response.output as Record<string, unknown>
    : {};
  const keys = [...new Set([...Object.keys(baselineObject), ...Object.keys(candidateObject)])].sort();
  return {
    schemaVersion: 'gma-gmc.llm-shadow-comparison/1',
    operation: input.request.operation,
    taskId: input.request.taskId,
    correlationId: input.request.correlationId,
    status: response.status,
    equivalent: baseline === candidate,
    changedTopLevelKeys: keys.filter((key) => stable(baselineObject[key]) !== stable(candidateObject[key])),
    validation: response.validation,
    route: response.route,
    usage: response.usage,
    timing: response.timing,
    error: response.error,
  };
}
