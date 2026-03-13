import { API_BASE_URL } from './api';
import { createUngroundedWarning } from '../../../src/shared/generation/workflowRegistry';
import type { RetrievalGroundingStatus, WorkflowContentType } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;

export interface CanonEntityClaim {
  text?: string;
}

export interface CanonEntity {
  _id: string;
  canonical_name?: string;
  aliases?: string[];
  type?: string;
  region?: string;
  era?: string;
  claims?: CanonEntityClaim[];
  tags?: string[];
  [key: string]: unknown;
}

export interface CanonFact {
  chunk_id: string;
  text: string;
  entity_id: string;
  entity_name: string;
  entity_type?: string;
  type?: string;
  region?: string;
  era?: string;
  tags?: string[];
}

export interface Factpack {
  facts: CanonFact[];
  entities: string[];
  gaps: string[];
}

export interface WorkflowCanonEntitiesResult {
  entities: CanonEntity[];
  scope: 'project' | 'library';
  availableEntityCount: number;
}

export interface WorkflowCanonSearchInput {
  keywords: string[];
  projectId?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  workflowType?: WorkflowContentType;
}

export interface WorkflowCanonSearchResult {
  factpack: Factpack;
  groundingStatus: RetrievalGroundingStatus;
  availableEntityCount: number;
  matchedEntityCount: number;
  searchedScope: 'project' | 'library' | 'ungrounded';
  warningMessage?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toObjectArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getString(source: JsonRecord | null | undefined, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function parseEntitiesResponse(
  url: string,
  fetchImpl: typeof fetch,
): Promise<CanonEntity[] | null> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return Array.isArray(data)
    ? data.filter((entity): entity is CanonEntity => Boolean(entity && typeof entity === 'object' && '_id' in entity))
    : [];
}

export async function fetchWorkflowCanonEntitiesForSearch(input: {
  projectId?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<WorkflowCanonEntitiesResult> {
  const apiBaseUrl = input.apiBaseUrl ?? API_BASE_URL;
  const fetchImpl = input.fetchImpl ?? fetch;

  if (input.projectId && input.projectId !== 'default') {
    const projectEntities = await parseEntitiesResponse(`${apiBaseUrl}/canon/projects/${input.projectId}/entities`, fetchImpl);
    if (Array.isArray(projectEntities) && projectEntities.length > 0) {
      return {
        entities: projectEntities,
        scope: 'project',
        availableEntityCount: projectEntities.length,
      };
    }
  }

  const libraryEntities = await parseEntitiesResponse(`${apiBaseUrl}/canon/entities?scope=lib`, fetchImpl);
  if (Array.isArray(libraryEntities)) {
    return {
      entities: libraryEntities,
      scope: 'library',
      availableEntityCount: libraryEntities.length,
    };
  }

  throw new Error('Failed to fetch canon entities from both project and library scopes.');
}

export function extractRetrievalHintKeywords(stageOutput: JsonRecord): string[] {
  const retrievalHints = isRecord(stageOutput.retrieval_hints) ? stageOutput.retrieval_hints : null;
  if (!retrievalHints) {
    return [];
  }

  const keywords = [
    ...toStringArray(retrievalHints.entities),
    ...toStringArray(retrievalHints.regions),
    ...toStringArray(retrievalHints.eras),
    ...toStringArray(retrievalHints.keywords),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(keywords));
}

export async function searchWorkflowCanonByKeywords(input: WorkflowCanonSearchInput): Promise<WorkflowCanonSearchResult> {
  const keywords = input.keywords
    .map((keyword) => (typeof keyword === 'string' ? keyword.trim() : ''))
    .filter((keyword) => keyword.length > 0);

  if (keywords.length === 0) {
    return {
      factpack: {
        facts: [],
        entities: [],
        gaps: [],
      },
      groundingStatus: 'ungrounded',
      availableEntityCount: 0,
      matchedEntityCount: 0,
      searchedScope: 'ungrounded',
      warningMessage: input.workflowType ? createUngroundedWarning(input.workflowType, 'ungrounded') : undefined,
    };
  }

  try {
    const { entities: relevantEntities, scope, availableEntityCount } = await fetchWorkflowCanonEntitiesForSearch({
      projectId: input.projectId,
      apiBaseUrl: input.apiBaseUrl,
      fetchImpl: input.fetchImpl,
    });

    const keywordSlugs = keywords.map(slugify).filter((keyword) => keyword.length > 0);
    const keywordSet = new Set(keywordSlugs);
    const regionAnchors = new Set(['snowdown', 'westphal']);

    const scoredEntities = relevantEntities.map((entity) => {
      let score = 0;

      const id = entity._id || '';
      const leafId = id.includes('.') ? id.split('.').pop() || id : id;
      const nameSlug = entity.canonical_name ? slugify(entity.canonical_name) : '';
      const aliasSlugs = toStringArray(entity.aliases).map(slugify);
      const regionSlug = entity.region ? slugify(entity.region) : '';
      const typeSlug = entity.type ? slugify(entity.type) : '';
      const tags = toStringArray(entity.tags || []).map(slugify);

      for (const keyword of keywordSet) {
        if (tags.includes(keyword)) score += 1000;
      }

      if (nameSlug && keywordSet.has(nameSlug)) {
        score += 500;
      }

      for (const keyword of keywordSet) {
        if (nameSlug && nameSlug.includes(keyword) && keyword.length > 3) {
          score += 250;
        }
      }

      if (keywordSet.has(leafId)) {
        score += 300;
      }

      if (aliasSlugs.some((alias) => keywordSet.has(alias))) {
        score += 300;
      }

      if (typeSlug && keywordSet.has(typeSlug)) {
        score += 100;
      }

      if (regionSlug) {
        for (const keyword of keywordSet) {
          if (regionSlug.includes(keyword)) {
            score += 100;
          }
        }
      }

      if (regionAnchors.has(leafId) && keywordSet.has(leafId)) {
        score += 200;
      }

      const multiWordKeywords = keywords
        .filter((keyword) => keyword.split(/\s+/).length >= 2)
        .map(slugify);

      const searchInClaims = multiWordKeywords.length > 0 || score === 0;

      if (searchInClaims) {
        const claims = toObjectArray(entity.claims);
        for (const claim of claims) {
          const claimText = getString(claim, 'text') || '';
          const claimSlug = slugify(claimText);

          for (const keyword of (multiWordKeywords.length > 0 ? multiWordKeywords : Array.from(keywordSet))) {
            if (claimSlug.includes(keyword) && keyword.length > 3) {
              score += 10;
            }
          }
        }
      }

      return {
        entity,
        score,
      };
    });

    const keywordMatches = scoredEntities
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.entity);

    const facts: CanonFact[] = [];
    keywordMatches.forEach((entity) => {
      toObjectArray(entity.claims).forEach((claim, index) => {
        facts.push({
          chunk_id: `${entity._id}#c${index + 1}`,
          text: getString(claim, 'text') || 'No description available',
          entity_id: entity._id,
          entity_name: entity.canonical_name || 'Unknown',
          entity_type: entity.type,
          region: entity.region,
          era: entity.era,
          tags: toStringArray(entity.tags || []),
        });
      });
    });

    const groundingStatus: RetrievalGroundingStatus = facts.length > 0 ? scope : 'ungrounded';

    return {
      factpack: {
        facts,
        entities: keywordMatches.map((entity) => entity._id),
        gaps: facts.length === 0 ? ['No relevant canon found for these keywords'] : [],
      },
      groundingStatus,
      availableEntityCount,
      matchedEntityCount: keywordMatches.length,
      searchedScope: facts.length > 0 ? scope : 'ungrounded',
      warningMessage: input.workflowType ? createUngroundedWarning(input.workflowType, groundingStatus) : undefined,
    };
  } catch (error) {
    return {
      factpack: {
        facts: [],
        entities: [],
        gaps: [`Error searching canon: ${error instanceof Error ? error.message : 'Unknown error'}`],
      },
      groundingStatus: 'ungrounded',
      availableEntityCount: 0,
      matchedEntityCount: 0,
      searchedScope: 'ungrounded',
      warningMessage: input.workflowType ? createUngroundedWarning(input.workflowType, 'ungrounded') : undefined,
    };
  }
}
