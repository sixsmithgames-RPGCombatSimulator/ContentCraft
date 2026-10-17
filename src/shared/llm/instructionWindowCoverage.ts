import { freeformJsonDigest, freeformTextDigest, freeformPlanBindingIssues } from './freeformPlanBinding.js';

/** Owner-derived instruction hierarchy; never a model claim of completion. */
export interface InstructionWindowCoverage {
  schemaVersion: 'gmc.instruction-window-coverage/1'; coverageRef: string;
  campaignId: string; programRef: string; rootInstructionFingerprint: string;
  instructionFingerprint: string; bindingFingerprint: string;
  currentInstructionRange: { start: number; end: number };
  prefixRange: { start: number; end: number }; deferredTailRange: { start: number; end: number };
  deferredTailBytes: number; deferredTailFingerprint: string; rootCompletionPermitted: boolean;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw Object.assign(new Error('The protected instruction coverage could not be verified.'), { code: 'INSTRUCTION_WINDOW_COVERAGE_INVALID' }); }

/** Caller must first authenticate the protected workflow and its root/current
 * instruction references. Byte ranges refer to the already supplied root text. */
export function deriveInstructionWindowCoverage(root: Record<string, unknown>, instruction: Record<string, unknown>,
  binding: Record<string, unknown>, program: Record<string, unknown>): InstructionWindowCoverage {
  if (typeof root.exactText !== 'string' || root.instructionFingerprint !== freeformTextDigest(root.exactText)
    || typeof instruction.exactText !== 'string' || !root.exactText.endsWith(instruction.exactText)
    || Buffer.from(root.exactText, 'utf8').toString('utf8') !== root.exactText
    || Buffer.from(instruction.exactText, 'utf8').toString('utf8') !== instruction.exactText
    || freeformPlanBindingIssues(binding, instruction, program).length
    || !object(program.authorityBase) || typeof program.authorityBase.campaignId !== 'string'
    || typeof program.programId !== 'string') invalid();
  const rootBytes = Buffer.byteLength(root.exactText, 'utf8'), currentBytes = Buffer.byteLength(instruction.exactText, 'utf8');
  const start = rootBytes - currentBytes, prefixEnd = start + Number(binding.windowBytes);
  const tail = String(binding.suffixText);
  if (prefixEnd > rootBytes || prefixEnd < start || Buffer.byteLength(tail, 'utf8') !== rootBytes - prefixEnd) invalid();
  const body = { schemaVersion: 'gmc.instruction-window-coverage/1' as const,
    campaignId: program.authorityBase.campaignId, programRef: program.programId,
    rootInstructionFingerprint: String(root.instructionFingerprint), instructionFingerprint: String(instruction.instructionFingerprint),
    bindingFingerprint: freeformJsonDigest(binding), currentInstructionRange: { start, end: rootBytes },
    prefixRange: { start, end: prefixEnd }, deferredTailRange: { start: prefixEnd, end: rootBytes },
    deferredTailBytes: Buffer.byteLength(tail, 'utf8'), deferredTailFingerprint: freeformTextDigest(tail),
    rootCompletionPermitted: tail.length === 0 };
  return { ...body, coverageRef: `instruction-coverage:${freeformJsonDigest(body).slice(0, 40)}` };
}

/** Recompute the complete closed value so extra fields or byte drift fail. */
export function instructionWindowCoverageIssues(value: unknown, root: Record<string, unknown>, instruction: Record<string, unknown>,
  binding: Record<string, unknown>, program: Record<string, unknown>): string[] {
  try { return freeformJsonDigest(value) === freeformJsonDigest(deriveInstructionWindowCoverage(root, instruction, binding, program)) ? [] : ['/instructionCoverage']; }
  catch { return ['/instructionCoverage']; }
}

/** Prompt-side closure uses only compact provenance and the one exact supplied
 * instruction. Owner acceptance separately re-derives the protected binding. */
export function instructionCoverageContextIssues(value: InstructionWindowCoverage, instruction: Record<string, unknown>, program: Record<string, unknown>): string[] {
  try {
    const { coverageRef, ...body } = value;
    const keys = ['schemaVersion', 'campaignId', 'programRef', 'rootInstructionFingerprint', 'instructionFingerprint', 'bindingFingerprint',
      'currentInstructionRange', 'prefixRange', 'deferredTailRange', 'deferredTailBytes', 'deferredTailFingerprint', 'rootCompletionPermitted'];
    if (Object.keys(body).length !== keys.length || keys.some((key) => !Object.hasOwn(body, key))
      || body.schemaVersion !== 'gmc.instruction-window-coverage/1' || coverageRef !== `instruction-coverage:${freeformJsonDigest(body).slice(0, 40)}`
      || typeof instruction.exactText !== 'string' || !object(program.authorityBase)
      || body.campaignId !== program.authorityBase.campaignId || body.programRef !== program.programId
      || body.instructionFingerprint !== instruction.instructionFingerprint) invalid();
    for (const fingerprint of [body.rootInstructionFingerprint, body.instructionFingerprint, body.bindingFingerprint, body.deferredTailFingerprint]) {
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) invalid();
    }
    for (const range of [body.currentInstructionRange, body.prefixRange, body.deferredTailRange]) {
      if (Object.keys(range).sort().join(',') !== 'end,start' || !Number.isSafeInteger(range.start)
        || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start) invalid();
    }
    const encoded = Buffer.from(instruction.exactText, 'utf8'), offset = body.currentInstructionRange.start;
    const prefixBytes = body.prefixRange.end - offset;
    const prefix = encoded.subarray(0, prefixBytes).toString('utf8'), tail = encoded.subarray(prefixBytes).toString('utf8');
    if (body.currentInstructionRange.end - offset !== encoded.length || body.prefixRange.start !== offset || prefixBytes <= 0
      || body.deferredTailRange.start !== body.prefixRange.end || body.deferredTailRange.end !== body.currentInstructionRange.end
      || Buffer.byteLength(prefix, 'utf8') !== prefixBytes || Buffer.byteLength(tail, 'utf8') !== body.deferredTailBytes
      || body.deferredTailFingerprint !== freeformTextDigest(tail) || body.rootCompletionPermitted !== (tail.length === 0)
      || !Array.isArray(program.nodes) || program.nodes.some((node) => !object(node) || !Array.isArray(node.evidenceSpans)
        || node.evidenceSpans.some((span) => !object(span) || Number(span.end) > prefixBytes))) invalid();
    return [];
  } catch { return ['/instructionCoverage']; }
}
