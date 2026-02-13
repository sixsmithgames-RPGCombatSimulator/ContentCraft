/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProjectType, ProjectStatus } from '../types';
import { projectApi } from '../services/api';

export const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: ProjectType.FICTION,
    status: ProjectStatus.DRAFT,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Project title is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await projectApi.create(formData);

      if (response.success && response.data) {
        navigate(`/projects/${response.data.id}`);
      } else {
        setError(response.error || 'Failed to create project');
      }
    } catch (err) {
      setError('Failed to create project');
      console.error('Error creating project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <p className="text-gray-600 mt-2">Start a new content creation project</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Project Title *
          </label>
          <input
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="input"
            placeholder="Enter your project title..."
            required
          />
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
            Project Type *
          </label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="input"
            required
          >
            <option value={ProjectType.FICTION}>Fiction</option>
            <option value={ProjectType.NON_FICTION}>Non-Fiction</option>
            <option value={ProjectType.DND_ADVENTURE}>D&D Adventure</option>
            <option value={ProjectType.DND_HOMEBREW}>D&D Homebrew</option>
            <option value={ProjectType.HEALTH_ADVICE}>Health Advice</option>
            <option value={ProjectType.RESEARCH}>Research</option>
          </select>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="input"
            rows={4}
            placeholder="Describe your project (optional)..."
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
            Initial Status
          </label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="input"
          >
            <option value={ProjectStatus.DRAFT}>Draft</option>
            <option value={ProjectStatus.IN_PROGRESS}>In Progress</option>
          </select>
        </div>

        <div className="flex items-center justify-end space-x-4 pt-6 border-t">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
};