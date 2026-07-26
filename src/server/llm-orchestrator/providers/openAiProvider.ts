import OpenAI from 'openai';
import { OrchestratorError } from '../errors.js';
import type {
  LlmProviderAdapter,
  ProviderStructuredRequest,
  ProviderStructuredResult,
} from '../provider.js';

export class OpenAiProviderAdapter implements LlmProviderAdapter {
  readonly id = 'openai';
  readonly version = '1';

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
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: request.model,
        instructions: request.systemInstruction,
        input: JSON.stringify(request.input),
        text: {
          format: {
            type: 'json_schema',
            name: request.operation.replace(/[^a-zA-Z0-9_-]/g, '_'),
            strict: true,
            schema: request.outputSchema,
          },
        },
        max_output_tokens: request.maxOutputTokens,
      }, { signal: request.signal, timeout: request.timeoutMs });
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
      const status = Number((error as any)?.status ?? 0);
      throw new OrchestratorError({
        code: status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_TRANSPORT_ERROR',
        category: 'provider',
        message: error instanceof Error ? error.message : 'The alternate provider failed.',
        retryable: status === 408 || status === 429 || status >= 500,
        status: status === 429 ? 429 : 502,
        source: 'provider.openai',
        providerStatus: status || undefined,
      });
    }
  }
}
