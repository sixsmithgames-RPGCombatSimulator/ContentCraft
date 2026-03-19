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
});
