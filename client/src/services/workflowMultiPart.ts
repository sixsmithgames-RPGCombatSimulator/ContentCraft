import type { NpcSectionChunk } from '../config/npcSectionChunks';
import type { Factpack } from './workflowCanonRetrieval';
import type { WorkflowFactGroup } from './workflowFactpack';
import { buildWorkflowChunkInfo, buildWorkflowFactGroupFactpack, type WorkflowChunkInfo } from './workflowChunking';

type JsonRecord = Record<string, unknown>;

const PIPELINE_ONLY_NPC_SECTION_FIELDS = new Set([
  'sources_used',
  'assumptions',
  'proposals',
  'retrieval_hints',
  'canon_update',
]);

export interface WorkflowNextFactChunkStep {
  nextChunkIndex: number;
  nextGroup: WorkflowFactGroup;
  nextFactpack: Factpack;
  chunkInfo: WorkflowChunkInfo;
}

export interface WorkflowNextNpcSectionStep {
  nextSectionIndex: number;
  nextSection: NpcSectionChunk;
  chunkInfo: WorkflowChunkInfo;
}

export interface WorkflowMergedNpcSections {
  mergedSections: JsonRecord;
  cleanedSections: JsonRecord;
}

export function mergeWorkflowChunkOutputs(chunkResults: JsonRecord[], stageName: string): JsonRecord {
  if (chunkResults.length === 0) {
    return {};
  }

  if (chunkResults.length === 1) {
    return chunkResults[0];
  }

  const merged = { ...chunkResults[0] };

  if (stageName === 'Planner' || stageName === 'Outline & Structure') {
    const allThreads = new Set<string>();
    const allRetrievalHints = {
      entities: new Set<string>(),
      regions: new Set<string>(),
      eras: new Set<string>(),
      keywords: new Set<string>(),
    };

    chunkResults.forEach((chunk) => {
      if (Array.isArray(chunk.threads)) {
        chunk.threads.forEach((thread) => allThreads.add(String(thread)));
      }

      if (chunk.retrieval_hints && typeof chunk.retrieval_hints === 'object') {
        const hints = chunk.retrieval_hints as Record<string, unknown>;
        if (Array.isArray(hints.entities)) hints.entities.forEach((value) => allRetrievalHints.entities.add(String(value)));
        if (Array.isArray(hints.regions)) hints.regions.forEach((value) => allRetrievalHints.regions.add(String(value)));
        if (Array.isArray(hints.eras)) hints.eras.forEach((value) => allRetrievalHints.eras.add(String(value)));
        if (Array.isArray(hints.keywords)) hints.keywords.forEach((value) => allRetrievalHints.keywords.add(String(value)));
      }
    });

    const allProposals: unknown[] = [];
    chunkResults.forEach((chunk) => {
      if (Array.isArray(chunk.proposals)) {
        allProposals.push(...chunk.proposals);
      }
    });

    merged.threads = Array.from(allThreads);
    merged.proposals = allProposals;
    merged.retrieval_hints = {
      entities: Array.from(allRetrievalHints.entities),
      regions: Array.from(allRetrievalHints.regions),
      eras: Array.from(allRetrievalHints.eras),
      keywords: Array.from(allRetrievalHints.keywords),
    };

    return merged;
  }

  const lastChunk = chunkResults[chunkResults.length - 1];
  Object.assign(merged, lastChunk);

  const allProposals: unknown[] = [];
  chunkResults.forEach((chunk) => {
    if (Array.isArray(chunk.proposals)) {
      allProposals.push(...chunk.proposals);
    }
  });

  if (allProposals.length > 0) {
    merged.proposals = allProposals;
  }

  return merged;
}

export function mergeWorkflowNpcSections(
  accumulatedSections: JsonRecord,
  sectionOutput: JsonRecord,
): WorkflowMergedNpcSections {
  const mergedSections = {
    ...accumulatedSections,
    ...sectionOutput,
  };

  const cleanedSections = Object.fromEntries(
    Object.entries(mergedSections).filter(([key]) => !PIPELINE_ONLY_NPC_SECTION_FIELDS.has(key)),
  );

  return {
    mergedSections,
    cleanedSections,
  };
}

export function getNextWorkflowNpcSectionStep(
  npcSections: NpcSectionChunk[],
  currentSectionIndex: number,
): WorkflowNextNpcSectionStep | null {
  if (currentSectionIndex >= npcSections.length - 1) {
    return null;
  }

  const nextSectionIndex = currentSectionIndex + 1;
  const nextSection = npcSections[nextSectionIndex];

  return {
    nextSectionIndex,
    nextSection,
    chunkInfo: buildWorkflowChunkInfo(nextSectionIndex + 1, npcSections.length, nextSection.chunkLabel),
  };
}

export function getNextWorkflowFactChunkStep(
  factGroups: WorkflowFactGroup[],
  currentGroupIndex: number,
): WorkflowNextFactChunkStep | null {
  if (currentGroupIndex >= factGroups.length - 1) {
    return null;
  }

  const nextChunkIndex = currentGroupIndex + 1;
  const nextGroup = factGroups[nextChunkIndex];

  return {
    nextChunkIndex,
    nextGroup,
    nextFactpack: buildWorkflowFactGroupFactpack(nextGroup),
    chunkInfo: buildWorkflowChunkInfo(nextChunkIndex + 1, factGroups.length, nextGroup.label),
  };
}
