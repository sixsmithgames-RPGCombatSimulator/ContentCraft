import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RolloutMode = 'compatibility' | 'primary' | 'shadow' | 'disabled';

type RolloutRule = {
  mode: RolloutMode;
  canaryPercent: number;
  rollbackTarget: 'compatibility_adapter' | 'disabled';
};

type RolloutPolicy = {
  schemaVersion: string;
  version: string;
  effectiveFrom: string;
  default: RolloutRule;
  operations: Record<string, Partial<RolloutRule>>;
  history: Array<{ at: string; change: string }>;
};

let cached: RolloutPolicy | null = null;

export function loadRolloutPolicy(): RolloutPolicy {
  if (cached) return cached;
  const path = process.env.LLM_ROLLOUT_POLICY_FILE || resolve(process.cwd(), 'config', 'llm-rollout-policy.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as RolloutPolicy;
  if (parsed.schemaVersion !== 'gma-gmc.llm-rollout-policy/1' || !parsed.version || !parsed.default) {
    throw new Error(`Invalid LLM rollout policy: ${path}`);
  }
  cached = parsed;
  return parsed;
}

export function resetRolloutPolicyForTests() {
  cached = null;
}

function bucket(operation: string, identity: string) {
  const digest = createHash('sha256').update(`${operation}\0${identity}`).digest();
  return digest.readUInt32BE(0) % 10_000 / 100;
}

export function resolveRolloutDecision(operation: string, identity: string) {
  const policy = loadRolloutPolicy();
  const override = policy.operations[operation] ?? {};
  const rule: RolloutRule = {
    ...policy.default,
    ...override,
    canaryPercent: Math.min(100, Math.max(0, Number(override.canaryPercent ?? policy.default.canaryPercent))),
  };
  const canaryBucket = bucket(operation, identity);
  const selected = canaryBucket < rule.canaryPercent;
  return {
    policyVersion: policy.version,
    operation,
    mode: selected ? rule.mode : (rule.rollbackTarget === 'disabled' ? 'disabled' : 'compatibility'),
    configuredMode: rule.mode,
    canaryPercent: rule.canaryPercent,
    canaryBucket,
    selected,
    rollbackTarget: rule.rollbackTarget,
  };
}
