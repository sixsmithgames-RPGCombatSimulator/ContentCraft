import {
  buildWorkflowStagePrompt,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';
import { buildRequestBlueprint, extractNpcRequestFacts } from '../utils/requestBlueprint';

type JsonRecord = Record<string, unknown>;

type CharacterBuildFeatureField =
  | 'class_features'
  | 'subclass_features'
  | 'racial_features'
  | 'feats'
  | 'fighting_styles';

type CharacterBuildModifierField = 'skill_proficiencies' | 'saving_throws';

const CHARACTER_BUILD_BATCH_SIZE = 4;
const CHARACTER_BUILD_FEATURE_FIELDS: readonly CharacterBuildFeatureField[] = [
  'class_features',
  'subclass_features',
  'racial_features',
  'feats',
  'fighting_styles',
] as const;
const CHARACTER_BUILD_MODIFIER_FIELDS: readonly CharacterBuildModifierField[] = [
  'skill_proficiencies',
  'saving_throws',
] as const;
const FEATURE_METADATA_KEYS = [
  'level',
  'source',
  'subclass',
  'prerequisite',
  'uses',
  'recharge',
  'notes',
  'origin',
  'sourceSection',
  'knowledgeSource',
  'activationType',
] as const;

export const CHARACTER_BUILD_INVENTORY_STAGE_KEY = 'character_build_feature_inventory';
export const CHARACTER_BUILD_ENRICHMENT_STAGE_KEY = 'character_build_feature_enrichment';
export const CHARACTER_BUILD_INVENTORY_STATE_KEY = 'creator:_character_build_inventory_state';
export const CHARACTER_BUILD_ENRICHED_BATCHES_STATE_KEY = 'creator:_character_build_enriched_batches_state';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'\".,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnorableFeatureName(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized === 'none'
    || normalized === 'n a'
    || normalized === 'not applicable'
    || normalized === 'no fighting style'
    || normalized === 'no fighting styles';
}

function collapseAdjacentDuplicateTokens(tokens: string[]): string[] {
  return tokens.filter((token, index) => token.length > 0 && token !== tokens[index - 1]);
}

function buildFeatureMatchKey(name: string): string {
  const withoutParentheticals = name.replace(/\([^)]*\)/g, ' ');
  const normalized = normalizeComparableText(withoutParentheticals);
  const tokens = collapseAdjacentDuplicateTokens(normalized.split(/\s+/).filter(Boolean));
  return tokens.join(' ');
}

function getFeatureMatchTokens(name: string): string[] {
  return buildFeatureMatchKey(name).split(/\s+/).filter(Boolean);
}

function areFeatureNamesEquivalent(left: string, right: string): boolean {
  const leftKey = buildFeatureMatchKey(left);
  const rightKey = buildFeatureMatchKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey === rightKey) {
    return true;
  }

  const leftTokens = getFeatureMatchTokens(left);
  const rightTokens = getFeatureMatchTokens(right);
  const shorterTokens = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longerKey = leftTokens.length <= rightTokens.length ? rightKey : leftKey;

  if (shorterTokens.length >= 3 && longerKey.includes(shorterTokens.join(' '))) {
    return true;
  }

  const rightTokenSet = new Set(rightTokens);
  const overlapCount = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  const minTokenCount = Math.min(leftTokens.length, rightTokens.length);

  return minTokenCount >= 3 && overlapCount >= minTokenCount;
}

function isPlaceholderDescription(name: string, description: string): boolean {
  return normalizeComparableText(name) === normalizeComparableText(description);
}

function isGenericSubclassSelectionName(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized === 'subclass'
    || normalized.endsWith(' subclass')
    || normalized.includes('subclass choice')
    || normalized === 'arcane tradition'
    || normalized === 'arcane school';
}

function isGenericSubclassFeatureAggregateName(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized === 'subclass feature'
    || normalized === 'class feature'
    || normalized.includes('subclass feature')
    || normalized.includes('arcane tradition feature')
    || normalized.includes('arcane school feature')
    || normalized.includes('school feature');
}

function isSpecificSubclassChoiceName(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized.startsWith('school of ')
    || normalized.startsWith('oath of ')
    || normalized.startsWith('circle of ')
    || normalized.startsWith('college of ')
    || normalized.startsWith('path of ')
    || normalized.startsWith('way of ')
    || normalized.startsWith('order of ')
    || normalized.startsWith('conclave of ')
    || normalized.startsWith('patron of ')
    || normalized.startsWith('draconic ')
    || normalized.includes('arcane tradition ')
    || normalized.includes('school of ');
}

function isGenericFeatMarker(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized === 'feat'
    || normalized === 'bonus feat'
    || normalized === 'variant human feat'
    || normalized === 'feat variant human';
}

function isGenericSkillProficiencyMarker(name: string): boolean {
  const normalized = normalizeComparableText(name);
  return normalized === 'skill proficiency'
    || normalized === 'skill proficiency choice';
}

function normalizeFeatureEntries(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name);
      if (!name || isIgnorableFeatureName(name)) {
        return null;
      }

      const normalized: JsonRecord = { name };
      const description = coerceNonEmptyString(entry.description);
      if (description) {
        normalized.description = description;
      }

      for (const key of FEATURE_METADATA_KEYS) {
        const stringValue = coerceNonEmptyString(entry[key]);
        if (stringValue) {
          normalized[key] = stringValue;
          continue;
        }

        if (key === 'level') {
          const level = coerceFiniteNumber(entry.level);
          if (level !== null) {
            normalized.level = level;
          }
        }
      }

      return normalized;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
}

function pruneRedundantInventoryFeatureEntries(input: {
  featuresByField: Partial<Record<CharacterBuildFeatureField, JsonRecord[]>>;
  hasConcreteSkillProficiencies: boolean;
}): Partial<Record<CharacterBuildFeatureField, JsonRecord[]>> {
  const subclassEntries = [
    ...(input.featuresByField.class_features ?? []),
    ...(input.featuresByField.subclass_features ?? []),
  ];
  const hasConcreteSubclassFeatures = (input.featuresByField.subclass_features ?? []).some((entry) => {
    const name = coerceNonEmptyString(entry.name);
    return Boolean(
      name
      && !isGenericSubclassSelectionName(name)
      && !isGenericSubclassFeatureAggregateName(name),
    );
  });
  const hasSpecificSubclassChoice = subclassEntries.some((entry) => {
    const name = coerceNonEmptyString(entry.name);
    return Boolean(name && isSpecificSubclassChoiceName(name));
  });
  const hasConcreteFeats = (input.featuresByField.feats ?? []).some((entry) => {
    const name = coerceNonEmptyString(entry.name);
    return Boolean(name && !isGenericFeatMarker(name));
  });

  const pruned: Partial<Record<CharacterBuildFeatureField, JsonRecord[]>> = {};

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const entries = input.featuresByField[field] ?? [];
    pruned[field] = entries.filter((entry) => {
      const name = coerceNonEmptyString(entry.name);
      if (!name) {
        return false;
      }

      if (
        field === 'class_features'
        && isGenericSubclassSelectionName(name)
        && (hasConcreteSubclassFeatures || hasSpecificSubclassChoice)
      ) {
        return false;
      }

      if (
        (field === 'class_features' || field === 'subclass_features')
        && isGenericSubclassFeatureAggregateName(name)
        && (hasConcreteSubclassFeatures || hasSpecificSubclassChoice)
      ) {
        return false;
      }

      if (field === 'racial_features' && isGenericFeatMarker(name) && hasConcreteFeats) {
        return false;
      }

      if (
        field === 'racial_features'
        && isGenericSkillProficiencyMarker(name)
        && input.hasConcreteSkillProficiencies
      ) {
        return false;
      }

      return true;
    });
  }

  return pruned;
}

function normalizeModifierEntries(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name);
      const valueText = coerceNonEmptyString(entry.value);
      if (!name || !valueText) {
        return null;
      }

      const normalized: JsonRecord = {
        name,
        value: valueText,
      };

      const notes = coerceNonEmptyString(entry.notes);
      if (notes) {
        normalized.notes = notes;
      }

      return normalized;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
}

function getCharacterBuildBasePayload(context: StageContext): Record<string, unknown> {
  const basicInfo = isRecord(context.stageResults['creator:_basic_info'])
    ? context.stageResults['creator:_basic_info']
    : null;
  const stats = isRecord(context.stageResults['creator:_stats'])
    ? context.stageResults['creator:_stats']
    : null;
  const requestFacts = extractNpcRequestFacts(context.config.prompt);

  return {
    species: basicInfo?.species || basicInfo?.race || requestFacts.species || requestFacts.race,
    background: basicInfo?.background || requestFacts.background,
    class_levels: basicInfo?.class_levels || requestFacts.class_levels,
    ability_scores: stats?.ability_scores || requestFacts.ability_scores,
    proficiency_bonus: stats?.proficiency_bonus,
    request_blueprint: buildRequestBlueprint(context.config.prompt, context.config.type, context.config.flags),
  };
}

function stripFeatureDescriptions(entries: JsonRecord[]): JsonRecord[] {
  return entries.map((entry) => {
    const { description, ...rest } = entry;
    void description;
    return rest;
  });
}

function getInventoryStateFromStageResults(stageResults: Record<string, Record<string, unknown>>): JsonRecord | null {
  const value = stageResults[CHARACTER_BUILD_INVENTORY_STATE_KEY];
  return isRecord(value) ? value : null;
}

function getFeatureBatchesFromInventoryState(inventoryState: JsonRecord | null): JsonRecord[] {
  if (!inventoryState || !Array.isArray(inventoryState.feature_batches)) {
    return [];
  }

  return inventoryState.feature_batches.filter(isRecord);
}

function getBatchFeatureNames(batch: JsonRecord): string[] {
  if (!Array.isArray(batch.feature_names)) {
    return [];
  }

  return batch.feature_names.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function featureNameLookupKey(name: string): string {
  return normalizeComparableText(name);
}

type EnrichedFeatureCandidate = {
  field: CharacterBuildFeatureField;
  entry: JsonRecord;
};

function getConcreteDescriptionScore(name: string, entry: JsonRecord): number {
  const description = coerceNonEmptyString(entry.description);
  if (!description || isPlaceholderDescription(name, description)) {
    return 0;
  }

  return description.length;
}

function collectEnrichedFeatureCandidates(enrichedBatches: JsonRecord[]): Map<string, EnrichedFeatureCandidate[]> {
  const candidatesByName = new Map<string, EnrichedFeatureCandidate[]>();

  for (const batch of enrichedBatches) {
    for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
      for (const entry of normalizeFeatureEntries(batch[field])) {
        const name = coerceNonEmptyString(entry.name);
        if (!name) {
          continue;
        }

        const lookupKey = featureNameLookupKey(name);
        const existing = candidatesByName.get(lookupKey) ?? [];
        existing.push({ field, entry });
        candidatesByName.set(lookupKey, existing);
      }
    }
  }

  return candidatesByName;
}

function findEnrichedFeatureCandidates(
  inventoryName: string,
  candidatesByName: Map<string, EnrichedFeatureCandidate[]>,
): EnrichedFeatureCandidate[] {
  const exactCandidates = candidatesByName.get(featureNameLookupKey(inventoryName));
  if (exactCandidates && exactCandidates.length > 0) {
    return exactCandidates;
  }

  const matched: EnrichedFeatureCandidate[] = [];
  for (const candidates of candidatesByName.values()) {
    for (const candidate of candidates) {
      const candidateName = coerceNonEmptyString(candidate.entry.name);
      if (candidateName && areFeatureNamesEquivalent(inventoryName, candidateName)) {
        matched.push(candidate);
      }
    }
  }

  if (matched.length === 0 && isGenericSubclassSelectionName(inventoryName)) {
    for (const candidates of candidatesByName.values()) {
      for (const candidate of candidates) {
        const candidateName = coerceNonEmptyString(candidate.entry.name);
        if (candidateName && isSpecificSubclassChoiceName(candidateName)) {
          matched.push(candidate);
        }
      }
    }
  }

  return matched;
}

function extractFeatureNamesFromIssueText(value: string): string[] {
  return value
    .split(/;\s*/)
    .map((segment) => {
      const match = segment.match(/\]\s+(.+?)\s+(?:was not returned in the enrichment pass|is missing a concrete description)\.?$/i);
      return match?.[1]?.trim() ?? null;
    })
    .filter((name): name is string => Boolean(name));
}

function selectBestEnrichedFeatureCandidate(input: {
  inventoryField: CharacterBuildFeatureField;
  inventoryEntry: JsonRecord;
  candidates: EnrichedFeatureCandidate[];
}): EnrichedFeatureCandidate | null {
  const inventoryName = coerceNonEmptyString(input.inventoryEntry.name);
  if (!inventoryName || input.candidates.length === 0) {
    return null;
  }

  const scored = input.candidates
    .map((candidate, index) => {
      let score = getConcreteDescriptionScore(inventoryName, candidate.entry);
      const candidateName = coerceNonEmptyString(candidate.entry.name);

      // Prefer candidates that kept the same category, but allow concrete
      // descriptions from a different bucket to recover miscategorized inventory.
      if (candidate.field === input.inventoryField) {
        score += 200;
      }

      // Generic subclass selectors can be satisfied by a specific subclass choice.
      if (
        candidateName
        && isGenericSubclassSelectionName(inventoryName)
        && isSpecificSubclassChoiceName(candidateName)
      ) {
        score += 300;
      }

      return {
        candidate,
        index,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      // Prefer later candidates when scores tie so corrected retries win.
      return right.index - left.index;
    });

  return scored[0]?.candidate ?? null;
}

/**
 * Returns the initial chunk plan for the Character Build stage.
 *
 * `totalChunks` is a minimum estimate (1 inventory + 1 enrichment).
 * After the inventory pass completes, ManualGenerator recalculates the
 * real total as `featureBatchCount + 1` and overrides the chunking state.
 */
export function buildCharacterBuildChunkPlan(): {
  shouldChunk: boolean;
  totalChunks: number;
  chunkSize: number;
  labelPrefix: string;
} {
  return {
    shouldChunk: true,
    totalChunks: 2,
    chunkSize: 1,
    labelPrefix: 'Phase',
  };
}

export function resolveCharacterBuildExecutionStageKey(context: StageContext): string {
  if (!context.chunkInfo?.isChunked || context.chunkInfo.currentChunk <= 1) {
    return CHARACTER_BUILD_INVENTORY_STAGE_KEY;
  }

  return getInventoryStateFromStageResults(context.stageResults)
    ? CHARACTER_BUILD_ENRICHMENT_STAGE_KEY
    : CHARACTER_BUILD_INVENTORY_STAGE_KEY;
}

export function getCharacterBuildSystemPrompt(stageKey: string): string {
  if (stageKey === CHARACTER_BUILD_ENRICHMENT_STAGE_KEY) {
    return [
      'Return only valid JSON matching the requested feature-batch contract.',
      'You are enriching a supplied NPC character-build feature batch, not discovering new features.',
      'Treat feature_batch as authoritative. Return the same features in the same categories and preserve any provided metadata.',
      'Your response must contain ONLY these five keys: class_features, subclass_features, racial_features, feats, fighting_styles.',
      'Do NOT include skill_proficiencies or saving_throws — those are handled separately by the inventory pass.',
      'For each returned feature, write a concrete mechanical description explaining what it does, when it applies, and any notable limits, benefits, or triggers.',
      'Do not repeat the feature name as the description.',
      'Do not add extra features, do not drop requested features, and use empty arrays for categories that are not in the current batch.',
      'If relevant_canon explicitly describes a feature, align to it instead of contradicting it. If canon is silent, stay rules-consistent and do not invent unsupported world facts.',
    ].join(' ');
  }

  return [
    'Return only valid JSON matching the requested character-build inventory contract.',
    'Identify the authoritative list of class_features, subclass_features, racial_features, feats, fighting_styles, skill_proficiencies, and saving_throws for the supplied NPC build context.',
    'For feature arrays, focus on identification and provenance. Return objects with at least name, plus any supported level, source, subclass, prerequisite, uses, or notes metadata.',
    'Do not fabricate setting canon. Use empty arrays when a category does not apply.',
    'For skill_proficiencies and saving_throws, return signed modifiers such as +7 or -1 instead of placeholders.',
  ].join(' ');
}

function buildCharacterBuildInventoryPrompt(context: StageContext): string {
  return buildWorkflowStagePrompt({
    context,
    deliverable: 'npc',
    stage: CHARACTER_BUILD_INVENTORY_STAGE_KEY,
    payload: getCharacterBuildBasePayload(context),
    plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Review them for class features, racial traits, feats, and background details.',
  });
}

function buildCharacterBuildEnrichmentPrompt(context: StageContext): string {
  const inventoryState = getInventoryStateFromStageResults(context.stageResults);
  const featureBatches = getFeatureBatchesFromInventoryState(inventoryState);
  const batchIndex = Math.max(0, (context.chunkInfo?.currentChunk ?? 2) - 2);
  const currentBatch = featureBatches[batchIndex] ?? {
    batch_index: batchIndex,
    batch_label: `Feature Batch ${batchIndex + 1}`,
    feature_names: [],
    class_features: [],
    subclass_features: [],
    racial_features: [],
    feats: [],
    fighting_styles: [],
  };

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'npc',
    stage: CHARACTER_BUILD_ENRICHMENT_STAGE_KEY,
    payload: {
      ...getCharacterBuildBasePayload(context),
      feature_batch: currentBatch,
      feature_batch_index: batchIndex + 1,
      feature_batch_total: featureBatches.length,
      feature_names: getBatchFeatureNames(currentBatch),
    },
    plannerReferenceMessage: 'Canon facts were provided in the Planner stage. Compare them against each requested feature and keep the enrichment canon-consistent.',
  });
}

export function buildCharacterBuildStagePrompt(context: StageContext): string {
  const stageKey = resolveCharacterBuildExecutionStageKey(context);
  return stageKey === CHARACTER_BUILD_ENRICHMENT_STAGE_KEY
    ? buildCharacterBuildEnrichmentPrompt(context)
    : buildCharacterBuildInventoryPrompt(context);
}

export function buildCharacterBuildInventoryState(payload: JsonRecord): JsonRecord {
  const inventory: JsonRecord = {};
  const normalizedFeaturesByField: Partial<Record<CharacterBuildFeatureField, JsonRecord[]>> = {};

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    normalizedFeaturesByField[field] = normalizeFeatureEntries(payload[field]);
  }

  const normalizedSkillProficiencies = normalizeModifierEntries(payload.skill_proficiencies);
  const prunedFeaturesByField = pruneRedundantInventoryFeatureEntries({
    featuresByField: normalizedFeaturesByField,
    hasConcreteSkillProficiencies: normalizedSkillProficiencies.length > 0,
  });
  const flattenedFeatures: Array<{ field: CharacterBuildFeatureField; entry: JsonRecord }> = [];

  for (const field of CHARACTER_BUILD_MODIFIER_FIELDS) {
    inventory[field] = field === 'skill_proficiencies'
      ? normalizedSkillProficiencies
      : normalizeModifierEntries(payload[field]);
  }

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const entries = prunedFeaturesByField[field] ?? [];
    inventory[field] = entries;
    for (const entry of stripFeatureDescriptions(entries)) {
      flattenedFeatures.push({ field, entry });
    }
  }

  const featureBatches: JsonRecord[] = [];
  for (let index = 0; index < flattenedFeatures.length; index += CHARACTER_BUILD_BATCH_SIZE) {
    const batchFeatures = flattenedFeatures.slice(index, index + CHARACTER_BUILD_BATCH_SIZE);
    const batch: JsonRecord = {
      batch_index: featureBatches.length,
      batch_label: `Feature Batch ${featureBatches.length + 1}`,
      feature_names: batchFeatures.map(({ entry }) => entry.name),
      class_features: [],
      subclass_features: [],
      racial_features: [],
      feats: [],
      fighting_styles: [],
    };

    for (const { field, entry } of batchFeatures) {
      (batch[field] as JsonRecord[]).push(entry);
    }

    featureBatches.push(batch);
  }

  return {
    ...inventory,
    feature_batches: featureBatches,
    total_feature_count: flattenedFeatures.length,
  };
}

export function getCharacterBuildFeatureBatchCount(inventoryState: JsonRecord | null): number {
  return getFeatureBatchesFromInventoryState(inventoryState).length;
}

export function readCharacterBuildInventoryState(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

export function readCharacterBuildEnrichedBatchesState(value: unknown): JsonRecord[] {
  if (!isRecord(value) || !Array.isArray(value.batches)) {
    return [];
  }

  return value.batches.filter(isRecord);
}

export function createCharacterBuildEnrichedBatchesState(batches: JsonRecord[]): JsonRecord {
  return { batches };
}

export function finalizeCharacterBuildPayload(
  inventoryState: JsonRecord,
  enrichedBatches: JsonRecord[],
): { ok: true; payload: JsonRecord } | { ok: false; error: string } {
  const issues: string[] = [];
  const payload: JsonRecord = {
    class_features: [],
    subclass_features: [],
    racial_features: [],
    feats: [],
    fighting_styles: [],
    skill_proficiencies: normalizeModifierEntries(inventoryState.skill_proficiencies),
    saving_throws: normalizeModifierEntries(inventoryState.saving_throws),
  };
  const enrichedCandidatesByName = collectEnrichedFeatureCandidates(enrichedBatches);

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const inventoryEntries = normalizeFeatureEntries(inventoryState[field]);
    for (const [index, entry] of inventoryEntries.entries()) {
      const name = entry.name as string;
      const candidates = findEnrichedFeatureCandidates(name, enrichedCandidatesByName);
      const enriched = selectBestEnrichedFeatureCandidate({
        inventoryField: field,
        inventoryEntry: entry,
        candidates,
      });

      if (!enriched) {
        issues.push(`${field}[${index}] ${name} was not returned in the enrichment pass.`);
        continue;
      }

      const description = coerceNonEmptyString(enriched.entry.description);
      if (!description || isPlaceholderDescription(name, description)) {
        issues.push(`${field}[${index}] ${name} is missing a concrete description.`);
        continue;
      }

      (payload[enriched.field] as JsonRecord[]).push({
        ...entry,
        ...enriched.entry,
        name,
        description,
      } satisfies JsonRecord);
    }
  }

  if (issues.length > 0) {
    return { ok: false, error: issues.join('; ') };
  }

  return { ok: true, payload };
}

export function resolveCharacterBuildRetryPlan(input: {
  inventoryState: JsonRecord | null;
  enrichedBatches: JsonRecord[];
  issuesToAddress: string[];
}): { retryBatchIndex: number; retainedBatches: JsonRecord[] } | null {
  const featureBatches = getFeatureBatchesFromInventoryState(input.inventoryState);
  if (featureBatches.length === 0) {
    return null;
  }

  const issueFeatureNames = input.issuesToAddress
    .flatMap((issue) => extractFeatureNamesFromIssueText(issue))
    .filter((name, index, values) => values.indexOf(name) === index);

  if (issueFeatureNames.length === 0) {
    return null;
  }

  for (const [batchIndex, batch] of featureBatches.entries()) {
    const batchFeatureNames = getBatchFeatureNames(batch);
    const hasRetryTarget = issueFeatureNames.some((issueName) =>
      batchFeatureNames.some((batchFeatureName) => areFeatureNamesEquivalent(issueName, batchFeatureName)));

    if (hasRetryTarget) {
      return {
        retryBatchIndex: batchIndex,
        retainedBatches: input.enrichedBatches.slice(0, batchIndex),
      };
    }
  }

  return null;
}

export function isCharacterBuildInternalStageKey(stageKey: string | null | undefined): boolean {
  return stageKey === CHARACTER_BUILD_INVENTORY_STAGE_KEY || stageKey === CHARACTER_BUILD_ENRICHMENT_STAGE_KEY;
}
