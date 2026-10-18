import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { derivePendingReferenceQualification, pendingReferenceQualificationIssues } from '../../shared/llm/pendingReferenceQualification.js';
import { TYPED_REFERENCE_AUTHORITY_BUNDLE as V } from '../../shared/llm/typedReferenceBindings.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';

type Row = Record<string, any>;
type Scope = { userId: string; campaignId: string; programId: string };
export interface PendingReferenceQualificationDocument extends Scope {
  _id: string; operationId: string; qualification: JsonObject; receipt: JsonObject; createdAt: Date;
}
type Records = Pick<Collection<PendingReferenceQualificationDocument>, 'findOne' | 'insertOne'>;
export interface PendingReferenceQualificationDependencies {
  records?: Records;
  readArtifact?: (scope: Scope) => Promise<any>;
  readTicket?: (scope: Scope, ticket: string) => Promise<any>;
  assertWorkflowOpen?: (scope: Scope, binding: Row) => Promise<void>;
  writeCampaignAllowlist?: string[];
  now?: () => Date;
}
export interface PendingReferenceQualificationCommit extends Scope {
  schemaVersion: 'gmc.pending-reference-qualification-commit/1'; operationId: string; idempotencyKey: string; expectedArtifactRevision: number;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const fail = (code: string, status = 409): never => { throw new StoryWorkspaceStoreError(status, code,
  'The saved action reference history could not be verified safely.', {}); };
export const pendingReferenceQualificationOperationId = (programId: string) => `pending-reference-qualify:${freeformJsonDigest(programId).slice(0, 40)}`;

/** Independent provenance writer: never changes a program, Scene, roll, cursor,
 * target selection or receipt. Final binding/execution retain their own CAS. */
export function pendingReferenceQualificationService(deps: PendingReferenceQualificationDependencies = {}) {
  const records = deps.records ?? getDb().collection<PendingReferenceQualificationDocument>('gma_pending_reference_qualifications');
  const readArtifact = deps.readArtifact ?? (async (scope: Scope) =>
    (await import('./compoundActionArtifactStore.js')).readActiveCompoundActionArtifact(scope));
  const readTicket = deps.readTicket ?? (async (scope: Scope, ticket: string) => getDb().collection('llm_freeform_tickets')
    .findOne({ _id: ticket as any, userId: scope.userId, campaignId: scope.campaignId }));
  const assertOpen = deps.assertWorkflowOpen ?? (async (scope: Scope, binding: Row) =>
    (await import('./freeformWorkflowAuthority.js')).assertFreeformProgramWorkflowOpen(scope, binding));
  const allowlist = deps.writeCampaignAllowlist ?? (process.env.GMC_PENDING_REFERENCE_QUALIFICATION === '1'
    ? String(process.env.GMC_PENDING_REFERENCE_QUALIFICATION_CAMPAIGN_ALLOWLIST ?? '').split(',').map((v) => v.trim()).filter(Boolean) : []);
  const scoped = (input: Scope): Scope => {
    if (![input.userId, input.campaignId, input.programId].every(id)) return fail('PENDING_REFERENCE_SCOPE_INVALID', 422);
    return { userId: input.userId, campaignId: input.campaignId, programId: input.programId };
  };
  async function current(input: Scope) {
    const scope = scoped(input), loaded = await readArtifact(scope);
    if (!loaded?.artifact || loaded.artifactRef?.programId !== scope.programId || loaded.artifactRef?.campaignId !== scope.campaignId
      || loaded.artifact.program?.programId !== scope.programId || loaded.artifact.program.authorityBase?.campaignId !== scope.campaignId)
      return fail('PENDING_REFERENCE_SOURCE_CHANGED');
    await assertOpen(scope, loaded.artifact.freeformBinding);
    return { scope, loaded, source: { instruction: loaded.artifact.instruction, program: loaded.artifact.program,
      cursor: loaded.artifact.cursor, receipts: loaded.artifact.receipts, artifactRevision: loaded.artifactRef.revision } };
  }
  async function operation(input: Scope & { operationId: string }) {
    const { scope, source } = await current(input);
    if (input.operationId !== pendingReferenceQualificationOperationId(scope.programId)) return fail('PENDING_REFERENCE_OPERATION_INVALID', 422);
    const row = await records.findOne({ ...scope, operationId: input.operationId });
    if (!row) return null;
    const q = row.qualification;
    const receipt = row.receipt;
    if (pendingReferenceQualificationIssues(q, source).length
      || !receipt || Object.keys(receipt).sort().join(',') !== 'authority,operationId,programFingerprint,programRef,qualificationFingerprint,qualificationRef,receiptRef,schemaVersion,sourceArtifactRevision,sourceWindowFingerprint'
      || receipt.schemaVersion !== V.qualificationReceipt || receipt.operationId !== row.operationId
      || receipt.authority !== 'gmc' || receipt.programRef !== scope.programId
      || receipt.receiptRef !== `gmc:pending-reference:${freeformJsonDigest({ ...scope, operationId: input.operationId }).slice(0, 40)}`
      || receipt.qualificationRef !== q.qualificationRef || receipt.sourceWindowFingerprint !== q.sourceWindowFingerprint
      || !Number.isSafeInteger(receipt.sourceArtifactRevision) || Number(receipt.sourceArtifactRevision) < 1
      || Number(receipt.sourceArtifactRevision) > source.artifactRevision
      || row.receipt.qualificationFingerprint !== freeformJsonDigest(q)
      || row.receipt.programFingerprint !== freeformJsonDigest(source.program)) return fail('PENDING_REFERENCE_RECORD_INVALID');
    return { qualification: q, receipt: row.receipt, duplicate: true };
  }
  async function commit(input: PendingReferenceQualificationCommit) {
    if (input.schemaVersion !== 'gmc.pending-reference-qualification-commit/1'
      || input.operationId !== pendingReferenceQualificationOperationId(input.programId) || input.idempotencyKey !== input.operationId
      || !Number.isSafeInteger(input.expectedArtifactRevision) || input.expectedArtifactRevision < 1)
      return fail('PENDING_REFERENCE_INPUT_INVALID', 422);
    const prior = await operation(input);
    if (prior) return prior;
    const { scope, loaded, source } = await current(input);
    if (!allowlist.includes(scope.campaignId)) return fail('PENDING_REFERENCE_WRITES_PAUSED', 503);
    if (loaded.artifactRef.revision !== input.expectedArtifactRevision) return fail('PENDING_REFERENCE_SOURCE_CHANGED');
    const ticket = await readTicket(scope, loaded.artifact.freeformBinding?.ticket);
    if (!ticket || ticket.userId !== scope.userId || ticket.campaignId !== scope.campaignId) return fail('PENDING_REFERENCE_PROOF_UNAVAILABLE');
    let qualification: JsonObject;
    try { qualification = derivePendingReferenceQualification(loaded.artifact, loaded.artifactRef.revision, ticket); }
    catch { return fail('PENDING_REFERENCE_PROOF_INVALID'); }
    if (pendingReferenceQualificationIssues(qualification, source).length) return fail('PENDING_REFERENCE_PROOF_INVALID');
    const fresh = await current(scope);
    if (fresh.loaded.artifactRef.revision !== input.expectedArtifactRevision
      || freeformJsonDigest(fresh.source) !== freeformJsonDigest(source)) return fail('PENDING_REFERENCE_SOURCE_CHANGED');
    const receipt = { schemaVersion: V.qualificationReceipt, authority: 'gmc', operationId: input.operationId,
      receiptRef: `gmc:pending-reference:${freeformJsonDigest({ ...scope, operationId: input.operationId }).slice(0, 40)}`,
      programRef: scope.programId, programFingerprint: freeformJsonDigest(source.program),
      qualificationRef: qualification.qualificationRef, qualificationFingerprint: freeformJsonDigest(qualification),
      sourceArtifactRevision: source.artifactRevision, sourceWindowFingerprint: qualification.sourceWindowFingerprint };
    try {
      await records.insertOne({ ...scope, _id: freeformJsonDigest({ ...scope, operationId: input.operationId }), operationId: input.operationId,
        qualification, receipt, createdAt: (deps.now ?? (() => new Date()))() });
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      const saved = await operation(input); if (saved) return saved;
      return fail('PENDING_REFERENCE_RECORD_INVALID');
    }
    return { qualification, receipt, duplicate: false };
  }
  return { operation, commit };
}
