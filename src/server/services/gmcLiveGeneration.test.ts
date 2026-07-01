import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateStructuredJson } from './gmcLiveGeneration.js';

const original = process.env.GEMINI_API_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (original === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = original;
});

describe('generateStructuredJson', () => {
  it('fails closed when the server-side Gemini key is unavailable', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateStructuredJson('Return JSON.', {})).rejects.toMatchObject({
      status: 503,
      code: 'GMC_UNAVAILABLE',
    });
  });

  it('retries one transient Gemini failure and returns the structured response', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"narration":"Recovered"}' }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructuredJson('Return narration.', {})).resolves.toEqual({ narration: 'Recovered' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a transport failure instead of leaking an HTTP 500', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"narration":"Recovered after transport failure"}' }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructuredJson('Return narration.', {})).resolves.toEqual({ narration: 'Recovered after transport failure' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a repeated transport failure to a retryable service error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructuredJson('Return narration.', {})).rejects.toMatchObject({
      status: 503,
      code: 'GMC_TEMPORARILY_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
