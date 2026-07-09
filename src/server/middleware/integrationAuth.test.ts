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

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function clerkToken(payload: Record<string, unknown>) {
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

describe('integrationAuth', () => {
  it('uses the configured local user in single-user mode', async () => {
    process.env.SINGLE_USER_MODE = 'true'; process.env.DEFAULT_USER_ID = 'local-gm';
    const req: any = { header: () => undefined };
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('local-gm');
    expect(req.integrationAuth).toBe('local');
  });

  it('accepts a valid service key and user identity', async () => {
    process.env.SINGLE_USER_MODE = 'false';
    process.env.GMC_SERVICE_API_KEY = 'a-secure-service-key-with-at-least-32-characters';
    const values: Record<string, string> = {
      Authorization: `Bearer ${process.env.GMC_SERVICE_API_KEY}`,
      'X-Sixsmith-User-Id': 'user_123',
    };
    const req: any = { header: (name: string) => values[name] };
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_123');
    expect(req.integrationAuth).toBe('service');
  });

  it('accepts a Clerk bearer token without service auth', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    const values: Record<string, string> = {
      Authorization: `Bearer ${clerkToken({ sub: 'user_clerk_123', exp: Math.floor(Date.now() / 1000) + 3600 })}`,
    };
    const req: any = { header: (name: string) => values[name] };
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_clerk_123');
    expect(req.integrationAuth).toBe('clerk');
  });

  it('requires a bearer token when service auth is not configured', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    const req: any = { header: () => undefined };
    const { res, state } = response();
    await integrationAuth(req, res, vi.fn());
    expect(state.status).toBe(401);
    expect(state.body.error.code).toBe('AUTH_REQUIRED');
  });
});
