import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface IntegrationRequest extends Request {
  userId: string;
  integrationAuth: 'local' | 'service';
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

export function integrationAuth(req: Request, res: Response, next: NextFunction): void {
  const integrationReq = req as IntegrationRequest;
  if (process.env.SINGLE_USER_MODE === 'true') {
    integrationReq.userId = process.env.DEFAULT_USER_ID || 'local-dev';
    integrationReq.integrationAuth = 'local';
    next();
    return;
  }

  const configured = String(process.env.GMC_SERVICE_API_KEY || '').trim();
  if (configured.length < 32) {
    res.status(503).json({
      error: { code: 'GMC_SERVICE_UNAVAILABLE', message: 'GameMasterCraft integration API is not configured.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
    });
    return;
  }

  const match = String(req.header('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1]?.trim() || '';
  if (!supplied || !timingSafeEqual(digest(supplied), digest(configured))) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Invalid GameMasterCraft service credential.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
    });
    return;
  }

  const userId = String(req.header('X-Sixsmith-User-Id') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid X-Sixsmith-User-Id header is required.', correlationId: req.header('X-Sixsmith-Correlation-Id') || null, details: {} },
    });
    return;
  }

  integrationReq.userId = userId;
  integrationReq.integrationAuth = 'service';
  next();
}
