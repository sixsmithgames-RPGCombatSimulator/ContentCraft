/**
 * Mode Selection Dialog
 * 
 * Presents user with choice between Integrated AI (automated) and Manual Copy/Paste modes
 * before opening the AI Assistant panel.
 * 
 * © 2025 Sixsmith Games. All rights reserved.
 */

import { Sparkles, Clipboard, X } from 'lucide-react';

interface ModeSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: 'integrated' | 'manual') => void;
  hasProvider: boolean;
}

export default function ModeSelectionDialog({
  isOpen,
  onClose,
  onSelectMode,
  hasProvider,
}: ModeSelectionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-white" />
            <h2 className="text-xl font-semibold text-white">Choose AI Assistance Mode</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            Select how you'd like to work with AI for this stage:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Integrated AI Mode */}
            <button
              onClick={() => onSelectMode('integrated')}
              disabled={!hasProvider}
              className={`group relative p-6 rounded-lg border-2 transition-all ${
                hasProvider
                  ? 'border-primary-200 hover:border-primary-500 hover:shadow-lg bg-white cursor-pointer'
                  : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
              }`}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                    hasProvider
                      ? 'bg-primary-100 text-primary-600 group-hover:bg-primary-600 group-hover:text-white'
                      : 'bg-gray-200 text-gray-400'
                  } transition-all`}
                >
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Integrated AI
                  {hasProvider && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Automated stage processing with your configured AI provider
                </p>
                <ul className="text-xs text-left text-gray-500 space-y-1">
                  <li>✓ Auto-generates content</li>
                  <li>✓ Validates against schema</li>
                  <li>✓ Applies changes instantly</li>
                  <li>✓ Advances to next stage</li>
                </ul>
                {!hasProvider && (
                  <div className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                    Configure a provider in settings first
                  </div>
                )}
              </div>
            </button>

            {/* Manual Copy/Paste Mode */}
            <button
              onClick={() => onSelectMode('manual')}
              className="group relative p-6 rounded-lg border-2 border-gray-200 hover:border-gray-400 hover:shadow-lg bg-white transition-all cursor-pointer"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-600 group-hover:bg-gray-600 group-hover:text-white flex items-center justify-center mb-4 transition-all">
                  <Clipboard className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">Manual Copy/Paste</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Use any AI tool and paste responses manually
                </p>
                <ul className="text-xs text-left text-gray-500 space-y-1">
                  <li>✓ Works with any AI</li>
                  <li>✓ Full control over edits</li>
                  <li>✓ Review before applying</li>
                  <li>✓ No API key needed</li>
                </ul>
              </div>
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              You can switch modes anytime from the AI Assistant settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
