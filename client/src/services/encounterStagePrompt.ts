import {
  buildWorkflowStagePrompt,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';

export function buildEncounterConceptPrompt(context: StageContext): string {
  return buildWorkflowStagePrompt({
    context,
    deliverable: 'encounter',
    stage: 'concept',
    includeFlags: true,
  });
}

export function buildEncounterEnemiesPrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'encounter',
    stage: 'enemies',
    payload: {
      concept,
      instructions: `Select enemies for this encounter. XP budget: ${concept.xp_budget || 'see concept'}. Difficulty: ${concept.difficulty_tier || 'medium'}.`,
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for monster/NPC details.',
  });
}

export function buildEncounterTerrainPrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
  const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'encounter',
    stage: 'terrain',
    payload: {
      concept: {
        location: concept.location,
        description: concept.description,
        setting_context: concept.setting_context,
      },
      enemies_summary: {
        monster_count: Array.isArray(enemies.monsters) ? enemies.monsters.length : 0,
        has_ranged: 'Check enemy key_abilities for ranged attacks',
        has_flyers: 'Check enemy speed for fly speeds',
      },
      instructions: 'Design terrain that creates interesting tactical decisions. Terrain should interact with enemy abilities.',
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for location details.',
  });
}

export function buildEncounterTacticsPrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
  const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});
  const terrain = stripStageOutput(context.stageResults['encounter_terrain'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'encounter',
    stage: 'tactics',
    payload: {
      concept: {
        difficulty_tier: concept.difficulty_tier,
        objectives: concept.objectives,
        expected_duration_rounds: concept.expected_duration_rounds,
      },
      enemies,
      terrain,
      instructions: 'Design enemy tactics and an event clock that makes this encounter dynamic and escalating.',
    },
  });
}

export function buildEncounterRewardsPrompt(context: StageContext): string {
  const concept = stripStageOutput(context.stageResults['encounter_concept'] || {});
  const enemies = stripStageOutput(context.stageResults['encounter_enemies'] || {});

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'encounter',
    stage: 'rewards',
    payload: {
      concept: {
        difficulty_tier: concept.difficulty_tier,
        party_level: concept.party_level,
        party_size: concept.party_size,
        objectives: concept.objectives,
      },
      enemies_summary: {
        monster_count: Array.isArray(enemies.monsters) ? enemies.monsters.length : 0,
        total_xp: concept.xp_budget,
      },
      instructions: 'Design rewards, consequences, and scaling guidance appropriate for the encounter difficulty and party level.',
    },
    plannerReferenceMessage: '⚠️ Canon facts were provided in the Planner stage. Review them for treasure and story context.',
  });
}
