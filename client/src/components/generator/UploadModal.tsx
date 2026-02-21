/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader, Edit, Zap } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';
import ManualEntityForm from './ManualEntityForm';
import ManualParseWorkflow from './ManualParseWorkflow';

interface ParsedEntity {
  type: string;
  canonical_name: string;
  aliases: string[];
  era?: string;
  region?: string;
  claims: Array<{ text: string; source: string }>;
}

type NewEntity = ParsedEntity;

interface UploadModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, projectId, onClose, onSuccess }: UploadModalProps) {
  const [mode, setMode] = useState<'choice' | 'manual' | 'manual-parse' | 'ai'>('choice');
  const [step, setStep] = useState<'upload' | 'review' | 'saving'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [useText, setUseText] = useState(false);
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedEntities, setParsedEntities] = useState<ParsedEntity[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Reset modal state when it opens to ensure clean start
  useEffect(() => {
    if (isOpen) {
      setMode('choice');
      setStep('upload');
      setFile(null);
      setSourceName('');
      setRawText('');
      setUseText(false);
      setParsedEntities([]);
      setSelectedEntities(new Set());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!sourceName) {
        setSourceName(selectedFile.name);
      }
    }
  };

  const handleUpload = async () => {
    setError(null);
    setParsing(true);

    try {
      let response;

      if (useText) {
        // Upload raw text
        if (!rawText.trim()) {
          throw new Error('Please enter some text to parse');
        }
        if (!sourceName.trim()) {
          throw new Error('Please enter a source name');
        }

        response = await fetch(`${API_BASE_URL}/upload/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText, sourceName }),
        });
      } else {
        // Upload file
        if (!file) {
          throw new Error('Please select a file');
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('sourceName', sourceName || file.name);

        response = await fetch(`${API_BASE_URL}/upload/document`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setParsedEntities(data.entities as ParsedEntity[]);

      // Select all entities by default
      setSelectedEntities(new Set((data.entities as unknown[]).map((_, i: number) => i)));

      setStep('review');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse document');
    } finally {
      setParsing(false);
    }
  };

  const handleApprove = async () => {
    setError(null);
    setStep('saving');

    try {
      const entitiesToSave = parsedEntities.filter((_, i) => selectedEntities.has(i));

      const response = await fetch(`${API_BASE_URL}/upload/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities: entitiesToSave,
          sourceName,
          projectId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save entities');
      }

      await response.json();

      // Success! Close modal and refresh
      handleClose();
      setTimeout(() => onSuccess(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entities');
      setStep('review');
    }
  };

  const toggleEntity = (index: number) => {
    const newSelected = new Set(selectedEntities);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedEntities(newSelected);
  };

  const handleSaveManualEntity = async (entity: NewEntity) => {
    setError(null);
    setStep('saving');

    try {
      const response = await fetch(`${API_BASE_URL}/upload/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities: [entity],
          sourceName: entity.claims[0]?.source || 'manual_entry',
          projectId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save entity');
      }

      // Success!
      handleClose();
      setTimeout(() => onSuccess(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entity');
      setStep('upload');
      setMode('manual');
    }
  };

  const handleManualParseComplete = async (entities: ParsedEntity[]) => {
    console.log('[UploadModal] handleManualParseComplete called with entities:', entities);
    setError(null);
    setStep('saving');

    try {
      console.log('[UploadModal] Sending request to /api/upload/approve');
      console.log('[UploadModal] Request payload:', JSON.stringify({
        entities,
        sourceName: entities[0]?.claims[0]?.source || 'manual_parse',
        projectId,
      }, null, 2));

      const response = await fetch(`${API_BASE_URL}/upload/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities,
          sourceName: entities[0]?.claims[0]?.source || 'manual_parse',
          projectId,
        }),
      });

      console.log('[UploadModal] Response status:', response.status);
      console.log('[UploadModal] Response ok:', response.ok);

      const responseData = await response.json();
      console.log('[UploadModal] Response data:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || `Server error: ${response.status}`);
      }

      if (responseData.errors && responseData.errors.length > 0) {
        console.warn('[UploadModal] Partial success with errors:', responseData.errors);
        const formattedErrors = Array.isArray(responseData.errors)
          ? responseData.errors
              .map((e: any) => {
                if (!e) return 'Unknown error';
                if (typeof e === 'string') return e;
                const name = typeof e.name === 'string' ? e.name : 'unknown';
                const message = typeof e.message === 'string' ? e.message : JSON.stringify(e);
                return `${name}: ${message}`;
              })
              .join('\n')
          : String(responseData.errors);

        setError(`Saved with errors:\n${formattedErrors}`);
        setStep('upload');
        setMode('manual-parse');
        return;
      }

      // Success!
      console.log('[UploadModal] Success! Calling onSuccess and closing modal');
      console.log(`[UploadModal] Results: ${responseData.entitiesCreated} created, ${responseData.entitiesUpdated} updated, ${responseData.chunksCreated} chunks`);

      alert(`✅ Success!\n\n${responseData.message}\n\nCreated: ${responseData.entitiesCreated || 0}\nUpdated: ${responseData.entitiesUpdated || 0}\nChunks: ${responseData.chunksCreated || 0}`);

      // Close modal first
      handleClose();

      // Then trigger reload after a small delay to ensure modal is closed
      setTimeout(() => {
        console.log('[UploadModal] Calling onSuccess after modal close');
        onSuccess();
      }, 100);
    } catch (err: unknown) {
      console.error('[UploadModal] Error saving entities:', err);
      setError(`Failed to save entities: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStep('upload');
      setMode('manual-parse');
    }
  };

  const resetModalState = () => {
    setMode('choice');
    setStep('upload');
    setFile(null);
    setSourceName('');
    setRawText('');
    setUseText(false);
    setParsedEntities([]);
    setSelectedEntities(new Set());
    setError(null);
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const handleBackToChoice = () => {
    // Reset state when going back to choice screen
    setStep('upload');
    setFile(null);
    setSourceName('');
    setRawText('');
    setUseText(false);
    setParsedEntities([]);
    setSelectedEntities(new Set());
    setError(null);
    setMode('choice');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'choice' && 'Add Canon Resource'}
            {mode === 'manual' && 'Create Entity Manually'}
            {mode === 'manual-parse' && 'Parse with AI (Manual Mode)'}
            {mode === 'ai' && step === 'upload' && 'Upload Canon Document'}
            {mode === 'ai' && step === 'review' && 'Review Extracted Entities'}
            {step === 'saving' && 'Saving...'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {mode === 'choice' && (
            <div className="space-y-4">
              <p className="text-gray-600 mb-6">
                Choose how you'd like to add canon resources to your campaign:
              </p>

              <button
                onClick={() => setMode('manual')}
                className="w-full p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <Edit className="w-8 h-8 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-900">
                      Create Manually
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Add individual entities (NPCs, monsters, items, etc.) one at a time using a form.
                      Perfect for adding specific entities with complete control.
                    </p>
                    <div className="mt-2 text-sm font-medium text-gray-500">
                      No AI needed - fill out a form
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('manual-parse')}
                className="w-full p-6 border-2 border-blue-300 bg-blue-50 rounded-lg hover:border-blue-500 hover:bg-blue-100 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <Zap className="w-8 h-8 text-blue-600 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-900">
                      Parse Document with AI (Copy/Paste)
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Paste your document, get a prompt to copy to any AI chat (ChatGPT, Claude, etc.),
                      then paste the response back. AI extracts all entities automatically.
                    </p>
                    <div className="mt-2 text-sm font-medium text-blue-600">
                      ⚡ Recommended - Use any AI service, no API key needed →
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('ai')}
                className="w-full p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <Upload className="w-8 h-8 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-900">
                      Auto-Parse with AI (Automatic)
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Upload a document and let the system automatically extract entities using OpenAI API.
                      Fully automated but requires API key configuration.
                    </p>
                    <div className="mt-2 text-sm font-medium text-amber-600">
                      ⚠️ Requires OpenAI API key setup
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {mode === 'manual' && step === 'upload' && (
            <ManualEntityForm
              onSave={handleSaveManualEntity}
              onCancel={handleBackToChoice}
            />
          )}

          {mode === 'manual-parse' && step === 'upload' && (
            <ManualParseWorkflow
              projectId={projectId}
              onComplete={handleManualParseComplete}
              onCancel={handleBackToChoice}
            />
          )}

          {mode === 'ai' && step === 'upload' && (
            <div className="space-y-6">
              {/* Toggle between file and text */}
              <div className="flex gap-4 border-b border-gray-200 pb-4">
                <button
                  onClick={() => setUseText(false)}
                  className={`px-4 py-2 font-medium ${!useText ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600'}`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  Upload File
                </button>
                <button
                  onClick={() => setUseText(true)}
                  className={`px-4 py-2 font-medium ${useText ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600'}`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  Paste Text
                </button>
              </div>

              {/* Source Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source Name *
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g., 'My Campaign Guide', 'Waterdeep NPCs'"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be used as the source reference for all extracted facts
                </p>
              </div>

              {!useText ? (
                /* File Upload */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document File
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Choose a file
                    </label>
                    <span className="text-gray-600"> or drag and drop</span>
                    <p className="text-sm text-gray-500 mt-2">
                      .txt or .md files up to 10MB
                    </p>
                    {file && (
                      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-700">
                        <FileText className="w-4 h-4" />
                        {file.name}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Text Input */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Text
                  </label>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste your D&D campaign content here..."
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
                  />
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Upload your campaign document or paste text</li>
                  <li>2. AI will extract NPCs, monsters, items, locations, etc.</li>
                  <li>3. Review and select which entities to add to your canon</li>
                  <li>4. Entities are saved and ready for content generation!</li>
                </ol>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-700">
                  Found <strong>{parsedEntities.length}</strong> entities. Select which ones to add:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedEntities(new Set(parsedEntities.map((_, i) => i)))}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Select All
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={() => setSelectedEntities(new Set())}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {parsedEntities.map((entity, index) => (
                  <div
                    key={index}
                    className={`border rounded-md p-4 cursor-pointer transition-colors ${
                      selectedEntities.has(index)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleEntity(index)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedEntities.has(index)}
                        onChange={() => toggleEntity(index)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{entity.canonical_name}</h4>
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                            {entity.type}
                          </span>
                        </div>
                        {entity.aliases.length > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            Also: {entity.aliases.join(', ')}
                          </p>
                        )}
                        {(entity.region || entity.era) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {entity.region && `Region: ${entity.region}`}
                            {entity.region && entity.era && ' • '}
                            {entity.era && `Era: ${entity.era}`}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 mt-2">
                          {entity.claims.length} fact{entity.claims.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-gray-700">Saving entities to your canon...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode !== 'manual' && mode !== 'manual-parse' && (
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleClose}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Cancel
            </button>

            {mode === 'ai' && step === 'upload' && (
              <button
                onClick={handleUpload}
                disabled={parsing || (!file && !rawText.trim()) || !sourceName.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {parsing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Parse Document
                  </>
                )}
              </button>
            )}

            {mode === 'ai' && step === 'review' && (
              <button
                onClick={handleApprove}
                disabled={selectedEntities.size === 0}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Add {selectedEntities.size} Entit{selectedEntities.size !== 1 ? 'ies' : 'y'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
