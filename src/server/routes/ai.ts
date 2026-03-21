/**
 * AI routes: Gemini provider-first stage automation backend proxy
 * Keeps Gemini API key server-side only and returns structured responses for stage runs.
 */

import { Router, type Request, type Response as ExpressResponse } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  getWorkflowStageProxyAllowedKeys,
  getWorkflowStageDefinition,
  isWorkflowStageCriticalZeroGuard,
  normalizeWorkflowStageId,
} from '../../shared/generation/workflowRegistry.js';
import { resolveWorkflowContentType } from '../../shared/generation/workflowContentType.js';
import { repairWorkflowStagePayload } from '../../shared/generation/workflowStageRepair.js';
import { validateWorkflowStageContractPayload as validateSharedWorkflowStageContractPayload } from '../../shared/generation/workflowStageValidation.js';
import type {
  WorkflowAcceptanceState,
  WorkflowCanonSummary,
  WorkflowClaimStatus,
  WorkflowConflictItem,
  WorkflowConflictSummary,
} from '../../shared/generation/workflowTypes.js';
import {
  createWorkflowChatFailure,
  createWorkflowChatSuccess,
  createWorkflowExecutionFailure,
  createWorkflowExecutionSuccess,
  type WorkflowExecutionErrorType as AiErrorType,
  type WorkflowExecutionOutcome,
  type WorkflowExecutionRetryContext,
  type WorkflowChatFailureResponse,
  type WorkflowChatRequestBody,
  type WorkflowChatSuccessResponse,
  type WorkflowExecutionFailureResponse as GeminiFailureResponse,
  type WorkflowExecutionRequestBody as GeminiRequestBody,
  type WorkflowExecutionSuccessResponse as GeminiSuccessResponse,
} from '../services/workflowExecutionService.js';

const SPELLCASTING_ALLOWED_KEYS = [...(getWorkflowStageProxyAllowedKeys('spellcasting') ?? [])];
const REVIEW_DRIVEN_STAGE_KEYS = new Set(['fact_checker', 'canon_validator', 'editor_&_style']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

function cloneWorkflowCanonSummary(summary: WorkflowCanonSummary): WorkflowCanonSummary {
  return {
    ...summary,
    entityNames: [...summary.entityNames],
    gaps: [...summary.gaps],
  };
}

function createWorkflowConflictItems(value: unknown, status: WorkflowClaimStatus): WorkflowConflictItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: WorkflowConflictItem[] = [];
  value.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const message = entry.trim();
      if (!message) {
        return;
      }

      items.push({
        key: `${status}:${message.toLowerCase()}:${index}`,
        status,
        message,
      });
      return;
    }

    if (!isRecord(entry)) {
      return;
    }

    const message = asTrimmedString(entry.description)
      ?? asTrimmedString(entry.summary)
      ?? asTrimmedString(entry.new_claim)
      ?? asTrimmedString(entry.text)
      ?? asTrimmedString(entry.reason)
      ?? asTrimmedString(entry.clarification_needed)
      ?? asTrimmedString(entry.validation_notes);

    if (!message) {
      return;
    }

    const fieldPath = asTrimmedString(entry.field_path) ?? asTrimmedString(entry.path) ?? asTrimmedString(entry.field);
    const severity = asTrimmedString(entry.severity);
    const currentValue = asTrimmedString(entry.current_value) ?? asTrimmedString(entry.text);
    const proposedValue = asTrimmedString(entry.proposed_value)
      ?? asTrimmedString(entry.recommended_revision)
      ?? asTrimmedString(entry.new_claim);

    items.push({
      key: `${status}:${(fieldPath ?? String(index)).toLowerCase()}:${message.toLowerCase()}`,
      status,
      message,
      fieldPath,
      severity,
      currentValue,
      proposedValue,
    });
  });

  return items;
}

function resolveClientCanonSummary(body: GeminiRequestBody): WorkflowCanonSummary | undefined {
  const memorySummary = body.clientContext?.memorySummary;
  if (!memorySummary) {
    return undefined;
  }

  if (memorySummary.canon) {
    return cloneWorkflowCanonSummary(memorySummary.canon);
  }

  return {
    groundingStatus: memorySummary.factpack.groundingStatus,
    factCount: memorySummary.factpack.factCount,
    entityNames: [...memorySummary.factpack.entityNames],
    gaps: [...memorySummary.factpack.gaps],
  };
}

function summarizeWorkflowConflicts(
  stageKey: string,
  payload: Record<string, unknown>,
  canon: WorkflowCanonSummary | undefined,
): WorkflowConflictSummary {
  const unsupportedStatus: WorkflowClaimStatus = canon?.groundingStatus === 'ungrounded'
    ? 'unsupported_ungrounded'
    : 'additive_unverified';

  const deduped = new Map<string, WorkflowConflictItem>();
  for (const item of [
    ...createWorkflowConflictItems(payload.conflicts, 'conflicting'),
    ...createWorkflowConflictItems(payload.ambiguities, 'ambiguous'),
    ...createWorkflowConflictItems(payload.unassociated, unsupportedStatus),
  ]) {
    if (!deduped.has(item.key)) {
      deduped.set(item.key, item);
    }
  }

  const items = Array.from(deduped.values()).slice(0, 12);
  const ambiguityCount = items.filter((item) => item.status === 'ambiguous').length;
  const conflictCount = items.filter((item) => item.status === 'conflicting').length;
  const additiveCount = items.filter((item) => item.status === 'additive_unverified').length;
  const unsupportedCount = items.filter((item) => item.status === 'unsupported_ungrounded').length;
  const reviewRequired = REVIEW_DRIVEN_STAGE_KEYS.has(stageKey) && (conflictCount > 0 || ambiguityCount > 0);

  return {
    reviewRequired,
    alignedCount: 0,
    additiveCount,
    ambiguityCount,
    conflictCount,
    unsupportedCount,
    items,
    updatedAt: Date.now(),
  };
}

function resolveWorkflowAcceptanceState(
  stageKey: string,
  canon: WorkflowCanonSummary | undefined,
  conflictSummary: WorkflowConflictSummary,
): WorkflowAcceptanceState {
  if (REVIEW_DRIVEN_STAGE_KEYS.has(stageKey) && conflictSummary.conflictCount > 0) {
    return 'review_required_conflict';
  }

  if (REVIEW_DRIVEN_STAGE_KEYS.has(stageKey) && conflictSummary.ambiguityCount > 0) {
    return 'review_required_ambiguity';
  }

  if (conflictSummary.additiveCount > 0 || conflictSummary.unsupportedCount > 0) {
    return 'accepted_with_additions';
  }

  if (canon?.groundingStatus === 'ungrounded') {
    return 'accepted_ungrounded_warning';
  }

  return 'accepted';
}

function getNormalizedStageKey(stageId: string, workflowType?: string): string {
  if (workflowType) {
    const scopedDefinition = getWorkflowStageDefinition(resolveWorkflowContentType(workflowType), stageId);
    if (scopedDefinition) {
      return scopedDefinition.key;
    }
  }

  return normalizeWorkflowStageId(stageId) ?? stageId.toLowerCase();
}

function getStageAllowedKeys(stageId: string, registry: StageRegistryEntry, workflowType?: string): string[] {
  if (workflowType) {
    const scopedDefinition = getWorkflowStageDefinition(resolveWorkflowContentType(workflowType), stageId);
    const scopedContract = scopedDefinition?.contract;
    if (scopedContract) {
      return [...(scopedContract.proxyAllowedKeys ?? scopedContract.outputAllowedKeys)];
    }
  }

  return [...(getWorkflowStageProxyAllowedKeys(stageId) ?? registry.allowedPaths)];
}

function getAutomaticWorkflowRetryDelayMs(stageId: string, workflowType?: string): number {
  if (workflowType) {
    const scopedDefinition = getWorkflowStageDefinition(resolveWorkflowContentType(workflowType), stageId);
    const scopedCooldownMs = scopedDefinition?.retryPolicy?.cooldownMs;
    if (typeof scopedCooldownMs === 'number' && Number.isFinite(scopedCooldownMs) && scopedCooldownMs > 0) {
      return Math.max(scopedCooldownMs, MIN_REQUEST_SPACING_MS);
    }
  }

  return Math.max(5000, MIN_REQUEST_SPACING_MS);
}

function pruneToAllowedKeys(allowedKeys: string[], payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowedKeys.includes(key)));
}

function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((v) => typeof v === 'string' && v.trim().length > 0);
}

function hasNonEmptySpellMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some((entry) => hasNonEmptyStringArray(entry));
}

function normalizeKeywordArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    const str = typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim();
    if (!str) continue;
    if (seen.has(str)) continue;
    seen.add(str);
    normalized.push(str);
  }
  return normalized;
}

/**
 * Validate raw keyword_extractor payload compliance, normalizing keyword strings and enforcing non-empty output.
 */
function evaluateKeywordExtractorCompliance(
  payload: Record<string, unknown>,
):
  | {
      ok: true;
      rawKeywordCount: number;
      prunedKeywordCount: number;
      normalizedKeywords: string[];
    }
  | {
      ok: false;
      rawKeywordCount: number;
      prunedKeywordCount: number;
      normalizedKeywords: string[];
      message: string;
    } {
  const rawKeywords = normalizeKeywordArray((payload as any)?.keywords);
  const normalizedKeywords = rawKeywords.length > 0 ? rawKeywords : [];

  if (normalizedKeywords.length === 0) {
    return {
      ok: false,
      rawKeywordCount: rawKeywords.length,
      prunedKeywordCount: 0,
      normalizedKeywords: [] as string[],
      message: 'keyword_extractor returned no usable keywords.',
    };
  }

  return {
    ok: true,
    rawKeywordCount: rawKeywords.length,
    prunedKeywordCount: normalizedKeywords.length,
    normalizedKeywords,
  };
}

function sumSpellSlots(value: unknown): number {
  if (!isRecord(value)) return 0;
  let total = 0;
  for (const slotCount of Object.values(value)) {
    if (typeof slotCount === 'number' && Number.isFinite(slotCount)) {
      total += slotCount;
      continue;
    }
    const coerced = Number(slotCount);
    if (Number.isFinite(coerced)) total += coerced;
  }
  return total;
}

function getAbilityModifier(score: unknown): number | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined;
  return Math.floor((score - 10) / 2);
}

function computeHalfCasterSlots(level?: number): Record<string, number> {
  if (!Number.isFinite(level)) return {};
  const table: Record<number, Record<string, number>> = {
    1: { 1: 0 },
    2: { 1: 2 },
    3: { 1: 3 },
    4: { 1: 3 },
    5: { 1: 4, 2: 2 },
    6: { 1: 4, 2: 2 },
    7: { 1: 4, 2: 3 },
    8: { 1: 4, 2: 3 },
    9: { 1: 4, 2: 3, 3: 2 },
    10: { 1: 4, 2: 3, 3: 2 },
    11: { 1: 4, 2: 3, 3: 2, 4: 1 },
    12: { 1: 4, 2: 3, 3: 2, 4: 1 },
    13: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    14: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    15: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    16: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    17: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
    18: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 1 },
    19: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 1 },
    20: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 1 },
  };
  const nearest = Object.keys(table)
    .map((k) => Number(k))
    .filter((k) => k <= (level as number))
    .sort((a, b) => b - a)[0];
  return nearest ? table[nearest] : {};
}

function deriveSpellcastingFromContext(payload: Record<string, unknown>): Record<string, unknown> {
  const classLevels = Array.isArray((payload as any).class_levels) ? (payload as any).class_levels : [];
  const primaryClassEntry = classLevels[0] && typeof classLevels[0] === 'object' ? (classLevels[0] as any) : null;
  const className = typeof primaryClassEntry?.class === 'string' ? primaryClassEntry.class : '';
  const subclass = typeof primaryClassEntry?.subclass === 'string' ? primaryClassEntry.subclass : undefined;
  const level = Number.isFinite(primaryClassEntry?.level as number) ? (primaryClassEntry?.level as number) : undefined;

  const abilityScores = isRecord((payload as any).ability_scores) ? ((payload as any).ability_scores as Record<string, unknown>) : {};
  const proficiencyBonus = typeof (payload as any).proficiency_bonus === 'number' ? (payload as any).proficiency_bonus : undefined;

  const normalizedClass = className.toLowerCase();
  const abilityKey =
    normalizedClass === 'wizard' || normalizedClass === 'artificer'
      ? 'int'
      : normalizedClass === 'cleric' || normalizedClass === 'druid' || normalizedClass === 'ranger'
      ? 'wis'
      : 'cha';
  const abilityScore = abilityScores[abilityKey];
  const abilityMod = getAbilityModifier(abilityScore);

  const derivedDc = abilityMod !== undefined && proficiencyBonus !== undefined ? 8 + abilityMod + proficiencyBonus : undefined;
  const derivedAttack = abilityMod !== undefined && proficiencyBonus !== undefined ? abilityMod + proficiencyBonus : undefined;
  const derivedSlots = normalizedClass === 'paladin' || normalizedClass === 'ranger' ? computeHalfCasterSlots(level) : {};

  const derivedPayload: Record<string, unknown> = {};
  if (!payload.spellcasting_ability && abilityKey) derivedPayload.spellcasting_ability = abilityKey.toUpperCase();
  if (!payload.spell_save_dc && derivedDc !== undefined) derivedPayload.spell_save_dc = derivedDc;
  if (!payload.spell_attack_bonus && derivedAttack !== undefined) derivedPayload.spell_attack_bonus = derivedAttack;
  if (!payload.spell_slots && Object.keys(derivedSlots).length > 0) derivedPayload.spell_slots = derivedSlots;
  if (!payload.always_prepared_spells && subclass) derivedPayload.always_prepared_spells = { [subclass]: [] };

  return derivedPayload;
}

function validateSpellcastingSemantic(
  payload: Record<string, unknown>,
  rawAllowedKeyCount: number,
): { issues: string[]; synthesizedFieldCount: number } {
  const issues: string[] = [];

  const ability = payload.spellcasting_ability;
  if (typeof ability !== 'string' || ability.trim().length === 0) {
    issues.push('spellcasting_ability missing');
  }

  const saveDc = payload.spell_save_dc;
  if (typeof saveDc !== 'number' || !Number.isFinite(saveDc) || saveDc < 10) {
    issues.push('spell_save_dc must be a number >= 10');
  }

  const attackBonus = payload.spell_attack_bonus;
  if (typeof attackBonus !== 'number' || !Number.isFinite(attackBonus) || attackBonus < 1) {
    issues.push('spell_attack_bonus must be a number >= 1');
  }

  const hasPrepared = hasNonEmptySpellMap(payload.prepared_spells);
  const hasAlwaysPrepared = hasNonEmptySpellMap(payload.always_prepared_spells);
  const hasInnate = hasNonEmptySpellMap(payload.innate_spells);
  const hasKnown = hasNonEmptyStringArray(payload.spells_known);

  if (!hasPrepared && !hasAlwaysPrepared && !hasInnate && !hasKnown) {
    issues.push('No spells provided (prepared, always_prepared, innate, or spells_known).');
  }

  const totalSlots = sumSpellSlots(payload.spell_slots);
  const isSlotCaster = hasPrepared || hasAlwaysPrepared || hasKnown;
  if (isSlotCaster && totalSlots <= 0) {
    issues.push('spell_slots must include at least one slot for slot-based casters.');
  }

  const normalizedAllowedCount = SPELLCASTING_ALLOWED_KEYS.filter(
    (key) => Object.prototype.hasOwnProperty.call(payload, key),
  ).length;
  const synthesizedFieldCount = Math.max(0, normalizedAllowedCount - rawAllowedKeyCount);

  return { issues, synthesizedFieldCount };
}

function normalizeArmorClass(container: Record<string, unknown>): void {
  const ac = (container as Record<string, unknown>).armor_class as unknown;
  const coerceEntry = (entry: unknown): { type: string; value: number } | null => {
    if (typeof entry === 'number') return { type: 'base', value: entry };
    if (typeof entry === 'string') {
      const n = Number(entry);
      return Number.isFinite(n) ? { type: 'base', value: n } : null;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const obj = entry as Record<string, unknown>;
      const v = typeof obj.value === 'number' ? obj.value : Number(obj.value);
      const t = typeof obj.type === 'string' ? obj.type : 'base';
      return Number.isFinite(v) ? { type: t, value: v } : null;
    }
    return null;
  };

  if (ac === undefined) return;
  if (Array.isArray(ac)) {
    const normalized = ac
      .map(coerceEntry)
      .filter((v): v is { type: string; value: number } => v !== null);
    if (normalized.length > 0) {
      (container as Record<string, unknown>).armor_class = normalized;
      return;
    }
    delete (container as Record<string, unknown>).armor_class;
    return;
  }

  const coerced = coerceEntry(ac);
  if (coerced) {
    (container as Record<string, unknown>).armor_class = Math.round(coerced.value);
  } else {
    delete (container as Record<string, unknown>).armor_class;
  }
}

function shouldApplyGeneratorSchemaValidation(
  stageId: string,
  workflowType: string | undefined,
  _registry: StageRegistryEntry,
): boolean {
  if (!workflowType) {
    return true;
  }

  const scopedDefinition = getWorkflowStageDefinition(resolveWorkflowContentType(workflowType), stageId);
  return !scopedDefinition?.contract;
}

interface StageRegistryEntry {
  allowedPaths: string[];
  schemaVersion: string;
  schema: { properties?: Record<string, unknown> };
}

/** Ensure patch only targets the provided stageId and is an object */
function validateScope(stageId: string, patch: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== stageId) {
    return { ok: false, message: `Patch must contain only the current stageId (${stageId}).` };
  }
  let payload = patch[stageId];

  // Coerce common mis-shapes for equipment stage (model sometimes returns an array directly)
  if (Array.isArray(payload) && stageId.toLowerCase().includes('equipment')) {
    patch[stageId] = { equipment: payload } as Record<string, unknown>;
    payload = patch[stageId];
  } else if (typeof payload === 'string' && stageId.toLowerCase().includes('equipment')) {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        patch[stageId] = { equipment: parsed } as Record<string, unknown>;
        payload = patch[stageId];
      }
    } catch (_) {
      patch[stageId] = { equipment: [payload] } as Record<string, unknown>;
      payload = patch[stageId];
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Stage payload must be an object.' };
  }

  // Basic object validation using Ajv (no schema details yet)
  const validate = ajv.compile({ type: 'object' });
  const isValid = validate(payload);
  if (!isValid) {
    return { ok: false, message: 'Stage payload failed object validation.' };
  }
  return { ok: true };
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const MAX_PATCH_BYTES = 200_000;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 2;
const MAX_SCHEMA_CORRECTION_ATTEMPTS = 1;
const MIN_REQUEST_SPACING_MS = 2000;
const aiRouter = Router();
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

/** Load and cache per-generator schema for allowlist and validation */
const schemaCache: Record<string, StageRegistryEntry | undefined> = {};
const validatorCache: Record<string, ValidateFunction | undefined> = {};
let baseSchemaPropertiesCache: Record<string, unknown> | null | undefined;
let baseSchemaDefinitionsCache: Record<string, unknown> | null | undefined;
const idempotencyCache: Map<
  string,
  { status: number; payload: GeminiSuccessResponse | GeminiFailureResponse; expiresAt: number }
> = new Map();
const retrySignatureCache: Map<string, { signature: string; expiresAt: number }> = new Map();
const lastRequestByProject: Map<string, number> = new Map();

type GeminiHttpResponse = {
  ok: boolean;
  status: number;
  headers?: { get?: (name: string) => string | null };
  json: () => Promise<unknown>;
};

let lastRateLimitAt = 0;

function getCachedResponse(key: string): { status: number; payload: GeminiSuccessResponse | GeminiFailureResponse } | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return { status: entry.status, payload: entry.payload };
}

function setCachedResponse(key: string, status: number, payload: GeminiSuccessResponse | GeminiFailureResponse): void {
  idempotencyCache.set(key, { status, payload, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

function computeRetrySignature(body: GeminiRequestBody): string {
  const hash = createHash('sha256');
  hash.update(body.stageId || '');
  hash.update('|');
  hash.update(body.prompt || '');
  if (body.clientContext?.generatorType) hash.update(body.clientContext.generatorType);
  if (body.clientContext?.stageKey) hash.update(body.clientContext.stageKey);
  return hash.digest('hex');
}

function isDuplicateRetry(body: GeminiRequestBody, signature: string): boolean {
  const key = `${body.projectId}:${body.stageId}`;
  const cached = retrySignatureCache.get(key);
  if (!cached) return false;
  if (Date.now() > cached.expiresAt) {
    retrySignatureCache.delete(key);
    return false;
  }
  return cached.signature === signature;
}

function storeRetrySignature(body: GeminiRequestBody, signature: string): void {
  const key = `${body.projectId}:${body.stageId}`;
  retrySignatureCache.set(key, { signature, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

function loadBaseSchemaProperties(): Record<string, unknown> {
  if (baseSchemaPropertiesCache !== undefined) {
    return baseSchemaPropertiesCache ?? {};
  }

  try {
    const raw = readFileSync(path.join(process.cwd(), 'src/server/schemas/base.schema.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const definitions = isRecord(parsed.definitions) ? parsed.definitions : {};
    const baseOutput = isRecord(definitions.baseOutput) ? definitions.baseOutput : {};
    const properties = isRecord(baseOutput.properties) ? baseOutput.properties : {};
    baseSchemaPropertiesCache = { ...properties };
    return baseSchemaPropertiesCache;
  } catch (err) {
    console.error('[AI][Gemini] Failed to load legacy base schema properties', err);
    baseSchemaPropertiesCache = null;
    return {};
  }
}

function loadBaseSchemaDefinitions(): Record<string, unknown> {
  if (baseSchemaDefinitionsCache !== undefined) {
    return baseSchemaDefinitionsCache ?? {};
  }

  try {
    const raw = readFileSync(path.join(process.cwd(), 'src/server/schemas/base.schema.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const definitions = isRecord(parsed.definitions) ? parsed.definitions : {};
    baseSchemaDefinitionsCache = { ...definitions };
    return baseSchemaDefinitionsCache;
  } catch (err) {
    console.error('[AI][Gemini] Failed to load legacy base schema definitions', err);
    baseSchemaDefinitionsCache = null;
    return {};
  }
}

function extractSchemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? { ...schema.properties } : {};
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];

  for (const entry of allOf) {
    if (isRecord(entry) && entry.$ref === 'base.schema.json#/definitions/baseOutput') {
      Object.assign(properties, loadBaseSchemaProperties());
    }
  }

  return properties;
}

function buildContractOnlyRegistry(
  stageId: string,
  generatorType: string,
  schemaVersion: string,
): StageRegistryEntry | null {
  const workflowType = resolveWorkflowContentType(generatorType);
  const scopedDefinition = getWorkflowStageDefinition(workflowType, stageId);
  const scopedContract = scopedDefinition?.contract;
  if (!scopedContract) {
    return null;
  }

  const allowedPaths = [...(scopedContract.proxyAllowedKeys ?? scopedContract.outputAllowedKeys)];
  return {
    allowedPaths,
    schemaVersion,
    schema: {
      properties: Object.fromEntries(allowedPaths.map((key) => [key, {}])),
    },
  };
}

function loadSchemaForGenerator(generatorType: string): StageRegistryEntry | null {
  if (schemaCache[generatorType]) return schemaCache[generatorType] || null;

  const candidates = [
    {
      filePath: path.join(process.cwd(), `schema/${generatorType}/v1.1-client.json`),
      schemaVersion: 'v1.1-client',
    },
    {
      filePath: path.join(process.cwd(), `src/server/schemas/${generatorType}.schema.json`),
      schemaVersion: 'v1.1-client',
    },
  ];

  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate.filePath, 'utf-8');
      const schema = JSON.parse(raw) as Record<string, unknown>;
      const properties = extractSchemaProperties(schema);

      properties.keywords = { type: 'array', items: { type: 'string' } };
      properties.retrieval_hints = { type: 'object' };
      properties._meta = { type: 'object' };
      schema.properties = properties;

      const entry: StageRegistryEntry = {
        allowedPaths: Object.keys(properties),
        schemaVersion: candidate.schemaVersion,
        schema,
      };
      schemaCache[generatorType] = entry;
      return entry;
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : undefined;
      if (code === 'ENOENT') {
        continue;
      }
      console.error('[AI][Gemini] Failed to load schema for generator', generatorType, candidate.filePath, err);
    }
  }

  schemaCache[generatorType] = undefined;
  return null;
}

function normalizeScalarStrings(container: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(container, field)) continue;
    const value = container[field];
    if (value === null || value === undefined) {
      delete container[field];
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      container[field] = String(value);
    }
  }
}

/**
 * Normalize personality to an object with array fields. Coerces string to single-item arrays.
 * Ensures schema compliance to avoid '/personality must be object' errors.
 */
function normalizePersonality(container: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(container, 'personality')) return;
  const current = (container as any).personality;
  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
    if (typeof value === 'string') return [value];
    return [];
  };

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    (container as any).personality = { traits: [], ideals: [], bonds: [], flaws: [] };
    return;
  }

  const personality = current as Record<string, unknown>;
  personality.traits = toArray(personality.traits);
  personality.ideals = toArray(personality.ideals);
  personality.bonds = toArray(personality.bonds);
  personality.flaws = toArray(personality.flaws);
  (container as any).personality = personality;
}

/**
 * Normalize stats payload to ensure required shapes exist.
 * Adds defaults for ability_scores, speed, and saving_throws when missing.
 */
function normalizeStats(container: Record<string, unknown>): void {
  const ensureAbilityScores = () => {
    if (!Object.prototype.hasOwnProperty.call(container, 'ability_scores')) return;
    const defaultScores: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number> = {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    };
    const current = container.ability_scores as Record<string, unknown> | undefined;
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      container.ability_scores = { ...defaultScores };
      return;
    }
    const abilityScores: Record<string, unknown> = { ...defaultScores, ...current };
    (Object.keys(defaultScores) as Array<keyof typeof defaultScores>).forEach((key) => {
      const value = abilityScores[key as string];
      if (typeof value !== 'number') {
        abilityScores[key as string] = defaultScores[key];
      }
    });
    container.ability_scores = abilityScores;
  };

  const ensureSpeed = () => {
    if (!Object.prototype.hasOwnProperty.call(container, 'speed')) return;
    const defaultSpeed = { walk: '30 ft.' };
    const current = container.speed as Record<string, unknown> | undefined;
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      container.speed = { ...defaultSpeed };
      return;
    }
    const speed: Record<string, unknown> = { ...defaultSpeed, ...current };
    const speedKeys = ['walk', 'fly', 'swim', 'climb', 'burrow', 'hover'];
    for (const key of speedKeys) {
      const value = speed[key];
      if (value === undefined) continue;
      if (typeof value === 'number') {
        speed[key] = `${value} ft.`;
      } else if (typeof value !== 'string') {
        delete speed[key];
      }
    }
    if (typeof speed.walk !== 'string') speed.walk = defaultSpeed.walk;
    container.speed = speed;
  };

  const ensureSavingThrows = () => {
    if (!Object.prototype.hasOwnProperty.call(container, 'saving_throws')) return;
    const current = container.saving_throws;
    if (!Array.isArray(current)) {
      container.saving_throws = [];
    }
  };

  ensureAbilityScores();
  ensureSpeed();
  ensureSavingThrows();
}

/**
 * For known fields that must be arrays, coerce to [] when present but malformed.
 */
function normalizeArrays(container: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(container, field)) {
      const current = (container as Record<string, unknown>)[field];
      if (!Array.isArray(current)) {
        (container as Record<string, unknown>)[field] = [];
      }
    }
  }
}

function normalizeStringArrays(container: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(container, field)) continue;
    const current = (container as Record<string, unknown>)[field];
    if (!Array.isArray(current)) {
      (container as Record<string, unknown>)[field] = [];
      continue;
    }
    (container as Record<string, unknown>)[field] = current
      .map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
          return String(entry);
        }
        if (entry && typeof entry === 'object') {
          try {
            return JSON.stringify(entry);
          } catch (_) {
            return null;
          }
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  }
}

/**
 * Normalize arrays that must contain objects with name/value to satisfy schema requirements.
 */
function normalizeNameValueArray(container: Record<string, unknown>, field: string, defaultValue = '+0'): void {
  if (!Object.prototype.hasOwnProperty.call(container, field)) return;
  const raw = (container as Record<string, unknown>)[field];
  const items = Array.isArray(raw) ? raw : [];
  const normalized = items
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const name =
          (typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name.trim() : null)
          ?? (typeof obj.skill === 'string' && obj.skill.trim().length > 0 ? obj.skill.trim() : null)
          ?? (typeof obj.save === 'string' && obj.save.trim().length > 0 ? obj.save.trim() : null)
          ?? (typeof obj.ability === 'string' && obj.ability.trim().length > 0 ? obj.ability.trim() : null)
          ?? 'Unknown';
        const value = coerceModifierValue(obj.value ?? obj.modifier ?? obj.bonus, defaultValue);
        const result: Record<string, unknown> = { name, value };
        if (typeof obj.notes === 'string') result.notes = obj.notes;
        return result;
      }
      if (typeof entry === 'string') {
        return parseNameValueStringEntry(entry, defaultValue);
      }
      if (typeof entry === 'number') {
        return { name: String(entry), value: defaultValue } as Record<string, unknown>;
      }
      return null;
    })
    .filter((v): v is Record<string, unknown> => v !== null);

  (container as Record<string, unknown>)[field] = normalized;
}

/**
 * Normalize simple arrays that should contain strings. Coerce scalars to single-element arrays.
 */
function normalizeStringList(container: Record<string, unknown>, field: string): void {
  if (!Object.prototype.hasOwnProperty.call(container, field)) return;
  const value = (container as Record<string, unknown>)[field];
  if (Array.isArray(value)) {
    (container as Record<string, unknown>)[field] = value
      .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null))
      .filter((v): v is string => v !== null);
    return;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    (container as Record<string, unknown>)[field] = [String(value)];
    return;
  }
  (container as Record<string, unknown>)[field] = [];
}

function normalizeSignedModifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '+0';
  return trimmed.startsWith('+') || trimmed.startsWith('-') ? trimmed : `+${trimmed}`;
}

function coerceModifierValue(value: unknown, defaultValue = '+0'): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeSignedModifier(String(Math.trunc(value)));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return normalizeSignedModifier(trimmed);
    }
  }

  return defaultValue;
}

function parseNameValueStringEntry(value: string, defaultValue = '+0'): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*?)(?:\s*\(([+-]?\d+)\)|\s+([+-]?\d+))\s*$/);
  if (!match) {
    return { name: trimmed, value: defaultValue };
  }

  const name = match[1]?.trim();
  const modifier = match[2] ?? match[3];
  if (!name || !modifier) {
    return { name: trimmed, value: defaultValue };
  }

  return {
    name,
    value: normalizeSignedModifier(modifier),
  };
}

/**
 * Coerce hit_points and proficiency_bonus oneOf shapes into schema-compliant values.
 */
function normalizeHitPointsAndProficiency(container: Record<string, unknown>): void {
  const hp = (container as Record<string, unknown>).hit_points as unknown;
  if (hp !== undefined) {
    if (typeof hp === 'string') {
      (container as Record<string, unknown>).hit_points = { formula: hp };
    } else if (typeof hp === 'number') {
      // number is already allowed
      (container as Record<string, unknown>).hit_points = hp;
    } else if (hp && typeof hp === 'object' && !Array.isArray(hp)) {
      const obj = hp as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      if (typeof obj.average === 'number') normalized.average = obj.average;
      if (typeof obj.formula === 'string') normalized.formula = obj.formula;
      if (typeof obj.notes === 'string') normalized.notes = obj.notes;
      (container as Record<string, unknown>).hit_points = Object.keys(normalized).length ? normalized : undefined;
    } else {
      delete (container as Record<string, unknown>).hit_points;
    }
  }

  const prof = (container as Record<string, unknown>).proficiency_bonus as unknown;
  if (prof !== undefined) {
    if (typeof prof === 'number') {
      (container as Record<string, unknown>).proficiency_bonus = prof;
    } else if (typeof prof === 'string') {
      (container as Record<string, unknown>).proficiency_bonus = prof;
    } else {
      (container as Record<string, unknown>).proficiency_bonus = String(prof);
    }
  }
}

/**
 * Normalize arrays of objects requiring name/description (with optional notes/recharge/uses/source).
 */
function normalizeNameDescriptionArray(container: Record<string, unknown>, field: string): void {
  if (!Object.prototype.hasOwnProperty.call(container, field)) return;
  const raw = (container as Record<string, unknown>)[field];
  const items = Array.isArray(raw) ? raw : [];
  const normalized = items
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name : 'Unknown';
        const description = typeof obj.description === 'string' ? obj.description : name;
        const result: Record<string, unknown> = { name, description };
        if (typeof obj.uses === 'string') result.uses = obj.uses;
        if (typeof obj.recharge === 'string') result.recharge = obj.recharge;
        if (typeof obj.notes === 'string') result.notes = obj.notes;
        if (typeof obj.source === 'string') result.source = obj.source;
        return result;
      }
      if (typeof entry === 'string' || typeof entry === 'number') {
        const value = String(entry);
        return { name: value, description: value } as Record<string, unknown>;
      }
      return null;
    })
    .filter((v): v is Record<string, unknown> => v !== null);

  (container as Record<string, unknown>)[field] = normalized;
}

/**
 * Ensure legendary_actions is an object with arrays inside; coerce strings/numbers to object with description.
 */
function normalizeLegendaryActions(container: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(container, 'legendary_actions')) return;
  const current = (container as Record<string, unknown>).legendary_actions;
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    (container as Record<string, unknown>).legendary_actions = {
      actions: [],
      lair_actions: [],
      regional_effects: [],
    };
    return;
  }

  const normalizeList = (value: unknown): Array<Record<string, unknown>> => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry as Record<string, unknown>;
        if (typeof entry === 'string' || typeof entry === 'number') return { name: String(entry), description: String(entry) };
        return null;
      })
      .filter((v): v is Record<string, unknown> => v !== null);
  };

  const obj = current as Record<string, unknown>;
  obj.actions = normalizeList(obj.actions);
  obj.lair_actions = normalizeList(obj.lair_actions);
  obj.regional_effects = normalizeList(obj.regional_effects);
  (container as Record<string, unknown>).legendary_actions = obj;
}

/**
 * Normalize lair_actions and regional_effects (oneOf arrays of strings OR objects with required fields).
 */
function normalizeLairAndRegional(container: Record<string, unknown>): void {
  const coerceOneOfArray = (
    value: unknown,
    objectShape: { required: string[] },
  ): { strings: string[]; objects: Array<Record<string, unknown>> } => {
    const result = { strings: [] as string[], objects: [] as Array<Record<string, unknown>> };
    if (!Array.isArray(value)) return result;

    for (const entry of value) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const hasRequired = objectShape.required.every((k) => typeof obj[k] === 'string');
        if (hasRequired) {
          result.objects.push(obj);
          continue;
        }
      }
      if (typeof entry === 'string' || typeof entry === 'number') {
        result.strings.push(String(entry));
      }
    }
    return result;
  };

  const lair = (container as Record<string, unknown>).lair_actions;
  if (lair !== undefined) {
    const coerced = coerceOneOfArray(lair, { required: ['action', 'description'] });
    if (coerced.objects.length > 0) {
      (container as Record<string, unknown>).lair_actions = coerced.objects;
    } else if (coerced.strings.length > 0) {
      (container as Record<string, unknown>).lair_actions = coerced.strings;
    } else {
      delete (container as Record<string, unknown>).lair_actions;
    }
  }

  const regional = (container as Record<string, unknown>).regional_effects;
  if (regional !== undefined) {
    const coerced = coerceOneOfArray(regional, { required: ['name', 'description'] });
    if (coerced.objects.length > 0) {
      (container as Record<string, unknown>).regional_effects = coerced.objects;
    } else if (coerced.strings.length > 0) {
      (container as Record<string, unknown>).regional_effects = coerced.strings;
    } else {
      delete (container as Record<string, unknown>).regional_effects;
    }
  }
}

function getValidatorForGenerator(generatorType: string, entry: StageRegistryEntry): ValidateFunction | null {
  if (validatorCache[generatorType]) return validatorCache[generatorType] || null;

  // Build a permissive subschema: only known properties, none required, no additionalProperties
  const properties = entry.schema.properties || {};
  const subschema = {
    type: 'object',
    properties,
    definitions: loadBaseSchemaDefinitions(),
    additionalProperties: false,
  } as const;

  try {
    const validateFn = ajv.compile(subschema);
    validatorCache[generatorType] = validateFn;
    return validateFn;
  } catch (err) {
    console.error('[AI][Gemini] Failed to compile validator for generator', generatorType, err);
    validatorCache[generatorType] = undefined;
    return null;
  }
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Validate the incoming request body and return a typed object or an error string.
 */
function parseRequestBody(body: unknown): { valid: true; data: GeminiRequestBody } | { valid: false; message: string } {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request payload' };
  const {
    projectId,
    stageId,
    stageRunId,
    prompt,
    schemaVersion,
    responseFormat,
    clientContext,
  } = body as Record<string, unknown>;

  if (typeof projectId !== 'string' || projectId.trim() === '') return { valid: false, message: 'projectId is required' };
  if (typeof stageId !== 'string' || stageId.trim() === '') return { valid: false, message: 'stageId is required' };
  if (typeof stageRunId !== 'string' || stageRunId.trim() === '') return { valid: false, message: 'stageRunId is required' };
  if (typeof prompt !== 'string' || prompt.trim() === '') return { valid: false, message: 'prompt is required' };
  if (typeof schemaVersion !== 'string' || schemaVersion.trim() === '') return { valid: false, message: 'schemaVersion is required' };

  const ctx = (clientContext && typeof clientContext === 'object' ? clientContext : {}) as GeminiRequestBody['clientContext'];

  return {
    valid: true,
    data: {
      projectId,
      stageId,
      stageRunId,
      prompt,
      schemaVersion,
      responseFormat: typeof responseFormat === 'string' ? responseFormat : 'json_patch_preferred',
      clientContext: ctx,
    },
  };
}

function parseChatRequestBody(body: unknown): { valid: true; data: WorkflowChatRequestBody } | { valid: false; message: string } {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request payload' };
  const {
    systemPrompt,
    userMessage,
  } = body as Record<string, unknown>;

  if (typeof userMessage !== 'string' || userMessage.trim() === '') {
    return { valid: false, message: 'userMessage is required' };
  }

  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    return { valid: false, message: 'systemPrompt must be a string when provided' };
  }

  return {
    valid: true,
    data: {
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
      userMessage,
    },
  };
}

/** Find the first balanced top-level JSON object in text. */
function findBalancedJson(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
      if (depth < 0) break;
    }
  }
  return null;
}

/** Extract JSON patch from a Gemini response text. */
function extractJsonPatch(rawText: string): { ok: true; patch?: Record<string, unknown>; foundJsonBlock: boolean; warnings: string[] } | { ok: false; message: string } {
  const warnings: string[] = [];
  const fencedMatch = rawText.match(/```json\s*\n?([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : findBalancedJson(rawText);
  const foundJsonBlock = Boolean(fencedMatch);

  if (!candidate) {
    return { ok: false, message: 'No JSON object found in response.' };
  }

  if (candidate.length > MAX_PATCH_BYTES) {
    return { ok: false, message: `Patch exceeds size limit (${MAX_PATCH_BYTES} bytes).` };
  }

  try {
    const parsed = JSON.parse(candidate);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'JSON patch must be an object.' };
    }

    // Simple forbidden keys guardrail
    const forbiddenKeys = ['projectId', 'stageId', 'stageRunId'];
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        console.warn(`[AI][Gemini] Stripping forbidden root field '${key}' from patch`);
        delete (parsed as Record<string, unknown>)[key];
      }
    }

    return { ok: true, patch: parsed as Record<string, unknown>, foundJsonBlock, warnings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, message: `Invalid JSON: ${message}` };
  }
}

/** Map HTTP status / provider errors to structured error codes. */
function mapError(status: number, retryAfterMsFromHeader?: number): { type: AiErrorType; retryable: boolean; retryAfterMs?: number } {
  if (status === 429) {
    return {
      type: 'RATE_LIMIT',
      retryable: true,
      retryAfterMs: retryAfterMsFromHeader ?? RATE_LIMIT_COOLDOWN_MS,
    };
  }
  if (status === 408 || status === 504) return { type: 'TIMEOUT', retryable: true };
  if (status >= 500) return { type: 'PROVIDER_ERROR', retryable: true };
  return { type: 'PROVIDER_ERROR', retryable: false };
}

function getCorrectionAttemptCount(body: GeminiRequestBody): number {
  const rawAttempt = body.clientContext?.correctionAttempt;
  if (typeof rawAttempt !== 'number' || !Number.isFinite(rawAttempt) || rawAttempt < 0) {
    return 0;
  }

  return Math.trunc(rawAttempt);
}

function shouldApplyDuplicateRetryGuard(body: GeminiRequestBody): boolean {
  return getCorrectionAttemptCount(body) > 0;
}

function buildCorrectionPrompt(
  basePrompt: string,
  issues: string[],
  options?: { requiredFields?: string[]; extraRules?: string[] },
): string {
  const normalizedIssues = issues
    .map((issue) => issue.trim())
    .filter((issue) => issue.length > 0);
  const retryInstructions = [
    'ADDITIONAL_CRITICAL_INSTRUCTIONS (RETRY):',
    '',
    'CRITICAL ISSUES YOU MUST FIX IN THIS RESPONSE:',
    ...normalizedIssues.map((issue, index) => `${index + 1}. ${issue}`),
    '',
    'Revise your response to fix every listed issue completely.',
    'Do not repeat any missing field, empty field, placeholder value, or invalid structure described above.',
    '',
    'FINAL RETRY INSTRUCTIONS:',
    '- Follow the required output format exactly.',
    '- Return the same JSON object shape required for this stage.',
    '- Replace missing, empty, or invalid fields in place. Do not add new keys.',
    '- Fix every listed issue in this response.',
    '- Fill every required field with concrete content.',
    '- Do not return placeholders, empty scaffolding, or unrelated extra structures.',
    '- Do not repeat the previous invalid response.',
    ...((options?.extraRules ?? []).map((rule) => `- ${rule}`)),
    ...(options?.requiredFields && options.requiredFields.length > 0
      ? [`- Make sure these required fields are present: ${options.requiredFields.join(', ')}`]
      : []),
  ].join('\n');

  const trimmedPrompt = basePrompt.trim();
  return trimmedPrompt.length > 0
    ? `${trimmedPrompt}\n\n${retryInstructions}`
    : retryInstructions;
}

function buildSchemaCorrectionPrompt(basePrompt: string, validationErrors: string, requiredFields: string[]): string {
  return buildCorrectionPrompt(
    basePrompt,
    validationErrors.split(/;\s*/).filter((issue) => issue.trim().length > 0),
    { requiredFields },
  );
}

function buildSpellcastingSemanticCorrectionPrompt(basePrompt: string, issues: string[]): string {
  return buildCorrectionPrompt(basePrompt, issues, {
    extraRules: [
      'If the NPC is a slot-based caster, include spell_slots as an object map with at least one slot (example: {"5": 3}).',
      'prepared_spells must be an object map from spell level to arrays of spell names.',
      'always_prepared_spells must be an object map from source to arrays of spell names.',
      'innate_spells must be an object map from usage to arrays of spell names.',
      'Do not return bare arrays for prepared_spells, always_prepared_spells, or innate_spells.',
      'Include at least one populated spell list: prepared_spells, always_prepared_spells, innate_spells, or spells_known.',
      'Known casters such as warlocks must include spells_known.',
      'Prepared casters must include prepared_spells or always_prepared_spells.',
      'Do not return only spellcasting_ability, spell_save_dc, and spell_attack_bonus.',
    ],
    requiredFields: ['spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus'],
  });
}

function buildCharacterBuildSemanticCorrectionPrompt(basePrompt: string, issues: string[]): string {
  return buildCorrectionPrompt(basePrompt, issues, {
    extraRules: [
      'For class_features, subclass_features, racial_features, feats, and fighting_styles, every returned item must include a real description explaining what the feature does.',
      'Do not repeat the feature name as the description.',
      'If the character has many features, keep each description to one or two concise sentences with concrete mechanics, benefits, triggers, or limits rather than omitting detail.',
      'Preserve the same JSON shape and replace placeholder descriptions in place.',
    ],
    requiredFields: ['class_features', 'subclass_features', 'racial_features', 'feats', 'fighting_styles', 'skill_proficiencies', 'saving_throws'],
  });
}

function buildContractCorrectionPrompt(
  basePrompt: string,
  stageKey: string,
  validationErrors: string,
  requiredFields: string[],
): string {
  const issues = validationErrors.split(/;\s*/).filter((issue) => issue.trim().length > 0);

  if (stageKey === 'spellcasting') {
    return buildSpellcastingSemanticCorrectionPrompt(basePrompt, issues);
  }

  if (stageKey === 'character_build') {
    return buildCharacterBuildSemanticCorrectionPrompt(basePrompt, issues);
  }

  return buildCorrectionPrompt(basePrompt, issues, { requiredFields });
}

function shouldOfferAutomaticSchemaCorrectionRetry(body: GeminiRequestBody): boolean {
  return getCorrectionAttemptCount(body) < MAX_SCHEMA_CORRECTION_ATTEMPTS;
}

function shouldShortCircuitRateLimit(): boolean {
  if (!lastRateLimitAt) return false;
  return Date.now() - lastRateLimitAt < RATE_LIMIT_COOLDOWN_MS;
}

function markRateLimit(): void {
  lastRateLimitAt = Date.now();
}

function buildIdempotencyKey(body: GeminiRequestBody): string {
  return `${body.projectId}:${body.stageId}:${body.stageRunId}`;
}

/**
 * Shared workflow-stage execution handler.
 * Gemini remains the current transport provider, but both the legacy Gemini route
 * and the new generic workflow route delegate through this function.
 */
const handleGeminiWorkflowStageRequest = async (req: Request, res: ExpressResponse) => {
  const parsed = parseRequestBody(req.body);
  if (!parsed.valid) {
    const failure = parsed as { valid: false; message: string };
    return res.status(400).json(createWorkflowExecutionFailure({
      requestId: 'n/a',
      stageRunId: 'n/a',
      type: 'INVALID_RESPONSE',
      message: failure.message,
      retryable: false,
    }) satisfies GeminiFailureResponse);
  }

  const body = parsed.data;
  const requestId = randomUUID();

  const generatorType = body.clientContext?.generatorType;
  const requestedStageKey = getNormalizedStageKey(body.stageId, typeof generatorType === 'string' ? generatorType : undefined);
  const requestCanonSummary = resolveClientCanonSummary(body);

  const buildWorkflowFailure = (input: {
    type: AiErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    outcome?: WorkflowExecutionOutcome;
    acceptanceState?: WorkflowAcceptanceState;
    allowedKeyCount?: number;
    rawAllowedKeyCount?: number;
    canon?: WorkflowCanonSummary;
    conflictSummary?: WorkflowConflictSummary;
    retryContext?: WorkflowExecutionRetryContext;
  }): GeminiFailureResponse => createWorkflowExecutionFailure({
    requestId,
    stageRunId: body.stageRunId,
    stageId: body.stageId,
    stageKey: requestedStageKey,
    workflowType: typeof generatorType === 'string' ? generatorType : undefined,
    canon: input.canon ?? requestCanonSummary,
    ...input,
  });

  const respondWithWorkflowFailure = (
    status: number,
    input: {
      type: AiErrorType;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
      outcome?: WorkflowExecutionOutcome;
      acceptanceState?: WorkflowAcceptanceState;
      allowedKeyCount?: number;
      rawAllowedKeyCount?: number;
      canon?: WorkflowCanonSummary;
      conflictSummary?: WorkflowConflictSummary;
      retryContext?: WorkflowExecutionRetryContext;
    },
  ) => res.status(status).json(buildWorkflowFailure(input));

  if (!generatorType || typeof generatorType !== 'string') {
    return respondWithWorkflowFailure(400, {
      type: 'SCHEMA_MISMATCH',
      message: 'generatorType is required.',
      retryable: false,
    });
  }

  let registry = loadSchemaForGenerator(generatorType);
  if (!registry) {
    registry = buildContractOnlyRegistry(body.stageId, generatorType, body.schemaVersion);
  }
  if (!registry) {
    return respondWithWorkflowFailure(500, {
      type: 'PROVIDER_ERROR',
      message: `Schema not available for generator ${generatorType}.`,
      retryable: false,
    });
  }

  if (body.schemaVersion !== registry.schemaVersion) {
    return respondWithWorkflowFailure(400, {
      type: 'SCHEMA_MISMATCH',
      message: `Expected schemaVersion ${registry.schemaVersion}`,
      retryable: false,
    });
  }

  if (shouldShortCircuitRateLimit()) {
    return respondWithWorkflowFailure(429, {
      type: 'RATE_LIMIT',
      message: 'Gemini temporarily rate limited. Please retry shortly.',
      retryable: true,
      retryAfterMs: RATE_LIMIT_COOLDOWN_MS,
      outcome: 'retry_required',
      retryContext: {
        reason: 'provider_rate_limit',
        retryable: true,
        retryAfterMs: RATE_LIMIT_COOLDOWN_MS,
      },
    });
  }

  // Per-project throttle to prevent bursts (configurable spacing)
  {
    const now = Date.now();
    const lastProjectRequest = lastRequestByProject.get(body.projectId);
    if (lastProjectRequest && now - lastProjectRequest < MIN_REQUEST_SPACING_MS) {
      const retryAfterMs = MIN_REQUEST_SPACING_MS - (now - lastProjectRequest) + 100; // small cushion
      return respondWithWorkflowFailure(429, {
        type: 'RATE_LIMIT',
        message: 'Too many requests in a short window. Please retry shortly.',
        retryable: true,
        retryAfterMs,
        outcome: 'retry_required',
        retryContext: {
          reason: 'project_throttle',
          retryable: true,
          retryAfterMs,
        },
      });
    }
    lastRequestByProject.set(body.projectId, now);
  }

  const idempotencyKey = buildIdempotencyKey(body);
  const cached = getCachedResponse(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.payload);
  }

  if (body.stageId.toLowerCase() === 'planner' && (body.clientContext as any)?.openProposalCount === 0) {
    return respondWithWorkflowFailure(409, {
      type: 'ABORTED',
      message: 'Planner rerun skipped: no open proposals to resolve.',
      retryable: false,
      outcome: 'review_required',
      retryContext: {
        reason: 'planner_no_open_proposals',
        retryable: false,
      },
    });
  }

  const retrySignature = computeRetrySignature(body);
  if (shouldApplyDuplicateRetryGuard(body)) {
    if (isDuplicateRetry(body, retrySignature)) {
      console.warn('[AI][Gemini] Duplicate retry signature detected; blocking auto-retry', {
        stageId: body.stageId,
        stageRunId: body.stageRunId,
        projectId: body.projectId,
      });
      return respondWithWorkflowFailure(409, {
        type: 'ABORTED',
        message: 'Duplicate retry signature detected; review required before retrying.',
        retryable: false,
        outcome: 'review_required',
        retryContext: {
          reason: 'duplicate_retry_signature',
          retryable: false,
          duplicateRetryBlocked: true,
        },
      });
    }

    storeRetrySignature(body, retrySignature);
  }

  const shouldValidateAgainstGeneratorSchema = shouldApplyGeneratorSchemaValidation(body.stageId, generatorType, registry);
  const validate = shouldValidateAgainstGeneratorSchema ? getValidatorForGenerator(generatorType, registry) : null;
  if (shouldValidateAgainstGeneratorSchema && !validate) {
    return respondWithWorkflowFailure(500, {
      type: 'PROVIDER_ERROR',
      message: 'Validator could not be created.',
      retryable: false,
    });
  }

  if (!GEMINI_API_KEY) {
    return respondWithWorkflowFailure(503, {
      type: 'PROVIDER_ERROR',
      message: 'Gemini API key not configured on server.',
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  // Measure prompt size and log breakdown
  const SAFETY_CEILING = 7200;
  const promptSize = body.prompt.length;
  const clientMeasuredChars = typeof body.clientContext?.measuredChars === 'number'
    ? body.clientContext.measuredChars
    : null;
  const sizeBreakdown = {
    total_chars: promptSize,
    safety_ceiling: SAFETY_CEILING,
    overflow: Math.max(0, promptSize - SAFETY_CEILING),
    client_measured_chars: clientMeasuredChars,
    client_server_delta: clientMeasuredChars === null ? null : clientMeasuredChars - promptSize,
    prompt_mode: body.clientContext?.promptMode || null,
  };

  console.log('[AI][Gemini] Request size breakdown:', sizeBreakdown);
  if (clientMeasuredChars !== null && clientMeasuredChars !== promptSize) {
    console.warn('[AI][Gemini] Client/server prompt size mismatch detected', {
      stageId: body.stageId,
      clientMeasuredChars,
      serverPromptChars: promptSize,
      delta: clientMeasuredChars - promptSize,
      promptMode: body.clientContext?.promptMode || 'unknown',
    });
  }

  // Fail-fast if prompt exceeds safety ceiling
  if (sizeBreakdown.overflow > 0) {
    return respondWithWorkflowFailure(400, {
      type: 'PAYLOAD_TOO_LARGE',
      message: `Prompt exceeds safety ceiling by ${sizeBreakdown.overflow} chars. Total: ${promptSize}, Limit: ${SAFETY_CEILING}`,
      retryable: false,
    });
  }

  try {
    let geminiResponse: GeminiHttpResponse | null = null;
    let lastError: GeminiFailureResponse | null = null;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      geminiResponse = (await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: body.prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        }
      )) as unknown as GeminiHttpResponse;

      if (geminiResponse && geminiResponse.ok) break;

      if (!geminiResponse) {
        const payload = buildWorkflowFailure({
          type: 'PROVIDER_ERROR',
          message: 'Gemini response missing.',
          retryable: true,
          outcome: 'retry_required',
          retryContext: {
            reason: 'provider_response_missing',
            retryable: true,
          },
        });
        setCachedResponse(idempotencyKey, 502, payload);
        return res.status(502).json(payload);
      }

      const retryAfterHeader = geminiResponse.headers?.get?.('retry-after');
      const retryAfterMsFromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      const { type, retryable, retryAfterMs } = mapError(geminiResponse.status, retryAfterMsFromHeader);
      if (geminiResponse.status === 429) {
        // Do not cache rate-limit failures; log context for debugging
        console.warn('[AI][Gemini] Rate limited', {
          requestId,
          stageRunId: body.stageRunId,
          stageId: body.stageId,
          generatorType,
          retryAfterMs,
        });
        markRateLimit();
      }
      const failurePayload = buildWorkflowFailure({
        type,
        message: `Gemini request failed (${geminiResponse.status})`,
        retryable,
        retryAfterMs,
        outcome: retryable ? 'retry_required' : 'invalid_response',
        retryContext: retryable
          ? {
              reason: geminiResponse.status === 429 ? 'provider_rate_limit' : `provider_http_${geminiResponse.status}`,
              retryable,
              retryAfterMs,
            }
          : undefined,
      });
      if (geminiResponse.status !== 429) {
        setCachedResponse(idempotencyKey, geminiResponse.status, failurePayload);
      }
      return res.status(geminiResponse.status).json(failurePayload);
    }

    if (!geminiResponse || !geminiResponse.ok) {
      const status = lastError ? 502 : 500;
      const payload =
        lastError ||
        buildWorkflowFailure({
          type: 'PROVIDER_ERROR',
          message: 'Gemini request failed.',
          retryable: true,
          outcome: 'retry_required',
          retryContext: {
            reason: 'provider_request_failed',
            retryable: true,
          },
        });
      setCachedResponse(idempotencyKey, status, payload);
      return res.status(status).json(payload);
    }

    const data = (await geminiResponse.json()) as GeminiApiResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!rawText) {
      return respondWithWorkflowFailure(502, {
        type: 'INVALID_RESPONSE',
        message: 'Empty response from Gemini.',
        retryable: false,
      });
    }

    const extraction = extractJsonPatch(rawText);
    if (!extraction.ok) {
      const failure = extraction as { ok: false; message: string };
      return respondWithWorkflowFailure(422, {
        type: 'INVALID_RESPONSE',
        message: failure.message,
        retryable: false,
      });
    }

    if (extraction.patch) {
      // Normalize patch to target stageId and strip extras
      if (extraction.patch[body.stageId]) {
        for (const key of Object.keys(extraction.patch)) {
          if (key !== body.stageId) {
            console.warn(`[AI][Gemini] Stripping top-level disallowed field '${key}' (expected only '${body.stageId}')`);
            delete extraction.patch[key];
          }
        }
      } else {
        const patchKeys = Object.keys(extraction.patch);
        if (patchKeys.length === 0) {
          return respondWithWorkflowFailure(422, {
            type: 'INVALID_RESPONSE',
            message: 'Empty patch returned from provider.',
            retryable: false,
          });
        }

        // Coerce bare patch into the expected stageId container for robustness
        console.warn(`[AI][Gemini] Coercing patch into stageId container '${body.stageId}' (received keys: ${patchKeys.join(', ')})`);
        extraction.patch = { [body.stageId]: extraction.patch } as Record<string, unknown>;
      }

      const scopeResult = validateScope(body.stageId, extraction.patch);
      if (!scopeResult.ok) {
        const failure = scopeResult as { ok: false; message: string };
        return respondWithWorkflowFailure(422, {
          type: 'FORBIDDEN_PATH',
          message: failure.message,
          retryable: false,
        });
      }

      const stageKey = getNormalizedStageKey(body.stageId, generatorType);

      const payload = extraction.patch[body.stageId] as Record<string, unknown>;
      const allowedKeys = getStageAllowedKeys(body.stageId, registry, generatorType);
      let prunedPayload = pruneToAllowedKeys(allowedKeys, payload);
      let rawAllowedKeyCount = Object.keys(prunedPayload).length;
      console.log(`[AI][PRUNED][${body.stageId}]`, {
        stageRunId: body.stageRunId,
        rawAllowedKeyCount,
        keys: Object.keys(prunedPayload),
      });
      const isSpellcastingStage = stageKey === 'spellcasting';
      const isKeywordExtractor = stageKey === 'keyword_extractor';
      const hasCriticalZeroGuard = isWorkflowStageCriticalZeroGuard(stageKey);

      if (hasCriticalZeroGuard && rawAllowedKeyCount === 0) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: zero allowed keys in raw response`, {
          stageRunId: body.stageRunId,
        });
        return respondWithWorkflowFailure(422, {
          type: 'INVALID_RESPONSE',
          message: `Model returned zero allowed keys for ${body.stageId}`,
          retryable: false,
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
        });
      }

      if (isSpellcastingStage && rawAllowedKeyCount === 0) {
        console.warn('[AI][VALIDATION][spellcasting] rejected: zero allowed keys in raw response', {
          stageId: body.stageId,
          stageRunId: body.stageRunId,
        });
        return respondWithWorkflowFailure(422, {
          type: 'INVALID_RESPONSE',
          message: 'Model returned zero allowed spellcasting keys',
          retryable: false,
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
        });
      }

      const payloadKeys = Object.keys(prunedPayload || {});

      // Coerce stringified JSON fields into objects/arrays when possible.
      for (const key of payloadKeys) {
        const value = (prunedPayload as Record<string, unknown>)[key];
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
              (prunedPayload as Record<string, unknown>)[key] = parsed;
            }
          } catch (_) {
            // leave as-is
          }
        }
      }

      // Coerce personality if stringified JSON; drop if invalid or wrong type
      if (typeof (prunedPayload as any)['personality'] === 'string') {
        try {
          const parsed = JSON.parse((prunedPayload as any)['personality']);
          if (typeof parsed === 'object' && parsed !== null) {
            (prunedPayload as any)['personality'] = parsed;
          } else {
            delete (prunedPayload as any)['personality'];
          }
        } catch (_) {
          delete (prunedPayload as any)['personality'];
        }
      }

      if (
        (prunedPayload as any).hasOwnProperty('personality') &&
        (typeof (prunedPayload as any)['personality'] !== 'object' || (prunedPayload as any)['personality'] === null)
      ) {
        delete (prunedPayload as any)['personality'];
      }

      // Normalize personality to ensure object/arrays shape
      normalizePersonality(prunedPayload);

      // Normalize class_levels: split subclass embedded in class string
      if (Array.isArray((prunedPayload as any).class_levels)) {
        (prunedPayload as any).class_levels = (prunedPayload as any).class_levels.map((entry: any) => {
          if (!entry || typeof entry !== 'object') return entry;
          const cls = typeof entry.class === 'string' ? entry.class : typeof entry.name === 'string' ? entry.name : '';
          if (cls && cls.includes('(')) {
            const match = cls.match(/^(.*?)(?:\s*\(|\s*-\s*)([^)]*)\)?$/);
            if (match && match[1]) {
              return { ...entry, class: match[1].trim(), subclass: entry.subclass || match[2]?.trim() };
            }
          }
          return entry;
        });
      }

      // Normalize stats and required arrays (equipment, items, relationships)
      normalizeStats(prunedPayload);
      normalizeArrays(prunedPayload, [
        'equipment',
        'attuned_items',
        'magic_items',
        'relationships',
        'allies_friends',
        'factions',
        'minions',
        'senses',
      ]);
      normalizeStringArrays(prunedPayload, ['equipment', 'attuned_items', 'magic_items']);
      normalizeStringList(prunedPayload, 'languages');
      normalizeStringList(prunedPayload, 'damage_resistances');
      normalizeStringList(prunedPayload, 'damage_immunities');
      normalizeStringList(prunedPayload, 'damage_vulnerabilities');
      normalizeStringList(prunedPayload, 'condition_immunities');
      normalizeArmorClass(prunedPayload);
      normalizeScalarStrings(prunedPayload, [
        'challenge_rating',
        'size',
        'creature_type',
        'subtype',
        'alignment',
        'race',
        'class_levels',
      ]);
      normalizeNameValueArray(prunedPayload, 'saving_throws');
      normalizeNameValueArray(prunedPayload, 'skill_proficiencies');
      normalizeNameDescriptionArray(prunedPayload, 'abilities');
      normalizeNameDescriptionArray(prunedPayload, 'fighting_styles');
      normalizeNameDescriptionArray(prunedPayload, 'additional_traits');
      normalizeHitPointsAndProficiency(prunedPayload);
      normalizeLegendaryActions(prunedPayload);
      normalizeLairAndRegional(prunedPayload);

      if (isKeywordExtractor) {
        const compliance = evaluateKeywordExtractorCompliance(payload);
        console.debug('[AI][VALIDATION][keyword_extractor]', {
          stageRunId: body.stageRunId,
          rawKeywordCount: compliance.rawKeywordCount,
          prunedKeywordCount: compliance.prunedKeywordCount,
          rawCompliance: compliance.ok ? 'keyword-array-present' : 'missing-keywords',
        });

        if (!compliance.ok) {
          const complianceMessage = 'message' in compliance ? compliance.message : 'keyword_extractor returned no usable keywords.';
          return respondWithWorkflowFailure(422, {
            type: 'INVALID_RESPONSE',
            message: complianceMessage,
            retryable: false,
            allowedKeyCount: allowedKeys.length,
            rawAllowedKeyCount,
          });
        }

        prunedPayload.keywords = compliance.normalizedKeywords;
        rawAllowedKeyCount = compliance.prunedKeywordCount;
      }

      const allowedPresentCountGeneric = allowedKeys.filter((key) => Object.prototype.hasOwnProperty.call(prunedPayload, key)).length;
      const synthesizedHeavyCritical =
        !isKeywordExtractor &&
        hasCriticalZeroGuard &&
        rawAllowedKeyCount > 0 &&
        rawAllowedKeyCount < Math.ceil(allowedPresentCountGeneric / 2);

      const synthesizedHeavyNonCritical =
        !isKeywordExtractor &&
        !hasCriticalZeroGuard &&
        !isSpellcastingStage &&
        allowedPresentCountGeneric > 0 &&
        rawAllowedKeyCount < Math.ceil(allowedPresentCountGeneric / 2);

      if (synthesizedHeavyCritical) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: payload too synthesized`, {
          stageRunId: body.stageRunId,
          rawAllowedKeyCount,
          allowedPresentCount: allowedPresentCountGeneric,
        });
        return respondWithWorkflowFailure(422, {
          type: 'INVALID_RESPONSE',
          message: `${body.stageId} output too synthesized (insufficient raw fields).`,
          retryable: false,
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
        });
      }

      if (synthesizedHeavyNonCritical) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: payload too synthesized`, {
          stageRunId: body.stageRunId,
          rawAllowedKeyCount,
          allowedPresentCount: allowedPresentCountGeneric,
        });
        return respondWithWorkflowFailure(422, {
          type: 'INVALID_RESPONSE',
          message: `${body.stageId} output too synthesized (insufficient raw fields).`,
          retryable: false,
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
        });
      }

      if (isSpellcastingStage) {
        const spellcastingRepairResult = repairWorkflowStagePayload({
          stageIdOrName: body.stageId,
          workflowType: generatorType,
          payload: prunedPayload,
          pruneToContractKeys: false,
        });
        prunedPayload = spellcastingRepairResult.payload;

        const derived = deriveSpellcastingFromContext(prunedPayload);
        if (Object.keys(derived).length > 0) {
          console.log(`[AI][DERIVED][${body.stageId}]`, { stageRunId: body.stageRunId, keys: Object.keys(derived) });
          Object.assign(prunedPayload, derived);
        }

        const { issues, synthesizedFieldCount } = validateSpellcastingSemantic(prunedPayload, rawAllowedKeyCount);
        const allowedPresentCount = SPELLCASTING_ALLOWED_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(prunedPayload, key)).length;
        const synthesizedHeavy = rawAllowedKeyCount === 0 || rawAllowedKeyCount < Math.ceil(allowedPresentCount / 2);
        console.log(`[AI][VALIDATION][${body.stageId}]`, {
          stageRunId: body.stageRunId,
          rawAllowedKeyCount,
          synthesizedFieldCount,
          allowedPresentCount,
          synthesizedHeavy,
          issues,
        });

        if (issues.length > 0 || synthesizedHeavy) {
          const spellcastingIssues = issues.length > 0
            ? issues
            : ['Spellcasting output was too synthesized. Return concrete spellcasting data from the requested character context.'];

          if (shouldOfferAutomaticSchemaCorrectionRetry(body)) {
            const correctionPrompt = buildSpellcastingSemanticCorrectionPrompt(body.prompt, spellcastingIssues);
            const retryAfterMs = getAutomaticWorkflowRetryDelayMs(body.stageId, generatorType);
            return respondWithWorkflowFailure(422, {
              type: 'INVALID_RESPONSE',
              message: 'Spellcasting response was incomplete. Retrying automatically with repair instructions.',
              retryable: true,
              retryAfterMs,
              outcome: 'retry_required',
              allowedKeyCount: allowedKeys.length,
              rawAllowedKeyCount,
              retryContext: {
                reason: 'spellcasting_semantic_validation_failed',
                retryable: true,
                retryAfterMs,
                correctionPrompt,
              },
            });
          }

          return respondWithWorkflowFailure(422, {
            type: 'INVALID_RESPONSE',
            message: issues.length > 0
              ? `Spellcasting validation failed after automatic repair: ${issues.join('; ')}`
              : 'Spellcasting output too synthesized after automatic repair.',
            retryable: false,
            outcome: 'review_required',
            allowedKeyCount: allowedKeys.length,
            rawAllowedKeyCount,
            retryContext: {
              reason: 'spellcasting_semantic_validation_failed_after_correction',
              retryable: false,
            },
          });
        }
      }

      const repairResult = repairWorkflowStagePayload({
        stageIdOrName: body.stageId,
        workflowType: generatorType,
        payload: prunedPayload,
        pruneToContractKeys: false,
      });
      prunedPayload = repairResult.payload;
      const stageRepairWarnings = repairResult.appliedRepairs.map((repair) => `repair:${repair}`);

      const contractValidation = validateSharedWorkflowStageContractPayload(body.stageId, prunedPayload, generatorType);
      if (contractValidation.ok === false) {
        const failure = contractValidation;

        const scopedDefinition = getWorkflowStageDefinition(resolveWorkflowContentType(generatorType), body.stageId)
          ?? getWorkflowStageDefinition(resolveWorkflowContentType(generatorType), stageKey);
        const requiredFields = scopedDefinition?.contract?.requiredKeys
          ? [...scopedDefinition.contract.requiredKeys]
          : [];

        if (shouldOfferAutomaticSchemaCorrectionRetry(body)) {
          const correctionPrompt = buildContractCorrectionPrompt(body.prompt, stageKey, failure.error, requiredFields);
          const retryAfterMs = getAutomaticWorkflowRetryDelayMs(body.stageId, generatorType);
          return respondWithWorkflowFailure(422, {
            type: 'INVALID_RESPONSE',
            message: stageKey === 'spellcasting'
              ? 'Spellcasting response used the wrong field structure. Retrying automatically with repair instructions.'
              : `${body.stageId} returned malformed structured data. Retrying automatically with repair instructions.`,
            retryable: true,
            retryAfterMs,
            outcome: 'retry_required',
            allowedKeyCount: allowedKeys.length,
            rawAllowedKeyCount,
            retryContext: {
              reason: 'contract_validation_failed',
              retryable: true,
              retryAfterMs,
              correctionPrompt,
            },
          });
        }

        return respondWithWorkflowFailure(422, {
          type: 'INVALID_RESPONSE',
          message: stageKey === 'spellcasting'
            ? 'Spellcasting response still used the wrong field structure after automatic repair. Review required before retrying.'
            : `${body.stageId} returned malformed structured data after automatic repair. Review required before retrying.`,
          retryable: false,
          outcome: 'review_required',
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
          retryContext: {
            reason: 'contract_validation_failed_after_correction',
            retryable: false,
          },
        });
      }

      if (stageKey === 'planner') {
        extraction.patch[body.stageId] = prunedPayload;
        const conflictSummary = summarizeWorkflowConflicts(stageKey, prunedPayload, requestCanonSummary);
        const acceptanceState = resolveWorkflowAcceptanceState(stageKey, requestCanonSummary, conflictSummary);
        const successPayload: GeminiSuccessResponse = createWorkflowExecutionSuccess({
          provider: 'gemini',
          model: GEMINI_MODEL,
          requestId,
          stageRunId: body.stageRunId,
          stageId: body.stageId,
          stageKey,
          workflowType: generatorType,
          acceptanceState,
          allowedKeyCount: allowedKeys.length,
          rawAllowedKeyCount,
          canon: requestCanonSummary,
          conflictSummary,
          rawText,
          jsonPatch: extraction.patch,
          foundJsonBlock: extraction.foundJsonBlock,
          parseWarnings: [...extraction.warnings, ...stageRepairWarnings],
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          patchSizeBytes: Buffer.byteLength(JSON.stringify(extraction.patch)),
          appliedPathsCandidateCount: Object.keys(extraction.patch || {}).length,
        });

        setCachedResponse(idempotencyKey, 200, successPayload);
        return res.status(200).json(successPayload);
      }

      if (shouldValidateAgainstGeneratorSchema) {
        for (const key of payloadKeys) {
          if (key !== '_meta' && !registry.allowedPaths.includes(key)) {
            console.warn(`[AI][Gemini] Stripping disallowed field '${key}' from stage '${body.stageId}'`);
            delete prunedPayload[key];
          }
        }
      }

      console.log(`[AI][NORMALIZED][${body.stageId}]`, prunedPayload);
      if (shouldValidateAgainstGeneratorSchema && validate) {
        const isValid = validate(prunedPayload);
        console.log(`[AI][VALIDATION_SCHEMA][${body.stageId}]`, {
          stageRunId: body.stageRunId,
          valid: isValid,
          errors: validate.errors,
        });
        if (!isValid) {
          const validationErrors = (validate.errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
          const requiredFields = (validate.schema as any)?.required || [];

          if (shouldOfferAutomaticSchemaCorrectionRetry(body)) {
            const correctionPrompt = buildSchemaCorrectionPrompt(body.prompt, validationErrors, requiredFields);
            const retryAfterMs = getAutomaticWorkflowRetryDelayMs(body.stageId, generatorType);
            return respondWithWorkflowFailure(422, {
              type: 'INVALID_RESPONSE',
              message: `${body.stageId} returned malformed structured data. Retrying automatically with repair instructions.`,
              retryable: true,
              retryAfterMs,
              outcome: 'retry_required',
              allowedKeyCount: allowedKeys.length,
              rawAllowedKeyCount,
              retryContext: {
                reason: 'schema_validation_failed',
                retryable: true,
                retryAfterMs,
                correctionPrompt,
              },
            });
          }

          return respondWithWorkflowFailure(422, {
            type: 'INVALID_RESPONSE',
            message: `${body.stageId} returned malformed structured data after automatic repair. Review required before retrying.`,
            retryable: false,
            outcome: 'review_required',
            allowedKeyCount: allowedKeys.length,
            rawAllowedKeyCount,
            retryContext: {
              reason: 'schema_validation_failed_after_correction',
              retryable: false,
            },
          });
        }
      }

      console.log(`[AI][VALIDATION_PASSED][${body.stageId}]`, {
        stageRunId: body.stageRunId,
        keys: Object.keys(prunedPayload),
      });

      extraction.patch[body.stageId] = prunedPayload;
      const conflictSummary = summarizeWorkflowConflicts(stageKey, prunedPayload, requestCanonSummary);
      const acceptanceState = resolveWorkflowAcceptanceState(stageKey, requestCanonSummary, conflictSummary);
      const outcome: WorkflowExecutionOutcome = acceptanceState === 'review_required_conflict' || acceptanceState === 'review_required_ambiguity'
        ? 'review_required'
        : 'accepted';

      const successPayload: GeminiSuccessResponse = createWorkflowExecutionSuccess({
        provider: 'gemini',
        model: GEMINI_MODEL,
        requestId,
        stageRunId: body.stageRunId,
        stageId: body.stageId,
        stageKey,
        workflowType: generatorType,
        outcome,
        acceptanceState,
        allowedKeyCount: allowedKeys.length,
        rawAllowedKeyCount,
        canon: requestCanonSummary,
        conflictSummary,
        rawText,
        jsonPatch: extraction.patch,
        foundJsonBlock: extraction.foundJsonBlock,
        parseWarnings: [...extraction.warnings, ...stageRepairWarnings],
        inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
        patchSizeBytes: extraction.patch ? JSON.stringify(extraction.patch).length : 0,
        appliedPathsCandidateCount: extraction.patch ? Object.keys(extraction.patch).length : 0,
      });

      setCachedResponse(idempotencyKey, 200, successPayload);
      return res.json(successPayload);
    }

    // If we get here, no patch was extracted for the requested stage.
    return respondWithWorkflowFailure(502, {
      type: 'INVALID_RESPONSE',
      message: 'No JSON patch found in model response.',
      retryable: true,
      outcome: 'retry_required',
      retryContext: {
        reason: 'missing_json_patch',
        retryable: true,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * POST /api/ai/gemini/generate
 * Legacy Gemini-specific stage execution route.
 */
aiRouter.post('/gemini/generate', handleGeminiWorkflowStageRequest);

/**
 * POST /api/ai/workflow/execute-stage
 * Provider-agnostic workflow execution entrypoint.
 * Gemini is currently the backing implementation during migration.
 */
aiRouter.post('/workflow/execute-stage', handleGeminiWorkflowStageRequest);

/**
 * POST /api/ai/workflow/chat
 * Text-only Gemini chat adapter for the assistant panel when the user has no client-side key.
 * This bypasses stage/schema validation and keeps server-managed Gemini chat usable.
 */
aiRouter.post('/workflow/chat', async (req: Request, res: ExpressResponse) => {
  const parsed = parseChatRequestBody(req.body);
  const requestId = randomUUID();

  if (!parsed.valid) {
    const failure = parsed as { valid: false; message: string };
    return res.status(400).json(createWorkflowChatFailure({
      requestId,
      type: 'INVALID_RESPONSE',
      message: failure.message,
      retryable: false,
    }) satisfies WorkflowChatFailureResponse);
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json(createWorkflowChatFailure({
      requestId,
      type: 'PROVIDER_ERROR',
      message: 'Gemini API key not configured on server.',
      retryable: false,
    }) satisfies WorkflowChatFailureResponse);
  }

  if (shouldShortCircuitRateLimit()) {
    return res.status(429).json(createWorkflowChatFailure({
      requestId,
      type: 'RATE_LIMIT',
      message: 'Gemini temporarily rate limited. Please retry shortly.',
      retryable: true,
      retryAfterMs: RATE_LIMIT_COOLDOWN_MS,
    }) satisfies WorkflowChatFailureResponse);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = (await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: parsed.data.systemPrompt
            ? { parts: [{ text: parsed.data.systemPrompt }] }
            : undefined,
          contents: [
            {
              parts: [{ text: parsed.data.userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    )) as unknown as GeminiHttpResponse;

    if (!response.ok) {
      const { type, retryable, retryAfterMs } = mapError(response.status);
      if (response.status === 429) {
        markRateLimit();
      }
      return res.status(response.status).json(createWorkflowChatFailure({
        requestId,
        type,
        message: `Gemini request failed (${response.status})`,
        retryable,
        retryAfterMs,
      }) satisfies WorkflowChatFailureResponse);
    }

    const data = (await response.json()) as GeminiApiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      return res.status(502).json(createWorkflowChatFailure({
        requestId,
        type: 'INVALID_RESPONSE',
        message: 'Empty response from Gemini.',
        retryable: false,
      }) satisfies WorkflowChatFailureResponse);
    }

    return res.status(200).json(createWorkflowChatSuccess({
      provider: 'gemini',
      model: GEMINI_MODEL,
      requestId,
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    }) satisfies WorkflowChatSuccessResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini chat request failed.';
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return res.status(isAbort ? 504 : 502).json(createWorkflowChatFailure({
      requestId,
      type: isAbort ? 'TIMEOUT' : 'PROVIDER_ERROR',
      message,
      retryable: isAbort,
    }) satisfies WorkflowChatFailureResponse);
  } finally {
    clearTimeout(timeout);
  }
});

export {
  aiRouter,
  getAutomaticWorkflowRetryDelayMs,
  buildContractCorrectionPrompt,
  buildSchemaCorrectionPrompt,
  buildSpellcastingSemanticCorrectionPrompt,
  evaluateKeywordExtractorCompliance,
  getNormalizedStageKey,
  getStageAllowedKeys,
  normalizeNameValueArray,
  shouldApplyGeneratorSchemaValidation,
  shouldApplyDuplicateRetryGuard,
  shouldOfferAutomaticSchemaCorrectionRetry,
  validateSharedWorkflowStageContractPayload as validateWorkflowStageContractPayload,
};
