import { describe, expect, it } from 'vitest';
import { assembleFinalWorkflowContent } from './workflowContentAssembler';

describe('workflowContentAssembler npc combat emission', () => {
  it('emits structured npc action economy arrays with preserved provenance metadata', () => {
    const result = assembleFinalWorkflowContent('npc', {
      'creator:_basic_info': {
        name: 'Barley',
        species: 'Halfling',
      },
      'creator:_combat': {
        actions: [
          {
            name: 'Booming Pan',
            description: 'Melee Weapon Attack with a rune-etched frying pan.',
            statLine: '+8 to hit',
            activationType: 'action',
            sourceSection: 'creator:_combat',
            origin: 'npc_combat_stage',
            knowledgeSource: 'ai_generated',
          },
        ],
        reactions: [
          {
            name: 'Lid Parry',
            description: 'Add 2 to AC against one attack that would hit.',
            activationType: 'reaction',
            sourceSection: 'creator:_combat',
            origin: 'npc_combat_stage',
            knowledgeSource: 'ai_generated',
          },
        ],
      },
    });

    expect(result.content.actions).toEqual([
      {
        name: 'Booming Pan',
        description: 'Melee Weapon Attack with a rune-etched frying pan.',
        statLine: '+8 to hit',
        activationType: 'action',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      },
    ]);
    expect(result.content.bonus_actions).toEqual([]);
    expect(result.content.reactions).toEqual([
      {
        name: 'Lid Parry',
        description: 'Add 2 to AC against one attack that would hit.',
        activationType: 'reaction',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      },
    ]);
  });

  it('derives npc hit_dice and flat equipment fallbacks from structured stage output', () => {
    const result = assembleFinalWorkflowContent('npc', {
      'creator:_basic_info': {
        name: 'Nasir',
        species: 'Drow',
      },
      'creator:_stats': {
        size: 'Medium',
        ability_scores: { str: 10, dex: 18, con: 14, int: 16, wis: 12, cha: 14 },
        proficiency_bonus: 4,
        speed: { walk: '30 ft.' },
        armor_class: 17,
        hit_points: { average: 82, formula: '13d8 + 26' },
        senses: ['darkvision 120 ft.'],
      },
      'creator:_equipment': {
        weapons: [{ name: 'Repeating Hand Crossbow' }],
        wondrous_items: [{ name: 'Cloak of Displacement' }],
        other_gear: [{ name: 'Thieves\' Tools' }],
      },
    });

    expect(result.content.hit_dice).toBe('13d8');
    expect(result.content.equipment).toEqual([
      'Repeating Hand Crossbow',
      'Cloak of Displacement',
      'Thieves\' Tools',
    ]);
    expect(result.content.magic_items).toEqual(['Cloak of Displacement']);
  });
});
