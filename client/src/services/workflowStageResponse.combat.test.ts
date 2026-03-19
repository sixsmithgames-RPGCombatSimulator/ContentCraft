import { describe, expect, it } from 'vitest';
import { parseAndNormalizeWorkflowStageResponse } from './workflowStageResponse';

describe('workflowStageResponse combat normalization', () => {
  it('adds a provenance-tagged default attack when combat responses omit actions', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({}),
      stageName: 'Creator: Combat',
      stageIdentity: 'combat',
      workflowType: 'npc',
      stageResults: {
        'creator:_stats': {
          ability_scores: { str: 18, dex: 14 },
          proficiency_bonus: 4,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.actions).toEqual([
      expect.objectContaining({
        name: 'Weapon Attack',
        activationType: 'action',
        sourceSection: 'creator:_combat',
        origin: 'workflow_stage_response',
        knowledgeSource: 'derived',
        statLine: '+8 to hit',
      }),
    ]);
    expect(result.parsed.bonus_actions).toEqual([]);
    expect(result.parsed.reactions).toEqual([]);
    expect(result.parsed.resolved_mechanics).toMatchObject({
      has_combat_actions: true,
      has_bonus_actions: false,
      has_reactions: false,
    });
  });

  it('preserves provided combat provenance while normalizing action shapes', () => {
    const result = parseAndNormalizeWorkflowStageResponse({
      aiResponse: JSON.stringify({
        actions: [
          {
            title: 'Shadow Blade',
            text: 'Melee spell attack that deals psychic damage.',
            activation_type: 'action',
            sourceSection: 'stat_block',
            origin: 'import',
            knowledgeSource: 'canon',
          },
        ],
      }),
      stageName: 'Creator: Combat',
      stageIdentity: 'combat',
      workflowType: 'npc',
      stageResults: {
        'creator:_stats': {
          ability_scores: { str: 12, dex: 18 },
          proficiency_bonus: 4,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.actions).toEqual([
      expect.objectContaining({
        name: 'Shadow Blade',
        description: 'Melee spell attack that deals psychic damage.',
        activationType: 'action',
        sourceSection: 'stat_block',
        origin: 'import',
        knowledgeSource: 'canon',
      }),
    ]);
    expect(result.parsed.bonus_actions).toEqual([]);
    expect(result.parsed.reactions).toEqual([]);
  });
});
