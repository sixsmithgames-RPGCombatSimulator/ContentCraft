import type { Factpack } from './workflowCanonRetrieval';

type JsonRecord = Record<string, unknown>;

export type WorkflowCanonNarrowingMode = 'initial' | 'retrieval_hints';

export interface WorkflowRetrievalHintsContext {
  stageName: string;
  requestedEntities: string[];
}

export interface WorkflowCanonNarrowingState<TStageResults = Record<string, JsonRecord>> {
  isOpen: boolean;
  keywords: string[];
  pendingFactpack: Factpack | null;
  pendingStageResults: TStageResults | null;
  mode: WorkflowCanonNarrowingMode | null;
  retrievalHintsContext: WorkflowRetrievalHintsContext | null;
}

export interface WorkflowCanonFactSelection {
  text: string;
  chunk_id?: string;
  entity_name: string;
  entity_id?: string;
  entity_type?: string;
  region?: string;
}

export function createEmptyWorkflowCanonNarrowingState<TStageResults = Record<string, JsonRecord>>(): WorkflowCanonNarrowingState<TStageResults> {
  return {
    isOpen: false,
    keywords: [],
    pendingFactpack: null,
    pendingStageResults: null,
    mode: null,
    retrievalHintsContext: null,
  };
}

export function openInitialWorkflowCanonNarrowing<TStageResults = Record<string, JsonRecord>>(input: {
  keywords: string[];
  pendingFactpack: Factpack;
  pendingStageResults?: TStageResults | null;
}): WorkflowCanonNarrowingState<TStageResults> {
  return {
    isOpen: true,
    keywords: [...input.keywords],
    pendingFactpack: input.pendingFactpack,
    pendingStageResults: input.pendingStageResults ?? null,
    mode: 'initial',
    retrievalHintsContext: null,
  };
}

export function openRetrievalHintWorkflowCanonNarrowing<TStageResults = Record<string, JsonRecord>>(input: {
  keywords: string[];
  pendingFactpack: Factpack;
  pendingStageResults: TStageResults;
  stageName: string;
  requestedEntities: string[];
}): WorkflowCanonNarrowingState<TStageResults> {
  return {
    isOpen: true,
    keywords: [...input.keywords],
    pendingFactpack: input.pendingFactpack,
    pendingStageResults: input.pendingStageResults,
    mode: 'retrieval_hints',
    retrievalHintsContext: {
      stageName: input.stageName,
      requestedEntities: [...input.requestedEntities],
    },
  };
}

export function updateWorkflowCanonNarrowingSearch<TStageResults = Record<string, JsonRecord>>(
  state: WorkflowCanonNarrowingState<TStageResults>,
  input: {
    keywords: string[];
    pendingFactpack: Factpack;
  },
): WorkflowCanonNarrowingState<TStageResults> {
  return {
    ...state,
    isOpen: true,
    keywords: [...input.keywords],
    pendingFactpack: input.pendingFactpack,
  };
}

export function buildWorkflowFilteredFactpack(filteredFacts: WorkflowCanonFactSelection[]): Factpack {
  return {
    facts: filteredFacts.map((fact) => ({
      text: fact.text,
      chunk_id: fact.chunk_id || '',
      entity_name: fact.entity_name,
      entity_id: fact.entity_id || fact.entity_name,
      entity_type: fact.entity_type,
      region: fact.region,
    })),
    entities: Array.from(new Set(filteredFacts.map((fact) => fact.entity_id || fact.entity_name))),
    gaps: [],
  };
}

export function isWorkflowRetrievalHintNarrowing<TStageResults = Record<string, JsonRecord>>(
  state: WorkflowCanonNarrowingState<TStageResults>,
): boolean {
  return state.mode === 'retrieval_hints';
}
