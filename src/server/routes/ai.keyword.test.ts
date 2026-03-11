import { describe, expect, it } from 'vitest';
import { evaluateKeywordExtractorCompliance } from './ai.js';

describe('evaluateKeywordExtractorCompliance', () => {
  it('passes when keywords array exists alongside junk fields', () => {
    const payload = {
      keywords: [
        ' 11th level paladin ',
        'Aasimar',
        'Thyra Odinson',
        'Longsword of Sharpness',
        'Sentinel Shield',
        'Prayer Beads',
        'Tears of Selûne',
        'Stoic',
        'Purposeful',
      ],
      junk_blob: { anything: true },
      ability_scores: { str: 10 },
    } as Record<string, unknown>;

    const result = evaluateKeywordExtractorCompliance(payload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawKeywordCount).toBe(9);
      expect(result.prunedKeywordCount).toBe(9);
      expect(result.normalizedKeywords).toContain('11th level paladin');
      expect(result.normalizedKeywords).not.toContain(' 11th level paladin ');
    }
  });

  it('trims and deduplicates keywords', () => {
    const payload = {
      keywords: [' Frost Giant ', 'Frost Giant', 'Frost Giant ', 'giant'],
    } as Record<string, unknown>;

    const result = evaluateKeywordExtractorCompliance(payload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedKeywords).toEqual(['Frost Giant', 'giant']);
      expect(result.prunedKeywordCount).toBe(2);
    }
  });

  it('fails when keywords key is missing', () => {
    const payload = { abilities: [] } as Record<string, unknown>;

    const result = evaluateKeywordExtractorCompliance(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('message' in result ? result.message : '').toContain('no usable keywords');
      expect(result.prunedKeywordCount).toBe(0);
    }
  });

  it('fails when keywords array is empty', () => {
    const payload = { keywords: [] } as Record<string, unknown>;

    const result = evaluateKeywordExtractorCompliance(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('message' in result ? result.message : '').toContain('no usable keywords');
      expect(result.rawKeywordCount).toBe(0);
    }
  });
});
