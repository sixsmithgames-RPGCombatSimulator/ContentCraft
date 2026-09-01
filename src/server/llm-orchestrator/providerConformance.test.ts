import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmProviderAdapter, ProviderStructuredRequest } from './provider.js';
import { FakeProviderAdapter } from './providers/fakeProvider.js';
import {
  GeminiProviderAdapter,
  projectGeminiResponseJsonSchema,
} from './providers/geminiProvider.js';
import { getOperationDefinition } from './operationRegistry.js';

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

  it('projects the logical contract onto Gemini-supported JSON Schema without weakening GMC validation', () => {
    const logicalSchema = getOperationDefinition('action.intent.interpret').outputSchema.schema;
    const projected = projectGeminiResponseJsonSchema(logicalSchema) as any;
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toMatch(/"(?:const|pattern|minLength|maxLength|uniqueItems)"\s*:/);
    expect(projected.properties.schemaVersion).toEqual({ enum: ['gma.semantic-plan-window/1'] });
    expect(projected.properties.review.properties.allWindowActionsRepresented).toEqual({ type: 'boolean' });
    expect(projected.properties.semanticIntent.properties.intents.items.type).toBe('object');
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(4_096);
    expect(Buffer.byteLength(serialized, 'utf8'))
      .toBeLessThan(Buffer.byteLength(JSON.stringify(logicalSchema), 'utf8'));
    expect((logicalSchema as any).properties.schemaVersion.const).toBe('gma.semantic-plan-window/1');

    const visit = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if (value.type === 'array') expect(value.items).toBeTruthy();
      if (value.type === 'object') {
        expect(Boolean(value.properties) || value.additionalProperties === true).toBe(true);
      }
      for (const nested of Array.isArray(value) ? value : Object.values(value)) visit(nested);
    };
    visit(projected);
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

  it('keeps provider diagnostics to bounded field paths without logging request content', async () => {
    process.env.GEMINI_API_KEY = 'fixture-key';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Invalid value at \'generation_config.response_json_schema.properties[2].value.type\'.',
        details: [{ fieldViolations: [{
          field: 'generation_config.response_json_schema.properties[2].value.type',
          description: 'private request content must never be logged',
        }] }],
      },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(new GeminiProviderAdapter().generateStructured(request)).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
      providerStatus: 400,
    });
    expect(warn).toHaveBeenCalledWith('[LLM][Gemini] Structured provider request failed', expect.objectContaining({
      providerFields: ['generation_config.response_json_schema.properties[2].value.type'],
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private request content');
  });
});
