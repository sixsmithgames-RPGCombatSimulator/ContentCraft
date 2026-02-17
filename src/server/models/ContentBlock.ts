/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentBlock, ContentType } from '../../shared/types/index.js';
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

function getCollection() {
  return getDb().collection<ContentBlockDocument>('content_blocks');
}

export class ContentBlockModel {
  static async create(
    userId: string,
    data: Omit<ContentBlock, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentBlock> {
    const id = uuidv4();
    const now = new Date().toISOString();

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

    await getCollection().insertOne(doc);
    return this.mapDocToBlock(doc);
  }

  static async findById(userId: string, id: string): Promise<ContentBlock | null> {
    const doc = await getCollection().findOne({ _id: id, userId });
    if (!doc) return null;
    return this.mapDocToBlock(doc);
  }

  static async findByProjectId(
    userId: string,
    projectId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ blocks: ContentBlock[]; total: number }> {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      getCollection()
        .find({ userId, projectId })
        .sort({ order: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      getCollection().countDocuments({ userId, projectId })
    ]);

    return { blocks: docs.map(d => this.mapDocToBlock(d)), total };
  }

  static async findByParentId(userId: string, parentId: string): Promise<ContentBlock[]> {
    const docs = await getCollection()
      .find({ userId, parentId })
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    return docs.map(d => this.mapDocToBlock(d));
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<ContentBlock, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ContentBlock | null> {
    const now = new Date().toISOString();
    const $set: Partial<ContentBlockDocument> = { updatedAt: now };

    if (data.parentId !== undefined) $set.parentId = data.parentId;
    if (data.title !== undefined) $set.title = data.title;
    if (data.content !== undefined) $set.content = data.content;
    if (data.type !== undefined) $set.type = data.type;
    if (data.order !== undefined) $set.order = data.order;
    if (data.metadata !== undefined) $set.metadata = data.metadata;

    const result = await getCollection().findOneAndUpdate(
      { _id: id, userId },
      { $set },
      { returnDocument: 'after' }
    );

    if (!result) return null;
    return this.mapDocToBlock(result);
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const result = await getCollection().deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  static async reorder(userId: string, projectId: string, blockIds: string[]): Promise<boolean> {
    try {
      await Promise.all(
        blockIds.map((blockId, i) =>
          getCollection().updateOne(
            { _id: blockId, projectId, userId },
            { $set: { order: i, updatedAt: new Date().toISOString() } }
          )
        )
      );
      return true;
    } catch (error) {
      console.error('Error reordering blocks:', error);
      return false;
    }
  }

  private static mapDocToBlock(doc: ContentBlockDocument): ContentBlock {
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
}
