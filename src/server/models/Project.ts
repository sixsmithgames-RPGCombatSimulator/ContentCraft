/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { dbGet, dbAll, dbRun } from './database.js';
import { v4 as uuidv4 } from 'uuid';
import { Project, ProjectType, ProjectStatus } from '../../shared/types/index.js';

export class ProjectModel {
  static async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await dbRun(`
      INSERT INTO projects (id, title, description, type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, data.title, data.description, data.type, data.status, now, now]);

    const project = await this.findById(id);
    return project!;
  }

  static async findById(id: string): Promise<Project | null> {
    const row = await dbGet('SELECT * FROM projects WHERE id = ?', [id]);

    if (!row) return null;

    return this.mapRowToProject(row);
  }

  static async findAll(options: { page?: number; limit?: number } = {}): Promise<{ projects: Project[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const countRow = await dbGet('SELECT COUNT(*) as count FROM projects');
    const total = countRow.count;

    const rows = await dbAll(`
      SELECT * FROM projects
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const projects = rows.map(row => this.mapRowToProject(row));

    return { projects, total };
  }

  static async update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Project | null> {
    const existing = await this.findById(id);
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

    await dbRun(`
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ?
    `, values);

    const project = await this.findById(id);
    return project!;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await dbRun('DELETE FROM projects WHERE id = ?', [id]);
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