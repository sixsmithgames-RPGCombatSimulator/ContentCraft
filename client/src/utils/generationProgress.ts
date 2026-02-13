/**
 * Utilities for saving and loading generation progress to/from JSON files
 * This allows users to resume work if the app crashes or is interrupted
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { LiveMapSpace } from '../types/liveMapTypes';

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
  prompt: string
): GenerationProgress {
  const entry: ProgressEntry = {
    stage,
    chunkIndex,
    prompt,
    response: null,
    timestamp: new Date().toISOString(),
    status: 'pending',
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
  errorMessage?: string
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

  try {
    const response = await fetch('http://localhost:3001/api/save-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: fn,
        data: session,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save progress: ${response.statusText}`);
    }

    const result = await response.json();
    return result.filepath || fn;
  } catch (error) {
    console.error('Error saving progress:', error);
    throw error;
  }
}

/**
 * Loads progress from a JSON file
 */
export async function loadProgressFromFile(
  filename: string
): Promise<GenerationProgress | null> {
  try {
    const response = await fetch(`http://localhost:3001/api/load-progress?filename=${encodeURIComponent(filename)}`);

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
}>> {
  try {
    const response = await fetch('http://localhost:3001/api/list-progress');

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
