import type { LlmValidationResult } from '../../shared/llm/orchestratorContracts.js';
import { registerSemanticValidator } from './operationRegistry.js';

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

export function semanticValidatorsLoaded() {
  return true;
}
