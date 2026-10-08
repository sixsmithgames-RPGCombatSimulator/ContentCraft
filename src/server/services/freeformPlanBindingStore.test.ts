import { describe, expect, it } from 'vitest';
import { freeformJsonDigest, freeformPlanBindingIssues, freeformTextDigest } from '../../shared/llm/freeformPlanBinding.js';
import { validateFreeformBinding, verifyFreeformBindingAcceptance } from './freeformPlanBindingStore.js';
import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';

function fixture() {
  const instruction: any = { instructionRef: 'instruction:fictional', interactionId: 'fictional', exactText: 'I wave.  Then I wait.\r\n',
    instructionFingerprint: freeformTextDigest('I wave.  Then I wait.\r\n') };
  const authorityBase = { campaignId: 'fictional-campaign', storyWorkspaceRevision: 7, sceneRevision: 4, vcsCharacterRevision: 12 };
  const program: any = { authorityBase, planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/12' },
    nodes: [{ nodeId: 'freeform:step:0', dataRequirements: [], evidenceSpans: [{ start: 0, end: 7 }] }] };
  const proposal = { ticket: 'fictional-ticket', windowText: 'I wave.', steps: [{}], clarification: null };
  const request: any = { context: { input: { value: { instruction: instruction.exactText, mode: 'action' } } } };
  const binding: any = { schemaVersion: 'gma.freeform-plan-binding/1', instructionRef: instruction.instructionRef,
    interactionId: instruction.interactionId, instructionFingerprint: instruction.instructionFingerprint,
    windowId: `window:${freeformTextDigest(proposal.windowText)}`, windowBytes: 7,
    suffixText: '  Then I wait.\r\n', continuationFingerprint: freeformTextDigest('  Then I wait.\r\n'),
    policyVersion: 'gma.freeform-intake-policy/1', registryVersion: '2026-10-07.2',
    proposalDigest: freeformJsonDigest(proposal), requestDigest: freeformJsonDigest(request), ticket: proposal.ticket,
    ticketDisposition: 'owner_accepted', authorityBase, sourceReferences: [], compiledStepIds: ['freeform:step:0'],
    operationRequirements: [{ nodeRef: 'freeform:step:0', requirements: [] }] };
  const ticket: any = { _id: proposal.ticket, userId: 'fictional-user', campaignId: authorityBase.campaignId,
    status: 'accepted', transport: 'manual', expiresAt: new Date('2099-01-01'), interactionId: instruction.interactionId,
    instructionFingerprint: instruction.instructionFingerprint, policyVersion: binding.policyVersion, registryVersion: binding.registryVersion,
    request, requestDigest: binding.requestDigest, outputDigest: binding.proposalDigest, selectedActorRef: null,
    response: { status: 'succeeded', output: proposal, route: { provider: 'manual' } } };
  const staged: any = { instruction, originCheckpoint: { storyWorkspaceRef: { revision: 7 } } };
  const records = { findOne: async (filter: any) => Object.entries(filter).every(([key, value]) => ticket[key] === value) ? ticket : null } as unknown as FreeformTicketCollection;
  return { instruction, program, binding, ticket, records,
    input: { userId: ticket.userId, campaignId: authorityBase.campaignId, binding, instruction, program, staged } };
}
describe('closed owner-accepted freeform plan provenance', () => {
  it('shares the existing canonical JSON digest without changing exact text hashing', () => {
    expect(freeformJsonDigest({ a: 1, b: 2 })).toBe(freeformJsonDigest({ b: 2, a: 1 }));
    expect(freeformTextDigest(' I wait.\r\n')).not.toBe(freeformTextDigest('I wait.\n'));
  });
  it('validates exact initial provenance against a protected accepted Manual ticket', async () => {
    const f = fixture();
    expect(freeformPlanBindingIssues(f.binding, f.instruction, f.program, true)).toEqual([]);
    validateFreeformBinding(f.binding, f.instruction, f.program);
    await expect(verifyFreeformBindingAcceptance(f.input, f.records)).resolves.toBeUndefined();
  });
  it.each(['extra', 'missing', 'local', 'suffix', 'fingerprint', 'window', 'step', 'requirements', 'authority', 'compiler', 'oversize'])('rejects changed metadata: %s', (variant) => {
    const f = fixture();
    if (variant === 'extra') f.binding.review = {};
    if (variant === 'missing') delete f.binding.requestDigest;
    if (variant === 'local') f.binding.ticketDisposition = 'locally_validated_not_owner_accepted';
    if (variant === 'suffix') f.binding.suffixText = f.binding.suffixText.trim();
    if (variant === 'fingerprint') f.binding.continuationFingerprint = 'a'.repeat(64);
    if (variant === 'window') f.binding.windowBytes++;
    if (variant === 'step') f.binding.compiledStepIds[0] = 'another:step';
    if (variant === 'requirements') f.binding.operationRequirements[0].requirements = [{ query: 'invented' }];
    if (variant === 'authority') f.binding.authorityBase = { ...f.binding.authorityBase, storyWorkspaceRevision: 8 };
    if (variant === 'compiler') f.program.planner.policyVersion = 'gma.semantic-action-compiler-policy/11';
    if (variant === 'oversize') f.binding.operationRequirements[0].requirements = [{ query: 'x'.repeat(65_536) }];
    expect(() => validateFreeformBinding(f.binding, f.instruction, f.program)).toThrow();
  });
  it('retains immutable original authority provenance while a valid rebase changes the current head', () => {
    const f = fixture(); f.program.authorityBase = { ...f.program.authorityBase, storyWorkspaceRevision: 8 };
    expect(freeformPlanBindingIssues(f.binding, f.instruction, f.program)).toEqual([]);
    expect(freeformPlanBindingIssues(f.binding, f.instruction, f.program, true)).toContain('/authorityBase');
  });
  it('retains the exact owner-selected actor without matching a prose name', async () => {
    const f = fixture();
    f.ticket.selectedActorRef = 'gmc:actor:fictional-rin';
    f.ticket.request.context.input.value.selectedActorRef = f.ticket.selectedActorRef;
    f.ticket.request.context.input.value.catalog = [{ key: 'selected_actor', kind: 'actor' }];
    f.ticket.requestDigest = f.binding.requestDigest = freeformJsonDigest(f.ticket.request);
    f.binding.sourceReferences = [{ key: 'selected_actor', kind: 'actor', ref: f.ticket.selectedActorRef }];
    await expect(verifyFreeformBindingAcceptance(f.input, f.records)).resolves.toBeUndefined();
    f.binding.sourceReferences[0].ref = 'gmc:actor:another-rin';
    await expect(verifyFreeformBindingAcceptance(f.input, f.records)).rejects.toMatchObject({ code: 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH' });
  });
  it.each(['active', 'running', 'retired', 'expired', 'user', 'campaign', 'integrated', 'output', 'request', 'instruction', 'sources', 'clarification', 'prefix', 'no-origin'])('fails closed before a new save: %s', async (variant) => {
    const f = fixture();
    if (['active', 'running', 'retired'].includes(variant)) f.ticket.status = variant;
    if (variant === 'expired') f.ticket.expiresAt = new Date(0);
    if (variant === 'user') f.input.userId = 'another-user';
    if (variant === 'campaign') f.input.campaignId = 'another-campaign';
    if (variant === 'integrated') f.ticket.transport = 'integrated';
    if (variant === 'output') f.binding.proposalDigest = 'a'.repeat(64);
    if (variant === 'request') f.binding.requestDigest = 'a'.repeat(64);
    if (variant === 'instruction') f.ticket.instructionFingerprint = 'a'.repeat(64);
    if (variant === 'sources') f.binding.sourceReferences = [{ key: 'selected_actor', kind: 'actor', ref: 'invented:actor' }];
    if (variant === 'clarification') { f.ticket.response.output.clarification = 'Which object?'; f.ticket.outputDigest = f.binding.proposalDigest = freeformJsonDigest(f.ticket.response.output); }
    if (variant === 'prefix') { f.ticket.response.output.windowText = 'I wave'; f.ticket.outputDigest = f.binding.proposalDigest = freeformJsonDigest(f.ticket.response.output); }
    if (variant === 'no-origin') f.input.staged.originCheckpoint = undefined;
    await expect(verifyFreeformBindingAcceptance(f.input, f.records)).rejects.toMatchObject({ code: 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH' });
  });
});
