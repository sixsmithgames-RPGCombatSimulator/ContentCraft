/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useCallback } from 'react';
import { BookText, FileText, Plus, Library, FolderOpen, Link as LinkIcon, Package, Search } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';
import UploadModal from './UploadModal';
import LibraryBrowserModal from '../canon/LibraryBrowserModal';
import CollectionsModal from '../canon/CollectionsModal';

interface Resource {
  _id: string;
  type: string;
  canonical_name: string;
  aliases: string[];
  era?: string;
  region?: string;
  claims: Array<{ text: string; source: string }>;
  scope?: string;
  is_official?: boolean;
  tags?: string[];
  source?: string;
  created_at?: string;
  updated_at?: string;
}

interface ResourcesPanelProps {
  projectId: string;
}

export default function ResourcesPanel({ projectId }: ResourcesPanelProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeTab, setScopeTab] = useState<'project' | 'library'>('project'); // Project vs Library tabs
  const [uploadModalInitialMode, setUploadModalInitialMode] = useState<'choice' | 'project-content'>('choice');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'recent'>('name');
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLibraryBrowser, setShowLibraryBrowser] = useState(false);
  const [showCollectionsModal, setShowCollectionsModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectLinkIdsByEntityId, setProjectLinkIdsByEntityId] = useState<Record<string, string>>({});
  const [activeProjectEntityIds, setActiveProjectEntityIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      let url: string;

      if (scopeTab === 'project') {
        // Show only library entities linked to this project (expands collections)
        url = `${API_BASE_URL}/canon/projects/${projectId}/entities`;
      } else {
        // Show ALL library entities (for browsing and linking)
        url = `${API_BASE_URL}/canon/entities?scope=lib`;
      }

      const response = await fetch(url);

      let data: unknown = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.warn('[ResourcesPanel] Failed to parse response JSON:', parseError);
      }

      if (!response.ok) {
        const message =
          data && typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error?: unknown }).error ?? 'Failed to load resources')
            : `Failed to load resources (${response.status})`;
        setErrorMessage(message);
        setResources([]);
        return;
      }

      if (!Array.isArray(data)) {
        console.error('[ResourcesPanel] Expected an array but received:', data);
        setErrorMessage('Unexpected response format when loading resources.');
        setResources([]);
        return;
      }

      setResources(data as Resource[]);
    } catch (error) {
      console.error('[ResourcesPanel] Failed to load resources:', error);
      setErrorMessage('Unable to load resources. Please try again later.');
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, scopeTab]);

  const loadProjectLinkState = useCallback(async () => {
    try {
      const [linksResponse, entitiesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`),
        fetch(`${API_BASE_URL}/canon/projects/${projectId}/entities`),
      ]);

      const linksData = linksResponse.ok ? (await linksResponse.json() as Array<{ _id: string; library_entity_id: string }>) : [];
      const entitiesData = entitiesResponse.ok ? (await entitiesResponse.json() as Array<{ _id: string }>) : [];

      const nextLinkMap: Record<string, string> = {};
      for (const link of linksData) {
        if (typeof link.library_entity_id === 'string' && typeof link._id === 'string') {
          nextLinkMap[link.library_entity_id] = link._id;
        }
      }

      setProjectLinkIdsByEntityId(nextLinkMap);
      setActiveProjectEntityIds(
        entitiesData
          .map((entity) => (typeof entity._id === 'string' ? entity._id : ''))
          .filter((entityId) => entityId.length > 0),
      );
    } catch (error) {
      console.error('[ResourcesPanel] Failed to load project link state:', error);
    }
  }, [projectId]);

  const refreshPanelData = useCallback(async () => {
    await Promise.all([loadResources(), loadProjectLinkState()]);
  }, [loadProjectLinkState, loadResources]);

  const deleteResource = useCallback(
    async (resourceId: string) => {
      const confirmDelete = window.confirm(
        'Delete this library item? This removes the entity and its facts from all projects.',
      );
      if (!confirmDelete) return;

      try {
        setDeletingId(resourceId);
        setErrorMessage(null);
        const response = await fetch(`${API_BASE_URL}/canon/entities/${resourceId}`, {
          method: 'DELETE',
        });

        let data: unknown = null;
        try {
          data = await response.json();
        } catch (parseError) {
          console.warn('[ResourcesPanel] Failed to parse delete response JSON:', parseError);
        }

        if (!response.ok) {
          const message =
            data && typeof data === 'object' && data !== null && 'error' in data
              ? String((data as { error?: unknown }).error ?? 'Failed to delete resource')
              : `Failed to delete resource (${response.status})`;
          setErrorMessage(message);
          return;
        }

        await refreshPanelData();
      } catch (error) {
        console.error('[ResourcesPanel] Failed to delete resource:', error);
        setErrorMessage('Unable to delete resource. Please try again later.');
      } finally {
        setDeletingId(null);
      }
    },
    [refreshPanelData],
  );

  useEffect(() => {
    refreshPanelData();
  }, [projectId, scopeTab, refreshPanelData]);

  const handleLibraryLink = useCallback(
    async (resourceId: string) => {
      try {
        setDeletingId(`link:${resourceId}`);
        setErrorMessage(null);
        const response = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ library_entity_ids: [resourceId] }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to link resource');
        }

        await refreshPanelData();
      } catch (error) {
        console.error('[ResourcesPanel] Failed to link resource:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to link resource.');
      } finally {
        setDeletingId(null);
      }
    },
    [projectId, refreshPanelData],
  );

  const handleLibraryUnlink = useCallback(
    async (resourceId: string) => {
      const linkId = projectLinkIdsByEntityId[resourceId];
      if (!linkId) {
        setErrorMessage('This resource is active via a collection link. Remove it from the collection to unlink it here.');
        return;
      }

      try {
        setDeletingId(`unlink:${resourceId}`);
        setErrorMessage(null);
        const response = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links/${linkId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to unlink resource');
        }

        await refreshPanelData();
      } catch (error) {
        console.error('[ResourcesPanel] Failed to unlink resource:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to unlink resource.');
      } finally {
        setDeletingId(null);
      }
    },
    [projectId, projectLinkIdsByEntityId, refreshPanelData],
  );

  const getResourceSources = (resource: Resource): string[] => {
    const sources = new Set<string>();
    if (typeof resource.source === 'string' && resource.source.trim().length > 0) {
      sources.add(resource.source.trim());
    }
    if (Array.isArray(resource.claims)) {
      for (const claim of resource.claims) {
        const src = typeof claim?.source === 'string' ? claim.source.trim() : '';
        if (src) sources.add(src);
      }
    }
    return Array.from(sources);
  };

  const availableTypes = Array.from(
    new Set(
      resources
        .map((r) => (typeof r.type === 'string' ? r.type.trim() : ''))
        .filter((t) => t.length > 0)
    )
  ).sort();
  const availableSources = Array.from(
    new Set(resources.flatMap((r) => getResourceSources(r)))
  ).sort();

  useEffect(() => {
    if (typeFilter !== 'all' && !availableTypes.includes(typeFilter)) {
      setTypeFilter('all');
    }
  }, [typeFilter, availableTypes]);

  const handleEntitiesLinked = (_entityIds: string[]) => {
    // Switch to project tab to show newly linked entities
    setScopeTab('project');
    // Reload to show the newly linked entities
    setTimeout(() => refreshPanelData(), 500);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const normalizedSourceFilter = sourceFilter.trim().toLowerCase();

  const filteredResources = resources
    .filter((r) => {
      if (typeFilter === 'all') return true;
      return (typeof r.type === 'string' ? r.type : '') === typeFilter;
    })
    .filter((r) => {
      if (!normalizedQuery) return true;
      const sources = getResourceSources(r).join(' | ').toLowerCase();
      const tags = Array.isArray(r.tags) ? r.tags.join(' | ').toLowerCase() : '';
      const aliases = Array.isArray(r.aliases) ? r.aliases.join(' | ').toLowerCase() : '';
      const claimText = Array.isArray(r.claims) ? r.claims.map((c) => c?.text ?? '').join(' | ').toLowerCase() : '';
      return (
        r.canonical_name.toLowerCase().includes(normalizedQuery) ||
        aliases.includes(normalizedQuery) ||
        tags.includes(normalizedQuery) ||
        sources.includes(normalizedQuery) ||
        claimText.includes(normalizedQuery)
      );
    })
    .filter((r) => {
      if (!normalizedSourceFilter) return true;
      return getResourceSources(r).some((s) => s.toLowerCase().includes(normalizedSourceFilter));
    })
    .sort((a, b) => {
      if (sortMode === 'recent') {
        const aTime = Date.parse(a.updated_at ?? a.created_at ?? '') || 0;
        const bTime = Date.parse(b.updated_at ?? b.created_at ?? '') || 0;
        if (aTime !== bTime) return bTime - aTime;
      }
      return a.canonical_name.localeCompare(b.canonical_name);
    });

  const showFilters = resources.length > 0;
  const activeProjectEntityIdSet = new Set(activeProjectEntityIds);

  const openUploadChoices = () => {
    setUploadModalInitialMode('choice');
    setShowUploadModal(true);
  };

  const openProjectContentPromoter = () => {
    setUploadModalInitialMode('project-content');
    setShowUploadModal(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BookText className="w-6 h-6" />
          Canon & Resources
        </h2>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Manage your project's resources and link official library content.
      </p>

      {/* Scope Tabs: Project vs Library */}
      <div className="flex gap-2 mb-4 border-b-2 border-gray-200">
        <button
          onClick={() => setScopeTab('project')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors ${
            scopeTab === 'project'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          Linked Resources{scopeTab === 'project' && ` (${resources.length})`}
        </button>
        <button
          onClick={() => setScopeTab('library')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors ${
            scopeTab === 'library'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          <Library className="w-4 h-4" />
          All Library{scopeTab === 'library' && ` (${resources.length})`}
        </button>
      </div>

      {/* Action Buttons based on scope */}
      <div className="mb-4">
        {scopeTab === 'library' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            <button
              onClick={openUploadChoices}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add to Library
            </button>
            <button
              onClick={openProjectContentPromoter}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium"
            >
              <FolderOpen className="w-4 h-4" />
              Use Project Content
            </button>
            <button
              onClick={() => setShowCollectionsModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
            >
              <Package className="w-4 h-4" />
              Browse Collections
            </button>
            <button
              onClick={() => setShowLibraryBrowser(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
            >
              <LinkIcon className="w-4 h-4" />
              Link Individual Entities
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:bg-blue-500/10 dark:border-blue-400/30">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">📚 Project canon comes from linked library entries</p>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Promote content you already made for this project, or link existing library entries. Unlink anything you no longer want the generator to think with.
            </p>
            <div className="flex flex-col gap-2 md:flex-row">
              <button
                onClick={openProjectContentPromoter}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium"
              >
                <FolderOpen className="w-4 h-4" />
                Use Existing Project Content
              </button>
              <button
                onClick={() => setScopeTab('library')}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-800 rounded-md hover:bg-blue-100 dark:bg-slate-900 dark:border-blue-400/30 dark:text-blue-200 dark:hover:bg-blue-500/15 text-sm font-medium"
              >
                <Library className="w-4 h-4" />
                Browse Library
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Type Filter Tabs */}
      {showFilters && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, tags, facts, source..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value === 'recent' ? 'recent' : 'name')}
              className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="name">Sort: Name</option>
              <option value="recent">Sort: Most Recent</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All Sources</option>
              {availableSources.slice(0, 200).map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
            {(searchQuery || sourceFilter || sortMode !== 'name' || typeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSourceFilter('');
                  setSortMode('name');
                  setTypeFilter('all');
                  setExpandedResourceId(null);
                }}
                className="w-full md:w-auto px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-2">
            <button
              key="all"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                typeFilter === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  typeFilter === type
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-600">
            Showing <span className="font-semibold">{filteredResources.length}</span> of{' '}
            <span className="font-semibold">{resources.length}</span>
          </div>
        </div>
      )}

      {/* Resources List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : errorMessage ? (
        <div className="text-center py-6 text-red-600 bg-red-50 border border-red-200 rounded-md">
          <p className="font-medium">{errorMessage}</p>
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="font-medium">No {typeFilter !== 'all' ? typeFilter : ''} resources found</p>
          {scopeTab === 'project' ? (
            <p className="text-sm mt-1">Link library resources to use them in this project</p>
          ) : (
            <p className="text-sm mt-1">Add resources to the library to build your content collection</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredResources.map((resource) => (
            <div
              key={resource._id}
              className="border border-gray-200 rounded-md p-4 hover:border-blue-300 transition-colors"
            >
              {(() => {
                const isActiveInProject = activeProjectEntityIdSet.has(resource._id);
                const directLinkId = projectLinkIdsByEntityId[resource._id] ?? null;
                const isBusyLinkAction = deletingId === `link:${resource._id}` || deletingId === `unlink:${resource._id}`;

                return (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-800">{resource.canonical_name}</h3>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {resource.type}
                    </span>
                    {isActiveInProject && (
                      <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded">
                        {directLinkId ? 'Linked to Project' : 'Active via Collection'}
                      </span>
                    )}
                    {resource.is_official && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        Official
                      </span>
                    )}
                  </div>
                  {getResourceSources(resource).length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Source: {getResourceSources(resource).slice(0, 2).join(' • ')}
                      {getResourceSources(resource).length > 2 ? ' • …' : ''}
                    </div>
                  )}
                  {resource.aliases && resource.aliases.length > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      Also known as: {resource.aliases.join(', ')}
                    </p>
                  )}
                  {(resource.region || resource.era) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {resource.region && `Region: ${resource.region}`}
                      {resource.region && resource.era && ' • '}
                      {resource.era && `Era: ${resource.era}`}
                    </p>
                  )}
                  {resource.tags && resource.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      {resource.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 mt-2">
                    {resource.claims?.length || 0} fact{resource.claims?.length !== 1 ? 's' : ''} stored
                  </p>
                </div>

                <div className="ml-3 flex flex-col gap-2">
                  {scopeTab === 'library' && !isActiveInProject && (
                    <button
                      onClick={() => handleLibraryLink(resource._id)}
                      disabled={isBusyLinkAction}
                      className="px-3 py-2 text-xs border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-60 whitespace-nowrap"
                    >
                      {deletingId === `link:${resource._id}` ? 'Linking…' : 'Link to Project'}
                    </button>
                  )}
                  {isActiveInProject && (
                    <button
                      onClick={() => handleLibraryUnlink(resource._id)}
                      disabled={isBusyLinkAction || !directLinkId}
                      className="px-3 py-2 text-xs border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50 disabled:opacity-60 whitespace-nowrap"
                      title={directLinkId ? 'Remove from this project canon' : 'This item is active through a collection link'}
                    >
                      {directLinkId
                        ? deletingId === `unlink:${resource._id}`
                          ? 'Unlinking…'
                          : 'Unlink'
                        : 'Via Collection'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(resource._id);
                      } catch {
                      }
                    }}
                    className="px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 whitespace-nowrap"
                    title="Copy entity ID"
                  >
                    Copy ID
                  </button>
                  {scopeTab === 'library' && (
                    <button
                      onClick={() => deleteResource(resource._id)}
                      disabled={deletingId === resource._id}
                      className="px-3 py-2 text-xs border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-60 whitespace-nowrap"
                    >
                      {deletingId === resource._id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setExpandedResourceId((prev) => (prev === resource._id ? null : resource._id))
                    }
                    className="px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 whitespace-nowrap"
                  >
                    {expandedResourceId === resource._id ? 'Hide Facts' : 'View Facts'}
                  </button>
                </div>
              </div>
                );
              })()}

              {expandedResourceId === resource._id && (
                <div className="mt-3 border-t pt-3">
                  <div className="text-xs text-gray-600 mb-3">
                    <span className="font-semibold">ID:</span>{' '}
                    <span className="font-mono">{resource._id}</span>
                  </div>
                  {Array.isArray(resource.claims) && resource.claims.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {resource.claims.map((claim, idx) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded p-2">
                          <div className="text-xs text-gray-500 mb-1">
                            {typeof claim.source === 'string' && claim.source.trim().length > 0
                              ? claim.source
                              : 'Unknown source'}
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{claim.text}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">No facts stored for this item.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        initialMode={uploadModalInitialMode}
        projectId={projectId}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          refreshPanelData();
        }}
      />

      {/* Library Browser Modal */}
      <LibraryBrowserModal
        isOpen={showLibraryBrowser}
        projectId={projectId}
        onClose={() => setShowLibraryBrowser(false)}
        onEntitiesLinked={handleEntitiesLinked}
      />

      {/* Collections Modal */}
      <CollectionsModal
        isOpen={showCollectionsModal}
        projectId={projectId}
        onClose={() => setShowCollectionsModal(false)}
        onCollectionLinked={() => {
          setShowCollectionsModal(false);
          setScopeTab('library');
          setTimeout(() => refreshPanelData(), 500);
        }}
      />
    </div>
  );
}
