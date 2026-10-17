import { describe, expect, it } from 'vitest';
import { qualifiedPendingFixture } from './fixtures/qualifiedPending.js';
import { deriveQualifiedSensoryProjection, QUALIFIED_SENSORY_ANSWER_VERSION,
  type QualifiedSensoryProjectionInput } from './qualifiedObservation.js';
import { QUALIFIED_BINDING_POLICY, QUALIFIED_EXAMINER_POLICY } from './scenePendingIntentQualified.js';

function fixture(): QualifiedSensoryProjectionInput {
  const f = qualifiedPendingFixture();
  return { evidence: f.evidence, viewpointZoneRef: 'zone:interior', accessRef: 'access:confirmed', activationReceiptRef: 'receipt:confirmed',
    affordanceRef: 'affordance:remote', factRefs: ['fact:interior'], facts: structuredClone(f.context.proposal.facts),
    outcomes: [{ outcomeId: 'outcome:interior', targetRef: 'element:tunnel', facet: 'surface_description', valueKind: 'description', requestedPrecision: 'ordinary' }] };
}
function explicit(input: QualifiedSensoryProjectionInput, kind: string, value: unknown, statement: string, resultKind = 'observed') {
  input.outcomes[0].valueKind = kind;
  input.facts[0].valueKind = resultKind === 'bounded_negative' ? 'bounded_negative'
    : kind === 'measurement_or_relation' ? String((value as Record<string, unknown>).kind) : kind;
  input.facts[0].value = { schemaVersion: QUALIFIED_SENSORY_ANSWER_VERSION, resultKind, value,
    playerFacingStatement: statement, supportedPrecision: resultKind === 'blocked' ? null : 'exact', modality: 'visual' };
}

describe('ADR 016 examined sensory value derivation', () => {
  it('retains ordinary implicit prose without changing the prepared or native world', () => {
    const f = fixture(), before = structuredClone(f);
    const p = deriveQualifiedSensoryProjection(f);
    expect(p.observables[0]).toMatchObject({ resultKind: 'observed', supportedPrecision: 'ordinary', value: { kind: 'description', text: f.facts[0].value } });
    expect(f).toEqual(before); expect(p.observationAccess[0].sourceRefs).toContain('receipt:confirmed');
  });
  for (const [kind, value, statement] of [
    ['description', { kind: 'description', text: 'An iron grate crosses the channel.' }, 'An iron grate crosses the channel.'],
    ['classification', { kind: 'classification', text: 'iron grate' }, 'The barrier is an iron grate.'],
    ['relation', { kind: 'relation', text: 'beyond the bend' }, 'The grate stands beyond the bend.'],
    ['statement', { kind: 'statement', text: 'The gate is raised.' }, 'The gate is raised.'],
    ['identity_ref', { kind: 'identity_ref', ref: 'actor:worker' }, 'The lantern reveals the worker you just spoke with.'],
    ['boolean', { kind: 'boolean', value: true }, 'Water flows under the grate.'],
    ['count', { kind: 'count', value: 2 }, 'Two grates cross the visible channel.'],
    ['set', { kind: 'set', values: ['grate', 'lantern'] }, 'A grate and lantern occupy the alcove.'],
    ['measurement', { kind: 'measurement', value: 5, unit: 'feet' }, 'The channel is five feet wide.'],
    ['measurement_range', { kind: 'measurement_range', minimum: 4, maximum: 6, unit: 'feet' }, 'The channel is between four and six feet wide.'],
    ['measurement_or_relation', { kind: 'relation', text: 'beyond the bend' }, 'The grate stands beyond the bend.'],
  ] as const) it(`requires and preserves an explicit ${kind} value and lived statement`, () => {
    const f = fixture(); if (kind === 'identity_ref') { f.outcomes[0].facet = 'identity'; f.facts[0].facet = 'identity'; f.facts[0].visibility = 'revealed'; }
    explicit(f, kind, value, statement); f.outcomes[0].requestedPrecision = 'exact';
    expect(deriveQualifiedSensoryProjection(f).observables[0]).toMatchObject({ value, playerFacingStatement: statement, supportedPrecision: 'exact' });
  });
  it('does not parse implicit counts or claim exact precision, while ordinary evidence also satisfies a bounded request', () => {
    const numeric = fixture(); numeric.outcomes[0].valueKind = 'count'; numeric.facts[0].valueKind = 'count'; numeric.facts[0].value = 'There are two grates.';
    expect(() => deriveQualifiedSensoryProjection(numeric)).toThrow();
    const f = fixture(); f.outcomes[0].requestedPrecision = 'exact'; expect(() => deriveQualifiedSensoryProjection(f)).toThrow();
    f.outcomes[0].requestedPrecision = 'bounded'; expect(deriveQualifiedSensoryProjection(f).observables[0].supportedPrecision).toBe('ordinary');
  });
  it('uses the existing precision order instead of treating bounded evidence as stronger than ordinary evidence', () => {
    const f = fixture(); explicit(f, 'count', { kind: 'count', value: 2 }, 'About two grates are visible.');
    (f.facts[0].value as Record<string, unknown>).supportedPrecision = 'bounded';
    expect(() => deriveQualifiedSensoryProjection(f)).toThrow();
    (f.facts[0].value as Record<string, unknown>).supportedPrecision = 'approximate';
    expect(deriveQualifiedSensoryProjection(f).observables[0].supportedPrecision).toBe('approximate');
  });
  it('requires explicit bounded absence, scoped lived prose and matching typed value', () => {
    const f = fixture(); f.facts[0].negativeScope = 'the visible alcove';
    explicit(f, 'count', { kind: 'count', value: 0 }, 'No guards stand in the visible alcove.', 'bounded_negative');
    expect(deriveQualifiedSensoryProjection(f).observables[0]).toMatchObject({ resultKind: 'bounded_negative', value: { kind: 'count', value: 0 } });
    f.facts[0].negativeScope = 'the entire dungeon'; expect(() => deriveQualifiedSensoryProjection(f)).toThrow();
    f.facts[0].negativeScope = null; expect(() => deriveQualifiedSensoryProjection(f)).toThrow();
  });
  it('derives a concrete sensory obstruction, not a failed movement or a revealed result', () => {
    const f = fixture(); explicit(f, 'description', null, 'Opaque silt blocks the rat’s view beyond the grate.', 'blocked');
    const p = deriveQualifiedSensoryProjection(f);
    expect(p.observables).toEqual([]); expect(p.obstructions[0]).toMatchObject({ mobilityEffect: 'none', affectedAccessRefs: ['access:confirmed'],
      observerRefs: ['actor:familiar'], formRefs: ['rat'], sourceRefs: ['fact:interior', 'affordance:remote'], provenanceReceiptRefs: ['receipt:confirmed'] });
  });
  for (const [name, mutate] of [
    ['numeric value without statement', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'count', { kind: 'count', value: 2 }, ''); }],
    ['untyped object', (f: QualifiedSensoryProjectionInput) => { f.facts[0].value = { kind: 'description', text: 'A grate.' }; }],
    ['extra envelope authority', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'count', { kind: 'count', value: 2 }, 'Two grates.'); Object.assign(f.facts[0].value as object, { movementCompleted: true }); }],
    ['extra typed keys', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'count', { kind: 'count', value: 2, resolved: true }, 'Two grates.'); }],
    ['negative count', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'count', { kind: 'count', value: -1 }, 'Minus one grate.'); }],
    ['empty set', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'set', { kind: 'set', values: [] }, 'Nothing.'); }],
    ['duplicate set', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'set', { kind: 'set', values: ['grate', 'grate'] }, 'Grates.'); }],
    ['unordered range', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'measurement_range', { kind: 'measurement_range', minimum: 6, maximum: 2, unit: 'feet' }, 'A channel.'); }],
    ['nonfinite measurement', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'measurement', { kind: 'measurement', value: Infinity, unit: 'feet' }, 'A channel.'); }],
    ['unsupported sense', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'count', { kind: 'count', value: 2 }, 'Two grates.'); (f.facts[0].value as Record<string, unknown>).modality = 'magical'; }],
    ['private identity', (f: QualifiedSensoryProjectionInput) => { f.outcomes[0].facet = 'identity'; f.facts[0].facet = 'identity'; explicit(f, 'identity_ref', { kind: 'identity_ref', ref: 'actor:secret' }, 'A secret patron.'); }],
    ['foreign observer', (f: QualifiedSensoryProjectionInput) => { f.facts[0].observerRestrictions = ['actor:other']; }],
    ['no confirmed sensory fact', (f: QualifiedSensoryProjectionInput) => { f.factRefs = []; }],
    ['competing facts', (f: QualifiedSensoryProjectionInput) => { f.facts.push({ ...f.facts[0], factId: 'fact:other' }); f.factRefs.push('fact:other'); }],
    ['blocked answer claiming value', (f: QualifiedSensoryProjectionInput) => { explicit(f, 'description', { kind: 'description', text: 'A secret.' }, 'Silt blocks sight.', 'blocked'); }],
  ] as const) it(`rejects ${name} before access is saved`, () => { const f = fixture(); mutate(f); expect(() => deriveQualifiedSensoryProjection(f)).toThrow(); });
  it('states explicit and implicit requirements in the first-pass builder and independent examiner policies', () => {
    for (const phrase of [QUALIFIED_SENSORY_ANSWER_VERSION, 'playerFacingStatement', 'negativeScope', 'modalityRestrictions', 'one to 16', 'measurement_or_relation', 'ordinary-precision']) expect(QUALIFIED_BINDING_POLICY).toContain(phrase);
    for (const phrase of [QUALIFIED_SENSORY_ANSWER_VERSION, 'typed value', 'playerFacingStatement', 'concrete sensory barrier', 'pending mechanics']) expect(QUALIFIED_EXAMINER_POLICY).toContain(phrase);
  });
});
