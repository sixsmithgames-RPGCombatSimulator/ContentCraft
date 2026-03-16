import { buildHomebrewFinalOutput } from './workflowContentAssembler';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

export type WorkflowHomebrewChunk = {
  index: number;
  title: string;
  content: string;
  prompt: string;
};

export type WorkflowHomebrewProgressResult =
  | {
    kind: 'next_chunk';
    stageResults: StageResults;
    nextChunkIndex: number;
    nextChunk: WorkflowHomebrewChunk;
  }
  | {
    kind: 'complete';
    stageResults: StageResults;
    finalOutput: JsonRecord;
    totalChunks: number;
    chunkResults: JsonRecord[];
  };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(source: JsonRecord | null | undefined, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(source: JsonRecord | null | undefined, key: string): number | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function getJsonRecordArray(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items.filter(isRecord);
  }

  return [];
}

function setStageArrayValue(items: unknown[]): JsonRecord {
  return { items };
}

function asWorkflowHomebrewChunks(value: unknown): WorkflowHomebrewChunk[] {
  return Array.isArray(value)
    ? value.filter((item): item is WorkflowHomebrewChunk =>
      isRecord(item)
      && typeof item.index === 'number'
      && typeof item.title === 'string'
      && typeof item.content === 'string'
      && typeof item.prompt === 'string'
    )
    : [];
}

export function getWorkflowHomebrewChunks(value: unknown): WorkflowHomebrewChunk[] {
  if (isRecord(value) && Array.isArray(value.items)) {
    return asWorkflowHomebrewChunks(value.items);
  }

  return asWorkflowHomebrewChunks(value);
}

export function buildWorkflowHomebrewStageResults(chunks: WorkflowHomebrewChunk[]): StageResults {
  return {
    homebrew_chunks: setStageArrayValue(chunks),
    homebrew_chunk_results: setStageArrayValue([]),
    current_chunk: { value: 0 },
  };
}

export function getCurrentWorkflowHomebrewChunk(stageResults: StageResults): WorkflowHomebrewChunk | null {
  const chunks = getWorkflowHomebrewChunks(stageResults.homebrew_chunks);
  const currentChunkIndex = getNumber(stageResults.current_chunk, 'value') ?? 0;
  return chunks[currentChunkIndex] ?? null;
}

export function buildWorkflowHomebrewCompletionAlertMessage(input: {
  finalOutput: JsonRecord;
  totalChunks: number;
}): string {
  const docTitle = getString(input.finalOutput, 'document_title') || 'Homebrew Content';
  return `✅ Homebrew Extraction Complete!\n\nDocument: ${docTitle}\nChunks processed: ${input.totalChunks}\n\nReview the extracted content below before saving.`;
}

export function mergeWorkflowHomebrewChunks(chunks: JsonRecord[]): JsonRecord {
  const merged: JsonRecord = {
    entries: [],
    races: [],
    classes: [],
    spells: [],
    items: [],
    creatures: [],
    rules: [],
    lore: [],
    backgrounds: [],
    feats: [],
    subraces: [],
    subclasses: [],
    unparsed: [],
    notes: '',
  };

  chunks.forEach((chunk, index) => {
    if (Array.isArray(chunk.entities)) {
      const entities = chunk.entities as Array<{
        type: string;
        canonical_name: string;
        claims?: Array<{ text: string; source: string }>;
        homebrew_metadata?: {
          homebrew_type?: string;
          tags?: string[];
          short_summary?: string;
          full_description?: string;
          assumptions?: string[];
          notes?: string[];
        };
      }>;

      const entries = entities.map((entity) => {
        const metadata = entity.homebrew_metadata || {};
        return {
          type: metadata.homebrew_type || entity.type,
          title: entity.canonical_name,
          short_summary: metadata.short_summary || (entity.claims?.[0]?.text || ''),
          long_description: metadata.full_description || (entity.claims?.map((claim) => claim.text).join(' ') || ''),
          tags: metadata.tags || [],
          assumptions: metadata.assumptions || [],
          notes: metadata.notes || [],
          claims: entity.claims || [],
        };
      });

      (merged.entries as unknown[]).push(...entries);

      entries.forEach((entry) => {
        const type = entry.type;
        if (type === 'race') {
          (merged.races as unknown[]).push(entry);
        } else if (type === 'subrace') {
          (merged.subraces as unknown[]).push(entry);
        } else if (type === 'class') {
          (merged.classes as unknown[]).push(entry);
        } else if (type === 'subclass') {
          (merged.subclasses as unknown[]).push(entry);
        } else if (type === 'spell') {
          (merged.spells as unknown[]).push(entry);
        } else if (type === 'item') {
          (merged.items as unknown[]).push(entry);
        } else if (type === 'creature') {
          (merged.creatures as unknown[]).push(entry);
        } else if (type === 'rule') {
          (merged.rules as unknown[]).push(entry);
        } else if (type === 'lore') {
          (merged.lore as unknown[]).push(entry);
        } else if (type === 'background') {
          (merged.backgrounds as unknown[]).push(entry);
        } else if (type === 'feat') {
          (merged.feats as unknown[]).push(entry);
        }
      });
    } else if (Array.isArray(chunk.entries)) {
      const entries = chunk.entries as Array<{
        type: string;
        title: string;
      }>;

      (merged.entries as unknown[]).push(...entries);

      entries.forEach((entry) => {
        const type = entry.type;
        if (type === 'race') {
          (merged.races as unknown[]).push(entry);
        } else if (type === 'subrace') {
          (merged.subraces as unknown[]).push(entry);
        } else if (type === 'class') {
          (merged.classes as unknown[]).push(entry);
        } else if (type === 'subclass') {
          (merged.subclasses as unknown[]).push(entry);
        } else if (type === 'spell') {
          (merged.spells as unknown[]).push(entry);
        } else if (type === 'item') {
          (merged.items as unknown[]).push(entry);
        } else if (type === 'creature') {
          (merged.creatures as unknown[]).push(entry);
        } else if (type === 'rule') {
          (merged.rules as unknown[]).push(entry);
        } else if (type === 'lore') {
          (merged.lore as unknown[]).push(entry);
        } else if (type === 'background') {
          (merged.backgrounds as unknown[]).push(entry);
        } else if (type === 'feat') {
          (merged.feats as unknown[]).push(entry);
        }
      });
    }

    const categories = ['races', 'classes', 'spells', 'items', 'creatures', 'rules', 'lore', 'unparsed'];
    categories.forEach((category) => {
      const chunkData = chunk[category];
      if (Array.isArray(chunkData) && chunkData.length > 0) {
        const existing = merged[category] as unknown[];
        merged[category] = [...existing, ...chunkData];
      }
    });

    if (Array.isArray(chunk.unparsed)) {
      (merged.unparsed as unknown[]).push(...chunk.unparsed);
    }

    const chunkNotes = getString(chunk, 'notes');
    if (chunkNotes) {
      merged.notes = (merged.notes as string) + `\n\nChunk ${index + 1}: ${chunkNotes}`;
    }
  });

  merged.notes = (merged.notes as string).trim();
  return merged;
}

export function resolveWorkflowHomebrewChunkProgress(input: {
  stageResults: StageResults;
  stageKey: string;
  parsed: JsonRecord;
  fileName?: string;
}): WorkflowHomebrewProgressResult {
  const homebrewChunks = getWorkflowHomebrewChunks(input.stageResults.homebrew_chunks);
  const currentChunkIndex = getNumber(input.stageResults.current_chunk, 'value') ?? 0;
  const explicitChunkResults = getJsonRecordArray(input.stageResults.homebrew_chunk_results);
  const legacyChunkResults = getJsonRecordArray(input.stageResults[`${input.stageKey}_chunks`]);
  const priorChunkResults = explicitChunkResults.length > 0 ? explicitChunkResults : legacyChunkResults;
  const chunkResults = [...priorChunkResults, input.parsed];

  const mechanicsFromStage = isRecord(input.parsed.resolved_mechanics)
    ? { resolved_mechanics: input.parsed.resolved_mechanics as JsonRecord }
    : {};

  const mergedMechanics = mechanicsFromStage.resolved_mechanics && isRecord(input.stageResults.resolved_mechanics)
    ? {
      resolved_mechanics: {
        ...input.stageResults.resolved_mechanics,
        ...mechanicsFromStage.resolved_mechanics,
      } as JsonRecord,
    }
    : mechanicsFromStage;

  const nextBaseStageResults: StageResults = {
    ...input.stageResults,
    [input.stageKey]: input.parsed,
    [`${input.stageKey}_chunks`]: setStageArrayValue(chunkResults),
    homebrew_chunk_results: setStageArrayValue(chunkResults),
  };

  if (mergedMechanics.resolved_mechanics) {
    nextBaseStageResults.resolved_mechanics = mergedMechanics.resolved_mechanics;
  }

  const nextChunkIndex = currentChunkIndex + 1;
  if (nextChunkIndex < homebrewChunks.length) {
    return {
      kind: 'next_chunk',
      stageResults: {
        ...nextBaseStageResults,
        current_chunk: { value: nextChunkIndex },
      },
      nextChunkIndex,
      nextChunk: homebrewChunks[nextChunkIndex],
    };
  }

  const finalOutput = buildHomebrewFinalOutput({
    mergedContent: mergeWorkflowHomebrewChunks(chunkResults),
    fileName: input.fileName,
    totalChunks: homebrewChunks.length,
  });

  return {
    kind: 'complete',
    stageResults: {
      ...nextBaseStageResults,
      merged: finalOutput,
    },
    finalOutput,
    totalChunks: homebrewChunks.length,
    chunkResults,
  };
}
