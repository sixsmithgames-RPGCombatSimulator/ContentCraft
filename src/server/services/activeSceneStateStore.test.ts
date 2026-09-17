import { createHash } from 'node:crypto';
import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import {
  ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION,
  ACTIVE_SCENE_STATE_CONTRACT_VERSION,
  ACTIVE_SCENE_STATE_MAX_BYTES,
  buildActiveSceneContext,
  commitSceneTurn,
  CONVERSATION_HISTORY_CONTRACT_VERSION,
  CONVERSATION_HISTORY_LIMIT,
  PUBLISHED_EXCHANGE_CONTRACT_VERSION,
  readActiveSceneContext,
  readConversationHistory,
  readLatestSceneTurnReceipt,
  readSceneTurnOperation,
  recordConversationHistoryRewind,
  SCENE_TURN_RECEIPT_CONTRACT_VERSION,
  SCENE_TURN_RECEIPT_V2_CONTRACT_VERSION,
  type ActiveSceneStateCollections,
  type ActiveSceneStateDocument,
  type ConversationHistoryRewindDocument,
  type SceneTurnReceiptDocument,
} from './activeSceneStateStore.js';
import {
  emptyStoryWorkspace,
  readActiveStoryWorkspace,
  replaceStoryWorkspace,
  type JsonObject,
  type StoryWorkspaceRevisionCollection,
  type StoryWorkspaceRevisionDocument,
} from './storyWorkspaceStore.js';
import { buildPlayableSceneContextV2 } from './actionDirectedStoryStore.js';

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function matches<T extends Record<string, unknown>>(record: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected) && expected.some((branch) => (
        branch && typeof branch === 'object'
          ? matches(record, branch as Filter<T>)
          : false
      ));
    }
    const actual = valueAt(record, key);
    if (expected && typeof expected === 'object' && '$lte' in expected) {
      return Number(actual) <= Number((expected as { $lte: unknown }).$lte);
    }
    return actual === expected;
  });
}

function storyMemory() {
  const documents: StoryWorkspaceRevisionDocument[] = [];
  const records = {
    async findOne(filter: Filter<StoryWorkspaceRevisionDocument>, options?: { sort?: { revision?: number } }) {
      const found = documents.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      if (options?.sort?.revision) found.sort((left, right) => right.revision - left.revision);
      return structuredClone(found[0] ?? null);
    },
    async insertOne(document: StoryWorkspaceRevisionDocument) {
      if (documents.some((entry) => entry.userId === document.userId && entry.campaignId === document.campaignId
        && (entry.revision === document.revision || entry.idempotencyKey === document.idempotencyKey))) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<StoryWorkspaceRevisionDocument>) {
      let selected = documents.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      const cursor = {
        sort(sort: { revision?: number }) { if (sort.revision) selected.sort((left, right) => right.revision - left.revision); return cursor; },
        limit(limit: number) { selected = selected.slice(0, limit); return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
    async updateMany() { return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }; },
  };
  return { records: records as unknown as StoryWorkspaceRevisionCollection, documents };
}

function activeSceneMemory() {
  const states: ActiveSceneStateDocument[] = [];
  const receipts: SceneTurnReceiptDocument[] = [];
  const rewinds: ConversationHistoryRewindDocument[] = [];
  const stateCollection = {
    async findOne(filter: Filter<ActiveSceneStateDocument>) {
      return structuredClone(states.find((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>)) ?? null);
    },
    async findOneAndReplace(filter: Filter<ActiveSceneStateDocument>, replacement: ActiveSceneStateDocument, options?: { upsert?: boolean }) {
      const index = states.findIndex((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      if (index >= 0) {
        const current = states[index] as ActiveSceneStateDocument & { _id?: ObjectId };
        if (current._id && Object.hasOwn(replacement, '_id')) {
          throw Object.assign(new Error("Performing an update on the path '_id' would modify the immutable field '_id'"), { code: 66 });
        }
        const next = structuredClone(replacement) as ActiveSceneStateDocument & { _id?: ObjectId };
        if (current._id) next._id = current._id;
        states[index] = next;
        return structuredClone(states[index]);
      }
      if (options?.upsert) {
        if (states.some((entry) => entry.userId === replacement.userId && entry.campaignId === replacement.campaignId && entry.sceneKitId === replacement.sceneKitId)) {
          throw Object.assign(new Error('duplicate'), { code: 11000 });
        }
        states.push(structuredClone(replacement));
        return structuredClone(replacement);
      }
      return null;
    },
    find(filter: Filter<ActiveSceneStateDocument>) {
      let selected = states.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      const cursor = {
        sort(sort: { updatedAt?: number }) { if (sort.updatedAt) selected.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()); return cursor; },
        limit(limit: number) { selected = selected.slice(0, limit); return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
  };
  const receiptCollection = {
    async findOne(filter: Filter<SceneTurnReceiptDocument>, options?: { sort?: { stateRevisionAfter?: number; committedAt?: number } }) {
      const found = receipts.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      if (options?.sort?.stateRevisionAfter) found.sort((left, right) => right.stateRevisionAfter - left.stateRevisionAfter);
      if (options?.sort?.committedAt) found.sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime());
      return structuredClone(found[0] ?? null);
    },
    async insertOne(document: SceneTurnReceiptDocument) {
      if (receipts.some((entry) => entry.userId === document.userId && entry.campaignId === document.campaignId
        && (entry.operationId === document.operationId || entry.idempotencyKey === document.idempotencyKey
          || (entry.sceneKitId === document.sceneKitId && entry.stateRevisionAfter === document.stateRevisionAfter)))) {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
      receipts.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<SceneTurnReceiptDocument>) {
      let selected = receipts.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      const cursor = {
        sort(sort: { stateRevisionAfter?: number; committedAt?: number }) {
          if (sort.committedAt || sort.stateRevisionAfter) selected.sort((left, right) => (
            (sort.committedAt ? right.committedAt.getTime() - left.committedAt.getTime() : 0)
            || (sort.stateRevisionAfter ? right.stateRevisionAfter - left.stateRevisionAfter : 0)
          ));
          return cursor;
        },
        limit(limit: number) { selected = selected.slice(0, limit); return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
  };
  const rewindCollection = {
    async findOne(filter: Filter<ConversationHistoryRewindDocument>, options?: { sort?: { committedAt?: number } }) {
      const found = rewinds.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      if (options?.sort?.committedAt) found.sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime());
      return structuredClone(found[0] ?? null);
    },
    async insertOne(document: ConversationHistoryRewindDocument) {
      if (rewinds.some((entry) => entry.userId === document.userId && entry.campaignId === document.campaignId && entry.rewindId === document.rewindId)) {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
      rewinds.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<ConversationHistoryRewindDocument>) {
      let selected = rewinds.filter((entry) => matches(entry as unknown as Record<string, unknown>, filter as Filter<Record<string, unknown>>));
      const cursor = {
        sort(sort: { committedAt?: number }) { if (sort.committedAt) selected.sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime()); return cursor; },
        limit(limit: number) { selected = selected.slice(0, limit); return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
  };
  return {
    stores: {
      states: stateCollection as unknown as Collection<ActiveSceneStateDocument>,
      receipts: receiptCollection as unknown as Collection<SceneTurnReceiptDocument>,
      rewinds: rewindCollection as unknown as Collection<ConversationHistoryRewindDocument>,
    } satisfies ActiveSceneStateCollections,
    states,
    receipts,
    rewinds,
  };
}

function workspace(): JsonObject {
  return {
    ...emptyStoryWorkspace('campaign-a'),
    storyGraph: {
      schemaVersion: 'gmc.story-graph/2', revision: 1, nodes: [{
        nodeId: 'story:thread:drain', scope: 'thread', primaryParentRef: null, relatedNodeRefs: [],
        title: 'Second Mouth', dramaticQuestion: 'What moves through the drain?', state: 'active',
        planningState: 'active', truthState: 'gm_preparation', pressures: ['The signal may be answered.'], sourceRefs: ['gmc:fact:route'],
      }],
    },
    sceneKits: [{
      schemaVersion: 'gmc.scene-kit/3', sceneKitId: 'scene-kit:second-mouth', revision: 1, planningState: 'active',
      playableLocus: { kind: 'canonical_location', label: 'SECOND MOUTH', canonicalAnchorRef: 'gmc:location:second-mouth', sourceRefs: ['gmc:location:second-mouth'] },
      purpose: 'Discover how SECOND MOUTH is used.', dramaticQuestion: 'Who answers the signal?',
      participants: { present: ['gmc:npc:drain-worker'], anticipated: [], sceneLocalRoles: [] },
      establishedElements: [{ elementId: 'scene:drain-mouth', truthState: 'canonical', summary: 'A stone drain arch bends out of sight.' }],
      information: [{ informationId: 'info:worker-description', state: 'plainly_visible', factText: 'The worker is a scarred human woman in oilskins.', accessVectors: ['ordinary sight'] }],
      observables: [], obstructions: [],
      beats: [{ beatId: 'beat:signal', kind: 'reconnaissance', state: 'active', trigger: 'Someone watches after the whistle.', changeSurface: 'The answer to the signal becomes visible.', potentialImpacts: [{ storyNodeRef: 'story:thread:drain', outcome: 'answer', effect: 'advance' }] }, { beatId: 'beat:entry', kind: 'choice', state: 'available', trigger: 'The drain is entered.', changeSurface: 'The interior route becomes active.', potentialImpacts: [] }],
      pressures: ['The worker is waiting.'],
      exitVectors: [{ kind: 'completion', condition: 'The signal response is known.' }, { kind: 'failure', condition: 'A failed risky course prevents observation.' }, { kind: 'abandonment', condition: 'Kerrigan leaves.' }, { kind: 'redirect', condition: 'Another lead takes priority.' }],
      storyBindings: ['story:thread:drain'], sourceRefs: ['gmc:location:second-mouth', 'gmc:npc:drain-worker'],
    }],
    activeSceneKitRef: { sceneKitId: 'scene-kit:second-mouth' },
    activeBeatRef: 'beat:signal',
  };
}

async function prepared() {
  const story = storyMemory();
  await replaceStoryWorkspace({ userId: 'user-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'workspace:init', workspace: workspace() }, story.records);
  const active = await readActiveStoryWorkspace({ userId: 'user-a', campaignId: 'campaign-a' }, story.records);
  if (!active) throw new Error('missing workspace');
  const playable = buildPlayableSceneContextV2(active.workspace);
  return { story, active, playable };
}

function proposal(playable: JsonObject, workspaceRevision: number, stateRevision: number, turn = 1, overrides: Partial<JsonObject> = {}): JsonObject {
  const sceneKitRef = playable.sceneKitRef as JsonObject;
  const core: JsonObject = {
    schemaVersion: 'gma.scene-turn-proposal/1',
    operationId: `scene-turn:interaction-${turn}:result`,
    idempotencyKey: `scene-turn:interaction-${turn}:result:key`,
    correlationId: `interaction-${turn}`,
    campaignId: 'campaign-a',
    interactionId: `interaction-${turn}`,
    playerActionFingerprint: `fingerprint-${turn}`,
    expectedWorkspaceRevision: workspaceRevision,
    expectedStateRevision: stateRevision,
    sceneKitRef: { sceneKitId: sceneKitRef.sceneKitId, revision: sceneKitRef.revision, payloadHash: sceneKitRef.payloadHash },
    timelineSequence: turn,
    narrationFingerprint: `narration-${turn}`,
    actionSummary: 'I keep watching.',
    outcomeSummary: `The worker makes a concrete move on turn ${turn}.`,
    sourceReceiptRefs: [`gma:validated-scene-turn:${turn}`],
    stateDelta: {
      schemaVersion: 'gma.scene-state-delta/1', phase: 'completed',
      actorUpdates: [{ actorRef: 'gmc:npc:drain-worker', activity: `moves on turn ${turn}`, decision: 'continues the signal exchange', narrationEvidence: `The worker moves on turn ${turn}.`, sourceFactRefs: ['gmc:npc:drain-worker'] }],
      continuityUpdates: [{ aspect: 'concealment', status: 'preserved', basis: 'Kerrigan remains behind the recessed cover.', narrationEvidence: 'Kerrigan remains concealed.', sourceFactRefs: ['scene:drain-mouth'] }],
      revealInformationRefs: ['info:worker-description'],
      settledFacts: [{ factKey: `scene-fact:${turn}`, claimText: `The worker moves on turn ${turn}.`, sourceFactRefs: ['gmc:npc:drain-worker'] }],
      threadUpdates: [{ threadRef: 'beat:signal', status: 'advanced', summary: `The signal exchange advances on turn ${turn}.`, sourceFactRefs: ['beat:signal'] }],
    },
  };
  return { ...core, ...overrides } as JsonObject;
}

function proposalV2(playable: JsonObject, workspaceRevision: number, stateRevision: number, turn = 1): JsonObject {
  const playerMessage = `I keep watching on turn ${turn}.`;
  const assistantNarration = `The worker makes a concrete move on turn ${turn}.`;
  return proposal(playable, workspaceRevision, stateRevision, turn, {
    schemaVersion: 'gma.scene-turn-proposal/2',
    narrationFingerprint: createHash('sha256').update(assistantNarration, 'utf8').digest('hex'),
    publishedExchange: {
      schemaVersion: PUBLISHED_EXCHANGE_CONTRACT_VERSION,
      playerMessage,
      playerMessageFingerprint: createHash('sha256').update(playerMessage, 'utf8').digest('hex'),
      assistantNarration,
      responseMode: 'in_character',
    },
  });
}

describe('durable active Scene state', () => {
  it('projects an empty revision-zero state without promoting transcript prose', async () => {
    const { story, active } = await prepared();
    const memory = activeSceneMemory();
    const context = await readActiveSceneContext({ userId: 'user-a', campaignId: 'campaign-a', workspace: active.workspace }, memory.stores, story.records);
    expect(context).toMatchObject({ schemaVersion: ACTIVE_SCENE_CONTEXT_CONTRACT_VERSION, state: { schemaVersion: ACTIVE_SCENE_STATE_CONTRACT_VERSION, revision: 0, settledFacts: [] } });
    expect(context.authority).toMatchObject({ transcriptIsAuthority: false });
    expect((context.state as JsonObject).settledFacts).toEqual([]);
  });

  it('commits one bounded state transition and returns the exact idempotent receipt', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const input = proposal(playable, active.storyWorkspaceRef.revision, 0);
    const first = await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: input }, memory.stores, story.records);
    const replay = await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: input }, memory.stores, story.records);
    expect(first).toMatchObject({ contractVersion: SCENE_TURN_RECEIPT_CONTRACT_VERSION, duplicate: false, receipt: { stateRevisionBefore: 0, stateRevisionAfter: 1 } });
    expect(first.activeSceneContext).toMatchObject({
      sceneKitRef: playable.sceneKitRef,
      state: { revision: 1, sceneKitRef: playable.sceneKitRef },
    });
    expect(replay).toMatchObject({ duplicate: true, authoritativeStateChanged: false, receipt: { receiptRef: (first.receipt as JsonObject).receiptRef } });
    expect(replay.activeSceneContext).toMatchObject({ sceneKitRef: playable.sceneKitRef, state: { revision: 1 } });
    expect(memory.states[0]).toMatchObject({ revision: 1, acceptedTurnCount: 1, revealedInformationRefs: ['info:worker-description'] });
    expect(memory.states[0].actorStates).toHaveLength(1);
    expect(memory.receipts).toHaveLength(1);
    expect(memory.receipts[0].readinessChangedDimensions).toEqual(['material_actor_objective', 'story_source']);
    await expect(readLatestSceneTurnReceipt({
      userId: 'user-a', campaignId: 'campaign-a', sceneKitId: String((playable.sceneKitRef as JsonObject).sceneKitId),
    }, memory.stores)).resolves.toEqual(first.receipt);
  });

  it('uses the certified Scene design to authorize selected version-3 fact refs', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const certifiedKit = structuredClone((active.workspace.sceneKits as JsonObject[])[0]);
    certifiedKit.schemaVersion = 'gmc.scene-kit/5';
    const certifiedRef = buildActiveSceneContext('campaign-a', certifiedKit).sceneKitRef as JsonObject;
    const certifiedPlayable = { ...structuredClone(playable), sceneKitRef: certifiedRef } as JsonObject;
    const certifiedDesign = {
      schemaVersion: 'gmc.scene-story-design/3',
      designId: 'scene-design:worker-account', revision: 1,
      sceneKitRef: { sceneKitId: certifiedKit.sceneKitId, revision: certifiedKit.revision },
      obligations: [{
        obligationId: 'obligation:worker-account', storyNodeRef: 'story:thread:drain',
        factRefs: ['fact:worker-saw-rats'],
      }],
      affordances: [{
        affordanceId: 'affordance:ask-worker', targetRef: 'gmc:npc:drain-worker',
        factRefs: ['fact:worker-saw-rats'], obligationRefs: ['obligation:worker-account'],
      }],
    } as JsonObject;
    const input = proposal(certifiedPlayable, active.storyWorkspaceRef.revision, 0);
    (input.stateDelta as JsonObject).settledFacts = [{
      factKey: 'scene-fact:worker-rats', claimText: 'The worker saw ordinary sewer rats.',
      sourceFactRefs: ['fact:worker-saw-rats'],
    }];
    await expect(commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a', proposal: input, sceneKit: certifiedKit,
    }, memory.stores, story.records)).rejects.toMatchObject({ code: 'STORY_SCENE_STATE_SOURCE_UNBOUND' });
    await expect(commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a', proposal: input,
      sceneKit: certifiedKit, sceneStoryDesign: certifiedDesign,
    }, memory.stores, story.records)).resolves.toMatchObject({
      status: 'applied', receipt: { stateRevisionBefore: 0, stateRevisionAfter: 1 },
    });
  });

  it('omits Mongo storage identity when replacing an existing active Scene state', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposal(playable, active.storyWorkspaceRef.revision, 0),
    }, memory.stores, story.records);
    const mongoId = new ObjectId();
    Object.assign(memory.states[0] as ActiveSceneStateDocument & { _id: ObjectId }, { _id: mongoId });

    const saved = await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposal(playable, active.storyWorkspaceRef.revision, 1, 2),
    }, memory.stores, story.records);

    expect(saved).toMatchObject({ receipt: { stateRevisionBefore: 1, stateRevisionAfter: 2 } });
    expect((memory.states[0] as ActiveSceneStateDocument & { _id: ObjectId })._id).toBe(mongoId);
  });

  it('rebinds retained continuity to an exact replacement of the same active Scene kit', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposal(playable, active.storyWorkspaceRef.revision, 0),
    }, memory.stores, story.records);
    const replacement = structuredClone(active.workspace);
    const replacementKit = (replacement.sceneKits as JsonObject[])[0];
    replacementKit.revision = 2;
    replacementKit.purpose = 'Discover how SECOND MOUTH is used while preserving the established watch.';
    await replaceStoryWorkspace({
      userId: 'user-a', campaignId: 'campaign-a', expectedRevision: active.storyWorkspaceRef.revision,
      idempotencyKey: 'workspace:replace-scene-kit', workspace: replacement,
    }, story.records);
    const replaced = await readActiveStoryWorkspace({ userId: 'user-a', campaignId: 'campaign-a' }, story.records);
    if (!replaced) throw new Error('missing replaced workspace');
    const context = await readActiveSceneContext({
      userId: 'user-a', campaignId: 'campaign-a', workspace: replaced.workspace,
    }, memory.stores, story.records);
    expect(context).toMatchObject({
      sceneKitRef: { revision: 2 },
      state: { revision: 1, sceneKitRef: { revision: 2 } },
    });
    const nextPlayable = buildPlayableSceneContextV2(replaced.workspace);
    const saved = await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposal(nextPlayable, replaced.storyWorkspaceRef.revision, 1, 2),
    }, memory.stores, story.records);
    expect(saved).toMatchObject({ receipt: { stateRevisionBefore: 1, stateRevisionAfter: 2, sceneKitRef: { revision: 2 } } });
  });

  it('rejects stale state, conflicting idempotency, and refs outside the current Scene', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const first = proposal(playable, active.storyWorkspaceRef.revision, 0);
    await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: first }, memory.stores, story.records);
    await expect(commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: proposal(playable, active.storyWorkspaceRef.revision, 0, 2) }, memory.stores, story.records)).rejects.toMatchObject({ code: 'STORY_ACTIVE_SCENE_STATE_REVISION_CONFLICT' });
    await expect(commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: { ...first, outcomeSummary: 'Different result.' } }, memory.stores, story.records)).rejects.toMatchObject({ code: 'STORY_SCENE_TURN_IDEMPOTENCY_CONFLICT' });
    const bad = proposal(playable, active.storyWorkspaceRef.revision, 1, 3);
    (bad.stateDelta as JsonObject).actorUpdates = [{ actorRef: 'gmc:npc:not-here', activity: 'appears', decision: 'joins', narrationEvidence: 'A stranger appears.', sourceFactRefs: ['gmc:npc:not-here'] }];
    await expect(commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: bad }, memory.stores, story.records)).rejects.toMatchObject({ code: 'STORY_SCENE_STATE_REF_UNBOUND' });
  });

  it('recovers a receipt interrupted after the state compare-and-swap', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const saved = await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: proposal(playable, active.storyWorkspaceRef.revision, 0) }, memory.stores, story.records);
    memory.receipts.splice(0, 1);
    const recovered = await readSceneTurnOperation({ userId: 'user-a', campaignId: 'campaign-a', operationId: 'scene-turn:interaction-1:result' }, memory.stores);
    expect(recovered).toMatchObject({ duplicate: true, receipt: { receiptRef: (saved.receipt as JsonObject).receiptRef } });
    expect(memory.receipts).toHaveLength(1);
  });

  it('stores and replays the exact published exchange in the same version-2 turn receipt', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const input = proposalV2(playable, active.storyWorkspaceRef.revision, 0);
    const saved = await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: input }, memory.stores, story.records);
    const replay = await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: input }, memory.stores, story.records);
    expect(saved).toMatchObject({
      contractVersion: SCENE_TURN_RECEIPT_V2_CONTRACT_VERSION,
      duplicate: false,
      receipt: {
        schemaVersion: SCENE_TURN_RECEIPT_V2_CONTRACT_VERSION,
        conversationLineageId: 'root',
        publishedExchange: {
          playerMessage: 'I keep watching on turn 1.',
          assistantNarration: 'The worker makes a concrete move on turn 1.',
        },
      },
    });
    expect(replay).toMatchObject({ duplicate: true, receipt: saved.receipt });
    const history = await readConversationHistory({ userId: 'user-a', campaignId: 'campaign-a' }, memory.stores);
    expect(history).toMatchObject({
      schemaVersion: CONVERSATION_HISTORY_CONTRACT_VERSION,
      interactions: [{
        interactionId: 'interaction-1',
        playerMessage: 'I keep watching on turn 1.',
        assistantNarration: 'The worker makes a concrete move on turn 1.',
      }],
      authority: { owner: 'gmc', presentationOnly: true, transcriptIsAuthority: false },
    });
    expect(JSON.stringify(history)).not.toContain('narrationEvidence');
  });

  it('recovers exact history after interruption between the state write and receipt insert', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposalV2(playable, active.storyWorkspaceRef.revision, 0),
    }, memory.stores, story.records);
    memory.receipts.splice(0, 1);

    const history = await readConversationHistory({ userId: 'user-a', campaignId: 'campaign-a' }, memory.stores);

    expect(memory.receipts).toHaveLength(1);
    expect(history).toMatchObject({
      interactions: [{
        interactionId: 'interaction-1',
        playerMessage: 'I keep watching on turn 1.',
        assistantNarration: 'The worker makes a concrete move on turn 1.',
      }],
    });
  });

  it('rejects a version-2 exchange whose exact text does not match its fingerprints', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    const input = proposalV2(playable, active.storyWorkspaceRef.revision, 0);
    (input.publishedExchange as JsonObject).assistantNarration = 'Different published narration.';
    await expect(commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: input }, memory.stores, story.records))
      .rejects.toMatchObject({ code: 'STORY_PUBLISHED_EXCHANGE_FINGERPRINT_MISMATCH' });
    expect(memory.states).toHaveLength(0);
    expect(memory.receipts).toHaveLength(0);
  });

  it('bounds history to fifty interactions and keeps a new rewind lineage visible', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    for (let turn = 1; turn <= 55; turn += 1) {
      await commitSceneTurn({
        userId: 'user-a', campaignId: 'campaign-a',
        proposal: proposalV2(playable, active.storyWorkspaceRef.revision, turn - 1, turn),
      }, memory.stores, story.records);
    }
    const bounded = await readConversationHistory({ userId: 'user-a', campaignId: 'campaign-a', limit: 500 }, memory.stores);
    expect(bounded.limit).toBe(CONVERSATION_HISTORY_LIMIT);
    expect(bounded.interactions).toHaveLength(CONVERSATION_HISTORY_LIMIT);
    expect((bounded.interactions as JsonObject[])[0].interactionId).toBe('interaction-6');

    const rewind = await recordConversationHistoryRewind({
      userId: 'user-a', campaignId: 'campaign-a', rewindId: 'rewind:after-52', boundarySequence: 52,
    }, memory.stores);
    expect(rewind).toMatchObject({ duplicate: false, parentLineageId: 'root' });
    await commitSceneTurn({
      userId: 'user-a', campaignId: 'campaign-a',
      proposal: proposalV2(playable, active.storyWorkspaceRef.revision, 55, 56),
    }, memory.stores, story.records);
    const after = await readConversationHistory({ userId: 'user-a', campaignId: 'campaign-a' }, memory.stores);
    const interactions = after.interactions as JsonObject[];
    expect(interactions.some((entry) => entry.interactionId === 'interaction-53')).toBe(false);
    expect(interactions.some((entry) => entry.interactionId === 'interaction-54')).toBe(false);
    expect(interactions.some((entry) => entry.interactionId === 'interaction-55')).toBe(false);
    expect(interactions.at(-1)).toMatchObject({ interactionId: 'interaction-56', conversationLineageId: 'rewind:after-52' });
    await expect(recordConversationHistoryRewind({
      userId: 'user-a', campaignId: 'campaign-a', rewindId: 'rewind:after-52', boundarySequence: 52,
    }, memory.stores)).resolves.toMatchObject({ duplicate: true, parentLineageId: 'root' });
  });

  it('recovers the last fifty valid interactions after more than 250 later turns are rewound', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    for (let turn = 1; turn <= 300; turn += 1) {
      await commitSceneTurn({
        userId: 'user-a', campaignId: 'campaign-a',
        proposal: proposalV2(playable, active.storyWorkspaceRef.revision, turn - 1, turn),
      }, memory.stores, story.records);
    }
    await recordConversationHistoryRewind({
      userId: 'user-a', campaignId: 'campaign-a', rewindId: 'rewind:to-50', boundarySequence: 50,
    }, memory.stores);

    const history = await readConversationHistory({ userId: 'user-a', campaignId: 'campaign-a' }, memory.stores);
    const interactions = history.interactions as JsonObject[];
    expect(interactions).toHaveLength(50);
    expect(interactions[0].interactionId).toBe('interaction-1');
    expect(interactions.at(-1)?.interactionId).toBe('interaction-50');
  });

  it('keeps a 500-turn Scene snapshot bounded while retaining all append-only receipts', async () => {
    const { story, active, playable } = await prepared();
    const memory = activeSceneMemory();
    for (let turn = 1; turn <= 500; turn += 1) {
      await commitSceneTurn({ userId: 'user-a', campaignId: 'campaign-a', proposal: proposal(playable, active.storyWorkspaceRef.revision, turn - 1, turn) }, memory.stores, story.records);
    }
    const state = memory.states[0];
    expect(state.revision).toBe(500);
    expect(state.acceptedTurnCount).toBe(500);
    expect(state.recentEvents).toHaveLength(24);
    expect(state.settledFacts).toHaveLength(96);
    expect(state.compactedThroughSequence).toBeGreaterThan(0);
    expect(memory.receipts).toHaveLength(500);
    const sceneKits = workspace().sceneKits as JsonObject[];
    expect(Buffer.byteLength(JSON.stringify(buildActiveSceneContext('campaign-a', sceneKits[0], state)), 'utf8')).toBeLessThan(ACTIVE_SCENE_STATE_MAX_BYTES);
  });
});
