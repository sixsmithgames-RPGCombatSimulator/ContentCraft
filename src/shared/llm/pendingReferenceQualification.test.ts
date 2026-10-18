import { describe, expect, it } from 'vitest';
import { derivePendingReferenceQualification, pendingReferenceQualificationIssues } from './pendingReferenceQualification.js';
import { createProgramReferenceLedger, programReferenceLedgerIssues } from './typedReferenceBindings.js';
import { freeformJsonDigest } from './freeformPlanBinding.js';
import { typedReferenceFixture } from './fixtures/typedReferences.js';

describe('accepted ADR 025 source-qualified symbols and effect roles', () => {
  it('keeps null symbols distinct from resolved owner references and independently reconstructs their catalog proof', () => {
    const f = typedReferenceFixture(), ledger = createProgramReferenceLedger(f.proposal, f.catalog, 1);
    expect(programReferenceLedgerIssues(ledger)).toEqual([]);
    expect(ledger.rows[2].binding).toEqual({ kind: 'unresolved' });
    expect(ledger.rows[4].binding).toEqual({ kind: 'resolved', owner: 'gmc', ref: 'element:lip', revision: 1 });
    const bad = structuredClone(ledger); bad.rows[2].binding.ref = 'element:drain';
    expect(programReferenceLedgerIssues(bad).length).toBeGreaterThan(0);
  });
  it('proves both mistaken observation fields without changing the program, instruction, slots or receipts', () => {
    const f = typedReferenceFixture(), before = structuredClone(f);
    const q = derivePendingReferenceQualification(f.artifact, 1, f.ticket);
    expect(q.fields.map((row: any) => row.field)).toEqual(['targetRef', 'relationOriginRef']);
    expect(q.fields.every((row: any) => row.symbolRef === 'freeform:referent:2' && row.binding === 'unresolved')).toBe(true);
    expect(pendingReferenceQualificationIssues(q, f.source)).toEqual([]);
    expect(f).toEqual(before);
  });
  it('preserves the crossed area and destination as separate exact effect participation, not one convenient endpoint', () => {
    const f = typedReferenceFixture(), q = derivePendingReferenceQualification(f.artifact, 1, f.ticket);
    expect(q.effects).toHaveLength(1);
    expect(q.effects[0].targets.map((row: any) => row.role)).toEqual(['area', 'destination']);
    expect(new Set(q.effects[0].targets.map((row: any) => row.targetSlotId)).size).toBe(2);
  });
  for (const change of ['ticket', 'proposal', 'request', 'catalog', 'real_ref', 'outcome_index', 'multiple_effects']) {
    it(`rejects ${change} rather than inferring authority from a local-looking name`, () => {
      const f = typedReferenceFixture();
      if (change === 'ticket') f.ticket._id = 'ticket:foreign';
      if (change === 'proposal') f.proposal.referents[2].catalogKey = 'slick_lip';
      if (change === 'request') f.ticket.request.context.input.value.instruction = 'Different instruction.';
      if (change === 'catalog') f.catalog[1].ref = 'element:other';
      if (change === 'real_ref') f.artifact.program.nodes[1].dataRequirements[0].observation.targetRef = 'element:actual';
      if (change === 'outcome_index') f.artifact.program.nodes[1].dataRequirements[0].observation.sourceIndex = 1;
      if (change === 'multiple_effects') {
        f.proposal.steps[0].effects.push({ ...f.proposal.steps[0].effects[0] });
        f.ticket.outputDigest = f.artifact.freeformBinding.proposalDigest = freeformJsonDigest(f.proposal);
      }
      expect(() => derivePendingReferenceQualification(f.artifact, 1, f.ticket)).toThrow('PENDING_REFERENCE_QUALIFICATION_INVALID');
    });
  }
  it('rejects a self-rehashed foreign slot/field proof as well as raw fingerprint tampering', () => {
    const f = typedReferenceFixture(), q = derivePendingReferenceQualification(f.artifact, 1, f.ticket);
    for (const field of ['slotId', 'requirementRef', 'outcomeRef', 'originalRef', 'field']) {
      const bad = structuredClone(q); bad.fields[0][field] = 'foreign';
      const { qualificationRef: _ref, fingerprint: _fp, ...body } = bad;
      bad.fingerprint = freeformJsonDigest(body); bad.qualificationRef = `pending-reference:${bad.fingerprint.slice(0, 40)}`;
      expect(pendingReferenceQualificationIssues(bad, f.source)).toEqual(['/pendingReferenceQualification']);
    }
    q.fingerprint = 'a'.repeat(64);
    expect(pendingReferenceQualificationIssues(q, f.source)).toEqual(['/pendingReferenceQualification']);
  });
});
