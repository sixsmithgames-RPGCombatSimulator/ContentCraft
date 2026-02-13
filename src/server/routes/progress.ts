/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const progressRouter = Router();

// Directory to store progress files
const PROGRESS_DIR = path.join(__dirname, '..', '..', '..', 'generation-progress');

// Ensure progress directory exists
async function ensureProgressDir() {
  try {
    await fs.access(PROGRESS_DIR);
  } catch {
    await fs.mkdir(PROGRESS_DIR, { recursive: true });
  }
}

/**
 * POST /api/save-progress
 * Saves generation progress to a JSON file
 */
progressRouter.post('/save-progress', async (req: Request, res: Response) => {
  try {
    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename or data',
      });
    }

    await ensureProgressDir();

    const filepath = path.join(PROGRESS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`[Progress] Saved to ${filepath}`);

    res.json({
      success: true,
      filepath: filename,
      message: 'Progress saved successfully',
    });
  } catch (error) {
    console.error('[Progress] Error saving progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/load-progress?filename=...
 * Loads generation progress from a JSON file
 */
progressRouter.get('/load-progress', async (req: Request, res: Response) => {
  try {
    const { filename } = req.query;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid filename',
      });
    }

    const filepath = path.join(PROGRESS_DIR, filename);

    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Progress file not found',
      });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    console.log(`[Progress] Loaded from ${filepath}`);

    res.json(data);
  } catch (error) {
    console.error('[Progress] Error loading progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/list-progress
 * Lists all available progress files
 */
progressRouter.get('/list-progress', async (req: Request, res: Response) => {
  try {
    await ensureProgressDir();

    const files = await fs.readdir(PROGRESS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const progressFiles = await Promise.all(
      jsonFiles.map(async (filename) => {
        try {
          const filepath = path.join(PROGRESS_DIR, filename);
          const content = await fs.readFile(filepath, 'utf-8');
          const data = JSON.parse(content);

          return {
            filename,
            sessionId: data.sessionId,
            createdAt: data.createdAt,
            lastUpdatedAt: data.lastUpdatedAt,
            config: data.config,
            currentStageIndex: data.currentStageIndex,
            progressCount: data.progress?.length || 0,
            totalStages: 8, // Total stages in current pipeline
          };
        } catch (error) {
          console.error(`[Progress] Error reading ${filename}:`, error);
          return null;
        }
      })
    );

    // Filter out any failed reads
    const validFiles = progressFiles.filter(f => f !== null);

    res.json(validFiles);
  } catch (error) {
    console.error('[Progress] Error listing progress files:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/delete-progress?filename=...
 * Deletes a progress file
 */
progressRouter.delete('/delete-progress', async (req: Request, res: Response) => {
  try {
    const { filename } = req.query;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid filename',
      });
    }

    const filepath = path.join(PROGRESS_DIR, filename);

    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Progress file not found',
      });
    }

    await fs.unlink(filepath);

    console.log(`[Progress] Deleted ${filepath}`);

    res.json({
      success: true,
      message: 'Progress file deleted successfully',
    });
  } catch (error) {
    console.error('[Progress] Error deleting progress file:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
