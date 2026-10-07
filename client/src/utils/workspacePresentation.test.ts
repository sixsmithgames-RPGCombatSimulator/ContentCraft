import { describe, expect, it } from 'vitest';
import { recentProjects, workspaceFailure } from './workspacePresentation';
import { ProjectStatus, ProjectType, type Project } from '../types';

const failure = (previous = null as ReturnType<typeof workspaceFailure> | null, stage: 'load' | 'delete' = 'load', cause: 'sign-in' | 'unavailable' = 'unavailable') => workspaceFailure(previous, stage, cause, 'GameMasterCraft', 'Campaigns');
describe('workspace presentation and bounded recovery', () => {
  it('sorts confirmed update dates without mutating the response or claiming play recency', () => {
    const project = (id: string, date: string): Project => ({ id, title: id, description: '', type: ProjectType.DND_ADVENTURE, status: ProjectStatus.DRAFT, createdAt: new Date(date), updatedAt: new Date(date) });
    const projects = [project('old', '2025-01-01'), project('new', '2026-01-01'), project('unknown', 'invalid')];
    expect(recentProjects(projects).map(value => value.id)).toEqual(['new', 'old', 'unknown']);
    expect(projects[0].id).toBe('old');
  });
  it('names the attempted read, failure, known reason, safe state, and matching next action', () => {
    const result = failure();
    expect(result.escalated).toBe(false);
    expect(result.message).toContain('load your campaigns');
    expect(result.message).toContain('could not confirm the result');
    expect(result.message).toContain('did not return a usable reason');
    expect(result.message).toContain('did not change any saved work');
    expect(result.message).toContain('Check saved work');
    expect(result.message).not.toMatch(/Clerk|HTTP|schema|stack|WORKSPACE-/);
  });
  it('escalates on the second consecutive matching failure without offering a third retry', () => {
    const result = failure(failure());
    expect(result.count).toBe(2);
    expect(result.escalated).toBe(true);
    expect(result.message).toContain('Sorry—GameMasterCraft hit the same snag twice');
    expect(result.message).toContain('info@sixsmithgames.com');
    expect(result.message).toContain('did not change any saved work');
    expect(result.message).not.toContain('Choose Check saved work');
    expect(result.supportCode).toBe('WORKSPACE-LOAD-CHECK');
  });
  it('resets after success, a different cause, or a different workflow stage', () => {
    expect(failure(null).count).toBe(1);
    expect(failure(failure(), 'load', 'sign-in').count).toBe(1);
    expect(failure(failure(), 'delete').count).toBe(1);
  });
  it('does not claim an ambiguous deletion was rolled back or send it again', () => {
    const result = failure(null, 'delete');
    expect(result.message).toContain('may or may not have been removed');
    expect(result.message).toContain('will not send that deletion again');
    expect(result.message).toContain('Check saved work');
    expect(result.message).not.toContain('Nothing was applied');
  });
});
