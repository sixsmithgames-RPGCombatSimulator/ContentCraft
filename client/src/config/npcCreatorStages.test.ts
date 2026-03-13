import { describe, expect, it } from 'vitest';
import {
  NPC_CREATOR_BASIC_INFO,
  NPC_CREATOR_EQUIPMENT,
} from './npcCreatorStages';

describe('npc creator stage prompts', () => {
  it('builds basic info prompts with planner canon references through shared scaffolding', () => {
    const prompt = NPC_CREATOR_BASIC_INFO.buildUserPrompt({
      config: {
        prompt: 'Create Barley the halfling warlock.',
        type: 'npc',
        flags: {},
      },
      stageResults: {
        planner: {
          deliverable: 'npc',
          proposals: [],
        },
        purpose: {
          goal: 'Create a memorable ally.',
        },
      },
      factpack: {
        facts: [{ text: 'Halflings of the Moonshae Isles love hearth culture.', source: 'canon' }],
      },
      previousDecisions: {
        oath: 'none',
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.original_user_request).toBe('Create Barley the halfling warlock.');
    expect(parsed.brief).toEqual({
      deliverable: 'npc',
    });
    expect(parsed.purpose).toEqual({
      goal: 'Create a memorable ally.',
    });
    expect(parsed.canon_reference).toContain('Planner stage');
    expect(parsed.previous_decisions).toEqual({
      oath: 'none',
    });
    expect(parsed.relevant_canon).toBeUndefined();
  });

  it('builds equipment prompts with structured canon facts when planner is absent', () => {
    const prompt = NPC_CREATOR_EQUIPMENT.buildUserPrompt({
      config: {
        prompt: 'Create Barley the halfling warlock.',
        type: 'npc',
        flags: {},
      },
      stageResults: {
        'creator:_basic_info': {
          name: 'Barley',
          species: 'Halfling',
          class_levels: [{ class: 'Warlock', level: 11 }],
          background: 'Chef',
        },
        'creator:_stats': {
          proficiency_bonus: 4,
          armor_class: 15,
        },
        'creator:_character_build': {
          skill_proficiencies: [{ name: 'Persuasion', value: '+8' }],
          fighting_styles: [],
        },
      },
      factpack: {
        facts: [{ text: 'Rods of the Pact Keeper are prized by pact-bound warlocks.', source: 'canon' }],
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.name).toBe('Barley');
    expect(parsed.species).toBe('Halfling');
    expect(parsed.proficiency_bonus).toBe(4);
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'Rods of the Pact Keeper are prized by pact-bound warlocks.', source: 'canon' }],
    });
  });
});
