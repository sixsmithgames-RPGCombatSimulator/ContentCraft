import { READ_EFFECT_BINDING_POLICY, READ_EFFECT_EXAMINER_POLICY, SCENE_READ_EFFECT_BINDINGS_SCHEMA } from './sceneReadEffectPolicy.js';
import { TYPED_REFERENCE_POLICY } from './typedReferenceBindings.js';

const typed = (policy: string) => policy
  .replaceAll('gma.scene-reality-builder-result/5', 'gma.scene-reality-builder-result/6')
  .replaceAll('gma.scene-pending-intent-bindings/4', 'gma.scene-pending-intent-bindings/5')
  .replaceAll('gma.scene-readiness-assessment/5', 'gma.scene-readiness-assessment/6')
  .replace('This is pending context /4.', 'This is pending context /5.')
  .replace('sceneKitRef, nodes and requirementRoles.', 'sceneKitRef, nodes, requirementRoles and referenceQualificationFingerprint.')
  .replaceAll('Copy every non-null original ref/coverage choice unchanged.', 'Copy every resolved original owner ref and explicit coverage choice unchanged; an authenticated qualified slot with originalRef null remains unresolved even when sourceOriginalRef records the old compiler symbol.')
  .replaceAll('selected subject/object and destination/area;', 'each role-qualified selected target;')
  .replaceAll('effect surfaces still match all node-level location bindings.', 'each effect surface matches only its supplied effect target slot and semantic role.')
  .replaceAll('For each destination or area binding, its selectedRef must equal the selected effect surface targetRef or zoneRef byte-for-byte.', 'For each supplied effect-target coverage row, match its exact targetSlotId selection and role, independently of the other effect targets. An explicit element matches targetRef, not a containing-zone substitute.')
  .replaceAll('A separate node-level future destination constrains the explicit effect surface,', 'A separate node-level future destination constrains only its destination-role effect surface,')
  .replaceAll('fresh /6', 'fresh /6 or /7')
  .replaceAll('or an explicit program /6 with compiler policy /13.', 'or an explicit program /6 with compiler policy /13, or a typed-reference program /7 with compiler policy /14.')
  + ' ' + TYPED_REFERENCE_POLICY;

export const TYPED_PENDING_BINDING_POLICY = typed(READ_EFFECT_BINDING_POLICY)
  + ' The binding adds exactly referenceQualificationFingerprint copied from the supplied protected referenceQualification.fingerprint. Each node adds required effectCoverage. Return normal coverage only for slots without targetSlotId. For every effect coverage slot with targetSlotId return exactly one {effectId,targetSlotId,role,coverageEntryRef} in effectCoverage; copy its exact effectId, targetSlotId and role and select its matching literal affordance ID. Never also return that slot in normal coverage. Clarification rows have effectCoverage empty. No target-bearing effect may lose a role. An effect with no supplied target slots retains its ordinary effect-surface coverage slot. All uses of one supplied unresolved symbol must select the same exact owner record. All /7 explicit requirements remain reads; preserve its original effect-target associations.';
export const TYPED_PENDING_EXAMINER_POLICY = typed(READ_EFFECT_EXAMINER_POLICY)
  + ' Copy referenceQualificationFingerprint and effectTargetFingerprint from the supplied examination identity. Add referenceReview exactly {verdict,rationale,evidenceRefs}, verdict supported or unsupported, rationale a concrete nonempty explanation at most 2000 characters, evidenceRefs includes the supplied qualificationRef and only supplied assessmentEvidenceRefs, at most 32 unique refs. Independently verify the exact original semantic target, unresolved-versus-owner provenance, same-symbol consistency, all role-qualified effectCoverage rows, crossed area versus endpoint, unchanged program and receipts. Do not merely report matching hashes. Unsupported reference or effect-role meaning requires repair_required and blocking pending_intent debt. Review actual player intent and world geometry, not only shape. Binding reviews fingerprint the original /5 node row including its effectCoverage, not an internal adapter.';

export const SCENE_TYPED_REFERENCE_BINDINGS_SCHEMA = (() => {
  const schema: any = structuredClone(SCENE_READ_EFFECT_BINDINGS_SCHEMA);
  schema.properties.schemaVersion = { const: 'gma.scene-pending-intent-bindings/5' };
  schema.required.push('referenceQualificationFingerprint');
  schema.properties.referenceQualificationFingerprint = { type: 'string', pattern: '^[a-f0-9]{64}$' };
  const node = schema.properties.nodes.items;
  node.required.push('effectCoverage');
  node.properties.effectCoverage = { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false,
    required: ['effectId', 'targetSlotId', 'role', 'coverageEntryRef'], properties: {
      effectId: structuredClone(node.properties.nodeRef), targetSlotId: structuredClone(node.properties.nodeRef),
      role: { enum: ['actor', 'recipient', 'subject', 'object', 'origin', 'destination', 'area'] },
      coverageEntryRef: structuredClone(node.properties.nodeRef),
    } } };
  return schema;
})();
