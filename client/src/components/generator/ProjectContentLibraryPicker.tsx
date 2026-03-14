import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Search,
  Unlink2,
  Upload,
} from 'lucide-react';
import { API_BASE_URL } from '../../services/api';

type ProjectContentStatus = 'project_only' | 'in_library' | 'linked' | 'unsupported';

interface ProjectContentLibraryItem {
  content_id: string;
  title: string;
  content_type: string;
  display_type: string;
  created_at: string;
  updated_at: string;
  eligible: boolean;
  status: ProjectContentStatus;
  reason?: string;
  library_entity_id: string | null;
  link_id: string | null;
  entity_type?: string;
  source_count: number;
}

interface ProjectContentLibraryPickerProps {
  projectId: string;
  onBack: () => void;
  onSuccess: () => void;
}

const STATUS_META: Record<ProjectContentStatus, { label: string; className: string }> = {
  project_only: {
    label: 'Project only',
    className: 'bg-slate-100 text-slate-700 border border-slate-200',
  },
  in_library: {
    label: 'In library',
    className: 'bg-violet-100 text-violet-700 border border-violet-200',
  },
  linked: {
    label: 'Linked for canon',
    className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  unsupported: {
    label: 'Unsupported',
    className: 'bg-amber-100 text-amber-800 border border-amber-200',
  },
};

export default function ProjectContentLibraryPicker({
  projectId,
  onBack,
  onSuccess,
}: ProjectContentLibraryPickerProps) {
  const [items, setItems] = useState<ProjectContentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectContentStatus>('all');
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/generated-content-status`);
      let data: unknown = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.warn('[ProjectContentLibraryPicker] Failed to parse status response:', parseError);
      }

      if (!response.ok) {
        const message =
          data && typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error?: unknown }).error ?? 'Failed to load project content status')
            : `Failed to load project content status (${response.status})`;
        setError(message);
        setItems([]);
        return;
      }

      if (!Array.isArray(data)) {
        setError('Unexpected response format while loading project content.');
        setItems([]);
        return;
      }

      setItems(data as ProjectContentLibraryItem[]);
    } catch (loadError) {
      console.error('[ProjectContentLibraryPicker] Failed to load items:', loadError);
      setError('Unable to load project content. Please try again later.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const runAction = useCallback(
    async (actionKey: string, operation: () => Promise<Response>) => {
      try {
        setActiveActionKey(actionKey);
        setError(null);
        const response = await operation();
        let data: unknown = null;
        try {
          data = await response.json();
        } catch (parseError) {
          console.warn('[ProjectContentLibraryPicker] Failed to parse action response:', parseError);
        }

        if (!response.ok) {
          const message =
            data && typeof data === 'object' && data !== null && 'error' in data
              ? String((data as { error?: unknown }).error ?? 'Action failed')
              : `Action failed (${response.status})`;
          setError(message);
          return;
        }

        await loadItems();
        onSuccess();
      } catch (actionError) {
        console.error('[ProjectContentLibraryPicker] Action failed:', actionError);
        setError('Unable to update project canon status. Please try again later.');
      } finally {
        setActiveActionKey(null);
      }
    },
    [loadItems, onSuccess],
  );

  const handlePromote = useCallback(
    async (item: ProjectContentLibraryItem, linkToProject: boolean) => {
      await runAction(`promote:${item.content_id}:${linkToProject ? 'link' : 'update'}`, () =>
        fetch(`${API_BASE_URL}/canon/projects/${projectId}/promote-generated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_ids: [item.content_id],
            link_to_project: linkToProject,
          }),
        }),
      );
    },
    [projectId, runAction],
  );

  const handleLink = useCallback(
    async (item: ProjectContentLibraryItem) => {
      if (!item.library_entity_id) {
        setError('This item is missing a library entity id and cannot be linked.');
        return;
      }
      await runAction(`link:${item.content_id}`, () =>
        fetch(`${API_BASE_URL}/canon/projects/${projectId}/links`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ library_entity_ids: [item.library_entity_id] }),
        }),
      );
    },
    [projectId, runAction],
  );

  const handleUnlink = useCallback(
    async (item: ProjectContentLibraryItem) => {
      if (!item.link_id) {
        setError('This item is not currently linked to the project.');
        return;
      }
      await runAction(`unlink:${item.content_id}`, () =>
        fetch(`${API_BASE_URL}/canon/projects/${projectId}/links/${item.link_id}`, {
          method: 'DELETE',
        }),
      );
    },
    [projectId, runAction],
  );

  const availableTypes = useMemo(
    () => Array.from(new Set(items.map((item) => item.display_type).filter((value) => value.trim().length > 0))).sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return items
      .filter((item) => (typeFilter === 'all' ? true : item.display_type === typeFilter))
      .filter((item) => (statusFilter === 'all' ? true : item.status === statusFilter))
      .filter((item) => {
        if (!normalizedQuery) return true;
        return (
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.display_type.toLowerCase().includes(normalizedQuery) ||
          item.content_type.toLowerCase().includes(normalizedQuery) ||
          item.entity_type?.toLowerCase().includes(normalizedQuery) ||
          item.library_entity_id?.toLowerCase().includes(normalizedQuery)
        );
      });
  }, [items, searchQuery, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.status] += 1;
        return acc;
      },
      {
        project_only: 0,
        in_library: 0,
        linked: 0,
        unsupported: 0,
      } satisfies Record<ProjectContentStatus, number>,
    );
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-950">Promote existing project content into your canon library</h3>
            <p className="mt-1 text-sm text-blue-900">
              Add project content to the shared library, then link or unlink it from this project instantly.
              Linked items are the canon resources the generator should think with for this project.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('project_only')}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:border-slate-400"
            >
              Project only ({counts.project_only})
            </button>
            <button
              onClick={() => setStatusFilter('in_library')}
              className="rounded-full border border-violet-300 bg-white px-3 py-1 text-violet-700 hover:border-violet-400"
            >
              In library ({counts.in_library})
            </button>
            <button
              onClick={() => setStatusFilter('linked')}
              className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-emerald-700 hover:border-emerald-400"
            >
              Linked for canon ({counts.linked})
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search project content by title, type, or library id..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="all">All types</option>
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectContentStatus)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="all">All statuses</option>
          <option value="project_only">Project only</option>
          <option value="in_library">In library</option>
          <option value="linked">Linked for canon</option>
          <option value="unsupported">Unsupported</option>
        </select>
        <button
          onClick={() => {
            setSearchQuery('');
            setTypeFilter('all');
            setStatusFilter('all');
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
        <button
          onClick={loadItems}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Showing <span className="font-semibold">{filteredItems.length}</span> of{' '}
          <span className="font-semibold">{items.length}</span> project items
        </span>
        <span>Unlink keeps the library entry but removes it from active canon reasoning for this project.</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-12 text-gray-600">
          Loading project content...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-gray-600">
          No matching project content found.
        </div>
      ) : (
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {filteredItems.map((item) => {
            const statusMeta = STATUS_META[item.status];
            const promotingActionKey = `promote:${item.content_id}:link`;
            const updatingActionKey = `promote:${item.content_id}:update`;
            const linkingActionKey = `link:${item.content_id}`;
            const unlinkingActionKey = `unlink:${item.content_id}`;

            return (
              <div
                key={item.content_id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-lg font-semibold text-gray-900">{item.title}</h4>
                      <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                        {item.display_type}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Created {new Date(item.created_at).toLocaleDateString()}</span>
                      <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                      {item.entity_type && <span>Library type: {item.entity_type}</span>}
                      {item.source_count > 0 && <span>{item.source_count} fact candidates</span>}
                    </div>

                    {item.library_entity_id && (
                      <div className="mt-2 text-xs text-gray-500">
                        Library ID: <span className="font-mono text-gray-700">{item.library_entity_id}</span>
                      </div>
                    )}

                    {item.status === 'unsupported' && item.reason && (
                      <div className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{item.reason}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 lg:w-56">
                    {item.status === 'project_only' && item.eligible && (
                      <button
                        onClick={() => handlePromote(item, true)}
                        disabled={activeActionKey !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Upload className="h-4 w-4" />
                        {activeActionKey === promotingActionKey ? 'Adding…' : 'Add & Link'}
                      </button>
                    )}

                    {item.status === 'in_library' && item.eligible && (
                      <>
                        <button
                          onClick={() => handleLink(item)}
                          disabled={activeActionKey !== null}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Link2 className="h-4 w-4" />
                          {activeActionKey === linkingActionKey ? 'Linking…' : 'Link to Project'}
                        </button>
                        <button
                          onClick={() => handlePromote(item, false)}
                          disabled={activeActionKey !== null}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {activeActionKey === updatingActionKey ? 'Updating…' : 'Update Library'}
                        </button>
                      </>
                    )}

                    {item.status === 'linked' && item.eligible && (
                      <>
                        <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Active for canon
                        </div>
                        <button
                          onClick={() => handlePromote(item, true)}
                          disabled={activeActionKey !== null}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {activeActionKey === promotingActionKey ? 'Syncing…' : 'Update Library'}
                        </button>
                        <button
                          onClick={() => handleUnlink(item)}
                          disabled={activeActionKey !== null}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Unlink2 className="h-4 w-4" />
                          {activeActionKey === unlinkingActionKey ? 'Unlinking…' : 'Unlink'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <button
          onClick={onBack}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <div className="text-sm text-gray-500">Creators can promote, sync, link, and unlink without leaving this dialog.</div>
      </div>
    </div>
  );
}
