/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  StickyNote, Plus, Trash2, Save, AlertCircle, RefreshCw,
  Clock, ChevronRight, Search, FileText,
} from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { getProductConfig } from '../config/products';

/** A note stored as a content block with domain 'notes'. */
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface RawContentBlock {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Maps a raw content block to a Note if it qualifies as a notes domain block. */
function blockToNote(block: RawContentBlock): Note | null {
  const meta = (block.metadata ?? {}) as Record<string, unknown>;
  if (meta.domain !== 'notes') return null;
  return {
    id: block.id,
    title: block.title || 'Untitled Note',
    content: block.content,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Session/draft notes page — freeform text notes scoped to a project. */
export const SessionNotes: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = getProductConfig();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedNote = notes.find(n => n.id === selectedId) ?? null;

  const loadNotes = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${projectId}`);
      if (!res.ok) throw new Error(`Failed to load notes (${res.status})`);
      const blocks = await res.json() as RawContentBlock[];
      const parsed = (Array.isArray(blocks) ? blocks : [])
        .map(blockToNote)
        .filter((n): n is Note => n !== null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setNotes(parsed);
    } catch (err) {
      console.error('[SessionNotes] loadNotes failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content);
      setIsDirty(false);
    }
  }, [selectedNote?.id]);

  const handleSelectNote = (note: Note) => {
    if (isDirty && selectedId) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    setSelectedId(note.id);
  };

  const handleNewNote = async () => {
    if (!projectId) return;
    if (isDirty && selectedId) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Note',
          content: '',
          type: 'text',
          metadata: { domain: 'notes' },
        }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const block = await res.json() as RawContentBlock;
      const note = blockToNote(block);
      if (!note) throw new Error('Created block is not a valid note');
      setNotes(prev => [note, ...prev]);
      setSelectedId(note.id);
      setEditTitle(note.title);
      setEditContent(note.content);
      setIsDirty(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      console.error('[SessionNotes] handleNewNote failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${projectId}/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle || 'Untitled Note',
          content: editContent,
          type: 'text',
          metadata: { domain: 'notes' },
        }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      const updated = await res.json() as RawContentBlock;
      const note = blockToNote(updated) ?? {
        id: selectedId,
        title: editTitle,
        content: editContent,
        createdAt: selectedNote?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setNotes(prev => prev.map(n => n.id === selectedId ? note : n).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ));
      setIsDirty(false);
    } catch (err) {
      console.error('[SessionNotes] handleSave failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!projectId) return;
    if (!window.confirm('Delete this note permanently?')) return;
    setDeletingId(noteId);
    try {
      const res = await fetch(`${API_BASE_URL}/content/${projectId}/${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(prev => prev.filter(n => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setEditTitle('');
        setEditContent('');
        setIsDirty(false);
      }
    } catch (err) {
      console.error('[SessionNotes] handleDelete failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredNotes = notes.filter(n => {
    const q = searchQuery.toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600">Project ID not found.</p>
        <button onClick={() => navigate('/')} className="btn-primary mt-4">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {product.navigationLabels.notes}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Freeform notes for this {product.workspaceNoun.toLowerCase()}.
          </p>
        </div>
        <button
          onClick={() => void handleNewNote()}
          disabled={saving}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Note
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button onClick={() => void loadNotes()}><RefreshCw className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 h-[calc(100vh-260px)] min-h-[400px]">
          {/* Notes list */}
          <div className="flex flex-col border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            {/* Search */}
            <div className="p-3 border-b border-gray-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="input pl-8 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <StickyNote className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 dark:text-slate-500">
                    {notes.length === 0 ? 'No notes yet. Create your first note.' : 'No notes match your search.'}
                  </p>
                </div>
              ) : (
                filteredNotes.map(note => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-slate-800 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 flex items-start gap-3 ${
                      selectedId === note.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${selectedId === note.id ? 'text-primary-500' : 'text-gray-300 dark:text-slate-600'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${selectedId === note.id ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-slate-200'}`}>
                        {note.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatDate(note.updatedAt)}
                      </p>
                      {note.content && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {note.content.slice(0, 100)}
                        </p>
                      )}
                    </div>
                    {selectedId === note.id && <ChevronRight className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Editor panel */}
          {selectedId ? (
            <div className="flex flex-col border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
              {/* Editor toolbar */}
              <div className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-slate-800">
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => { setEditTitle(e.target.value); setIsDirty(true); }}
                  placeholder="Note title…"
                  className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
                <div className="flex items-center gap-2 shrink-0">
                  {isDirty && (
                    <span className="text-xs text-amber-500 dark:text-amber-400">Unsaved</span>
                  )}
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving || !isDirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => void handleDelete(selectedId)}
                    disabled={deletingId === selectedId}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={e => { setEditContent(e.target.value); setIsDirty(true); }}
                placeholder="Start writing…"
                className="flex-1 w-full p-5 text-sm leading-relaxed bg-transparent border-none outline-none resize-none text-gray-800 dark:text-slate-200 placeholder:text-gray-300 dark:placeholder:text-slate-600 font-mono"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-gray-200 dark:border-slate-700 rounded-2xl bg-gray-50 dark:bg-slate-900/50 text-center p-8">
              <StickyNote className="w-10 h-10 text-gray-300 dark:text-slate-600 mb-3" />
              <p className="text-gray-400 dark:text-slate-500 text-sm">
                {notes.length === 0 ? 'Create your first note to get started.' : 'Select a note to edit it here.'}
              </p>
              {notes.length === 0 && (
                <button onClick={() => void handleNewNote()} className="btn-primary text-sm mt-4 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New Note
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
