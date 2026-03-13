import { describe, expect, it } from 'vitest';
import type { GeneratorStagePromptContext } from '../services/stagePromptShared';
import {
  STORY_ARC_CREATOR_CHARACTERS,
  STORY_ARC_CREATOR_PREMISE,
  STORY_ARC_CREATOR_SECRETS,
  STORY_ARC_CREATOR_STRUCTURE,
} from './storyArcCreatorStages';

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

describe('story arc creator stage contracts', () => {
  it('preserves the premise stage identity and shared prompt shape', () => {
    const prompt = STORY_ARC_CREATOR_PREMISE.buildUserPrompt(createContext({
      config: {
        prompt: 'Create a rebellion against a drowned tyrant.',
        type: 'story_arc',
        flags: { tone: 'grim' },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(STORY_ARC_CREATOR_PREMISE.routerKey).toBe('premise');
    expect(parsed.deliverable).toBe('story_arc');
    expect(parsed.stage).toBe('premise');
    expect(parsed.flags).toEqual({ tone: 'grim' });
  });

  it('preserves the structure stage identity and premise payload', () => {
    const prompt = STORY_ARC_CREATOR_STRUCTURE.buildUserPrompt(createContext({
      stageResults: {
        story_arc_premise: {
          title: 'The Tides of Revolt',
          estimated_sessions: 8,
        },
        planner: {
          deliverable: 'story_arc',
        },
      },
    }));

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(STORY_ARC_CREATOR_STRUCTURE.routerKey).toBe('structure');
    expect(parsed.stage).toBe('structure');
    expect(parsed.premise).toEqual({
      title: 'The Tides of Revolt',
      estimated_sessions: 8,
    });
  });

  it('preserves the characters stage identity and structure summary payload', () => {
    const prompt = STORY_ARC_CREATOR_CHARACTERS.buildUserPrompt(createContext({
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

    expect(STORY_ARC_CREATOR_CHARACTERS.routerKey).toBe('characters');
    expect(parsed.structure_summary).toEqual({
      act_count: 2,
      acts: ['Act 1: Embers', 'Act 2: Breakers'],
    });
  });

  it('preserves the secrets stage identity and summary payload', () => {
    const prompt = STORY_ARC_CREATOR_SECRETS.buildUserPrompt(createContext({
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

    expect(STORY_ARC_CREATOR_SECRETS.routerKey).toBe('secrets');
    expect(parsed.barrier_count).toEqual({
      known: 2,
      unknown: 1,
    });
    expect(parsed.characters_summary).toEqual([
      'Mira Voss (ally)',
      'Admiral Thane (antagonist)',
    ]);
  });
});
