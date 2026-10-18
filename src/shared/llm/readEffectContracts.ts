import { isTypedReferenceProgram, typedReferenceProgramIssues, historicalTypedEffectProgram } from './typedReferenceBindings.js';
/** ADR 019 versions are negotiated as one bundle; partial upgrades cannot execute. */
export const READ_EFFECT_CONTRACTS = Object.freeze({
  proposal: 'gma.freeform-intent-proposal/2',
  program: 'gma.semantic-action-program/6',
  compiler: 'gma.semantic-action-compiler-policy/13',
  binding: 'gma.freeform-plan-binding/2',
  classification: 'gma.pending-requirement-role-classification/1',
  application: 'gmc.pending-requirement-role-application/1',
  design: 'gmc.scene-story-design/4',
  narration: 'gma.current-scene-narration-packet/15',
});
export const isReadEffectProgram = (value: any): boolean => value?.schemaVersion === READ_EFFECT_CONTRACTS.program || isTypedReferenceProgram(value);
/** Additive /6 plans retain /4's observation receipts and atomic settlement.
 * Pure self-action plans do not acquire an observation workflow by version alone. */
export function isObservationSagaProgram(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const program = value as Record<string, unknown>;
  if (program.schemaVersion === 'gma.semantic-action-program/4') return true;
  return isReadEffectProgram(program) && Array.isArray(program.nodes)
    && program.nodes.some((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const node = value as Record<string, unknown>;
      return node.observationPrerequisite != null || (Array.isArray(node.observationGroups) && node.observationGroups.length > 0
        && Array.isArray(node.dataRequirements) && node.dataRequirements.some((row: unknown) =>
          !!row && typeof row === 'object' && 'kind' in row && row.kind === 'observation'));
    });
}
/** Narration verifies lived performance, never converts intent metadata into
 * an owner result. Reused unchanged for focused correction. */
export const REQUESTED_EFFECT_NARRATION_POLICY = 'For every requestedEffects row, explicitly describe that declared attempt in responseText and return exactly one effectNarration row {effectId,disposition,narrationEvidence}. Copy effectId and quote a nonempty exact excerpt from the finished responseText. Metadata cannot replace the lived action in the prose. A narrative_self_action with no pending roll uses performed and may describe only the declared nonconsequential bodily action; it grants no NPC reaction, discovery, travel, permission, concealment change, resource or lasting world effect. Its performer realization documents that turn event, not a lasting actor objective; do not invent a continuing objective from a completed bodily beat. An owner_resolution uses attempted, never performed; actual success or failure must come from the applicable supplied owner operation, and movement arrival still requires movementOutcome and its protected writer. With a pending roll, use pending_mechanic and describe only the current attempt and unresolved stakes, not its success. Do not invent a roll for an ordinary self-action. Information reads remain governed by actionBoundReveal, not by requestedEffects. Unknown feasibility pauses for GM review; never fabricate owner authority. For a declared effect-only step with no information reads or projected answers, materialClaims may be empty: do not invent a source fact stating the action already happened. Any actual material world assertion still needs its exact authorized source and claim; mixed and information steps retain the existing nonempty fact-claim requirement.';

/** Exact role/evidence checks; semantic truth still belongs to the original
 * independent review, current owners and the lived narration requirements. */
export function effectNarrationIssues(value: unknown, effects: readonly { effectId?: unknown; resolution?: unknown }[], responseText: string, pendingMechanic: boolean): string[] {
  if (!Array.isArray(value) || value.length !== effects.length || new Set(value.map((row) => row?.effectId)).size !== effects.length) return ['/effectNarration'];
  const issues: string[] = [];
  for (const effect of effects) {
    const row = value.find((entry) => entry?.effectId === effect.effectId);
    const expected = pendingMechanic ? 'pending_mechanic' : effect.resolution === 'narrative_self_action' ? 'performed' : 'attempted';
    if (!row || Object.keys(row).sort().join(',') !== 'disposition,effectId,narrationEvidence' || row.disposition !== expected
      || typeof row.narrationEvidence !== 'string' || !row.narrationEvidence.trim() || row.narrationEvidence.length > 2000
      || !responseText.includes(row.narrationEvidence)) issues.push('/effectNarration');
  }
  return issues;
}
/** Exact tuple required before emitting any new Manual read/effect operation. */
export const READ_EFFECT_AUTHORITY_BUNDLE = Object.freeze({ ...READ_EFFECT_CONTRACTS,
  capability: 'manual-read-effect-orchestration/1', context: 'gmc.scene-pending-intent-context/4',
  pendingBindings: 'gma.scene-pending-intent-bindings/4', builder: 'gma.scene-reality-builder-result/5',
  assessment: 'gma.scene-readiness-assessment/5', pendingRecord: 'gmc.scene-pending-intent-binding-record/4',
  pendingReceipt: 'gma.action-intent-binding-receipt/4', manualState: 'gma.scene-reality-manual-state/6',
});

/** Closed compact rows keep classification explicit and grounded in player text.
 * Resolution is a proposed owner category, never permission or a success flag. */
export const READ_EFFECT_ROW_SCHEMAS = {
  read: { type: 'object', additionalProperties: false, required: ['query', 'evidence'], properties: {
    query: { type: 'string', minLength: 1, maxLength: 500 }, evidence: { $ref: '#/$defs/evidence' },
  } },
  effect: { type: 'object', additionalProperties: false, required: ['attempt', 'evidence', 'resolution'], properties: {
    attempt: { type: 'string', minLength: 1, maxLength: 500 }, evidence: { $ref: '#/$defs/evidence' },
    resolution: { enum: ['narrative_self_action', 'owner_resolution'] },
  } },
} as const;

/** Canonical compiled-effect checks shared with GMA. Historical programs cannot
 * acquire new fields silently; all evidence is exact UTF-8 instruction evidence. */
export function readEffectProgramIssues(value: unknown, instruction?: { exactText?: unknown } | null): string[] {
  const record = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  if (!record(value)) return ['/program'];
  const program = value;
  if (isTypedReferenceProgram(program)) return [...typedReferenceProgramIssues(program),
    ...readEffectProgramIssues(historicalTypedEffectProgram(program), instruction)];
  const issues: string[] = [];
  const modern = program.schemaVersion === READ_EFFECT_CONTRACTS.program;
  const nodes: unknown[] = Array.isArray(program.nodes) ? program.nodes : [];
  const planner = record(program.planner) ? program.planner : null;
  if (!modern) {
    if (nodes.some((node) => record(node) && Object.hasOwn(node, 'requestedEffects'))
      || planner?.policyVersion === READ_EFFECT_CONTRACTS.compiler) issues.push('/version');
    return issues;
  }
  if (planner?.source !== 'freeform_intent_compiler' || planner?.policyVersion !== READ_EFFECT_CONTRACTS.compiler) issues.push('/compiler');
  for (const [index, node] of nodes.entries()) {
    if (!record(node)) { issues.push(`/nodes/${index}`); continue; }
    const effects = node.requestedEffects;
    if (!Array.isArray(effects) || effects.length > 8) { issues.push(`/nodes/${index}/requestedEffects`); continue; }
    const ids = new Set<string>();
    for (const [i, effect] of effects.entries()) {
      const p = `/nodes/${index}/requestedEffects/${i}`;
      if (!record(effect) || Object.keys(effect).sort().join(',') !== 'attempt,effectId,evidenceSpans,resolution'
        || typeof effect.effectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(effect.effectId)
        || ids.has(effect.effectId) || typeof effect.attempt !== 'string' || !effect.attempt.trim() || effect.attempt.length > 500
        || !['narrative_self_action', 'owner_resolution'].includes(String(effect.resolution))
        || !Array.isArray(effect.evidenceSpans) || !effect.evidenceSpans.length || effect.evidenceSpans.length > 8) {
        issues.push(p); continue;
      }
      ids.add(effect.effectId);
      for (const span of effect.evidenceSpans) {
        if (!record(span) || Object.keys(span).sort().join(',') !== 'end,quote,start'
          || typeof span.start !== 'number' || typeof span.end !== 'number'
          || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start
          || typeof span.quote !== 'string' || !span.quote.length
          || Buffer.byteLength(span.quote, 'utf8') !== span.end - span.start
          || instruction && Buffer.from(String(instruction.exactText), 'utf8').subarray(span.start, span.end).toString('utf8') !== span.quote
          || !Array.isArray(node.evidenceSpans) || !node.evidenceSpans.some((anchor: unknown) => record(anchor)
            && typeof anchor.start === 'number' && typeof anchor.end === 'number'
            && Number(span.start) >= anchor.start && Number(span.end) <= anchor.end)) issues.push(`${p}/evidenceSpans`);
      }
      // Structural self-actions cannot consume resources or hide owner work.
      if (effect.resolution === 'narrative_self_action' && (!['interact', 'other'].includes(String(node.kind))
        || Array.isArray(node.observationGroups) && node.observationGroups.length || node.observationPrerequisite
        || Array.isArray(node.authorityRequirements) && node.authorityRequirements.some((owner: unknown) => owner !== 'gmc')
        || Array.isArray(node.dataRequirements) && node.dataRequirements.some((row: unknown) => record(row)
          && ['character_capability', 'resource', 'mechanic', 'destination_location'].includes(String(row.kind))))) issues.push(`${p}/resolution`);
    }
  }
  return issues;
}
