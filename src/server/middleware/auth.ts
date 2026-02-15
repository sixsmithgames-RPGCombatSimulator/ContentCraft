/**
 * Authentication Middleware
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 *
 * Supports two modes:
 * 1. Single-user mode (SINGLE_USER_MODE=true) - for local development
 * 2. Multi-tenant mode (SINGLE_USER_MODE=false) - for production
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { getDb } from '../config/mongo.js';

type UserDocument = {
  _id: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLogin: Date;
  metadata: Record<string, unknown>;
};

interface JWTPayload {
  userId: string;
  email: string;
  displayName?: string;
  iat?: number;
  exp?: number;
  iss?: string;
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
 * Creates the user if they don't exist (from JWT payload)
 */
async function ensureUser(payload: JWTPayload) {
  const db = getDb();
  const usersCollection = db.collection<UserDocument>('users');

  let user = await usersCollection.findOne({ _id: payload.userId });

  if (!user) {
    // Create user from JWT payload
    user = {
      _id: payload.userId,
      email: payload.email,
      displayName: payload.displayName || payload.email,
      createdAt: new Date(),
      lastLogin: new Date(),
      metadata: {}
    };

    await usersCollection.insertOne(user);
    console.log(`✓ Created new user: ${payload.userId} (${payload.email})`);
  } else {
    // Update last login
    await usersCollection.updateOne(
      { _id: payload.userId },
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
 * Ensures the default local development user exists
 */
async function ensureLocalUser(userId: string) {
  const db = getDb();
  const usersCollection = db.collection<UserDocument>('users');

  let user = await usersCollection.findOne({ _id: userId });

  if (!user) {
    user = {
      _id: userId,
      email: 'local@dev.local',
      displayName: 'Local Development User',
      createdAt: new Date(),
      lastLogin: new Date(),
      metadata: {}
    };

    await usersCollection.insertOne(user);
    console.log(`✓ Created local development user: ${userId}`);
  }

  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName
  };
}

/**
 * Authentication middleware
 *
 * Single-user mode: All requests use DEFAULT_USER_ID (no auth required)
 * Multi-tenant mode: Verifies JWT token and extracts userId
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;

  // Single-user mode: bypass authentication
  if (process.env.SINGLE_USER_MODE === 'true') {
    const defaultUserId = process.env.DEFAULT_USER_ID || 'local-dev';
    authReq.userId = defaultUserId;

    try {
      authReq.user = await ensureLocalUser(defaultUserId);
    } catch (error) {
      console.error('Error ensuring local user:', error);
      // Continue anyway - user might not be required for all endpoints
    }

    return next();
  }

  // Multi-tenant mode: verify JWT
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

    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret) {
      console.error('AUTH_JWT_SECRET not configured');
      res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication not configured'
      });
      return;
    }

    // Verify token
    const payload = jwt.verify(token, secret, {
      issuer: process.env.AUTH_JWT_ISSUER,
      audience: process.env.AUTH_JWT_AUDIENCE || 'contentcraft'
    }) as JWTPayload;

    if (!payload.userId) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Token does not contain userId'
      });
      return;
    }

    // Set userId on request
    authReq.userId = payload.userId;

    // Ensure user exists in database
    try {
      authReq.user = await ensureUser(payload);
    } catch (error) {
      console.error('Error ensuring user:', error);
      // Continue anyway - user creation failed but we have userId
    }

    next();

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid token',
        message: error.message
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
        message: 'Please log in again'
      });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'An unexpected error occurred'
    });
  }
}

/**
 * Optional authentication middleware
 * Sets userId if token is provided, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;

  // Single-user mode
  if (process.env.SINGLE_USER_MODE === 'true') {
    authReq.userId = process.env.DEFAULT_USER_ID || 'local-dev';
    try {
      authReq.user = await ensureLocalUser(authReq.userId);
    } catch (error) {
      // Ignore error
    }
    return next();
  }

  // Multi-tenant mode: try to verify token if present
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const secret = process.env.AUTH_JWT_SECRET;

    if (secret && token) {
      const payload = jwt.verify(token, secret, {
        issuer: process.env.AUTH_JWT_ISSUER,
        audience: process.env.AUTH_JWT_AUDIENCE || 'contentcraft'
      }) as JWTPayload;

      if (payload.userId) {
        authReq.userId = payload.userId;
        try {
          authReq.user = await ensureUser(payload);
        } catch (error) {
          // Ignore error
        }
      }
    }
  } catch (error) {
    // Ignore authentication errors in optional auth
  }

  next();
}
