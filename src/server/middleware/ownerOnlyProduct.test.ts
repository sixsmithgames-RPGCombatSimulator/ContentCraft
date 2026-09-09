import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: clerkMocks.verifyToken,
  createClerkClient: () => ({
    users: {
      getUser: clerkMocks.getUser,
    },
  }),
}));

import {
  isSagaCraftOwnerEmail,
  isSagaCraftRequest,
  requireSagaCraftOwner,
} from './ownerOnlyProduct.js';

describe('SagaCraft owner-only product rules', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'production',
      CLERK_SECRET_KEY: 'test_secret',
      CLERK_AUTHORIZED_PARTIES: 'https://sagacraft.sixsmithgames.com',
      VITE_PRODUCT_KEY: 'sagacraft',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('accepts only the configured owner email, ignoring harmless casing and spaces', () => {
    expect(isSagaCraftOwnerEmail(' SEXSMITH2005@gmail.com ')).toBe(true);
    expect(isSagaCraftOwnerEmail('another@example.com')).toBe(false);
    expect(isSagaCraftOwnerEmail(null)).toBe(false);
  });

  it('detects SagaCraft from deployment configuration or the request host', () => {
    expect(isSagaCraftRequest('contentcraft.sixsmithgames.com', 'sagacraft')).toBe(true);
    expect(isSagaCraftRequest('sagacraft.sixsmithgames.com', undefined)).toBe(true);
    expect(isSagaCraftRequest('gmcraft.sixsmithgames.com', 'gamemastercraft')).toBe(false);
  });

  it('fails closed when a SagaCraft API request has no signed session token', async () => {
    const request = createRequest();
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    await requireSagaCraftOwner(request, response, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a cryptographically verified owner with a verified primary email', async () => {
    clerkMocks.verifyToken.mockResolvedValue({ sub: 'owner_user' });
    clerkMocks.getUser.mockResolvedValue({
      primaryEmailAddressId: 'email_owner',
      emailAddresses: [
        {
          id: 'email_owner',
          emailAddress: 'sexsmith2005@gmail.com',
          verification: { status: 'verified' },
        },
      ],
    });
    const request = createRequest('Bearer signed_owner_token');
    const { response, status } = createResponse();
    const next = vi.fn() as NextFunction;

    await requireSagaCraftOwner(request, response, next);

    expect(clerkMocks.verifyToken).toHaveBeenCalledWith(
      'signed_owner_token',
      expect.objectContaining({
        secretKey: 'test_secret',
        authorizedParties: ['https://sagacraft.sixsmithgames.com'],
      }),
    );
    expect(clerkMocks.getUser).toHaveBeenCalledWith('owner_user');
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it('returns not found when the verified Clerk identity is not the owner', async () => {
    clerkMocks.verifyToken.mockResolvedValue({ sub: 'other_user' });
    clerkMocks.getUser.mockResolvedValue({
      primaryEmailAddressId: 'email_other',
      emailAddresses: [
        {
          id: 'email_other',
          emailAddress: 'another@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    const request = createRequest('Bearer signed_other_token');
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    await requireSagaCraftOwner(request, response, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });
});

function createRequest(authorization?: string): Request {
  const headers = new Map<string, string>([
    ['host', 'sagacraft.sixsmithgames.com'],
  ]);
  if (authorization) {
    headers.set('authorization', authorization);
  }

  return {
    get: vi.fn((name: string) => headers.get(name.toLowerCase())),
  } as unknown as Request;
}

function createResponse(): {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    response: { status } as unknown as Response,
    status,
    json,
  };
}
