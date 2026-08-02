import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  appendScenePlanRevision,
  GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES,
  GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
  readActiveScenePlan,
  redactScenePlanRevision,
  resolveScenePlanRevision,
  rewindScenePlan,
  ScenePlanStoreError,
  type AppendScenePlanRevisionInput,
  type ScenePlanRevisionDocument,
} from './gmaScenePlanStore.js';

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function matches(record: ScenePlanRevisionDocument, filter: Filter<ScenePlanRevisionDocument>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = valueAt(record as unknown as Record<string, unknown>, key);
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted) && '$gt' in wanted) {
      return Number(actual) > Number((wanted as { $gt: unknown }).$gt);
    }
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted) && '$lte' in wanted) {
      return Number(actual) <= Number((wanted as { $lte: unknown }).$lte);
    }
    return actual === wanted;
  });
}

function memoryCollection() {
  const documents: ScenePlanRevisionDocument[] = [];
  const api = {
    async findOne(filter: Filter<ScenePlanRevisionDocument>, options?: { sort?: { revision?: number } }) {
      const found = documents.filter((document) => matches(document, filter));
      const revisionOrder = options?.sort?.revision;
      if (revisionOrder) found.sort((left, right) => (right.revision - left.revision) * -Math.sign(revisionOrder));
      return found[0] ?? null;
    },
    async insertOne(document: ScenePlanRevisionDocument) {
      const duplicate = documents.some((candidate) => (
        candidate.userId === document.userId
        && candidate.campaignId === document.campaignId
        && (
          candidate.idempotencyKey === document.idempotencyKey
          || (candidate.scenePlanId === document.scenePlanId && candidate.revision === document.revision)
        )
      ));
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(document));
      return { acknowledged: true };
    },
    async updateMany(filter: Filter<ScenePlanRevisionDocument>, update: { $set: Partial<ScenePlanRevisionDocument> }) {
      let modifiedCount = 0;
      for (const document of documents) {
        if (!matches(document, filter)) continue;
        Object.assign(document, structuredClone(update.$set));
        modifiedCount += 1;
      }
      return { acknowledged: true, matchedCount: modifiedCount, modifiedCount };
    },
  };
  return { records: api as unknown as Collection<ScenePlanRevisionDocument>, documents };
}

function appendInput(overrides: Partial<AppendScenePlanRevisionInput> = {}): AppendScenePlanRevisionInput {
  const sceneId = overrides.sceneId ?? 'scene-flintwake';
  return {
    userId: 'tenant-a',
    campaignId: 'campaign-a',
    sceneId,
    scenePlanId: 'plan-flintwake',
    schemaVersion: 'gma.scene-plan/2',
    expectedRevision: 0,
    idempotencyKey: 'append-1',
    sourceRevisions: { gmcCanon: 12, gmcPresence: 'presence-4', vcs: 9 },
    interactionId: 'interaction-1',
    timelineAnchor: { messageId: 'message-1', sequence: 1 },
    privatePayload: {
      schemaVersion: 'gma.scene-plan/2',
      sceneId,
      status: 'active',
      dialogueFrames: [{ npcId: 'dorrik', knows: ['private background'], boundary: 'guarded' }],
    },
    ...overrides,
  };
}

describe('GMA private scene-plan integration store', () => {
  it('appends and reads a tenant-scoped revision through an opaque reference', async () => {
    const { records, documents } = memoryCollection();
    const appended = await appendScenePlanRevision(appendInput(), records);

    expect(appended).toMatchObject({
      contractVersion: GMA_SCENE_PLAN_STORE_CONTRACT_VERSION,
      duplicate: false,
      scenePlanRef: { scenePlanId: 'plan-flintwake', revision: 1, sceneId: 'scene-flintwake' },
    });
    expect(appended.scenePlanRef).not.toHaveProperty('privatePayload');
    expect(documents[0].redactedAudit).toMatchObject({ sourceRevisionKeys: ['gmcCanon', 'gmcPresence', 'vcs'] });

    const active = await readActiveScenePlan({
      userId: 'tenant-a', campaignId: 'campaign-a', scenePlanId: 'plan-flintwake',
      sceneId: 'scene-flintwake', schemaVersion: 'gma.scene-plan/2',
    }, records);
    expect(active?.privatePayload.dialogueFrames).toEqual([
      { npcId: 'dorrik', knows: ['private background'], boundary: 'guarded' },
    ]);
    expect(await readActiveScenePlan({
      userId: 'tenant-b', campaignId: 'campaign-a', scenePlanId: 'plan-flintwake',
      schemaVersion: 'gma.scene-plan/2',
    }, records)).toBeNull();
  });

  it('replays an identical idempotency key but rejects changed content and stale CAS writes', async () => {
    const { records } = memoryCollection();
    const input = appendInput();
    const first = await appendScenePlanRevision(input, records);
    const replay = await appendScenePlanRevision(input, records);
    expect(replay).toEqual({ ...first, duplicate: true });

    await expect(appendScenePlanRevision({
      ...input,
      privatePayload: { ...input.privatePayload, status: 'changed' },
    }, records)).rejects.toMatchObject({ code: 'GMA_SCENE_PLAN_IDEMPOTENCY_CONFLICT', status: 409 });

    await expect(appendScenePlanRevision(appendInput({ idempotencyKey: 'append-2' }), records))
      .rejects.toMatchObject({ code: 'GMA_SCENE_PLAN_REVISION_CONFLICT', details: { actualRevision: 1 } });
  });

  it('uses stable content hashing and rejects unsupported, mismatched, or oversized payloads', async () => {
    const firstStore = memoryCollection();
    const secondStore = memoryCollection();
    const first = appendInput({
      privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'scene-flintwake', title: 'Yard', status: 'active' },
    });
    const second = appendInput({
      privatePayload: { status: 'active', title: 'Yard', sceneId: 'scene-flintwake', schemaVersion: 'gma.scene-plan/2' },
    });
    expect((await appendScenePlanRevision(first, firstStore.records)).scenePlanRef.payloadHash)
      .toBe((await appendScenePlanRevision(second, secondStore.records)).scenePlanRef.payloadHash);

    await expect(appendScenePlanRevision(appendInput({ schemaVersion: 'gma.scene-plan/99' }), memoryCollection().records))
      .rejects.toMatchObject({ code: 'GMA_SCENE_PLAN_SCHEMA_UNSUPPORTED', status: 422 });
    await expect(appendScenePlanRevision(appendInput({
      privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'wrong-scene' },
    }), memoryCollection().records)).rejects.toMatchObject({ code: 'GMA_SCENE_PLAN_PAYLOAD_MISMATCH' });
    await expect(appendScenePlanRevision(appendInput({
      privatePayload: {
        schemaVersion: 'gma.scene-plan/2', sceneId: 'scene-flintwake',
        oversized: 'x'.repeat(GMA_SCENE_PLAN_PRIVATE_PAYLOAD_MAX_BYTES),
      },
    }), memoryCollection().records)).rejects.toMatchObject({ code: 'GMA_SCENE_PLAN_PAYLOAD_TOO_LARGE', status: 413 });
  });

  it('supersedes revisions after the rewind boundary and restores the exact prior plan', async () => {
    const { records } = memoryCollection();
    await appendScenePlanRevision(appendInput(), records);
    await appendScenePlanRevision(appendInput({
      expectedRevision: 1, idempotencyKey: 'append-2',
      timelineAnchor: { messageId: 'message-2', sequence: 2 },
      privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'scene-flintwake', beat: 'Dorrik refuses' },
    }), records);
    await appendScenePlanRevision(appendInput({
      expectedRevision: 2, idempotencyKey: 'append-3',
      timelineAnchor: { messageId: 'message-3', sequence: 3 },
      privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'scene-flintwake', beat: 'Dorrik permits one attempt' },
    }), records);

    const rewind = await rewindScenePlan({
      userId: 'tenant-a', campaignId: 'campaign-a', scenePlanId: 'plan-flintwake',
      expectedRevision: 3, boundarySequence: 1, rewindId: 'rewind-1',
    }, records);
    expect(rewind).toMatchObject({ supersededCount: 2, restoredScenePlanRef: { revision: 1 } });
    expect(await rewindScenePlan({
      userId: 'tenant-a', campaignId: 'campaign-a', scenePlanId: 'plan-flintwake',
      expectedRevision: 3, boundarySequence: 1, rewindId: 'rewind-1',
    }, records)).toMatchObject({ duplicate: true, supersededCount: 0, restoredScenePlanRef: { revision: 1 } });
    expect((await resolveScenePlanRevision({
      userId: 'tenant-a', campaignId: 'campaign-a', scenePlanId: 'plan-flintwake', revision: 3,
    }, records))?.status).toBe('superseded');

    const afterRewind = await appendScenePlanRevision(appendInput({
      expectedRevision: 1, idempotencyKey: 'append-4',
      timelineAnchor: { messageId: 'message-4', sequence: 2 },
      privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'scene-flintwake', beat: 'alternate branch' },
    }), records);
    expect(afterRewind.scenePlanRef.revision).toBe(4);
  });

  it('keeps private payload content out of redacted diagnostics', () => {
    const record = {
      ...appendInput(),
      revision: 1,
      payloadHash: 'a'.repeat(64),
      requestHash: 'b'.repeat(64),
      status: 'available' as const,
      interactionId: 'interaction-1',
      privatePayload: appendInput().privatePayload,
      createdAt: new Date('2026-08-02T12:00:00.000Z'),
      redactedAudit: { privatePayloadBytes: 100, topLevelKeys: ['dialogueFrames'], sourceRevisionKeys: ['gmcCanon'] },
    } satisfies ScenePlanRevisionDocument;
    const redacted = redactScenePlanRevision(record);
    expect(redacted).not.toHaveProperty('privatePayload');
    expect(JSON.stringify(redacted)).not.toContain('private background');
  });

  it('returns typed validation errors without echoing private payload content', async () => {
    const secret = 'Dorrik stole the hidden ledger';
    let caught: unknown;
    try {
      await appendScenePlanRevision(appendInput({
        privatePayload: { schemaVersion: 'gma.scene-plan/2', sceneId: 'wrong', secret },
      }), memoryCollection().records);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ScenePlanStoreError);
    expect(JSON.stringify(caught)).not.toContain(secret);
  });
});
