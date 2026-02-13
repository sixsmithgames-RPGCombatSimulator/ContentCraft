/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { dbGet, dbAll, dbRun } from './database.js';
import { v4 as uuidv4 } from 'uuid';
import { ContentBlock, ContentType } from '../../shared/types/index.js';

export class ContentBlockModel {
  static async create(
    userId: string,
    data: Omit<ContentBlock, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentBlock> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await dbRun(`
      INSERT INTO content_blocks (id, user_id, project_id, parent_id, title, content, type, order_num, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      userId,
      data.projectId,
      data.parentId || null,
      data.title,
      data.content || '',
      data.type,
      data.order || 0,
      JSON.stringify(data.metadata || {}),
      now,
      now
    ]);

    const block = await this.findById(userId, id);
    return block!;
  }

  static async findById(userId: string, id: string): Promise<ContentBlock | null> {
    const row = await dbGet(
      'SELECT * FROM content_blocks WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!row) return null;

    return this.mapRowToContentBlock(row);
  }

  static async findByProjectId(
    userId: string,
    projectId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ blocks: ContentBlock[]; total: number }> {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const countRow = await dbGet(
      'SELECT COUNT(*) as count FROM content_blocks WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );
    const total = countRow.count;

    const rows = await dbAll(`
      SELECT * FROM content_blocks
      WHERE project_id = ? AND user_id = ?
      ORDER BY order_num ASC, created_at ASC
      LIMIT ? OFFSET ?
    `, [projectId, userId, limit, offset]);

    const blocks = rows.map(row => this.mapRowToContentBlock(row));

    return { blocks, total };
  }

  static async findByParentId(userId: string, parentId: string): Promise<ContentBlock[]> {
    const rows = await dbAll(`
      SELECT * FROM content_blocks
      WHERE parent_id = ? AND user_id = ?
      ORDER BY order_num ASC, created_at ASC
    `, [parentId, userId]);

    return rows.map(row => this.mapRowToContentBlock(row));
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<ContentBlock, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ContentBlock | null> {
    const existing = await this.findById(userId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates = [];
    const values = [];

    if (data.parentId !== undefined) {
      updates.push('parent_id = ?');
      values.push(data.parentId);
    }
    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.content !== undefined) {
      updates.push('content = ?');
      values.push(data.content);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.order !== undefined) {
      updates.push('order_num = ?');
      values.push(data.order);
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(userId);

    await dbRun(`
      UPDATE content_blocks
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `, values);

    const block = await this.findById(userId, id);
    return block!;
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const result = await dbRun(
      'DELETE FROM content_blocks WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.changes! > 0;
  }

  static async reorder(userId: string, projectId: string, blockIds: string[]): Promise<boolean> {
    try {
      for (let i = 0; i < blockIds.length; i++) {
        await dbRun(
          'UPDATE content_blocks SET order_num = ? WHERE id = ? AND project_id = ? AND user_id = ?',
          [i, blockIds[i], projectId, userId]
        );
      }
      return true;
    } catch (error) {
      console.error('Error reordering blocks:', error);
      return false;
    }
  }

  private static mapRowToContentBlock(row: any): ContentBlock {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      content: row.content || '',
      type: row.type as ContentType,
      order: row.order_num || 0,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}