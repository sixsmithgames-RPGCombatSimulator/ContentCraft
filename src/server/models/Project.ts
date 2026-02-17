/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { v4 as uuidv4 } from 'uuid';
import { Project, ProjectType, ProjectStatus } from '../../shared/types/index.js';
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

function getCollection() {
  return getDb().collection<ProjectDocument>('projects');
}

export class ProjectModel {
  static async create(
    userId: string,
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

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

    await getCollection().insertOne(doc);
    return this.mapDocToProject(doc);
  }

  static async findById(userId: string, id: string): Promise<Project | null> {
    const doc = await getCollection().findOne({ _id: id, userId });
    if (!doc) return null;
    return this.mapDocToProject(doc);
  }

  static async findAll(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ projects: Project[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      getCollection()
        .find({ userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      getCollection().countDocuments({ userId })
    ]);

    return { projects: docs.map(d => this.mapDocToProject(d)), total };
  }

  static async update(
    userId: string,
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Project | null> {
    const now = new Date().toISOString();
    const $set: Partial<ProjectDocument> = { updatedAt: now };

    if (data.title !== undefined) $set.title = data.title;
    if (data.description !== undefined) $set.description = data.description;
    if (data.type !== undefined) $set.type = data.type;
    if (data.status !== undefined) $set.status = data.status;

    const result = await getCollection().findOneAndUpdate(
      { _id: id, userId },
      { $set },
      { returnDocument: 'after' }
    );

    if (!result) return null;
    return this.mapDocToProject(result);
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const result = await getCollection().deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  private static mapDocToProject(doc: ProjectDocument): Project {
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
}
