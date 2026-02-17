/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentBlock, ContentType } from '../../shared/types/index.js';

// Route to MongoDB when MONGODB_URI is configured (production/Vercel),
// otherwise use SQLite (local development).
const usesMongo = (): boolean => !!process.env.MONGODB_URI;

// ── MongoDB path ──────────────────────────────────────────────────────────────

import { getDb } from '../config/mongo.js';

interface ContentBlockDocument {
  _id: string;
  userId: string;
  projectId: string;
  parentId?: string;
  title: string;
  content: string;
  type: string;
  order: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function getMongoCollection() {
  return getDb().collection<ContentBlockDocument>('content_blocks');
}

function mapMongoDocToBlock(doc: ContentBlockDocument): ContentBlock {
  return {
    id: doc._id,
    projectId: doc.projectId,
    parentId: doc.parentId,
    title: doc.title,
    content: doc.content || '',
    type: doc.type as ContentType,
    order: doc.order || 0,
    metadata: doc.metadata || {},
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt)
  };
}

// ── SQLite path ───────────────────────────────────────────────────────────────

import { dbGet, dbAll, dbRun } from './database.js';

interface ContentBlockRow {
  id: string;
  user_id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  content: string;
  type: string;
  order_num: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function mapSqliteRowToBlock(row: ContentBlockRow): ContentBlock {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id ?? undefined,
    title: row.title,
    content: row.content || '',
    type: row.type as ContentType,
    order: row.order_num || 0,
    metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

// ── Public model ──────────────────────────────────────────────────────────────

export class ContentBlockModel {
  static async create(
    userId: string,
    data: Omit<ContentBlock, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentBlock> {
    const id = uuidv4();
    const now = new Date().toISOString();

    if (usesMongo()) {
      const doc: ContentBlockDocument = {
        _id: id,
        userId,
        projectId: data.projectId,
        parentId: data.parentId,
        title: data.title,
        content: data.content || '',
        type: data.type,
        order: data.order || 0,
        metadata: data.metadata || {},
        createdAt: now,
        updatedAt: now
      };
      await getMongoCollection().insertOne(doc);
      return mapMongoDocToBlock(doc);
    }

    const metadataJson = JSON.stringify(data.metadata || {});
    await dbRun(
      `INSERT INTO content_blocks
         (id, user_id, project_id, parent_id, title, content, type, order_num, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, data.projectId, data.parentId ?? null, data.title,
       data.content || '', data.type, data.order || 0, metadataJson, now, now]
    );
    const row = await dbGet('SELECT * FROM content_blocks WHERE id = ?', [id]);
    return mapSqliteRowToBlock(row);
  }

  static async findById(userId: string, id: string): Promise<ContentBlock | null> {
    if (usesMongo()) {
      const doc = await getMongoCollection().findOne({ _id: id, userId });
      if (!doc) return null;
      return mapMongoDocToBlock(doc);
    }

    const row = await dbGet(
      'SELECT * FROM content_blocks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!row) return null;
    return mapSqliteRowToBlock(row);
  }

  static async findByProjectId(
    userId: string,
    projectId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ blocks: ContentBlock[]; total: number }> {
    const { page = 1, limit = 50 } = options;

    if (usesMongo()) {
      const skip = (page - 1) * limit;
      const [docs, total] = await Promise.all([
        getMongoCollection()
          .find({ userId, projectId })
          .sort({ order: 1, createdAt: 1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        getMongoCollection().countDocuments({ userId, projectId })
      ]);
      return { blocks: docs.map(mapMongoDocToBlock), total };
    }

    const offset = (page - 1) * limit;
    const [rows, countRow] = await Promise.all([
      dbAll(
        `SELECT * FROM content_blocks
         WHERE user_id = ? AND project_id = ?
         ORDER BY order_num ASC, created_at ASC
         LIMIT ? OFFSET ?`,
        [userId, projectId, limit, offset]
      ),
      dbGet(
        'SELECT COUNT(*) as count FROM content_blocks WHERE user_id = ? AND project_id = ?',
        [userId, projectId]
      )
    ]);
    return {
      blocks: rows.map(mapSqliteRowToBlock),
      total: countRow?.count ?? 0
    };
  }

  static async findByParentId(userId: string, parentId: string): Promise<ContentBlock[]> {
    if (usesMongo()) {
      const docs = await getMongoCollection()
        .find({ userId, parentId })
        .sort({ order: 1, createdAt: 1 })
        .toArray();
      return docs.map(mapMongoDocToBlock);
    }

    const rows = await dbAll(
      `SELECT * FROM content_blocks
       WHERE user_id = ? AND parent_id = ?
       ORDER BY order_num ASC, created_at ASC`,
      [userId, parentId]
    );
    return rows.map(mapSqliteRowToBlock);
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<ContentBlock, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ContentBlock | null> {
    const now = new Date().toISOString();

    if (usesMongo()) {
      const $set: Partial<ContentBlockDocument> = { updatedAt: now };
      if (data.parentId !== undefined) $set.parentId = data.parentId;
      if (data.title !== undefined) $set.title = data.title;
      if (data.content !== undefined) $set.content = data.content;
      if (data.type !== undefined) $set.type = data.type;
      if (data.order !== undefined) $set.order = data.order;
      if (data.metadata !== undefined) $set.metadata = data.metadata;

      const result = await getMongoCollection().findOneAndUpdate(
        { _id: id, userId },
        { $set },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      return mapMongoDocToBlock(result);
    }

    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];
    if (data.parentId !== undefined) { fields.push('parent_id = ?'); values.push(data.parentId ?? null); }
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.order !== undefined) { fields.push('order_num = ?'); values.push(data.order); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(data.metadata)); }

    values.push(id, userId);
    await dbRun(
      `UPDATE content_blocks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values as string[]
    );
    return this.findById(userId, id);
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    if (usesMongo()) {
      const result = await getMongoCollection().deleteOne({ _id: id, userId });
      return result.deletedCount > 0;
    }

    const result = await dbRun(
      'DELETE FROM content_blocks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes > 0;
  }

  static async reorder(userId: string, projectId: string, blockIds: string[]): Promise<boolean> {
    try {
      if (usesMongo()) {
        await Promise.all(
          blockIds.map((blockId, i) =>
            getMongoCollection().updateOne(
              { _id: blockId, projectId, userId },
              { $set: { order: i, updatedAt: new Date().toISOString() } }
            )
          )
        );
        return true;
      }

      const now = new Date().toISOString();
      await Promise.all(
        blockIds.map((blockId, i) =>
          dbRun(
            'UPDATE content_blocks SET order_num = ?, updated_at = ? WHERE id = ? AND project_id = ? AND user_id = ?',
            [i, now, blockId, projectId, userId]
          )
        )
      );
      return true;
    } catch (error) {
      console.error('Error reordering blocks:', error);
      return false;
    }
  }
}
