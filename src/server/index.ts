/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import app from './app.js';
import { initializeDatabase } from './models/index.js';
import { connectToMongo } from './config/mongo.js';

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    console.log('Initializing SQLite database...');
    await initializeDatabase();

    console.log('Connecting to MongoDB...');
    await connectToMongo();

    app.listen(PORT, () => {
      console.log(`✅ ContentCraft API server running on port ${PORT}`);
      console.log(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 SQLite + MongoDB ready for content generation`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();