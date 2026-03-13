import { describe, expect, it } from 'vitest';
import {
  buildWorkflowRetryPromptNotice,
  getWorkflowRetryBadgeLabel,
  getWorkflowRetryDetail,
} from './workflowRetryNotice';

describe('workflowRetryNotice', () => {
  const retrySource = {
    kind: 'door_validation' as const,
    label: 'Door validation',
    summary: 'Door 2 in Vault does not line up with the paired doorway in Hall.',
    targetName: 'Vault',
    issueCategory: 'doors',
    issueType: 'misaligned_pair',
  };

  it('builds compact retry labels and details for UI summaries', () => {
    expect(getWorkflowRetryBadgeLabel(retrySource)).toBe('Door validation');
    expect(getWorkflowRetryDetail(retrySource, 120)).toContain('Vault: Door 2 in Vault');
  });

  it('builds prompt notices from retry provenance', () => {
    expect(buildWorkflowRetryPromptNotice(retrySource)).toEqual(
      expect.objectContaining({
        title: 'Retrying rejected space: Vault',
        tone: 'warning',
      }),
    );
  });
});
