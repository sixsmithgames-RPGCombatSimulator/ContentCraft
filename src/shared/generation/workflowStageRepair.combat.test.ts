import { describe, expect, it } from 'vitest';
import { repairWorkflowStagePayload } from './workflowStageRepair';
import { validateWorkflowStageContractPayload } from './workflowStageValidation';

describe('workflowStageRepair combat normalization', () => {
  it('normalizes combat arrays and preserves provenance metadata', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'combat',
      workflowType: 'npc',
      payload: {
        actions: ['Multiattack'],
        bonus_actions: [
          {
            title: 'Cunning Action',
            text: 'Dash, Disengage, or Hide as a bonus action.',
            activation_type: 'bonus_action',
            sourceSection: 'stat_block',
            origin: 'import',
            knowledgeSource: 'canon',
          },
        ],
        reactions: [
          {
            name: 'Parry',
            details: 'Add 2 to AC against one melee attack that would hit.',
            stat_line: '1/round',
            notes: 'Melee only',
          },
        ],
      },
    });

    expect(repaired.appliedRepairs).toContain('combat:normalize');
    expect(repaired.payload).toMatchObject({
      actions: [
        {
          name: 'Multiattack',
          description: 'Multiattack',
          activationType: 'action',
          sourceSection: 'creator:_combat',
          origin: 'npc_combat_stage',
          knowledgeSource: 'ai_generated',
        },
      ],
      bonus_actions: [
        {
          name: 'Cunning Action',
          description: 'Dash, Disengage, or Hide as a bonus action.',
          activationType: 'bonus_action',
          sourceSection: 'stat_block',
          origin: 'import',
          knowledgeSource: 'canon',
        },
      ],
      reactions: [
        {
          name: 'Parry',
          description: 'Add 2 to AC against one melee attack that would hit.',
          statLine: '1/round',
          notes: 'Melee only',
          activationType: 'reaction',
          sourceSection: 'creator:_combat',
          origin: 'npc_combat_stage',
          knowledgeSource: 'ai_generated',
        },
      ],
    });
    expect(validateWorkflowStageContractPayload('combat', repaired.payload, 'npc')).toEqual({ ok: true });
  });
});
