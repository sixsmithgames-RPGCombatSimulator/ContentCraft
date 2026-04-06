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

  it('does not include weak claim-only matches for generic planner keywords', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/canon/projects/project-1/entities')) {
        return createJsonResponse([
          {
            _id: 'npc.glatham',
            canonical_name: 'Glatham Woodspliter Elanithak',
            claims: [
              { text: 'Alignment: Lawful Neutral' },
              { text: 'Hair: Black' },
            ],
          },
        ]);
      }

      return createJsonResponse([]);
    });

    const result = await searchWorkflowCanonByKeywords({
      keywords: ['Fiblan', 'Wizard', 'Human', 'Lawful Neutral'],
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
      workflowType: 'npc',
    });

    expect(result.groundingStatus).toBe('ungrounded');
    expect(result.matchedEntityCount).toBe(0);
    expect(result.factpack.facts).toEqual([]);
  });

  it('still includes direct canon matches when the keyword exactly names an entity', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/canon/projects/project-1/entities')) {
        return createJsonResponse([
          {
            _id: 'npc.fiblan',
            canonical_name: 'Fiblan',
            claims: [
              { text: 'Fiblan was born in Marenport.' },
            ],
          },
          {
            _id: 'npc.glatham',
            canonical_name: 'Glatham Woodspliter Elanithak',
            claims: [
              { text: 'Alignment: Lawful Neutral' },
            ],
          },
        ]);
      }

      return createJsonResponse([]);
    });

    const result = await searchWorkflowCanonByKeywords({
      keywords: ['Fiblan', 'Lawful Neutral'],
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
      workflowType: 'npc',
    });

    expect(result.groundingStatus).toBe('project');
    expect(result.matchedEntityCount).toBe(1);
    expect(result.factpack.facts[0]?.entity_name).toBe('Fiblan');
  });

  it('ignores generic tag overlap such as RPG system metadata when no specific canon terms match', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/canon/projects/project-1/entities')) {
        return createJsonResponse([
          {
            _id: 'npc.glatham',
            canonical_name: 'Glatham Woodspliter Elanithak',
            tags: ['rpg', 'dungeons_and_dragons', '2024raw'],
            claims: [
              { text: 'Alignment: Lawful Neutral' },
              { text: 'Genre: D&D' },
            ],
          },
        ]);
      }

      return createJsonResponse([]);
    });

    const result = await searchWorkflowCanonByKeywords({
      keywords: ['Fiblan', 'Wizard', 'Human', 'Lawful Neutral', 'RPG', 'Dungeons and Dragons', '2024RAW'],
      projectId: 'project-1',
      apiBaseUrl: 'https://example.test',
      fetchImpl,
      workflowType: 'npc',
    });

    expect(result.groundingStatus).toBe('ungrounded');
    expect(result.matchedEntityCount).toBe(0);
    expect(result.factpack.facts).toEqual([]);
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
