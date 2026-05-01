/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProjectType, ProjectStatus } from '../types';
import { isLocalMode } from '../utils/localMode';
import { useAppAuth } from '../utils/useLocalAuth';
import { projectApi } from '../services/api';
import { getProductConfig } from '../config/products';

/** Human-readable labels for project types */
const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  [ProjectType.FICTION]: 'Fiction',
  [ProjectType.NON_FICTION]: 'Non-Fiction',
  [ProjectType.DND_ADVENTURE]: 'D&D Adventure',
  [ProjectType.DND_HOMEBREW]: 'D&D Homebrew',
  [ProjectType.STORY_ARC]: 'Story Arc',
  [ProjectType.SCENE]: 'Scene',
  [ProjectType.OUTLINE]: 'Outline',
  [ProjectType.CHAPTER]: 'Chapter',
  [ProjectType.MEMOIR]: 'Memoir',
  [ProjectType.JOURNAL]: 'Journal Entry',
  [ProjectType.OTHER_WRITING]: 'Other Writing',
};

export const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const product = getProductConfig();
  const localMode = isLocalMode();
  const { getToken } = useAppAuth();

  // Filter available project types based on product config
  const availableTypes = useMemo(() => {
    const allTypes = Object.values(ProjectType);
    return allTypes.filter(type => product.projectTypes.includes(type));
  }, [product.projectTypes]);

  // Default to first available type if FICTION isn't valid for this product
  const defaultType = availableTypes.includes(ProjectType.FICTION)
    ? ProjectType.FICTION
    : (availableTypes[0] ?? ProjectType.FICTION);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: defaultType,
    status: ProjectStatus.DRAFT,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError(`${product.workspaceNoun} title is required`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Add product context to the form data
      const projectData = {
        ...formData,
        productKey: product.key,
        workspaceType: product.defaultWorkspaceType,
      };

      const token = localMode ? null : await getToken();
      if (!localMode && !token) {
        throw new Error('Authentication required. Please sign in.');
      }

      const response = await projectApi.create(projectData, { token });

      if (response.success && response.data) {
        navigate(`/projects/${response.data.id}`);
      } else {
        setError(response.error || `Failed to create ${product.workspaceNoun.toLowerCase()}`);
      }
    } catch (err) {
      setError(`Failed to create ${product.workspaceNoun.toLowerCase()}`);
      console.error('Error creating project:', err);
    } finally {
      setLoading(false);
    }
  };

  type FormField = 'title' | 'description' | 'type' | 'status';
  const handleChange = <K extends FormField>(field: K, value: typeof formData[K]) => {
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
          <h1 className="text-3xl font-bold text-gray-900">{product.primaryCta}</h1>
          <p className="text-gray-600 mt-2">Start a new content creation {product.workspaceNoun.toLowerCase()}</p>
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
            {product.workspaceNoun} Title *
          </label>
          <input
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="input"
            placeholder={`Enter your ${product.workspaceNoun.toLowerCase()} title...`}
            required
          />
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
            {product.workspaceNoun} Type *
          </label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value as ProjectType)}
            className="input"
            required
          >
            {availableTypes.map(type => (
              <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>
            ))}
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
            placeholder={`Describe your ${product.workspaceNoun.toLowerCase()} (optional)...`}
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
            Initial Status
          </label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value as ProjectStatus)}
            className="input"
            required
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
            {loading ? 'Creating...' : product.primaryCta}
          </button>
        </div>
      </form>
    </div>
  );
};