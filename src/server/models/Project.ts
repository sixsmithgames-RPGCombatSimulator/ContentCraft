/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { v4 as uuidv4 } from 'uuid';
import { Project, ProjectType, ProjectStatus } from '../../shared/types/index.js';

// Route to MongoDB when MONGODB_URI is configured (production/Vercel),
// otherwise use SQLite (local development).
const usesMongo = (): boolean => !!process.env.MONGODB_URI;

// ── MongoDB path ──────────────────────────────────────────────────────────────

import { getDb } from '../config/mongo.js';

interface ProjectDocument {
  _id: string;
  userId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function getMongoCollection() {
  return getDb().collection<ProjectDocument>('projects');
}

function mapMongoDocToProject(doc: ProjectDocument): Project {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description || '',
    type: doc.type as ProjectType,
    status: doc.status as ProjectStatus,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt)
  };
}

// ── SQLite path ───────────────────────────────────────────────────────────────

import { dbGet, dbAll, dbRun } from './database.js';

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapSqliteRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    type: row.type as ProjectType,
    status: row.status as ProjectStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

// ── Public model ──────────────────────────────────────────────────────────────

export class ProjectModel {
  static async create(
    userId: string,
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

    if (usesMongo()) {
      const doc: ProjectDocument = {
        _id: id,
        userId,
        title: data.title,
        description: data.description ?? '',
        type: data.type,
        status: data.status,
        createdAt: now,
        updatedAt: now
      };
      await getMongoCollection().insertOne(doc);
      return mapMongoDocToProject(doc);
    }

    await dbRun(
      `INSERT INTO projects (id, user_id, title, description, type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, data.title, data.description ?? '', data.type, data.status, now, now]
    );
    const row = await dbGet('SELECT * FROM projects WHERE id = ?', [id]);
    return mapSqliteRowToProject(row);
  }

  static async findById(userId: string, id: string): Promise<Project | null> {
    if (usesMongo()) {
      const doc = await getMongoCollection().findOne({ _id: id, userId });
      if (!doc) return null;
      return mapMongoDocToProject(doc);
    }

    const row = await dbGet(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!row) return null;
    return mapSqliteRowToProject(row);
  }

  static async findAll(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ projects: Project[]; total: number }> {
    const { page = 1, limit = 20 } = options;

    if (usesMongo()) {
      const skip = (page - 1) * limit;
      const [docs, total] = await Promise.all([
        getMongoCollection()
          .find({ userId })
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        getMongoCollection().countDocuments({ userId })
      ]);
      return { projects: docs.map(mapMongoDocToProject), total };
    }

    const offset = (page - 1) * limit;
    const [rows, countRow] = await Promise.all([
      dbAll(
        'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      ),
      dbGet('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId])
    ]);
    return {
      projects: rows.map(mapSqliteRowToProject),
      total: countRow?.count ?? 0
    };
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Project | null> {
    const now = new Date().toISOString();

    if (usesMongo()) {
      const $set: Partial<ProjectDocument> = { updatedAt: now };
      if (data.title !== undefined) $set.title = data.title;
      if (data.description !== undefined) $set.description = data.description;
      if (data.type !== undefined) $set.type = data.type;
      if (data.status !== undefined) $set.status = data.status;

      const result = await getMongoCollection().findOneAndUpdate(
        { _id: id, userId },
        { $set },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      return mapMongoDocToProject(result);
    }

    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }

    values.push(id, userId);
    await dbRun(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
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
      'DELETE FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes > 0;
  }
}
