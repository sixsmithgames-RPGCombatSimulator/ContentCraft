import { describe, expect, it } from 'vitest';
import { evaluateKeywordExtractorCompliance, getStageAllowedKeys } from './ai.js';

describe('evaluateKeywordExtractorCompliance', () => {

  it('uses stage-specific allowed keys for NPC basic info slices', () => {
    const registry = {
      allowedPaths: ['name', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation', 'ability_scores', 'speed', 'saving_throws'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    const allowedKeys = getStageAllowedKeys('basicInfo', registry);

    expect(allowedKeys).toContain('species');
    expect(allowedKeys).toContain('race');
    expect(allowedKeys).not.toContain('ability_scores');
    expect(allowedKeys).not.toContain('speed');
  });

  it('falls back to registry keys for unknown stages', () => {
    const registry = {
      allowedPaths: ['foo', 'bar'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    expect(getStageAllowedKeys('unknown_stage', registry)).toEqual(['foo', 'bar']);
  });
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
