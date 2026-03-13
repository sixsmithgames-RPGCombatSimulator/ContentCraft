import { buildWorkflowChunkInfo, type WorkflowChunkInfo } from './workflowChunking';

type JsonRecord = Record<string, unknown>;

export interface WorkflowStageChunkStep {
  nextChunkIndex: number;
  chunkInfo: WorkflowChunkInfo;
}

function normalizeStageName(stageName: string): string {
  return stageName.trim().toLowerCase();
}

export function buildWorkflowStageChunkInfoForIndex(
  chunkIndex: number,
  totalChunks: number,
  options?: {
    labelPrefix?: string;
    labelSuffix?: string;
  },
): WorkflowChunkInfo {
  const labelPrefix = options?.labelPrefix ?? 'Space';
  const baseLabel = `${labelPrefix} ${chunkIndex + 1} of ${totalChunks}`;
  const chunkLabel = options?.labelSuffix ? `${baseLabel} ${options.labelSuffix}` : baseLabel;
  return buildWorkflowChunkInfo(chunkIndex + 1, totalChunks, chunkLabel);
}

export function getNextWorkflowStageChunkStep(
  currentStageChunk: number,
  totalStageChunks: number,
  options?: {
    labelPrefix?: string;
  },
): WorkflowStageChunkStep | null {
  const nextChunkIndex = currentStageChunk + 1;
  if (nextChunkIndex >= totalStageChunks) {
    return null;
  }

  return {
    nextChunkIndex,
    chunkInfo: buildWorkflowStageChunkInfoForIndex(nextChunkIndex, totalStageChunks, options),
  };
}

export function mergeWorkflowStageChunks(chunks: JsonRecord[], stageName: string): JsonRecord {
  if (chunks.length === 0) {
    return {};
  }

  if (normalizeStageName(stageName) === 'spaces') {
    return {
      spaces: chunks,
      total_spaces: chunks.length,
    };
  }

  if (chunks.length === 1) {
    return { ...chunks[0] };
  }

  return chunks.reduce<JsonRecord>((merged, chunk) => {
    Object.entries(chunk).forEach(([key, value]) => {
      const existing = merged[key];
      if (Array.isArray(existing) && Array.isArray(value)) {
        merged[key] = [...existing, ...value];
        return;
      }

      if (Array.isArray(value)) {
        merged[key] = [...value];
        return;
      }

      merged[key] = value;
    });

    return merged;
  }, {});
}
