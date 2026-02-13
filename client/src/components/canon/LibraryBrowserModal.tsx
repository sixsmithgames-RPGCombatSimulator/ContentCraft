/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, Tag, Filter, Eye, Edit, Plus, AlertTriangle } from 'lucide-react';
import CanonEntityEditor, { CanonBase } from './CanonEntityEditor';
import FactCheckerModal from './FactCheckerModal';

type LibraryEntity = CanonBase & {
  _id: string;
  canonical_name: string;
  type: string;
  claims?: Array<{ text: string; source: string }>;
};

interface LibraryBrowserModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onEntitiesLinked: (entityIds: string[]) => void;
}

export default function LibraryBrowserModal({
  isOpen,
  projectId,
  onClose,
  onEntitiesLinked,
}: LibraryBrowserModalProps) {
  const [entities, setEntities] = useState<LibraryEntity[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewEntity, setPreviewEntity] = useState<LibraryEntity | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [entityToEdit, setEntityToEdit] = useState<LibraryEntity | null>(null);
  const [showFactChecker, setShowFactChecker] = useState(false);

  // Available types and tags for filtering
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Tag editing state
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [addingGlobalTag, setAddingGlobalTag] = useState(false);

  // Memoized loaders
  const loadLibraryEntities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (filterType) params.set('type', filterType);
      if (filterTag) params.set('tags', filterTag);

      const response = await fetch(`http://localhost:3001/api/canon/library?${params}`);

      if (!response.ok) {
        throw new Error('Failed to load library entities');
      }

      const data = await response.json();
      setEntities(data);

      // Extract unique types and tags
      const types = new Set<string>();
      const tags = new Set<string>();

      (data as LibraryEntity[]).forEach((entity: LibraryEntity) => {
        types.add(entity.type);
        entity.tags?.forEach(tag => tags.add(tag));
      });

      setAvailableTypes(Array.from(types).sort());
      setAvailableTags(Array.from(tags).sort());

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load library entities');
      console.error('Error loading library entities:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType, filterTag]);

  const loadExistingLinks = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/canon/projects/${projectId}/links`);

      if (!response.ok) {
        throw new Error('Failed to load existing links');
      }

      const links: Array<{ library_entity_id: string }> = await response.json();
      const linkedEntityIds: Set<string> = new Set(links.map((link) => link.library_entity_id));
      setLinkedIds(linkedEntityIds);

    } catch (err: unknown) {
      console.error('Error loading existing links:', err);
    }
  }, [projectId]);

  // Load library entities and existing links
  useEffect(() => {
    if (isOpen) {
      loadLibraryEntities();
      loadExistingLinks();
    }
  }, [isOpen, loadLibraryEntities, loadExistingLinks]);

  // Reload when filters change
  useEffect(() => {
    if (isOpen) {
      loadLibraryEntities();
    }
  }, [isOpen, loadLibraryEntities]);

  const toggleSelection = (entityId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(entityId)) {
      newSelection.delete(entityId);
    } else {
      newSelection.add(entityId);
    }
    setSelectedIds(newSelection);
  };

  const handleLinkSelected = async () => {
    if (selectedIds.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          library_entity_ids: Array.from(selectedIds),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to link entities');
      }

      const result = await response.json();

      // Update linked IDs
      const newLinkedIds = new Set(linkedIds);
      selectedIds.forEach(id => newLinkedIds.add(id));
      setLinkedIds(newLinkedIds);

      // Clear selection
      setSelectedIds(new Set());

      // Notify parent
      onEntitiesLinked(Array.from(selectedIds));

      alert(`✅ Successfully linked ${result.linked} entities!\n${result.already_linked > 0 ? `(${result.already_linked} were already linked)` : ''}`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to link entities');
      console.error('Error linking entities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterType('');
    setFilterTag('');
  };

  const handleEdit = (entity: LibraryEntity) => {
    setEntityToEdit(entity);
    setShowEditor(true);
    setPreviewEntity(null);
  };

  const handleSaveEntity = async (updatedEntity: CanonBase) => {
    if (!entityToEdit) {
      setError('No entity selected for editing.');
      return;
    }

    const entityId = updatedEntity._id ?? entityToEdit._id;
    if (!entityId) {
      setError('Entity is missing an identifier and cannot be saved.');
      return;
    }

    const payload: LibraryEntity = {
      ...entityToEdit,
      ...(updatedEntity as Partial<LibraryEntity>),
      _id: entityId,
      canonical_name: updatedEntity.canonical_name ?? entityToEdit.canonical_name,
      type: updatedEntity.type ?? entityToEdit.type,
    };

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/entities/${payload._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update entity');
      }

      // Update in entities list
      setEntities(entities.map(e =>
        e._id === payload._id ? payload : e
      ));

      setShowEditor(false);
      setEntityToEdit(null);
      alert('✅ Entity updated successfully!');
      loadLibraryEntities(); // Refresh list

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update entity';
      setError(message);
      console.error('Error updating entity:', err);
      alert(`❌ Failed to update entity: ${message}`);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntity = async () => {
    if (!entityToEdit) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/entities/${entityToEdit._id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete entity');
      }

      // Remove from entities list
      setEntities(entities.filter(e => e._id !== entityToEdit._id));

      setShowEditor(false);
      setEntityToEdit(null);
      alert('✅ Entity deleted successfully!');
      loadLibraryEntities(); // Refresh list

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete entity';
      setError(message);
      console.error('Error deleting entity:', err);
      alert(`❌ Failed to delete entity: ${message}`);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Tag editing handlers
  const updateTagSuggestions = (input: string, currentTags: string[]) => {
    if (!input.trim()) {
      setTagSuggestions([]);
      return;
    }

    const filtered = availableTags
      .filter(tag =>
        tag.toLowerCase().includes(input.toLowerCase()) &&
        !currentTags.includes(tag)
      )
      .slice(0, 10);

    setTagSuggestions(filtered);
  };

  const handleAddTag = async (entityId: string, tag: string) => {
    const entity = entities.find(e => e._id === entityId);
    if (!entity || !tag.trim()) return;

    const normalizedTag = tag.trim().toLowerCase();
    const currentTags = entity.tags || [];

    if (currentTags.includes(normalizedTag)) {
      return; // Tag already exists
    }

    const updatedTags = [...currentTags, normalizedTag];

    try {
      const response = await fetch(`http://localhost:3001/api/canon/entities/${entityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entity,
          tags: updatedTags,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tags');
      }

      // Update local state
      setEntities(entities.map(e =>
        e._id === entityId ? { ...e, tags: updatedTags } : e
      ));

      // Update available tags if new
      if (!availableTags.includes(normalizedTag)) {
        setAvailableTags([...availableTags, normalizedTag].sort());
      }

      setTagInput('');
      setTagSuggestions([]);

    } catch (err: unknown) {
      console.error('Error adding tag:', err);
      alert('Failed to add tag');
    }
  };

  const handleRemoveTag = async (entityId: string, tagToRemove: string) => {
    const entity = entities.find(e => e._id === entityId);
    if (!entity) return;

    const updatedTags = (entity.tags || []).filter(tag => tag !== tagToRemove);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/entities/${entityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entity,
          tags: updatedTags,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tags');
      }

      // Update local state
      setEntities(entities.map(e =>
        e._id === entityId ? { ...e, tags: updatedTags } : e
      ));

    } catch (err: unknown) {
      console.error('Error removing tag:', err);
      alert('Failed to remove tag');
    }
  };

  // Add a tag to all visible (filtered) entities
  const handleAddTagToAll = async () => {
    const tag = prompt('Enter tag to add to all visible entities:');
    if (!tag || !tag.trim()) return;

    const normalizedTag = tag.trim().toLowerCase();

    // Only update entities that don't already have the tag
    const entitiesToUpdate = entities.filter(entity =>
      !(entity.tags || []).includes(normalizedTag)
    );

    if (entitiesToUpdate.length === 0) {
      alert('All visible entities already have this tag.');
      return;
    }

    const confirmed = window.confirm(
      `Add tag "${normalizedTag}" to ${entitiesToUpdate.length} entities?\n\n` +
      `(${entities.length - entitiesToUpdate.length} already have this tag)`
    );

    if (!confirmed) return;

    setAddingGlobalTag(true);
    setError(null);

    let successCount = 0;
    let errorCount = 0;

    try {
      // Update entities in batches
      for (const entity of entitiesToUpdate) {
        try {
          const updatedTags = [...(entity.tags || []), normalizedTag];

          const response = await fetch(`http://localhost:3001/api/canon/entities/${entity._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...entity,
              tags: updatedTags,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to update entity');
          }

          // Update local state
          setEntities(prevEntities =>
            prevEntities.map(e =>
              e._id === entity._id ? { ...e, tags: updatedTags } : e
            )
          );

          successCount++;
        } catch (err: unknown) {
          console.error(`Error updating entity ${entity._id}:`, err);
          errorCount++;
        }
      }

      // Update available tags if new
      if (!availableTags.includes(normalizedTag)) {
        setAvailableTags([...availableTags, normalizedTag].sort());
      }

      if (errorCount === 0) {
        alert(`✅ Successfully added tag "${normalizedTag}" to ${successCount} entities!`);
      } else {
        alert(`⚠️ Added tag to ${successCount} entities, but ${errorCount} failed.`);
      }

      // Reload to ensure consistency
      loadLibraryEntities();

    } catch (err: unknown) {
      console.error('Error adding tag to all:', err);
      setError('Failed to add tag to all entities');
    } finally {
      setAddingGlobalTag(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Library Browser</h2>
            <p className="text-sm text-gray-600 mt-1">
              Browse all library entities and link them to your project. Click on an entity to select it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4 mb-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              {availableTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            {/* Tag Filter */}
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Tags</option>
              {availableTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>

            {/* Clear Filters */}
            {(searchQuery || filterType || filterTag) && (
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
              >
                Clear
              </button>
            )}
          </div>

          {/* Selection Info */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              {entities.length} entities found
              {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFactChecker(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium flex items-center gap-2"
                title="Find and remove duplicate facts"
              >
                <AlertTriangle className="w-4 h-4" />
                Fact Checker
              </button>
              {entities.length > 0 && (
                <button
                  onClick={handleAddTagToAll}
                  disabled={addingGlobalTag || loading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                  title="Add a tag to all visible entities"
                >
                  <Plus className="w-4 h-4" />
                  {addingGlobalTag ? 'Adding Tag...' : 'Tag All'}
                </button>
              )}
              {selectedIds.size > 0 && (
                <button
                  onClick={handleLinkSelected}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  Link Selected ({selectedIds.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Entity List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading library entities...</div>
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-12">
              <Filter className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No entities found</p>
              <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entities.map(entity => {
                const isLinked = linkedIds.has(entity._id);
                const isSelected = selectedIds.has(entity._id);

                return (
                  <div
                    key={entity._id}
                    className={`
                      p-4 border rounded-lg transition-all
                      ${isLinked ? 'bg-green-50 border-green-300' :
                        isSelected ? 'bg-blue-50 border-blue-400 shadow-md' :
                        'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => !isLinked && toggleSelection(entity._id)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">
                            {entity.canonical_name}
                          </h3>
                          {isLinked && (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3" />
                              Linked
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            {entity.type}
                          </span>
                          {entity.region && (
                            <span className="text-xs text-gray-600">
                              {entity.region}
                            </span>
                          )}
                        </div>

                        {entity.aliases && entity.aliases.length > 0 && (
                          <p className="text-sm text-gray-600 mb-2">
                            Also known as: {entity.aliases.join(', ')}
                          </p>
                        )}

                        {/* Editable Tags Section */}
                        <div className="mt-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Tag className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            {entity.tags && entity.tags.map(tag => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded group hover:bg-blue-200"
                              >
                                {tag}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTag(entity._id, tag);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 hover:text-blue-900 transition-opacity"
                                  title="Remove tag"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            <div className="relative">
                              <input
                                type="text"
                                value={editingTagsFor === entity._id ? tagInput : ''}
                                onFocus={() => setEditingTagsFor(entity._id)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setEditingTagsFor(null);
                                    setTagInput('');
                                    setTagSuggestions([]);
                                  }, 200);
                                }}
                                onChange={(e) => {
                                  setTagInput(e.target.value);
                                  updateTagSuggestions(e.target.value, entity.tags || []);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddTag(entity._id, tagInput);
                                  }
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Auto-focus the entity tile when clicking the tag input
                                  setEditingTagsFor(entity._id);
                                }}
                                placeholder="+ tag"
                                className="text-xs border border-dashed border-gray-300 rounded px-2 py-1 w-20 focus:w-32 focus:border-blue-400 focus:outline-none transition-all"
                              />
                              {editingTagsFor === entity._id && tagSuggestions.length > 0 && (
                                <div className="absolute z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-auto">
                                  {tagSuggestions.map((suggestion) => (
                                    <button
                                      key={suggestion}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAddTag(entity._id, suggestion);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors"
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewEntity(entity);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                          title="Preview details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isLinked && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            onClick={() => toggleSelection(entity._id)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {linkedIds.size} entities currently linked to this project
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium"
          >
            Close
          </button>
        </div>
      </div>

      {/* Entity Preview Modal */}
      {previewEntity && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            {/* Preview Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {previewEntity.canonical_name}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-gray-700 text-white px-2 py-1 rounded font-medium">
                    {previewEntity.type}
                  </span>
                  {previewEntity.is_official && (
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded font-medium">
                      Official Content
                    </span>
                  )}
                  {linkedIds.has(previewEntity._id) && (
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Already Linked
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreviewEntity(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Basic Info */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Basic Information
                </h4>
                <div className="space-y-2 text-sm">
                  {previewEntity.aliases && previewEntity.aliases.length > 0 && (
                    <div>
                      <span className="font-medium text-gray-600">Also known as:</span>
                      <span className="ml-2 text-gray-800">{previewEntity.aliases.join(', ')}</span>
                    </div>
                  )}
                  {previewEntity.region && (
                    <div>
                      <span className="font-medium text-gray-600">Region:</span>
                      <span className="ml-2 text-gray-800">{previewEntity.region}</span>
                    </div>
                  )}
                  {previewEntity.era && (
                    <div>
                      <span className="font-medium text-gray-600">Era:</span>
                      <span className="ml-2 text-gray-800">{previewEntity.era}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-600">Entity ID:</span>
                    <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono">
                      {previewEntity._id}
                    </code>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {previewEntity.tags && previewEntity.tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Tags
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {previewEntity.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Claims */}
              {previewEntity.claims && previewEntity.claims.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Facts & Claims ({previewEntity.claims.length})
                  </h4>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {previewEntity.claims.map((claim, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-sm text-gray-800 mb-2">{claim.text}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-medium">Source:</span> {claim.source}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!previewEntity.claims || previewEntity.claims.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No detailed information available for this entity yet.</p>
                </div>
              )}
            </div>

            {/* Preview Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={() => handleEdit(previewEntity)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit Entity
              </button>
              {!linkedIds.has(previewEntity._id) && (
                <button
                  onClick={() => {
                    toggleSelection(previewEntity._id);
                    setPreviewEntity(null);
                  }}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  {selectedIds.has(previewEntity._id) ? 'Unselect Entity' : 'Select Entity'}
                </button>
              )}
              <button
                onClick={() => setPreviewEntity(null)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditor && entityToEdit && (
        <CanonEntityEditor
          isOpen={showEditor}
          entity={entityToEdit}
          onClose={() => {
            setShowEditor(false);
            setEntityToEdit(null);
          }}
          onSave={handleSaveEntity}
          onDelete={entityToEdit.is_official ? undefined : handleDeleteEntity}
        />
      )}

      <FactCheckerModal
        isOpen={showFactChecker}
        onClose={() => setShowFactChecker(false)}
        onSuccess={() => {
          setShowFactChecker(false);
          loadLibraryEntities(); // Reload entities after cleanup
        }}
      />
    </div>
  );
}
