/** © 2025 Sixsmith Games. All rights reserved. */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, Search } from 'lucide-react';
import { ProjectCard } from '../components/ProjectCard';
import { Project, ProjectType } from '../types';
import { projectApi, setApiAuthToken } from '../services/api';
import { getProductConfig } from '../config/products';
import { useAppAuth } from '../utils/useLocalAuth';
import { isLocalMode } from '../utils/localMode';
import { recentProjects, workspaceFailure, type WorkspaceFailure } from '../utils/workspacePresentation';

const TYPE_LABELS: Record<string, string> = {
  fiction: 'Fiction', nonfiction: 'Non-fiction', 'dnd-adventure': 'Adventure',
  'dnd-homebrew': 'Homebrew world', 'story-arc': 'Story arc', scene: 'Scene',
  outline: 'Outline', chapter: 'Chapter', memoir: 'Memoir', 'journal-entry': 'Journal', 'other-writing': 'Other writing',
};

export const Dashboard: React.FC = () => {
  const localMode = isLocalMode();
  const { isLoaded, isSignedIn, getToken } = useAppAuth();
  const product = getProductConfig();
  const gaming = product.key === 'gamemastercraft';
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<WorkspaceFailure | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ProjectType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const readSequence = useRef(0);
  const pendingDelete = useRef<string | null>(null);
  const unconfirmedDeletes = useRef(new Set<string>());

  const loadProjects = useCallback(async () => {
    const sequence = ++readSequence.current;
    setLoading(true);
    let cause: 'sign-in' | 'unavailable' = 'unavailable';
    try {
      const token = localMode ? null : await getToken();
      if (!localMode && !token) { cause = 'sign-in'; throw new Error('Sign-in unavailable'); }
      setApiAuthToken(token);
      const response = await projectApi.getAll({ token, page });
      if (!response.success || !response.data) throw new Error(response.error || 'Workspace read failed');
      if (sequence !== readSequence.current) return;
      const currentTotalPages = Math.max(1, response.pagination?.totalPages || 1);
      if (page > currentTotalPages) { setPage(currentTotalPages); return; }
      setProjects(recentProjects(response.data));
      setTotalPages(currentTotalPages);
      setTotal(response.pagination?.total ?? response.data.length);
      setFailure(null);
      unconfirmedDeletes.current.clear();
    } catch (error) {
      console.error('Workspace list check failed:', error);
      if (sequence === readSequence.current) {
        setFailure(previous => workspaceFailure(previous, 'load', cause, product.name, product.workspaceNounPlural));
      }
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [getToken, localMode, page, product.name, product.workspaceNounPlural]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!localMode && !isSignedIn) { setProjects([]); setLoading(false); return; }
    void loadProjects();
    return () => { readSequence.current += 1; };
  }, [isLoaded, isSignedIn, localMode, loadProjects]);

  const handleDeleteProject = async (id: string) => {
    if (pendingDelete.current || unconfirmedDeletes.current.has(id) || failure) return;
    const sequence = readSequence.current;
    pendingDelete.current = id;
    setDeletingId(id);
    let cause: 'sign-in' | 'unavailable' = 'unavailable';
    try {
      const token = localMode ? null : await getToken();
      if (!localMode && !token) { cause = 'sign-in'; throw new Error('Sign-in unavailable'); }
      if (sequence !== readSequence.current) return;
      setApiAuthToken(token);
      const response = await projectApi.delete(id, { token });
      if (!response.success) throw new Error(response.error || 'Workspace deletion not confirmed');
      if (sequence !== readSequence.current) return;
      setProjects(previous => previous.filter(project => project.id !== id));
      // Re-read pagination as well, especially when the last card on a page was removed.
      void loadProjects();
      setFailure(null);
    } catch (error) {
      console.error('Workspace deletion check failed:', error);
      if (sequence !== readSequence.current) return;
      unconfirmedDeletes.current.add(id);
      setFailure(previous => workspaceFailure(previous, 'delete', cause, product.name, product.workspaceNounPlural));
    } finally {
      pendingDelete.current = null;
      setDeletingId(null);
    }
  };

  const filteredProjects = projects.filter(project => {
    const query = searchTerm.trim().toLowerCase();
    return (project.title.toLowerCase().includes(query) || (project.description || '').toLowerCase().includes(query))
      && (filterType === 'all' || project.type === filterType);
  });
  // Keep legacy types discoverable without advertising unrelated writing types to GMs.
  const types = [...new Set([...product.projectTypes, ...projects.map(project => project.type)])];
  const clearFilters = () => { setSearchTerm(''); setFilterType('all'); };

  return (
    <div className="space-y-6 workspace-dashboard" aria-busy={loading}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Your {product.workspaceNounPlural}</h1>
          <p className="text-gray-600 mt-2">{gaming ? 'Prepare less. Keep your world consistent. Get back to the table.' : product.emptyStateBody}</p></div>
        {projects.length > 0 && <Link to="/projects/new" className="btn-secondary inline-flex items-center gap-2"><PlusIcon size={18} aria-hidden="true" />New {product.workspaceNoun.toLowerCase()}</Link>}
      </header>
      {failure && <section role="alert" className="card border-red-300 space-y-3">
        <h2 className="text-lg font-semibold">Saved work needs a check</h2>
        <p>{failure.message}</p>
        <p className="text-sm text-gray-500">Support code: <code>{failure.supportCode}</code></p>
        {!failure.escalated && <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadProjects()}>Check saved work</button>}
        {failure.escalated && <a className="btn-secondary inline-flex" href="mailto:info@sixsmithgames.com">Email support</a>}
      </section>}
      {loading && <p role="status">Checking your saved {product.workspaceNounPlural.toLowerCase()}…</p>}
      {!loading && !failure && projects.length === 0 && total === 0 && <section className="card max-w-2xl space-y-4">
        <h2 className="text-2xl font-semibold">{product.emptyStateHeadline}</h2>
        <p>{gaming ? 'No campaigns are saved here yet. Create a campaign, add a person or place, then prepare your next session. Nothing is required before you are ready.' : product.emptyStateBody}</p>
        <Link to="/projects/new" className="btn-primary inline-flex">Create {gaming ? 'a campaign' : 'a workspace'}</Link>
      </section>}
      {projects.length > 0 && <>
        <section className="flex flex-col sm:flex-row gap-4" aria-label={'Find a ' + product.workspaceNoun.toLowerCase()}>
          <label className="flex-1"><span className="block text-sm mb-2">Search {product.workspaceNounPlural.toLowerCase()}{totalPages > 1 ? ' on this page' : ''}</span><div className="relative"><Search size={18} aria-hidden="true" className="absolute left-3 top-3 text-gray-500" /><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="input pl-10" placeholder="Name or description" /></div></label>
          <label><span className="block text-sm mb-2">Type</span><select className="input" value={filterType} onChange={event => setFilterType(event.target.value as ProjectType | 'all')}><option value="all">All types</option>{types.map(type => <option value={type} key={type}>{TYPE_LABELS[type] || type}</option>)}</select></label>
        </section>
        <div className="flex justify-between gap-3 text-sm text-gray-600"><p>{filteredProjects.length} {product.workspaceNounPlural.toLowerCase()} · most recently updated first{failure ? ' · last loaded list, not checked' : ''}</p>{(searchTerm || filterType !== 'all') && <button type="button" onClick={clearFilters} className="text-primary-600">Clear filters</button>}</div>
        {filteredProjects.length === 0 ? <section className="card space-y-3"><h2 className="text-lg font-semibold">No matches in this list</h2><p>No saved work was changed. Clear the search and type filter to see all loaded {product.workspaceNounPlural.toLowerCase()}.</p><button type="button" className="btn-secondary" onClick={clearFilters}>Clear filters</button></section> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{filteredProjects.map(project => <ProjectCard key={project.id} project={project} onDelete={handleDeleteProject} deleteDisabled={loading || Boolean(failure) || Boolean(deletingId)} />)}</div>}
      </>}
      {totalPages > 1 && <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Campaign list pages">
        <button type="button" className="btn-secondary" disabled={loading || Boolean(failure) || page <= 1} onClick={() => { clearFilters(); setPage(value => value - 1); }}>Previous page</button>
        <span className="text-sm text-gray-600">Page {page} of {totalPages} · {total} saved {product.workspaceNounPlural.toLowerCase()}</span>
        <button type="button" className="btn-secondary" disabled={loading || Boolean(failure) || page >= totalPages} onClick={() => { clearFilters(); setPage(value => value + 1); }}>Next page</button>
      </nav>}
    </div>
  );
};
