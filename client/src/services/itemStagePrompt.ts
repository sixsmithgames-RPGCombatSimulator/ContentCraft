import {
  buildWorkflowStagePrompt,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';

export function buildItemConceptPrompt(context: StageContext): string {
  return buildWorkflowStagePrompt({
    context,
    deliverable: 'item',
    stage: 'concept',
    includeFlags: true,
  });
}

export function buildItemMechanicsPrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['item_concept'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'item',
    stage: 'mechanics',
    payload: {
      concept,
      instructions: `Design mechanics for this ${concept.rarity || ''} ${concept.item_type || 'magic'} item. Ensure balance is appropriate for rarity.`,
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for item mechanics and lore.',
  });
}

export function buildItemLorePrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['item_concept'] || {});
  const mechanics = stripStageOutput(context.stageResults['item_mechanics'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'item',
    stage: 'lore',
    payload: {
      concept: {
        name: concept.name,
        item_type: concept.item_type,
        rarity: concept.rarity,
        description: concept.description,
      },
      mechanics_summary: {
        has_charges: !!mechanics.charges,
        has_spells: Array.isArray(mechanics.spells) && mechanics.spells.length > 0,
        property_count: Array.isArray(mechanics.properties) ? mechanics.properties.length : 0,
      },
      instructions: 'Create rich history, flavor, and campaign hooks for this item. Add curse/sentience ONLY if thematically appropriate.',
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for item lore and history.',
  });
}
