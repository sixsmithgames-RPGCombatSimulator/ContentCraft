import type { FreeformTicketCollection } from '../llm-orchestrator/freeformTickets.js';
import { readAcceptedFreeformProgramWorkflow, type FreeformProgramWorkflowReader } from './freeformWorkflowAuthority.js';
import { readStagedCompoundActionInstruction } from './compoundActionArtifactStore.js';
import { deriveInstructionWindowCoverage, type InstructionWindowCoverage } from '../../shared/llm/instructionWindowCoverage.js';
import { StoryWorkspaceStoreError, type JsonObject } from './storyWorkspaceStore.js';

/** Dependency injection keeps the actual owner checks usable in isolated proof. */
export interface InstructionCoverageDependencies {
  tickets?: FreeformTicketCollection; reader?: FreeformProgramWorkflowReader;
  readInstruction?: typeof readStagedCompoundActionInstruction;
}
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new StoryWorkspaceStoreError(409, 'INSTRUCTION_WINDOW_COVERAGE_INVALID', 'The original instruction and its remaining actions could not be confirmed.', {}); }

/** Reads durable accepted window membership and its immutable root. No browser
 * ranges or ticket expiry can authorize or truncate a remaining instruction. */
export async function readInstructionWindowCoverage(scope: { userId: string; campaignId: string; programId: string },
  artifact: JsonObject, deps: InstructionCoverageDependencies = {}): Promise<{ instructionCoverage: InstructionWindowCoverage; rootInstruction: JsonObject }> {
  const binding = artifact.freeformBinding;
  if (!object(binding) || !object(artifact.instruction) || !object(artifact.program)) invalid();
  if (binding.interactionId !== artifact.instruction.interactionId || binding.instructionFingerprint !== artifact.instruction.instructionFingerprint) invalid();
  const document = await readAcceptedFreeformProgramWorkflow(scope, binding, deps);
  if (!document || artifact.program.programId !== scope.programId) invalid();
  const active = document.turn.windows.find((row) => row.windowId === document.turn.activeWindowRef);
  if (active?.instructionRef !== artifact.instruction.instructionRef || active.programRef !== scope.programId) invalid();
  const rootRef = String(document.turn.rootInstructionRef);
  const staged = await (deps.readInstruction ?? readStagedCompoundActionInstruction)({ userId: scope.userId,
    campaignId: scope.campaignId, interactionId: rootRef.replace(/^gma:instruction:/, '') });
  if (!staged || staged.instruction.instructionRef !== rootRef) invalid();
  return { instructionCoverage: deriveInstructionWindowCoverage(staged.instruction, artifact.instruction, binding, artifact.program),
    rootInstruction: structuredClone(staged.instruction) };
}
