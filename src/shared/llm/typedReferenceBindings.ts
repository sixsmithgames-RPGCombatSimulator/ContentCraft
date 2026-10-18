import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';

type Row = Record<string, any>;
export const TYPED_REFERENCE_AUTHORITY_BUNDLE = Object.freeze({
  capability: 'typed-pending-reference-binding/1', proposal: 'gma.freeform-intent-proposal/3',
  compiler: 'gma.semantic-action-compiler-policy/14', program: 'gma.semantic-action-program/7',
  binding: 'gma.freeform-plan-binding/3', ledger: 'gma.program-reference-ledger/1',
  qualification: 'gmc.pending-reference-qualification/1', qualificationReceipt: 'gmc.pending-reference-qualification-receipt/1',
  context: 'gmc.scene-pending-intent-context/5', pendingBindings: 'gma.scene-pending-intent-bindings/5',
  pendingRecord: 'gmc.scene-pending-intent-binding-record/5', pendingReceipt: 'gma.action-intent-binding-receipt/5',
  builder: 'gma.scene-reality-builder-result/6', assessment: 'gma.scene-readiness-assessment/6',
  manualState: 'gma.scene-reality-manual-state/8', preparationPolicyVersion: 13,
});
export const TYPED_REFERENCE_POLICY = 'Local semantic symbols and owner references are different types. A ledger row with binding.kind unresolved has no world ID: an original request-local symbol is not a fixed owner choice. Resolve only the exact unresolved slots named by the authenticated typed ledger or pending-reference qualification. Never infer this permission from a string prefix, name, array position or rationale; a real resolved owner reference remains immutable. Return ordinary literal owner IDs in selected bindings, never local symbols or a fabricated world alias. Preserve the same symbol across its subject, relation-origin and destination uses when their original meaning is the same, and independently review every such choice. Each effect has its own explicitly supplied role-qualified target slots. Cover each effect target with its exact prepared structural affordance. A crossed area, origin and destination have distinct roles and may have distinct surfaces: they need not be the same target or zone. Do not replace an explicit element with its containing zone or discard a route role. Actor identity reads, controller recipients, observation targets, information disclosure and attempted effects stay separate. Effect surfaces prove only feasibility; actual checks, movement arrival, sensory access and effects still require their original owners and receipts. The original source program, pending window, completed receipts, instruction and budgets remain unchanged. A qualification proves unresolved source provenance, not a destination, world fact, successful action or permission to execute.';
export const TYPED_INTAKE_TARGET_POLICY = 'For every effect return targets as bounded {ref,role} rows, selecting only that step\'s supplied targets or its actor. State exactly which referents participate in that particular attempted effect. Preserve their explicit original semantic roles: the area crossed is not the destination; an origin is not a recipient; the affected subject is not automatically the performer. Keep multiple effects\' target associations separate. Use an actor target for a bodily self-action when that actor is its affected subject. The implicit performer selection is exactly {ref:step.actor,role:"actor"}. Any other {ref,role} pair must appear identically in step.targets. Do not emit {ref:step.actor,role:"subject"} unless that exact pair is also explicitly present in step.targets. For example, staying behind cover may affect the actor with role actor and the separately supplied cover with role object; do not relabel the performer as subject. A performer already named by step.actor does not need an extra effect target merely to restate who acts. An effect without a separately affected target may use an empty targets array. Preserve all meaningful route, destination, object, subject and recipient participation; never drop a role to simplify binding. A null catalogKey remains an unresolved local referent, never an invented world ID. No target selection, effect category or narration proves success.';
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v: unknown, keys: string[]): v is Row => object(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(v);
const roles = new Set(['actor', 'recipient', 'subject', 'object', 'origin', 'destination', 'area']);
const fail = (): never => { throw new Error('TYPED_REFERENCE_PROVENANCE_INVALID'); };
export const typedReferenceSymbol = (index: number) => `freeform:referent:${index}`;
export const isTypedReferenceProgram = (value: any): boolean => value?.schemaVersion === TYPED_REFERENCE_AUTHORITY_BUNDLE.program;

/** Called with the authenticated issued catalog by the compiler, and rebuilt
 * independently from the protected accepted ticket by the owner at creation. */
export function createProgramReferenceLedger(proposal: Row, catalog: Row[], sceneRevision: number): Row {
  if (!Array.isArray(proposal.referents) || proposal.referents.length > 32 || !Array.isArray(catalog)
    || !Number.isSafeInteger(sceneRevision) || sceneRevision < 0) return fail();
  const keys = new Map<string, Row>();
  for (const row of catalog) {
    if (!id(row.ref) || typeof row.key !== 'string' || keys.has(row.key)) return fail();
    keys.set(row.key, row);
  }
  return { schemaVersion: TYPED_REFERENCE_AUTHORITY_BUNDLE.ledger,
    sourceCatalogFingerprint: freeformJsonDigest(catalog),
    rows: proposal.referents.map((referent: Row, sourceIndex: number) => {
      const source = referent.catalogKey === null ? null : keys.get(referent.catalogKey);
      if (referent.catalogKey !== null && (!source || source.kind !== referent.kind)) return fail();
      return { symbolRef: typedReferenceSymbol(sourceIndex), sourceIndex, kind: referent.kind,
        binding: source ? { kind: 'resolved', owner: 'gmc', ref: source.ref, revision: sceneRevision } : { kind: 'unresolved' } };
    }) };
}

export function programReferenceLedgerIssues(value: unknown): string[] {
  if (!closed(value, ['schemaVersion', 'sourceCatalogFingerprint', 'rows'])
    || value.schemaVersion !== TYPED_REFERENCE_AUTHORITY_BUNDLE.ledger
    || !/^[a-f0-9]{64}$/.test(value.sourceCatalogFingerprint) || !Array.isArray(value.rows) || value.rows.length > 32) return ['/referenceLedger'];
  const issues: string[] = [];
  for (const [index, row] of value.rows.entries()) {
    if (!closed(row, ['symbolRef', 'sourceIndex', 'kind', 'binding']) || row.sourceIndex !== index
      || row.symbolRef !== typedReferenceSymbol(index) || !['actor', 'subject', 'place', 'object', 'form', 'method'].includes(row.kind)
      || !(closed(row.binding, ['kind']) && row.binding.kind === 'unresolved'
        || closed(row.binding, ['kind', 'owner', 'ref', 'revision']) && row.binding.kind === 'resolved'
          && row.binding.owner === 'gmc' && id(row.binding.ref) && Number.isSafeInteger(row.binding.revision) && row.binding.revision >= 0)) issues.push(`/referenceLedger/rows/${index}`);
  }
  return issues;
}

/** Additional /7 checks; the caller also runs all existing /6 graph, evidence,
 * mechanics and effect checks on a lossless historical shape projection. */
export function typedReferenceProgramIssues(program: Row): string[] {
  const issues = programReferenceLedgerIssues(program.referenceLedger);
  if (issues.length) return issues;
  if (program.planner?.policyVersion !== TYPED_REFERENCE_AUTHORITY_BUNDLE.compiler) issues.push('/compiler');
  const symbols = new Map<string, Row>(program.referenceLedger.rows.map((r: Row) => [r.symbolRef, r]));
  const agrees = (symbol: unknown, ref: unknown) => {
    const row = typeof symbol === 'string' ? symbols.get(symbol) : null;
    return !!row && (row.binding.kind === 'unresolved' ? ref === null : ref === row.binding.ref);
  };
  for (const [index, node] of (program.nodes ?? []).entries()) {
    for (const [i, requirement] of (node.dataRequirements ?? []).entries()) {
      if (Object.hasOwn(requirement, 'targetRole') && !agrees(requirement.symbolRef, requirement.targetRef)) issues.push(`/nodes/${index}/dataRequirements/${i}/symbol`);
      if (requirement.kind === 'observation') {
        const outcome = requirement.observation;
        if (!agrees(outcome?.targetId, outcome?.targetRef)
          || outcome?.relationOriginTargetId !== undefined && !agrees(outcome.relationOriginTargetId, outcome.relationOriginRef)) issues.push(`/nodes/${index}/dataRequirements/${i}/observationSymbol`);
      }
    }
    for (const [i, location] of (node.semanticLocationBindings?.bindings ?? []).entries()) {
      if (!agrees(location.symbolRef, location.authorityRef)) issues.push(`/nodes/${index}/locations/${i}`);
    }
    for (const [i, effect] of (node.requestedEffects ?? []).entries()) {
      if (!Array.isArray(effect.targets) || effect.targets.length > 8 || new Set(effect.targets.map(canonicalFreeformJson)).size !== effect.targets.length
        || effect.targets.some((target: unknown) => !closed(target, ['symbolRef', 'role']) || !symbols.has(target.symbolRef) || !roles.has(target.role))) issues.push(`/nodes/${index}/requestedEffects/${i}/targets`);
    }
  }
  return issues;
}

/** Representation only: old checks remain responsible for all old fields. */
export function historicalTypedEffectProgram(program: Row): Row {
  const { referenceLedger: _ledger, ...body } = program;
  return { ...body, schemaVersion: 'gma.semantic-action-program/6',
    planner: { ...program.planner, policyVersion: 'gma.semantic-action-compiler-policy/13' },
    nodes: program.nodes.map((node: Row) => ({ ...node,
      requestedEffects: node.requestedEffects.map(({ targets: _targets, ...effect }: Row) => effect) })) };
}
