import type {
  LlmProviderAdapter,
  ProviderStructuredRequest,
  ProviderStructuredResult,
} from '../provider.js';

export class FakeProviderAdapter implements LlmProviderAdapter {
  readonly id = 'fake';
  readonly version = '1';
  calls: ProviderStructuredRequest[] = [];
  private readonly responder: (request: ProviderStructuredRequest) => unknown | Promise<unknown>;

  constructor(responder: (request: ProviderStructuredRequest) => unknown | Promise<unknown> = () => ({})) {
    this.responder = responder;
  }

  isAvailable() {
    return true;
  }

  async generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult> {
    this.calls.push(request);
    const output = await this.responder(request);
    return {
      output,
      rawText: JSON.stringify(output),
      providerRequestId: `fake-${request.requestId}`,
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        source: 'provider',
        priceVersion: 'fake/1',
        costUsd: 0,
      },
    };
  }
}
