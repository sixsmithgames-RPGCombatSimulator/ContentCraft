type JsonRecord = Record<string, unknown>;

interface MinimalFactEntry {
  text: string;
  source?: string;
}

export interface GeneratorStagePromptContext {
  config: { prompt: string; type: string; flags: Record<string, unknown> };
  stageResults: Record<string, Record<string, unknown>>;
  factpack: unknown;
  chunkInfo?: {
    isChunked: boolean;
    currentChunk: number;
    totalChunks: number;
    chunkLabel: string;
  };
  previousDecisions?: Record<string, string>;
  unansweredProposals?: unknown[];
  npcSectionContext?: {
    isNpcSectionChunking: boolean;
    currentSectionIndex: number;
    currentSection: {
      chunkLabel: string;
      instructions: string;
      includePreviousSections?: boolean;
      outputFields: string[];
    } | null;
    accumulatedSections: JsonRecord;
  };
}

export interface BuildWorkflowStagePromptOptions {
  context: GeneratorStagePromptContext;
  deliverable: string;
  stage: string;
  payload?: Record<string, unknown>;
  promptKey?: 'original_user_request' | 'prompt' | 'user_request' | 'request';
  includeFlags?: boolean;
  plannerReferenceMessage?: string | null;
  factpackMaxChars?: number;
  plannerReferenceKey?: string;
  factpackKey?: string;
  previousDecisionsKey?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMinimalFactEntry(fact: unknown): unknown {
  if (typeof fact === 'string') {
    return { text: fact } satisfies MinimalFactEntry;
  }

  if (!isRecord(fact)) {
    return fact;
  }

  if (typeof fact.text !== 'string' || fact.text.trim().length === 0) {
    return fact;
  }

  const source =
    typeof fact.source === 'string'
      ? fact.source
      : typeof fact.entity_name === 'string'
        ? fact.entity_name
        : typeof fact.entityName === 'string'
          ? fact.entityName
          : undefined;

  return source
    ? { text: fact.text, source } satisfies MinimalFactEntry
    : { text: fact.text } satisfies MinimalFactEntry;
}

export function stripStageOutput(result: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!result) return {};

  const content = { ...result } as Record<string, unknown>;
  delete content.sources_used;
  delete content.assumptions;
  delete content.proposals;
  delete content.retrieval_hints;
  delete content.canon_update;
  delete content.keywords;
  return content;
}

export function createMinimalFactpack(factpack: unknown, maxChars: number = 8000): unknown {
  if (!factpack) return { facts: [] };
  if (!isRecord(factpack)) return factpack;

  const facts = Array.isArray(factpack.facts)
    ? factpack.facts.map((fact) => toMinimalFactEntry(fact))
    : null;
  const normalizedFactpack = facts ? { ...factpack, facts } : factpack;
  const serialized = JSON.stringify(normalizedFactpack);
  if (serialized.length <= maxChars) {
    return normalizedFactpack;
  }

  if (!facts) {
    return normalizedFactpack;
  }

  const baseFactpack = { ...normalizedFactpack, facts: [] as unknown[] };
  let currentChars = JSON.stringify(baseFactpack).length;
  const limitedFacts: unknown[] = [];

  for (const fact of facts) {
    const factChars = JSON.stringify(fact).length + (limitedFacts.length > 0 ? 1 : 0);
    if (limitedFacts.length > 0 && currentChars + factChars > maxChars) {
      break;
    }
    limitedFacts.push(fact);
    currentChars += factChars;
  }

  return {
    ...baseFactpack,
    facts: limitedFacts,
  };
}

export function createWorkflowStagePromptPayload(options: BuildWorkflowStagePromptOptions): Record<string, unknown> {
  const {
    context,
    deliverable,
    stage,
    payload = {},
    promptKey = 'original_user_request',
    includeFlags = false,
    plannerReferenceMessage = null,
    factpackMaxChars = 8000,
    plannerReferenceKey = 'canon_reference',
    factpackKey = 'relevant_canon',
    previousDecisionsKey = 'previous_decisions',
  } = options;

  const userPrompt: Record<string, unknown> = {
    [promptKey]: context.config.prompt,
    deliverable,
    stage,
    ...payload,
  };

  if (includeFlags) {
    userPrompt.flags = context.config.flags;
  }

  if (plannerReferenceMessage && context.stageResults.planner) {
    userPrompt[plannerReferenceKey] = plannerReferenceMessage;
  } else if (context.factpack) {
    userPrompt[factpackKey] = createMinimalFactpack(context.factpack, factpackMaxChars);
  }

  if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
    userPrompt[previousDecisionsKey] = context.previousDecisions;
  }

  return userPrompt;
}

export function buildWorkflowStagePrompt(options: BuildWorkflowStagePromptOptions): string {
  return JSON.stringify(createWorkflowStagePromptPayload(options), null, 2);
}
