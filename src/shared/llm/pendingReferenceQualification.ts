import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow, pendingIntentRequirementRows, type PendingIntentWindowSource } from './pendingIntentWindow.js';
import { pendingIntentBindingSlots, pendingIntentBindingSlotsFromWindow } from './scenePendingIntentBindings.js';
import { createProgramReferenceLedger, programReferenceLedgerIssues, typedReferenceSymbol,
  TYPED_REFERENCE_AUTHORITY_BUNDLE as V } from './typedReferenceBindings.js';

type Row = Record<string, any>;
const same = (a: unknown, b: unknown) => canonicalFreeformJson(a) === canonicalFreeformJson(b);
const check = (v: unknown): void => { if (!v) throw new Error('PENDING_REFERENCE_QUALIFICATION_INVALID'); };
const closed = (v: any, keys: string[]) => v && !Array.isArray(v) && typeof v === 'object'
  && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));

/** This function receives an owner-read artifact and owner-held accepted
 * ticket. It is not an endpoint for a browser-authored authority map. */
export function derivePendingReferenceQualification(artifact: Row, artifactRevision: number, ticket: Row): Row {
  const { program, instruction, cursor, freeformBinding: binding, receipts } = artifact;
  const proposal = ticket?.response?.output, input = ticket?.request?.context?.input?.value;
  check(binding?.ticketDisposition === 'owner_accepted' && ticket?.status === 'accepted'
    && ticket.transport === 'manual' && ticket.response?.status === 'succeeded' && ticket.response.route?.provider === 'manual'
    && ticket._id === binding.ticket && ticket.campaignId === program.authorityBase.campaignId
    && ticket.interactionId === instruction.interactionId && ticket.instructionFingerprint === instruction.instructionFingerprint
    && ticket.policyVersion === binding.policyVersion && ticket.registryVersion === binding.registryVersion
    && ticket.requestDigest === binding.requestDigest && ticket.requestDigest === freeformJsonDigest(ticket.request)
    && proposal && ticket.outputDigest === binding.proposalDigest && ticket.outputDigest === freeformJsonDigest(proposal)
    && input?.instruction === instruction.exactText && input.mode === 'action' && proposal.ticket === ticket._id
    && proposal.clarification === null && ['gma.freeform-intent-proposal/2', V.proposal].includes(proposal.schemaVersion)
    && ['gma.semantic-action-program/6', V.program].includes(program.schemaVersion)
    && program.planner?.source === 'freeform_intent_compiler'
    && program.planner.policyVersion === (program.schemaVersion === V.program ? V.compiler : 'gma.semantic-action-compiler-policy/13')
    && Array.isArray(proposal.steps) && proposal.steps.length === program.nodes.length
    && same(binding.compiledStepIds, program.nodes.map((node: Row) => node.nodeId)));
  const catalog = ticket.catalogContextRef ? ticket.catalogBindings
    : ticket.selectedActorRef ? [{ key: 'selected_actor', kind: 'actor', ref: ticket.selectedActorRef }] : [];
  check(Array.isArray(catalog) && same(catalog, binding.sourceReferences));
  const ledger = createProgramReferenceLedger(proposal, catalog, binding.authorityBase.sceneRevision);
  if (program.schemaVersion === V.program) check(same(program.referenceLedger, ledger));
  const source = { instruction, program, cursor, artifactRevision, receipts } as PendingIntentWindowSource;
  const window = createPendingIntentWindow(source), slots = pendingIntentBindingSlots(source);
  const fields: Row[] = [], effects: Row[] = [], references: Row[] = [];
  const symbol = (index: number) => {
    check(Number.isSafeInteger(index) && index >= 0 && index < ledger.rows.length);
    return ledger.rows[index];
  };
  for (const projection of window.nodes) {
    const index = program.nodes.findIndex((node: Row) => node.nodeId === projection.nodeRef), step = proposal.steps[index];
    check(projection.nodeRef === `freeform:step:${index}` && step.kind === 'action');
    const nodeSlots = slots.find((row) => row.nodeRef === projection.nodeRef)!;
    for (const slot of nodeSlots.references) {
      let candidates: Row[] = [];
      if (slot.groupId) {
        const group = projection.node.observationGroups.find((row: Row) => row.groupId === slot.groupId);
        const symbolRef = group?.[slot.role === 'observer' ? 'observerTargetId' : slot.role === 'method' ? 'methodId' : 'formTargetId'];
        candidates = ledger.rows.filter((row: Row) => row.symbolRef === symbolRef);
      } else if (slot.outcomeId) {
        const outcome = projection.requirements.find((row: Row) => row.requirementId === slot.requirementId)?.value.observation;
        const original = proposal.observations?.[outcome?.sourceIndex];
        if (original?.step === index) candidates = [symbol(slot.role === 'relation_origin' ? original.origin : original.subject)];
      } else {
        const location = slot.locationFingerprint ? projection.node.semanticLocationBindings.bindings
          .filter((row: Row) => freeformJsonDigest(row) === slot.locationFingerprint)[slot.occurrence] : null;
        const requirement = projection.requirements.find((row: Row) => row.requirementId === slot.requirementId)?.value;
        const explicitSymbol = location?.symbolRef ?? requirement?.symbolRef;
        if (program.schemaVersion === V.program) candidates = ledger.rows.filter((row: Row) => row.symbolRef === explicitSymbol);
        else {
          const selections = [...(step.actor === null ? [] : [{ ref: step.actor, role: 'actor' }]), ...step.targets,
            ...proposal.observations.filter((row: Row) => row.step === index).flatMap((row: Row) => [
              { ref: row.observer, role: 'actor' }, { ref: row.subject, role: 'subject' },
              ...(row.origin === null ? [] : [{ ref: row.origin, role: 'origin' }]), ...(row.form == null ? [] : [{ ref: row.form, role: 'object' }]),
            ])];
          const unique = [...new Set(selections.filter((row: Row) => row.role === slot.role
            && proposal.referents[row.ref]?.text === (location?.description ?? requirement?.query)).map((row: Row) => row.ref))];
          candidates = unique.map((ref) => symbol(ref as number));
        }
      }
      check(candidates.length === 1);
      const row = candidates[0], expected = row.binding.kind === 'resolved' ? row.binding.ref : null;
      check(slot.originalRef === expected || slot.outcomeId && row.binding.kind === 'unresolved' && slot.originalRef === row.symbolRef && program.schemaVersion !== V.program);
      references.push({ nodeRef: projection.nodeRef, slotId: slot.slotId, symbolRef: row.symbolRef,
        sourceKind: row.binding.kind === 'resolved' ? 'owner_reference' : 'local_symbol', bindingState: row.binding.kind });
    }
    for (const requirement of projection.requirements) {
      const outcome = requirement.value.kind === 'observation' ? requirement.value.observation : null;
      if (!outcome) continue;
      const observationIndex = outcome.sourceIndex, original = proposal.observations?.[observationIndex];
      check(Number.isSafeInteger(observationIndex) && original?.step === index
        && outcome.outcomeId === `freeform:outcome:${observationIndex}` && outcome.targetId === typedReferenceSymbol(original.subject)
        && outcome.facet === original.facet && outcome.valueKind === original.valueKind && outcome.requestedPrecision === original.precision
        && (original.origin === null ? outcome.relationOriginTargetId === undefined
          : outcome.relationOriginTargetId === typedReferenceSymbol(original.origin)));
      for (const [field, role, sourceIndex] of [['targetRef', 'subject', original.subject], ['relationOriginRef', 'relation_origin', original.origin]] as const) {
        if (sourceIndex === null) continue;
        const row = symbol(sourceIndex);
        if (row.binding.kind === 'resolved') { check(outcome[field] === row.binding.ref); continue; }
        if (outcome[field] === null) continue;
        // Exact accepted index plus exact historical outcome correspondence,
        // never a prefix-based exemption for arbitrary owner-looking strings.
        check(outcome[field] === row.symbolRef && program.schemaVersion !== V.program);
        const slot = nodeSlots.references.filter((entry: Row) => entry.requirementId === requirement.requirementId
          && entry.outcomeId === outcome.outcomeId && entry.role === role);
        check(slot.length === 1 && slot[0].originalRef === row.symbolRef);
        fields.push({ nodeRef: projection.nodeRef, slotId: slot[0].slotId, requirementRef: requirement.requirementId,
          outcomeRef: outcome.outcomeId, field, originalRef: row.symbolRef, symbolRef: row.symbolRef, binding: 'unresolved' });
      }
    }
    for (const [effectIndex, effect] of (projection.node.requestedEffects ?? []).entries()) {
      const proposed = step.effects?.[effectIndex];
      check(proposed && effect.effectId === `freeform:step:${index}:effect:${effectIndex + 1}`
        && proposed.attempt === effect.attempt && proposed.resolution === effect.resolution);
      const explicit = proposal.schemaVersion === V.proposal;
      check(explicit || step.effects.length === 1 || step.targets.length === 0);
      const selected = explicit ? proposed.targets : step.effects.length === 1 ? step.targets : [];
      check(Array.isArray(selected) && selected.length <= 8);
      const targets = selected.map((selection: Row) => {
        check(step.targets.some((target: Row) => same(target, selection)) || selection.role === 'actor' && selection.ref === step.actor);
        const row = symbol(selection.ref), ref = row.binding.kind === 'resolved' ? row.binding.ref : null;
        const referenceSlots = nodeSlots.references.filter((entry: Row) => {
          if (entry.role !== selection.role || entry.outcomeId || entry.groupId) return false;
          if (entry.locationFingerprint) return (projection.node.semanticLocationBindings?.bindings ?? []).some((location: Row) =>
            freeformJsonDigest(location) === entry.locationFingerprint && location.role === selection.role && location.authorityRef === ref
            && (program.schemaVersion === V.program ? location.symbolRef === row.symbolRef : location.description === proposal.referents[selection.ref].text));
          const r = projection.requirements.find((item: Row) => item.requirementId === entry.requirementId)?.value;
          return r?.targetRole === selection.role && r.targetRef === ref
            && (program.schemaVersion === V.program ? r.symbolRef === row.symbolRef : r.query === proposal.referents[selection.ref].text);
        });
        // Prefer the explicitly role-qualified location use over its duplicate
        // lookup prerequisite. This selects a source slot, never a world target.
        const locations = referenceSlots.filter((entry: Row) => entry.locationFingerprint);
        const exact = locations.length ? locations : referenceSlots;
        check(exact.length === 1);
        return { targetSlotId: exact[0].slotId, symbolRef: row.symbolRef, role: selection.role };
      });
      check(new Set(targets.map(canonicalFreeformJson)).size === targets.length);
      effects.push({ nodeRef: projection.nodeRef, effectId: effect.effectId, targets });
    }
  }
  const body = { schemaVersion: V.qualification, programRef: program.programId, programFingerprint: freeformJsonDigest(program),
    instructionRef: instruction.instructionRef, instructionFingerprint: instruction.instructionFingerprint,
    sourceTicket: binding.ticket, sourceProposalDigest: binding.proposalDigest, sourceRequestDigest: binding.requestDigest,
    sourceWindowFingerprint: window.windowFingerprint, sourceReceiptFingerprint: freeformJsonDigest(receipts),
    ledger, references, fields, effects };
  const fingerprint = freeformJsonDigest(body);
  const value = { ...body, qualificationRef: `pending-reference:${fingerprint.slice(0, 40)}`, fingerprint };
  check(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 24_576);
  return value;
}

/** Verify a protected qualification's immutable association before deriving
 * current pending slots. Current world heads remain separate owner reads. */
export function pendingReferenceQualificationIssues(value: unknown, source: PendingIntentWindowSource): string[] {
  try {
    const keys = ['schemaVersion', 'programRef', 'programFingerprint', 'instructionRef', 'instructionFingerprint',
      'sourceTicket', 'sourceProposalDigest', 'sourceRequestDigest', 'sourceWindowFingerprint', 'sourceReceiptFingerprint',
      'ledger', 'references', 'fields', 'effects', 'qualificationRef', 'fingerprint'];
    check(closed(value, keys)); const q = value as Row;
    check(q.schemaVersion === V.qualification && q.programRef === source.program.programId
      && q.programFingerprint === freeformJsonDigest(source.program) && q.instructionRef === source.instruction.instructionRef
      && q.instructionFingerprint === source.instruction.instructionFingerprint && !programReferenceLedgerIssues(q.ledger).length
      && ['sourceProposalDigest', 'sourceRequestDigest', 'sourceWindowFingerprint', 'sourceReceiptFingerprint', 'fingerprint']
        .every((field) => /^[a-f0-9]{64}$/.test(q[field])) && typeof q.sourceTicket === 'string'
      && Array.isArray(q.references) && q.references.length <= 512
      && Array.isArray(q.fields) && q.fields.length <= 64 && Array.isArray(q.effects) && q.effects.length <= 64);
    const { qualificationRef, fingerprint, ...body } = q;
    check(fingerprint === freeformJsonDigest(body) && qualificationRef === `pending-reference:${fingerprint.slice(0, 40)}`
      && Buffer.byteLength(JSON.stringify(q), 'utf8') <= 24_576);
    const nodes = new Map(source.program.nodes.map((node: Row) => [node.nodeId, node]));
    const sourceSlots = pendingIntentBindingSlotsFromWindow({ nodes: source.program.nodes.map((node: Row) => ({
      nodeRef: node.nodeId, node, requirements: pendingIntentRequirementRows(node.nodeId, node.dataRequirements), instructionEvidence: node.evidenceSpans,
    })) });
    check(new Set(q.fields.map((row: Row) => row.slotId)).size === q.fields.length);
    check(new Set(q.references.map((row: Row) => row.slotId)).size === q.references.length);
    for (const row of q.references) {
      const slot = sourceSlots.find((node: Row) => node.nodeRef === row.nodeRef)?.references.find((slot: Row) => slot.slotId === row.slotId);
      const symbol = q.ledger.rows.find((r: Row) => r.symbolRef === row.symbolRef);
      check(closed(row, ['nodeRef', 'slotId', 'symbolRef', 'sourceKind', 'bindingState']) && slot && symbol
        && row.bindingState === symbol.binding.kind && row.sourceKind === (symbol.binding.kind === 'resolved' ? 'owner_reference' : 'local_symbol')
        && (slot.originalRef === (symbol.binding.kind === 'resolved' ? symbol.binding.ref : null)
          || q.fields.some((field: Row) => field.nodeRef === row.nodeRef && field.slotId === row.slotId && field.symbolRef === row.symbolRef)));
    }
    for (const row of q.fields) {
      const slot = sourceSlots.find((item: Row) => item.nodeRef === row.nodeRef)?.references.find((entry: Row) => entry.slotId === row.slotId);
      const requirement = pendingIntentRequirementRows(row.nodeRef, (nodes.get(row.nodeRef) as Row)?.dataRequirements ?? [])
        .find((entry) => entry.requirementId === row.requirementRef)?.value;
      check(closed(row, ['nodeRef', 'slotId', 'requirementRef', 'outcomeRef', 'field', 'originalRef', 'symbolRef', 'binding'])
        && nodes.has(row.nodeRef) && row.binding === 'unresolved' && row.originalRef === row.symbolRef
        && ['targetRef', 'relationOriginRef'].includes(row.field)
        && slot?.originalRef === row.originalRef && slot.requirementId === row.requirementRef && slot.outcomeId === row.outcomeRef
        && requirement?.observation?.outcomeId === row.outcomeRef && requirement.observation[row.field] === row.originalRef
        && requirement.observation[row.field === 'targetRef' ? 'targetId' : 'relationOriginTargetId'] === row.symbolRef
        && slot.role === (row.field === 'targetRef' ? 'subject' : 'relation_origin')
        && q.ledger.rows.some((r: Row) => r.symbolRef === row.symbolRef && r.binding.kind === 'unresolved'));
    }
    check(new Set(q.effects.map((row: Row) => `${row.nodeRef}:${row.effectId}`)).size === q.effects.length);
    for (const row of q.effects) {
      check(closed(row, ['nodeRef', 'effectId', 'targets'])
        && (nodes.get(row.nodeRef) as Row)?.requestedEffects?.some((effect: Row) => effect.effectId === row.effectId)
        && Array.isArray(row.targets) && row.targets.length <= 8 && new Set(row.targets.map(canonicalFreeformJson)).size === row.targets.length);
      for (const target of row.targets) {
        const slot = sourceSlots.find((item: Row) => item.nodeRef === row.nodeRef)?.references.find((entry: Row) => entry.slotId === target.targetSlotId);
        const symbol = q.ledger.rows.find((r: Row) => r.symbolRef === target.symbolRef);
        check(closed(target, ['targetSlotId', 'symbolRef', 'role']) && symbol && slot && slot.role === target.role
          && slot.originalRef === (symbol.binding.kind === 'resolved' ? symbol.binding.ref : null));
      }
    }
    return [];
  } catch { return ['/pendingReferenceQualification']; }
}
