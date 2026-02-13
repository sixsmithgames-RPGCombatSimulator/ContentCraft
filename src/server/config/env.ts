/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import 'dotenv/config';

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dndgen',
  // openaiApiKey: process.env.OPENAI_API_KEY || '',
  // openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // assistants: {
  //   planner: process.env.OPENAI_ASSISTANT_PLANNER || '',
  //   creator: process.env.OPENAI_ASSISTANT_CREATOR || '',
  //   stylist: process.env.OPENAI_ASSISTANT_STYLIST || '',
  // },

  // Multi-tenancy configuration
  singleUserMode: process.env.SINGLE_USER_MODE === 'true',
  defaultUserId: process.env.DEFAULT_USER_ID || 'local-dev',

  // Authentication configuration (for multi-tenant mode)
  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET || '',
    jwtIssuer: process.env.AUTH_JWT_ISSUER || '',
    jwtAudience: process.env.AUTH_JWT_AUDIENCE || 'contentcraft',
  },
};

export function validateConfig(): void {
  const errors: string[] = [];

  // if (!config.openaiApiKey) {
  //   errors.push('OPENAI_API_KEY is required');
  // }

  // Multi-tenant mode requires JWT configuration
  if (!config.singleUserMode) {
    if (!config.auth.jwtSecret) {
      errors.push('AUTH_JWT_SECRET is required in multi-tenant mode');
    }
    if (!config.auth.jwtIssuer) {
      errors.push('AUTH_JWT_ISSUER is required in multi-tenant mode');
    }
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Invalid configuration');
  }

  // Log configuration mode
  if (config.singleUserMode) {
    console.log('🔧 Running in SINGLE-USER MODE (local development)');
    console.log(`   Default User ID: ${config.defaultUserId}`);
  } else {
    console.log('👥 Running in MULTI-TENANT MODE (production)');
    console.log(`   JWT Issuer: ${config.auth.jwtIssuer}`);
  }
}
