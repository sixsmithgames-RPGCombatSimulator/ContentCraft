/**
 * Utilities for saving and loading generation progress to/from JSON files
 * This allows users to resume work if the app crashes or is interrupted
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { LiveMapSpace } from '../types/liveMapTypes';
import { API_BASE_URL } from '../services/api';
import type { AiCompiledStageRequest } from '../contexts/AiAssistantContext';
import type { GenerationRunState, WorkflowContentType, WorkflowRetrySource } from '../../../src/shared/generation/workflowTypes';

type JsonRecord = Record<string, unknown>;

export interface GenerationConfig {
  type: string;
  stage?: string;
  keywordSearch?: boolean;
  [key: string]: unknown;
}

export interface ProgressEntry {
  stage: string;
  chunkIndex: number | null;  // null if not multi-chunk, otherwise 0, 1, 2, etc.
  prompt: string;
  response: string | null;  // null if waiting for AI response
  timestamp: string;
  status: 'pending' | 'completed' | 'error';
  errorMessage?: string;
  retrySource?: WorkflowRetrySource;
  confirmedStageId?: string;
  confirmedStageKey?: string;
  confirmedWorkflowType?: WorkflowContentType;
}

export interface MultiChunkState {
  isMultiPartGeneration: boolean;
  currentGroupIndex: number;
  totalGroups: number;
  factGroups?: Array<{
    facts: unknown[];
    charCount: number;
  }>;
}

export interface StageChunkState {
  isStageChunking: boolean;
  currentStageChunk: number;
  totalStageChunks: number;
  accumulatedChunkResults: JsonRecord[];
  liveMapSpaces: LiveMapSpace[];
  showLiveMap: boolean;
}

export interface GenerationProgress {
  sessionId: string;
  sessionName?: string; // Human-readable name (e.g., "Location: Haunted Manse...")
  createdAt: string;
  lastUpdatedAt: string;
  config: GenerationConfig;
  multiChunkState: MultiChunkState;
  stageChunkState?: StageChunkState; // Optional for backward compatibility
  progress: ProgressEntry[];
  stageResults: JsonRecord;
  factpack?: {
    facts: unknown[];
    entities: string[];
    gaps: string[];
  };
  currentStageIndex: number;
  liveMapSpaces?: JsonRecord[]; // Top-level live map spaces for backward compatibility
  accumulatedChunkResults?: JsonRecord[]; // Top-level accumulated results for backward compatibility
  workflowType?: WorkflowContentType;
  workflowStageSequence?: string[];
  workflowRunState?: GenerationRunState;
  compiledStageRequest?: AiCompiledStageRequest;
}

export interface PersistedWorkflowSessionMetadata {
  workflowType: WorkflowContentType;
  workflowStageSequence: string[];
  workflowRunState?: GenerationRunState | null;
  compiledStageRequest?: AiCompiledStageRequest | null;
}

const PERSISTENCE_TARGET_CHARS = 2_000_000;
const PERSISTENCE_HARD_CHARS = 3_000_000;
const MAX_PROGRESS_ENTRIES = 24;
const MAX_PROGRESS_ENTRIES_AGGRESSIVE = 12;
const MAX_PROMPT_CHARS = 12_000;
const MAX_PROMPT_CHARS_AGGRESSIVE = 4_000;
const MAX_RESPONSE_CHARS = 16_000;
const MAX_RESPONSE_CHARS_AGGRESSIVE = 6_000;
const MAX_ERROR_MESSAGE_CHARS = 2_000;

function estimateJsonChars(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 18))}[truncated:${value.length}]`;
}

function compactUnknown(
  value: unknown,
  options: {
    maxDepth: number;
    maxArrayItems: number;
    maxObjectKeys: number;
    maxStringChars: number;
  },
  depth: number = 0,
): unknown {
  if (typeof value === 'string') {
    return truncateString(value, options.maxStringChars);
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (depth >= options.maxDepth) {
    if (Array.isArray(value)) {
      return `[truncated-array:${value.length}]`;
    }

    const keyCount = Object.keys(value as Record<string, unknown>).length;
    return `[truncated-object:${keyCount}]`;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayItems)
      .map((item) => compactUnknown(item, options, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, options.maxObjectKeys);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [key, compactUnknown(entryValue, options, depth + 1)]),
  );
}

function compactProgressEntries(
  entries: ProgressEntry[],
  options: {
    maxEntries: number;
    maxPromptChars: number;
    maxResponseChars: number;
  },
): ProgressEntry[] {
  return entries.slice(-options.maxEntries).map((entry) => ({
    ...entry,
    prompt: truncateString(entry.prompt, options.maxPromptChars),
    response: typeof entry.response === 'string'
      ? truncateString(entry.response, options.maxResponseChars)
      : entry.response,
    errorMessage: typeof entry.errorMessage === 'string'
      ? truncateString(entry.errorMessage, MAX_ERROR_MESSAGE_CHARS)
      : entry.errorMessage,
  }));
}

function compactFactpack(
  factpack: GenerationProgress['factpack'],
  aggressive: boolean,
): GenerationProgress['factpack'] {
  if (!factpack) {
    return factpack;
  }

  if (aggressive) {
    return {
      facts: [],
      entities: factpack.entities.slice(0, 100),
      gaps: factpack.gaps.slice(0, 100),
    };
  }

  return {
    facts: compactUnknown(factpack.facts, {
      maxDepth: 3,
      maxArrayItems: 80,
      maxObjectKeys: 12,
      maxStringChars: 600,
    }) as unknown[],
    entities: factpack.entities.slice(0, 200),
    gaps: factpack.gaps.slice(0, 200),
  };
}

function compactGenerationConfig(config: GenerationConfig, aggressive: boolean): GenerationConfig {
  return {
    ...config,
    prompt: typeof config.prompt === 'string'
      ? truncateString(config.prompt, aggressive ? 2_000 : 8_000)
      : config.prompt,
  };
}

function compactMultiChunkState(
  multiChunkState: MultiChunkState,
  aggressive: boolean,
): MultiChunkState {
  return {
    ...multiChunkState,
    factGroups: Array.isArray(multiChunkState.factGroups)
      ? compactUnknown(multiChunkState.factGroups, {
        maxDepth: aggressive ? 2 : 3,
        maxArrayItems: aggressive ? 8 : 20,
        maxObjectKeys: aggressive ? 8 : 16,
        maxStringChars: aggressive ? 200 : 500,
      }) as MultiChunkState['factGroups']
      : multiChunkState.factGroups,
  };
}

function compactWorkflowRunState(
  runState: GenerationRunState | undefined,
  aggressive: boolean,
): GenerationRunState | undefined {
  if (!runState) {
    return runState;
  }

  return {
    ...runState,
    stageSequence: runState.stageSequence.slice(0, aggressive ? 12 : 24),
    stageLabels: Object.fromEntries(
      Object.entries(runState.stageLabels).slice(0, aggressive ? 12 : 24),
    ),
    attempts: runState.attempts.slice(-(aggressive ? 8 : 16)).map((attempt) => ({
      ...attempt,
      error: typeof attempt.error === 'string' ? truncateString(attempt.error, MAX_ERROR_MESSAGE_CHARS) : attempt.error,
      warnings: Array.isArray(attempt.warnings)
        ? attempt.warnings.slice(0, aggressive ? 4 : 8).map((warning) => truncateString(warning, 400))
        : attempt.warnings,
      retrySource: attempt.retrySource
        ? {
          ...attempt.retrySource,
          summary: truncateString(attempt.retrySource.summary, aggressive ? 300 : 800),
          label: truncateString(attempt.retrySource.label, 200),
          userReason: typeof attempt.retrySource.userReason === 'string'
            ? truncateString(attempt.retrySource.userReason, aggressive ? 300 : 800)
            : attempt.retrySource.userReason,
        }
        : attempt.retrySource,
    })),
    warnings: runState.warnings.slice(0, aggressive ? 8 : 16).map((warning) => truncateString(warning, 400)),
    retrieval: {
      ...runState.retrieval,
      warningMessage: typeof runState.retrieval.warningMessage === 'string'
        ? truncateString(runState.retrieval.warningMessage, aggressive ? 300 : 800)
        : runState.retrieval.warningMessage,
    },
  };
}

function compactCompiledStageRequest(
  request: AiCompiledStageRequest | undefined,
  aggressive: boolean,
): AiCompiledStageRequest | undefined {
  if (!request) {
    return request;
  }

  return {
    ...request,
    prompt: truncateString(request.prompt, aggressive ? 4_000 : 10_000),
    systemPrompt: truncateString(request.systemPrompt, aggressive ? 3_000 : 8_000),
    userPrompt: truncateString(request.userPrompt, aggressive ? 3_000 : 8_000),
    memory: {
      ...request.memory,
      request: {
        ...request.memory.request,
        prompt: truncateString(request.memory.request.prompt, aggressive ? 2_000 : 6_000),
      },
      currentStageData: compactUnknown(request.memory.currentStageData, {
        maxDepth: aggressive ? 2 : 4,
        maxArrayItems: aggressive ? 12 : 30,
        maxObjectKeys: aggressive ? 12 : 30,
        maxStringChars: aggressive ? 300 : 800,
      }) as Record<string, unknown>,
      priorStageSummaries: compactUnknown(request.memory.priorStageSummaries, {
        maxDepth: aggressive ? 2 : 3,
        maxArrayItems: aggressive ? 10 : 20,
        maxObjectKeys: aggressive ? 10 : 20,
        maxStringChars: aggressive ? 250 : 600,
      }) as Record<string, unknown>,
    },
  };
}

function compactStageResults(stageResults: JsonRecord, aggressive: boolean): JsonRecord {
  return compactUnknown(stageResults, {
    maxDepth: aggressive ? 3 : 5,
    maxArrayItems: aggressive ? 20 : 60,
    maxObjectKeys: aggressive ? 20 : 60,
    maxStringChars: aggressive ? 400 : 1_200,
  }) as JsonRecord;
}

function compactStageChunkState(
  stageChunkState: StageChunkState | undefined,
  aggressive: boolean,
): StageChunkState | undefined {
  if (!stageChunkState) {
    return stageChunkState;
  }

  return {
    ...stageChunkState,
    accumulatedChunkResults: compactUnknown(stageChunkState.accumulatedChunkResults, {
      maxDepth: aggressive ? 3 : 4,
      maxArrayItems: aggressive ? 15 : 40,
      maxObjectKeys: aggressive ? 15 : 30,
      maxStringChars: aggressive ? 300 : 800,
    }) as JsonRecord[],
    liveMapSpaces: compactUnknown(stageChunkState.liveMapSpaces, {
      maxDepth: aggressive ? 3 : 4,
      maxArrayItems: aggressive ? 15 : 40,
      maxObjectKeys: aggressive ? 15 : 30,
      maxStringChars: aggressive ? 300 : 800,
    }) as LiveMapSpace[],
  };
}

export function prepareProgressForPersistence(session: GenerationProgress): GenerationProgress {
  const buildPersisted = (aggressive: boolean): GenerationProgress => ({
    ...session,
    config: compactGenerationConfig(session.config, aggressive),
    multiChunkState: compactMultiChunkState(session.multiChunkState, aggressive),
    progress: compactProgressEntries(session.progress, {
      maxEntries: aggressive ? MAX_PROGRESS_ENTRIES_AGGRESSIVE : MAX_PROGRESS_ENTRIES,
      maxPromptChars: aggressive ? MAX_PROMPT_CHARS_AGGRESSIVE : MAX_PROMPT_CHARS,
      maxResponseChars: aggressive ? MAX_RESPONSE_CHARS_AGGRESSIVE : MAX_RESPONSE_CHARS,
    }),
    stageResults: compactStageResults(session.stageResults, aggressive),
    factpack: compactFactpack(session.factpack, aggressive),
    workflowRunState: compactWorkflowRunState(session.workflowRunState, aggressive),
    compiledStageRequest: compactCompiledStageRequest(session.compiledStageRequest, aggressive),
    stageChunkState: compactStageChunkState(session.stageChunkState, aggressive),
    liveMapSpaces: compactUnknown(session.liveMapSpaces, {
      maxDepth: aggressive ? 3 : 4,
      maxArrayItems: aggressive ? 15 : 40,
      maxObjectKeys: aggressive ? 15 : 30,
      maxStringChars: aggressive ? 300 : 800,
    }) as JsonRecord[] | undefined,
    accumulatedChunkResults: compactUnknown(session.accumulatedChunkResults, {
      maxDepth: aggressive ? 3 : 4,
      maxArrayItems: aggressive ? 15 : 40,
      maxObjectKeys: aggressive ? 15 : 30,
      maxStringChars: aggressive ? 300 : 800,
    }) as JsonRecord[] | undefined,
  });

  const firstPass = buildPersisted(false);
  if (estimateJsonChars(firstPass) <= PERSISTENCE_TARGET_CHARS) {
    return firstPass;
  }

  const aggressivePass = buildPersisted(true);
  return estimateJsonChars(aggressivePass) <= PERSISTENCE_HARD_CHARS ? aggressivePass : aggressivePass;
}

function areStringArraysEqual(left: string[] | undefined, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function areWorkflowRunStatesEqual(
  left: GenerationRunState | undefined,
  right: GenerationRunState | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function areCompiledStageRequestsEqual(
  left: AiCompiledStageRequest | undefined,
  right: AiCompiledStageRequest | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function attachWorkflowSessionMetadata(
  session: GenerationProgress,
  metadata: PersistedWorkflowSessionMetadata,
): GenerationProgress {
  const nextStageSequence = [...metadata.workflowStageSequence];
  const nextWorkflowRunState = metadata.workflowRunState ?? undefined;
  const nextCompiledStageRequest = metadata.compiledStageRequest ?? undefined;
  const sameWorkflowType = session.workflowType === metadata.workflowType;
  const sameStageSequence = areStringArraysEqual(session.workflowStageSequence, nextStageSequence);
  const sameWorkflowRunState = areWorkflowRunStatesEqual(session.workflowRunState, nextWorkflowRunState);
  const sameCompiledStageRequest = areCompiledStageRequestsEqual(session.compiledStageRequest, nextCompiledStageRequest);

  if (sameWorkflowType && sameStageSequence && sameWorkflowRunState && sameCompiledStageRequest) {
    return session;
  }

  return {
    ...session,
    workflowType: metadata.workflowType,
    workflowStageSequence: nextStageSequence,
    workflowRunState: nextWorkflowRunState,
    compiledStageRequest: nextCompiledStageRequest,
  };
}

export interface ProgressHistorySummaryEntry {
  stage: string;
  status: ProgressEntry['status'];
  timestamp: string;
  chunkIndex: number | null;
  retrySource?: WorkflowRetrySource;
  confirmedStageId?: string;
  confirmedStageKey?: string;
  confirmedWorkflowType?: WorkflowContentType;
}

/**
 * Generates a human-readable session name from config
 */
function generateSessionName(config: GenerationConfig): string {
  // Content type label mapping
  const typeLabels: Record<string, string> = {
    'story_arc': 'Story Arc',
    'encounter': 'Encounter',
    'location': 'Location',
    'npc': 'NPC',
    'item': 'Item',
    'faction': 'Faction',
    'quest': 'Quest',
  };

  const typeLabel = typeLabels[config.type] || config.type;
  
  // Get prompt excerpt if available
  const prompt = config.prompt as string | undefined;
  if (prompt && prompt.length > 0) {
    // Take first 30 chars of prompt, clean up whitespace
    const excerpt = prompt.slice(0, 30).replace(/\s+/g, ' ').trim();
    const suffix = prompt.length > 30 ? '...' : '';
    return `${typeLabel}: ${excerpt}${suffix}`;
  }

  // Fallback to just the type with timestamp
  const date = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${typeLabel} (${timeStr})`;
}

/**
 * Creates a new generation progress session
 */
export function createProgressSession(config: GenerationConfig): GenerationProgress {
  const now = new Date().toISOString();
  const sessionId = `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sessionName = generateSessionName(config);

  return {
    sessionId,
    sessionName,
    createdAt: now,
    lastUpdatedAt: now,
    config,
    multiChunkState: {
      isMultiPartGeneration: false,
      currentGroupIndex: 0,
      totalGroups: 0,
    },
    progress: [],
    stageResults: {},
    currentStageIndex: 0,
  };
}

/**
 * Adds a new progress entry (prompt sent to AI)
 */
export function addProgressEntry(
  session: GenerationProgress,
  stage: string,
  chunkIndex: number | null,
  prompt: string,
  retrySource?: WorkflowRetrySource,
): GenerationProgress {
  const entry: ProgressEntry = {
    stage,
    chunkIndex,
    prompt,
    response: null,
    timestamp: new Date().toISOString(),
    status: 'pending',
    retrySource,
  };

  return {
    ...session,
    lastUpdatedAt: new Date().toISOString(),
    progress: [...session.progress, entry],
  };
}

/**
 * Updates the last progress entry with AI response
 */
export function updateProgressResponse(
  session: GenerationProgress,
  response: string,
  status: 'completed' | 'error' = 'completed',
  errorMessage?: string,
  metadata?: {
    confirmedStageId?: string;
    confirmedStageKey?: string;
    confirmedWorkflowType?: WorkflowContentType;
  }
): GenerationProgress {
  const progress = [...session.progress];
  const lastEntry = progress[progress.length - 1];

  if (lastEntry) {
    lastEntry.response = response;
    lastEntry.status = status;
    lastEntry.timestamp = new Date().toISOString();
    if (errorMessage) {
      lastEntry.errorMessage = errorMessage;
    }
    if (metadata?.confirmedStageId) {
      lastEntry.confirmedStageId = metadata.confirmedStageId;
    }
    if (metadata?.confirmedStageKey) {
      lastEntry.confirmedStageKey = metadata.confirmedStageKey;
    }
    if (metadata?.confirmedWorkflowType) {
      lastEntry.confirmedWorkflowType = metadata.confirmedWorkflowType;
    }
  }

  return {
    ...session,
    lastUpdatedAt: new Date().toISOString(),
    progress,
  };
}

/**
 * Updates the multi-chunk state
 */
export function updateMultiChunkState(
  session: GenerationProgress,
  multiChunkState: Partial<MultiChunkState>
): GenerationProgress {
  return {
    ...session,
    lastUpdatedAt: new Date().toISOString(),
    multiChunkState: {
      ...session.multiChunkState,
      ...multiChunkState,
    },
  };
}

/**
 * Updates the stage results
 */
export function updateStageResults(
  session: GenerationProgress,
  stageResults: JsonRecord
): GenerationProgress {
  return {
    ...session,
    lastUpdatedAt: new Date().toISOString(),
    stageResults,
  };
}

/**
 * Updates the current stage index
 */
export function updateCurrentStage(
  session: GenerationProgress,
  currentStageIndex: number
): GenerationProgress {
  return {
    ...session,
    lastUpdatedAt: new Date().toISOString(),
    currentStageIndex,
  };
}

/**
 * Saves progress to a JSON file
 */
export async function saveProgressToFile(
  session: GenerationProgress,
  filename?: string
): Promise<string> {
  const fn = filename || `generation-${session.sessionId}.json`;
  const persistedSession = prepareProgressForPersistence(session);
  const originalChars = estimateJsonChars(session);
  const persistedChars = estimateJsonChars(persistedSession);
  const requestChars = estimateJsonChars({
    filename: fn,
    data: persistedSession,
  });

  try {
    if (persistedChars < originalChars) {
      console.warn(`[Progress] Compacted autosave payload for ${session.sessionId}: ${originalChars} -> ${persistedChars} chars`);
    }

    const response = await fetch(`${API_BASE_URL}/save-progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: fn,
        data: persistedSession,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save progress: ${response.status} ${response.statusText} (requestChars=${requestChars}, sessionChars=${persistedChars}, originalChars=${originalChars})`);
    }

    const result = await response.json();
    return result.filepath || fn;
  } catch (error) {
    console.error('[Progress] Error saving progress:', {
      sessionId: session.sessionId,
      requestChars,
      persistedChars,
      originalChars,
      error,
    });
    throw error;
  }
}

// ... (rest of the code remains the same)

/**
 * Loads progress from a JSON file
 */
export async function loadProgressFromFile(
  filename: string
): Promise<GenerationProgress | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/load-progress?filename=${encodeURIComponent(filename)}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to load progress: ${response.statusText}`);
    }

    const data = await response.json();
    return data as GenerationProgress;
  } catch (error) {
    console.error('Error loading progress:', error);
    return null;
  }
}

// ... (rest of the code remains the same)

/**
 * Lists all available progress files
 */
export async function listProgressFiles(): Promise<Array<{
  filename: string;
  sessionId: string;
  sessionName?: string;
  createdAt: string;
  lastUpdatedAt: string;
  config: GenerationConfig;
  currentStageIndex?: number;
  progressCount?: number;
  totalStages?: number;
  retrySource?: WorkflowRetrySource | null;
  retryStage?: string;
  hasPendingRetry?: boolean;
  lastConfirmedStageId?: string;
  lastConfirmedStageKey?: string;
  lastConfirmedWorkflowType?: WorkflowContentType;
  recentProgress?: ProgressHistorySummaryEntry[];
}>> {
  try {
    const response = await fetch(`${API_BASE_URL}/list-progress`);

    if (!response.ok) {
      throw new Error(`Failed to list progress files: ${response.statusText}`);
    }

    const files = await response.json();
    return files;
  } catch (error) {
    console.error('Error listing progress files:', error);
    return [];
  }
}

/**
 * Gets the last incomplete progress entry (if any)
 */
export function getIncompleteEntry(session: GenerationProgress): ProgressEntry | null {
  const incomplete = session.progress.find(
    entry => entry.status === 'pending' && entry.response === null
  );
  return incomplete || null;
}

/**
 * Checks if the session can be resumed
 */
export function canResumeSession(session: GenerationProgress): boolean {
  // Can resume if there's at least one completed entry and not fully complete
  const hasCompleted = session.progress.some(entry => entry.status === 'completed');
  const hasPending = session.progress.some(entry => entry.status === 'pending');

  return hasCompleted && (hasPending || session.currentStageIndex < 8); // 8 stages total
}
