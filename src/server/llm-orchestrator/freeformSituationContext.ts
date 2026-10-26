import { FREEFORM_SITUATION, freeformSituationIssues } from '../../shared/llm/freeformSituation.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { readCurrentSceneOwnerContext } from '../services/currentSceneOwnerContext.js';
import { readConversationHistory } from '../services/activeSceneStateStore.js';
import { readActiveSceneReality } from '../services/sceneRealityReadinessService.js';
import { StoryWorkspaceStoreError } from '../services/storyWorkspaceStore.js';
import type { FreeformCatalogBinding } from './freeformSceneCatalog.js';

type Row = Record<string, any>;
type Scope = { userId: string; campaignId: string };
export interface SituationSources { context: Row; history: Row; reality: Row | null }
export type SituationReader = (scope: Scope) => Promise<SituationSources>;
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.filter(object) : [];
const bounded = (v: unknown, maximum = 500) => typeof v === 'string' && v.trim() ? Array.from(v).slice(0, maximum).join('') : null;
const clip = (v: string, maximum: number) => { let text = Array.from(v).slice(0, 3000).join(''); while (Buffer.byteLength(text) > maximum) text = Array.from(text).slice(0, -1).join(''); return { text, completeness: text === v ? 'exact' : 'excerpt' }; };
function certifiedBundle(sources: SituationSources): Row | null {
  const scene = sources.context.playableSceneContext, bundle = sources.reality?.bundle;
  return bundle?.sceneKit?.sceneKitId === scene?.sceneKitRef?.sceneKitId && bundle?.sceneKit?.revision === scene?.sceneKitRef?.revision
    && bundle?.sceneKit?.campaignId === sources.context.storyWorkspaceRef?.campaignId
    && bundle?.readinessCertificate?.campaignId === sources.context.storyWorkspaceRef?.campaignId
    && bundle?.readinessCertificate?.status === 'certified' ? bundle : null;
}
export function situationError(code = 'FREEFORM_SITUATION_SOURCE_CHANGED', status = 409): never {
  throw new StoryWorkspaceStoreError(status, code, 'The saved situation could not be verified for this instruction.', {});
}
export const readFreeformSituationSources: SituationReader = async scope => {
  try {
    const [context, history, reality] = await Promise.all([readCurrentSceneOwnerContext(scope), readConversationHistory({ ...scope, limit: 3 }), readActiveSceneReality(scope)]);
    if (!context) return situationError('FREEFORM_SITUATION_UNAVAILABLE', 503);
    return { context, history, reality };
  } catch (error: any) {
    console.error(JSON.stringify({ event: 'situation.read_failed', code: String(error?.code ?? 'OWNER_READ_UNAVAILABLE').replace(/[^A-Z0-9_]/g, '').slice(0, 80) }));
    return situationError('FREEFORM_SITUATION_UNAVAILABLE', 503);
  }
};

/** Exact public labels from the same certified Scene. Hidden actors never enter. */
export function situationPublicLabels(sources: SituationSources): Map<string, string> {
  const scene = sources.context.playableSceneContext, bundle = certifiedBundle(sources);
  const result = new Map<string, string>();
  for (const role of rows(scene?.sceneLocalRoles)) { const label = bounded(role.label, 200); if (label) result.set(role.roleId, label); }
  if (!bundle) return result;
  const present = new Set([...(scene.presentActors ?? []), ...rows(scene.sceneLocalRoles).map(r => r.roleId)]);
  for (const ref of present) {
    const frames = rows(bundle.actorFrames).filter(r => r.actorRef === ref);
    if (frames.length > 1) situationError();
    const label = bounded(frames[0]?.publicLabel, 200);
    if (label && !result.has(ref)) result.set(ref, label);
  }
  return result;
}
export function situationSourceHeads(sources: SituationSources, boundary: number): Row {
  const c = sources.context, scene = c.playableSceneContext, active = c.activeSceneContext;
  if (!scene?.sceneKitRef || !active?.state || !Number.isSafeInteger(boundary) || boundary < 1
    || sources.history.campaignId !== c.storyWorkspaceRef?.campaignId
    || !Number.isSafeInteger(active.state.revision) || active.state.revision < 0
    || Number(active.state.lastTurnSequence ?? 0) >= boundary
    || active.sceneKitRef?.sceneKitId !== scene.sceneKitRef.sceneKitId) situationError();
  return { storyWorkspaceRef: c.storyWorkspaceRef, sceneKitRef: scene.sceneKitRef,
    activeStateRevision: active.state.revision, activeStateFingerprint: freeformJsonDigest(active),
    conversationBoundary: boundary, conversationFingerprint: freeformJsonDigest(sources.history),
    clockRevision: c.gameTimeContext?.gameClockRevision ?? null, clockFingerprint: freeformJsonDigest(c.gameTimeContext?.currentClock ?? null),
    labelsFingerprint: freeformJsonDigest([...situationPublicLabels(sources)]),
    openingFingerprint: freeformJsonDigest(certifiedBundle(sources)?.openingFrame?.prose ?? null),
    labelSourceHeads: rows(sources.reality?.bundle?.actorFrames).filter(r => situationPublicLabels(sources).has(r.actorRef))
      .map(r => ({ actorRef: r.actorRef, actorFrameId: r.actorFrameId ?? null, revision: r.revision ?? null })) };
}

/** Whitelisted language context. Never serialize a raw Scene, frame or clock. */
export function buildFreeformSituation(sources: SituationSources, catalog: Row[], bindings: FreeformCatalogBinding[], boundary: number) {
  const heads = situationSourceHeads(sources, boundary), c = sources.context, scene = c.playableSceneContext, state = c.activeSceneContext.state;
  const sourceBindings: Row = {};
  const source = (key: string, ref: string, revision: unknown) => { sourceBindings[key] = { owner: 'gmc', ref, revision, visibility: 'player' }; return key; };
  source('scene', scene.sceneKitRef.sceneKitId, scene.sceneKitRef.revision);
  source('state', scene.sceneKitRef.sceneKitId, state.revision);
  const locus = catalog.find(r => r.key === 'scene_locus');
  if (!locus) situationError();
  const actorBindings = bindings.filter(r => r.kind === 'actor');
  const present = new Set([...(scene.presentActors ?? []), ...rows(scene.sceneLocalRoles).map(r => r.roleId)]);
  if (present.size > 24 || actorBindings.length > 24 || [...present].some(ref => !actorBindings.some(r => r.ref === ref))) situationError('FREEFORM_SITUATION_OVER_BUDGET', 413);
  const participants = actorBindings.map(binding => {
    const actor = rows(state.actorStates).find(r => r.actorRef === binding.ref);
    return { catalogKey: binding.key, label: catalog.find(r => r.key === binding.key)?.label,
      position: null, activity: bounded(actor?.activity), relationship: null };
  });
  const exchanges = rows(sources.history.interactions).filter(r => r.sceneKitRef?.sceneKitId === scene.sceneKitRef.sceneKitId
    && Number(r.timelineSequence) < boundary && typeof r.playerMessage === 'string' && r.playerMessage.trim()
    && typeof r.assistantNarration === 'string' && r.assistantNarration.trim()).slice(-3).map((r, i) => ({
      sourceKey: source(`exchange_${i}`, r.receiptRef, r.stateRevisionAfter), phase: r.phase,
      player: clip(r.playerMessage, 2000), gm: clip(r.assistantNarration, 4000),
    }));
  const latest = exchanges.at(-1) ?? null;
  const opening = !latest && Number(state.lastTurnSequence ?? 0) === 0 ? certifiedBundle(sources)?.openingFrame?.prose : null;
  const clock = c.gameTimeContext?.currentClock;
  const when = object(clock) && ['day', 'hour', 'minute', 'second'].every(k => Number.isSafeInteger(clock[k]))
    ? { display: `Day ${clock.day}, ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}:${String(clock.second).padStart(2, '0')}`,
      sourceKey: source('clock', `gmc:campaign-clock:${c.storyWorkspaceRef.campaignId}`, c.gameTimeContext.gameClockRevision) } : null;
  const situation: Row = { schemaVersion: FREEFORM_SITUATION.schema,
    where: { catalogKey: locus.key, description: locus.label }, when, participants,
    sceneDescription: latest ? { ...clip(latest.gm.text, 800), sourceKey: latest.sourceKey,
      completeness: latest.gm.completeness === 'excerpt' ? 'excerpt' : clip(latest.gm.text, 800).completeness }
      : typeof opening === 'string' && opening.trim() ? { ...clip(opening, 800), sourceKey: 'scene' } : null,
    lastExchange: latest, earlierExchanges: exchanges.slice(0, -1),
    continuity: rows(state.continuityStates).map(r => ({ aspect: bounded(r.aspect), status: bounded(r.status),
      detail: bounded(r.basis ?? r.detail ?? r.summary ?? r.narrationEvidence), sourceKey: 'state' })).filter(r => r.aspect && r.status && r.detail).slice(0, 16),
    perspectives: [], immediateGoal: null,
    unknowns: [...(!latest ? ['No published player/GM exchange exists before this instruction in the current scene.'] : []),
      ...(!when ? ['The saved campaign time is not established.'] : []),
      'Participant positions, relationships and sensory capabilities require current owner evidence; an omitted detail is unknown.'],
  };
  while (Buffer.byteLength(JSON.stringify(situation)) > FREEFORM_SITUATION.maximumBytes && situation.earlierExchanges.length) situation.earlierExchanges.shift();
  for (const field of ['gm', 'player'] as const) {
    while (Buffer.byteLength(JSON.stringify(situation)) > FREEFORM_SITUATION.maximumBytes && latest
      && Buffer.byteLength(latest[field].text) > (field === 'gm' ? 800 : 500)) {
      latest[field] = { ...clip(latest[field].text, Buffer.byteLength(latest[field].text) - 256), completeness: 'excerpt' };
    }
  }
  if (freeformSituationIssues(situation, catalog, Object.keys(sourceBindings)).length) situationError('FREEFORM_SITUATION_OVER_BUDGET', 413);
  return { situation, binding: { schemaVersion: FREEFORM_SITUATION.binding, snapshotDigest: freeformJsonDigest(situation),
    sourceHeads: heads, sourceBindings, visibility: 'player' } };
}
export function assertSituationCurrent(binding: Row, situation: unknown, sources: SituationSources) {
  if (binding.schemaVersion !== FREEFORM_SITUATION.binding || binding.visibility !== 'player'
    || binding.snapshotDigest !== freeformJsonDigest(situation)
    || freeformJsonDigest(binding.sourceHeads) !== freeformJsonDigest(situationSourceHeads(sources, binding.sourceHeads?.conversationBoundary))) situationError();
}
