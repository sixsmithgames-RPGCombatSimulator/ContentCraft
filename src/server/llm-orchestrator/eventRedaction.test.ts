import { describe, expect, it } from 'vitest';
import { redactExecutionEventData } from './eventRedaction.js';

describe('execution event redaction', () => {
  it('removes prompt, output, credential, and nested payload material', () => {
    expect(redactExecutionEventData({
      prompt: 'private campaign prose',
      authorization: 'Bearer secret',
      providerStatus: 429,
      message: 'failed for sk-secret-secret-secret',
      nested: { campaign: 'private' },
    })).toEqual({
      prompt: '[REDACTED]',
      authorization: '[REDACTED]',
      providerStatus: 429,
      message: 'failed for [REDACTED]',
      nested: '[STRUCTURED_DATA_OMITTED]',
    });
  });
});
