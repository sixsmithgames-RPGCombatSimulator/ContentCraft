import { createHash } from 'node:crypto';

export const FREEFORM_PLAN_BINDING_VERSION = 'gma.freeform-plan-binding/1';
export const FREEFORM_PLAN_BINDING_MAXIMUM_BYTES = 65_536;
export function canonicalFreeformJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFreeformJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, nested]) => nested !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalFreeformJson(nested)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const freeformJsonDigest = (value: unknown): string => createHash('sha256').update(canonicalFreeformJson(value)).digest('hex');
export const freeformTextDigest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = (value: unknown, keys: string[]) => object(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (left: unknown, right: unknown) => canonicalFreeformJson(left) === canonicalFreeformJson(right);

/** Application metadata, not LLM output. Initial creation additionally checks
 * the protected ticket at GMC. Later reads retain original provenance across
 * owner-authorized program rebases; they never revive an expired ticket. */
export function freeformPlanBindingIssues(value: unknown, instruction: Record<string, any>, program: Record<string, any>, initial = false): string[] {
  const keys = ['schemaVersion', 'instructionRef', 'interactionId', 'instructionFingerprint', 'windowId', 'windowBytes',
    'suffixText', 'continuationFingerprint', 'policyVersion', 'registryVersion', 'proposalDigest', 'requestDigest',
    'ticket', 'ticketDisposition', 'authorityBase', 'sourceReferences', 'compiledStepIds', 'operationRequirements'];
  if (!closed(value, keys)) return ['/'];
  const binding = value as Record<string, any>;
  const issues: string[] = [];
  if (binding.schemaVersion !== FREEFORM_PLAN_BINDING_VERSION || binding.ticketDisposition !== 'owner_accepted'
    || binding.policyVersion !== 'gma.freeform-intake-policy/1' || binding.registryVersion !== '2026-10-07.2'
    || typeof binding.ticket !== 'string' || !binding.ticket.length || binding.ticket.length > 80
    || !hash(binding.proposalDigest) || !hash(binding.requestDigest)) issues.push('/ticket');
  if (['instructionRef', 'interactionId', 'instructionFingerprint'].some((key) => binding[key] !== instruction[key])) issues.push('/instruction');
  if (typeof binding.suffixText !== 'string' || !instruction.exactText.endsWith(binding.suffixText)) issues.push('/suffixText');
  else {
    const prefix = instruction.exactText.slice(0, instruction.exactText.length - binding.suffixText.length);
    if (!prefix || binding.windowId !== `window:${freeformTextDigest(prefix)}`
      || binding.windowBytes !== Buffer.byteLength(prefix, 'utf8')
      || binding.continuationFingerprint !== freeformTextDigest(binding.suffixText)) issues.push('/window');
  }
  if (!closed(binding.authorityBase, ['campaignId', 'storyWorkspaceRevision', 'sceneRevision', 'vcsCharacterRevision'])
    || !id(binding.authorityBase?.campaignId)
    || ['storyWorkspaceRevision', 'sceneRevision', 'vcsCharacterRevision'].some((key) => !Number.isSafeInteger(binding.authorityBase?.[key]) || binding.authorityBase[key] < 0)
    || binding.authorityBase?.campaignId !== program.authorityBase?.campaignId
    || initial && !same(binding.authorityBase, program.authorityBase)) issues.push('/authorityBase');
  if (!Array.isArray(binding.sourceReferences) || binding.sourceReferences.length > 32
    || binding.sourceReferences.some((row: unknown) => !closed(row, ['key', 'kind', 'ref'])
      || !id((row as any).ref) || typeof (row as any).key !== 'string'
      || !['actor', 'subject', 'place', 'object', 'form', 'method'].includes((row as any).kind))) issues.push('/sourceReferences');
  if (!Array.isArray(binding.compiledStepIds) || binding.compiledStepIds.length < 1 || binding.compiledStepIds.length > 8
    || binding.compiledStepIds.some((ref: unknown) => !id(ref))
    || !same(binding.compiledStepIds, program.nodes?.map((node: any) => node.nodeId))) issues.push('/compiledStepIds');
  if (!Array.isArray(binding.operationRequirements) || binding.operationRequirements.length !== binding.compiledStepIds?.length
    || binding.operationRequirements.some((row: any, index: number) => !closed(row, ['nodeRef', 'requirements'])
      || row.nodeRef !== binding.compiledStepIds[index] || !Array.isArray(row.requirements) || row.requirements.length > 32)
    || initial && !same(binding.operationRequirements, program.nodes?.map((node: any) => ({ nodeRef: node.nodeId, requirements: node.dataRequirements })))) issues.push('/operationRequirements');
  if (program.planner?.source !== 'freeform_intent_compiler' || program.planner?.policyVersion !== 'gma.semantic-action-compiler-policy/12') issues.push('/compiler');
  if (Buffer.byteLength(JSON.stringify(binding), 'utf8') > FREEFORM_PLAN_BINDING_MAXIMUM_BYTES) issues.push('/bytes');
  return issues;
}
