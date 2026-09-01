import { OrchestratorError } from '../errors.js';
import type {
  LlmProviderAdapter,
  ProviderStructuredRequest,
  ProviderStructuredResult,
} from '../provider.js';

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

export async function requestGeminiRaw(input: {
  model: string;
  apiKey: string;
  body: string;
  signal?: AbortSignal;
}) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: input.signal,
      body: input.body,
    },
  );
}

function providerMessage(payload: any, fallback: string) {
  return String(payload?.error?.message ?? payload?.message ?? fallback);
}

function providerSpendCap(message: string) {
  return /\b(?:monthly|project(?:-level)?|billing(?: account)?)\b[^.\n]{0,100}\b(?:spend(?:ing)?|budget|quota|cap|limit)\b|\b(?:spend(?:ing)?|budget) cap\b/i.test(message);
}

function providerDiagnosticFields(payload: any, message: string) {
  const fields = new Set<string>();
  const accept = (value: unknown) => {
    const field = String(value ?? '').trim();
    if (field && field.length <= 240 && /^[A-Za-z0-9_$.'\[\]-]+$/.test(field)) fields.add(field);
  };
  for (const detail of Array.isArray(payload?.error?.details) ? payload.error.details : []) {
    for (const violation of Array.isArray(detail?.fieldViolations) ? detail.fieldViolations : []) {
      accept(violation?.field);
    }
  }
  for (const pattern of [
    /Unknown name "([A-Za-z0-9_$-]{1,80})"/g,
    /(?:at|field) '([A-Za-z0-9_$.'\[\]-]{1,240})'/g,
  ]) {
    for (const match of message.matchAll(pattern)) accept(match[1]);
  }
  return [...fields].slice(0, 8);
}

function supportsSamplingTemperature(model: string) {
  return !/^gemini-(?:3\.[5-9]|[4-9]\.)/i.test(model);
}

const GEMINI_RESPONSE_JSON_SCHEMA_KEYWORDS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);
const GEMINI_RESPONSE_JSON_SCHEMA_TARGET_BYTES = 4_096;
const GEMINI_RESPONSE_JSON_SCHEMA_DEPTH_CANDIDATES = [6, 5, 4, 3, 2] as const;

function projectedConst(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' || typeof value === 'number') return { enum: [value] };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (value === null) return { type: 'null' };
  return {};
}

function minimalGeminiSchemaNode(source: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = Object.prototype.hasOwnProperty.call(source, 'const')
    ? projectedConst(source.const)
    : {};
  for (const key of ['$ref', 'type', 'format', 'enum'] as const) {
    if (Object.prototype.hasOwnProperty.call(source, key)) projected[key] = source[key];
  }
  if (source.type === 'object') projected.additionalProperties = true;
  if (source.type === 'array' && source.items && typeof source.items === 'object') {
    projected.items = minimalGeminiSchemaNode(source.items as Record<string, unknown>);
  }
  if (Array.isArray(source.anyOf)) {
    projected.anyOf = source.anyOf.map((entry) => entry && typeof entry === 'object'
      ? minimalGeminiSchemaNode(entry as Record<string, unknown>)
      : entry);
  }
  if (Array.isArray(source.oneOf)) {
    projected.oneOf = source.oneOf.map((entry) => entry && typeof entry === 'object'
      ? minimalGeminiSchemaNode(entry as Record<string, unknown>)
      : entry);
  }
  return projected;
}

/**
 * Gemini accepts only a documented subset of JSON Schema and can return an
 * opaque provider 500 for unsupported or over-constrained response schemas.
 * Keep the complete logical schema for GMC's deterministic post-generation
 * validation; this projection is only the provider transport hint.
 */
function projectGeminiSchemaNode(schema: unknown, depth: number, maximumDepth: number): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => projectGeminiSchemaNode(entry, depth + 1, maximumDepth));
  }
  if (!schema || typeof schema !== 'object') return schema;

  const source = schema as Record<string, unknown>;
  const projected: Record<string, unknown> = Object.prototype.hasOwnProperty.call(source, 'const')
    ? projectedConst(source.const)
    : {};
  if (depth >= maximumDepth) return minimalGeminiSchemaNode(source);
  for (const [key, value] of Object.entries(source)) {
    if (key === 'const' || !GEMINI_RESPONSE_JSON_SCHEMA_KEYWORDS.has(key)) continue;
    if ((key === 'properties' || key === '$defs') && value && typeof value === 'object' && !Array.isArray(value)) {
      projected[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([propertyName, propertySchema]) => [
            propertyName,
            projectGeminiSchemaNode(propertySchema, depth + 1, maximumDepth),
          ]),
      );
      continue;
    }
    projected[key] = projectGeminiSchemaNode(value, depth + 1, maximumDepth);
  }
  return projected;
}

export function projectGeminiResponseJsonSchema(schema: unknown): unknown {
  const completeProjection = projectGeminiSchemaNode(schema, 0, Number.POSITIVE_INFINITY);
  if (Buffer.byteLength(JSON.stringify(completeProjection), 'utf8') <= GEMINI_RESPONSE_JSON_SCHEMA_TARGET_BYTES) {
    return completeProjection;
  }
  for (const maximumDepth of GEMINI_RESPONSE_JSON_SCHEMA_DEPTH_CANDIDATES) {
    const candidate = projectGeminiSchemaNode(schema, 0, maximumDepth);
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= GEMINI_RESPONSE_JSON_SCHEMA_TARGET_BYTES) {
      return candidate;
    }
  }
  return projectGeminiSchemaNode(schema, 0, 2);
}

export class GeminiProviderAdapter implements LlmProviderAdapter {
  readonly id = 'gemini';
  readonly version = '3';

  isAvailable() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new OrchestratorError({
        code: 'PROVIDER_UNAVAILABLE',
        category: 'provider',
        message: 'The configured AI provider is unavailable.',
        retryable: true,
        status: 503,
        source: 'provider.gemini',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const generationConfig: Record<string, unknown> = {
        responseMimeType: 'application/json',
        responseJsonSchema: projectGeminiResponseJsonSchema(request.outputSchema),
        maxOutputTokens: request.maxOutputTokens,
      };
      if (request.temperature !== undefined && supportsSamplingTemperature(request.model)) {
        generationConfig.temperature = request.temperature;
      }
      if (request.thinkingLevel && /^gemini-3\./i.test(request.model)) {
        generationConfig.thinkingConfig = { thinkingLevel: request.thinkingLevel };
      }
      const response = await requestGeminiRaw({
        model: request.model,
        apiKey,
        signal: controller.signal,
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.input) }] }],
            generationConfig,
          }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = providerMessage(payload, `Provider request failed (${response.status}).`);
        const spendCap = response.status === 429 && providerSpendCap(message);
        console.warn('[LLM][Gemini] Structured provider request failed', {
          operation: request.operation,
          model: request.model,
          providerStatus: response.status,
          providerCode: String(payload?.error?.status ?? payload?.status ?? 'unknown'),
          providerFields: providerDiagnosticFields(payload, message),
        });
        throw new OrchestratorError({
          code: spendCap ? 'PROVIDER_SPEND_CAP_EXCEEDED' : (response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_HTTP_ERROR'),
          category: 'provider',
          message,
          retryable: !spendCap && (response.status === 408 || response.status === 429 || response.status >= 500),
          status: response.status === 429 ? 429 : 502,
          source: 'provider.gemini',
          providerStatus: response.status,
        });
      }
      const payload = await response.json() as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
      if (!text) {
        throw new OrchestratorError({
          code: 'PROVIDER_EMPTY_RESPONSE',
          category: 'provider',
          message: 'The provider returned no structured content.',
          retryable: true,
          status: 502,
          source: 'provider.gemini',
        });
      }
      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch {
        const truncated = payload.candidates?.[0]?.finishReason === 'MAX_TOKENS';
        throw new OrchestratorError({
          code: truncated ? 'PROVIDER_OUTPUT_TRUNCATED' : 'PROVIDER_INVALID_JSON',
          category: 'validation',
          message: truncated
            ? 'The provider reached its output limit before completing the structured result.'
            : 'The provider returned invalid JSON.',
          retryable: true,
          status: 502,
          source: 'provider.gemini',
        });
      }
      const usage = payload.usageMetadata;
      return {
        output,
        rawText: text,
        usage: {
          inputTokens: Number.isFinite(usage?.promptTokenCount) ? Number(usage?.promptTokenCount) : null,
          outputTokens: Number.isFinite(usage?.candidatesTokenCount) ? Number(usage?.candidatesTokenCount) : null,
          reasoningTokens: Number.isFinite(usage?.thoughtsTokenCount) ? Number(usage?.thoughtsTokenCount) : null,
          cachedInputTokens: Number.isFinite(usage?.cachedContentTokenCount) ? Number(usage?.cachedContentTokenCount) : null,
          source: usage ? 'provider' : 'unavailable',
          priceVersion: null,
          costUsd: null,
        },
      };
    } catch (error) {
      if (error instanceof OrchestratorError) throw error;
      if ((error as any)?.name === 'AbortError') {
        throw new OrchestratorError({
          code: 'PROVIDER_TIMEOUT',
          category: 'provider',
          message: 'The provider request timed out.',
          retryable: true,
          status: 504,
          source: 'provider.gemini',
        });
      }
      throw new OrchestratorError({
        code: 'PROVIDER_TRANSPORT_ERROR',
        category: 'provider',
        message: error instanceof Error ? error.message : 'The provider transport failed.',
        retryable: true,
        status: 502,
        source: 'provider.gemini',
      });
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }
}
