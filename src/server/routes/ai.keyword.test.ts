import { describe, expect, it } from 'vitest';
import {
  buildSchemaCorrectionPrompt,
  buildSpellcastingSemanticCorrectionPrompt,
  evaluateKeywordExtractorCompliance,
  getAutomaticWorkflowRetryDelayMs,
  getStageAllowedKeys,
  shouldApplyDuplicateRetryGuard,
  shouldOfferAutomaticSchemaCorrectionRetry,
  validateWorkflowStageContractPayload,
} from './ai.js';

describe('evaluateKeywordExtractorCompliance', () => {

  it('uses stage-specific allowed keys for NPC basic info slices', () => {
    const registry = {
      allowedPaths: ['name', 'description', 'appearance', 'background', 'species', 'race', 'alignment', 'class_levels', 'location', 'affiliation', 'ability_scores', 'speed', 'saving_throws'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    const allowedKeys = getStageAllowedKeys('basicInfo', registry, 'npc');

    expect(allowedKeys).toContain('species');
    expect(allowedKeys).toContain('race');
    expect(allowedKeys).not.toContain('ability_scores');
    expect(allowedKeys).not.toContain('speed');
  });

  it('accepts display-name aliases and spellcasting helper fields', () => {
    const registry = {
      allowedPaths: ['spellcasting_ability', 'spell_save_dc'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    const allowedKeys = getStageAllowedKeys('Creator: Spellcasting', registry, 'npc');

    expect(allowedKeys).toContain('spellcasting_ability');
    expect(allowedKeys).toContain('class_levels');
    expect(allowedKeys).toContain('ability_scores');
    expect(allowedKeys).toContain('proficiency_bonus');
  });

  it('falls back to registry keys for unknown stages', () => {
    const registry = {
      allowedPaths: ['foo', 'bar'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    expect(getStageAllowedKeys('unknown_stage', registry)).toEqual(['foo', 'bar']);
  });

  it('validates planner payload structure through shared contracts', () => {
    const result = validateWorkflowStageContractPayload('planner', {
      deliverable: 'npc',
      retrieval_hints: {
        entities: ['Barley'],
        regions: [],
        eras: [],
        keywords: ['warlock'],
      },
      proposals: [],
    }, 'npc');

    expect(result.ok).toBe(true);
  });

  it('rejects missing required contract fields for encounter stages', () => {
    const result = validateWorkflowStageContractPayload('Creator: Rewards', {
      treasure: { gold: '250 gp' },
      notes: [],
    }, 'encounter');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      const failure = result;
      expect(failure.error).toContain('consequences');
      expect(failure.error).toContain('scaling');
    }
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

  it('offers one automatic schema correction retry before review is required', () => {
    expect(shouldOfferAutomaticSchemaCorrectionRetry({
      projectId: 'project-1',
      stageId: 'stats',
      stageRunId: 'run-1',
      prompt: 'Prompt',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        correctionAttempt: 0,
      },
    })).toBe(true);

    expect(shouldOfferAutomaticSchemaCorrectionRetry({
      projectId: 'project-1',
      stageId: 'stats',
      stageRunId: 'run-1',
      prompt: 'Prompt',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        correctionAttempt: 1,
      },
    })).toBe(false);
  });

  it('applies duplicate retry blocking only to correction retries, not first-pass stage runs', () => {
    expect(shouldApplyDuplicateRetryGuard({
      projectId: 'project-1',
      stageId: 'planner',
      stageRunId: 'run-1',
      prompt: 'Return planner JSON.',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        correctionAttempt: 0,
      },
    })).toBe(false);

    expect(shouldApplyDuplicateRetryGuard({
      projectId: 'project-1',
      stageId: 'planner',
      stageRunId: 'run-1',
      prompt: 'Return planner JSON.',
      schemaVersion: 'v1.1-client',
      clientContext: {
        generatorType: 'npc',
        correctionAttempt: 1,
      },
    })).toBe(true);
  });

  it('uses workflow stage retry cooldowns for automatic correction retry delays', () => {
    expect(getAutomaticWorkflowRetryDelayMs('story_arc.characters', 'story_arc')).toBe(5000);
    expect(getAutomaticWorkflowRetryDelayMs('unknown_stage', 'story_arc')).toBe(5000);
  });

  it('builds a hidden schema correction prompt with validation details', () => {
    const prompt = buildSchemaCorrectionPrompt('Return stats JSON.', '/speed/walk must be string', ['ability_scores', 'speed']);

    expect(prompt).toContain('Return stats JSON.');
    expect(prompt).toContain('ADDITIONAL_CRITICAL_INSTRUCTIONS (RETRY)');
    expect(prompt).toContain('/speed/walk must be string');
    expect(prompt).toContain('ability_scores, speed');
  });

  it('builds a spellcasting semantic correction prompt with targeted spell-list guidance', () => {
    const prompt = buildSpellcastingSemanticCorrectionPrompt('Return spellcasting JSON.', [
      'No spells provided (prepared, always_prepared, innate, or spells_known).',
      'spell_slots must include at least one slot for slot-based casters.',
    ]);

    expect(prompt).toContain('Return spellcasting JSON.');
    expect(prompt).toContain('No spells provided');
    expect(prompt).toContain('spell_slots must include at least one slot');
    expect(prompt).toContain('spell_slots as an object map');
    expect(prompt).toContain('Do not return bare arrays for prepared_spells, always_prepared_spells, or innate_spells.');
    expect(prompt).toContain('Known casters such as warlocks must include spells_known.');
    expect(prompt).toContain('Prepared casters must include prepared_spells or always_prepared_spells.');
  });
});
