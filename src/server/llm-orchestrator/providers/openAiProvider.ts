import OpenAI from 'openai';
import { FREEFORM_INTAKE_OPERATION } from '../../../shared/llm/freeformIntakePolicy.js';
import { OrchestratorError } from '../errors.js';
import type {
  LlmProviderAdapter,
  ProviderStructuredRequest,
  ProviderStructuredResult,
} from '../provider.js';

export class OpenAiProviderAdapter implements LlmProviderAdapter {
  readonly id = 'openai';
  readonly version = '2';

  isAvailable() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new OrchestratorError({
        code: 'PROVIDER_UNAVAILABLE',
        category: 'provider',
        message: 'The alternate AI provider is unavailable.',
        retryable: true,
        status: 503,
        source: 'provider.openai',
      });
    }
    try {
      const compactIntake = request.operation === FREEFORM_INTAKE_OPERATION;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY,
        ...(compactIntake ? { maxRetries: 0 } : {}) });
      const body = {
        model: request.model,
        instructions: request.systemInstruction,
        input: JSON.stringify(request.input),
        text: {
          format: {
            type: 'json_schema' as const,
            name: request.operation.replace(/[^a-zA-Z0-9_-]/g, '_'),
            strict: true as const,
            schema: request.outputSchema,
          },
        },
        max_output_tokens: request.maxOutputTokens,
      };
      if (compactIntake && Buffer.byteLength(JSON.stringify(body), 'utf8') > 24576) {
        throw new OrchestratorError({ code: 'LLM_CONTEXT_HARD_LIMIT_EXCEEDED', category: 'context',
          message: 'The compact intake request exceeds its provider envelope budget.', status: 413 });
      }
      const response = await client.responses.create(body, { signal: request.signal, timeout: request.timeoutMs });
      const rawText = response.output_text;
      return {
        output: JSON.parse(rawText),
        rawText,
        providerRequestId: response.id,
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
          source: response.usage ? 'provider' : 'unavailable',
          priceVersion: null,
          costUsd: null,
        },
      };
    } catch (error) {
      if (error instanceof OrchestratorError) throw error;
      const status = Number((error as any)?.status ?? 0);
      const message = error instanceof Error ? error.message : 'The alternate provider failed.';
      const spendCap = status === 429
        && /\b(?:monthly|project(?:-level)?|billing(?: account)?)\b[^.\n]{0,100}\b(?:spend(?:ing)?|budget|quota|cap|limit)\b|\b(?:spend(?:ing)?|budget) cap\b/i.test(message);
      throw new OrchestratorError({
        code: spendCap ? 'PROVIDER_SPEND_CAP_EXCEEDED' : (status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_TRANSPORT_ERROR'),
        category: 'provider',
        message,
        retryable: !spendCap && (status === 408 || status === 429 || status >= 500),
        status: status === 429 ? 429 : 502,
        source: 'provider.openai',
        providerStatus: status || undefined,
      });
    }
  }
}
