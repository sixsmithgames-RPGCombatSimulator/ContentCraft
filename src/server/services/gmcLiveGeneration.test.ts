import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generationDevLogPath } from './generationDevLog.js';
import { generateStructuredJson, getGeminiUsageSnapshot, resetGeminiUsageForTests } from './gmcLiveGeneration.js';

const original = process.env.GEMINI_API_KEY;
const originalGuard = process.env.GEMINI_TRAFFIC_GUARD_REQUESTS;
const originalWarning = process.env.GEMINI_TRAFFIC_WARNING_REQUESTS;
const originalWindow = process.env.GEMINI_TRAFFIC_WINDOW_MS;
const originalDevLogPath = process.env.GMC_AI_DEV_LOG_PATH;
const originalVercel = process.env.VERCEL;
let devLogDirectory = '';
beforeEach(() => {
  devLogDirectory = mkdtempSync(path.join(os.tmpdir(), 'gmc-ai-dev-log-'));
  process.env.GMC_AI_DEV_LOG_PATH = path.join(devLogDirectory, 'generation.jsonl');
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetGeminiUsageForTests();
  if (original === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = original;
  if (originalGuard === undefined) delete process.env.GEMINI_TRAFFIC_GUARD_REQUESTS;
  else process.env.GEMINI_TRAFFIC_GUARD_REQUESTS = originalGuard;
  if (originalWarning === undefined) delete process.env.GEMINI_TRAFFIC_WARNING_REQUESTS;
  else process.env.GEMINI_TRAFFIC_WARNING_REQUESTS = originalWarning;
  if (originalWindow === undefined) delete process.env.GEMINI_TRAFFIC_WINDOW_MS;
  else process.env.GEMINI_TRAFFIC_WINDOW_MS = originalWindow;
  if (originalDevLogPath === undefined) delete process.env.GMC_AI_DEV_LOG_PATH;
  else process.env.GMC_AI_DEV_LOG_PATH = originalDevLogPath;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (devLogDirectory) rmSync(devLogDirectory, { recursive: true, force: true });
});

describe('generateStructuredJson', () => {
  it('uses the writable serverless temp directory when no explicit developer trace path is configured', () => {
    delete process.env.GMC_AI_DEV_LOG_PATH;
    process.env.VERCEL = '1';
    expect(generationDevLogPath()).toBe(path.join(os.tmpdir(), 'gmc-ai-generation.jsonl'));
  });

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
    expect(getGeminiUsageSnapshot().totals.requests).toBe(2);
    const entries = readFileSync(path.join(devLogDirectory, 'generation.jsonl'), 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ status: 'error', operation: 'structured-json', attempt: 1 });
    expect(entries[1]).toMatchObject({ status: 'success', attempt: 2, response: { parsed: { narration: 'Recovered' } } });
    expect(entries[1].request.system_instruction.parts[0].text).toContain('Return narration.');
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

  it('preserves provider details for Gemini quota errors', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Your project has exceeded its monthly spending cap.',
      },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructuredJson('Return narration.', {})).rejects.toMatchObject({
      status: 503,
      code: 'GMC_TEMPORARILY_UNAVAILABLE',
      message: 'Your project has exceeded its monthly spending cap.',
      details: { provider: { status: 'RESOURCE_EXHAUSTED' } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const usage = getGeminiUsageSnapshot();
    expect(usage.totals.errors).toBe(2);
    expect(usage.recent.at(-1)?.errorCode).toBe('RESOURCE_EXHAUSTED');
    const entries = readFileSync(path.join(devLogDirectory, 'generation.jsonl'), 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(entries.at(-1).error.details.provider.status).toBe('RESOURCE_EXHAUSTED');
    expect(entries.at(-1).response.error.message).toContain('monthly spending cap');
  });

  it('blocks Gemini calls when the local traffic guard is exceeded', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_TRAFFIC_GUARD_REQUESTS = '1';
    process.env.GEMINI_TRAFFIC_WARNING_REQUESTS = '1';
    process.env.GEMINI_TRAFFIC_WINDOW_MS = '60000';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"narration":"First"}' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructuredJson('Return narration.', {})).resolves.toEqual({ narration: 'First' });
    await expect(generateStructuredJson('Return narration.', {})).rejects.toMatchObject({
      status: 429,
      code: 'GMC_HIGH_TRAFFIC_GUARD',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const usage = getGeminiUsageSnapshot();
    expect(usage.traffic.status).toBe('blocked');
    expect(usage.recent.at(-1)?.status).toBe('blocked');
  });
});
