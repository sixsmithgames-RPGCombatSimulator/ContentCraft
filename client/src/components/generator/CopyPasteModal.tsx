/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { Copy, Check, X, ArrowRight, ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import LocationDetailsPreview from './LocationDetailsPreview';
import LocationAccuracyPreview from './LocationAccuracyPreview';

interface CopyPasteModalProps {
  isOpen: boolean;
  mode: 'output' | 'input';
  stageName: string;
  stageNumber: number;
  totalStages: number;
  outputText?: string;
  error?: string | null;
  softWarning?: {
    title: string;
    message: string;
    fixLabel?: string;
  };
  onFixNow?: () => void;
  canGoBack?: boolean;
  canSkip?: boolean;
  skipMode?: boolean;
  chunkProgress?: { current: number; total: number; title?: string };
  canAutoParse?: boolean;
  liveMapPanel?: ReactNode; // Optional live map panel to show on the right
  structuredContent?: {  // NEW: Optional structured content for location stages
    type: 'location-details' | 'location-accuracy';
    data: Record<string, unknown>;
  };
  acceptedSpacesCount?: number; // Number of accepted spaces (for Review Spaces button)
  totalSpacesCount?: number; // Total spaces to generate (for batch mode display)
  batchModeEnabled?: boolean; // Whether batch auto-accept mode is enabled
  lastSaveTime?: string | null; // Last auto-save timestamp for display
  onCopied?: () => void;
  onSubmit?: (input: string) => void;
  onSkip?: () => void;
  onAutoParse?: () => void;
  onBack?: () => void;
  onReviewSpaces?: () => void;
  onFinishSkip?: () => void;
  onToggleBatchMode?: () => void; // Enable/disable batch auto-accept mode
  onSaveDraft?: () => void; // Manual save draft button
  onClose: () => void;
}

export default function CopyPasteModal({
  isOpen,
  mode,
  stageName,
  stageNumber,
  totalStages,
  outputText,
  error,
  softWarning,
  onFixNow,
  canGoBack = false,
  canSkip = false,
  skipMode = false,
  chunkProgress,
  canAutoParse = false,
  liveMapPanel,
  structuredContent,
  acceptedSpacesCount = 0,
  totalSpacesCount = 0,
  batchModeEnabled = false,
  lastSaveTime = null,
  onCopied,
  onSubmit,
  onSkip,
  onAutoParse,
  onBack,
  onReviewSpaces,
  onFinishSkip,
  onToggleBatchMode,
  onSaveDraft,
  onClose,
}: CopyPasteModalProps) {
  const [copied, setCopied] = useState(false);
  const [inputText, setInputText] = useState('');
  const [panelWidth, setPanelWidth] = useState(384); // 384px = w-96
  const [isResizing, setIsResizing] = useState(false);

  // Reset copied state and input when outputText changes or modal opens
  useEffect(() => {
    if (isOpen && mode === 'output') {
      setCopied(false);
    }
    if (isOpen && mode === 'input') {
      setInputText('');
    }
  }, [isOpen, mode, outputText]);

  // Handle panel resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 16; // 16px for padding
      setPanelWidth(Math.max(300, Math.min(800, newWidth))); // Min 300px, max 800px
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (outputText) {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => {
        onCopied?.();
      }, 500);
    }
  };

  const handleSubmit = () => {
    if (inputText.trim()) {
      onSubmit?.(inputText);
      // Don't clear input immediately - let parent decide when to clear
      // Parent will close modal on success, which will reset state
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 ${isResizing ? 'cursor-col-resize select-none' : ''}`}
      onClick={(e) => {
        // Prevent closing modal by clicking outside
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] flex ${liveMapPanel ? 'max-w-7xl flex-row gap-0' : 'max-w-3xl flex-col'} ${isResizing ? 'select-none' : ''}`}>
        {/* Main Modal Content */}
        <div className={`flex flex-col ${liveMapPanel ? 'flex-1 min-w-0' : 'w-full'}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <span>
                Stage {stageNumber} of {totalStages}
              </span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-medium text-gray-700">{stageName}</span>
            </div>
            {chunkProgress && (
              <div className="text-sm text-blue-600 font-medium mb-1">
                Processing Chunk {chunkProgress.current + 1} of {chunkProgress.total}
                {chunkProgress.title && ` - ${chunkProgress.title}`}
              </div>
            )}
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'output' ? 'Copy Prompt to AI' : skipMode ? 'Paste Your Data (Skip AI)' : 'Paste AI Response'}
            </h2>
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
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-medium">Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          )}

          {mode === 'input' && softWarning && (
            <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-yellow-900 font-semibold">{softWarning.title}</p>
                  <p className="text-sm text-yellow-800 mt-1">{softWarning.message}</p>
                </div>
                {onFixNow && (
                  <button
                    type="button"
                    onClick={onFixNow}
                    className="px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium whitespace-nowrap"
                  >
                    {softWarning.fixLabel || 'Fix now'}
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === 'output' ? (
            <>
              <p className="text-gray-600 mb-4">
                Copy this prompt and paste it into your AI chat (ChatGPT, Claude, Gemini, etc.)
              </p>
              <div className="relative">
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                  {outputText}
                </pre>
                <button
                  onClick={handleCopy}
                  disabled={copied}
                  className={`absolute top-2 right-2 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </>
          ) : structuredContent ? (
            // Structured content view for location stages
            <>
              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm font-medium text-gray-700">Parsed preview</div>
                  <button
                    type="button"
                    onClick={() => setInputText(JSON.stringify(structuredContent.data, null, 2))}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
                    title="Load this JSON into the editor below"
                  >
                    Load into editor
                  </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-md p-3 max-h-72 overflow-auto">
                  {structuredContent.type === 'location-details' ? (
                    <LocationDetailsPreview data={structuredContent.data} />
                  ) : (
                    <LocationAccuracyPreview data={structuredContent.data} />
                  )}
                </div>
              </div>

              <p className="text-gray-600 mb-4">
                {skipMode
                  ? `You chose to skip the ${stageName} stage. Paste the JSON data you already have for this stage below, then click Submit to continue.`
                  : 'Paste the response from your AI chat below, then click Submit to continue to the next stage.'
                }
              </p>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={skipMode ? "Paste your pre-existing JSON data here..." : "Paste AI response here..."}
                className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
              />
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-4">
                {skipMode
                  ? `You chose to skip the ${stageName} stage. Paste the JSON data you already have for this stage below, then click Submit to continue.`
                  : 'Paste the response from your AI chat below, then click Submit to continue to the next stage.'
                }
              </p>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={skipMode ? "Paste your pre-existing JSON data here..." : "Paste AI response here..."}
                className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 space-y-3">
          {/* Main button row */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Back Button */}
              {canGoBack && onBack && (
                <button
                  onClick={onBack}
                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              )}

              {/* Batch Mode Toggle - show when in Spaces stage with multiple spaces remaining */}
              {stageName === 'Spaces' && totalSpacesCount > 1 && onToggleBatchMode && (acceptedSpacesCount < totalSpacesCount - 1) && (
                <button
                  onClick={onToggleBatchMode}
                  className={`px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors ${
                    batchModeEnabled
                      ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                  }`}
                  title={batchModeEnabled ? 'Click to disable batch mode and review each space' : 'Click to auto-accept remaining spaces'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {batchModeEnabled ? 'Batch ON' : 'Batch'}
                </button>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
            {/* Review Spaces Button (for iterative location generation) */}
            {acceptedSpacesCount > 0 && onReviewSpaces && (
              <button
                onClick={onReviewSpaces}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium flex items-center gap-1"
                title="Review previously accepted spaces"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Review Spaces ({acceptedSpacesCount})
              </button>
            )}
            {/* Done - Advance Button (for skip mode after reviewing spaces) */}
            {skipMode && acceptedSpacesCount > 0 && onFinishSkip && (
              <button
                onClick={onFinishSkip}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium flex items-center gap-2"
                title="Finish reviewing spaces and advance to next stage"
              >
                <Check className="w-4 h-4" />
                Done - Advance to Next Stage ({acceptedSpacesCount} spaces)
              </button>
            )}
            {canSkip && onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
              >
                Skip (I have data)
              </button>
            )}
            {mode === 'output' ? (
              <>
                {canAutoParse && onAutoParse && (
                  <button
                    onClick={onAutoParse}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium flex items-center gap-2"
                  >
                    Auto-Parse This Chunk
                  </button>
                )}
                <button
                  onClick={() => {
                    if (copied) {
                      onCopied?.();
                    }
                  }}
                  disabled={!copied}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                >
                  Next: Paste Response
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!inputText.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                Submit & Continue
              </button>
            )}
          </div>
        </div>
          
          {/* Save status line */}
          {(onSaveDraft || lastSaveTime) && (
            <div className="flex items-center justify-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-200">
              {lastSaveTime && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Progress saved {lastSaveTime}
                </span>
              )}
              {onSaveDraft && (
                <button
                  onClick={onSaveDraft}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Save now
                </button>
              )}
            </div>
          )}
        </div>
        </div>
        {/* End Main Modal Content */}

        {/* Live Map Panel (Right Side) */}
        {liveMapPanel && (
          <>
            {/* Resize Handle */}
            <div
              className="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize flex-shrink-0 relative group"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute inset-y-0 -inset-x-1" /> {/* Wider hit area */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Panel Content */}
            <div
              className="border-l border-gray-200 flex flex-col max-h-[90vh] overflow-hidden bg-gray-50"
              style={{ width: `${panelWidth}px` }}
            >
              {liveMapPanel}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
