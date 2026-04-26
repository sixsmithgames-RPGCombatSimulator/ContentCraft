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
import { getProductConfig } from '../config/products';

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ProjectType | 'all'>('all');
  const product = getProductConfig();

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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Your {product.workspaceNounPlural}</h1>
        <p className="text-gray-600 mt-2">Manage and organize your content creation {product.workspaceNounPlural.toLowerCase()}</p>
      </div>

      {projects.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={`Search ${product.workspaceNounPlural.toLowerCase()}...`}
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

          <Link
            to="/projects/new"
            className="group relative min-h-[132px] overflow-hidden rounded-2xl border border-dashed border-primary-200 bg-gradient-to-br from-primary-50 via-white to-slate-50 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg dark:border-primary-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-primary-950/30"
          >
            <div className="absolute right-5 top-1 text-[6rem] font-extralight leading-none text-primary-100 transition-colors group-hover:text-primary-200 dark:text-primary-400/10 dark:group-hover:text-primary-300/20">
              +
            </div>
            <div className="relative flex h-full flex-col justify-between">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-primary-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-blue-300">
                <PlusIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">New {product.workspaceNoun}</h3>
                <p className="mt-1 max-w-[16rem] text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                  Start something new without leaving your {product.workspaceNoun.toLowerCase()} overview.
                </p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <div className="py-12">
          {projects.length === 0 ? (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 mb-5">
                  <BookOpen className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-3">Welcome to {product.name}</h3>
                <p className="text-gray-500 text-base leading-relaxed">
                  {product.emptyStateBody}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  to="/projects/new"
                  className="group relative overflow-hidden rounded-xl border border-dashed border-primary-200 bg-gradient-to-br from-primary-50 via-white to-primary-50/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:border-primary-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-primary-950/40"
                >
                  <div className="absolute right-4 top-2 text-7xl font-light leading-none text-primary-200/70 transition-colors group-hover:text-primary-300 dark:text-primary-400/20 dark:group-hover:text-primary-300/30">
                    +
                  </div>
                  <div className="relative">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-primary-600 shadow-sm dark:bg-slate-800/80 dark:text-blue-300">
                      <PlusIcon className="w-5 h-5" />
                    </div>
                    <h4 className="mt-6 font-semibold text-gray-900 dark:text-slate-100">New {product.workspaceNoun}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                      Start a fresh workspace for your next story, campaign, or research build.
                    </p>
                  </div>
                </Link>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">No {product.workspaceNounPlural.toLowerCase()} match your filters</h3>
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
