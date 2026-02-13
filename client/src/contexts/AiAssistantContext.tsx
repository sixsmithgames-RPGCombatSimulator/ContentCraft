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

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'npc'
  | 'monster'
  | 'encounter'
  | 'location'
  | 'item'
  | 'story_arc'
  | 'scene'
  | 'adventure'
  | 'homebrew'
  | 'nonfiction'
  | 'outline'
  | 'chapter'
  | 'memoir'
  | 'journal_entry'
  | 'other_writing'
  | 'unknown';

export interface AiAssistantWorkflowContext {
  /** Which workflow type is currently active */
  workflowType: WorkflowType;
  /** Human-readable label for the workflow (e.g. "NPC Creator", "Location Builder") */
  workflowLabel: string;
  /** Current stage name if in a multi-stage pipeline */
  currentStage?: string;
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
}

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

export type AiProviderType = 'none' | 'gemini' | 'openai' | 'ollama' | 'openrouter';

export interface AiProviderConfig {
  type: AiProviderType;
  apiKey?: string;
  /** For Ollama: base URL (default http://localhost:11434) */
  baseUrl?: string;
  /** Model name (e.g. "gemini-2.0-flash", "gpt-4o", "llama3") */
  model?: string;
}

/** Callback for applying AI-suggested changes back into the active workflow */
export type ApplyChangesCallback = (
  changes: Record<string, unknown>,
  mergeMode: 'replace' | 'merge'
) => void;

// ─── Context Shape ───────────────────────────────────────────────────────────

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

  /** Chat history */
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  /** Provider configuration */
  providerConfig: AiProviderConfig;
  setProviderConfig: (config: AiProviderConfig) => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

const PROVIDER_STORAGE_KEY = 'ai-assistant-provider';

function loadProviderConfig(): AiProviderConfig {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return { type: 'none' };
}

function saveProviderConfig(config: AiProviderConfig) {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [workflowContext, setWorkflowContext] = useState<AiAssistantWorkflowContext | null>(null);
  const [applyChanges, setApplyChanges] = useState<ApplyChangesCallback | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providerConfig, setProviderConfigState] = useState<AiProviderConfig>(loadProviderConfig);

  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);
  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const registerApplyChanges = useCallback((cb: ApplyChangesCallback | null) => {
    // Wrap in a function to avoid React treating it as a state updater
    setApplyChanges(() => cb);
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
        messages,
        addMessage,
        clearMessages,
        providerConfig,
        setProviderConfig: handleSetProviderConfig,
      }}
    >
      {children}
    </AiAssistantContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error('useAiAssistant must be used within AiAssistantProvider');
  return ctx;
}
