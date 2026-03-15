import { describe, expect, it } from 'vitest';
import { repairWorkflowStagePayload } from './workflowStageRepair';
import { validateWorkflowStageContractPayload } from './workflowStageValidation';

describe('workflowStageRepair', () => {
  it('repairs malformed planner payloads into contract-compliant shape', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'planner',
      workflowType: 'npc',
      payload: {
        deliverable: 'npc',
        retrieval_hints: 'Tiefling rogue assassin',
        proposals: { id: 'origin', question: 'Choose an origin?' },
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      },
    });

    expect(repaired.contractKey).toBe('planner');
    expect(repaired.payload).toMatchObject({
      deliverable: 'npc',
      retrieval_hints: {
        entities: [],
        regions: [],
        eras: [],
        keywords: ['Tiefling rogue assassin'],
      },
      proposals: [{ id: 'origin', question: 'Choose an origin?' }],
      flags_echo: {
        allow_invention: 'cosmetic',
        tone: 'epic',
        rule_base: '2024RAW',
      },
    });

    expect(validateWorkflowStageContractPayload('planner', repaired.payload, 'npc')).toEqual({ ok: true });
  });

  it('infers npc species and race for basic info responses from user prompt context', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'basic_info',
      workflowType: 'npc',
      payload: {
        name: 'Thyra Odinson',
        description: 'A stern celestial knight sworn to defend sacred frontiers.',
        appearance: 'Moonlit armor and an unflinching gaze mark her presence.',
        background: 'She patrols the Tears of Selune in service to her oath.',
        alignment: 'Lawful Good',
        class_levels: [{ class: 'Paladin', level: 11 }],
      },
      configPrompt: 'Create an 11th level aasismar paladin named Thyra Odinson.',
    });

    expect(repaired.payload.species).toBe('Aasimar');
    expect(repaired.payload.race).toBe('Aasimar');
  });

  it('normalizes stats speed values into schema-safe strings', () => {
    const repaired = repairWorkflowStagePayload({
      stageIdOrName: 'stats',
      workflowType: 'npc',
      payload: {
        ability_scores: { str: 10, dex: 18, con: 12, int: 13, wis: 11, cha: 14 },
        proficiency_bonus: 3,
        speed: { walk: 30, climb: '20 ft.' },
        armor_class: 15,
        hit_points: 38,
        senses: [],
      },
    });

    expect(repaired.payload.speed).toEqual({
      walk: '30 ft.',
      climb: '20 ft.',
    });
    expect(validateWorkflowStageContractPayload('stats', repaired.payload, 'npc')).toEqual({ ok: true });
  });
});
