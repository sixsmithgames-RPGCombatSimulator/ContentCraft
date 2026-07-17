import { describe, expect, it } from 'vitest';
import { ProjectStatus, ProjectType, type Project } from '../../shared/types/index.js';
import {
  CampaignCreateMutationError,
  campaignMutationProjectId,
  createCampaignMutation,
} from './campaignCreateMutation.js';

function store() {
  const projects = new Map<string, Project>();
  return {
    projects,
    async findById(_userId: string, id: string) { return projects.get(id) ?? null; },
    async createWithId(_userId: string, id: string, input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
      if (projects.has(id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const project = { ...input, id, createdAt: new Date('2026-07-16T12:00:00.000Z'), updatedAt: new Date('2026-07-16T12:00:00.000Z') } as Project;
      projects.set(id, project);
      return project;
    },
  };
}

const input = {
  title: 'Lanterns at Low Tide',
  description: 'A drowned bell calls debtors home.',
  type: ProjectType.DND_ADVENTURE,
  status: ProjectStatus.DRAFT,
  productKey: 'gamemastercraft' as const,
  workspaceType: 'solo_campaign',
};

describe('campaign create mutation', () => {
  it('uses a stable UUID-shaped campaign ID', () => {
    expect(campaignMutationProjectId('user-1', 'session-zero-1')).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  });

  it('returns one campaign for retry and concurrent double-submit', async () => {
    const projectStore = store();
    const [first, retry] = await Promise.all([
      createCampaignMutation({ store: projectStore, userId: 'user-1', mutationId: 'session-zero-1', input }),
      createCampaignMutation({ store: projectStore, userId: 'user-1', mutationId: 'session-zero-1', input }),
    ]);
    expect([first.duplicate, retry.duplicate].sort()).toEqual([false, true]);
    expect(first.campaign.id).toBe(retry.campaign.id);
    expect(projectStore.projects.size).toBe(1);
  });

  it('rejects mutation ID reuse with different campaign data', async () => {
    const projectStore = store();
    await createCampaignMutation({ store: projectStore, userId: 'user-1', mutationId: 'session-zero-1', input });
    await expect(createCampaignMutation({
      store: projectStore,
      userId: 'user-1',
      mutationId: 'session-zero-1',
      input: { ...input, title: 'A Different Campaign' },
    })).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' } satisfies Partial<CampaignCreateMutationError>);
  });
});
