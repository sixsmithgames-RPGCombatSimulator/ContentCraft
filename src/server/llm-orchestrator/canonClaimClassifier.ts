import { createHash } from 'node:crypto';
import { OrchestratorError } from './errors.js';

export type CanonClaimClassification = 'aligned' | 'addition' | 'ambiguous' | 'conflicting';

type CanonClaim = {
  id: string;
  revision: string;
  recordType: string;
  summary: string;
  identity?: string;
  locked?: boolean;
};

type CanonProposal = {
  changeType: 'create' | 'update';
  recordType: string;
  summary: string;
  targetId?: string | null;
  identity?: string | null;
};

function normalized(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function identityKey(value: { recordType?: string; identity?: string | null; summary?: string }) {
  return `${normalized(value.recordType)}\0${normalized(value.identity || value.summary)}`;
}

export function classifyCanonProposal(input: {
  expectedCanonRevision: string;
  currentCanonRevision: string;
  proposal: CanonProposal;
  claims: CanonClaim[];
}) {
  if (!input.expectedCanonRevision || input.expectedCanonRevision !== input.currentCanonRevision) {
    throw new OrchestratorError({
      code: 'STALE_CANON_REVISION',
      category: 'context',
      message: 'Canon changed after this proposal was prepared.',
      status: 409,
      source: 'gmc.canon-classifier',
    });
  }
  const proposal = input.proposal;
  const targetMatches = proposal.targetId
    ? input.claims.filter((claim) => claim.id === proposal.targetId)
    : [];
  const identityMatches = input.claims.filter((claim) => identityKey(claim) === identityKey(proposal));
  const candidates = [...new Map([...targetMatches, ...identityMatches].map((claim) => [claim.id, claim])).values()];

  let classification: CanonClaimClassification;
  let reason: string;
  if (proposal.changeType === 'update' && !proposal.targetId) {
    classification = 'ambiguous';
    reason = 'An update requires one explicit canonical target.';
  } else if (candidates.length > 1) {
    classification = 'ambiguous';
    reason = 'Multiple canonical records match the proposed identity.';
  } else if (!candidates.length) {
    classification = proposal.changeType === 'create' ? 'addition' : 'conflicting';
    reason = proposal.changeType === 'create'
      ? 'No canonical record currently owns this identity.'
      : 'The requested update target does not exist.';
  } else if (normalized(candidates[0].summary) === normalized(proposal.summary)) {
    classification = 'aligned';
    reason = 'The proposal already matches canonical meaning.';
  } else if (candidates[0].locked) {
    classification = 'conflicting';
    reason = 'The proposal changes a locked canonical claim.';
  } else {
    classification = 'ambiguous';
    reason = 'The identity matches canon but the proposed meaning differs and requires an explicit update decision.';
  }

  const evidence = candidates.map((claim) => ({
    id: claim.id,
    revision: claim.revision,
    recordType: claim.recordType,
    summary: claim.summary,
    locked: Boolean(claim.locked),
  }));
  const classificationRevision = createHash('sha256')
    .update(JSON.stringify({
      canonRevision: input.currentCanonRevision,
      proposal,
      evidence,
      classification,
    }))
    .digest('hex');
  return {
    schemaVersion: 'gma-gmc.canon-classification/1',
    classification,
    reason,
    canonRevision: input.currentCanonRevision,
    classificationRevision,
    candidates: evidence,
    reviewRequired: classification === 'ambiguous' || classification === 'conflicting',
    commitAllowed: classification === 'addition',
  };
}
