import type { NpcSectionChunk } from '../config/npcSectionChunks';
import type { Factpack } from './workflowCanonRetrieval';
import type { WorkflowFactGroup } from './workflowFactpack';
import {
  buildWorkflowChunkInfo,
  buildWorkflowFactGroupFactpack,
  type WorkflowChunkInfo,
} from './workflowChunking';

type JsonRecord = Record<string, unknown>;

const PIPELINE_ONLY_SECTION_FIELDS = [
  'sources_used',
  'assumptions',
  'proposals',
  'retrieval_hints',
  'canon_update',
] as const;

function isPlannerStyleStage(stageName: string): boolean {
  const normalized = stageName.trim().toLowerCase();
  return normalized === 'planner' || normalized === 'outline & structure';
}

function mergeUniqueStringValues(chunkResults: JsonRecord[], key: string): string[] {
  const values = new Set<string>();

  chunkResults.forEach((chunk) => {
    const candidate = chunk[key];
    if (Array.isArray(candidate)) {
      candidate.forEach((value) => values.add(String(value)));
    }
  });

  return Array.from(values);
}

function mergeRetrievalHints(chunkResults: JsonRecord[]): JsonRecord {
  const merged = {
    entities: new Set<string>(),
    regions: new Set<string>(),
    eras: new Set<string>(),
    keywords: new Set<string>(),
  };

  chunkResults.forEach((chunk) => {
    const hints = chunk.retrieval_hints;
    if (!hints || typeof hints !== 'object' || Array.isArray(hints)) {
      return;
    }

    const record = hints as Record<string, unknown>;
    if (Array.isArray(record.entities)) record.entities.forEach((value) => merged.entities.add(String(value)));
    if (Array.isArray(record.regions)) record.regions.forEach((value) => merged.regions.add(String(value)));
    if (Array.isArray(record.eras)) record.eras.forEach((value) => merged.eras.add(String(value)));
    if (Array.isArray(record.keywords)) record.keywords.forEach((value) => merged.keywords.add(String(value)));
  });

  return {
    entities: Array.from(merged.entities),
    regions: Array.from(merged.regions),
    eras: Array.from(merged.eras),
    keywords: Array.from(merged.keywords),
  };
}

function mergeAllProposals(chunkResults: JsonRecord[]): unknown[] {
  const proposals: unknown[] = [];

  chunkResults.forEach((chunk) => {
    if (Array.isArray(chunk.proposals)) {
      proposals.push(...chunk.proposals);
    }
  });

  return proposals;
}

export interface WorkflowFactChunkStep {
  nextChunkIndex: number;
  nextGroup: WorkflowFactGroup;
  nextFactpack: Factpack;
  chunkInfo: WorkflowChunkInfo;
}

export interface WorkflowNpcSectionStep {
  nextSectionIndex: number;
  nextSection: NpcSectionChunk;
  chunkInfo: WorkflowChunkInfo;
}

export interface WorkflowNpcSectionMergeResult {
  mergedSections: JsonRecord;
  cleanedSections: JsonRecord;
}

export function mergeWorkflowChunkOutputs(chunkResults: JsonRecord[], stageName: string): JsonRecord {
  if (chunkResults.length === 0) {
    return {};
  }

  if (chunkResults.length === 1) {
    return { ...chunkResults[0] };
  }

  const merged = Object.assign({}, ...chunkResults) as JsonRecord;

  if (isPlannerStyleStage(stageName)) {
    merged.threads = mergeUniqueStringValues(chunkResults, 'threads');
    merged.proposals = mergeAllProposals(chunkResults);
    merged.retrieval_hints = mergeRetrievalHints(chunkResults);
    return merged;
  }

  const proposals = mergeAllProposals(chunkResults);
  if (proposals.length > 0) {
    merged.proposals = proposals;
  }

  return merged;
}

export function getNextWorkflowFactChunkStep(
  factGroups: WorkflowFactGroup[],
  currentGroupIndex: number,
): WorkflowFactChunkStep | null {
  const nextChunkIndex = currentGroupIndex + 1;
  if (nextChunkIndex >= factGroups.length) {
    return null;
  }

  const nextGroup = factGroups[nextChunkIndex];
  return {
    nextChunkIndex,
    nextGroup,
    nextFactpack: buildWorkflowFactGroupFactpack(nextGroup),
    chunkInfo: buildWorkflowChunkInfo(nextChunkIndex + 1, factGroups.length, nextGroup.label),
  };
}

export function mergeWorkflowNpcSections(
  accumulatedSections: JsonRecord,
  sectionOutput: JsonRecord,
): WorkflowNpcSectionMergeResult {
  const mergedSections: JsonRecord = {
    ...accumulatedSections,
    ...sectionOutput,
  };

  const cleanedSections: JsonRecord = { ...mergedSections };
  PIPELINE_ONLY_SECTION_FIELDS.forEach((key) => {
    delete cleanedSections[key];
  });

  return {
    mergedSections,
    cleanedSections,
  };
}

export function getNextWorkflowNpcSectionStep(
  npcSections: NpcSectionChunk[],
  currentSectionIndex: number,
): WorkflowNpcSectionStep | null {
  const nextSectionIndex = currentSectionIndex + 1;
  if (nextSectionIndex >= npcSections.length) {
    return null;
  }

  const nextSection = npcSections[nextSectionIndex];
  return {
    nextSectionIndex,
    nextSection,
    chunkInfo: buildWorkflowChunkInfo(nextSectionIndex + 1, npcSections.length, nextSection.chunkLabel),
  };
}
