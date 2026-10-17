import { freeformJsonDigest } from './freeformPlanBinding.js';
import { projectAppliedIntentBindings } from './scenePendingIntentApplication.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(object) : [];
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
function invalid(field: string): never { throw Object.assign(new Error('The exact movement result could not be established.'), {
  code: 'SCENE_MOVEMENT_OUTCOME_INVALID', details: { field } }); }

/** Application-issued identity and destination, not a prediction of arrival. */
export interface SceneMovementExpectation {
  schemaVersion: 'gmc.scene-movement-expectation/1'; expectationRef: string;
  campaignId: string; programRef: string; nodeRef: string; bindingRecordRef: string; bindingRecordFingerprint: string;
  moverRef: string; destinationRef: string; destinationZoneRef: string;
}
/** Proposed semantics are unusable for sensing until GMC confirms the event. */
export interface SceneMovementOutcomeProposal {
  schemaVersion: 'gma.scene-movement-outcome-proposal/1'; expectationRef: string;
  campaignId: string; programRef: string; nodeRef: string; bindingRecordRef: string;
  moverRef: string; destinationRef: string; destinationZoneRef: string;
  result: 'reached' | 'not_reached'; narrationEvidence: string;
}
/** The same positive rule travels with the first narration and compact repair. */
export const SCENE_MOVEMENT_OUTCOME_POLICY = `When movementExpectation is supplied, return an explicit movementOutcome under gma.scene-movement-outcome-proposal/1. Copy its exact expectationRef, campaignId, programRef, nodeRef, bindingRecordRef, moverRef, destinationRef and destinationZoneRef. Choose reached only when the named mover actually reaches that exact destination zone in this turn; reaching a different threshold or merely attempting movement is not arrival. Choose not_reached when the attempt ends without reaching it. Quote the concrete lived arrival or failed-arrival result exactly from responseText in narrationEvidence. The prose must state that same result; structured metadata does not replace it. Do not resolve observation, invent a move, change another actor's position, ignore a required check, or declare success from prepared possibilities. With a pending mechanic return movementOutcome null until its authoritative result exists. With no movementExpectation return movementOutcome null. A completed action is not automatically a succeeded movement. The application will save and verify the owner outcome before producing its execution receipt.`;

/** Resolve from an already validated protected artifact and examined bundle. */
export function deriveSceneMovementExpectation(artifact: Row, bundle: Row, nodeRef: string): SceneMovementExpectation {
  if (!object(artifact.instruction) || !object(artifact.program) || !object(artifact.cursor) || !object(bundle.sceneKit)
    || !id(nodeRef) || !Array.isArray(artifact.intentBindingApplications)) invalid('owners');
  const program = projectAppliedIntentBindings(artifact.instruction, artifact.program, rows(artifact.intentBindingApplications));
  const node = rows(program.nodes).find((row) => row.nodeId === nodeRef);
  const application = [...rows(artifact.intentBindingApplications)].reverse().find((entry) => object(entry.record)
    && object(entry.record.bindings) && rows(entry.record.bindings.nodes).some((row) => row.nodeRef === nodeRef));
  const record = application?.record;
  if (node?.kind !== 'move' || !object(record) || !object(record.bindings) || !object(record.bindings.sceneKitRef)
    || record.bindings.sceneKitRef.sceneKitId !== bundle.sceneKit.sceneKitId
    || record.bindings.sceneKitRef.revision !== bundle.sceneKit.revision) invalid('binding');
  if (rows(node.dataRequirements).some((row) => ['mechanic', 'resource'].includes(String(row.kind)))) invalid('required_mechanics');
  const actorRefs = [node.actorRef, ...rows(node.dataRequirements).filter((row) => row.targetRole === 'actor').map((row) => row.targetRef)].filter((value) => value != null);
  const frames = rows(bundle.actorFrames).filter((frame) => actorRefs.length > 0 && actorRefs.every((ref) => ref === frame.actorRef || ref === frame.actorFrameId));
  const destinations = object(node.semanticLocationBindings) ? rows(node.semanticLocationBindings.bindings).filter((row) => row.role === 'destination') : [];
  if (frames.length !== 1 || !id(frames[0].actorRef) || destinations.length !== 1 || !id(destinations[0].authorityRef)) invalid('mover_or_destination');
  const destinationRef = destinations[0].authorityRef;
  const elements = rows(bundle.elements).filter((row) => row.elementId === destinationRef);
  const zone = rows(bundle.zones).find((row) => row.zoneId === destinationRef);
  const destinationZoneRef = zone?.zoneId ?? (elements.length === 1 ? elements[0].zoneRef : null);
  if (!id(destinationZoneRef) || !rows(bundle.zones).some((row) => row.zoneId === destinationZoneRef)) invalid('destination_zone');
  const qualifications = rows(record.qualifiedObservers).filter((row) => object(row.viewpointCondition)
    && row.viewpointCondition.kind === 'after_relocation' && row.viewpointCondition.nodeRef === nodeRef);
  for (const qualification of qualifications) {
    const selected = rows(record.bindings.nodes).flatMap((row) => rows(row.observations)).find((row) => row.ownerEvidenceRef === qualification.evidenceRef);
    if (qualification.observerRef !== frames[0].actorRef || selected?.viewpointZoneRef !== destinationZoneRef) invalid('qualified_destination');
  }
  const authority = program.authorityBase;
  if (!object(authority) || !id(authority.campaignId) || !id(program.programId) || !id(record.recordId)
    || !/^[a-f0-9]{64}$/.test(String(record.recordFingerprint))) invalid('identity');
  const body = { schemaVersion: 'gmc.scene-movement-expectation/1' as const, campaignId: authority.campaignId,
    programRef: program.programId, nodeRef, bindingRecordRef: record.recordId, bindingRecordFingerprint: String(record.recordFingerprint),
    moverRef: frames[0].actorRef, destinationRef, destinationZoneRef };
  return { ...body, expectationRef: `movement-expectation:${freeformJsonDigest(body).slice(0, 40)}` };
}

/** Closed identity comparison plus exact player-facing evidence. */
export function sceneMovementOutcomeIssues(value: unknown, expectation: SceneMovementExpectation | null, responseText: string,
  pendingMechanic = false): string[] {
  if (!expectation || pendingMechanic) return value === null ? [] : ['/movementOutcome'];
  if (!object(value)) return ['/movementOutcome'];
  const keys = ['schemaVersion', 'expectationRef', 'campaignId', 'programRef', 'nodeRef', 'bindingRecordRef', 'moverRef',
    'destinationRef', 'destinationZoneRef', 'result', 'narrationEvidence'];
  const issues = Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) ? ['/movementOutcome'] : [];
  if (value.schemaVersion !== 'gma.scene-movement-outcome-proposal/1') issues.push('/movementOutcome/schemaVersion');
  for (const field of keys.slice(1, 9)) if (value[field] !== expectation[field as keyof SceneMovementExpectation]) issues.push(`/movementOutcome/${field}`);
  if (!['reached', 'not_reached'].includes(String(value.result))) issues.push('/movementOutcome/result');
  if (typeof value.narrationEvidence !== 'string' || !value.narrationEvidence.trim() || Buffer.byteLength(value.narrationEvidence, 'utf8') > 2_000
    || !responseText.includes(value.narrationEvidence)) issues.push('/movementOutcome/narrationEvidence');
  return issues;
}

/** Canonical JSON schema is mirrored, not hand-maintained in GMA. */
export const SCENE_MOVEMENT_OUTCOME_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'expectationRef', 'campaignId', 'programRef', 'nodeRef', 'bindingRecordRef', 'moverRef', 'destinationRef', 'destinationZoneRef', 'result', 'narrationEvidence'],
  properties: { schemaVersion: { const: 'gma.scene-movement-outcome-proposal/1' },
    ...Object.fromEntries(['expectationRef', 'campaignId', 'programRef', 'nodeRef', 'bindingRecordRef', 'moverRef', 'destinationRef', 'destinationZoneRef'].map((field) => [field,
      { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' }])),
    result: { enum: ['reached', 'not_reached'] }, narrationEvidence: { type: 'string', minLength: 1, maxLength: 2_000 } } };

/** Emission is off unless the entire protected reader/writer tuple agrees. */
export const SCENE_MOVEMENT_OUTCOME_AUTHORITY = Object.freeze({ capability: 'scene-movement-outcome-authority/1',
  expectation: 'gmc.scene-movement-expectation/1', proposal: 'gma.scene-movement-outcome-proposal/1',
  commit: 'gmc.scene-movement-outcome-commit/1', receipt: 'gmc.scene-movement-outcome-receipt/1' });

const refSchema = { type: 'string', minLength: 1, maxLength: 240, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' };
const digestSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revisionSchema = { type: 'integer', minimum: 0 };
function closed(properties: Row): Row { return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties }; }
/** Application expectation is closed and fingerprinted before either transport consumes it. */
export const SCENE_MOVEMENT_EXPECTATION_SCHEMA = closed({
  schemaVersion: { const: SCENE_MOVEMENT_OUTCOME_AUTHORITY.expectation }, expectationRef: refSchema,
  campaignId: refSchema, programRef: refSchema, nodeRef: refSchema, bindingRecordRef: refSchema,
  bindingRecordFingerprint: digestSchema, moverRef: refSchema, destinationRef: refSchema, destinationZoneRef: refSchema,
});
/** Authentication scope is outside this HTTP body; no caller-selected user ID. */
export const SCENE_MOVEMENT_COMMIT_SCHEMA = closed({
  schemaVersion: { const: SCENE_MOVEMENT_OUTCOME_AUTHORITY.commit }, operationId: refSchema, idempotencyKey: refSchema,
  programId: refSchema, nodeRef: refSchema, expectedArtifactRevision: revisionSchema, expectedWorkspaceRevision: revisionSchema,
  expectedPreparedSceneRevision: revisionSchema, expectedActiveSceneRevision: revisionSchema, sourceSceneTurnReceiptRef: refSchema,
  expectation: SCENE_MOVEMENT_EXPECTATION_SCHEMA, proposal: SCENE_MOVEMENT_OUTCOME_SCHEMA,
  sourceKind: { enum: ['manual_proposal', 'human_gm'] }, humanDecision: { anyOf: [{ type: 'null' }, closed({
    schemaVersion: { const: 'gma.scene-movement-gm-decision/1' }, decisionId: refSchema,
    result: { enum: ['reached', 'not_reached'] }, reason: { type: 'string', minLength: 1, maxLength: 2_000 },
  })] },
});
/** Compact owner event; the complete request remains identified by its digest. */
export const SCENE_MOVEMENT_RECEIPT_SCHEMA = closed({
  schemaVersion: { const: SCENE_MOVEMENT_OUTCOME_AUTHORITY.receipt }, receiptRef: refSchema, operationId: refSchema,
  requestFingerprint: digestSchema, disposition: { const: 'committed' }, duplicate: { type: 'boolean' },
  campaignId: refSchema, programRef: refSchema, nodeRef: refSchema, expectation: SCENE_MOVEMENT_EXPECTATION_SCHEMA,
  sourceSceneTurnReceiptRef: refSchema, sourceSceneTurnFingerprint: digestSchema,
  result: { enum: ['reached', 'not_reached'] }, executionResult: { enum: ['succeeded', 'failed'] }, proposalFingerprint: digestSchema,
  sourceKind: { enum: ['manual_proposal', 'human_gm'] }, humanDecisionFingerprint: { anyOf: [{ type: 'null' }, digestSchema] },
  authorityHead: closed({ artifactRevision: revisionSchema, workspaceRevision: revisionSchema,
    preparedSceneRevision: revisionSchema, activeSceneRevision: revisionSchema }),
});

/** Transport-neutral, bounded validation of the canonical logical schemas. */
export function sceneMovementSchemaIssues(value: unknown, schema: Row, path = ''): string[] {
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some((choice) => object(choice)
    && sceneMovementSchemaIssues(value, choice, path).length === 0) ? [] : [path || '/'];
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return [path || '/'];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [path || '/'];
  if (schema.type === 'null') return value === null ? [] : [path || '/'];
  if (schema.type === 'boolean') return typeof value === 'boolean' ? [] : [path || '/'];
  if (schema.type === 'integer') return Number.isSafeInteger(value) && Number(value) >= Number(schema.minimum ?? 0) ? [] : [path || '/'];
  if (schema.type === 'string') return typeof value === 'string' && value.length >= Number(schema.minLength ?? 0)
    && Buffer.byteLength(value, 'utf8') <= Number(schema.maxLength ?? Infinity)
    && (typeof schema.pattern !== 'string' || new RegExp(schema.pattern).test(value)) ? [] : [path || '/'];
  if (schema.type === 'object') {
    if (!object(value) || !object(schema.properties)) return [path || '/'];
    const properties = schema.properties, keys = Object.keys(properties);
    if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) return [path || '/'];
    return keys.flatMap((key) => sceneMovementSchemaIssues(value[key], properties[key] as Row, `${path}/${key}`));
  }
  return [];
}
