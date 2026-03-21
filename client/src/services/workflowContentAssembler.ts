import { mergeNpcStages, type NpcMergeResult } from '../utils/npcStageMerger';
import type {
  GenerationRunState,
  WorkflowCanonSummary,
  WorkflowConflictItem,
  WorkflowConflictSummary,
} from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getObject(source: JsonRecord | null | undefined, key: string): JsonRecord | undefined {
  if (!source) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function getStageObject(source: StageResults | null | undefined, key: string): JsonRecord | undefined {
  if (!source) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

function getFirstStageObject(source: StageResults | null | undefined, keys: string[]): JsonRecord | undefined {
  for (const key of keys) {
    const value = getStageObject(source, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function hasAnyStageObject(source: JsonRecord | null | undefined, keys: string[]): boolean {
  if (!source) return false;
  return keys.some((key) => isRecord(source[key]));
}

function getEmbeddedObject(source: JsonRecord | null | undefined, key: string, nestedKey: string): JsonRecord | undefined {
  const parent = getObject(source, key);
  if (!parent) return undefined;
  return getObject(parent, nestedKey);
}

const LOCATION_PURPOSE_STAGE_KEYS = ['location.purpose', 'purpose'];
const LOCATION_FOUNDATION_STAGE_KEYS = ['location.foundation', 'foundation'];
const LOCATION_SPACE_STAGE_KEYS = ['location.spaces', 'spaces'];
const LOCATION_DETAIL_STAGE_KEYS = ['location.details', 'details'];
const LOCATION_ACCURACY_STAGE_KEYS = ['location.accuracy_refinement', 'accuracy_refinement'];
const LOCATION_STAGE_KEYS = [
  ...LOCATION_PURPOSE_STAGE_KEYS,
  ...LOCATION_FOUNDATION_STAGE_KEYS,
  ...LOCATION_SPACE_STAGE_KEYS,
  ...LOCATION_DETAIL_STAGE_KEYS,
  ...LOCATION_ACCURACY_STAGE_KEYS,
];
const MONSTER_BASIC_INFO_STAGE_KEYS = ['monster.basic_info', 'monster_basic_info', 'basic_info'];
const MONSTER_STATS_STAGE_KEYS = ['monster.stats', 'monster_stats', 'stats_&_defenses'];
const MONSTER_COMBAT_STAGE_KEYS = ['monster.combat', 'monster_combat', 'combat_&_abilities'];
const MONSTER_LEGENDARY_STAGE_KEYS = ['monster.legendary', 'monster_legendary', 'legendary_&_lair'];
const MONSTER_LORE_STAGE_KEYS = ['monster.lore', 'monster_lore', 'ecology_&_lore'];
const MONSTER_STAGE_KEYS = [
  ...MONSTER_BASIC_INFO_STAGE_KEYS,
  ...MONSTER_STATS_STAGE_KEYS,
  ...MONSTER_COMBAT_STAGE_KEYS,
  ...MONSTER_LEGENDARY_STAGE_KEYS,
  ...MONSTER_LORE_STAGE_KEYS,
];
const WRITING_WORKFLOW_TYPES = [
  'nonfiction',
  'outline',
  'chapter',
  'memoir',
  'journal_entry',
  'diet_log_entry',
  'other_writing',
];
const FINALIZER_BACKED_WORKFLOW_TYPES = [
  'unknown',
  'scene',
  'adventure',
  ...WRITING_WORKFLOW_TYPES,
];
const SHARED_PIPELINE_RESTORE_WORKFLOW_TYPES = [
  'item',
  'encounter',
  'story_arc',
  'location',
  'monster',
  ...FINALIZER_BACKED_WORKFLOW_TYPES,
];
const FINALIZER_BACKED_STAGE_KEYS = ['finalizer', 'editor_&_style', 'draft', 'physics_validator', 'stylist', 'creator'];

function sanitizeMonsterMergedContent(content: JsonRecord): JsonRecord {
  const sanitized: JsonRecord = { ...content };

  const normalizeSignedValueArray = (value: unknown) =>
    Array.isArray(value)
      ? value.map((entry) => {
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const rawValue = record.value;
          const normalizedValue =
            typeof rawValue === 'number'
              ? (rawValue >= 0 ? `+${rawValue}` : `${rawValue}`)
              : rawValue == null
                ? undefined
                : String(rawValue);

          return {
            ...record,
            value: normalizedValue,
            notes: undefined,
          };
        }
        return entry;
      })
      : value;

  sanitized.saving_throws = normalizeSignedValueArray(sanitized.saving_throws);
  sanitized.skill_proficiencies = normalizeSignedValueArray(sanitized.skill_proficiencies);

  return sanitized;
}

function normalizeNpcMergedContent(content: JsonRecord): JsonRecord {
  const normalized: JsonRecord = { ...content };
  const species = typeof normalized.species === 'string' ? normalized.species.trim() : '';
  const race = typeof normalized.race === 'string' ? normalized.race.trim() : '';
  const normalizeNamedArray = (value: unknown): JsonRecord[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          return text ? { name: text } as JsonRecord : null;
        }
        if (!isRecord(entry)) return null;
        const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : typeof entry.title === 'string' ? entry.title.trim() : '';
        if (!name) return null;
        return { ...entry, name } as JsonRecord;
      })
      .filter((entry): entry is JsonRecord => entry !== null);
  };
  const extractNames = (value: unknown): string[] => normalizeNamedArray(value)
    .map((entry) => (typeof entry.name === 'string' ? entry.name : ''))
    .filter((entry) => entry.length > 0);
  const extractHitDice = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      return value.match(/\b(\d+d\d+)\b/i)?.[1];
    }
    if (!isRecord(value)) return undefined;
    const formula = typeof value.formula === 'string' ? value.formula.trim() : '';
    return formula.match(/\b(\d+d\d+)\b/i)?.[1];
  };
  const normalizeCombatArray = (value: unknown, activationType: 'action' | 'bonus_action' | 'reaction'): JsonRecord[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          return text ? { name: text.slice(0, 80) || 'Feature', description: text, activationType } as JsonRecord : null;
        }
        if (!isRecord(entry)) return null;
        const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : typeof entry.title === 'string' ? entry.title.trim() : '';
        const description = typeof entry.description === 'string' && entry.description.trim().length > 0 ? entry.description.trim() : typeof entry.text === 'string' ? entry.text.trim() : typeof entry.effect === 'string' ? entry.effect.trim() : '';
        if (!name && !description) return null;
        return { ...entry, name: name || 'Feature', description: description || 'Details unavailable.', activationType: typeof entry.activationType === 'string' && entry.activationType.trim().length > 0 ? entry.activationType.trim() : activationType } as JsonRecord;
      })
      .filter((entry): entry is JsonRecord => entry !== null);
  };

  if (species && !race) {
    normalized.race = species;
  }

  if (race && !species) {
    normalized.species = race;
  }

  normalized.actions = normalizeCombatArray(normalized.actions, 'action');
  normalized.bonus_actions = normalizeCombatArray(normalized.bonus_actions, 'bonus_action');
  normalized.reactions = normalizeCombatArray(normalized.reactions, 'reaction');

  if (typeof normalized.hit_dice !== 'string' || normalized.hit_dice.trim().length === 0) {
    const derivedHitDice = extractHitDice(normalized.hit_points);
    if (derivedHitDice) {
      normalized.hit_dice = derivedHitDice;
    }
  }

  const groupedEquipment = [
    ...extractNames(normalized.weapons),
    ...extractNames(normalized.armor_and_shields),
    ...extractNames(normalized.wondrous_items),
    ...extractNames(normalized.consumables),
    ...extractNames(normalized.other_gear),
  ];
  if ((!Array.isArray(normalized.equipment) || normalized.equipment.length === 0) && groupedEquipment.length > 0) {
    normalized.equipment = groupedEquipment;
  }

  const groupedMagicItems = extractNames(normalized.wondrous_items);
  if ((!Array.isArray(normalized.magic_items) || normalized.magic_items.length === 0) && groupedMagicItems.length > 0) {
    normalized.magic_items = groupedMagicItems;
  }

  return normalized;
}

function mergeTopLevelMetadata(target: JsonRecord, source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in source) {
      target[key] = source[key];
    }
  }
}

export interface WorkflowContentAssemblyResult {
  content: JsonRecord;
  logLabel: string;
  logDetails?: JsonRecord;
  conflicts?: NpcMergeResult['conflicts'];
  warnings?: string[];
}

function matchDeliverable(value: string | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes('story arc') || lower.includes('story-arc') || lower.includes('story_arc') || lower.includes('plot arc')) {
    return 'story_arc';
  }
  if (lower.includes('npc') || lower.includes('character')) return 'npc';
  if (lower.includes('monster') || lower.includes('creature')) return 'monster';
  if (lower.includes('encounter') || lower.includes('combat')) return 'encounter';
  if (lower.includes('scene') || lower.includes('narrative')) return 'scene';
  if (lower.includes('item') || lower.includes('artifact') || lower.includes('treasure')) return 'item';
  if (lower.includes('adventure') || lower.includes('quest') || lower.includes('campaign')) return 'adventure';
  if (lower.includes('nonfiction') || lower.includes('non-fiction') || lower.includes('non fiction')) return 'nonfiction';
  if (lower.includes('location') || lower.includes('setting') || lower.includes('place')) return 'location';
  return null;
}

function asJsonRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getActiveWorkflowAttempt(runState: GenerationRunState | null | undefined) {
  if (!runState) {
    return null;
  }

  if (runState.currentAttemptId) {
    const currentAttempt = runState.attempts.find((attempt) => attempt.attemptId === runState.currentAttemptId);
    if (currentAttempt) {
      return currentAttempt;
    }
  }

  if (runState.currentStageKey) {
    const currentStageAttempt = [...runState.attempts].reverse().find((attempt) => attempt.stageKey === runState.currentStageKey);
    if (currentStageAttempt) {
      return currentStageAttempt;
    }
  }

  return runState.attempts.length > 0 ? runState.attempts[runState.attempts.length - 1] : null;
}

function getAuthoritativeWorkflowCanonSummary(runState: GenerationRunState | null | undefined): WorkflowCanonSummary | undefined {
  return runState?.memory?.canon ?? getActiveWorkflowAttempt(runState)?.canon;
}

function getAuthoritativeWorkflowConflictSummary(runState: GenerationRunState | null | undefined): WorkflowConflictSummary | undefined {
  return runState?.memory?.conflicts ?? getActiveWorkflowAttempt(runState)?.conflicts;
}

function getAuthoritativeWorkflowAcceptanceState(runState: GenerationRunState | null | undefined): GenerationRunState['acceptanceState'] {
  return runState?.acceptanceState ?? getActiveWorkflowAttempt(runState)?.acceptanceState;
}

function formatWorkflowAcceptanceState(value: NonNullable<GenerationRunState['acceptanceState']>): string {
  return value.replace(/_/g, ' ');
}

function getWorkflowConflictType(status: WorkflowConflictItem['status']): string {
  if (status === 'conflicting') return 'canon_conflict';
  if (status === 'ambiguous') return 'canon_ambiguity';
  if (status === 'additive_unverified') return 'canon_addition';
  if (status === 'unsupported_ungrounded') return 'ungrounded_claim';
  return 'canon_alignment';
}

function getWorkflowConflictSeverity(item: WorkflowConflictItem): string | undefined {
  if (typeof item.severity === 'string' && item.severity.trim().length > 0) {
    return item.severity;
  }
  if (item.status === 'conflicting') return 'high';
  if (item.status === 'ambiguous') return 'medium';
  if (item.status === 'unsupported_ungrounded') return 'medium';
  if (item.status === 'additive_unverified') return 'low';
  return undefined;
}

function getWorkflowConflictRecommendedAction(status: WorkflowConflictItem['status']): string | undefined {
  if (status === 'conflicting') {
    return 'Compare the proposed claim against canon and choose which version should persist.';
  }
  if (status === 'ambiguous') {
    return 'Clarify the ambiguous claim before finalizing or promoting it into canon.';
  }
  if (status === 'additive_unverified') {
    return 'Review this additive claim before accepting it as a canon update.';
  }
  if (status === 'unsupported_ungrounded') {
    return 'Treat this claim as ungrounded until canon support is added or confirmed.';
  }
  return undefined;
}

function mapWorkflowConflictItemToDisplayRecord(item: WorkflowConflictItem): JsonRecord {
  const summary = typeof item.message === 'string' && item.message.trim().length > 0
    ? item.message.trim()
    : item.key;
  const details = [
    typeof item.fieldPath === 'string' && item.fieldPath.trim().length > 0 ? `Field: ${item.fieldPath}.` : null,
    typeof item.currentValue === 'string' && item.currentValue.trim().length > 0 ? `Existing: ${item.currentValue}.` : null,
    typeof item.proposedValue === 'string' && item.proposedValue.trim().length > 0 ? `Proposed: ${item.proposedValue}.` : null,
  ].filter((value): value is string => value !== null).join(' ');

  return {
    key: item.key,
    status: item.status,
    summary,
    details: details || summary,
    reason: summary,
    field_path: item.fieldPath,
    entity_name: item.key,
    existing_claim: item.currentValue,
    new_claim: item.proposedValue,
    severity: getWorkflowConflictSeverity(item),
    conflict_type: getWorkflowConflictType(item.status),
    recommended_action: getWorkflowConflictRecommendedAction(item.status),
  };
}

function getAuthoritativeWorkflowConflictRecords(runState: GenerationRunState | null | undefined): JsonRecord[] {
  const conflictSummary = getAuthoritativeWorkflowConflictSummary(runState);
  return conflictSummary ? conflictSummary.items.map((item) => mapWorkflowConflictItemToDisplayRecord(item)) : [];
}

function buildAuthoritativeWorkflowValidationNotes(runState: GenerationRunState | null | undefined): string | undefined {
  const acceptanceState = getAuthoritativeWorkflowAcceptanceState(runState);
  const canon = getAuthoritativeWorkflowCanonSummary(runState);
  const conflicts = getAuthoritativeWorkflowConflictSummary(runState);

  if (!acceptanceState && !canon && !conflicts) {
    return undefined;
  }

  const notes: string[] = [];
  if (acceptanceState) {
    notes.push(`Acceptance state: ${formatWorkflowAcceptanceState(acceptanceState)}.`);
  }

  if (canon) {
    const entityPreview = canon.entityNames.length > 0
      ? ` across ${canon.entityNames.slice(0, 3).join(', ')}${canon.entityNames.length > 3 ? ', …' : ''}`
      : '';
    notes.push(`Canon grounding: ${canon.groundingStatus} with ${canon.factCount} facts${entityPreview}.`);
    if (canon.gaps.length > 0) {
      notes.push(`Known canon gaps: ${canon.gaps.slice(0, 2).join('; ')}${canon.gaps.length > 2 ? '; …' : ''}.`);
    }
  }

  if (conflicts) {
    const counts = [
      conflicts.conflictCount > 0 ? `${conflicts.conflictCount} conflicting` : null,
      conflicts.ambiguityCount > 0 ? `${conflicts.ambiguityCount} ambiguous` : null,
      conflicts.additiveCount > 0 ? `${conflicts.additiveCount} additive` : null,
      conflicts.unsupportedCount > 0 ? `${conflicts.unsupportedCount} unsupported` : null,
    ].filter((value): value is string => value !== null);

    if (counts.length > 0) {
      notes.push(`Conflict summary: ${counts.join(', ')}.${conflicts.reviewRequired ? ' Review required.' : ''}`);
    } else if (conflicts.reviewRequired) {
      notes.push('Review required due to authoritative workflow conflict memory.');
    }
  }

  return notes.join(' ');
}

export function inferWorkflowDeliverableType(
  data: JsonRecord,
  fallback: string,
): string {
  const direct = matchDeliverable(typeof data.deliverable === 'string' ? data.deliverable : undefined);
  if (direct) return direct;

  const typeHint = matchDeliverable(typeof data.type === 'string' ? data.type : undefined);
  if (typeHint) return typeHint;

  const draft = isRecord(data.draft) ? (data.draft as JsonRecord) : undefined;
  if (draft) {
    const draftDeliverable = matchDeliverable(typeof draft.deliverable === 'string' ? draft.deliverable : undefined);
    if (draftDeliverable) return draftDeliverable;

    if (isRecord(draft.story_arc) || isRecord(draft.storyArc)) return 'story_arc';
    if (isRecord(draft.npc)) return 'npc';
    if (isRecord(draft.monster)) return 'monster';
    if (isRecord(draft.encounter) || isRecord(draft.encounter_details)) return 'encounter';
    if (isRecord(draft.item)) return 'item';
    if (isRecord(draft.scene)) return 'scene';
  }

  if (isRecord(data.story_arc) || isRecord(data.storyArc) || isRecord(data.arc)) return 'story_arc';
  if (isRecord(data.npc)) return 'npc';
  if (isRecord(data.monster)) return 'monster';
  if (isRecord(data.encounter) || isRecord(data.encounter_details)) return 'encounter';
  if (isRecord(data.item)) return 'item';
  if (isRecord(data.location) || isRecord(data.setting)) return 'location';

  return fallback;
}

export function buildFinalWorkflowOutput(input: {
  baseContent: JsonRecord;
  stageResults: StageResults;
  workflowType: string;
  fallbackType: string;
  proposals: unknown[];
  ruleBase?: string;
  workflowRunState?: GenerationRunState | null;
}): JsonRecord {
  const inferredDeliverable = inferWorkflowDeliverableType(input.baseContent, input.fallbackType);
  const canonValidator = getStageObject(input.stageResults, 'canon_validator');
  const physicsValidator = getStageObject(input.stageResults, 'physics_validator');
  const stageConflicts = asJsonRecordArray(canonValidator?.conflicts);
  const authoritativeConflicts = getAuthoritativeWorkflowConflictRecords(input.workflowRunState);
  const stageValidationNotes = typeof canonValidator?.validation_notes === 'string' && canonValidator.validation_notes.trim().length > 0
    ? canonValidator.validation_notes
    : undefined;

  return {
    ...input.baseContent,
    proposals: input.proposals,
    rule_base: input.baseContent.rule_base ?? input.ruleBase,
    deliverable: inferredDeliverable,
    fact_check_report: WRITING_WORKFLOW_TYPES.includes(input.workflowType)
      ? (getStageObject(input.stageResults, 'editor_&_style') || {})
      : (getStageObject(input.stageResults, 'fact_checker') || {}),
    conflicts: stageConflicts.length > 0 ? stageConflicts : authoritativeConflicts,
    canon_alignment_score: canonValidator?.canon_alignment_score,
    validation_notes: stageValidationNotes ?? buildAuthoritativeWorkflowValidationNotes(input.workflowRunState),
    physics_issues: asJsonRecordArray(physicsValidator?.physics_issues),
    logic_score: physicsValidator?.logic_score,
    balance_notes: physicsValidator?.balance_notes,
    _pipeline_stages: input.stageResults,
  };
}

export function buildHomebrewFinalOutput(input: {
  mergedContent: JsonRecord;
  fileName?: string;
  totalChunks: number;
}): JsonRecord {
  const fileName = input.fileName || 'Homebrew Content';
  return {
    ...input.mergedContent,
    deliverable: 'homebrew',
    type: 'homebrew',
    document_title: fileName,
    fileName,
    content_type: 'homebrew',
    total_chunks: input.totalChunks,
  };
}

export function resolveCompletedWorkflowOutput(input: {
  workflowType: string;
  stageResults: StageResults;
  fallbackType: string;
  ruleBase?: string;
  workflowRunState?: GenerationRunState | null;
}): JsonRecord {
  if (input.workflowType === 'homebrew') {
    const merged = getStageObject(input.stageResults, 'merged');
    return merged || {};
  }

  const assembled = assembleFinalWorkflowContent(input.workflowType, input.stageResults);
  if (Object.keys(assembled.content).length === 0) {
    return {};
  }

  const rawProposals = Array.isArray(assembled.content.proposals) ? assembled.content.proposals : [];
  return buildFinalWorkflowOutput({
    baseContent: assembled.content,
    stageResults: input.stageResults,
    workflowType: input.workflowType,
    fallbackType: input.fallbackType,
    proposals: rawProposals,
    ruleBase: input.ruleBase,
    workflowRunState: input.workflowRunState,
  });
}

export function assembleFinalWorkflowContent(
  workflowType: string | undefined | null,
  stageResults: StageResults,
): WorkflowContentAssemblyResult {
  if (workflowType === 'item') {
    const concept = getFirstStageObject(stageResults, ['item.concept', 'item_concept', 'concept']) || {};
    const mechanics = getFirstStageObject(stageResults, ['item.mechanics', 'item_mechanics', 'mechanics']) || {};
    const lore = getFirstStageObject(stageResults, ['item.lore', 'item_lore', 'lore']) || {};
    const merged = {
      ...concept,
      ...mechanics,
      ...lore,
      deliverable: 'item',
      type: 'item',
    };

    return {
      content: merged,
      logLabel: 'Item: merged concept, mechanics, and lore stages',
      logDetails: {
        hasConcept: Object.keys(concept).length > 0,
        hasMechanics: Object.keys(mechanics).length > 0,
        hasLore: Object.keys(lore).length > 0,
        totalFields: Object.keys(merged).length,
      },
    };
  }

  if (workflowType === 'encounter') {
    const concept = getFirstStageObject(stageResults, ['encounter.concept', 'encounter_concept', 'concept']) || {};
    const enemies = getFirstStageObject(stageResults, ['encounter.enemies', 'encounter_enemies', 'enemies']) || {};
    const terrain = getFirstStageObject(stageResults, ['encounter.terrain', 'encounter_terrain', 'terrain']) || {};
    const tactics = getFirstStageObject(stageResults, ['encounter.tactics', 'encounter_tactics', 'tactics']) || {};
    const rewards = getFirstStageObject(stageResults, ['encounter.rewards', 'encounter_rewards', 'rewards']) || {};
    const merged = {
      ...concept,
      ...enemies,
      ...terrain,
      ...tactics,
      ...rewards,
      deliverable: 'encounter',
      type: 'encounter',
    };

    return {
      content: merged,
      logLabel: 'Encounter: merged concept, enemies, terrain, tactics, and rewards stages',
      logDetails: {
        hasConcept: Object.keys(concept).length > 0,
        hasEnemies: Object.keys(enemies).length > 0,
        hasTerrain: Object.keys(terrain).length > 0,
        hasTactics: Object.keys(tactics).length > 0,
        hasRewards: Object.keys(rewards).length > 0,
        totalFields: Object.keys(merged).length,
      },
    };
  }

  if (workflowType === 'monster') {
    const merged = sanitizeMonsterMergedContent({
      ...(getFirstStageObject(stageResults, MONSTER_BASIC_INFO_STAGE_KEYS) || {}),
      ...(getFirstStageObject(stageResults, MONSTER_STATS_STAGE_KEYS) || {}),
      ...(getFirstStageObject(stageResults, MONSTER_COMBAT_STAGE_KEYS) || {}),
      ...(getFirstStageObject(stageResults, MONSTER_LEGENDARY_STAGE_KEYS) || {}),
      ...(getFirstStageObject(stageResults, MONSTER_LORE_STAGE_KEYS) || {}),
      deliverable: 'monster',
    });

    return {
      content: merged,
      logLabel: 'Monster: merged all 5 stage results',
    };
  }

  if (workflowType === 'location') {
    const purpose = getFirstStageObject(stageResults, LOCATION_PURPOSE_STAGE_KEYS) || {};
    const foundation = getFirstStageObject(stageResults, LOCATION_FOUNDATION_STAGE_KEYS) || {};
    const details = getFirstStageObject(stageResults, LOCATION_DETAIL_STAGE_KEYS) || {};
    const accuracyRefinement = getFirstStageObject(stageResults, LOCATION_ACCURACY_STAGE_KEYS) || {};
    const spaces = getFirstStageObject(stageResults, LOCATION_SPACE_STAGE_KEYS);

    const content = {
      ...purpose,
      ...foundation,
      spaces,
      ...details,
      ...accuracyRefinement,
      deliverable: 'location',
    };

    return {
      content,
      logLabel: 'Location: merged all location stage results',
      logDetails: {
        hasPurpose: Boolean(getFirstStageObject(stageResults, LOCATION_PURPOSE_STAGE_KEYS)),
        hasFoundation: Boolean(getFirstStageObject(stageResults, LOCATION_FOUNDATION_STAGE_KEYS)),
        hasSpaces: Boolean(spaces),
        spacesCount: Array.isArray(spaces?.spaces) ? spaces.spaces.length : 0,
        hasDetails: Boolean(getFirstStageObject(stageResults, LOCATION_DETAIL_STAGE_KEYS)),
        hasAccuracyRefinement: Boolean(getFirstStageObject(stageResults, LOCATION_ACCURACY_STAGE_KEYS)),
        totalFields: Object.keys(content).length,
      },
    };
  }

  if (workflowType === 'npc') {
    const mergeResult = mergeNpcStages(stageResults);
    const normalized = normalizeNpcMergedContent(mergeResult.merged);
    return {
      content: normalized,
      logLabel: 'NPC: intelligently merged creator stage results',
      logDetails: {
        totalFields: Object.keys(normalized).length,
        conflicts: mergeResult.conflicts.length,
        warnings: mergeResult.warnings,
      },
      conflicts: mergeResult.conflicts,
      warnings: mergeResult.warnings,
    };
  }

  if (workflowType && WRITING_WORKFLOW_TYPES.includes(workflowType)) {
    const finalizer = getStageObject(stageResults, 'finalizer');
    if (finalizer) {
      return {
        content: finalizer,
        logLabel: 'Using content from finalizer',
      };
    }

    const editorStyle = getStageObject(stageResults, 'editor_&_style');
    if (editorStyle) {
      return {
        content: editorStyle,
        logLabel: 'Using content from editor_&_style',
      };
    }

    const draft = getStageObject(stageResults, 'draft');
    if (draft) {
      return {
        content: draft,
        logLabel: 'Using content from draft',
      };
    }
  }

  if (workflowType === 'story_arc') {
    const premise = getFirstStageObject(stageResults, ['story_arc.premise', 'story_arc_premise', 'premise']) || {};
    const structure = getFirstStageObject(stageResults, ['story_arc.structure', 'story_arc_structure', 'structure']) || {};
    const characters = getFirstStageObject(stageResults, ['story_arc.characters', 'story_arc_characters', 'characters']) || {};
    const secrets = getFirstStageObject(stageResults, ['story_arc.secrets', 'story_arc_secrets', 'secrets']) || {};
    const merged = {
      ...premise,
      ...structure,
      ...characters,
      ...secrets,
      deliverable: 'story_arc',
      type: 'story_arc',
    };

    return {
      content: merged,
      logLabel: 'Story Arc: merged premise, structure, characters, and secrets stages',
      logDetails: {
        hasPremise: Object.keys(premise).length > 0,
        hasStructure: Object.keys(structure).length > 0,
        hasCharacters: Object.keys(characters).length > 0,
        hasSecrets: Object.keys(secrets).length > 0,
        totalFields: Object.keys(merged).length,
      },
    };
  }

  if (workflowType && FINALIZER_BACKED_WORKFLOW_TYPES.includes(workflowType)) {
    const finalizer = getStageObject(stageResults, 'finalizer');
    if (finalizer) {
      return {
        content: finalizer,
        logLabel: 'Using content from finalizer',
      };
    }
  }

  const physicsValidator = getStageObject(stageResults, 'physics_validator');
  const physicsContent = getEmbeddedObject(physicsValidator, 'content', 'content');
  if (physicsContent) {
    return {
      content: physicsContent,
      logLabel: 'Using content from physics_validator.content.content',
    };
  }

  const stylist = getStageObject(stageResults, 'stylist');
  if (stylist) {
    return {
      content: stylist,
      logLabel: 'Using content from stylist',
    };
  }

  const creator = getStageObject(stageResults, 'creator');
  if (creator) {
    return {
      content: creator,
      logLabel: 'Using content from creator',
    };
  }

  return {
    content: {},
    logLabel: 'No content found in stage results',
    logDetails: { stageKeys: Object.keys(stageResults) },
  };
}

export interface RestoredUploadContentResult {
  content: JsonRecord;
  logLabel?: string;
  logDetails?: JsonRecord;
  conflicts?: NpcMergeResult['conflicts'];
  warnings?: string[];
}

export function restoreUploadedWorkflowContent(
  parsed: JsonRecord,
  uploadedContentType: string,
): RestoredUploadContentResult {
  let contentToUse: JsonRecord = parsed;
  let result: RestoredUploadContentResult = { content: parsed };

  const maybePipelineStages = isRecord(parsed._pipeline_stages)
    ? (parsed._pipeline_stages as StageResults)
    : null;

  if (
    maybePipelineStages
    && (parsed.deliverable === 'npc' || parsed.type === 'npc')
  ) {
    const mergeResult = mergeNpcStages(maybePipelineStages);
    contentToUse = normalizeNpcMergedContent(mergeResult.merged);
    mergeTopLevelMetadata(contentToUse, parsed, [
      'deliverable',
      'title',
      'type',
      'fact_check_report',
      'conflicts',
      'physics_issues',
    ]);
    result = {
      content: contentToUse,
      logLabel: 'Detected NPC with multi-stage creator structure, using intelligent merger',
      logDetails: {
        totalFields: Object.keys(contentToUse).length,
        conflicts: mergeResult.conflicts.length,
        warnings: mergeResult.warnings,
      },
      conflicts: mergeResult.conflicts,
      warnings: mergeResult.warnings,
    };
  } else if (maybePipelineStages) {
    if (SHARED_PIPELINE_RESTORE_WORKFLOW_TYPES.includes(uploadedContentType)) {
      const assembled = assembleFinalWorkflowContent(uploadedContentType, maybePipelineStages);
      if (Object.keys(assembled.content).length > 0) {
        contentToUse = assembled.content;
        mergeTopLevelMetadata(contentToUse, parsed, [
          'deliverable',
          'type',
          'title',
          'document_title',
          'fact_check_report',
          'conflicts',
          'physics_issues',
          'logic_score',
          'balance_notes',
          'canon_alignment_score',
          'validation_notes',
          'proposals',
        ]);
        result = {
          content: contentToUse,
          logLabel: `${assembled.logLabel}; restored from saved pipeline stages`,
          logDetails: assembled.logDetails,
        };
      }
    }

    const pipelineStages = maybePipelineStages as JsonRecord;
    const physicsValidatorStage = getObject(pipelineStages, 'physics_validator');
    const physicsContent = getEmbeddedObject(physicsValidatorStage, 'content', 'content');

    if (physicsContent && result.content === parsed) {
      contentToUse = physicsContent;
      mergeTopLevelMetadata(contentToUse, parsed, [
        'deliverable',
        'fact_check_report',
        'conflicts',
        'physics_issues',
        'logic_score',
        'balance_notes',
        'canon_alignment_score',
        'validation_notes',
        'proposals',
      ]);
      result = {
        content: contentToUse,
        logLabel: 'Detected saved generation output, extracting content from physics_validator',
      };
    }
  }

  if (FINALIZER_BACKED_WORKFLOW_TYPES.includes(uploadedContentType) && contentToUse === parsed && hasAnyStageObject(contentToUse, FINALIZER_BACKED_STAGE_KEYS)) {
    const assembled = assembleFinalWorkflowContent(uploadedContentType, contentToUse as StageResults);
    if (Object.keys(assembled.content).length > 0) {
      result = {
        ...result,
        content: assembled.content,
        logLabel: result.logLabel
          ? `${result.logLabel}; flattened ${uploadedContentType} stage structure`
          : assembled.logLabel,
      };
    }
  }

  if (uploadedContentType === 'monster' && contentToUse === parsed && hasAnyStageObject(contentToUse, MONSTER_STAGE_KEYS)) {
    const flattened = sanitizeMonsterMergedContent({
      ...contentToUse,
      ...(getFirstStageObject(contentToUse as StageResults, MONSTER_BASIC_INFO_STAGE_KEYS) || {}),
      ...(getFirstStageObject(contentToUse as StageResults, MONSTER_STATS_STAGE_KEYS) || {}),
      ...(getFirstStageObject(contentToUse as StageResults, MONSTER_COMBAT_STAGE_KEYS) || {}),
      ...(getFirstStageObject(contentToUse as StageResults, MONSTER_LEGENDARY_STAGE_KEYS) || {}),
      ...(getFirstStageObject(contentToUse as StageResults, MONSTER_LORE_STAGE_KEYS) || {}),
    });

    for (const key of MONSTER_STAGE_KEYS) {
      delete flattened[key];
    }

    result = {
      ...result,
      content: flattened,
      logLabel: result.logLabel
        ? `${result.logLabel}; flattened monster stage structure`
        : 'Detected monster with stage structure, flattening',
    };
  }

  if (uploadedContentType === 'item' && contentToUse === parsed && hasAnyStageObject(contentToUse, ['item.concept', 'item_concept', 'concept', 'item.mechanics', 'item_mechanics', 'mechanics', 'item.lore', 'item_lore', 'lore'])) {
    const assembled = assembleFinalWorkflowContent('item', contentToUse as StageResults);
    if (Object.keys(assembled.content).length > 0) {
      result = {
        ...result,
        content: assembled.content,
        logLabel: result.logLabel
          ? `${result.logLabel}; flattened item stage structure`
          : assembled.logLabel,
        logDetails: assembled.logDetails,
      };
    }
  }

  if (uploadedContentType === 'encounter' && contentToUse === parsed && hasAnyStageObject(contentToUse, ['encounter.concept', 'encounter_concept', 'concept', 'encounter.enemies', 'encounter_enemies', 'enemies', 'encounter.terrain', 'encounter_terrain', 'terrain', 'encounter.tactics', 'encounter_tactics', 'tactics', 'encounter.rewards', 'encounter_rewards', 'rewards'])) {
    const assembled = assembleFinalWorkflowContent('encounter', contentToUse as StageResults);
    if (Object.keys(assembled.content).length > 0) {
      result = {
        ...result,
        content: assembled.content,
        logLabel: result.logLabel
          ? `${result.logLabel}; flattened encounter stage structure`
          : assembled.logLabel,
        logDetails: assembled.logDetails,
      };
    }
  }

  if (uploadedContentType === 'story_arc' && contentToUse === parsed && hasAnyStageObject(contentToUse, ['story_arc.premise', 'story_arc_premise', 'premise', 'story_arc.structure', 'story_arc_structure', 'structure', 'story_arc.characters', 'story_arc_characters', 'characters', 'story_arc.secrets', 'story_arc_secrets', 'secrets'])) {
    const assembled = assembleFinalWorkflowContent('story_arc', contentToUse as StageResults);
    if (Object.keys(assembled.content).length > 0) {
      result = {
        ...result,
        content: assembled.content,
        logLabel: result.logLabel
          ? `${result.logLabel}; flattened story arc stage structure`
          : assembled.logLabel,
        logDetails: assembled.logDetails,
      };
    }
  }

  if (uploadedContentType === 'location' && contentToUse === parsed && hasAnyStageObject(contentToUse, LOCATION_STAGE_KEYS)) {
    const assembled = assembleFinalWorkflowContent('location', contentToUse as StageResults);
    if (Object.keys(assembled.content).length > 0) {
      result = {
        ...result,
        content: assembled.content,
        logLabel: result.logLabel
          ? `${result.logLabel}; flattened location stage structure`
          : assembled.logLabel,
        logDetails: assembled.logDetails,
      };
    }
  }

  return result;
}


