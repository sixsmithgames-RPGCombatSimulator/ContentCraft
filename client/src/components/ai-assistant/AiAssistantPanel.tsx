/**
 * AI Assistant Panel
 *
 * A collapsible side panel that provides AI-assisted refinement for any workflow.
 * Supports both copy/paste mode (zero-cost) and BYO provider mode.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Copy,
  Check,
  Clipboard,
  Settings,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAiAssistant } from '../../contexts/AiAssistantContext';
import type { ChatMessage } from '../../contexts/AiAssistantContext';
import {
  getQuickActions,
  buildContextualPrompt,
  buildQuickActionPrompt,
  extractJsonFromResponse,
  computeFieldDiff,
} from '../../utils/aiPromptBuilder';
import { sendToProvider } from '../../services/aiProvider';
import AiProviderSettings from './AiProviderSettings';

type StageRunnerState =
  | 'idle'
  | 'sending'
  | 'awaiting'
  | 'parsing'
  | 'validating'
  | 'applying'
  | 'complete'
  | 'error';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeObjects(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMergeObjects(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ChatMessageBubble({
  message,
  onCopy,
  onApply,
  canApply,
}: {
  message: ChatMessage;
  onCopy: (text: string) => void;
  onApply: (json: Record<string, unknown>) => void;
  canApply: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary-600 text-white'
            : isSystem
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Action buttons for assistant messages */}
        {!isUser && !isSystem && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title="Copy response"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {message.extractedJson && canApply && !message.applied && (
              <button
                onClick={() => onApply(message.extractedJson!)}
                className="flex items-center gap-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2 py-0.5 rounded transition-colors"
                title="Apply these changes to the current workflow"
              >
                <ArrowDownToLine className="w-3 h-3" />
                Apply Changes
              </button>
            )}

            {message.applied && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="w-3 h-3" />
                Applied
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffPreview({
  diffs,
  onConfirm,
  onCancel,
}: {
  diffs: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 mb-3">
      <h4 className="text-sm font-medium text-blue-800 mb-2">
        Changes to Apply ({diffs.length} field{diffs.length !== 1 ? 's' : ''})
      </h4>
      <div className="space-y-1 max-h-48 overflow-auto mb-3">
        {diffs.map((diff, i) => (
          <div key={i} className="text-xs font-mono">
            <span className="text-blue-600 font-medium">{diff.path}:</span>
            {diff.oldValue !== undefined && (
              <div className="ml-4 text-red-600 line-through">
                {typeof diff.oldValue === 'string'
                  ? diff.oldValue.slice(0, 100)
                  : JSON.stringify(diff.oldValue)?.slice(0, 100)}
              </div>
            )}
            <div className="ml-4 text-green-600">
              {typeof diff.newValue === 'string'
                ? diff.newValue.slice(0, 100)
                : JSON.stringify(diff.newValue)?.slice(0, 100)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 bg-green-600 text-white text-sm py-1.5 rounded hover:bg-green-700 transition-colors"
        >
          Confirm & Apply
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-700 text-sm py-1.5 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function AiAssistantPanel() {
  const {
    isPanelOpen,
    togglePanel,
    closePanel,
    workflowContext,
    applyChanges,
    messages,
    addMessage,
    clearMessages,
    providerConfig,
  } = useAiAssistant();

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pendingDiff, setPendingDiff] = useState<{
    json: Record<string, unknown>;
    diffs: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [stageRunId, setStageRunId] = useState<string | null>(null);
  const [stageRunnerState, setStageRunnerState] = useState<StageRunnerState>('idle');
  const [stageRunnerError, setStageRunnerError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isPanelOpen]);

  // Reset stageRunId when workflow stage changes
  useEffect(() => {
    if (!workflowContext?.stageRouterKey) {
      setStageRunId(null);
      return;
    }
    setStageRunId(crypto.randomUUID());
    setStageRunnerState('idle');
    setStageRunnerError(null);
  }, [workflowContext?.stageRouterKey]);

  const hasProvider = providerConfig.type !== 'none';
  const hasWorkflow = !!workflowContext;
  const canApplyChanges = !!applyChanges && hasWorkflow;

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleCopyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || !workflowContext) return;

    const userMsg = inputText.trim();
    setInputText('');

    // Build contextual prompt
    const fullPrompt = buildContextualPrompt(userMsg, workflowContext);

    // Add user message to chat
    addMessage({ role: 'user', content: userMsg });

    if (hasProvider) {
      // Send to AI provider
      setIsLoading(true);
      try {
        const systemPrompt =
          `You are an AI assistant for ContentCraft, a content creation tool. ` +
          `You help refine and improve generated content. ` +
          `When suggesting changes, return them as JSON wrapped in \`\`\`json code blocks. ` +
          `Only include the fields you are changing.`;

        const result = await sendToProvider(providerConfig, systemPrompt, fullPrompt);

        if (result.success && result.text) {
          const extracted = extractJsonFromResponse(result.text);
          addMessage({
            role: 'assistant',
            content: result.text,
            extractedJson: extracted.success ? extracted.data : null,
          });
        } else {
          addMessage({
            role: 'system',
            content: `Error: ${result.error}`,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[AiAssistant] Send message failed:', message);
        addMessage({
          role: 'system',
          content: `Error: ${message}`,
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Copy/paste mode: generate the prompt for the user to copy
      addMessage({
        role: 'assistant',
        content:
          'Here is your prompt ready to copy. Paste it into ChatGPT, Claude, Gemini, or any AI:\n\n' +
          '---\n' +
          fullPrompt +
          '\n---\n\n' +
          'After getting a response, click the paste icon below to paste the AI\'s response back.',
      });
      setShowPasteBox(true);
    }
  }, [inputText, workflowContext, hasProvider, providerConfig, addMessage]);

  const handleQuickAction = useCallback(
    async (actionIndex: number) => {
      if (!workflowContext) return;

      const actions = getQuickActions(workflowContext.workflowType);
      const action = actions[actionIndex];
      if (!action) return;

      const prompt = buildQuickActionPrompt(action, workflowContext);

      addMessage({ role: 'user', content: `${action.icon} ${action.label}` });

      if (hasProvider) {
        setIsLoading(true);
        try {
          const systemPrompt =
            `You are an AI assistant for ContentCraft. ` +
            `You help refine and improve generated content for tabletop RPGs and creative writing. ` +
            `When suggesting changes, return them as JSON wrapped in \`\`\`json code blocks. ` +
            `Only include the fields you are changing.`;

          const result = await sendToProvider(providerConfig, systemPrompt, prompt);

          if (result.success && result.text) {
            const extracted = extractJsonFromResponse(result.text);
            addMessage({
              role: 'assistant',
              content: result.text,
              extractedJson: extracted.success ? extracted.data : null,
            });
          } else {
            addMessage({ role: 'system', content: `Error: ${result.error}` });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[AiAssistant] Quick action failed:', message);
          addMessage({ role: 'system', content: `Error: ${message}` });
        } finally {
          setIsLoading(false);
        }
      } else {
        // Copy/paste mode
        addMessage({
          role: 'assistant',
          content:
            `Here is your "${action.label}" prompt. Copy and paste it into any AI:\n\n` +
            '---\n' +
            prompt +
            '\n---\n\n' +
            'After getting a response, click the paste icon to paste it back.',
        });
        setShowPasteBox(true);
      }
    },
    [workflowContext, hasProvider, providerConfig, addMessage]
  );

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) return;

    addMessage({ role: 'user', content: '(Pasted AI response)' });

    const extracted = extractJsonFromResponse(pasteText);
    if (extracted.success && extracted.data) {
      addMessage({
        role: 'assistant',
        content: 'JSON extracted successfully from the pasted response. Click "Apply Changes" to merge it into your current data.',
        extractedJson: extracted.data,
      });

      // Show diff preview if we have workflow context
      if (workflowContext && canApplyChanges) {
        const diffs = computeFieldDiff(workflowContext.currentData, extracted.data);
        if (diffs.length > 0) {
          setPendingDiff({ json: extracted.data, diffs });
        }
      }
    } else {
      addMessage({
        role: 'assistant',
        content:
          'Could not extract JSON from the pasted response. ' +
          'Make sure the AI returned a JSON object. The response has been saved as text.\n\n' +
          'Tip: Ask the AI to "return only JSON" or "wrap the response in ```json code blocks".',
      });
    }

    setPasteText('');
    setShowPasteBox(false);
  }, [pasteText, workflowContext, canApplyChanges, addMessage]);

  const handleApplyChanges = useCallback(
    (json: Record<string, unknown>) => {
      if (!applyChanges) return;

      // Show diff preview first
      if (workflowContext) {
        const diffs = computeFieldDiff(workflowContext.currentData, json);
        if (diffs.length > 0) {
          setPendingDiff({ json, diffs });
          return;
        }
      }

      // No diffs to show, apply directly
      applyChanges(json, 'merge');
      addMessage({
        role: 'system',
        content: 'Changes applied successfully.',
      });
    },
    [applyChanges, workflowContext, addMessage]
  );

  // ─── Stage Runner (provider-first) ───────────────────────────────────────
  const buildStagePrompt = useCallback(() => {
    if (!workflowContext) return null;
    const stageKey = workflowContext.stageRouterKey || workflowContext.currentStage || 'stage';
    const allowedKeys = workflowContext.schema && isPlainObject(workflowContext.schema)
      ? Object.keys((workflowContext.schema as { properties?: Record<string, unknown> }).properties || {})
      : [];

    const header = [
      `You are updating stage "${stageKey}" for generator type "${workflowContext.generatorType || workflowContext.workflowType}".`,
      'Return ONLY JSON, no markdown, shaped exactly as:',
      `{
  "${stageKey}": { /* fields to update only */ }
}`,
      'Do not include any other top-level keys. Do not include projectId, stageId, or stageRunId.',
    ];

    if (allowedKeys.length > 0) {
      header.push(`Allowed fields: ${allowedKeys.join(', ')}. You may also include _meta.`);
    } else {
      header.push('Only include fields relevant to this stage; _meta is allowed.');
    }

    const contextBlocks = [
      `Current stage data: ${JSON.stringify(workflowContext.currentData[stageKey] || {})}`,
      `All stage results so far: ${JSON.stringify(workflowContext.currentData)}`,
    ];

    if (workflowContext.factpack) {
      contextBlocks.push(`Factpack: ${JSON.stringify(workflowContext.factpack)}`);
    }

    if (workflowContext.generationConfig) {
      contextBlocks.push(`Generation config: ${JSON.stringify(workflowContext.generationConfig)}`);
    }

    return `${header.join('\n')}

Context:
${contextBlocks.join('\n')}`;
  }, [workflowContext]);

  const validatePatch = useCallback(
    (stageKey: string, patch: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; message: string } => {
      if (!isPlainObject(patch)) return { ok: false, message: 'Patch must be an object.' };
      const keys = Object.keys(patch);
      if (keys.length !== 1 || keys[0] !== stageKey) {
        return { ok: false, message: `Patch must contain only the current stage key (${stageKey}).` };
      }
      const inner = (patch as Record<string, unknown>)[stageKey];
      if (!isPlainObject(inner)) return { ok: false, message: 'Stage payload must be an object.' };

      const allowed = workflowContext?.schema && isPlainObject(workflowContext.schema)
        ? Object.keys((workflowContext.schema as { properties?: Record<string, unknown> }).properties || {})
        : null;

      if (allowed) {
        const invalid = Object.keys(inner).find((k) => k !== '_meta' && !allowed.includes(k));
        if (invalid) {
          return { ok: false, message: `Field ${invalid} is not allowed for this stage.` };
        }
      }

      const size = JSON.stringify(patch).length;
      if (size > 200_000) return { ok: false, message: 'Patch exceeds 200KB limit.' };

      return { ok: true, payload: inner as Record<string, unknown> };
    },
    [workflowContext?.schema]
  );

  const applyStagePatch = useCallback(
    (stageKey: string, payload: Record<string, unknown>) => {
      if (!applyChanges || !workflowContext) return;
      const existing = isPlainObject(workflowContext.currentData[stageKey])
        ? (workflowContext.currentData[stageKey] as Record<string, unknown>)
        : {};
      const merged = deepMergeObjects(existing, payload);
      applyChanges({ [stageKey]: merged }, 'merge');
    },
    [applyChanges, workflowContext]
  );

  const runStageWithGemini = useCallback(async () => {
    if (!workflowContext || !workflowContext.stageRouterKey) {
      setStageRunnerError('No active stage to run.');
      setStageRunnerState('error');
      return;
    }
    if (providerConfig.type !== 'gemini') {
      setStageRunnerError('Gemini provider required for automated stage run.');
      setStageRunnerState('error');
      return;
    }
    const prompt = buildStagePrompt();
    if (!prompt) {
      setStageRunnerError('Unable to build stage prompt.');
      setStageRunnerState('error');
      return;
    }

    const stageKey = workflowContext.stageRouterKey;
    const runId = stageRunId || crypto.randomUUID();
    setStageRunId(runId);
    setStageRunnerState('sending');
    setStageRunnerError(null);

    try {
      const response = await fetch('/api/ai/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: workflowContext.projectId || 'default',
          stageId: stageKey,
          stageRunId: runId,
          prompt,
          schemaVersion: workflowContext.schemaVersion || 'v1.1-client',
          clientContext: {
            generatorType: workflowContext.generatorType || workflowContext.workflowType,
            stageKey,
            userSelectedMode: providerConfig.type,
          },
        }),
      });

      setStageRunnerState('awaiting');
      const body = await response.json();

      if (!response.ok || !body?.ok) {
        const message = body?.error?.message || `Request failed (${response.status})`;
        setStageRunnerError(message);
        setStageRunnerState('error');
        return;
      }

      setStageRunnerState('parsing');
      const patch = body.jsonPatch as unknown;
      const validated = validatePatch(stageKey, patch);

      if (!validated.ok) {
        const failure = validated as { ok: false; message: string };
        setStageRunnerError(failure.message);
        setStageRunnerState('error');
        return;
      }

      const { payload } = validated as { ok: true; payload: Record<string, unknown> }; // narrowed to ok: true

      setStageRunnerState('applying');
      applyStagePatch(stageKey, payload);
      setStageRunnerState('complete');
      addMessage({
        role: 'system',
        content: `Stage ${stageKey} applied successfully via Gemini.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStageRunnerError(message);
      setStageRunnerState('error');
    }
  }, [
    workflowContext,
    providerConfig.type,
    buildStagePrompt,
    stageRunId,
    validatePatch,
    applyStagePatch,
    addMessage,
  ]);

  const handleConfirmApply = useCallback(() => {
    if (!pendingDiff || !applyChanges) return;

    applyChanges(pendingDiff.json, 'merge');
    addMessage({
      role: 'system',
      content: `Applied ${pendingDiff.diffs.length} field change${pendingDiff.diffs.length !== 1 ? 's' : ''} successfully.`,
    });
    setPendingDiff(null);
  }, [pendingDiff, applyChanges, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  // Toggle button (always visible)
  const toggleButton = (
    <button
      onClick={togglePanel}
      className={`fixed right-0 top-1/2 -translate-y-1/2 z-[60] flex items-center gap-1 px-2 py-3 rounded-l-lg shadow-lg transition-all ${
        isPanelOpen
          ? 'bg-primary-600 text-white translate-x-0'
          : 'bg-white border border-r-0 border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-primary-600'
      }`}
      title={isPanelOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
    >
      {isPanelOpen ? (
        <X className="w-5 h-5" />
      ) : (
        <MessageSquare className="w-5 h-5" />
      )}
    </button>
  );

  if (!isPanelOpen) return toggleButton;

  const quickActions = workflowContext
    ? getQuickActions(workflowContext.workflowType)
    : [];

  return (
    <>
      {toggleButton}

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-gray-50 border-l border-gray-200 shadow-xl z-[55] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">AI Assistant</h2>
            {!hasProvider && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                Copy/Paste
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Provider settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={clearMessages}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={closePanel}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel (collapsible) */}
        {showSettings && (
          <AiProviderSettings onClose={() => setShowSettings(false)} />
        )}

        {/* Workflow context bar */}
        {workflowContext && (
          <div className="bg-primary-50 border-b border-primary-100 px-4 py-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary-700">
                {workflowContext.workflowLabel}
              </span>
              {workflowContext.stageProgress && (
                <span className="text-xs text-primary-600">
                  Stage {workflowContext.stageProgress.current}/{workflowContext.stageProgress.total}
                  {workflowContext.currentStage ? ` — ${workflowContext.currentStage}` : ''}
                </span>
              )}
            </div>
            {workflowContext.factpack && workflowContext.factpack.facts.length > 0 && (
              <div className="text-xs text-primary-500 mt-0.5">
                {workflowContext.factpack.facts.length} canon facts loaded
              </div>
            )}
          </div>
        )}

        {/* Stage Runner */}
        {workflowContext?.stageRouterKey && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center justify-between text-xs text-gray-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-primary-600" />
                <span>Stage Runner: {workflowContext.stageRouterKey}</span>
              </div>
              <span className="text-[10px] text-gray-400">Run ID: {stageRunId || 'n/a'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={runStageWithGemini}
                disabled={!hasProvider || stageRunnerState === 'sending' || stageRunnerState === 'awaiting'}
                className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              >
                {stageRunnerState === 'sending' || stageRunnerState === 'awaiting' ? 'Running…' : 'Run with Gemini'}
              </button>
              <span className="text-gray-500">
                {hasProvider ? `Provider: ${providerConfig.type}` : 'No provider configured'}
              </span>
              <span className="text-gray-400">State: {stageRunnerState}</span>
            </div>
            {stageRunnerError && (
              <div className="text-xs text-red-600">{stageRunnerError}</div>
            )}
          </div>
        )}

        {/* No workflow warning */}
        {!workflowContext && (
          <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-3 flex items-start gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-700">
              <p className="font-medium">No active workflow</p>
              <p className="mt-0.5">
                Start a generation (NPC, location, encounter, etc.) and the assistant will
                automatically load the context.
              </p>
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-8">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="font-medium mb-1">AI Assistant</p>
              <p className="text-xs text-gray-400 mb-4">
                {hasProvider
                  ? 'Ask questions or use quick actions to refine your content.'
                  : 'Generate prompts to copy into any AI chat, then paste responses back.'}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              onCopy={handleCopyToClipboard}
              onApply={handleApplyChanges}
              canApply={canApplyChanges}
            />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start mb-3">
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          {/* Diff preview */}
          {pendingDiff && (
            <DiffPreview
              diffs={pendingDiff.diffs}
              onConfirm={handleConfirmApply}
              onCancel={() => setPendingDiff(null)}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions (collapsible) */}
        {workflowContext && quickActions.length > 0 && (
          <div className="border-t border-gray-200 bg-white flex-shrink-0">
            <button
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Quick Actions
              </span>
              {showQuickActions ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            {showQuickActions && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(i)}
                    disabled={isLoading}
                    className="text-xs bg-gray-100 hover:bg-primary-100 hover:text-primary-700 text-gray-700 px-2 py-1 rounded-full transition-colors disabled:opacity-50"
                    title={action.description}
                  >
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paste box (shown after copy/paste mode prompt) */}
        {showPasteBox && (
          <div className="border-t border-gray-200 bg-amber-50 px-3 py-2 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Clipboard className="w-3 h-3 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">Paste AI Response</span>
              <button
                onClick={() => setShowPasteBox(false)}
                className="ml-auto text-amber-400 hover:text-amber-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the AI's response here..."
              className="w-full h-24 text-xs border border-amber-200 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="w-full mt-1.5 bg-amber-600 text-white text-xs py-1.5 rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              Submit Response
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-gray-200 bg-white px-3 py-2 flex-shrink-0">
          {copyFeedback && (
            <div className="text-xs text-green-600 mb-1 flex items-center gap-1">
              <Check className="w-3 h-3" />
              {copyFeedback}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !workflowContext
                  ? 'Start a generation first...'
                  : hasProvider
                  ? 'Ask the AI to refine your content...'
                  : 'Describe what you want to change...'
              }
              disabled={!workflowContext || isLoading}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
              rows={2}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || !workflowContext || isLoading}
                className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={hasProvider ? 'Send to AI' : 'Generate prompt to copy'}
              >
                <Send className="w-4 h-4" />
              </button>
              {!hasProvider && (
                <button
                  onClick={() => setShowPasteBox(!showPasteBox)}
                  className="p-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                  title="Paste AI response"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {hasProvider
              ? `Using ${providerConfig.type} (${providerConfig.model || 'default'})`
              : 'No provider — prompts will be generated for copy/paste'}
          </div>
        </div>
      </div>
    </>
  );
}
