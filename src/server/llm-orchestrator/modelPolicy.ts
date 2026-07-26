import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LlmOperationClass, LlmUsage } from '../../shared/llm/orchestratorContracts.js';
import { OrchestratorError } from './errors.js';
import type { CapabilityTier } from './operationRegistry.js';
import type { LlmProviderAdapter } from './provider.js';

type ModelConfig = {
  env?: string;
  fallbackEnv?: string;
  default: string;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
};

type PolicyFile = {
  schemaVersion: string;
  version: string;
  effectiveFrom: string;
  providers: Record<string, {
    enabled: boolean;
    models: Record<CapabilityTier, ModelConfig>;
  }>;
};

let cachedPolicy: PolicyFile | null = null;

export function loadModelPolicy(): PolicyFile {
  if (cachedPolicy) return cachedPolicy;
  const path = process.env.LLM_MODEL_POLICY_FILE || resolve(process.cwd(), 'config', 'llm-model-policy.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as PolicyFile;
  if (parsed.schemaVersion !== 'gma-gmc.model-policy/1' || !parsed.version || !parsed.effectiveFrom) {
    throw new Error(`Invalid model policy file: ${path}`);
  }
  cachedPolicy = parsed;
  return parsed;
}

export function resetModelPolicyForTests() {
  cachedPolicy = null;
}

function modelName(config: ModelConfig) {
  return (config.env ? process.env[config.env] : undefined)
    || (config.fallbackEnv ? process.env[config.fallbackEnv] : undefined)
    || config.default;
}

export function routeProviders(input: {
  adapters: LlmProviderAdapter[];
  tier: CapabilityTier;
  operationClass: LlmOperationClass;
  premiumAllowed: boolean;
  fallbackAllowed: boolean;
}) {
  const policy = loadModelPolicy();
  if (input.operationClass === 'reasoning_high' && !input.premiumAllowed) {
    throw new OrchestratorError({
      code: 'PREMIUM_ROUTE_NOT_AUTHORIZED',
      category: 'policy',
      message: 'This operation is not authorized to use a premium reasoning route.',
      status: 403,
      source: 'gmc.model-router',
    });
  }
  const routes = input.adapters
    .filter((adapter) => adapter.isAvailable())
    .filter((adapter) => policy.providers[adapter.id]?.enabled || process.env[`LLM_ENABLE_${adapter.id.toUpperCase()}`] === '1')
    .map((adapter) => {
      const config = policy.providers[adapter.id]?.models[input.tier];
      if (!config) return null;
      return { adapter, model: modelName(config), config, priceVersion: policy.version };
    })
    .filter((route): route is NonNullable<typeof route> => Boolean(route));
  if (!routes.length) {
    throw new OrchestratorError({
      code: 'PROVIDER_UNAVAILABLE',
      category: 'provider',
      message: 'No provider is available for this operation.',
      retryable: true,
      status: 503,
      source: 'gmc.model-router',
    });
  }
  return input.fallbackAllowed ? routes : routes.slice(0, 1);
}

export function priceUsage(usage: LlmUsage, route: {
  config: ModelConfig;
  priceVersion: string;
}): LlmUsage {
  const exact = usage.source === 'provider';
  const inputRate = route.config.inputUsdPerMillion;
  const outputRate = route.config.outputUsdPerMillion;
  const cachedRate = route.config.cachedInputUsdPerMillion;
  const canPrice = exact
    && inputRate !== null
    && outputRate !== null
    && (usage.cachedInputTokens === null || cachedRate !== null);
  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max(0, (usage.inputTokens ?? 0) - cached);
  const costUsd = canPrice
    ? ((uncachedInput * inputRate!)
      + (cached * (cachedRate ?? inputRate!))
      + ((usage.outputTokens ?? 0) * outputRate!)) / 1_000_000
    : null;
  return {
    ...usage,
    priceVersion: route.priceVersion,
    costUsd,
  };
}
