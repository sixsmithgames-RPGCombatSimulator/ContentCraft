import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  applyStoryDeltaV2,
  buildPlayableSceneContextV2,
  commitSceneHandoff,
  compileAcceptedV1SceneSnapshotMigrationPreview,
  compileLegacyScenePlanV2MigrationPreview,
  compileStoryWorkspaceV2Migration,
  migrateStoryWorkspaceV2,
  projectStoryGraphV2,
  readCurrentSceneContexts,
  readStoryGraphV2,
  replaceStoryGraphV2,
  type SceneHandoffAuthorityEnvelope,
  type StoryDeltaV2,
} from './actionDirectedStoryStore.js';
import {
  emptyStoryWorkspace,
  readActiveStoryWorkspace,
  replaceStoryWorkspace,
  rewindStoryWorkspace,
  type JsonObject,
  type StoryWorkspaceRevisionDocument,
  validateStoryGraphV2,
} from './storyWorkspaceStore.js';

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function matches(record: StoryWorkspaceRevisionDocument, filter: Filter<StoryWorkspaceRevisionDocument>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = valueAt(record as unknown as Record<string, unknown>, key);
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted) && '$gt' in wanted) {
      return Number(actual) > Number((wanted as { $gt: unknown }).$gt);
    }
    return actual === wanted;
  });
}

function memoryCollection() {
  const documents: StoryWorkspaceRevisionDocument[] = [];
  const api = {
    async findOne(filter: Filter<StoryWorkspaceRevisionDocument>, options?: { sort?: { revision?: number } }) {
      const found = documents.filter((document) => matches(document, filter));
      if (options?.sort?.revision) found.sort((left, right) => right.revision - left.revision);
      return structuredClone(found[0] ?? null);
    },
    async insertOne(document: StoryWorkspaceRevisionDocument) {
      const duplicate = documents.some((candidate) => candidate.userId === document.userId
        && candidate.campaignId === document.campaignId
        && (candidate.idempotencyKey === document.idempotencyKey || candidate.revision === document.revision));
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    find(filter: Filter<StoryWorkspaceRevisionDocument>) {
      let selected = documents.filter((document) => matches(document, filter));
      const cursor = {
        sort(sort: { revision?: number }) {
          if (sort.revision) selected = selected.sort((left, right) => right.revision - left.revision);
          return cursor;
        },
        limit(limit: number) { selected = selected.slice(0, limit); return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
    async updateMany(filter: Filter<StoryWorkspaceRevisionDocument>, update: { $set: Partial<StoryWorkspaceRevisionDocument> }) {
      let modifiedCount = 0;
      for (const document of documents) {
        if (!matches(document, filter)) continue;
        Object.assign(document, structuredClone(update.$set));
        modifiedCount += 1;
      }
      return { acknowledged: true, matchedCount: modifiedCount, modifiedCount };
    },
  };
  return { records: api as unknown as Collection<StoryWorkspaceRevisionDocument>, documents };
}

function legacyWorkspace(): JsonObject {
  return {
    ...emptyStoryWorkspace('campaign-a'),
    portfolio: {
      campaignQuestion: 'What will Kerrigan build?',
      arcs: [{
        arcId: 'story:arc:flintwake', planningState: 'active', truthState: 'gm_preparation',
        title: 'Control of Flintwake', dramaticQuestion: 'Who controls the yard?',
        pressures: ['Watch scrutiny'], sourceRefs: ['gmc:event:yard-transfer'],
      }],
    },
    frontier: { candidates: [] },
    preparationLedger: { requirements: [], invalidations: [] },
    sceneKits: [{
      sceneKitId: 'scene-kit:flintwake', sceneId: 'scene:flintwake', planningState: 'active', truthState: 'gm_preparation',
      title: 'Flintwake Wage Yard', purpose: 'Put the yard into honest operation.',
      dramaticQuestion: 'Who controls the yard?', locationRef: 'gmc:location:flintwake',
      participants: { present: [], anticipated: [] },
      activity: ['Dockworkers call loads.'], importantBeats: ['A tally surfaces.', 'The yard responds.'],
      stakes: ['Yard legitimacy'], pressures: ['Opening-day scrutiny'], information: [],
      exitVectors: [
        { kind: 'completion', condition: 'The authority question is answered.' },
        { kind: 'failure', condition: 'Operations break down.' },
        { kind: 'abandonment', condition: 'Kerrigan leaves the issue unresolved.' },
        { kind: 'redirect', condition: 'Kerrigan follows another lead.' },
      ],
      arcRefs: ['story:arc:flintwake'], sourceRefs: ['gmc:event:yard-transfer'],
    }],
    npcSceneCards: [], npcReadiness: [],
    activeSceneKitRef: { sceneKitId: 'scene-kit:flintwake' },
    timelineAnchor: { messageId: 'message:1', sequence: 1 },
  };
}

function cartSceneKit(): JsonObject {
  return {
    schemaVersion: 'gmc.scene-kit/2', sceneKitId: 'scene-kit:cart-interception', revision: 1,
    planningState: 'active',
    playableLocus: {
      kind: 'scene_local_locus', label: 'Warehouse road ahead of Flintwake',
      canonicalAnchorRef: 'gmc:location:flintwake',
      sourceRefs: ['gmc:lead:matched-cart-route', 'gma:direction:turn-2'],
    },
    purpose: 'Intercept and investigate the identified cart.',
    dramaticQuestion: 'Can Kerrigan stop the cart without exposing herself?',
    participants: {
      present: ['gmc:pc:kerrigan'],
      sceneLocalRoles: [
        { roleId: 'role:cart-driver', label: 'cart driver', count: 1, objective: 'deliver the load' },
        { roleId: 'role:cart-escorts', label: 'cart escorts', count: 2, objective: 'protect the route' },
      ],
      anticipated: [],
    },
    establishedElements: [{ elementId: 'element:cart', truthState: 'scene_local_established', summary: 'A two-wheeled ox cart carries covered trade cargo.' }],
    information: [
      { informationId: 'information:green-thread', state: 'concealed', accessVectors: ['observe the crew', 'inspect clothing'] },
      { informationId: 'information:violet-residue', state: 'undetermined', accessVectors: ['inspect the cart', 'magical examination'] },
    ],
    beats: [
      {
        beatId: 'beat:cart-arrival', kind: 'obstacle', state: 'active',
        trigger: 'The cart reaches the interception point.',
        changeSurface: 'The crew, cart, cargo, route, or secrecy can change.',
        potentialImpacts: [{ storyNodeRef: 'story:arc:flintwake', outcome: 'success', effect: 'advance' }],
      },
      {
        beatId: 'beat:cart-search', kind: 'discovery', state: 'available',
        trigger: 'Kerrigan gains access to the stopped cart.',
        changeSurface: 'The cargo or route evidence can become concrete.', potentialImpacts: [],
      },
    ],
    pressures: ['The cart will pass if Kerrigan waits too long.'],
    exitVectors: [
      { kind: 'completion', condition: 'The cart yields a concrete result.' },
      { kind: 'failure', condition: 'The cart escapes or Kerrigan is exposed.' },
      { kind: 'abandonment', condition: 'Kerrigan disengages.' },
      { kind: 'redirect', condition: 'Kerrigan follows another lead.' },
    ],
    storyBindings: ['story:arc:flintwake'],
    sourceRefs: ['gmc:lead:matched-cart-route', 'gma:direction:turn-2'],
  };
}

function handoffEnvelope(overrides: Partial<JsonObject> = {}): SceneHandoffAuthorityEnvelope {
  const proposal: JsonObject = {
    schemaVersion: 'gmc.scene-handoff-proposal/1', status: 'proposal_only', interactionId: 'turn-2',
    idempotencyKey: 'scene-handoff:turn-2', playerActionFingerprint: 'a'.repeat(64),
    expectedWorkspaceRevision: 2, expectedCurrentSceneRevision: 1,
    sourceRefs: ['gmc:lead:matched-cart-route', 'gma:direction:turn-2'],
    handoff: {
      mode: 'create', candidateRef: 'situation:cart-interception', priorSceneExit: 'redirected',
      sceneKit: cartSceneKit(), activeBeatRef: 'beat:cart-arrival', playerActionPreserved: true,
    },
    openingNarration: 'The cart rounds the warehouse road as Kerrigan settles into cover.', rollRequest: null,
    ...overrides,
  };
  return {
    proposal,
    playerActionReceipt: {
      receiptRef: 'gma:player-action-receipt:turn-2', interactionId: 'turn-2',
      playerActionFingerprint: 'a'.repeat(64), status: 'accepted',
    },
    sourceReceipts: [
      { sourceRef: 'gmc:lead:matched-cart-route', receiptRef: 'gmc:lead-receipt:cart', authority: 'gmc', status: 'committed' },
      { sourceRef: 'gma:direction:turn-2', receiptRef: 'gma:direction-receipt:turn-2', authority: 'gma', status: 'committed' },
      { sourceRef: 'gmc:pc:kerrigan', receiptRef: 'gmc:presence-receipt:kerrigan', authority: 'gmc', status: 'committed' },
      { sourceRef: 'gmc:location:flintwake', receiptRef: 'gmc:location-receipt:flintwake', authority: 'gmc', status: 'committed' },
    ],
    timelineAnchor: { messageId: 'message:2', sequence: 2 },
  };
}

async function preparedStore() {
  const store = memoryCollection();
  await replaceStoryWorkspace({
    userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
    idempotencyKey: 'legacy:create', workspace: legacyWorkspace(),
    timelineAnchor: { messageId: 'message:1', sequence: 1 },
  }, store.records);
  await migrateStoryWorkspaceV2({
    userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1,
    idempotencyKey: 'migration:v2', dryRun: false,
  }, store.records);
  return store;
}

describe('D2 action-directed Story authority', () => {
  it('projects and migrates legacy arcs and Scene kits deterministically without invented hierarchy or cast', async () => {
    const legacy = legacyWorkspace();
    const first = compileStoryWorkspaceV2Migration(legacy);
    const second = compileStoryWorkspaceV2Migration(first);
    expect(second).toEqual(first);
    expect(first.storyGraph).toMatchObject({
      schemaVersion: 'gmc.story-graph/2', revision: 1,
      nodes: [{ nodeId: 'story:arc:flintwake', primaryParentRef: null, relatedNodeRefs: [], truthState: 'gm_preparation' }],
    });
    expect(first.sceneKits).toEqual([expect.objectContaining({
      schemaVersion: 'gmc.scene-kit/2', storyBindings: ['story:arc:flintwake'],
      participants: { present: [], sceneLocalRoles: [], anticipated: [] },
    })]);
    expect(JSON.stringify(first)).not.toContain('completedOutcome');

    const store = memoryCollection();
    await replaceStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'create', workspace: legacy }, store.records);
    const dryRun = await migrateStoryWorkspaceV2({ userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, idempotencyKey: 'migrate', dryRun: true }, store.records);
    expect(dryRun).toMatchObject({ dryRun: true, changed: true, graphNodeCount: 1, sceneKitCount: 1 });
    expect(store.documents).toHaveLength(1);
    await migrateStoryWorkspaceV2({ userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, idempotencyKey: 'migrate:commit', dryRun: false }, store.records);
    const noChange = await migrateStoryWorkspaceV2({ userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 2, idempotencyKey: 'migrate:no-change', dryRun: false }, store.records);
    expect(noChange).toMatchObject({ dryRun: false, changed: false, storyWorkspaceRef: { revision: 2 } });
    expect(store.documents).toHaveLength(2);
  });

  it('rejects graph cycles, depth overflow, missing references, and ungrounded writes', async () => {
    const graph = projectStoryGraphV2(legacyWorkspace());
    (graph.nodes as JsonObject[]).push({
      nodeId: 'story:thread:cart', scope: 'thread', primaryParentRef: 'missing:parent', relatedNodeRefs: [],
      title: 'Cart', dramaticQuestion: 'Where does it lead?', state: 'active', planningState: 'draft',
      truthState: 'gm_preparation', pressures: [], sourceRefs: ['gmc:lead:cart'],
    });
    expect(() => validateStoryGraphV2(graph)).toThrowError(expect.objectContaining({ code: 'STORY_GRAPH_REFERENCE_INVALID' }));

    const deepNodes = Array.from({ length: 9 }, (_entry, index) => ({
      nodeId: `story:thread:${index}`, scope: 'thread', primaryParentRef: index ? `story:thread:${index - 1}` : null,
      relatedNodeRefs: [], title: `Node ${index}`, dramaticQuestion: 'What changes?', state: 'active',
      planningState: 'draft', truthState: 'gm_preparation', pressures: [], sourceRefs: [`gmc:source:${index}`],
    }));
    expect(() => validateStoryGraphV2({ schemaVersion: 'gmc.story-graph/2', revision: 1, nodes: deepNodes })).toThrowError(expect.objectContaining({ code: 'STORY_GRAPH_DEPTH_EXCEEDED' }));
    const cycleNodes = deepNodes.slice(0, 2);
    cycleNodes[0].primaryParentRef = 'story:thread:1';
    expect(() => validateStoryGraphV2({ schemaVersion: 'gmc.story-graph/2', revision: 1, nodes: cycleNodes })).toThrowError(expect.objectContaining({ code: 'STORY_GRAPH_CYCLE' }));

    const store = await preparedStore();
    const current = await readStoryGraphV2({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records);
    const noChange = await replaceStoryGraphV2({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 2,
      expectedGraphRevision: 1, idempotencyKey: 'graph:no-change', graph: current.graph, sourceReceiptRefs: [],
    }, store.records);
    expect(noChange).toMatchObject({ status: 'no_change', authoritativeStateChanged: false, storyWorkspaceRef: { revision: 2 } });
    expect(store.documents).toHaveLength(2);
    const changed = structuredClone(current.graph);
    (changed.nodes as JsonObject[])[0].title = 'Changed without evidence';
    changed.revision = 2;
    await expect(replaceStoryGraphV2({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 2,
      expectedGraphRevision: 1, idempotencyKey: 'graph:ungrounded', graph: changed, sourceReceiptRefs: [],
    }, store.records)).rejects.toMatchObject({ code: 'STORY_GRAPH_GROUNDING_REQUIRED' });
    expect(store.documents).toHaveLength(2);
  });

  it('commits one exact current scene atomically and replays the original receipt and projection', async () => {
    const store = await preparedStore();
    const envelope = handoffEnvelope();
    const proposedKit = (envelope.proposal.handoff as JsonObject).sceneKit as JsonObject;
    (proposedKit.establishedElements as JsonObject[]).push(
      { elementId: 'element:possible-counter', truthState: 'possible', summary: 'The crew may have prepared a magical countermeasure.' },
      { elementId: 'element:unknown-compartment', truthState: 'undetermined', summary: 'A hidden compartment has not been established.' },
    );
    const first = await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope }, store.records);
    const replay = await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope }, store.records);
    expect(first).toMatchObject({
      status: 'applied', duplicate: false, authoritativeStateChanged: true,
      storyWorkspaceRef: { revision: 3 },
      playableSceneContext: {
        playableLocus: { label: 'Warehouse road ahead of Flintwake', canonicalAnchorRef: 'gmc:location:flintwake' },
        presentActors: ['gmc:pc:kerrigan'],
        sceneLocalRoles: expect.arrayContaining([expect.objectContaining({ roleId: 'role:cart-driver' })]),
        activeBeat: { beatId: 'beat:cart-arrival' },
      },
    });
    expect(replay).toMatchObject({ duplicate: true, authoritativeStateChanged: false, storyWorkspaceRef: { revision: 3 } });
    expect(store.documents).toHaveLength(3);
    const active = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace;
    expect(active.activeSceneKitRef).toMatchObject({ sceneKitId: 'scene-kit:cart-interception', revision: 1 });
    expect(active.activeBeatRef).toBe('beat:cart-arrival');
    expect(active.sceneExitHistory).toEqual([expect.objectContaining({ priorSceneKitId: 'scene-kit:flintwake', exit: 'redirected' })]);
    const serialized = JSON.stringify(first.playableSceneContext);
    expect(serialized).not.toContain('storyGraph');
    expect(serialized).not.toContain('privateCanonicalNameRef');
    expect(serialized).not.toContain('frontier');
    expect(serialized).not.toContain('possible-counter');
    expect(serialized).not.toContain('unknown-compartment');
    expect(JSON.stringify(first.privateSceneContext)).toContain('possible-counter');
    expect(JSON.stringify(first.privateSceneContext)).toContain('unknown-compartment');
    const contexts = await readCurrentSceneContexts({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records);
    expect(contexts?.authorityReceiptCatalog).toMatchObject({
      contractVersion: 'gmc.story-authority-receipt-catalog/1',
      workspaceRevision: 3,
      receipts: expect.arrayContaining([
        expect.objectContaining({ sourceRef: 'gmc:pc:kerrigan', authority: 'gmc', status: 'committed' }),
        expect.objectContaining({ sourceRef: 'gmc:location:flintwake', authority: 'gmc', status: 'committed' }),
        expect.objectContaining({ sourceRef: 'gmc:lead:matched-cart-route', authority: 'gmc', status: 'committed' }),
      ]),
    });
  });

  it('supports select, reuse, and replace without creating a second current scene', async () => {
    const store = await preparedStore();
    const active = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!;
    const preparedCart = { ...cartSceneKit(), planningState: 'prepared' } as JsonObject;
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 2,
      idempotencyKey: 'studio:add-prepared-cart', source: 'studio_manual',
      workspace: { ...structuredClone(active.workspace), sceneKits: [...active.workspace.sceneKits as JsonObject[], preparedCart] },
    }, store.records);
    const selectedKit = { ...cartSceneKit(), revision: 2 } as JsonObject;
    const selected = handoffEnvelope({
      idempotencyKey: 'scene-handoff:select-cart', expectedWorkspaceRevision: 3,
      handoff: {
        mode: 'select', candidateRef: 'situation:cart-interception', priorSceneExit: 'redirected',
        sceneKit: selectedKit, activeBeatRef: 'beat:cart-arrival', playerActionPreserved: true,
      },
    });
    await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: selected }, store.records);

    const reused = handoffEnvelope({
      idempotencyKey: 'scene-handoff:reuse-cart', expectedWorkspaceRevision: 4, expectedCurrentSceneRevision: 2,
      handoff: {
        mode: 'reuse', candidateRef: 'situation:cart-interception', priorSceneExit: 'superseded',
        sceneKit: selectedKit, activeBeatRef: 'beat:cart-arrival', playerActionPreserved: true,
      },
    });
    await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: reused }, store.records);

    const replacementKit = structuredClone(selectedKit);
    replacementKit.revision = 3;
    replacementKit.pressures = ['The disabled cart draws attention from the warehouse road.'];
    const replaced = handoffEnvelope({
      idempotencyKey: 'scene-handoff:replace-cart', expectedWorkspaceRevision: 5, expectedCurrentSceneRevision: 2,
      handoff: {
        mode: 'replace', candidateRef: 'situation:cart-interception', priorSceneExit: 'superseded',
        sceneKit: replacementKit, activeBeatRef: 'beat:cart-arrival', playerActionPreserved: true,
      },
    });
    const result = await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: replaced }, store.records);
    expect(result).toMatchObject({ storyWorkspaceRef: { revision: 6 }, playableSceneContext: { pressures: replacementKit.pressures } });
    const final = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace;
    expect(final.activeSceneKitRef).toMatchObject({ sceneKitId: 'scene-kit:cart-interception', revision: 3 });
    expect((final.sceneExitHistory as JsonObject[]).filter((exit) => exit.priorSceneKitId === 'scene-kit:flintwake')).toHaveLength(1);
  });

  it('rejects changed replay, stale scene revision, bad receipts, and concurrent handoffs without half writes', async () => {
    const store = await preparedStore();
    const badReceipt = handoffEnvelope();
    badReceipt.playerActionReceipt.playerActionFingerprint = 'b'.repeat(64);
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: badReceipt }, store.records))
      .rejects.toMatchObject({ code: 'STORY_PLAYER_ACTION_RECEIPT_INVALID' });
    expect(store.documents).toHaveLength(2);

    const missingPresence = handoffEnvelope();
    missingPresence.sourceReceipts = missingPresence.sourceReceipts.filter((receipt) => receipt.sourceRef !== 'gmc:pc:kerrigan');
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: missingPresence }, store.records))
      .rejects.toMatchObject({ code: 'STORY_PRESENCE_RECEIPT_REQUIRED' });
    expect(store.documents).toHaveLength(2);

    const stale = handoffEnvelope({ expectedCurrentSceneRevision: 0 });
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: stale }, store.records))
      .rejects.toMatchObject({ code: 'STORY_CURRENT_SCENE_REVISION_CONFLICT' });
    expect(store.documents).toHaveLength(2);

    const oversizedDirectorContext = handoffEnvelope();
    const oversizedKit = (oversizedDirectorContext.proposal.handoff as JsonObject).sceneKit as JsonObject;
    oversizedKit.establishedElements = Array.from({ length: 14 }, (_entry, index) => ({
      elementId: `element:hidden-${index}`,
      truthState: 'possible',
      summary: `Possibility ${index}: ${'x'.repeat(850)}`,
    }));
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: oversizedDirectorContext }, store.records))
      .rejects.toMatchObject({ code: 'STORY_DIRECTOR_CONTEXT_TOO_LARGE' });
    expect(store.documents).toHaveLength(2);

    const mismatchedActiveBeat = handoffEnvelope();
    (mismatchedActiveBeat.proposal.handoff as JsonObject).activeBeatRef = 'beat:cart-search';
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: mismatchedActiveBeat }, store.records))
      .rejects.toMatchObject({ code: 'STORY_ACTIVE_BEAT_INVALID' });
    expect(store.documents).toHaveLength(2);

    const first = handoffEnvelope();
    const second = handoffEnvelope({ idempotencyKey: 'scene-handoff:turn-2:other' });
    (second.proposal.handoff as JsonObject).sceneKit = { ...cartSceneKit(), sceneKitId: 'scene-kit:cart-interception-other' };
    const outcomes = await Promise.allSettled([
      commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: first }, store.records),
      commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: second }, store.records),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(store.documents).toHaveLength(3);

    const changedReplay = handoffEnvelope({ openingNarration: 'A different draft under the same key.' });
    await expect(commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: changedReplay }, store.records))
      .rejects.toMatchObject({ code: 'STORY_IDEMPOTENCY_CONFLICT' });
  });

  it('applies beat and actual Story impacts together while preserving unrelated nodes', async () => {
    const store = await preparedStore();
    await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: handoffEnvelope() }, store.records);
    const active = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!;
    const graph = structuredClone(active.workspace.storyGraph as JsonObject);
    (graph.nodes as JsonObject[]).push({
      nodeId: 'story:thread:unrelated', scope: 'thread', primaryParentRef: null, relatedNodeRefs: [],
      title: 'Unrelated thread', dramaticQuestion: 'Will it wait?', state: 'dormant', planningState: 'dormant',
      truthState: 'gm_preparation', pressures: [], sourceRefs: ['gmc:source:unrelated'],
    });
    graph.revision = 2;
    await replaceStoryGraphV2({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 3, expectedGraphRevision: 1,
      idempotencyKey: 'graph:add-unrelated', graph, sourceReceiptRefs: ['gmc:receipt:graph-edit'],
    }, store.records);
    const delta: StoryDeltaV2 = {
      schemaVersion: 'studio.story-delta/2', deltaId: 'delta:cart-result', operationId: 'operation:cart-result',
      idempotencyKey: 'delta:cart-result', correlationId: 'correlation:cart-result', campaignId: 'campaign-a',
      initiatedBy: 'gma', sourceSystem: 'gma', targetAuthority: 'gmc', visibility: 'gm_only', classification: 'beat_update',
      expectedWorkspaceRevision: 4, reason: 'The stopped cart yielded a concrete lead.',
      sourceRevisions: { timelineSequence: 3 }, sourceReceiptRefs: ['gma:validated-interaction:turn-3'],
      sceneKitRef: 'scene-kit:cart-interception:r1',
      beatChanges: [
        { beatRef: 'beat:cart-arrival', state: 'resolved', sourceReceiptRefs: ['gma:validated-interaction:turn-3'] },
        { beatRef: 'beat:cart-search', state: 'active', sourceReceiptRefs: ['gma:validated-interaction:turn-3'] },
      ],
      actualStoryImpacts: [{
        storyNodeRef: 'story:arc:flintwake', effect: 'advance', reason: 'The cart is stopped.',
        sourceReceiptRefs: ['gma:validated-interaction:turn-3'],
      }],
      affectedRecords: [],
    };
    const result = await applyStoryDeltaV2({ userId: 'tenant-a', campaignId: 'campaign-a', delta }, store.records);
    expect(result).toMatchObject({ status: 'applied', storyWorkspaceRef: { revision: 5 } });
    const updated = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace;
    expect((updated.storyGraph as JsonObject).revision).toBe(3);
    expect(((updated.storyGraph as JsonObject).nodes as JsonObject[]).find((node) => node.nodeId === 'story:thread:unrelated'))
      .toMatchObject({ title: 'Unrelated thread', state: 'dormant' });
    expect(updated.activeBeatRef).toBe('beat:cart-search');
    expect(updated.storyImpactReceipts).toEqual([expect.objectContaining({ storyNodeRef: 'story:arc:flintwake', effect: 'advance' })]);
  });

  it('rewinds Story graph, current Scene kit, locus, cast, and beat as one authority revision', async () => {
    const store = await preparedStore();
    await commitSceneHandoff({ userId: 'tenant-a', campaignId: 'campaign-a', envelope: handoffEnvelope() }, store.records);
    const before = buildPlayableSceneContextV2((await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace);
    expect(before.playableLocus).toMatchObject({ label: 'Warehouse road ahead of Flintwake' });
    const rewind = await rewindStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 3,
      boundarySequence: 1, rewindId: 'rewind:cart-handoff',
    }, store.records);
    expect(rewind).toMatchObject({ supersededCount: 1, restoredStoryWorkspaceRef: { revision: 2 } });
    const restored = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace;
    expect(restored.activeSceneKitRef).toMatchObject({ sceneKitId: 'scene-kit:flintwake' });
    expect(JSON.stringify(restored)).not.toContain('scene-kit:cart-interception');
  });

  it('replays a committed migration after later revisions without rebuilding from newer state', async () => {
    const store = memoryCollection();
    await replaceStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'legacy:create', workspace: legacyWorkspace() }, store.records);
    const request = { userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 1, idempotencyKey: 'migration:once', dryRun: false };
    const first = await migrateStoryWorkspaceV2(request, store.records);
    const changed = projectStoryGraphV2((await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, store.records))!.workspace);
    (changed.nodes as JsonObject[]).push({
      nodeId: 'story:thread:later', scope: 'thread', primaryParentRef: null, relatedNodeRefs: [],
      title: 'Later thread', dramaticQuestion: 'What changes next?', state: 'active', planningState: 'draft',
      truthState: 'gm_preparation', pressures: [], sourceRefs: ['gmc:source:later'],
    });
    changed.revision = 2;
    await replaceStoryGraphV2({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedWorkspaceRevision: 2, expectedGraphRevision: 1,
      idempotencyKey: 'graph:add-later', graph: changed, sourceReceiptRefs: ['gmc:receipt:later'],
    }, store.records);
    const replay = await migrateStoryWorkspaceV2(request, store.records);
    expect(first).toMatchObject({ duplicate: false, storyWorkspaceRef: { revision: 2 } });
    expect(replay).toMatchObject({ duplicate: true, storyWorkspaceRef: { revision: 2 } });
  });

  it('previews the first v2 workspace from immutable legacy preparation without writing revision one', () => {
    const preview = compileLegacyScenePlanV2MigrationPreview({
      campaignId: 'campaign-a',
      scenePlanRef: {
        scenePlanId: 'plan-cart', sceneId: 'scene-cart', revision: 3, payloadHash: 'a'.repeat(64),
      },
      privatePayload: {
        schemaVersion: 'gma.scene-plan/2',
        sceneId: 'scene-cart',
        scenePlanId: 'plan-cart',
        title: 'The Cart Interception',
        objective: 'Stop and investigate the identified cart.',
        dramaticQuestion: 'Can Kerrigan stop the cart without exposing herself?',
        locationRef: { id: 'gmc:location:flintwake', label: 'Ahead of Flintwake' },
        participants: { present: [{ entityId: 'gmc:pc:kerrigan', name: 'Kerrigan' }], anticipated: [] },
        knownDetails: [{ detail: 'A covered cart approaches before dawn.' }],
        doneWhen: ['The cart is stopped or passes beyond reach.'],
      },
    });

    expect(preview).toMatchObject({
      contractVersion: 'gmc.story-migration-preview/1',
      dryRun: true,
      mutationApplied: false,
      source: 'legacy_scene_plan',
      migrationPreview: { fromWorkspaceRevision: 0, storyWorkspaceRef: { revision: 0, status: 'preview' } },
      sceneContext: {
        playableSceneContext: { playableLocus: { label: 'Ahead of Flintwake', canonicalAnchorRef: 'gmc:location:flintwake' } },
      },
      history: { revisions: [], legacyBackupRef: { scenePlanId: 'plan-cart', revision: 3 } },
    });
    expect(preview.sceneContext.authorityReceiptCatalog.receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRef: 'gmc:location:flintwake', status: 'committed' }),
    ]));
  });

  it('previews an accepted pre-Story GMA scene from bounded transit and scene receipts', () => {
    const preview = compileAcceptedV1SceneSnapshotMigrationPreview({
      campaignId: 'campaign-a',
      canonicalAnchor: { locationRef: 'location-flintwake', label: 'Flintwake Wage Yard' },
      snapshot: {
        schemaVersion: 'gma.accepted-v1-scene-snapshot/1',
        campaignId: 'campaign-a',
        canonicalAnchor: { locationRef: 'location-flintwake', label: 'Flintwake Wage Yard' },
        playableLocus: { kind: 'scene_local_locus', label: 'Ahead of the identified cart route before it reaches Flintwake Wage Yard' },
        scene: {
          sceneId: 'accepted-v1-cart-interception',
          title: 'The Cart Interception',
          status: 'active',
          purpose: 'Stop or disable the identified cart before it reaches Flintwake.',
          dramaticQuestion: 'How will Kerrigan exploit the stopped cart without losing the lead?',
          doneWhen: ['The cart encounter reaches a concrete result.'],
          participants: [
            { entityRef: 'kerrigan-brynn', label: 'Kerrigan Brynn', identityKind: 'individual' },
            { entityRef: 'kerrigans-familiar', label: "Kerrigan's Familiar", identityKind: 'individual' },
          ],
        },
        sourceReceipts: [
          { kind: 'transit', receiptRef: 'gma:timeline:turn-1:transit', interactionId: 'turn-1' },
          { kind: 'scene_segment', receiptRef: 'gma:timeline:message-2:scene-segment', interactionId: 'turn-2' },
        ],
      },
    });

    expect(preview).toMatchObject({
      contractVersion: 'gmc.story-migration-preview/1',
      dryRun: true,
      mutationApplied: false,
      source: 'accepted_v1_scene_snapshot',
      migrationPreview: { fromWorkspaceRevision: 0, storyWorkspaceRef: { revision: 0, status: 'preview' } },
      sceneContext: {
        playableSceneContext: {
          playableLocus: {
            kind: 'canonical_location',
            label: 'Ahead of the identified cart route before it reaches Flintwake Wage Yard',
            canonicalAnchorRef: 'location-flintwake',
          },
          presentActors: ['kerrigan-brynn', 'kerrigans-familiar'],
        },
      },
      history: { revisions: [], acceptedV1BackupRef: { sceneId: 'accepted-v1-cart-interception' } },
    });
    expect(preview.sceneContext.authorityReceiptCatalog.receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRef: 'location-flintwake', status: 'committed' }),
      expect.objectContaining({ sourceRef: 'gma:timeline:turn-1:transit', status: 'committed' }),
      expect.objectContaining({ sourceRef: 'gma:timeline:message-2:scene-segment', status: 'committed' }),
    ]));
  });

  it('rejects a pre-Story scene snapshot that does not match GMC current anchor', () => {
    expect(() => compileAcceptedV1SceneSnapshotMigrationPreview({
      campaignId: 'campaign-a',
      canonicalAnchor: { locationRef: 'location-flintwake', label: 'Flintwake Wage Yard' },
      snapshot: {
        schemaVersion: 'gma.accepted-v1-scene-snapshot/1',
        campaignId: 'campaign-a',
        canonicalAnchor: { locationRef: 'location-elsewhere', label: 'Elsewhere' },
        playableLocus: { kind: 'scene_local_locus', label: 'A cart route' },
        scene: {
          sceneId: 'scene-cart', title: 'The Cart', status: 'active', purpose: 'Stop the cart.',
          participants: [{ entityRef: 'kerrigan', label: 'Kerrigan', identityKind: 'individual' }],
        },
        sourceReceipts: [
          { kind: 'transit', receiptRef: 'gma:timeline:turn-1:transit' },
          { kind: 'scene_segment', receiptRef: 'gma:timeline:turn-2:scene-segment' },
        ],
      },
    })).toThrowError(expect.objectContaining({ code: 'STORY_ACCEPTED_SCENE_ANCHOR_MISMATCH' }));
  });
});
