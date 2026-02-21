/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit, Trash2, FileText, BookOpen, Wand2, Eye, Search, Filter, Copy, GripVertical, ArrowUpDown, Check, X } from 'lucide-react';
import { Project, ContentBlock, ProjectType, ContentType } from '../types';
import { projectApi, contentApi, API_BASE_URL } from '../services/api';
import GeneratedContentModal, { type GeneratedContentDoc } from '../components/generator/GeneratedContentModal';
import ContentRenderer from '../components/generator/ContentRenderer';
import EditContentModal from '../components/generator/EditContentModal';
import WritingReaderModal from '../components/generator/WritingReaderModal';
import TextBlocksSplitView from '../components/TextBlocksSplitView';
import { parseAIResponse } from '../utils/jsonParser';

const PROJECT_TYPE_LABELS = {
  [ProjectType.FICTION]: 'Fiction',
  [ProjectType.NON_FICTION]: 'Non-Fiction',
  [ProjectType.DND_ADVENTURE]: 'D&D Adventure',
  [ProjectType.DND_HOMEBREW]: 'D&D Homebrew',
  [ProjectType.HEALTH_ADVICE]: 'Health Advice',
  [ProjectType.RESEARCH]: 'Research',
};

const CONTENT_TYPE_LABELS = {
  [ContentType.TEXT]: 'Text',
  [ContentType.OUTLINE]: 'Outline',
  [ContentType.CHAPTER]: 'Chapter',
  [ContentType.SECTION]: 'Section',
  [ContentType.CHARACTER]: 'Character',
  [ContentType.LOCATION]: 'Location',
  [ContentType.ITEM]: 'Item',
  [ContentType.STAT_BLOCK]: 'Stat Block',
  [ContentType.FACT]: 'Fact',
  [ContentType.STORY_ARC]: 'Story Arc',
};

const WRITING_TOKENS = [
  'chapter',
  'outline',
  'foreword',
  'prologue',
  'epilogue',
  'scene',
  'section',
  'journal',
  'diary',
  'memoir',
  'log',
  'diet',
  'entry',
  'manuscript',
  'draft',
];

const isDeliverableWriting = (deliverable: string | undefined): boolean => {
  const lower = typeof deliverable === 'string' ? deliverable.toLowerCase() : '';
  if (!lower) return false;
  return WRITING_TOKENS.some((token) => lower.includes(token));
};

const isWrittenBlock = (block: ContentBlock): boolean => {
  const metadata = (block.metadata ?? {}) as Record<string, unknown>;
  const domain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() : '';
  const deliverable = typeof metadata.deliverable === 'string' ? metadata.deliverable : undefined;
  const structured =
    metadata.structuredContent && typeof metadata.structuredContent === 'object'
      ? (metadata.structuredContent as Record<string, unknown>)
      : null;
  const structuredType = typeof structured?.type === 'string' ? structured.type : '';

  if (domain === 'writing') return true;
  if (domain === 'rpg') return false;
  if (structuredType && structuredType !== 'writing') return false;
  if (isDeliverableWriting(deliverable)) return true;
  if (
    block.type === ContentType.TEXT ||
    block.type === ContentType.SECTION ||
    block.type === ContentType.OUTLINE ||
    block.type === ContentType.CHAPTER ||
    block.type === ContentType.STORY_ARC
  ) {
    return true;
  }
  return false;
};

const countWords = (text: string): number => {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
};

const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,|;|\u2022|\u00b7/)
      .map((part) => part.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
};

const isStructuredBlock = (block: ContentBlock): boolean => {
  if (
    block.type === ContentType.CHARACTER ||
    block.type === ContentType.LOCATION ||
    block.type === ContentType.ITEM ||
    block.type === ContentType.STAT_BLOCK ||
    block.type === ContentType.FACT
  ) {
    return true;
  }
  const metadata = (block.metadata ?? {}) as Record<string, unknown>;
  const structured =
    metadata.structuredContent && typeof metadata.structuredContent === 'object'
      ? (metadata.structuredContent as Record<string, unknown>)
      : null;
  const structuredType = typeof structured?.type === 'string' ? structured.type : '';
  if (structuredType && structuredType !== 'writing') return true;
  const domain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() : '';
  if (domain === 'rpg') return true;
  return false;
};

type OpenWritingReaderEventDetail = { blockId: string; mode?: 'formatted' | 'raw' | 'edit' };
type OpenStructuredEditorEventDetail = { blockId: string };

const tryParseJsonContent = (text: string): Record<string, unknown> | null => {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const lastBrace = trimmed.lastIndexOf('}');
  const lastBracket = trimmed.lastIndexOf(']');

  const startIndexCandidates = [firstBrace, firstBracket].filter((v) => v >= 0);
  const startIndex = startIndexCandidates.length ? Math.min(...startIndexCandidates) : -1;

  const endIndex = Math.max(lastBrace, lastBracket);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return null;

  const extracted = trimmed.slice(startIndex, endIndex + 1);
  const parsed = parseAIResponse<unknown>(extracted);
  if (!parsed.success) return null;

  const data = parsed.data;
  if (!data) return null;
  if (Array.isArray(data)) return { items: data };
  if (typeof data === 'object') return data as Record<string, unknown>;
  return null;
};

const ContentBlockBody: React.FC<{ block: ContentBlock; onBlockUpdated?: (updated: ContentBlock) => void }> = ({
  block,
  onBlockUpdated,
}) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [expanded, setExpanded] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [readerMode, setReaderMode] = useState<'formatted' | 'raw' | 'edit'>('formatted');
  const [showStructuredEditor, setShowStructuredEditor] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenWritingReaderEventDetail>).detail;
      if (!detail || detail.blockId !== block.id) return;
      setReaderMode(detail.mode ?? 'formatted');
      setShowReader(true);
    };

    window.addEventListener('open-writing-reader', handler);
    return () => window.removeEventListener('open-writing-reader', handler);
  }, [block.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenStructuredEditorEventDetail>).detail;
      if (!detail || detail.blockId !== block.id) return;
      setShowStructuredEditor(true);
    };

    window.addEventListener('open-structured-editor', handler);
    return () => window.removeEventListener('open-structured-editor', handler);
  }, [block.id]);

  const metadata = (block.metadata ?? {}) as Record<string, unknown>;
  const fullGenerated = metadata.full_generated_content;
  const fullGeneratedObj =
    fullGenerated && typeof fullGenerated === 'object' && !Array.isArray(fullGenerated)
      ? (fullGenerated as Record<string, unknown>)
      : null;

  const structured = metadata.structuredContent;
  const structuredObj = structured && typeof structured === 'object' ? (structured as Record<string, unknown>) : null;
  const structuredData = structuredObj?.data;
  const structuredDataObj =
    structuredData && typeof structuredData === 'object' && !Array.isArray(structuredData)
      ? (structuredData as Record<string, unknown>)
      : null;

  const parsedFromContent = useMemo(() => {
    if (fullGeneratedObj || structuredDataObj) return null;
    return tryParseJsonContent(block.content);
  }, [block.content, fullGeneratedObj, structuredDataObj]);

  const payload = fullGeneratedObj || structuredDataObj || parsedFromContent;

  const deliverable =
    typeof metadata.deliverable === 'string'
      ? metadata.deliverable
      : (typeof payload?.deliverable === 'string' ? String(payload.deliverable) : undefined);

  const isWritingDomain =
    typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() === 'writing' : false;
  const deliverableLower = typeof deliverable === 'string' ? deliverable.toLowerCase() : '';
  const isWritingDeliverable = WRITING_TOKENS.some((token) => deliverableLower.includes(token));

  const payloadForRender =
    payload &&
    (isWritingDomain || isWritingDeliverable) &&
    typeof block.content === 'string' &&
    block.content.trim().length > 0 &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
      ? {
          ...(payload as Record<string, unknown>),
          formatted_text: block.content,
          text: block.content,
        }
      : payload;

  const renderPayload =
    payloadForRender ||
    (viewMode === 'formatted' &&
    typeof block.content === 'string' &&
    block.content.trim().length > 0 &&
    (isWritingDomain || isWritingDeliverable)
      ? {
          deliverable,
          domain: isWritingDomain ? 'writing' : undefined,
          text: block.content,
          formatted_text: block.content,
          sources_used: metadata.sources_used,
          assumptions: metadata.assumptions,
          canon_update: metadata.canon_update,
          canon_alignment_score: metadata.canon_alignment_score,
          logic_score: metadata.logic_score,
          validation_notes: metadata.validation_notes,
          balance_notes: metadata.balance_notes,
          physics_issues: metadata.physics_issues,
          conflicts: metadata.conflicts,
          proposals: metadata.proposals,
        }
      : null);

  const shouldClamp = viewMode === 'formatted' && !expanded;
  const isLongText = typeof block.content === 'string' && block.content.length > 1200;

  const canRenderFormatted = Boolean(renderPayload);

  const canStructuredEdit =
    Boolean(onBlockUpdated) &&
    !isWrittenBlock(block) &&
    (isStructuredBlock(block) || Boolean(payload)) &&
    Boolean(payload) &&
    typeof payload === 'object' &&
    !Array.isArray(payload);

  return (
    <div className="space-y-3">
      {canRenderFormatted && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('formatted')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'formatted'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Formatted
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === 'raw'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Raw
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          {typeof metadata.domain === 'string' && metadata.domain && (
            <span className="mr-2">Domain: {metadata.domain}</span>
          )}
          {deliverable && <span>Type: {deliverable}</span>}
        </div>
        {canRenderFormatted && (isWritingDomain || isWritingDeliverable) ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setReaderMode('formatted');
                setShowReader(true);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-2"
              title="Open reader"
            >
              <Eye className="w-4 h-4" />
              Open Reader
            </button>
          </div>
        ) : canStructuredEdit ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowStructuredEditor(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-2"
              title="Edit structured content"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === 'formatted' ? (
        renderPayload ? (
          <div
            className={`bg-white border border-gray-200 rounded-lg p-4 overflow-auto ${
              shouldClamp ? 'max-h-96' : 'max-h-[70vh]'
            }`}
          >
            <ContentRenderer content={renderPayload} deliverable={deliverable} />
          </div>
        ) : (
          <p className="text-gray-600 whitespace-pre-wrap">{block.content}</p>
        )
      ) : (
        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-auto">
          {renderPayload ? JSON.stringify(renderPayload, null, 2) : block.content}
        </pre>
      )}

      {viewMode === 'formatted' && canRenderFormatted && (isWritingDomain || isWritingDeliverable) && (
        <div className="flex justify-end">
          {isLongText && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      )}

      <WritingReaderModal
        isOpen={showReader}
        title={block.title}
        content={renderPayload ?? { text: block.content, deliverable, domain: isWritingDomain ? 'writing' : undefined }}
        rawText={typeof block.content === 'string' ? block.content : ''}
        initialMetadata={metadata}
        deliverable={deliverable}
        initialMode={readerMode}
        onSave={
          onBlockUpdated
            ? async (update) => {
                const response = await contentApi.update(block.id, {
                  title: update.title,
                  content: update.content,
                  metadata: update.metadata,
                });
                if (response.success && response.data) {
                  onBlockUpdated(response.data);
                } else {
                  throw new Error(response.error || 'Failed to save content');
                }
              }
            : undefined
        }
        onClose={() => setShowReader(false)}
      />

      {showStructuredEditor && canStructuredEdit && (
        <EditContentModal
          isOpen={showStructuredEditor}
          generatedContent={payload as Record<string, unknown>}
          onClose={() => setShowStructuredEditor(false)}
          onSave={async (editedData) => {
            const existingMetadata = (block.metadata ?? {}) as Record<string, unknown>;
            const existingStructured =
              existingMetadata.structuredContent && typeof existingMetadata.structuredContent === 'object'
                ? (existingMetadata.structuredContent as Record<string, unknown>)
                : {};

            const hasFullGeneratedUpdate =
              existingMetadata.full_generated_content &&
              typeof existingMetadata.full_generated_content === 'object' &&
              !Array.isArray(existingMetadata.full_generated_content);

            const nextMetadata: Record<string, unknown> = {
              ...existingMetadata,
              ...(hasFullGeneratedUpdate
                ? { full_generated_content: editedData as unknown }
                : {
                    structuredContent: {
                      ...existingStructured,
                      data: editedData as unknown,
                    },
                  }),
            };

            const response = await contentApi.update(block.id, {
              title: block.title,
              metadata: nextMetadata,
            });

            if (response.success && response.data) {
              onBlockUpdated?.(response.data);
              setShowStructuredEditor(false);
            } else {
              throw new Error(response.error || 'Failed to save content');
            }
          }}
        />
      )}
    </div>
  );
};

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewBlockForm, setShowNewBlockForm] = useState(false);
  const [newBlock, setNewBlock] = useState({
    title: '',
    type: ContentType.TEXT,
    content: '',
  });
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  const [contentDomainFilter, setContentDomainFilter] = useState<'all' | 'written' | 'structured'>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | ContentType>('all');
  const [writingStatusFilter, setWritingStatusFilter] = useState<'all' | 'draft' | 'revised' | 'final' | 'none'>('all');
  const [writingTagFilter, setWritingTagFilter] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<GeneratedContentDoc | null>(null);
  const [showContentModal, setShowContentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const handleBlockUpdated = useCallback((updated: ContentBlock) => {
    setContentBlocks((prev: ContentBlock[]) =>
      prev.map((b) => (b.id === updated.id ? updated : b)),
    );
  }, []);

  useEffect(() => {
    if (reorderMode) return;
    setReorderIds(contentBlocks.map((b) => b.id));
  }, [contentBlocks, reorderMode]);

  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      const response = await projectApi.getById(id);
      if (response.success && response.data) {
        setProject(response.data);
      } else {
        setError(response.error || 'Project not found');
      }
    } catch (err) {
      setError('Failed to load project');
      console.error('Error loading project:', err);
    }
  }, [id]);

  const filteredContentBlocks = useMemo(() => {
    let filtered = contentBlocks;

    if (contentDomainFilter === 'written') {
      filtered = filtered.filter((block) => isWrittenBlock(block));
    } else if (contentDomainFilter === 'structured') {
      filtered = filtered.filter((block) => isStructuredBlock(block));
    }

    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter((block) => block.type === contentTypeFilter);
    }

    const statusFilter = writingStatusFilter;
    const tagQuery = writingTagFilter.trim().toLowerCase();
    if (statusFilter !== 'all' || tagQuery.length) {
      filtered = filtered.filter((block) => {
        if (!isWrittenBlock(block)) return true;

        const metadata = (block.metadata ?? {}) as Record<string, unknown>;
        const status = typeof metadata.writing_status === 'string' ? metadata.writing_status.toLowerCase() : '';
        const tags = asStringList(metadata.writing_tags).map((t) => t.toLowerCase());

        if (statusFilter === 'none' && status) return false;
        if (statusFilter !== 'all' && statusFilter !== 'none' && status !== statusFilter) return false;
        if (tagQuery.length && !tags.some((t) => t.includes(tagQuery))) return false;
        return true;
      });
    }

    const query = contentSearchQuery.trim().toLowerCase();
    if (query.length) {
      filtered = filtered.filter((block) => {
        if (block.title.toLowerCase().includes(query)) return true;
        if (typeof block.content === 'string' && block.content.toLowerCase().includes(query)) return true;
        const metadata = (block.metadata ?? {}) as Record<string, unknown>;
        const deliverable = typeof metadata.deliverable === 'string' ? metadata.deliverable.toLowerCase() : '';
        if (deliverable.includes(query)) return true;
        return false;
      });
    }

    return filtered;
  }, [contentBlocks, contentDomainFilter, contentSearchQuery, contentTypeFilter, writingStatusFilter, writingTagFilter]);

  const orderedBlocksForReorder = useMemo(() => {
    const lookup = new Map(contentBlocks.map((b) => [b.id, b] as const));
    const ordered = reorderIds.map((id) => lookup.get(id)).filter(Boolean) as ContentBlock[];
    const missing = contentBlocks.filter((b) => !reorderIds.includes(b.id));
    return [...ordered, ...missing];
  }, [contentBlocks, reorderIds]);

  const handleSaveOrder = async () => {
    if (!id) return;
    setReorderSaving(true);
    try {
      const ids = orderedBlocksForReorder.map((b) => b.id);
      const response = await contentApi.reorder(id, ids);
      if (!response.success) throw new Error(response.error || 'Failed to reorder');

      setContentBlocks((prev) => {
        const map = new Map(prev.map((b) => [b.id, b] as const));
        return ids
          .map((bid, index) => {
            const existing = map.get(bid);
            if (!existing) return undefined;
            return { ...existing, order: index };
          })
          .filter(Boolean) as ContentBlock[];
      });

      setReorderMode(false);
    } catch (err) {
      console.error('Failed to save order:', err);
    } finally {
      setReorderSaving(false);
    }
  };

  const groupedBlocks = useMemo(() => {
    const groups = new Map<ContentType, ContentBlock[]>();
    for (const block of filteredContentBlocks) {
      const list = groups.get(block.type) ?? [];
      list.push(block);
      groups.set(block.type, list);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const order: ContentType[] = [
        ContentType.OUTLINE,
        ContentType.STORY_ARC,
        ContentType.CHAPTER,
        ContentType.SECTION,
        ContentType.TEXT,
        ContentType.CHARACTER,
        ContentType.LOCATION,
        ContentType.ITEM,
        ContentType.STAT_BLOCK,
        ContentType.FACT,
      ];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });
  }, [filteredContentBlocks]);

  const handleCopyBlock = async (block: ContentBlock) => {
    try {
      await navigator.clipboard.writeText(block.content || '');
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = block.content || '';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // ignore
      }
    }
  };

  const loadContent = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await contentApi.getByProjectId(id);
      if (response.success && response.data) {
        setContentBlocks(response.data);
      }
    } catch (err) {
      console.error('Error loading content:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadGeneratedContent = useCallback(async () => {
    if (!id) return;
    try {
      console.log('[ProjectDetail] Loading generated content for project:', id);
      const response = await fetch(`${API_BASE_URL}/content/generated/list/${id}`);
      console.log('[ProjectDetail] API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[ProjectDetail] API response data:', data);

        if (data.success && data.data) {
          console.log('[ProjectDetail] Setting generated content:', data.data.length, 'items');
          setGeneratedContent(data.data as GeneratedContentDoc[]);
        } else {
          console.warn('[ProjectDetail] API returned success=false or no data:', data);
          setGeneratedContent([]);
        }
      } else {
        console.error('[ProjectDetail] API request failed with status:', response.status);
        const errorText = await response.text();
        console.error('[ProjectDetail] Error response:', errorText);
        setGeneratedContent([]);
      }
    } catch (err) {
      console.error('[ProjectDetail] Error loading generated content:', err);
      setGeneratedContent([]);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadProject();
      loadContent();
      loadGeneratedContent();
    }
  }, [id, loadProject, loadContent, loadGeneratedContent]);

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newBlock.title.trim()) return;

    try {
      const response = await contentApi.create({
        projectId: id!,
        title: newBlock.title,
        content: newBlock.content,
        type: newBlock.type,
        order: contentBlocks.length,
        metadata: {},
      });

      if (response.success && response.data) {
        setContentBlocks([...contentBlocks, response.data]);
        setNewBlock({ title: '', type: ContentType.TEXT, content: '' });
        setShowNewBlockForm(false);
      }
    } catch (err) {
      console.error('Error creating content block:', err);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!window.confirm('Are you sure you want to delete this content block?')) {
      return;
    }

    try {
      const response = await contentApi.delete(blockId);
      if (response.success) {
        setContentBlocks(contentBlocks.filter(b => b.id !== blockId));
      }
    } catch (err) {
      console.error('Error deleting content block:', err);
    }
  };

  const handleViewContent = (content: GeneratedContentDoc) => {
    setSelectedContent(content);
    setShowContentModal(true);
  };

  const handleContentSaved = (updatedContent: GeneratedContentDoc) => {
    if (!updatedContent?._id) {
      console.warn('handleContentSaved called without a valid _id');
      return;
    }

    // Update the content in the list
    setGeneratedContent(prev =>
      prev.map(c => (c._id === updatedContent._id ? updatedContent : c))
    );
    setSelectedContent(updatedContent);
  };

  // Helper function to get display label for content
  const getContentDisplayType = (content: GeneratedContentDoc): string => {
    // Prefer deliverable over content_type for more specific labeling
    if (content.metadata?.deliverable) {
      return content.metadata.deliverable;
    }
    return content.content_type;
  };

  // Filter and search generated content
  const filteredContent = useMemo(() => {
    let filtered = generatedContent;

    // Apply type filter using display type (deliverable if available, otherwise content_type)
    if (filterType !== 'all') {
      filtered = filtered.filter(c => getContentDisplayType(c).toLowerCase() === filterType.toLowerCase());
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(query) ||
        c.content_type.toLowerCase().includes(query) ||
        c.metadata?.deliverable?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [generatedContent, filterType, searchQuery]);

  // Calculate statistics
  const contentStats = useMemo(() => {
    const stats = new Map<string, number>();
    generatedContent.forEach(c => {
      const type = getContentDisplayType(c);
      stats.set(type, (stats.get(type) || 0) + 1);
    });
    return Array.from(stats.entries()).sort((a, b) => b[1] - a[1]);
  }, [generatedContent]);

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Project not found'}</p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-gray-900">{project.title}</h1>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              {PROJECT_TYPE_LABELS[project.type]}
            </span>
          </div>
          {project.description && (
            <p className="text-gray-600 mt-2">{project.description}</p>
          )}
        </div>
      </div>

      {/* Project Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate(`/projects/${id}/canon`)}
          className="flex items-center justify-center gap-3 p-4 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-colors group"
        >
          <BookOpen className="w-6 h-6 text-blue-600" />
          <div className="text-left">
            <div className="font-semibold text-gray-900">Manage Canon Resources</div>
            <div className="text-sm text-gray-600">Link entities and build your world</div>
          </div>
        </button>
        <button
          onClick={() => navigate(`/generator?projectId=${id}`)}
          className="flex items-center justify-center gap-3 p-4 border-2 border-purple-200 bg-purple-50 rounded-lg hover:border-purple-400 hover:bg-purple-100 transition-colors group"
        >
          <Wand2 className="w-6 h-6 text-purple-600" />
          <div className="text-left">
            <div className="font-semibold text-gray-900">Generate Content</div>
            <div className="text-sm text-gray-600">Create new content with AI</div>
          </div>
        </button>
      </div>

      {/* Generated Content Section */}
      {generatedContent.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-600" />
              AI-Generated Content
              <span className="text-sm font-normal text-gray-500">({filteredContent.length} of {generatedContent.length})</span>
            </h2>
          </div>

          {/* Statistics Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({generatedContent.length})
            </button>
            {contentStats.map(([type, count]) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filterType === type
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type} ({count})
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title, type, or deliverable..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Content Grid */}
          {filteredContent.length === 0 ? (
            <div className="text-center py-12 card border-2 border-dashed border-gray-300">
              <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No matching content</h3>
              <p className="text-gray-600">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContent.map((content) => (
                <div key={content._id} className="card border-2 border-purple-200 bg-purple-50/30 hover:border-purple-400 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{content.title}</h3>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                      {getContentDisplayType(content)}
                    </span>
                  </div>
                  {content.metadata?.difficulty && (
                    <div className="text-sm text-gray-600 mb-2">
                      Difficulty: {content.metadata.difficulty}
                    </div>
                  )}
                  {content.metadata?.sources_used && content.metadata.sources_used.length > 0 && (
                    <div className="text-xs text-gray-500 mb-2">
                      {content.metadata.sources_used.length} sources referenced
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Created {new Date(content.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleViewContent(content)}
                      className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center justify-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Delete this generated content?')) {
                          try {
                            await fetch(`${API_BASE_URL}/content/generated/${content._id}`, { method: 'DELETE' });
                            loadGeneratedContent();
                          } catch (err) {
                            console.error('Error deleting:', err);
                          }
                        }
                      }}
                      className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Content Blocks</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReorderMode((prev) => !prev)}
            className={`px-3 py-2 text-sm rounded border transition-colors flex items-center gap-2 ${
              reorderMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            Reorder
          </button>
          <button
            onClick={() => setShowNewBlockForm(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Content</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setContentDomainFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                contentDomainFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({contentBlocks.length})
            </button>
            <button
              type="button"
              onClick={() => setContentDomainFilter('written')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                contentDomainFilter === 'written'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Written ({contentBlocks.filter((b) => isWrittenBlock(b)).length})
            </button>
            <button
              type="button"
              onClick={() => setContentDomainFilter('structured')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                contentDomainFilter === 'structured'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Structured ({contentBlocks.filter((b) => isStructuredBlock(b)).length})
            </button>
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search content blocks..."
              value={contentSearchQuery}
              onChange={(e) => setContentSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Type</label>
            <select
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value as 'all' | ContentType)}
              className="input py-2"
            >
              <option value="all">All</option>
              {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={writingStatusFilter}
              onChange={(e) =>
                setWritingStatusFilter(
                  e.target.value as 'all' | 'draft' | 'revised' | 'final' | 'none',
                )
              }
              className="input py-2"
            >
              <option value="all">All</option>
              <option value="none">(none)</option>
              <option value="draft">Draft</option>
              <option value="revised">Revised</option>
              <option value="final">Final</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Tag</label>
            <input
              type="text"
              value={writingTagFilter}
              onChange={(e) => setWritingTagFilter(e.target.value)}
              placeholder="filter"
              className="input py-2"
            />
          </div>
        </div>
      </div>

      {reorderMode && (
        <div className="card border-2 border-blue-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">Reorder content blocks</div>
              <div className="text-sm text-gray-600">Drag items to reorder. Save to persist.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReorderMode(false)}
                disabled={reorderSaving}
                className="px-3 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={reorderSaving}
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {reorderSaving ? 'Saving…' : 'Save order'}
              </button>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {orderedBlocksForReorder.map((block) => {
              const metadata = (block.metadata ?? {}) as Record<string, unknown>;
              const status = typeof metadata.writing_status === 'string' ? metadata.writing_status : '';
              const tags = asStringList(metadata.writing_tags);
              return (
                <li
                  key={block.id}
                  draggable
                  onDragStart={() => setDraggedId(block.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!draggedId || draggedId === block.id) return;
                    setReorderIds((prev) => {
                      const ids = prev.length ? [...prev] : contentBlocks.map((b) => b.id);
                      const from = ids.indexOf(draggedId);
                      const to = ids.indexOf(block.id);
                      if (from < 0 || to < 0) return ids;
                      ids.splice(from, 1);
                      ids.splice(to, 0, draggedId);
                      return ids;
                    });
                  }}
                  className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{block.title}</div>
                      <div className="text-xs text-gray-500">
                        {CONTENT_TYPE_LABELS[block.type]}
                        {status ? ` • ${status}` : ''}
                        {tags.length ? ` • ${tags.slice(0, 3).join(', ')}` : ''}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showNewBlockForm && (
        <div className="card">
          <form onSubmit={handleCreateBlock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title
              </label>
              <input
                type="text"
                value={newBlock.title}
                onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
                className="input"
                placeholder="Enter content title..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={newBlock.type}
                onChange={(e) => setNewBlock({ ...newBlock, type: e.target.value as ContentType })}
                className="input"
              >
                {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content (Optional)
              </label>
              <textarea
                value={newBlock.content}
                onChange={(e) => setNewBlock({ ...newBlock, content: e.target.value })}
                className="input"
                rows={4}
                placeholder="Enter initial content..."
              />
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowNewBlockForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create Block
              </button>
            </div>
          </form>
        </div>
      )}

      {contentBlocks.length === 0 ? (
        <div className="text-center py-12 card">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No content yet</h3>
          <p className="text-gray-600 mb-6">Start building your project by adding content blocks</p>
          <button
            onClick={() => setShowNewBlockForm(true)}
            className="btn-primary"
          >
            Add Your First Content Block
          </button>
        </div>
      ) : reorderMode ? null : filteredContentBlocks.length === 0 ? (
        <div className="text-center py-12 card border-2 border-dashed border-gray-300">
          <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No matching content blocks</h3>
          <p className="text-gray-600">Try adjusting your filters or search.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedBlocks.map(([type, blocks]) => (
            <details key={type} open className="card">
              <summary className="cursor-pointer select-none flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">{CONTENT_TYPE_LABELS[type]}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    {blocks.length}
                  </span>
                </div>
              </summary>
              <div className="mt-4">
                {type === ContentType.TEXT ? (
                  <TextBlocksSplitView
                    blocks={blocks}
                    onCopy={handleCopyBlock}
                    onDelete={handleDeleteBlock}
                    onBlockUpdated={handleBlockUpdated}
                  />
                ) : (
                  <div className="space-y-4">
                    {blocks.map((block) => (
                      <div key={block.id} className="card">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">{block.title}</h3>
                              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                {CONTENT_TYPE_LABELS[block.type]}
                              </span>
                              {isWrittenBlock(block) && typeof block.content === 'string' && block.content.trim().length > 0 && (
                                <span className="text-xs text-gray-500">
                                  {(() => {
                                    const words = countWords(block.content);
                                    const minutes = Math.max(1, Math.round(words / 200));
                                    return `${words.toLocaleString()} words • ~${minutes} min`;
                                  })()}
                                </span>
                              )}
                              {isWrittenBlock(block) && (() => {
                                const metadata = (block.metadata ?? {}) as Record<string, unknown>;
                                const status = typeof metadata.writing_status === 'string' ? metadata.writing_status : '';
                                const tags = asStringList(metadata.writing_tags);
                                if (!status && tags.length === 0) return null;
                                return (
                                  <span className="text-xs text-gray-500">
                                    {status ? `• ${status}` : ''}
                                    {tags.length ? ` • ${tags.slice(0, 3).join(', ')}` : ''}
                                  </span>
                                );
                              })()}
                            </div>
                            {block.content && <ContentBlockBody block={block} onBlockUpdated={handleBlockUpdated} />}
                            <p className="text-xs text-gray-500 mt-2">
                              Created {new Date(block.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              type="button"
                              onClick={() => handleCopyBlock(block)}
                              className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
                              title="Copy content"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
                              title="Open reader"
                              onClick={() => {
                                if (!isWrittenBlock(block)) return;
                                const open = new CustomEvent('open-writing-reader', {
                                  detail: { blockId: block.id, mode: 'formatted' as const },
                                });
                                window.dispatchEvent(open);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit block"
                              onClick={() => {
                                if (isWrittenBlock(block)) {
                                  const open = new CustomEvent('open-writing-reader', {
                                    detail: { blockId: block.id, mode: 'edit' as const },
                                  });
                                  window.dispatchEvent(open);
                                  return;
                                }

                                if (isStructuredBlock(block)) {
                                  const open = new CustomEvent('open-structured-editor', {
                                    detail: { blockId: block.id },
                                  });
                                  window.dispatchEvent(open);
                                }
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBlock(block.id)}
                              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Generated Content Modal */}
      <GeneratedContentModal
        isOpen={showContentModal}
        content={selectedContent}
        onClose={() => setShowContentModal(false)}
        onSave={handleContentSaved}
      />
    </div>
  );
};