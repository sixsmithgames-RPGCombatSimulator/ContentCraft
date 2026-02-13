/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useMemo } from 'react';
import { X, Edit2, FileText, Calendar, Tag, AlertCircle, Code } from 'lucide-react';
import ContentRenderer from './ContentRenderer';
import NpcContentView from './NpcContentView';
import MonsterContentView from './MonsterContentView';
import EditContentModal from './EditContentModal';
import {
  isNpcContent,
  normalizeNpc,
} from './npcUtils';

/**
 * Determine the content type based on deliverable and content_type fields
 * Returns a specific type identifier for proper routing to view components
 */
function getContentViewType(deliverable?: string, contentType?: string, generatedContent?: JsonRecord): 'monster' | 'npc' | 'generic' {
  // Check deliverable field first (most explicit)
  if (deliverable === 'monster' || deliverable === 'creature') {
    return 'monster';
  }

  // Check generated_content deliverable field
  if (generatedContent?.deliverable === 'monster' || generatedContent?.deliverable === 'creature') {
    return 'monster';
  }

  // Check if it's NPC content
  if (isNpcContent(deliverable, contentType)) {
    return 'npc';
  }

  // Default to generic view
  return 'generic';
}

type JsonRecord = Record<string, unknown>;
type ResolvedProposal = { question?: string; answer?: string };
type ResolvedConflict = unknown;
interface StructuredContent { type?: string; data?: unknown }
export interface GeneratedContentDoc {
  _id: string;
  project_id: string;
  content_type: string;
  title: string;
  generated_content: JsonRecord;
  resolved_proposals?: ResolvedProposal[];
  resolved_conflicts?: ResolvedConflict[];
  metadata?: {
    deliverable?: string;
    difficulty?: string;
    rule_base?: string;
    sources_used?: string[];
    structuredContent?: StructuredContent;
  };
  created_at: string;
  updated_at: string;
}

interface GeneratedContentModalProps {
  isOpen: boolean;
  content: GeneratedContentDoc | null;
  onClose: () => void;
  onSave?: (updatedContent: GeneratedContentDoc) => void;
}

function formatResolvedConflict(conflict: unknown): string {
  if (!conflict) return '';
  if (typeof conflict === 'string') return conflict.trim();
  if (typeof conflict === 'number' || typeof conflict === 'boolean') return String(conflict);
  if (typeof conflict !== 'object') return '';

  const obj = conflict as Record<string, unknown>;
  const candidates = [
    obj.description,
    obj.summary,
    obj.message,
    obj.text,
    obj.issue,
    obj.reason,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return '';
  }
}

function formatConflictWithContext(conflict: unknown): string {
  if (!conflict) return '';
  if (typeof conflict === 'string') return conflict.trim();
  if (typeof conflict === 'number' || typeof conflict === 'boolean') return String(conflict);
  if (typeof conflict !== 'object') return '';

  const obj = conflict as Record<string, unknown>;
  const severity = typeof obj.severity === 'string' ? obj.severity.trim() : '';
  const description = formatResolvedConflict(conflict);
  const recommendation =
    typeof obj.suggested_resolution === 'string'
      ? obj.suggested_resolution.trim()
      : (typeof obj.recommendation === 'string' ? obj.recommendation.trim() : '');

  const parts = [
    severity ? `Severity: ${severity}` : '',
    description,
    recommendation ? `Recommendation: ${recommendation}` : '',
  ].filter((p) => p && p.trim().length > 0);

  return parts.join('\n');
}

export default function GeneratedContentModal({
  isOpen,
  content,
  onClose,
  onSave,
}: GeneratedContentModalProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'json'>('formatted');

  // Validate content structure - NO FALLBACKS, proper error handling
  const [contentError, setContentError] = useState<string | null>(null);

  // Determine what type of content we're viewing
  const contentViewType = useMemo(() => {
    if (!content) return 'generic';
    return getContentViewType(
      content.metadata?.deliverable,
      content.content_type,
      content.generated_content
    );
  }, [content]);

  const formattedResolvedConflicts = useMemo(() => {
    const conflicts = (content?.resolved_conflicts || []) as ResolvedConflict[];
    return conflicts
      .map((conflict) => formatResolvedConflict(conflict))
      .filter((text) => typeof text === 'string' && text.trim().length > 0);
  }, [content?.resolved_conflicts]);

  const formattedConflicts = useMemo(() => {
    const generated = content?.generated_content as Record<string, unknown> | undefined;
    const raw = generated && Array.isArray((generated as any).conflicts) ? ((generated as any).conflicts as unknown[]) : [];
    return raw
      .map((conflict) => formatConflictWithContext(conflict))
      .filter((text) => typeof text === 'string' && text.trim().length > 0);
  }, [content?.generated_content]);

  useEffect(() => {
    if (!content) return;

    // Reset error state
    setContentError(null);

    // Validate that generated_content exists
    if (!content.generated_content) {
      const error = 'ERROR: No generated_content field found in saved content. Content structure is invalid.';
      console.error('[GeneratedContentModal]', error, { content });
      setContentError(error);
      return;
    }

    console.log('[GeneratedContentModal] Loading content:', {
      contentId: content._id,
      contentType: content.content_type,
      deliverable: content.metadata?.deliverable,
      hasGeneratedContent: !!content.generated_content,
      generatedContentKeys: Object.keys(content.generated_content),
      generatedContentSample: content.generated_content,
    });

    // Validate essential fields based on content type
    if (contentViewType === 'monster') {
      const monsterRecord = content.generated_content as Record<string, unknown>;
      const missingFields: string[] = [];
      if (!monsterRecord.name) missingFields.push('name');
      if (!monsterRecord.creature_type) missingFields.push('creature_type');
      if (!monsterRecord.challenge_rating) missingFields.push('challenge_rating');

      if (missingFields.length > 0) {
        const error = `WARNING: Generated content is missing essential monster fields: ${missingFields.join(', ')}. Content may be incomplete.`;
        console.warn('[GeneratedContentModal]', error, { monsterRecord });
        setContentError(error);
      }
    } else if (contentViewType === 'npc') {
      const npcRecord = content.generated_content as Record<string, unknown>;
      const missingFields: string[] = [];
      if (!npcRecord.canonical_name && !npcRecord.name) missingFields.push('name/canonical_name');
      if (!npcRecord.description) missingFields.push('description');

      if (missingFields.length > 0) {
        const error = `WARNING: Generated content is missing essential NPC fields: ${missingFields.join(', ')}. Content may be incomplete.`;
        console.warn('[GeneratedContentModal]', error, { npcRecord });
        setContentError(error);
      }
    }
  }, [content, contentViewType]);

  if (!isOpen || !content) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{content.title}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Tag className="w-4 h-4" />
                {content.metadata?.deliverable || content.content_type}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(content.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Edit content"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Structure Error */}
        {contentError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-900">{contentError.startsWith('ERROR') ? 'Content Error' : 'Content Warning'}</p>
              <p className="text-sm text-red-700 mt-1">{contentError}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Metadata Section */}
          {content.metadata && Object.keys(content.metadata).length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Metadata
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {content.metadata.deliverable && (
                  <div>
                    <span className="text-gray-600">Deliverable:</span>
                    <span className="ml-2 font-medium text-gray-900">{content.metadata.deliverable}</span>
                  </div>
                )}
                {content.metadata.difficulty && (
                  <div>
                    <span className="text-gray-600">Difficulty:</span>
                    <span className="ml-2 font-medium text-gray-900">{content.metadata.difficulty}</span>
                  </div>
                )}
                {content.metadata.rule_base && (
                  <div>
                    <span className="text-gray-600">Rule Base:</span>
                    <span className="ml-2 font-medium text-gray-900">{content.metadata.rule_base}</span>
                  </div>
                )}
                {content.metadata.sources_used && content.metadata.sources_used.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-600">Sources Used:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {content.metadata.sources_used.length} sources
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generated Content Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Generated Content</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('formatted')}
                  className={`px-3 py-1 text-sm rounded ${
                    viewMode === 'formatted'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Formatted
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={`px-3 py-1 text-sm rounded flex items-center gap-1 ${
                    viewMode === 'json'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <Code className="w-3 h-3" />
                  JSON
                </button>
              </div>
            </div>

            {/* Render content based on type and view mode */}
            {contentViewType === 'monster' ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-[60vh] overflow-auto">
                <MonsterContentView monster={content.generated_content as Record<string, unknown>} />
              </div>
            ) : contentViewType === 'npc' ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-[60vh] overflow-auto">
                <NpcContentView npc={normalizeNpc(content.generated_content as Record<string, unknown>)} />
              </div>
            ) : viewMode === 'formatted' ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto">
                <ContentRenderer
                  content={content.generated_content}
                  deliverable={
                    (typeof content.metadata?.deliverable === 'string'
                      ? content.metadata.deliverable
                      : (typeof (content.generated_content as Record<string, unknown>)['deliverable'] === 'string'
                        ? String((content.generated_content as Record<string, unknown>)['deliverable'])
                        : 'unknown'))
                  }
                />
              </div>
            ) : (
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                {JSON.stringify(content.generated_content, null, 2)}
              </pre>
            )}
          </div>

          {/* Resolved Proposals Section */}
          {content.resolved_proposals && content.resolved_proposals.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Resolved Proposals</h3>
              <div className="space-y-2">
                {content.resolved_proposals.map((proposal, index) => (
                  <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm font-medium text-gray-900">{proposal.question}</p>
                    <p className="text-sm text-gray-700 mt-1">
                      <strong>Answer:</strong> {proposal.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved Conflicts Section */}
          {formattedConflicts.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Conflicts</h3>
              <div className="space-y-2">
                {formattedConflicts.map((text, index) => (
                  <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                    {text.trim().startsWith('{') ? (
                      <pre className="text-sm whitespace-pre-wrap font-mono text-gray-900">{text}</pre>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{text}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {formattedResolvedConflicts.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Resolved Conflicts</h3>
              <div className="space-y-2">
                {formattedResolvedConflicts.map((text, index) => (
                  <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                    {text.trim().startsWith('{') ? (
                      <pre className="text-sm whitespace-pre-wrap font-mono text-gray-900">{text}</pre>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{text}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Content ID: <span className="font-mono text-gray-800">{content._id}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal - Opens full-featured EditContentModal */}
      {showEditModal && (
        <EditContentModal
          isOpen={showEditModal}
          generatedContent={content.generated_content}
          onClose={() => setShowEditModal(false)}
          onSave={(editedData) => {
            // Update the content with edited data
            const updatedContent = {
              ...content,
              generated_content: editedData as JsonRecord,
            };

            // Call onSave if provided to update parent
            if (onSave) {
              onSave(updatedContent);
            }

            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
