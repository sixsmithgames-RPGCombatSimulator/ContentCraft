import {
  buildWorkflowStagePrompt,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';

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

function isPlaceholderDescription(name: string, description: string): boolean {
  return normalizeComparableText(name) === normalizeComparableText(description);
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
      if (!name) {
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

  return {
    species: basicInfo?.species || basicInfo?.race,
    background: basicInfo?.background,
    class_levels: basicInfo?.class_levels,
    ability_scores: stats?.ability_scores,
    proficiency_bonus: stats?.proficiency_bonus,
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

function featureLookupKey(field: CharacterBuildFeatureField, name: string): string {
  return `${field}:${normalizeComparableText(name)}`;
}

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
  const flattenedFeatures: Array<{ field: CharacterBuildFeatureField; entry: JsonRecord }> = [];

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const entries = normalizeFeatureEntries(payload[field]);
    inventory[field] = entries;
    for (const entry of stripFeatureDescriptions(entries)) {
      flattenedFeatures.push({ field, entry });
    }
  }

  for (const field of CHARACTER_BUILD_MODIFIER_FIELDS) {
    inventory[field] = normalizeModifierEntries(payload[field]);
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
    skill_proficiencies: normalizeModifierEntries(inventoryState.skill_proficiencies),
    saving_throws: normalizeModifierEntries(inventoryState.saving_throws),
  };
  const expectedKeys = new Set<string>();
  const enrichedByKey = new Map<string, JsonRecord>();

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const inventoryEntries = normalizeFeatureEntries(inventoryState[field]);
    for (const entry of inventoryEntries) {
      expectedKeys.add(featureLookupKey(field, entry.name as string));
    }
  }

  for (const batch of enrichedBatches) {
    for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
      for (const entry of normalizeFeatureEntries(batch[field])) {
        enrichedByKey.set(featureLookupKey(field, entry.name as string), entry);
      }
    }
  }

  for (const field of CHARACTER_BUILD_FEATURE_FIELDS) {
    const inventoryEntries = normalizeFeatureEntries(inventoryState[field]);
    const finalizedEntries = inventoryEntries.map((entry, index) => {
      const name = entry.name as string;
      const lookupKey = featureLookupKey(field, name);
      const enriched = enrichedByKey.get(lookupKey);

      if (!enriched) {
        issues.push(`${field}[${index}] ${name} was not returned in the enrichment pass.`);
        return null;
      }

      const description = coerceNonEmptyString(enriched.description);
      if (!description || isPlaceholderDescription(name, description)) {
        issues.push(`${field}[${index}] ${name} is missing a concrete description.`);
      }

      return {
        ...entry,
        ...enriched,
        name,
        description,
      } satisfies JsonRecord;
    }).filter((entry) => entry !== null) as JsonRecord[];

    payload[field] = finalizedEntries;
  }

  for (const key of enrichedByKey.keys()) {
    if (!expectedKeys.has(key)) {
      issues.push(`Unexpected enriched feature returned: ${key}`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, error: issues.join('; ') };
  }

  return { ok: true, payload };
}

export function isCharacterBuildInternalStageKey(stageKey: string | null | undefined): boolean {
  return stageKey === CHARACTER_BUILD_INVENTORY_STAGE_KEY || stageKey === CHARACTER_BUILD_ENRICHMENT_STAGE_KEY;
}
