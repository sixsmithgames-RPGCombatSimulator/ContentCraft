import { describe, expect, it, vi } from 'vitest';
import { buildFreeformSceneCatalog, assertFreeformCatalogCurrent } from './freeformSceneCatalog.js';
import { issueFreeformTicket, readFreeformTicketContext, type FreeformTicketCollection, type FreeformTicketRecord } from './freeformTickets.js';
import type { readCurrentSceneContexts } from '../services/actionDirectedStoryStore.js';

function fixture() {
  const storyWorkspaceRef = { contractVersion: 'gmc.story-workspace-ref/1', campaignId: 'fictional-campaign', workspaceId: 'story-workspace:fictional-campaign', revision: 7, payloadHash: 'a'.repeat(64) };
  const context = { storyWorkspaceRef, playableSceneContext: {
    sceneKitRef: { sceneKitId: 'scene:fictional', revision: 4, payloadHash: 'b'.repeat(64) },
    playableLocus: { label: 'Tunnel entrance', canonicalAnchorRef: null },
    presentActors: ['gmc:actor:player'], sceneLocalRoles: [{ roleId: 'gmc:role:worker', label: 'Drain worker', secret: 'SECRET_ROLE' }],
    establishedElements: [{ elementId: 'gmc:element:tunnel', truthState: 'scene_local_established', summary: 'The tunnel' },
      { elementId: 'gmc:element:hidden', truthState: 'hidden_prepared', summary: 'SECRET_ELEMENT' }],
    anticipatedActors: ['SECRET_ANTICIPATED'], observables: [{ value: 'SECRET_FACT' }], information: [{ factText: 'SECRET_INFORMATION' }],
  }, privateSceneContext: { secret: 'SECRET_PRIVATE' } };
  const documents: FreeformTicketRecord[] = [];
  const records = { findOne: async (filter: Record<string, unknown>) => structuredClone(documents.find((row) =>
    Object.entries(filter).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) ?? null),
  insertOne: async (row: FreeformTicketRecord) => { documents.push(structuredClone(row)); } } as unknown as FreeformTicketCollection;
  const instruction = { schemaVersion: 'gma.player-instruction-artifact/1', interactionId: 'fictional-turn', instructionRef: 'instruction:fictional', instructionFingerprint: 'c'.repeat(64), exactText: 'I look at the tunnel.', utf8Bytes: 21 };
  // The owner reader's large return shape is irrelevant here; only its public
  // context and immutable refs are used by the allowlist under test.
  const readSceneContext = vi.fn(async () => structuredClone(context)) as unknown as typeof readCurrentSceneContexts;
  const readInstruction = vi.fn(async () => ({ instruction, originCheckpoint: { storyWorkspaceRef } })) as unknown as NonNullable<Parameters<typeof issueFreeformTicket>[1]>['readInstruction'];
  const input = { userId: 'fictional-user', campaignId: 'fictional-campaign', interactionId: 'fictional-turn', issuanceKey: 'fictional-issue', mode: 'action' as const, transport: 'manual' as const, selectedActorRef: null, includeSceneCatalog: true };
  return { context, documents, input, records, readSceneContext, readInstruction };
}

describe('protected current-Scene catalog', () => {
  it('exports only public identity choices, not private facts or owner refs in the model input', () => {
    const f = fixture(); const result = buildFreeformSceneCatalog(f.context, null, f.context.storyWorkspaceRef);
    expect(result.catalog.map((row) => row.key)).toEqual(['scene_locus', 'scene_actor_0', 'scene_role_0', 'scene_element_0', 'scene_element_place_0', 'scene_element_object_0']);
    expect(JSON.stringify(result.catalog)).not.toMatch(/SECRET|gmc:element|gmc:actor|truthState|payloadHash/);
    expect(result.catalogBindings.find((row) => row.key === 'scene_element_place_0')).toEqual({ key: 'scene_element_place_0', kind: 'place', ref: 'gmc:element:tunnel' });
    expect(result.catalogContextRef.sceneKitRef.revision).toBe(4);
  });
  it('never joins labels, deduplicates only exact identity and bounds all exported labels/rows', () => {
    const f = fixture(); f.context.playableSceneContext.establishedElements = Array.from({ length: 80 }, (_, index) => ({ elementId: `element:${index}`, truthState: 'canonical', summary: 'Same label '.repeat(50) }));
    const result = buildFreeformSceneCatalog(f.context, 'gmc:actor:player', f.context.storyWorkspaceRef);
    expect(result.catalog).toHaveLength(32);
    expect(result.catalog.every((row) => row.label.length <= 200)).toBe(true);
    expect(result.catalog.filter((row) => row.kind === 'actor' && row.key === 'scene_actor_0')).toHaveLength(0);
    expect(new Set(result.catalogBindings.map((row) => `${row.kind}:${row.ref}`)).size).toBe(32);
    expect(result.catalog.some((row) => row.kind === 'place' && row.key === 'scene_element_place_0')).toBe(true);
    expect(result.catalog.some((row) => row.kind === 'object' && row.key === 'scene_element_object_0')).toBe(true);
  });
  it.each(['workspace', 'scene', 'absent'])('rejects a changed or unavailable current head: %s', (kind) => {
    const f = fixture(), result = buildFreeformSceneCatalog(f.context, null, f.context.storyWorkspaceRef);
    if (kind === 'workspace') f.context.storyWorkspaceRef.revision++;
    if (kind === 'scene') f.context.playableSceneContext.sceneKitRef.revision++;
    expect(() => assertFreeformCatalogCurrent(result.catalogContextRef, kind === 'absent' ? null : f.context)).toThrowError(expect.objectContaining({ code: 'FREEFORM_SCENE_CONTEXT_STALE' }));
  });
  it('stages no catalog ticket when the owner Scene differs from the instruction origin', async () => {
    const f = fixture(); f.context.storyWorkspaceRef.revision++;
    const readInstruction = vi.fn(async () => ({ instruction: { exactText: 'I look.', instructionFingerprint: 'c'.repeat(64) }, originCheckpoint: { storyWorkspaceRef: { ...f.context.storyWorkspaceRef, revision: 7 } } })) as unknown as typeof f.readInstruction;
    await expect(issueFreeformTicket(f.input, { ...f, readInstruction })).rejects.toMatchObject({ code: 'FREEFORM_SCENE_CONTEXT_STALE' });
    expect(f.documents).toHaveLength(0);
  });
  it('returns the exact protected map on duplicate issuance and isolates context reads', async () => {
    const f = fixture(), issued = await issueFreeformTicket(f.input, f);
    const duplicate = await issueFreeformTicket(f.input, f);
    expect(duplicate).toEqual({ ...issued, duplicate: true }); expect(f.readSceneContext).toHaveBeenCalledTimes(1);
    expect(await readFreeformTicketContext({ ...f.input, ticket: issued.ticket }, f.records)).toEqual(duplicate);
    for (const scope of [{ userId: 'another-user' }, { campaignId: 'another-campaign' }]) await expect(readFreeformTicketContext({ ...f.input, ...scope, ticket: issued.ticket }, f.records)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_NOT_FOUND' });
    f.documents[0].status = 'retired';
    await expect(readFreeformTicketContext({ ...f.input, ticket: issued.ticket }, f.records)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_RETIRED' });
    f.documents[0].status = 'accepted';
    expect(await readFreeformTicketContext({ ...f.input, ticket: issued.ticket }, f.records)).toEqual(duplicate);
    f.documents[0].expiresAt = new Date(0);
    await expect(readFreeformTicketContext({ ...f.input, ticket: issued.ticket }, f.records)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_EXPIRED' });
  });
  it('leaves historical issuance unchanged and does not turn on integrated catalog export', async () => {
    const f = fixture(), result = await issueFreeformTicket({ ...f.input, includeSceneCatalog: undefined }, f);
    expect(f.readSceneContext).not.toHaveBeenCalled(); expect(result.catalogBindings).toBeUndefined();
    expect(result.request.context.input?.value).toMatchObject({ catalog: [] });
    await expect(issueFreeformTicket({ ...f.input, transport: 'integrated' }, f)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_INPUT_INVALID' });
  });
});
