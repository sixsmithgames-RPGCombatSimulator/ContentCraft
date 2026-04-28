/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, Plus, Edit2, Trash2, AlertCircle, RefreshCw,
  Save, X, ChevronDown, ChevronUp, CalendarDays,
} from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { getProductConfig } from '../config/products';

/** A timeline entity from the canon library. */
interface TimelineEntity {
  _id: string;
  canonical_name: string;
  type: 'timeline';
  era?: string;
  region?: string;
  claims?: Array<{ text: string; source: string }>;
  tags?: string[];
  aliases?: string[];
}

/** Form state for creating or editing a timeline event. */
interface EventForm {
  name: string;
  era: string;
  description: string;
  tags: string;
}

const EMPTY_FORM: EventForm = { name: '', era: '', description: '', tags: '' };

function formatTags(raw: string): string[] {
  return raw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Timeline page — ordered list of timeline events linked to a project. */
export const ProjectTimeline: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = getProductConfig();

  const [events, setEvents] = useState<TimelineEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<EventForm>(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EventForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/entities`);
      if (!res.ok) throw new Error(`Failed to load timeline (${res.status})`);
      const data = await res.json() as TimelineEntity[];
      const timelineOnly = (Array.isArray(data) ? data : [])
        .filter(e => e.type === 'timeline');
      setEvents(timelineOnly);
    } catch (err) {
      console.error('[ProjectTimeline] loadEvents failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load timeline events');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  /** Creates a new timeline entity in the library, then links it to the project. */
  const handleAddEvent = async () => {
    if (!projectId || !addForm.name.trim()) return;
    setAddSaving(true);
    setError(null);
    try {
      const entityRes = await fetch(`${API_BASE_URL}/canon/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: addForm.name.trim(),
          type: 'timeline',
          scope: 'lib',
          era: addForm.era.trim() || undefined,
          claims: addForm.description.trim()
            ? [{ text: addForm.description.trim(), source: 'manual' }]
            : [],
          tags: formatTags(addForm.tags),
        }),
      });
      if (!entityRes.ok) {
        const d = await entityRes.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Failed to create timeline event');
      }
      const entity = await entityRes.json() as TimelineEntity;

      const linkRes = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library_entity_ids: [entity._id] }),
      });
      if (!linkRes.ok) throw new Error('Event created but failed to link to project');

      setEvents(prev => [...prev, entity]);
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
    } catch (err) {
      console.error('[ProjectTimeline] handleAddEvent failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (event: TimelineEntity) => {
    setEditingId(event._id);
    setEditForm({
      name: event.canonical_name,
      era: event.era ?? '',
      description: event.claims?.[0]?.text ?? '',
      tags: (event.tags ?? []).join(', '),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const event = events.find(e => e._id === editingId);
    if (!event) return;
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/canon/entities/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          canonical_name: editForm.name.trim() || event.canonical_name,
          era: editForm.era.trim() || undefined,
          claims: editForm.description.trim()
            ? [{ text: editForm.description.trim(), source: 'manual' }]
            : (event.claims ?? []),
          tags: formatTags(editForm.tags),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Failed to save event');
      }
      const updated = await res.json() as TimelineEntity;
      setEvents(prev => prev.map(e => e._id === editingId ? updated : e));
      setEditingId(null);
    } catch (err) {
      console.error('[ProjectTimeline] handleSaveEdit failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (entityId: string, entityName: string) => {
    if (!projectId) return;
    if (!window.confirm(`Remove "${entityName}" from this timeline?`)) return;
    setDeletingId(entityId);
    try {
      const linksRes = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`);
      if (!linksRes.ok) throw new Error('Failed to load project links');
      const links = await linksRes.json() as Array<{ _id: string; library_entity_id: string }>;
      const link = links.find(l => l.library_entity_id === entityId);
      if (link) {
        const delLinkRes = await fetch(
          `${API_BASE_URL}/canon/projects/${projectId}/links/${link._id}`,
          { method: 'DELETE' },
        );
        if (!delLinkRes.ok) throw new Error('Failed to unlink event');
      }
      setEvents(prev => prev.filter(e => e._id !== entityId));
      if (editingId === entityId) setEditingId(null);
    } catch (err) {
      console.error('[ProjectTimeline] handleDelete failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove event');
    } finally {
      setDeletingId(null);
    }
  };

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {product.navigationLabels.timeline}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Key events in chronological order for this {product.workspaceNoun.toLowerCase()}.
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(v => !v); setAddForm(EMPTY_FORM); }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button onClick={() => void loadEvents()}><RefreshCw className="w-4 h-4" /></button>
        </div>
      )}

      {/* Add event form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 border border-primary-200 dark:border-primary-800/50 rounded-2xl p-5 shadow-sm mb-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4">New Timeline Event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Event Name *</label>
              <input
                type="text"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. The Fall of Aetherforge"
                className="input text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Era / Date</label>
              <input
                type="text"
                value={addForm.era}
                onChange={e => setAddForm(f => ({ ...f, era: e.target.value }))}
                placeholder="e.g. Year 412, Age of Storms, Chapter 3"
                className="input text-sm"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Description</label>
            <textarea
              value={addForm.description}
              onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What happened? Who was involved? What changed?"
              className="input text-sm resize-none"
              rows={3}
            />
          </div>
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={addForm.tags}
              onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. war, magic, turning-point"
              className="input text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={() => void handleAddEvent()}
              disabled={addSaving || !addForm.name.trim()}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {addSaving ? 'Adding…' : 'Add Event'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : events.length === 0 ? (
        <EmptyTimeline onAdd={() => setShowAddForm(true)} product={product} />
      ) : (
        <div className="relative">
          {/* Vertical spine */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200 dark:bg-slate-700" />

          <div className="space-y-3 pl-14">
            {events.map((event, idx) => (
              <TimelineEventCard
                key={event._id}
                event={event}
                index={idx}
                isEditing={editingId === event._id}
                isDeleting={deletingId === event._id}
                isExpanded={expandedId === event._id}
                editForm={editForm}
                editSaving={editSaving}
                onToggleExpand={() => setExpandedId(prev => prev === event._id ? null : event._id)}
                onEdit={() => startEdit(event)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => void handleSaveEdit()}
                onDelete={() => void handleDelete(event._id, event.canonical_name)}
                onEditFormChange={setEditForm}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TimelineEventCardProps {
  event: TimelineEntity;
  index: number;
  isEditing: boolean;
  isDeleting: boolean;
  isExpanded: boolean;
  editForm: EventForm;
  editSaving: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditFormChange: (form: EventForm) => void;
}

const TimelineEventCard: React.FC<TimelineEventCardProps> = ({
  event, isEditing, isDeleting, isExpanded,
  editForm, editSaving,
  onToggleExpand, onEdit, onCancelEdit, onSaveEdit, onDelete, onEditFormChange,
}) => {
  const description = event.claims?.[0]?.text ?? '';
  const hasMore = description.length > 120 || (event.claims?.length ?? 0) > 1;

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[2.35rem] top-4 w-3 h-3 rounded-full bg-primary-400 dark:bg-primary-500 border-2 border-white dark:border-slate-950 shadow-sm" />

      <div className="group bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
        {isEditing ? (
          /* ---- Edit mode ---- */
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Event Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
                  className="input text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Era / Date</label>
                <input
                  type="text"
                  value={editForm.era}
                  onChange={e => onEditFormChange({ ...editForm, era: e.target.value })}
                  className="input text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={e => onEditFormChange({ ...editForm, description: e.target.value })}
                className="input text-sm resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Tags</label>
              <input
                type="text"
                value={editForm.tags}
                onChange={e => onEditFormChange({ ...editForm, tags: e.target.value })}
                className="input text-sm"
                placeholder="comma-separated"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onCancelEdit} className="btn-secondary text-sm flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={onSaveEdit}
                disabled={editSaving}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          /* ---- View mode ---- */
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Era badge */}
                {event.era && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-primary-400" />
                    <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{event.era}</span>
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm">
                  {event.canonical_name}
                </h3>
                {description && (
                  <p className={`text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed ${!isExpanded && hasMore ? 'line-clamp-2' : ''}`}>
                    {description}
                  </p>
                )}
                {/* Extra claims when expanded */}
                {isExpanded && (event.claims?.length ?? 0) > 1 && (
                  <ul className="mt-2 space-y-1 pl-3 border-l-2 border-gray-100 dark:border-slate-700">
                    {event.claims!.slice(1).map((claim, i) => (
                      <li key={i} className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{claim.text}</li>
                    ))}
                  </ul>
                )}
                {/* Tags */}
                {(event.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {event.tags!.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {hasMore && (
                  <button
                    onClick={onToggleExpand}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface EmptyTimelineProps {
  onAdd: () => void;
  product: ReturnType<typeof getProductConfig>;
}

const EmptyTimeline: React.FC<EmptyTimelineProps> = ({ onAdd, product }) => (
  <div className="text-center py-20 px-4">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4 text-gray-400 dark:text-slate-500">
      <Clock className="w-7 h-7" />
    </div>
    <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
      No timeline events yet
    </h3>
    <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs mx-auto mb-6">
      Add key events, turning points, and milestones to track the history of your {product.workspaceNoun.toLowerCase()}.
    </p>
    <button onClick={onAdd} className="btn-primary flex items-center gap-2 text-sm mx-auto">
      <Plus className="w-4 h-4" /> Add First Event
    </button>
  </div>
);
