import { describe, expect, it } from 'vitest';
import {
  LOCATION_CREATOR_ACCURACY_REFINEMENT,
  LOCATION_CREATOR_PURPOSE,
  LOCATION_CREATOR_SPACES,
  LOCATION_CREATOR_VISUAL_MAP,
} from './locationCreatorStages';

describe('LOCATION_CREATOR_SPACES.buildUserPrompt', () => {
  it('includes summarized spatial context with derived wall metadata and connection gaps', () => {
    const prompt = LOCATION_CREATOR_SPACES.buildUserPrompt({
      config: {
        prompt: 'Create a treasure vault complex.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          name: 'Vault of Echoes',
          location_type: 'vault',
          scale: 'moderate',
        },
        foundation: {
          layout: 'branching',
          key_areas: ['entry', 'vault'],
        },
        spaces: {
          spaces: [
            {
              name: 'Entry Hall',
              purpose: 'Reception and checkpoint',
              size_ft: { width: 20, height: 20 },
              wall_thickness_ft: 10,
              doors: [
                { wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Inner Vault' },
                { wall: 'south', position_on_wall_ft: 8, width_ft: 4, leads_to: 'Pending' },
              ],
            },
            {
              name: 'Inner Vault',
              purpose: 'Treasure storage',
              size_ft: { width: 15, height: 15 },
              walls: [
                { side: 'north', thickness: 12, material: 'stone' },
                { side: 'south', thickness: 12, material: 'stone' },
              ],
              doors: [
                { wall: 'west', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Entry Hall' },
              ],
            },
          ],
        },
      },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 3,
        totalChunks: 4,
        chunkLabel: 'Space 3/4',
      },
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    const spatialContext = parsed.spatial_context as Record<string, unknown>;
    const recentSpaces = parsed.recent_spaces as Array<Record<string, unknown>>;
    const connectionGaps = spatialContext.connection_gaps as Array<Record<string, unknown>>;

    expect(spatialContext.generated_space_names).toEqual(['Entry Hall', 'Inner Vault']);
    expect(spatialContext.dominant_wall_thickness_ft).toBe(10);
    expect(recentSpaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Inner Vault',
          wall_thickness_ft: 12,
          wall_material: 'stone',
        }),
      ]),
    );
    expect(connectionGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from_space: 'Entry Hall',
          issue: 'pending_target',
        }),
      ]),
    );
    expect(parsed.instructions).toContain('spatial_context.generated_space_names');
    expect(parsed.instructions).toContain('connection_gaps');
  });

  it('keeps first-room prompts simple when no spaces have been accepted yet', () => {
    const prompt = LOCATION_CREATOR_SPACES.buildUserPrompt({
      config: {
        prompt: 'Create a ruined chapel.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          name: 'Chapel of Ash',
          location_type: 'chapel',
          scale: 'simple',
        },
        foundation: {
          layout: 'linear',
          key_areas: ['sanctuary'],
        },
      },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 1,
        totalChunks: 1,
        chunkLabel: 'Space 1/1',
      },
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.recent_spaces).toEqual([]);
    expect(parsed.spatial_context).toBeUndefined();
    expect(parsed.instructions).not.toContain('spatial_context.generated_space_names');
  });

  it('includes structured rejection context for regenerated spaces', () => {
    const prompt = LOCATION_CREATOR_SPACES.buildUserPrompt({
      config: {
        prompt: 'Create a treasure vault complex.',
        type: 'location',
        flags: {
          rejection_feedback: 'IMPORTANT: The previous space "Vault" was rejected.',
          rejection_context: {
            rejected_space: { name: 'Vault' },
            retry_focus: ['doors', 'wall_thickness'],
          },
        },
      },
      stageResults: {
        purpose: {
          name: 'Vault of Echoes',
          location_type: 'vault',
          scale: 'moderate',
        },
        foundation: {
          layout: 'branching',
          key_areas: ['entry', 'vault'],
        },
      },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 4,
        chunkLabel: 'Space 2/4',
      },
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.rejection_context).toEqual({
      rejected_space: { name: 'Vault' },
      retry_focus: ['doors', 'wall_thickness'],
    });
    expect(parsed.instructions).toContain('rejection_context object');
    expect(parsed.instructions).toContain('retry_focus');
  });
});

describe('location creator shared prompt scaffolding', () => {
  it('builds purpose prompts through the shared workflow prompt helper', () => {
    const prompt = LOCATION_CREATOR_PURPOSE.buildUserPrompt({
      config: {
        prompt: 'Create a fortified bridge outpost.',
        type: 'location',
        flags: {},
      },
      stageResults: {},
      factpack: {
        facts: [{ text: 'The bridge spans a cursed ravine.', source: 'canon' }],
      },
      previousDecisions: {
        region: 'The Ash Marches',
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.request).toBe('Create a fortified bridge outpost.');
    expect(parsed.deliverable).toBe('location');
    expect(parsed.stage).toBe('purpose');
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'The bridge spans a cursed ravine.', source: 'canon' }],
    });
    expect(parsed.previous_decisions).toEqual({
      region: 'The Ash Marches',
    });
  });

  it('builds accuracy refinement prompts with full location context and structured canon facts', () => {
    const prompt = LOCATION_CREATOR_ACCURACY_REFINEMENT.buildUserPrompt({
      config: {
        prompt: 'Refine the harbor keep layout.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: { location_type: 'keep' },
        foundation: { layout: { dimensions: { length: '80 ft', width: '60 ft' } } },
        spaces: { spaces: [{ id: 's1', name: 'Gate Hall' }] },
        details: { atmosphere: 'Salt and steel.' },
      },
      factpack: {
        facts: [{ text: 'The harbor keep is staffed by tidewardens.', source: 'canon' }],
      },
    } as any);

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    expect(parsed.stage).toBe('accuracy_refinement');
    expect(parsed.complete_location).toEqual({
      purpose: { location_type: 'keep' },
      foundation: { layout: { dimensions: { length: '80 ft', width: '60 ft' } } },
      spaces: { spaces: [{ id: 's1', name: 'Gate Hall' }] },
      details: { atmosphere: 'Salt and steel.' },
    });
    expect(parsed.relevant_canon).toEqual({
      facts: [{ text: 'The harbor keep is staffed by tidewardens.', source: 'canon' }],
    });
  });

  it('builds the visual map prompt from actual generated space summaries', () => {
    const prompt = LOCATION_CREATOR_VISUAL_MAP.buildUserPrompt({
      config: {
        prompt: 'Create the map for the harbor keep.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          name: 'Harbor Keep',
          location_type: 'keep',
          scale: 'moderate',
        },
        spaces: {
          spaces: [
            {
              name: 'Gate Hall',
              purpose: 'Inspection checkpoint',
              size_ft: { width: 30, height: 20 },
              wall_thickness_ft: 5,
              wall_material: 'stone',
              doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Armory' }],
            },
          ],
        },
      },
      factpack: null,
    } as any);

    expect(prompt).toContain('SPACES');
    expect(prompt).toContain('Gate Hall [room]');
    expect(prompt).toContain('CONNECTIONS');
    expect(prompt).toContain('Gate Hall: east door at 10 ft -> Armory');
  });
});
