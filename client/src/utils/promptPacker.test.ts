import { describe, expect, it } from 'vitest';
import { buildPackedPrompt } from './promptPacker';

describe('promptPacker', () => {
  it('fails when the composed prompt still exceeds the safety ceiling even if the rough breakdown fits', () => {
    const stageInputs = {
      draft: Array.from({ length: 5 }, (_, index) => ({
        name: `entry-${index}`,
        description: 'x'.repeat(90),
        notes: ['alpha', 'beta', 'gamma'],
      })),
    };
    const stageContract = 'Allowed keys: draft, summary';
    const outputFormat = 'Output ONLY valid JSON. NO markdown. NO prose.';
    const requiredKeys = 'summary';
    const safetyCeiling =
      stageContract.length +
      outputFormat.length +
      requiredKeys.length +
      JSON.stringify(stageInputs).length;

    const result = buildPackedPrompt({
      mustHave: {
        stageContract,
        outputFormat,
        requiredKeys,
        stageInputs,
      },
      shouldHave: {},
      niceToHave: {},
      safetyCeiling,
    });

    expect(result.success).toBe(false);
    expect(result.analysis.breakdown.grandTotal).toBeLessThanOrEqual(safetyCeiling);
    expect(result.analysis.totalChars).toBeGreaterThan(safetyCeiling);
    expect(result.error?.overflow).toBe(result.analysis.totalChars - safetyCeiling);
  });
});
