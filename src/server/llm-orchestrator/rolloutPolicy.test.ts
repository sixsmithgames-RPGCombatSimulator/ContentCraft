import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetRolloutPolicyForTests, resolveRolloutDecision } from './rolloutPolicy.js';

const originalPolicyFile = process.env.LLM_ROLLOUT_POLICY_FILE;
let temporaryDirectory = '';

afterEach(() => {
  if (originalPolicyFile === undefined) delete process.env.LLM_ROLLOUT_POLICY_FILE;
  else process.env.LLM_ROLLOUT_POLICY_FILE = originalPolicyFile;
  resetRolloutPolicyForTests();
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = '';
});

describe('LLM rollout policy', () => {
  it('selects the configured compatibility path deterministically for the same operation identity', () => {
    const first = resolveRolloutDecision('narration.generate', 'correlation-1');
    const second = resolveRolloutDecision('narration.generate', 'correlation-1');
    expect(second).toEqual(first);
    expect(first.mode).toBe('compatibility');
    expect(first.canaryPercent).toBe(100);
  });

  it('records an operation-scoped policy version and rollback target', () => {
    const decision = resolveRolloutDecision('canon.extract', 'correlation-2');
    expect(decision.policyVersion).toBe('2026-07-26.2');
    expect(decision.rollbackTarget).toBe('compatibility_adapter');
  });

  it('canaries primary execution per operation and routes the remaining identities to compatibility', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'llm-rollout-'));
    const policyFile = join(temporaryDirectory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify({
      schemaVersion: 'gma-gmc.llm-rollout-policy/1',
      version: 'rollback-drill',
      effectiveFrom: '2026-07-26T00:00:00.000Z',
      default: {
        mode: 'compatibility',
        canaryPercent: 100,
        rollbackTarget: 'compatibility_adapter',
      },
      operations: {
        'canon.extract': {
          mode: 'primary',
          canaryPercent: 50,
          rollbackTarget: 'compatibility_adapter',
        },
      },
      history: [{ at: '2026-07-26T00:00:00.000Z', change: 'Automated rollback drill.' }],
    }));
    process.env.LLM_ROLLOUT_POLICY_FILE = policyFile;
    resetRolloutPolicyForTests();
    const decisions = Array.from({ length: 100 }, (_, index) =>
      resolveRolloutDecision('canon.extract', `identity-${index}`));
    expect(decisions.some((decision) => decision.mode === 'primary')).toBe(true);
    expect(decisions.some((decision) => decision.mode === 'compatibility')).toBe(true);
    expect(decisions.every((decision) => decision.rollbackTarget === 'compatibility_adapter')).toBe(true);
  });
});
