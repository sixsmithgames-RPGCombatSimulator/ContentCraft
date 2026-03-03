/**
 * AI Provider Service
 *
 * Handles BYO (Bring Your Own) API key calls to various AI providers.
 * Supports Gemini, OpenAI, Ollama, and OpenRouter.
 * All calls are made directly from the browser — zero cost to the app developer.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { AiProviderConfig } from '../contexts/AiAssistantContext';

/** Response from an AI provider call */
export interface AiProviderResponse {
  /** Whether the API call succeeded */
  success: boolean;
  /** The text response from the AI (present when success=true) */
  text?: string;
  /** Error message (present when success=false) */
  error?: string;
}

/**
 * Send a message to the configured AI provider and get a response.
 * All calls are made directly from the browser using the user's own API key.
 * Returns the raw text response from the AI.
 * @param config - Provider configuration (type, apiKey, model, etc.)
 * @param systemPrompt - System-level instructions for the AI
 * @param userMessage - The user's message / prompt
 * @returns Response object with success status and text or error
 */
export async function sendToProvider(
  config: AiProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  switch (config.type) {
    case 'gemini':
      return sendToGemini(config, systemPrompt, userMessage);
    case 'openai':
      return sendToOpenAI(config, systemPrompt, userMessage);
    case 'ollama':
      return sendToOllama(config, systemPrompt, userMessage);
    case 'openrouter':
      return sendToOpenRouter(config, systemPrompt, userMessage);
    case 'none':
      return { success: false, error: 'No AI provider configured. Use copy/paste mode or configure a provider in settings.' };
    default:
      return { success: false, error: `Unknown provider type: ${config.type}` };
  }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

async function sendToGemini(
  config: AiProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  // If no client-side API key, route through the backend proxy (server-managed key)
  if (!config.apiKey) {
    return sendToGeminiBackendProxy(systemPrompt, userMessage);
  }

  const model = config.model || 'gemini-2.0-flash-lite-preview-02-05';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `Gemini API error ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { success: false, error: 'Empty response from Gemini.' };
    return { success: true, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AiProvider][Gemini] Request failed:', message);
    return { success: false, error: `Gemini request failed: ${message}` };
  }
}

/**
 * Send a Gemini request through the backend proxy using the server-managed API key.
 * Used when no client-side API key is configured.
 */
async function sendToGeminiBackendProxy(
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  try {
    const response = await fetch('/api/ai/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${systemPrompt}\n\n${userMessage}`,
        projectId: 'chat',
        stageId: 'assistant-chat',
        stageRunId: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 'v1.1-client',
        clientContext: { generatorType: 'chat', stageKey: 'assistant-chat' },
      }),
    });

    const body = await response.json();

    if (!response.ok || !body?.ok) {
      const message = body?.error?.message || `Backend proxy error (${response.status})`;
      return { success: false, error: message };
    }

    // The backend returns jsonPatch, but for chat we need the raw text
    // If rawText is available use it, otherwise stringify the patch
    const text = body.rawText || (body.jsonPatch ? JSON.stringify(body.jsonPatch, null, 2) : null);
    if (!text) return { success: false, error: 'Empty response from Gemini backend proxy.' };
    return { success: true, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AiProvider][GeminiProxy] Request failed:', message);
    return { success: false, error: `Gemini proxy request failed: ${message}` };
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function sendToOpenAI(
  config: AiProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  if (!config.apiKey) return { success: false, error: 'OpenAI API key not configured.' };

  const model = config.model || 'gpt-4o';
  const url = 'https://api.openai.com/v1/chat/completions';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `OpenAI API error ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return { success: false, error: 'Empty response from OpenAI.' };
    return { success: true, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AiProvider][OpenAI] Request failed:', message);
    return { success: false, error: `OpenAI request failed: ${message}` };
  }
}

// ─── Ollama (Local) ──────────────────────────────────────────────────────────

async function sendToOllama(
  config: AiProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';
  const url = `${baseUrl}/api/chat`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `Ollama error ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data?.message?.content;
    if (!text) return { success: false, error: 'Empty response from Ollama.' };
    return { success: true, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AiProvider][Ollama] Request failed:', message);
    return { success: false, error: `Ollama request failed: ${message}. Is Ollama running?` };
  }
}

// ─── OpenRouter ──────────────────────────────────────────────────────────────

async function sendToOpenRouter(
  config: AiProviderConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AiProviderResponse> {
  if (!config.apiKey) return { success: false, error: 'OpenRouter API key not configured.' };

  const model = config.model || 'google/gemini-2.0-flash-exp:free';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'ContentCraft AI Assistant',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `OpenRouter API error ${response.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return { success: false, error: 'Empty response from OpenRouter.' };
    return { success: true, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AiProvider][OpenRouter] Request failed:', message);
    return { success: false, error: `OpenRouter request failed: ${message}` };
  }
}

/**
 * Get default model suggestions for each provider type.
 * @param provider - The AI provider type
 * @returns Array of suggested model name strings
 */
export function getDefaultModels(provider: AiProviderConfig['type']): string[] {
  switch (provider) {
    case 'gemini':
      return ['gemini-2.0-flash-lite-preview-02-05', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    case 'openai':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    case 'ollama':
      return ['llama3', 'llama3.1', 'mistral', 'mixtral', 'codellama', 'gemma2'];
    case 'openrouter':
      return ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3-8b-instruct:free', 'anthropic/claude-3.5-sonnet'];
    default:
      return [];
  }
}
