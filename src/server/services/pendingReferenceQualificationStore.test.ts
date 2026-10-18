import { describe, expect, it } from 'vitest';
import { typedReferenceFixture } from '../../shared/llm/fixtures/typedReferences.js';
import { pendingReferenceQualificationOperationId, pendingReferenceQualificationService } from './pendingReferenceQualificationStore.js';

function setup(allowed = true) {
  const fixture = typedReferenceFixture(), documents: any[] = [];
  let closed = false, loseConfirmation = false;
  const records: any = {
    findOne: async (filter: any) => structuredClone(documents.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) ?? null),
    insertOne: async (row: any) => {
      if (documents.some((saved) => saved._id === row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      documents.push(structuredClone(row));
      if (loseConfirmation) { loseConfirmation = false; throw Error('confirmation lost'); }
      return { insertedId: row._id };
    },
  };
  const service = pendingReferenceQualificationService({ records,
    readArtifact: async (scope) => scope.userId === fixture.scope.userId && scope.campaignId === fixture.scope.campaignId
      && scope.programId === fixture.scope.programId ? structuredClone(fixture.loaded) : null,
    readTicket: async (scope, ticket) => scope.userId === fixture.scope.userId && ticket === fixture.ticket._id ? structuredClone(fixture.ticket) : null,
    assertWorkflowOpen: async () => { if (closed) throw Object.assign(Error('closed root'), { code: 'FREEFORM_TURN_CLOSED' }); },
    writeCampaignAllowlist: allowed ? [fixture.scope.campaignId] : [],
  });
  const operationId = pendingReferenceQualificationOperationId(fixture.scope.programId);
  const input = { ...fixture.scope, schemaVersion: 'gmc.pending-reference-qualification-commit/1' as const,
    operationId, idempotencyKey: operationId, expectedArtifactRevision: 1 };
  return { fixture, documents, service, input, close: () => { closed = true; }, lose: () => { loseConfirmation = true; } };
}

describe('protected pending-reference qualification authority', () => {
  it('independently saves source proof once without changing a program, cursor, instruction or gameplay receipt', async () => {
    const s = setup(), before = structuredClone(s.fixture);
    const first = await s.service.commit(s.input), replay = await s.service.commit(s.input);
    expect(first.duplicate).toBe(false); expect(replay.duplicate).toBe(true);
    expect(replay.qualification).toEqual(first.qualification); expect(replay.receipt).toEqual(first.receipt);
    expect(s.documents).toHaveLength(1); expect(s.fixture).toEqual(before);
    expect(first.receipt.sourceArtifactRevision).toBe(1);
    expect(first.qualification.fields).toHaveLength(2);
  });
  it('recovers the exact original accepted write after its confirmation is lost, with no new authority operation', async () => {
    const s = setup(); s.lose();
    await expect(s.service.commit(s.input)).rejects.toThrow('confirmation lost');
    const recovered = await s.service.operation(s.input), repeated = await s.service.commit(s.input);
    expect(recovered?.receipt).toEqual(repeated.receipt); expect(repeated.duplicate).toBe(true);
    expect(s.documents).toHaveLength(1); expect(s.fixture.artifact.receipts).toEqual([]);
  });
  it('serializes competing same-operation writes through the unique scoped record key', async () => {
    const s = setup(), replies = await Promise.all([s.service.commit(s.input), s.service.commit(s.input)]);
    expect(s.documents).toHaveLength(1); expect(replies.filter((row) => !row.duplicate)).toHaveLength(1);
    expect(replies[0].receipt).toEqual(replies[1].receipt);
  });
  for (const kind of ['paused', 'scope', 'operation', 'revision', 'ticket', 'body', 'closed']) {
    it(`rejects ${kind} before saving a qualification`, async () => {
      const s = setup(kind !== 'paused'), input = { ...s.input };
      if (kind === 'scope') input.userId = 'user:foreign';
      if (kind === 'operation') input.operationId = input.idempotencyKey = 'operation:foreign';
      if (kind === 'revision') input.expectedArtifactRevision++;
      if (kind === 'ticket') s.fixture.ticket.outputDigest = 'a'.repeat(64);
      if (kind === 'body') s.fixture.artifact.program.nodes[1].dataRequirements[0].observation.targetRef = 'element:real';
      if (kind === 'closed') s.close();
      await expect(s.service.commit(input)).rejects.toThrow(); expect(s.documents).toHaveLength(0);
    });
  }
  it('does not revive a closed workflow merely because an earlier qualification exists', async () => {
    const s = setup(); await s.service.commit(s.input); s.close();
    await expect(s.service.operation(s.input)).rejects.toMatchObject({ code: 'FREEFORM_TURN_CLOSED' });
    await expect(s.service.commit(s.input)).rejects.toMatchObject({ code: 'FREEFORM_TURN_CLOSED' });
    expect(s.documents).toHaveLength(1);
  });
  it('retains the original immutable qualification after progress but cannot change its source program', async () => {
    const s = setup(), first = await s.service.commit(s.input);
    s.fixture.artifact.cursor.revision = s.fixture.loaded.artifactRef.revision = 2;
    s.fixture.artifact.cursor.completedNodeRefs.push('freeform:step:0' as never);
    s.fixture.artifact.cursor.readyNodeRefs = ['freeform:step:1']; s.fixture.artifact.cursor.remainingNodeRefs = [];
    s.fixture.artifact.receipts.push({ programId: s.input.programId, nodeId: 'freeform:step:0', receiptId: 'receipt:unit-completed' } as never);
    expect((await s.service.operation(s.input))?.receipt).toEqual(first.receipt);
    s.fixture.artifact.program.nodes[0].summary = 'A changed source body.';
    await expect(s.service.operation(s.input)).rejects.toMatchObject({ code: 'PENDING_REFERENCE_RECORD_INVALID' });
    expect(s.documents).toHaveLength(1);
  });
  it('does not trust a changed stored qualification or receipt', async () => {
    const s = setup(); await s.service.commit(s.input);
    s.documents[0].qualification.fields[0].slotId = 'foreign:slot';
    await expect(s.service.operation(s.input)).rejects.toMatchObject({ code: 'PENDING_REFERENCE_RECORD_INVALID' });
  });
  it.each(['authority', 'programRef', 'qualificationRef', 'receiptRef', 'sourceWindowFingerprint', 'sourceArtifactRevision', 'extra'])('rejects a changed protected receipt %s', async (field) => {
    const s = setup(); await s.service.commit(s.input);
    s.documents[0].receipt[field] = field === 'sourceArtifactRevision' ? 0 : 'foreign';
    await expect(s.service.operation(s.input)).rejects.toMatchObject({ code: 'PENDING_REFERENCE_RECORD_INVALID' });
    expect(s.documents).toHaveLength(1);
  });
});
