import type { LlmValidationResult } from '../../shared/llm/orchestratorContracts.js';
import Ajv from 'ajv';
import {
  registerSemanticValidator,
  STORY_DIRECTOR_REPAIR_SCENE_KIT_SCHEMA,
  STORY_SCENE_KIT_REPAIR_FIELD_KEYS,
} from './operationRegistry.js';

function result(id: string, issues: Array<{ code: string; message: string; path?: string }>): LlmValidationResult {
  return { validatorId: id, version: '1', valid: issues.length === 0, issues };
}

function outputText(output: any) {
  return [output?.narration, output?.correctedNarration, output?.response, output?.dialogue]
    .filter((value) => typeof value === 'string')
    .join('\n');
}

registerSemanticValidator('authority-boundary', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  for (const key of ['makeCanon', 'commit', 'committed', 'applyMutation', 'authority']) {
    if (Object.prototype.hasOwnProperty.call(output ?? {}, key)) {
      issues.push({
        code: 'MODEL_AUTHORITY_ESCALATION',
        message: `Model output may not set '${key}'.`,
        path: `/${key}`,
      });
    }
  }
  return result('authority-boundary', issues);
});

registerSemanticValidator('narrative-fidelity', ({ output }) => {
  const text = outputText(output);
  const issues: Array<{ code: string; message: string }> = [];
  const forbidden = /\b(?:GMA|GMC|VCS|schema|structured output|authoritative manifest|fixed carried inventory|current records|character sheet|validation error|developer diagnostic)\b/i;
  if (text && forbidden.test(text)) {
    issues.push({ code: 'PLAYER_FACING_IMPLEMENTATION_LANGUAGE', message: 'Player-facing prose contains implementation or preparation language.' });
  }
  return result('narrative-fidelity', issues);
});

registerSemanticValidator('chronology', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const advance = output?.proposedTimeAdvance;
  if (advance && (Number(advance.seconds ?? 0) < 0 || Number(advance.minutes ?? 0) < 0)) {
    issues.push({ code: 'NEGATIVE_TIME_ADVANCE', message: 'A proposed time advance cannot move backward.', path: '/proposedTimeAdvance' });
  }
  return result('chronology', issues);
});

registerSemanticValidator('inventory', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const exports = Array.isArray(output?.proposedVcsExports) ? output.proposedVcsExports : [];
  for (let index = 0; index < exports.length; index += 1) {
    const entry = exports[index];
    if (entry?.quantity !== undefined && (!Number.isFinite(Number(entry.quantity)) || Number(entry.quantity) < 0)) {
      issues.push({ code: 'INVALID_INVENTORY_QUANTITY', message: 'Inventory quantities must be non-negative numbers.', path: `/proposedVcsExports/${index}/quantity` });
    }
  }
  const itemOperations = [
    ...(Array.isArray(output?.proposedSheetMutation?.items?.add) ? output.proposedSheetMutation.items.add : []),
    ...(Array.isArray(output?.proposedSheetMutation?.items?.remove) ? output.proposedSheetMutation.items.remove : []),
  ];
  for (let index = 0; index < itemOperations.length; index += 1) {
    const entry = itemOperations[index];
    if (!String(entry?.name ?? '').trim() || !Number.isFinite(Number(entry?.quantity)) || Number(entry.quantity) <= 0) {
      issues.push({ code: 'INVALID_SHEET_ITEM_OPERATION', message: 'Character-sheet item operations require an exact name and positive quantity.', path: `/proposedSheetMutation/items/${index}` });
    }
  }
  return result('inventory', issues);
});

registerSemanticValidator('encounter-actors', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const actors = Array.isArray(output?.combatants) ? output.combatants : [];
  const seen = new Set<string>();
  for (let index = 0; index < actors.length; index += 1) {
    const id = String(actors[index]?.actorId ?? actors[index]?.id ?? '').trim();
    if (!id) continue;
    if (seen.has(id)) issues.push({ code: 'DUPLICATE_ENCOUNTER_ACTOR', message: `Encounter actor '${id}' is duplicated.`, path: `/combatants/${index}` });
    seen.add(id);
  }
  return result('encounter-actors', issues);
});

registerSemanticValidator('rules-fidelity', ({ request, output }) => {
  const issues: Array<{ code: string; message: string }> = [];
  const immutable = request.context?.mechanics?.value as any;
  if (immutable && output?.authoritativeMechanicalResult && JSON.stringify(output.authoritativeMechanicalResult) !== JSON.stringify(immutable.authoritativeMechanicalResult)) {
    issues.push({ code: 'MECHANICS_MUTATED', message: 'Model output changed an immutable authoritative mechanical result.' });
  }
  return result('rules-fidelity', issues);
});

registerSemanticValidator('scene-presence', ({ request, output }) => {
  const issues: Array<{ code: string; message: string }> = [];
  const knownAbsent = (request.context?.scene?.value as any)?.scenePresenceContract?.knownNonPresentNpcs;
  const text = outputText(output).toLowerCase();
  if (Array.isArray(knownAbsent) && text) {
    for (const npc of knownAbsent) {
      const name = String(npc?.name ?? npc ?? '').trim();
      if (name && text.includes(name.toLowerCase())) {
        issues.push({ code: 'ABSENT_NPC_REFERENCED', message: `Known absent NPC '${name}' appears in the result.` });
      }
    }
  }
  return result('scene-presence', issues);
});

registerSemanticValidator('canon-proposal', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const proposals = [
    ...(Array.isArray(output?.proposedCanonChanges) ? output.proposedCanonChanges : []),
    ...(Array.isArray(output?.proposedEntities) ? output.proposedEntities : []),
  ];
  for (let index = 0; index < proposals.length; index += 1) {
    if (proposals[index]?.committed === true || proposals[index]?.makeCanon === true) {
      issues.push({ code: 'CANON_PROPOSAL_SELF_COMMIT', message: 'Generated canon must remain a proposal.', path: `/proposals/${index}` });
    }
  }
  return result('canon-proposal', issues);
});

registerSemanticValidator('npc-background-proposal', ({ request, output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const trusted = request.context?.input?.value as any;
  const policy = request.context?.policy?.value as any;
  const exactFields = ['existingNpcId', 'topic', 'sourceRevision', 'worldPolicyRevision', 'idempotencyKey'] as const;
  for (const field of exactFields) {
    if (String(output?.[field] ?? '') !== String(trusted?.[field] ?? '')) {
      issues.push({ code: 'NPC_BACKGROUND_SCOPE_MISMATCH', message: `The proposal changed trusted field '${field}'.`, path: `/${field}` });
    }
  }
  const expectedRefs = [...new Set((Array.isArray(trusted?.sourceRefs) ? trusted.sourceRefs : []).map(String))].sort();
  const actualRefs = [...new Set((Array.isArray(output?.sourceRefs) ? output.sourceRefs : []).map(String))].sort();
  if (JSON.stringify(actualRefs) !== JSON.stringify(expectedRefs)) {
    issues.push({ code: 'NPC_BACKGROUND_SOURCE_MISMATCH', message: 'The proposal changed the trusted source references.', path: '/sourceRefs' });
  }
  if (
    policy?.mode !== 'world_generation_allowed'
    || !Array.isArray(policy?.allowedDevelopmentKinds)
    || !policy.allowedDevelopmentKinds.map(String).includes('npc_background')
    || policy?.allowSceneSettingCreation === true
    || policy?.destinationAuthority
  ) {
    issues.push({ code: 'NPC_BACKGROUND_POLICY_FORBIDDEN', message: 'The effective policy does not grant isolated NPC-background development.', path: '/worldPolicyRevision' });
  }
  if (output?.fact?.relatedNpcId !== trusted?.existingNpcId || output?.fact?.topic !== trusted?.topic) {
    issues.push({ code: 'NPC_BACKGROUND_FACT_SCOPE_MISMATCH', message: 'The hidden fact must target only the requested existing NPC and topic.', path: '/fact' });
  }
  if ((output?.proposedEntities?.length ?? 0) !== 0 || (output?.proposedLocations?.length ?? 0) !== 0) {
    issues.push({ code: 'NPC_BACKGROUND_ENTITY_CREATION_FORBIDDEN', message: 'Bounded NPC background development cannot create an entity or location.', path: '/proposedEntities' });
  }
  const claim = String(output?.fact?.claim ?? '');
  if (/\b(?:d20|attack roll|saving throw|difficulty class|\bDC\s*\d|hit points?|damage dice|initiative|spell slots?|character sheet)\b/i.test(claim)) {
    issues.push({ code: 'NPC_BACKGROUND_MECHANICS_FORBIDDEN', message: 'The background fact cannot contain a mechanical result.', path: '/fact/claim' });
  }
  for (const key of ['playerAction', 'mechanicalResult', 'rollRequest', 'sceneTransition', 'sceneSetting']) {
    if (Object.prototype.hasOwnProperty.call(output ?? {}, key) || Object.prototype.hasOwnProperty.call(output?.fact ?? {}, key)) {
      issues.push({ code: 'NPC_BACKGROUND_UNRELATED_RESULT', message: `The proposal may not contain '${key}'.`, path: `/${key}` });
    }
  }
  return result('npc-background-proposal', issues);
});

function storySourceRefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) storySourceRefs(entry, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'sourceRefs' && Array.isArray(entry)) found.push(...entry.map(String));
    else storySourceRefs(entry, found);
  }
  return found;
}

registerSemanticValidator('story-planning-proposal', ({ request, output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const trusted = request.context?.input?.value as any;
  if (String(output?.idempotencyKey ?? '') !== String(trusted?.idempotencyKey ?? '')) {
    issues.push({ code: 'STORY_PLANNING_IDEMPOTENCY_MISMATCH', message: 'The proposal changed the trusted idempotency key.', path: '/idempotencyKey' });
  }
  const expectedRefs = [...new Set((Array.isArray(trusted?.sourceRefs) ? trusted.sourceRefs : []).map(String))].sort();
  const outputRefs = [...new Set((Array.isArray(output?.sourceRefs) ? output.sourceRefs : []).map(String))].sort();
  if (JSON.stringify(expectedRefs) !== JSON.stringify(outputRefs)) {
    issues.push({ code: 'STORY_PLANNING_SOURCE_MISMATCH', message: 'The proposal changed the trusted source references.', path: '/sourceRefs' });
  }
  const allowedRefs = new Set(expectedRefs);
  for (const ref of storySourceRefs(output?.proposal)) {
    if (!allowedRefs.has(ref)) issues.push({ code: 'STORY_PLANNING_UNGROUNDED_REFERENCE', message: 'A proposed record cites a source outside the trusted scope.', path: '/proposal' });
  }
  const text = JSON.stringify(output?.proposal ?? {});
  if (/\b(?:the player|players?|the party|the character)\s+(?:must|has to|have to|will|chooses?|decides?|agrees?|refuses?)\b|\b(?:guaranteed|inevitable|predetermined)\s+(?:outcome|arrival|victory|failure|choice)\b/i.test(text)) {
    issues.push({ code: 'STORY_PLANNING_PLAYER_AGENCY_VIOLATION', message: 'Preparation may describe situations and consequences, not decide player action or outcome.', path: '/proposal' });
  }
  if (/\b(?:attack roll|saving throw|difficulty class|\bDC\s*\d|hit points?|damage dice|initiative|spell slots?|character sheet)\b/i.test(text)) {
    issues.push({ code: 'STORY_PLANNING_MECHANICS_FORBIDDEN', message: 'Story preparation cannot establish mechanics.', path: '/proposal' });
  }
  const arcs = Array.isArray(output?.proposal?.arcs) ? output.proposal.arcs : [];
  for (const [index, arc] of arcs.entries()) {
    if (!Array.isArray(arc?.sourceRefs) || arc.sourceRefs.length === 0) {
      issues.push({ code: 'STORY_ARC_GROUNDING_REQUIRED', message: 'Every proposed arc needs at least one committed source.', path: `/proposal/arcs/${index}/sourceRefs` });
    }
    if (arc?.playerInvestment === 'provisional' && arc?.planningState === 'active') {
      issues.push({ code: 'STORY_ARC_MATERIAL_THRESHOLD_REQUIRED', message: 'A provisional mention cannot become an active arc.', path: `/proposal/arcs/${index}` });
    }
  }
  const candidates = Array.isArray(output?.proposal?.candidates) ? output.proposal.candidates : [];
  if (candidates.filter((candidate: any) => candidate?.preparationHorizon === 'ready_soon').length > 3) {
    issues.push({ code: 'STORY_FRONTIER_READY_SOON_BOUND', message: 'At most three frontier candidates may be ready soon.', path: '/proposal/candidates' });
  }
  for (const [index, candidate] of candidates.entries()) {
    if (!Array.isArray(candidate?.sourceRefs) || candidate.sourceRefs.length === 0) {
      issues.push({ code: 'STORY_FRONTIER_GROUNDING_REQUIRED', message: 'Every frontier candidate needs a committed source.', path: `/proposal/candidates/${index}/sourceRefs` });
    }
  }
  return result('story-planning-proposal', issues);
});

registerSemanticValidator('story-scene-readiness', ({ output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const proposal = output?.proposal ?? {};
  const present = Array.isArray(proposal?.participants?.present) ? proposal.participants.present : [];
  const anticipated = Array.isArray(proposal?.participants?.anticipated) ? proposal.participants.anticipated : [];
  const presentIds = new Set(present.map((entry: any) => String(entry?.entityRef ?? '')).filter(Boolean));
  for (const [index, entry] of anticipated.entries()) {
    if (presentIds.has(String(entry?.entityRef ?? ''))) {
      issues.push({ code: 'STORY_SCENE_PRESENCE_OVERLAP', message: 'A participant cannot be both present and anticipated.', path: `/proposal/participants/anticipated/${index}` });
    }
    if (!String(entry?.arrivalCondition ?? '').trim()) {
      issues.push({ code: 'STORY_SCENE_ANTICIPATED_TRIGGER_REQUIRED', message: 'An anticipated participant needs an arrival condition.', path: `/proposal/participants/anticipated/${index}/arrivalCondition` });
    }
  }
  const exits = Array.isArray(proposal?.exitVectors) ? proposal.exitVectors : [];
  const exitKinds = new Set(exits.map((entry: any) => String(entry?.kind ?? '')));
  for (const kind of ['completion', 'failure', 'abandonment', 'redirect']) {
    if (!exitKinds.has(kind)) issues.push({ code: 'STORY_SCENE_EXIT_REQUIRED', message: `A ready scene needs a ${kind} exit.`, path: '/proposal/exitVectors' });
  }
  const information = Array.isArray(proposal?.information) ? proposal.information : [];
  for (const [index, entry] of information.entries()) {
    if (entry?.critical === true && (!Array.isArray(entry?.accessVectors) || entry.accessVectors.length < 2)) {
      issues.push({ code: 'STORY_SCENE_CRITICAL_ACCESS_REQUIRED', message: 'Critical information needs at least two plausible access vectors.', path: `/proposal/information/${index}/accessVectors` });
    }
  }
  return result('story-scene-readiness', issues);
});

const validateStorySceneKitRepair = new Ajv({ allErrors: true, strict: false })
  .compile(STORY_DIRECTOR_REPAIR_SCENE_KIT_SCHEMA);

registerSemanticValidator('story-scene-kit-repair-rows', ({ request, output }) => {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const trusted = request.context?.input?.value as any;
  if (trusted?.correctionId && String(output?.correctionId ?? '') !== String(trusted.correctionId)) {
    issues.push({ code: 'STORY_SCENE_KIT_REPAIR_CORRECTION_MISMATCH', message: 'The repair changed the supplied correction ID.', path: '/correctionId' });
  }
  const rows = Array.isArray(output?.fields) ? output.fields : [];
  const expectedKeys = new Set<string>(STORY_SCENE_KIT_REPAIR_FIELD_KEYS);
  const values = new Map<string, unknown>();
  for (const [index, row] of rows.entries()) {
    const key = String(row?.key ?? '');
    if (!expectedKeys.has(key)) {
      issues.push({ code: 'STORY_SCENE_KIT_REPAIR_FIELD_UNKNOWN', message: 'The repair returned an unknown Scene-kit field.', path: `/fields/${index}/key` });
      continue;
    }
    if (values.has(key)) {
      issues.push({ code: 'STORY_SCENE_KIT_REPAIR_FIELD_DUPLICATE', message: 'The repair returned one Scene-kit field more than once.', path: `/fields/${index}/key` });
      continue;
    }
    try {
      values.set(key, JSON.parse(String(row?.valueJson ?? '')));
    } catch {
      issues.push({ code: 'STORY_SCENE_KIT_REPAIR_VALUE_INVALID', message: 'A Scene-kit field did not contain valid JSON.', path: `/fields/${index}/valueJson` });
    }
  }
  for (const key of STORY_SCENE_KIT_REPAIR_FIELD_KEYS) {
    if (!values.has(key)) issues.push({ code: 'STORY_SCENE_KIT_REPAIR_FIELD_MISSING', message: 'The repair omitted a required Scene-kit field.', path: '/fields' });
  }
  let patches: unknown = null;
  try {
    patches = JSON.parse(String(output?.patchesJson ?? ''));
  } catch {
    issues.push({ code: 'STORY_SCENE_KIT_REPAIR_PATCHES_INVALID', message: 'The remaining repair fields did not contain valid JSON.', path: '/patchesJson' });
  }
  if (!patches || typeof patches !== 'object' || Array.isArray(patches)) {
    issues.push({ code: 'STORY_SCENE_KIT_REPAIR_PATCHES_OBJECT_REQUIRED', message: 'The remaining repair fields must be one JSON object.', path: '/patchesJson' });
  }
  if (issues.length === 0) {
    const informationRows = values.get('information') as any[];
    const accessRows = values.get('informationAccess') as any[];
    const beatRows = values.get('beats') as any[];
    const impactRows = values.get('beatImpacts') as any[];
    const informationIds = new Set<string>();
    for (const [index, entry] of (Array.isArray(informationRows) ? informationRows : []).entries()) {
      const informationId = String(entry?.informationId ?? '');
      if (informationIds.has(informationId)) {
        issues.push({ code: 'STORY_SCENE_KIT_REPAIR_INFORMATION_DUPLICATE', message: 'The repair returned one information record more than once.', path: `/fields/information/${index}/informationId` });
      }
      informationIds.add(informationId);
    }
    const accessInformationIds = new Set<string>();
    for (const [index, access] of (Array.isArray(accessRows) ? accessRows : []).entries()) {
      const informationId = String(access?.informationId ?? '');
      accessInformationIds.add(informationId);
      if (!informationIds.has(informationId)) {
        issues.push({ code: 'STORY_SCENE_KIT_REPAIR_INFORMATION_ACCESS_UNKNOWN', message: 'An information access row referenced an information record that was not returned.', path: `/fields/informationAccess/${index}/informationId` });
      }
    }
    for (const informationId of informationIds) {
      if (!accessInformationIds.has(informationId)) {
        issues.push({ code: 'STORY_SCENE_KIT_REPAIR_INFORMATION_ACCESS_MISSING', message: 'A returned information record had no access vector.', path: '/fields/informationAccess' });
      }
    }
    const beatIds = new Set<string>();
    for (const [index, beat] of (Array.isArray(beatRows) ? beatRows : []).entries()) {
      const beatId = String(beat?.beatId ?? '');
      if (beatIds.has(beatId)) {
        issues.push({ code: 'STORY_SCENE_KIT_REPAIR_BEAT_DUPLICATE', message: 'The repair returned one beat more than once.', path: `/fields/beats/${index}/beatId` });
      }
      beatIds.add(beatId);
    }
    for (const [index, impact] of (Array.isArray(impactRows) ? impactRows : []).entries()) {
      if (!beatIds.has(String(impact?.beatId ?? ''))) {
        issues.push({ code: 'STORY_SCENE_KIT_REPAIR_BEAT_IMPACT_UNKNOWN', message: 'A beat impact referenced a beat that was not returned.', path: `/fields/beatImpacts/${index}/beatId` });
      }
    }
    const exitKinds = new Set((Array.isArray(values.get('exitVectors')) ? values.get('exitVectors') as any[] : []).map((entry) => String(entry?.kind ?? '')));
    for (const kind of ['completion', 'failure', 'abandonment', 'redirect']) {
      if (!exitKinds.has(kind)) issues.push({ code: 'STORY_SCENE_KIT_REPAIR_EXIT_MISSING', message: `The repair omitted the ${kind} exit.`, path: '/fields/exitVectors' });
    }
    const sceneKit = {
      schemaVersion: values.get('sceneKitSchemaVersion'), sceneKitId: values.get('sceneKitId'),
      revision: values.get('revision'), planningState: values.get('planningState'),
      playableLocus: {
        kind: values.get('locusKind'), label: values.get('locusLabel'),
        canonicalAnchorRef: values.get('canonicalAnchorRef'), sourceRefs: values.get('locusSourceRefs'),
      },
      purpose: values.get('purpose'), dramaticQuestion: values.get('dramaticQuestion'),
      participants: {
        present: values.get('presentActorRefs'), sceneLocalRoles: values.get('sceneLocalRoles'),
        anticipated: values.get('anticipatedActorRefs'),
      },
      establishedElements: values.get('establishedElements'),
      information: Array.isArray(informationRows) ? informationRows.map((entry) => ({
        ...entry,
        accessVectors: Array.isArray(accessRows)
          ? accessRows.filter((access) => access?.informationId === entry?.informationId).map((access) => access.accessVector)
          : [],
      })) : informationRows,
      beats: Array.isArray(beatRows) ? beatRows.map((entry) => ({
        ...entry,
        potentialImpacts: Array.isArray(impactRows)
          ? impactRows.filter((impact) => impact?.beatId === entry?.beatId).map(({ beatId: _beatId, ...impact }) => impact)
          : [],
      })) : beatRows,
      pressures: values.get('pressures'), exitVectors: values.get('exitVectors'),
      storyBindings: values.get('storyBindings'), sourceRefs: values.get('sourceRefs'),
    };
    if (!validateStorySceneKitRepair(sceneKit)) {
      for (const error of validateStorySceneKitRepair.errors ?? []) {
        issues.push({
          code: 'STORY_SCENE_KIT_REPAIR_VALUE_INVALID',
          message: `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
          path: `/fields${error.instancePath || ''}`,
        });
      }
    }
  }
  return result('story-scene-kit-repair-rows', issues);
});

export function semanticValidatorsLoaded() {
  return true;
}
