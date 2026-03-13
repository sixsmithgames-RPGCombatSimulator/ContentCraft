import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from './stagePromptShared';
import {
  buildStoryArcCharactersPrompt,
  buildStoryArcPremisePrompt,
  buildStoryArcSecretsPrompt,
  buildStoryArcStructurePrompt,
} from './storyArcStagePrompt';

function createContext(
  overrides: Partial<GeneratorStagePromptContext> = {},
): GeneratorStagePromptContext {
  return {
    config: {
      prompt: 'Create a rebellion against a drowned tyrant.',
      type: 'story_arc',
      flags: {},
      ...overrides.config,
    },
    stageResults: {
      ...(overrides.stageResults || {}),
    },
    factpack: overrides.factpack ?? null,
    chunkInfo: overrides.chunkInfo,
    previousDecisions: overrides.previousDecisions,
    unansweredProposals: overrides.unansweredProposals,
    npcSectionContext: overrides.npcSectionContext,
  };
}

describe('buildStoryArcPremisePrompt', () => {
  it('builds premise prompts through the shared workflow helper', () => {
    const prompt = buildStoryArcPremisePrompt(createContext({
      config: {
        prompt: 'Create a rebellion against a drowned tyrant.',
        type: 'story_arc',
        flags: { tone: 'grim' },
      },
      factpack: {
        facts: [{ text: 'The drowned tyrant rules from a sunken palace.', source: 'canon' }],
      },
    }));

    expect(JSON.parse(prompt)).toEqual({
      original_user_request: 'Create a rebellion against a drowned tyrant.',
      deliverable: 'story_arc',
      stage: 'premise',
      flags: { tone: 'grim' },
      relevant_canon: {
        facts: [{ text: 'The drowned tyrant rules from a sunken palace.', source: 'canon' }],
      },
    });
  });
});

describe('buildStoryArcStructurePrompt', () => {
  it('builds structure prompts from the stripped premise stage', () => {
    const prompt = buildStoryArcStructurePrompt(createContext({
      stageResults: {
        story_arc_premise: {
          title: 'The Tides of Revolt',
          estimated_sessions: 8,
          sources_used: ['canon-1'],
        },
        planner: {
          deliverable: 'story_arc',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('structure');
    expect(parsed.premise).toEqual({
      title: 'The Tides of Revolt',
      estimated_sessions: 8,
    });
    expect(parsed.instructions).toBe('Design the dramatic structure for "The Tides of Revolt". Create content for approximately 8 sessions.');
    expect(parsed.canon_reference).toContain('story structure and events');
  });
});

describe('buildStoryArcCharactersPrompt', () => {
  it('builds character prompts with explicit premise and structure summaries', () => {
    const prompt = buildStoryArcCharactersPrompt(createContext({
      stageResults: {
        story_arc_premise: {
          title: 'The Tides of Revolt',
          theme: 'rebellion',
          setting: 'The Sunken Coast',
          overarching_goal: 'Overthrow the drowned tyrant',
        },
        story_arc_structure: {
          acts: [{ name: 'Act 1: Embers' }, { name: 'Act 2: Breakers' }],
        },
        planner: {
          deliverable: 'story_arc',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('characters');
    expect(parsed.premise).toEqual({
      title: 'The Tides of Revolt',
      theme: 'rebellion',
      setting: 'The Sunken Coast',
      overarching_goal: 'Overthrow the drowned tyrant',
    });
    expect(parsed.structure_summary).toEqual({
      act_count: 2,
      acts: ['Act 1: Embers', 'Act 2: Breakers'],
    });
    expect(parsed.canon_reference).toContain('existing NPCs and factions');
  });
});

describe('buildStoryArcSecretsPrompt', () => {
  it('builds secrets prompts with explicit character and barrier summaries', () => {
    const prompt = buildStoryArcSecretsPrompt(createContext({
      stageResults: {
        story_arc_premise: {
          title: 'The Tides of Revolt',
          theme: 'rebellion',
        },
        story_arc_structure: {
          known_barriers: ['Harbor chains', 'Secret police'],
          unknown_barriers: ['The prince serves the tyrant'],
        },
        story_arc_characters: {
          characters: [
            { name: 'Mira Voss', role: 'ally' },
            { name: 'Admiral Thane', role: 'antagonist' },
          ],
        },
        planner: {
          deliverable: 'story_arc',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('secrets');
    expect(parsed.barrier_count).toEqual({
      known: 2,
      unknown: 1,
    });
    expect(parsed.characters_summary).toEqual([
      'Mira Voss (ally)',
      'Admiral Thane (antagonist)',
    ]);
    expect(parsed.canon_reference).toContain('secrets and lore');
  });
});
