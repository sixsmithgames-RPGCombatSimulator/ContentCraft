/**
 * AI routes: Gemini provider-first stage automation backend proxy
 * Keeps Gemini API key server-side only and returns structured responses for stage runs.
 */

import { Router, type Request, type Response as ExpressResponse } from 'express';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/** Allowed error types for the AI proxy */
type AiErrorType =
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'SCHEMA_MISMATCH'
  | 'FORBIDDEN_PATH'
  | 'PAYLOAD_TOO_LARGE'
  | 'BUDGET_EXCEEDED'
  | 'ABORTED';

interface GeminiRequestBody {
  projectId: string;
  stageId: string;
  stageRunId: string;
  prompt: string;
  schemaVersion: string;
  responseFormat?: string;
  clientContext?: {
    appVersion?: string;
    stageKey?: string;
    generatorType?: string;
    userSelectedMode?: string;
  };
}

interface StageRegistryEntry {
  allowedPaths: string[];
  schemaVersion: string;
  schema: { properties?: Record<string, unknown> };
}

/** Ensure patch only targets the provided stageId and is an object */
function validateScope(stageId: string, patch: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== stageId) {
    return { ok: false, message: `Patch must contain only the current stageId (${stageId}).` };
  }
  const payload = patch[stageId];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Stage payload must be an object.' };
  }

  // Basic object validation using Ajv (no schema details yet)
  const validate = ajv.compile({ type: 'object' });
  const isValid = validate(payload);
  if (!isValid) {
    return { ok: false, message: 'Stage payload failed object validation.' };
  }
  return { ok: true };
}

interface GeminiSuccessResponse {
  ok: true;
  provider: 'gemini';
  model: string;
  requestId: string;
  stageRunId: string;
  rawText: string;
  jsonPatch?: Record<string, unknown>;
  parse: {
    foundJsonBlock: boolean;
    parseWarnings: string[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  safety: {
    patchSizeBytes: number;
    appliedPathsCandidateCount: number;
  };
}

interface GeminiFailureResponse {
  ok: false;
  requestId: string;
  stageRunId: string;
  error: {
    type: AiErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const MAX_PATCH_BYTES = 200_000;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 2;
const MIN_REQUEST_SPACING_MS = 2000;
const aiRouter = Router();
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

/** Load and cache per-generator schema for allowlist and validation */
const schemaCache: Record<string, StageRegistryEntry | undefined> = {};
const validatorCache: Record<string, ValidateFunction | undefined> = {};
const idempotencyCache: Map<
  string,
  { status: number; payload: GeminiSuccessResponse | GeminiFailureResponse; expiresAt: number }
> = new Map();
const lastRequestByProject: Map<string, number> = new Map();

type GeminiHttpResponse = {
  ok: boolean;
  status: number;
  headers?: { get?: (name: string) => string | null };
  json: () => Promise<unknown>;
};

let lastRateLimitAt = 0;

function getCachedResponse(key: string): { status: number; payload: GeminiSuccessResponse | GeminiFailureResponse } | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return { status: entry.status, payload: entry.payload };
}

function setCachedResponse(key: string, status: number, payload: GeminiSuccessResponse | GeminiFailureResponse): void {
  idempotencyCache.set(key, { status, payload, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

function loadSchemaForGenerator(generatorType: string): StageRegistryEntry | null {
  if (schemaCache[generatorType]) return schemaCache[generatorType] || null;
  try {
    const raw = readFileSync(path.join(process.cwd(), `schema/${generatorType}/v1.1-client.json`), 'utf-8');
    const schema = JSON.parse(raw);
    const properties = schema.properties || {};
    
    // Inject generic workflow fields that are used during generation but stripped before final save
    properties['keywords'] = { type: 'array', items: { type: 'string' } };
    properties['retrieval_hints'] = { type: 'object' };
    properties['_meta'] = { type: 'object' };
    schema.properties = properties; // Ensure they are on the actual schema object

    const allowedPaths = Object.keys(properties);
    const entry: StageRegistryEntry = {
      allowedPaths,
      schemaVersion: 'v1.1-client',
      schema,
    };
    schemaCache[generatorType] = entry;
    return entry;
  } catch (err) {
    console.error('[AI][Gemini] Failed to load schema for generator', generatorType, err);
    schemaCache[generatorType] = undefined;
    return null;
  }
}

function getValidatorForGenerator(generatorType: string, entry: StageRegistryEntry): ValidateFunction | null {
  if (validatorCache[generatorType]) return validatorCache[generatorType] || null;

  // Build a permissive subschema: only known properties, none required, no additionalProperties
  const properties = entry.schema.properties || {};
  const subschema = {
    type: 'object',
    properties,
    additionalProperties: false,
  } as const;

  try {
    const validateFn = ajv.compile(subschema);
    validatorCache[generatorType] = validateFn;
    return validateFn;
  } catch (err) {
    console.error('[AI][Gemini] Failed to compile validator for generator', generatorType, err);
    validatorCache[generatorType] = undefined;
    return null;
  }
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Validate the incoming request body and return a typed object or an error string.
 */
function parseRequestBody(body: unknown): { valid: true; data: GeminiRequestBody } | { valid: false; message: string } {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request payload' };
  const {
    projectId,
    stageId,
    stageRunId,
    prompt,
    schemaVersion,
    responseFormat,
    clientContext,
  } = body as Record<string, unknown>;

  if (typeof projectId !== 'string' || projectId.trim() === '') return { valid: false, message: 'projectId is required' };
  if (typeof stageId !== 'string' || stageId.trim() === '') return { valid: false, message: 'stageId is required' };
  if (typeof stageRunId !== 'string' || stageRunId.trim() === '') return { valid: false, message: 'stageRunId is required' };
  if (typeof prompt !== 'string' || prompt.trim() === '') return { valid: false, message: 'prompt is required' };
  if (typeof schemaVersion !== 'string' || schemaVersion.trim() === '') return { valid: false, message: 'schemaVersion is required' };

  const ctx = (clientContext && typeof clientContext === 'object' ? clientContext : {}) as GeminiRequestBody['clientContext'];

  return {
    valid: true,
    data: {
      projectId,
      stageId,
      stageRunId,
      prompt,
      schemaVersion,
      responseFormat: typeof responseFormat === 'string' ? responseFormat : 'json_patch_preferred',
      clientContext: ctx,
    },
  };
}

/** Find the first balanced top-level JSON object in text. */
function findBalancedJson(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
      if (depth < 0) break;
    }
  }
  return null;
}

/** Extract JSON patch from a Gemini response text. */
function extractJsonPatch(rawText: string): { ok: true; patch?: Record<string, unknown>; foundJsonBlock: boolean; warnings: string[] } | { ok: false; message: string } {
  const warnings: string[] = [];
  const fencedMatch = rawText.match(/```json\s*\n?([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : findBalancedJson(rawText);
  const foundJsonBlock = Boolean(fencedMatch);

  if (!candidate) {
    return { ok: false, message: 'No JSON object found in response.' };
  }

  if (candidate.length > MAX_PATCH_BYTES) {
    return { ok: false, message: `Patch exceeds size limit (${MAX_PATCH_BYTES} bytes).` };
  }

  try {
    const parsed = JSON.parse(candidate);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'JSON patch must be an object.' };
    }

    // Simple forbidden keys guardrail
    const forbiddenKeys = ['projectId', 'stageId', 'stageRunId'];
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        console.warn(`[AI][Gemini] Stripping forbidden root field '${key}' from patch`);
        delete (parsed as Record<string, unknown>)[key];
      }
    }

    return { ok: true, patch: parsed as Record<string, unknown>, foundJsonBlock, warnings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, message: `Invalid JSON: ${message}` };
  }
}

/** Map HTTP status / provider errors to structured error codes. */
function mapError(status: number, retryAfterMsFromHeader?: number): { type: AiErrorType; retryable: boolean; retryAfterMs?: number } {
  if (status === 429) {
    return {
      type: 'RATE_LIMIT',
      retryable: true,
      retryAfterMs: retryAfterMsFromHeader ?? RATE_LIMIT_COOLDOWN_MS,
    };
  }
  if (status === 408 || status === 504) return { type: 'TIMEOUT', retryable: true };
  if (status >= 500) return { type: 'PROVIDER_ERROR', retryable: true };
  return { type: 'PROVIDER_ERROR', retryable: false };
}

function shouldShortCircuitRateLimit(): boolean {
  if (!lastRateLimitAt) return false;
  return Date.now() - lastRateLimitAt < RATE_LIMIT_COOLDOWN_MS;
}

function markRateLimit(): void {
  lastRateLimitAt = Date.now();
}

function buildIdempotencyKey(body: GeminiRequestBody): string {
  return `${body.projectId}:${body.stageId}:${body.stageRunId}`;
}

/**
 * POST /api/ai/gemini/generate
 * Proxies stage prompt to Gemini, extracts JSON patch, and returns structured results.
 * This route keeps the Gemini key server-side and never exposes it to clients.
 */
aiRouter.post('/gemini/generate', async (req: Request, res: ExpressResponse) => {
  const parsed = parseRequestBody(req.body);
  if (!parsed.valid) {
    const failure = parsed as { valid: false; message: string };
    return res.status(400).json({
      ok: false,
      requestId: 'n/a',
      stageRunId: 'n/a',
      error: { type: 'INVALID_RESPONSE', message: failure.message, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  const body = parsed.data;
  const requestId = randomUUID();

  const generatorType = body.clientContext?.generatorType;
  if (!generatorType || typeof generatorType !== 'string') {
    return res.status(400).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'SCHEMA_MISMATCH', message: 'generatorType is required.', retryable: false },
    } satisfies GeminiFailureResponse);
  }

  const registry = loadSchemaForGenerator(generatorType);
  if (!registry) {
    return res.status(500).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: `Schema not available for generator ${generatorType}.`, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (body.schemaVersion !== registry.schemaVersion) {
    return res.status(400).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'SCHEMA_MISMATCH', message: `Expected schemaVersion ${registry.schemaVersion}`, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (shouldShortCircuitRateLimit()) {
    return res.status(429).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: {
        type: 'RATE_LIMIT',
        message: 'Gemini temporarily rate limited. Please retry shortly.',
        retryable: true,
        retryAfterMs: RATE_LIMIT_COOLDOWN_MS,
      },
    } satisfies GeminiFailureResponse);
  }

  // Per-project throttle to prevent bursts (configurable spacing)
  {
    const now = Date.now();
    const lastProjectRequest = lastRequestByProject.get(body.projectId);
    if (lastProjectRequest && now - lastProjectRequest < MIN_REQUEST_SPACING_MS) {
      const retryAfterMs = MIN_REQUEST_SPACING_MS - (now - lastProjectRequest) + 100; // small cushion
      return res.status(429).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: {
          type: 'RATE_LIMIT',
          message: 'Too many requests in a short window. Please retry shortly.',
          retryable: true,
          retryAfterMs,
        },
      } satisfies GeminiFailureResponse);
    }
    lastRequestByProject.set(body.projectId, now);
  }

  const idempotencyKey = buildIdempotencyKey(body);
  const cached = getCachedResponse(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.payload);
  }

  const validate = getValidatorForGenerator(generatorType, registry);
  if (!validate) {
    return res.status(500).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: 'Validator could not be created.', retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: 'Gemini API key not configured on server.', retryable: false },
    } satisfies GeminiFailureResponse);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    let geminiResponse: GeminiHttpResponse | null = null;
    let lastError: GeminiFailureResponse | null = null;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      geminiResponse = (await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: body.prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        }
      )) as unknown as GeminiHttpResponse;

      if (geminiResponse && geminiResponse.ok) break;

      if (!geminiResponse) {
        const payload: GeminiFailureResponse = {
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'PROVIDER_ERROR', message: 'Gemini response missing.', retryable: true },
        };
        setCachedResponse(idempotencyKey, 502, payload);
        return res.status(502).json(payload);
      }

      const retryAfterHeader = geminiResponse.headers?.get?.('retry-after');
      const retryAfterMsFromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      const { type, retryable, retryAfterMs } = mapError(geminiResponse.status, retryAfterMsFromHeader);
      if (geminiResponse.status === 429) {
        // Do not cache rate-limit failures; log context for debugging
        console.warn('[AI][Gemini] Rate limited', {
          requestId,
          stageRunId: body.stageRunId,
          stageId: body.stageId,
          generatorType,
          retryAfterMs,
        });
        markRateLimit();
      }
      const failurePayload: GeminiFailureResponse = {
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: {
          type,
          message: `Gemini request failed (${geminiResponse.status})`,
          retryable,
          retryAfterMs,
        },
      } satisfies GeminiFailureResponse;
      if (geminiResponse.status !== 429) {
        setCachedResponse(idempotencyKey, geminiResponse.status, failurePayload);
      }
      return res.status(geminiResponse.status).json(failurePayload);
    }

    if (!geminiResponse || !geminiResponse.ok) {
      const status = lastError ? 502 : 500;
      const payload =
        lastError ||
        ({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'PROVIDER_ERROR', message: 'Gemini request failed.', retryable: true },
        } satisfies GeminiFailureResponse);
      setCachedResponse(idempotencyKey, status, payload);
      return res.status(status).json(payload);
    }

    const data = (await geminiResponse.json()) as GeminiApiResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!rawText) {
      return res.status(502).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: { type: 'INVALID_RESPONSE', message: 'Empty response from Gemini.', retryable: false },
      } satisfies GeminiFailureResponse);
    }

    const extraction = extractJsonPatch(rawText);
    if (!extraction.ok) {
      const failure = extraction as { ok: false; message: string };
      return res.status(422).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: { type: 'INVALID_RESPONSE', message: failure.message, retryable: false },
      } satisfies GeminiFailureResponse);
    }

    if (extraction.patch) {
      // Pre-validation cleanup: ensure only the requested stageId is present at the top level
      if (extraction.patch[body.stageId]) {
        for (const key of Object.keys(extraction.patch)) {
          if (key !== body.stageId) {
            console.warn(`[AI][Gemini] Stripping top-level disallowed field '${key}' (expected only '${body.stageId}')`);
            delete extraction.patch[key];
          }
        }
      }

      const scopeResult = validateScope(body.stageId, extraction.patch);
      if (!scopeResult.ok) {
        const failure = scopeResult as { ok: false; message: string };
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'FORBIDDEN_PATH', message: failure.message, retryable: false },
        } satisfies GeminiFailureResponse);
      }

      const payload = extraction.patch[body.stageId] as Record<string, unknown>;
      // Collect the keys of the payload for later processing (coercion and stripping).
      const payloadKeys = Object.keys(payload || {});
      // Attempt to coerce any stringified JSON values into proper objects/arrays.
      // This handles cases where the LLM returns a field as a JSON string (e.g., "{\"traits\":[]}")
      // rather than the expected object/array. We only replace the value when parsing succeeds
      // and yields a non‑primitive (object or array). Otherwise we leave the original value.
      for (const key of payloadKeys) {
        const value = (payload as Record<string, unknown>)[key];
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
              (payload as Record<string, unknown>)[key] = parsed;
            }
          } catch (_) {
            // Not valid JSON – keep the original string value.
          }
        }
      }

      // NOTE: `payload` is typed as `Record<string, unknown>`; direct property access (`payload.personality`) is not allowed by TypeScript.
      // We therefore use bracket notation with a cast to `any` to safely coerce and delete the field when needed.
      // This resolves the lint error "Property 'personality' does not exist on type 'never'".
      // Coerce personality field if it's a string (LLM may output as JSON string)
      if (typeof (payload as any)['personality'] === 'string') {
        try {
          const parsed = JSON.parse((payload as any)['personality']);
          if (typeof parsed === 'object' && parsed !== null) {
            (payload as any)['personality'] = parsed;
          } else {
            console.warn('[AI][Gemini] personality field is not an object after parsing, removing');
            delete (payload as any)['personality'];
          }
        } catch (e) {
          console.warn('[AI][Gemini] Failed to parse personality string, removing field');
          delete (payload as any)['personality'];
        }
      }
      for (const key of payloadKeys) {
        if (key !== '_meta' && !registry.allowedPaths.includes(key)) {
          console.warn(`[AI][Gemini] Stripping disallowed field '${key}' from stage '${body.stageId}'`);
          delete payload[key];

    // NOTE: `payload` is typed as `Record<string, unknown>`; direct property access (`payload.personality`) is not allowed by TypeScript.
    // We therefore use bracket notation with a cast to `any` to safely coerce and delete the field when needed.
    // This resolves the lint error "Property 'personality' does not exist on type 'never'".
    // Coerce personality field if it's a string (LLM may output as JSON string)
    if (typeof (payload as any)['personality'] === 'string') {
      try {
        const parsed = JSON.parse((payload as any)['personality']);
        if (typeof parsed === 'object' && parsed !== null) {
          (payload as any)['personality'] = parsed;
        } else {
          console.warn('[AI][Gemini] personality field is not an object after parsing, removing');
          delete (payload as any)['personality'];
        }
      } catch (e) {
        console.warn('[AI][Gemini] Failed to parse personality string, removing field');
        delete (payload as any)['personality'];
      }
    }

    const isValid = validate(payload);
    if (!isValid) {
      // If validation fails (including missing required fields), return error to force AI to provide required data.
      const msgs = (validate.errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
      return res.status(422).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: { type: 'INVALID_RESPONSE', message: msgs || 'Schema validation failed.', retryable: false },
      } satisfies GeminiFailureResponse);
    }

    for (const key of payloadKeys) {
      if (key !== '_meta' && !registry.allowedPaths.includes(key)) {
        console.warn(`[AI][Gemini] Stripping disallowed field '${key}' from stage '${body.stageId}'`);
        delete payload[key];
      }
    }

    const successPayload: GeminiSuccessResponse = {
      ok: true,
      provider: 'gemini',
      model: GEMINI_MODEL,
      requestId,
      stageRunId: body.stageRunId,
      rawText,
      jsonPatch: extraction.patch,
      parse: {
        foundJsonBlock: extraction.foundJsonBlock,
        parseWarnings: extraction.warnings,
      },
      usage: {
        inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
      },
      safety: {
        patchSizeBytes: extraction.patch ? JSON.stringify(extraction.patch).length : 0,
        appliedPathsCandidateCount: extraction.patch ? Object.keys(extraction.patch).length : 0,
      },
    } satisfies GeminiSuccessResponse;

    setCachedResponse(idempotencyKey, 200, successPayload);
    return res.json(successPayload);
  } finally {
    clearTimeout(timeout);
  }
});

export { aiRouter };