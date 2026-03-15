/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { ChangeEvent, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import GeneratorPanel, { GenerationConfig } from '../components/generator/GeneratorPanel';
import ResourcesPanel from '../components/generator/ResourcesPanel';
import CopyPasteModal from '../components/generator/CopyPasteModal';
import ReviewAdjustModal from '../components/generator/ReviewAdjustModal';
import CanonDeltaModal, { type Conflict, type PhysicsIssue } from '../components/generator/CanonDeltaModal';
import EditContentModal from '../components/generator/EditContentModal';
import HomebrewEditModal from '../components/generator/HomebrewEditModal';
import SaveContentModal from '../components/generator/SaveContentModal';
import CanonNarrowingModal from '../components/generator/CanonNarrowingModal';
import FactChunkingModal from '../components/generator/FactChunkingModal';
import ResumeProgressModal from '../components/generator/ResumeProgressModal';
import SpaceApprovalModal from '../components/generator/SpaceApprovalModal';
import LiveVisualMapPanel from '../components/generator/LiveVisualMapPanel';
import { AlertTriangle, Zap } from 'lucide-react';
import { parseAIResponse, formatParseError } from '../utils/jsonParser';
import {
  createProgressSession,
  addProgressEntry,
  attachWorkflowSessionMetadata,
  updateProgressResponse,
  saveProgressToFile,
  type GenerationProgress,
  type StageChunkState,
} from '../utils/generationProgress';
import {
  buildSafePrompt,
  formatPromptAnalysis,
  calculateAvailableFactSpace,
  PROMPT_LIMITS,
} from '../utils/promptLimits';
import { buildPackedPrompt, formatSizeBreakdown, PROMPT_SAFETY_CEILING, type PromptPackConfig } from '../utils/promptPacker';
import { reduceStageInputs } from '../utils/stageInputReducer';
import { getStageContract as getNpcStageContract } from '../config/npcStageContracts';
import { getNpcSectionChunks, type NpcSectionChunk } from '../config/npcSectionChunks';
import type { LiveMapSpace } from '../types/liveMapTypes';
import { synchronizeReciprocalDoors, type SpaceLike } from '../utils/doorSync';
import { projectApi, API_BASE_URL } from '../services/api';
import type { Project } from '../types';
import { useAiAssistant } from '../contexts/AiAssistantContext';
import type {
  AiCompiledStageRequest,
  AiStageMemorySummary,
  SubmitPipelineStageMetadata,
} from '../contexts/AiAssistantContext';
import {
  buildWorkflowRunDefinitionFromStages,
  getCurrentWorkflowStageIdentity,
  getGeneratorStages,
  getWorkflowLabel,
  resolveWorkflowSessionMetadata,
  resolveWorkflowStageIdentity,
  resolveWorkflowTypeFromConfigType,
  shouldShowLocationMapForStage,
  type GeneratorStage,
  type NpcDynamicStagePlan,
  type StageRoutingDecision,
} from '../services/generatorWorkflow';
import { applyLocationEditorUpdates } from '../services/locationEditorWorkflow';
import {
  buildAcceptedLocationSpaceProgress,
  extractLocationSpaceForMap,
  syncLocationLiveMapSpaces,
} from '../services/locationSpaceProgression';
import { buildLocationSpaceRetryGuidance } from '../services/locationSpaceRetry';
import type { WorkflowPromptNotice } from '../types/workflowUi';
import { MANUAL_GENERATOR_STAGE_CATALOG } from '../services/manualGeneratorStageCatalog';
import { buildWorkflowRetryPromptNotice } from '../services/workflowRetryNotice';
import {
  assembleFinalWorkflowContent,
  resolveCompletedWorkflowOutput,
  restoreUploadedWorkflowContent,
} from '../services/workflowContentAssembler';
import {
  buildResolvedWorkflowFinalContent,
  buildWorkflowCompletionAlertMessage,
  getWorkflowCompletionTitle,
  logWorkflowCompletionResult,
} from '../services/workflowCompletionPresentation';
import {
  extractRetrievalHintKeywords,
  searchWorkflowCanonByKeywords,
  type CanonFact,
  type Factpack,
} from '../services/workflowCanonRetrieval';
import {
  buildWorkflowFilteredFactpack,
  createEmptyWorkflowCanonNarrowingState,
  isWorkflowRetrievalHintNarrowing,
  openInitialWorkflowCanonNarrowing,
  openRetrievalHintWorkflowCanonNarrowing,
  updateWorkflowCanonNarrowingSearch,
  type WorkflowCanonFactSelection,
  type WorkflowCanonNarrowingState,
} from '../services/workflowCanonNarrowing';
import {
  deduplicateWorkflowFactpack as deduplicateFactpack,
  formatWorkflowCanonFacts as formatCanonFacts,
  groupWorkflowFacts as groupFactsIntelligently,
  mergeWorkflowFactpacks as mergeFactpacks,
  type WorkflowFactGroup as FactGroup,
} from '../services/workflowFactpack';
import {
  buildWorkflowChunkInfo,
  buildWorkflowFactGroupFactpack,
  closeWorkflowChunkingModal,
  createEmptyWorkflowChunkingState,
  isNpcSectionWorkflowChunking,
  openFactWorkflowChunking,
  openNpcSectionWorkflowChunking,
  resetWorkflowChunkingState,
  type WorkflowChunkInfo,
  type WorkflowChunkingState,
} from '../services/workflowChunking';
import {
  getNextWorkflowFactChunkStep,
  getNextWorkflowNpcSectionStep,
  mergeWorkflowChunkOutputs,
  mergeWorkflowNpcSections,
} from '../services/workflowMultiPartRuntime';
import { buildWorkflowStageChunkProgress } from '../services/workflowStageChunkProgress';
import {
  buildWorkflowStageChunkInfoForIndex,
  getNextWorkflowStageChunkStep,
  mergeWorkflowStageChunks,
} from '../services/workflowStageChunkRuntime';
import {
  buildWorkflowStageErrorOutput,
  filterAnsweredWorkflowProposals,
  prepareWorkflowStageForReview,
  type WorkflowStageProposal,
} from '../services/workflowStageReview';
import {
  buildWorkflowCompletionResult,
  getWorkflowStageProgression,
} from '../services/workflowStageTransition';
import { resolveWorkflowStageContinuation } from '../services/workflowStageContinuation';
import {
  buildWorkflowAdvancePlan,
  buildWorkflowCanonContinuationPlan,
  type WorkflowStageNavigationPlan,
} from '../services/workflowStageNavigation';
import {
  buildWorkflowCompletedLaunchPlan,
  buildWorkflowFactChunkRestartLaunchPlan,
  buildWorkflowFactChunkStartLaunchPlan,
  buildWorkflowJumpToStageLaunchPlan,
  buildWorkflowNpcSectionStartLaunchPlan,
  buildWorkflowPromptLaunchPlan,
  buildWorkflowResumeLaunchPlan,
  buildWorkflowSameStageLaunchPlan,
  type WorkflowStageLaunchPlan,
} from '../services/workflowStageLaunch';
import {
  buildWorkflowAdvanceUiTransition,
  buildWorkflowCompletionUiTransition,
  buildWorkflowErrorUiTransition,
  buildWorkflowRetryUiTransition,
  type WorkflowUiTransitionPlan,
} from '../services/workflowUiTransition';
import { resolveWorkflowResumeAction } from '../services/workflowResume';
import {
  buildWorkflowHomebrewCompletionAlertMessage,
  buildWorkflowHomebrewStageResults,
  getCurrentWorkflowHomebrewChunk,
  getWorkflowHomebrewChunks,
  resolveWorkflowHomebrewChunkProgress,
} from '../services/workflowHomebrewRuntime';
import {
  inferSpecies,
  parseAndNormalizeWorkflowStageResponse,
  type NormalizeWorkflowStageResponseResult,
} from '../services/workflowStageResponse';
import type { ParentStructure } from '../utils/locationGeometry';
import { restoreWorkflowStageChunkState } from '../services/workflowStageChunkRestore';
import {
  getStageContract as getWorkflowStageContract,
} from '../utils/stageOutputContracts';
import ModeSelectionDialog from '../components/ai-assistant/ModeSelectionDialog';
import { buildManualStagePrompt } from '../services/workflowTransport';
import {
  getStageAttempt,
  markRunAwaitingUserDecisions,
  markRunComplete,
  markStageAccepted,
  markStageError,
  syncCurrentStage,
  syncGenerationRunDefinition,
  updateRetrievalStatus,
} from '../../../src/shared/generation/workflowRunState';
import type { ExecutionMode, GenerationRunState, WorkflowContentType, WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;
type StagePromptOverrides = {
  flags?: Record<string, unknown>;
  promptNotice?: WorkflowPromptNotice | null;
  retrySource?: WorkflowRetrySource | null;
};

function isNormalizedStageResponseFailure(
  result: NormalizeWorkflowStageResponseResult,
): result is Extract<NormalizeWorkflowStageResponseResult, { ok: false }> {
  return result.ok === false;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface StageContext {
  config: GenerationConfig;
  stageResults: StageResults;
  factpack: Factpack | null;
  chunkInfo?: {
    isChunked: boolean;
    currentChunk: number;
    totalChunks: number;
    chunkLabel: string;
  };
  previousDecisions?: Record<string, string>; // Accumulated answers from previous chunks
  unansweredProposals?: unknown[]; // Proposals from previous chunks that need answering
  npcSectionContext?: {
    isNpcSectionChunking: boolean;
    currentSectionIndex: number;
    currentSection: NpcSectionChunk | null;
    accumulatedSections: JsonRecord;
  };
}

type Stage = GeneratorStage;

// Types aligned with CanonDeltaModal's onApprove callback
type Proposal = WorkflowStageProposal;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const shouldLogAiPayload = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (window.localStorage?.getItem('DEBUG_AI_LOG') || '').toLowerCase() === 'true';
  } catch (_err) {
    return false;
  }
};

const getString = (source: JsonRecord | null | undefined, key: string): string | undefined => {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
};

const getNumber = (source: JsonRecord | null | undefined, key: string): number | undefined => {
  if (!source) return undefined;
  const value = source[key];
  if (typeof value === 'number') return value;
  if (isRecord(value) && typeof value.value === 'number') return value.value;
  return undefined;
};

const getStageObject = (source: StageResults | null | undefined, key: string): JsonRecord | undefined => {
  if (!source) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
};

const getLocationParentStructure = (source: StageResults | null | undefined): ParentStructure | undefined => {
  const foundation = getStageObject(source, 'foundation');
  if (!foundation) return undefined;

  return {
    total_floors: typeof foundation.total_floors === 'number' ? foundation.total_floors : undefined,
    total_area: typeof foundation.total_area === 'number' ? foundation.total_area : undefined,
    layout: typeof foundation.layout === 'string' ? foundation.layout : undefined,
  };
};

const getEmbeddedObject = (source: JsonRecord | null | undefined, key: string, nestedKey: string): JsonRecord | undefined => {
  const parent = getObject(source, key);
  if (!parent) return undefined;
  return getObject(parent, nestedKey);
};

const getJsonRecordList = (value: unknown): JsonRecord[] => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items.filter(isRecord);
  }
  return [];
};

const setStageArrayValue = <T extends JsonRecord>(items: T[]): JsonRecord => ({ items });

const getObject = (source: JsonRecord | null | undefined, key: string): JsonRecord | undefined => {
  if (!source) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
};

const asJsonRecordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const getStageStorageKey = (stage: Stage): string => stage.name.toLowerCase().replace(/\s+/g, '_');

const getStageLookupKey = (stage: Stage): string => {
  if (typeof stage.workflowStageKey === 'string' && stage.workflowStageKey.trim().length > 0) {
    return stage.workflowStageKey;
  }
  if (typeof stage.routerKey === 'string' && stage.routerKey.trim().length > 0) {
    return stage.routerKey;
  }
  return stage.name;
};

const isPositionRecord = (value: unknown): value is { x?: number; y?: number } => isRecord(value);

const summarizeForAiMemory = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth >= 2) {
      return { itemCount: value.length };
    }
    return {
      itemCount: value.length,
      preview: value.slice(0, 3).map((item) => summarizeForAiMemory(item, depth + 1)),
    };
  }
  if (isRecord(value)) {
    if (depth >= 2) {
      return { keys: Object.keys(value).slice(0, 8) };
    }
    const summary: Record<string, unknown> = {};
    const entries = Object.entries(value);
    entries.slice(0, 8).forEach(([key, entryValue]) => {
      summary[key] = summarizeForAiMemory(entryValue, depth + 1);
    });
    if (entries.length > 8) {
      summary._truncatedKeyCount = entries.length - 8;
    }
    return summary;
  }
  return String(value);
};

const getStageMemoryValue = (stage: Stage, results: StageResults): unknown => {
  const storageKey = getStageStorageKey(stage);
  if (storageKey in results) {
    return results[storageKey];
  }

  const lookupKey = getStageLookupKey(stage);
  if (lookupKey in results) {
    return results[lookupKey];
  }

  return undefined;
};

const buildAiStageMemorySummary = (
  stage: Stage,
  config: GenerationConfig,
  results: StageResults,
  activeFactpack: Factpack | null,
  previousDecisions?: Record<string, string>
): AiStageMemorySummary => {
  const currentStageKey = getStageStorageKey(stage);
  const currentLookupKey = getStageLookupKey(stage);
  const priorStageSummaries: Record<string, unknown> = {};

  Object.entries(results).forEach(([key, value]) => {
    if (key === currentStageKey || key === currentLookupKey) {
      return;
    }
    priorStageSummaries[key] = summarizeForAiMemory(value);
  });

  return {
    request: {
      prompt: config.prompt,
      type: config.type,
      stageKey: currentLookupKey,
      stageLabel: stage.name,
    },
    completedStages: Object.keys(results),
    currentStageData: summarizeForAiMemory(getStageMemoryValue(stage, results)),
    priorStageSummaries,
    previousDecisions: previousDecisions || {},
    factpack: {
      factCount: activeFactpack?.facts.length || 0,
      entityNames: Array.from(new Set((activeFactpack?.facts || []).map((fact) => fact.entity_name))).slice(0, 12),
    },
  };
};

const logLiveMapSpacePosition = (space: LiveMapSpace): string => {
  const position = isPositionRecord(space.position) ? space.position : undefined;
  const x = typeof position?.x === 'number' ? position.x : 'n/a';
  const y = typeof position?.y === 'number' ? position.y : 'n/a';
  return `${space.name}: (${x},${y}) locked=${String(space.position_locked)}`;
};

const STAGE_CATALOG = MANUAL_GENERATOR_STAGE_CATALOG;

/**
 * Limit accumulated answers to prevent exceeding character limits in prompts
 * Keeps the most recent answers and trims older ones
 */
function limitAccumulatedAnswers(
  answers: Record<string, string>,
  maxChars: number = 6000
): Record<string, string> {
  const entries = Object.entries(answers);
  let totalChars = 0;
  const limited: Record<string, string> = {};

  // Process in reverse order (most recent first if they were added sequentially)
  for (let i = entries.length - 1; i >= 0; i--) {
    const [question, answer] = entries[i];
    const entrySize = question.length + answer.length;

    if (totalChars + entrySize <= maxChars) {
      limited[question] = answer;
      totalChars += entrySize;
    } else {
      // Would exceed limit - stop here
      console.log(`[limitAccumulatedAnswers] Trimmed ${entries.length - Object.keys(limited).length} older answers to stay under ${maxChars} chars`);
      break;
    }
  }

  return limited;
}

export default function ManualGenerator() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || 'default';
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [modalMode, setModalMode] = useState<'output' | 'input' | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentPromptNotice, setCurrentPromptNotice] = useState<WorkflowPromptNotice | null>(null);
  const [currentStageRetrySource, setCurrentStageRetrySource] = useState<WorkflowRetrySource | null>(null);
  const [compiledStageRequest, setCompiledStageRequest] = useState<AiCompiledStageRequest | null>(null);
  const [stageResults, setStageResults] = useState<StageResults>({});
  const [factpack, setFactpack] = useState<Factpack | null>(null);
  const [retrievalGroundingStatus, setRetrievalGroundingStatus] = useState<'project' | 'library' | 'ungrounded'>('ungrounded');
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [_sessionStatus, setSessionStatus] = useState<'idle' | 'running' | 'awaiting_user_decisions' | 'error' | 'complete'>('idle');
  const [finalOutput, setFinalOutput] = useState<JsonRecord | null>(null);
  const [_lastStageError, setLastStageError] = useState<{ stage?: string; message: string; rawSnippet?: string } | null>(null);
  const [showCanonDeltaModal, setShowCanonDeltaModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editedContent, setEditedContent] = useState<unknown>(null);
  const [resolvedProposals, setResolvedProposals] = useState<Proposal[]>([]);
  const [resolvedConflicts, setResolvedConflicts] = useState<Conflict[]>([]);
  const [_resolvedPhysicsIssues, setResolvedPhysicsIssues] = useState<PhysicsIssue[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentStageOutput, setCurrentStageOutput] = useState<JsonRecord | null>(null);
  const [uploadedContentType, setUploadedContentType] = useState<GenerationConfig['type']>('npc');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [skipMode, _setSkipMode] = useState(false);
  const [canonNarrowingState, setCanonNarrowingState] = useState<WorkflowCanonNarrowingState<StageResults>>(
    createEmptyWorkflowCanonNarrowingState<StageResults>(),
  );
  const [chunkingState, setChunkingState] = useState<WorkflowChunkingState>(createEmptyWorkflowChunkingState());
  const [accumulatedAnswers, setAccumulatedAnswers] = useState<Record<string, string>>({});
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [isMultiPartGeneration, setIsMultiPartGeneration] = useState(false);
  const [currentChunkInfo, setCurrentChunkInfo] = useState<WorkflowChunkInfo | undefined>(undefined);
  const clearCanonNarrowingState = () => setCanonNarrowingState(createEmptyWorkflowCanonNarrowingState<StageResults>());
  const clearWorkflowChunkingState = () => setChunkingState(resetWorkflowChunkingState());
  const applyWorkflowUiTransition = (plan: WorkflowUiTransitionPlan) => {
    if (plan.modalMode !== undefined) {
      setModalMode(plan.modalMode);
    }
    if (plan.skipMode !== undefined) {
      _setSkipMode(plan.skipMode);
    }
    if (plan.showReviewModal !== undefined) {
      setShowReviewModal(plan.showReviewModal);
    }
    if (plan.sessionStatus !== undefined) {
      setSessionStatus(plan.sessionStatus);
    }
    if (plan.clearCompiledStageRequest) {
      setCompiledStageRequest(null);
    }
    if (plan.promptNotice !== undefined) {
      setCurrentPromptNotice(plan.promptNotice);
    }
    if (plan.retrySource !== undefined) {
      setCurrentStageRetrySource(plan.retrySource);
    }
    if (plan.clearCanonNarrowing) {
      clearCanonNarrowingState();
    }
    if (plan.clearWorkflowChunking) {
      clearWorkflowChunkingState();
    }
    if (plan.isMultiPartGeneration !== undefined) {
      setIsMultiPartGeneration(plan.isMultiPartGeneration);
    }
    if (plan.currentGroupIndex !== undefined) {
      setCurrentGroupIndex(plan.currentGroupIndex);
    }
    if (plan.isStageChunking !== undefined) {
      setIsStageChunking(plan.isStageChunking);
    }
    if (plan.currentStageChunk !== undefined) {
      setCurrentStageChunk(plan.currentStageChunk);
    }
    if (plan.totalStageChunks !== undefined) {
      setTotalStageChunks(plan.totalStageChunks);
    }
    if (plan.clearAccumulatedChunkResults) {
      setAccumulatedChunkResults([]);
    }
  };
  const executeWorkflowStageNavigation = (
    plan: WorkflowStageNavigationPlan,
    options?: {
      chunkInfo?: {
        isChunked: boolean;
        currentChunk: number;
        totalChunks: number;
        chunkLabel: string;
      };
    },
  ) => {
    setStageResults(plan.stageResults);
    setFactpack(plan.factpack);
    if (plan.resetCurrentGroupIndex) {
      setCurrentGroupIndex(0);
    }
    if (plan.kind === 'advance') {
      setCurrentStageIndex(plan.nextIndex);
      setTimeout(() => {
        showStageOutput(plan.nextIndex, config!, plan.stageResults, plan.factpack, options?.chunkInfo);
      }, 100);
    }
  };
  const executeWorkflowStageLaunch = (
    plan: WorkflowStageLaunchPlan,
    options?: {
      runtimeConfig?: GenerationConfig;
      unansweredProposals?: unknown[];
      overrideDecisions?: Record<string, string>;
      additionalGuidance?: string;
      promptOverrides?: StagePromptOverrides;
    },
  ) => {
    const runtimeConfig = options?.runtimeConfig ?? config;

    if (plan.kind === 'show_prompt') {
      setStageResults(plan.stageResults);
      setFactpack(plan.factpack);
      setCurrentStageIndex(plan.stageIndex);
      setCompiledStageRequest(plan.compiledStageRequest ?? null);
      setCurrentPromptNotice(plan.promptNotice);
      setCurrentStageRetrySource(plan.retrySource);
      setCurrentPrompt(plan.prompt);
      setModalMode(plan.modalMode);
      if (plan.alertMessage) {
        alert(plan.alertMessage);
      }
      return;
    }

    if (plan.kind === 'show_completed') {
      applyWorkflowUiTransition(buildWorkflowCompletionUiTransition());
      setIsComplete(true);
      setFinalOutput(plan.finalOutput);
      if (plan.alertMessage) {
        alert(plan.alertMessage);
      }
      return;
    }

    if (!runtimeConfig) {
      console.warn('[Workflow Launch] Missing runtime config for stage launch:', plan.stageIndex);
      if (plan.alertMessage) {
        alert(plan.alertMessage);
      }
      return;
    }

    setStageResults(plan.stageResults);
    setFactpack(plan.factpack);
    setCurrentStageIndex(plan.stageIndex);
    if (plan.isComplete !== undefined) {
      setIsComplete(plan.isComplete);
    }
    if (plan.finalOutput !== undefined) {
      setFinalOutput(plan.finalOutput);
    }
    if (plan.sessionStatus !== undefined) {
      setSessionStatus(plan.sessionStatus);
    }
    if (plan.currentGroupIndex !== undefined) {
      setCurrentGroupIndex(plan.currentGroupIndex);
    }
    if (plan.currentNpcSectionIndex !== undefined) {
      setCurrentNpcSectionIndex(plan.currentNpcSectionIndex);
    }
    if (plan.accumulatedNpcSections !== undefined) {
      setAccumulatedNpcSections(plan.accumulatedNpcSections);
    }

    setTimeout(() => {
      showStageOutput(
        plan.stageIndex,
        runtimeConfig,
        plan.stageResults,
        plan.factpack,
        plan.chunkInfo,
        options?.unansweredProposals,
        options?.overrideDecisions,
        options?.additionalGuidance,
        options?.promptOverrides,
      );
    }, 100);

    if (plan.alertMessage) {
      alert(plan.alertMessage);
    }
  };
  const applyNpcDynamicRoutingPlan = (routingPlan?: NpcDynamicStagePlan) => {
    if (!routingPlan) {
      return;
    }

    setStageRoutingDecision(routingPlan.routingDecision);
    console.log('[Smart Routing] Stage routing decision:', routingPlan.routingDecision);
    console.log('[Smart Routing] Summary:\n' + routingPlan.summary);
    setDynamicNpcStages(routingPlan.dynamicStages);
    console.log(`[Smart Routing] Dynamic stages built: ${routingPlan.dynamicStages.map((stage) => stage.name).join(', ')}`);
    console.log(`[Smart Routing] Skipped ${routingPlan.skippedStageCount} stages`);
  };
  const isProcessingRetrievalHints = isWorkflowRetrievalHintNarrowing(canonNarrowingState);
  const showChunkingModal = chunkingState.isModalOpen;
  const factGroups = chunkingState.factGroups;
  const npcSectionChunks = chunkingState.npcSections;
  const pendingChunkingFactpack = chunkingState.pendingFactpack;
  const isNpcSectionChunking = isNpcSectionWorkflowChunking(chunkingState);

  // NPC Section-based chunking state
  const [currentNpcSectionIndex, setCurrentNpcSectionIndex] = useState(0);
  const [accumulatedNpcSections, setAccumulatedNpcSections] = useState<JsonRecord>({});

  // Stage-based chunking state (for Location Spaces iteration)
  const [isStageChunking, setIsStageChunking] = useState(false);
  const [currentStageChunk, setCurrentStageChunk] = useState(0);
  const [totalStageChunks, setTotalStageChunks] = useState(0);
  const [accumulatedChunkResults, setAccumulatedChunkResults] = useState<JsonRecord[]>([]);

  // Live visual map state (for Location generation)
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [liveMapSpaces, setLiveMapSpaces] = useState<LiveMapSpace[]>([]);

  // Space approval workflow state (for Location Spaces stage)
  const [showSpaceApprovalModal, setShowSpaceApprovalModal] = useState(false);
  const [pendingSpace, setPendingSpace] = useState<JsonRecord | null>(null);
  const [_rejectedSpaces, setRejectedSpaces] = useState<Array<{ space: JsonRecord; reason?: string; retrySource?: WorkflowRetrySource }>>([]);
  const [reviewingSpaceIndex, setReviewingSpaceIndex] = useState<number>(-1); // Index in accumulatedChunkResults, -1 = new space
  const [savedNewSpace, setSavedNewSpace] = useState<JsonRecord | null>(null); // Save new space when navigating away
  const [mapUpdateCounter, setMapUpdateCounter] = useState(0); // Force map re-renders
  const [batchModeEnabled, setBatchModeEnabled] = useState(false); // Auto-accept spaces without individual approval

  // Auto-save progress state
  const [progressSession, setProgressSession] = useState<GenerationProgress | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Smart stage routing state (for NPC generation)
  const [dynamicNpcStages, setDynamicNpcStages] = useState<Stage[] | null>(null);
  const [stageRoutingDecision, setStageRoutingDecision] = useState<StageRoutingDecision | null>(null);

  // Get appropriate stages based on content type
  const STAGES = getGeneratorStages(config?.type, STAGE_CATALOG, dynamicNpcStages);

  // Track previous values to avoid unnecessary context updates
  const prevStageResultsRef = useRef<StageResults | null>(null);
  const prevStageIndexRef = useRef<number>(-1);
  const prevConfigKeyRef = useRef<string | null>(null);
  const prevFactpackKeyRef = useRef<string | null>(null);
  const prevCompiledStageRequestKeyRef = useRef<string | null>(null);
  const dynamicNpcStagesRef = useRef<Stage[] | null>(null);

  useEffect(() => {
    setCompiledStageRequest(null);
  }, [currentStageIndex, config?.type, config?.prompt]);

  useEffect(() => {
    dynamicNpcStagesRef.current = dynamicNpcStages;
  }, [dynamicNpcStages]);

  useEffect(() => {
    if (!projectId || projectId === 'default') {
      setProject(null);
      setProjectLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setProjectLoading(true);
      try {
        const response = await projectApi.getById(projectId);
        if (cancelled) return;
        if (response.success && response.data) {
          setProject(response.data);
        } else {
          setProject(null);
        }
      } catch {
        if (!cancelled) setProject(null);
      } finally {
        if (!cancelled) setProjectLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ─── AI Assistant Integration ──────────────────────────────────────────────
  const {
    setWorkflowContext,
    registerApplyChanges,
    registerSubmitPipelineResponse,
    registerWorkflowRunStateDispatcher,
    assistMode,
    setAssistMode,
    openPanel,
    providerConfig
  } = useAiAssistant();
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [pendingGenerationConfig, setPendingGenerationConfig] = useState<GenerationConfig | null>(null);
  const [workflowRunState, setWorkflowRunState] = useState<GenerationRunState | null>(null);

  const getWorkflowExecutionMode = (): ExecutionMode => (assistMode === 'integrated' ? 'integrated' : 'manual');

  useEffect(() => {
    if (!config) {
      setWorkflowRunState(null);
      return;
    }

    const workflowType = resolveWorkflowTypeFromConfigType(config.type);
    const definition = buildWorkflowRunDefinitionFromStages({
      workflowType,
      stages: STAGES,
      executionMode: getWorkflowExecutionMode(),
      projectId: projectId !== 'default' ? projectId : undefined,
    });
    setWorkflowRunState((prev) => syncGenerationRunDefinition(prev, definition));
  }, [config, STAGES, assistMode, projectId]);

  useEffect(() => {
    if (!config) return;
    const workflowType = resolveWorkflowTypeFromConfigType(config.type);
    const factsFound = factpack?.facts.length ?? 0;
    const groundingStatus = factsFound > 0 ? retrievalGroundingStatus : 'ungrounded';
    const resourceCheckTarget = buildWorkflowRunDefinitionFromStages({
      workflowType,
      stages: STAGES,
      executionMode: getWorkflowExecutionMode(),
      projectId: projectId !== 'default' ? projectId : undefined,
    }).resourceCheckTarget;

    setWorkflowRunState((prev) => updateRetrievalStatus(prev, workflowType, groundingStatus, factsFound, {
      resourceCheckTarget,
    }));
  }, [config, factpack, retrievalGroundingStatus, STAGES, assistMode, projectId]);

  const previousAcceptedStageIndexRef = useRef(-1);

  useEffect(() => {
    if (!config) {
      previousAcceptedStageIndexRef.current = -1;
      return;
    }

    const workflowType = resolveWorkflowTypeFromConfigType(config.type);
    const currentStage = STAGES[currentStageIndex];
    const runStage = getCurrentWorkflowStageIdentity(workflowType, currentStage);

    if (!compiledStageRequest || !runStage) {
      return;
    }

    setWorkflowRunState((prev) => syncCurrentStage(
      prev,
      runStage.stageKey,
      runStage.stageLabel,
      compiledStageRequest.requestId,
      {
        transport: getWorkflowExecutionMode(),
        retrySource: currentStageRetrySource || undefined,
      },
    ));
  }, [compiledStageRequest, config, currentStageIndex, STAGES, assistMode, currentStageRetrySource]);

  useEffect(() => {
    if (!config) {
      previousAcceptedStageIndexRef.current = -1;
      return;
    }

    const previousStageIndex = previousAcceptedStageIndexRef.current;
    if (currentStageIndex <= previousStageIndex || previousStageIndex < 0) {
      previousAcceptedStageIndexRef.current = currentStageIndex;
      return;
    }

    if (assistMode === 'integrated') {
      previousAcceptedStageIndexRef.current = currentStageIndex;
      return;
    }

    const workflowType = resolveWorkflowTypeFromConfigType(config.type);
    const previousStage = STAGES[previousStageIndex];
    const previousRunStage = getCurrentWorkflowStageIdentity(workflowType, previousStage);

    if (previousRunStage) {
      setWorkflowRunState((prev) => markStageAccepted(prev, previousRunStage.stageKey, previousRunStage.stageLabel));
    }

    previousAcceptedStageIndexRef.current = currentStageIndex;
  }, [assistMode, config, currentStageIndex, STAGES]);

  useEffect(() => {
    if (!config) return;

    const workflowType = resolveWorkflowTypeFromConfigType(config.type);
    const terminalStageIndex = currentStageIndex >= 0 && currentStageIndex < STAGES.length
      ? currentStageIndex
      : STAGES.length - 1;
    const terminalStage = terminalStageIndex >= 0 ? STAGES[terminalStageIndex] : undefined;
    const currentRunStage = getCurrentWorkflowStageIdentity(workflowType, terminalStage);
    const currentAttemptId = currentRunStage
      ? getStageAttempt(workflowRunState, currentRunStage.stageKey)?.attemptId
      : undefined;

    if ((_sessionStatus === 'error' || error) && currentRunStage && error) {
      setWorkflowRunState((prev) => markStageError(prev, currentRunStage.stageKey, currentRunStage.stageLabel, error, {
        attemptId: currentAttemptId,
      }));
      return;
    }

    if (_sessionStatus === 'awaiting_user_decisions' && currentRunStage) {
      setWorkflowRunState((prev) => markRunAwaitingUserDecisions(prev, currentRunStage.stageKey, currentRunStage.stageLabel, {
        attemptId: currentAttemptId,
      }));
      return;
    }

    if ((_sessionStatus === 'complete' || isComplete) && currentRunStage) {
      setWorkflowRunState((prev) => {
        const accepted = markStageAccepted(prev, currentRunStage.stageKey, currentRunStage.stageLabel, {
          attemptId: currentAttemptId,
        });
        return markRunComplete(accepted);
      });
    }
  }, [config, _sessionStatus, error, isComplete, currentStageIndex, STAGES, workflowRunState]);

  // Push workflow context into AI Assistant whenever relevant state changes
  useEffect(() => {
    if (!config) {
      setWorkflowContext(null);
      prevStageResultsRef.current = null;
      prevStageIndexRef.current = -1;
      prevConfigKeyRef.current = null;
      prevFactpackKeyRef.current = null;
      prevCompiledStageRequestKeyRef.current = null;
      return;
    }

    const stageResultsChanged =
      !prevStageResultsRef.current ||
      JSON.stringify(prevStageResultsRef.current) !== JSON.stringify(stageResults);

    const configKey = JSON.stringify({ type: config.type, prompt: config.prompt, flags: config.flags });
    const configChanged = prevConfigKeyRef.current !== configKey;

    const stageIndexChanged = prevStageIndexRef.current !== currentStageIndex;

    const factpackKey = factpack
      ? JSON.stringify({
        facts: factpack.facts.map(f => ({ text: f.text, source: f.entity_name })),
      })
      : null;
    const factpackChanged = prevFactpackKeyRef.current !== factpackKey;
    const compiledStageRequestKey = compiledStageRequest
      ? JSON.stringify({
        requestId: compiledStageRequest.requestId,
        stageKey: compiledStageRequest.stageKey,
        measuredChars: compiledStageRequest.promptBudget.measuredChars,
        prompt: compiledStageRequest.prompt,
      })
      : null;
    const compiledStageRequestChanged = prevCompiledStageRequestKeyRef.current !== compiledStageRequestKey;

    const shouldUpdate = stageResultsChanged || configChanged || stageIndexChanged || factpackChanged || compiledStageRequestChanged;
    if (!shouldUpdate) return;

    prevStageResultsRef.current = stageResults;
    prevStageIndexRef.current = currentStageIndex;
    prevConfigKeyRef.current = configKey;
    prevFactpackKeyRef.current = factpackKey;
    prevCompiledStageRequestKeyRef.current = compiledStageRequestKey;

    const wfType = resolveWorkflowTypeFromConfigType(config.type);
    const currentStage = STAGES[currentStageIndex];
    const currentRunStage = getCurrentWorkflowStageIdentity(wfType, currentStage);
    const isWorkflowComplete = isComplete || currentStageIndex >= STAGES.length;

    setWorkflowContext({
      workflowType: wfType,
      workflowLabel: getWorkflowLabel(wfType),
      currentStage: isWorkflowComplete ? undefined : currentStage?.name,
      stageRouterKey: isWorkflowComplete ? undefined : currentRunStage?.stageKey,
      stageProgress: currentStageIndex >= 0
        ? { current: currentStageIndex + 1, total: STAGES.length }
        : undefined,
      currentData: stageResults,
      factpack: factpack
        ? { facts: factpack.facts.map(f => ({ text: f.text, source: f.entity_name })) }
        : undefined,
      generationConfig: {
        type: config.type,
        prompt: config.prompt,
        flags: config.flags,
      },
      compiledStageRequest: isWorkflowComplete ? undefined : compiledStageRequest || undefined,
      generatorType: config.type,
      schemaVersion: 'v1.1-client',
      projectId: projectId !== 'default' ? projectId : undefined,
      runState: workflowRunState || undefined,
    });
  }, [compiledStageRequest, config, currentStageIndex, stageResults, factpack, STAGES, projectId, setWorkflowContext, isComplete, workflowRunState]);

  // Register applyChanges callback so the AI panel can merge changes back
  useEffect(() => {
    const handleApply = (changes: Record<string, unknown>, mergeMode: 'replace' | 'merge') => {
      setStageResults(prev => {
        if (mergeMode === 'replace') {
          return changes as StageResults;
        }
        // Merge mode: shallow-merge top-level keys
        const merged = { ...prev };
        for (const key of Object.keys(changes)) {
          const existing = merged[key];
          const incoming = changes[key];
          if (
            existing && typeof existing === 'object' && !Array.isArray(existing) &&
            incoming && typeof incoming === 'object' && !Array.isArray(incoming)
          ) {
            merged[key] = { ...existing, ...(incoming as JsonRecord) };
          } else {
            merged[key] = incoming as JsonRecord;
          }
        }
        return merged;
      });
      console.log('[AI Assistant] Applied changes to stageResults:', Object.keys(changes));
    };

    registerApplyChanges(handleApply);

    return () => {
      registerApplyChanges(null);
      setWorkflowContext(null);
    };
  }, [registerApplyChanges, setWorkflowContext]);

  useEffect(() => {
    registerWorkflowRunStateDispatcher(setWorkflowRunState);
    return () => {
      registerWorkflowRunStateDispatcher(null);
    };
  }, [registerWorkflowRunStateDispatcher]);

  // Register submitPipelineResponse callback so the AI panel can trigger the pipeline
  // Initialize with a no-op to avoid TDZ issues before handleSubmit is defined
  const handleSubmitRef = useRef<(aiResponse: string, metadata?: SubmitPipelineStageMetadata) => Promise<void>>(async () => { });
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    const handlePipelineSubmit = async (
      rawText: string,
      parsedJson?: Record<string, unknown>,
      metadata?: SubmitPipelineStageMetadata,
    ) => {
      console.log('[AI Assistant] Submitting response to pipeline');
      // We just pass the raw text to handleSubmit, which will parse it or we can construct a JSON string
      if (parsedJson) {
        await handleSubmitRef.current(JSON.stringify(parsedJson), metadata);
      } else {
        await handleSubmitRef.current(rawText, metadata);
      }
    };

    if (registerSubmitPipelineResponse) {
      registerSubmitPipelineResponse(handlePipelineSubmit);
    }

    return () => {
      if (registerSubmitPipelineResponse) {
        registerSubmitPipelineResponse(null);
      }
    };
  }, [registerSubmitPipelineResponse]); // Rely on ref to avoid infinite dependency loops
  // ─── End AI Assistant Integration

  const resetPipelineState = () => {
    setCurrentStageIndex(-1);
    setModalMode(null);
    _setSkipMode(false);
    setStageResults({});
    setFactpack(null);
    setRetrievalGroundingStatus('ungrounded');
    setError(null);
    setLastStageError(null);
    setSessionStatus('idle');
    setIsComplete(false);
    setFinalOutput(null);
    setCompiledStageRequest(null);
    setCurrentPromptNotice(null);
    setCurrentStageRetrySource(null);
    setShowReviewModal(false);
    clearCanonNarrowingState();
    clearWorkflowChunkingState();
    setAccumulatedAnswers({});
    setCurrentGroupIndex(0);
    setIsMultiPartGeneration(false);
    setCurrentChunkInfo(undefined);
    setDynamicNpcStages(null);
    setStageRoutingDecision(null);
    setWorkflowRunState(null);
  };

  // Helper function to auto-save progress
  const attachWorkflowMetadataToSession = (session: GenerationProgress): GenerationProgress => {
    const { workflowType, workflowStageSequence } = resolveWorkflowSessionMetadata({
      sessionWorkflowType: session.workflowType,
      sessionConfigType: typeof session.config?.type === 'string' ? session.config.type : undefined,
      currentConfigType: config?.type,
      sessionWorkflowStageSequence: session.workflowStageSequence,
      stages: STAGES,
    });
    const persistedWorkflowRunState = workflowRunState ?? session.workflowRunState ?? null;
    const persistedCompiledStageRequest = compiledStageRequest ?? session.compiledStageRequest ?? null;

    return attachWorkflowSessionMetadata(session, {
      workflowType,
      workflowStageSequence,
      workflowRunState: persistedWorkflowRunState,
      compiledStageRequest: persistedCompiledStageRequest,
    });
  };

  const savePendingPromptSession = async (input: {
    baseSession: GenerationProgress;
    stageIndex: number;
    stageName: string;
    chunkIndex: number | null;
    prompt: string;
    retrySource?: WorkflowRetrySource;
    compiledStageRequest?: AiCompiledStageRequest | null;
  }) => {
    let updatedSession = addProgressEntry(
      input.baseSession,
      input.stageName,
      input.chunkIndex,
      input.prompt,
      input.retrySource,
    );
    const persistedMetadata = resolveWorkflowSessionMetadata({
      sessionWorkflowType: input.baseSession.workflowType,
      sessionConfigType: typeof input.baseSession.config?.type === 'string' ? input.baseSession.config.type : undefined,
      currentConfigType: config?.type,
      sessionWorkflowStageSequence: input.baseSession.workflowStageSequence,
      stages: STAGES,
    });
    updatedSession = attachWorkflowSessionMetadata(
      {
        ...updatedSession,
        currentStageIndex: input.stageIndex,
      },
      {
        workflowType: persistedMetadata.workflowType,
        workflowStageSequence: persistedMetadata.workflowStageSequence,
        workflowRunState,
        compiledStageRequest: input.compiledStageRequest ?? null,
      },
    );
    setProgressSession(updatedSession);
    await saveProgress(updatedSession);
  };

  const persistDirectPromptLaunchSession = async (input: {
    baseSession: GenerationProgress | null;
    runtimeConfig: GenerationConfig;
    plan: WorkflowStageLaunchPlan;
  }) => {
    if (!autoSaveEnabled || !input.baseSession || input.plan.kind !== 'show_prompt') {
      return;
    }

    const runtimeStages = getGeneratorStages(input.runtimeConfig.type, STAGE_CATALOG, dynamicNpcStagesRef.current);
    const stageName = runtimeStages[input.plan.stageIndex]?.name ?? STAGES[input.plan.stageIndex]?.name;
    if (!stageName) {
      return;
    }

    const currentHomebrewChunk = input.runtimeConfig.type === 'homebrew'
      ? getCurrentWorkflowHomebrewChunk(input.plan.stageResults)?.index ?? null
      : null;

    await savePendingPromptSession({
      baseSession: attachWorkflowMetadataToSession({
        ...input.baseSession,
        lastUpdatedAt: new Date().toISOString(),
        currentStageIndex: input.plan.stageIndex,
        stageResults: input.plan.stageResults as unknown as Record<string, unknown>,
      }),
      stageIndex: input.plan.stageIndex,
      stageName,
      chunkIndex: currentHomebrewChunk,
      prompt: input.plan.prompt,
      retrySource: input.plan.retrySource ?? undefined,
      compiledStageRequest: input.plan.compiledStageRequest ?? null,
    });
  };

  const saveProgress = async (session: GenerationProgress) => {
    if (!autoSaveEnabled || !session) return;

    try {
      const sessionToPersist = attachWorkflowMetadataToSession(session);
      if (sessionToPersist !== session) {
        setProgressSession((prev) => (prev?.sessionId === sessionToPersist.sessionId ? sessionToPersist : prev));
      }
      await saveProgressToFile(sessionToPersist);
      setLastSaveTime(new Date().toISOString());
    } catch (error) {
      console.error('[Auto-Save] Failed to save progress:', error);
    }
  };

  const jumpToStage = async (stageName: string) => {
    if (!config) return;
    const idx = STAGES.findIndex((s) => s.name === stageName);
    if (idx < 0) return;

    const launchPlan = buildWorkflowJumpToStageLaunchPlan({
      stageIndex: idx,
      stageResults,
      factpack,
    });

    applyWorkflowUiTransition({
      modalMode: null,
      skipMode: false,
    });

    await saveStateAndSession({
      currentStageIndex: idx,
    });

    executeWorkflowStageLaunch(launchPlan, {
      runtimeConfig: config,
    });
  };

  const locationSoftWarning = (() => {
    if (config?.type !== 'location') return undefined;
    if (modalMode !== 'input') return undefined;
    const stageName = STAGES[currentStageIndex]?.name;
    if (!stageName) return undefined;

    const spacesStage = stageResults.spaces;
    const hasSpaces =
      isRecord(spacesStage) && Array.isArray((spacesStage as JsonRecord).spaces) && ((spacesStage as JsonRecord).spaces as unknown[]).length > 0;
    const hasDetails = isRecord(stageResults.details);

    if (stageName === 'Details') {
      if (hasSpaces) return undefined;
      return {
        title: 'Missing Spaces stage data',
        message:
          'This stage depends on your generated spaces. The current session does not have a valid `stageResults.spaces.spaces` array, so the AI may produce low-quality or inconsistent details. You can continue, but it is strongly recommended to fix spaces first.',
        fixStageName: 'Spaces',
        fixLabel: 'Fix now (go to Spaces)',
      };
    }

    if (stageName === 'Accuracy Refinement') {
      if (!hasSpaces) {
        return {
          title: 'Missing Spaces stage data',
          message:
            'Accuracy Refinement validates geometry/connections, which requires your spaces. This session does not have a valid `stageResults.spaces.spaces` array. You can continue, but the report may be incomplete or misleading.',
          fixStageName: 'Spaces',
          fixLabel: 'Fix now (go to Spaces)',
        };
      }

      if (!hasDetails) {
        return {
          title: 'Missing Details stage data',
          message:
            'Accuracy Refinement also uses narrative/location detail context. This session does not have a valid `stageResults.details` object. You can continue, but the output may be less useful.',
          fixStageName: 'Details',
          fixLabel: 'Fix now (go to Details)',
        };
      }
    }

    return undefined;
  })();

  const manualStagePrompt = buildManualStagePrompt({
    workflowType: config ? resolveWorkflowTypeFromConfigType(config.type) : 'unknown',
    workflowLabel: config ? getWorkflowLabel(resolveWorkflowTypeFromConfigType(config.type)) : 'Content Generator',
    currentData: stageResults,
    compiledStageRequest: compiledStageRequest || undefined,
    projectId: projectId !== 'default' ? projectId : undefined,
    runState: workflowRunState || undefined,
  });

  // Helper function to update and save stage results
  const saveStageResults = async (results: StageResults, stageIndex: number) => {
    if (!autoSaveEnabled || !progressSession) return;

    try {
      // Update the session with the latest stage results and stage index
      const updatedSession: GenerationProgress = attachWorkflowMetadataToSession({
        ...progressSession,
        lastUpdatedAt: new Date().toISOString(),
        stageResults: results as unknown as Record<string, unknown>,
        currentStageIndex: stageIndex,
      });

      setProgressSession(updatedSession);
      await saveProgress(updatedSession);
      console.log(`[Auto-Save] Saved stage results for stage ${stageIndex}`);
    } catch (error) {
      console.error('[Auto-Save] Failed to save stage results:', error);
    }
  };

  /**
   * Atomically update state and persist to session
   * PATTERN: Use this whenever advancing stages or completing chunks
   */
  const saveStateAndSession = async (updates: {
    currentStageIndex?: number;
    stageResults?: StageResults;
    /**
     * Optional updated chunking state for the current stage.
     * When provided, this completely replaces the previous StageChunkState on the session.
     */
    stageChunkState?: StageChunkState;
  }) => {
    if (!autoSaveEnabled || !progressSession) return;

    try {
      const updatedSession: GenerationProgress = attachWorkflowMetadataToSession({
        ...progressSession,
        lastUpdatedAt: new Date().toISOString(),
        currentStageIndex: updates.currentStageIndex ?? currentStageIndex,
        stageResults: (updates.stageResults ?? stageResults) as unknown as Record<string, unknown>,
        stageChunkState: updates.stageChunkState ?? progressSession.stageChunkState,
      });

      setProgressSession(updatedSession);
      await saveProgress(updatedSession);
      console.log(`[Auto-Save] Saved state update:`, updates);
    } catch (error) {
      console.error('[Auto-Save] Failed to save state update:', error);
    }
  };

  // Handle resuming from a saved session
  const handleResumeSession = (session: GenerationProgress) => {
    console.log('[Resume] Restoring session:', session.sessionId);
    console.log('[Resume] Session currentStageIndex:', session.currentStageIndex);
    console.log('[Resume] Session stageChunkState:', session.stageChunkState);
    console.log('[Resume] Progress entries count:', session.progress?.length || 0);

    const restoredExecutionMode = session.workflowRunState?.executionMode;
    if (restoredExecutionMode === 'integrated' || restoredExecutionMode === 'manual') {
      setAssistMode(restoredExecutionMode);
    }

    // Restore configuration (with type conversion)
    setConfig(session.config as unknown as GenerationConfig);

    // Restore stage results
    setStageResults(session.stageResults as StageResults);

    // Restore current stage
    const restoredStageIndex = session.currentStageIndex;
    console.log(`[Resume] Setting currentStageIndex to ${restoredStageIndex} (${STAGES[restoredStageIndex]?.name || 'Unknown'})`);
    setCurrentStageIndex(restoredStageIndex);

    // Restore multi-chunk state
    if (session.multiChunkState.isMultiPartGeneration) {
      setIsMultiPartGeneration(true);
      setCurrentGroupIndex(session.multiChunkState.currentGroupIndex);
      if (session.multiChunkState.factGroups) {
        setChunkingState((prev) => ({
          ...prev,
          factGroups: session.multiChunkState.factGroups as unknown as FactGroup[],
          mode: 'facts',
        }));
      }
    }

    const restoredChunkState = restoreWorkflowStageChunkState(session);
    const accumulatedChunks = restoredChunkState.accumulatedChunks;
    const savedLiveMapSpaces = restoredChunkState.savedLiveMapSpaces;
    const needsMigration = restoredChunkState.needsMigration;

    if (restoredChunkState.restoreSource === 'stageChunkState') {
      console.log('[Resume] Loading from stageChunkState (modern format)');
    } else if (restoredChunkState.restoreSource === 'legacy') {
      console.log('[Resume] Loading from top-level fields (legacy format) - will migrate to stageChunkState');
    } else if (restoredChunkState.restoreSource === 'progress') {
      console.log(`[Resume] Reconstructed ${accumulatedChunks.length} spaces from saved progress entries`);
    } else if (restoredChunkState.restoreSource === 'derived') {
      console.log('[Resume] Derived location chunk metadata from accumulated spaces and purpose data');
    }

    if (restoredChunkState.normalizedStageChunkState) {
      console.log('[Resume] Restoring normalized stageChunkState:', {
        isStageChunking: restoredChunkState.normalizedStageChunkState.isStageChunking,
        currentStageChunk: restoredChunkState.normalizedStageChunkState.currentStageChunk,
        totalStageChunks: restoredChunkState.normalizedStageChunkState.totalStageChunks,
        accumulatedChunks: accumulatedChunks.length,
        liveMapSpaces: savedLiveMapSpaces.length,
        source: restoredChunkState.restoreSource,
      });

      setIsStageChunking(restoredChunkState.normalizedStageChunkState.isStageChunking);
      setCurrentStageChunk(restoredChunkState.normalizedStageChunkState.currentStageChunk);
      setTotalStageChunks(restoredChunkState.normalizedStageChunkState.totalStageChunks);
      setAccumulatedChunkResults(accumulatedChunks);

      if (savedLiveMapSpaces.length > 0) {
        console.log('[Resume] Loading savedLiveMapSpaces - sample positions:',
          savedLiveMapSpaces.slice(0, 3).map(s => ({
            name: s.name,
            position: s.position,
            position_locked: s.position_locked
          }))
        );
        console.log('[Resume] FULL savedLiveMapSpaces:', savedLiveMapSpaces.map(logLiveMapSpacePosition));
        const syncedSpaces = syncLocationLiveMapSpaces(savedLiveMapSpaces);
        console.log('[Resume] Synchronized reciprocal doors for', syncedSpaces.length, 'saved spaces');
        setLiveMapSpaces(syncedSpaces);
        setShowLiveMap(restoredChunkState.normalizedStageChunkState.showLiveMap);
        console.log('[Resume] ✓ setLiveMapSpaces called with', syncedSpaces.length, 'spaces');
      } else if (restoredChunkState.shouldRebuildLiveMapFromChunks) {
        console.log('[Resume] Rebuilding live map from accumulated chunks');
        const rebuiltSpaces = syncLocationLiveMapSpaces(
          accumulatedChunks.map((chunk: any) => extractLocationSpaceForMap(chunk))
        );
        console.log('[Resume] Synchronized reciprocal doors for', rebuiltSpaces.length, 'rebuilt spaces');
        setLiveMapSpaces(rebuiltSpaces);
        setShowLiveMap(true);
      }
    }

    // Restore factpack if available
    if (session.factpack) {
      setFactpack(session.factpack as unknown as Factpack);
    }

    // Restore the session itself
    setWorkflowRunState(session.workflowRunState ?? null);
    setProgressSession(attachWorkflowMetadataToSession(session));

    // MIGRATION: If loaded from legacy top-level fields, migrate to stageChunkState
    if (needsMigration && restoredChunkState.normalizedStageChunkState) {
      console.log('[Resume] Migrating legacy session to stageChunkState format...');
      const migratedSession: GenerationProgress = {
        ...session,
        lastUpdatedAt: new Date().toISOString(),
        stageChunkState: restoredChunkState.normalizedStageChunkState,
      };

      // Save migrated format
      saveProgress(attachWorkflowMetadataToSession(migratedSession))
        .then(() => {
          console.log('[Resume] ✓ Migration complete - session now uses stageChunkState');
          setProgressSession(attachWorkflowMetadataToSession(migratedSession));
        })
        .catch(err => console.error('[Resume] Migration save failed:', err));
    }

    // Build effective chunk state from session OR reconstructed metadata
    const effectiveChunkState = restoredChunkState.effectiveChunkState;
    const finalStageResults = session.stageResults as StageResults;
    const restoredFinal = resolveCompletedWorkflowOutput({
      workflowType: (session.config as unknown as GenerationConfig | undefined)?.type || 'unknown',
      fallbackType: (session.config as unknown as GenerationConfig | undefined)?.type || 'unknown',
      stageResults: finalStageResults,
      ruleBase:
        typeof (session.config as unknown as GenerationConfig | undefined)?.flags?.rule_base === 'string'
          ? String((session.config as unknown as GenerationConfig).flags.rule_base)
          : undefined,
    });

    const resumeAction = resolveWorkflowResumeAction({
      session,
      stages: STAGES,
      effectiveChunkState,
      finalOutput: restoredFinal,
    });

    if (resumeAction.kind === 'pending_prompt' && resumeAction.stageIndex !== session.currentStageIndex) {
      console.warn(`[Resume] Correcting stage from ${session.currentStageIndex} to ${resumeAction.stageIndex} (${resumeAction.stageName})`);
    } else if (resumeAction.kind === 'stage_chunk' && resumeAction.stageIndex !== session.currentStageIndex) {
      console.warn(`[Resume] Correcting stage from ${session.currentStageIndex} to ${resumeAction.stageIndex} (Spaces) - more spaces to generate`);
    }

    if (resumeAction.kind === 'pending_prompt') {
      console.log('[Resume] Resuming at pending prompt for stage:', resumeAction.stageName);
    } else if (resumeAction.kind === 'stage_chunk') {
      console.log(`[Resume] Continuing stage chunking from chunk ${resumeAction.chunkInfo.currentChunk}/${resumeAction.chunkInfo.totalChunks}`);
    } else if (resumeAction.kind === 'stage') {
      console.log('[Resume] Showing stage output for index:', resumeAction.stageIndex);
    } else if (resumeAction.kind === 'completed') {
      console.log('[Resume] Session was already complete or at final stage');
    }

    const launchPlan = buildWorkflowResumeLaunchPlan({
      resumeAction,
      stageResults: finalStageResults,
      factpack: session.factpack as unknown as Factpack || null,
      retryNoticeBuilder: buildWorkflowRetryPromptNotice,
      compiledStageRequest: session.compiledStageRequest ?? null,
    });

    executeWorkflowStageLaunch(launchPlan, {
      runtimeConfig: session.config as unknown as GenerationConfig,
    });
  };

  // Helper function to check if factpack needs chunking and show modal if needed
  const checkForChunking = (factpack: Factpack, stageName?: string): boolean => {
    // SPECIAL CASE: NPC Creator stage uses section-based chunking
    // This forces controlled chunking by NPC section (Basic Info, Stats, Combat, etc.)
    // rather than by fact size
    if (config?.type === 'npc' && stageName === 'Creator') {
      console.log(`🎯 [NPC Section Chunking] Detected NPC Creator stage - forcing section-based chunking`);
      const sections = getNpcSectionChunks();
      setCurrentNpcSectionIndex(0);
      setAccumulatedNpcSections({});
      console.log(`├─ Total Sections: ${sections.length}`);
      console.log(`└─ Sections: ${sections.map(s => s.chunkLabel).join(', ')}`);

      setChunkingState(openNpcSectionWorkflowChunking(sections));
      return true; // Always chunk NPCs by section
    }

    // Normal fact-based chunking for non-NPC stages
    const totalChars = factpack.facts.reduce((sum, fact) => sum + fact.text.length, 0);

    // Calculate available space based on typical stage overhead
    // Using conservative estimates for overhead
    const typicalSystemPromptSize = 2000; // Most stages have 1500-2500 char system prompts
    const typicalUserPromptBase = 800; // Config, type, flags, formatting
    const typicalAccumulatedAnswers = 1000; // Grows over stages
    const typicalNpcSchema = (config?.type === 'npc' || config?.type === 'monster') ? 600 : 0;

    const estimatedOverhead = typicalSystemPromptSize + typicalUserPromptBase + typicalAccumulatedAnswers + typicalNpcSchema + 200; // +200 formatting
    const availableForFacts = Math.max(1000, PROMPT_LIMITS.AI_HARD_LIMIT - estimatedOverhead); // Minimum 1000 chars for facts

    console.log(`[Fact Chunking Check] Stage: ${stageName || 'Unknown'}`);
    console.log(`├─ Total Facts: ${factpack.facts.length} facts, ${totalChars.toLocaleString()} chars`);
    console.log(`├─ Estimated Overhead: ${estimatedOverhead.toLocaleString()} chars`);
    console.log(`├─ Available for Facts: ${availableForFacts.toLocaleString()} chars`);
    console.log(`└─ Needs Chunking: ${totalChars > availableForFacts ? 'YES' : 'NO'}`);

    if (totalChars > availableForFacts) {
      console.log(`⚠️ [Fact Chunking] Facts (${totalChars.toLocaleString()}) exceed available space (${availableForFacts.toLocaleString()}). Showing chunking modal.`);
      const groups = groupFactsIntelligently(factpack, availableForFacts);
      setChunkingState(openFactWorkflowChunking({
        pendingFactpack: factpack,
        factGroups: groups,
      }));
      return true; // Needs chunking
    }

    return false; // No chunking needed
  };

  // Helper function to search canon with keywords
  const searchCanonWithKeywords = async (keywords: string[]): Promise<Factpack> => {
    const workflowType = config ? resolveWorkflowTypeFromConfigType(config.type) : 'unknown';
    const searchResult = await searchWorkflowCanonByKeywords({
      keywords,
      projectId: projectId !== 'default' ? projectId : undefined,
      apiBaseUrl: API_BASE_URL,
      workflowType,
    });

    if (projectId && projectId !== 'default' && searchResult.searchedScope === 'library') {
      console.log('[ManualGenerator] Project canon search is empty. Falling back to library scope for retrieval.');
    }

    console.log(`[ManualGenerator] Searching canon in ${searchResult.searchedScope} scope (${searchResult.availableEntityCount} entities available)`);
    console.log(`[ManualGenerator] Filtered to ${searchResult.matchedEntityCount} relevant entities from ${searchResult.availableEntityCount} total (${searchResult.searchedScope} scope)`);
    console.log(`[ManualGenerator] Keywords searched: ${keywords.join(', ')}`);

    if (searchResult.groundingStatus === 'ungrounded' && searchResult.factpack.gaps.some((gap) => gap.startsWith('Error searching canon:'))) {
      console.error('[searchCanonWithKeywords]', searchResult.factpack.gaps[0]);
    }

    setRetrievalGroundingStatus(searchResult.groundingStatus);
    return searchResult.factpack;
  };

  const handleUploadedJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const text = await file.text();

      const parseResult = parseAIResponse<JsonRecord>(text);
      if (!parseResult.success) {
        const errorMessage = formatParseError(parseResult);
        throw new Error(`Invalid JSON file:\n\n${errorMessage}`);
      }

      const parsed: JsonRecord = parseResult.data || {};

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Uploaded JSON must represent an object with content fields.');
      }

      const restoredUpload = restoreUploadedWorkflowContent(parsed, uploadedContentType);
      let contentToUse: JsonRecord = restoredUpload.content;

      if (restoredUpload.logLabel) {
        if (restoredUpload.logDetails) {
          console.log(`[Upload] ${restoredUpload.logLabel}`, restoredUpload.logDetails);
        } else {
          console.log(`[Upload] ${restoredUpload.logLabel}`);
        }
      }

      if (restoredUpload.conflicts && restoredUpload.conflicts.length > 0) {
        console.warn('[Upload NPC Merge Conflicts]', restoredUpload.conflicts);
      }

      // Use the user's selected deliverable type from the dropdown
      // This allows users to correct mistyped uploads (e.g., monster labeled as npc)
      const normalized: JsonRecord = {
        ...contentToUse,
        deliverable: uploadedContentType, // Use dropdown selection, not inferred
        type: uploadedContentType, // Also set type field to match deliverable
      };

      // Monster-specific normalization
      if (uploadedContentType === 'monster') {
        // Keep hit_points as-is (integer or object {average, formula}) - schema accepts both
        // Don't convert to string

        // Normalize saving throws: ensure value is string, remove notes
        if (Array.isArray(normalized.saving_throws)) {
          normalized.saving_throws = normalized.saving_throws.map((st: any) => {
            if (st && typeof st === 'object') {
              return {
                name: st.name,
                value: typeof st.value === 'number' ? (st.value >= 0 ? `+${st.value}` : `${st.value}`) : String(st.value),
                // Omit notes - schema doesn't require it
              };
            }
            return st;
          });
        }

        // Normalize skill proficiencies: ensure value is string, remove notes
        if (Array.isArray(normalized.skill_proficiencies)) {
          normalized.skill_proficiencies = normalized.skill_proficiencies.map((skill: any) => {
            if (skill && typeof skill === 'object') {
              return {
                name: skill.name,
                value: typeof skill.value === 'number' ? (skill.value >= 0 ? `+${skill.value}` : `${skill.value}`) : String(skill.value),
                // Omit notes - schema doesn't require it
              };
            }
            return skill;
          });
        }
      }

      if (!('title' in normalized) || typeof normalized.title !== 'string') {
        const canonicalName = 'canonical_name' in contentToUse && typeof contentToUse.canonical_name === 'string'
          ? contentToUse.canonical_name
          : undefined;
        normalized.title = canonicalName || file.name.replace(/\.json$/i, '');
      }

      console.log('[Upload] Normalized content:', normalized);

      resetPipelineState();
      const rawProposals = (normalized as Record<string, unknown>)['proposals'] as unknown;
      const proposals: Proposal[] = Array.isArray(rawProposals)
        ? (rawProposals as unknown[])
          .map((p) => (isRecord(p) ? p : null))
          .filter((p): p is JsonRecord => p !== null)
          .map((p: JsonRecord) => ({
            question: getString(p, 'question') || 'Unspecified',
            options: toStringArray((p as Record<string, unknown>)['options']),
            rule_impact: getString(p, 'rule_impact') || '',
          }))
        : [];

      const rawConflicts = (normalized as Record<string, unknown>)['conflicts'] as unknown;
      const conflicts: Conflict[] = Array.isArray(rawConflicts)
        ? (rawConflicts as unknown[])
          .map((c) => (isRecord(c) ? c : null))
          .filter((c): c is JsonRecord => c !== null)
          .map((c: JsonRecord) => ({
            new_claim: getString(c, 'new_claim') || '',
            existing_claim: getString(c, 'existing_claim') || '',
            entity_id: getString(c, 'entity_id') || '',
            entity_name: getString(c, 'entity_name') || '',
            resolution: (getString(c, 'resolution') as Conflict['resolution']) || undefined,
          }))
        : [];

      setResolvedProposals(proposals);
      setResolvedConflicts(conflicts);

      const titleText = typeof (normalized as JsonRecord).title === 'string'
        ? ((normalized as JsonRecord).title as string)
        : String(((normalized as JsonRecord).title as unknown) ?? 'Untitled');
      executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
        finalOutput: normalized,
        alertMessage: `✅ Uploaded content loaded!\n\nTitle: ${titleText}\nDeliverable: ${uploadedContentType}`,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process uploaded JSON.';
      setUploadError(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  /** Intercept Generate button: show mode selection dialog first */
  const handleGenerate = (generationConfig: GenerationConfig) => {
    setPendingGenerationConfig(generationConfig);
    setShowModeSelection(true);
  };

  /** Called after user selects a mode from the dialog */
  const handleModeSelected = async (mode: 'integrated' | 'manual') => {
    setAssistMode(mode);
    setShowModeSelection(false);

    const generationConfig = pendingGenerationConfig;
    if (!generationConfig) return;
    setPendingGenerationConfig(null);

    if (mode === 'integrated') {
      // Open AI panel for integrated mode
      openPanel();
    }

    await proceedWithGeneration(generationConfig);
  };

  /** Actual generation logic (after mode is selected) */
  const proceedWithGeneration = async (generationConfig: GenerationConfig) => {
    setConfig(generationConfig);
    setStageResults({});
    setError(null);
    setLastStageError(null);
    setSessionStatus('running');
    setIsComplete(false);
    setFinalOutput(null);

    // Create a new progress session for auto-save
    let createdProgressSession: GenerationProgress | null = null;
    if (autoSaveEnabled) {
      const session = attachWorkflowMetadataToSession(
        createProgressSession(generationConfig as unknown as import('../utils/generationProgress').GenerationConfig),
      );
      createdProgressSession = session;
      setProgressSession(session);
      await saveProgress(session);
      console.log('[Auto-Save] New generation session created:', session.sessionId);
    }

    // Handle homebrew document extraction differently
    if (generationConfig.type === 'homebrew' && generationConfig.homebrewFile) {
      try {
        // Upload file to backend for chunking
        const formData = new FormData();
        formData.append('file', generationConfig.homebrewFile);

        const response = await fetch(`${API_BASE_URL}/homebrew/chunk`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to process homebrew file');
        }

        const chunkData = await response.json();

        console.log(`[Homebrew] File chunked into ${chunkData.totalChunks} chunks`);

        // Store chunks in state for sequential processing
        const homebrewChunks = chunkData.chunks;
        if (!Array.isArray(homebrewChunks) || homebrewChunks.length === 0) {
          throw new Error('Homebrew chunking returned no chunks to process.');
        }
        const initialStageResults = buildWorkflowHomebrewStageResults(homebrewChunks);
        const launchPlan = buildWorkflowPromptLaunchPlan({
          stageIndex: 0,
          stageResults: initialStageResults,
          factpack: {
            facts: [],
            entities: [],
            gaps: [],
          },
          prompt: homebrewChunks[0].prompt,
          modalMode: 'output',
        });

        executeWorkflowStageLaunch(launchPlan, {
          runtimeConfig: generationConfig,
        });
        await persistDirectPromptLaunchSession({
          baseSession: createdProgressSession,
          runtimeConfig: generationConfig,
          plan: launchPlan,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process homebrew file';
        setError(`Homebrew extraction error: ${message}`);
      }
      return;
    }

    // Normal flow for other content types
    setCurrentStageIndex(0); // Start at Keyword Extractor (index 0)

    // Initialize empty factpack - will be populated after keyword extraction
    setFactpack({
      facts: [],
      entities: [],
      gaps: ['Factpack will be populated after the initial stage'],
    });

    // Show first stage prompt (Keyword Extractor)
    const launchPlan = buildWorkflowJumpToStageLaunchPlan({
      stageIndex: 0,
      stageResults: {} as StageResults,
      factpack: null,
    });
    executeWorkflowStageLaunch(launchPlan, {
      runtimeConfig: generationConfig,
    });
  };

  const showStageOutput = async (
    stageIndex: number,
    cfg: GenerationConfig,
    results: StageResults,
    fp: Factpack | null,
    chunkInfo?: { isChunked: boolean; currentChunk: number; totalChunks: number; chunkLabel: string },
    unansweredProposals?: unknown[],
    overrideDecisions?: Record<string, string>,
    additionalGuidance?: string,
    promptOverrides?: StagePromptOverrides,
  ) => {
    const effectiveRetrySource = promptOverrides?.retrySource ?? null;
    const effectiveConfig =
      promptOverrides?.flags && Object.keys(promptOverrides.flags).length > 0
        ? {
            ...cfg,
            flags: {
              ...cfg.flags,
              ...promptOverrides.flags,
            },
          }
        : cfg;

    setCurrentPromptNotice(
      promptOverrides?.promptNotice
      ?? (effectiveRetrySource ? buildWorkflowRetryPromptNotice(effectiveRetrySource) : null),
    );
    setCurrentStageRetrySource(effectiveRetrySource);

    // Compute stages dynamically from cfg parameter to avoid React state timing issues
    const stages = getGeneratorStages(effectiveConfig?.type, STAGE_CATALOG, dynamicNpcStagesRef.current);
    const stage = stages[stageIndex];

    // Store chunkInfo in state so it persists across stages
    if (chunkInfo) {
      setCurrentChunkInfo(chunkInfo);
    }

    setCompiledStageRequest(null);

    // Limit accumulated answers to prevent exceeding character limits in the JSON prompt
    const effectiveDecisions = overrideDecisions && Object.keys(overrideDecisions).length > 0
      ? overrideDecisions
      : accumulatedAnswers;
    const limitedDecisions = Object.keys(effectiveDecisions).length > 0
      ? limitAccumulatedAnswers(effectiveDecisions, 4000)
      : undefined;

    // Check if this is an NPC or Monster generation stage that needs schema guidance
    const isNpcStage = effectiveConfig.type === 'npc' && (stage.name === 'Creator' || stage.name === 'Stylist');
    const isMonsterStage = effectiveConfig.type === 'monster' && (stage.name === 'Creator' || stage.name === 'Stylist');
    let npcSchemaGuidance: string | undefined;

    if (isNpcStage) {
      npcSchemaGuidance = `
⚠️ CRITICAL: NPC OUTPUT SCHEMA ⚠️

Your NPC output MUST conform to the schema structure. Use EXACT field names:

REQUIRED FIELDS:
- name (string), description (string, min 20 chars), race, class_levels
- ability_scores: {str, dex, con, int, wis, cha} - LOWERCASE ONLY
- proficiency_bonus, personality: {traits[], ideals[], bonds[], flaws[]}
- motivations[], rule_base, sources_used[], assumptions[], proposals[], canon_update

CHARACTER BUILD FIELDS (CRITICAL for D&D NPCs with class levels):
- class_features: Array<{name, description, level, source, uses?, notes?}> — ALL base class features from level 1 to character level
- subclass_features: Array<{name, description, level, source, uses?, notes?}> — ALL subclass/archetype features
- racial_features: Array<{name, description, source?, notes?}> — ALL racial traits (Darkvision, Fey Ancestry, etc.)
- feats: Array<{name, description, source?, prerequisite?, notes?}> — ALL feats from ASI, background, racial bonus
- asi_choices: Array<{level, choice, details?, source_class?}> — ASI/feat choices at each ASI level
- background_feature: {background_name, feature_name, description, origin_feat?, skill_proficiencies?, tool_proficiencies?}

CRITICAL NAMING RULES:
1. Ability scores: Use LOWERCASE: str, dex, con, int, wis, cha (NOT STR, DEX, etc.)
2. Special abilities: Use "abilities" field (NOT "traits")
3. Equipment: Flat array of strings (NOT nested under "carried")
4. Magic items: Array of strings or objects with "name" property
5. Personality: Nested object {traits: [], ideals: [], bonds: [], flaws: []}

Example (CORRECT): {"ability_scores": {"str": 18, "dex": 16, ...}, "personality": {"traits": ["Brave"], ...}}
Example (WRONG): {"ability_scores": {"STR": 18, ...}, "personality_traits": ["Brave"], ...}

Validation will reject incorrect field names.`;
    }

    if (isMonsterStage) {
      npcSchemaGuidance = `
⚠️ CRITICAL: MONSTER OUTPUT SCHEMA ⚠️

Your Monster output MUST conform to the D&D 5e monster stat block schema. Use EXACT field names:

REQUIRED FIELDS:
- name (string), description (string, min 20 chars)
- size (string): Tiny, Small, Medium, Large, Huge, or Gargantuan
- creature_type (string): Aberration, Beast, Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, or Undead
- alignment (string), challenge_rating (string like "1/4", "1", "5"), experience_points (integer)
- ability_scores: {str, dex, con, int, wis, cha} - LOWERCASE ONLY, integers 1-30
- proficiency_bonus (integer +2 to +9 based on CR)
- armor_class (integer or object), hit_points (integer or object with average/formula)
- actions[] (array of objects with name, description)
- rule_base, sources_used[], assumptions[], proposals[], canon_update

OPTIONAL BUT COMMON:
- subtype, speed {walk, fly, swim, climb, burrow, hover}
- saving_throws[], skill_proficiencies[], damage_resistances[], damage_immunities[]
- condition_immunities[], senses[], languages[], abilities[]
- bonus_actions[], reactions[], legendary_actions {summary, options[]}
- tactics (combat strategy), ecology (habitat/behavior), lore (background)

CRITICAL NAMING RULES:
1. Ability scores: LOWERCASE only (str, dex, con, int, wis, cha)
2. Actions/abilities: Use "actions" for attacks, "abilities" for passive features
3. CR as string: "1/8", "1/4", "1/2", "1", "5", "20" etc.
4. Arrays of objects must have "name" and "description" fields minimum

Example (CORRECT): {"size": "Large", "creature_type": "Dragon", "challenge_rating": "10", "ability_scores": {"str": 23, "dex": 10, ...}}

Validation will reject incorrect field names or missing required fields.`;
    }

    // Don't condense system prompts - preserve quality
    // If chunking is needed, chunk 1 can have zero facts and all facts go to chunks 2+
    const actualSystemPrompt = stage.systemPrompt;

    const stageNeedsCanon = stage.name !== 'Purpose' && stage.name !== 'Keyword Extractor';

    // Only use factpack if this stage needs canon AND we have facts
    let limitedFactpack: Factpack | null = null;
    if (stageNeedsCanon) {
      limitedFactpack = fp || factpack; // Use provided factpack or fallback to state

      // Filter canon for location stages - only World/Setting and Locations
      const isLocationStage = ['Foundation', 'Spaces', 'Details', 'Accuracy Refinement'].includes(stage.name);
      if (isLocationStage && limitedFactpack && limitedFactpack.facts) {
        const filteredFacts = limitedFactpack.facts.filter(fact => {
          const type = (fact.type ?? fact.entity_type)?.toLowerCase();
          return type === 'world' || type === 'setting' || type === 'location';
        });
        console.log(`[Canon Filter] Location stage "${stage.name}": Filtered ${limitedFactpack.facts.length} facts to ${filteredFacts.length} (World/Setting/Location only)`);
        limitedFactpack = {
          ...limitedFactpack,
          facts: filteredFacts,
        };
      }
    } else {
      // For non-canon stages (Purpose, Keyword Extractor), always use null
      limitedFactpack = null;
    }

    let spaceCalculation: ReturnType<typeof calculateAvailableFactSpace> | null = null;

    let hasCanonFacts = false;

    const hasFactpackFacts =
      !!(limitedFactpack && Array.isArray(limitedFactpack.facts) && limitedFactpack.facts.length > 0);

    if (hasFactpackFacts) {
      // Calculate available space ONLY for stages that use facts
      // Build minimal context to get accurate user prompt size

      // Build NPC section context for estimation if needed
      let minimalNpcContext: StageContext['npcSectionContext'] | undefined;
      if (isNpcSectionChunking && stage.name === 'Creator') {
        const currentSection = npcSectionChunks[currentNpcSectionIndex] || null;
        minimalNpcContext = {
          isNpcSectionChunking: true,
          currentSectionIndex: currentNpcSectionIndex,
          currentSection: currentSection,
          accumulatedSections: accumulatedNpcSections,
        };
      }

      const minimalContext: StageContext = {
        config: effectiveConfig,
        stageResults: results,
        factpack: { facts: [], entities: [], gaps: [] }, // Empty factpack for estimation
        chunkInfo: chunkInfo || currentChunkInfo,
        previousDecisions: limitedDecisions,
        unansweredProposals: unansweredProposals,
        npcSectionContext: minimalNpcContext,
      };

      const userPromptWithoutFacts = stage.buildUserPrompt(minimalContext);

      const stageEmbedsCanonFacts = userPromptWithoutFacts.includes('"relevant_canon"');
      hasCanonFacts = stageEmbedsCanonFacts;

      if (!stageEmbedsCanonFacts) {
        console.log(`[Fact Space] ${stage.name}: Prompt does not embed canon facts (likely using canon_reference). Skipping fact chunking check.`);
      }

      if (!stageEmbedsCanonFacts) {
        spaceCalculation = null;
      } else {

        spaceCalculation = calculateAvailableFactSpace(
          actualSystemPrompt,  // Use condensed prompt if needed
          userPromptWithoutFacts,  // This already includes previousDecisions in the JSON
          {
            // Don't pass accumulated answers - they're already in userPromptWithoutFacts via previousDecisions
            accumulatedAnswers: undefined,
            npcSchemaGuidance,
            forceIncludeSchema: isNpcStage,
          }
        );

        console.log(`\n📐 Available Fact Space Calculation for ${stage.name}:`);
        console.log(`├─ System Prompt: ${spaceCalculation.breakdown.systemPrompt.toLocaleString()} chars`);
        console.log(`├─ User Prompt Base: ${spaceCalculation.breakdown.userPromptBase.toLocaleString()} chars`);
        console.log(`├─ Formatting: ${spaceCalculation.breakdown.formatting.toLocaleString()} chars`);
        console.log(`├─ Accumulated Answers: ${spaceCalculation.breakdown.accumulatedAnswers.toLocaleString()} chars`);
        console.log(`├─ NPC Schema: ${spaceCalculation.breakdown.npcSchema.toLocaleString()} chars`);
        console.log(`├─ Total Overhead: ${spaceCalculation.overhead.toLocaleString()} chars`);
        console.log(`└─ Available for Facts: ${spaceCalculation.availableForFacts.toLocaleString()} chars\n`);

        const factpackForChunking = limitedFactpack;
        if (!factpackForChunking) {
          setError(`[${stage.name}] Fact chunking failed: canon factpack was unexpectedly unavailable.`);
          return;
        }
        const totalFactChars = factpackForChunking.facts.reduce((sum, f) => sum + f.text.length, 0);

        if (totalFactChars > spaceCalculation.availableForFacts) {
          console.warn(`⚠️ Facts (${totalFactChars.toLocaleString()} chars) exceed available space (${spaceCalculation.availableForFacts.toLocaleString()} chars).`);

          // If we have enough facts to chunk, trigger chunking instead of trimming
          // BUT: don't re-trigger if we're already in multi-part mode (prevents infinite loops)
          if (factpackForChunking.facts.length > 10 && !isMultiPartGeneration) {
            console.log(`📦 Triggering chunking for ${stage.name} stage (${factpackForChunking.facts.length} facts, ${totalFactChars.toLocaleString()} chars)`);

            // IMPORTANT: Chunk 1 uses full prompt (limited space), but chunks 2+ use minimal prompts (much more space)
            // Estimate minimal prompt overhead: ~500 chars system + ~200 chars user base + ~200 formatting = ~900 chars
            const minimalPromptOverhead = 900;
            const availableForSubsequentChunks = PROMPT_LIMITS.AI_HARD_LIMIT - minimalPromptOverhead;

            // CRITICAL: Chunk 1 needs LESS space because we add multi-part instructions (~300 chars) to system prompt
            const multiPartInstructionsOverhead = 300;
            const availableForChunk1 = Math.max(0, spaceCalculation.availableForFacts - multiPartInstructionsOverhead);

            console.log(`📊 Chunking Strategy:`);
            console.log(`   Chunk 1 space: ${availableForChunk1.toLocaleString()} chars (full prompt + multi-part instructions)`);
            console.log(`   Chunks 2+ space: ${availableForSubsequentChunks.toLocaleString()} chars each (with minimal prompts)`);

            // Group facts intelligently - use the larger limit for subsequent chunks
            const groups = groupFactsIntelligently(factpackForChunking, availableForSubsequentChunks);

            // If chunk 1 has very little space (<500 chars), give it ZERO facts and put everything in chunks 2+
            if (availableForChunk1 < 500) {
              console.log(`⚠️ Chunk 1 has minimal space (${availableForChunk1} chars). Putting ALL facts in chunks 2+.`);

              // Create empty chunk 1 + all fact groups
              const newGroups: FactGroup[] = [
                {
                  id: 'chunk1-intro',
                  label: 'Introduction (No Facts)',
                  facts: [],
                  characterCount: 0,
                  entityTypes: [],
                  regions: [],
                },
                ...groups,
              ];

              console.log(`📦 Created ${newGroups.length} groups: 1 intro + ${groups.length} fact groups`);
              setChunkingState(openFactWorkflowChunking({
                pendingFactpack: factpackForChunking,
                factGroups: newGroups,
              }));
            }
            // Otherwise, try to fit some facts in chunk 1
            else if (groups.length > 0 && groups[0].characterCount > availableForChunk1) {
              console.log(`⚠️ First group (${groups[0].characterCount} chars) exceeds chunk 1 space (${availableForChunk1} chars). Splitting...`);

              // Split first group into two: some for chunk 1, rest goes into chunk 2
              const firstGroupFacts = groups[0].facts;
              const chunk1Facts: CanonFact[] = [];
              let chunk1Chars = 0;
              let remainingFactsIndex = 0;

              for (let i = 0; i < firstGroupFacts.length; i++) {
                if (chunk1Chars + firstGroupFacts[i].text.length <= availableForChunk1) {
                  chunk1Facts.push(firstGroupFacts[i]);
                  chunk1Chars += firstGroupFacts[i].text.length;
                  remainingFactsIndex = i + 1;
                } else {
                  break;
                }
              }

              // Create new groups array with split first group
              const remainingFacts = firstGroupFacts.slice(remainingFactsIndex);
              const newGroups: FactGroup[] = [
                {
                  ...groups[0],
                  id: 'chunk1',
                  label: `${groups[0].label} (Chunk 1 - ${chunk1Facts.length} facts)`,
                  facts: chunk1Facts,
                  characterCount: chunk1Chars,
                },
                {
                  ...groups[0],
                  id: 'chunk2-part1',
                  label: `${groups[0].label} (Continued)`,
                  facts: remainingFacts,
                  characterCount: remainingFacts.reduce((sum, f) => sum + f.text.length, 0),
                },
                ...groups.slice(1), // Rest of the groups
              ];

              console.log(`📦 Split into ${newGroups.length} groups for efficient chunking`);
              setChunkingState(openFactWorkflowChunking({
                pendingFactpack: factpackForChunking,
                factGroups: newGroups,
              }));
            } else {
              setChunkingState(openFactWorkflowChunking({
                pendingFactpack: factpackForChunking,
                factGroups: groups,
              }));
            }

            const estimatedChunks = Math.max(2, Math.ceil((totalFactChars - spaceCalculation.availableForFacts) / availableForSubsequentChunks) + 1);
            setError(`The ${stage.name} stage has too much canon data (${totalFactChars.toLocaleString()} chars) to fit in one prompt (only ${spaceCalculation.availableForFacts.toLocaleString()} chars available for facts after prompt overhead). Estimated ${estimatedChunks} chunks needed. Please approve chunking.`);
            return; // Stop here and wait for user to approve chunking
          }

          // If too few facts to chunk, trim them
          console.warn(`⚠️ Too few facts to chunk (${factpackForChunking.facts.length}). Trimming instead...`);
          const trimmedFacts: typeof factpackForChunking.facts = [];
          let currentChars = 0;

          for (const fact of factpackForChunking.facts) {
            if (currentChars + fact.text.length <= spaceCalculation.availableForFacts) {
              trimmedFacts.push(fact);
              currentChars += fact.text.length;
            } else {
              break;
            }
          }

          limitedFactpack = {
            facts: trimmedFacts,
            entities: factpackForChunking.entities || [],
            gaps: factpackForChunking.gaps || [],
          };

          const trimmedCount = (fp || factpack)!.facts.length - trimmedFacts.length;
          if (trimmedCount > 0) {
            console.warn(`⚠️ Trimmed ${trimmedCount} facts to fit within AI character limit`);
            setError(`${trimmedCount} facts were omitted to stay within the ${PROMPT_LIMITS.AI_HARD_LIMIT.toLocaleString()} character AI limit.`);
          }
        }
      }
    }

    // Build NPC section context if in NPC section chunking mode
    let npcContext: StageContext['npcSectionContext'] | undefined;
    if (isNpcSectionChunking && stage.name === 'Creator') {
      const currentSection = npcSectionChunks[currentNpcSectionIndex] || null;
      npcContext = {
        isNpcSectionChunking: true,
        currentSectionIndex: currentNpcSectionIndex,
        currentSection: currentSection,
        accumulatedSections: accumulatedNpcSections,
      };
      console.log(`[NPC Section Context] Section ${currentNpcSectionIndex + 1}/${npcSectionChunks.length}: ${currentSection?.chunkLabel}`);
    }

    const context: StageContext = {
      config: effectiveConfig,
      stageResults: results,
      factpack: limitedFactpack,
      chunkInfo: chunkInfo || currentChunkInfo,
      previousDecisions: limitedDecisions,
      unansweredProposals: unansweredProposals,
      npcSectionContext: npcContext,
    };

    // Check if this stage requires chunking (e.g., Location Spaces stage)
    // This must happen BEFORE we start chunking to initialize the iteration
    console.log(`[Stage Chunking Debug] Stage: ${stage.name}, isStageChunking: ${isStageChunking}, chunkInfo: ${!!chunkInfo}, hasShould Chunk: ${'shouldChunk' in stage}`);
    if ('shouldChunk' in stage) {
      console.log(`[Stage Chunking Debug] shouldChunk type: ${typeof stage.shouldChunk}`);
    }

    if (!isStageChunking && !chunkInfo && 'shouldChunk' in stage && typeof stage.shouldChunk === 'function') {
      console.log(`[Stage Chunking] ✓ ${stage.name} has shouldChunk function, calling it...`);
      console.log(`[Stage Chunking] Context:`, context);
      console.log(`[Stage Chunking] Context.stageResults:`, context.stageResults);
      const chunkConfig = stage.shouldChunk(context);
      console.log(`[Stage Chunking] Result:`, chunkConfig);
      console.log(`[Stage Chunking] shouldChunk=${chunkConfig.shouldChunk}, totalChunks=${chunkConfig.totalChunks}`);

      if (chunkConfig.shouldChunk && chunkConfig.totalChunks > 1) {
        console.log(`[Stage Chunking] ✓✓✓ ENTERING CHUNKING MODE ✓✓✓`);
        console.log(`[Stage Chunking] ${stage.name} requires ${chunkConfig.totalChunks} iterations`);

        // Initialize stage chunking state
        setIsStageChunking(true);
        setCurrentStageChunk(0);
        setTotalStageChunks(chunkConfig.totalChunks);
        setAccumulatedChunkResults([]);

        // Create chunkInfo for first iteration
        const firstChunkInfo = buildWorkflowStageChunkInfoForIndex(0, chunkConfig.totalChunks);

        // Re-call showStageOutput with chunk info to start iteration
        console.log(`[Stage Chunking] Starting chunk 1/${chunkConfig.totalChunks}`);
        const launchPlan = buildWorkflowSameStageLaunchPlan({
          stageIndex,
          stageResults: results,
          factpack: fp,
          chunkInfo: firstChunkInfo,
        });
        executeWorkflowStageLaunch(launchPlan, {
          runtimeConfig: cfg,
          unansweredProposals,
          overrideDecisions,
          additionalGuidance,
          promptOverrides,
        });
        return; // Exit and restart with chunk info
      }
    }

    // Build user prompt and log its size
    let userPromptContent = stage.buildUserPrompt(context);
    let guidanceToAppend = additionalGuidance?.trim() || '';

    // For Planner, merge fix list directly into JSON to keep payload tiny
    if (stage.name === 'Planner' && guidanceToAppend.length > 0) {
      try {
        const base = JSON.parse(userPromptContent);
        const guidanceJson = JSON.parse(guidanceToAppend);
        const fixList = Array.isArray(guidanceJson.fix)
          ? guidanceJson.fix.slice(0, 6)
          : [];
        if (fixList.length > 0) {
          base.fix = fixList;
          userPromptContent = JSON.stringify(base, null, 2);
        }
        guidanceToAppend = '';
      } catch (err) {
        console.warn('[Planner Retry] Failed to merge guidance JSON; falling back to append');
      }
    }

    if (guidanceToAppend.length > 0) {
      // For Planner retries we keep guidance extremely small to avoid hitting prompt caps
      const isPlanner = stage.name === 'Planner';
      const trimmedGuidance = isPlanner
        ? guidanceToAppend.slice(0, 600) // hard cap retry guidance for Planner
        : guidanceToAppend;
      userPromptContent = `${userPromptContent}\n\n---\n\n${trimmedGuidance}`;
    }

    console.log(`[Prompt Building] ${stage.name} user prompt: ${userPromptContent.length.toLocaleString()} chars`);

    // If user prompt is unusually large for early stages, investigate and trim
    if (['Purpose', 'Keyword Extractor'].includes(stage.name) && userPromptContent.length > 6000) {
      console.warn(`⚠️ WARNING: ${stage.name} user prompt is unexpectedly large (${userPromptContent.length.toLocaleString()} chars)`);
      console.log('User prompt preview (first 500 chars):', userPromptContent.substring(0, 500) + '...');

      // Emergency trim: Ensure Purpose/Keyword stages never exceed reasonable size
      // These stages shouldn't have large prompts - something is wrong if they do
      const maxEarlyStagePromptSize = 5000;
      if (userPromptContent.length > maxEarlyStagePromptSize) {
        console.error(`🚨 EMERGENCY TRIM: ${stage.name} prompt truncated from ${userPromptContent.length.toLocaleString()} to ${maxEarlyStagePromptSize.toLocaleString()} chars`);
        console.warn(`⚠️ This usually means config.prompt is too large. Consider shortening your generation prompt.`);
        userPromptContent = userPromptContent.substring(0, maxEarlyStagePromptSize) + '\n\n[... content trimmed due to size limits ...]';
        // Don't call setError here - let generation proceed with trimmed content
        // If still too large, the hard limit check below will catch it
      }

      // Check individual components
      if (effectiveConfig.prompt && effectiveConfig.prompt.length > 4000) {
        console.warn(`⚠️ config.prompt itself is very large: ${effectiveConfig.prompt.length.toLocaleString()} chars`);
      }
      if (effectiveConfig.flags && JSON.stringify(effectiveConfig.flags).length > 2000) {
        console.warn(`⚠️ config.flags is very large: ${JSON.stringify(effectiveConfig.flags).length.toLocaleString()} chars`);
      }
    }

    // Build prompt with character limit checking
    // For multi-chunk generations, use minimal prompts for chunks 2+
    const isSubsequentChunk = chunkInfo && chunkInfo.currentChunk > 1;
    const isLastChunk = chunkInfo && chunkInfo.currentChunk === chunkInfo.totalChunks;
    const isFirstChunk = chunkInfo && chunkInfo.currentChunk === 1;
    const promptMode: AiCompiledStageRequest['promptBudget']['mode'] = isSubsequentChunk ? 'continuation' : 'safe';

    let systemPromptToUse = actualSystemPrompt;  // Use condensed prompt if stage needed it
    let userPromptToUse = userPromptContent;

    // Add multi-part instructions for chunk 1
    if (isFirstChunk && chunkInfo && chunkInfo.totalChunks > 1) {
      systemPromptToUse = `${actualSystemPrompt}

---
🔔 MULTI-PART GENERATION (${chunkInfo.totalChunks} chunks total):
- This is chunk 1 of ${chunkInfo.totalChunks}
- More canon facts will follow in subsequent messages
- ⚠️ CRITICAL: Use the SAME AI chat session for ALL ${chunkInfo.totalChunks} chunks
- Do NOT start a new session or you will lose context
- After receiving all chunks, generate the complete ${effectiveConfig.type}`;

      console.log(`📦 Chunk 1/${chunkInfo.totalChunks}: Added multi-part instructions`);
    }

    // Use minimal prompts for chunks 2+ (but NOT for Spaces stage - it needs full prompt each time)
    const stageLookupKey = getStageLookupKey(stage);
    const isLocationSpacesStage = stageLookupKey === 'location_spaces' || stage.name === 'Spaces';

    if (isSubsequentChunk && !isLocationSpacesStage) {
      systemPromptToUse = `Continuing ${stage.name} generation. Chunk ${chunkInfo!.currentChunk} of ${chunkInfo!.totalChunks}.

${isLastChunk
          ? '🎯 FINAL CHUNK: After receiving this data, generate the complete JSON output based on ALL canon facts from all chunks.'
          : '📦 More canon facts coming in next chunk. Acknowledge receipt and wait for next chunk.'}

⚠️ CRITICAL: Use the SAME chat session. Do not start a new session.
Output: Valid JSON only. No markdown, no prose.`;

      // Minimal user prompt - just the facts
      userPromptToUse = `${isLastChunk ? 'Final' : 'Continuing'} canon facts:\n\n${userPromptContent}`;

      console.log(`📦 Chunk ${chunkInfo!.currentChunk}/${chunkInfo!.totalChunks}: Using minimal continuation prompt`);
    } else if (isSubsequentChunk && isLocationSpacesStage) {
      // Spaces stage needs full system prompt every time for visual data generation
      console.log(`📦 Chunk ${chunkInfo!.currentChunk}/${chunkInfo!.totalChunks}: Using full prompt (Spaces stage requires it)`);
    }

    // Hard guard for Planner prompt size on retries and primary runs
    if (stage.name === 'Planner') {
      const systemChars = systemPromptToUse.length;
      const userChars = userPromptToUse.length;
      const totalChars = systemChars + userChars;
      if (totalChars > 7200) {
        setError(`Planner prompt exceeds safe limit: ${totalChars.toLocaleString()} chars (system: ${systemChars.toLocaleString()}, user: ${userChars.toLocaleString()}). Shorten the prompt or flags and retry.`);
        setSessionStatus('error');
        return;
      }
    }

    // Check if this stage has a minimal contract (new prompt packer system)
    const normalizedStageName = stage.name.replace(/^Creator:\s*/i, '').trim();
    const stageContract =
      getWorkflowStageContract(stage.workflowStageKey || stageLookupKey, config?.type) ||
      getWorkflowStageContract(normalizedStageName, config?.type) ||
      getNpcStageContract(stageLookupKey) ||
      getNpcStageContract(normalizedStageName) ||
      null;
    const packedStageContract =
      typeof stageContract === 'string'
        ? stageContract
        : stageContract
        ? `Allowed keys: ${stageContract.allowedKeys.join(', ')}\nRequired keys: ${stageContract.requiredKeys.join(', ')}`
        : '';
    const packedRequiredKeys =
      typeof stageContract === 'string'
        ? ''
        : stageContract
        ? stageContract.requiredKeys.join(', ')
        : '';
    // Use packed prompt for ANY stage that has a contract (not just NPC), except subsequent chunks
    const usePackedPrompt = !!stageContract && !isSubsequentChunk;

    if (usePackedPrompt) {
      console.log(`[Prompt Packer] Using packed prompt for stage: ${stage.name}`);
      const logAi = shouldLogAiPayload();

      const reducedStageInputs = reduceStageInputs(stageLookupKey, results);

      // Build packed prompt config - stage contracts already contain required keys
      const packConfig: PromptPackConfig = {
        mustHave: {
          stageContract: packedStageContract,
          outputFormat: 'Output ONLY valid JSON. NO markdown. NO prose.',
          requiredKeys: packedRequiredKeys,
          stageInputs: {
            original_user_request: effectiveConfig.prompt,
            inferred_species: inferSpecies({
              original_user_request: effectiveConfig.prompt,
              previous_decisions: limitedDecisions,
            }) || undefined,
            ...reducedStageInputs,
            ...(additionalGuidance && additionalGuidance.trim().length > 0
              ? { additional_critical_instructions: additionalGuidance.trim() }
              : {}),
          },
        },
        shouldHave: {
          canonFacts: limitedFactpack ? formatCanonFacts(limitedFactpack) : undefined,
          previousDecisionsSummary: limitedDecisions ? JSON.stringify(limitedDecisions, null, 2) : undefined,
        },
        niceToHave: { verboseFlags: effectiveConfig.flags },
        safetyCeiling: PROMPT_SAFETY_CEILING,
      };

      const packed = buildPackedPrompt(packConfig);

      if (!packed.success) {
        console.error('[Prompt Packer] Failed to pack prompt:', packed.error);
        console.error(formatSizeBreakdown(packed.analysis.breakdown));
        setError(`Prompt too large: ${packed.error!.overflow} chars over limit. ${packed.error!.message}`);
        return;
      }

      console.log('[Prompt Packer] Successfully packed prompt');
      console.log(formatSizeBreakdown(packed.analysis.breakdown));
      if (packed.analysis.droppedSections.length > 0) {
        console.warn('[Prompt Packer] Dropped sections:', packed.analysis.droppedSections);
      }
      if (packed.analysis.compressionApplied) {
        console.warn('[Prompt Packer] Compression applied to should-have components');
      }

      const packedPrompt = `${packed.systemPrompt}\n\n---\n\n${packed.userPrompt}`;
      if (logAi) {
        console.log(`[AI][PROMPT][${stage.name}][packed] total=${packedPrompt.length} system=${(packed.systemPrompt || '').length} user=${(packed.userPrompt || '').length}`);
        console.log('[AI][PROMPT][system]', packed.systemPrompt || '');
        console.log('[AI][PROMPT][user]', packed.userPrompt || '');
      }
      const packedRequest: AiCompiledStageRequest = {
        requestId: crypto.randomUUID(),
        stageKey: stageLookupKey,
        stageLabel: stage.name,
        prompt: packedPrompt,
        systemPrompt: packed.systemPrompt || '',
        userPrompt: packed.userPrompt || '',
        promptBudget: {
          measuredChars: packedPrompt.length,
          safetyCeiling: PROMPT_SAFETY_CEILING,
          hardLimit: PROMPT_LIMITS.AI_HARD_LIMIT,
          mode: 'packed',
          droppedSections: packed.analysis.droppedSections,
          warnings: [],
          compressionApplied: packed.analysis.compressionApplied,
        },
        memory: buildAiStageMemorySummary(stage, effectiveConfig, results, limitedFactpack, limitedDecisions),
      };
      setCompiledStageRequest(packedRequest);
      setCurrentPrompt(packedPrompt);
      setModalMode('output');

      // Auto-save the prompt
      if (autoSaveEnabled && progressSession) {
        const chunkIndex = chunkInfo ? chunkInfo.currentChunk : null;
        await savePendingPromptSession({
          baseSession: progressSession,
          stageIndex,
          stageName: stage.name,
          chunkIndex,
          prompt: packedPrompt,
          retrySource: effectiveRetrySource || undefined,
          compiledStageRequest: packedRequest,
        });
        console.log(`[Auto-Save] Saved packed prompt for ${stage.name}`);
      }

      return;
    }

    // Fall back to existing buildSafePrompt for non-NPC stages or stages without contracts
    const { prompt: fullPrompt, analysis, warnings } = buildSafePrompt(
      systemPromptToUse,
      userPromptToUse,
      {
        // Don't pass accumulated answers here - they're already in the user prompt via previousDecisions
        // Passing them here would add them as a separate section, causing double-counting
        accumulatedAnswers: undefined,
        npcSchemaGuidance: isSubsequentChunk ? undefined : npcSchemaGuidance,
        forceIncludeSchema: isSubsequentChunk ? false : isNpcStage,
      }
    );

    if (shouldLogAiPayload()) {
      console.log(`[AI][PROMPT][${stage.name}][safe] total=${fullPrompt.length} system=${systemPromptToUse.length} user=${userPromptToUse.length}`);
      console.log('[AI][PROMPT][system]', systemPromptToUse);
      console.log('[AI][PROMPT][user]', userPromptToUse);
    }

    // Log prompt analysis
    console.log(`\n${formatPromptAnalysis(analysis)}`);
    if (warnings.length > 0) {
      console.warn('⚠️ Prompt Warnings:', warnings);
    }

    // CRITICAL: Prompt exceeds AI hard limit - trigger chunking if possible
    if (analysis.totalChars > PROMPT_LIMITS.AI_HARD_LIMIT) {
      const overflow = analysis.totalChars - PROMPT_LIMITS.AI_HARD_LIMIT;

      // Check if this is a stage that can be chunked (has facts)
      // Don't re-trigger if already in multi-part mode (prevents infinite loops)
      if (hasCanonFacts && limitedFactpack && spaceCalculation && limitedFactpack.facts.length > 10 && !isMultiPartGeneration) {
        const factpackForOverflowChunking = limitedFactpack;
        console.warn(`⚠️ Prompt exceeds AI hard limit by ${overflow.toLocaleString()} chars. Triggering chunking...`);

        // Use multi-chunk strategy: chunk 1 has limited space, chunks 2+ have much more
        const minimalPromptOverhead = 900;
        const availableForSubsequentChunks = PROMPT_LIMITS.AI_HARD_LIMIT - minimalPromptOverhead;
        const multiPartInstructionsOverhead = 300;
        const availableForChunk1 = Math.max(0, spaceCalculation.availableForFacts - multiPartInstructionsOverhead);

        console.log(`📊 Backup Chunking Strategy:`);
        console.log(`   Chunk 1 space: ${availableForChunk1.toLocaleString()} chars`);
        console.log(`   Chunks 2+ space: ${availableForSubsequentChunks.toLocaleString()} chars`);

        // Trigger chunking modal
        const groups = groupFactsIntelligently(factpackForOverflowChunking, availableForSubsequentChunks);

        // If chunk 1 has very little space (<500 chars), give it ZERO facts
        if (availableForChunk1 < 500) {
          console.log(`⚠️ Chunk 1 has minimal space (${availableForChunk1} chars). Putting ALL facts in chunks 2+.`);

          const newGroups: FactGroup[] = [
            {
              id: 'chunk1-intro',
              label: 'Introduction (No Facts)',
              facts: [],
              characterCount: 0,
              entityTypes: [],
              regions: [],
            },
            ...groups,
          ];

          setChunkingState(openFactWorkflowChunking({
            pendingFactpack: factpackForOverflowChunking,
            factGroups: newGroups,
          }));
        }
        // Split first group if needed
        else if (groups.length > 0 && groups[0].characterCount > availableForChunk1) {
          const firstGroupFacts = groups[0].facts;
          const chunk1Facts: CanonFact[] = [];
          let chunk1Chars = 0;
          let remainingFactsIndex = 0;

          for (let i = 0; i < firstGroupFacts.length; i++) {
            if (chunk1Chars + firstGroupFacts[i].text.length <= availableForChunk1) {
              chunk1Facts.push(firstGroupFacts[i]);
              chunk1Chars += firstGroupFacts[i].text.length;
              remainingFactsIndex = i + 1;
            } else {
              break;
            }
          }

          const remainingFacts = firstGroupFacts.slice(remainingFactsIndex);
          const newGroups: FactGroup[] = [
            {
              ...groups[0],
              id: 'chunk1',
              label: `${groups[0].label} (Chunk 1 - ${chunk1Facts.length} facts)`,
              facts: chunk1Facts,
              characterCount: chunk1Chars,
            },
            {
              ...groups[0],
              id: 'chunk2-part1',
              label: `${groups[0].label} (Continued)`,
              facts: remainingFacts,
              characterCount: remainingFacts.reduce((sum, f) => sum + f.text.length, 0),
            },
            ...groups.slice(1),
          ];

          setChunkingState(openFactWorkflowChunking({
            pendingFactpack: factpackForOverflowChunking,
            factGroups: newGroups,
          }));
        } else {
          setChunkingState(openFactWorkflowChunking({
            pendingFactpack: factpackForOverflowChunking,
            factGroups: groups,
          }));
        }

        setError(`This stage has too much canon data to fit in one prompt (${analysis.totalChars.toLocaleString()} chars). Please approve chunking.`);
        return;
      }

      // If can't chunk but already in multi-part mode, we need to trim this chunk's facts
      if (isMultiPartGeneration && hasCanonFacts && limitedFactpack && spaceCalculation) {
        const factpackForTrim = limitedFactpack;
        console.warn(`⚠️ Already in multi-part mode, but chunk exceeds limit. Trimming facts for this chunk...`);

        // Calculate how many chars we can use
        const availableForFacts = Math.max(100, PROMPT_LIMITS.AI_HARD_LIMIT - spaceCalculation.overhead);

        // Trim facts to fit
        const trimmedFacts: CanonFact[] = [];
        let currentChars = 0;

        for (const fact of factpackForTrim.facts) {
          if (currentChars + fact.text.length <= availableForFacts) {
            trimmedFacts.push(fact);
            currentChars += fact.text.length;
          } else {
            break;
          }
        }

        limitedFactpack = {
          facts: trimmedFacts,
          entities: factpackForTrim.entities || [],
          gaps: factpackForTrim.gaps || [],
        };

        const trimmedCount = factpackForTrim.facts.length - trimmedFacts.length;
        console.warn(`⚠️ Trimmed ${trimmedCount} facts from this chunk to fit within limit`);

        // Rebuild prompt with trimmed facts
        const context: StageContext = {
          config: effectiveConfig,
          stageResults: results,
          factpack: limitedFactpack,
          chunkInfo: chunkInfo || currentChunkInfo,
          previousDecisions: limitedDecisions,
          unansweredProposals: unansweredProposals,
        };

        userPromptContent = stage.buildUserPrompt(context);

        // Re-build the full prompt
        const { prompt: rebuiltPrompt, analysis: rebuiltAnalysis } = buildSafePrompt(
          systemPromptToUse,
          userPromptContent,
          {
            accumulatedAnswers: undefined,
            npcSchemaGuidance: isSubsequentChunk ? undefined : npcSchemaGuidance,
            forceIncludeSchema: isSubsequentChunk ? false : isNpcStage,
          }
        );

        const rebuiltRequest: AiCompiledStageRequest = {
          requestId: crypto.randomUUID(),
          stageKey: stageLookupKey,
          stageLabel: stage.name,
          prompt: rebuiltPrompt,
          systemPrompt: systemPromptToUse,
          userPrompt: userPromptContent,
          promptBudget: {
            measuredChars: rebuiltPrompt.length,
            safetyCeiling: PROMPT_SAFETY_CEILING,
            hardLimit: PROMPT_LIMITS.AI_HARD_LIMIT,
            mode: promptMode,
            droppedSections: [],
            warnings: [],
            compressionApplied: false,
          },
          memory: buildAiStageMemorySummary(stage, effectiveConfig, results, limitedFactpack, limitedDecisions),
        };
        setCompiledStageRequest(rebuiltRequest);
        setCurrentPrompt(rebuiltPrompt);
        console.log(`📊 Rebuilt prompt after trimming: ${rebuiltAnalysis.totalChars} chars`);
        setModalMode('output');
        if (autoSaveEnabled && progressSession) {
          const chunkIndex = chunkInfo ? chunkInfo.currentChunk : null;
          await savePendingPromptSession({
            baseSession: progressSession,
            stageIndex,
            stageName: stage.name,
            chunkIndex,
            prompt: rebuiltPrompt,
            retrySource: effectiveRetrySource || undefined,
            compiledStageRequest: rebuiltRequest,
          });
        }
        return;
      }

      // If can't chunk (no facts or too few facts), show warning and allow user to proceed
      console.warn(`⚠️ WARNING: Prompt is ${analysis.totalChars.toLocaleString()} chars, exceeding AI hard limit of ${PROMPT_LIMITS.AI_HARD_LIMIT.toLocaleString()} by ${overflow.toLocaleString()} chars. The AI may truncate data.`);
      console.warn(`⚠️ ${hasCanonFacts ? 'Not enough facts to chunk - reduce your request complexity.' : 'This stage has no canon facts to chunk - reduce your generation prompt length.'}`);

      // Continue to show the prompt instead of blocking - user can proceed with caution
      const overflowRequest: AiCompiledStageRequest = {
        requestId: crypto.randomUUID(),
        stageKey: stageLookupKey,
        stageLabel: stage.name,
        prompt: fullPrompt,
        systemPrompt: systemPromptToUse,
        userPrompt: userPromptToUse,
        promptBudget: {
          measuredChars: fullPrompt.length,
          safetyCeiling: PROMPT_SAFETY_CEILING,
          hardLimit: PROMPT_LIMITS.AI_HARD_LIMIT,
          mode: promptMode,
          droppedSections: [],
          warnings,
          compressionApplied: false,
        },
        memory: buildAiStageMemorySummary(stage, effectiveConfig, results, limitedFactpack, limitedDecisions),
      };
      setCompiledStageRequest(overflowRequest);
      setCurrentPrompt(fullPrompt);
      setModalMode('output');
      if (autoSaveEnabled && progressSession) {
        const chunkIndex = chunkInfo ? chunkInfo.currentChunk : null;
        await savePendingPromptSession({
          baseSession: progressSession,
          stageIndex,
          stageName: stage.name,
          chunkIndex,
          prompt: fullPrompt,
          retrySource: effectiveRetrySource || undefined,
          compiledStageRequest: overflowRequest,
        });
      }
      return;
    }

    // Show warning if close to limit
    if (analysis.totalChars > PROMPT_LIMITS.WARNING_THRESHOLD) {
      console.warn(`⚠️ Prompt is ${((analysis.totalChars / PROMPT_LIMITS.AI_HARD_LIMIT) * 100).toFixed(1)}% of AI hard limit`);
    }

    const safeRequest: AiCompiledStageRequest = {
      requestId: crypto.randomUUID(),
      stageKey: stageLookupKey,
      stageLabel: stage.name,
      prompt: fullPrompt,
      systemPrompt: systemPromptToUse,
      userPrompt: userPromptToUse,
      promptBudget: {
        measuredChars: fullPrompt.length,
        safetyCeiling: PROMPT_SAFETY_CEILING,
        hardLimit: PROMPT_LIMITS.AI_HARD_LIMIT,
        mode: promptMode,
        droppedSections: [],
        warnings,
        compressionApplied: false,
      },
      memory: buildAiStageMemorySummary(stage, effectiveConfig, results, limitedFactpack, limitedDecisions),
    };
    setCompiledStageRequest(safeRequest);
    setCurrentPrompt(fullPrompt);
    setModalMode('output');

    // Auto-save the prompt being shown to user
    if (autoSaveEnabled && progressSession) {
      const chunkIndex = chunkInfo ? chunkInfo.currentChunk : null;
      await savePendingPromptSession({
        baseSession: progressSession,
        stageIndex,
        stageName: stage.name,
        chunkIndex,
        prompt: fullPrompt,
        retrySource: effectiveRetrySource || undefined,
        compiledStageRequest: safeRequest,
      });
      console.log(`[Auto-Save] Saved prompt for ${stage.name} (stage ${stageIndex}) chunk ${chunkIndex ?? 'N/A'}`);
    }
  };

  const handleCopied = () => {
    setTimeout(() => {
      _setSkipMode(false); // Reset skip mode when moving from output to input mode normally
      setModalMode('input');
    }, 600);
  };

  const handleAutoParse = async () => {
    setError(null);

    try {
      const currentChunk = getCurrentWorkflowHomebrewChunk(stageResults);

      if (!currentChunk) {
        setError('Auto-parse failed: current homebrew chunk was missing or invalid.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/homebrew/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkIndex: currentChunk.index,
          sectionTitle: currentChunk.title,
          content: currentChunk.content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to auto-parse chunk');
      }

      const parsed = await response.json();

      // Process the parsed result the same way as manual AI input
      handleSubmit(JSON.stringify(parsed));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-parse failed';
      setError(`Auto-parse error: ${message}`);
    }
  };

  /**
   * ====================================================================
   * SPACE APPROVAL HANDLERS
   * These handlers are called from SpaceApprovalModal when the user
   * approves, rejects, or edits a generated space during Location Spaces stage.
   * ====================================================================
   */

  /**
   * Handle space acceptance - adds the space to accumulated results and continues generation
   */
  const handleSpaceAccept = async () => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to accept');
      return;
    }

    // If reviewing an existing space (not new), just close modal
    if (reviewingSpaceIndex >= 0) {
      console.log(`[Space Approval] Closing review of existing space #${reviewingSpaceIndex + 1}`);
      setShowSpaceApprovalModal(false);
      setReviewingSpaceIndex(-1);
      return;
    }

    await handleSpaceAcceptWithCustomSpace(pendingSpace, 'accepted');
  };

  /**
   * Handle space rejection - stores rejection reason and regenerates the same space
   */
  const handleSpaceReject = (reason?: string, retrySource?: WorkflowRetrySource) => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to reject');
      return;
    }

    console.log(`[Space Approval] Space rejected: ${pendingSpace.name}${reason ? `, Reason: ${reason}` : ''}`);

    // Track rejected space for analytics/debugging
    setRejectedSpaces(prev => [...prev, { space: pendingSpace, reason, retrySource }]);

    const parentStructure = getLocationParentStructure(stageResults);
    const retryGuidance = buildLocationSpaceRetryGuidance({
      rejectedSpace: pendingSpace,
      existingSpaces: accumulatedChunkResults,
      parentStructure,
      userReason: reason,
      retrySource,
    });

    // Clear pending space and close modal
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);

    console.log(`[Space Approval] Regenerating space #${currentStageChunk + 1} with rejection feedback`);

    // Regenerate the same space number with rejection feedback
    // The rejection feedback will be picked up in buildUserPrompt
    const chunkInfo = buildWorkflowStageChunkInfoForIndex(currentStageChunk, totalStageChunks, {
      labelSuffix: '(Regenerating)',
    });

    const launchPlan = buildWorkflowSameStageLaunchPlan({
      stageIndex: currentStageIndex,
      stageResults,
      factpack,
      chunkInfo,
    });
    executeWorkflowStageLaunch(launchPlan, {
      runtimeConfig: config!,
      promptOverrides: {
        flags: {
          rejection_feedback: retryGuidance.rejectionFeedback,
          rejection_context: retryGuidance.rejectionContext,
        },
        promptNotice: retryGuidance.promptNotice,
        retrySource: retryGuidance.retrySource,
      },
    });
  };

  /**
   * Handle space edit - allows user to modify the space JSON before accepting
   */
  const handleSpaceEdit = async (editedSpace: JsonRecord) => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to edit');
      return;
    }

    console.log(`[Space Approval] Space edited: ${pendingSpace.name} -> ${editedSpace.name}`);
    console.log('[Space Approval] Edited space data:', {
      name: editedSpace.name,
      dimensions: editedSpace.dimensions,
      size_ft: editedSpace.size_ft,
    });

    // If reviewing an existing space, update it in place
    if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < accumulatedChunkResults.length) {
      console.log(`[Space Edit] Updating existing space at index ${reviewingSpaceIndex}`);

      // ✓ CRITICAL: Update pendingSpace FIRST to prevent form revert
      // This ensures the form's useEffect has the latest data immediately
      setPendingSpace(editedSpace);
      console.log('[Space Edit] ✓ Updated pendingSpace immediately to prevent form revert');

      const updatedAccumulated = [...accumulatedChunkResults];
      updatedAccumulated[reviewingSpaceIndex] = editedSpace;

      // Update live map - FORCE complete rebuild to ensure React sees the change
      const spaceData = extractLocationSpaceForMap(editedSpace);
      console.log('[Space Edit] Extracted space data for map:', spaceData);
      console.log('[Space Edit] Door count in extracted space:', spaceData?.doors?.length);
      console.log('[Space Edit] Doors in extracted space:', spaceData?.doors);
      spaceData?.doors?.forEach((door, idx) => {
        console.log(`  Door ${idx + 1}: ${door.wall} wall at ${door.position_on_wall_ft}ft → "${door.leads_to}" (width: ${door.width_ft}ft)`);
      });
      if (spaceData) {
        console.log(`[Space Edit] Before update - old space at index ${reviewingSpaceIndex}:`, liveMapSpaces[reviewingSpaceIndex]);

        // Create entirely new array to force React to see the change
        const updatedLiveMap = liveMapSpaces.map((space, idx) => {
          if (idx === reviewingSpaceIndex) {
            return { ...spaceData }; // Return new object
          }
          return space;
        });

        console.log(`[Space Edit] After update - new space at index ${reviewingSpaceIndex}:`, updatedLiveMap[reviewingSpaceIndex]);
        console.log(`[Space Edit] Setting live map with ${updatedLiveMap.length} spaces`);

        // Synchronize reciprocal doors across all spaces (live map only; accumulated remains raw records)
        const syncedLiveMap = syncLocationLiveMapSpaces(updatedLiveMap);
        console.log(`[Space Edit] Synchronized reciprocal doors for ${syncedLiveMap.length} spaces`);

        // Update both accumulated results and live map with synchronized doors
        setAccumulatedChunkResults(updatedAccumulated);
        setLiveMapSpaces(syncedLiveMap);
        setMapUpdateCounter(prev => prev + 1); // Increment to force React re-render
        const updatedStageResults = {
          ...stageResults,
          spaces: mergeWorkflowStageChunks(updatedAccumulated, 'Spaces'),
        };
        setStageResults(updatedStageResults);

        // Update pendingSpace with synced version so form shows reciprocal doors
        setPendingSpace(updatedAccumulated[reviewingSpaceIndex]);

        console.log(`[Live Map] ✓ Map updated with new dimensions for space #${reviewingSpaceIndex + 1}: ${spaceData.name}`, spaceData.size_ft);

        // Auto-save the changes to session using atomic save pattern
        await saveStateAndSession({
          currentStageIndex: currentStageIndex,  // ← Preserve current stage
          stageResults: updatedStageResults,
          stageChunkState: progressSession?.stageChunkState ? {
            ...progressSession.stageChunkState,
            liveMapSpaces: syncedLiveMap,
            accumulatedChunkResults: updatedAccumulated,
          } : undefined,
        });
        console.log(`[Auto-Save] Saved edited space #${reviewingSpaceIndex + 1}`);
      }

      return; // Stay in review mode
    }

    // Otherwise, it's a new space - auto-accept it
    // Update pending space with edited version
    setPendingSpace(editedSpace);

    // Auto-accept the edited space
    // We need to temporarily update pendingSpace and then call accept
    // Since setState is async, we'll pass the edited space directly
    handleSpaceAcceptWithCustomSpace(editedSpace);
  };

  /**
   * Navigate to previous accepted space for review
   */
  const handlePreviousSpace = () => {
    if (accumulatedChunkResults.length === 0) return;

    // If currently at new space, save it before navigating away
    if (reviewingSpaceIndex < 0 && pendingSpace) {
      setSavedNewSpace(pendingSpace);
    }

    const newIndex = reviewingSpaceIndex < 0
      ? accumulatedChunkResults.length - 1  // If at new space, go to last accepted
      : Math.max(0, reviewingSpaceIndex - 1); // Otherwise go to previous

    console.log(`[Space Navigation] Going to previous space: index ${newIndex}`);
    setReviewingSpaceIndex(newIndex);
    setPendingSpace(accumulatedChunkResults[newIndex]);
  };

  /**
   * Navigate to next accepted space or new space
   */
  const handleNextSpace = () => {
    if (reviewingSpaceIndex < 0) return; // Already at new space

    const newIndex = reviewingSpaceIndex + 1;

    if (newIndex >= accumulatedChunkResults.length) {
      // Return to new/pending space
      console.log(`[Space Navigation] Returning to new space`);
      setReviewingSpaceIndex(-1);
      // Restore the saved new space
      if (savedNewSpace) {
        setPendingSpace(savedNewSpace);
        setSavedNewSpace(null);
      }
    } else {
      console.log(`[Space Navigation] Going to next space: index ${newIndex}`);
      setReviewingSpaceIndex(newIndex);
      setPendingSpace(accumulatedChunkResults[newIndex]);
    }
  };

  /**
   * Handle adding a new space manually
   * Opens SpaceApprovalModal in edit mode with a blank/default space
   */
  const handleAddSpace = () => {
    console.log('[Add Space] Creating new blank space');

    // Create a new space with default values
    const newSpace: JsonRecord = {
      name: `New Space ${accumulatedChunkResults.length + 1}`,
      code: `space_${Date.now()}`,
      purpose: '',
      description: '',
      dimensions: { width: 20, height: 20, unit: 'ft' },
      size_ft: { width: 20, height: 20 },
      floor_height: 10,
      space_type: 'room',
      shape: 'rectangle',
      doors: [],
      features: [],
    };

    // Set as pending space (reviewingSpaceIndex = -1 means new space)
    setPendingSpace(newSpace);
    setReviewingSpaceIndex(-1);
    setSavedNewSpace(null);

    // Open the modal (it will show in edit mode)
    setShowSpaceApprovalModal(true);

    console.log('[Add Space] Opened SpaceApprovalModal for new space');
  };

  /**
   * Handle finishing skip mode - user has reviewed all pasted spaces and is ready to advance
   */
  const handleFinishSkip = async () => {
    console.log('[Skip Mode] User finished reviewing spaces, advancing to next stage');

    if (accumulatedChunkResults.length === 0) {
      console.warn('[Skip Mode] No spaces to finalize');
      return;
    }

    // Merge all accumulated spaces into stage results
    const finalResults: StageResults = {
      ...stageResults,
      spaces: {
        spaces: accumulatedChunkResults,
        total_spaces: accumulatedChunkResults.length,
      } as unknown as JsonRecord,
    };
    console.log(`[Skip Mode] Finalized ${accumulatedChunkResults.length} spaces, advancing to next stage`);

    // Clear skip mode and chunking state
    _setSkipMode(false);
    setIsStageChunking(false);
    setCurrentStageChunk(0);
    setTotalStageChunks(0);
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);
    setReviewingSpaceIndex(-1);

    // Advance to next stage
    const navigationPlan = buildWorkflowAdvancePlan({
      currentStageIndex,
      totalStages: STAGES.length,
      stageResults: finalResults,
      factpack,
    });

    if (navigationPlan.kind === 'advance') {
      const nextStageIndex = navigationPlan.nextIndex;

      // ✓ ATOMIC SAVE: Persist skip completion with all spaces
      await saveStateAndSession({
        currentStageIndex: nextStageIndex,
        stageResults: navigationPlan.stageResults,
        stageChunkState: {
          isStageChunking: false,
          currentStageChunk: 0,
          totalStageChunks: 0,
          accumulatedChunkResults: accumulatedChunkResults, // Preserve for Details/Accuracy stages
          liveMapSpaces: liveMapSpaces, // Preserve map
          showLiveMap: true,
        },
      });

      // Show next stage output
      executeWorkflowStageNavigation(navigationPlan);
    } else {
      // Final stage - just save
      await saveStateAndSession({
        stageResults: navigationPlan.stageResults,
      });
      executeWorkflowStageNavigation(navigationPlan);
      console.log('[Skip Mode] Final stage reached');
    }
  };

  /**
   * Helper function to accept a custom space (used after editing)
   */
  const handleSpaceAcceptWithCustomSpace = async (
    customSpace: JsonRecord,
    sourceLabel: 'accepted' | 'edited' = 'edited'
  ) => {
    console.log(`[Space Approval] Accepting ${sourceLabel} space: ${customSpace.name}`);

    const currentStage = STAGES[currentStageIndex];
    const progress = buildAcceptedLocationSpaceProgress({
      acceptedSpace: customSpace,
      accumulatedChunkResults,
      liveMapSpaces,
      stageResults,
      stageName: currentStage.name,
      currentStageChunk,
      totalStageChunks,
      showLiveMap,
    });

    console.log(`[Space Approval] Accumulated ${progress.newAccumulated.length}/${totalStageChunks} spaces`);

    setAccumulatedChunkResults(progress.newAccumulated);
    setLiveMapSpaces(progress.updatedLiveMapSpaces);
    if (progress.appendedSpaceData) {
      setShowLiveMap(true);
      console.log(`[Live Map] ✓ Added ${sourceLabel} space: ${progress.appendedSpaceData.name}`);
    }

    setShowSpaceApprovalModal(false);
    setPendingSpace(null);
    setReviewingSpaceIndex(-1);

    if (!progress.stageComplete && progress.nextChunkStep) {
      setCurrentStageChunk(progress.nextChunkStep.nextChunkIndex);
      setStageResults(progress.updatedStageResults);

      if (autoSaveEnabled && progressSession) {
        await saveStateAndSession({
          stageResults: progress.updatedStageResults,
          stageChunkState: progress.updatedStageChunkState,
        });
      }

      const launchPlan = buildWorkflowSameStageLaunchPlan({
        stageIndex: currentStageIndex,
        stageResults: progress.updatedStageResults,
        factpack,
        chunkInfo: progress.nextChunkStep.chunkInfo,
      });
      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config!,
      });

      return;
    }

    setIsStageChunking(false);
    setCurrentStageChunk(0);
    setTotalStageChunks(0);

    const navigationPlan = buildWorkflowAdvancePlan({
      currentStageIndex,
      totalStages: STAGES.length,
      stageResults: progress.updatedStageResults,
      factpack,
    });

    if (navigationPlan.kind === 'advance') {
      const nextStageIndex = navigationPlan.nextIndex;
      await saveStateAndSession({
        currentStageIndex: nextStageIndex,
        stageResults: navigationPlan.stageResults,
        stageChunkState: progress.updatedStageChunkState,
      });
      executeWorkflowStageNavigation(navigationPlan);
    } else {
      setStageResults(progress.updatedStageResults);
      executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
        finalOutput: buildResolvedWorkflowFinalContent({
        workflowType: 'location',
        stageResults: progress.updatedStageResults,
        ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
        }),
      }));
    }
  };

  async function handleSubmit(aiResponse: string, metadata?: SubmitPipelineStageMetadata) {
    // Clear any previous errors
    setError(null);

    try {
      const currentStage = STAGES[currentStageIndex];
      const logAi = shouldLogAiPayload();

      if (logAi && currentStage.name !== 'Visual Map') {
        console.log(`[AI][RAW][${currentStage.name}] (${aiResponse.length} chars)`, aiResponse);
      }

      const normalizedStageResponse = parseAndNormalizeWorkflowStageResponse({
        aiResponse,
        stageName: currentStage.name,
        stageIdentity: currentStage.workflowStageKey || currentStage.routerKey || currentStage.name,
        workflowType: config?.type,
        configPrompt: config?.prompt,
        configFlags: config?.flags as JsonRecord | undefined,
        previousDecisions: accumulatedAnswers,
        stageResults,
      });

      if (isNormalizedStageResponseFailure(normalizedStageResponse)) {
        const stageResponseFailure = normalizedStageResponse;
        const errorMessage = stageResponseFailure.error;
        const rawSnippet = stageResponseFailure.rawSnippet;
        setError(errorMessage);
        setLastStageError({ stage: currentStage.name, message: errorMessage, rawSnippet });
        setCurrentStageOutput(buildWorkflowStageErrorOutput({
          stageName: currentStage.name,
          errorMessage,
          rawSnippet,
          parsed: stageResponseFailure.parsed,
        }));
        applyWorkflowUiTransition(buildWorkflowErrorUiTransition());
        return;
      }

      let parsed: JsonRecord = normalizedStageResponse.parsed;

      if (currentStage.name === 'Visual Map') {
        console.log('[Visual Map] Processing raw HTML output (no JSON parsing)');
      } else if (logAi) {
        console.log(`[AI][PARSED][${currentStage.name}]`, parsed);
      }

      console.log(`[handleSubmit] Stage: ${currentStage.name}, isMultiPartGeneration: ${isMultiPartGeneration}, currentGroupIndex: ${currentGroupIndex}, totalGroups: ${factGroups.length}`);

      // Auto-save the AI response
      if (autoSaveEnabled && progressSession) {
        const updatedSession = updateProgressResponse(
          progressSession,
          aiResponse,
          'completed',
          undefined,
          metadata
            ? {
              confirmedStageId: metadata.stageId,
              confirmedStageKey: metadata.stageKey,
              confirmedWorkflowType: metadata.workflowType as WorkflowContentType | undefined,
            }
            : undefined,
        );
        setProgressSession(updatedSession);
        await saveProgress(updatedSession);
        console.log(`[Auto-Save] Saved AI response for ${currentStage.name}`);
      }

      // Special handling for Homebrew Extraction - chunked processing
      // Check if we're processing homebrew chunks (not by stage name, but by presence of chunks)
      if (config?.type === 'homebrew' && stageResults.homebrew_chunks) {
        const stageKey = getStageStorageKey(currentStage);
        const homebrewProgress = resolveWorkflowHomebrewChunkProgress({
          stageResults,
          stageKey,
          parsed,
          fileName: config.homebrewFile?.name,
        });

        if (homebrewProgress.kind === 'next_chunk') {
          console.log(
            `[Homebrew] Moving to chunk ${homebrewProgress.nextChunkIndex + 1}/${getWorkflowHomebrewChunks(stageResults.homebrew_chunks).length}: ${homebrewProgress.nextChunk.title}`,
          );

          const launchPlan = buildWorkflowPromptLaunchPlan({
            stageIndex: currentStageIndex,
            stageResults: homebrewProgress.stageResults,
            factpack,
            prompt: homebrewProgress.nextChunk.prompt,
            modalMode: 'output',
          });

          executeWorkflowStageLaunch(launchPlan, {
            runtimeConfig: config,
          });
          await persistDirectPromptLaunchSession({
            baseSession: progressSession,
            runtimeConfig: config,
            plan: launchPlan,
          });
          return;
        }

        console.log(`[Homebrew] All ${homebrewProgress.chunkResults.length} chunks processed. Merging...`);
        console.log('[Homebrew] Extraction complete:', homebrewProgress.finalOutput);

        setStageResults(homebrewProgress.stageResults);
        executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
          finalOutput: homebrewProgress.finalOutput,
          alertMessage: buildWorkflowHomebrewCompletionAlertMessage({
            finalOutput: homebrewProgress.finalOutput,
            totalChunks: homebrewProgress.totalChunks,
          }),
        }));
        await saveStateAndSession({
          currentStageIndex,
          stageResults: homebrewProgress.stageResults,
        });

        // Scroll to results
        setTimeout(() => {
          const resultsSection = document.getElementById('generation-results');
          if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);

        return;
      }

      const reviewPreparation = prepareWorkflowStageForReview({
        parsed,
        stageName: currentStage.name,
        workflowType: config?.type,
        accumulatedAnswers,
        isMultiPartGeneration,
      });
      parsed = reviewPreparation.parsed;

      if (reviewPreparation.shouldPauseForPlannerDecisions) {
        console.log('[Planner] Proposals present and no user decisions yet. Pausing pipeline for user input.');
        setCurrentStageOutput(parsed);
        setShowReviewModal(true);
        setCompiledStageRequest(null);
        setSessionStatus('awaiting_user_decisions');
        return; // Do not advance until decisions provided
      }

      if (reviewPreparation.shouldPauseForReview) {
        setCurrentStageOutput(parsed);
        setShowReviewModal(true);
        setCompiledStageRequest(null);
        setSessionStatus('awaiting_user_decisions');
        return; // Don't proceed to next stage yet
      }

      // Store result
      let newResults: StageResults = {
        ...stageResults,
        [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: parsed,
      };

      if (config!.type === 'nonfiction' && currentStage.name === 'Purpose') {
        const keywords = toStringArray((parsed as JsonRecord).keywords);
        if (keywords.length > 0) {
          console.log('[ManualGenerator] Extracted keywords:', keywords);

          const newFactpack = await searchCanonWithKeywords(keywords);
          console.log(`[ManualGenerator] Found ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

          if (newFactpack.facts.length > config!.max_canon_facts) {
            console.log('[ManualGenerator] Fact count exceeds threshold - showing narrowing modal');
            setStageResults(newResults);
            setCanonNarrowingState(openInitialWorkflowCanonNarrowing({
              keywords,
              pendingFactpack: newFactpack,
              pendingStageResults: newResults,
            }));
            setModalMode(null);
            await saveStageResults(newResults, currentStageIndex);
            return;
          }

          if (currentStageIndex < STAGES.length - 1) {
            const navigationPlan = buildWorkflowAdvancePlan({
              currentStageIndex,
              totalStages: STAGES.length,
              stageResults: newResults,
              factpack: newFactpack,
              resetCurrentGroupIndex: true,
            });

            applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
              resetStageChunking: true,
            }));

            await saveStageResults(newResults, currentStageIndex);
            executeWorkflowStageNavigation(navigationPlan);
          }
          return;
        }
      }

      // Special handling for Keyword Extractor stage
      if (currentStage.name === 'Keyword Extractor') {
        // Extract keywords and search canon
        const keywords = toStringArray(parsed.keywords);
        console.log('[ManualGenerator] Extracted keywords:', keywords);

        // Use helper function to search canon
        const newFactpack = await searchCanonWithKeywords(keywords);
        console.log(`[ManualGenerator] Found ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

        // Check if fact count exceeds user-configured threshold
        if (newFactpack.facts.length > config!.max_canon_facts) {
          console.log('[ManualGenerator] Fact count exceeds threshold - showing narrowing modal');
          setCanonNarrowingState(openInitialWorkflowCanonNarrowing({
            keywords,
            pendingFactpack: newFactpack,
          }));
          setModalMode(null); // Close the copy/paste modal
          return; // Don't proceed to next stage yet
        }

        // Fact count is within threshold - proceed to next stage
        if (currentStageIndex < STAGES.length - 1) {
          const navigationPlan = buildWorkflowAdvancePlan({
            currentStageIndex,
            totalStages: STAGES.length,
            stageResults: newResults,
            factpack: newFactpack,
            resetCurrentGroupIndex: true,
          });

          applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
            resetStageChunking: true,
          }));

          // Auto-save stage results
          await saveStageResults(newResults, currentStageIndex);

          // Show next stage with the NEW factpack
          executeWorkflowStageNavigation(navigationPlan);
        }
        return; // Exit early for keyword extractor
      }

      // Check for retrieval_hints from Planner or Creator stages
      // IMPORTANT: Skip retrieval hints processing in multi-chunk mode
      // Process them ONLY after all chunks are merged
      if ((currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft'))) && !isMultiPartGeneration) {
        console.log(`[Retrieval Hints] Processing hints for ${currentStage.name} stage...`);
        const hintsResult = await processRetrievalHints(parsed, newResults, currentStage.name);

        if (!hintsResult.shouldProceed) {
          // Narrowing modal is showing - wait for user action
          console.log(`[Retrieval Hints] Narrowing modal shown, waiting for user action`);
          return;
        }

        // Update results after retrieval hints processing
        newResults = hintsResult.newResults;
        setStageResults(newResults);
        const nextFactpack = hintsResult.factpack;

        // Move to next stage with UPDATED factpack (may have new facts from retrieval hints)
        if (currentStageIndex < STAGES.length - 1) {
          const navigationPlan = buildWorkflowAdvancePlan({
            currentStageIndex,
            totalStages: STAGES.length,
            stageResults: newResults,
            factpack: nextFactpack,
            resetCurrentGroupIndex: true,
          });

          applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
            resetStageChunking: true,
          }));
          executeWorkflowStageNavigation(navigationPlan);
        }
        return; // Exit early after processing retrieval hints
      }

      if (isMultiPartGeneration && (currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft')))) {
        console.log(`[Multi-Chunk] Skipping retrieval hints processing - will process after all chunks merged`);
        // In multi-chunk mode, we'll process retrieval hints after merging all chunks
      }

      // ============================================================================
      // SAFETY CHECK: For Spaces stage with accumulated chunks but isStageChunking=false
      // (can happen after resume if chunk state wasn't properly restored), re-derive
      // the chunking state and treat the submission as part of the chunking workflow.
      // ============================================================================
      let effectiveIsStageChunking = isStageChunking;
      let effectiveTotalChunks = totalStageChunks;
      let effectiveCurrentChunk = currentStageChunk;

      if (!isStageChunking && currentStage.name === 'Spaces' && config!.type === 'location') {
        // Check if we have accumulated chunks, indicating we're mid-workflow
        if (accumulatedChunkResults.length > 0) {
          console.warn('[Stage Chunking] ⚠️ Detected accumulated spaces but isStageChunking=false. Re-deriving...');

          // Get estimated_spaces from purpose stage
          const purposeData = stageResults.purpose as Record<string, unknown> | undefined;
          let estimatedSpaces = accumulatedChunkResults.length + 1; // Assume at least one more

          if (purposeData?.estimated_spaces) {
            if (typeof purposeData.estimated_spaces === 'number') {
              estimatedSpaces = purposeData.estimated_spaces;
            } else if (typeof purposeData.estimated_spaces === 'string') {
              estimatedSpaces = parseInt(purposeData.estimated_spaces, 10) || estimatedSpaces;
            }
          }

          // Correct the state for this submission
          effectiveIsStageChunking = true;
          effectiveTotalChunks = estimatedSpaces;
          effectiveCurrentChunk = accumulatedChunkResults.length; // Next chunk to generate

          // Also update the React state to fix future submissions
          setIsStageChunking(true);
          setTotalStageChunks(estimatedSpaces);
          setCurrentStageChunk(accumulatedChunkResults.length);

          console.log(`[Stage Chunking] ✓ Re-derived: chunk ${effectiveCurrentChunk + 1}/${effectiveTotalChunks}`);
        } else {
          // No accumulated chunks - this might be the first space, check if we should chunk
          const purposeData = stageResults.purpose as Record<string, unknown> | undefined;
          let estimatedSpaces = 1;

          if (purposeData?.estimated_spaces) {
            if (typeof purposeData.estimated_spaces === 'number') {
              estimatedSpaces = purposeData.estimated_spaces;
            } else if (typeof purposeData.estimated_spaces === 'string') {
              estimatedSpaces = parseInt(purposeData.estimated_spaces, 10) || 1;
            }
          }

          if (estimatedSpaces > 1) {
            console.warn('[Stage Chunking] ⚠️ First space submitted but isStageChunking=false. Setting up chunking...');
            effectiveIsStageChunking = true;
            effectiveTotalChunks = estimatedSpaces;
            effectiveCurrentChunk = 0;

            setIsStageChunking(true);
            setTotalStageChunks(estimatedSpaces);
            setCurrentStageChunk(0);

            console.log(`[Stage Chunking] ✓ Set up chunking: ${estimatedSpaces} total spaces`);
          }
        }
      }

      // STAGE CHUNKING: Handle chunk completion and merging (e.g., Location Spaces)
      if (effectiveIsStageChunking) {
        console.log(`[Stage Chunking] Chunk ${effectiveCurrentChunk + 1}/${effectiveTotalChunks} complete for ${currentStage.name}`);

        // ====================================================================
        // SPACE APPROVAL WORKFLOW: For Location Spaces stage, show approval modal
        // before adding space to accumulated results. This allows users to
        // accept, reject, or edit each space before continuing generation.
        // ====================================================================
        if (currentStage.name === 'Spaces' && config!.type === 'location') {
          console.log(`[Space Approval] Showing approval modal for space #${effectiveCurrentChunk + 1}`);

          // Store the pending space and show approval modal
          setPendingSpace(parsed);
          setReviewingSpaceIndex(-1); // -1 indicates this is a new/pending space
          setSavedNewSpace(null); // Clear any saved new space

          // ✓ FIX: If in skip mode, DON'T auto-complete chunking
          // Allow user to paste multiple spaces, review each one
          if (skipMode) {
            console.log('[Skip Mode] Space data pasted, opening approval modal');
            setShowSpaceApprovalModal(true);
            setModalMode(null);
            // DON'T advance stage - wait for user to review and decide
            return;
          }

          // ✓ Batch Mode: Auto-accept spaces without showing approval modal
          if (batchModeEnabled) {
            console.log(`[Batch Mode] Auto-accepting space: ${parsed.name || 'Unnamed'}`);
            const progress = buildAcceptedLocationSpaceProgress({
              acceptedSpace: parsed,
              accumulatedChunkResults,
              liveMapSpaces,
              stageResults,
              stageName: currentStage.name,
              currentStageChunk: effectiveCurrentChunk,
              totalStageChunks: effectiveTotalChunks,
              showLiveMap,
            });

            setAccumulatedChunkResults(progress.newAccumulated);
            setLiveMapSpaces(progress.updatedLiveMapSpaces);
            if (progress.appendedSpaceData) {
              setShowLiveMap(true);
              console.log(`[Batch Mode] Auto-added space to map: ${progress.appendedSpaceData.name}`);
            }

            if (!progress.stageComplete && progress.nextChunkStep) {
              setCurrentStageChunk(progress.nextChunkStep.nextChunkIndex);
              setStageResults(progress.updatedStageResults);

              if (autoSaveEnabled && progressSession) {
                await saveStateAndSession({
                  stageResults: progress.updatedStageResults,
                  stageChunkState: progress.updatedStageChunkState,
                });
              }

              console.log(`[Batch Mode] Auto-advancing to space ${progress.nextChunkStep.nextChunkIndex + 1}/${effectiveTotalChunks}`);
              const launchPlan = buildWorkflowSameStageLaunchPlan({
                stageIndex: currentStageIndex,
                stageResults: progress.updatedStageResults,
                factpack,
                chunkInfo: progress.nextChunkStep.chunkInfo,
              });
              executeWorkflowStageLaunch(launchPlan, {
                runtimeConfig: config!,
              });
              return;
            }

            console.log(`[Batch Mode] All ${effectiveTotalChunks} spaces auto-accepted. Finalizing...`);
            setStageResults(progress.updatedStageResults);
            setIsStageChunking(false);
            setCurrentStageChunk(0);
            setTotalStageChunks(0);
            setBatchModeEnabled(false); // Reset batch mode for next generation

            if (currentStageIndex < STAGES.length - 1) {
              const nextStageIndex = currentStageIndex + 1;
              const launchPlan = buildWorkflowJumpToStageLaunchPlan({
                stageIndex: nextStageIndex,
                stageResults: progress.updatedStageResults,
                factpack,
              });
              applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
                resetStageChunking: true,
              }));
              setBatchModeEnabled(false);
              await saveStateAndSession({
                currentStageIndex: nextStageIndex,
                stageResults: progress.updatedStageResults,
                stageChunkState: progress.updatedStageChunkState,
              });
              executeWorkflowStageLaunch(launchPlan, {
                runtimeConfig: config!,
              });
            } else {
              setStageResults(progress.updatedStageResults);
              executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
                finalOutput: buildResolvedWorkflowFinalContent({
                  workflowType: 'location',
                  stageResults: progress.updatedStageResults,
                  ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
                }),
              }));
            }
            return;
          }

          setShowSpaceApprovalModal(true);
          setModalMode(null); // Close copy-paste modal

          // The approval handlers (handleSpaceAccept, handleSpaceReject, handleSpaceEdit)
          // will be called when user makes a decision. Those handlers will continue
          // the chunking workflow.
          return; // Wait for user approval before continuing
        }

        // Collect this chunk's results (for non-Spaces stages or after approval)
        const newAccumulated = [...accumulatedChunkResults, parsed];
        setAccumulatedChunkResults(newAccumulated);

        console.log(`[Stage Chunking] Accumulated ${newAccumulated.length}/${totalStageChunks} chunks`);

        // Check for proposals - if user answers are needed, show review modal
        const proposals = (parsed as JsonRecord).proposals;
        const hasProposals = proposals && Array.isArray(proposals) && proposals.length > 0;

        if (hasProposals) {
          console.log(`[Stage Chunking] Chunk has ${(proposals as unknown[]).length} proposals - showing review modal`);
          setCurrentStageOutput(parsed);
          setShowReviewModal(true);
          return; // Wait for user to answer proposals before continuing
        }

        const stageChunkProgress = buildWorkflowStageChunkProgress({
          stageName: currentStage.name,
          stageResults: newResults,
          accumulatedChunks: newAccumulated,
          currentStageChunk,
          totalStageChunks,
          liveMapSpaces,
          showLiveMap,
        });

        if (!stageChunkProgress.stageComplete && stageChunkProgress.nextChunkStep && stageChunkProgress.updatedStageChunkState) {
          const { nextChunkIndex, chunkInfo } = stageChunkProgress.nextChunkStep;
          setCurrentStageChunk(nextChunkIndex);

          console.log(`[Stage Chunking] Moving to chunk ${nextChunkIndex + 1}/${totalStageChunks}`);
          setStageResults(stageChunkProgress.updatedStageResults);

          if (autoSaveEnabled && progressSession) {
            await saveStateAndSession({
              stageResults: stageChunkProgress.updatedStageResults,
              stageChunkState: stageChunkProgress.updatedStageChunkState,
            });
            console.log(`[Auto-Save] Saved chunk ${currentStageChunk + 1}/${totalStageChunks} for ${currentStage.name}`);
          }

          const launchPlan = buildWorkflowSameStageLaunchPlan({
            stageIndex: currentStageIndex,
            stageResults: stageChunkProgress.updatedStageResults,
            factpack,
            chunkInfo,
          });
          executeWorkflowStageLaunch(launchPlan, {
            runtimeConfig: config!,
          });

          return;
        }

        console.log(`[Stage Chunking] All ${totalStageChunks} chunks complete for ${currentStage.name}. Finalizing...`);
        setStageResults(stageChunkProgress.updatedStageResults);
        setIsStageChunking(false);
        setCurrentStageChunk(0);
        setTotalStageChunks(0);
        setAccumulatedChunkResults([]);

        if (config?.type !== 'location') {
          setShowLiveMap(false);
          setLiveMapSpaces([]);
        }

        if (autoSaveEnabled && progressSession) {
          await saveStateAndSession({
            stageResults: stageChunkProgress.updatedStageResults,
            stageChunkState: undefined,
          });
          console.log('[Auto-Save] Cleared chunking state - stage complete');
        }

        console.log('[Stage Chunking] Final merged result:', stageChunkProgress.mergedStageOutput);
        newResults = stageChunkProgress.updatedStageResults;
      }

      // NPC SECTION CHUNKING: Handle section completion and merging
      if (isNpcSectionChunking && currentStage.name === 'Creator') {
        console.log(`[NPC Section Chunking] Section ${currentNpcSectionIndex + 1}/${npcSectionChunks.length} complete: ${npcSectionChunks[currentNpcSectionIndex]?.chunkLabel}`);

        const { mergedSections, cleanedSections } = mergeWorkflowNpcSections(accumulatedNpcSections, parsed);
        setAccumulatedNpcSections(mergedSections);

        console.log(`[NPC Section Chunking] Merged section output. Total fields so far: ${Object.keys(cleanedSections).length}`);

        const nextSectionStep = getNextWorkflowNpcSectionStep(npcSectionChunks, currentNpcSectionIndex);
        if (nextSectionStep) {
          const { nextSectionIndex, nextSection, chunkInfo } = nextSectionStep;
          setCurrentNpcSectionIndex(nextSectionIndex);

          console.log(`[NPC Section Chunking] Moving to section ${nextSectionIndex + 1}/${npcSectionChunks.length}: ${nextSection.chunkLabel}`);

          // Update stage results with merged content so far
          const updatedResults = {
            ...newResults,
            creator: cleanedSections,
          };
          setStageResults(updatedResults);

          // Re-run Creator stage with next section
          const launchPlan = buildWorkflowSameStageLaunchPlan({
            stageIndex: currentStageIndex,
            stageResults: updatedResults,
            factpack,
            chunkInfo,
            currentNpcSectionIndex: nextSectionIndex,
            accumulatedNpcSections: mergedSections,
          });
          executeWorkflowStageLaunch(launchPlan, {
            runtimeConfig: config!,
          });

          return; // Don't proceed to next stage yet
        }

        // All NPC sections complete - finalize
        console.log(`[NPC Section Chunking] All ${npcSectionChunks.length} sections complete. Finalizing NPC...`);

        // Store final merged NPC
        const finalResults = {
          ...newResults,
          creator: cleanedSections,
        };
        setStageResults(finalResults);

        // Reset NPC section chunking state
        clearWorkflowChunkingState();
        setIsMultiPartGeneration(false);

        // Continue to next stage (Fact Checker)
        if (currentStageIndex < STAGES.length - 1) {
          const nextIndex = currentStageIndex + 1;
          const launchPlan = buildWorkflowJumpToStageLaunchPlan({
            stageIndex: nextIndex,
            stageResults: finalResults,
            factpack,
          });
          applyWorkflowUiTransition({
            modalMode: null,
          });
          executeWorkflowStageLaunch(launchPlan, {
            runtimeConfig: config!,
          });
        }

        return; // Exit after handling NPC section completion
      }

      // Check if we're in multi-chunk mode (fact-based) and have more chunks to process for THIS stage
      if (isMultiPartGeneration && !isNpcSectionChunking && currentGroupIndex < factGroups.length - 1) {
        console.log(`[Multi-Chunk] Stage: ${currentStage.name}, Chunk ${currentGroupIndex + 1}/${factGroups.length} complete.`);
        console.log(`[Multi-Chunk] Current index: ${currentGroupIndex}, Total groups: ${factGroups.length}, Moving to next chunk...`);

        // CRITICAL FIX: Update the stage output with the LATEST AI response
        // This ensures the next chunk sees the updated/corrected version, not the original
        const stageKey = getStageStorageKey(currentStage);
        const chunkResults = [...getJsonRecordList(newResults[`${stageKey}_chunks`]), parsed];

        // Update the main stage output with the latest response
        // This way the next chunk will reference the UPDATED data
        const updatedResults: StageResults = {
          ...newResults,
          [stageKey]: parsed, // Use latest chunk's output as the "current" output
          [`${stageKey}_chunks`]: setStageArrayValue(chunkResults), // Also keep chunk history for merging later
        };
        setStageResults(updatedResults);

        console.log(`[Multi-Chunk] Updated ${stageKey} with latest chunk response. Next chunk will see these corrections.`);

        const nextChunkStep = getNextWorkflowFactChunkStep(factGroups, currentGroupIndex);
        if (!nextChunkStep) {
          console.warn('[Multi-Chunk] Expected a next fact chunk, but no next step could be built.');
          return;
        }

        const {
          nextChunkIndex,
          nextFactpack: nextGroupFactpack,
          chunkInfo,
        } = nextChunkStep;
        setCurrentGroupIndex(nextChunkIndex);
        setFactpack(nextGroupFactpack);

        // Extract unanswered proposals from this chunk to carry forward
        const unansweredProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];

        // Pass unanswered proposals to the AI in the user prompt context
        // The AI will try to answer them with the new facts from the next chunk
        console.log(`[Multi-Chunk] Carrying forward ${unansweredProposals.length} unanswered proposals to chunk ${nextChunkIndex + 1}`);

        // Re-run the SAME stage with the next chunk's facts
        const launchPlan = buildWorkflowSameStageLaunchPlan({
          stageIndex: currentStageIndex,
          stageResults: updatedResults,
          factpack: nextGroupFactpack,
          chunkInfo,
          currentGroupIndex: nextChunkIndex,
        });
        executeWorkflowStageLaunch(launchPlan, {
          runtimeConfig: config!,
          unansweredProposals,
        });

        return; // Don't proceed to next stage yet
      }

      // If multi-chunk mode and this was the last chunk for this stage, merge chunk results
      if (isMultiPartGeneration && currentGroupIndex === factGroups.length - 1) {
        console.log(`[Multi-Chunk] All ${factGroups.length} chunks complete for stage ${currentStage.name}. Merging results...`);

        const stageKey = getStageStorageKey(currentStage);
        const chunkResults = [...asJsonRecordArray(newResults[`${stageKey}_chunks`]), parsed];

        // Merge all chunk results for this stage
        let mergedStageOutput = mergeWorkflowChunkOutputs(chunkResults, currentStage.name);

        // VALIDATION: Check Stats stage for refusal to create stats
        if (currentStage.name.toLowerCase().includes('stats')) {
          const statsFields = ['ability_scores', 'armor_class', 'hit_points'];
          const missingStats = statsFields.filter(field => !(field in mergedStageOutput));

          // Check assumptions for signs of refusal
          const assumptions = mergedStageOutput.assumptions;
          const isRefusingToCreate = Array.isArray(assumptions) && assumptions.some((a: unknown) =>
            typeof a === 'string' && (
              a.toLowerCase().includes('no mechanical statistics') ||
              a.toLowerCase().includes('canon does not specify') ||
              a.toLowerCase().includes('not provided')
            )
          );

          if (missingStats.length > 0 || isRefusingToCreate) {
            console.error(`[Validation] Stats stage refused to create stats or is missing fields:`, missingStats);
            console.error(`[Validation] Stage output:`, mergedStageOutput);

            const criticalIssue = {
              severity: 'critical',
              description: `AI refused to create stats. The AI must CREATE appropriate stats based on the character concept, not report what canon says. Missing: ${missingStats.join(', ')}`,
              suggestion: 'Click "Reject & Retry" and instruct: "You are a CREATOR. Create appropriate stats for this character based on their role, class, and CR. Do not say canon doesn\'t specify them - YOU create them!"',
            };

            if (!Array.isArray(mergedStageOutput.conflicts)) {
              mergedStageOutput.conflicts = [];
            }
            (mergedStageOutput.conflicts as unknown[]).unshift(criticalIssue);
          }
        }

        let mergedResults: StageResults = {
          ...stageResults,
          [stageKey]: mergedStageOutput,
        };
        setStageResults(mergedResults);

        const mergedReviewPreparation = prepareWorkflowStageForReview({
          parsed: mergedStageOutput as JsonRecord,
          stageName: currentStage.name,
          workflowType: config?.type,
          accumulatedAnswers,
          isMultiPartGeneration: false,
        });
        mergedStageOutput = mergedReviewPreparation.parsed;
        mergedResults = {
          ...stageResults,
          [stageKey]: mergedStageOutput,
        };
        setStageResults(mergedResults);

        if (mergedReviewPreparation.shouldPauseForPlannerDecisions || mergedReviewPreparation.shouldPauseForReview) {
          if (mergedReviewPreparation.hasProposals) {
            console.log(`[Multi-Chunk] ${Array.isArray(mergedStageOutput.proposals) ? mergedStageOutput.proposals.length : 0} proposals remain unanswered after all chunks. Showing review modal...`);
          }
          setCurrentStageOutput(mergedStageOutput as JsonRecord);
          setShowReviewModal(true);
          return; // Wait for user to answer
        }

        // Now process retrieval hints from the merged output (Planner or Creator only)
        // Only do this if there are NO unanswered proposals
        let factpackAfterHints = factpack;
        if (currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft'))) {
          console.log(`[Multi-Chunk] Processing retrieval hints from merged ${currentStage.name} output...`);
          const initialFactCount = factpack!.facts.length;
          const hintsResult = await processRetrievalHints(mergedStageOutput, mergedResults, currentStage.name);

          if (!hintsResult.shouldProceed) {
            // Narrowing modal is showing - wait for user action
            // When user responds, they'll be taken to next stage
            console.log(`[Multi-Chunk] Retrieval hints triggered narrowing modal, waiting for user action`);
            return;
          }

          // Update results after retrieval hints processing
          mergedResults = hintsResult.newResults;
          setStageResults(mergedResults);
          factpackAfterHints = hintsResult.factpack;

          // If retrieval hints added facts, disable multi-chunk mode for subsequent stages
          // (the new factpack won't align with the original chunk groups)
          if (factpackAfterHints && factpackAfterHints.facts.length > initialFactCount) {
            console.log(`[Multi-Chunk] Retrieval hints added facts (${initialFactCount} → ${factpackAfterHints.facts.length}). Disabling multi-chunk mode for subsequent stages.`);
            setIsMultiPartGeneration(false);
            clearWorkflowChunkingState();
            setCurrentGroupIndex(0);
          }
        }

        // No unanswered proposals, proceed to next stage or complete
        setModalMode(null);
        _setSkipMode(false);

        const stageProgression = getWorkflowStageProgression(currentStageIndex, STAGES.length);
        if (stageProgression.kind === 'advance' && typeof stageProgression.nextIndex === 'number') {
          // Move to next stage
          console.log(`[Multi-Chunk] No unanswered proposals. Proceeding to next stage...`);

          applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
            resetMultiPart: true,
            resetStageChunking: true,
          }));

          const navigationPlan = buildWorkflowAdvancePlan({
            currentStageIndex,
            totalStages: STAGES.length,
            stageResults: mergedResults,
            factpack: factpackAfterHints,
            resetCurrentGroupIndex: true,
          });

          executeWorkflowStageNavigation(navigationPlan);
        } else {
          // Pipeline complete!
          console.log(`[Multi-Chunk] Pipeline complete! Processing final output...`);

          applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
            resetMultiPart: true,
            resetStageChunking: true,
          }));

          const completionResult = buildWorkflowCompletionResult({
            workflowType: config?.type,
            stageResults: mergedResults,
            strategy: 'resolved',
            ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
          });
          const { finalContent } = completionResult;
          logWorkflowCompletionResult('[Multi-Chunk Complete]', completionResult, mergedResults);

          setStageResults(mergedResults);
          executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
            finalOutput: finalContent,
          }));
          await saveStageResults(mergedResults, STAGES.length - 1);
        }
        return;
      }

      // Move to next stage or finish (for all other stages - non-chunked flow)
      const continuation = resolveWorkflowStageContinuation({
        currentStageIndex,
        currentStage,
        stages: STAGES,
        workflowType: config?.type,
        userPrompt: config?.prompt,
        stageResults: newResults,
        currentStageOutput: parsed,
        accumulatedAnswers,
        ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
        dynamicNpcStages,
        catalog: STAGE_CATALOG,
        completionStrategy: 'finalized',
        onLegendaryDecisionRequired: () =>
          window.confirm('Should this character have legendary/mythic or lair/regional actions?'),
      });
      applyNpcDynamicRoutingPlan(continuation.routingPlan);

      if (continuation.kind === 'advance') {
        applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
          resetMultiPart: true,
        }));

        setStageResults(newResults);

        // Auto-save stage results
        await saveStageResults(newResults, currentStageIndex);

        const launchPlan = buildWorkflowJumpToStageLaunchPlan({
          stageIndex: continuation.nextIndex,
          stageResults: newResults,
          factpack,
        });
        executeWorkflowStageLaunch(launchPlan, {
          runtimeConfig: config!,
        });
      } else {
        // Pipeline complete!
        const completionResult = continuation.completionResult;
        const { finalContent } = completionResult;
        logWorkflowCompletionResult('[Pipeline Complete]', completionResult, newResults);

        setStageResults(newResults);
        executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
          finalOutput: finalContent,
        }));

        // Auto-save final stage results
        await saveStageResults(newResults, STAGES.length - 1);

        console.log('Final Results:', newResults);
        console.log('[DEBUG] Merged finalContent:', finalContent);

        // Check if we're in multi-part generation and have more chunks
        if (isMultiPartGeneration && currentGroupIndex < factGroups.length - 1) {
          const nextChunkStep = getNextWorkflowFactChunkStep(factGroups, currentGroupIndex);
          if (!nextChunkStep) {
            console.warn('[Multi-Chunk] Expected a restart chunk, but no next step could be built.');
          } else {
            const {
              nextChunkIndex,
              nextGroup,
              nextFactpack: nextGroupFactpack,
              chunkInfo,
            } = nextChunkStep;

            const shouldContinue = window.confirm(
              `✅ Part ${currentGroupIndex + 1} of ${factGroups.length} Complete!\n\n` +
              `Current part: ${factGroups[currentGroupIndex].label}\n` +
              `Next part: ${nextGroup.label} (${nextGroup.facts.length} facts)\n\n` +
              `Continue with next part?`
            );

            if (shouldContinue) {
              const launchPlan = buildWorkflowFactChunkRestartLaunchPlan({
                plannerStageIndex: 0,
                nextChunkIndex,
                nextFactpack: nextGroupFactpack,
                chunkInfo,
              });

              executeWorkflowStageLaunch(launchPlan, {
                runtimeConfig: config!,
              });

              return; // Don't set isComplete to true or show completion message
            }

            // User chose to stop - show final results from all chunks processed so far
            alert(
              `✅ Multi-Part Generation Stopped\n\n` +
              `Completed ${currentGroupIndex + 1} of ${factGroups.length} parts.\n\n` +
              `Results from completed parts are shown below.`
            );
          }
        }

        // Show success message and scroll to results
        // Scroll to results section after a brief delay to ensure it's rendered
        setTimeout(() => {
          const resultsSection = document.getElementById('generation-results');
          if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);

        alert(buildWorkflowCompletionAlertMessage({
          finalContent,
          variant: 'validation_summary',
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error processing AI response';
      console.error('[handleSubmit] Error handling AI response:', err);
      const rawSnippet = typeof aiResponse === 'string' ? aiResponse.slice(0, 500) : '';
      const stageName = STAGES[currentStageIndex]?.name ?? 'Unknown stage';
      const messageText = 'Failed to process AI response. Please try again.';
      setError(messageText);
      setLastStageError({ stage: stageName, message: String(err), rawSnippet });
      setCurrentStageOutput(buildWorkflowStageErrorOutput({
        stageName,
        errorMessage: String(err),
        rawSnippet,
      }));
      applyWorkflowUiTransition(buildWorkflowErrorUiTransition());
      return;
    }
  };

  const handleClose = () => {
    if (currentStageIndex >= 0 && currentStageIndex < STAGES.length) {
      // If auto-save is enabled and we have a progress session, data is saved
      const dataSaved = autoSaveEnabled && progressSession;

      const message = dataSaved
        ? 'Close this generation session?\n\n✅ Your progress has been auto-saved and you can resume later from the "Resume Session" option.'
        : 'Are you sure you want to close? Your progress will be lost. Click "Cancel" to continue, or "OK" to reset.';

      const confirmClose = window.confirm(message);
      if (!confirmClose) {
        return;
      }

      // Just close the modal - don't reset if data is saved
      if (dataSaved) {
        setModalMode(null);
        setSessionStatus('idle');
        console.log('[Close] Session closed but saved. Can resume from:', progressSession.sessionId);
      } else {
        // Reset everything if not saved
        resetPipelineState();
        setConfig(null);
      }
    } else {
      setModalMode(null);
      _setSkipMode(false);
    }
  };

  const handleReset = () => {
    resetPipelineState();
    setConfig(null);
  };

  const handleRetryCurrentStage = () => {
    if (currentStageIndex >= 0 && config) {
      setError(null);
      setLastStageError(null);
      applyWorkflowUiTransition(buildWorkflowRetryUiTransition());
      const launchPlan = buildWorkflowJumpToStageLaunchPlan({
        stageIndex: currentStageIndex,
        stageResults,
        factpack,
      });
      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config,
      });
    }
  };

  const handleBack = () => {
    if (currentStageIndex > 0) {
      const prevIndex = currentStageIndex - 1;
      const launchPlan = buildWorkflowJumpToStageLaunchPlan({
        stageIndex: prevIndex,
        stageResults,
        factpack,
      });
      applyWorkflowUiTransition({
        modalMode: null,
        skipMode: false,
      });
      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config!,
      });
    }
  };

  const handleRetryWithAnswers = (answers: Record<string, string>, issuesToAddress: string[]) => {
    // Close review modal
    setError(null);
    setLastStageError(null);
    applyWorkflowUiTransition(buildWorkflowRetryUiTransition());

    // Accumulate answers from this retry
    const updatedAnswers = {
      ...accumulatedAnswers,
      ...answers,
    };
    setAccumulatedAnswers(updatedAnswers);

    console.log('[ManualGenerator] Accumulated answers after retry:', updatedAnswers);

    const stageForRetry = STAGES[currentStageIndex];

    // Planner retries must stay tiny: no failed output echo, no QA restatement
    let additionalInstructions = '';
    if (stageForRetry?.name === 'Planner') {
      const fixList = issuesToAddress.length > 0
        ? issuesToAddress
        : ['Return proposals as []', 'Return flags_echo'];
      additionalInstructions = JSON.stringify({ fix: fixList }, null, 2);
    } else {
      additionalInstructions = 'ADDITIONAL_CRITICAL_INSTRUCTIONS (RETRY):\n\n';

      if (Object.keys(answers).length > 0) {
        additionalInstructions += 'NEW ANSWERS TO PROPOSALS:\n';
        Object.entries(answers).forEach(([question, answer]) => {
          additionalInstructions += `Q: ${question}\nA: ${answer}\n\n`;
        });
        additionalInstructions += 'Use these answers as final decisions. Do not ask follow-up questions about the same topics.\n\n';
      }

      if (issuesToAddress.length > 0) {
        additionalInstructions += 'CRITICAL ISSUES YOU MUST FIX IN THIS RESPONSE:\n';
        issuesToAddress.forEach((issue, i) => {
          additionalInstructions += `${i + 1}. ${issue}\n`;
        });
        additionalInstructions += '\nRevise your response to fix every listed issue completely.\n';
        additionalInstructions += 'Do not repeat any missing field, empty field, placeholder value, or invalid structure described above.\n';
      }

      // Stage-specific hard requirements for retries (keep minimal to avoid prompt bloat)
      if (stageForRetry?.name === 'Creator: Core Details') {
        additionalInstructions += '\nMANDATORY OUTPUT FOR CORE DETAILS (no omissions allowed):\n';
        additionalInstructions += '- Provide ALL personality fields as non-empty arrays: personality_traits, ideals, bonds, flaws, goals, fears, quirks, voice_mannerisms, hooks.\n';
        additionalInstructions += '- Do NOT collapse into hooks-only or summaries. Each field must be distinct and populated.\n';
        additionalInstructions += '- If any field was missing previously, you MUST supply it now with concrete content. Placeholders/empty values are not acceptable.\n';
      }

      if (stageForRetry?.name === 'Creator: Spellcasting') {
        additionalInstructions += '\nMANDATORY OUTPUT FOR SPELLCASTING:\n';
        additionalInstructions += '- Provide spellcasting_ability, spells_known, and spell_slots if the class can cast spells.\n';
        additionalInstructions += '- Do NOT return empty scaffolding or omit required spell data.\n';
      }

      if (stageForRetry?.name === 'Creator: Relationships') {
        additionalInstructions += '\nMANDATORY OUTPUT FOR RELATIONSHIPS:\n';
        additionalInstructions += '- Provide concrete allies, enemies, organizations, family, or contacts tied to this character.\n';
        additionalInstructions += '- Do NOT return only generic personality repetition or empty arrays.\n';
      }

      additionalInstructions += '\nFINAL RETRY INSTRUCTIONS:\n';
      additionalInstructions += '- Follow the required output format exactly.\n';
      additionalInstructions += '- Return the same JSON object shape required for this stage.\n';
      additionalInstructions += '- Replace missing, empty, or invalid fields in place. Do not add new keys.\n';
      additionalInstructions += '- Fix every listed issue in this response.\n';
      additionalInstructions += '- Fill every required field with concrete content.\n';
      additionalInstructions += '- Do not return placeholders, empty scaffolding, or unrelated extra structures.\n';
      additionalInstructions += '- Do not repeat the previous invalid response.\n';
    }

    const launchPlan: WorkflowStageLaunchPlan = {
      kind: 'show_stage',
      stageIndex: currentStageIndex,
      stageResults,
      factpack,
      chunkInfo: currentChunkInfo || undefined,
    };

    executeWorkflowStageLaunch(launchPlan, {
      runtimeConfig: config!,
      overrideDecisions: updatedAnswers,
      additionalGuidance: additionalInstructions,
    });
  };

  const handleAcceptWithIssues = (answers: Record<string, string>) => {
    if (currentStageOutput && typeof currentStageOutput.error === 'string' && currentStageOutput.error.trim().length > 0) {
      console.warn('[ManualGenerator] Refusing to accept output while current stage is in an error state. Retry is required.');
      return;
    }

    // User chose to accept despite proposals/issues
    setError(null);
    setLastStageError(null);
    applyWorkflowUiTransition(buildWorkflowRetryUiTransition());

    // Accumulate answers from this stage
    const updatedAnswers = {
      ...accumulatedAnswers,
      ...answers,
    };
    setAccumulatedAnswers(updatedAnswers);

    console.log('[ManualGenerator] Accumulated answers:', updatedAnswers);

    const currentStage = STAGES[currentStageIndex];

    // Filter out answered proposals from the stage output before storing
    let filteredOutput = { ...currentStageOutput };

    if (filteredOutput && Array.isArray(filteredOutput.proposals)) {
      const remainingProposals = filterAnsweredWorkflowProposals(filteredOutput.proposals, answers);
      console.log(`[ManualGenerator] Filtered proposals: ${(filteredOutput.proposals as unknown[]).length} -> ${remainingProposals?.length ?? 0}`);
      filteredOutput = {
        ...filteredOutput,
        proposals: remainingProposals,
      };
    }

    const newResults: StageResults = {
      ...stageResults,
      [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: filteredOutput || {},
    };

    const continuation = resolveWorkflowStageContinuation({
      currentStageIndex,
      currentStage,
      stages: STAGES,
      workflowType: config?.type,
      userPrompt: config?.prompt,
      stageResults: newResults,
      currentStageOutput: (filteredOutput || {}) as JsonRecord,
      accumulatedAnswers: updatedAnswers,
      ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
      dynamicNpcStages,
      catalog: STAGE_CATALOG,
      completionStrategy: 'resolved',
      onLegendaryDecisionRequired: () =>
        window.confirm('Should this character have legendary/mythic or lair/regional actions?'),
    });
    applyNpcDynamicRoutingPlan(continuation.routingPlan);

    if (continuation.kind === 'advance') {
      applyWorkflowUiTransition(buildWorkflowAdvanceUiTransition({
        resetMultiPart: true,
        closeModal: false,
      }));

      setStageResults(newResults);

      const launchPlan = buildWorkflowJumpToStageLaunchPlan({
        stageIndex: continuation.nextIndex,
        stageResults: newResults,
        factpack: factpack || null,
      });
      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config!,
        overrideDecisions: updatedAnswers,
      });
    } else {
      // Pipeline complete - Build complete final output
      // CRITICAL FIX: Extract content from the correct location in stage results
      // Physics Validator wraps content in { content: { content: {...}, relevant_canon: {...} } }
      const completionResult = buildWorkflowCompletionResult({
        workflowType: config?.type,
        stageResults: newResults,
        accumulatedAnswers: updatedAnswers,
        strategy: 'finalized',
        ruleBase: typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined,
        baseContentOverride: config?.type === 'npc'
          ? {
            ...assembleFinalWorkflowContent(config?.type, newResults).content,
            proposals: [],
          }
          : undefined,
      });
      const { finalContent } = completionResult;
      logWorkflowCompletionResult('[handleAcceptWithIssues]', completionResult, newResults);

      setStageResults(newResults);
      setLastStageError(null);
      executeWorkflowStageLaunch(buildWorkflowCompletedLaunchPlan({
        finalOutput: finalContent,
      }));

      console.log('[ManualGenerator] Pipeline complete via handleAcceptWithIssues');
      console.log('[DEBUG] Final content:', finalContent);

      // Scroll to results section
      setTimeout(() => {
        const resultsSection = document.getElementById('generation-results');
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);

      // Show success message
      alert(buildWorkflowCompletionAlertMessage({
        finalContent,
        variant: 'simple',
      }));
    }
  };

  const handleSkip = () => {
    // User wants to skip this stage and provide data manually
    // Switch to input mode and enable skip mode to show appropriate UI
    _setSkipMode(true);
    setModalMode('input');
  };

  const handleNarrow = async (newKeywords: string[]) => {
    // User provided new, more specific keywords - re-search canon
    console.log('[ManualGenerator] Narrowing with new keywords:', newKeywords);

    try {
      const newFactpack = await searchCanonWithKeywords(newKeywords);
      console.log(`[ManualGenerator] After narrowing: ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

      // Check if still exceeds threshold
      if (newFactpack.facts.length > config!.max_canon_facts) {
        setCanonNarrowingState((prev) => updateWorkflowCanonNarrowingSearch(prev, {
          keywords: newKeywords,
          pendingFactpack: newFactpack,
        }));
        alert(`Still ${newFactpack.facts.length} facts found (limit: ${config!.max_canon_facts}). Please narrow further or proceed anyway.`);
      } else {
        const pendingStageResults = canonNarrowingState.pendingStageResults;
        const wasProcessingRetrievalHints = isProcessingRetrievalHints;
        clearCanonNarrowingState();
        const navigationPlan = buildWorkflowCanonContinuationPlan({
          currentStageIndex,
          totalStages: STAGES.length,
          currentStageName: STAGES[currentStageIndex]?.name || '',
          stageResults,
          pendingStageResults,
          selectedFactpack: newFactpack,
          existingFactpack: factpack,
          wasProcessingRetrievalHints,
          narrowingKeywords: newKeywords,
          resetCurrentGroupIndex: wasProcessingRetrievalHints && isMultiPartGeneration,
        });
        if (wasProcessingRetrievalHints && navigationPlan.factpack) {
          console.log(`[ManualGenerator] Merged after narrowing: ${navigationPlan.factpack.facts.length} total facts`);
        }
        executeWorkflowStageNavigation(navigationPlan);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error searching canon';
      setError(`Failed to search canon: ${message}`);
    }
  };

  const handleFilterFacts = (filteredFacts: WorkflowCanonFactSelection[]) => {
    const pendingNarrowingFactpack = canonNarrowingState.pendingFactpack;
    if (!pendingNarrowingFactpack) {
      return;
    }

    console.log('[ManualGenerator] User filtered to', filteredFacts.length, 'facts from', pendingNarrowingFactpack.facts.length);

    const filteredFactpack = buildWorkflowFilteredFactpack(filteredFacts);
    const pendingStageResults = canonNarrowingState.pendingStageResults;
    const narrowingKeywords = canonNarrowingState.keywords;
    const wasProcessingRetrievalHints = isProcessingRetrievalHints;
    clearCanonNarrowingState();

    if (wasProcessingRetrievalHints) {
      const navigationPlan = buildWorkflowCanonContinuationPlan({
        currentStageIndex,
        totalStages: STAGES.length,
        currentStageName: STAGES[currentStageIndex]?.name || '',
        stageResults,
        pendingStageResults,
        selectedFactpack: filteredFactpack,
        existingFactpack: factpack,
        wasProcessingRetrievalHints: true,
        narrowingKeywords,
        resetCurrentGroupIndex: isMultiPartGeneration,
      });
      if (navigationPlan.factpack) {
        console.log(`[ManualGenerator] Merged after filtering: ${navigationPlan.factpack.facts.length} total facts`);
      }
      executeWorkflowStageNavigation(navigationPlan);
    } else {
      const nextStageName = STAGES[Math.min(currentStageIndex + 1, STAGES.length - 1)]?.name;
      const needsChunking = checkForChunking(filteredFactpack, nextStageName);

      if (needsChunking) {
        return;
      }

      const navigationPlan = buildWorkflowCanonContinuationPlan({
        currentStageIndex,
        totalStages: STAGES.length,
        currentStageName: STAGES[currentStageIndex]?.name || '',
        stageResults,
        pendingStageResults,
        selectedFactpack: filteredFactpack,
        existingFactpack: factpack,
        wasProcessingRetrievalHints: false,
        narrowingKeywords,
      });
      executeWorkflowStageNavigation(navigationPlan);
    }
  };

  const handleProceedAnyway = () => {
    const pendingNarrowingFactpack = canonNarrowingState.pendingFactpack;
    if (!pendingNarrowingFactpack) {
      return;
    }

    console.log('[ManualGenerator] User chose to proceed with', pendingNarrowingFactpack.facts.length, 'facts');

    const pendingStageResults = canonNarrowingState.pendingStageResults;
    const narrowingKeywords = canonNarrowingState.keywords;
    const wasProcessingRetrievalHints = isProcessingRetrievalHints;
    clearCanonNarrowingState();

    const navigationPlan = buildWorkflowCanonContinuationPlan({
      currentStageIndex,
      totalStages: STAGES.length,
      currentStageName: STAGES[currentStageIndex]?.name || '',
      stageResults,
      pendingStageResults,
      selectedFactpack: pendingNarrowingFactpack,
      existingFactpack: factpack,
      wasProcessingRetrievalHints,
      narrowingKeywords,
      resetCurrentGroupIndex: wasProcessingRetrievalHints && isMultiPartGeneration,
    });
    if (wasProcessingRetrievalHints && navigationPlan.factpack) {
      console.log(`[ManualGenerator] Merged after proceeding anyway: ${navigationPlan.factpack.facts.length} total facts`);
    }
    executeWorkflowStageNavigation(navigationPlan);
  };

  const handleProceedWithChunking = () => {
    setChunkingState((prev) => closeWorkflowChunkingModal(prev));

    if (isNpcSectionChunking) {
      // NPC Section-Based Chunking
      console.log('[NPC Section Chunking] User approved section-based generation with', npcSectionChunks.length, 'sections');

      setIsMultiPartGeneration(true);

      const firstSection = npcSectionChunks[0];

      // Create chunk info for first section
      const chunkInfo = buildWorkflowChunkInfo(1, npcSectionChunks.length, firstSection.chunkLabel);

      const currentStage = STAGES[currentStageIndex];
      console.log(`[NPC Section Chunking] Starting section 1/${npcSectionChunks.length}: ${firstSection.chunkLabel} for ${currentStage.name} stage`);

      const launchPlan = buildWorkflowNpcSectionStartLaunchPlan({
        stageIndex: currentStageIndex,
        stageResults,
        factpack,
        chunkInfo,
      });

      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config!,
      });

    } else {
      // Fact-Based Chunking (original behavior)
      console.log('[Fact Chunking] User approved multi-part generation with', factGroups.length, 'parts');

      setIsMultiPartGeneration(true);

      // Start with first group
      const firstGroup = factGroups[0];
      const firstGroupFactpack = buildWorkflowFactGroupFactpack(firstGroup);

      // Create chunk info for first chunk
      const chunkInfo = buildWorkflowChunkInfo(1, factGroups.length, firstGroup.label);

      // CRITICAL FIX: Stay on the CURRENT stage and show chunk 1
      // Don't move to next stage - we're chunking the current stage
      const currentStage = STAGES[currentStageIndex];
      console.log(`[Fact Chunking] Starting chunk 1/${factGroups.length} for ${currentStage.name} stage`);

      const launchPlan = buildWorkflowFactChunkStartLaunchPlan({
        stageIndex: currentStageIndex,
        stageResults,
        factpack: firstGroupFactpack,
        chunkInfo,
      });

      executeWorkflowStageLaunch(launchPlan, {
        runtimeConfig: config!,
      });
    }
  };

  const handleCloseNarrowingModal = () => {
    clearCanonNarrowingState();
    setModalMode('input');
  };

  // Helper function to process retrieval_hints from stage outputs
  const processRetrievalHints = async (stageOutput: JsonRecord, newResults: StageResults, stageName: string) => {
    const retrievalHints = isRecord(stageOutput.retrieval_hints) ? stageOutput.retrieval_hints : null;
    const hintsKeywords = extractRetrievalHintKeywords(stageOutput);

    if (hintsKeywords.length === 0) {
      // No actual hints - proceed normally
      return { shouldProceed: true, newResults, factpack };
    }

    console.log('[ManualGenerator] Found retrieval_hints:', hintsKeywords);

    // Search canon with hints
    const newFactpack = await searchCanonWithKeywords(hintsKeywords);
    console.log(`[ManualGenerator] Retrieval hints found ${newFactpack.facts.length} additional facts (threshold: ${config!.max_canon_facts})`);

    // Check if NEW facts exceed threshold
    if (newFactpack.facts.length > config!.max_canon_facts) {
      console.log('[ManualGenerator] Retrieval hints exceeded threshold - showing narrowing modal');

      // Store context about what was requested
      const requestedEntities = [
        ...toStringArray(retrievalHints?.entities),
        ...toStringArray(retrievalHints?.regions),
      ];

      setCanonNarrowingState(openRetrievalHintWorkflowCanonNarrowing({
        keywords: hintsKeywords,
        pendingFactpack: newFactpack,
        pendingStageResults: newResults,
        stageName,
        requestedEntities,
      }));
      setModalMode(null);
      return { shouldProceed: false, newResults, factpack };
    }

    // Merge with existing factpack
    const mergedFactpack = mergeFactpacks(factpack!, newFactpack);
    console.log(`[ManualGenerator] Merged factpack: ${factpack!.facts.length} existing + ${newFactpack.facts.length} new = ${mergedFactpack.facts.length} total`);
    setFactpack(mergedFactpack);

    return { shouldProceed: true, newResults, factpack: mergedFactpack };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-500" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-gray-900">AI Content Generator</h1>
                  {project?.title && (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                      {project.title}
                    </span>
                  )}
                  {project?.type && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {project.type}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-1">
                  {assistMode === 'integrated' ? 'Automated AI-powered content generation' : assistMode === 'manual' ? 'Copy prompts to any AI chat, paste responses back' : 'Generate content with AI assistance'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResumeModal(true)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium border border-gray-300"
              >
                Resume Session
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Auto-save progress</span>
              </label>
              {progressSession && (
                <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                  Session: {progressSession.sessionId.substring(0, 8)}...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Generator Panel - shown before generation starts */}
        {!config && (
          <div className="mb-6">
            {projectId !== 'default' && projectLoading && !project ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600">Loading project settings...</div>
              </div>
            ) : (
              <GeneratorPanel onGenerate={handleGenerate} projectType={project?.type} />
            )}

            {/* Import JSON Section */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-3">Or Import Existing JSON</h3>
              <p className="text-sm text-gray-600 mb-4">
                Skip generation and directly import a previously generated JSON file for editing and saving.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Content Type:</label>
                  <select
                    value={uploadedContentType}
                    onChange={(e) => setUploadedContentType(e.target.value as GenerationConfig['type'])}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="npc">NPC</option>
                    <option value="monster">Monster</option>
                    <option value="encounter">Encounter</option>
                    <option value="item">Item</option>
                    <option value="scene">Scene</option>
                    <option value="story_arc">Story Arc</option>
                    <option value="adventure">Adventure</option>
                    <option value="location">Location</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer text-sm font-medium text-gray-700">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadedJson}
                    className="hidden"
                    disabled={uploading}
                  />
                  {uploading ? 'Importing...' : 'Choose JSON File'}
                </label>
              </div>
              {uploadError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Banner */}
        {currentStageIndex >= 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  Generation in Progress: Stage {currentStageIndex + 1} of {STAGES.length} - {STAGES[currentStageIndex]?.name}
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  {modalMode === null ? 'Modal closed. Click "Show Current Prompt" to continue.' : modalMode === 'output' ? 'Copy the prompt and paste it into your AI chat' : 'Paste the AI response to continue'}
                </p>
                {autoSaveEnabled && lastSaveTime && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Auto-saved at {new Date(lastSaveTime).toLocaleTimeString()}
                  </p>
                )}
                {/* Smart Routing Info */}
                {config?.type === 'npc' && stageRoutingDecision && (
                  <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded-md">
                    <h4 className="text-xs font-semibold text-blue-900 mb-2">📋 Smart Stage Routing</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="font-medium text-green-700">Included Stages:</p>
                        <ul className="list-disc list-inside text-green-800 mt-1 space-y-1">
                          {Object.entries(stageRoutingDecision).filter(([_, req]) => req.required).map(([key, req]) => (
                            <li key={key}>
                              <span className="font-medium">
                                {key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                              </span>
                              {req.reason ? <span className="text-green-700"> — {req.reason}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Deferred Stages:</p>
                        <ul className="list-disc list-inside text-gray-700 mt-1 space-y-1">
                          {Object.entries(stageRoutingDecision).filter(([_, req]) => !req.required).map(([key, req]) => (
                            <li key={key}>
                              <span className="font-medium">
                                {key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                              </span>
                              {req.reason ? <span className="text-gray-600"> — {req.reason}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 mt-2 italic">
                      Stages are included automatically when the request or resolved mechanics indicate they are needed.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {modalMode === null && (
                  <button
                    onClick={handleRetryCurrentStage}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Show Current Prompt
                  </button>
                )}
                {/* Show "Review Spaces" button during location generation if there are accepted spaces */}
                {config?.type === 'location' && accumulatedChunkResults.length > 0 && STAGES[currentStageIndex]?.name === 'Spaces' && (
                  <button
                    onClick={() => {
                      console.log('[Review Spaces] Opening space approval modal to review previous spaces');
                      const syncedLiveMap = syncLocationLiveMapSpaces(
                        accumulatedChunkResults.map(r => extractLocationSpaceForMap(r as JsonRecord))
                      );
                      setLiveMapSpaces(syncedLiveMap);
                      console.log('[Review Spaces] Synchronized reciprocal doors for', syncedLiveMap.length, 'spaces');
                      setReviewingSpaceIndex(accumulatedChunkResults.length - 1); // Start at last accepted space
                      setPendingSpace(accumulatedChunkResults[accumulatedChunkResults.length - 1]);
                      setShowSpaceApprovalModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Review Spaces ({accumulatedChunkResults.length})
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
                >
                  Reset & Start Over
                </button>
              </div>
            </div>
          </div>
        )}

        {config && workflowRunState?.retrieval.warningMessage && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Canon Grounding Warning</h3>
                  <p className="text-sm text-amber-800 mt-1">{workflowRunState.retrieval.warningMessage}</p>
                  <p className="text-xs text-amber-700 mt-2">
                    Grounding status: {workflowRunState.retrieval.groundingStatus}. Facts loaded: {workflowRunState.retrieval.factsFound}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => document.getElementById('resources-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium whitespace-nowrap"
              >
                Check Resources
              </button>
            </div>
          </div>
        )}

        {/* Results Display */}
        {isComplete && finalOutput && (
          <div id="generation-results" className="mt-6 scroll-mt-4">
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-green-800">Generation Complete</h2>
                  <span className="text-3xl">✅</span>
                  <h2 className="text-2xl font-bold text-gray-800">Generated Content</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Homebrew content skips canon delta review and goes straight to editing
                      if (getString(finalOutput, 'deliverable') === 'homebrew') {
                        setShowEditModal(true);
                      } else {
                        setShowCanonDeltaModal(true);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                  >
                    {getString(finalOutput, 'deliverable') === 'homebrew' ? 'Edit & Save to Project' : 'Review & Save to Project'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const jsonString = JSON.stringify(finalOutput, null, 2);
                        await navigator.clipboard.writeText(jsonString);
                        alert(`Copied to clipboard! (${jsonString.length.toLocaleString()} characters)`);
                      } catch (err) {
                        console.error('Failed to copy JSON:', err);
                        alert('Failed to copy to clipboard. Please try selecting and copying the JSON manually from the preview below.');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Show homebrew-specific content if it's a homebrew deliverable */}
                {getString(finalOutput, 'deliverable') === 'homebrew' ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">
                        {getString(finalOutput, 'document_title') || 'Homebrew Content'}
                      </h3>
                      <div className="flex gap-2 mb-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">homebrew</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                          {(typeof (finalOutput as Record<string, unknown>).total_chunks === 'number'
                            ? ((finalOutput as Record<string, unknown>).total_chunks as number)
                            : 0)} chunks processed
                        </span>
                      </div>
                    </div>

                    {/* Parsing Summary */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-700 mb-3">Parsing Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(() => {
                          const entries = Array.isArray(finalOutput.entries) ? finalOutput.entries : [];
                          const typeCounts: Record<string, number> = {};
                          entries.forEach((entry: any) => {
                            const type = entry.type || 'unknown';
                            typeCounts[type] = (typeCounts[type] || 0) + 1;
                          });

                          const typeColors: Record<string, { bg: string; border: string; text: string }> = {
                            race: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple' },
                            subrace: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple' },
                            rule: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red' },
                            lore: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo' },
                            spell: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue' },
                            item: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green' },
                            creature: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange' },
                            class: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan' },
                            subclass: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan' },
                            feat: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow' },
                            background: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal' },
                          };

                          return Object.entries(typeCounts).map(([type, count]) => {
                            const colors = typeColors[type] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray' };
                            return (
                              <div key={type} className={`${colors.bg} border ${colors.border} rounded p-3`}>
                                <div className={`text-xs ${colors.text}-600 font-medium mb-1 capitalize`}>{type}s</div>
                                <div className={`text-2xl font-bold ${colors.text}-700`}>
                                  {count}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Entries Preview */}
                    {Array.isArray(finalOutput.entries) && finalOutput.entries.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-3">Extracted Entries ({finalOutput.entries.length})</h4>
                        <div className="space-y-2 max-h-96 overflow-auto">
                          {(finalOutput.entries as Array<{ type: string; title: string; short_summary?: string; tags?: string[] }>).map((entry, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="font-medium text-gray-900">{entry.title}</div>
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded capitalize flex-shrink-0">
                                  {entry.type}
                                </span>
                              </div>
                              {entry.short_summary && (
                                <p className="text-sm text-gray-600 mb-2">{entry.short_summary}</p>
                              )}
                              {entry.tags && entry.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {entry.tags.map((tag: string, tagIdx: number) => (
                                    <span key={tagIdx} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unparsed Content - Most Important for User */}
                    {Array.isArray(finalOutput.unparsed) && finalOutput.unparsed.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                          Unparsed Content ({finalOutput.unparsed.length} section{finalOutput.unparsed.length !== 1 ? 's' : ''})
                        </h4>
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-3">
                          <p className="text-sm text-yellow-800 mb-2">
                            This content could not be automatically parsed into structured data. Review it below and decide how to handle it:
                          </p>
                          <div className="space-y-3">
                            {finalOutput.unparsed.map((section: string, idx: number) => (
                              <div key={idx} className="bg-white border border-yellow-200 rounded p-3">
                                <div className="text-xs text-yellow-700 font-medium mb-1">Section {idx + 1}</div>
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                                  {section}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Parsing Notes */}
                    {getString(finalOutput, 'notes') && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2">Parsing Notes</h4>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3">
                          <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                            {getString(finalOutput, 'notes')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Full JSON Output - Collapsed by default */}
                    <div className="border-t pt-4">
                      <details className="group">
                        <summary className="font-medium text-gray-700 mb-2 cursor-pointer hover:text-blue-600 flex items-center gap-2">
                          <span>Full JSON Output</span>
                          <span className="text-xs text-gray-500">(click to expand)</span>
                        </summary>
                        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 font-mono mt-2">
                          {JSON.stringify(finalOutput, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Standard content display */}
                    <div>
                      {(() => {
                        const title = getString(finalOutput, 'title') || getString(finalOutput, 'canonical_name') || getString(finalOutput, 'name') || 'Untitled';
                        const deliverable = getString(finalOutput, 'deliverable');
                        const difficulty = getString(finalOutput, 'difficulty');
                        return (
                          <>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
                            <div className="flex gap-2 mb-3">
                              {deliverable && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">{deliverable}</span>
                              )}
                              {difficulty && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium">{difficulty}</span>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {(getString(finalOutput, 'deliverable') === 'nonfiction' || getString(finalOutput, 'type') === 'nonfiction') && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2">Manuscript Preview</h4>
                        {getString(finalOutput, 'formatted_manuscript') ? (
                          <pre className="bg-white border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                            {getString(finalOutput, 'formatted_manuscript')}
                          </pre>
                        ) : Array.isArray(finalOutput.chapters) && finalOutput.chapters.length > 0 ? (
                          <div className="space-y-3 max-h-96 overflow-auto">
                            {(finalOutput.chapters as Array<{ title?: string; summary?: string; draft_text?: string }>).map((ch, idx) => (
                              <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                                <div className="font-medium text-gray-900">{ch.title || `Chapter ${idx + 1}`}</div>
                                {ch.summary && <div className="text-sm text-gray-600 mt-1">{ch.summary}</div>}
                                {ch.draft_text && (
                                  <pre className="text-sm text-gray-800 whitespace-pre-wrap mt-2 max-h-64 overflow-auto">
                                    {ch.draft_text}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">No manuscript preview was provided.</div>
                        )}
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-700 mb-2">Full JSON Output:</h4>
                      <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 font-mono">
                        {JSON.stringify(finalOutput, null, 2)}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            How Manual Mode Works
          </h3>
          <ol className="text-sm text-yellow-800 space-y-2">
            <li>
              <strong>1.</strong> Click "Generate Content" to start
            </li>
            <li>
              <strong>2.</strong> A popup shows a prompt → Click "Copy" → Paste into your AI chat
            </li>
            <li>
              <strong>3.</strong> Copy the AI's response → Paste it back in the next popup
            </li>
            <li>
              <strong>4.</strong> Repeat for {STAGES.length} stages ({STAGES.map(s => s.name).join(' → ')})
            </li>
            <li>
              <strong>5.</strong> Review validation results (conflicts, logic issues, scores)
            </li>
            <li>
              <strong>6.</strong> Click "Review & Save to Project" to resolve issues and save
            </li>
          </ol>
          <p className="text-xs text-yellow-700 mt-3">
            💡 Works with ChatGPT, Claude, Gemini, or any AI that accepts JSON prompts
          </p>
        </div>

        {/* Resources Panel */}
        <div id="resources-panel">
          <ResourcesPanel projectId={projectId} />
        </div>
      </div>

      {/* Copy/Paste Modal - hidden in integrated AI mode */}
      <CopyPasteModal
        isOpen={modalMode !== null && !showReviewModal && assistMode !== 'integrated'}
        mode={modalMode || 'output'}
        stageName={STAGES[currentStageIndex]?.name || ''}
        stageNumber={currentStageIndex + 1}
        totalStages={STAGES.length}
        outputText={modalMode === 'output' ? manualStagePrompt?.prompt ?? currentPrompt : undefined}
        promptNotice={modalMode === 'output' ? currentPromptNotice : null}
        error={error}
        softWarning={locationSoftWarning}
        onFixNow={
          locationSoftWarning
            ? () => {
              jumpToStage(locationSoftWarning.fixStageName);
            }
            : undefined
        }
        canGoBack={currentStageIndex > 0}
        canSkip={!isMultiPartGeneration} // Disable Skip during multi-chunk generation
        skipMode={skipMode}
        chunkProgress={
          // Show chunk progress for homebrew chunks
          (() => {
                const homebrewChunks = getWorkflowHomebrewChunks(stageResults.homebrew_chunks);
            const currentChunk = getNumber(stageResults, 'current_chunk');

            if (homebrewChunks.length > 0 && typeof currentChunk === 'number') {
              return {
                current: currentChunk,
                total: homebrewChunks.length,
                title: homebrewChunks[currentChunk]?.title,
              };
            }

            return isStageChunking && totalStageChunks > 0
              // Or show chunk progress for stage chunking (location spaces)
              ? {
                current: currentStageChunk,
                total: totalStageChunks,
                title: `Space ${currentStageChunk + 1} of ${totalStageChunks}`,
              }
              // Or show chunk progress for multi-part generation
              : isMultiPartGeneration && factGroups.length > 0
                ? {
                  current: currentGroupIndex,
                  total: factGroups.length,
                  title: factGroups[currentGroupIndex]?.label || `Chunk ${currentGroupIndex + 1}`,
                }
                : undefined;
          })()
        }
              canAutoParse={getWorkflowHomebrewChunks(stageResults.homebrew_chunks).length > 0 && config?.type === 'homebrew'}
        structuredContent={
          (() => {
            const currentStage = STAGES[currentStageIndex];
            if (!currentStage || modalMode !== 'input') return undefined;

            if (currentStage.name === 'Details' && stageResults.details) {
              return {
                type: 'location-details' as const,
                data: stageResults.details as Record<string, unknown>,
              };
            }

            if (currentStage.name === 'Accuracy Refinement' && stageResults.accuracy_refinement) {
              return {
                type: 'location-accuracy' as const,
                data: stageResults.accuracy_refinement as Record<string, unknown>,
              };
            }

            return undefined;
          })()
        }
        liveMapPanel={
          // Show Live Map Panel inside modal during Location Spaces, Details, and Accuracy Refinement stages
          (() => {
            const shouldShow = shouldShowLocationMapForStage(config?.type, currentStageIndex, STAGES) && showLiveMap;
            return shouldShow ? (
              <LiveVisualMapPanel
                updateToken={mapUpdateCounter}
                locationName={String(stageResults.purpose?.name || (config ? config.prompt : '')).slice(0, 50)}
                totalSpaces={totalStageChunks}
                currentSpace={currentStageChunk + 1}
                spaces={liveMapSpaces}
                isGenerating={modalMode === 'input'}
                onAddSpace={handleAddSpace}
                onUpdateSpaces={async (updatedSpaces) => {
                  console.log('[ManualGenerator] Received updated spaces from editor:', updatedSpaces.length);
                  console.log('[ManualGenerator] Sample updated space:', updatedSpaces[0]?.name, updatedSpaces[0]?.size_ft);

                  const {
                    updatedResults,
                    updatedStageResults,
                    updatedStageChunkState,
                  } = applyLocationEditorUpdates({
                    accumulatedChunkResults: accumulatedChunkResults as LiveMapSpace[],
                    updatedSpaces: updatedSpaces as LiveMapSpace[],
                    stageResults,
                    stageChunkState: progressSession?.stageChunkState,
                    isStageChunking,
                    currentStageChunk,
                    totalStageChunks,
                    showLiveMap,
                  });

                  updatedResults.forEach((space) => {
                    console.log(`[Save Debug] ${space.name}:`, {
                      position: space.position,
                      position_locked: (space as LiveMapSpace & { position_locked?: boolean }).position_locked,
                      size_ft: space.size_ft,
                    });
                  });
                  setAccumulatedChunkResults(updatedResults);
                  setLiveMapSpaces(updatedResults); // Use merged results to include door changes from form

                  // Force map re-render
                  setMapUpdateCounter(prev => prev + 1);

                  setStageResults(updatedStageResults);

                  console.log('[ManualGenerator] ✓ Updated spaces saved to accumulatedChunkResults AND stageResults');
                  console.log('[ManualGenerator] ✓ Next AI prompt will include these manual edits');

                  // Save to progress session if auto-save is enabled
                  if (autoSaveEnabled && progressSession) {
                    try {
                      console.log('[ManualGenerator] Saving to stageChunkState:', updatedResults.length, 'spaces');
                      updatedResults.slice(0, 3).forEach(s => {
                        console.log(`  - ${logLiveMapSpacePosition(s)}`);
                      });

                      await saveStateAndSession({
                        stageResults: updatedStageResults,
                        stageChunkState: updatedStageChunkState,
                      });
                      console.log('[ManualGenerator] ✓ Saved to stageChunkState (single source of truth)');
                    } catch (error) {
                      console.error('[ManualGenerator] Failed to save updated spaces to session:', error);
                    }
                  }
                }}
              />
            ) : undefined;
          })()
        }
        onAutoParse={handleAutoParse}
        onCopied={handleCopied}
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        onBack={handleBack}
        acceptedSpacesCount={accumulatedChunkResults.length}
        totalSpacesCount={totalStageChunks}
        batchModeEnabled={batchModeEnabled}
        onReviewSpaces={() => {
          console.log('[Review Spaces] Opening space approval modal from CopyPasteModal');
          // Synchronize reciprocal doors before reviewing
          const syncedResults = synchronizeReciprocalDoors(accumulatedChunkResults as any[]);
          setAccumulatedChunkResults(syncedResults);
          setLiveMapSpaces(syncedResults); // Keep live map in sync
          console.log('[Review Spaces] Synchronized reciprocal doors for', syncedResults.length, 'spaces');
          setReviewingSpaceIndex(syncedResults.length - 1); // Start at last accepted space
          setPendingSpace(syncedResults[syncedResults.length - 1]);
          setShowSpaceApprovalModal(true);
        }}
        onToggleBatchMode={() => {
          const newValue = !batchModeEnabled;
          setBatchModeEnabled(newValue);
          console.log(`[Batch Mode] ${newValue ? 'Enabled' : 'Disabled'} - spaces will ${newValue ? 'auto-accept' : 'require approval'}`);
          if (newValue) {
            alert('⚡ Batch Mode Enabled\n\nRemaining spaces will be auto-accepted as they are generated.\n\nYou can still review all spaces at the end before proceeding to the next stage.');
          }
        }}
        onFinishSkip={handleFinishSkip}
        lastSaveTime={lastSaveTime}
        onSaveDraft={() => {
          if (progressSession && autoSaveEnabled) {
            const savedSession = {
              ...progressSession,
              lastUpdatedAt: new Date().toISOString(),
              stageResults: { ...stageResults } as unknown as Record<string, unknown>,
              currentStageIndex,
              stageChunkState: isStageChunking ? {
                isStageChunking,
                currentStageChunk,
                totalStageChunks,
                accumulatedChunkResults,
                liveMapSpaces,
                showLiveMap,
              } : undefined,
            };
            setProgressSession(savedSession);
            saveProgress(savedSession);
            const now = new Date();
            setLastSaveTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            console.log('[Manual Save] Draft saved at', now.toISOString());
          } else {
            alert('Auto-save is disabled or no session exists. Enable auto-save to use this feature.');
          }
        }}
        onClose={handleClose}
      />

      {/* Review & Adjust Modal */}
      <ReviewAdjustModal
        isOpen={showReviewModal}
        stageName={STAGES[currentStageIndex]?.name || ''}
        stageOutput={currentStageOutput}
        onRetry={handleRetryWithAnswers}
        onAccept={handleAcceptWithIssues}
        onClose={() => setShowReviewModal(false)}
      />

      {/* Space Approval Modal - Shows after each space generation for user review */}
      <SpaceApprovalModal
        isOpen={showSpaceApprovalModal}
        space={pendingSpace}
        spaceNumber={reviewingSpaceIndex >= 0 ? reviewingSpaceIndex + 1 : currentStageChunk + 1}
        totalSpaces={totalStageChunks || accumulatedChunkResults.length || 0}
        onAccept={handleSpaceAccept}
        onReject={handleSpaceReject}
        onEdit={handleSpaceEdit}
        onClose={() => {
          setShowSpaceApprovalModal(false);
          setReviewingSpaceIndex(-1); // Reset review index
          setSavedNewSpace(null); // Clear saved space
        }}
        onPreviousSpace={handlePreviousSpace}
        onNextSpace={handleNextSpace}
        canGoPrevious={accumulatedChunkResults.length > 0}
        canGoNext={reviewingSpaceIndex >= 0 && (reviewingSpaceIndex < accumulatedChunkResults.length - 1 || savedNewSpace !== null)}
        isReviewMode={reviewingSpaceIndex >= 0} // True when reviewing existing space
        existingSpaceNames={accumulatedChunkResults.map((s: JsonRecord) => s.name as string).filter(Boolean)}
        existingSpaces={accumulatedChunkResults as any}
        locationName={String(stageResults.purpose?.name || config?.prompt || '').slice(0, 100)}
        parentStructure={(() => {
          const foundation = getStageObject(stageResults, 'foundation');
          if (!foundation) return undefined;
          return {
            total_floors: typeof foundation.total_floors === 'number' ? foundation.total_floors : undefined,
            total_area: typeof foundation.total_area === 'number' ? foundation.total_area : undefined,
            layout: typeof foundation.layout === 'string' ? foundation.layout : undefined,
          };
        })()}
        liveMapPanel={
          // Show Live Map in SpaceApprovalModal when reviewing spaces
          shouldShowLocationMapForStage(config?.type, currentStageIndex, STAGES) && showLiveMap && liveMapSpaces.length > 0 ? (
            <LiveVisualMapPanel
              updateToken={mapUpdateCounter}
              locationName={String(stageResults.purpose?.name || config?.prompt || '').slice(0, 50)}
              totalSpaces={totalStageChunks}
              currentSpace={reviewingSpaceIndex >= 0 ? reviewingSpaceIndex + 1 : currentStageChunk + 1}
              spaces={liveMapSpaces}
              isGenerating={false}
              onAddSpace={handleAddSpace}
              selectedSpaceId={
                pendingSpace
                  ? (() => {
                    const code = typeof (pendingSpace as any).code === 'string' ? String((pendingSpace as any).code) : '';
                    const name = typeof (pendingSpace as any).name === 'string' ? String((pendingSpace as any).name) : '';

                    if (code && liveMapSpaces.some((s: any) => s && s.code === code)) return code;
                    if (name) return name;
                    return null;
                  })()
                  : null
              }
              onSelectSpace={(spaceId) => {
                if (!spaceId) return;

                // Find matching space by code (preferred) or name in accumulated results
                const idx = accumulatedChunkResults.findIndex((s: JsonRecord) => {
                  const code = s.code as string | undefined;
                  if (code && code === spaceId) return true;
                  const name = s.name as string | undefined;
                  return !!name && name === spaceId;
                });

                if (idx >= 0) {
                  console.log(`[Selection Sync] Map selected space "${spaceId}" at index ${idx}`);
                  setReviewingSpaceIndex(idx);
                  setPendingSpace(accumulatedChunkResults[idx]);
                } else {
                  console.log(`[Selection Sync] Map selected space "${spaceId}" not found in accumulated results; keeping current pending space`);
                }
              }}
              onUpdateSpaces={async (updatedSpaces) => {
                console.log('[SpaceApprovalModal] Received updated spaces from editor:', updatedSpaces.length);

                // Log the current reviewing space before and after merge
                if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < updatedSpaces.length) {
                  const originalSpace = accumulatedChunkResults[reviewingSpaceIndex];
                  const incomingSpace = updatedSpaces[reviewingSpaceIndex];
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} BEFORE merge:`, {
                    name: originalSpace?.name,
                    dimensions: originalSpace?.dimensions,
                    size_ft: originalSpace?.size_ft,
                  });
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} FROM editor:`, {
                    name: incomingSpace?.name,
                    dimensions: incomingSpace?.dimensions,
                    size_ft: incomingSpace?.size_ft,
                  });
                }

                const {
                  updatedResults,
                  updatedStageResults,
                  updatedStageChunkState,
                  updatedPendingSpace,
                } = applyLocationEditorUpdates({
                  accumulatedChunkResults: accumulatedChunkResults as LiveMapSpace[],
                  updatedSpaces: updatedSpaces as LiveMapSpace[],
                  stageResults,
                  stageChunkState: progressSession?.stageChunkState,
                  isStageChunking,
                  currentStageChunk,
                  totalStageChunks,
                  showLiveMap,
                  reviewSpaceIndex: reviewingSpaceIndex,
                  mergeStrategy: 'identity-or-index',
                });

                updatedResults.forEach((space, idx) => {
                  console.log(`[Merge Debug] Space #${idx + 1}: size_ft`, space.size_ft, 'dimensions', space.dimensions);
                });

                // Log the merged result
                if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < updatedResults.length) {
                  const mergedSpace = updatedResults[reviewingSpaceIndex];
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} AFTER merge:`, {
                    name: mergedSpace?.name,
                    dimensions: mergedSpace?.dimensions,
                    size_ft: mergedSpace?.size_ft,
                  });
                }

                setAccumulatedChunkResults(updatedResults);
                setLiveMapSpaces(updatedResults); // Use merged results to include door changes from form

                // Force map re-render
                setMapUpdateCounter(prev => prev + 1);

                setStageResults(updatedStageResults);

                // ✓ SYNC: Update pendingSpace so form receives new data
                if (updatedPendingSpace) {
                  setPendingSpace(updatedPendingSpace);
                  console.log(`[Map→Form Sync] Updated pendingSpace for space #${reviewingSpaceIndex + 1}:`, {
                    name: updatedPendingSpace?.name,
                    dimensions: updatedPendingSpace?.dimensions,
                    size_ft: updatedPendingSpace?.size_ft,
                  });
                }

                // Save using atomic save pattern
                await saveStateAndSession({
                  stageResults: updatedStageResults,
                  stageChunkState: updatedStageChunkState,
                });
                console.log('[SpaceApprovalModal] ✓ Spaces persisted to session file');
              }}
            />
          ) : undefined
        }
        onNavigateToEditor={() => {
          setShowSpaceApprovalModal(false);
          setShowLiveMap(true);
        }}
      />

      {/* Canon Delta Review Modal */}
      <CanonDeltaModal
        isOpen={showCanonDeltaModal}
        generatedContent={finalOutput}
        onClose={() => setShowCanonDeltaModal(false)}
        onApprove={(proposals, conflicts, physicsIssues) => {
          console.log('[ManualGenerator] CanonDelta approved, opening EditContentModal with finalOutput:', finalOutput);
          setResolvedProposals(proposals);
          setResolvedConflicts(conflicts);
          setResolvedPhysicsIssues(physicsIssues);
          setShowCanonDeltaModal(false);
          setShowEditModal(true); // Show Edit modal instead of Save modal
        }}
      />

      {/* Edit Content Modal - Conditional based on content type */}
      {(() => {
        // Debug logging for EditContentModal data
        if (showEditModal) {
          const dataToPass = editedContent || finalOutput;
          console.log('[ManualGenerator] Opening EditContentModal with data:', {
            showEditModal,
            hasEditedContent: !!editedContent,
            hasFinalOutput: !!finalOutput,
            dataToPass,
            dataKeys: dataToPass ? Object.keys(dataToPass) : [],
            deliverable: dataToPass ? (dataToPass as any).deliverable : 'unknown'
          });
        }
        return null;
      })()}
      {getString(finalOutput, 'deliverable') === 'homebrew' ? (
        <HomebrewEditModal
          isOpen={showEditModal}
          homebrewContent={(editedContent as Record<string, unknown>) || finalOutput || {}}
          projectId={projectId}
          onClose={() => setShowEditModal(false)}
          onSave={(edited) => {
            setEditedContent(edited);
            setShowEditModal(false);
            setShowSaveModal(true);
          }}
        />
      ) : (
        <EditContentModal
          isOpen={showEditModal}
          generatedContent={editedContent || finalOutput}
          onClose={() => setShowEditModal(false)}
          onSave={(edited) => {
            setEditedContent(edited);
            setShowEditModal(false);
            setShowSaveModal(true);
          }}
        />
      )}

      {/* Save Content Modal */}
      <SaveContentModal
        isOpen={showSaveModal}
        projectId={projectId}
        generatedContent={editedContent || finalOutput}
        resolvedProposals={resolvedProposals}
        resolvedConflicts={resolvedConflicts}
        onClose={() => setShowSaveModal(false)}
        onBack={() => {
          setShowSaveModal(false);
          setShowEditModal(true);
        }}
        onSuccess={() => {
          setShowSaveModal(false);
          setEditedContent(null); // Clear edited content after save
          // Optionally refresh resources panel
        }}
      />

      {/* Canon Narrowing Modal */}
      <CanonNarrowingModal
        isOpen={canonNarrowingState.isOpen}
        currentKeywords={canonNarrowingState.keywords}
        factCount={canonNarrowingState.pendingFactpack?.facts.length || 0}
        maxFacts={config?.max_canon_facts || 50}
        canonFacts={canonNarrowingState.pendingFactpack?.facts.map(fact => ({
          text: fact.text,
          chunk_id: fact.chunk_id,
          entity_name: fact.entity_name,
          entity_id: fact.entity_id,
          entity_type: fact.entity_type,
          region: fact.region,
        })) || []}
        onNarrow={handleNarrow}
        onFilter={handleFilterFacts}
        onProceedAnyway={handleProceedAnyway}
        onClose={handleCloseNarrowingModal}
        context={isProcessingRetrievalHints ? 'retrieval_hints' : 'initial'}
        requestedBy={canonNarrowingState.retrievalHintsContext?.stageName}
        requestedEntities={canonNarrowingState.retrievalHintsContext?.requestedEntities}
        existingFactCount={isProcessingRetrievalHints ? factpack?.facts.length : undefined}
      />

      <FactChunkingModal
        isOpen={showChunkingModal}
        groups={factGroups}
        npcSections={npcSectionChunks}
        mode={isNpcSectionChunking ? 'npc-sections' : 'facts'}
        totalCharacters={pendingChunkingFactpack?.facts.reduce((sum, f) => sum + f.text.length, 0) || 0}
        onClose={() => setChunkingState((prev) => closeWorkflowChunkingModal(prev))}
        onProceed={handleProceedWithChunking}
      />

      <ResumeProgressModal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        onResume={handleResumeSession}
      />

      {/* Mode Selection Dialog - shown before generation starts */}
      <ModeSelectionDialog
        isOpen={showModeSelection}
        onClose={() => {
          setShowModeSelection(false);
          setPendingGenerationConfig(null);
        }}
        onSelectMode={handleModeSelected}
        hasProvider={providerConfig.type !== 'none'}
      />
    </div>
  );
}

