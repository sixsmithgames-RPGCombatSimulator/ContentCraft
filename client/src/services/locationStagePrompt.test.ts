import { describe, expect, it } from 'vitest';
import {
  buildLocationAccuracyRefinementPrompt,
  buildLocationDetailsPrompt,
  buildLocationFoundationPrompt,
  buildLocationSpacesChunkPlan,
  buildLocationSpacesPrompt,
  buildLocationSpacesPromptBase,
  buildLocationVisualMapPrompt,
} from './locationStagePrompt';

describe('buildLocationFoundationPrompt', () => {
  it('includes template-derived constraints and style guidance through the shared builder', () => {
    const prompt = buildLocationFoundationPrompt({
      config: {
        prompt: 'Create a castle keep with barracks and an armory.',
        type: 'location',
        flags: {
          template_id: 'medieval_castle',
        },
      },
      stageResults: {
        purpose: {
          name: 'Stormwatch Keep',
          location_type: 'keep',
          scale: 'complex',
        },
      },
      factpack: null,
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('foundation');
    expect(parsed.purpose).toEqual({
      name: 'Stormwatch Keep',
      location_type: 'keep',
      scale: 'complex',
    });
    expect(parsed.instructions).toContain('ARCHITECTURAL CONSTRAINTS');
    expect(parsed.instructions).toContain('Door style: iron');
    expect(parsed.instructions).toContain('LAYOUT PHILOSOPHY');
  });
});

describe('buildLocationSpacesChunkPlan', () => {
  it('derives iterative chunk counts from string estimated space metadata', () => {
    expect(buildLocationSpacesChunkPlan({
      config: {
        prompt: 'Create a vault.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          estimated_spaces: '7',
        },
      },
      factpack: null,
    })).toEqual({
      shouldChunk: true,
      totalChunks: 7,
      chunkSize: 1,
    });
  });

  it('falls back to scale defaults when estimated spaces are absent', () => {
    expect(buildLocationSpacesChunkPlan({
      config: {
        prompt: 'Create a city ward.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          scale: 'massive',
        },
      },
      factpack: null,
    })).toEqual({
      shouldChunk: true,
      totalChunks: 50,
      chunkSize: 1,
    });
  });
});

describe('buildLocationSpacesPromptBase', () => {
  it('summarizes prior spaces with normalized wall metadata and connection gaps', () => {
    const result = buildLocationSpacesPromptBase({
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

    const spatialContext = result.spatialContext as Record<string, unknown>;
    const recentSpaces = result.userPrompt.recent_spaces as Array<Record<string, unknown>>;
    const connectionGaps = spatialContext.connection_gaps as Array<Record<string, unknown>>;

    expect(result.scale).toBe('moderate');
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
  });
});

describe('buildLocationSpacesPrompt', () => {
  it('adds strict-mode and template guidance through the shared spaces prompt builder', () => {
    const prompt = buildLocationSpacesPrompt({
      config: {
        prompt: 'Create exactly three castle rooms: gate hall, barracks, armory.',
        type: 'location',
        flags: {
          strict_room_adherence: true,
          template_id: 'medieval_castle',
        },
      },
      stageResults: {
        purpose: {
          name: 'Stormwatch Keep',
          location_type: 'keep',
          scale: 'complex',
        },
        foundation: {
          layout: 'branching',
          key_areas: ['gate hall', 'barracks', 'armory'],
        },
      },
      factpack: null,
      chunkInfo: {
        isChunked: true,
        currentChunk: 2,
        totalChunks: 3,
        chunkLabel: 'Space 2/3',
      },
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.chunk_info).toBe('Space 2/3');
    expect(parsed.instructions).toContain('STRICT MODE ENABLED');
    expect(parsed.instructions).toContain('ROOM TYPE GUIDANCE');
    expect(parsed.instructions).toContain('CONSTRAINT REMINDERS');
  });
});

describe('buildLocationDetailsPrompt', () => {
  it('builds a compact structure summary for the details stage', () => {
    const prompt = buildLocationDetailsPrompt({
      config: {
        prompt: 'Add details to the keep.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          name: 'Stormwatch Keep',
          location_type: 'keep',
          scale: 'moderate',
        },
        foundation: {
          layout: 'linear',
        },
        spaces: {
          spaces: [
            { id: 's1', name: 'Gate Hall', purpose: 'Checkpoint', dimensions: { width: 30, height: 20, unit: 'ft' } },
            { id: 's2', name: 'Barracks', purpose: 'Sleeping quarters', dimensions: { width: 24, height: 18, unit: 'ft' } },
          ],
        },
      },
      factpack: null,
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    const structure = parsed.structure as Record<string, unknown>;

    expect(parsed.stage).toBe('details');
    expect(structure.total_spaces).toBe(2);
    expect(structure.space_list).toEqual([
      {
        id: 's1',
        name: 'Gate Hall',
        purpose: 'Checkpoint',
        dimensions: { width: 30, height: 20, unit: 'ft' },
      },
      {
        id: 's2',
        name: 'Barracks',
        purpose: 'Sleeping quarters',
        dimensions: { width: 24, height: 18, unit: 'ft' },
      },
    ]);
  });
});

describe('buildLocationAccuracyRefinementPrompt', () => {
  it('builds full-location validation prompts with footprint and space counts', () => {
    const prompt = buildLocationAccuracyRefinementPrompt({
      config: {
        prompt: 'Refine the keep layout.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          location_type: 'keep',
        },
        foundation: {
          layout: {
            dimensions: {
              length: '80 ft',
              width: '60 ft',
            },
          },
        },
        spaces: {
          spaces: [
            { id: 's1', name: 'Gate Hall' },
            { id: 's2', name: 'Barracks' },
          ],
        },
        details: {
          atmosphere: 'Salt and steel.',
        },
      },
      factpack: null,
    });

    const parsed = JSON.parse(prompt) as Record<string, unknown>;

    expect(parsed.stage).toBe('accuracy_refinement');
    expect(parsed.complete_location).toEqual({
      purpose: { location_type: 'keep' },
      foundation: { layout: { dimensions: { length: '80 ft', width: '60 ft' } } },
      spaces: { spaces: [{ id: 's1', name: 'Gate Hall' }, { id: 's2', name: 'Barracks' }] },
      details: { atmosphere: 'Salt and steel.' },
    });
    expect(parsed.instructions).toContain('Review ALL 2 spaces');
    expect(parsed.instructions).toContain('Footprint: 80 ft × 60 ft');
  });
});

describe('buildLocationVisualMapPrompt', () => {
  it('includes concrete room and connection summaries for the HTML map stage', () => {
    const prompt = buildLocationVisualMapPrompt({
      config: {
        prompt: 'Create a compact fortress keep.',
        type: 'location',
        flags: {},
      },
      stageResults: {
        purpose: {
          name: 'Stormwatch Keep',
          location_type: 'keep',
          scale: 'moderate',
        },
        spaces: {
          spaces: [
            {
              name: 'Gate Hall',
              purpose: 'Entry checkpoint',
              space_type: 'room',
              size_ft: { width: 30, height: 20 },
              wall_thickness_ft: 5,
              wall_material: 'stone',
              doors: [{ wall: 'north', position_on_wall_ft: 15, width_ft: 4, leads_to: 'Barracks' }],
            },
            {
              name: 'Barracks',
              purpose: 'Sleeping quarters',
              size_ft: { width: 24, height: 18 },
              doors: [{ wall: 'south', position_on_wall_ft: 12, width_ft: 4, leads_to: 'Gate Hall' }],
            },
          ],
        },
      },
      factpack: null,
    });

    expect(prompt).toContain('LOCATION: Stormwatch Keep');
    expect(prompt).toContain('- Gate Hall [room] | size 30 x 20 ft | purpose: Entry checkpoint | walls: 5 ft stone | doors: north -> Barracks');
    expect(prompt).toContain('- Barracks [room] | size 24 x 18 ft | purpose: Sleeping quarters | doors: south -> Gate Hall');
    expect(prompt).toContain('- Gate Hall: north door at 15 ft -> Barracks');
    expect(prompt).toContain('Do not invent replacement names');
  });
});
