import {
  determineRequiredStages,
  getRoutingSummary,
  type RoutedNpcStageKey,
  type StageRoutingDecision,
} from '../config/npcStageRouter';
import {
  getWorkflowDefinition,
  getWorkflowStageDefinition,
  resolveWorkflowStageKey,
} from '../../../src/shared/generation/workflowRegistry';
import { resolveWorkflowContentType } from '../../../src/shared/generation/workflowContentType';
import type { SyncGenerationRunDefinitionInput } from '../../../src/shared/generation/workflowRunState';
import type { ExecutionMode, WorkflowContentType } from '../../../src/shared/generation/workflowTypes';

export interface GeneratorStage {
  name: string;
  routerKey?: string;
  workflowStageKey?: string;
  workflowStageLabel?: string;
  systemPrompt: string;
  buildUserPrompt: (context: any) => string;
  shouldChunk?: (context: any) => { shouldChunk: boolean; totalChunks: number; chunkSize: number };
  [key: string]: unknown;
}

export interface GeneratorStageCatalog {
  genericStages: GeneratorStage[];
  nonfictionStages: GeneratorStage[];
  npcStages: GeneratorStage[];
  npcStageRouterMap: Partial<Record<RoutedNpcStageKey, GeneratorStage>>;
  monsterStages: GeneratorStage[];
  encounterStages: GeneratorStage[];
  itemStages: GeneratorStage[];
  storyArcStages: GeneratorStage[];
  locationStages: GeneratorStage[];
}

export interface ResolvedStageIdentity {
  lookupKey: string;
  stageKey: string;
  stageLabel: string;
}

export interface ResolvedWorkflowSessionMetadata {
  workflowType: WorkflowContentType;
  workflowStageSequence: string[];
}

export interface NpcDynamicStagePlan {
  routingDecision: StageRoutingDecision;
  dynamicStages: GeneratorStage[];
  summary: string;
  skippedStageCount: number;
}

export interface NpcResolvedMechanicsHint {
  spellcasting?: { has_spellcasting?: boolean };
  combat?: { has_combat_actions?: boolean };
  legendary?: { has_legendary?: boolean };
}

type GeneratorStageCatalogListKey = Exclude<keyof GeneratorStageCatalog, 'npcStageRouterMap'>;

const LOCATION_MAP_STAGE_NAMES = new Set(['Spaces', 'Details', 'Accuracy Refinement']);
const NPC_PREFIX_STAGE_NAMES = ['Keyword Extractor', 'Planner'] as const;
const NPC_ROUTED_STAGE_ORDER: RoutedNpcStageKey[] = [
  'basicInfo',
  'coreDetails',
  'stats',
  'characterBuild',
  'combat',
  'spellcasting',
  'legendary',
  'relationships',
  'equipment',
];
const GENERATOR_STAGE_CATALOG_KEYS: Partial<Record<WorkflowContentType, GeneratorStageCatalogListKey>> = {
  nonfiction: 'nonfictionStages',
  outline: 'nonfictionStages',
  chapter: 'nonfictionStages',
  memoir: 'nonfictionStages',
  journal_entry: 'nonfictionStages',
  diet_log_entry: 'nonfictionStages',
  other_writing: 'nonfictionStages',
  monster: 'monsterStages',
  encounter: 'encounterStages',
  item: 'itemStages',
  story_arc: 'storyArcStages',
  location: 'locationStages',
};

function normalizeStageName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getFallbackStageByIndex(genericStages: GeneratorStage[]): GeneratorStage[] {
  return [genericStages[1], genericStages[2]].filter(
    (stage): stage is GeneratorStage => Boolean(stage),
  );
}

export function resolveWorkflowTypeFromConfigType(type: string | undefined | null): WorkflowContentType {
  return resolveWorkflowContentType(type);
}

export function getWorkflowLabel(workflowType: WorkflowContentType): string {
  return getWorkflowDefinition(workflowType)?.label ?? 'Content Generator';
}

export function getNpcPrefixStages(genericStages: GeneratorStage[]): GeneratorStage[] {
  const resolved = NPC_PREFIX_STAGE_NAMES
    .map((stageName) =>
      genericStages.find((stage) => normalizeStageName(stage.name) === normalizeStageName(stageName)),
    )
    .filter((stage): stage is GeneratorStage => Boolean(stage));

  return resolved.length === NPC_PREFIX_STAGE_NAMES.length ? resolved : getFallbackStageByIndex(genericStages);
}

export function getGeneratorStages(
  type: string | undefined | null,
  catalog: GeneratorStageCatalog,
  dynamicNpcStages?: GeneratorStage[] | null,
): GeneratorStage[] {
  const workflowType = resolveWorkflowTypeFromConfigType(type);

  if (workflowType === 'unknown') return catalog.genericStages;

  if (workflowType === 'npc') {
    if (dynamicNpcStages && dynamicNpcStages.length > 0) {
      return dynamicNpcStages;
    }
    return [...getNpcPrefixStages(catalog.genericStages), ...catalog.npcStages];
  }

  const catalogKey = GENERATOR_STAGE_CATALOG_KEYS[workflowType];
  if (catalogKey) {
    return catalog[catalogKey];
  }

  return catalog.genericStages;
}

export function buildNpcDynamicStagePlan(input: {
  basicInfoOutput: Record<string, unknown>;
  userPrompt: string;
  catalog: Pick<GeneratorStageCatalog, 'genericStages' | 'npcStages' | 'npcStageRouterMap'>;
  resolvedMechanics?: NpcResolvedMechanicsHint;
}): NpcDynamicStagePlan {
  const routingDecision = determineRequiredStages(
    input.basicInfoOutput,
    input.userPrompt,
    input.resolvedMechanics,
  );

  const dynamicStages: GeneratorStage[] = [
    ...getNpcPrefixStages(input.catalog.genericStages),
    input.catalog.npcStages[0],
  ];

  for (const stageKey of NPC_ROUTED_STAGE_ORDER) {
    if (stageKey === 'basicInfo') continue;

    if (!routingDecision[stageKey]?.required) {
      continue;
    }

    const stageConfig = input.catalog.npcStageRouterMap[stageKey];
    if (stageConfig) {
      dynamicStages.push(stageConfig);
    }
  }

  const includedNpcStageCount = NPC_ROUTED_STAGE_ORDER.filter(
    (stageKey) => routingDecision[stageKey]?.required,
  ).length;

  return {
    routingDecision,
    dynamicStages,
    summary: getRoutingSummary(routingDecision),
    skippedStageCount: Math.max(0, input.catalog.npcStages.length - includedNpcStageCount),
  };
}

export function shouldShowLocationMapForStage(
  type: string | undefined | null,
  currentStageIndex: number,
  stages: GeneratorStage[],
): boolean {
  if (type !== 'location') return false;
  const stageName = stages[currentStageIndex]?.name;
  return typeof stageName === 'string' && LOCATION_MAP_STAGE_NAMES.has(stageName);
}

export function resolveWorkflowStageIdentity(
  workflowType: WorkflowContentType,
  stage: GeneratorStage,
): ResolvedStageIdentity {
  const lookupKey =
    typeof stage.workflowStageKey === 'string' && stage.workflowStageKey.trim().length > 0
      ? stage.workflowStageKey
      : typeof stage.routerKey === 'string' && stage.routerKey.trim().length > 0
      ? stage.routerKey
      : stage.name;

  const stageKey =
    (typeof stage.workflowStageKey === 'string' && stage.workflowStageKey.trim().length > 0
      ? stage.workflowStageKey
      : null)
    || resolveWorkflowStageKey(workflowType, lookupKey)
    || resolveWorkflowStageKey(workflowType, stage.name)
    || lookupKey;
  const stageLabel =
    (typeof stage.workflowStageLabel === 'string' && stage.workflowStageLabel.trim().length > 0
      ? stage.workflowStageLabel
      : null)
    || getWorkflowStageDefinition(workflowType, stageKey)?.label
    || stage.name
    || stageKey;

  return {
    lookupKey,
    stageKey,
    stageLabel,
  };
}

export function getCurrentWorkflowStageIdentity(
  workflowType: WorkflowContentType,
  stage: GeneratorStage | null | undefined,
): ResolvedStageIdentity | null {
  if (!stage) return null;
  return resolveWorkflowStageIdentity(workflowType, stage);
}

export function resolveWorkflowSessionMetadata(input: {
  sessionWorkflowType?: WorkflowContentType | undefined;
  sessionConfigType?: string | undefined;
  currentConfigType?: string | undefined;
  sessionWorkflowStageSequence?: string[] | undefined;
  stages?: GeneratorStage[] | null;
}): ResolvedWorkflowSessionMetadata {
  const workflowType = resolveWorkflowTypeFromConfigType(
    (typeof input.sessionWorkflowType === 'string' && input.sessionWorkflowType)
      || (typeof input.sessionConfigType === 'string' && input.sessionConfigType)
      || input.currentConfigType,
  );
  const exactStageSequence =
    typeof input.sessionConfigType === 'string'
    && typeof input.currentConfigType === 'string'
    && input.sessionConfigType === input.currentConfigType
    && Array.isArray(input.stages)
    && input.stages.length > 0
      ? input.stages.map((stage) => resolveWorkflowStageIdentity(workflowType, stage).stageKey)
      : null;
  const fallbackStageSequence = getWorkflowDefinition(workflowType)?.stageKeys ?? [];
  const workflowStageSequence =
    exactStageSequence && exactStageSequence.length > 0
      ? exactStageSequence
      : Array.isArray(input.sessionWorkflowStageSequence) && input.sessionWorkflowStageSequence.length > 0
      ? [...input.sessionWorkflowStageSequence]
      : [...fallbackStageSequence];

  return {
    workflowType,
    workflowStageSequence,
  };
}

export function buildWorkflowRunDefinitionFromStages(input: {
  workflowType: WorkflowContentType;
  stages: GeneratorStage[];
  executionMode: ExecutionMode;
  projectId?: string;
}): SyncGenerationRunDefinitionInput {
  const workflowDefinition = getWorkflowDefinition(input.workflowType);
  const stageIdentities = input.stages.map((stage) =>
    resolveWorkflowStageIdentity(input.workflowType, stage),
  );

  return {
    workflowType: input.workflowType,
    workflowLabel: workflowDefinition?.label ?? getWorkflowLabel(input.workflowType),
    executionMode: input.executionMode,
    stageSequence: stageIdentities.map((stage) => stage.stageKey),
    stageLabels: Object.fromEntries(
      stageIdentities.map((stage) => [stage.stageKey, stage.stageLabel]),
    ),
    projectId: input.projectId,
    resourceCheckTarget: workflowDefinition?.resourceCheckTarget ?? '#resources-panel',
  };
}

export type { StageRoutingDecision };
