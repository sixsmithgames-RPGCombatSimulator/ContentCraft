/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { z } from 'zod';
import { ProjectType, ProjectStatus, ContentType, PromptCategory, FactCheckStatus, SourceType } from '../types/index.js';
export const ProjectSchema = z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(1000),
    type: z.nativeEnum(ProjectType),
    status: z.nativeEnum(ProjectStatus).optional().default(ProjectStatus.DRAFT)
});
export const ContentBlockSchema = z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    content: z.string().max(50000),
    type: z.nativeEnum(ContentType),
    order: z.number().int().min(0).optional().default(0),
    metadata: z.record(z.any()).optional().default({})
});
export const AIPromptTemplateSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    template: z.string().min(1),
    variables: z.array(z.string()).max(20),
    category: z.nativeEnum(PromptCategory)
});
export const FactCheckSchema = z.object({
    id: z.string().uuid().optional(),
    contentBlockId: z.string().uuid(),
    claim: z.string().min(1),
    sources: z.array(z.object({
        id: z.string().uuid().optional(),
        title: z.string().min(1),
        url: z.string().url(),
        type: z.nativeEnum(SourceType),
        credibility: z.number().min(0).max(10),
        dateAccessed: z.date().optional()
    })).optional().default([]),
    status: z.nativeEnum(FactCheckStatus).optional().default(FactCheckStatus.PENDING),
    notes: z.string().optional().default('')
});
export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});
export const AIGenerateRequestSchema = z.object({
    templateId: z.string().uuid(),
    variables: z.record(z.string()),
    service: z.enum(['openai', 'anthropic', 'google']).optional().default('anthropic')
});
