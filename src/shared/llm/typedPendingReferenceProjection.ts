import { freeformJsonDigest } from './freeformPlanBinding.js';
import { pendingIntentBindingSlots } from './scenePendingIntentBindings.js';
import { pendingReferenceQualificationIssues } from './pendingReferenceQualification.js';
import type { PendingIntentWindowSource } from './pendingIntentWindow.js';

type Row = Record<string, any>;
const check = (v: unknown): void => { if (!v) throw new Error('TYPED_PENDING_REFERENCE_PROJECTION_INVALID'); };
export const typedEffectSlotId = (nodeRef: string, effectId: string, targetSlotId: string, role: string) =>
  `binding-slot:${freeformJsonDigest({ nodeRef, effectId, targetSlotId, role, kind: 'typed_effect_surface' }).slice(0, 40)}`;

/** Derived only from a protected owner qualification. Original window, slot
 * identities and program stay exact; no world target is selected here. */
export function qualifiedPendingReferenceSlots(source: PendingIntentWindowSource, qualification: Row): Row[] {
  check(!pendingReferenceQualificationIssues(qualification, source).length);
  const result = pendingIntentBindingSlots(source).map((node) => ({ ...node,
    references: node.references.map((slot: Row) => {
      const field = qualification.fields.find((row: Row) => row.nodeRef === node.nodeRef && row.slotId === slot.slotId);
      const proof = qualification.references.find((row: Row) => row.nodeRef === node.nodeRef && row.slotId === slot.slotId);
      check(proof);
      return { ...slot, symbolRef: proof.symbolRef, sourceKind: proof.sourceKind, bindingState: proof.bindingState,
        ...(field ? { originalRef: null, sourceOriginalRef: slot.originalRef } : {}) };
    }),
    coverage: node.coverage.flatMap((slot: Row) => {
      const effect = qualification.effects.find((row: Row) => row.nodeRef === node.nodeRef && row.effectId === slot.effectId);
      return effect?.targets.length ? effect.targets.map((target: Row) => ({ ...slot,
        slotId: typedEffectSlotId(node.nodeRef, effect.effectId, target.targetSlotId, target.role),
        targetSlotId: target.targetSlotId, role: target.role, symbolRef: target.symbolRef })) : [slot];
    }),
  }));
  check(result.every((node) => node.references.length <= 64 && node.coverage.length <= 32));
  return result;
}

/** Wire /5 carries explicit per-effect role rows. This structural adapter
 * verifies their complete exact partition before calling historical checks. */
export function historicalTypedPendingBinding(binding: Row, slots: Row[]): Row {
  check(binding.schemaVersion === 'gma.scene-pending-intent-bindings/5');
  const { referenceQualificationFingerprint: _qualification, ...body } = binding;
  return { ...body, schemaVersion: 'gma.scene-pending-intent-bindings/4', nodes: binding.nodes.map((node: Row) => {
    check(Array.isArray(node.effectCoverage));
    const { effectCoverage, ...original } = node;
    const expected = slots.find((slot) => slot.nodeRef === node.nodeRef)?.coverage.filter((slot: Row) => slot.targetSlotId) ?? [];
    check(node.disposition === 'clarification_required' ? !effectCoverage.length : effectCoverage.length === expected.length);
    const seen = new Set<string>();
    const coverage = effectCoverage.map((row: Row) => {
      check(Object.keys(row).length === 4 && ['effectId', 'targetSlotId', 'role', 'coverageEntryRef'].every((key) => Object.hasOwn(row, key)));
      const slot = expected.find((entry: Row) => entry.effectId === row.effectId && entry.targetSlotId === row.targetSlotId && entry.role === row.role);
      check(slot && !seen.has(slot.slotId)); seen.add(slot.slotId);
      return { slotId: slot.slotId, coverageEntryRef: row.coverageEntryRef };
    });
    return { ...original, coverage: [...node.coverage, ...coverage] };
  }) };
}
