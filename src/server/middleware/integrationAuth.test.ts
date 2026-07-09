import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
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

const signingKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const foreignKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function signedClerkToken(payload: Record<string, unknown>, privateKey = signingKeys.privateKey) {
  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function forgedClerkToken(payload: Record<string, unknown>) {
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

function requestWith(values: Record<string, string>) {
  return { header: (name: string) => values[name] } as any;
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
    const req = requestWith({
      Authorization: `Bearer ${process.env.GMC_SERVICE_API_KEY}`,
      'X-Sixsmith-User-Id': 'user_123',
    });
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_123');
    expect(req.integrationAuth).toBe('service');
  });

  it('accepts a Clerk token with a valid signature', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    process.env.CLERK_JWT_KEY = signingKeys.publicKey;
    const token = signedClerkToken({ sub: 'user_clerk_123', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_clerk_123');
    expect(req.integrationAuth).toBe('clerk');
  });

  it('accepts CLERK_JWT_KEY supplied without PEM armor or with escaped newlines', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    process.env.CLERK_JWT_KEY = signingKeys.publicKey
      .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
      .replace(/\n/g, '\\n');
    const token = signedClerkToken({ sub: 'user_clerk_456', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user_clerk_456');
  });

  it('rejects a forged unsigned token even with a valid payload', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    process.env.CLERK_JWT_KEY = signingKeys.publicKey;
    const token = forgedClerkToken({ sub: 'user_forged', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res, state } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(401);
    expect(state.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a token signed by a different key', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    process.env.CLERK_JWT_KEY = signingKeys.publicKey;
    const token = signedClerkToken({ sub: 'user_wrong_key', exp: Math.floor(Date.now() / 1000) + 3600 }, foreignKeys.privateKey);
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res, state } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(401);
  });

  it('rejects an expired token that has a valid signature', async () => {
    process.env.SINGLE_USER_MODE = 'false'; delete process.env.GMC_SERVICE_API_KEY;
    process.env.CLERK_JWT_KEY = signingKeys.publicKey;
    const token = signedClerkToken({ sub: 'user_expired', exp: Math.floor(Date.now() / 1000) - 60 });
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res, state } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(401);
  });

  it('rejects Clerk tokens when CLERK_JWT_KEY is not configured', async () => {
    process.env.SINGLE_USER_MODE = 'false';
    delete process.env.GMC_SERVICE_API_KEY;
    delete process.env.CLERK_JWT_KEY;
    const token = signedClerkToken({ sub: 'user_clerk_123', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = requestWith({ Authorization: `Bearer ${token}` });
    const { res, state } = response(); const next = vi.fn();
    await integrationAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.status).toBe(401);
    expect(state.body.error.message).toContain('CLERK_JWT_KEY');
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
