import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { READ_EFFECT_CONTRACTS, REQUESTED_EFFECT_NARRATION_POLICY, readEffectProgramIssues, effectNarrationIssues, isObservationSagaProgram } from './readEffectContracts.js';
import { FREEFORM_INTENT_PROPOSAL_SCHEMA, FREEFORM_READ_EFFECT_PROPOSAL_SCHEMA } from './freeformIntentSchema.js';
import { FREEFORM_READ_EFFECT_OPERATION, FREEFORM_READ_EFFECT_POLICY, FREEFORM_MOVER_POLICY, FREEFORM_MOVER_POLICY_VERSION } from './freeformIntakePolicy.js';
import { getOperationDefinition } from '../../server/llm-orchestrator/operationRegistry.js';
import { validateFreeformIntake } from '../../server/llm-orchestrator/freeformIntakeValidation.js';

const shape = new Ajv({ strict: false }).compile(FREEFORM_READ_EFFECT_PROPOSAL_SCHEMA);
const proposal = () => ({ schemaVersion: READ_EFFECT_CONTRACTS.proposal, ticket: 'fixture', windowText: 'I nod.',
  referents: [{ kind: 'actor', text: 'I', catalogKey: null, methodKind: null }],
  steps: [{ kind: 'action', purpose: 'other', goal: 'Nod', evidence: ['I nod.'], actor: 0, targets: [], method: null,
    reads: [], effects: [{ attempt: 'Nod', evidence: ['I nod.'], resolution: 'narrative_self_action' }], after: [], parallel: [], when: null }],
  observations: [], clarification: null });
const request: any = { operation: FREEFORM_READ_EFFECT_OPERATION, context: { input: { value: {
  ticket: 'fixture', instruction: 'I nod.', mode: 'action', catalog: [],
} } } };

describe('ADR 019 canonical read/effect boundary', () => {
  it('retains observation saga semantics only for recognized observation-bearing programs', () => {
    const observe = { observationGroups: [{ groupId: 'group:one' }], dataRequirements: [{ kind: 'observation' }] };
    expect(isObservationSagaProgram({ schemaVersion: 'gma.semantic-action-program/4' })).toBe(true);
    expect(isObservationSagaProgram({ schemaVersion: READ_EFFECT_CONTRACTS.program, nodes: [observe] })).toBe(true);
    expect(isObservationSagaProgram({ schemaVersion: READ_EFFECT_CONTRACTS.program, nodes: [{ observationPrerequisite: { owner: 'gmc' } }] })).toBe(true);
    for (const value of [null, [], { schemaVersion: READ_EFFECT_CONTRACTS.program, nodes: [] },
      { schemaVersion: 'unknown', nodes: [observe] }, { schemaVersion: 'gma.semantic-action-program/5', nodes: [observe] },
      { schemaVersion: READ_EFFECT_CONTRACTS.program, nodes: [{ observationGroups: [{}], dataRequirements: [{ kind: 'scene_presence' }] }] }]) {
      expect(isObservationSagaProgram(value)).toBe(false);
    }
  });
  it('keeps old closed schema immutable and registers a separate original policy without a new retry budget', () => {
    expect(FREEFORM_INTENT_PROPOSAL_SCHEMA.$id).toBe('gma.freeform-intent-proposal/1');
    expect(FREEFORM_INTENT_PROPOSAL_SCHEMA.$defs.step.required).toContain('results');
    expect(FREEFORM_READ_EFFECT_PROPOSAL_SCHEMA.$defs.step.required).not.toContain('results');
    const operation = getOperationDefinition(FREEFORM_READ_EFFECT_OPERATION);
    expect(operation.prompt).toMatchObject({ version: FREEFORM_MOVER_POLICY_VERSION, systemInstruction: FREEFORM_MOVER_POLICY });
    expect(operation.prompt.systemInstruction).toContain('step.actor is the actor whose location is attempted to change');
    expect(operation.prompt.systemInstruction).toContain('same moved actor as its observer');
    expect(operation.provider).toMatchObject({ maxAttempts: 1, fallbackAllowed: false });
    expect(operation.cache.enabled).toBe(false);
    expect(operation.context).toMatchObject({ allowedKeys: ['input'], inputHardLimitBytes: 24576 });
    expect(FREEFORM_READ_EFFECT_POLICY).toContain('not a read saying the hand is already raised');
    expect(FREEFORM_READ_EFFECT_POLICY).toContain('Evidence on every read/effect');
  });
  it('requires explicit bounded roles and exact original instruction evidence', () => {
    const p: any = proposal();
    expect(shape(p)).toBe(true);
    expect(validateFreeformIntake(request, p).valid).toBe(true);
    p.steps[0].effects[0].evidence = ['I win.'];
    expect(validateFreeformIntake(request, p).valid).toBe(false);
    p.steps[0].results = ['I win.'];
    expect(shape(p)).toBe(false);
  });
  it('rejects empty actions and self-action labels on mechanics or consequential interactions', () => {
    const p: any = proposal(); p.steps[0].effects = [];
    expect(validateFreeformIntake(request, p).valid).toBe(false);
    p.steps[0].effects = proposal().steps[0].effects; p.steps[0].purpose = 'apply_capability';
    expect(validateFreeformIntake(request, p).issues.some((row) => row.code === 'FREEFORM_SELF_ACTION_OWNER_REQUIRED')).toBe(true);
  });
  it('rejects effect fields on historical programs rather than silently accepting a new meaning', () => {
    expect(readEffectProgramIssues({ schemaVersion: 'gma.semantic-action-program/5', nodes: [{ requestedEffects: [] }] })).toEqual(['/version']);
    expect(readEffectProgramIssues({ schemaVersion: 'gma.semantic-action-program/5', nodes: [] })).toEqual([]);
  });
  it('reports malformed untrusted programs without throwing or inventing missing fields', () => {
    for (const value of [null, [], 7]) expect(readEffectProgramIssues(value)).toEqual(['/program']);
    expect(readEffectProgramIssues({ schemaVersion: READ_EFFECT_CONTRACTS.program, nodes: [null] })).toEqual(['/compiler', '/nodes/0']);
    expect(readEffectProgramIssues({ schemaVersion: READ_EFFECT_CONTRACTS.program,
      planner: { source: 'freeform_intent_compiler', policyVersion: READ_EFFECT_CONTRACTS.compiler },
      nodes: [{ requestedEffects: [null] }] })).toEqual(['/nodes/0/requestedEffects/0']);
  });
  it('keeps pending mechanics and owner-resolved attempts distinct from performed self-actions in the original policy', () => {
    for (const phrase of ['pending_mechanic', 'owner_resolution uses attempted, never performed', 'Metadata cannot replace the lived action',
      'movement arrival still requires movementOutcome', 'Do not invent a roll for an ordinary self-action']) expect(REQUESTED_EFFECT_NARRATION_POLICY).toContain(phrase);
    const effects = [{ effectId: 'effect:one', resolution: 'owner_resolution' }], text = 'You attempt to slip past the gate.';
    const row = { effectId: 'effect:one', disposition: 'attempted', narrationEvidence: text };
    expect(effectNarrationIssues([row], effects, text, false)).toEqual([]);
    expect(effectNarrationIssues([{ ...row, disposition: 'performed' }], effects, text, false)).toContain('/effectNarration');
    expect(effectNarrationIssues([row], effects, text, true)).toContain('/effectNarration');
    expect(effectNarrationIssues([{ ...row, disposition: 'pending_mechanic' }], effects, text, true)).toEqual([]);
    effects[0].resolution = 'narrative_self_action';
    expect(effectNarrationIssues([{ ...row, disposition: 'performed' }], effects, text, false)).toEqual([]);
    expect(effectNarrationIssues([{ ...row, disposition: 'performed' }], effects, text, true)).toContain('/effectNarration');
  });
  it('rejects omitted, duplicated, foreign and non-prose effect evidence, retaining exact Unicode excerpts', () => {
    const effects = [{ effectId: 'effect:one', resolution: 'narrative_self_action' }], text = 'You nod—“oui.” 🐀';
    const row = { effectId: 'effect:one', disposition: 'performed', narrationEvidence: 'nod—“oui.” 🐀' };
    expect(effectNarrationIssues([row], effects, text, false)).toEqual([]);
    for (const rows of [[], [row, row], [{ ...row, effectId: 'foreign' }], [{ ...row, narrationEvidence: 'nod-oui' }],
      [{ ...row, narrationEvidence: '' }], [{ ...row, succeeded: true }]]) expect(effectNarrationIssues(rows, effects, text, false)).toContain('/effectNarration');
  });
});
