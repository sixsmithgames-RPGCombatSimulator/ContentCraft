/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { apiRouter } from './routes/index.js';

// Load .env.local first (for local development), then .env (for defaults)
// .env.local takes precedence and is gitignored
// Use override: true to ensure local settings override any pre-loaded env vars
if (existsSync('.env.local')) {
  config({ path: '.env.local', override: true });
  console.log('✓ Loaded .env.local for local development');
} else {
  config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

// Configure Helmet for production
if (isProduction) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://clerk.sixsmithgames.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        workerSrc: ["'self'", "blob:"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
} else {
  app.use(helmet());
}

app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', apiRouter);

// Serve static files from client build in production
if (isProduction) {
  const clientBuildPath = path.join(__dirname, '../client');
  console.log(`📁 Serving static files from: ${clientBuildPath}`);

  app.use(express.static(clientBuildPath));

  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  // Development mode - just show API info on root
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'ContentCraft API Server',
      version: '1.0.0',
      mode: 'development'
    });
  });

  app.use('*', (_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  });
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

export default app;
