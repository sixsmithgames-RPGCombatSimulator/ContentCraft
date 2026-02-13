/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, Clock, FileText, Trash2 } from 'lucide-react';
import { listProgressFiles, loadProgressFromFile, type GenerationProgress } from '../../utils/generationProgress';
import ConfirmationModal from '../common/ConfirmationModal';

interface ResumeProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: (session: GenerationProgress) => void;
}

interface ProgressFileSummary {
  filename: string;
  sessionId: string;
  sessionName?: string; // Human-readable name
  createdAt: string;
  lastUpdatedAt: string;
  config: {
    type: string;
    stage?: string;
    prompt?: string;
    [key: string]: unknown;
  };
  currentStageIndex: number;
  progressCount: number;
  totalStages?: number; // Total number of stages (8)
}

export default function ResumeProgressModal({
  isOpen,
  onClose,
  onResume,
}: ResumeProgressModalProps) {
  const [progressFiles, setProgressFiles] = useState<ProgressFileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ filename: string; type: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProgressFiles();
    }
  }, [isOpen]);

  const loadProgressFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await listProgressFiles();
      // Sort by lastUpdatedAt descending (most recent first)
      files.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      setProgressFiles(files as ProgressFileSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress files');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (filename: string) => {
    try {
      const session = await loadProgressFromFile(filename);
      if (session) {
        onResume(session);
        onClose();
      } else {
        setError('Failed to load progress session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session');
    }
  };

  const handleDeleteClick = (filename: string, type: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteConfirm({ filename, type });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    const { filename } = deleteConfirm;
    setDeleteConfirm(null);

    try {
      await fetch(`http://localhost:3001/api/delete-progress?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      await loadProgressFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete progress file');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <>
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        title="Delete Saved Progress"
        message={`Are you sure you want to delete this ${deleteConfirm?.type || 'saved'} progress? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Resume Session</h2>
              <p className="text-sm text-gray-600 mt-1">
                Continue from a previously saved generation session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-600">Loading saved sessions...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && progressFiles.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No saved sessions found</p>
              <p className="text-sm text-gray-500 mt-2">
                Start a new generation to create a save point
              </p>
            </div>
          )}

          {!loading && progressFiles.length > 0 && (
            <div className="space-y-3">
              {progressFiles.map((file) => (
                <div
                  key={file.filename}
                  onClick={() => setSelectedFile(file.filename)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedFile === file.filename
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          {file.sessionName || file.config.type.replace(/_/g, ' ')}
                        </h3>
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                          Stage {file.currentStageIndex + 1}/{file.totalStages || 8}
                        </span>
                      </div>
                      {/* Show prompt excerpt if no sessionName but has prompt */}
                      {!file.sessionName && file.config.prompt && (
                        <p className="text-sm text-gray-700 mt-1 line-clamp-1">
                          "{file.config.prompt.slice(0, 50)}{file.config.prompt.length > 50 ? '...' : ''}"
                        </p>
                      )}
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500">
                          ID: <span className="font-mono">{file.sessionId.substring(0, 12)}...</span>
                        </p>
                        <p className="text-sm text-gray-600">
                          Started: {new Date(file.createdAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-600">
                          Last updated: {formatDate(file.lastUpdatedAt)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Progress entries: {file.progressCount}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteClick(file.filename, file.config.type, e)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                      title="Delete saved progress"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedFile && handleResume(selectedFile)}
            disabled={!selectedFile}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            Resume Selected Session
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
