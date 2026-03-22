import { describe, expect, it } from 'vitest';
import {
  buildContractCorrectionPrompt,
  buildSchemaCorrectionPrompt,
  buildSpellcastingSemanticCorrectionPrompt,
  evaluateKeywordExtractorCompliance,
  extractJsonPatch,
  getAutomaticWorkflowRetryDelayMs,
  getStageAllowedKeys,
  normalizeNameValueArray,
  shouldApplyGeneratorSchemaValidation,
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

  it('uses shared contract keys for generic purpose stages', () => {
    const registry = {
      allowedPaths: ['title', 'description', 'scene_type'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    const allowedKeys = getStageAllowedKeys('purpose', registry, 'scene');

    expect(allowedKeys).toEqual(expect.arrayContaining([
      'content_type',
      'generation_mode',
      'game_system',
      'detail_level',
      'special_requirements',
      'interpretation',
    ]));
    expect(allowedKeys).not.toContain('title');
  });

  it('preserves legacy scene creator keys so shared repair can normalize them', () => {
    const registry = {
      allowedPaths: ['title', 'description', 'scene_type', 'location', 'participants', 'setting', 'npcs_present', 'skill_checks', 'clues_information'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    const allowedKeys = getStageAllowedKeys('creator', registry, 'scene');

    expect(allowedKeys).toEqual(expect.arrayContaining([
      'location',
      'participants',
      'setting',
      'npcs_present',
      'skill_checks',
      'clues_information',
    ]));
  });

  it('skips generator-schema validation for contract-only generic report stages', () => {
    const registry = {
      allowedPaths: ['title', 'description', 'scene_type', 'rule_base'],
      schemaVersion: 'v1.1-client',
      schema: {},
    } as any;

    expect(shouldApplyGeneratorSchemaValidation('purpose', 'scene', registry)).toBe(false);
    expect(shouldApplyGeneratorSchemaValidation('fact_checker', 'scene', registry)).toBe(false);
    expect(shouldApplyGeneratorSchemaValidation('canon_validator', 'scene', registry)).toBe(false);
    expect(shouldApplyGeneratorSchemaValidation('physics_validator', 'scene', registry)).toBe(false);
    expect(shouldApplyGeneratorSchemaValidation('creator', 'scene', registry)).toBe(true);
    expect(shouldApplyGeneratorSchemaValidation('story_arc.secrets', 'story_arc', registry)).toBe(false);
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

  it('rejects planner payloads whose deliverable does not match the workflow type', () => {
    const result = validateWorkflowStageContractPayload('planner', {
      deliverable: 'Nasir profile summary',
      retrieval_hints: {
        entities: [],
        regions: [],
        eras: [],
        keywords: [],
      },
      proposals: [],
    }, 'npc');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain('deliverable');
    }
  });

  it('rejects planner payloads whose proposals are strings instead of proposal objects', () => {
    const result = validateWorkflowStageContractPayload('planner', {
      deliverable: 'npc',
      retrieval_hints: {
        entities: [],
        regions: [],
        eras: [],
        keywords: [],
      },
      proposals: ['Ask about faction ties'],
    }, 'npc');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain('proposal objects');
    }
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

  it('preserves numeric bonus aliases when normalizing character build modifiers server-side', () => {
    const payload: Record<string, unknown> = {
      skill_proficiencies: [
        { skill: 'Stealth', bonus: 8 },
        { name: 'Perception', modifier: 5 },
      ],
      saving_throws: [
        { ability: 'Dexterity', bonus: 8 },
        { save: 'Intelligence', modifier: 5 },
      ],
    };

    normalizeNameValueArray(payload, 'skill_proficiencies');
    normalizeNameValueArray(payload, 'saving_throws');

    expect(payload.skill_proficiencies).toEqual([
      { name: 'Stealth', value: '+8' },
      { name: 'Perception', value: '+5' },
    ]);
    expect(payload.saving_throws).toEqual([
      { name: 'Dexterity', value: '+8' },
      { name: 'Intelligence', value: '+5' },
    ]);
  });

  it('rejects character_build payloads whose descriptions only repeat feature names', () => {
    const result = validateWorkflowStageContractPayload('character_build', {
      class_features: [{ name: 'Sneak Attack', description: 'Sneak Attack' }],
      subclass_features: [{ name: 'Assassinate', description: 'Assassinate' }],
      racial_features: [{ name: 'Darkvision', description: 'Darkvision' }],
      feats: [{ name: 'Alert', description: 'Alert' }],
      fighting_styles: [{ name: 'Archery', description: 'Archery' }],
      skill_proficiencies: [{ name: 'Stealth', value: '+8' }],
      saving_throws: [{ name: 'Dexterity', value: '+8' }],
    }, 'npc');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      const failure = result;
      expect(failure.error).toContain('description repeats the feature name');
      expect(failure.error).toContain('class_features[0]');
    }
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

  it('builds a character_build correction prompt with explicit description guidance', () => {
    const prompt = buildContractCorrectionPrompt(
      'Return character build JSON.',
      'character_build',
      'class_features[0] description repeats the feature name. Provide concrete effect text instead.',
      ['class_features', 'feats'],
    );

    expect(prompt).toContain('Return character build JSON.');
    expect(prompt).toContain('description repeats the feature name');
    expect(prompt).toContain('every returned item must include a real description explaining what the feature does');
    expect(prompt).toContain('Do not repeat the feature name as the description.');
    expect(prompt).toContain('Preserve the same JSON shape and replace placeholder descriptions in place.');
  });

  it('builds a character_build inventory correction prompt with modifier guidance', () => {
    const prompt = buildContractCorrectionPrompt(
      'Return inventory JSON.',
      'character_build_feature_inventory',
      'Skill proficiencies use placeholder modifiers (+0).',
      ['class_features', 'skill_proficiencies', 'saving_throws'],
    );

    expect(prompt).toContain('Return inventory JSON.');
    expect(prompt).toContain('inventory pass for character build data');
    expect(prompt).toContain('real signed modifiers such as +7 or -1');
    expect(prompt).toContain('do not use placeholder +0 values');
    expect(prompt).toContain('class_features, subclass_features, racial_features, feats, fighting_styles, skill_proficiencies, saving_throws');
  });

  it('builds a character_build enrichment correction prompt with batch-bound guidance', () => {
    const prompt = buildContractCorrectionPrompt(
      'Return feature enrichment JSON.',
      'character_build_feature_enrichment',
      'class_features[0] Sneak Attack was not returned in the enrichment pass.',
      ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles'],
    );

    expect(prompt).toContain('Return feature enrichment JSON.');
    expect(prompt).toContain('Treat feature_batch and feature_names as authoritative');
    expect(prompt).toContain('Return only the requested features from feature_batch');
    expect(prompt).toContain('Do not add skill_proficiencies or saving_throws in this stage.');
    expect(prompt).toContain('class_features, subclass_features, racial_features, feats, fighting_styles');
    expect(prompt).not.toContain('skill_proficiencies, saving_throws');
  });

  it('salvages malformed-but-usable JSON patches from AI output', () => {
    const extraction = extractJsonPatch(`Here is the JSON:\n{"class_features":[],"subclass_features":[],"racial_features":[],"feats":[{"name":"Sharpshooter","description":"Long-range attacks ignore disadvantage."}],"fighting_styles":[{"name":"Archery","description":"Gain +2 to ranged weapon attack rolls."}],}`);

    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;

    expect(extraction.patch).toEqual({
      class_features: [],
      subclass_features: [],
      racial_features: [],
      feats: [{ name: 'Sharpshooter', description: 'Long-range attacks ignore disadvantage.' }],
      fighting_styles: [{ name: 'Archery', description: 'Gain +2 to ranged weapon attack rolls.' }],
    });
    expect(extraction.warnings).toContain('repair:removed_trailing_commas');
  });
});
