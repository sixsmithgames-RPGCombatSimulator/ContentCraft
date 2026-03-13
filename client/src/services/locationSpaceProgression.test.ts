import { describe, expect, it } from 'vitest';
import {
  appendLocationSpaceToLiveMap,
  buildAcceptedLocationSpaceProgress,
  extractLocationSpaceForMap,
  syncLocationLiveMapSpaces,
} from './locationSpaceProgression';

describe('locationSpaceProgression', () => {
  it('extracts normalized live-map space data from raw location results', () => {
    const extracted = extractLocationSpaceForMap({
      name: 'Hall',
      purpose: 'Entry hall',
      dimensions: '20 x 15 ft',
      walls: [
        { side: 'north', thickness: 8, material: 'stone' },
        { side: 'south', thickness: 8, material: 'stone' },
      ],
      doors: [{ wall: 'east', position_on_wall_ft: 7, width_ft: 4, leads_to: 'Chamber' }],
    });

    expect(extracted).toEqual(
      expect.objectContaining({
        name: 'Hall',
        purpose: 'Entry hall',
        function: 'Entry hall',
        dimensions: { width: 20, height: 15, unit: 'ft' },
        size_ft: { width: 20, height: 15 },
        connections: ['Chamber'],
        wall_thickness_ft: 8,
        wall_material: 'stone',
      })
    );
  });

  it('syncs reciprocal doors when appending a new live-map space', () => {
    const result = appendLocationSpaceToLiveMap(
      [
        {
          name: 'Hall',
          size_ft: { width: 20, height: 20 },
          doors: [{ wall: 'east', position_on_wall_ft: 10, width_ft: 4, leads_to: 'Chamber' }],
        },
      ],
      {
        name: 'Chamber',
        size_ft: { width: 20, height: 20 },
      }
    );

    expect(result.spaceData?.name).toBe('Chamber');
    expect(syncLocationLiveMapSpaces(result.updatedLiveMapSpaces)[1].doors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          wall: 'west',
          leads_to: 'Hall',
          is_reciprocal: true,
        }),
      ])
    );
  });

  it('builds one consistent acceptance result for ongoing and completed location stages', () => {
    const ongoing = buildAcceptedLocationSpaceProgress({
      acceptedSpace: {
        name: 'Hall',
        size_ft: { width: 20, height: 20 },
      },
      accumulatedChunkResults: [],
      liveMapSpaces: [],
      stageResults: {},
      stageName: 'Spaces',
      currentStageChunk: 0,
      totalStageChunks: 2,
      showLiveMap: false,
    });

    expect(ongoing.stageComplete).toBe(false);
    expect(ongoing.nextChunkStep?.nextChunkIndex).toBe(1);
    expect(ongoing.updatedStageChunkState.currentStageChunk).toBe(1);
    expect(ongoing.updatedStageResults.spaces).toEqual({
      spaces: ongoing.newAccumulated,
      total_spaces: 1,
    });

    const completed = buildAcceptedLocationSpaceProgress({
      acceptedSpace: {
        name: 'Chamber',
        size_ft: { width: 15, height: 15 },
      },
      accumulatedChunkResults: ongoing.newAccumulated,
      liveMapSpaces: ongoing.updatedLiveMapSpaces,
      stageResults: ongoing.updatedStageResults,
      stageName: 'Spaces',
      currentStageChunk: 1,
      totalStageChunks: 2,
      showLiveMap: true,
    });

    expect(completed.stageComplete).toBe(true);
    expect(completed.updatedStageChunkState).toEqual({
      isStageChunking: false,
      currentStageChunk: 0,
      totalStageChunks: 0,
      accumulatedChunkResults: completed.newAccumulated,
      liveMapSpaces: completed.updatedLiveMapSpaces,
      showLiveMap: true,
    });
  });
});
