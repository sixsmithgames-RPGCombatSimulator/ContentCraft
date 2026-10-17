/** Original /4 design policy, reused unchanged by builder and independent
 * examiner. Feasibility surfaces never prove an action's successful outcome. */
export const READ_EFFECT_SURFACE_POLICY = 'Use Scene Story design gmc.scene-story-design/4. Each affordance adds surfaceKind and interactionSurface. information affordances have nonempty factRefs and interactionSurface null. action_surface affordances have empty factRefs, interactionSurface self_action or owner_action, and exact prepared targetRef and zoneRef. A self_action must use actionFamily interact and capabilityClass, thresholdRef and condition all null. It needs a non-null exact accessClass describing the already-available structural self-action surface, not a permission or successful outcome. Do not put an explanatory attempt, unresolved outcome or prerequisite in condition; retain it in the action, binding rationale or prepared record instead. Its targetRef is the exact acting actorRef or actorFrameId and zoneRef is that actor frame\'s current zone. Conditional, threshold-gated or capability-gated work requires owner_action and actual owner resolution, not a self_action. These surfaces provide feasibility only, never completed actions, discoveries, NPC decisions, resources, movement arrival or persistent effects.';

/** Shared local shape/authority checks run before review and inside owner save.
 * Actor closure is checked when the complete proposed dossier is available. */
export function readEffectSurfaceIssues(value: unknown, actorFrames?: readonly unknown[]): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['/surface'];
  const row: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  if (row.surfaceKind === 'information') return row.interactionSurface === null
    && Array.isArray(row.factRefs) && row.factRefs.length > 0 ? [] : ['/information'];
  if (row.surfaceKind !== 'action_surface' || !['self_action', 'owner_action'].includes(String(row.interactionSurface))
    || !Array.isArray(row.factRefs) || row.factRefs.length !== 0) return ['/actionSurface'];
  if (row.interactionSurface !== 'self_action') return [];
  const issues = ['capabilityClass', 'thresholdRef', 'condition'].filter((field) => row[field] !== null).map((field) => `/${field}`);
  if (row.actionFamily !== 'interact') issues.push('/actionFamily');
  if (typeof row.accessClass !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(row.accessClass)) issues.push('/accessClass');
  if (actorFrames) {
    const actors = actorFrames.filter((actor): actor is Record<string, unknown> => !!actor && typeof actor === 'object' && !Array.isArray(actor));
    const actor = actors.find((entry) => [entry.actorRef, entry.actorFrameId].includes(row.targetRef));
    if (!actor || actor.zoneRef !== row.zoneRef) issues.push('/actorZone');
  }
  return issues;
}
