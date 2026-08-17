import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  advanceCompoundActionArtifact,
  compileCompoundActionRequirementProjection,
  createCompoundActionArtifact,
  readActiveCompoundActionArtifact,
  readStagedCompoundActionInstruction,
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
    await advanceCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 1,
      idempotencyKey: 'checkpoint:settlement:v4:turn-42', cursor: cursor(2),
      saga: saga(2, 'unsettled', null, 'checkpointed'),
    }, store.records);
    const settledSaga = saga(3, 'settled', receipt.receiptId, 'committed');
    const settled = await settleCompoundActionArtifact({
      userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42', expectedRevision: 2,
      idempotencyKey: 'settle:v4:turn-42', cursor: cursor(3, ['node:hide']), executionReceipt: receipt, saga: settledSaga,
    }, store.records);
    expect(settled).toMatchObject({ duplicate: false, artifactRef: { revision: 3 } });
    const active = await readActiveCompoundActionArtifact({ userId: 'tenant-a', campaignId: 'campaign-a', programId: 'program:turn-42' }, store.records);
    expect(active?.artifact).toMatchObject({ cursor: { revision: 3 }, receipts: [{ receiptId: receipt.receiptId }], saga: { presentationSettlement: { state: 'settled' } } });
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

  it('accepts a policy-7 observation program with five outcomes after lossless binding compaction and rejects post-normalization overflow', async () => {
    const exact = instruction();
    const base = program(exact);
    const outcomes = ['drain-contents', 'drain-presence', 'worker-surface', 'worker-class', 'worker-distance'];
    const compactProgram = {
      ...base,
      schemaVersion: 'gma.semantic-action-program/4',
      planner: {
        source: 'semantic_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/7', confidence: 1,
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
