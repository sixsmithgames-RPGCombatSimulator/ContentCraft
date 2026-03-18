/**
 * AI Assistant Context
 *
 * Provides a shared context that any workflow (NPC, encounter, location, writing, etc.)
 * can push its current state into, allowing the AI Assistant side panel to generate
 * contextual prompts and apply changes back.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { GenerationRunState, WorkflowContentType } from '../../../src/shared/generation/workflowTypes';
import type {
  WorkflowExecutionFailureResponse,
  WorkflowExecutionOutcome,
  WorkflowExecutionRetryContext,
} from '../../../src/server/services/workflowExecutionService';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported workflow types that the AI assistant can contextually assist with */
export type WorkflowType = WorkflowContentType;

export interface AiStageMemorySummary {
  request: {
    prompt: string;
    type?: string;
    stageKey?: string;
    stageLabel?: string;
  };
  completedStages: string[];
  currentStageData: unknown;
  priorStageSummaries: Record<string, unknown>;
  previousDecisions: Record<string, string>;
  factpack: {
    factCount: number;
    entityNames: string[];
  };
}

export interface AiCompiledStageRequest {
  requestId: string;
  stageKey: string;
  stageLabel: string;
  prompt: string;
  systemPrompt: string;
  userPrompt: string;
  promptBudget: {
    measuredChars: number;
    safetyCeiling: number;
    hardLimit: number;
    mode: 'packed' | 'safe' | 'continuation' | 'manual';
    droppedSections: string[];
    warnings: string[];
    compressionApplied: boolean;
  };
  memory: AiStageMemorySummary;
}

export interface SubmitPipelineStageMetadata {
  stageId: string;
  stageKey: string;
  workflowType?: string;
  outcome?: WorkflowExecutionOutcome;
  accepted?: boolean;
  requestId?: string;
  stageRunId?: string;
  allowedKeyCount?: number;
  rawAllowedKeyCount?: number;
  retryContext?: WorkflowExecutionRetryContext;
}

/** Workflow context pushed by the active page/component into the AI assistant */
export interface AiAssistantWorkflowContext {
  /** Which workflow type is currently active */
  workflowType: WorkflowType;
  /** Human-readable label for the workflow (e.g. "NPC Creator", "Location Builder") */
  workflowLabel: string;
  /** Current stage name if in a multi-stage pipeline */
  currentStage?: string;
  /** Router key / identifier for the current stage (stable ID used in schemas) */
  stageRouterKey?: string;
  /** Stage index / total for progress display */
  stageProgress?: { current: number; total: number };
  /** The current accumulated data from the workflow (stage results, partial NPC, etc.) */
  currentData: Record<string, unknown>;
  /** Schema snippet relevant to the current stage/section */
  schema?: Record<string, unknown>;
  /** Factpack / canon context loaded for this generation */
  factpack?: { facts: Array<{ text: string; source?: string }> };
  /** The generation config (flags, prompt, etc.) */
  generationConfig?: Record<string, unknown>;
  /** Authoritative, precompiled request for the active stage */
  compiledStageRequest?: AiCompiledStageRequest;
  /** Generator type (npc, encounter, location, etc.) for schema selection */
  generatorType?: string;
  /** Schema version currently in use */
  schemaVersion?: string;
  /** Project identifier (if available) */
  projectId?: string;
  /** Shared workflow runtime state */
  runState?: GenerationRunState;
}

/** A single message in the AI assistant chat history */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** If the message contains structured JSON that can be applied */
  extractedJson?: Record<string, unknown> | null;
  /** Whether this message's JSON has been applied */
  applied?: boolean;
}

/** Supported AI provider types for BYO key configuration */
export type AiProviderType = 'none' | 'gemini' | 'openai' | 'ollama' | 'openrouter';

/** Configuration for a BYO AI provider (stored in localStorage) */
export interface AiProviderConfig {
  type: AiProviderType;
  apiKey?: string;
  /** For Ollama: base URL (default http://localhost:11434) */
  baseUrl?: string;
  /** Model name (e.g. "gemini-2.0-flash", "gpt-4o", "llama3") */
  model?: string;
}

/**
 * Callback for applying AI-suggested changes back into the active workflow.
 * Registered by the active page component so the panel can push changes.
 * @param changes - The JSON fields to merge or replace
 * @param mergeMode - Whether to shallow-merge or fully replace
 */
export type ApplyChangesCallback = (
  changes: Record<string, unknown>,
  mergeMode: 'replace' | 'merge'
) => void;

/**
 * Callback for submitting a raw AI response directly into the active workflow pipeline.
 */
export type SubmitPipelineResponseCallback = (
  rawText: string,
  parsedJson?: Record<string, unknown>,
  metadata?: SubmitPipelineStageMetadata,
) => Promise<{ status: 'accepted' | 'review_required' | 'error' | 'retrying'; message?: string }>;

export type WorkflowStageFailureCallback = (
  failure: WorkflowExecutionFailureResponse,
  metadata?: {
    displayMessage?: string;
    stageId?: string;
    stageKey?: string;
    workflowType?: string;
    requestId?: string;
    stageRunId?: string;
  },
) => Promise<{ status: 'review_required' | 'error'; message?: string }>;

export type WorkflowRunStateDispatcher = Dispatch<SetStateAction<GenerationRunState | null>>;

export type PrepareWorkflowStageRequestCallback = (options?: {
  showPromptPreview?: boolean;
  forceRecompile?: boolean;
}) => Promise<AiCompiledStageRequest | null>;

// ─── Context Shape ───────────────────────────────────────────────────────────
/** AI assist mode: integrated (automated) or manual (copy/paste) */
export type AssistMode = 'integrated' | 'manual' | null;

interface AiAssistantContextValue {
  /** Whether the side panel is open */
  isPanelOpen: boolean;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;

  /** Current workflow context (set by the active page/component) */
  workflowContext: AiAssistantWorkflowContext | null;
  setWorkflowContext: (ctx: AiAssistantWorkflowContext | null) => void;

  /** Callback the active workflow registers so the panel can push changes back */
  applyChanges: ApplyChangesCallback | null;
  registerApplyChanges: (cb: ApplyChangesCallback | null) => void;

  /** Callback the active workflow registers so the panel can trigger the pipeline */
  submitPipelineResponse: SubmitPipelineResponseCallback | null;
  registerSubmitPipelineResponse: (cb: SubmitPipelineResponseCallback | null) => void;

  /** Callback the active workflow registers so the panel can hand off integrated failures for review/manual recovery */
  workflowStageFailureHandler: WorkflowStageFailureCallback | null;
  registerWorkflowStageFailureHandler: (cb: WorkflowStageFailureCallback | null) => void;

  /** Dispatcher the active workflow registers so the panel can update workflow run-state */
  workflowRunStateDispatcher: WorkflowRunStateDispatcher | null;
  registerWorkflowRunStateDispatcher: (cb: WorkflowRunStateDispatcher | null) => void;

  /** Callback the active workflow registers so the panel can rebuild the authoritative stage request */
  prepareWorkflowStageRequest: PrepareWorkflowStageRequestCallback | null;
  registerPrepareWorkflowStageRequest: (cb: PrepareWorkflowStageRequestCallback | null) => void;

  /** Chat history */
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  /** Provider configuration */
  providerConfig: AiProviderConfig;
  setProviderConfig: (config: AiProviderConfig) => void;

  /** AI assist mode chosen by the user (integrated / manual / null = not yet chosen) */
  assistMode: AssistMode;
  setAssistMode: (mode: AssistMode) => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

const PROVIDER_STORAGE_KEY = 'ai-assistant-provider';

function loadProviderConfig(): AiProviderConfig {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (err: unknown) {
    console.error('[AiAssistant] Failed to load provider config from localStorage:', err);
  }
  return { type: 'none' };
}

function saveProviderConfig(config: AiProviderConfig) {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
  } catch (err: unknown) {
    console.error('[AiAssistant] Failed to save provider config to localStorage:', err);
  }
}

/**
 * Provider component that wraps the app and makes AI assistant state available.
 * Manages panel visibility, workflow context, chat messages, and provider config.
 * Provider config is persisted to localStorage.
 */
export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [workflowContext, setWorkflowContext] = useState<AiAssistantWorkflowContext | null>(null);
  const [applyChanges, setApplyChanges] = useState<ApplyChangesCallback | null>(null);
  const [submitPipelineResponse, setSubmitPipelineResponse] = useState<SubmitPipelineResponseCallback | null>(null);
  const [workflowStageFailureHandler, setWorkflowStageFailureHandler] = useState<WorkflowStageFailureCallback | null>(null);
  const [workflowRunStateDispatcher, setWorkflowRunStateDispatcherState] = useState<WorkflowRunStateDispatcher | null>(null);
  const [prepareWorkflowStageRequest, setPrepareWorkflowStageRequest] = useState<PrepareWorkflowStageRequestCallback | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providerConfig, setProviderConfigState] = useState<AiProviderConfig>(loadProviderConfig);
  const [assistMode, setAssistMode] = useState<AssistMode>(null);

  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);
  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const registerApplyChanges = useCallback((cb: ApplyChangesCallback | null) => {
    // Wrap in a function to avoid React treating it as a state updater
    setApplyChanges(() => cb);
  }, []);

  const registerSubmitPipelineResponse = useCallback((cb: SubmitPipelineResponseCallback | null) => {
    setSubmitPipelineResponse(() => cb);
  }, []);

  const registerWorkflowStageFailureHandler = useCallback((cb: WorkflowStageFailureCallback | null) => {
    setWorkflowStageFailureHandler(() => cb);
  }, []);

  const registerWorkflowRunStateDispatcher = useCallback((cb: WorkflowRunStateDispatcher | null) => {
    setWorkflowRunStateDispatcherState(() => cb);
  }, []);

  const registerPrepareWorkflowStageRequest = useCallback((cb: PrepareWorkflowStageRequestCallback | null) => {
    setPrepareWorkflowStageRequest(() => cb);
  }, []);

  const addMessage = useCallback(
    (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      const newMsg: ChatMessage = {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMsg]);
    },
    []
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  const handleSetProviderConfig = useCallback((config: AiProviderConfig) => {
    setProviderConfigState(config);
    saveProviderConfig(config);
  }, []);

  return (
    <AiAssistantContext.Provider
      value={{
        isPanelOpen,
        togglePanel,
        openPanel,
        closePanel,
        workflowContext,
        setWorkflowContext,
        applyChanges,
        registerApplyChanges,
        submitPipelineResponse,
        registerSubmitPipelineResponse,
        workflowStageFailureHandler,
        registerWorkflowStageFailureHandler,
        workflowRunStateDispatcher,
        registerWorkflowRunStateDispatcher,
        prepareWorkflowStageRequest,
        registerPrepareWorkflowStageRequest,
        messages,
        addMessage,
        clearMessages,
        providerConfig,
        setProviderConfig: handleSetProviderConfig,
        assistMode,
        setAssistMode,
      }}
    >
      {children}
    </AiAssistantContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook to access the AI assistant context.
 * Must be used within an AiAssistantProvider.
 * @throws Error if used outside of AiAssistantProvider
 */
export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error('useAiAssistant must be used within AiAssistantProvider');
  return ctx;
}
