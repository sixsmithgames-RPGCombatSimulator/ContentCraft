import type { Project } from '../types';

export function recentProjects(projects: Project[]): Project[] {
  const time = (value: Date) => Number.isFinite(Date.parse(String(value))) ? Date.parse(String(value)) : 0;
  return [...projects].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
}

export interface WorkspaceFailure {
  signature: string;
  count: number;
  message: string;
  supportCode: string;
  escalated: boolean;
}

/** Diagnostics stay in the log. Only a normalized category reaches this copy. */
export function workspaceFailure(
  previous: WorkspaceFailure | null,
  stage: 'load' | 'delete',
  cause: 'sign-in' | 'unavailable',
  productName: string,
  workspacePlural: string,
): WorkspaceFailure {
  const signature = `workspace:${stage}:${cause}`;
  const count = previous?.signature === signature ? previous.count + 1 : 1;
  const escalated = count >= 2;
  const supportCode = `WORKSPACE-${stage.toUpperCase()}-${cause === 'sign-in' ? 'SIGNIN' : 'CHECK'}`;
  const attempted = stage === 'load' ? `load your ${workspacePlural.toLowerCase()}` : 'delete the selected workspace';
  const reason = cause === 'sign-in'
    ? 'Your sign-in could not be confirmed.'
    : 'The campaign service did not return a usable reason.';
  const impact = stage === 'load'
    ? 'This read did not change any saved work.'
    : 'The deletion was not confirmed. The workspace may or may not have been removed; this page will not send that deletion again.';
  const next = escalated
    ? `Sorry—${productName} hit the same snag twice after your correction. Please email info@sixsmithgames.com and include the support code below so we can get your game moving again.`
    : cause === 'sign-in'
      ? 'Sign in again, then choose Check saved work.'
      : 'Choose Check saved work to load the current list before taking another action.';
  return { signature, count, escalated, supportCode, message: `${productName} tried to ${attempted}, but could not confirm the result. ${reason} ${impact} ${next}` };
}
