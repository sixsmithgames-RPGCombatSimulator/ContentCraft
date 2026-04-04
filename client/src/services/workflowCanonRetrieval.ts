import { API_BASE_URL } from './api';
import { createUngroundedWarning } from '../../../src/shared/generation/workflowRegistry';
import type { RetrievalGroundingStatus, WorkflowContentType } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;

export type WorkflowCanonFetch = (url: string) => Promise<Response>;

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

export interface Factpack {
  facts: CanonFact[];
  entities: string[];
  gaps: string[];
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

export interface WorkflowCanonEntitiesResult {
  entities: CanonEntity[];
  scope: 'project' | 'library';
  availableEntityCount: number;
}

export interface WorkflowCanonSearchInput {
  keywords: string[];
  projectId?: string;
  apiBaseUrl?: string;
  fetchImpl?: WorkflowCanonFetch;
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

const GENERIC_CANON_TOKENS = new Set([
  'ability',
  'alignment',
  'appearance',
  'arcane',
  'background',
  'bard',
  'black',
  'blue',
  'brown',
  'chaotic',
  'charisma',
  'class',
  'cleric',
  'constitution',
  'description',
  'dexterity',
  'dragonborn',
  'druid',
  'dwarf',
  'elf',
  'evil',
  'eyes',
  'female',
  'fighter',
  'gender',
  'gnome',
  'good',
  'gray',
  'green',
  'hair',
  'halfling',
  'height',
  'human',
  'intelligence',
  'large',
  'lawful',
  'level',
  'male',
  'medium',
  'monk',
  'neutral',
  'noble',
  'orc',
  'paladin',
  'pale',
  'race',
  'ranger',
  'red',
  'rogue',
  'sage',
  'skin',
  'small',
  'sorcerer',
  'spellcaster',
  'strength',
  'subrace',
  'variant',
  'warlock',
  'weight',
  'white',
  'wisdom',
  'wizard',
]);

function isSpecificClaimKeyword(keyword: string): boolean {
  const tokens = keyword.split(/_+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return false;

  const distinctiveTokens = tokens.filter((token) => token.length >= 4 && !GENERIC_CANON_TOKENS.has(token));
  if (distinctiveTokens.length === 0) {
    return false;
  }

  if (tokens.length === 1) {
    return distinctiveTokens[0]!.length >= 6;
  }

  return true;
}

async function parseEntitiesResponse(
  url: string,
  fetchImpl: WorkflowCanonFetch,
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
  fetchImpl?: WorkflowCanonFetch;
}): Promise<WorkflowCanonEntitiesResult> {
  const apiBaseUrl = input.apiBaseUrl ?? API_BASE_URL;
  const fetchImpl: WorkflowCanonFetch = input.fetchImpl ?? ((url) => fetch(url));

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

    const claimKeywords = keywordSlugs
      .filter((keyword) => keyword.length > 3)
      .map((keyword) => ({
        keyword,
        weight: isSpecificClaimKeyword(keyword) ? 25 : 10,
      }));

    const scoredEntities = relevantEntities.map((entity) => {
      let score = 0;

      const id = entity._id || '';
      const leafId = id.includes('.') ? id.split('.').pop() || id : id;
      const nameSlug = entity.canonical_name ? slugify(entity.canonical_name) : '';
      const aliasSlugs = toStringArray(entity.aliases).map(slugify);
      const regionSlug = entity.region ? slugify(entity.region) : '';
      const typeSlug = entity.type ? slugify(entity.type) : '';
      const tags = toStringArray(entity.tags || []).map(slugify);
      let exactEntityMatch = false;
      let structuralMatch = false;

      for (const keyword of keywordSet) {
        if (tags.includes(keyword)) {
          score += 1000;
          structuralMatch = true;
        }
      }

      if (nameSlug && keywordSet.has(nameSlug)) {
        score += 500;
        exactEntityMatch = true;
        structuralMatch = true;
      }

      for (const keyword of keywordSet) {
        if (nameSlug && nameSlug.includes(keyword) && keyword.length > 3) {
          score += 250;
          structuralMatch = true;
        }
      }

      if (keywordSet.has(leafId)) {
        score += 300;
        exactEntityMatch = true;
        structuralMatch = true;
      }

      if (aliasSlugs.some((alias) => keywordSet.has(alias))) {
        score += 300;
        exactEntityMatch = true;
        structuralMatch = true;
      }

      if (typeSlug && keywordSet.has(typeSlug)) {
        score += 100;
        structuralMatch = true;
      }

      if (regionSlug) {
        for (const keyword of keywordSet) {
          if (regionSlug.includes(keyword)) {
            score += 100;
            structuralMatch = true;
          }
        }
      }

      if (regionAnchors.has(leafId) && keywordSet.has(leafId)) {
        score += 200;
        structuralMatch = true;
      }

      return {
        entity,
        score,
        exactEntityMatch,
        structuralMatch,
      };
    });

    const hasExactEntityMatch = scoredEntities.some((item) => item.exactEntityMatch);

    const rescoredEntities = scoredEntities.map((item) => {
      let score = item.score;

      const claims = toObjectArray(item.entity.claims);
      for (const claim of claims) {
        const claimText = getString(claim, 'text') || '';
        const claimSlug = slugify(claimText);

        for (const { keyword, weight } of claimKeywords) {
          if (claimSlug.includes(keyword)) {
            score += weight;
          }
        }
      }

      return {
        ...item,
        score,
      };
    });

    const hasStructuralMatch = rescoredEntities.some((item) => item.structuralMatch);
    const minimumScore = hasExactEntityMatch ? 250 : hasStructuralMatch ? 100 : 25;

    const keywordMatches = rescoredEntities
      .filter((item) => item.score >= minimumScore)
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
