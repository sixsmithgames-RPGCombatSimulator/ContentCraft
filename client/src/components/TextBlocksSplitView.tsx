/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { ContentBlock } from '../types';
import { contentApi } from '../services/api';
import ContentRenderer from './generator/ContentRenderer';
import WritingReaderModal from './generator/WritingReaderModal';
import { parseAIResponse } from '../utils/jsonParser';

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

 const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value as Record<string, unknown>;
 };

 const extractDisplayText = (payload: unknown, rawText: string): string => {
  const getStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const isLikelyValidationText = (value: string): boolean => {
    const t = value.toLowerCase();

    const strongSignals = [
      'canon alignment',
      'canon facts',
      'canon fact',
      'logic score',
      'alignment score',
      'conflict id',
      'cannot be deterministically',
      'validator output',
    ];
    if (strongSignals.some((signal) => t.includes(signal))) return true;

    const hasValidatorWord = t.includes('validator') || /\bvalidation\b/i.test(value);
    if (!hasValidatorWord) return false;

    const hasValidationStructure =
      t.includes('score') || t.includes('canon') || t.includes('conflict id') || t.includes('cannot be deterministically');
    return hasValidationStructure;
  };

  const fromRecord = (record: Record<string, unknown>): string => {
    const draft = asRecord(record['draft']);
    const merged: Record<string, unknown> = Object.keys(draft).length ? { ...record, ...draft } : record;

    const contentValue = merged['content'];
    const contentArray = Array.isArray(contentValue)
      ? (contentValue as unknown[])
          .map((entry) => {
            if (typeof entry === 'string') return entry.trim();
            const entryObj = asRecord(entry);
            return getStr(entryObj['text']) || getStr(entryObj['draft_text'] ?? entryObj['draftText']);
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

    const candidates = [
      getStr(merged['formatted_text'] ?? merged['formattedText']),
      getStr(merged['formatted_manuscript'] ?? merged['formattedManuscript']),
      getStr(merged['draft_text'] ?? merged['draftText']),
      getStr(merged['chapter_text'] ?? merged['chapterText']),
      getStr(merged['body']),
      getStr(merged['text']),
      typeof contentValue === 'string' ? getStr(contentValue) : '',
      contentArray,
    ].filter((c) => c && c.trim().length > 0);

    const nonValidation = candidates.find((candidate) => !isLikelyValidationText(candidate));
    return nonValidation ?? candidates[0] ?? '';
  };

  const payloadRecord = asRecord(payload);
  const fromPayload = Object.keys(payloadRecord).length ? fromRecord(payloadRecord) : '';
  if (fromPayload && !isLikelyValidationText(fromPayload)) return fromPayload;

  const parsed = rawText ? tryParseJsonContent(rawText) : null;
  if (parsed) {
    const fromParsed = fromRecord(parsed);
    if (fromParsed && !isLikelyValidationText(fromParsed)) return fromParsed;
  }

  return rawText;
 };

export default function TextBlocksSplitView({
  blocks,
  onCopy,
  onDelete,
  onBlockUpdated,
}: {
  blocks: ContentBlock[];
  onCopy: (block: ContentBlock) => void;
  onDelete: (blockId: string) => void;
  onBlockUpdated?: (updated: ContentBlock) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(blocks[0]?.id ?? '');
  const [showReader, setShowReader] = useState(false);
  const [showPublishedReader, setShowPublishedReader] = useState(false);
  const [readerMode, setReaderMode] = useState<'formatted' | 'raw' | 'edit'>('formatted');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string>('');
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitleId, setSavingTitleId] = useState<string>('');
  const [titleError, setTitleError] = useState<string>('');
  const [savingPublishId, setSavingPublishId] = useState<string>('');

  useEffect(() => {
    if (!blocks.length) {
      setSelectedId('');
      return;
    }

    if (!selectedId || !blocks.some((b) => b.id === selectedId)) {
      setSelectedId(blocks[0].id);
    }
  }, [blocks, selectedId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ blockId: string; mode?: 'formatted' | 'raw' | 'edit' }>).detail;
      if (!detail?.blockId) return;
      if (!blocks.some((b) => b.id === detail.blockId)) return;
      setSelectedId(detail.blockId);
      setReaderMode(detail.mode ?? 'formatted');
      setShowReader(true);
    };

    window.addEventListener('open-writing-reader', handler);
    return () => window.removeEventListener('open-writing-reader', handler);
  }, [blocks]);

  const selectedBlock = useMemo(() => blocks.find((b) => b.id === selectedId) ?? null, [blocks, selectedId]);

  const isIncludedInPublished = (metadata: Record<string, unknown>): boolean => {
    return metadata.include_in_published !== false;
  };

  const beginRename = (block: ContentBlock) => {
    setTitleError('');
    setEditingId(block.id);
    setTitleDraft(block.title);
  };

  const cancelRename = () => {
    setTitleError('');
    setEditingId('');
    setTitleDraft('');
  };

  const commitRename = async (block: ContentBlock) => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError('Title cannot be empty.');
      return;
    }
    if (nextTitle === block.title) {
      cancelRename();
      return;
    }

    setSavingTitleId(block.id);
    setTitleError('');
    try {
      const response = await contentApi.update(block.id, { title: nextTitle });
      if (response.success && response.data) {
        onBlockUpdated?.(response.data);
        cancelRename();
      } else {
        throw new Error(response.error || 'Failed to rename');
      }
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setSavingTitleId('');
    }
  };

  const togglePublished = async (block: ContentBlock) => {
    const metadata = (block.metadata ?? {}) as Record<string, unknown>;
    const next = !isIncludedInPublished(metadata);
    setSavingPublishId(block.id);
    try {
      const response = await contentApi.update(block.id, {
        metadata: {
          ...metadata,
          include_in_published: next,
        },
      });
      if (response.success && response.data) {
        onBlockUpdated?.(response.data);
      } else {
        throw new Error(response.error || 'Failed to update');
      }
    } catch {
    } finally {
      setSavingPublishId('');
    }
  };

  useEffect(() => {
    if (!actionsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const el = actionsRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      setActionsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [actionsOpen]);

  const derived = useMemo(() => {
    if (!selectedBlock) {
      return {
        metadata: {} as Record<string, unknown>,
        deliverable: undefined as string | undefined,
        isWritingDomain: false,
        isWritingDeliverable: false,
        renderPayload: null as unknown,
        rawText: '',
        wordCount: 0,
        minutes: 0,
        status: '',
        tags: [] as string[],
      };
    }

    const metadata = (selectedBlock.metadata ?? {}) as Record<string, unknown>;
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

    const parsedFromContent = (() => {
      if (fullGeneratedObj || structuredDataObj) return null;
      return tryParseJsonContent(selectedBlock.content);
    })();

    const payload = fullGeneratedObj || structuredDataObj || parsedFromContent;
    const payloadBaseRecord = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;

    const deliverable =
      typeof metadata.deliverable === 'string'
        ? metadata.deliverable
        : (payloadBaseRecord && typeof payloadBaseRecord.deliverable === 'string' ? payloadBaseRecord.deliverable : undefined);

    const isWritingDomain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() === 'writing' : false;
    const deliverableLower = typeof deliverable === 'string' ? deliverable.toLowerCase() : '';
    const isWritingDeliverable = WRITING_TOKENS.some((token) => deliverableLower.includes(token));

    const rawText = typeof selectedBlock.content === 'string' ? selectedBlock.content : '';
    const rawTrimmed = rawText.trim();
    const rawLooksJson = rawTrimmed.startsWith('{') || rawTrimmed.startsWith('[');

    const payloadForRender =
      payload &&
      (isWritingDomain || isWritingDeliverable) &&
      typeof selectedBlock.content === 'string' &&
      selectedBlock.content.trim().length > 0 &&
      !rawLooksJson &&
      typeof payload === 'object' &&
      !Array.isArray(payload)
        ? {
            ...(payload as Record<string, unknown>),
            formatted_text: selectedBlock.content,
            text: selectedBlock.content,
          }
        : payload;
    const displayText = extractDisplayText(payloadForRender, rawText);
    const payloadForRenderRecord =
      payloadForRender && typeof payloadForRender === 'object' && !Array.isArray(payloadForRender)
        ? (payloadForRender as Record<string, unknown>)
        : null;

    const formattedPayload = displayText.trim().length
      ? {
          ...(payloadForRenderRecord ?? {}),
          deliverable,
          domain: 'writing',
          text: displayText,
          formatted_text: displayText,
        }
      : payloadForRender;
    const wordCount = countWords(rawText);
    const minutes = wordCount ? Math.max(1, Math.round(wordCount / 200)) : 0;

    const status = typeof metadata.writing_status === 'string' ? metadata.writing_status : '';
    const tags = asStringList(metadata.writing_tags);

    return {
      metadata,
      deliverable,
      isWritingDomain,
      isWritingDeliverable,
      renderPayload: formattedPayload,
      rawText,
      displayText,
      wordCount,
      minutes,
      status,
      tags,
    };
  }, [selectedBlock]);

  const publishedBlocks = useMemo(() => {
    return [...blocks]
      .filter((block) => {
        const metadata = (block.metadata ?? {}) as Record<string, unknown>;
        return isIncludedInPublished(metadata);
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [blocks]);

  const publishedCompiled = useMemo(() => {
    const pieces = publishedBlocks
      .map((block) => {
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

        const parsedFromContent = (() => {
          if (fullGeneratedObj || structuredDataObj) return null;
          return tryParseJsonContent(block.content);
        })();

        const payload = fullGeneratedObj || structuredDataObj || parsedFromContent;
        const rawText = typeof block.content === 'string' ? block.content : '';
        const displayText = extractDisplayText(payload, rawText).trim();

        const parts = [block.title ? `# ${block.title}` : '', displayText].filter(Boolean);
        return parts.join('\n\n').trim();
      })
      .filter(Boolean);

    return pieces.join('\n\n\n').trim();
  }, [publishedBlocks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden flex flex-col lg:h-[70vh]">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="font-semibold text-gray-900">Text</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPublishedReader(true)}
              disabled={publishedBlocks.length === 0}
              className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Published View ({publishedBlocks.length})
            </button>
            <div className="text-xs text-gray-500">{blocks.length}</div>
          </div>
        </div>
        <div className="p-2 flex-1 overflow-auto">
          <div className="space-y-1">
            {blocks.map((block) => {
              const isActive = block.id === selectedId;
              const metadata = (block.metadata ?? {}) as Record<string, unknown>;
              const status = typeof metadata.writing_status === 'string' ? metadata.writing_status : '';
              const tags = asStringList(metadata.writing_tags);
              const deliverable = typeof metadata.deliverable === 'string' ? metadata.deliverable : '';
              const words = typeof block.content === 'string' ? countWords(block.content) : 0;
              const minutes = words ? Math.max(1, Math.round(words / 200)) : 0;
              const included = isIncludedInPublished(metadata);
              const isEditing = editingId === block.id;
              const isSavingTitle = savingTitleId === block.id;
              const isSavingPublish = savingPublishId === block.id;
              return (
                <div
                  key={block.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(block.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(block.id);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                    isActive
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isEditing ? (
                          <input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename(block);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelRename();
                              }
                            }}
                            disabled={isSavingTitle}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            autoFocus
                          />
                        ) : (
                          <div className="font-medium text-gray-900 truncate">{block.title}</div>
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => commitRename(block)}
                              disabled={isSavingTitle}
                              className="p-1 rounded hover:bg-gray-200 disabled:opacity-60"
                              title="Save"
                            >
                              <Check className="w-4 h-4 text-gray-700" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              disabled={isSavingTitle}
                              className="p-1 rounded hover:bg-gray-200 disabled:opacity-60"
                              title="Cancel"
                            >
                              <X className="w-4 h-4 text-gray-700" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              beginRename(block);
                            }}
                            className="p-1 rounded hover:bg-gray-200 flex-shrink-0"
                            title="Rename"
                          >
                            <Pencil className="w-4 h-4 text-gray-500" />
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {deliverable ? deliverable : 'Text'}
                        {words ? ` • ${words.toLocaleString()} words • ~${minutes} min` : ''}
                        {status ? ` • ${status}` : ''}
                        {tags.length ? ` • ${tags.slice(0, 2).join(', ')}` : ''}
                      </div>
                      {isEditing && titleError && (
                        <div className="text-xs text-red-600 mt-1" onClick={(e) => e.stopPropagation()}>
                          {titleError}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 flex-shrink-0 flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePublished(block);
                        }}
                        disabled={isSavingPublish}
                        className={`px-2 py-0.5 rounded-full border text-[11px] disabled:opacity-60 ${
                          included
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                        }`}
                        title="Toggle published vs notes"
                      >
                        {included ? 'Published' : 'Notes'}
                      </button>
                      <div>{new Date(block.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-[520px] lg:h-[70vh]">
        {selectedBlock ? (
          <>
            <div className="px-5 py-4 border-b border-gray-200">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-lg font-semibold text-gray-900 truncate">{selectedBlock.title}</div>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {derived.deliverable ? derived.deliverable : 'Text'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePublished(selectedBlock)}
                        disabled={savingPublishId === selectedBlock.id}
                        className={`px-2 py-0.5 rounded text-xs font-medium border disabled:opacity-60 ${
                          isIncludedInPublished(derived.metadata)
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                        }`}
                        title="Toggle published vs notes"
                      >
                        {isIncludedInPublished(derived.metadata) ? 'Published' : 'Notes'}
                      </button>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        Preview
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {derived.wordCount ? `${derived.wordCount.toLocaleString()} words • ~${derived.minutes} min` : ''}
                      {derived.status ? ` • ${derived.status}` : ''}
                      {derived.tags.length ? ` • ${derived.tags.slice(0, 3).join(', ')}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setReaderMode('edit');
                        setShowReader(true);
                      }}
                      className="px-3 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700"
                    >
                      Open in Editor
                    </button>

                    <div className="relative" ref={actionsRef}>
                      <button
                        type="button"
                        onClick={() => setActionsOpen((prev) => !prev)}
                        className="px-3 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                      >
                        Actions
                      </button>
                      {actionsOpen && (
                        <div
                          role="menu"
                          className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10"
                        >
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              onCopy(selectedBlock);
                              setActionsOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Copy
                          </button>
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              onDelete(selectedBlock.id);
                              setActionsOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {derived.renderPayload ? (
                <ContentRenderer content={derived.renderPayload} deliverable={derived.deliverable} />
              ) : (
                <p className="text-gray-700 whitespace-pre-wrap">{derived.displayText || derived.rawText}</p>
              )}
            </div>

            <WritingReaderModal
              isOpen={showReader}
              title={selectedBlock.title}
              content={
                derived.renderPayload ?? {
                  text: derived.rawText,
                  formatted_text: derived.rawText,
                  deliverable: derived.deliverable,
                  domain: derived.isWritingDomain ? 'writing' : undefined,
                }
              }
              rawText={derived.rawText}
              initialMetadata={derived.metadata}
              deliverable={derived.deliverable}
              initialMode={readerMode}
              onSave={
                onBlockUpdated
                  ? async (update) => {
                      const response = await contentApi.update(selectedBlock.id, {
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

            <WritingReaderModal
              isOpen={showPublishedReader}
              title="Published Work"
              content={{
                domain: 'writing',
                deliverable: 'manuscript',
                text: publishedCompiled,
                formatted_text: publishedCompiled,
              }}
              rawText={publishedCompiled}
              initialMetadata={{}}
              deliverable="Manuscript"
              initialMode="formatted"
              onClose={() => setShowPublishedReader(false)}
            />
          </>
        ) : (
          <div className="p-6 text-sm text-gray-600">Select a text item to preview.</div>
        )}
      </div>
    </div>
  );
}
