/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, Search, Filter, BookOpen, ArrowUpRight, Layers, ClipboardCopy } from 'lucide-react';
import { ProjectCard } from '../components/ProjectCard';
import { Project, ProjectType } from '../types';
import { projectApi } from '../services/api';

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ProjectType | 'all'>('all');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await projectApi.getAll();
      if (response.success && response.data) {
        setProjects(response.data);
      } else {
        setError(response.error || 'Failed to load projects');
      }
    } catch (err) {
      setError('Failed to load projects');
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const response = await projectApi.delete(id);
      if (response.success) {
        setProjects(projects.filter(p => p.id !== id));
      } else {
        alert(response.error || 'Failed to delete project');
      }
    } catch (err) {
      alert('Failed to delete project');
      console.error('Error deleting project:', err);
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || project.type === filterType;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadProjects}
          className="btn-primary"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
          <p className="text-gray-600 mt-2">Manage and organize your content creation projects</p>
        </div>

        <Link to="/projects/new" className="btn-primary flex items-center space-x-2">
          <PlusIcon className="w-5 h-5" />
          <span>New Project</span>
        </Link>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ProjectType | 'all')}
            className="input pl-10 min-w-40"
          >
            <option value="all">All Types</option>
            <option value={ProjectType.FICTION}>Fiction</option>
            <option value={ProjectType.NON_FICTION}>Non-Fiction</option>
            <option value={ProjectType.DND_ADVENTURE}>D&D Adventure</option>
            <option value={ProjectType.DND_HOMEBREW}>D&D Homebrew</option>
            <option value={ProjectType.HEALTH_ADVICE}>Health Advice</option>
            <option value={ProjectType.RESEARCH}>Research</option>
          </select>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="py-12">
          {projects.length === 0 ? (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 mb-5">
                  <BookOpen className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-3">Welcome to ContentCraft</h3>
                <p className="text-gray-500 text-base leading-relaxed">
                  Organize your writing projects and generate AI-ready prompts. Use the{' '}
                  <span className="font-medium text-gray-700">New Project</span> button above to get started.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                  <Layers className="w-5 h-5 text-primary-500 mb-3" />
                  <h4 className="font-medium text-gray-900 mb-1 text-sm">Organize Content</h4>
                  <p className="text-gray-500 text-xs leading-relaxed">Structure your project with content blocks — scenes, chapters, NPCs, locations, and more.</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                  <ClipboardCopy className="w-5 h-5 text-primary-500 mb-3" />
                  <h4 className="font-medium text-gray-900 mb-1 text-sm">Copy to AI</h4>
                  <p className="text-gray-500 text-xs leading-relaxed">Generate prompts from your content and paste them directly into your preferred AI assistant.</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                  <ArrowUpRight className="w-5 h-5 text-primary-500 mb-3" />
                  <h4 className="font-medium text-gray-900 mb-1 text-sm">Iterate Fast</h4>
                  <p className="text-gray-500 text-xs leading-relaxed">Refine AI responses, fact-check content, and build your world across multiple sessions.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">No projects match your filters</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDeleteProject}
            />
          ))}
        </div>
      )}
    </div>
  );
};