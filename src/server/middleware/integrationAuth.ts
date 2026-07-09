import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/mongo.js';

export interface IntegrationRequest extends Request {
  userId: string;
  user?: {
    id: string;
    email: string;
    displayName?: string;
  };
  integrationAuth: 'local' | 'service' | 'clerk';
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

type ClerkTokenPayload = {
  sub: string;
  exp?: number;
  sid?: string;
  email?: string;
  email_address?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
};

type UserDocument = {
  _id: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLogin: Date;
  metadata: Record<string, unknown>;
};

function bearerToken(req: Request) {
  return String(req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

// Clerk's networkless verification key: Dashboard -> API keys -> JWT public key.
// Accepts full PEM (possibly with literal "\n" escapes) or the bare base64 body.
function clerkVerificationKey() {
  const raw = String(process.env.CLERK_JWT_KEY || '').trim();
  if (!raw) return '';
  const unescaped = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  if (unescaped.includes('-----BEGIN')) return unescaped;
  const body = unescaped.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function verifyClerkToken(token: string): ClerkTokenPayload | null {
  const key = clerkVerificationKey();
  if (!key || token.split('.').length !== 3) return null;
  try {
    const payload = jwt.verify(token, key, { algorithms: ['RS256'] });
    if (typeof payload !== 'object' || payload === null || !payload.sub) return null;
    return payload as ClerkTokenPayload;
  } catch {
    return null;
  }
}

function validUserIdentifier(value: string) {
  return value.length >= 1 && value.length <= 254 && !/[\x00-\x1F\x7F]/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveServiceUserIdentifier(identifier: string) {
  if (!identifier.includes('@')) return identifier;
  const user = await getDb().collection('users').findOne({
    email: { $regex: `^${escapeRegExp(identifier)}$`, $options: 'i' },
  });
  return typeof user?._id === 'string' ? user._id : null;
}

async function ensureIntegrationUser(payload: ClerkTokenPayload) {
  const db = getDb();
  const usersCollection = db.collection<UserDocument>('users');
  const email = String(payload.email || payload.email_address || '').trim() || `${payload.sub}@clerk.user`;
  const displayName = String(payload.name || payload.given_name || email || 'Unknown User').trim();

  const existing = await usersCollection.findOne({ _id: payload.sub });
  if (!existing) {
    const user = {
      _id: payload.sub,
      email,
      displayName,
      createdAt: new Date(),
      lastLogin: new Date(),
      metadata: {
        picture: payload.picture,
        emailVerified: payload.email_verified,
        sessionId: payload.sid,
      },
    };
    await usersCollection.insertOne(user);
    return { id: user._id, email: user.email, displayName: user.displayName };
  }

  await usersCollection.updateOne({ _id: payload.sub }, { $set: { lastLogin: new Date() } });
  return { id: existing._id, email: existing.email, displayName: existing.displayName };
}

export async function integrationAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const integrationReq = req as IntegrationRequest;
  if (process.env.SINGLE_USER_MODE === 'true') {
    integrationReq.userId = process.env.DEFAULT_USER_ID || 'local-dev';
    integrationReq.user = { id: integrationReq.userId, email: 'local@dev.local', displayName: 'Local Development User' };
    integrationReq.integrationAuth = 'local';
    next();
    return;
  }

  const supplied = bearerToken(req);
  if (!supplied) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'No authorization header provided.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
    });
    return;
  }

  const configured = String(process.env.GMC_SERVICE_API_KEY || '').trim();
  const serviceConfigured = configured.length >= 32;
  const serviceMatched = serviceConfigured && timingSafeEqual(digest(supplied), digest(configured));

  if (serviceMatched) {
    const suppliedUserId = String(req.header('X-Sixsmith-User-Id') || '').trim();
    if (!validUserIdentifier(suppliedUserId)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'A valid X-Sixsmith-User-Id header is required.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
      });
      return;
    }
    const resolvedUserId = await resolveServiceUserIdentifier(suppliedUserId);
    if (!resolvedUserId) {
      res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'No GameMasterCraft user matched X-Sixsmith-User-Id.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
      });
      return;
    }
    integrationReq.userId = resolvedUserId;
    integrationReq.integrationAuth = 'service';
    next();
    return;
  }

  const clerk = verifyClerkToken(supplied);
  if (clerk) {
    integrationReq.userId = clerk.sub;
    try {
      integrationReq.user = await ensureIntegrationUser(clerk);
    } catch {
      integrationReq.user = undefined;
    }
    integrationReq.integrationAuth = 'clerk';
    next();
    return;
  }

  const clerkConfigured = Boolean(clerkVerificationKey());
  const message = clerkConfigured
    ? serviceConfigured
      ? 'Invalid GameMasterCraft service credential or Clerk token.'
      : 'Invalid Clerk token. Service auth is not configured.'
    : serviceConfigured
      ? 'Invalid GameMasterCraft service credential. Clerk token verification is not configured (CLERK_JWT_KEY).'
      : 'Clerk token verification is not configured on this server (CLERK_JWT_KEY), and service auth is not configured.';
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({
    error: { code: 'AUTH_REQUIRED', message, correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
  });
}
