/**
 * Owner-only access control for the temporarily hidden SagaCraft product.
 *
 * This middleware runs only when the request is for a SagaCraft deployment. It
 * verifies the Clerk session signature, loads the authenticated Clerk user, and
 * allows the request only when the verified primary email belongs to the owner.
 * All other ContentCraft-family deployments continue through unchanged.
 */

import { createClerkClient, verifyToken } from '@clerk/backend';
import type { NextFunction, Request, Response } from 'express';

export const SAGACRAFT_OWNER_EMAIL = 'sexsmith2005@gmail.com';

export function isSagaCraftOwnerEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === SAGACRAFT_OWNER_EMAIL;
}

/**
 * Detect SagaCraft from either deployment configuration or the request host.
 * Supporting both keeps the rule effective on Vercel and on custom servers.
 */
export function isSagaCraftRequest(
  requestHost: string | null | undefined,
  configuredProduct: string | null | undefined,
): boolean {
  if (configuredProduct?.trim().toLowerCase() === 'sagacraft') {
    return true;
  }

  return requestHost?.trim().toLowerCase().includes('sagacraft') ?? false;
}

function readBearerToken(request: Request): string | null {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Fail closed when SagaCraft identity cannot be proved.
 *
 * A 404 response deliberately avoids advertising a private product to another
 * signed-in user. Local single-user mode remains available for development and
 * never changes production behavior.
 */
export async function requireSagaCraftOwner(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const configuredProduct =
    process.env.NEXT_PUBLIC_PRODUCT_KEY
    || process.env.VITE_PRODUCT_KEY
    || process.env.PRODUCT_KEY;
  const requestHost = request.get('host');

  if (!isSagaCraftRequest(requestHost, configuredProduct)) {
    next();
    return;
  }

  if (process.env.SINGLE_USER_MODE === 'true' && process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  const token = readBearerToken(request);

  if (!secretKey || !token) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || '')
      .split(',')
      .map((party) => party.trim())
      .filter(Boolean);
    const verifiedToken = await verifyToken(token, {
      secretKey,
      authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
    });

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(verifiedToken.sub);
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    const isVerifiedOwner =
      primaryEmail?.verification?.status === 'verified'
      && isSagaCraftOwnerEmail(primaryEmail.emailAddress);

    if (!isVerifiedOwner) {
      response.status(404).json({ error: 'Not found' });
      return;
    }

    next();
  } catch (error) {
    console.warn('[SagaCraft access] Owner verification failed:', error);
    response.status(404).json({ error: 'Not found' });
  }
}
