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

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
}

const PROJECT_TYPE_LABELS = {
  [ProjectType.FICTION]: 'Fiction',
  [ProjectType.NON_FICTION]: 'Non-Fiction',
  [ProjectType.DND_ADVENTURE]: 'D&D Adventure',
  [ProjectType.DND_HOMEBREW]: 'D&D Homebrew',
  [ProjectType.HEALTH_ADVICE]: 'Health Advice',
  [ProjectType.RESEARCH]: 'Research',
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

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDelete }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
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
        title="Delete Project"
        message={`Are you sure you want to delete "${project.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <Link to={`/projects/${project.id}`} className="block group">
      <div className="card hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
              {project.title}
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

            {onDelete && (
              <button
                onClick={handleDeleteClick}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                title="Delete project"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center text-xs text-gray-500">
          <Calendar className="w-3 h-3 mr-1" />
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
    </>
  );
};