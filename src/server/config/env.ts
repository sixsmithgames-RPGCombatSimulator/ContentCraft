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
};

export function validateConfig(): void {
  const errors: string[] = [];

  // if (!config.openaiApiKey) {
  //   errors.push('OPENAI_API_KEY is required');
  // }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Invalid configuration');
  }
}
