import {
  getWorkflowStageContract,
  pruneWorkflowStageOutput,
  resolveWorkflowStageContractKey,
  type WorkflowStageJsonRecord,
} from './workflowStageValidation.js';

type JsonRecord = WorkflowStageJsonRecord;

export interface WorkflowStageRepairInput {
  stageIdOrName: string;
  workflowType?: string | null;
  payload: JsonRecord;
  configPrompt?: string;
  configFlags?: JsonRecord;
  previousDecisions?: Record<string, string>;
  pruneToContractKeys?: boolean;
}

export interface WorkflowStageRepairResult {
  payload: JsonRecord;
  contractKey: string | null;
  appliedRepairs: string[];
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const STATS_SPEED_KEYS = ['walk', 'fly', 'swim', 'climb', 'burrow', 'hover'] as const;

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const parseStructuredString = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const repairStringifiedFields = (payload: JsonRecord, appliedRepairs: string[]): JsonRecord => {
  const repaired: JsonRecord = { ...payload };

  for (const [key, value] of Object.entries(repaired)) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      continue;
    }

    const parsed = parseStructuredString(trimmed);
    if (parsed !== value) {
      repaired[key] = parsed as unknown;
      appliedRepairs.push(`parsed:${key}`);
    }
  }

  return repaired;
};

const normalizePlannerRetrievalHints = (value: unknown): JsonRecord => {
  const emptyHints: JsonRecord = {
    entities: [],
    regions: [],
    eras: [],
    keywords: [],
  };

  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      ...emptyHints,
      keywords: [value.trim()],
    };
  }

  if (Array.isArray(value)) {
    return {
      ...emptyHints,
      keywords: normalizeStringArray(value),
    };
  }

  if (!isRecord(value)) {
    return emptyHints;
  }

  return {
    entities: normalizeStringArray(value.entities),
    regions: normalizeStringArray(value.regions),
    eras: normalizeStringArray(value.eras),
    keywords: normalizeStringArray(value.keywords),
  };
};

const normalizePlannerProposals = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== null && entry !== undefined);
  }

  if (isRecord(value)) {
    return [value];
  }

  return [];
};

const coerceOptionalPlannerString = (value: unknown, fallback?: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim();
  }

  return undefined;
};

const normalizePlannerPayload = (
  payload: JsonRecord,
  workflowType?: string | null,
  configFlags?: JsonRecord,
): JsonRecord => {
  const normalized: JsonRecord = {
    deliverable: typeof payload.deliverable === 'string' && payload.deliverable.trim().length > 0
      ? payload.deliverable.trim()
      : workflowType || 'npc',
    retrieval_hints: normalizePlannerRetrievalHints(payload.retrieval_hints),
    proposals: normalizePlannerProposals(payload.proposals),
    assumptions: normalizeStringArray(payload.assumptions),
    threads: normalizeStringArray(payload.threads),
    flags_echo: isRecord(payload.flags_echo)
      ? payload.flags_echo
      : {
        allow_invention: payload.allow_invention ?? configFlags?.allow_invention,
        tone: payload.tone ?? configFlags?.tone,
        rule_base: payload.rule_base ?? configFlags?.rule_base,
        mode: payload.mode ?? configFlags?.mode ?? 'GM',
        difficulty: payload.difficulty ?? configFlags?.difficulty,
        realism: payload.realism ?? configFlags?.realism,
      },
  };

  const storyClock = coerceOptionalPlannerString(payload.story_clock);
  if (storyClock) {
    normalized.story_clock = storyClock;
  }

  const allowInvention = coerceOptionalPlannerString(payload.allow_invention, configFlags?.allow_invention);
  if (allowInvention) {
    normalized.allow_invention = allowInvention;
  }

  const ruleBase = coerceOptionalPlannerString(payload.rule_base, configFlags?.rule_base);
  if (ruleBase) {
    normalized.rule_base = ruleBase;
  }

  const tone = coerceOptionalPlannerString(payload.tone, configFlags?.tone);
  if (tone) {
    normalized.tone = tone;
  }

  const mode = coerceOptionalPlannerString(payload.mode, configFlags?.mode ?? 'GM');
  if (mode) {
    normalized.mode = mode;
  }

  const difficulty = coerceOptionalPlannerString(payload.difficulty, configFlags?.difficulty);
  if (difficulty) {
    normalized.difficulty = difficulty;
  }

  const realism = coerceOptionalPlannerString(payload.realism, configFlags?.realism);
  if (realism) {
    normalized.realism = realism;
  }

  return normalized;
};

const CORE_DETAILS_ALLOWED_KEYS = [
  'personality_traits',
  'ideals',
  'bonds',
  'flaws',
  'goals',
  'fears',
  'quirks',
  'voice_mannerisms',
  'hooks',
] as const;

type CoreDetails = Record<(typeof CORE_DETAILS_ALLOWED_KEYS)[number], string[]>;

const clampMin3 = (values: string[], fallback: string[]): string[] => {
  const filtered = values.filter(Boolean);
  if (filtered.length >= 3) {
    return filtered.slice(0, 6);
  }

  return filtered.concat(fallback.slice(0, 3 - filtered.length));
};

const buildCoreDetailsFallback = (ctx: {
  name: string;
  alignment?: string;
  oath?: string;
  location?: string;
  tone?: string;
}): Omit<CoreDetails, 'hooks'> => ({
  personality_traits: ['stoic under pressure', 'measured, disciplined presence', 'vigilant and hard to distract', 'quietly protective of innocents'],
  ideals: ['duty to the Moonmaiden’s light', 'honor and truth in word and deed', 'sacrifice for the greater good', 'order as a shield against darkness'],
  bonds: [
    `sworn to uphold the ${ctx.oath ?? 'Oath of Devotion'}`,
    'devoted to the faithful of Selûne',
    `protects travelers who venture near ${ctx.location ?? 'the Tears of Selûne'}`,
    'keeps a personal vow tied to a fallen comrade',
  ],
  flaws: ['unbending once committed', 'judges moral compromise harshly', 'suppresses emotion until it erupts', 'reluctant to ask for help'],
  goals: ['eradicate a growing shadow presence', 'recover a relic stolen from Selûne’s faithful', 'strengthen protections around sacred sites', 'prove worthy of her celestial heritage'],
  fears: ['failing her oath at a decisive moment', 'the light within her being extinguished', 'innocents harmed because she hesitated', 'corruption taking root in sacred ground'],
  quirks: ['counts prayer beads while thinking', 'speaks in short, deliberate sentences', 'polishes armor and blade as a nightly ritual', 'pauses to observe the sky before acting'],
  voice_mannerisms: ['low, calm voice with clipped phrasing', 'rarely raises volume; intensity comes from stillness', 'uses formal address even under stress', 'makes brief Selûnite blessings before combat'],
});

const normalizeCoreDetailsStageInput = (payload: JsonRecord): JsonRecord => {
  const normalized: JsonRecord = { ...payload };
  const personality = isRecord(payload.personality) ? payload.personality : null;

  const assignIfMissing = (targetKey: string, sourceValue: unknown) => {
    if (targetKey in normalized) {
      return;
    }

    const entries = normalizeStringArray(sourceValue);
    if (entries.length > 0) {
      normalized[targetKey] = entries;
    }
  };

  assignIfMissing('personality_traits', personality?.traits);
  assignIfMissing('ideals', personality?.ideals);
  assignIfMissing('bonds', personality?.bonds);
  assignIfMissing('flaws', personality?.flaws);
  assignIfMissing('goals', personality?.goals ?? payload.motivations);
  assignIfMissing('fears', personality?.fears);
  assignIfMissing('quirks', personality?.quirks);
  assignIfMissing('voice_mannerisms', personality?.voice_mannerisms ?? personality?.mannerisms ?? payload.mannerisms);
  assignIfMissing('hooks', personality?.hooks);

  delete normalized.personality;
  return normalized;
};

const normalizeCoreDetailsPayload = (
  payload: JsonRecord,
  ctx: { name: string; alignment?: string; oath?: string; location?: string; tone?: string },
): JsonRecord => {
  const pruned: Partial<CoreDetails> = {};
  for (const key of CORE_DETAILS_ALLOWED_KEYS) {
    pruned[key] = normalizeStringArray(payload[key]);
  }

  const hooks = normalizeStringArray(payload.hooks);
  const fallback = buildCoreDetailsFallback(ctx);

  return {
    personality_traits: clampMin3(pruned.personality_traits ?? [], fallback.personality_traits),
    ideals: clampMin3(pruned.ideals ?? [], fallback.ideals),
    bonds: clampMin3(pruned.bonds ?? [], fallback.bonds),
    flaws: clampMin3(pruned.flaws ?? [], fallback.flaws),
    goals: clampMin3(pruned.goals ?? [], fallback.goals),
    fears: clampMin3(pruned.fears ?? [], fallback.fears),
    quirks: clampMin3(pruned.quirks ?? [], fallback.quirks),
    voice_mannerisms: clampMin3(pruned.voice_mannerisms ?? [], fallback.voice_mannerisms),
    hooks: clampMin3(hooks, [
      `${ctx.name} needs allies to cleanse a defiled Selûnite site`,
      `${ctx.name} is tracking a void-touched entity seen near the Tears`,
      `${ctx.name} seeks a missing shard tied to a celestial omen`,
    ]),
  };
};

const SPECIES_CANON = [
  'Aasimar',
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Gnome',
  'Tiefling',
  'Dragonborn',
  'Half-Elf',
  'Half-Orc',
  'Goliath',
] as const;

const levenshtein = (left: string, right: string): number => {
  const leftLength = left.length;
  const rightLength = right.length;
  const state = Array.from({ length: rightLength + 1 }, (_, index) => index);

  for (let row = 1; row <= leftLength; row += 1) {
    let previous = state[0];
    state[0] = row;
    for (let column = 1; column <= rightLength; column += 1) {
      const snapshot = state[column];
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      state[column] = Math.min(state[column] + 1, state[column - 1] + 1, previous + cost);
      previous = snapshot;
    }
  }

  return state[rightLength];
};

const tokenizeLower = (text: string): string[] =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export const inferSpeciesFromWorkflowContext = (input: {
  original_user_request?: string;
  previous_decisions?: Record<string, string>;
}): string | null => {
  const text = input.original_user_request || '';
  const decisions = input.previous_decisions || {};

  const heritage = String(decisions['aasimar-heritage'] ?? decisions['Aasimar Subrace'] ?? '').toLowerCase();
  if (heritage.includes('aasimar')) {
    return 'Aasimar';
  }

  const tokens = tokenizeLower(text);
  for (const token of tokens) {
    for (const species of SPECIES_CANON) {
      const target = species.toLowerCase();
      if (token === target) {
        return species;
      }
      if (token.length >= 5 && Math.abs(token.length - target.length) <= 2 && levenshtein(token, target) <= 1) {
        return species;
      }
    }
  }

  return null;
};

const normalizeSpeedStrings = (value: unknown): Record<string, string> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const result: Record<string, string> = {};
  for (const key of STATS_SPEED_KEYS) {
    const entry = value[key];
    if (typeof entry === 'number') {
      result[key] = `${entry} ft.`;
      continue;
    }

    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        result[key] = trimmed;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
};

export function repairWorkflowStagePayload(input: WorkflowStageRepairInput): WorkflowStageRepairResult {
  const appliedRepairs: string[] = [];
  const contractKey = resolveWorkflowStageContractKey(input.stageIdOrName, input.workflowType);
  let payload = repairStringifiedFields(input.payload, appliedRepairs);

  if (contractKey === 'planner') {
    const normalized = normalizePlannerPayload(payload, input.workflowType, input.configFlags);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('planner:normalize');
    }
    payload = normalized;
  }

  if (contractKey === 'core_details') {
    const normalized = normalizeCoreDetailsStageInput(payload);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('core_details:flatten_personality');
    }
    payload = normalized;
  }

  const contract = getWorkflowStageContract(input.stageIdOrName, input.workflowType);
  if (contract && input.pruneToContractKeys !== false) {
    const pruned = pruneWorkflowStageOutput(payload, contract.allowedKeys) as JsonRecord;
    if (JSON.stringify(pruned) !== JSON.stringify(payload)) {
      appliedRepairs.push(`pruned:${contractKey ?? input.stageIdOrName}`);
    }
    payload = pruned;
  }

  if (contractKey === 'basic_info') {
    const inferredSpecies = inferSpeciesFromWorkflowContext({
      original_user_request: input.configPrompt,
      previous_decisions: input.previousDecisions,
    });

    if (typeof payload.race === 'string' && typeof payload.species !== 'string') {
      payload = { ...payload, species: payload.race };
      appliedRepairs.push('basic_info:copy_race_to_species');
    }

    if (typeof payload.species === 'string' && typeof payload.race !== 'string') {
      payload = { ...payload, race: payload.species };
      appliedRepairs.push('basic_info:copy_species_to_race');
    }

    if (inferredSpecies) {
      if (typeof payload.species !== 'string') {
        payload = { ...payload, species: inferredSpecies };
        appliedRepairs.push('basic_info:infer_species');
      }
      if (typeof payload.race !== 'string') {
        payload = { ...payload, race: inferredSpecies };
        appliedRepairs.push('basic_info:infer_race');
      }
    }
  }

  if (contractKey === 'core_details') {
    const normalized = normalizeCoreDetailsPayload(payload, {
      name: typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : 'Unknown',
      alignment: typeof payload.alignment === 'string' ? payload.alignment : undefined,
      oath: input.previousDecisions?.['oath-subclass'],
      location: typeof payload.location === 'string' ? payload.location : undefined,
      tone: typeof input.configFlags?.tone === 'string' ? input.configFlags.tone : undefined,
    });
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('core_details:normalize');
    }
    payload = normalized;
  }

  if (contractKey === 'stats' && payload.speed !== undefined) {
    const normalizedSpeed = normalizeSpeedStrings(payload.speed);
    if (normalizedSpeed) {
      payload = { ...payload, speed: normalizedSpeed };
      appliedRepairs.push('stats:normalize_speed');
    }
  }

  return {
    payload,
    contractKey,
    appliedRepairs,
  };
}
