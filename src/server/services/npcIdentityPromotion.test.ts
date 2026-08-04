import type { Collection, Filter } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  NPC_IDENTITY_PROMOTION_CONTRACT_VERSION,
  NPC_IDENTITY_REVEAL_CONTRACT_VERSION,
  promoteExistingNpcIdentity,
  revealExistingNpcIdentity,
  type PromoteExistingNpcIdentityInput,
  type RevealExistingNpcIdentityInput,
} from './npcIdentityPromotion.js';

type Npc = Record<string, any> & { _id: string; userId: string; project_id: string; type: 'npc' };

function matches(record: Npc, filter: Filter<Npc>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = record[key];
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
      if ('$ne' in wanted) return actual !== (wanted as { $ne: unknown }).$ne;
      if ('$exists' in wanted) return (actual !== undefined) === Boolean((wanted as { $exists: unknown }).$exists);
    }
    return actual === wanted;
  });
}

function memoryCollection(seed: Npc[]) {
  const documents = structuredClone(seed);
  const api = {
    async findOne(filter: Filter<Npc>) {
      return documents.find((document) => matches(document, filter)) ?? null;
    },
    find(filter: Filter<Npc>) {
      let selected = documents.filter((document) => matches(document, filter));
      const cursor = {
        project(_projection: Record<string, number>) { return cursor; },
        async toArray() { return structuredClone(selected); },
      };
      return cursor;
    },
    async findOneAndUpdate(filter: Filter<Npc>, update: Record<string, any>) {
      const document = documents.find((candidate) => matches(candidate, filter));
      if (!document) return null;
      Object.assign(document, structuredClone(update.$set ?? {}));
      const push = update.$push?.audit_trail;
      if (push?.$each) {
        document.audit_trail = [...(document.audit_trail ?? []), ...structuredClone(push.$each)].slice(push.$slice ?? 0);
      }
      return structuredClone(document);
    },
  };
  return { records: api as unknown as Collection<Npc>, documents };
}

function roleSeed(overrides: Partial<Npc> = {}): Npc {
  return {
    _id: 'assigned-watch-officer',
    userId: 'tenant-a',
    project_id: 'campaign-a',
    type: 'npc',
    canonical_name: 'Watch officer',
    aliases: [],
    status: 'active',
    revision: 6,
    version: '1.0.5',
    details: {
      displayLabel: 'Watch officer',
      profession: 'City Watch officer',
      narrativeDepth: 'surface',
      mechanicalDepth: 'none',
      identity: {
        entityKind: 'individual',
        displayLabel: 'Watch officer',
        nameKnownToPlayers: false,
        identityMaturity: 'role_seed',
        revealState: 'not_known',
      },
    },
    audit_trail: [],
    ...overrides,
  };
}

function promotion(overrides: Partial<PromoteExistingNpcIdentityInput> = {}): PromoteExistingNpcIdentityInput {
  return {
    schemaVersion: NPC_IDENTITY_PROMOTION_CONTRACT_VERSION,
    userId: 'tenant-a',
    campaignId: 'campaign-a',
    npcId: 'assigned-watch-officer',
    expectedRevision: 6,
    roleSeed: {
      displayLabel: 'Watch officer',
      profession: 'City Watch officer',
      affiliationRefs: ['gmc:faction:city-watch'],
    },
    requiredIdentityMaturity: 'canonical_private',
    requiredNarrativeDepth: 'surface',
    unavailableNames: [],
    reason: 'This individual is likely to speak in the next playable scene.',
    idempotencyKey: 'npc-identity:campaign-a:assigned-watch-officer:flintwake',
    correlationId: 'correlation:flintwake',
    ...overrides,
  };
}

function revelation(overrides: Partial<RevealExistingNpcIdentityInput> = {}): RevealExistingNpcIdentityInput {
  return {
    schemaVersion: NPC_IDENTITY_REVEAL_CONTRACT_VERSION,
    userId: 'tenant-a',
    campaignId: 'campaign-a',
    npcId: 'assigned-watch-officer',
    expectedRevision: 7,
    revealMode: 'self_introduction',
    interactionId: 'interaction:flintwake:introduction',
    evidenceFingerprint: 'a'.repeat(64),
    idempotencyKey: 'npc-reveal:campaign-a:assigned-watch-officer:flintwake',
    correlationId: 'correlation:flintwake',
    ...overrides,
  };
}

describe('existing NPC identity promotion', () => {
  it('promotes the same role-seed record once while keeping the private name unrevealed', async () => {
    const store = memoryCollection([roleSeed()]);
    const result = await promoteExistingNpcIdentity(promotion(), store.records as any);

    expect(result).toMatchObject({
      npcId: 'assigned-watch-officer',
      revision: 7,
      displayLabel: 'Watch officer',
      identityMaturity: 'canonical_private',
      revealState: 'not_known',
      narrativeDepth: 'surface',
      mechanicalDepth: 'none',
      duplicate: false,
      authorityReceipt: { status: 'applied', authoritativeStateChanged: true, authorityRevision: '7' },
    });
    expect(result?.privateCanonicalName).not.toBe('Watch officer');
    expect(result?.aliases).toContain('Watch officer');
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0]._id).toBe('assigned-watch-officer');
    expect(store.documents[0].details.identity.nameKnownToPlayers).toBe(false);
  });

  it('replays the exact operation without renaming or revising the NPC again', async () => {
    const store = memoryCollection([roleSeed()]);
    const first = await promoteExistingNpcIdentity(promotion(), store.records as any);
    const replay = await promoteExistingNpcIdentity(promotion(), store.records as any);
    expect(replay).toMatchObject({
      privateCanonicalName: first?.privateCanonicalName,
      revision: 7,
      duplicate: true,
      authorityReceipt: { status: 'applied', authoritativeStateChanged: false },
    });
    expect(store.documents[0].audit_trail).toHaveLength(1);
  });

  it('generates the same stable identity for identical campaign preparation inputs', async () => {
    const firstStore = memoryCollection([roleSeed()]);
    const secondStore = memoryCollection([roleSeed()]);
    const first = await promoteExistingNpcIdentity(promotion(), firstStore.records as any);
    const second = await promoteExistingNpcIdentity(promotion(), secondStore.records as any);
    expect(first?.privateCanonicalName).toBe(second?.privateCanonicalName);
  });

  it('preserves an already known canonical identity and never demotes its reveal state', async () => {
    const known = roleSeed({
      canonical_name: 'Mara Graymantle',
      revision: 3,
      details: {
        displayLabel: 'Mara Graymantle', narrativeDepth: 'surface', mechanicalDepth: 'none',
        identity: {
          canonicalName: 'Mara Graymantle', displayLabel: 'Mara Graymantle', nameKnownToPlayers: true,
          identityMaturity: 'canonical_player_known', revealState: 'known',
        },
      },
    });
    const store = memoryCollection([known]);
    const result = await promoteExistingNpcIdentity(promotion({ expectedRevision: 3 }), store.records as any);
    expect(result).toMatchObject({
      privateCanonicalName: 'Mara Graymantle', displayLabel: 'Mara Graymantle',
      identityMaturity: 'canonical_player_known', revealState: 'known',
    });
  });

  it('rejects stale revisions, changed idempotency requests, and preparation-time name revelation', async () => {
    const staleStore = memoryCollection([roleSeed()]);
    await expect(promoteExistingNpcIdentity(promotion({ expectedRevision: 5 }), staleStore.records as any))
      .rejects.toMatchObject({ code: 'NPC_IDENTITY_PROMOTION_REVISION_CONFLICT', status: 409 });

    const replayStore = memoryCollection([roleSeed()]);
    await promoteExistingNpcIdentity(promotion(), replayStore.records as any);
    await expect(promoteExistingNpcIdentity(promotion({ reason: 'A different operation under the same key.' }), replayStore.records as any))
      .rejects.toMatchObject({ code: 'NPC_IDENTITY_PROMOTION_IDEMPOTENCY_CONFLICT', status: 409 });

    await expect(promoteExistingNpcIdentity({
      ...promotion(), requiredIdentityMaturity: 'canonical_player_known' as any,
    }, memoryCollection([roleSeed()]).records as any)).rejects.toMatchObject({
      code: 'NPC_IDENTITY_PROMOTION_REVEAL_FORBIDDEN', status: 422,
    });
  });

  it('keeps diagnostics free of the generated private name on validation failure', async () => {
    let caught: unknown;
    try {
      await promoteExistingNpcIdentity(promotion({ expectedRevision: 99 }), memoryCollection([roleSeed()]).records as any);
    } catch (error) {
      caught = error;
    }
    expect(JSON.stringify(caught)).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
  });
});

describe('prepared NPC identity reveal', () => {
  it('reveals the existing prepared name once and records the exact narration evidence', async () => {
    const store = memoryCollection([roleSeed()]);
    const promoted = await promoteExistingNpcIdentity(promotion(), store.records as any);
    const result = await revealExistingNpcIdentity(revelation({ expectedRevision: promoted?.revision }), store.records as any);

    expect(result).toMatchObject({
      npcId: 'assigned-watch-officer',
      revision: 8,
      displayLabel: promoted?.privateCanonicalName,
      identityMaturity: 'canonical_player_known',
      revealState: 'introduced',
      duplicate: false,
      authorityReceipt: {
        contractVersion: 'gmc.npc-identity-reveal-receipt/1',
        status: 'applied',
        authoritativeStateChanged: true,
        interactionId: 'interaction:flintwake:introduction',
        evidenceFingerprint: 'a'.repeat(64),
      },
    });
    expect(store.documents[0].canonical_name).toBe(promoted?.privateCanonicalName);
    expect(store.documents[0].details.identity).toMatchObject({
      nameKnownToPlayers: true,
      identityMaturity: 'canonical_player_known',
      revealState: 'introduced',
    });
    expect(store.documents[0].audit_trail.at(-1)).toMatchObject({
      action: 'identity_revealed',
      evidenceFingerprint: 'a'.repeat(64),
    });
  });

  it('replays exactly without revising twice and rejects stale or unprepared reveals', async () => {
    const store = memoryCollection([roleSeed()]);
    await promoteExistingNpcIdentity(promotion(), store.records as any);
    const first = await revealExistingNpcIdentity(revelation(), store.records as any);
    const replay = await revealExistingNpcIdentity(revelation(), store.records as any);
    expect(replay).toMatchObject({ revision: first?.revision, duplicate: true });
    expect(store.documents[0].revision).toBe(8);

    const stale = memoryCollection([roleSeed()]);
    await promoteExistingNpcIdentity(promotion(), stale.records as any);
    await expect(revealExistingNpcIdentity(revelation({ expectedRevision: 6 }), stale.records as any))
      .rejects.toMatchObject({ code: 'NPC_IDENTITY_REVEAL_REVISION_CONFLICT', status: 409 });

    await expect(revealExistingNpcIdentity(revelation({ expectedRevision: 6 }), memoryCollection([roleSeed()]).records as any))
      .rejects.toMatchObject({ code: 'NPC_IDENTITY_REVEAL_NOT_PREPARED', status: 409 });
  });
});
