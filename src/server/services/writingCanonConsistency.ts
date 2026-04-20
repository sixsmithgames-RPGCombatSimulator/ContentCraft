import type { ContentBlock } from '../../shared/types/index.js';
import { ContentType } from '../../shared/types/index.js';
import type { CanonEntity } from '../models/CanonEntity.js';
import type {
  WritingCanonBlockReport,
  WritingCanonFinding,
  WritingCanonFindingStatus,
  WritingCanonProjectReport,
} from '../../shared/canon/writingCanon.js';
import type { RetrievalGroundingStatus } from '../../shared/generation/workflowTypes.js';

const WRITING_TOKENS = [
  'chapter',
  'outline',
  'foreword',
  'prologue',
  'epilogue',
  'scene',
  'section',
  'journal',
  'diary',
  'memoir',
  'log',
  'diet',
  'entry',
  'manuscript',
  'draft',
];

const ALIGNMENTS = [
  'lawful good',
  'neutral good',
  'chaotic good',
  'lawful neutral',
  'true neutral',
  'neutral',
  'chaotic neutral',
  'lawful evil',
  'neutral evil',
  'chaotic evil',
] as const;

const NUMERIC_ATTRIBUTE_KEYS = new Set([
  'age',
  'level',
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]);

const ATTRIBUTE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'their',
  'they',
  'this',
  'to',
  'with',
]);

const ATTRIBUTE_LABELS: Record<string, string> = {
  age: 'age',
  alignment: 'alignment',
  background: 'background',
  born_in: 'birthplace',
  charisma: 'charisma',
  class: 'class',
  constitution: 'constitution',
  dexterity: 'dexterity',
  eyes: 'eyes',
  hair: 'hair',
  height: 'height',
  intelligence: 'intelligence',
  race: 'race',
  skin: 'skin',
  strength: 'strength',
  subrace: 'subrace',
  weight: 'weight',
  wisdom: 'wisdom',
};

type ExtractedAttribute = {
  key: string;
  label: string;
  value: string;
  normalizedValue: string;
  snippet: string;
};

type PreparedEntity = {
  id: string;
  name: string;
  searchNames: string[];
  attributes: ExtractedAttribute[];
  claims: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeAttributeValue = (value: string): string =>
  normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/["'`]/g, '')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/\s+/g, ' '),
  );

const tokenSet = (value: string): Set<string> => {
  const tokens = normalizeAttributeValue(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !ATTRIBUTE_STOPWORDS.has(token));
  return new Set(tokens);
};

const numbersFrom = (value: string): string[] => {
  const matches = value.match(/\d+/g);
  return matches ? matches.map((match) => match.trim()).filter(Boolean) : [];
};

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    result.push(normalized);
  }
  return result;
};

const getAttributeLabel = (key: string): string => ATTRIBUTE_LABELS[key] ?? key.replace(/_/g, ' ');

export function isWritingContentBlock(block: ContentBlock): boolean {
  const metadata = isRecord(block.metadata) ? block.metadata : {};
  const domain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() : '';
  const deliverable = typeof metadata.deliverable === 'string' ? metadata.deliverable.toLowerCase() : '';
  const structured = isRecord(metadata.structuredContent) ? metadata.structuredContent : null;
  const structuredType = typeof structured?.type === 'string' ? structured.type : '';

  if (domain === 'writing') return true;
  if (domain === 'rpg') return false;
  if (structuredType && structuredType !== 'writing') return false;
  if (deliverable && WRITING_TOKENS.some((token) => deliverable.includes(token))) return true;

  return (
    block.type === ContentType.TEXT ||
    block.type === ContentType.OUTLINE ||
    block.type === ContentType.CHAPTER ||
    block.type === ContentType.SECTION ||
    block.type === ContentType.STORY_ARC
  );
}

function splitIntoSnippets(text: string): string[] {
  const compact = text.replace(/\r/g, '').trim();
  if (!compact) return [];

  const lines = compact
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const snippets: string[] = [];
  for (const line of lines) {
    if (line.length <= 220) {
      snippets.push(line);
      continue;
    }

    const sentenceParts = line
      .split(/(?<=[.!?;:])\s+/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);

    if (sentenceParts.length > 1) {
      snippets.push(...sentenceParts);
    } else {
      snippets.push(line);
    }
  }

  return uniqueStrings(snippets);
}

function pushAttribute(
  attributes: ExtractedAttribute[],
  key: string,
  value: string,
  snippet: string,
): void {
  const cleanedValue = normalizeWhitespace(value);
  const cleanedSnippet = normalizeWhitespace(snippet);
  if (!cleanedValue || !cleanedSnippet) return;
  attributes.push({
    key,
    label: getAttributeLabel(key),
    value: cleanedValue,
    normalizedValue: normalizeAttributeValue(cleanedValue),
    snippet: cleanedSnippet,
  });
}

function extractQuotedValue(snippet: string, key: string): string | null {
  const quotedPattern = new RegExp(`["']?${escapeRegExp(key)}["']?\\s*:\\s*"([^"]+)"`, 'i');
  const quotedMatch = snippet.match(quotedPattern);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const unquotedPattern = new RegExp(`["']?${escapeRegExp(key)}["']?\\s*:\\s*([^,;\\n}]+)`, 'i');
  const unquotedMatch = snippet.match(unquotedPattern);
  return unquotedMatch?.[1] ? unquotedMatch[1] : null;
}

function extractAttributes(text: string): ExtractedAttribute[] {
  const attributes: ExtractedAttribute[] = [];
  const snippets = splitIntoSnippets(text);

  for (const snippet of snippets) {
    const trimmed = snippet.trim();
    const lower = trimmed.toLowerCase();

    for (const key of ['background', 'alignment', 'race', 'subrace', 'height', 'weight', 'hair', 'eyes', 'skin']) {
      const extracted = extractQuotedValue(trimmed, key);
      if (extracted) pushAttribute(attributes, key, extracted, trimmed);
    }

    for (const key of ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'age', 'level']) {
      const extracted = extractQuotedValue(trimmed, key);
      if (extracted) pushAttribute(attributes, key, extracted, trimmed);
    }

    const classValue = extractQuotedValue(trimmed, 'class');
    if (classValue) pushAttribute(attributes, 'class', classValue, trimmed);

    const bornQuoted = extractQuotedValue(trimmed, 'born_in');
    if (bornQuoted) pushAttribute(attributes, 'born_in', bornQuoted, trimmed);

    const bornMatch = trimmed.match(/\bborn in\s+([^,.;]+(?:\s+of\s+[^,.;]+)?)/i);
    if (bornMatch?.[1]) pushAttribute(attributes, 'born_in', bornMatch[1], trimmed);

    // Only match "from" in birthplace-specific contexts (hails/comes/originates/traveled/arrived from)
    // Exclude generic usage like "from a perspective" or "from X to Y"
    const fromMatch = trimmed.match(/\b(?:hails?|comes?|came|originat(?:es?|ed)|travel(?:ed|s)?|arrived?)\s+from\s+([^,.;]+(?:\s+of\s+[^,.;]+)?)/i);
    if (fromMatch?.[1]) pushAttribute(attributes, 'born_in', fromMatch[1], trimmed);

    const ageMatch = trimmed.match(/\b(\d{1,3})\s*years?\s+old\b/i);
    if (ageMatch?.[1]) pushAttribute(attributes, 'age', ageMatch[1], trimmed);

    const levelClassMatch =
      trimmed.match(/\blevel\s+(\d{1,2})\s+([a-z][a-z -]{1,30})/i) ??
      trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+level\s+([a-z][a-z -]{1,30})/i);
    if (levelClassMatch?.[1]) pushAttribute(attributes, 'level', levelClassMatch[1], trimmed);
    if (levelClassMatch?.[2]) {
      const classText = levelClassMatch[2].split(/[,.;]/)[0]?.trim();
      if (classText) pushAttribute(attributes, 'class', classText, trimmed);
    }

    const alignmentMatch = ALIGNMENTS.find((alignment) => lower.includes(alignment));
    if (alignmentMatch) pushAttribute(attributes, 'alignment', alignmentMatch, trimmed);

    const descriptivePhrase = (subject: 'hair' | 'eyes' | 'skin'): RegExp =>
      new RegExp(`\\b(?:has|with)\\s+([a-z][a-z'-]*(?:[ ,'-]+[a-z][a-z'-]*){0,4})\\s+${subject}\\b`, 'i');

    const descriptiveFallback = (subject: 'hair' | 'eyes' | 'skin'): RegExp =>
      new RegExp(`\\b([a-z][a-z'-]*(?:[ ,'-]+[a-z][a-z'-]*){0,4})\\s+${subject}\\b`, 'i');

    const hairMatch = trimmed.match(descriptivePhrase('hair')) ?? trimmed.match(descriptiveFallback('hair'));
    if (hairMatch?.[1]) pushAttribute(attributes, 'hair', hairMatch[1], trimmed);

    const eyesMatch = trimmed.match(descriptivePhrase('eyes')) ?? trimmed.match(descriptiveFallback('eyes'));
    if (eyesMatch?.[1]) pushAttribute(attributes, 'eyes', eyesMatch[1], trimmed);

    const skinMatch = trimmed.match(descriptivePhrase('skin')) ?? trimmed.match(descriptiveFallback('skin'));
    if (skinMatch?.[1]) pushAttribute(attributes, 'skin', skinMatch[1], trimmed);

    for (const [key, pattern] of [
      ['strength', /\bstrength\b[^0-9]{0,8}(\d{1,2})/i],
      ['dexterity', /\bdexterity\b[^0-9]{0,8}(\d{1,2})/i],
      ['constitution', /\bconstitution\b[^0-9]{0,8}(\d{1,2})/i],
      ['intelligence', /\bintelligence\b[^0-9]{0,8}(\d{1,2})/i],
      ['wisdom', /\bwisdom\b[^0-9]{0,8}(\d{1,2})/i],
      ['charisma', /\bcharisma\b[^0-9]{0,8}(\d{1,2})/i],
    ] as const) {
      const match = trimmed.match(pattern);
      if (match?.[1]) pushAttribute(attributes, key, match[1], trimmed);
    }
  }

  const deduped = new Map<string, ExtractedAttribute>();
  for (const attribute of attributes) {
    const key = `${attribute.key}:${attribute.normalizedValue}:${attribute.snippet.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, attribute);
    }
  }

  return Array.from(deduped.values());
}

function buildAlignmentAxes(value: string): { lawChaos?: string; goodEvil?: string } {
  const normalized = normalizeAttributeValue(value);
  const axes: { lawChaos?: string; goodEvil?: string } = {};

  if (normalized.includes('lawful')) axes.lawChaos = 'lawful';
  else if (normalized.includes('chaotic')) axes.lawChaos = 'chaotic';
  else if (normalized.includes('neutral')) axes.lawChaos = 'neutral';

  if (normalized.includes('good')) axes.goodEvil = 'good';
  else if (normalized.includes('evil')) axes.goodEvil = 'evil';
  else if (normalized.includes('neutral')) axes.goodEvil = 'neutral';

  return axes;
}

function compareAttributeValues(
  attributeKey: string,
  draftValue: string,
  canonValue: string,
): { status: 'aligned' | 'ambiguous' | 'conflicting'; confidence: number } {
  const draftNormalized = normalizeAttributeValue(draftValue);
  const canonNormalized = normalizeAttributeValue(canonValue);

  if (!draftNormalized || !canonNormalized) {
    return { status: 'ambiguous', confidence: 0.45 };
  }

  if (draftNormalized === canonNormalized) {
    return { status: 'aligned', confidence: 0.98 };
  }

  if (attributeKey === 'alignment') {
    const draftAxes = buildAlignmentAxes(draftValue);
    const canonAxes = buildAlignmentAxes(canonValue);
    const lawConflict =
      draftAxes.lawChaos && canonAxes.lawChaos && draftAxes.lawChaos !== canonAxes.lawChaos;
    const moralConflict =
      draftAxes.goodEvil && canonAxes.goodEvil && draftAxes.goodEvil !== canonAxes.goodEvil;
    if (lawConflict || moralConflict) {
      return { status: 'conflicting', confidence: 0.92 };
    }
  }

  if (NUMERIC_ATTRIBUTE_KEYS.has(attributeKey)) {
    return { status: 'conflicting', confidence: 0.96 };
  }

  const draftNumbers = numbersFrom(draftValue);
  const canonNumbers = numbersFrom(canonValue);
  if (draftNumbers.length > 0 && canonNumbers.length > 0 && draftNumbers.join('|') !== canonNumbers.join('|')) {
    return { status: 'conflicting', confidence: 0.9 };
  }

  const draftTokens = tokenSet(draftValue);
  const canonTokens = tokenSet(canonValue);

  if (draftTokens.size === 0 || canonTokens.size === 0) {
    return { status: 'ambiguous', confidence: 0.4 };
  }

  const shared = Array.from(draftTokens).filter((token) => canonTokens.has(token));
  if (shared.length === 0) {
    return { status: 'conflicting', confidence: 0.84 };
  }

  const draftSubset = Array.from(draftTokens).every((token) => canonTokens.has(token));
  const canonSubset = Array.from(canonTokens).every((token) => draftTokens.has(token));
  if (draftSubset || canonSubset) {
    return { status: 'aligned', confidence: 0.78 };
  }

  const unionSize = new Set([...draftTokens, ...canonTokens]).size;
  const overlap = unionSize > 0 ? shared.length / unionSize : 0;
  if (overlap >= 0.6) {
    return { status: 'aligned', confidence: 0.7 };
  }

  if (overlap <= 0.2) {
    return { status: 'conflicting', confidence: 0.72 };
  }

  return { status: 'ambiguous', confidence: 0.55 };
}

function buildSuggestedAction(status: WritingCanonFindingStatus): string {
  switch (status) {
    case 'conflicting':
      return 'Revise the draft or update canon intentionally.';
    case 'ambiguous':
      return 'Clarify the draft wording against canon.';
    case 'additive_unverified':
      return 'Keep as draft-only or promote it into canon later.';
    case 'unsupported_ungrounded':
      return 'Link or add canon support before relying on this detail.';
    default:
      return 'Review this detail.';
  }
}

function severityForStatus(status: WritingCanonFindingStatus): 'low' | 'medium' | 'high' {
  switch (status) {
    case 'conflicting':
      return 'high';
    case 'ambiguous':
      return 'medium';
    case 'additive_unverified':
    case 'unsupported_ungrounded':
    default:
      return 'low';
  }
}

function buildFinding(
  entity: PreparedEntity,
  attribute: ExtractedAttribute,
  status: WritingCanonFindingStatus,
  confidence: number,
  canonClaim?: string,
): WritingCanonFinding {
  const label = attribute.label;
  const message =
    status === 'conflicting'
      ? `${entity.name} ${label} conflicts with canon.`
      : status === 'ambiguous'
        ? `${entity.name} ${label} may not match canon cleanly.`
        : status === 'unsupported_ungrounded'
          ? `${entity.name} ${label} is not grounded in linked canon.`
          : `${entity.name} ${label} adds a new canon detail.`;

  return {
    key: `${entity.id}:${status}:${attribute.key}:${attribute.normalizedValue}`,
    status,
    entityId: entity.id,
    entityName: entity.name,
    message,
    severity: severityForStatus(status),
    confidence: Number(confidence.toFixed(2)),
    attributeKey: attribute.key,
    draftText: attribute.snippet,
    canonClaim,
    suggestedAction: buildSuggestedAction(status),
  };
}

function hasEntityMention(text: string, searchNames: string[]): boolean {
  return searchNames.some((name) => {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    return pattern.test(text);
  });
}

function prepareEntities(entities: CanonEntity[]): PreparedEntity[] {
  return entities
    .map((entity) => {
      const searchNames = uniqueStrings([entity.canonical_name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])])
        .map((name) => normalizeWhitespace(name))
        .filter((name) => name.length > 0);

      return {
        id: entity._id,
        name: entity.canonical_name,
        searchNames,
        claims: Array.isArray(entity.claims)
          ? entity.claims
              .map((claim) => (typeof claim?.text === 'string' ? normalizeWhitespace(claim.text) : ''))
              .filter(Boolean)
          : [],
        attributes: extractAttributes(
          Array.isArray(entity.claims)
            ? entity.claims
                .map((claim) => (typeof claim?.text === 'string' ? claim.text : ''))
                .filter(Boolean)
                .join('\n')
            : '',
        ),
      };
    })
    .filter((entity) => entity.name && entity.searchNames.length > 0);
}

export function buildWritingCanonProjectReport(input: {
  projectId: string;
  blocks: ContentBlock[];
  entities: CanonEntity[];
  searchedScope: RetrievalGroundingStatus;
  warningMessage?: string;
}): WritingCanonProjectReport {
  const writingBlocks = input.blocks.filter((block) => isWritingContentBlock(block) && typeof block.content === 'string');
  const preparedEntities = prepareEntities(input.entities);
  const blockReports: WritingCanonBlockReport[] = [];
  const matchedEntityIds = new Set<string>();
  let totalAligned = 0;
  let totalAdditive = 0;
  let totalAmbiguous = 0;
  let totalConflicting = 0;
  let totalUnsupported = 0;
  let matchedBlockCount = 0;
  let flaggedBlockCount = 0;
  const updatedAt = Date.now();

  for (const block of writingBlocks) {
    const haystack = `${block.title}\n${block.content}`;
    const matchedEntities = preparedEntities.filter((entity) => hasEntityMention(haystack, entity.searchNames));
    if (matchedEntities.length === 0) {
      continue;
    }

    matchedBlockCount += 1;
    matchedEntities.forEach((entity) => matchedEntityIds.add(entity.id));

    const snippets = splitIntoSnippets(haystack);
    const relevantSnippets = uniqueStrings(
      snippets.filter((snippet) => matchedEntities.some((entity) => hasEntityMention(snippet, entity.searchNames))),
    );

    const reportItems = new Map<string, WritingCanonFinding>();
    let alignedCount = 0;
    let additiveCount = 0;
    let ambiguityCount = 0;
    let conflictCount = 0;
    let unsupportedCount = 0;

    for (const entity of matchedEntities) {
      const entitySnippets = relevantSnippets.filter((snippet) => hasEntityMention(snippet, entity.searchNames));
      const attributes = extractAttributes(entitySnippets.join('\n'));
      if (attributes.length === 0 && entity.claims.length === 0) {
        const fallbackFinding: WritingCanonFinding = {
          key: `${entity.id}:unsupported:entity`,
          status: 'unsupported_ungrounded',
          entityId: entity.id,
          entityName: entity.name,
          message: `${entity.name} is mentioned here, but there are no linked canon claims to verify against yet.`,
          severity: 'low',
          confidence: 0.5,
          draftText: entitySnippets[0] ?? block.title,
          suggestedAction: buildSuggestedAction('unsupported_ungrounded'),
        };
        reportItems.set(fallbackFinding.key, fallbackFinding);
        unsupportedCount += 1;
        continue;
      }

      for (const attribute of attributes) {
        const matchingCanonAttributes = entity.attributes.filter((candidate) => candidate.key === attribute.key);

        if (matchingCanonAttributes.length === 0) {
          const finding = buildFinding(entity, attribute, 'additive_unverified', 0.64);
          if (!reportItems.has(finding.key)) {
            reportItems.set(finding.key, finding);
            additiveCount += 1;
          }
          continue;
        }

        let bestStatus: 'aligned' | 'ambiguous' | 'conflicting' = 'ambiguous';
        let bestConfidence = 0;
        let bestCanonClaim: string | undefined;

        for (const canonAttribute of matchingCanonAttributes) {
          const comparison = compareAttributeValues(attribute.key, attribute.value, canonAttribute.value);
          if (comparison.status === 'aligned') {
            alignedCount += 1;
            bestStatus = 'aligned';
            bestConfidence = comparison.confidence;
            bestCanonClaim = canonAttribute.snippet;
            break;
          }

          const currentRank = bestStatus === 'conflicting' ? 2 : 1;
          const nextRank = comparison.status === 'conflicting' ? 2 : 1;
          if (nextRank > currentRank || comparison.confidence > bestConfidence) {
            bestStatus = comparison.status;
            bestConfidence = comparison.confidence;
            bestCanonClaim = canonAttribute.snippet;
          }
        }

        if (bestStatus === 'aligned') {
          continue;
        }

        const finding = buildFinding(
          entity,
          attribute,
          bestStatus === 'conflicting' ? 'conflicting' : 'ambiguous',
          bestConfidence || 0.5,
          bestCanonClaim,
        );

        if (!reportItems.has(finding.key)) {
          reportItems.set(finding.key, finding);
          if (finding.status === 'conflicting') conflictCount += 1;
          else ambiguityCount += 1;
        }
      }
    }

    if (reportItems.size > 0) {
      flaggedBlockCount += 1;
    }

    totalAligned += alignedCount;
    totalAdditive += additiveCount;
    totalAmbiguous += ambiguityCount;
    totalConflicting += conflictCount;
    totalUnsupported += unsupportedCount;

    blockReports.push({
      blockId: block.id,
      blockTitle: block.title,
      matchedEntityCount: matchedEntities.length,
      entityNames: uniqueStrings(matchedEntities.map((entity) => entity.name)),
      reviewRequired: conflictCount > 0 || ambiguityCount > 0,
      alignedCount,
      additiveCount,
      ambiguityCount,
      conflictCount,
      unsupportedCount,
      items: Array.from(reportItems.values()).sort((left, right) => {
        const severityRank = { high: 3, medium: 2, low: 1 };
        return severityRank[right.severity] - severityRank[left.severity];
      }),
      updatedAt,
    });
  }

  return {
    projectId: input.projectId,
    searchedScope: input.searchedScope,
    availableEntityCount: preparedEntities.length,
    warningMessage: input.warningMessage,
    summary: {
      reviewRequired: totalConflicting > 0 || totalAmbiguous > 0,
      scannedBlockCount: writingBlocks.length,
      matchedBlockCount,
      flaggedBlockCount,
      matchedEntityCount: matchedEntityIds.size,
      alignedCount: totalAligned,
      additiveCount: totalAdditive,
      ambiguityCount: totalAmbiguous,
      conflictCount: totalConflicting,
      unsupportedCount: totalUnsupported,
      updatedAt,
    },
    blocks: blockReports,
  };
}
