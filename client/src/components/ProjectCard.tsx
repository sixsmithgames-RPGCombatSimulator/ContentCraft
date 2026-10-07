/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Trash2 } from 'lucide-react';
import { Project, ProjectType, ProjectStatus } from '../types';
import { clsx } from 'clsx';
import ConfirmationModal from './common/ConfirmationModal';
import { getProductConfig } from '../config/products';

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  deleteDisabled?: boolean;
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
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

const STATUS_COLORS = {
  [ProjectStatus.DRAFT]: 'bg-gray-100 text-gray-800',
  [ProjectStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-800',
  [ProjectStatus.REVIEW]: 'bg-yellow-100 text-yellow-800',
  [ProjectStatus.COMPLETED]: 'bg-green-100 text-green-800',
  [ProjectStatus.PUBLISHED]: 'bg-purple-100 text-purple-800',
};

const STATUS_LABELS = {
  [ProjectStatus.DRAFT]: 'Draft',
  [ProjectStatus.IN_PROGRESS]: 'In Progress',
  [ProjectStatus.REVIEW]: 'Review',
  [ProjectStatus.COMPLETED]: 'Completed',
  [ProjectStatus.PUBLISHED]: 'Published',
};

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDelete, deleteDisabled = false }) => {
  const product = getProductConfig();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deleteDisabled) return;
    setShowDeleteConfirm(false);
    onDelete?.(project.id);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={`Delete ${product.workspaceNoun.toLowerCase()}`}
        message={`Are you sure you want to delete "${project.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <article className="card group hover:shadow-md transition-shadow duration-200 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors break-words">
              <Link to={`/projects/${project.id}`}>{project.title}</Link>
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {PROJECT_TYPE_LABELS[project.type]}
            </p>
            {project.description && (
              <p className="text-gray-600 mt-2 text-sm line-clamp-2">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 ml-4">
            <span className={clsx(
              'px-2 py-1 rounded-full text-xs font-medium',
              STATUS_COLORS[project.status]
            )}>
              {STATUS_LABELS[project.status]}
            </span>

          </div>
        </div>

        <div className="mt-auto flex items-center text-sm text-gray-500">
          <Calendar className="w-3 h-3 mr-1" />
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <Link to={`/projects/${project.id}`} className="btn-primary inline-flex">Open {product.workspaceNoun.toLowerCase()}</Link>
          {onDelete && <details className="workspace-card-menu">
            <summary className="btn-secondary">More<span className="sr-only"> actions for {project.title}</span></summary>
            <button type="button" disabled={deleteDisabled} onClick={handleDeleteClick} className="flex items-center gap-2 text-red-600 px-3 py-2" aria-label={`Delete ${project.title}`}><Trash2 className="w-4 h-4" aria-hidden="true" />Delete</button>
          </details>}
        </div>
      </article>
    </>
  );
};
