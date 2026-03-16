import { describe, expect, it } from 'vitest';
import {
  buildWorkflowChunkInfo,
  buildWorkflowFactGroupFactpack,
  closeWorkflowChunkingModal,
  createEmptyWorkflowChunkingState,
  isNpcSectionWorkflowChunking,
  openFactWorkflowChunking,
  openNpcSectionWorkflowChunking,
} from './workflowChunking';

describe('workflowChunking', () => {
  it('creates an empty chunking state', () => {
    expect(createEmptyWorkflowChunkingState()).toEqual({
      isModalOpen: false,
      mode: null,
      pendingFactpack: null,
      factGroups: [],
      npcSections: [],
    });
  });

  it('opens fact chunking with pending factpack and groups', () => {
    const state = openFactWorkflowChunking({
      pendingFactpack: {
        facts: [{ chunk_id: 'a', text: 'Fact', entity_id: 'a', entity_name: 'A' }],
        entities: ['a'],
        gaps: [],
      },
      factGroups: [{
        id: 'g1',
        label: 'NPCs',
        facts: [{ chunk_id: 'a', text: 'Fact', entity_id: 'a', entity_name: 'A' }],
        characterCount: 4,
        entityTypes: ['npc'],
        regions: [],
      }],
    });

    expect(state.mode).toBe('facts');
    expect(state.isModalOpen).toBe(true);
    expect(state.factGroups).toHaveLength(1);
  });

  it('opens npc section chunking and marks the mode correctly', () => {
    const state = openNpcSectionWorkflowChunking([
      {
        chunkLabel: 'Basic Info',
        sectionName: 'basic_info',
        instructions: 'Basics',
        schemaSection: '{"type":"object"}',
        includePreviousSections: false,
        outputFields: ['name'],
      },
    ]);

    expect(state.mode).toBe('npc_sections');
    expect(isNpcSectionWorkflowChunking(state)).toBe(true);
    expect(state.npcSections[0].chunkLabel).toBe('Basic Info');
  });

  it('builds group factpacks and chunk info for progression', () => {
    const group = {
      id: 'g1',
      label: 'NPCs',
      facts: [{ chunk_id: 'a', text: 'Fact', entity_id: 'a', entity_name: 'A' }],
      characterCount: 4,
      entityTypes: ['npc'],
      regions: [],
    };

    expect(buildWorkflowFactGroupFactpack(group)).toEqual({
      facts: group.facts,
      entities: ['a'],
      gaps: [],
    });

    expect(buildWorkflowChunkInfo(1, 3, 'NPCs')).toEqual({
      isChunked: true,
      currentChunk: 1,
      totalChunks: 3,
      chunkLabel: 'NPCs',
    });
  });

  it('closes the modal without dropping active groups/sections', () => {
    const closed = closeWorkflowChunkingModal(openFactWorkflowChunking({
      pendingFactpack: {
        facts: [{ chunk_id: 'a', text: 'Fact', entity_id: 'a', entity_name: 'A' }],
        entities: ['a'],
        gaps: [],
      },
      factGroups: [{
        id: 'g1',
        label: 'NPCs',
        facts: [{ chunk_id: 'a', text: 'Fact', entity_id: 'a', entity_name: 'A' }],
        characterCount: 4,
        entityTypes: ['npc'],
        regions: [],
      }],
    }));

    expect(closed.isModalOpen).toBe(false);
    expect(closed.pendingFactpack).toBeNull();
    expect(closed.factGroups).toHaveLength(1);
  });
});
