import { randomUUID } from 'node:crypto';

import { parseSmartJson } from '../../shared/generation/smartJsonParser.js';
import {
  getWorkflowDefinition,
  getWorkflowStageSequence,
} from '../../shared/generation/workflowRegistry.js';
import {
  pruneWorkflowStageOutput,
  validateWorkflowStageContractPayload,
} from '../../shared/generation/workflowStageValidation.js';
import { validateMonsterStrict } from '../validation/monsterValidator.js';
import { mapAndValidateNpc } from './npcSchemaMapper.js';
import { generateStructuredJson } from './gmcLiveGeneration.js';
import {
  collections,
  findActorEntity,
  upsertCanonicalActor,
  type GmcActorKind,
} from './gmcIntegrationStore.js';

type JsonRecord = Record<string, any>;
type ActorExecutionMode = 'integrated' | 'manual';
type ActorProfileDetail = 'combat_ready' | 'full';

export interface ActorEnsureInput {
  kind?: GmcActorKind;
  canonicalEntityId?: string;
  identityHints?: { name?: string; aliases?: string[] };
  purpose?: string;
  actorSnapshot?: JsonRecord;
  requiredDetail?: ActorProfileDetail;
  executionMode?: ActorExecutionMode | 'automatic';
  workflowId?: string;
  stageResult?: unknown;
}

interface ActorWorkflowDocument {
  _id: string;
  userId: string;
  campaignId: string;
  kind: GmcActorKind;
  normalizedName: string;
  canonicalEntityId?: string;
  purpose: string;
  actorSnapshot: JsonRecord;
  identityHints: { name: string; aliases: string[] };
  executionMode: ActorExecutionMode;
  status: 'running' | 'awaiting_ai' | 'complete' | 'error';
  stageSequence: string[];
  currentStageIndex: number;
  stageResults: Record<string, JsonRecord>;
  attempts: Array<Record<string, unknown>>;
  error?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const record = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonRecord) } : {}
);

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  : [];

const nameOf = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  const source = record(value);
  return String(source.name ?? source.label ?? '').trim();
};

const numberFrom = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const actorError = (message: string, code: string, details: Record<string, unknown> = {}) => Object.assign(
  new Error(message),
  { status: 422, code, details },
);

function normalizeAbilityScores(value: unknown) {
  const source = record(value);
  const score = (short: string, long: string) => numberFrom(source[short], source[short.toUpperCase()], source[long]);
  const result = {
    str: score('str', 'strength'),
    dex: score('dex', 'dexterity'),
    con: score('con', 'constitution'),
    int: score('int', 'intelligence'),
    wis: score('wis', 'wisdom'),
    cha: score('cha', 'charisma'),
  };
  return Object.values(result).every((entry) => Number.isFinite(entry)) ? result : value;
}

function normalizeSpeed(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return { walk: `${value} ft.` };
  if (typeof value === 'string' && value.trim()) return { walk: value.trim() };
  const source = record(value);
  if (!Object.keys(source).length) return value;
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => [
    key,
    typeof entry === 'number' ? `${entry} ft.` : entry,
  ]));
}

function normalizeHitPoints(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.round(value));
  const source = record(value);
  const average = numberFrom(source.average, source.max, source.maximum, source.current);
  const formula = String(source.formula ?? '').trim();
  if (average !== undefined && formula) return { average: Math.max(1, Math.round(average)), formula };
  if (average !== undefined) return Math.max(1, Math.round(average));
  return value;
}

function normalizeArmorClass(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const source = record(value);
  const resolved = numberFrom(source.value, source.ac, source.armorClass);
  return resolved === undefined ? value : Math.round(resolved);
}

function normalizeFeatures(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (typeof entry === 'string') return { name: entry, description: entry };
    const source = record(entry);
    const name = nameOf(source);
    return name ? { ...source, name, description: String(source.description ?? source.effect ?? name) } : source;
  });
}

function stagePayloads(state: Pick<ActorWorkflowDocument, 'stageResults'>) {
  return Object.entries(state.stageResults)
    .filter(([stageKey]) => !['keyword_extractor', 'planner'].includes(stageKey))
    .reduce<JsonRecord>((merged, [, payload]) => ({ ...merged, ...payload }), {});
}

function relationshipList(stage: JsonRecord) {
  const relationships: JsonRecord[] = [];
  for (const [field, relationship] of [['allies', 'ally'], ['enemies', 'enemy'], ['organizations', 'member'], ['family', 'family'], ['contacts', 'contact']] as const) {
    for (const entry of Array.isArray(stage[field]) ? stage[field] : []) {
      const entity = nameOf(entry);
      if (entity) relationships.push({ entity, relationship, ...(record(entry).notes ? { notes: String(record(entry).notes) } : {}) });
    }
  }
  return relationships;
}

function equipmentList(stage: JsonRecord) {
  const values = ['weapons', 'armor_and_shields', 'wondrous_items', 'consumables', 'other_gear']
    .flatMap((field) => Array.isArray(stage[field]) ? stage[field] : [])
    .map(nameOf)
    .filter(Boolean);
  return Array.from(new Set(values));
}

export function composeActorProfile(kind: GmcActorKind, actorSnapshot: JsonRecord, results: Record<string, JsonRecord>) {
  const state = { stageResults: results };
  const stage = stagePayloads(state);
  const source = { ...record(actorSnapshot), ...stage };
  const name = String(source.name ?? actorSnapshot.name ?? '').trim();
  const description = String(source.description ?? actorSnapshot.description ?? '').trim();
  const abilityScores = normalizeAbilityScores(source.ability_scores ?? source.abilities);
  const armorClass = normalizeArmorClass(source.armor_class ?? source.armorClass ?? source.ac);
  const hitPoints = normalizeHitPoints(source.hit_points ?? source.hitPoints ?? source.hp ?? source.maxHp);

  if (kind === 'monster') {
    return {
      ...source,
      name,
      description,
      size: String(source.size ?? '').trim(),
      creature_type: String(source.creature_type ?? source.creatureType ?? source.monsterType ?? '').trim(),
      alignment: String(source.alignment ?? '').trim(),
      challenge_rating: String(source.challenge_rating ?? source.challengeRating ?? source.cr ?? '').trim(),
      ability_scores: abilityScores,
      proficiency_bonus: source.proficiency_bonus ?? source.proficiencyBonus,
      ...(armorClass !== undefined ? { armor_class: armorClass } : {}),
      ...(hitPoints !== undefined ? { hit_points: hitPoints } : {}),
      ...(source.speed !== undefined ? { speed: normalizeSpeed(source.speed) } : {}),
      abilities: normalizeFeatures(source.abilities ?? source.traits ?? []),
      actions: normalizeFeatures(source.actions ?? []),
      bonus_actions: normalizeFeatures(source.bonus_actions ?? source.bonusActions ?? []),
      reactions: normalizeFeatures(source.reactions ?? []),
    };
  }

  const core = record(results.core_details);
  const relationships = record(results.relationships);
  const equipment = record(results.equipment);
  const spellcasting = record(results.spellcasting);
  const spellcastingAbility = String(spellcasting.spellcasting_ability ?? '').trim();
  return {
    ...source,
    schema_version: '1.1',
    name,
    description,
    race: String(source.race ?? source.species ?? '').trim(),
    ability_scores: abilityScores,
    ...(armorClass !== undefined ? { armor_class: armorClass } : {}),
    ...(hitPoints !== undefined ? { hit_points: hitPoints } : {}),
    ...(source.speed !== undefined ? { speed: normalizeSpeed(source.speed) } : {}),
    personality: {
      traits: stringArray(core.personality_traits ?? record(source.personality).traits),
      ideals: stringArray(core.ideals ?? record(source.personality).ideals),
      bonds: stringArray(core.bonds ?? record(source.personality).bonds),
      flaws: stringArray(core.flaws ?? record(source.personality).flaws),
    },
    motivations: stringArray(source.motivations ?? core.goals),
    relationships: relationshipList(relationships),
    equipment: equipmentList(equipment),
    abilities: normalizeFeatures(source.abilities ?? [
      ...(Array.isArray(source.class_features) ? source.class_features : []),
      ...(Array.isArray(source.subclass_features) ? source.subclass_features : []),
      ...(Array.isArray(source.racial_features) ? source.racial_features : []),
      ...(Array.isArray(source.feats) ? source.feats : []),
    ]),
    actions: normalizeFeatures(source.actions ?? []),
    bonus_actions: normalizeFeatures(source.bonus_actions ?? source.bonusActions ?? []),
    reactions: normalizeFeatures(source.reactions ?? []),
    ...(spellcastingAbility && spellcastingAbility.toLowerCase() !== 'none' ? {
      spellcasting: {
        ability: spellcastingAbility,
        save_dc: numberFrom(spellcasting.spell_save_dc) ?? 0,
        attack_bonus: numberFrom(spellcasting.spell_attack_bonus) ?? 0,
        spell_slots: record(spellcasting.spell_slots),
        prepared_spells: record(spellcasting.prepared_spells),
        innate_spells: record(spellcasting.innate_spells),
        known_spells: stringArray(spellcasting.spells_known),
      },
    } : {}),
  };
}

export function validateActorProfile(kind: GmcActorKind, actor: JsonRecord) {
  if (kind === 'monster') {
    const validation = validateMonsterStrict(actor);
    return validation.valid
      ? { valid: true as const, actor }
      : { valid: false as const, actor, details: validation.details ?? 'Monster schema validation failed.' };
  }
  const validation = mapAndValidateNpc(actor);
  return validation.success && validation.data
    ? { valid: true as const, actor: validation.data, warnings: validation.warnings }
    : {
      valid: false as const,
      actor: validation.data ?? actor,
      details: [validation.errors.join(' '), validation.validationErrors].filter(Boolean).join(' '),
    };
}

export function composeCombatReadyActorProfile(kind: GmcActorKind, actorSnapshot: JsonRecord) {
  const source = record(actorSnapshot);
  const name = String(source.name ?? '').trim();
  const maxHp = numberFrom(
    record(source.hitPoints).max,
    record(source.hitPoints).maximum,
    record(source.hit_points).average,
    source.maxHitPoints,
    source.maxHp,
    source.hitPoints,
    source.hit_points,
    source.hp,
  );
  const currentHp = numberFrom(record(source.hitPoints).current, source.currentHitPoints, maxHp);
  const armorClass = normalizeArmorClass(source.armorClass ?? source.armor_class ?? source.ac);
  const actions = normalizeFeatures(source.actions ?? []);
  return {
    ...source,
    name,
    aliases: stringArray(source.aliases),
    kind,
    role: String(source.role ?? '').trim(),
    disposition: String(source.disposition ?? source.allegiance ?? '').trim(),
    ...(maxHp !== undefined ? {
      hitPoints: {
        current: Math.max(0, Math.round(currentHp ?? maxHp)),
        max: Math.max(1, Math.round(maxHp)),
      },
      hit_points: Math.max(1, Math.round(maxHp)),
    } : {}),
    ...(armorClass !== undefined ? { armorClass, armor_class: armorClass } : {}),
    ...(source.speed !== undefined ? { speed: source.speed } : {}),
    initiativeModifier: numberFrom(source.initiativeModifier, source.initiative) ?? 0,
    actions: Array.isArray(actions) ? actions : [],
    bonus_actions: normalizeFeatures(source.bonus_actions ?? source.bonusActions ?? []),
    reactions: normalizeFeatures(source.reactions ?? []),
    carriedInventory: record(source.carriedInventory ?? source.inventory ?? source.lootManifest),
    profile_detail: 'combat_ready',
  };
}

export function validateCombatReadyActorProfile(kind: GmcActorKind, actor: JsonRecord) {
  const composed = composeCombatReadyActorProfile(kind, actor);
  const errors: string[] = [];
  if (!composed.name) errors.push('name is required');
  if (!Number.isFinite(Number(composed.hitPoints?.max)) || Number(composed.hitPoints?.max) < 1) errors.push('positive maximum hit points are required');
  if (!Number.isFinite(Number(composed.armorClass))) errors.push('armor class is required');
  return errors.length
    ? { valid: false as const, actor: composed, details: errors.join('; ') }
    : { valid: true as const, actor: composed };
}

function parseNestedStageValue(value: unknown, expectedStageKey: string) {
  if (typeof value !== 'string') return value;
  const parsed = parseSmartJson(value, { requireObject: true, maxLength: 1_000_000 });
  if (!parsed.ok) throw actorError((parsed as { message: string }).message, 'ACTOR_STAGE_JSON_INVALID', {
    stageKey: expectedStageKey,
    warnings: parsed.warnings,
  });
  return parsed.value;
}

export function parseActorStageResult(value: unknown, expectedStageKey: string) {
  const parsed = typeof value === 'string'
    ? parseSmartJson(value, { requireObject: true, maxLength: 1_000_000 })
    : { ok: true as const, value, warnings: [], repaired: false, foundJsonBlock: false };
  if (!parsed.ok) throw actorError((parsed as { message: string }).message, 'ACTOR_STAGE_JSON_INVALID', { stageKey: expectedStageKey, warnings: parsed.warnings });
  let wrapper = record(parsed.value);
  let suppliedStageKey = String(wrapper.stageKey ?? wrapper.stage?.key ?? '').trim();
  for (let depth = 0; depth < 4; depth += 1) {
    const envelope = wrapper.actorWorkflowUpdate
      ?? wrapper.actorWorkflow
      ?? wrapper.actor_workflow
      ?? wrapper.data
      ?? wrapper.payload;
    const candidate = wrapper.stageResult
      ?? wrapper.actorStageResult
      ?? wrapper.actor_stage_result
      ?? wrapper.result
      ?? wrapper.output
      ?? envelope
      ?? wrapper[expectedStageKey];
    if (candidate === undefined || candidate === wrapper) break;
    wrapper = record(parseNestedStageValue(candidate, expectedStageKey));
    suppliedStageKey ||= String(wrapper.stageKey ?? wrapper.stage?.key ?? '').trim();
  }
  if (suppliedStageKey && suppliedStageKey !== expectedStageKey) {
    throw actorError(`Expected stage ${expectedStageKey}, but received ${suppliedStageKey}.`, 'ACTOR_STAGE_OUT_OF_ORDER', {
      expectedStageKey,
      suppliedStageKey,
    });
  }
  const payload = record(wrapper.stageResult ?? wrapper.actorStageResult ?? wrapper.actor_stage_result ?? wrapper.result ?? wrapper.output ?? wrapper);
  const validation = validateWorkflowStageContractPayload(expectedStageKey, payload);
  const definition = getWorkflowStageSequence(expectedStageKey.startsWith('monster.') ? 'monster' : 'npc')
    .find((entry) => entry.key === expectedStageKey);
  if (!validation.ok) {
    const validationError = (validation as { ok: false; error: string }).error;
    throw actorError(`Stage ${expectedStageKey} did not satisfy its contract: ${validationError}`, 'ACTOR_STAGE_INVALID', {
      stageKey: expectedStageKey,
      validationError,
      requiredKeys: definition?.contract?.requiredKeys ?? [],
      allowedKeys: definition?.contract?.outputAllowedKeys ?? [],
      receivedKeys: Object.keys(payload),
      expectedShape: {
        stageKey: expectedStageKey,
        stageResult: Object.fromEntries((definition?.contract?.requiredKeys ?? []).map((key) => [key, `<${key}>`])),
      },
    });
  }
  return definition?.contract
    ? pruneWorkflowStageOutput(payload, definition.contract.outputAllowedKeys) as JsonRecord
    : payload;
}

export function buildActorStagePacket(state: ActorWorkflowDocument) {
  const workflow = getWorkflowDefinition(state.kind);
  const stages = getWorkflowStageSequence(state.kind);
  const stage = stages[state.currentStageIndex];
  if (!workflow || !stage) return null;
  return {
    task: `Complete one ${workflow.label} stage for a canonical campaign actor.`,
    workflowId: state._id,
    actorKind: state.kind,
    stage: {
      key: stage.key,
      label: stage.label,
      number: state.currentStageIndex + 1,
      total: stages.length,
    },
    identity: state.identityHints,
    purpose: state.purpose,
    constraints: [
      'Preserve established campaign facts and actor identity.',
      'Create concrete story and mechanical detail; do not merely describe what is missing.',
      'Equipment, weapons, armor, and carried treasure are fixed actor inventory and must be usable or discoverable in play.',
      'Return only the requested stage fields. Do not include markdown or commentary.',
      `Return exactly one JSON object shaped as {"stageKey":"${stage.key}","stageResult":{...}}. Do not wrap it in responseMode, responseText, notes, or another assistant-response envelope.`,
      ...(stage.key === 'spellcasting' ? ['For a non-spellcaster, use spellcasting_ability "none", spell_save_dc 0, and spell_attack_bonus 0.'] : []),
    ],
    context: {
      actorSnapshot: state.actorSnapshot,
      completedStages: state.stageResults,
    },
    contract: {
      allowedKeys: stage.contract?.outputAllowedKeys ?? [],
      requiredKeys: stage.contract?.requiredKeys ?? [],
      fieldRules: stage.contract?.fieldRules ?? {},
    },
    returnSchema: {
      stageKey: stage.key,
      stageResult: Object.fromEntries((stage.contract?.requiredKeys ?? []).map((key) => [key, `<${key}>`])),
    },
    previousValidationError: state.error?.message ?? null,
  };
}

function actorResponse(entity: any, created: boolean, workflowId?: string) {
  const actor = record(entity?.details?.actorProfile ?? entity?.details);
  return {
    status: 'ready',
    created,
    workflowId: workflowId ?? entity?.details?.generation?.workflowId ?? null,
    actor: {
      canonicalEntityId: String(entity?._id ?? ''),
      canonicalRevision: Math.max(1, Number(entity?.revision ?? 1)),
      schemaVersion: String(entity?.schema_version ?? entity?.details?.schemaVersion ?? ''),
      kind: entity?.type,
      name: entity?.canonical_name ?? actor.name,
      profileCompleteness: String(entity?.details?.profileCompleteness ?? 'full'),
      profile: actor,
    },
  };
}

async function finalizeWorkflow(state: ActorWorkflowDocument) {
  const composed = composeActorProfile(state.kind, state.actorSnapshot, state.stageResults);
  const validation = validateActorProfile(state.kind, composed);
  if (!validation.valid) {
    await collections.actorWorkflows().updateOne(
      { _id: state._id, userId: state.userId },
      { $set: { status: 'error', error: { code: 'ACTOR_PROFILE_INVALID', details: validation.details }, updatedAt: new Date() } },
    );
    throw actorError('The completed workflow did not compose into a valid canonical actor.', 'ACTOR_PROFILE_INVALID', {
      workflowId: state._id,
      validationError: validation.details,
    });
  }
  const entity = await upsertCanonicalActor(
    state.userId,
    state.campaignId,
    state.kind,
    validation.actor,
    {
      workflowId: state._id,
      executionMode: state.executionMode,
      purpose: state.purpose,
      completedStages: state.stageSequence,
      stageCount: state.stageSequence.length,
      warnings: 'warnings' in validation ? validation.warnings : [],
    },
    state.canonicalEntityId,
  );
  const completedAt = new Date();
  await collections.actorWorkflows().updateOne(
    { _id: state._id, userId: state.userId },
    { $set: { status: 'complete', canonicalEntityId: entity?._id, completedAt, updatedAt: completedAt, error: null } },
  );
  return actorResponse(entity, !state.canonicalEntityId, state._id);
}

async function acceptStage(state: ActorWorkflowDocument, result: unknown) {
  const stageKey = state.stageSequence[state.currentStageIndex];
  if (!stageKey) return state;
  const payload = parseActorStageResult(result, stageKey);
  const timestamp = new Date();
  const next: ActorWorkflowDocument = {
    ...state,
    stageResults: { ...state.stageResults, [stageKey]: payload },
    attempts: [...state.attempts, { stageKey, status: 'accepted', at: timestamp }],
    currentStageIndex: state.currentStageIndex + 1,
    status: state.currentStageIndex + 1 >= state.stageSequence.length ? 'running' : 'awaiting_ai',
    error: null,
    updatedAt: timestamp,
  };
  await collections.actorWorkflows().updateOne(
    { _id: state._id, userId: state.userId },
    { $set: {
      stageResults: next.stageResults,
      attempts: next.attempts,
      currentStageIndex: next.currentStageIndex,
      status: next.status,
      error: null,
      updatedAt: timestamp,
    } },
  );
  return next;
}

async function runIntegratedWorkflow(state: ActorWorkflowDocument) {
  let current = state;
  while (current.currentStageIndex < current.stageSequence.length) {
    const packet = buildActorStagePacket(current);
    if (!packet) break;
    let accepted: ActorWorkflowDocument | null = null;
    let lastError: any = null;
    for (let attempt = 1; attempt <= 2 && !accepted; attempt += 1) {
      try {
        const generated = await generateStructuredJson(
          'Execute the supplied GMC actor-workflow stage. Honor its allowed keys, required keys, field rules, continuity context, and return schema exactly.',
          { ...packet, ...(lastError ? { previousValidationError: lastError.message } : {}) },
          { operation: `actor-workflow:${state.kind}:${packet.stage.key}`, correlationId: state._id },
        );
        accepted = await acceptStage(current, generated);
      } catch (error: any) {
        lastError = error;
        await collections.actorWorkflows().updateOne(
          { _id: current._id, userId: current.userId },
          { $push: { attempts: { stageKey: packet.stage.key, status: 'rejected', attempt, error: error?.message ?? String(error), at: new Date() } }, $set: { updatedAt: new Date() } } as any,
        );
      }
    }
    if (!accepted) {
      const fallbackReason = `Integrated generation could not complete ${packet.stage.label}: ${lastError?.message ?? String(lastError)}`;
      const fallbackState: ActorWorkflowDocument = {
        ...current,
        executionMode: 'manual',
        status: 'awaiting_ai',
        error: { code: 'ACTOR_STAGE_FAILED', stageKey: packet.stage.key, message: fallbackReason },
        updatedAt: new Date(),
      };
      await collections.actorWorkflows().updateOne(
        { _id: current._id, userId: current.userId },
        { $set: { executionMode: 'manual', status: 'awaiting_ai', error: fallbackState.error, updatedAt: fallbackState.updatedAt } },
      );
      return {
        status: 'awaiting_ai',
        workflowId: fallbackState._id,
        packet: buildActorStagePacket(fallbackState),
        fallbackReason,
      };
    }
    current = accepted;
  }
  return finalizeWorkflow(current);
}

export async function ensureCampaignActor(userId: string, campaignId: string, input: ActorEnsureInput) {
  const kind: GmcActorKind = input.kind === 'monster' ? 'monster' : 'npc';
  const requiredDetail: ActorProfileDetail = input.requiredDetail === 'combat_ready' ? 'combat_ready' : 'full';
  const executionMode: ActorExecutionMode = input.executionMode === 'manual' ? 'manual' : 'integrated';
  if (input.workflowId) {
    const state = await collections.actorWorkflows().findOne({ _id: input.workflowId, userId, campaignId }) as ActorWorkflowDocument | null;
    if (!state) throw Object.assign(new Error('Actor workflow not found.'), { status: 404, code: 'ACTOR_WORKFLOW_NOT_FOUND' });
    if (state.status === 'complete' && state.canonicalEntityId) {
      const entity = await findActorEntity(userId, campaignId, state.kind, { canonicalEntityId: state.canonicalEntityId });
      if (entity) return actorResponse(entity, false, state._id);
    }
    if (input.stageResult === undefined) {
      return { status: 'awaiting_ai', workflowId: state._id, packet: buildActorStagePacket(state) };
    }
    let next: ActorWorkflowDocument;
    try {
      next = await acceptStage(state, input.stageResult);
    } catch (error: any) {
      const timestamp = new Date();
      await collections.actorWorkflows().updateOne(
        { _id: state._id, userId, campaignId },
        {
          $push: { attempts: { stageKey: state.stageSequence[state.currentStageIndex], status: 'rejected', error: error?.message ?? String(error), details: error?.details ?? {}, at: timestamp } },
          $set: { status: 'awaiting_ai', error: { code: error?.code ?? 'ACTOR_STAGE_INVALID', message: error?.message ?? String(error), details: error?.details ?? {} }, updatedAt: timestamp },
        } as any,
      );
      throw error;
    }
    if (next.currentStageIndex >= next.stageSequence.length) return finalizeWorkflow(next);
    return { status: 'awaiting_ai', workflowId: next._id, packet: buildActorStagePacket(next) };
  }

  const actorSnapshot = record(input.actorSnapshot);
  const name = String(input.identityHints?.name ?? actorSnapshot.name ?? '').trim();
  if (!name) throw Object.assign(new Error('identityHints.name or actorSnapshot.name is required.'), { status: 400, code: 'VALIDATION_ERROR' });
  const aliases = stringArray(input.identityHints?.aliases ?? actorSnapshot.aliases);
  const existing = await findActorEntity(userId, campaignId, kind, {
    canonicalEntityId: input.canonicalEntityId,
    name,
    aliases,
  });
  const existingCompleteness = String((existing as any)?.details?.profileCompleteness ?? '');
  if (existing && existingCompleteness === 'full') {
    const validation = validateActorProfile(kind, record((existing as any).details?.actorProfile));
    if (validation.valid) return actorResponse(existing, false);
  }
  if (existing && requiredDetail === 'combat_ready' && existingCompleteness === 'combat_ready') {
    const validation = validateCombatReadyActorProfile(kind, record((existing as any).details?.actorProfile));
    if (validation.valid) return actorResponse(existing, false);
  }

  if (requiredDetail === 'combat_ready') {
    const validation = validateCombatReadyActorProfile(kind, { ...record((existing as any)?.details?.actorProfile), ...actorSnapshot, name, aliases });
    if (!validation.valid) {
      throw actorError('The encounter packet does not contain enough mechanics for a combat-ready actor.', 'COMBAT_READY_ACTOR_INVALID', {
        validationError: validation.details,
      });
    }
    const entity = await upsertCanonicalActor(
      userId,
      campaignId,
      kind,
      validation.actor,
      {
        profileCompleteness: 'combat_ready',
        schemaVersion: `${kind}/combat-ready/1.0`,
        source: 'gmc-encounter-contract',
        executionMode: 'deterministic',
        purpose: String(input.purpose ?? 'Store the mechanics and identity needed for this encounter actor.'),
      },
      existing?._id,
    );
    return actorResponse(entity, !existing);
  }

  const workflow = getWorkflowDefinition(kind);
  if (!workflow) throw actorError(`No workflow is registered for ${kind}.`, 'ACTOR_WORKFLOW_UNAVAILABLE');
  const timestamp = new Date();
  const state: ActorWorkflowDocument = {
    _id: randomUUID(),
    userId,
    campaignId,
    kind,
    normalizedName: name.toLowerCase(),
    canonicalEntityId: existing?._id,
    purpose: String(input.purpose ?? `Create a complete reusable ${kind} record for campaign play.`).trim(),
    actorSnapshot: {
      ...record((existing as any)?.details?.actorProfile),
      ...actorSnapshot,
      name,
      aliases,
    },
    identityHints: { name, aliases },
    executionMode,
    status: executionMode === 'manual' ? 'awaiting_ai' : 'running',
    stageSequence: [...workflow.stageKeys],
    currentStageIndex: 0,
    stageResults: {},
    attempts: [],
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await collections.actorWorkflows().insertOne(state);
  if (executionMode === 'manual') {
    return { status: 'awaiting_ai', workflowId: state._id, packet: buildActorStagePacket(state) };
  }
  return runIntegratedWorkflow(state);
}
