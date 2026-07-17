import { createHash } from 'node:crypto';
import type { Project } from '../../shared/types/index.js';

type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
type ProjectStore = {
  findById(userId: string, id: string): Promise<Project | null>;
  createWithId(userId: string, id: string, data: ProjectInput): Promise<Project>;
};

export class CampaignCreateMutationError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CampaignCreateMutationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function projectIntent(project: Project | ProjectInput) {
  return {
    title: project.title,
    description: project.description ?? '',
    type: project.type,
    status: project.status,
    productKey: project.productKey ?? 'contentcraft',
    workspaceType: project.workspaceType ?? 'creative_project',
  };
}

export function campaignMutationProjectId(userId: string, mutationId: string) {
  const digest = sha256(JSON.stringify({ userId, mutationId })).slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20)}`;
}

function verifyExisting(existing: Project, input: ProjectInput, mutationId: string) {
  if (sha256(JSON.stringify(projectIntent(existing))) !== sha256(JSON.stringify(projectIntent(input)))) {
    throw new CampaignCreateMutationError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This campaign mutationId was already used with different campaign data. The original campaign was preserved.',
      { mutationId, campaignId: existing.id },
    );
  }
  return { campaign: existing, mutationId, duplicate: true } as const;
}

export async function createCampaignMutation({
  store,
  userId,
  mutationId: suppliedMutationId,
  input,
}: {
  store: ProjectStore;
  userId: string;
  mutationId: string;
  input: ProjectInput;
}) {
  const mutationId = String(suppliedMutationId ?? '').trim();
  if (!mutationId) throw new CampaignCreateMutationError(400, 'VALIDATION_ERROR', 'mutationId is required for campaign creation.');
  if (mutationId.length > 240) throw new CampaignCreateMutationError(400, 'VALIDATION_ERROR', 'mutationId must be 240 characters or fewer.');
  const campaignId = campaignMutationProjectId(userId, mutationId);
  const existing = await store.findById(userId, campaignId);
  if (existing) return verifyExisting(existing, input, mutationId);
  try {
    const campaign = await store.createWithId(userId, campaignId, input);
    return { campaign, mutationId, duplicate: false } as const;
  } catch (error) {
    const concurrent = await store.findById(userId, campaignId);
    if (!concurrent) throw error;
    return verifyExisting(concurrent, input, mutationId);
  }
}
