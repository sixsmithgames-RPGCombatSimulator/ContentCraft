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
import {
  buildIntegratedStageRequest,
  executeIntegratedStageRequest,
  getConfirmedIntegratedStageMetadata,
  shouldAutoRetryIntegratedFailure,
} from '../../services/workflowTransport';
import type { WorkflowTransportStageResponse } from '../../services/workflowTransport';
import { getWorkflowRetryBadgeLabel, getWorkflowRetryDetail } from '../../services/workflowRetryNotice';
import AiProviderSettings from './AiProviderSettings';
import ModeSelectionDialog from './ModeSelectionDialog';
import {
  getStageAttempt,
  hasAcceptedStage,
  markStageError as markRunStageError,
  upsertStageAttempt,
} from '../../../../src/shared/generation/workflowRunState';

function isWorkflowFailureResponse(
  body: WorkflowTransportStageResponse,
): body is Extract<WorkflowTransportStageResponse, { ok: false }> {
  return body.ok === false;
}

function getWorkflowFailureDisplayMessage(
  failureBody: Extract<WorkflowTransportStageResponse, { ok: false }> | null,
  fallbackMessage: string,
): string {
  if (!failureBody) {
    return fallbackMessage;
  }

  const retryReason = failureBody.workflow?.retryContext?.reason;
  if (retryReason === 'schema_validation_failed_after_correction') {
    return 'The AI returned malformed structured data twice for this stage. Review the stage and retry when ready.';
  }

  if (retryReason === 'duplicate_retry_signature') {
    return 'Automatic retry was paused to avoid sending the same broken request again. Review the stage and retry when ready.';
  }

  if (failureBody.error.type === 'INVALID_RESPONSE') {
    return 'The AI returned malformed structured data for this stage. The app could not repair it automatically.';
  }

  return failureBody.error.message || fallbackMessage;
}

type AIProvider = 'gemini' | 'openai' | 'ollama' | 'openrouter' | 'manual';

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
    messages,
    addMessage,
    clearMessages,
    workflowContext,
    applyChanges,
    submitPipelineResponse,
    workflowRunStateDispatcher,
    providerConfig,
    assistMode,
    setAssistMode,
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
  const [_retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [_stallCountdown, setStallCountdown] = useState<number | null>(null);
  const [extractedPayload, setExtractedPayload] = useState<Record<string, unknown> | null>(null);
  const [_rateLimitCooldownMs, setRateLimitCooldownMs] = useState<number | null>(null);
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState<number | null>(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [autoRetryEligible, setAutoRetryEligible] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetryScheduledRef = useRef<boolean>(false);

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

  const effectiveStageKey = workflowContext?.stageRouterKey || workflowContext?.compiledStageRequest?.stageKey || null;
  const hasActiveAutomatedStage = Boolean(workflowContext?.stageRouterKey || workflowContext?.compiledStageRequest);
  const workflowRunState = workflowContext?.runState || null;
  const currentRunAttempt = getStageAttempt(workflowRunState, effectiveStageKey);
  const currentRunAttemptStatus = currentRunAttempt?.status || null;
  const currentRunAttemptId = currentRunAttempt?.attemptId || null;
  const currentCompiledRequestId = workflowContext?.compiledStageRequest?.requestId || null;
  const hasFreshCompiledRequest = Boolean(
    currentCompiledRequestId
    && currentCompiledRequestId !== (currentRunAttempt?.compiledRequestId || null)
  );
  const activeAttemptId = !hasFreshCompiledRequest ? currentRunAttemptId : null;
  const currentRetrySource = currentRunAttempt?.retrySource || null;
  const currentRetryBadge = currentRetrySource ? getWorkflowRetryBadgeLabel(currentRetrySource) : null;
  const currentRetryDetail = currentRetrySource ? getWorkflowRetryDetail(currentRetrySource, 160) : null;

  const updateWorkflowRunAttempt = useCallback(
    (
      status: 'sending' | 'awaiting' | 'parsing' | 'applying' | 'error' | 'complete',
      options?: { error?: string; warnings?: string[]; stageKey?: string; stageLabel?: string },
    ) => {
      if (!workflowRunStateDispatcher || !workflowContext) return;
      const stageKey = options?.stageKey || effectiveStageKey || workflowContext.compiledStageRequest?.stageKey;
      if (!stageKey) return;
      const stageLabel = options?.stageLabel || workflowContext.currentStage || workflowContext.compiledStageRequest?.stageLabel || stageKey;
      const mappedStatus =
        status === 'sending'
          ? 'sending'
          : status === 'awaiting'
          ? 'awaiting_response'
          : status === 'parsing'
          ? 'received'
          : status === 'applying'
          ? 'applying'
          : status === 'error'
          ? 'error'
          : 'accepted';

      workflowRunStateDispatcher((prev) => {
        if (status === 'error') {
          return markRunStageError(prev, stageKey, stageLabel, options?.error || 'Stage execution failed.', {
            attemptId: activeAttemptId || undefined,
            warnings: options?.warnings,
          });
        }

        return upsertStageAttempt(prev, {
          attemptId: activeAttemptId || undefined,
          stageKey,
          stageLabel,
          status: mappedStatus,
          warnings: options?.warnings,
          error: options?.error,
          transport: 'integrated',
        });
      });
    },
    [workflowRunStateDispatcher, workflowContext, effectiveStageKey, activeAttemptId]
  );

  // Reset stageRunId when stage changes (use compiled request as fallback identifier)
  useEffect(() => {
    if (!effectiveStageKey) {
      setStageRunId(null);
      setStageRunnerState('idle');
      setStageRunnerError(null);
      setExtractedPayload(null);
      setHasAutoStarted(false);
      setAutoRetryEligible(false);
      return;
    }
    setStageRunId(crypto.randomUUID());
    setStageRunnerState('idle');
    setStageRunnerError(null);
    setAutoRetryEligible(false);
    setHasAutoStarted(false);
  }, [effectiveStageKey, workflowContext?.compiledStageRequest?.requestId, workflowContext?.compiledStageRequest?.prompt]);

  // Avoid hard error when stageRouterKey is temporarily missing; rely on compiled stage key if present
  useEffect(() => {
    if (assistMode !== 'integrated') return;
    if (!isPanelOpen) return;
    if (!effectiveStageKey) {
      setStageRunnerError(null);
      setStageRunnerState('idle');
    }
  }, [assistMode, isPanelOpen, effectiveStageKey]);

  // NOTE: Panel auto-open is now controlled by ManualGenerator after mode selection

  const hasProvider = providerConfig.type !== 'none';
  const hasWorkflow = !!workflowContext;
  const canApplyChanges = !!applyChanges && hasWorkflow;

  const logStageRunnerGate = useCallback(
    (reason: string) => {
      console.info('[AI Runner][Gate]', reason, {
        isPanelOpen,
        assistMode,
        providerType: providerConfig.type,
        hasProvider,
        stageRouterKey: workflowContext?.stageRouterKey || workflowContext?.compiledStageRequest?.stageKey,
        stageRunnerState,
        attemptStatus: currentRunAttemptStatus,
        hasAutoStarted,
        retrySource: currentRetrySource
          ? {
            kind: currentRetrySource.kind,
            label: currentRetrySource.label,
            targetName: currentRetrySource.targetName,
            issueCategory: currentRetrySource.issueCategory,
            issueType: currentRetrySource.issueType,
          }
          : null,
      });
    },
    [
      assistMode,
      currentRetrySource,
      currentRunAttemptStatus,
      hasAutoStarted,
      hasProvider,
      isPanelOpen,
      providerConfig.type,
      stageRunnerState,
      workflowContext?.stageRouterKey,
      workflowContext?.compiledStageRequest?.stageKey,
    ]
  );

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleModeSelection = useCallback((mode: 'integrated' | 'manual') => {
    setAssistMode(mode);
    setShowModeDialog(false);
  }, [setAssistMode]);

  const handleTogglePanel = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

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
  const getCompiledStageRequest = useCallback(() => {
    if (!workflowContext?.compiledStageRequest) {
      return null;
    }

    const compiled = workflowContext.compiledStageRequest;
    if (workflowContext.stageRouterKey && compiled.stageKey !== workflowContext.stageRouterKey) {
      console.warn('[AI Runner][Compiled Request] Stage key mismatch between workflow context and compiled request', {
        workflowStageKey: workflowContext.stageRouterKey,
        compiledStageKey: compiled.stageKey,
      });
    }

    return compiled;
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

  const sanitizeStagePayload = useCallback(
    (stageKey: string, payload: Record<string, unknown>, allowedKeys?: string[] | null) => {
      const sanitized = { ...payload };

      // Planner payload must not include character_profile (server rejects it)
      if (stageKey === 'planner' && 'character_profile' in sanitized) {
        delete (sanitized as Record<string, unknown>).character_profile;
        console.warn('[AI Runner][Sanitize] Removed disallowed character_profile from planner payload');
      }

      // Strip any keys not allowed by schema (except _meta)
      if (Array.isArray(allowedKeys) && allowedKeys.length > 0) {
        Object.keys(sanitized).forEach((key) => {
          if (key !== '_meta' && !allowedKeys.includes(key)) {
            delete (sanitized as Record<string, unknown>)[key];
            console.warn('[AI Runner][Sanitize] Removed disallowed field from payload', { stageKey, key });
          }
        });
      }

      return sanitized;
    },
    []
  );

  const runStageWithGemini = useCallback(async (overrides?: { promptOverride?: string; correctionAttempt?: number }) => {
    if (inFlightRef.current || stageRunnerState !== 'idle') {
      logStageRunnerGate(`skip: in-flight (${stageRunnerState})`);
      return;
    }
    const stageKeyForRun = effectiveStageKey;
    if (!workflowContext || !stageKeyForRun) {
      logStageRunnerGate('skip: awaiting stage context');
      setStageRunnerError('Workflow is waiting for stage context.');
      setStageRunnerState('idle');
      return;
    }
    if (providerConfig.type !== 'gemini') {
      setStageRunnerError('Gemini provider required for automated stage run.');
      setStageRunnerState('error');
      return;
    }
    const compiledStageRequest = getCompiledStageRequest();
    if (!compiledStageRequest) {
      logStageRunnerGate('skip: awaiting compiled stage request');
      return;
    }

    const effectivePrompt = overrides?.promptOverride ?? compiledStageRequest.prompt;
    const correctionAttempt = overrides?.correctionAttempt ?? 0;

    if (effectivePrompt.length > compiledStageRequest.promptBudget.safetyCeiling) {
      setStageRunnerError(
        `Stage request exceeds safety ceiling (${effectivePrompt.length}/${compiledStageRequest.promptBudget.safetyCeiling}). Rebuild or trim the request before automated send.`
      );
      setStageRunnerState('error');
      return;
    }

    const stageKey = stageKeyForRun || compiledStageRequest.stageKey;
    const runId = stageRunId || crypto.randomUUID();
    setStageRunId(runId);
    setStageRunnerState('sending');
    setStageRunnerError(null);
    setAutoRetryEligible(false);
    updateWorkflowRunAttempt('sending', {
      stageKey,
      stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
    });
    inFlightRef.current = true;

    try {
      const requestBody = buildIntegratedStageRequest(workflowContext, stageKey, runId, providerConfig.type, {
        promptOverride: effectivePrompt,
        correctionAttempt,
      });
      if (!requestBody) {
        setStageRunnerError('Unable to build a workflow stage request.');
        setStageRunnerState('error');
        updateWorkflowRunAttempt('error', {
          error: 'Unable to build a workflow stage request.',
          stageKey,
          stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
        });
        inFlightRef.current = false;
        return;
      }

      console.info('[AI Runner][Request]', {
        stageKey,
        runId,
        generatorType: requestBody.clientContext.generatorType,
        schemaVersion: requestBody.schemaVersion,
        promptChars: effectivePrompt.length,
        promptMode: compiledStageRequest.promptBudget.mode,
        correctionAttempt,
        retrySource: currentRetrySource
          ? {
            kind: currentRetrySource.kind,
            label: currentRetrySource.label,
            targetName: currentRetrySource.targetName,
            issueCategory: currentRetrySource.issueCategory,
            issueType: currentRetrySource.issueType,
          }
          : null,
      });

      const { response, body } = await executeIntegratedStageRequest(requestBody);
      setStageRunnerState('awaiting');
      updateWorkflowRunAttempt('awaiting', {
        stageKey,
        stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
      });

      if (!response.ok || !body?.ok) {
        const failureBody = isWorkflowFailureResponse(body) ? body : null;
        const rawMessage = failureBody?.error?.message || `Request failed (${response.status})`;
        const message = getWorkflowFailureDisplayMessage(failureBody, rawMessage);
        const failedStageKey = failureBody?.workflow?.stageKey || stageKey;
        setAutoRetryEligible(failureBody ? shouldAutoRetryIntegratedFailure(failureBody) : false);
        console.warn('[AI Runner][Response][Error]', {
          status: response.status,
          message: rawMessage,
          body: failureBody ?? body,
          retrySource: currentRetrySource
            ? {
              kind: currentRetrySource.kind,
              label: currentRetrySource.label,
              targetName: currentRetrySource.targetName,
              issueCategory: currentRetrySource.issueCategory,
              issueType: currentRetrySource.issueType,
            }
            : null,
        });
        const correctionPrompt = failureBody?.workflow?.retryContext?.correctionPrompt;
        if (failureBody && correctionPrompt && shouldAutoRetryIntegratedFailure(failureBody)) {
          addMessage({
            role: 'system',
            content: 'The AI returned malformed stage data. Retrying automatically with repair instructions.',
          });
          setAutoRetryEligible(false);
          setStageRunnerError(null);
          setStageRunnerState('idle');
          setHasAutoStarted(false);
          inFlightRef.current = false;
          setTimeout(() => runStageWithGemini({
            promptOverride: correctionPrompt,
            correctionAttempt: correctionAttempt + 1,
          }), 0);
          return;
        }
        if (failureBody?.error?.type === 'RATE_LIMIT') {
          const cooldown = typeof failureBody.error.retryAfterMs === 'number' ? Math.max(failureBody.error.retryAfterMs, 5000) : 10_000;
          setRateLimitCooldownMs(cooldown);
          setCooldownEndsAt(Date.now() + cooldown);
          setStageRunnerError(`Rate limited. Auto-retry in ${(cooldown / 1000).toFixed(0)}s.`);
          setHasAutoStarted(false);
        } else {
          setStageRunnerError(message);
        }
        setStageRunnerState('error');
        updateWorkflowRunAttempt('error', {
          error: message,
          stageKey: failedStageKey,
          stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
        });
        inFlightRef.current = false;
        return;
      }

      const confirmedStage = getConfirmedIntegratedStageMetadata(body, {
        stageId: stageKey,
        stageKey,
        workflowType: workflowContext.generatorType || workflowContext.workflowType,
      });
      const confirmedStageKey = confirmedStage.stageKey;
      if (confirmedStageKey !== stageKey) {
        console.warn('[AI Runner][Stage Confirmed] Server confirmed a different stage key than requested', {
          requestedStageKey: stageKey,
          confirmedStageKey,
          workflow: body.workflow ?? null,
        });
      }

      setStageRunnerState('parsing');
      updateWorkflowRunAttempt('parsing', {
        stageKey: confirmedStageKey,
        stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
      });
      const patch = body.jsonPatch as unknown;
      const validated = validatePatch(confirmedStageKey, patch);

      if (!validated.ok) {
        const failure = validated as { ok: false; message: string };
        setAutoRetryEligible(false);
        setStageRunnerError(failure.message);
        setStageRunnerState('error');
        updateWorkflowRunAttempt('error', {
          error: failure.message,
          stageKey,
          stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
        });
        inFlightRef.current = false;
        return;
      }

      const { payload } = validated as { ok: true; payload: Record<string, unknown> }; // narrowed to ok: true
      const allowedKeys = workflowContext?.schema && isPlainObject(workflowContext.schema)
        ? Object.keys((workflowContext.schema as { properties?: Record<string, unknown> }).properties || {})
        : null;
      const sanitizedPayload = sanitizeStagePayload(confirmedStageKey, payload, allowedKeys);
      setStageRunnerState('applying');
      updateWorkflowRunAttempt('applying', {
        stageKey: confirmedStageKey,
        stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
      });
      setExtractedPayload(sanitizedPayload);
      applyStagePatch(confirmedStageKey, sanitizedPayload);
      
      if (submitPipelineResponse) {
        // Submit the actual payload to the generator pipeline
        await submitPipelineResponse(JSON.stringify(sanitizedPayload), sanitizedPayload, {
          ...confirmedStage,
          requestId: body.requestId,
          stageRunId: body.stageRunId,
        });
      }
      
      setAutoRetryEligible(false);
      setStageRunnerState('complete');
      updateWorkflowRunAttempt('complete', {
        stageKey: confirmedStageKey,
        stageLabel: workflowContext.currentStage || compiledStageRequest.stageLabel,
      });
      addMessage({
        role: 'system',
        content: body.workflow?.stageKey
          ? `Stage ${body.workflow.stageKey} applied successfully via Gemini.`
          : `Stage ${stageKey} applied successfully via Gemini.`,
      });
      console.info('[AI Runner][Success]', {
        stageKey: confirmedStageKey,
        runId,
        workflow: body.workflow ?? null,
        retrySource: currentRetrySource
          ? {
            kind: currentRetrySource.kind,
            label: currentRetrySource.label,
            targetName: currentRetrySource.targetName,
            issueCategory: currentRetrySource.issueCategory,
            issueType: currentRetrySource.issueType,
          }
          : null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AI Runner][Exception]', message);
      setAutoRetryEligible(false);
      setStageRunnerError(message);
      setStageRunnerState('error');
      updateWorkflowRunAttempt('error', {
        error: message,
        stageKey: stageKeyForRun || effectiveStageKey || workflowContext?.compiledStageRequest?.stageKey || 'unknown',
        stageLabel: workflowContext?.currentStage || workflowContext?.compiledStageRequest?.stageLabel || 'Unknown Stage',
      });
      inFlightRef.current = false;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    workflowContext,
    providerConfig.type,
    getCompiledStageRequest,
    stageRunId,
    validatePatch,
    applyStagePatch,
    addMessage,
    logStageRunnerGate,
    stageRunnerState,
    currentRetrySource,
    updateWorkflowRunAttempt,
  ]);

  const handleRetryAfterRateLimit = useCallback(() => {
    if (stageRunnerState !== 'error') return;
    setRateLimitCooldownMs(null);
    setCooldownEndsAt(null);
    setRateLimitSecondsLeft(null);
    setStageRunnerState('idle');
    setStageRunnerError(null);
    setHasAutoStarted(false);
    runStageWithGemini();
  }, [stageRunnerState, runStageWithGemini]);

  // Manage cooldown countdown timer
  useEffect(() => {
    if (!cooldownEndsAt) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      setRateLimitSecondsLeft(null);
      autoRetryScheduledRef.current = false;
      return;
    }

    const updateCountdown = () => {
      const remainingMs = cooldownEndsAt - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setRateLimitSecondsLeft(remainingSeconds);

      if (remainingMs <= 0) {
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
      }
    };

    updateCountdown();
    cooldownTimerRef.current = setInterval(updateCountdown, 500);

    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cooldownEndsAt]);

  // Auto-retry once after cooldown expires, respecting in-flight guard
  useEffect(() => {
    if (!cooldownEndsAt || rateLimitSecondsLeft === null) return;
    if (rateLimitSecondsLeft > 0) return;
    if (stageRunnerState !== 'error') return;
    if (autoRetryScheduledRef.current) return;

    autoRetryScheduledRef.current = true;
    setTimeout(() => {
      setRateLimitCooldownMs(null);
      setCooldownEndsAt(null);
      setRateLimitSecondsLeft(null);
      setStageRunnerState('idle');
      setStageRunnerError(null);
      setHasAutoStarted(false);
      runStageWithGemini();
    }, 300);
  }, [cooldownEndsAt, rateLimitSecondsLeft, stageRunnerState, runStageWithGemini]);

  // Auto-start integrated AI when panel opens in provider mode
  useEffect(() => {
    if (!isPanelOpen) {
      logStageRunnerGate('skip: panel closed');
      return;
    }
    if (!isPanelOpen || assistMode !== 'integrated') {
      logStageRunnerGate('skip: panel closed');
      return;
    }
    if (!hasProvider) {
      logStageRunnerGate('skip: no provider');
      return;
    }
    if (!workflowContext?.compiledStageRequest) {
      logStageRunnerGate('skip: awaiting compiled stage request');
      return;
    }
    if (!workflowContext || !effectiveStageKey) {
      logStageRunnerGate('skip: missing stageRouterKey');
      return;
    }
    if (currentRunAttemptStatus && currentRunAttemptStatus !== 'compiled' && !hasFreshCompiledRequest) {
      logStageRunnerGate(`skip: attempt not ready (${currentRunAttemptStatus})`);
      return;
    }
    if (stageRunnerState !== 'idle') {
      logStageRunnerGate(`skip: runner not idle (${stageRunnerState})`);
      return;
    }
    if (hasAutoStarted) {
      logStageRunnerGate('skip: already auto-started');
      return;
    }

    logStageRunnerGate('auto-start: scheduling run with initial delay');
    setHasAutoStarted(true);
    // Add 2.5s initial delay to ensure server-side throttle window is clear
    setTimeout(() => runStageWithGemini(), 2500);
  }, [isPanelOpen, assistMode, hasProvider, workflowContext?.stageRouterKey, workflowContext?.compiledStageRequest, stageRunnerState, hasAutoStarted, runStageWithGemini, logStageRunnerGate, currentRunAttemptStatus, hasFreshCompiledRequest]);

  // Auto-retry on error with countdown (skip if missing stageRouterKey)
  useEffect(() => {
    if (stageRunnerState !== 'error' || currentRunAttemptStatus !== 'error') {
      setRetryCountdown(null);
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current as unknown as number);
        retryTimerRef.current = null;
      }
      return;
    }

    if (stageRunnerError && stageRunnerError.toLowerCase().includes('stageRouterKey'.toLowerCase())) {
      return; // Do not auto-retry when router key is missing
    }

    if (!autoRetryEligible) {
      return;
    }

    setRetryCountdown(5);
    setStageRunnerError((prev) => prev || 'Stage failed. Auto-retrying shortly.');

    const interval = setInterval(() => {
      setRetryCountdown((current) => {
        if (current === null) return current;
        const next = current - 1;
        if (next <= 0) {
          clearInterval(interval);
          retryTimerRef.current = null;
          setRetryCountdown(null);
          setAutoRetryEligible(false);
          setStageRunnerError(null);
          setStageRunnerState('idle');
          // Allow state to settle before retrying
          setTimeout(() => runStageWithGemini(), 0);
          return null;
        }
        return next;
      });
    }, 1000);

    retryTimerRef.current = interval as unknown as NodeJS.Timeout;

    return () => {
      clearInterval(interval);
      retryTimerRef.current = null;
    };
  }, [stageRunnerState, stageRunnerError, currentRunAttemptStatus, autoRetryEligible, runStageWithGemini]);

  // Stall watchdog: only retry if the same explicit attempt never gets accepted.
  useEffect(() => {
    const clearStallTimer = () => {
      if (stallTimerRef.current) {
        clearInterval(stallTimerRef.current as unknown as number);
        stallTimerRef.current = null;
      }
      setStallCountdown(null);
    };

    if (assistMode !== 'integrated' || !isPanelOpen || !hasActiveAutomatedStage) {
      clearStallTimer();
      return;
    }

    if (!currentRunAttemptId || currentRunAttemptStatus !== 'applying' || hasAcceptedStage(workflowRunState, effectiveStageKey)) {
      clearStallTimer();
      return;
    }

    if (stageRunnerState !== 'complete') {
      clearStallTimer();
      return;
    }

    clearStallTimer();
    setStallCountdown(4);
    const interval = setInterval(() => {
      setStallCountdown((current) => {
        if (current === null) return current;
        const next = current - 1;
        if (next <= 0) {
          clearInterval(interval);
          stallTimerRef.current = null;
          setStallCountdown(null);
          setStageRunnerError('Workflow stalled: stage apply was never accepted. Auto-retrying current stage.');
          updateWorkflowRunAttempt('error', {
            error: 'Workflow stalled: stage apply was never accepted.',
            stageKey: effectiveStageKey || undefined,
            stageLabel: workflowContext?.currentStage || workflowContext?.compiledStageRequest?.stageLabel,
          });
          setStageRunnerState('idle');
          setHasAutoStarted(false);
          setTimeout(() => runStageWithGemini(), 0);
          return null;
        }
        return next;
      });
    }, 1000);

    stallTimerRef.current = interval as unknown as NodeJS.Timeout;

    return () => {
      clearInterval(interval);
      if (stallTimerRef.current === (interval as unknown as NodeJS.Timeout)) {
        stallTimerRef.current = null;
      }
      setStallCountdown(null);
    };
  }, [
    assistMode,
    currentRunAttemptId,
    currentRunAttemptStatus,
    effectiveStageKey,
    hasActiveAutomatedStage,
    isPanelOpen,
    runStageWithGemini,
    stageRunnerState,
    updateWorkflowRunAttempt,
    workflowContext?.currentStage,
    workflowContext?.compiledStageRequest?.stageLabel,
    workflowRunState,
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
      onClick={handleTogglePanel}
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

  // Add margin to body when panel is open to prevent overlap
  useEffect(() => {
    if (isPanelOpen) {
      document.body.style.marginRight = '384px';
      document.body.style.transition = 'margin-right 0.3s ease';
    } else {
      document.body.style.marginRight = '0';
    }
    return () => {
      document.body.style.marginRight = '0';
    };
  }, [isPanelOpen]);

  // Only show toggle button if workflow is active and mode is selected
  if (!workflowContext || !assistMode) return null;

  if (!isPanelOpen) return toggleButton;

  const quickActions = workflowContext
    ? getQuickActions(workflowContext.workflowType)
    : [];

  return (
    <>
      <ModeSelectionDialog
        isOpen={showModeDialog}
        onClose={() => setShowModeDialog(false)}
        onSelectMode={handleModeSelection}
        hasProvider={hasProvider}
      />

      {toggleButton}

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-gray-50 border-l border-gray-200 shadow-xl z-[55] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">AI Assistant</h2>
            {assistMode === 'integrated' && (
              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                Integrated
              </span>
            )}
            {assistMode === 'manual' && (
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                Manual
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
        {hasActiveAutomatedStage && assistMode === 'integrated' && (
          <div className="bg-gradient-to-r from-primary-50 to-primary-100 border-b border-primary-200 px-4 py-3 flex flex-col gap-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Automated Stage Runner</div>
                  <div className="text-xs text-gray-600">{workflowContext.stageRouterKey || workflowContext.compiledStageRequest?.stageKey}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {stageRunnerState === 'complete' && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                    ✓ Complete
                  </span>
                )}
                {(stageRunnerState === 'sending' || stageRunnerState === 'awaiting' || stageRunnerState === 'parsing' || stageRunnerState === 'validating' || stageRunnerState === 'applying') && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                    <div className="animate-spin rounded-full h-2 w-2 border-b border-blue-700" />
                    {stageRunnerState === 'sending' && 'Sending...'}
                    {stageRunnerState === 'awaiting' && 'Awaiting AI...'}
                    {stageRunnerState === 'parsing' && 'Parsing...'}
                    {stageRunnerState === 'validating' && 'Validating...'}
                    {stageRunnerState === 'applying' && 'Applying...'}
                  </span>
                )}
                {stageRunnerState === 'error' && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                    ✗ Error
                  </span>
                )}
              </div>
            </div>
            {currentRetrySource && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-amber-900">Retry Context</span>
                  {currentRetryBadge && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {currentRetryBadge}
                    </span>
                  )}
                  {currentRetrySource.targetName && (
                    <span className="text-[11px] text-amber-700">
                      Target: {currentRetrySource.targetName}
                    </span>
                  )}
                </div>
                {currentRetryDetail && (
                  <p className="mt-1 text-xs text-amber-800">{currentRetryDetail}</p>
                )}
              </div>
            )}
            {stageRunnerState === 'idle' && !hasAutoStarted && (
              <div className="bg-white rounded-lg p-3 border border-primary-200">
                <p className="text-xs text-gray-600 mb-2">
                  Stage will run automatically when ready.
                </p>
                <button
                  onClick={() => {
                    void runStageWithGemini();
                  }}
                  disabled={!hasProvider}
                  className="w-full px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {hasProvider ? 'Run Stage Now' : 'Configure Provider First'}
                </button>
              </div>
            )}
            {stageRunnerState === 'complete' && (
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <p className="text-xs text-green-700 font-medium mb-1">Stage completed successfully!</p>
                <p className="text-xs text-green-600 mb-2">Changes have been applied. Waiting for the workflow to advance.</p>
                {extractedPayload && (
                  <div className="mt-2">
                    <p className="text-xs text-green-800 font-medium mb-1">Extracted Data:</p>
                    <div className="bg-white rounded border border-green-100 p-2 overflow-auto max-h-32">
                      <pre className="text-[10px] text-gray-700 font-mono whitespace-pre-wrap">
                        {JSON.stringify(extractedPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
            {stageRunnerError && stageRunnerState === 'error' && (
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <p className="text-xs text-red-700 font-medium mb-1">Stage needs attention:</p>
                <p className="text-xs text-red-600">{stageRunnerError}</p>
                <button
                  onClick={rateLimitSecondsLeft && rateLimitSecondsLeft > 0 ? undefined : handleRetryAfterRateLimit}
                  disabled={Boolean(rateLimitSecondsLeft && rateLimitSecondsLeft > 0)}
                  className="mt-2 w-full px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rateLimitSecondsLeft && rateLimitSecondsLeft > 0
                    ? `Retry in ${rateLimitSecondsLeft}s`
                    : 'Retry stage'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode switch button in panel */}
        {assistMode && workflowContext && (
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-gray-500">
              Mode: <span className="font-medium text-gray-700">{assistMode === 'integrated' ? 'Integrated AI' : 'Manual Copy/Paste'}</span>
            </span>
            <button
              onClick={() => setAssistMode(assistMode === 'integrated' ? 'manual' : 'integrated')}
              className="text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors"
            >
              Switch to {assistMode === 'integrated' ? 'Manual' : 'Integrated'}
            </button>
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
