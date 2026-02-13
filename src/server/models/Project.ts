/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { dbGet, dbAll, dbRun } from './database.js';
import { v4 as uuidv4 } from 'uuid';
import { Project, ProjectType, ProjectStatus } from '../../shared/types/index.js';

export class ProjectModel {
  static async create(
    userId: string,
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await dbRun(`
      INSERT INTO projects (id, user_id, title, description, type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, userId, data.title, data.description, data.type, data.status, now, now]);

    const project = await this.findById(userId, id);
    return project!;
  }

  static async findById(userId: string, id: string): Promise<Project | null> {
    const row = await dbGet(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!row) return null;

    return this.mapRowToProject(row);
  }

  static async findAll(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ projects: Project[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const countRow = await dbGet(
      'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
      [userId]
    );
    const total = countRow.count;

    const rows = await dbAll(`
      SELECT * FROM projects
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const projects = rows.map(row => this.mapRowToProject(row));

    return { projects, total };
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Project | null> {
    const existing = await this.findById(userId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates = [];
    const values = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(userId);

    await dbRun(`
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `, values);

    const project = await this.findById(userId, id);
    return project!;
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const result = await dbRun(
      'DELETE FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes! > 0;
  }

  private static mapRowToProject(row: any): Project {
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
}