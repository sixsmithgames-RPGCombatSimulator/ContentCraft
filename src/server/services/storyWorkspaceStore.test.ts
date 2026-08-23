import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  applyStoryDelta,
  buildPlayableStoryProjection,
  buildPublicStoryProjection,
  compileLegacyScenePlanImport,
  emptyStoryWorkspace,
  listStoryWorkspaceHistory,
  readActiveStoryWorkspace,
  readStoryWorkspaceTimelineCheckpoint,
  replaceStoryWorkspace,
  rewindStoryWorkspace,
  synchronizeNpcIdentityPromotionToStory,
  STORY_DELTA_RECEIPT_CONTRACT_VERSION,
  STORY_PROMPT_PROJECTION_MAX_BYTES,
  STORY_WORKSPACE_CONTRACT_VERSION,
  StoryWorkspaceStoreError,
  type JsonObject,
  type StoryDelta,
  type StoryWorkspaceRevisionDocument,
} from './storyWorkspaceStore.js';

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function matches(record: StoryWorkspaceRevisionDocument, filter: Filter<StoryWorkspaceRevisionDocument>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = valueAt(record as unknown as Record<string, unknown>, key);
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
      if ('$gt' in wanted) return Number(actual) > Number((wanted as { $gt: unknown }).$gt);
      if ('$lte' in wanted) return Number(actual) <= Number((wanted as { $lte: unknown }).$lte);
    }
    return actual === wanted;
  });
}

function memoryCollection() {
  const documents: StoryWorkspaceRevisionDocument[] = [];
  const api = {
    async findOne(filter: Filter<StoryWorkspaceRevisionDocument>, options?: { sort?: { revision?: number; 'timelineAnchor.sequence'?: number } }) {
      const found = documents.filter((document) => matches(document, filter));
      if (options?.sort?.['timelineAnchor.sequence']) found.sort((left, right) => (
        Number(right.timelineAnchor?.sequence ?? -1) - Number(left.timelineAnchor?.sequence ?? -1)
        || right.revision - left.revision
      ));
      else if (options?.sort?.revision) found.sort((left, right) => right.revision - left.revision);
      return found[0] ?? null;
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
        limit(limit: number) {
          selected = selected.slice(0, limit);
          return cursor;
        },
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

function flintwakeWorkspace() {
  return {
    ...emptyStoryWorkspace('campaign-a'),
    sourceRevisions: { gmcCanon: 'canon-r81', gmcScene: 'scene-r19', vcs: 'sheet-r44', timelineSequence: 208 },
    portfolio: {
      campaignQuestion: 'Can Kerrigan build power without becoming what she opposes?',
      arcs: [{
        arcId: 'arc:flintwake', kind: 'emergent_subarc', planningState: 'active', truthState: 'gm_preparation',
        title: 'Control of Flintwake', dramaticQuestion: 'Who benefits from control of the yard?',
        pressures: ['Watch scrutiny'], sourceRefs: ['gmc:event:yard-transfer'],
      }],
    },
    frontier: {
      candidates: [{
        candidateId: 'situation:watch-review', planningState: 'prepared', truthState: 'possibility',
        preparationHorizon: 'ready_soon', trigger: 'The Watch appointment matures.',
        dramaticQuestion: 'Will scrutiny become support or constraint?',
      }],
    },
    preparationLedger: {
      requirements: [{
        requirementId: 'prep:watch-identity', planningState: 'prepared', truthState: 'gm_preparation',
        kind: 'npc_identity', targetRef: 'gmc:npc:watch-officer', horizon: 'ready_soon', status: 'required',
      }],
      invalidations: [],
    },
    sceneKits: [{
      sceneKitId: 'scene-kit:flintwake', sceneId: 'scene:flintwake', planningState: 'active', truthState: 'gm_preparation',
      title: 'Flintwake Wage Yard', publicTitle: 'Flintwake Wage Yard', purpose: 'Put the yard into honest operation.',
      dramaticQuestion: 'Who controls the yard?', locationRef: 'gmc:location:flintwake',
      participants: {
        present: [{ entityId: 'gmc:npc:dorrik', publicLabel: 'Dorrik Siltvein', readinessRef: 'readiness:dorrik' }],
        anticipated: [{ entityId: 'gmc:npc:watch-officer', publicLabel: 'Watch officer', readinessRef: 'readiness:watch' }],
      },
      activity: ['Dockworkers call loads while the clerk checks tallies.'],
      importantBeats: ['A disputed tally surfaces.', 'The yard tests Kerrigan’s authority.'],
      stakes: ['Yard legitimacy'], pressures: ['Opening-day scrutiny'],
      information: [{
        informationId: 'info:private-ledger', status: 'prepared_private_canon',
        secret: 'Dorrik stole the hidden ledger', accessVectors: ['accounts conversation'],
        revealAuthority: 'current-interaction validation required',
      }],
      exitVectors: [
        { kind: 'completion', condition: 'The authority question is answered.', consequence: 'The yard settles into a working posture.' },
        { kind: 'failure', condition: 'Operations break down.', consequence: 'Confidence in the new authority falls.' },
        { kind: 'abandonment', condition: 'Kerrigan leaves the issue unresolved.', consequence: 'The yard continues provisionally.' },
        { kind: 'redirect', condition: 'Kerrigan leaves.', consequence: 'The appointment remains unresolved.' },
      ],
      preparationLedgerRefs: ['prep:watch-identity'],
      arcRefs: ['arc:flintwake'],
    }],
    npcSceneCards: [{
      cardId: 'card:dorrik', npcRef: 'gmc:npc:dorrik', planningState: 'prepared', truthState: 'private_canon',
      publicLabel: 'Dorrik Siltvein', knowledge: ['Dorrik stole the hidden ledger'], disclosurePosture: 'guarded',
      hardLimits: ['will not discuss family without trust'], currentObjective: 'Protect his independence.',
    }, {
      cardId: 'card:unrelated', npcRef: 'gmc:npc:elsewhere', planningState: 'draft', truthState: 'gm_preparation',
      publicLabel: 'Unrelated NPC', knowledge: ['far-away secret'],
    }],
    npcReadiness: [{
      readinessId: 'readiness:dorrik', npcRef: 'gmc:npc:dorrik', planningState: 'prepared', truthState: 'private_canon',
      npcRevision: 9, identityKind: 'individual', identityMaturity: 'canonical_player_known', publicLabel: 'Dorrik Siltvein',
      revealState: 'known', narrativeDepth: 'surface', requiredNarrativeDepth: 'surface', mechanicalDepth: 'none', readiness: 'ready',
    }, {
      readinessId: 'readiness:watch', npcRef: 'gmc:npc:watch-officer', planningState: 'prepared', truthState: 'private_canon',
      npcRevision: 7, identityKind: 'individual', identityMaturity: 'canonical_private', publicLabel: 'Watch officer',
      privateCanonicalNameRef: 'gmc:npc:watch-officer#canonical-name', revealState: 'not_known',
      revealEligibility: 'self_introduction_on_arrival', narrativeDepth: 'surface', requiredNarrativeDepth: 'surface', mechanicalDepth: 'none', readiness: 'ready',
    }],
    activeSceneKitRef: { sceneKitId: 'scene-kit:flintwake' },
    timelineAnchor: { messageId: 'message-208', sequence: 208 },
  } as JsonObject;
}

function delta(overrides: Partial<StoryDelta> = {}): StoryDelta {
  return {
    schemaVersion: 'studio.story-delta/1',
    deltaId: 'story-delta:interaction-209',
    operationId: 'operation:interaction-209',
    idempotencyKey: 'story-delta:interaction-209',
    correlationId: 'correlation:interaction-209',
    campaignId: 'campaign-a',
    initiatedBy: 'gma',
    sourceSystem: 'gma',
    targetAuthority: 'gmc',
    visibility: 'gm_only',
    classification: 'scene_patch',
    expectedWorkspaceRevision: 1,
    reason: 'A committed social receipt changed Dorrik’s immediate posture.',
    sourceRevisions: { gmcScene: 'scene-r20', timelineSequence: 209 },
    sourceReceiptRefs: ['receipt:social-209'],
    affectedRecords: [{
      recordType: 'npc_scene_card', recordId: 'card:dorrik', expectedRevision: 1,
      changes: [{ op: 'set', path: '/disclosurePosture', value: 'will hear one honest attempt' }],
    }],
    timelineSequence: 209,
    timelineMessageId: 'message-209',
    ...overrides,
  };
}

describe('GMC Story workspace authority store', () => {
  it('creates, hashes, reads, and idempotently replays a campaign workspace', async () => {
    const { records, documents } = memoryCollection();
    const input = {
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-create', workspace: flintwakeWorkspace(),
    };
    const first = await replaceStoryWorkspace(input, records);
    const replay = await replaceStoryWorkspace(input, records);

    expect(first).toMatchObject({ duplicate: false, storyWorkspaceRef: { revision: 1, campaignId: 'campaign-a' } });
    expect(first.storyWorkspaceRef.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(documents).toHaveLength(1);
    expect((await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, records))?.workspace)
      .toMatchObject({ revision: 1, activeSceneKitRef: { revision: 1, sceneId: 'scene:flintwake' } });
    expect(await readActiveStoryWorkspace({ userId: 'tenant-b', campaignId: 'campaign-a' }, records)).toBeNull();
  });

  it('applies receipt-grounded patches only to named records and replays after the workspace revision advances', async () => {
    const { records, documents } = memoryCollection();
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-create', workspace: flintwakeWorkspace(),
    }, records);
    const applied = await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta() }, records);
    const replay = await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta() }, records);

    expect(applied).toMatchObject({
      contractVersion: STORY_DELTA_RECEIPT_CONTRACT_VERSION, status: 'applied', duplicate: false,
      authoritativeStateChanged: true, storyWorkspaceRef: { revision: 2 },
    });
    expect(replay).toMatchObject({ status: 'applied', duplicate: true, authoritativeStateChanged: false });
    const active = documents[1].workspace;
    expect((active.npcSceneCards as JsonObject[]).find((card) => card.cardId === 'card:dorrik'))
      .toMatchObject({ recordRevision: 2, disclosurePosture: 'will hear one honest attempt' });
    expect((active.npcSceneCards as JsonObject[]).find((card) => card.cardId === 'card:unrelated'))
      .toMatchObject({ recordRevision: 1, knowledge: ['far-away secret'] });
  });

  it('treats no-replan as a receipt with no Story write', async () => {
    const { records, documents } = memoryCollection();
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-create', workspace: flintwakeWorkspace(),
    }, records);
    const result = await applyStoryDelta({
      userId: 'tenant-a', campaignId: 'campaign-a',
      delta: delta({
        classification: 'no_replan', affectedRecords: [], sourceReceiptRefs: [],
        idempotencyKey: 'story-no-replan', deltaId: 'story-delta:no-change',
      }),
    }, records);
    expect(result).toMatchObject({ status: 'no_change', authoritativeStateChanged: false, storyWorkspaceRef: { revision: 1 } });
    expect(documents).toHaveLength(1);
  });

  it('supports bounded record creation and rejects stale, ungrounded, and unsafe deltas', async () => {
    const { records } = memoryCollection();
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-create', workspace: flintwakeWorkspace(),
    }, records);
    const createArc = delta({
      idempotencyKey: 'story-create-arc', deltaId: 'story-delta:create-arc', operationId: 'operation:create-arc',
      affectedRecords: [{
        recordType: 'arc', recordId: 'arc:watch-scrutiny', expectedRevision: 0,
        changes: [{
          op: 'set', path: '/', value: {
            arcId: 'arc:watch-scrutiny', planningState: 'draft', truthState: 'gm_preparation',
            title: 'Watch Scrutiny', dramaticQuestion: 'Will the Watch accept Kerrigan’s rule?',
          },
        }],
      }],
    });
    await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: createArc }, records);
    expect((await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, records))?.workspace.portfolio)
      .toMatchObject({ arcs: expect.arrayContaining([expect.objectContaining({ arcId: 'arc:watch-scrutiny', recordRevision: 1 })]) });

    await expect(applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta({ idempotencyKey: 'stale' }) }, records))
      .rejects.toMatchObject({ code: 'STORY_WORKSPACE_REVISION_CONFLICT', status: 409 });
    await expect(applyStoryDelta({
      userId: 'tenant-a', campaignId: 'campaign-a',
      delta: delta({ classification: 'scene_patch', sourceReceiptRefs: [] }),
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'STORY_DELTA_GROUNDING_REQUIRED' });
    await expect(applyStoryDelta({
      userId: 'tenant-a', campaignId: 'campaign-a',
      delta: delta({
        affectedRecords: [{
          recordType: 'npc_scene_card', recordId: 'card:dorrik', expectedRevision: 1,
          changes: [{ op: 'set', path: '/__proto__/polluted', value: true }],
        }],
      }),
    }, records)).rejects.toMatchObject({ code: 'STORY_DELTA_PATH_INVALID' });
  });

  it('keeps private preparation and unintroduced identities out of the player projection', async () => {
    const workspace = flintwakeWorkspace();
    (((workspace.sceneKits as JsonObject[])[0].participants as JsonObject).anticipated as JsonObject[])[0].privateCanonicalName = 'Vessa Graymantle';
    const publicProjection = buildPublicStoryProjection(workspace);
    const serialized = JSON.stringify(publicProjection);
    expect(serialized).not.toContain('hidden ledger');
    expect(serialized).not.toContain('privateCanonicalNameRef');
    expect(serialized).not.toContain('Watch officer');
    expect(serialized).not.toContain('far-away secret');
    expect(publicProjection).toMatchObject({ activeScene: { participants: { present: [{ publicLabel: 'Dorrik Siltvein' }] } } });

    const playable = buildPlayableStoryProjection(workspace);
    expect(JSON.stringify(playable)).toContain('hidden ledger');
    expect(JSON.stringify(playable)).not.toContain('far-away secret');
    expect(JSON.stringify(playable)).not.toContain('Vessa Graymantle');
    expect(Buffer.byteLength(JSON.stringify(playable), 'utf8')).toBeLessThanOrEqual(STORY_PROMPT_PROJECTION_MAX_BYTES);
  });

  it('projects GMC preparation attached to a current scene-local interaction role', () => {
    const workspace = flintwakeWorkspace();
    const kit = (workspace.sceneKits as JsonObject[])[0];
    kit.schemaVersion = 'gmc.scene-kit/3';
    kit.revision = 1;
    kit.playableLocus = {
      kind: 'canonical_location', label: 'Flintwake Wage Yard', canonicalAnchorRef: 'gmc:location:flintwake',
      sourceRefs: ['gmc:location:flintwake'],
    };
    kit.participants = {
      present: ['gmc:npc:dorrik'], anticipated: [],
      sceneLocalRoles: [{ roleId: 'role:drain-worker', label: 'drain worker', count: 1, objective: 'Guard the below-route signal.' }],
    };
    (workspace.npcSceneCards as JsonObject[]).push({
      cardId: 'card:drain-worker', npcRef: 'role:drain-worker', publicLabel: 'drain worker',
      knowledge: ['The second whistle requests passage into the below route.'],
      disclosurePosture: 'tests whether the questioner knows the route signs',
      currentObjective: 'Guard the below-route signal.',
    });
    (workspace.npcReadiness as JsonObject[]).push({
      readinessId: 'readiness:drain-worker', npcRef: 'role:drain-worker', publicLabel: 'drain worker',
      identityKind: 'role', identityMaturity: 'role_seed', revealState: 'known', narrativeDepth: 'surface',
      requiredNarrativeDepth: 'surface', mechanicalDepth: 'none', readiness: 'ready',
    });

    const playable = buildPlayableStoryProjection(workspace);

    expect(playable.npcSceneCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        npcRef: 'role:drain-worker',
        knowledge: ['The second whistle requests passage into the below route.'],
        currentObjective: 'Guard the below-route signal.',
      }),
    ]));
    expect(playable.npcReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ npcRef: 'role:drain-worker', readiness: 'ready' }),
    ]));
    expect(JSON.stringify(playable)).not.toContain('far-away secret');
  });

  it('blocks runnable scenes with unresolved individual identity, missing information access, or no exit', async () => {
    const unresolved = flintwakeWorkspace();
    const readiness = (unresolved.npcReadiness as JsonObject[]).find((record) => record.readinessId === 'readiness:watch')!;
    readiness.identityMaturity = 'role_seed';
    delete readiness.privateCanonicalNameRef;
    await expect(replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'unresolved-identity', workspace: unresolved,
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'STORY_NPC_IDENTITY_DEBT_UNRESOLVED' });

    const inaccessible = flintwakeWorkspace();
    delete (((inaccessible.sceneKits as JsonObject[])[0].information as JsonObject[])[0]).accessVectors;
    await expect(replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'inaccessible-information', workspace: inaccessible,
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'STORY_INFORMATION_ACCESS_UNPREPARED' });

    const noExit = flintwakeWorkspace();
    delete (noExit.sceneKits as JsonObject[])[0].exitVectors;
    await expect(replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'missing-exit', workspace: noExit,
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'STORY_SCENE_EXIT_VECTOR_REQUIRED' });
  });

  it('closes linked identity readiness debt after the existing NPC is promoted in place', async () => {
    const { records } = memoryCollection();
    const workspace = flintwakeWorkspace();
    (workspace.sceneKits as JsonObject[])[0].planningState = 'draft';
    const readiness = (workspace.npcReadiness as JsonObject[]).find((record) => record.readinessId === 'readiness:watch')!;
    readiness.identityMaturity = 'role_seed';
    readiness.readiness = 'required';
    delete readiness.privateCanonicalNameRef;
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-create-role-seed', workspace,
    }, records);

    const synchronized = await synchronizeNpcIdentityPromotionToStory({
      userId: 'tenant-a', campaignId: 'campaign-a', npcId: 'gmc:npc:watch-officer',
      npcRevision: 8, identityMaturity: 'canonical_private', revealState: 'not_known',
      narrativeDepth: 'surface', mechanicalDepth: 'none', displayLabel: 'Watch officer',
      authorityReceiptRef: 'gmc:npc-identity-promotion-receipt:watch:8',
      idempotencyKey: 'npc-identity:watch:story',
    }, records);

    expect(synchronized).toMatchObject({ authoritativeStateChanged: true, storyWorkspaceRef: { revision: 2 } });
    const active = (await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, records))!.workspace;
    expect((active.npcReadiness as JsonObject[]).find((record) => record.readinessId === 'readiness:watch')).toMatchObject({
      recordRevision: 2, npcRevision: 8, identityMaturity: 'canonical_private', readiness: 'ready',
      privateCanonicalNameRef: 'gmc:npc:watch-officer#canonical-name', revealState: 'not_known',
      narrativeDepth: 'surface', truthState: 'private_canon',
    });
    expect(((active.preparationLedger as JsonObject).requirements as JsonObject[])
      .find((record) => record.requirementId === 'prep:watch-identity')).toMatchObject({ status: 'complete' });
    expect(JSON.stringify(active)).not.toContain('Vessa Graymantle');
  });

  it('rewinds by timeline boundary and exposes only redacted revision history', async () => {
    const { records } = memoryCollection();
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'story-create',
      timelineAnchor: { messageId: 'message-208', sequence: 208 }, workspace: flintwakeWorkspace(),
    }, records);
    await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta() }, records);
    const rewind = await rewindStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 2, boundarySequence: 208, rewindId: 'rewind:209',
    }, records);
    expect(rewind).toMatchObject({ restoreMode: 'timeline_boundary', supersededCount: 1, restoredStoryWorkspaceRef: { revision: 1 } });

    const history = await listStoryWorkspaceHistory({ userId: 'tenant-a', campaignId: 'campaign-a' }, records);
    expect(history.revisions).toHaveLength(2);
    expect(JSON.stringify(history)).not.toContain('hidden ledger');
    expect(history.revisions[0].redactedAudit.changedRecordRefs).toEqual(['npc_scene_card:card:dorrik']);
  });

  it('restores one exact immutable Story predecessor even when later timeline anchors are unusable', async () => {
    const { records } = memoryCollection();
    const predecessor = await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'story-exact-predecessor',
      timelineAnchor: { messageId: 'surviving-message', sequence: 208 }, workspace: flintwakeWorkspace(),
    }, records);
    await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta() }, records);

    const rewind = await rewindStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 2,
      boundarySequence: 999, rewindId: 'rewind:exact-predecessor',
      restoreStoryWorkspaceRef: predecessor.storyWorkspaceRef,
    }, records);
    expect(rewind).toMatchObject({
      duplicate: false, restoreMode: 'exact_ref', supersededCount: 1,
      restoredStoryWorkspaceRef: predecessor.storyWorkspaceRef,
    });

    const duplicate = await rewindStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 2,
      boundarySequence: 999, rewindId: 'rewind:exact-predecessor',
      restoreStoryWorkspaceRef: predecessor.storyWorkspaceRef,
    }, records);
    expect(duplicate).toMatchObject({
      duplicate: true, restoreMode: 'exact_ref', supersededCount: 0,
      restoredStoryWorkspaceRef: predecessor.storyWorkspaceRef,
    });
  });

  it('rejects an exact Story predecessor with a different hash without changing the active head', async () => {
    const { records } = memoryCollection();
    const predecessor = await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'story-invalid-predecessor',
      timelineAnchor: { messageId: 'surviving-message', sequence: 208 }, workspace: flintwakeWorkspace(),
    }, records);
    await applyStoryDelta({ userId: 'tenant-a', campaignId: 'campaign-a', delta: delta() }, records);

    await expect(rewindStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 2,
      boundarySequence: 0, rewindId: 'rewind:wrong-hash',
      restoreStoryWorkspaceRef: { ...predecessor.storyWorkspaceRef, payloadHash: 'f'.repeat(64) },
    }, records)).rejects.toMatchObject({ code: 'STORY_REWIND_RESTORE_REF_UNAVAILABLE' });
    await expect(readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, records))
      .resolves.toMatchObject({ storyWorkspaceRef: { revision: 2 } });
  });

  it('selects the latest available owner Story revision at or before a Replay boundary', async () => {
    const { records, documents } = memoryCollection();
    const flintwake = await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story:flintwake-boundary', timelineAnchor: { messageId: 'flintwake-message', sequence: 42 },
      workspace: flintwakeWorkspace(),
    }, records);
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 1,
      idempotencyKey: 'story:second-mouth-after-boundary', timelineAnchor: { messageId: 'second-mouth-message', sequence: 43 },
      workspace: { ...flintwakeWorkspace(), activeSceneKitRef: null },
    }, records);

    await expect(readStoryWorkspaceTimelineCheckpoint({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
    }, records)).resolves.toMatchObject({
      storyWorkspaceRef: flintwake.storyWorkspaceRef,
      timelineAnchor: { messageId: 'flintwake-message', sequence: 42 },
    });

    documents[0].status = 'superseded';
    await expect(readStoryWorkspaceTimelineCheckpoint({
      userId: 'tenant-a', campaignId: 'campaign-a', boundarySequence: 42,
    }, records)).resolves.toBeNull();
  });

  it('reports validation failures without echoing private workspace content', async () => {
    const secret = 'secret-not-for-diagnostics';
    let caught: unknown;
    try {
      await replaceStoryWorkspace({
        userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0, idempotencyKey: 'invalid',
        workspace: { ...flintwakeWorkspace(), campaignId: 'wrong', secret },
      }, memoryCollection().records);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StoryWorkspaceStoreError);
    expect(JSON.stringify(caught)).not.toContain(secret);
  });

  it('stores bounded session outlook without turning it into scene order', async () => {
    const { records } = memoryCollection();
    const workspace = {
      ...flintwakeWorkspace(),
      sessionPreparation: {
        focus: 'Let current yard pressure guide play without requiring a scene order.',
        likelySituationRefs: ['situation:watch-review'],
        notes: 'Dorrik may speak first; the Watch officer remains anticipated until the appointment matures.',
      },
    } as JsonObject;
    await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-session-outlook', workspace,
    }, records);
    const active = await readActiveStoryWorkspace({ userId: 'tenant-a', campaignId: 'campaign-a' }, records);
    expect(active?.workspace.sessionPreparation).toEqual(workspace.sessionPreparation);

    await expect(replaceStoryWorkspace({
      userId: 'tenant-b', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'story-session-outlook-oversize',
      workspace: { ...workspace, sessionPreparation: { ...workspace.sessionPreparation as JsonObject, likelySituationRefs: Array.from({ length: 13 }, (_entry, index) => `situation:${index}`) } },
    }, memoryCollection().records)).rejects.toMatchObject({ code: 'STORY_VALIDATION_FAILED' });
  });

  it('imports a legacy GMA scene plan once as draft GMC preparation with explicit readiness debt', async () => {
    const imported = compileLegacyScenePlanImport({
      campaignId: 'campaign-a',
      scenePlanRef: {
        scenePlanId: 'plan-flintwake', sceneId: 'scene:flintwake', revision: 4, payloadHash: 'a'.repeat(64),
      },
      privatePayload: {
        schemaVersion: 'gma.scene-plan/2',
        sceneId: 'scene:flintwake',
        scenePlanId: 'plan-flintwake',
        title: 'Questions at Flintwake',
        objective: 'Learn what Dorrik will share.',
        participants: {
          present: [{ entityId: 'gmc:npc:dorrik', name: 'Dorrik', reason: 'He arrived early.' }],
          anticipated: [{ entityId: 'gmc:npc:watch-officer', name: 'Watch officer', reason: 'The appointment is pending.' }],
        },
        private: {
          dialogueFrames: [{
            npcId: 'gmc:npc:dorrik', npcName: 'Dorrik', knowledge: ['He knows the route.'],
            disclosurePosture: ['guarded'], hardLimits: ['His family is private.'],
          }],
        },
      },
    });
    expect(imported).toMatchObject({
      activeSceneKitRef: { sceneKitId: 'scene-kit:legacy:plan-flintwake' },
      sceneKits: [{
        planningState: 'draft', truthState: 'gm_preparation',
        participants: { present: [{ publicLabel: 'Dorrik' }], anticipated: [{ publicLabel: 'Watch officer' }] },
        migrationProvenance: { authority: 'migration_evidence_only', sourceRevision: 4 },
      }],
      preparationLedger: { requirements: [expect.objectContaining({ kind: 'npc_readiness_review', status: 'required' })] },
      npcSceneCards: [expect.objectContaining({ publicLabel: 'Dorrik', planningState: 'draft' })],
    });

    const store = memoryCollection();
    const written = await replaceStoryWorkspace({
      userId: 'tenant-a', campaignId: 'campaign-a', expectedRevision: 0,
      idempotencyKey: 'legacy-import:plan-flintwake:r4', source: 'migration', workspace: imported,
    }, store.records);
    expect(written.storyWorkspaceRef.revision).toBe(1);
    expect(store.documents[0].redactedAudit.changedRecordRefs).toEqual(['workspace']);
  });

  it('declares and persists the accepted workspace contract version', () => {
    expect(emptyStoryWorkspace('campaign-a').schemaVersion).toBe(STORY_WORKSPACE_CONTRACT_VERSION);
  });
});
