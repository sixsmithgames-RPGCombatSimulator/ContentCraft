/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import axios from 'axios';
import { Project, ContentBlock, APIResponse, PaginatedResponse } from '../types';

// Use relative URL - works in both development (via Vite proxy) and production (same-origin)
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export const projectApi = {
  getAll: async (page = 1, limit = 20): Promise<PaginatedResponse<Project>> => {
    const response = await api.get(`/projects?page=${page}&limit=${limit}`);
    return response.data;
  },

  getById: async (id: string): Promise<APIResponse<Project>> => {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },

  create: async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<Project>> => {
    const response = await api.post('/projects', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<APIResponse<Project>> => {
    const response = await api.put(`/projects/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<APIResponse> => {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },
};

export const contentApi = {
  getByProjectId: async (projectId: string, page = 1, limit = 50): Promise<PaginatedResponse<ContentBlock>> => {
    const response = await api.get(`/content/project/${projectId}?page=${page}&limit=${limit}`);
    return response.data;
  },

  getById: async (id: string): Promise<APIResponse<ContentBlock>> => {
    const response = await api.get(`/content/${id}`);
    return response.data;
  },

  getChildren: async (id: string): Promise<APIResponse<ContentBlock[]>> => {
    const response = await api.get(`/content/${id}/children`);
    return response.data;
  },

  create: async (data: Omit<ContentBlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<ContentBlock>> => {
    const response = await api.post('/content', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Omit<ContentBlock, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Promise<APIResponse<ContentBlock>> => {
    const response = await api.put(`/content/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<APIResponse> => {
    const response = await api.delete(`/content/${id}`);
    return response.data;
  },

  reorder: async (projectId: string, blockIds: string[]): Promise<APIResponse> => {
    const response = await api.post(`/content/reorder/${projectId}`, { blockIds });
    return response.data;
  },
};

export const healthApi = {
  check: async (): Promise<APIResponse> => {
    const response = await api.get('/health');
    return response.data;
  },
};