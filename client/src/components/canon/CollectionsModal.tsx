/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Package, Check, ChevronRight, Plus, Edit, Search } from 'lucide-react';

interface Collection {
  _id: string;
  name: string;
  description: string;
  entity_ids: string[];
  tags?: string[];
  category?: string;
  is_official?: boolean;
}

interface LibraryEntitySummary {
  _id: string;
  canonical_name: string;
  type: string;
  source?: string;
  created_at?: string;
}

interface NewCollectionForm {
  name: string;
  description: string;
  category: string;
  tags: string;
}

interface CollectionsModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onCollectionLinked: (collection: Collection) => void;
}

export default function CollectionsModal({
  isOpen,
  projectId,
  onClose,
  onCollectionLinked,
}: CollectionsModalProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollection, setNewCollection] = useState<NewCollectionForm>({
    name: '',
    description: '',
    category: '',
    tags: '',
  });
  const [editMode, setEditMode] = useState(false);
  const [availableEntities, setAvailableEntities] = useState<LibraryEntitySummary[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);
  const [entitySearchQuery, setEntitySearchQuery] = useState('');
  const [entitySourceQuery, setEntitySourceQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [entitySort, setEntitySort] = useState<'name' | 'recent'>('name');
  const [excludeCollectionIds, setExcludeCollectionIds] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [hideSelected, setHideSelected] = useState(false);
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCollections();
    }
  }, [isOpen]);

  const loadCollections = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/canon/collections');

      if (!response.ok) {
        throw new Error('Failed to load collections');
      }

      const data: Collection[] = await response.json();
      setCollections(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load collections';
      setError(message);
      console.error('Error loading collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkCollection = async (collection: Collection) => {
    setLinking(true);
    setError(null);

    try {
      // Link all entities in the collection
      const response = await fetch(`http://localhost:3001/api/canon/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          library_entity_ids: collection.entity_ids,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to link collection');
      }

      const result = await response.json();

      alert(`✅ Successfully linked collection!\n\n${result.linked} new entities linked\n${result.already_linked} were already linked`);

      onCollectionLinked(collection);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link collection';
      setError(message);
      console.error('Error linking collection:', err);
    } finally {
      setLinking(false);
    }
  };

  const loadAvailableEntities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (entitySearchQuery) params.set('q', entitySearchQuery);
      if (entitySourceQuery) params.set('source', entitySourceQuery);
      if (entityTypeFilter) params.set('type', entityTypeFilter);
      if (entitySort === 'recent') params.set('sort', 'recent');
      params.set('limit', '500');

      const response = await fetch(`http://localhost:3001/api/canon/library?${params}`);
      if (!response.ok) throw new Error('Failed to load entities');

      const data: LibraryEntitySummary[] = await response.json();
      setAvailableEntities(data);

      const types = new Set<string>();
      data.forEach((entity) => {
        if (typeof entity.type === 'string' && entity.type.trim().length > 0) {
          types.add(entity.type);
        }
      });
      setAvailableEntityTypes(Array.from(types).sort());
    } catch (err) {
      console.error('Error loading entities:', err);
      setAvailableEntities([]);
      setAvailableEntityTypes([]);
    }
  }, [entitySearchQuery, entitySourceQuery, entityTypeFilter, entitySort]);

  useEffect(() => {
    if (editMode && selectedCollection) {
      loadAvailableEntities();
    }
  }, [editMode, selectedCollection, loadAvailableEntities]);

  useEffect(() => {
    if (editMode && selectedCollection) {
      setSelectedEntityIds(new Set(selectedCollection.entity_ids));
      setExcludeCollectionIds(new Set());
      setShowOnlySelected(false);
      setHideSelected(false);
    }
  }, [editMode, selectedCollection]);

  const getVisibleEntities = (): LibraryEntitySummary[] => {
    const excludedEntityIds = new Set<string>();
    if (excludeCollectionIds.size > 0) {
      for (const coll of collections) {
        if (!excludeCollectionIds.has(coll._id)) continue;
        for (const entityId of coll.entity_ids) {
          if (typeof entityId === 'string' && entityId.trim().length > 0) {
            excludedEntityIds.add(entityId);
          }
        }
      }
    }

    const baseList =
      excludedEntityIds.size > 0
        ? availableEntities.filter((entity) => !excludedEntityIds.has(entity._id) || selectedEntityIds.has(entity._id))
        : availableEntities;

    if (!showOnlySelected && !hideSelected) return baseList;

    if (showOnlySelected) {
      return baseList.filter((entity) => selectedEntityIds.has(entity._id));
    }

    return baseList.filter((entity) => !selectedEntityIds.has(entity._id));
  };

  const handleToggleEntity = (entityId: string) => {
    const newSelection = new Set(selectedEntityIds);
    if (newSelection.has(entityId)) {
      newSelection.delete(entityId);
    } else {
      newSelection.add(entityId);
    }
    setSelectedEntityIds(newSelection);
  };

  const handleSelectAll = () => {
    const newSelection = new Set(selectedEntityIds);
    getVisibleEntities().forEach((entity) => newSelection.add(entity._id));
    setSelectedEntityIds(newSelection);
  };

  const handleDeselectAll = () => {
    setSelectedEntityIds(new Set());
  };

  const handleClearFilters = () => {
    setEntitySearchQuery('');
    setEntitySourceQuery('');
    setEntityTypeFilter('');
    setEntitySort('name');
    setExcludeCollectionIds(new Set());
    setShowOnlySelected(false);
    setHideSelected(false);
  };

  const handleToggleExcludeCollection = (collectionId: string) => {
    const next = new Set(excludeCollectionIds);
    if (next.has(collectionId)) {
      next.delete(collectionId);
    } else {
      next.add(collectionId);
    }
    setExcludeCollectionIds(next);
  };

  const handleSaveCollection = async () => {
    if (!selectedCollection) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/collections/${selectedCollection._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_ids: Array.from(selectedEntityIds),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update collection');
      }

      // Update local state
      setSelectedCollection({
        ...selectedCollection,
        entity_ids: Array.from(selectedEntityIds),
      });

      await loadCollections();
      setEditMode(false);
      alert(`✅ Collection updated!\n\n${selectedEntityIds.size} entities in collection.`);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update collection';
      setError(message);
      console.error('Error updating collection:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (!collection) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the collection "${collection.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/canon/collections/${collection._id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete collection');
      }

      await loadCollections();
      setSelectedCollection(null);
      setEditMode(false);
      alert('🗑️ Collection deleted successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete collection';
      setError(message);
      console.error('Error deleting collection:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCollection.name.trim() || !newCollection.description.trim()) {
      setError('Name and description are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tags = newCollection.tags.split(',').map(t => t.trim()).filter(Boolean);

      const response = await fetch('http://localhost:3001/api/canon/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollection.name,
          description: newCollection.description,
          category: newCollection.category || '',
          tags,
          is_official: false, // User-created collection
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create collection');
      }

      const result = await response.json();

      await loadCollections();
      setShowCreateForm(false);
      setNewCollection({ name: '', description: '', category: '', tags: '' });

      if (result.entity_count > 0) {
        alert(`✅ Collection created successfully!\n\nAuto-populated with ${result.entity_count} entities matching the tags.`);
      } else {
        alert('✅ Collection created successfully!\n\nNo entities found matching the tags. You can add entities manually by editing the collection.');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create collection';
      setError(message);
      console.error('Error creating collection:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Library Collections</h2>
            <p className="text-sm text-gray-600 mt-1">
              Curated sets of entities you can add to your project in bulk
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!selectedCollection && !showCreateForm && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Create Collection
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading collections...</div>
            </div>
          ) : showCreateForm ? (
            /* Create Collection Form */
            <form onSubmit={handleCreateCollection} className="space-y-4 max-w-2xl mx-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Collection Name *
                </label>
                <input
                  type="text"
                  value={newCollection.name}
                  onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value })}
                  placeholder="e.g., My Favorite NPCs"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={newCollection.description}
                  onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })}
                  placeholder="Describe what this collection contains..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category (Optional)
                </label>
                <input
                  type="text"
                  value={newCollection.category}
                  onChange={(e) => setNewCollection({ ...newCollection, category: e.target.value })}
                  placeholder="e.g., Campaign, Homebrew, SRD"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  value={newCollection.tags}
                  onChange={(e) => setNewCollection({ ...newCollection, tags: e.target.value })}
                  placeholder="e.g., npcs, waterdeep, level-5"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Auto-population:</strong> If you add tags, the collection will be automatically populated with all library entities that have any of those tags. You can then edit the collection to add or remove specific entities.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  Create Collection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewCollection({ name: '', description: '', category: '', tags: '' });
                  }}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : selectedCollection ? (
            /* Collection Detail View */
            <div>
              <button
                onClick={() => setSelectedCollection(null)}
                className="text-sm text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-1"
              >
                ← Back to collections
              </button>

              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedCollection.name}
                    </h3>
                    <p className="text-gray-700">{selectedCollection.description}</p>
                  </div>
                  {selectedCollection.is_official && (
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                      Official
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
                  <div>
                    <span className="font-semibold">{selectedCollection.entity_ids.length}</span> entities
                  </div>
                  {selectedCollection.category && (
                    <div className="flex items-center gap-1">
                      <Package className="w-4 h-4" />
                      {selectedCollection.category}
                    </div>
                  )}
                </div>

                {selectedCollection.tags && selectedCollection.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedCollection.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-white text-gray-700 text-xs rounded border border-gray-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Included Entities:</h4>
                <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <ul className="space-y-1 text-sm text-gray-700">
                    {selectedCollection.entity_ids.map((entityId) => (
                      <li key={entityId} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="font-mono text-xs">{entityId}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {editMode ? (
                /* Edit Mode - Entity Browser */
                <div className="mt-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search by name, tags, aliases..."
                        value={entitySearchQuery}
                        onChange={(e) => setEntitySearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Filter by source..."
                        value={entitySourceQuery}
                        onChange={(e) => setEntitySourceQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <select
                      value={entityTypeFilter}
                      onChange={(e) => setEntityTypeFilter(e.target.value)}
                      className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Types</option>
                      {availableEntityTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>

                    <select
                      value={entitySort}
                      onChange={(e) => setEntitySort(e.target.value === 'recent' ? 'recent' : 'name')}
                      className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="name">Name (A→Z)</option>
                      <option value="recent">Most Recently Added</option>
                    </select>

                    <div className="text-sm text-gray-600 whitespace-nowrap">
                      {selectedEntityIds.size} selected
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={showOnlySelected}
                        onChange={(e) => {
                          setShowOnlySelected(e.target.checked);
                          if (e.target.checked) setHideSelected(false);
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      Show only selected
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={hideSelected}
                        onChange={(e) => {
                          setHideSelected(e.target.checked);
                          if (e.target.checked) setShowOnlySelected(false);
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      Hide selected
                    </label>
                    {(entitySearchQuery || entitySourceQuery || entityTypeFilter || entitySort !== 'name' || excludeCollectionIds.size > 0) && (
                      <button
                        onClick={handleClearFilters}
                        className="ml-auto px-4 py-2 text-sm bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 border border-gray-200"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {collections.filter((c) => c._id !== selectedCollection._id).length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-medium text-gray-800">
                          Exclude items already in these collections
                        </div>
                        {excludeCollectionIds.size > 0 && (
                          <div className="text-sm text-gray-600">
                            {excludeCollectionIds.size} excluded
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                        {collections
                          .filter((c) => c._id !== selectedCollection._id)
                          .map((collection) => (
                            <label key={collection._id} className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={excludeCollectionIds.has(collection._id)}
                                onChange={() => handleToggleExcludeCollection(collection._id)}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                              <span className="truncate">{collection.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSelectAll}
                      className="px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 border border-blue-200 font-medium"
                    >
                      Select All ({getVisibleEntities().length})
                    </button>
                    <button
                      onClick={handleDeselectAll}
                      className="px-4 py-2 text-sm bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 border border-gray-200"
                    >
                      Deselect All
                    </button>
                    <div className="text-sm text-gray-600 ml-auto">
                      Showing <span className="font-semibold">{getVisibleEntities().length}</span> of{' '}
                      <span className="font-semibold">{availableEntities.length}</span>
                    </div>
                  </div>

                  {getVisibleEntities().length === 0 ? (
                    <div className="border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-600 bg-gray-50">
                      No entities match your current filters.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
                      {getVisibleEntities().map((entity) => {
                        const isSelected = selectedEntityIds.has(entity._id);
                        return (
                          <div
                            key={entity._id}
                            onClick={() => handleToggleEntity(entity._id)}
                            className={`p-3 border rounded cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200 hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">{entity.canonical_name}</span>
                                  <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                    {entity.type}
                                  </span>
                                </div>
                                {entity.source && (
                                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    Source: {entity.source}
                                  </div>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveCollection}
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    >
                      Save Changes ({selectedEntityIds.size} entities)
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(false);
                        handleClearFilters();
                      }}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode - Action Buttons */
                <div className="mt-6 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditMode(true)}
                      className="px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      <Edit className="w-4 h-4" />
                      Change Entities in Collection
                    </button>
                    <button
                      onClick={() => handleLinkCollection(selectedCollection)}
                      disabled={linking}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    >
                      {linking ? 'Linking...' : `Link All ${selectedCollection.entity_ids.length} to Project`}
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteCollection(selectedCollection)}
                    disabled={deleting}
                    className="px-4 py-3 border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting...' : 'Delete Collection'}
                  </button>
                  <button
                    onClick={() => setSelectedCollection(null)}
                    className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Back
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Collections List */
            <div>
              {collections.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">No collections yet</p>
                  <p className="text-sm text-gray-500 mt-2 mb-4">
                    Create collections to organize entities and quickly link groups to projects
                  </p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    Create Your First Collection
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {collections.map(collection => (
                    <div
                      key={collection._id}
                      onClick={() => setSelectedCollection(collection)}
                      className="border border-gray-200 rounded-lg p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600">
                            {collection.name}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {collection.description}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0 ml-2" />
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          <span className="font-semibold">{collection.entity_ids.length}</span> entities
                        </span>
                        {collection.is_official && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                            Official
                          </span>
                        )}
                      </div>

                      {collection.category && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {collection.category}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!selectedCollection && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
