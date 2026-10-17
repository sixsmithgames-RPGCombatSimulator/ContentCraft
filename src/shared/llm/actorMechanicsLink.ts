/** ADR 016: identity provenance only; never a form, position or action receipt. */
export const ACTOR_MECHANICS_LINK_VERSION = 'gmc.actor-mechanics-link/1';
export const ACTOR_MECHANICS_LINK_CAPABILITY = 'actor-mechanics-identity-links/1';
export const ACTOR_MECHANICS_LINK_CHOICES_VERSION = 'gmc.actor-mechanics-link-choices/1';
export const ACTOR_MECHANICS_LINK_SELECTION_CAPABILITY = 'actor-mechanics-link-selection-reader/1';
export const ACTOR_MECHANICS_LINK_LIMITS = Object.freeze({ active: 128, snapshotBytes: 262_144, decisionHours: 24 });

export interface ActorMechanicsLink {
  schemaVersion: typeof ACTOR_MECHANICS_LINK_VERSION;
  linkRef: string; campaignRef: string; actorRef: string; actorRecordRef: string; actorRecordRevision: number;
  subjectKind: 'character' | 'familiar'; parentActorRef: string | null;
  mechanicsSubjectRef: string; vcsOwnerRef: string; vcsCharacterRef: string;
  vcsRevision: string; vcsCharacterRevision: string; provenanceReceiptRefs: string[];
  humanDecisionRef: string; state: 'active' | 'retired';
}

/** Closed shape check shared by owner storage and generated coordinator mirror. */
export function actorMechanicsLinkIssues(value: unknown): string[] {
  const fields = ['schemaVersion', 'linkRef', 'campaignRef', 'actorRef', 'actorRecordRef', 'actorRecordRevision',
    'subjectKind', 'parentActorRef', 'mechanicsSubjectRef', 'vcsOwnerRef', 'vcsCharacterRef', 'vcsRevision',
    'vcsCharacterRevision', 'provenanceReceiptRefs', 'humanDecisionRef', 'state'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['$'];
  const row = value as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
  const issues: string[] = [];
  if (Object.keys(row).length !== fields.length || fields.some((key) => !Object.hasOwn(row, key))) issues.push('$');
  if (row.schemaVersion !== ACTOR_MECHANICS_LINK_VERSION) issues.push('schemaVersion');
  for (const key of ['linkRef', 'campaignRef', 'actorRef', 'actorRecordRef', 'mechanicsSubjectRef', 'vcsOwnerRef',
    'vcsCharacterRef', 'vcsRevision', 'vcsCharacterRevision', 'humanDecisionRef']) if (!id(row[key])) issues.push(key);
  if (!Number.isSafeInteger(row.actorRecordRevision) || Number(row.actorRecordRevision) < 1) issues.push('actorRecordRevision');
  if (!['character', 'familiar'].includes(String(row.subjectKind))) issues.push('subjectKind');
  if (row.subjectKind === 'character' ? row.parentActorRef !== null : !id(row.parentActorRef) || row.parentActorRef === row.actorRef) issues.push('parentActorRef');
  if (!Array.isArray(row.provenanceReceiptRefs) || row.provenanceReceiptRefs.length < 1 || row.provenanceReceiptRefs.length > 12
    || row.provenanceReceiptRefs.some((ref) => !id(ref)) || new Set(row.provenanceReceiptRefs).size !== row.provenanceReceiptRefs.length) issues.push('provenanceReceiptRefs');
  if (!['active', 'retired'].includes(String(row.state))) issues.push('state');
  if (id(row.vcsCharacterRef) && id(row.mechanicsSubjectRef)
    && row.mechanicsSubjectRef !== row.vcsCharacterRef.replace(/^vcs:character:/, `vcs:${String(row.subjectKind)}:`)) issues.push('mechanicsSubjectRef');
  return issues;
}
