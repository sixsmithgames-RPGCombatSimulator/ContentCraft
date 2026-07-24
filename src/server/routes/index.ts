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
import { aiRouter } from './ai.js';
import { gmcV1Router } from './gmcV1.js';
import { GMC_VERSION } from '../serviceVersion.js';

export const apiRouter = Router();

apiRouter.use('/projects', projectRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/canon', canonRouter);
apiRouter.use('/canon/fact-check', factCheckRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/homebrew', homebrewRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/gmc/v1', gmcV1Router);
apiRouter.use('/', progressRouter);

apiRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'gamemastercraft',
    version: GMC_VERSION,
    message: 'GameMasterCraft API is running',
  });
});
