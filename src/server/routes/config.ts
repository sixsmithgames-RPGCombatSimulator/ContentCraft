/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { getDb } from '../config/mongo.js';

export const configRouter = Router();

/**
 * GET /api/config/authority
 * Get the authority configuration document
 */
configRouter.get('/authority', async (req, res, next) => {
  try {
    const db = getDb();
    const authorityCollection = db.collection<{ _id: string; [key: string]: unknown }>('authority');
    const authority = await authorityCollection.findOne({ _id: 'authority' });

    if (!authority) {
      return res.status(404).json({ error: 'Authority document not found' });
    }

    res.json(authority);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/config/authority
 * Update the authority configuration
 */
configRouter.put('/authority', async (req, res, next) => {
  try {
    const updates = req.body;

    // Remove _id if present to avoid update errors
    delete updates._id;

    const db = getDb();
    const authorityCollection = db.collection<{ _id: string; [key: string]: unknown }>('authority');
    await authorityCollection.updateOne({ _id: 'authority' }, { $set: updates }, { upsert: true });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/config/schemas
 * List available content type schemas
 */
configRouter.get('/schemas', async (req, res, next) => {
  try {
    const schemas = [
      {
        type: 'encounter',
        name: 'Combat Encounter',
        description: 'A tactical combat scenario with enemies, terrain, and objectives',
      },
      {
        type: 'npc',
        name: 'Non-Player Character',
        description: 'A fully statted NPC with personality and motivations',
      },
      {
        type: 'item',
        name: 'Magic Item',
        description: 'A magic item with properties and mechanics',
      },
      {
        type: 'scene',
        name: 'Narrative Scene',
        description: 'A social, exploration, or investigation scene',
      },
      {
        type: 'adventure',
        name: 'Full Adventure',
        description: 'A multi-act adventure with NPCs, locations, and encounters',
      },
    ];

    res.json(schemas);
  } catch (error) {
    next(error);
  }
});
