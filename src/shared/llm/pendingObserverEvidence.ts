/** ADR 016 qualification cannot satisfy a movement or observation-completion gate. */
export const PENDING_OBSERVER_EVIDENCE_VERSION = 'gmc.pending-observer-evidence/1';
export const CONTINUATION_OBSERVER_EVIDENCE_VERSION = 'gmc.pending-observer-evidence/2';
export type ObserverViewpointCondition =
  | { kind: 'current_access'; accessRef: string }
  | { kind: 'after_relocation'; nodeRef: string; destinationTargetId: string; destinationRef: string | null }
  | { kind: 'confirmed_relocation'; lineageRef: string; destinationRef: string; destinationZoneRef: string };
export interface ObserverOrigin {
  kind: 'owner_actor_frame' | 'human_gm' | 'owner_relocation_receipt'; zoneRef: string | null; description: string; sourceRefs: string[];
}
export interface PendingObserverEvidence {
  schemaVersion: typeof PENDING_OBSERVER_EVIDENCE_VERSION | typeof CONTINUATION_OBSERVER_EVIDENCE_VERSION; evidenceRef: string;
  campaignId: string; programRef: string; instructionFingerprint: string; windowRef: string; windowFingerprint: string;
  nodeRef: string; groupId: string; observerKind: 'character' | 'familiar'; observerRef: string; actorLinkRef: string;
  methodRef: string; formRef: string | null; currentForm: string | null; capabilityRef: string;
  availableModalities: string[]; mobilityRefs: string[]; vcsOwnerRef: string; mechanicsSubjectRef: string;
  vcsSubjectRevision: string; vcsCharacterRevision: string; ownerReceiptRefs: string[];
  sourceHead: { workspaceRevision: number; sceneKitId: string; sceneRevision: number; payloadFingerprint: string };
  origin: ObserverOrigin; viewpointCondition: ObserverViewpointCondition;
}

/** Omitted requested form means use the owner's verified current form. An
 * explicit but unresolved form target is not an omission and cannot pass. */
export function pendingObserverFormMatches(group: { formRef?: unknown; formTargetId?: unknown },
  evidence: { formRef: string | null }): boolean {
  return group.formRef == null && group.formTargetId == null || group.formRef != null && group.formRef === evidence.formRef;
}

/** Closed owner evidence validation. Semantic form/method correspondence is separately examined. */
export function pendingObserverEvidenceIssues(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['$'];
  const row = value as Record<string, unknown>;
  const fields = ['schemaVersion', 'evidenceRef', 'campaignId', 'programRef', 'instructionFingerprint', 'windowRef', 'windowFingerprint',
    'nodeRef', 'groupId', 'observerKind', 'observerRef', 'actorLinkRef', 'methodRef', 'formRef', 'currentForm', 'capabilityRef',
    'availableModalities', 'mobilityRefs', 'vcsOwnerRef', 'mechanicsSubjectRef', 'vcsSubjectRevision', 'vcsCharacterRevision',
    'ownerReceiptRefs', 'sourceHead', 'origin', 'viewpointCondition'];
  const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const closed = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v)
    && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
  const ids = (v: unknown, min: number, max: number): boolean => Array.isArray(v) && v.length >= min && v.length <= max
    && v.every(id) && new Set(v).size === v.length;
  const issues: string[] = [];
  if (!closed(row, fields)) issues.push('$');
  const continuation = row.schemaVersion === CONTINUATION_OBSERVER_EVIDENCE_VERSION;
  if (!continuation && row.schemaVersion !== PENDING_OBSERVER_EVIDENCE_VERSION) issues.push('schemaVersion');
  for (const key of ['evidenceRef', 'campaignId', 'programRef', 'windowRef', 'nodeRef', 'groupId', 'observerRef', 'actorLinkRef',
    'methodRef', 'capabilityRef', 'vcsOwnerRef', 'mechanicsSubjectRef', 'vcsSubjectRevision', 'vcsCharacterRevision']) if (!id(row[key])) issues.push(key);
  for (const key of ['instructionFingerprint', 'windowFingerprint']) if (typeof row[key] !== 'string' || !/^[a-f0-9]{64}$/.test(row[key])) issues.push(key);
  if (!['character', 'familiar'].includes(String(row.observerKind))) issues.push('observerKind');
  if (row.formRef !== null && !id(row.formRef)) issues.push('formRef');
  if (row.currentForm !== null && !id(row.currentForm)) issues.push('currentForm');
  if (row.observerKind === 'familiar' && (row.currentForm === null || row.formRef === null)) issues.push('currentForm');
  if (!ids(row.ownerReceiptRefs, 1, 16) || !ids(row.mobilityRefs, 0, 16)) issues.push('ownerReceiptRefs');
  if (!Array.isArray(row.availableModalities) || !row.availableModalities.length || row.availableModalities.length > 6
    || row.availableModalities.some((m) => !['visual', 'auditory', 'olfactory', 'tactile', 'magical', 'mixed'].includes(String(m)))) issues.push('availableModalities');
  const head = row.sourceHead;
  if (!closed(head, ['workspaceRevision', 'sceneKitId', 'sceneRevision', 'payloadFingerprint']) || !id(head.sceneKitId)
    || !Number.isSafeInteger(head.workspaceRevision) || Number(head.workspaceRevision) < 0
    || !Number.isSafeInteger(head.sceneRevision) || Number(head.sceneRevision) < 1
    || typeof head.payloadFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(head.payloadFingerprint)) issues.push('sourceHead');
  const origin = row.origin;
  if (!closed(origin, ['kind', 'zoneRef', 'description', 'sourceRefs']) || !(continuation ? ['owner_actor_frame', 'human_gm', 'owner_relocation_receipt'] : ['owner_actor_frame', 'human_gm']).includes(String(origin.kind))
    || origin.zoneRef !== null && !id(origin.zoneRef) || origin.kind === 'owner_actor_frame' && !id(origin.zoneRef)
    || typeof origin.description !== 'string' || !origin.description.trim() || Buffer.byteLength(origin.description) > 2_048
    || !ids(origin.sourceRefs, 1, 16)) issues.push('origin');
  const condition = row.viewpointCondition;
  if (object(condition) && condition.kind === 'current_access') {
    if (!closed(condition, ['kind', 'accessRef']) || !id(condition.accessRef)) issues.push('viewpointCondition');
  } else if (continuation && object(condition) && condition.kind === 'confirmed_relocation') {
    if (!closed(condition, ['kind', 'lineageRef', 'destinationRef', 'destinationZoneRef']) || !id(condition.lineageRef)
      || !id(condition.destinationRef) || !id(condition.destinationZoneRef) || !object(origin)
      || origin.kind !== 'owner_relocation_receipt' || origin.zoneRef !== condition.destinationZoneRef
      || !Array.isArray(origin.sourceRefs) || !origin.sourceRefs.includes(condition.lineageRef)) issues.push('viewpointCondition');
  } else if (!closed(condition, ['kind', 'nodeRef', 'destinationTargetId', 'destinationRef']) || condition.kind !== 'after_relocation'
    || !id(condition.nodeRef) || !id(condition.destinationTargetId) || condition.destinationRef !== null && !id(condition.destinationRef)) issues.push('viewpointCondition');
  return issues;
}
