import {
  buildWorkflowStagePrompt,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';

export function buildMonsterBasicInfoPrompt(context: StageContext): string {
  return buildWorkflowStagePrompt({
    context,
    deliverable: 'monster',
    stage: 'basic_info',
    payload: {
      instructions: 'Generate the basic information for this monster. Include name, description, size, creature type, alignment, and challenge rating.',
    },
    promptKey: 'request',
  });
}

export function buildMonsterStatsPrompt(context: StageContext): string {
  const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'monster',
    stage: 'stats',
    payload: {
      basic_info: basicInfo,
      instructions: `Generate stats and defenses for this monster. Ensure values are appropriate for CR ${basicInfo.challenge_rating || 'unknown'}.`,
    },
    promptKey: 'request',
  });
}

export function buildMonsterCombatPrompt(context: StageContext): string {
  const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});
  const stats = stripStageOutput(context.stageResults.monster_stats || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'monster',
    stage: 'combat',
    payload: {
      basic_info: basicInfo,
      stats,
      instructions: `Generate combat abilities and actions for this monster. Make it interesting and mechanically appropriate for CR ${basicInfo.challenge_rating || 'unknown'}.`,
    },
    promptKey: 'request',
  });
}

export function buildMonsterLegendaryPrompt(context: StageContext): string {
  const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'monster',
    stage: 'legendary',
    payload: {
      basic_info: basicInfo,
      instructions: `If appropriate for CR ${basicInfo.challenge_rating || 'unknown'}, generate legendary actions and/or lair features. Otherwise return an empty object.`,
    },
    promptKey: 'request',
  });
}

export function buildMonsterLorePrompt(context: StageContext): string {
  const basicInfo = stripStageOutput(context.stageResults.monster_basic_info || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'monster',
    stage: 'lore',
    payload: {
      basic_info: basicInfo,
      stats_summary: {
        cr: basicInfo.challenge_rating,
        type: basicInfo.creature_type,
        has_legendary: !!(context.stageResults.monster_legendary && Object.keys(context.stageResults.monster_legendary).length > 0),
      },
      instructions: 'Generate ecology and lore information for this monster. Provide context that helps GMs use it effectively.',
    },
    promptKey: 'request',
  });
}
