import { freeformJsonDigest } from './freeformPlanBinding.js';
import type { PendingObserverEvidence } from './pendingObserverEvidence.js';

/** Exact typed outcome from the immutable, owner-accepted action program. */
export interface QualifiedSensoryOutcome {
  outcomeId: string; targetRef: string; facet: string; valueKind: string; requestedPrecision: string;
}
/** Only examined affordance fact references may feed the derived sensing view. */
export interface QualifiedSensoryFact {
  factId: string; targetRef: string; facet: string; valueKind: string; value: unknown;
  epistemicState: string; visibility: string; observerRestrictions: string[]; modalityRestrictions: string[]; negativeScope: string | null;
}
/** Minimal examined world scope; unrelated private facts remain outside the view. */
export interface QualifiedSensoryProjectionInput {
  evidence: PendingObserverEvidence; viewpointZoneRef: string; accessRef: string; activationReceiptRef: string;
  affordanceRef: string; factRefs: string[]; facts: QualifiedSensoryFact[]; outcomes: QualifiedSensoryOutcome[];
}
export const QUALIFIED_SENSORY_ANSWER_VERSION = 'gmc.scene-sensory-answer/1';
function fail(): never { throw new Error('Qualified sensory scope is incomplete or incompatible.'); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, max = 800): value is string => typeof value === 'string' && !!value.trim() && value.length <= max
  && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
function typedObservationValue(value: unknown, expectedKind: string): Record<string, unknown> {
  if (!object(value) || value.kind !== expectedKind) fail();
  const kind = value.kind;
  if (['description', 'classification', 'relation', 'statement'].includes(String(kind))) {
    if (!closed(value, ['kind', 'text']) || !text(value.text)) fail();
  } else if (kind === 'identity_ref') {
    if (!closed(value, ['kind', 'ref']) || typeof value.ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.ref)) fail();
  } else if (kind === 'boolean' || kind === 'count') {
    if (!closed(value, ['kind', 'value']) || (kind === 'boolean' ? typeof value.value !== 'boolean'
      : !Number.isSafeInteger(value.value) || Number(value.value) < 0)) fail();
  } else if (kind === 'set') {
    if (!closed(value, ['kind', 'values']) || !Array.isArray(value.values) || value.values.length < 1 || value.values.length > 16
      || value.values.some((entry) => !text(entry, 240)) || new Set(value.values).size !== value.values.length) fail();
  } else if (kind === 'measurement') {
    if (!closed(value, ['kind', 'value', 'unit']) || !Number.isFinite(value.value) || !text(value.unit, 40)) fail();
  } else if (kind === 'measurement_range') {
    if (!closed(value, ['kind', 'minimum', 'maximum', 'unit']) || !Number.isFinite(value.minimum) || !Number.isFinite(value.maximum)
      || Number(value.minimum) > Number(value.maximum) || !text(value.unit, 40)) fail();
  } else fail();
  return structuredClone(value);
}

/** Converts an explicit typed value, never a string parser or a prose/label join.
 * Prose has ordinary precision; numeric/identity claims need exact typed evidence. */
function typedValue(fact: QualifiedSensoryFact, outcome: QualifiedSensoryOutcome) {
  const kind = fact.valueKind, raw = fact.value;
  const matchesKind = kind === outcome.valueKind || outcome.valueKind === 'measurement_or_relation'
    && ['measurement', 'measurement_range', 'relation'].includes(kind);
  if (object(raw)) {
    if (!closed(raw, ['schemaVersion', 'resultKind', 'value', 'playerFacingStatement', 'supportedPrecision', 'modality'])
      || raw.schemaVersion !== QUALIFIED_SENSORY_ANSWER_VERSION || !['observed', 'bounded_negative', 'blocked'].includes(String(raw.resultKind))
      || !text(raw.playerFacingStatement) || !['visual', 'auditory', 'olfactory', 'tactile', 'magical'].includes(String(raw.modality))) fail();
    if (raw.resultKind === 'blocked') {
      if (raw.value !== null || raw.supportedPrecision !== null || fact.negativeScope !== null || !matchesKind) fail();
      return { value: null, statement: raw.playerFacingStatement, precision: null, modality: String(raw.modality), resultKind: 'blocked' };
    }
    if (!['bounded', 'ordinary', 'approximate', 'exact'].includes(String(raw.supportedPrecision))
      || (raw.resultKind === 'bounded_negative' ? kind !== 'bounded_negative' || !text(fact.negativeScope)
        || !String(raw.playerFacingStatement).includes(fact.negativeScope) : !matchesKind || fact.negativeScope !== null)) fail();
    const expected = outcome.valueKind === 'measurement_or_relation' && object(raw.value) ? String(raw.value.kind) : outcome.valueKind;
    if (outcome.valueKind === 'measurement_or_relation' && !['measurement', 'measurement_range', 'relation'].includes(expected)) fail();
    if (raw.resultKind === 'observed' && kind !== expected) fail();
    return { value: typedObservationValue(raw.value, expected), statement: raw.playerFacingStatement,
      precision: String(raw.supportedPrecision), modality: String(raw.modality), resultKind: String(raw.resultKind) };
  }
  if (['description', 'classification', 'relation', 'statement'].includes(kind)) {
    if (!text(raw) || fact.negativeScope !== null || kind !== outcome.valueKind) fail();
    return { value: { kind, text: raw }, statement: raw, precision: 'ordinary', modality: null, resultKind: 'observed' };
  }
  // Fact /1 has no separately examined player-facing statement for numeric,
  // identity, set or negative values. Do not manufacture one from private data.
  fail();
}

/** A pure read model, not access activation or a saved observation. It requires
 * an already verified activation ref at the service boundary. Unlisted private
 * facts and incompatible modalities/precision can never enter the projection. */
export function deriveQualifiedSensoryProjection(input: QualifiedSensoryProjectionInput) {
  const { evidence } = input;
  if (!input.outcomes.length || input.outcomes.length > 8 || new Set(input.outcomes.map((row) => row.outcomeId)).size !== input.outcomes.length
    || input.factRefs.length > 32 || new Set(input.factRefs).size !== input.factRefs.length) fail();
  const derived = input.outcomes.map((outcome) => {
    const facts = input.facts.filter((fact) => input.factRefs.includes(fact.factId)
      && fact.targetRef === outcome.targetRef && fact.facet === outcome.facet);
    if (facts.length !== 1) fail();
    const fact = facts[0];
    if (!['canonical', 'prepared_private_world', 'scene_local_stable', 'revealed'].includes(fact.epistemicState)
      || fact.observerRestrictions.length && !fact.observerRestrictions.includes(evidence.observerRef)
      || outcome.facet === 'identity' && !['revealed', 'public_surface'].includes(fact.visibility)) fail();
    const modalities = fact.modalityRestrictions.filter((modality) => evidence.availableModalities.includes(modality));
    if (!modalities.length) fail();
    const typed = typedValue(fact, outcome);
    // The existing observation contract's precision order, including its
    // approximate supported evidence level; do not invent a second lattice.
    const precisionRank: Record<string, number> = { bounded: 0, ordinary: 1, approximate: 1, exact: 2 };
    if (typed.modality !== null && !modalities.includes(typed.modality) || !['bounded', 'ordinary', 'exact'].includes(outcome.requestedPrecision)
      || typed.resultKind !== 'blocked' && precisionRank[String(typed.precision)] < precisionRank[outcome.requestedPrecision]) fail();
    const modality = typed.modality ?? modalities[0];
    if (typed.resultKind === 'blocked') return { modality, observable: null, obstruction: {
      obstructionId: `qualified-obstruction:${freeformJsonDigest({ evidenceRef: evidence.evidenceRef, outcome, factRef: fact.factId, receipt: input.activationReceiptRef }).slice(0, 40)}`,
      subjectRefs: [outcome.targetRef], affectedFacets: [outcome.facet], affectedModalities: [modality], affectedAccessRefs: [input.accessRef], pathRefs: [],
      viewpointRefs: [input.viewpointZoneRef], mobilityEffect: 'none', observerRefs: [evidence.observerRef], formRefs: evidence.currentForm ? [evidence.currentForm] : [],
      methodRefs: [evidence.methodRef], playerFacingStatement: typed.statement, sourceRefs: [fact.factId, input.affordanceRef], provenanceReceiptRefs: [input.activationReceiptRef] } };
    return { modality, obstruction: null, observable: { observableId: `qualified-observable:${freeformJsonDigest({ evidenceRef: evidence.evidenceRef, outcome, factRef: fact.factId, receipt: input.activationReceiptRef }).slice(0, 40)}`,
      subjectRef: outcome.targetRef, facet: outcome.facet, resultKind: typed.resultKind, value: typed.value, playerFacingStatement: typed.statement,
      perceptibility: { modalities, accessCondition: 'declared_method', observerRefs: [evidence.observerRef], methodRefs: [evidence.methodRef], mechanicRef: null },
      supportedPrecision: typed.precision, modality, viewpointRef: input.viewpointZoneRef, epistemicState: 'scene_local_established',
      sourceRefs: [fact.factId, input.affordanceRef, evidence.evidenceRef, input.activationReceiptRef] } };
  });
  const access = { accessId: input.accessRef, originViewpointRef: input.viewpointZoneRef, candidateViewpointRef: input.viewpointZoneRef,
    pathRef: null, accessMode: evidence.observerKind === 'familiar' ? 'remote_sensor' : 'stationary',
    requiredCapabilityRefs: [evidence.capabilityRef], availableModalities: [...new Set(derived.map((row) => row.modality))],
    subjectRefs: [...new Set(input.outcomes.map((row) => row.targetRef))], facets: [...new Set(input.outcomes.map((row) => row.facet))],
    epistemicState: 'scene_local_established', sourceRefs: [input.affordanceRef, evidence.evidenceRef, input.activationReceiptRef],
    playerFacingStatement: 'The observer has reached the confirmed viewpoint and can use the confirmed sensing method.' };
  return { observationAccess: [access], observables: derived.flatMap((row) => row.observable ? [row.observable] : []),
    obstructions: derived.flatMap((row) => row.obstruction ? [row.obstruction] : []) };
}
