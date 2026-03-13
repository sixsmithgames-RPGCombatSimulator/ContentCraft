import type { NpcSectionChunk } from '../config/npcSectionChunks';
import type { Factpack } from './workflowCanonRetrieval';
import type { WorkflowFactGroup } from './workflowFactpack';

export type WorkflowChunkingMode = 'facts' | 'npc_sections';

export interface WorkflowChunkInfo {
  isChunked: boolean;
  currentChunk: number;
  totalChunks: number;
  chunkLabel: string;
}

export interface WorkflowChunkingState {
  isModalOpen: boolean;
  mode: WorkflowChunkingMode | null;
  pendingFactpack: Factpack | null;
  factGroups: WorkflowFactGroup[];
  npcSections: NpcSectionChunk[];
}

export function createEmptyWorkflowChunkingState(): WorkflowChunkingState {
  return {
    isModalOpen: false,
    mode: null,
    pendingFactpack: null,
    factGroups: [],
    npcSections: [],
  };
}

export function openFactWorkflowChunking(input: {
  pendingFactpack: Factpack;
  factGroups: WorkflowFactGroup[];
}): WorkflowChunkingState {
  return {
    isModalOpen: true,
    mode: 'facts',
    pendingFactpack: input.pendingFactpack,
    factGroups: input.factGroups,
    npcSections: [],
  };
}

export function openNpcSectionWorkflowChunking(npcSections: NpcSectionChunk[]): WorkflowChunkingState {
  return {
    isModalOpen: true,
    mode: 'npc_sections',
    pendingFactpack: null,
    factGroups: [],
    npcSections,
  };
}

export function closeWorkflowChunkingModal(state: WorkflowChunkingState): WorkflowChunkingState {
  return {
    ...state,
    isModalOpen: false,
    pendingFactpack: null,
  };
}

export function resetWorkflowChunkingState(): WorkflowChunkingState {
  return createEmptyWorkflowChunkingState();
}

export function isNpcSectionWorkflowChunking(state: WorkflowChunkingState): boolean {
  return state.mode === 'npc_sections';
}

export function buildWorkflowFactGroupFactpack(group: WorkflowFactGroup): Factpack {
  return {
    facts: group.facts,
    entities: Array.from(new Set(group.facts.map((fact) => fact.entity_id || fact.entity_name))),
    gaps: [],
  };
}

export function buildWorkflowChunkInfo(currentChunk: number, totalChunks: number, chunkLabel: string): WorkflowChunkInfo {
  return {
    isChunked: true,
    currentChunk,
    totalChunks,
    chunkLabel,
  };
}
