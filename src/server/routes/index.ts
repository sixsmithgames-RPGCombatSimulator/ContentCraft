/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { projectRouter } from './projects.js';
import { contentRouter } from './content.js';
import { runsRouter } from './runs.js';
import { canonRouter } from './canon.js';
import { configRouter } from './config.js';
import { uploadRouter } from './upload.js';
import { homebrewRouter } from './homebrew.js';
import factCheckRouter from './factCheck.js';
import { progressRouter } from './progress.js';
// import { aiRouter } from './ai.js';

export const apiRouter = Router();

apiRouter.use('/projects', projectRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/canon', canonRouter);
apiRouter.use('/canon/fact-check', factCheckRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/homebrew', homebrewRouter);
apiRouter.use('/', progressRouter);
// apiRouter.use('/ai', aiRouter);

apiRouter.get('/health', (req, res) => {
  res.json({ success: true, message: 'ContentCraft API is running' });
});