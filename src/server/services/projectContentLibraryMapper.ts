import { type Claim, generateLibraryEntityId, type EntityType } from '../models/CanonEntity.js';
import type { GeneratedContentDocument } from '../models/GeneratedContent.js';

type JsonRecord = Record<string, unknown>;

export type PromotionState = 'project_only' | 'in_library' | 'linked' | 'unsupported';

export interface ProjectContentLibraryDraft {
  canonicalName: string;
  claims: Claim[];
  contentId: string;
  entityId: string;
  entityType: EntityType;
  sourceData: JsonRecord;
  sourceLabel: string;
  tags: string[];
}

export interface ProjectContentLibraryUnsupported {
  canonicalName: string;
  contentId: string;
  reason: string;
}

const MAX_CLAIMS = 30;
const MAX_CLAIM_LENGTH = 320;
const SKIPPED_KEYS = new Set([
  '_id',
  'id',
  'metadata',
  'schema_version',
  'schemaVersion',
  'sources_used',
  'source_material',
  'proposals',
  'conflicts',
  'resolved_proposals',
  'resolved_conflicts',
  'prompt',
  'raw',
  'json',
  'errors',
  'warnings',
  'created_at',
  'updated_at',
]);

const TYPE_ALIASES: Array<[string, EntityType]> = [
  ['npc', 'npc'],
  ['character', 'npc'],
  ['monster', 'monster'],
  ['item', 'item'],
  ['location', 'location'],
  ['spell', 'spell'],
  ['faction', 'faction'],
  ['timeline', 'timeline'],
  ['story_arc', 'timeline'],
  ['story-arc', 'timeline'],
  ['rule', 'rule'],
];

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const ensureString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const humanizeKey = (key: string): string =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const pushClaim = (claims: string[], seen: Set<string>, text: string): void => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return;
  if (normalized.length > MAX_CLAIM_LENGTH) {
    const truncated = `${normalized.slice(0, MAX_CLAIM_LENGTH - 1).trimEnd()}…`;
    if (!seen.has(truncated)) {
      seen.add(truncated);
      claims.push(truncated);
    }
    return;
  }
  if (!seen.has(normalized)) {
    seen.add(normalized);
    claims.push(normalized);
  }
};

const collectClaims = (
  value: unknown,
  label: string,
  claims: string[],
  seen: Set<string>,
  depth: number,
): void => {
  if (claims.length >= MAX_CLAIMS || depth > 4 || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;
    const prefix = label ? `${label}: ` : '';
    pushClaim(claims, seen, `${prefix}${trimmed}`);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const prefix = label ? `${label}: ` : '';
    pushClaim(claims, seen, `${prefix}${String(value)}`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (claims.length >= MAX_CLAIMS) return;
      collectClaims(item, label, claims, seen, depth + 1);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    if (claims.length >= MAX_CLAIMS) return;
    if (SKIPPED_KEYS.has(key)) return;
    const childLabel = humanizeKey(key);
    collectClaims(childValue, childLabel, claims, seen, depth + 1);
  });
};

const resolveStructuredData = (content: GeneratedContentDocument): JsonRecord => {
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const structuredContent = isRecord(metadata.structuredContent) ? metadata.structuredContent : {};
  const structuredData = structuredContent.data;

  if (isRecord(structuredData)) {
    return structuredData;
  }

  return isRecord(content.generated_content) ? content.generated_content : {};
};

const resolveLibraryEntityType = (content: GeneratedContentDocument): EntityType | null => {
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const structuredContent = isRecord(metadata.structuredContent) ? metadata.structuredContent : {};
  const candidates = [
    ensureString(structuredContent.type).toLowerCase(),
    ensureString(metadata.deliverable).toLowerCase(),
    ensureString(content.content_type).toLowerCase(),
  ].filter((value) => value.length > 0);

  for (const candidate of candidates) {
    for (const [alias, entityType] of TYPE_ALIASES) {
      if (candidate === alias || candidate.includes(alias)) {
        return entityType;
      }
    }
  }

  return null;
};

const resolveCanonicalName = (content: GeneratedContentDocument, sourceData: JsonRecord): string => {
  const preferredKeys = ['name', 'title', 'canonical_name'];
  for (const key of preferredKeys) {
    const value = ensureString(sourceData[key]);
    if (value) return value;
  }
  return ensureString(content.title) || 'Generated Content';
};

const buildTags = (content: GeneratedContentDocument, entityType: EntityType, projectId: string): string[] => {
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const deliverable = ensureString(metadata.deliverable).toLowerCase();
  const values = [
    'generated',
    'project-content',
    entityType,
    `project-${projectId}`,
    deliverable,
  ].filter((value) => value.length > 0);

  return Array.from(new Set(values));
};

export function createProjectContentLibraryDraft(
  content: GeneratedContentDocument,
  projectId: string,
): ProjectContentLibraryDraft | ProjectContentLibraryUnsupported {
  const entityType = resolveLibraryEntityType(content);
  const sourceData = resolveStructuredData(content);
  const canonicalName = resolveCanonicalName(content, sourceData);

  if (!entityType) {
    return {
      canonicalName,
      contentId: content._id,
      reason: 'This content type cannot be promoted to the canon library yet.',
    };
  }

  const rawClaims: string[] = [];
  collectClaims(sourceData, '', rawClaims, new Set<string>(), 0);

  if (rawClaims.length === 0) {
    rawClaims.push(`Generated project content titled \"${canonicalName}\" was added to the canon library.`);
  }

  const sourceLabel = `project:${projectId}:generated:${content._id}`;
  const claims: Claim[] = rawClaims.slice(0, MAX_CLAIMS).map((text) => ({
    text,
    source: sourceLabel,
  }));

  return {
    canonicalName,
    claims,
    contentId: content._id,
    entityId: generateLibraryEntityId(entityType, canonicalName),
    entityType,
    sourceData,
    sourceLabel,
    tags: buildTags(content, entityType, projectId),
  };
}
