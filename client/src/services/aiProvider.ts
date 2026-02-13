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

export interface AiProviderResponse {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Send a message to the configured AI provider and get a response.
 * Returns the raw text response from the AI.
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
  if (!config.apiKey) return { success: false, error: 'Gemini API key not configured.' };

  const model = config.model || 'gemini-2.0-flash';
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
  } catch (err: any) {
    return { success: false, error: `Gemini request failed: ${err.message}` };
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
  } catch (err: any) {
    return { success: false, error: `OpenAI request failed: ${err.message}` };
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
  } catch (err: any) {
    return { success: false, error: `Ollama request failed: ${err.message}. Is Ollama running?` };
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
  } catch (err: any) {
    return { success: false, error: `OpenRouter request failed: ${err.message}` };
  }
}

/** Get default model suggestions for each provider */
export function getDefaultModels(provider: AiProviderConfig['type']): string[] {
  switch (provider) {
    case 'gemini':
      return ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'];
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
