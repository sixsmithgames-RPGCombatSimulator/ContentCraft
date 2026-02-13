/**
 * Reusable Confirmation Modal
 *
 * Replaces browser confirm() dialogs with a professional modal UI.
 * Used for destructive actions like deletions.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const colorClasses = {
    danger: {
      header: 'bg-red-600',
      button: 'bg-red-600 hover:bg-red-700',
      icon: 'text-red-600',
      border: 'border-red-200',
      bg: 'bg-red-50',
    },
    warning: {
      header: 'bg-yellow-600',
      button: 'bg-yellow-600 hover:bg-yellow-700',
      icon: 'text-yellow-600',
      border: 'border-yellow-200',
      bg: 'bg-yellow-50',
    },
    info: {
      header: 'bg-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
      icon: 'text-blue-600',
      border: 'border-blue-200',
      bg: 'bg-blue-50',
    },
  };

  const colors = colorClasses[variant];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className={`${colors.header} text-white p-4 flex items-center justify-between`}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onCancel}
            className="text-white hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className={`flex items-start gap-3 p-3 ${colors.bg} border ${colors.border} rounded-md`}>
            <AlertTriangle className={`w-5 h-5 ${colors.icon} flex-shrink-0 mt-0.5`} />
            <p className="text-sm text-gray-700">{message}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors"
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white font-medium rounded-md transition-colors ${colors.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
