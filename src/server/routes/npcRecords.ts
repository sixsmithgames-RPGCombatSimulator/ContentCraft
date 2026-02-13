/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import { validateSchema } from '../middleware/validateSchema.js';
import { getNpcRecordsCollection } from '../config/mongo.js';

export const npcRecordsRouter = Router();

npcRecordsRouter.post('/', validateSchema('npc'), async (req, res, next) => {
  try {
    const collection = getNpcRecordsCollection();
    const now = new Date();

    const record = {
      _id: req.body._id || nanoid(),
      project_id: req.body.project_id,
      canonical_id: req.body.canonical_id,
      schemaVersion: res.locals.schemaVersion,
      raw: req.body.raw,
      normalized: req.body.normalized,
      provenance: req.body.provenance,
      auditTrail: req.body.auditTrail || [],
      tags: req.body.tags || [],
      created_at: now,
      updated_at: now,
    };

    await collection.insertOne(record);
    res.status(201).json({ success: true, record });
  } catch (error) {
    next(error);
  }
});

npcRecordsRouter.put('/:id', validateSchema('npc'), async (req, res, next) => {
  try {
    const collection = getNpcRecordsCollection();
    const now = new Date();

    const updates = {
      ...req.body,
      schemaVersion: res.locals.schemaVersion,
      updated_at: now,
    };

    const result = await collection.updateOne({ _id: req.params.id }, { $set: updates });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'NotFound' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

npcRecordsRouter.get('/:id', async (req, res, next) => {
  try {
    const collection = getNpcRecordsCollection();
    const record = await collection.findOne({ _id: req.params.id });

    if (!record) {
      return res.status(404).json({ success: false, error: 'NotFound' });
    }

    res.json({ success: true, record });
  } catch (error) {
    next(error);
  }
});

npcRecordsRouter.get('/', async (req, res, next) => {
  try {
    const collection = getNpcRecordsCollection();
    const { project_id, canonical_id, tag } = req.query;

    const query: Record<string, unknown> = {};

    if (project_id) query.project_id = project_id;
    if (canonical_id) query.canonical_id = canonical_id;
    if (tag) query.tags = tag;

    const records = await collection.find(query).toArray();
    res.json({ success: true, records });
  } catch (error) {
    next(error);
  }
});
