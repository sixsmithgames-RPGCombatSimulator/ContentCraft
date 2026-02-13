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
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIPromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  category: PromptCategory;
  createdAt: Date;
  updatedAt: Date;
}

export interface FactCheck {
  id: string;
  contentBlockId: string;
  claim: string;
  sources: Source[];
  status: FactCheckStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  type: SourceType;
  credibility: number;
  dateAccessed: Date;
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
  STORY_ARC = 'story-arc',
  MONSTER = 'monster'
}

export enum PromptCategory {
  CREATIVE_WRITING = 'creative-writing',
  FACT_CHECKING = 'fact-checking',
  RESEARCH = 'research',
  DND_CONTENT = 'dnd-content',
  EDITING = 'editing',
  FORMATTING = 'formatting'
}

export enum FactCheckStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  DISPUTED = 'disputed',
  NEEDS_REVIEW = 'needs-review'
}

export enum SourceType {
  ACADEMIC = 'academic',
  NEWS = 'news',
  GOVERNMENT = 'government',
  EXPERT = 'expert',
  WIKI = 'wiki',
  OTHER = 'other'
}

export interface APIResponse<T = any> {
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