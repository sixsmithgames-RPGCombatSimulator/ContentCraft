import { describe, expect, it } from 'vitest';
import { classifyCanonProposal } from './canonClaimClassifier.js';

const claim = {
  id: 'fact-1',
  revision: 'fact-r1',
  recordType: 'FACT',
  summary: 'The gate is closed.',
  identity: 'gate state',
};

describe('canon proposal classification', () => {
  it('classifies exact meaning as aligned and new meaning as an addition', () => {
    expect(classifyCanonProposal({
      expectedCanonRevision: 'canon-r1',
      currentCanonRevision: 'canon-r1',
      proposal: { changeType: 'create', recordType: 'FACT', summary: claim.summary, identity: claim.identity },
      claims: [claim],
    }).classification).toBe('aligned');
    expect(classifyCanonProposal({
      expectedCanonRevision: 'canon-r1',
      currentCanonRevision: 'canon-r1',
      proposal: { changeType: 'create', recordType: 'FACT', summary: 'A bell rings.', identity: 'bell state' },
      claims: [claim],
    }).classification).toBe('addition');
  });

  it('requires review for ambiguous duplicate identities and conflicts with locked canon', () => {
    const ambiguous = classifyCanonProposal({
      expectedCanonRevision: 'canon-r1',
      currentCanonRevision: 'canon-r1',
      proposal: { changeType: 'create', recordType: 'FACT', summary: 'Different', identity: claim.identity },
      claims: [claim, { ...claim, id: 'fact-2' }],
    });
    expect(ambiguous.classification).toBe('ambiguous');

    const conflict = classifyCanonProposal({
      expectedCanonRevision: 'canon-r1',
      currentCanonRevision: 'canon-r1',
      proposal: { changeType: 'update', targetId: claim.id, recordType: 'FACT', summary: 'The gate is open.', identity: claim.identity },
      claims: [{ ...claim, locked: true }],
    });
    expect(conflict.classification).toBe('conflicting');
    expect(conflict.commitAllowed).toBe(false);
  });

  it('rejects a stale canon revision before classification', () => {
    expect(() => classifyCanonProposal({
      expectedCanonRevision: 'canon-r0',
      currentCanonRevision: 'canon-r1',
      proposal: { changeType: 'create', recordType: 'FACT', summary: 'A bell rings.' },
      claims: [],
    })).toThrow(/canon changed/i);
  });
});
