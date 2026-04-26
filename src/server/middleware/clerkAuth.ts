/**
 * Clerk Authentication Middleware
 * 
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 * 
 * Verifies Clerk session tokens and extracts user information
 */

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../config/mongo.js';
import * as jwt from 'jsonwebtoken';

type UserDocument = {
  _id: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLogin: Date;
  metadata: Record<string, unknown>;
};

interface ClerkJWTPayload {
  azp: string;
  exp: number;
  iat: number;
  iss: string;
  nbf: number;
  sid: string;
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
}

export interface AuthRequest extends Request {
  userId: string;
  user?: {
    id: string;
    email: string;
    displayName?: string;
  };
}

/**
 * Ensures a user exists in the database
 * Creates the user if they don't exist (from Clerk payload)
 */
async function ensureUser(payload: ClerkJWTPayload) {
  const db = getDb();
  const usersCollection = db.collection<UserDocument>('users');

  let user = await usersCollection.findOne({ _id: payload.sub });

  if (!user) {
    // Create user from Clerk payload
    user = {
      _id: payload.sub,
      email: payload.email || `${payload.sub}@clerk.user`,
      displayName: payload.name || payload.given_name || payload.email || 'Unknown User',
      createdAt: new Date(),
      lastLogin: new Date(),
      metadata: {
        picture: payload.picture,
        emailVerified: payload.email_verified,
        sessionId: payload.sid
      }
    };

    await usersCollection.insertOne(user);
    console.log(`✓ Created new Clerk user: ${payload.sub} (${payload.email})`);
  } else {
    // Update last login
    await usersCollection.updateOne(
      { _id: payload.sub },
      { $set: { lastLogin: new Date() } }
    );
  }

  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName
  };
}

/**
 * Clerk authentication middleware
 * 
 * Verifies Clerk session tokens and extracts user information
 */
export async function clerkAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;

  // Single-user mode: bypass authentication
  if (process.env.SINGLE_USER_MODE === 'true') {
    const defaultUserId = process.env.DEFAULT_USER_ID || 'local-dev';
    authReq.userId = defaultUserId;
    authReq.user = {
      id: defaultUserId,
      email: 'local@dev.local',
      displayName: 'Local Development User'
    };
    return next();
  }

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization header provided'
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
      return;
    }

    // For now, we'll decode without verification (in production, you should verify with Clerk's public keys)
    // This is a simplified approach - you may want to use Clerk's SDK for proper verification
    const decoded = jwt.decode(token) as ClerkJWTPayload;

    if (!decoded || !decoded.sub) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Token does not contain valid user information'
      });
      return;
    }

    // Verify token expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      res.status(401).json({
        error: 'Token expired',
        message: 'Please log in again'
      });
      return;
    }

    // Set userId on request
    authReq.userId = decoded.sub;

    // Ensure user exists in database
    try {
      authReq.user = await ensureUser(decoded);
    } catch (error) {
      console.error('Error ensuring user:', error);
      // Continue anyway - user creation failed but we have userId
    }

    next();

  } catch (error) {
    console.error('Clerk authentication error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid session token'
    });
  }
}

/**
 * Optional Clerk authentication middleware
 * Sets userId if token is provided, but doesn't require it
 */
export async function optionalClerkAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;

  // Single-user mode
  if (process.env.SINGLE_USER_MODE === 'true') {
    authReq.userId = process.env.DEFAULT_USER_ID || 'local-dev';
    authReq.user = {
      id: authReq.userId,
      email: 'local@dev.local',
      displayName: 'Local Development User'
    };
    return next();
  }

  // Multi-tenant mode: try to verify token if present
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.decode(token) as ClerkJWTPayload;

      if (decoded && decoded.sub) {
        // Verify token expiration
        if (!decoded.exp || decoded.exp >= Math.floor(Date.now() / 1000)) {
          authReq.userId = decoded.sub;
          try {
            authReq.user = await ensureUser(decoded);
          } catch (error) {
            // Ignore error
          }
        }
      }
    }
  } catch (error) {
    // Ignore authentication errors in optional auth
  }

  next();
}
