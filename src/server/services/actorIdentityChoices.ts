import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { ACTOR_MECHANICS_LINK_CHOICES_VERSION, type ActorMechanicsLink } from '../../shared/llm/actorMechanicsLink.js';
import { readObservationAuthority } from './observationAuthorityService.js';
import { readActiveSceneReality } from './sceneRealityReadinessService.js';
import { actorMechanicsLinkService } from './actorMechanicsLinkStore.js';
import { StoryWorkspaceStoreError } from './storyWorkspaceStore.js';

/** Named owner candidate; labels never determine identity or authorize a write. */
export interface ActorIdentityChoice {
  choiceRef: string; actorRef: string; actorRecordRef: string; actorRecordRevision: number;
  label: string; labelSourceRef: string; labelSourceRevision: number;
}
/** Read-only current-Scene choices. GMA strips owner references from its UI view. */
export interface ActorIdentityChoices {
  schemaVersion: typeof ACTOR_MECHANICS_LINK_CHOICES_VERSION; campaignId: string;
  sourceHead: { workspaceRevision: number; sceneKitId: string; sceneRevision: number; payloadFingerprint: string };
  registryRevision: number; writesAvailable: boolean; candidates: ActorIdentityChoice[]; unlabeledCount: number;
  links: ActorMechanicsLink[];
}
/** Injected owner readers allow isolated tests without a second authority cache. */
export interface ActorIdentityChoiceDependencies {
  readAuthority?: typeof readObservationAuthority;
  readReality?: typeof readActiveSceneReality;
  readLinks?: ReturnType<typeof actorMechanicsLinkService>['read'];
  writeCampaignAllowlist?: string[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown, missingAllowed = false): Record<string, unknown>[] => {
  if (missingAllowed && value == null) return [];
  if (!Array.isArray(value) || !value.every(object)) fail('ACTOR_LINK_CHOICES_INVALID');
  return value;
};
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const label = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 200;
function fail(code: string): never { throw new StoryWorkspaceStoreError(409, code, 'The current scene participants could not be identified safely.', {}); }

/** Offer only explicitly named, exact native actors. No ID-derived names, hidden
 * actors, new derived observers, sole-candidate inference or gameplay effects. */
export async function readActorIdentityChoices(input: { userId: string; campaignId: string; subjectKind: 'character' | 'familiar'; mechanicsSubjectRef: string },
  deps: ActorIdentityChoiceDependencies = {}): Promise<ActorIdentityChoices> {
  if (!id(input.userId) || !id(input.campaignId)) fail('ACTOR_LINK_SCOPE_INVALID');
  if (!['character', 'familiar'].includes(input.subjectKind) || !id(input.mechanicsSubjectRef)
    || !input.mechanicsSubjectRef.startsWith(`vcs:${input.subjectKind}:`)) fail('ACTOR_LINK_INPUT_INVALID');
  const scope = { userId: input.userId, campaignId: input.campaignId };
  const [authority, reality] = await Promise.all([
    (deps.readAuthority ?? readObservationAuthority)(scope),
    (deps.readReality ?? readActiveSceneReality)(scope),
  ]);
  const links = await (deps.readLinks ?? actorMechanicsLinkService().read)(scope, authority);
  const sourceHead = links.sourceHead;
  if (!Number.isSafeInteger(links.revision) || links.revision < 0
    || authority.workspaceRef.campaignId !== input.campaignId || sourceHead.sceneKitId !== authority.sceneKitRef.sceneKitId
    || sourceHead.workspaceRevision !== authority.workspaceRef.revision || sourceHead.sceneRevision !== authority.sceneKitRef.revision
    || sourceHead.payloadFingerprint !== authority.sceneKitRef.payloadFingerprint) fail('ACTOR_LINK_SOURCE_CONFLICT');
  const native = object(authority.privatePreparationContext) ? authority.privatePreparationContext : {};
  const participants = object(native.participants) ? native.participants : {};
  const roles = rows(participants.sceneLocalRoles, true);
  const bundle = object(reality?.bundle) ? reality.bundle : null;
  const preparedKit = object(bundle?.sceneKit) ? bundle.sceneKit : null;
  const certificate = object(bundle?.readinessCertificate) ? bundle.readinessCertificate : null;
  const frames = preparedKit?.campaignId === input.campaignId && preparedKit.sceneKitId === sourceHead.sceneKitId
    && certificate?.campaignId === input.campaignId && certificate.status === 'certified' ? rows(bundle?.actorFrames) : [];
  const candidates: ActorIdentityChoice[] = [];
  let unlabeledCount = 0;
  const bindings = [...rows(authority.actorMechanicsBindings), ...links.links];
  const priorActors = new Set(bindings.filter((row) => row.state === 'active' && row.mechanicsSubjectRef === input.mechanicsSubjectRef).map((row) => row.actorRef));
  if (priorActors.size > 1 || bindings.some((row) => row.state === 'active'
    && priorActors.has(row.actorRef) && row.mechanicsSubjectRef !== input.mechanicsSubjectRef)) fail('ACTOR_LINK_PAIR_CONFLICT');
  const nativeCandidates = authority.actorCandidates;
  if (nativeCandidates.length > 128 || new Set(nativeCandidates.map((row) => row.actorRef)).size !== nativeCandidates.length) fail('ACTOR_LINK_CHOICES_INVALID');
  for (const actor of nativeCandidates) {
    const actorRef = actor.actorRef, actorRecordRef = actor.actorRecordRef, actorRecordRevision = actor.actorRecordRevision;
    if (!id(actorRef) || !id(actorRecordRef) || typeof actorRecordRevision !== 'number' || !Number.isSafeInteger(actorRecordRevision) || actorRecordRevision < 1
      || !['present_actor', 'scene_local_role'].includes(String(actor.actorKind))) fail('ACTOR_LINK_CHOICES_INVALID');
    if (priorActors.size && !priorActors.has(actorRef) || bindings.some((row) => row.state === 'active'
      && row.actorRef === actorRef && row.mechanicsSubjectRef !== input.mechanicsSubjectRef)) continue;
    const matchingFrames = frames.filter((row) => row.actorRef === actorRef);
    if (matchingFrames.length > 1) fail('ACTOR_LINK_CHOICES_AMBIGUOUS');
    const frame = matchingFrames[0];
    // An individual character/familiar sheet must not quietly stand for a cohort.
    if (frame?.kind === 'cohort') continue;
    if (frame && (frame.kind !== 'individual' || frame.count !== 1)) fail('ACTOR_LINK_CHOICES_INVALID');
    const matchingRoles = roles.filter((row) => row.roleId === actorRef);
    if (matchingRoles.length > 1) fail('ACTOR_LINK_CHOICES_AMBIGUOUS');
    const role = matchingRoles[0];
    const nativeLabel = label(role?.label) ? role.label : null;
    const publicLabel = nativeLabel ?? (label(frame?.publicLabel) ? frame.publicLabel : null);
    const labelSourceRef = nativeLabel ? actorRecordRef : frame?.actorFrameId;
    const labelSourceRevision = nativeLabel ? actorRecordRevision : frame?.revision;
    if (!publicLabel || !id(labelSourceRef) || !Number.isSafeInteger(labelSourceRevision) || Number(labelSourceRevision) < 1) {
      unlabeledCount += 1; continue;
    }
    const body = { campaignId: input.campaignId, subjectKind: input.subjectKind, mechanicsSubjectRef: input.mechanicsSubjectRef,
      sourceHead, registryRevision: links.revision,
      actorRef, actorRecordRef, actorRecordRevision, label: publicLabel, labelSourceRef, labelSourceRevision: Number(labelSourceRevision) };
    candidates.push({ choiceRef: `actor-choice:${freeformJsonDigest(body).slice(0, 40)}`,
      actorRef, actorRecordRef, actorRecordRevision, label: publicLabel, labelSourceRef, labelSourceRevision: Number(labelSourceRevision) });
  }
  const allowed = deps.writeCampaignAllowlist ?? (process.env.GMC_ACTOR_MECHANICS_LINK_WRITES === '1'
    ? String(process.env.GMC_ACTOR_MECHANICS_LINK_CAMPAIGN_ALLOWLIST ?? '').split(',').map((row) => row.trim()).filter(Boolean) : []);
  const characterRef = input.subjectKind === 'character' ? input.mechanicsSubjectRef : input.mechanicsSubjectRef.replace(/^vcs:familiar:/, 'vcs:character:');
  const relevantLinks = links.links.filter((row) => row.vcsCharacterRef === characterRef);
  if (relevantLinks.length > 2) fail('ACTOR_LINK_CHOICES_INVALID');
  const result: ActorIdentityChoices = { schemaVersion: ACTOR_MECHANICS_LINK_CHOICES_VERSION, campaignId: input.campaignId,
    sourceHead, registryRevision: links.revision, writesAvailable: allowed.includes(input.campaignId), candidates, unlabeledCount, links: relevantLinks };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32_768) fail('ACTOR_LINK_CHOICES_OVER_BUDGET');
  return result;
}
