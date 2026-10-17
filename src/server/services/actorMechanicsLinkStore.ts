import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { ACTOR_MECHANICS_LINK_VERSION, ACTOR_MECHANICS_LINK_LIMITS, actorMechanicsLinkIssues,
  type ActorMechanicsLink } from '../../shared/llm/actorMechanicsLink.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { StoryWorkspaceStoreError } from './storyWorkspaceStore.js';

type Scope = { userId: string; campaignId: string };
type Authority = Awaited<ReturnType<typeof readObservationAuthority>>;
/** Current VCS-owned reciprocal identity proof, fetched by the coordinator. */
export interface VcsLinkEvidence {
  schemaVersion: string; bindingRef: string; ownerRef: string; subjectRef: string; subjectRevision: string;
  characterRecordRef: string; characterRevision: string; storyCampaignRef: string; storyActorRef: string;
  state: string; provenanceReceiptRefs: string[];
}
type SourceHead = { workspaceRevision: number; sceneKitId: string; sceneRevision: number; payloadFingerprint: string };
/** Immutable prepared human choice; expires if it is never confirmed. */
export interface ActorLinkDecisionDocument extends Scope {
  _id: string; operationId: string; requestFingerprint: string; expectedRegistryRevision: number;
  sourceHead: SourceHead; link: ActorMechanicsLink; expiresAt: Date; createdAt: Date;
}
/** Audited identity revision, independent of native Scene payloads. */
export interface ActorLinkRevisionDocument extends Scope {
  _id: string; revision: number; operationId: string; requestFingerprint: string;
  decisionRef: string; links: ActorMechanicsLink[]; createdAt: Date;
}
/** Narrow owner-ledger collection boundary. */
export type ActorLinkRecords = Pick<Collection<ActorLinkRevisionDocument>, 'findOne' | 'insertOne'>;
/** Narrow prepared-decision collection boundary. */
export type ActorLinkDecisions = Pick<Collection<ActorLinkDecisionDocument>, 'findOne' | 'insertOne'>;
/** Injected owner storage and authority readers for isolated verification. */
export interface ActorLinkDependencies {
  records?: ActorLinkRecords; decisions?: ActorLinkDecisions;
  readAuthority?: typeof readObservationAuthority; now?: () => Date; decisionId?: () => string;
  writeCampaignAllowlist?: string[];
}
/** Exact human-selected pair; no caller-supplied Scene replacement is accepted. */
export interface ActorLinkPrepareInput extends Scope {
  operationId: string; actorRef: string; subjectKind: 'character' | 'familiar'; parentActorRef: string | null;
  expectedRegistryRevision: number; expectedWorkspaceRevision: number; expectedSceneRevision: number; vcsBinding: VcsLinkEvidence;
}
/** Explicit integration API for identity only, not capability or gameplay. */
export interface ActorMechanicsLinkService {
  read(input: Scope, suppliedAuthority?: Authority): Promise<{ schemaVersion: string; revision: number; links: ActorMechanicsLink[]; sourceHead: SourceHead }>;
  prepare(input: ActorLinkPrepareInput): Promise<{ decisionRef: string; link: ActorMechanicsLink; expiresAt: Date; expectedRegistryRevision: number }>;
  confirm(input: Scope & { decisionRef: string }): Promise<{ schemaVersion: string; duplicate: boolean; revision: number; operationId: string; link: ActorMechanicsLink }>;
  retire(input: Scope & { operationId: string; linkRef: string; expectedRegistryRevision: number }): Promise<{ revision: number; duplicate: boolean }>;
  operation(input: Scope & { operationId: string }): Promise<ActorLinkRevisionDocument | null>;
  decisionOperation(input: Scope & { operationId: string }): Promise<ActorLinkDecisionDocument | null>;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
function fail(code: string, status = 409): never { throw new StoryWorkspaceStoreError(status, code, 'The character identity link could not be confirmed safely.', {}); }
const duplicateKey = (error: unknown): boolean => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
const scopeOf = (input: Scope): Scope => {
  if (!id(input.userId) || !id(input.campaignId)) fail('ACTOR_LINK_SCOPE_INVALID', 422);
  return { userId: input.userId, campaignId: input.campaignId };
};
const headOf = (authority: Authority): SourceHead => ({ workspaceRevision: Number(authority.workspaceRef.revision),
  sceneKitId: String(authority.sceneKitRef.sceneKitId), sceneRevision: Number(authority.sceneKitRef.revision),
  payloadFingerprint: String(authority.sceneKitRef.payloadFingerprint) });
const same = (left: unknown, right: unknown): boolean => freeformJsonDigest(left) === freeformJsonDigest(right);

/** Protected identity ledger. Its writes never replace a Story workspace or Scene. */
export function actorMechanicsLinkService(deps: ActorLinkDependencies = {}): ActorMechanicsLinkService {
  const records = deps.records ?? getDb().collection<ActorLinkRevisionDocument>('gma_actor_mechanics_links');
  const decisions = deps.decisions ?? getDb().collection<ActorLinkDecisionDocument>('gma_actor_mechanics_link_decisions');
  const readAuthority = deps.readAuthority ?? readObservationAuthority, now = deps.now ?? (() => new Date());
  const writeCampaigns = deps.writeCampaignAllowlist ?? (process.env.GMC_ACTOR_MECHANICS_LINK_WRITES === '1'
    ? String(process.env.GMC_ACTOR_MECHANICS_LINK_CAMPAIGN_ALLOWLIST ?? '').split(',').map((row) => row.trim()).filter(Boolean) : []);
  const requireWrite = (scope: Scope): void => { if (!writeCampaigns.includes(scope.campaignId)) fail('ACTOR_LINK_WRITES_PAUSED', 503); };
  const current = async (scope: Scope): Promise<ActorLinkRevisionDocument | null> => records.findOne(scopeOf(scope), { sort: { revision: -1 } });
  async function operation(input: Scope & { operationId: string }): Promise<ActorLinkRevisionDocument | null> {
    if (!id(input.operationId)) fail('ACTOR_LINK_OPERATION_INVALID', 422);
    return records.findOne({ ...scopeOf(input), operationId: input.operationId });
  }
  async function decisionOperation(input: Scope & { operationId: string }): Promise<ActorLinkDecisionDocument | null> {
    if (!id(input.operationId)) fail('ACTOR_LINK_OPERATION_INVALID', 422);
    // An uncertain prepare must be discoverable without recreating its old VCS
    // proof from newer heads, renewing its expiry or enabling new writes.
    return decisions.findOne({ ...scopeOf(input), operationId: input.operationId });
  }
  function validateAuthority(scope: Scope, authority: Authority): void {
    if (authority.workspaceRef.campaignId !== scope.campaignId || !Number.isSafeInteger(authority.workspaceRef.revision)) fail('ACTOR_LINK_SOURCE_CONFLICT');
  }
  function effectiveLinks(scope: Scope, authority: Authority, links: ActorMechanicsLink[]): ActorMechanicsLink[] {
    validateAuthority(scope, authority);
    const present = new Set(authority.actorCandidates.map((row) => String(row.actorRef)));
    const active = links.filter((row) => row.state === 'active' && present.has(row.actorRef)
      && (row.subjectKind !== 'familiar' || links.some((parent) => parent.state === 'active' && present.has(parent.actorRef)
        && parent.actorRef === row.parentActorRef && parent.subjectKind === 'character'
        && parent.vcsCharacterRef === row.vcsCharacterRef && parent.vcsOwnerRef === row.vcsOwnerRef)));
    for (const row of active) {
      if (actorMechanicsLinkIssues(row).length || row.campaignRef !== scope.campaignId) fail('ACTOR_LINK_RECORD_INVALID');
      for (const embedded of authority.actorMechanicsBindings) {
        if (embedded.state !== 'active') continue;
        if ((embedded.actorRef === row.actorRef || embedded.mechanicsSubjectRef === row.mechanicsSubjectRef)
          && (embedded.actorRef !== row.actorRef || embedded.mechanicsSubjectRef !== row.mechanicsSubjectRef
            || embedded.vcsOwnerRef !== row.vcsOwnerRef)) fail('ACTOR_LINK_EMBEDDED_CONFLICT');
      }
    }
    return active;
  }
  async function read(input: Scope, suppliedAuthority?: Authority) {
    const scope = scopeOf(input), [snapshot, authority] = await Promise.all([current(scope), suppliedAuthority ?? readAuthority(scope)]);
    return { schemaVersion: 'gmc.actor-mechanics-links/1', revision: snapshot?.revision ?? 0,
      links: effectiveLinks(scope, authority, snapshot?.links ?? []), sourceHead: headOf(authority) };
  }
  async function prepare(input: ActorLinkPrepareInput) {
    const scope = scopeOf(input);
    if (!id(input.operationId) || !id(input.actorRef) || !['character', 'familiar'].includes(input.subjectKind)
      || !Number.isSafeInteger(input.expectedRegistryRevision) || input.expectedRegistryRevision < 0) fail('ACTOR_LINK_INPUT_INVALID', 422);
    const requestFingerprint = freeformJsonDigest({ ...scope, ...Object.fromEntries(['operationId', 'actorRef', 'subjectKind',
      'parentActorRef', 'expectedRegistryRevision', 'expectedWorkspaceRevision', 'expectedSceneRevision', 'vcsBinding']
      .map((key) => [key, input[key as keyof typeof input]])) });
    const prior = await decisions.findOne({ ...scope, operationId: input.operationId });
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('ACTOR_LINK_IDEMPOTENCY_CONFLICT');
      return { decisionRef: prior._id, link: prior.link, expiresAt: prior.expiresAt, expectedRegistryRevision: prior.expectedRegistryRevision };
    }
    requireWrite(scope);
    const [authority, snapshot] = await Promise.all([readAuthority(scope), current(scope)]);
    validateAuthority(scope, authority);
    if (authority.workspaceRef.revision !== input.expectedWorkspaceRevision || authority.sceneKitRef.revision !== input.expectedSceneRevision
      || (snapshot?.revision ?? 0) !== input.expectedRegistryRevision) fail('ACTOR_LINK_SOURCE_CONFLICT');
    const candidates = authority.actorCandidates.filter((row) => row.actorRef === input.actorRef);
    if (candidates.length !== 1) fail('ACTOR_LINK_ACTOR_UNAVAILABLE');
    const candidate = candidates[0], proof = input.vcsBinding;
    if (!proof || proof.schemaVersion !== 'vcs.story-subject-binding/1' || proof.state !== 'active'
      || proof.storyCampaignRef !== scope.campaignId || proof.storyActorRef !== input.actorRef
      || proof.ownerRef !== scope.userId || typeof proof.characterRecordRef !== 'string'
      || !proof.characterRecordRef.startsWith('vcs:character:') || !Array.isArray(proof.provenanceReceiptRefs)
      || proof.provenanceReceiptRefs.length < 1 || proof.provenanceReceiptRefs.length > 24
      || proof.provenanceReceiptRefs.some((ref) => !id(ref))) fail('ACTOR_LINK_OWNER_EVIDENCE_INVALID', 422);
    const decisionRef = `actor-link-decision:${(deps.decisionId ?? randomUUID)()}`;
    const link: ActorMechanicsLink = { schemaVersion: ACTOR_MECHANICS_LINK_VERSION,
      linkRef: `actor-link:${freeformJsonDigest({ ...scope, operationId: input.operationId }).slice(0, 40)}`,
      campaignRef: scope.campaignId, actorRef: input.actorRef, actorRecordRef: String(candidate.actorRecordRef),
      actorRecordRevision: Number(candidate.actorRecordRevision), subjectKind: input.subjectKind, parentActorRef: input.parentActorRef,
      mechanicsSubjectRef: proof.subjectRef, vcsOwnerRef: proof.ownerRef, vcsCharacterRef: proof.characterRecordRef,
      vcsRevision: proof.subjectRevision, vcsCharacterRevision: proof.characterRevision,
      provenanceReceiptRefs: [...proof.provenanceReceiptRefs], humanDecisionRef: decisionRef, state: 'active' };
    if (actorMechanicsLinkIssues(link).length) fail('ACTOR_LINK_OWNER_EVIDENCE_INVALID', 422);
    const links = effectiveLinks(scope, authority, snapshot?.links ?? []);
    if (links.some((row) => row.actorRef === link.actorRef || row.mechanicsSubjectRef === link.mechanicsSubjectRef)) fail('ACTOR_LINK_PAIR_CONFLICT');
    if (link.subjectKind === 'familiar' && !links.some((row) => row.actorRef === link.parentActorRef && row.subjectKind === 'character'
      && row.vcsOwnerRef === link.vcsOwnerRef && row.vcsCharacterRef === link.vcsCharacterRef)) fail('ACTOR_LINK_PARENT_REQUIRED');
    const createdAt = now(), document: ActorLinkDecisionDocument = { ...scope, _id: decisionRef,
      operationId: input.operationId, requestFingerprint, expectedRegistryRevision: input.expectedRegistryRevision,
      sourceHead: headOf(authority), link, createdAt,
      expiresAt: new Date(createdAt.getTime() + ACTOR_MECHANICS_LINK_LIMITS.decisionHours * 3_600_000) };
    try { await decisions.insertOne(document); }
    catch (error) {
      if (!duplicateKey(error)) throw error;
      const raced = await decisions.findOne({ ...scope, operationId: input.operationId });
      if (!raced || raced.requestFingerprint !== requestFingerprint) fail('ACTOR_LINK_IDEMPOTENCY_CONFLICT');
      return { decisionRef: raced._id, link: raced.link, expiresAt: raced.expiresAt, expectedRegistryRevision: raced.expectedRegistryRevision };
    }
    return { decisionRef, link, expiresAt: document.expiresAt, expectedRegistryRevision: document.expectedRegistryRevision };
  }
  async function confirm(input: Scope & { decisionRef: string }) {
    const scope = scopeOf(input);
    if (!id(input.decisionRef)) fail('ACTOR_LINK_DECISION_INVALID', 422);
    // Reconciliation must work after the unused-decision TTL, without a new write.
    const committed = await records.findOne({ ...scope, decisionRef: input.decisionRef });
    if (committed) {
      const link = committed.links.find((row) => row.humanDecisionRef === input.decisionRef);
      if (!link) fail('ACTOR_LINK_RECORD_INVALID');
      return { schemaVersion: 'gmc.actor-mechanics-link-receipt/1', duplicate: true,
        revision: committed.revision, operationId: committed.operationId, link };
    }
    requireWrite(scope);
    const decision = await decisions.findOne({ ...scope, _id: input.decisionRef });
    if (!decision) fail('ACTOR_LINK_DECISION_UNAVAILABLE', 404);
    const existing = await operation({ ...scope, operationId: decision.operationId });
    if (existing) return { schemaVersion: 'gmc.actor-mechanics-link-receipt/1', duplicate: true,
      revision: existing.revision, operationId: existing.operationId, link: decision.link };
    if (decision.expiresAt.getTime() <= now().getTime()) fail('ACTOR_LINK_DECISION_EXPIRED');
    const [authority, snapshot] = await Promise.all([readAuthority(scope), current(scope)]);
    validateAuthority(scope, authority);
    if (!same(headOf(authority), decision.sourceHead) || (snapshot?.revision ?? 0) !== decision.expectedRegistryRevision) fail('ACTOR_LINK_SOURCE_CONFLICT');
    const links = (snapshot?.links ?? []).filter((row) => row.state === 'active');
    effectiveLinks(scope, authority, [...links, decision.link]);
    if (links.some((row) => row.state === 'active' && (row.actorRef === decision.link.actorRef
      || row.mechanicsSubjectRef === decision.link.mechanicsSubjectRef))) fail('ACTOR_LINK_PAIR_CONFLICT');
    const next: ActorLinkRevisionDocument = { ...scope, _id: `actor-links:${freeformJsonDigest({ ...scope, revision: decision.expectedRegistryRevision + 1 })}`,
      revision: decision.expectedRegistryRevision + 1, operationId: decision.operationId,
      requestFingerprint: decision.requestFingerprint, decisionRef: decision._id, links: [...links, decision.link], createdAt: now() };
    if (next.links.length > ACTOR_MECHANICS_LINK_LIMITS.active || Buffer.byteLength(JSON.stringify(next)) > ACTOR_MECHANICS_LINK_LIMITS.snapshotBytes) fail('ACTOR_LINK_REGISTRY_LIMIT');
    try { await records.insertOne(next); }
    catch (error) {
      if (!duplicateKey(error)) throw error;
      const raced = await operation({ ...scope, operationId: decision.operationId });
      if (!raced || raced.requestFingerprint !== decision.requestFingerprint) fail('ACTOR_LINK_SOURCE_CONFLICT');
      return { schemaVersion: 'gmc.actor-mechanics-link-receipt/1', duplicate: true,
        revision: raced.revision, operationId: raced.operationId, link: decision.link };
    }
    return { schemaVersion: 'gmc.actor-mechanics-link-receipt/1', duplicate: false,
      revision: next.revision, operationId: next.operationId, link: decision.link };
  }
  async function retire(input: Scope & { operationId: string; linkRef: string; expectedRegistryRevision: number }) {
    const scope = scopeOf(input);
    if (!id(input.operationId) || !id(input.linkRef)) fail('ACTOR_LINK_INPUT_INVALID', 422);
    const requestFingerprint = freeformJsonDigest({ ...scope, linkRef: input.linkRef, expectedRegistryRevision: input.expectedRegistryRevision });
    const prior = await operation(input);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) fail('ACTOR_LINK_IDEMPOTENCY_CONFLICT');
      return { revision: prior.revision, duplicate: true };
    }
    const snapshot = await current(scope);
    if (!snapshot || snapshot.revision !== input.expectedRegistryRevision) fail('ACTOR_LINK_SOURCE_CONFLICT');
    if (!snapshot.links.some((row) => row.linkRef === input.linkRef && row.state === 'active')) fail('ACTOR_LINK_RECORD_UNAVAILABLE', 404);
    const links = snapshot.links.map((row) => row.linkRef === input.linkRef ? { ...row, state: 'retired' as const } : row);
    const next: ActorLinkRevisionDocument = { ...scope, _id: `actor-links:${freeformJsonDigest({ ...scope, revision: snapshot.revision + 1 })}`,
      revision: snapshot.revision + 1, operationId: input.operationId, requestFingerprint,
      decisionRef: `actor-link-retirement:${freeformJsonDigest(input.operationId).slice(0, 40)}`, links, createdAt: now() };
    try { await records.insertOne(next); }
    catch (error) { if (duplicateKey(error)) fail('ACTOR_LINK_SOURCE_CONFLICT'); throw error; }
    return { revision: next.revision, duplicate: false };
  }
  return { read, prepare, confirm, retire, operation, decisionOperation };
}
