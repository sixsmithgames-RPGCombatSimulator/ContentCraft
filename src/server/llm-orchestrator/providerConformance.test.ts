import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmProviderAdapter, ProviderStructuredRequest } from './provider.js';
import { FakeProviderAdapter } from './providers/fakeProvider.js';
import { GeminiProviderAdapter } from './providers/geminiProvider.js';

const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

const request: ProviderStructuredRequest = {
  requestId: 'request-1',
  operation: 'intent.classify',
  operationClass: 'structured_low',
  model: 'fixture-model',
  systemInstruction: 'Return the registered object.',
  input: { fixture: true },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['valid'],
    properties: { valid: { type: 'boolean' } },
  },
  temperature: 0,
  maxOutputTokens: 100,
  timeoutMs: 1000,
};

async function assertConformance(adapter: LlmProviderAdapter) {
  expect(adapter.id).toBeTruthy();
  expect(adapter.version).toBeTruthy();
  expect(adapter.isAvailable()).toBe(true);
  const result = await adapter.generateStructured(request);
  expect(result.output).toEqual({ valid: true });
  expect(result.usage.source).toBe('provider');
  expect(result.usage.inputTokens).toBeTypeOf('number');
  expect(result.usage.outputTokens).toBeTypeOf('number');
}

describe('enabled provider adapter conformance', () => {
  it('runs the shared contract against the deterministic fake provider', async () => {
    await assertConformance(new FakeProviderAdapter(() => ({ valid: true })));
  });

  it('runs the shared contract against the Gemini adapter with provider schema and exact usage metadata', async () => {
    process.env.GEMINI_API_KEY = 'fixture-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"valid":true}' }] } }],
      usageMetadata: {
        promptTokenCount: 7,
        candidatesTokenCount: 3,
        thoughtsTokenCount: 0,
        cachedContentTokenCount: 2,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await assertConformance(new GeminiProviderAdapter());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseJsonSchema).toEqual(request.outputSchema);
  });

  it('uses model-aware Gemini thinking and omits deprecated sampling parameters', async () => {
    process.env.GEMINI_API_KEY = 'fixture-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"valid":true}' }] } }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, thoughtsTokenCount: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await new GeminiProviderAdapter().generateStructured({
      ...request,
      model: 'gemini-3.6-flash',
      temperature: 0.6,
      thinkingLevel: 'low',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBeUndefined();
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('distinguishes output truncation from other malformed provider JSON', async () => {
    process.env.GEMINI_API_KEY = 'fixture-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"valid":' }] } }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(new GeminiProviderAdapter().generateStructured(request)).rejects.toMatchObject({
      code: 'PROVIDER_OUTPUT_TRUNCATED',
      retryable: true,
      source: 'provider.gemini',
    });
  });

  it('classifies a monthly spend cap as terminal instead of retryable rate limiting', async () => {
    process.env.GEMINI_API_KEY = 'fixture-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'The project monthly spending cap has been reached.' },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })));
    await expect(new GeminiProviderAdapter().generateStructured(request)).rejects.toMatchObject({
      code: 'PROVIDER_SPEND_CAP_EXCEEDED',
      retryable: false,
      status: 429,
    });
  });
});
