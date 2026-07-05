import { randomUUID } from 'node:crypto';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const USAGE_LOG_LIMIT = 500;

type GeminiUsageStatus = 'ok' | 'warning' | 'blocked';

type GeminiUsageEvent = {
  id: string;
  timestamp: string;
  timestampMs: number;
  model: string;
  operation: string;
  attempt: number;
  status: 'success' | 'error' | 'blocked';
  httpStatus: number | null;
  durationMs: number;
  inputBytes: number;
  outputBytes: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  errorCode?: string;
  errorMessage?: string;
};

const geminiUsageLog: GeminiUsageEvent[] = [];

function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function envInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function estimateTokens(bytes: number) {
  return Math.max(0, Math.ceil(bytes / 4));
}

function byteLength(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

function usageWindowMs() {
  return envInteger('GEMINI_TRAFFIC_WINDOW_MS', 5 * 60_000);
}

function warningLimit() {
  return envInteger('GEMINI_TRAFFIC_WARNING_REQUESTS', 8);
}

function guardLimit() {
  return envInteger('GEMINI_TRAFFIC_GUARD_REQUESTS', 16);
}

function trimUsageLog() {
  while (geminiUsageLog.length > USAGE_LOG_LIMIT) geminiUsageLog.shift();
}

function recentAttemptEvents(now = Date.now()) {
  const windowMs = usageWindowMs();
  return geminiUsageLog.filter((event) => event.status !== 'blocked' && now - event.timestampMs <= windowMs);
}

function trafficSnapshot(now = Date.now()) {
  const recent = recentAttemptEvents(now);
  const warn = warningLimit();
  const guard = guardLimit();
  const status: GeminiUsageStatus = guard > 0 && recent.length >= guard
    ? 'blocked'
    : (warn > 0 && recent.length >= warn ? 'warning' : 'ok');
  return {
    status,
    requestCount: recent.length,
    warningLimit: warn,
    guardLimit: guard,
    windowMs: usageWindowMs(),
    oldestRequestAt: recent[0]?.timestamp ?? null,
    newestRequestAt: recent.at(-1)?.timestamp ?? null,
    manualFallbackAvailable: status !== 'ok',
  };
}

function totalUsage() {
  const attempts = geminiUsageLog.filter((event) => event.status !== 'blocked');
  return attempts.reduce((totals, event) => {
    totals.requests += 1;
    totals.inputBytes += event.inputBytes;
    totals.outputBytes += event.outputBytes;
    totals.estimatedInputTokens += event.estimatedInputTokens;
    totals.estimatedOutputTokens += event.estimatedOutputTokens;
    if (event.status === 'success') totals.successes += 1;
    else totals.errors += 1;
    return totals;
  }, {
    requests: 0,
    successes: 0,
    errors: 0,
    inputBytes: 0,
    outputBytes: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
  });
}

function recordUsage(event: Omit<GeminiUsageEvent, 'id' | 'timestamp' | 'timestampMs' | 'estimatedInputTokens' | 'estimatedOutputTokens'>) {
  const timestampMs = Date.now();
  const fullEvent: GeminiUsageEvent = {
    id: randomUUID(),
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    estimatedInputTokens: estimateTokens(event.inputBytes),
    estimatedOutputTokens: estimateTokens(event.outputBytes),
    ...event,
  };
  geminiUsageLog.push(fullEvent);
  trimUsageLog();
  return fullEvent;
}

function providerErrorDetails(body: any) {
  const error = body?.error && typeof body.error === 'object' ? body.error : body;
  return {
    code: error?.code ?? null,
    status: error?.status ?? null,
    message: String(error?.message ?? '').slice(0, 1000),
    details: Array.isArray(error?.details) ? error.details.slice(0, 5) : [],
  };
}

function highTrafficError(operation: string, inputBytes: number) {
  const snapshot = trafficSnapshot();
  recordUsage({
    model: MODEL,
    operation,
    attempt: 0,
    status: 'blocked',
    httpStatus: null,
    durationMs: 0,
    inputBytes,
    outputBytes: 0,
    errorCode: 'GMC_HIGH_TRAFFIC_GUARD',
    errorMessage: `Gemini traffic guard blocked ${snapshot.requestCount} requests in ${Math.round(snapshot.windowMs / 1000)} seconds.`,
  });
  throw Object.assign(new Error(`Gemini traffic guard paused AI calls after ${snapshot.requestCount} requests in ${Math.round(snapshot.windowMs / 60000)} minutes. Use manual copy/paste mode or wait before retrying.`), {
    status: 429,
    code: 'GMC_HIGH_TRAFFIC_GUARD',
    details: {
      usage: trafficSnapshot(),
      manualFallback: {
        available: true,
        reason: 'high_gemini_traffic',
        instructions: 'Copy the manual prompt from GMA into a web LLM, then paste the structured result back into the session.',
      },
    },
  });
}

function assertTrafficAllowed(operation: string, inputBytes: number) {
  const snapshot = trafficSnapshot();
  if (snapshot.guardLimit > 0 && snapshot.requestCount >= snapshot.guardLimit) {
    highTrafficError(operation, inputBytes);
  }
  return snapshot;
}

export function getGeminiUsageSnapshot() {
  const totals = totalUsage();
  return {
    model: MODEL,
    traffic: trafficSnapshot(),
    totals,
    recent: geminiUsageLog.slice(-25).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      operation: event.operation,
      attempt: event.attempt,
      status: event.status,
      httpStatus: event.httpStatus,
      durationMs: event.durationMs,
      estimatedInputTokens: event.estimatedInputTokens,
      estimatedOutputTokens: event.estimatedOutputTokens,
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
    })),
    manualFallback: {
      available: trafficSnapshot().status !== 'ok',
      reason: trafficSnapshot().status,
    },
  };
}

export function resetGeminiUsageForTests() {
  geminiUsageLog.splice(0, geminiUsageLog.length);
}

export async function generateStructuredJson(systemInstruction: string, input: unknown, options: { operation?: string; correlationId?: string } = {}): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw Object.assign(new Error('Gemini API key is not configured.'), { status: 503, code: 'GMC_UNAVAILABLE' });
  const operation = options.operation || 'structured-json';
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const inputPayload = {
      system_instruction: { parts: [{ text: `${systemInstruction}\nReturn exactly one complete valid JSON object. Do not use markdown fences.${attempt ? ' This is a retry: use the simplest valid structure that satisfies every required key.' : ''}` }] },
      contents: [{ parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { temperature: attempt ? 0.2 : 0.6, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    };
    const serializedPayload = JSON.stringify(inputPayload);
    const inputBytes = byteLength(serializedPayload);
    assertTrafficAllowed(operation, inputBytes);
    const startedAt = Date.now();
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: serializedPayload,
      });
      const bodyText = await response.text();
      let body: any = null;
      try { body = bodyText ? JSON.parse(bodyText) : null; }
      catch { body = { rawText: bodyText.slice(0, 1000) }; }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const provider = providerErrorDetails(body);
        const message = provider.message || `Gemini returned ${response.status}.`;
        const error = Object.assign(new Error(message), {
          status: retryable ? 503 : 502,
          code: retryable ? 'GMC_TEMPORARILY_UNAVAILABLE' : 'GMC_UNAVAILABLE',
          details: { provider, usage: trafficSnapshot() },
        });
        recordUsage({
          model: MODEL, operation, attempt: attempt + 1, status: 'error',
          httpStatus: response.status, durationMs: Date.now() - startedAt,
          inputBytes, outputBytes: byteLength(bodyText),
          errorCode: provider.status || String(provider.code ?? response.status),
          errorMessage: message.slice(0, 500),
        });
        if (retryable && attempt === 0) { lastError = error; continue; }
        throw error;
      }
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        recordUsage({
          model: MODEL, operation, attempt: attempt + 1, status: 'error',
          httpStatus: response.status, durationMs: Date.now() - startedAt,
          inputBytes, outputBytes: byteLength(bodyText),
          errorCode: 'STRUCTURED_OUTPUT_INVALID',
          errorMessage: 'Gemini returned no structured content.',
        });
        if (attempt === 0) { lastError = Object.assign(new Error('Gemini returned no structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' }); continue; }
        throw Object.assign(new Error('Gemini returned no structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
      try {
        const parsed = parseJson(text);
        recordUsage({
          model: MODEL, operation, attempt: attempt + 1, status: 'success',
          httpStatus: response.status, durationMs: Date.now() - startedAt,
          inputBytes, outputBytes: byteLength(text),
        });
        return parsed;
      }
      catch {
        recordUsage({
          model: MODEL, operation, attempt: attempt + 1, status: 'error',
          httpStatus: response.status, durationMs: Date.now() - startedAt,
          inputBytes, outputBytes: byteLength(text),
          errorCode: 'STRUCTURED_OUTPUT_INVALID',
          errorMessage: 'Gemini returned invalid JSON.',
        });
        if (attempt === 0) { lastError = Object.assign(new Error('Gemini returned invalid JSON.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' }); continue; }
        throw Object.assign(new Error('Gemini returned invalid JSON after a constrained retry.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
      }
    } catch (error: any) {
      const transportFailure = !error?.code && error?.name !== 'AbortError';
      const transient = error?.name === 'AbortError' || error?.code === 'GMC_TEMPORARILY_UNAVAILABLE' || transportFailure;
      if (error?.name === 'AbortError' || transportFailure) {
        recordUsage({
          model: MODEL, operation, attempt: attempt + 1, status: 'error',
          httpStatus: null, durationMs: Date.now() - startedAt,
          inputBytes, outputBytes: 0,
          errorCode: error?.name === 'AbortError' ? 'GMC_TIMEOUT' : 'GMC_TRANSPORT_FAILED',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      }
      if (transient && attempt === 0) { lastError = error; continue; }
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('Gemini timed out after a retry.'), { status: 504, code: 'GMC_TIMEOUT' });
      }
      if (transportFailure) {
        throw Object.assign(new Error('Gemini transport failed after a retry.'), {
          status: 503,
          code: 'GMC_TEMPORARILY_UNAVAILABLE',
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? Object.assign(new Error('Gemini returned no usable structured content.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
}

export const generationPrompts = {
  npc: 'Create a campaign NPC with name, role, motivation, secrets, relationships, voice, appearance, currentLocationId, arcSummary, status, combatProfile, claims, and tags.',
  location: 'Create a campaign location with name, description, parentLocationId, atmosphere, features, secrets, inhabitants, hooks, claims, and tags.',
  item: 'Create a campaign item with name, description, rarity, lore, properties, suggestedVcsPayload, claims, and tags.',
};
