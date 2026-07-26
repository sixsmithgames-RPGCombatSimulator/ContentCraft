import { describe, expect, it } from 'vitest';
import {
  MemoryGenerationWorkflowStore,
  defaultGenerationStage,
  executeGenerationWorkflow,
} from './generationWorkflow.js';

describe('durable staged generation workflows', () => {
  it('runs plan, retrieval, skeleton, expansion, and review with one bounded model call', async () => {
    const store = new MemoryGenerationWorkflowStore();
    let calls = 0;
    const execute = () => executeGenerationWorkflow({
      userId: 'user-1',
      workflowId: 'entity-workflow-1',
      kind: 'entity.npc',
      request: { kind: 'entity.npc', campaignId: 'campaign-1', name: 'Mara' },
      store,
      runStage: (context) => defaultGenerationStage({
        ...context,
        expand: async () => {
          calls += 1;
          return { name: 'Mara', draft: true };
        },
      }),
    });
    await expect(execute()).resolves.toEqual({ name: 'Mara', draft: true });
    await expect(execute()).resolves.toEqual({ name: 'Mara', draft: true });
    expect(calls).toBe(1);
  });

  it('resumes after a retryable expansion failure without repeating completed deterministic stages', async () => {
    const store = new MemoryGenerationWorkflowStore();
    let attempts = 0;
    const request = { kind: 'campaign.foundation', campaignId: 'campaign-1' };
    const execute = () => executeGenerationWorkflow({
      userId: 'user-1',
      workflowId: 'campaign-workflow-1',
      kind: 'campaign.foundation',
      request,
      store,
      runStage: (context) => defaultGenerationStage({
        ...context,
        expand: async () => {
          attempts += 1;
          if (attempts === 1) throw Object.assign(new Error('temporary'), { retryable: true });
          return { campaign: { title: 'Recovered' } };
        },
      }),
    });
    await expect(execute()).rejects.toThrow('temporary');
    await expect(execute()).resolves.toEqual({ campaign: { title: 'Recovered' } });
    expect(attempts).toBe(2);
  });

  it('rejects a workflow ID reused for different input', async () => {
    const store = new MemoryGenerationWorkflowStore();
    const execute = (name: string) => executeGenerationWorkflow({
      userId: 'user-1',
      workflowId: 'same-workflow',
      kind: 'entity.location',
      request: { kind: 'entity.location', name },
      store,
      runStage: (context) => defaultGenerationStage({
        ...context,
        expand: async () => ({ name }),
      }),
    });
    await execute('First');
    await expect(execute('Second')).rejects.toMatchObject({ code: 'WORKFLOW_IDEMPOTENCY_CONFLICT' });
  });
});
