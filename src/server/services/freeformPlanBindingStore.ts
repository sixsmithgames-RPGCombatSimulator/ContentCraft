import { getDb } from '../config/mongo.js';
import type { FreeformTicketCollection, FreeformTicketRecord } from '../llm-orchestrator/freeformTickets.js';
import { freeformJsonDigest, freeformPlanBindingIssues } from '../../shared/llm/freeformPlanBinding.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';
import type { CompoundActionInstructionDocument } from './compoundActionArtifactStore.js';
import { readCurrentSceneContexts } from './actionDirectedStoryStore.js';
import { assertFreeformCatalogCurrent } from '../llm-orchestrator/freeformSceneCatalog.js';
import { assertFreeformWorkflowOpen, type FreeformWorkflowReader } from './freeformWorkflowAuthority.js';
import { READ_EFFECT_CONTRACTS } from '../../shared/llm/readEffectContracts.js';

export function validateFreeformBinding(binding: JsonObject, instruction: JsonObject, program: JsonObject) {
  const issues = freeformPlanBindingIssues(binding, instruction, program, true);
  if (issues.length) throw new StoryWorkspaceStoreError(422, 'FREEFORM_PLAN_BINDING_INVALID', 'The intake provenance does not match the initial program.', { issues });
}

/** Only the owner can upgrade locally checked interpretation to durable
 * accepted provenance. No provider, campaign mutation or text/name matching. */
export async function verifyFreeformBindingAcceptance(input: {
  userId: string; campaignId: string; binding: JsonObject; instruction: JsonObject; program: JsonObject;
  staged: CompoundActionInstructionDocument | null;
}, tickets: FreeformTicketCollection = getDb().collection<FreeformTicketRecord>('llm_freeform_tickets'), now = new Date(), readSceneContext = readCurrentSceneContexts, workflowReader?: FreeformWorkflowReader) {
  const { binding, instruction, program, staged } = input;
  const ticket = await tickets.findOne({ _id: String(binding.ticket), userId: input.userId, campaignId: input.campaignId });
  const proposal = ticket?.response?.output as JsonObject | undefined;
  const requestInput = ticket?.request.context.input?.value as JsonObject | undefined;
  const expectedSources = ticket?.catalogContextRef ? ticket.catalogBindings
    : ticket?.selectedActorRef ? [{ key: 'selected_actor', kind: 'actor', ref: ticket.selectedActorRef }] : [];
  if (!staged?.originCheckpoint || freeformJsonDigest(staged.instruction) !== freeformJsonDigest(instruction)
    || (binding.authorityBase as JsonObject).campaignId !== input.campaignId
    || staged.originCheckpoint.storyWorkspaceRef.revision !== (binding.authorityBase as JsonObject).storyWorkspaceRevision
    || !ticket || ticket.status !== 'accepted' || ticket.transport !== 'manual' || ticket.expiresAt <= now
    || ticket.interactionId !== instruction.interactionId || ticket.instructionFingerprint !== instruction.instructionFingerprint
    || ticket.policyVersion !== binding.policyVersion || ticket.registryVersion !== binding.registryVersion
    || ticket.requestDigest !== binding.requestDigest || ticket.requestDigest !== freeformJsonDigest(ticket.request)
    || ticket.outputDigest !== binding.proposalDigest || !proposal || ticket.outputDigest !== freeformJsonDigest(proposal)
    || ticket.response?.status !== 'succeeded' || ticket.response.route.provider !== 'manual'
    || requestInput?.instruction !== instruction.exactText || requestInput?.mode !== 'action'
    || proposal.ticket !== binding.ticket || proposal.clarification !== null
    || proposal.windowText !== String(instruction.exactText).slice(0, String(instruction.exactText).length - String(binding.suffixText).length)
    || !Array.isArray(proposal.steps) || proposal.steps.length !== (binding.compiledStepIds as JsonObject[]).length
    || freeformJsonDigest(expectedSources) !== freeformJsonDigest(binding.sourceReferences)
    || (program.nodes as JsonObject[]).some((node) => (node.evidenceSpans as JsonObject[]).some((span) => Number(span.end) > Number(binding.windowBytes)))) {
    throw new StoryWorkspaceStoreError(409, 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH', 'The plan is not bound to an accepted owned Manual interpretation and instruction origin.', {});
  }
  if (freeformJsonDigest(binding.compiledStepIds) !== freeformJsonDigest(proposal.steps.map((_, index) => `freeform:step:${index}`))) {
    throw new StoryWorkspaceStoreError(409, 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH', 'The compiled step identities do not match the accepted window.', {});
  }
  if (binding.schemaVersion === READ_EFFECT_CONTRACTS.binding) {
    const steps = proposal.steps as JsonObject[];
    const nodes = program.nodes as JsonObject[];
    if (proposal.schemaVersion !== READ_EFFECT_CONTRACTS.proposal || steps.some((step, index) => {
      if (!Array.isArray(step.effects)) return true;
      const expected = (step.effects as JsonObject[]).map((effect, i) => ({
        effectId: `freeform:step:${index}:effect:${i + 1}`, attempt: effect.attempt, resolution: effect.resolution,
        evidenceSpans: (effect.evidence as string[]).map((quote) => {
          const offset = String(instruction.exactText).indexOf(quote);
          const start = Buffer.byteLength(String(instruction.exactText).slice(0, offset), 'utf8');
          return { start, end: start + Buffer.byteLength(quote, 'utf8'), quote };
        }),
      }));
      return freeformJsonDigest(expected) !== freeformJsonDigest(nodes[index].requestedEffects);
    })) throw new StoryWorkspaceStoreError(409, 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH', 'The requested effects do not match the accepted interpretation.', {});
  }
  if (ticket.catalogContextRef) {
    if (!expectedSources || freeformJsonDigest(staged.originCheckpoint?.storyWorkspaceRef) !== freeformJsonDigest(ticket.catalogContextRef.storyWorkspaceRef)
      || Number((binding.authorityBase as JsonObject).sceneRevision) !== Number(ticket.catalogContextRef.sceneKitRef.revision)) {
      throw new StoryWorkspaceStoreError(409, 'FREEFORM_PLAN_ACCEPTANCE_MISMATCH', 'The plan does not retain the issued Scene identity.', {});
    }
    assertFreeformCatalogCurrent(ticket.catalogContextRef, await readSceneContext(input));
  }
  await assertFreeformWorkflowOpen(ticket, workflowReader);
}
