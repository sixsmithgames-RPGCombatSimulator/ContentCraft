import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';
import { StoryWorkspaceStoreError } from '../services/storyWorkspaceStore.js';

/** Owner-only identity map. Public labels are never an identity join. */
export interface FreeformCatalogBinding { key: string; kind: 'actor' | 'subject' | 'place' | 'object'; ref: string }
/** Immutable current-Scene read set, not permission or a gameplay receipt. */
export interface FreeformCatalogContextRef { storyWorkspaceRef: Record<string, unknown>; sceneKitRef: Record<string, unknown> }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(object) : [];
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const fail = (): never => { throw new StoryWorkspaceStoreError(409, 'FREEFORM_SCENE_CONTEXT_STALE', 'The current Scene no longer matches the staged instruction.', {}); };

/** Project only already-public identities; private context is deliberately ignored. */
export function buildFreeformSceneCatalog(context: unknown, selectedActorRef: string | null, originStoryRef: unknown): {
  catalog: { key: string; kind: FreeformCatalogBinding['kind']; label: string }[];
  catalogBindings: FreeformCatalogBinding[];
  catalogContextRef: FreeformCatalogContextRef;
} {
  const current = object(context) ? context : fail();
  if (!object(current.storyWorkspaceRef) || !object(current.playableSceneContext)
    || !object(current.playableSceneContext.sceneKitRef)
    || freeformJsonDigest(current.storyWorkspaceRef) !== freeformJsonDigest(originStoryRef)) fail();
  const scene = current.playableSceneContext as Record<string, unknown>;
  const sceneRef = scene.sceneKitRef as Record<string, unknown>;
  if (!Number.isSafeInteger(sceneRef.revision) || Number(sceneRef.revision) < 1) fail();
  const catalog: { key: string; kind: FreeformCatalogBinding['kind']; label: string }[] = [];
  const catalogBindings: FreeformCatalogBinding[] = [];
  const add = (key: string, kind: FreeformCatalogBinding['kind'], ref: unknown, label: unknown): void => {
    if (catalog.length >= 32 || typeof ref !== 'string' || !identifier.test(ref)) return;
    if (catalogBindings.some((row) => row.kind === kind && row.ref === ref)) return;
    catalog.push({ key, kind, label: typeof label === 'string' && label.trim() ? label.slice(0, 200) : key });
    catalogBindings.push({ key, kind, ref });
  };
  if (selectedActorRef) add('selected_actor', 'actor', selectedActorRef, 'Your selected character');
  const locus = object(scene.playableLocus) ? scene.playableLocus : {};
  add('scene_locus', 'place', locus.canonicalAnchorRef ?? sceneRef.sceneKitId, locus.label);
  if (Array.isArray(scene.presentActors)) scene.presentActors.forEach((ref, index) => add(`scene_actor_${index}`, 'actor', ref, `Present actor ${index + 1}`));
  rows(scene.sceneLocalRoles).forEach((row, index) => add(`scene_role_${index}`, 'actor', row.roleId, row.label));
  const elements = rows(scene.establishedElements).filter((row) => ['canonical', 'scene_local_established'].includes(String(row.truthState)));
  // Kind describes the player's semantic role, not a mechanical permission.
  // Offer the same exact element in each supported non-actor role. Never
  // classify it by parsing its label; execution still verifies feasibility.
  elements.forEach((row, index) => {
    for (const [kind, prefix] of [['subject', 'scene_element'], ['place', 'scene_element_place'], ['object', 'scene_element_object']] as const) {
      add(`${prefix}_${index}`, kind, row.elementId, row.summary);
    }
  });
  return { catalog, catalogBindings, catalogContextRef: {
    storyWorkspaceRef: structuredClone(current.storyWorkspaceRef as Record<string, unknown>),
    sceneKitRef: structuredClone(sceneRef),
  } };
}

/** A new save must still use the exact owner head that issued its catalog. */
export function assertFreeformCatalogCurrent(expected: FreeformCatalogContextRef, current: unknown): void {
  if (!object(current) || !object(current.playableSceneContext)
    || freeformJsonDigest(expected.storyWorkspaceRef) !== freeformJsonDigest(current.storyWorkspaceRef)
    || freeformJsonDigest(expected.sceneKitRef) !== freeformJsonDigest(current.playableSceneContext.sceneKitRef)) fail();
}
