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

/** Allowed error types for the AI proxy */
type AiErrorType =
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'SCHEMA_MISMATCH'
  | 'FORBIDDEN_PATH'
  | 'PAYLOAD_TOO_LARGE'
  | 'BUDGET_EXCEEDED'
  | 'ABORTED';

const SPELLCASTING_ALLOWED_KEYS = [
  'spellcasting_ability',
  'spell_save_dc',
  'spell_attack_bonus',
  'spell_slots',
  'prepared_spells',
  'always_prepared_spells',
  'innate_spells',
  'spells_known',
  'spellcasting_focus',
  // context helpers to enable deterministic derivation
  'class_levels',
  'ability_scores',
  'proficiency_bonus',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function getStageAllowedKeys(stageId: string, registry: StageRegistryEntry): string[] {
  const normalized = stageId.toLowerCase();
  if (normalized.includes('spellcasting')) return SPELLCASTING_ALLOWED_KEYS;
  return registry.allowedPaths;
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

interface GeminiRequestBody {
  projectId: string;
  stageId: string;
  stageRunId: string;
  prompt: string;
  schemaVersion: string;
  responseFormat?: string;
  clientContext?: {
    appVersion?: string;
    stageKey?: string;
    generatorType?: string;
    userSelectedMode?: string;
    promptMode?: string;
    measuredChars?: number;
  };
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

interface GeminiSuccessResponse {
  ok: true;
  provider: 'gemini';
  model: string;
  requestId: string;
  stageRunId: string;
  rawText: string;
  jsonPatch?: Record<string, unknown>;
  parse: {
    foundJsonBlock: boolean;
    parseWarnings: string[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  safety: {
    patchSizeBytes: number;
    appliedPathsCandidateCount: number;
  };
}

interface GeminiFailureResponse {
  ok: false;
  requestId: string;
  stageRunId: string;
  error: {
    type: AiErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const MAX_PATCH_BYTES = 200_000;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 2;
const MIN_REQUEST_SPACING_MS = 2000;
const aiRouter = Router();
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

/** Load and cache per-generator schema for allowlist and validation */
const schemaCache: Record<string, StageRegistryEntry | undefined> = {};
const validatorCache: Record<string, ValidateFunction | undefined> = {};
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

function loadSchemaForGenerator(generatorType: string): StageRegistryEntry | null {
  if (schemaCache[generatorType]) return schemaCache[generatorType] || null;
  try {
    const raw = readFileSync(path.join(process.cwd(), `schema/${generatorType}/v1.1-client.json`), 'utf-8');
    const schema = JSON.parse(raw);
    const properties = schema.properties || {};
    
    // Inject generic workflow fields that are used during generation but stripped before final save
    properties['keywords'] = { type: 'array', items: { type: 'string' } };
    properties['retrieval_hints'] = { type: 'object' };
    properties['_meta'] = { type: 'object' };
    schema.properties = properties; // Ensure they are on the actual schema object

    const allowedPaths = Object.keys(properties);
    const entry: StageRegistryEntry = {
      allowedPaths,
      schemaVersion: 'v1.1-client',
      schema,
    };
    schemaCache[generatorType] = entry;
    return entry;
  } catch (err) {
    console.error('[AI][Gemini] Failed to load schema for generator', generatorType, err);
    schemaCache[generatorType] = undefined;
    return null;
  }
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
  const raw = (container as Record<string, unknown>)[field];
  const items = Array.isArray(raw) ? raw : [];
  const normalized = items
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name : 'Unknown';
        const value = typeof obj.value === 'string' ? obj.value : defaultValue;
        const result: Record<string, unknown> = { name, value };
        if (typeof obj.notes === 'string') result.notes = obj.notes;
        return result;
      }
      if (typeof entry === 'string' || typeof entry === 'number') {
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
 * POST /api/ai/gemini/generate
 * Proxies stage prompt to Gemini, extracts JSON patch, and returns structured results.
 * This route keeps the Gemini key server-side and never exposes it to clients.
 */
aiRouter.post('/gemini/generate', async (req: Request, res: ExpressResponse) => {
  const parsed = parseRequestBody(req.body);
  if (!parsed.valid) {
    const failure = parsed as { valid: false; message: string };
    return res.status(400).json({
      ok: false,
      requestId: 'n/a',
      stageRunId: 'n/a',
      error: { type: 'INVALID_RESPONSE', message: failure.message, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  const body = parsed.data;
  const requestId = randomUUID();

  const generatorType = body.clientContext?.generatorType;
  if (!generatorType || typeof generatorType !== 'string') {
    return res.status(400).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'SCHEMA_MISMATCH', message: 'generatorType is required.', retryable: false },
    } satisfies GeminiFailureResponse);
  }

  const registry = loadSchemaForGenerator(generatorType);
  if (!registry) {
    return res.status(500).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: `Schema not available for generator ${generatorType}.`, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (body.schemaVersion !== registry.schemaVersion) {
    return res.status(400).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'SCHEMA_MISMATCH', message: `Expected schemaVersion ${registry.schemaVersion}`, retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (shouldShortCircuitRateLimit()) {
    return res.status(429).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: {
        type: 'RATE_LIMIT',
        message: 'Gemini temporarily rate limited. Please retry shortly.',
        retryable: true,
        retryAfterMs: RATE_LIMIT_COOLDOWN_MS,
      },
    } satisfies GeminiFailureResponse);
  }

  // Per-project throttle to prevent bursts (configurable spacing)
  {
    const now = Date.now();
    const lastProjectRequest = lastRequestByProject.get(body.projectId);
    if (lastProjectRequest && now - lastProjectRequest < MIN_REQUEST_SPACING_MS) {
      const retryAfterMs = MIN_REQUEST_SPACING_MS - (now - lastProjectRequest) + 100; // small cushion
      return res.status(429).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: {
          type: 'RATE_LIMIT',
          message: 'Too many requests in a short window. Please retry shortly.',
          retryable: true,
          retryAfterMs,
        },
      } satisfies GeminiFailureResponse);
    }
    lastRequestByProject.set(body.projectId, now);
  }

  const idempotencyKey = buildIdempotencyKey(body);
  const cached = getCachedResponse(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.payload);
  }

  if (body.stageId.toLowerCase() === 'planner' && (body.clientContext as any)?.openProposalCount === 0) {
    return res.status(409).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: {
        type: 'ABORTED',
        message: 'Planner rerun skipped: no open proposals to resolve.',
        retryable: false,
      },
    } satisfies GeminiFailureResponse);
  }

  const retrySignature = computeRetrySignature(body);
  if (isDuplicateRetry(body, retrySignature)) {
    console.warn('[AI][Gemini] Duplicate retry signature detected; blocking auto-retry', {
      stageId: body.stageId,
      stageRunId: body.stageRunId,
      projectId: body.projectId,
    });
    return res.status(409).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: {
        type: 'ABORTED',
        message: 'Duplicate retry signature detected; review required before retrying.',
        retryable: false,
      },
    } satisfies GeminiFailureResponse);
  }
  storeRetrySignature(body, retrySignature);

  const validate = getValidatorForGenerator(generatorType, registry);
  if (!validate) {
    return res.status(500).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: 'Validator could not be created.', retryable: false },
    } satisfies GeminiFailureResponse);
  }

  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'PROVIDER_ERROR', message: 'Gemini API key not configured on server.', retryable: false },
    } satisfies GeminiFailureResponse);
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
    return res.status(400).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: {
        type: 'PAYLOAD_TOO_LARGE',
        message: `Prompt exceeds safety ceiling by ${sizeBreakdown.overflow} chars. Total: ${promptSize}, Limit: ${SAFETY_CEILING}`,
        retryable: false,
      },
    } satisfies GeminiFailureResponse);
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
        const payload: GeminiFailureResponse = {
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'PROVIDER_ERROR', message: 'Gemini response missing.', retryable: true },
        };
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
      const failurePayload: GeminiFailureResponse = {
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: {
          type,
          message: `Gemini request failed (${geminiResponse.status})`,
          retryable,
          retryAfterMs,
        },
      } satisfies GeminiFailureResponse;
      if (geminiResponse.status !== 429) {
        setCachedResponse(idempotencyKey, geminiResponse.status, failurePayload);
      }
      return res.status(geminiResponse.status).json(failurePayload);
    }

    if (!geminiResponse || !geminiResponse.ok) {
      const status = lastError ? 502 : 500;
      const payload =
        lastError ||
        ({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'PROVIDER_ERROR', message: 'Gemini request failed.', retryable: true },
        } satisfies GeminiFailureResponse);
      setCachedResponse(idempotencyKey, status, payload);
      return res.status(status).json(payload);
    }

    const data = (await geminiResponse.json()) as GeminiApiResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!rawText) {
      return res.status(502).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: { type: 'INVALID_RESPONSE', message: 'Empty response from Gemini.', retryable: false },
      } satisfies GeminiFailureResponse);
    }

    const extraction = extractJsonPatch(rawText);
    if (!extraction.ok) {
      const failure = extraction as { ok: false; message: string };
      return res.status(422).json({
        ok: false,
        requestId,
        stageRunId: body.stageRunId,
        error: { type: 'INVALID_RESPONSE', message: failure.message, retryable: false },
      } satisfies GeminiFailureResponse);
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
          return res.status(422).json({
            ok: false,
            requestId,
            stageRunId: body.stageRunId,
            error: { type: 'INVALID_RESPONSE', message: 'Empty patch returned from provider.', retryable: false },
          } satisfies GeminiFailureResponse);
        }

        // Coerce bare patch into the expected stageId container for robustness
        console.warn(`[AI][Gemini] Coercing patch into stageId container '${body.stageId}' (received keys: ${patchKeys.join(', ')})`);
        extraction.patch = { [body.stageId]: extraction.patch } as Record<string, unknown>;
      }

      const scopeResult = validateScope(body.stageId, extraction.patch);
      if (!scopeResult.ok) {
        const failure = scopeResult as { ok: false; message: string };
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'FORBIDDEN_PATH', message: failure.message, retryable: false },
        } satisfies GeminiFailureResponse);
      }

      // Planner stage produces a Brief (no equipment field). Skip NPC validation and return as-is.
      if (body.stageId === 'planner') {
        const successPayload: GeminiSuccessResponse = {
          ok: true,
          provider: 'gemini',
          model: GEMINI_MODEL,
          requestId,
          stageRunId: body.stageRunId,
          rawText,
          jsonPatch: extraction.patch,
          parse: {
            foundJsonBlock: extraction.foundJsonBlock,
            parseWarnings: extraction.warnings,
          },
          usage: {
            inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          },
          safety: {
            patchSizeBytes: Buffer.byteLength(JSON.stringify(extraction.patch)),
            appliedPathsCandidateCount: Object.keys(extraction.patch || {}).length,
          },
        } satisfies GeminiSuccessResponse;

        setCachedResponse(idempotencyKey, 200, successPayload);
        return res.status(200).json(successPayload);
      }

      const payload = extraction.patch[body.stageId] as Record<string, unknown>;
      const allowedKeys = getStageAllowedKeys(body.stageId, registry);
      const prunedPayload = pruneToAllowedKeys(allowedKeys, payload);
      let rawAllowedKeyCount = Object.keys(prunedPayload).length;
      console.log(`[AI][PRUNED][${body.stageId}]`, {
        stageRunId: body.stageRunId,
        rawAllowedKeyCount,
        keys: Object.keys(prunedPayload),
      });
      const isSpellcastingStage = body.stageId.toLowerCase().includes('spellcasting');
      const isKeywordExtractor = body.stageId === 'keyword_extractor';
      const criticalZeroGuardStages = ['basic_info', 'creator:_basic_info', 'core_details', 'creator:_core_details'];

      if (criticalZeroGuardStages.includes(body.stageId.toLowerCase()) && rawAllowedKeyCount === 0) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: zero allowed keys in raw response`, {
          stageRunId: body.stageRunId,
        });
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: {
            type: 'INVALID_RESPONSE',
            message: `Model returned zero allowed keys for ${body.stageId}`,
            retryable: false,
          },
        } satisfies GeminiFailureResponse);
      }

      if (isSpellcastingStage && rawAllowedKeyCount === 0) {
        console.warn('[AI][VALIDATION][spellcasting] rejected: zero allowed keys in raw response', {
          stageId: body.stageId,
          stageRunId: body.stageRunId,
        });
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: {
            type: 'INVALID_RESPONSE',
            message: 'Model returned zero allowed spellcasting keys',
            retryable: false,
          },
        } satisfies GeminiFailureResponse);
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
          return res.status(422).json({
            ok: false,
            requestId,
            stageRunId: body.stageRunId,
            error: {
              type: 'INVALID_RESPONSE',
              message: compliance.message,
              retryable: false,
            },
          } satisfies GeminiFailureResponse);
        }

        prunedPayload.keywords = compliance.normalizedKeywords;
        rawAllowedKeyCount = compliance.prunedKeywordCount;
      }

      const allowedPresentCountGeneric = allowedKeys.filter((key) => Object.prototype.hasOwnProperty.call(prunedPayload, key)).length;
      const synthesizedHeavyCritical =
        !isKeywordExtractor &&
        criticalZeroGuardStages.includes(body.stageId.toLowerCase()) &&
        rawAllowedKeyCount > 0 &&
        rawAllowedKeyCount < Math.ceil(allowedPresentCountGeneric / 2);

      const synthesizedHeavyNonCritical =
        !isKeywordExtractor &&
        !criticalZeroGuardStages.includes(body.stageId.toLowerCase()) &&
        !isSpellcastingStage &&
        allowedPresentCountGeneric > 0 &&
        rawAllowedKeyCount < Math.ceil(allowedPresentCountGeneric / 2);

      if (synthesizedHeavyCritical) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: payload too synthesized`, {
          stageRunId: body.stageRunId,
          rawAllowedKeyCount,
          allowedPresentCount: allowedPresentCountGeneric,
        });
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: {
            type: 'INVALID_RESPONSE',
            message: `${body.stageId} output too synthesized (insufficient raw fields).`,
            retryable: false,
          },
        } satisfies GeminiFailureResponse);
      }

      if (synthesizedHeavyNonCritical) {
        console.warn(`[AI][VALIDATION][${body.stageId}] rejected: payload too synthesized`, {
          stageRunId: body.stageRunId,
          rawAllowedKeyCount,
          allowedPresentCount: allowedPresentCountGeneric,
        });
        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: {
            type: 'INVALID_RESPONSE',
            message: `${body.stageId} output too synthesized (insufficient raw fields).`,
            retryable: false,
          },
        } satisfies GeminiFailureResponse);
      }

      if (isSpellcastingStage) {
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
          return res.status(422).json({
            ok: false,
            requestId,
            stageRunId: body.stageRunId,
            error: {
              type: 'INVALID_RESPONSE',
              message: issues.length > 0
                ? `Spellcasting validation failed: ${issues.join('; ')}`
                : 'Spellcasting output too synthesized (insufficient raw fields).',
              retryable: false,
            },
          } satisfies GeminiFailureResponse);
        }
      }

      // Strip disallowed top-level fields for this stage.
      for (const key of payloadKeys) {
        if (key !== '_meta' && !registry.allowedPaths.includes(key)) {
          console.warn(`[AI][Gemini] Stripping disallowed field '${key}' from stage '${body.stageId}'`);
          delete prunedPayload[key];
        }
      }

      console.log(`[AI][NORMALIZED][${body.stageId}]`, prunedPayload);
      const isValid = validate(prunedPayload);
      console.log(`[AI][VALIDATION_SCHEMA][${body.stageId}]`, {
        stageRunId: body.stageRunId,
        valid: isValid,
        errors: validate.errors,
      });
      if (!isValid) {
        const validationErrors = (validate.errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
        const requiredFields = (validate.schema as any)?.required || [];

        // Build minimal patch prompt (much smaller than full regeneration)
        const correctionPrompt = `Output ONLY valid JSON. NO markdown. NO prose.

Your previous response was incomplete. Fix ONLY these missing/invalid fields:
${validationErrors}

Make sure to include required fields: ${requiredFields.join(', ')}`;

        return res.status(422).json({
          ok: false,
          requestId,
          stageRunId: body.stageRunId,
          error: { type: 'INVALID_RESPONSE', message: correctionPrompt, retryable: false },
        } satisfies GeminiFailureResponse);
      }

      console.log(`[AI][VALIDATION_PASSED][${body.stageId}]`, {
        stageRunId: body.stageRunId,
        keys: Object.keys(prunedPayload),
      });

      const successPayload: GeminiSuccessResponse = {
        ok: true,
        provider: 'gemini',
        model: GEMINI_MODEL,
        requestId,
        stageRunId: body.stageRunId,
        rawText,
        jsonPatch: extraction.patch,
        parse: {
          foundJsonBlock: extraction.foundJsonBlock,
          parseWarnings: extraction.warnings,
        },
        usage: {
          inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
          outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
        },
        safety: {
          patchSizeBytes: extraction.patch ? JSON.stringify(extraction.patch).length : 0,
          appliedPathsCandidateCount: extraction.patch ? Object.keys(extraction.patch).length : 0,
        },
      } satisfies GeminiSuccessResponse;

      setCachedResponse(idempotencyKey, 200, successPayload);
      return res.json(successPayload);
    }

    // If we get here, no patch was extracted for the requested stage.
    return res.status(502).json({
      ok: false,
      requestId,
      stageRunId: body.stageRunId,
      error: { type: 'INVALID_RESPONSE', message: 'No JSON patch found in model response.', retryable: true },
    } satisfies GeminiFailureResponse);
  } finally {
    clearTimeout(timeout);
  }
});

export { aiRouter, evaluateKeywordExtractorCompliance };