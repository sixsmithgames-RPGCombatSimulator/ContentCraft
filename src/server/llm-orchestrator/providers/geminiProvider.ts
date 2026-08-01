import { OrchestratorError } from '../errors.js';
import type {
  LlmProviderAdapter,
  ProviderStructuredRequest,
  ProviderStructuredResult,
} from '../provider.js';

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

function supportsSamplingTemperature(model: string) {
  return !/^gemini-(?:3\.[5-9]|[4-9]\.)/i.test(model);
}

export class GeminiProviderAdapter implements LlmProviderAdapter {
  readonly id = 'gemini';
  readonly version = '1';

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
        responseJsonSchema: request.outputSchema,
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
        throw new OrchestratorError({
          code: 'PROVIDER_INVALID_JSON',
          category: 'validation',
          message: 'The provider returned invalid JSON.',
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
