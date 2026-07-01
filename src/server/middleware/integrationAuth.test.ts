import { afterEach, describe, expect, it, vi } from 'vitest';
import { integrationAuth } from './integrationAuth.js';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

function response() {
  const state: any = { status: 200, body: null, headers: {} };
  const res: any = {
    status(code: number) { state.status = code; return res; },
    json(body: unknown) { state.body = body; return res; },
    setHeader(name: string, value: string) { state.headers[name] = value; },
  };
  return { res, state };
}

describe('integrationAuth', () => {
  it('uses the configured local user in single-user mode', () => {
    process.env.SINGLE_USER_MODE = 'true'; process.env.DEFAULT_USER_ID = 'local-gm';
    const req: any = { header: () => undefined };
    const { res } = response(); const next = vi.fn();
    integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('local-gm');
    expect(req.integrationAuth).toBe('local');
  });

  it('requires both a valid service key and user identity', () => {
    process.env.SINGLE_USER_MODE = 'false';
    process.env.GMC_SERVICE_API_KEY = 'a-secure-service-key-with-at-least-32-characters';
    const values: Record<string, string> = {
      Authorization: `Bearer ${process.env.GMC_SERVICE_API_KEY}`,
      'X-Sixsmith-User-Id': 'user_123',
    };
    const req: any = { header: (name: string) => values[name] };
    const { res } = response(); const next = vi.fn();
    integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_123');
    expect(req.integrationAuth).toBe('service');
  });

  it('fails closed when service auth is not configured', () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    const req: any = { header: () => undefined };
    const { res, state } = response();
    integrationAuth(req, res, vi.fn());
    expect(state.status).toBe(503);
    expect(state.body.error.code).toBe('GMC_SERVICE_UNAVAILABLE');
  });
});
