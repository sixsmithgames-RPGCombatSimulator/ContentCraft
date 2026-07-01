import { afterEach, describe, expect, it } from 'vitest';
import { generateStructuredJson } from './gmcLiveGeneration.js';

const original = process.env.GEMINI_API_KEY;
afterEach(() => {
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
});
