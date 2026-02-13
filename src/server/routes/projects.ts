/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Router } from 'express';
import { ProjectModel } from '../models/index.js';
import { ProjectSchema, PaginationSchema } from '../../shared/validators/index.js';
import { APIResponse, PaginatedResponse, ProjectStatus } from '../../shared/types/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const projectRouter = Router();

// Apply auth middleware to all routes
projectRouter.use(authMiddleware);

projectRouter.get('/', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const pagination = PaginationSchema.parse(req.query);
    const { projects, total } = await ProjectModel.findAll(authReq.userId, pagination);

    const response: PaginatedResponse<typeof projects[0]> = {
      success: true,
      data: projects,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching projects:', error);
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch projects',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

projectRouter.get('/:id', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const project = await ProjectModel.findById(authReq.userId, id);

    if (!project) {
      const response: APIResponse = {
        success: false,
        error: 'Project not found'
      };
      return res.status(404).json(response);
    }

    const response: APIResponse<typeof project> = {
      success: true,
      data: project
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch project',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});

projectRouter.post('/', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const payload = ProjectSchema.parse(req.body);
    const project = await ProjectModel.create(authReq.userId, {
      title: payload.title,
      description: payload.description ?? '',
      type: payload.type,
      status: payload.status ?? ProjectStatus.DRAFT,
    });

    const response: APIResponse<typeof project> = {
      success: true,
      data: project,
      message: 'Project created successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to create project',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(400).json(response);
  }
});

projectRouter.put('/:id', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const validatedData = ProjectSchema.partial().parse(req.body);
    const project = await ProjectModel.update(authReq.userId, id, validatedData);

    if (!project) {
      const response: APIResponse = {
        success: false,
        error: 'Project not found'
      };
      return res.status(404).json(response);
    }

    const response: APIResponse<typeof project> = {
      success: true,
      data: project,
      message: 'Project updated successfully'
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to update project',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(400).json(response);
  }
});

projectRouter.delete('/:id', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const deleted = await ProjectModel.delete(authReq.userId, id);

    if (!deleted) {
      const response: APIResponse = {
        success: false,
        error: 'Project not found'
      };
      return res.status(404).json(response);
    }

    const response: APIResponse = {
      success: true,
      message: 'Project deleted successfully'
    };

    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: 'Failed to delete project',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  }
});