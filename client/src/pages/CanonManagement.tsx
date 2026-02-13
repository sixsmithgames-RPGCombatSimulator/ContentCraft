/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ResourcesPanel from '../components/generator/ResourcesPanel';

export const CanonManagement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Project ID not found</p>
        <button onClick={() => navigate('/')} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate(`/projects/${id}`)}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Canon Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your project's canon resources and library entities
          </p>
        </div>
      </div>

      <ResourcesPanel projectId={id} />
    </div>
  );
};
