import { describe, expect, it } from 'vitest';
import {
  CHARACTER_BUILD_ENRICHMENT_STAGE_KEY,
  CHARACTER_BUILD_INVENTORY_STAGE_KEY,
  CHARACTER_BUILD_INVENTORY_STATE_KEY,
  buildCharacterBuildInventoryState,
  finalizeCharacterBuildPayload,
  getCharacterBuildFeatureBatchCount,
  resolveCharacterBuildRetryPlan,
  resolveCharacterBuildExecutionStageKey,
} from './npcCharacterBuildEnrichment';

describe('npcCharacterBuildEnrichment', () => {
  it('builds batched inventory state and strips descriptions from feature batches', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action.', level: 5 },
        { name: 'Action Surge', description: 'Take one additional action on your turn.', level: 2 },
      ],
      subclass_features: [
        { name: 'Improved Critical', description: 'Your weapon attacks score a critical hit on a 19 or 20.', level: 3 },
      ],
      racial_features: [
        { name: 'Darkvision', description: 'See in dim light within 60 feet as if it were bright light.' },
      ],
      feats: [
        { name: 'Alert', description: 'Gain +5 initiative and you cannot be surprised while conscious.' },
      ],
      fighting_styles: [],
      skill_proficiencies: [{ name: 'Athletics', value: '+8' }],
      saving_throws: [{ name: 'Strength', value: '+7' }],
    });

    expect(getCharacterBuildFeatureBatchCount(inventoryState)).toBe(2);

    const featureBatches = inventoryState.feature_batches as Array<Record<string, unknown>>;
    expect(featureBatches[0]).toMatchObject({
      batch_index: 0,
      feature_names: ['Extra Attack', 'Action Surge', 'Improved Critical', 'Darkvision'],
    });
    expect(featureBatches[1]).toMatchObject({
      batch_index: 1,
      feature_names: ['Alert'],
    });
    expect(featureBatches[0].class_features).toEqual([
      { name: 'Extra Attack', level: 5 },
      { name: 'Action Surge', level: 2 },
    ]);
    expect(inventoryState.skill_proficiencies).toEqual([{ name: 'Athletics', value: '+8' }]);
    expect(inventoryState.saving_throws).toEqual([{ name: 'Strength', value: '+7' }]);
  });

  it('uses inventory for the first chunk and enrichment once inventory state exists', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [{ name: 'Extra Attack', description: 'Attack twice when you take the Attack action.' }],
      subclass_features: [],
      racial_features: [],
      feats: [],
      fighting_styles: [],
      skill_proficiencies: [],
      saving_throws: [],
    });

    expect(resolveCharacterBuildExecutionStageKey({
      config: { prompt: 'Build an NPC', type: 'npc', flags: {} },
      stageResults: {},
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 2,
        chunkLabel: 'Phase 1 of 2',
      },
    })).toBe(CHARACTER_BUILD_INVENTORY_STAGE_KEY);

    expect(resolveCharacterBuildExecutionStageKey({
      config: { prompt: 'Build an NPC', type: 'npc', flags: {} },
      stageResults: {
        [CHARACTER_BUILD_INVENTORY_STATE_KEY]: inventoryState,
      },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 2,
        chunkLabel: 'Phase 2 of 2',
      },
    })).toBe(CHARACTER_BUILD_ENRICHMENT_STAGE_KEY);
  });

  it('finalizes enriched feature batches and preserves signed modifiers', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action.', level: 5 },
      ],
      subclass_features: [
        { name: 'Improved Critical', description: 'Your weapon attacks score a critical hit on a 19 or 20.', level: 3 },
      ],
      racial_features: [{ name: 'Darkvision', description: 'See in dim light within 60 feet as if it were bright light.' }],
      feats: [{ name: 'Alert', description: 'Gain +5 initiative and you cannot be surprised while conscious.' }],
      fighting_styles: [{ name: 'Defense', description: 'Gain a +1 bonus to AC while wearing armor.' }],
      skill_proficiencies: [{ name: 'Athletics', value: '+8' }],
      saving_throws: [{ name: 'Strength', value: '+7' }],
    });

    const finalized = finalizeCharacterBuildPayload(inventoryState, [
      {
        class_features: [{ name: 'Extra Attack', description: 'When you take the Attack action, you can make two attacks instead of one.', level: 5 }],
        subclass_features: [{ name: 'Improved Critical', description: 'Your weapon attacks score a critical hit on a roll of 19 or 20.', level: 3 }],
        racial_features: [{ name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light and in darkness as if it were dim light.' }],
        feats: [{ name: 'Alert', description: 'You gain +5 to initiative, and other creatures do not gain advantage from being unseen by you.' }],
        fighting_styles: [{ name: 'Defense', description: 'While you are wearing armor, you gain a +1 bonus to AC.' }],
      },
    ]);

    expect(finalized).toEqual({
      ok: true,
      payload: {
        class_features: [{ name: 'Extra Attack', description: 'When you take the Attack action, you can make two attacks instead of one.', level: 5 }],
        subclass_features: [{ name: 'Improved Critical', description: 'Your weapon attacks score a critical hit on a roll of 19 or 20.', level: 3 }],
        racial_features: [{ name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light and in darkness as if it were dim light.' }],
        feats: [{ name: 'Alert', description: 'You gain +5 to initiative, and other creatures do not gain advantage from being unseen by you.' }],
        fighting_styles: [{ name: 'Defense', description: 'While you are wearing armor, you gain a +1 bonus to AC.' }],
        skill_proficiencies: [{ name: 'Athletics', value: '+8' }],
        saving_throws: [{ name: 'Strength', value: '+7' }],
      },
    });
  });

  it('fails finalization when a requested feature still uses placeholder text', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [{ name: 'Extra Attack', description: 'Attack twice when you take the Attack action.' }],
      subclass_features: [],
      racial_features: [],
      feats: [],
      fighting_styles: [],
      skill_proficiencies: [],
      saving_throws: [],
    });

    expect(finalizeCharacterBuildPayload(inventoryState, [
      {
        class_features: [{ name: 'Extra Attack', description: 'Extra Attack' }],
        subclass_features: [],
        racial_features: [],
        feats: [],
        fighting_styles: [],
      },
    ])).toEqual({
      ok: false,
      error: 'class_features[0] Extra Attack is missing a concrete description.',
    });
  });

  it('reconciles enrichment features by name across categories and ignores unrelated extras', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Illusion Savant', description: 'Inventory placeholder.' },
      ],
      subclass_features: [
        { name: 'Assassinate', description: 'Inventory placeholder.' },
      ],
      racial_features: [],
      feats: [],
      fighting_styles: [],
      skill_proficiencies: [{ name: 'Stealth', value: '+13' }],
      saving_throws: [{ name: 'Dexterity', value: '+9' }],
    });

    const finalized = finalizeCharacterBuildPayload(inventoryState, [
      {
        class_features: [
          { name: 'Sneak Attack', description: 'Unrelated extra that should be ignored.' },
        ],
        subclass_features: [
          {
            name: 'Illusion Savant',
            description: 'The gold and time you must spend to copy an illusion spell into your spellbook is halved.',
          },
          {
            name: 'Assassinate',
            description: 'You have advantage on attack rolls against creatures that have not taken a turn yet, and hits against surprised creatures are critical hits.',
          },
        ],
        racial_features: [],
        feats: [],
        fighting_styles: [],
      },
    ]);

    expect(finalized).toEqual({
      ok: true,
      payload: {
        class_features: [],
        subclass_features: [
          {
            name: 'Illusion Savant',
            description: 'The gold and time you must spend to copy an illusion spell into your spellbook is halved.',
          },
          {
            name: 'Assassinate',
            description: 'You have advantage on attack rolls against creatures that have not taken a turn yet, and hits against surprised creatures are critical hits.',
          },
        ],
        racial_features: [],
        feats: [],
        fighting_styles: [],
        skill_proficiencies: [{ name: 'Stealth', value: '+13' }],
        saving_throws: [{ name: 'Dexterity', value: '+9' }],
      },
    });
  });

  it('matches enrichment aliases like ability score improvement variants and ignores None placeholders', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Ability Score Improvement (x2)', description: 'Inventory placeholder.' },
      ],
      subclass_features: [],
      racial_features: [],
      feats: [
        { name: 'War Caster', description: 'Inventory placeholder.' },
      ],
      fighting_styles: [
        { name: 'None', description: 'Not applicable.' },
      ],
      skill_proficiencies: [{ name: 'Arcana', value: '+8' }],
      saving_throws: [{ name: 'Intelligence', value: '+8' }],
    });

    const finalized = finalizeCharacterBuildPayload(inventoryState, [
      {
        class_features: [
          {
            name: 'Ability Score Improvement',
            description: 'At 4th and 8th levels, you can increase one ability score by 2, or two ability scores by 1, to a maximum of 20.',
          },
        ],
        subclass_features: [],
        racial_features: [],
        feats: [
          {
            name: 'War Caster',
            description: 'You have advantage on Constitution saving throws you make to maintain concentration on a spell when you take damage.',
          },
        ],
        fighting_styles: [
          {
            name: 'None',
            description: 'No fighting style applies to this character.',
          },
        ],
      },
    ]);

    expect(getCharacterBuildFeatureBatchCount(inventoryState)).toBe(1);
    expect(finalized).toEqual({
      ok: true,
      payload: {
        class_features: [
          {
            name: 'Ability Score Improvement (x2)',
            description: 'At 4th and 8th levels, you can increase one ability score by 2, or two ability scores by 1, to a maximum of 20.',
          },
        ],
        subclass_features: [],
        racial_features: [],
        feats: [
          {
            name: 'War Caster',
            description: 'You have advantage on Constitution saving throws you make to maintain concentration on a spell when you take damage.',
          },
        ],
        fighting_styles: [],
        skill_proficiencies: [{ name: 'Arcana', value: '+8' }],
        saving_throws: [{ name: 'Intelligence', value: '+8' }],
      },
    });
  });

  it('prunes redundant abstract subclass markers before batching concrete subclass features', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Spellcasting', description: 'Inventory placeholder.' },
        { name: 'Wizard Subclass', description: 'Inventory placeholder.' },
        { name: 'Arcane School Feature (Level 6, 10)', description: 'Inventory placeholder.' },
      ],
      subclass_features: [
        { name: 'Arcane Tradition: School of Evocation', description: 'Inventory placeholder.' },
        { name: 'Evocation Savant', description: 'Inventory placeholder.' },
        { name: 'Sculpt Spells', description: 'Inventory placeholder.' },
      ],
      racial_features: [{ name: 'Feat', description: 'Inventory placeholder.' }],
      feats: [{ name: 'War Caster', description: 'Inventory placeholder.' }],
      fighting_styles: [],
      skill_proficiencies: [{ name: 'Investigation', value: '+8' }],
      saving_throws: [{ name: 'Intelligence', value: '+8' }],
    });

    expect(inventoryState.class_features).toEqual([
      { name: 'Spellcasting', description: 'Inventory placeholder.' },
    ]);
    expect(inventoryState.subclass_features).toEqual([
      { name: 'Arcane Tradition: School of Evocation', description: 'Inventory placeholder.' },
      { name: 'Evocation Savant', description: 'Inventory placeholder.' },
      { name: 'Sculpt Spells', description: 'Inventory placeholder.' },
    ]);
    expect(inventoryState.racial_features).toEqual([]);
    expect(inventoryState.feats).toEqual([
      { name: 'War Caster', description: 'Inventory placeholder.' },
    ]);
  });

  it('allows a generic subclass selector to finalize from a specific subclass choice', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Wizard Subclass', description: 'Inventory placeholder.' },
      ],
      subclass_features: [],
      racial_features: [],
      feats: [],
      fighting_styles: [],
      skill_proficiencies: [],
      saving_throws: [],
    });

    const finalized = finalizeCharacterBuildPayload(inventoryState, [
      {
        class_features: [
          {
            name: 'School of Evocation',
            description: 'You specialize in shaping raw destructive magic into controlled battlefield effects.',
          },
        ],
        subclass_features: [],
        racial_features: [],
        feats: [],
        fighting_styles: [],
      },
    ]);

    expect(finalized).toEqual({
      ok: true,
      payload: {
        class_features: [
          {
            name: 'Wizard Subclass',
            description: 'You specialize in shaping raw destructive magic into controlled battlefield effects.',
          },
        ],
        subclass_features: [],
        racial_features: [],
        feats: [],
        fighting_styles: [],
        skill_proficiencies: [],
        saving_throws: [],
      },
    });
  });

  it('targets the earliest failed enrichment batch and truncates later cached batches for retry', () => {
    const inventoryState = buildCharacterBuildInventoryState({
      class_features: [
        { name: 'Arcane Recovery', description: 'Inventory placeholder.' },
        { name: 'Spellcasting', description: 'Inventory placeholder.' },
        { name: 'Wizard Subclass', description: 'Inventory placeholder.' },
        { name: 'Ability Score Improvement (x2)', description: 'Inventory placeholder.' },
      ],
      subclass_features: [
        { name: 'Evocation Savant', description: 'Inventory placeholder.' },
      ],
      racial_features: [],
      feats: [{ name: 'War Caster', description: 'Inventory placeholder.' }],
      fighting_styles: [],
      skill_proficiencies: [],
      saving_throws: [],
    });

    const retryPlan = resolveCharacterBuildRetryPlan({
      inventoryState,
      enrichedBatches: [
        { class_features: [{ name: 'Arcane Recovery', description: 'Concrete text.' }] },
        { subclass_features: [{ name: 'Evocation Savant', description: 'Concrete text.' }] },
        { feats: [{ name: 'War Caster', description: 'Concrete text.' }] },
      ] as Array<Record<string, unknown>>,
      issuesToAddress: [
        'class_features[2] Wizard Subclass was not returned in the enrichment pass.; class_features[3] Ability Score Improvement (x2) was not returned in the enrichment pass.',
      ],
    });

    expect(retryPlan).toEqual({
      retryBatchIndex: 0,
      retainedBatches: [],
    });
  });
});
