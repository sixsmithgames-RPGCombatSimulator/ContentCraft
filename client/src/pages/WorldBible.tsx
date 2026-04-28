/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users, MapPin, Shield, Package, BookText, Clock, Search, Plus,
  Edit2, Unlink, Wand2, ChevronRight, AlertCircle, RefreshCw,
} from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { getProductConfig } from '../config/products';
import CanonEntityEditor, { type CanonBase } from '../components/canon/CanonEntityEditor';
import LibraryBrowserModal from '../components/canon/LibraryBrowserModal';

/** A canon entity as returned by the project entities endpoint. */
interface CanonEntity extends CanonBase {
  _id: string;
  canonical_name: string;
  type: EntityType;
  claims?: Array<{ text: string; source: string }>;
  era?: string;
  region?: string;
  tags?: string[];
  aliases?: string[];
}

type EntityType = 'npc' | 'monster' | 'item' | 'spell' | 'location' | 'faction' | 'rule' | 'timeline' | string;

interface TabConfig {
  key: EntityType | 'all';
  label: string;
  icon: React.ReactNode;
  types: EntityType[];
  emptyText: string;
  generatorType?: string;
}

/** Returns a brief summary sentence from an entity's claims array. */
function claimSummary(entity: CanonEntity, maxChars = 120): string {
  const first = entity.claims?.[0]?.text ?? '';
  if (!first) return '';
  return first.length > maxChars ? first.slice(0, maxChars) + '…' : first;
}

/** Maps entity type to a color class for the badge. */
function typeBadgeClass(type: string): string {
  switch (type) {
    case 'npc': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'location': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'faction': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'item': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    case 'rule': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
    case 'monster': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    case 'timeline': return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    default: return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
  }
}

/** Builds the generator link for a content type, pre-seeded with projectId. */
function generatorLink(generatorType: string, projectId: string): string {
  return `/generator?type=${generatorType}&projectId=${projectId}`;
}

/** World Bible page — consolidated project reference view organized by entity type. */
export const WorldBible: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = getProductConfig();

  const [entities, setEntities] = useState<CanonEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EntityType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntity, setEditingEntity] = useState<CanonEntity | null>(null);
  const [showLibraryBrowser, setShowLibraryBrowser] = useState(false);
  const [libraryBrowserTypeFilter, setLibraryBrowserTypeFilter] = useState<string>('');
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const TABS: TabConfig[] = [
    {
      key: 'all',
      label: 'All',
      icon: <BookText className="w-4 h-4" />,
      types: [],
      emptyText: 'No world entries yet. Use the generator to create content and promote it to your library.',
    },
    {
      key: 'npc',
      label: product.navigationLabels.characters,
      icon: <Users className="w-4 h-4" />,
      types: ['npc'],
      emptyText: `No ${product.navigationLabels.characters.toLowerCase()} yet. Generate one to get started.`,
      generatorType: 'npc',
    },
    {
      key: 'location',
      label: product.navigationLabels.locations,
      icon: <MapPin className="w-4 h-4" />,
      types: ['location'],
      emptyText: `No ${product.navigationLabels.locations.toLowerCase()} yet.`,
      generatorType: 'location',
    },
    {
      key: 'faction',
      label: 'Factions',
      icon: <Shield className="w-4 h-4" />,
      types: ['faction'],
      emptyText: 'No factions yet.',
    },
    {
      key: 'item',
      label: 'Items',
      icon: <Package className="w-4 h-4" />,
      types: ['item'],
      emptyText: 'No items yet.',
      generatorType: 'item',
    },
    {
      key: 'rule',
      label: product.navigationLabels.lore,
      icon: <BookText className="w-4 h-4" />,
      types: ['rule', 'spell', 'monster'],
      emptyText: `No ${product.navigationLabels.lore.toLowerCase()} entries yet.`,
    },
    {
      key: 'timeline',
      label: product.navigationLabels.timeline,
      icon: <Clock className="w-4 h-4" />,
      types: ['timeline'],
      emptyText: 'No timeline entries yet.',
    },
  ];

  const loadEntities = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/entities`);
      if (!response.ok) throw new Error(`Failed to load world entries (${response.status})`);
      const data = await response.json() as CanonEntity[];
      setEntities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[WorldBible] loadEntities failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load world entries');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const currentTab = TABS.find(t => t.key === activeTab) ?? TABS[0];

  const filteredEntities = entities.filter(entity => {
    const matchesTab = activeTab === 'all' || currentTab.types.includes(entity.type);
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || entity.canonical_name.toLowerCase().includes(q)
      || entity.claims?.some(c => c.text.toLowerCase().includes(q))
      || entity.tags?.some(t => t.toLowerCase().includes(q));
    return matchesTab && matchesSearch;
  });

  const countForTab = (tab: TabConfig): number => {
    if (tab.key === 'all') return entities.length;
    return entities.filter(e => tab.types.includes(e.type)).length;
  };

  const handleUnlink = async (entity: CanonEntity) => {
    if (!projectId) return;
    if (!window.confirm(`Remove "${entity.canonical_name}" from this project's world bible?`)) return;
    setUnlinkingId(entity._id);
    try {
      const linksRes = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`);
      if (!linksRes.ok) throw new Error('Failed to load project links');
      const links = await linksRes.json() as Array<{ _id: string; library_entity_id: string }>;
      const link = links.find(l => l.library_entity_id === entity._id);
      if (!link) {
        setError('Link not found — entity may already be unlinked.');
        return;
      }
      const delRes = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/links/${link._id}`, {
        method: 'DELETE',
      });
      if (!delRes.ok) throw new Error('Failed to remove link');
      setEntities(prev => prev.filter(e => e._id !== entity._id));
    } catch (err) {
      console.error('[WorldBible] handleUnlink failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to unlink entity');
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleSaveEntity = async (updated: CanonBase) => {
    if (!editingEntity) return;
    const entityId = updated._id ?? editingEntity._id;
    const response = await fetch(`${API_BASE_URL}/canon/entities/${entityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editingEntity, ...updated, _id: entityId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Failed to update entity');
    }
    const savedEntity = await response.json() as CanonEntity;
    setEntities(prev => prev.map(e => e._id === entityId ? { ...e, ...savedEntity } : e));
    setEditingEntity(null);
  };

  const openLibraryBrowserForTab = (tab: TabConfig) => {
    setLibraryBrowserTypeFilter(tab.types.length === 1 ? tab.types[0] : '');
    setShowLibraryBrowser(true);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            World Bible
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">
            All characters, locations, factions, lore, and timeline entries for this {product.workspaceNoun.toLowerCase()}.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => openLibraryBrowserForTab(currentTab)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add from Library
          </button>
          {currentTab.generatorType && (
            <Link
              to={generatorLink(currentTab.generatorType, projectId)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Wand2 className="w-4 h-4" />
              Generate
            </Link>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search names, facts, or tags…"
          className="input pl-10"
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-slate-800 mb-6">
        {TABS.map(tab => {
          const count = countForTab(tab);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  activeTab === tab.key
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 mb-4">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button onClick={() => void loadEntities()} className="ml-auto">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : filteredEntities.length === 0 ? (
        <EmptyTabState
          tab={currentTab}
          projectId={projectId}
          onAddFromLibrary={() => openLibraryBrowserForTab(currentTab)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEntities.map(entity => (
            <EntityCard
              key={entity._id}
              entity={entity}
              isUnlinking={unlinkingId === entity._id}
              onEdit={() => setEditingEntity(entity)}
              onUnlink={() => void handleUnlink(entity)}
            />
          ))}
        </div>
      )}

      {/* Entity editor */}
      {editingEntity && (
        <CanonEntityEditor
          isOpen
          entity={editingEntity}
          onClose={() => setEditingEntity(null)}
          onSave={handleSaveEntity}
        />
      )}

      {/* Library browser */}
      {showLibraryBrowser && (
        <LibraryBrowserModal
          isOpen
          projectId={projectId}
          onClose={() => setShowLibraryBrowser(false)}
          onEntitiesLinked={(_ids) => {
            setShowLibraryBrowser(false);
            void loadEntities();
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EntityCardProps {
  entity: CanonEntity;
  isUnlinking: boolean;
  onEdit: () => void;
  onUnlink: () => void;
}

const EntityCard: React.FC<EntityCardProps> = ({ entity, isUnlinking, onEdit, onUnlink }) => {
  const summary = claimSummary(entity);

  return (
    <div className="group relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${typeBadgeClass(entity.type)}`}>
            {entity.type}
          </span>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm leading-snug truncate">
            {entity.canonical_name}
          </h3>
          {entity.aliases && entity.aliases.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">
              aka {entity.aliases.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors"
            title="Edit entity"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onUnlink}
            disabled={isUnlinking}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            title="Remove from project"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Claim summary */}
      {summary && (
        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed flex-1">
          {summary}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-slate-800">
        {/* Tags */}
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {entity.tags?.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 rounded">
              {tag}
            </span>
          ))}
          {(entity.tags?.length ?? 0) > 3 && (
            <span className="text-xs text-gray-400 dark:text-slate-500">+{entity.tags!.length - 3}</span>
          )}
        </div>
        {/* Claim count */}
        <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0 flex items-center gap-1">
          <ChevronRight className="w-3 h-3" />
          {entity.claims?.length ?? 0} fact{entity.claims?.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
};

interface EmptyTabStateProps {
  tab: TabConfig;
  projectId: string;
  onAddFromLibrary: () => void;
}

const EmptyTabState: React.FC<EmptyTabStateProps> = ({ tab, projectId, onAddFromLibrary }) => (
  <div className="text-center py-16 px-4">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 mb-4 text-gray-400 dark:text-slate-500">
      {tab.icon}
    </div>
    <p className="text-gray-500 dark:text-slate-400 text-sm max-w-xs mx-auto mb-6">{tab.emptyText}</p>
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <button onClick={onAddFromLibrary} className="btn-secondary flex items-center gap-2 text-sm">
        <Plus className="w-4 h-4" /> Add from Library
      </button>
      {tab.generatorType && (
        <Link
          to={`/generator?type=${tab.generatorType}&projectId=${projectId}`}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Wand2 className="w-4 h-4" /> Generate
        </Link>
      )}
    </div>
  </div>
);
