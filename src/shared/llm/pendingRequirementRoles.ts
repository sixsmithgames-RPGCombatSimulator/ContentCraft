import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow, type PendingIntentWindowSource } from './pendingIntentWindow.js';
import { READ_EFFECT_CONTRACTS, readEffectProgramIssues, isReadEffectProgram } from './readEffectContracts.js';
import { isTypedReferenceProgram, TYPED_REFERENCE_AUTHORITY_BUNDLE } from './typedReferenceBindings.js';

type Row = Record<string, unknown>;
/** Owner-validated program projection with safely iterable node records. */
export interface PendingRoleProgram extends Record<string, unknown> { nodes: Row[] }
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => {
  if (!Array.isArray(value) || !value.every(object)) throw new Error('Pending role records must be complete objects.');
  return value;
};
const same = (left: unknown, right: unknown): boolean => canonicalFreeformJson(left) === canonicalFreeformJson(right);
const closed = (value: unknown, keys: string[]): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const id = (value: unknown): boolean => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);

/** Positive rules travel in the original build and independent review. */
export const PENDING_REQUIREMENT_ROLE_POLICY = [
  'This pending-only compatibility projection accepts only an original compact freeform_intent_compiler program /4 or /5 with compiler policy /12, or an explicit program /6 with compiler policy /13. An all-read partition cannot confer missing compiler provenance or upgrade another planner.',
  'Partition every exact original pending requirement once as read or effect; never classify a completed or skipped node. Copy requirementRef and one exact supplied instructionEvidence span. Preserve actor, method, target, order, conditions and exact deferred tail.',
  'A read is information or an existing structural prerequisite genuinely needed to adjudicate the action. An effect is a desired action/result still to be attempted, never an established fact. Do not prepare future gesture completion as information, promote prepared_possibility, delete a real question or filter an unsafe read.',
  'Only an ordinary unbound what/story_fact row in a historical compact program may become an effect. Identity, presence, objects, origin, destination, capability, resource, mechanic, time and typed observation requirements remain reads. Fresh /6 requirements already have explicit roles and remain reads; preserve their original requestedEffects separately.',
  'Every role row has exactly requirementRef, role, resolution and instructionEvidence. Reads have resolution null. Effects use owner_resolution, or narrative_self_action only for a nonconsequential self action with no travel, discovery, NPC response, resource, mechanics, permission or persistent state. Classification confers no permission or successful outcome.',
  'Independently review every role against the exact original instruction and owner context, not only hashes or the builder rationale. Cite each requirementRef, state supported or unsupported and why. Blocking classification debt cannot receive adequate. Use only the existing compact repair scope and operation budget.',
].join(' ');

const stringId = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const strict = <Properties extends Row>(properties: Properties): {
  type: 'object'; additionalProperties: false; required: string[]; properties: Properties;
} => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
/** Closed output schema; the owner validator additionally requires a full exact partition. */
export const PENDING_REQUIREMENT_ROLE_SCHEMA = strict({
  schemaVersion: { const: READ_EFFECT_CONTRACTS.classification }, classificationId: stringId,
  windowFingerprint: hash, programFingerprint: hash,
  nodes: { type: 'array', minItems: 1, maxItems: 8, items: strict({ nodeRef: stringId,
    roles: { type: 'array', maxItems: 32, items: strict({ requirementRef: stringId, role: { enum: ['read', 'effect'] },
      resolution: { enum: [null, 'narrative_self_action', 'owner_resolution'] },
      instructionEvidence: strict({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 },
        quote: { type: 'string', minLength: 1, maxLength: 32768 } }),
    }) },
  }) },
});

/** No English keyword classifier: the external interpretation supplies every
 * role, while deterministic checks preserve its exact pending-only boundary. */
export function pendingRequirementRoleIssues(value: unknown, source: PendingIntentWindowSource): string[] {
  try {
    const program = source.program;
    if (program.planner?.source !== 'freeform_intent_compiler'
      || !(isReadEffectProgram(program)
        ? program.planner.policyVersion === (isTypedReferenceProgram(program) ? TYPED_REFERENCE_AUTHORITY_BUNDLE.compiler : READ_EFFECT_CONTRACTS.compiler)
        : ['gma.semantic-action-program/4', 'gma.semantic-action-program/5'].includes(program.schemaVersion)
          && program.planner.policyVersion === 'gma.semantic-action-compiler-policy/12')) return ['/source/compiler'];
    const window = createPendingIntentWindow(source);
    if (!closed(value, ['schemaVersion', 'classificationId', 'windowFingerprint', 'programFingerprint', 'nodes'])
      || value.schemaVersion !== READ_EFFECT_CONTRACTS.classification || !id(value.classificationId)
      || value.windowFingerprint !== window.windowFingerprint || value.programFingerprint !== window.programFingerprint
      || !Array.isArray(value.nodes) || value.nodes.length !== window.nodes.length
      || new Set(rows(value.nodes).map((row) => row.nodeRef)).size !== window.nodes.length) return ['/identity'];
    const issues: string[] = [];
    for (const original of window.nodes) {
      const node = rows(value.nodes).find((row) => row.nodeRef === original.nodeRef), path = `/nodes/${original.nodeRef}`;
      if (!closed(node, ['nodeRef', 'roles']) || !Array.isArray(node.roles) || node.roles.length !== original.requirements.length
        || new Set(rows(node.roles).map((role) => role.requirementRef)).size !== original.requirements.length) { issues.push(path); continue; }
      for (const role of rows(node.roles)) {
        const requirement = original.requirements.find((row: Row) => row.requirementId === role?.requirementRef);
        if (!closed(role, ['requirementRef', 'role', 'resolution', 'instructionEvidence']) || !requirement
          || !['read', 'effect'].includes(String(role.role)) || !original.instructionEvidence.some((span: Row) => same(span, role.instructionEvidence))) {
          issues.push(`${path}/roles`); continue;
        }
        if (role.role === 'read' && role.resolution !== null) issues.push(`${path}/resolution`);
        if (role.role === 'effect') {
          const row = requirement.value;
          if (isReadEffectProgram(source.program) || source.program.planner?.source !== 'freeform_intent_compiler'
            || row.kind !== 'story_fact' || row.dimension !== 'what' || row.targetRef != null || row.targetRole != null || row.observation
            || !['owner_resolution', 'narrative_self_action'].includes(String(role.resolution))) issues.push(`${path}/effect`);
          if (role.resolution === 'narrative_self_action' && (!['interact', 'other'].includes(original.node.kind)
            || original.node.observationGroups?.length || original.node.observationPrerequisite
            || original.node.authorityRequirements.some((owner: string) => owner !== 'gmc')
            || original.requirements.some((entry: Row) => !object(entry.value)
              || ['character_capability', 'resource', 'mechanic', 'destination_location'].includes(String(entry.value.kind))))) issues.push(`${path}/resolution`);
        }
      }
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 24576) issues.push('/bytes');
    return [...new Set(issues)];
  } catch { return ['/source']; }
}

/** Pure projection only, for an owner-accepted record. Stored original nodes and
 * receipts remain immutable. Caller must validate the owner application first. */
export function projectPendingRequirementRoles(source: PendingIntentWindowSource, classification: Row, boundProgram: Row = source.program): PendingRoleProgram {
  if (pendingRequirementRoleIssues(classification, source).length) throw new Error('Pending requirement roles do not match the exact original window.');
  const window = createPendingIntentWindow(source), result = structuredClone(boundProgram);
  if (result.programId !== source.program.programId || result.instructionFingerprint !== source.instruction.instructionFingerprint
    || !Array.isArray(result.nodes) || !same(rows(result.nodes).map((node) => node.nodeId), source.program.nodes.map((node: Row) => node.nodeId))) throw new Error('Role projection cannot replace a program.');
  for (const classified of rows(classification.nodes)) {
    const original = window.nodes.find((node: Row) => node.nodeRef === classified.nodeRef)!;
    const node = rows(result.nodes).find((row) => row.nodeId === classified.nodeRef)!;
    Object.assign(node, projectClassifiedPendingNode(original, node, classified));
  }
  // New empty fields on completed projections are representation only; every
  // original completed field and every durable execution receipt stays exact.
  for (const node of rows(result.nodes)) node.requestedEffects ??= [];
  result.schemaVersion = isTypedReferenceProgram(source.program) ? TYPED_REFERENCE_AUTHORITY_BUNDLE.program : READ_EFFECT_CONTRACTS.program;
  result.planner = { source: 'freeform_intent_compiler', policyVersion: isTypedReferenceProgram(source.program) ? TYPED_REFERENCE_AUTHORITY_BUNDLE.compiler : READ_EFFECT_CONTRACTS.compiler };
  if (readEffectProgramIssues(result, source.instruction).length) throw new Error('Role projection violated the compiled effect boundary.');
  return { ...result, nodes: rows(result.nodes) };
}

/** Reusable exact-node witness after the enclosing owner record is validated. */
export function projectClassifiedPendingNode(original: Row, boundNode: Row, classified: Row): Row {
  const requirements = rows(original.requirements), roles = rows(classified.roles), dataRequirements = rows(boundNode.dataRequirements);
  if (classified.nodeRef !== original.nodeRef || boundNode.nodeId !== original.nodeRef
    || dataRequirements.length !== requirements.length || roles.length !== requirements.length
    || new Set(roles.map((role) => role.requirementRef)).size !== requirements.length) throw new Error('Role projection must follow original reference binding.');
  const node = structuredClone(boundNode);
  const effects = requirements.flatMap((requirement, index) => {
    const role = roles.find((row) => row.requirementRef === requirement.requirementId);
    if (!role || !['read', 'effect'].includes(String(role.role)) || !object(requirement.value)) throw new Error('Incomplete role projection.');
    return role.role === 'effect' ? [{ effectId: `${node.nodeId}:effect:${index + 1}`, attempt: requirement.value.query,
      resolution: role.resolution, evidenceSpans: [structuredClone(role.instructionEvidence)] }] : [];
  });
  node.dataRequirements = dataRequirements.filter((_row, index) => roles.find((role) => role.requirementRef === requirements[index].requirementId)!.role === 'read');
  node.requestedEffects = [...structuredClone(rows(node.requestedEffects ?? [])), ...effects];
  return node;
}

/** The role association lives inside the existing atomic pending-binding /4
 * receipt. Its enclosing receipt binds owner, program, heads and CAS revision;
 * there is no competing standalone writer or independently mutable collection. */
export function pendingRoleApplicationIssues(record: Row, receipt: Row): string[] {
  const value = receipt?.requirementRoleApplication;
  return ['gmc.scene-pending-intent-binding-record/4', TYPED_REFERENCE_AUTHORITY_BUNDLE.pendingRecord, 'gmc.scene-pending-intent-binding-record/6', 'gmc.scene-pending-intent-binding-record/7', 'gmc.scene-pending-intent-binding-record/8', 'gmc.scene-pending-intent-binding-record/9'].includes(String(record?.schemaVersion))
    && receipt?.schemaVersion === (record.schemaVersion === 'gmc.scene-pending-intent-binding-record/9' ? 'gma.action-intent-binding-receipt/9' : record.schemaVersion === 'gmc.scene-pending-intent-binding-record/8' ? 'gma.action-intent-binding-receipt/8' : record.schemaVersion === 'gmc.scene-pending-intent-binding-record/7' ? 'gma.action-intent-binding-receipt/7'
      : record.schemaVersion === 'gmc.scene-pending-intent-binding-record/6' ? 'gma.action-intent-binding-receipt/6'
      : record.schemaVersion === TYPED_REFERENCE_AUTHORITY_BUNDLE.pendingRecord ? TYPED_REFERENCE_AUTHORITY_BUNDLE.pendingReceipt : 'gma.action-intent-binding-receipt/4')
    && closed(value, ['schemaVersion', 'classificationFingerprint', 'assessmentFingerprint', 'recordFingerprint'])
    && value.schemaVersion === READ_EFFECT_CONTRACTS.application
    && object(record.bindings) && value.classificationFingerprint === freeformJsonDigest(record.bindings.requirementRoles)
    && value.assessmentFingerprint === record.assessmentFingerprint && value.recordFingerprint === record.recordFingerprint
    ? [] : ['/requirementRoleApplication'];
}
