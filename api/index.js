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

    // SQLite doesn't work on Vercel (read-only filesystem)
    if (process.env.VERCEL) {
      console.log('☁️ Running on Vercel - SQLite not available');
      console.log('💡 ContentCraft features require local development or alternative deployment');
    } else {
      console.log('📦 Initializing SQLite database...');
      await initializeDatabase();
    }

    // MongoDB is optional - only needed for D&D Generator features
    console.log('🍃 Attempting MongoDB connection...');
    await connectToMongo();

    isInitialized = true;
    console.log('✅ Serverless function initialized');
  } catch (error) {
    console.error('⚠️ Initialization completed with warnings:', error);
    // Mark as initialized even if MongoDB failed
    // App can still work for features that don't need MongoDB
    isInitialized = true;
  }
}

// Export handler that initializes on first request
export default async function handler(req, res) {
  await initialize();
  return app(req, res);
}
