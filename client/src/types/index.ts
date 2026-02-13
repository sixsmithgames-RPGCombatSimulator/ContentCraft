/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface Project {
  id: string;
  title: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentBlock {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  content: string;
  type: ContentType;
  order: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProjectType {
  FICTION = 'fiction',
  NON_FICTION = 'non-fiction',
  DND_ADVENTURE = 'dnd-adventure',
  DND_HOMEBREW = 'dnd-homebrew',
  HEALTH_ADVICE = 'health-advice',
  RESEARCH = 'research'
}

export enum ProjectStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in-progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  PUBLISHED = 'published'
}

// export * from './authority'; // TODO: Create authority types file
// export * from './canon'; // TODO: Create canon types file
export * from './npc';
// export * from './encounter/generated'; // TODO: Generate encounter types

export enum ContentType {
  TEXT = 'text',
  OUTLINE = 'outline',
  CHAPTER = 'chapter',
  SECTION = 'section',
  CHARACTER = 'character',
  LOCATION = 'location',
  ITEM = 'item',
  STAT_BLOCK = 'stat-block',
  FACT = 'fact',
  STORY_ARC = 'story-arc'
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}