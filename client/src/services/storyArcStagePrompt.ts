import {
  buildWorkflowStagePrompt,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';

function summarizeActNames(structure: Record<string, unknown>): string[] {
  return Array.isArray(structure.acts)
    ? (structure.acts as Array<{ name?: string }>).map((act) => act.name || 'Unnamed Act')
    : [];
}

function summarizeCharacterNames(characters: Record<string, unknown>): string[] {
  return Array.isArray(characters.characters)
    ? (characters.characters as Array<{ name?: string; role?: string }>).map((character) => `${character.name || '?'} (${character.role || '?'})`)
    : [];
}

export function buildStoryArcPremisePrompt(context: StageContext): string {
  return buildWorkflowStagePrompt({
    context,
    deliverable: 'story_arc',
    stage: 'premise',
    includeFlags: true,
  });
}

export function buildStoryArcStructurePrompt(context: StageContext): string {
  const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'story_arc',
    stage: 'structure',
    payload: {
      premise,
      instructions: `Design the dramatic structure for "${premise.title || 'this story arc'}". Create ${premise.estimated_sessions ? `content for approximately ${premise.estimated_sessions} sessions` : 'a multi-session arc'}.`,
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for story structure and events.',
  });
}

export function buildStoryArcCharactersPrompt(context: StageContext): string {
  const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});
  const structure = stripStageOutput(context.stageResults['story_arc_structure'] || {});
  const actNames = summarizeActNames(structure);

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'story_arc',
    stage: 'characters',
    payload: {
      premise: {
        title: premise.title,
        theme: premise.theme,
        setting: premise.setting,
        overarching_goal: premise.overarching_goal,
      },
      structure_summary: {
        act_count: actNames.length,
        acts: actNames,
      },
      instructions: 'Create the key NPCs and factions for this story arc. Every character should serve a narrative purpose.',
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for existing NPCs and factions.',
  });
}

export function buildStoryArcSecretsPrompt(context: StageContext): string {
  const premise = stripStageOutput(context.stageResults['story_arc_premise'] || {});
  const structure = stripStageOutput(context.stageResults['story_arc_structure'] || {});
  const characters = stripStageOutput(context.stageResults['story_arc_characters'] || {});
  const characterNames = summarizeCharacterNames(characters);

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'story_arc',
    stage: 'secrets',
    payload: {
      premise: {
        title: premise.title,
        theme: premise.theme,
      },
      barrier_count: {
        known: Array.isArray(structure.known_barriers) ? structure.known_barriers.length : 0,
        unknown: Array.isArray(structure.unknown_barriers) ? structure.unknown_barriers.length : 0,
      },
      characters_summary: characterNames,
      instructions: 'Create secrets, rewards, and DM notes that tie everything together and create layers of depth.',
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for secrets and lore.',
  });
}
