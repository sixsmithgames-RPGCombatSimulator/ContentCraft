import { describe, expect, it } from 'vitest';
import {
  CHARACTER_BUILD_ENRICHMENT_STAGE_KEY,
  CHARACTER_BUILD_INVENTORY_STAGE_KEY,
  CHARACTER_BUILD_INVENTORY_STATE_KEY,
  buildCharacterBuildInventoryState,
  finalizeCharacterBuildPayload,
  getCharacterBuildFeatureBatchCount,
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
});
