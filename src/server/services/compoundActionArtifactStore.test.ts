import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  advanceCompoundActionArtifact,
  COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION,
  COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS,
  COMPOUND_ACTION_CONTRACTS,
  compileCompoundActionRequirementProjection,
  createCompoundActionArtifact,
  readActiveCompoundActionArtifact,
  readStagedCompoundActionInstruction,
  resolveCompoundReplayStoryCheckpoint,
  resolveCompoundReplayStoryCheckpointV2,
  rewindCompoundActionArtifacts,
  settleCompoundActionArtifact,
  stageCompoundActionInstruction,
  type CompoundActionArtifactRevisionDocument,
  type CompoundActionInstructionDocument,
} from './compoundActionArtifactStore.js';
import { type JsonObject, StoryWorkspaceStoreError } from './storyWorkspaceStore.js';

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function matches(record: CompoundActionArtifactRevisionDocument, filter: Filter<CompoundActionArtifactRevisionDocument>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = valueAt(record as unknown as Record<string, unknown>, key);
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
      const operator = wanted as { $gt?: unknown; $lte?: unknown; $in?: unknown[] };
      if (operator.$gt !== undefined) return Number(actual) > Number(operator.$gt);
      if (operator.$lte !== undefined) return Number(actual) <= Number(operator.$lte);
      if (operator.$in) return operator.$in.includes(actual);
    }
    return actual === wanted;
  });
}

function memoryCollection() {
  const documents: CompoundActionArtifactRevisionDocument[] = [];
  const api = {
    async findOne(filter: Filter<CompoundActionArtifactRevisionDocument>, options?: { sort?: { revision?: number } }) {
      const selected = documents.filter((document) => matches(document, filter));
      if (options?.sort?.revision) selected.sort((left, right) => right.revision - left.revision);
      return selected[0] ? structuredClone(selected[0]) : null;
    },
    async insertOne(document: CompoundActionArtifactRevisionDocument) {
      const duplicate = documents.some((candidate) => candidate.userId === document.userId
        && candidate.campaignId === document.campaignId
        && (candidate.idempotencyKey === document.idempotencyKey
          || candidate.programId === document.programId && candidate.revision === document.revision));
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<CompoundActionArtifactRevisionDocument>) {
      let selected = documents.filter((document) => matches(document, filter));
      const cursor = {
        sort(sort: { revision?: number }) {
          if (sort.revision) selected = selected.sort((left, right) => right.revision - left.revision);
          return cursor;
        },
        limit(limit: number) {
          selected = selected.slice(0, limit);
          return cursor;
        },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
    async updateMany(filter: Filter<CompoundActionArtifactRevisionDocument>, update: { $set: Partial<CompoundActionArtifactRevisionDocument> }) {
      let modifiedCount = 0;
      for (const document of documents) {
        if (!matches(document, filter)) continue;
        Object.assign(document, structuredClone(update.$set));
        modifiedCount += 1;
      }
      return { acknowledged: true, matchedCount: modifiedCount, modifiedCount };
    },
  };
  return { records: api as unknown as Collection<CompoundActionArtifactRevisionDocument>, documents };
}

function instructionMemoryCollection() {
  const documents: CompoundActionInstructionDocument[] = [];
  const records = {
    async findOne(filter: Filter<CompoundActionInstructionDocument>) {
      return structuredClone(documents.find((document) => Object.entries(filter).every(([key, wanted]) => (
        valueAt(document as unknown as Record<string, unknown>, key) === wanted
      ))) ?? null);
    },
    async insertOne(document: CompoundActionInstructionDocument) {
      const duplicate = documents.some((candidate) => candidate.userId === document.userId
        && candidate.campaignId === document.campaignId
        && (candidate.interactionId === document.interactionId || candidate.idempotencyKey === document.idempotencyKey));
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<CompoundActionInstructionDocument>) {
      let selected = documents.filter((document) => matches(
        document as unknown as CompoundActionArtifactRevisionDocument,
        filter as unknown as Filter<CompoundActionArtifactRevisionDocument>,
      ));
      const cursor = {
        limit(limit: number) {
          selected = selected.slice(0, limit);
          return cursor;
        },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
  };
  return { records: records as unknown as Collection<CompoundActionInstructionDocument>, documents };
}

function instruction(exactText = 'I hide, distract the cart crew, then search the cart if they leave.') {
  return {
    schemaVersion: 'gma.player-instruction-artifact/1',
    instructionRef: 'instruction:turn-42',
    interactionId: 'interaction:turn-42',
    exactText,
    utf8Bytes: Buffer.byteLength(exactText, 'utf8'),
    instructionFingerprint: createHash('sha256').update(exactText, 'utf8').digest('hex'),
  };
}

function program(boundInstruction = instruction()) {
  return {
    schemaVersion: 'gma.semantic-action-program/2',
    programId: 'program:turn-42', interactionId: boundInstruction.interactionId,
    instructionRef: boundInstruction.instructionRef, instructionBytes: boundInstruction.utf8Bytes,
    instructionFingerprint: boundInstruction.instructionFingerprint, status: 'planned',
    authorityBase: { campaignId: 'campaign-a', storyWorkspaceRevision: 7, sceneRevision: 4, vcsCharacterRevision: 12 },
    planner: { source: 'minimal_semantic_model', policyVersion: 'gma.semantic-action-planner-policy/2', confidence: 0.93 },
    nodes: [{
      nodeId: 'node:hide', ordinal: 0, kind: 'attempt', summary: 'Hide near the cart.',
      evidenceSpans: [{ start: 0, end: 6 }], dependsOn: [], condition: null,
      authorityRequirements: ['vcs'], dataRequirements: [{ dimension: 'how', kind: 'character_capability', query: 'Stealth' }],
      completionBoundary: 'Concealment is adjudicated.', lifecycle: 'ready', result: null,
    }, {
      nodeId: 'node:search', ordinal: 1, kind: 'conditional_attempt', summary: 'Search if the crew leaves.',
      evidenceSpans: [{ start: 39, end: boundInstruction.utf8Bytes }], dependsOn: ['node:hide'],
      condition: { type: 'after_succeeded', actionRef: 'node:hide' }, authorityRequirements: ['gmc'],
      dataRequirements: [{ dimension: 'what', kind: 'story_fact', query: 'cart cargo' }],
      completionBoundary: 'The load is identified.', lifecycle: 'queued', result: null,
    }], clarification: null, limits: { nodeCount: 2, dependencyCount: 1, maximumDepth: 2 },
  };
}

function parallelProgram(boundInstruction = instruction()) {
  const base = program(boundInstruction);
  return {
    ...base,
    schemaVersion: 'gma.semantic-action-program/5',
    planner: {
      source: 'semantic_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/9',
      confidence: 0.99, evidenceAnchorNormalizationCount: 0, parallelInformationGroupCount: 0,
    },
    nodes: [
      { ...base.nodes[0], nodeId: 'intent-telepathic-message', ordinal: 1, dependsOn: [], condition: null, parallelWith: ['intent-rat-speaking-ruse'] },
      { ...base.nodes[1], nodeId: 'intent-rat-speaking-ruse', ordinal: 2, dependsOn: [], condition: null, parallelWith: ['intent-telepathic-message'] },
    ],
    limits: { nodeCount: 2, dependencyCount: 0, parallelRelationshipCount: 1, maximumDepth: 1 },
  };
}

function parallelCursor(revision = 1) {
  return {
    ...cursor(revision),
    readyNodeRefs: ['intent-telepathic-message', 'intent-rat-speaking-ruse'],
    remainingNodeRefs: [],
  };
}

function cursor(revision: number, completedNodeRefs: string[] = []) {
  return {
    schemaVersion: 'gma.action-program-cursor/1', programId: 'program:turn-42', revision,
    completedNodeRefs, readyNodeRefs: completedNodeRefs.length ? ['node:search'] : ['node:hide'],
    remainingNodeRefs: completedNodeRefs.length ? [] : ['node:search'], skippedNodeRefs: [], waiting: null,
    authorityHead: { storyWorkspaceRevision: 7, sceneRevision: 4, vcsCharacterRevision: 12 }, receiptRefs: [],
  };
}

function createInput() {
  const exact = instruction();
  return {
    userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:turn-42',
    instruction: exact, program: program(exact), cursor: cursor(1),
    timelineAnchor: { messageId: 'message-42', sequence: 42 },
  };
}

function replayCreateInput({
  programId,
  interactionId,
  storyWorkspaceRevision,
  sequence = 43,
  replayLineageId,
}: {
  programId: string;
  interactionId: string;
  storyWorkspaceRevision: number;
  sequence?: number;
  replayLineageId?: string;
}) {
  const exact = {
    ...instruction(),
    instructionRef: `instruction:${interactionId}`,
    interactionId,
  };
  const semanticProgram = {
    ...program(exact),
    programId,
    authorityBase: {
      campaignId: 'campaign-a', storyWorkspaceRevision, sceneRevision: 4, vcsCharacterRevision: 12,
    },
  };
  const programCursor = {
    ...cursor(1),
    programId,
    authorityHead: { storyWorkspaceRevision, sceneRevision: 4, vcsCharacterRevision: 12 },
  };
  return {
    userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: `create:${programId}`,
    instruction: exact, program: semanticProgram, cursor: programCursor,
    timelineAnchor: { messageId: `message:${interactionId}`, sequence, ...(replayLineageId ? { replayLineageId } : {}) },
  };
}

function storyRef(revision: number, payloadHash = 'a'.repeat(64)) {
  return {
    contractVersion: 'gmc.story-workspace-ref/1' as const,
    campaignId: 'campaign-a', workspaceId: 'story-workspace:campaign-a', revision, payloadHash,
  };
}

async function stageReplayOrigin(
  store: ReturnType<typeof instructionMemoryCollection>,
  artifactInput: ReturnType<typeof replayCreateInput>,
  replayLineageId: string,
  revision: number,
) {
  return stageCompoundActionInstruction({
    userId: artifactInput.userId,
    campaignId: artifactInput.campaignId,
    idempotencyKey: `stage:${artifactInput.instruction.interactionId}`,
    instruction: artifactInput.instruction,
    expectedStoryWorkspaceRef: storyRef(revision),
    timelineAnchor: { ...artifactInput.timelineAnchor, replayLineageId },
  }, store.records, async () => ({ storyWorkspaceRef: storyRef(revision) }));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function saga(revision: number, state: 'unsettled' | 'settled', receiptRef: string | null = null, settlementDisposition: 'checkpointed' | 'committed' | null = null): JsonObject {
  return {
    schemaVersion: 'gma.action-saga/1', sagaId: 'saga:turn-42', programId: 'program:turn-42', interactionId: 'interaction:turn-42',
    instructionFingerprint: instruction().instructionFingerprint, artifactRevision: revision, cursorRevision: revision,
    rewindLineageId: 'rewind-lineage:turn-42', foregroundModelOperationCount: 2,
    operations: [{
      operationId: 'operation:vcs:rat-form', owner: 'vcs', operationKind: 'activate_familiar_form',
      idempotencyKey: 'operation-key:vcs:rat-form', expectedOwnerRevision: 7, requestFingerprint: 'a'.repeat(64),
      disposition: 'committed', receiptRef: 'vcs:receipt:rat-form', resultingRevision: 8, attemptCount: 1, reconciliationCount: 0,
      statusLookupMethod: 'vcs_observation_operation_get', dependencyReceiptRefs: [],
    }, ...(settlementDisposition ? [{
      operationId: 'operation:gmc:settle-presentation', owner: 'gmc', operationKind: 'settle_observation_presentation',
      idempotencyKey: 'settle:v4:turn-42', expectedOwnerRevision: 2, requestFingerprint: 'b'.repeat(64),
      disposition: settlementDisposition, receiptRef: settlementDisposition === 'committed' ? receiptRef : null,
      resultingRevision: settlementDisposition === 'committed' ? 3 : null, attemptCount: settlementDisposition === 'committed' ? 1 : 0,
      reconciliationCount: settlementDisposition === 'committed' ? 1 : 0,
      statusLookupMethod: 'gmc_action_saga_operation_get', dependencyReceiptRefs: ['vcs:receipt:rat-form'],
    }] : [])],
    acceptedOwnerReceiptRefs: ['vcs:receipt:rat-form'], acceptedModelCandidateRefs: [],
    presentationSettlement: { state, receiptRef }, normalizedFailureLineage: null,
  };
}

describe('GMC compound-action private artifact store', () => {
  it('advertises artifact-store /2 and atomically stores the valid reciprocal program /5', async () => {
    expect(COMPOUND_ACTION_ARTIFACT_STORE_CONTRACT_VERSION).toBe('gmc.compound-action-artifact-store/2');
    expect(COMPOUND_ACTION_ARTIFACT_STORE_READABLE_PROGRAMS).toEqual([
      'gma.semantic-action-program/2',
      'gma.semantic-action-program/4',
      'gma.semantic-action-program/5',
    ]);
    expect(Object.values(COMPOUND_ACTION_CONTRACTS)).not.toContain('gma.semantic-action-program/5');
    const exact = instruction();
    const store = memoryCollection();
    const input = {
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:parallel:turn-42',
      instruction: exact, program: parallelProgram(exact), cursor: parallelCursor(),
    };
    const created = await createCompoundActionArtifact(input, store.records);
    expect(created).toMatchObject({ duplicate: false, artifactRef: { revision: 1, programId: 'program:turn-42' } });
    const replay = await createCompoundActionArtifact(input, store.records);
    expect(replay).toEqual({ ...created, duplicate: true });
    const active = await readActiveCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42',
    }, store.records);
    expect(active?.artifact.program).toMatchObject({
      schemaVersion: 'gma.semantic-action-program/5',
      planner: { policyVersion: 'gma.semantic-action-compiler-policy/9' },
      limits: { parallelRelationshipCount: 1 },
    });
    expect((((active?.artifact.program ?? {}) as JsonObject).nodes as JsonObject[]).map((node) => node.parallelWith)).toEqual([
      ['intent-rat-speaking-ruse'], ['intent-telepathic-message'],
    ]);
  });

  it('keeps an already-prepared policy-8 reciprocal program /5 readable during the policy-9 rollout', async () => {
    const exact = instruction();
    const historicalProgram = parallelProgram(exact);
    historicalProgram.planner.policyVersion = 'gma.semantic-action-compiler-policy/8';
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:historical-parallel:turn-42',
      instruction: exact, program: historicalProgram, cursor: parallelCursor(),
    }, memoryCollection().records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });
  });

  it('rejects malformed program /5 parallel graphs without storing a partial artifact', async () => {
    const exact = instruction();
    const variants = [
      (candidate: JsonObject) => { delete (candidate.nodes as JsonObject[])[0].parallelWith; },
      (candidate: JsonObject) => { (candidate.nodes as JsonObject[])[0].parallelWith = ['missing-node']; },
      (candidate: JsonObject) => { (candidate.nodes as JsonObject[])[0].parallelWith = ['intent-telepathic-message']; },
      (candidate: JsonObject) => { (candidate.nodes as JsonObject[])[1].parallelWith = []; },
      (candidate: JsonObject) => { (candidate.nodes as JsonObject[])[0].parallelWith = ['intent-rat-speaking-ruse', 'intent-rat-speaking-ruse']; },
      (candidate: JsonObject) => { (candidate.limits as JsonObject).parallelRelationshipCount = 0; },
      (candidate: JsonObject) => { (candidate.planner as JsonObject).policyVersion = 'gma.semantic-action-compiler-policy/7'; },
    ];
    for (const [index, mutate] of variants.entries()) {
      const store = memoryCollection();
      const candidate = structuredClone(parallelProgram(exact)) as unknown as JsonObject;
      mutate(candidate);
      await expect(createCompoundActionArtifact({
        userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: `create:invalid-parallel:${index}`,
        instruction: exact, program: candidate, cursor: parallelCursor(),
      }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });
      expect(store.documents).toHaveLength(0);
    }
  });

  it('stages exact instruction bytes idempotently before semantic planning', async () => {
    const store = instructionMemoryCollection();
    const staged = await stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:turn-42', instruction: instruction(),
    }, store.records);
    const replay = await stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:turn-42', instruction: instruction(),
    }, store.records);
    expect(staged.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect((await readStagedCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', interactionId: 'interaction:turn-42',
    }, store.records))?.instruction).toEqual(instruction());
    await expect(stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:turn-42', instruction: instruction('changed'),
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_IDEMPOTENCY_CONFLICT' });
  });

  it('atomically binds a staged instruction to the exact active Story origin and rejects stale authority', async () => {
    const store = instructionMemoryCollection();
    const exact = instruction();
    const staged = await stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:origin', instruction: exact,
      expectedStoryWorkspaceRef: storyRef(7),
      timelineAnchor: { messageId: 'message-42', sequence: 42, replayLineageId: 'lineage-42' },
    }, store.records, async () => ({ storyWorkspaceRef: storyRef(7) }));
    expect(staged).toMatchObject({
      duplicate: false,
      originCheckpoint: {
        contractVersion: 'gmc.compound-action-origin-checkpoint/1',
        storyWorkspaceRef: { revision: 7 }, replayLineageId: 'lineage-42', timelineSequence: 42,
        interactionId: exact.interactionId, instructionFingerprint: exact.instructionFingerprint,
      },
    });
    const replay = await stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:origin', instruction: exact,
      expectedStoryWorkspaceRef: storyRef(7),
      timelineAnchor: { messageId: 'message-42', sequence: 42, replayLineageId: 'lineage-42' },
    }, store.records, async () => ({ storyWorkspaceRef: storyRef(12) }));
    expect(replay).toEqual({ ...staged, duplicate: true });

    await expect(stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:stale',
      instruction: { ...exact, instructionRef: 'instruction:stale', interactionId: 'interaction:stale' },
      expectedStoryWorkspaceRef: storyRef(7),
      timelineAnchor: { messageId: 'message-stale', sequence: 43, replayLineageId: 'lineage-stale' },
    }, store.records, async () => ({ storyWorkspaceRef: storyRef(12) })))
      .rejects.toMatchObject({ code: 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_CONFLICT' });
    expect(store.documents).toHaveLength(1);
  });

  it('creates a program only when its Story base and timeline match the staged origin checkpoint', async () => {
    const artifacts = memoryCollection();
    const instructions = instructionMemoryCollection();
    const input = replayCreateInput({
      programId: 'program:origin-bound', interactionId: 'interaction:origin-bound',
      storyWorkspaceRevision: 7, replayLineageId: 'lineage:origin-bound',
    });
    const staged = await stageReplayOrigin(instructions, input, 'lineage:origin-bound', 7);
    await expect(createCompoundActionArtifact({
      ...input, originCheckpoint: staged.originCheckpoint,
    }, artifacts.records, instructions.records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });

    const mismatched = replayCreateInput({
      programId: 'program:origin-mismatch', interactionId: 'interaction:origin-mismatch',
      storyWorkspaceRevision: 12, replayLineageId: 'lineage:origin-mismatch',
    });
    const mismatchOrigin = await stageReplayOrigin(instructions, mismatched, 'lineage:origin-mismatch', 7);
    await expect(createCompoundActionArtifact({
      ...mismatched, originCheckpoint: mismatchOrigin.originCheckpoint,
    }, artifacts.records, instructions.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_ORIGIN_CHECKPOINT_MISMATCH' });
  });
  it('persists an exact instruction once, returns only a reference on write, and isolates owners', async () => {
    const store = memoryCollection();
    const seeded = { ...createInput(), clarifications: [{ kind: 'provider_operation_ledger', total: 1, sinceCheckpoint: 1, checkpoint: 0 }] };
    const first = await createCompoundActionArtifact(seeded, store.records);
    const replay = await createCompoundActionArtifact(seeded, store.records);
    expect(first).toMatchObject({ duplicate: false, artifactRef: { revision: 1, status: 'available' } });
    expect(first).not.toHaveProperty('artifact.instruction.exactText');
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0].redactedAudit).not.toHaveProperty('exactText');
    expect((await readActiveCompoundActionArtifact({ userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records))?.artifact.instruction)
      .toMatchObject({ exactText: createInput().instruction.exactText });
    expect((await readActiveCompoundActionArtifact({ userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records))?.artifact.clarifications)
      .toEqual(seeded.clarifications);
    expect(await readActiveCompoundActionArtifact({ userId: 'tenant-b', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records)).toBeNull();
  });

  it('advances by CAS, preserves immutable receipts, and rejects a stale concurrent writer', async () => {
    const store = memoryCollection();
    await createCompoundActionArtifact(createInput(), store.records);
    const receipt = {
      schemaVersion: 'gma.action-execution-receipt/1', receiptId: 'receipt:hide', programId: 'program:turn-42',
      nodeId: 'node:hide', lifecycle: 'settled', result: 'succeeded', authorityReceipts: [],
      observableFacts: ['Kerrigan remains unseen.'], deferredEffects: [], narrationConstraints: [], timeAdvance: { seconds: 6 },
    };
    const advanced = await advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'advance:turn-42:2', cursor: cursor(2, ['node:hide']), appendReceipts: [receipt],
    }, store.records);
    expect(advanced).toMatchObject({ artifactRef: { revision: 2 }, duplicate: false });
    const replay = await advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'advance:turn-42:2', cursor: cursor(2, ['node:hide']), appendReceipts: [receipt],
    }, store.records);
    expect(replay).toEqual({ ...advanced, duplicate: true });
    await expect(advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'advance:stale', cursor: cursor(2, ['node:hide']),
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_REVISION_CONFLICT' });
    await expect(advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 2,
      idempotencyKey: 'advance:mutated-receipt', cursor: cursor(3, ['node:hide']),
      appendReceipts: [{ ...receipt, result: 'failed' }],
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_RECEIPT_CONFLICT' });
  });

  it('stores program /4 saga checkpoints and atomically settles receipt /2 with the cursor', async () => {
    const store = memoryCollection();
    const exact = instruction();
    const v4Program = { ...program(exact), schemaVersion: 'gma.semantic-action-program/4' };
    await createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:v4:turn-42',
      instruction: exact, program: v4Program, cursor: cursor(1), saga: saga(1, 'unsettled'),
    }, store.records);
    const receipt = {
      schemaVersion: 'gma.action-execution-receipt/2', receiptId: 'receipt:presentation:hide', programId: 'program:turn-42',
      nodeId: 'node:hide', lifecycle: 'settled', result: 'succeeded', authorityReceipts: ['vcs:receipt:rat-form'],
      observationGroups: [], outcomeBindings: [], finalAuthorityHeads: { vcs: 8, gmc: 7 },
      presentationBindings: [{ outcomeId: 'outcome:hide', claimRef: 'claim:hide' }], idempotencyLineage: ['operation-key:vcs:rat-form'],
    };
    const secondReceipt = {
      ...receipt,
      receiptId: 'receipt:presentation:search',
      nodeId: 'node:search',
      presentationBindings: [{ outcomeId: 'outcome:search', claimRef: 'claim:search' }],
    };
    await advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'checkpoint:settlement:v4:turn-42', cursor: cursor(2),
      saga: saga(2, 'unsettled', null, 'checkpointed'),
    }, store.records);
    const settledSaga = saga(3, 'settled', receipt.receiptId, 'committed');
    const settledCursor = {
      ...cursor(3, ['node:hide']),
      completedNodeRefs: ['node:hide', 'node:search'], readyNodeRefs: [], remainingNodeRefs: [],
    };
    const settled = await settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 2,
      idempotencyKey: 'settle:v4:turn-42', cursor: settledCursor, executionReceipt: receipt,
      executionReceipts: [receipt, secondReceipt], saga: settledSaga,
    }, store.records);
    expect(settled).toMatchObject({ duplicate: false, artifactRef: { revision: 3 } });
    const active = await readActiveCompoundActionArtifact({ userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records);
    expect(active?.artifact).toMatchObject({
      cursor: { revision: 3, completedNodeRefs: ['node:hide', 'node:search'] },
      receipts: [{ receiptId: receipt.receiptId }, { receiptId: secondReceipt.receiptId }],
      saga: { presentationSettlement: { state: 'settled' } },
    });
    const replay = await settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 2,
      idempotencyKey: 'settle:v4:turn-42', cursor: settledCursor, executionReceipt: receipt,
      executionReceipts: [receipt, secondReceipt], saga: settledSaga,
    }, store.records);
    expect(replay).toEqual({ ...settled, duplicate: true });
    await expect(settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 3,
      idempotencyKey: 'settle:v4:mismatched-primary', cursor: settledCursor, executionReceipt: receipt,
      executionReceipts: [secondReceipt, receipt], saga: settledSaga,
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_SETTLEMENT_INVALID' });
    await expect(settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 3,
      idempotencyKey: 'settle:v4:duplicate-receipt', cursor: settledCursor, executionReceipt: receipt,
      executionReceipts: [receipt, receipt], saga: settledSaga,
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_SETTLEMENT_INVALID' });
    await expect(settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 3,
      idempotencyKey: 'settle:v4:mixed-program', cursor: settledCursor, executionReceipt: receipt,
      executionReceipts: [receipt, { ...secondReceipt, programId: 'program:other' }], saga: settledSaga,
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_SETTLEMENT_INVALID' });
    await expect(settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 3,
      idempotencyKey: 'settle:v4:bad', cursor: cursor(4, ['node:hide']), executionReceipt: receipt,
      saga: saga(4, 'unsettled'),
    }, store.records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_SETTLEMENT_INVALID' });
  });

  it('stores one fingerprint-bound accepted model candidate and rejects candidate drift', async () => {
    const exact = instruction();
    const candidate = { schemaVersion: 'gma.current-scene-narration-result/8', responseText: 'The worker is visibly human.' };
    const candidateFingerprint = createHash('sha256').update(canonicalJson(candidate), 'utf8').digest('hex');
    const candidateSaga = saga(1, 'unsettled');
    candidateSaga.acceptedModelCandidateRefs = [candidateFingerprint];
    candidateSaga.pendingModelCandidate = {
      schemaVersion: 'gma.accepted-model-candidate/1', kind: 'observation_narration', operationKey: 'narration:turn-42',
      inputFingerprint: 'c'.repeat(64), candidateFingerprint, candidate,
    };
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:candidate:turn-42',
      instruction: exact, program: { ...program(exact), schemaVersion: 'gma.semantic-action-program/4' }, cursor: cursor(1), saga: candidateSaga,
    }, memoryCollection().records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });

    const tampered = structuredClone(candidateSaga);
    ((tampered.pendingModelCandidate as Record<string, unknown>).candidate as Record<string, unknown>).responseText = 'Different text.';
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:tampered-candidate:turn-42',
      instruction: exact, program: { ...program(exact), schemaVersion: 'gma.semantic-action-program/4' }, cursor: cursor(1), saga: tampered,
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_SAGA_INVALID' });

    const storyCandidate = {
      schemaVersion: 'gma.compound-story-settlement-candidate/1',
      programId: 'program:turn-42',
      responseText: 'The scraper catches stone, giving Kerrigan one precise sound window.',
    };
    const storyFingerprint = createHash('sha256').update(canonicalJson(storyCandidate), 'utf8').digest('hex');
    const storySaga = saga(1, 'unsettled');
    storySaga.acceptedModelCandidateRefs = [storyFingerprint];
    storySaga.pendingModelCandidate = {
      schemaVersion: 'gma.accepted-model-candidate/2', kind: 'story_narration', operationKey: 'story-narration:turn-42',
      inputFingerprint: 'd'.repeat(64), candidateFingerprint: storyFingerprint, candidate: storyCandidate,
    };
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:story-candidate:turn-42',
      instruction: exact, program: { ...program(exact), schemaVersion: 'gma.semantic-action-program/4' }, cursor: cursor(1), saga: storySaga,
    }, memoryCollection().records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });
  });

  it('uses the shared 24 KiB observation-program bound without widening legacy programs', async () => {
    const exact = instruction();
    const padding = 'x'.repeat(17_000);
    const observationProgram = { ...program(exact), schemaVersion: 'gma.semantic-action-program/4', observationContractPadding: padding };
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:bounded-v4:turn-42',
      instruction: exact, program: observationProgram, cursor: cursor(1), saga: saga(1, 'unsettled'),
    }, memoryCollection().records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:oversized-v2:turn-42',
      instruction: exact, program: { ...program(exact), observationContractPadding: padding }, cursor: cursor(1),
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_TOO_LARGE' });
  });

  it('accepts a policy-9 observation program with five outcomes after lossless binding compaction and rejects post-normalization overflow', async () => {
    const exact = instruction();
    const base = program(exact);
    const outcomes = ['drain-contents', 'drain-presence', 'worker-surface', 'worker-class', 'worker-distance'];
    const compactProgram = {
      ...base,
      schemaVersion: 'gma.semantic-action-program/4',
      planner: {
        source: 'semantic_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/9', confidence: 1,
        evidenceAnchorNormalizationCount: 0, parallelInformationGroupCount: 0, observationBindingCompactionCount: 10,
      },
      nodes: base.nodes.map((node, index) => index === 0 ? {
        ...node,
        dataRequirements: Array.from({ length: 7 }, (_, requirementIndex) => ({
          dimension: 'how', kind: 'character_capability', query: `preserved prerequisite ${requirementIndex + 1}`,
        })),
      } : {
        ...node,
        dataRequirements: outcomes.map((outcomeId) => ({
          dimension: outcomeId === 'worker-distance' ? 'where' : 'what', kind: 'observation', query: outcomeId,
          observation: { outcomeId },
        })),
        observationGroups: [
          { groupId: 'group:rat', outcomeIds: outcomes.slice(0, 4) },
          { groupId: 'group:player', outcomeIds: outcomes.slice(4) },
        ],
      }),
    };
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:policy-7-compact',
      instruction: exact, program: compactProgram, cursor: cursor(1), saga: saga(1, 'unsettled'),
    }, memoryCollection().records)).resolves.toMatchObject({ artifactRef: { revision: 1 } });

    const overbound = structuredClone(compactProgram);
    (overbound.nodes[0].dataRequirements as JsonObject[]).push(...Array.from({ length: 5 }, (_, index) => ({
      dimension: 'how', kind: 'character_capability', query: `overflow ${index + 1}`,
    })));
    await expect(createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'create:policy-7-overbound',
      instruction: exact, program: overbound, cursor: cursor(1), saga: saga(1, 'unsettled'),
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_TOO_LARGE' });
  });

  it('accepts shared prerequisite group unions distributed across downstream observation nodes', async () => {
    const exact = instruction();
    const base = program(exact);
    const node = (nodeId: string, dependsOn: string[], observationGroups: JsonObject[] = [], observationPrerequisite: JsonObject | null = null) => ({
      ...base.nodes[0], nodeId, dependsOn, observationGroups, observationPrerequisite,
      dataRequirements: [], evidenceSpans: [{ start: 0, end: 1 }],
    });
    const prerequisite = (owner: 'gmc' | 'vcs', operationKind: 'establish_observer_viewpoint' | 'activate_familiar_form') => ({
      schemaVersion: 'gma.observation-prerequisite/1', owner, operationKind,
      dependentObservationNodeRefs: ['observe-drain', 'observe-worker'],
      groupRefs: ['group:drain', 'group:worker'],
    });
    const observationProgram = {
      ...base,
      schemaVersion: 'gma.semantic-action-program/4',
      nodes: [
        node('activate-rat-form', [], [], prerequisite('vcs', 'activate_familiar_form')),
        node('move-rat', ['activate-rat-form'], [], prerequisite('gmc', 'establish_observer_viewpoint')),
        node('observe-drain', ['move-rat'], [{ groupId: 'group:drain' }]),
        node('observe-worker', ['move-rat'], [{ groupId: 'group:worker' }]),
        node('measure-worker-distance', [], [{ groupId: 'group:distance' }]),
      ],
    };
    const observationCursor = {
      ...cursor(1),
      completedNodeRefs: [],
      readyNodeRefs: ['activate-rat-form', 'measure-worker-distance'],
      remainingNodeRefs: ['move-rat', 'observe-drain', 'observe-worker'],
      skippedNodeRefs: [],
    };
    const create = (candidate: JsonObject, idempotencyKey: string) => createCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey,
      instruction: exact, program: candidate, cursor: observationCursor, saga: saga(1, 'unsettled'),
    }, memoryCollection().records);

    await expect(create(observationProgram, 'create:distributed-groups')).resolves.toMatchObject({ artifactRef: { revision: 1 } });

    const orphanGroup = structuredClone(observationProgram);
    ((orphanGroup.nodes[0].observationPrerequisite as JsonObject).groupRefs as string[]).push('group:outside');
    await expect(create(orphanGroup, 'create:orphan-group')).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });

    const uncoveredDependent = structuredClone(observationProgram);
    (uncoveredDependent.nodes[0].observationPrerequisite as JsonObject).groupRefs = ['group:drain'];
    await expect(create(uncoveredDependent, 'create:uncovered-dependent')).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });

    const duplicateGroup = structuredClone(observationProgram);
    ((duplicateGroup.nodes[0].observationPrerequisite as JsonObject).groupRefs as string[]).push('group:drain');
    await expect(create(duplicateGroup, 'create:duplicate-group')).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });

    const duplicateDependent = structuredClone(observationProgram);
    ((duplicateDependent.nodes[0].observationPrerequisite as JsonObject).dependentObservationNodeRefs as string[]).push('observe-drain');
    await expect(create(duplicateDependent, 'create:duplicate-dependent')).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });

    const duplicateOwner = structuredClone(observationProgram);
    (duplicateOwner.nodes[3].observationGroups as JsonObject[]).push({ groupId: 'group:drain' });
    await expect(create(duplicateOwner, 'create:duplicate-owner')).rejects.toMatchObject({ code: 'COMPOUND_ACTION_PROGRAM_INVALID' });
  });

  it('rewinds later interaction revisions and restores the latest revision at the boundary', async () => {
    const store = memoryCollection();
    await createCompoundActionArtifact(createInput(), store.records);
    await advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'advance:turn-42:2', cursor: cursor(2, ['node:hide']),
    }, store.records);
    store.documents[1].timelineAnchor = { messageId: 'message-44', sequence: 44 };
    const rewound = await rewindCompoundActionArtifacts({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42, rewindId: 'rewind:43',
    }, store.records);
    expect(rewound).toMatchObject({ inactivatedRevisionCount: 1, restoredProgramCount: 1, authoritativeStateChanged: false });
    expect((await readActiveCompoundActionArtifact({ userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records))?.artifactRef.revision).toBe(1);
  });

  it('resolves an exact Replay lineage to the original GMC Story authority base despite a later contaminated attempt', async () => {
    const store = memoryCollection();
    const instructions = instructionMemoryCollection();
    const original = replayCreateInput({
      programId: 'program:original', interactionId: 'interaction:original', storyWorkspaceRevision: 7,
      replayLineageId: 'replay-lineage:second-mouth',
    });
    const later = replayCreateInput({
      programId: 'program:later', interactionId: 'interaction:later', storyWorkspaceRevision: 12,
      replayLineageId: 'replay-lineage:second-mouth',
    });
    await stageReplayOrigin(instructions, original, 'replay-lineage:second-mouth', 7);
    await stageReplayOrigin(instructions, later, 'replay-lineage:second-mouth', 12);
    await createCompoundActionArtifact(original, store.records);
    store.documents[0].status = 'inactive';
    await createCompoundActionArtifact(later, store.records);

    const checkpoint = await resolveCompoundReplayStoryCheckpoint({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
      replayLineageId: 'replay-lineage:second-mouth', programId: 'program:later',
      observedSurvivingStoryWorkspaceRef: { revision: 12, payloadHash: 'c'.repeat(64) },
    }, store.records, async ({ campaignId, revision }) => ({
      storyWorkspaceRef: {
        contractVersion: 'gmc.story-workspace-ref/1' as const, campaignId,
        workspaceId: `story-workspace:${campaignId}`, revision, payloadHash: 'a'.repeat(64),
      },
    }), instructions.records);

    expect(checkpoint).toEqual({
      contractVersion: 'gmc.compound-replay-story-checkpoint/1',
      restoreStoryWorkspaceRef: {
        contractVersion: 'gmc.story-workspace-ref/1', campaignId: 'campaign-a',
        workspaceId: 'story-workspace:campaign-a', revision: 7, payloadHash: 'a'.repeat(64),
      },
      selectionMode: 'replay_lineage', matchedAnchorSequence: 43,
      matchedArtifactCount: 2, matchedProgramCount: 2, matchedOriginCount: 2,
      checkpointSource: 'instruction_stage', observedSurvivingRefAgreement: false,
    });
    expect(JSON.stringify(checkpoint)).not.toContain('exactText');
    expect(JSON.stringify(checkpoint)).not.toContain('authorityBase');
  });

  it('heals a legacy Replay from the first exact-fingerprint artifact anchor and ignores later matching actions', async () => {
    const store = memoryCollection();
    await createCompoundActionArtifact(replayCreateInput({
      programId: 'program:legacy-original', interactionId: 'interaction:legacy-original', storyWorkspaceRevision: 7,
    }), store.records);
    store.documents[0].status = 'tombstoned';
    await createCompoundActionArtifact(replayCreateInput({
      programId: 'program:legacy-replay', interactionId: 'interaction:legacy-replay', storyWorkspaceRevision: 12,
    }), store.records);
    await createCompoundActionArtifact(replayCreateInput({
      programId: 'program:unrelated-later', interactionId: 'interaction:unrelated-later', storyWorkspaceRevision: 4,
      sequence: 80,
    }), store.records);

    const checkpoint = await resolveCompoundReplayStoryCheckpoint({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
      replayLineageId: 'new-lineage-with-no-historical-record', allowLegacyFingerprintBoundary: true,
    }, store.records, async ({ campaignId, revision }) => ({
      storyWorkspaceRef: {
        contractVersion: 'gmc.story-workspace-ref/1', campaignId,
        workspaceId: `story-workspace:${campaignId}`, revision, payloadHash: 'b'.repeat(64),
      },
    }), instructionMemoryCollection().records);

    expect(checkpoint).toMatchObject({
      selectionMode: 'legacy_fingerprint_boundary', matchedAnchorSequence: 43,
      matchedArtifactCount: 2, matchedProgramCount: 2, matchedOriginCount: 0,
      checkpointSource: 'artifact_legacy',
      restoreStoryWorkspaceRef: { revision: 7 },
    });
  });

  it('does not broaden a rejected exact lineage and rejects program or immutable Story mismatches', async () => {
    const store = memoryCollection();
    const instructions = instructionMemoryCollection();
    const only = replayCreateInput({
      programId: 'program:only', interactionId: 'interaction:only', storyWorkspaceRevision: 7,
      replayLineageId: 'replay-lineage:only',
    });
    await stageReplayOrigin(instructions, only, 'replay-lineage:only', 7);
    await createCompoundActionArtifact(only, store.records);
    const base = {
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
    };
    const reader = async ({ campaignId, revision }: { campaignId: string; revision: number }) => ({
      storyWorkspaceRef: {
        contractVersion: 'gmc.story-workspace-ref/1' as const, campaignId,
        workspaceId: `story-workspace:${campaignId}`, revision, payloadHash: 'd'.repeat(64),
      },
    });

    await expect(resolveCompoundReplayStoryCheckpoint({
      ...base, replayLineageId: 'replay-lineage:missing', allowLegacyFingerprintBoundary: false,
    }, store.records, reader, instructions.records)).rejects.toMatchObject({ code: 'COMPOUND_REPLAY_CHECKPOINT_NOT_FOUND' });
    await expect(resolveCompoundReplayStoryCheckpoint({
      ...base, replayLineageId: 'replay-lineage:only', programId: 'program:other',
    }, store.records, reader, instructions.records)).rejects.toMatchObject({ code: 'COMPOUND_REPLAY_CHECKPOINT_PROGRAM_MISMATCH' });
    await expect(resolveCompoundReplayStoryCheckpoint({
      ...base, replayLineageId: 'replay-lineage:only',
    }, store.records, async () => null, instructions.records)).rejects.toMatchObject({ code: 'COMPOUND_REPLAY_CHECKPOINT_STORY_REVISION_MISSING' });
  });

  it('uses an originless lineage root and the GMC timeline even when a descendant origin is poisoned', async () => {
    const artifacts = memoryCollection();
    const instructions = instructionMemoryCollection();
    const lineage = 'interaction:legacy-root';
    const root = replayCreateInput({
      programId: 'program:legacy-root', interactionId: lineage, storyWorkspaceRevision: 7,
    });
    const poisoned = replayCreateInput({
      programId: 'program:poisoned-descendant', interactionId: 'interaction:poisoned-descendant',
      storyWorkspaceRevision: 12, replayLineageId: lineage,
    });
    await stageCompoundActionInstruction({
      userId: 'tenant-a', campaignId: 'campaign-a', idempotencyKey: 'stage:legacy-root',
      instruction: root.instruction,
    }, instructions.records);
    await stageReplayOrigin(instructions, poisoned, lineage, 12);
    await createCompoundActionArtifact(poisoned, artifacts.records);

    const checkpoint = await resolveCompoundReplayStoryCheckpointV2({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
      replayLineageId: lineage,
      observedSurvivingStoryWorkspaceRef: storyRef(7, 'f'.repeat(64)),
    }, artifacts.records, async ({ revision }) => ({
      storyWorkspaceRef: storyRef(revision, revision === 7 ? 'f'.repeat(64) : 'c'.repeat(64)),
    }), instructions.records, async () => ({
      storyWorkspaceRef: storyRef(7, 'f'.repeat(64)),
      timelineAnchor: { messageId: 'message:flintwake', sequence: 42 },
    }));

    expect(checkpoint).toEqual({
      contractVersion: 'gmc.compound-replay-story-checkpoint/2',
      restoreStoryWorkspaceRef: storyRef(7, 'f'.repeat(64)),
      selectionMode: 'legacy_owner_timeline',
      rootEvidenceMode: 'legacy_instruction',
      lineageRootInteractionId: lineage,
      matchedAnchorSequence: 42,
      matchedInstructionCount: 1,
      matchedArtifactCount: 0,
      matchedProgramCount: 0,
      observedSurvivingRefAgreement: true,
    });
    expect(JSON.stringify(checkpoint)).not.toContain('exactText');
    expect(JSON.stringify(checkpoint)).not.toContain('authorityBase');
  });

  it('uses the exact lineage-root origin and rejects observed Story disagreement', async () => {
    const artifacts = memoryCollection();
    const instructions = instructionMemoryCollection();
    const lineage = 'interaction:fresh-root';
    const root = replayCreateInput({
      programId: 'program:fresh-root', interactionId: lineage, storyWorkspaceRevision: 7,
      replayLineageId: lineage,
    });
    await stageReplayOrigin(instructions, root, lineage, 7);
    const input = {
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
      replayLineageId: lineage,
    };
    const revisionReader = async ({ revision }: { revision: number }) => ({
      storyWorkspaceRef: storyRef(revision),
    });

    await expect(resolveCompoundReplayStoryCheckpointV2({
      ...input, observedSurvivingStoryWorkspaceRef: storyRef(7),
    }, artifacts.records, revisionReader, instructions.records)).resolves.toMatchObject({
      contractVersion: 'gmc.compound-replay-story-checkpoint/2',
      selectionMode: 'root_instruction_origin', rootEvidenceMode: 'origin_instruction',
      matchedInstructionCount: 1, matchedArtifactCount: 0, matchedProgramCount: 0,
      restoreStoryWorkspaceRef: { revision: 7 }, observedSurvivingRefAgreement: true,
    });
    await expect(resolveCompoundReplayStoryCheckpointV2({
      ...input, observedSurvivingStoryWorkspaceRef: storyRef(8),
    }, artifacts.records, revisionReader, instructions.records)).rejects.toMatchObject({
      code: 'COMPOUND_REPLAY_OBSERVED_STORY_REF_MISMATCH',
    });
  });

  it('uses owner timeline state for a rootless row only after exact artifact membership', async () => {
    const artifacts = memoryCollection();
    await createCompoundActionArtifact(replayCreateInput({
      programId: 'program:rootless', interactionId: 'interaction:rootless-attempt', storyWorkspaceRevision: 12,
    }), artifacts.records);
    const checkpoint = await resolveCompoundReplayStoryCheckpointV2({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
      instructionFingerprint: instruction().instructionFingerprint,
      replayLineageId: 'interaction:missing-root', allowRootlessArtifactMembership: true,
      programId: 'program:rootless', observedSurvivingStoryWorkspaceRef: storyRef(7),
    }, artifacts.records, async ({ revision }) => ({ storyWorkspaceRef: storyRef(revision) }),
    instructionMemoryCollection().records, async () => ({
      storyWorkspaceRef: storyRef(7), timelineAnchor: { messageId: 'message:survivor', sequence: 42 },
    }));

    expect(checkpoint).toMatchObject({
      selectionMode: 'legacy_owner_timeline', rootEvidenceMode: 'artifact_membership',
      restoreStoryWorkspaceRef: { revision: 7 }, matchedInstructionCount: 0,
      matchedArtifactCount: 1, matchedProgramCount: 1,
    });
  });

  it('rejects oversized exact instructions before storage', async () => {
    const store = memoryCollection();
    const exact = instruction('x'.repeat(32_769));
    await expect(createCompoundActionArtifact({ ...createInput(), instruction: exact, program: program(exact) }, store.records))
      .rejects.toBeInstanceOf(StoryWorkspaceStoreError);
    expect(store.documents).toHaveLength(0);
  });
});

describe('GMC typed compound-action requirement projection', () => {
  it('distinguishes scene presence, location subjects, destination references, preparation debt, and VCS mechanics', () => {
    const projection = compileCompoundActionRequirementProjection({
      programId: 'program:turn-42', nodeId: 'node:search',
      requirements: [
        { dimension: 'who', kind: 'scene_presence', query: 'Cart Guard' },
        { dimension: 'where', kind: 'current_location', query: 'where Kerrigan is' },
        { dimension: 'where', kind: 'destination_location', query: 'Flintwake Wage Yard' },
        { dimension: 'what', kind: 'story_fact', query: 'unprepared cart cargo' },
        { dimension: 'how', kind: 'mechanic', query: 'Investigation check' },
      ],
      storyContext: {
        storyWorkspaceRef: { revision: 7 },
        playableSceneContext: { sceneKit: { locationRef: 'location:cart-route', participants: { present: [{ entityId: 'npc:guard', publicLabel: 'Cart Guard' }] } } },
        privateSceneContext: {},
      },
      currentScene: { _id: 'scene:cart', locationId: 'location:cart-route', revision: 4 },
      entities: [{ _id: 'location:flintwake', type: 'location', canonical_name: 'Flintwake Wage Yard', revision: 9 }],
      facts: [],
    });
    expect(projection.requirementResults.map((entry) => [entry.kind, entry.status, entry.authority])).toEqual([
      ['scene_presence', 'resolved', 'gmc'],
      ['current_location', 'resolved', 'gmc'],
      ['destination_location', 'resolved', 'gmc'],
      ['story_fact', 'unresolved', 'gmc'],
      ['mechanic', 'unresolved', 'vcs'],
    ]);
    expect(JSON.stringify(projection)).not.toContain('privateSceneContext');
  });

  it('does not treat a location mentioned as a dialogue subject as movement', () => {
    const projection = compileCompoundActionRequirementProjection({
      programId: 'program:dialogue', nodeId: 'node:ask',
      requirements: [{ dimension: 'what', kind: 'story_fact', query: 'where Dorrik is from' }],
      storyContext: { storyWorkspaceRef: { revision: 8 }, playableSceneContext: { sceneKit: { locationRef: 'location:flintwake' } } },
      currentScene: { locationId: 'location:flintwake', revision: 5 }, facts: [], entities: [],
    });
    expect(projection.requirementResults[0]).toMatchObject({ kind: 'story_fact', status: 'unresolved' });
    expect(projection.requirementResults[0].sourceRefs).toEqual([]);
  });
});
