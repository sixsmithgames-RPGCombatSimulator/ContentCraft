/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// Vercel serverless function wrapper for Express app
import app from '../dist/server/app.js';
import { initializeDatabase } from '../dist/server/models/index.js';
import { connectToMongo } from '../dist/server/config/mongo.js';

let isInitialized = false;

// Initialize databases once on cold start
async function initialize() {
  if (isInitialized) {
    return;
  }

  try {
    console.log('🔄 Initializing serverless function...');

    // Only initialize MongoDB for Vercel (SQLite doesn't work on serverless)
    if (process.env.VERCEL) {
      console.log('☁️ Running on Vercel - skipping SQLite, using MongoDB only');
    } else {
      console.log('📦 Initializing SQLite database...');
      await initializeDatabase();
    }

    console.log('🍃 Connecting to MongoDB...');
    await connectToMongo();

    isInitialized = true;
    console.log('✅ Serverless function initialized');
  } catch (error) {
    console.error('❌ Failed to initialize serverless function:', error);
    // Don't throw - allow app to start but log the error
    // Some routes might work without DB
  }
}

// Export handler that initializes on first request
export default async function handler(req, res) {
  await initialize();
  return app(req, res);
}
