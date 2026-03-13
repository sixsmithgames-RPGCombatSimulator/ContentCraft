import { describe, expect, it, vi } from 'vitest';
import {
  extractRetrievalHintKeywords,
  fetchWorkflowCanonEntitiesForSearch,
  searchWorkflowCanonByKeywords,
} from './workflowCanonRetrieval';

function createJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('workflowCanonRetrieval', () => {
  it('prefers project canon when project entities exist', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/canon/projects/project-1/entities')) {
        return createJsonResponse([{ _id: 'npc.thyra', canonical_name: 'Thyra Odinson', claims: [{ text: 'A guardian paladin.' }] }]);
      }

      return createJsonResponse([]);
    });

    const result = await fetchWorkflowCanonEntitiesForSearch({
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
    });

    expect(result.scope).toBe('project');
    expect(result.availableEntityCount).toBe(1);
  });

  it('falls back to library canon when project canon is empty', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/canon/projects/project-1/entities')) {
        return createJsonResponse([]);
      }

      return createJsonResponse([{ _id: 'npc.barley', canonical_name: 'Barley', claims: [{ text: 'A halfling warlock chef.' }] }]);
    });

    const result = await searchWorkflowCanonByKeywords({
      keywords: ['Barley'],
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
      workflowType: 'npc',
    });

    expect(result.groundingStatus).toBe('library');
    expect(result.searchedScope).toBe('library');
    expect(result.factpack.facts).toHaveLength(1);
  });

  it('returns ungrounded when no canon facts match anywhere', async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse([]));

    const result = await searchWorkflowCanonByKeywords({
      keywords: ['Unknown Hero'],
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
      workflowType: 'npc',
    });

    expect(result.groundingStatus).toBe('ungrounded');
    expect(result.factpack.facts).toEqual([]);
    expect(result.factpack.gaps).toEqual(['No relevant canon found for these keywords']);
    expect(result.warningMessage).toContain('ungrounded');
  });

  it('extracts and deduplicates retrieval hint keywords', () => {
    const keywords = extractRetrievalHintKeywords({
      retrieval_hints: {
        entities: ['Barley', 'Barley'],
        regions: ['Tears of Selune'],
        eras: ['Current'],
        keywords: ['warlock', 'chef', 'warlock'],
      },
    });

    expect(keywords).toEqual(['Barley', 'Tears of Selune', 'Current', 'warlock', 'chef']);
  });
});
