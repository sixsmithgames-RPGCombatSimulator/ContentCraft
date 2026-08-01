import type { LlmOperationClass, LlmUsage } from '../../shared/llm/orchestratorContracts.js';
import type { ThinkingLevel } from './operationRegistry.js';

export interface ProviderStructuredRequest {
  requestId: string;
  operation: string;
  operationClass: LlmOperationClass;
  model: string;
  systemInstruction: string;
  input: unknown;
  outputSchema: Record<string, unknown>;
  temperature?: number;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ProviderStructuredResult {
  output: unknown;
  rawText?: string;
  providerRequestId?: string;
  usage: LlmUsage;
}

export interface LlmProviderAdapter {
  readonly id: string;
  readonly version: string;
  isAvailable(): boolean;
  generateStructured(request: ProviderStructuredRequest): Promise<ProviderStructuredResult>;
}

export function unavailableUsage(): LlmUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cachedInputTokens: null,
    source: 'unavailable',
    priceVersion: null,
    costUsd: null,
  };
}
