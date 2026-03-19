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

const CHARACTER_BUILD_TEXT_ARRAY_KEYS = [
  'class_features',
  'subclass_features',
  'racial_features',
  'feats',
  'fighting_styles',
] as const;

const CHARACTER_BUILD_VALUE_ARRAY_KEYS = ['skill_proficiencies', 'saving_throws'] as const;

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

const normalizeLooseStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  return normalizeStringArray(value);
};

const coerceNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const coercePositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : undefined;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  }

  return undefined;
};

const normalizeSignedModifier = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '+0';
  }

  return trimmed.startsWith('+') || trimmed.startsWith('-')
    ? trimmed
    : `+${trimmed}`;
};

const parseNameValueStringEntry = (value: string): { name: string; modifier: string } | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const trailingModifierMatch = trimmed.match(/^(.*?)(?:\s*\(([+-]?\d+)\)|\s+([+-]?\d+))\s*$/);
  if (!trailingModifierMatch) {
    return {
      name: trimmed,
      modifier: '+0',
    };
  }

  const name = trailingModifierMatch[1]?.trim();
  const modifier = trailingModifierMatch[2] ?? trailingModifierMatch[3];
  if (!name || !modifier) {
    return {
      name: trimmed,
      modifier: '+0',
    };
  }

  return {
    name,
    modifier: normalizeSignedModifier(modifier),
  };
};

const coerceModifierText = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeSignedModifier(String(Math.trunc(value)));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? normalizeSignedModifier(trimmed) : undefined;
  }

  return undefined;
};

const normalizeNamedDescriptionEntries = (
  value: unknown,
  options?: { includeLevel?: boolean },
): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) {
          return null;
        }

        return {
          name: trimmed,
          description: trimmed,
        } as JsonRecord;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name)
        ?? coerceNonEmptyString(entry.title)
        ?? coerceNonEmptyString(entry.feature)
        ?? coerceNonEmptyString(entry.choice);

      if (!name) {
        return null;
      }

      const description = coerceNonEmptyString(entry.description)
        ?? coerceNonEmptyString(entry.details)
        ?? coerceNonEmptyString(entry.text)
        ?? name;

      const normalized: JsonRecord = {
        name,
        description,
      };

      const source = coerceNonEmptyString(entry.source)
        ?? coerceNonEmptyString(entry.class)
        ?? coerceNonEmptyString(entry.subclass)
        ?? coerceNonEmptyString(entry.race);
      if (source) {
        normalized.source = source;
      }

      const uses = coerceNonEmptyString(entry.uses);
      if (uses) {
        normalized.uses = uses;
      }

      const notes = coerceNonEmptyString(entry.notes);
      if (notes) {
        normalized.notes = notes;
      }

      const prerequisite = coerceNonEmptyString(entry.prerequisite);
      if (prerequisite) {
        normalized.prerequisite = prerequisite;
      }

      if (options?.includeLevel) {
        const level = coercePositiveInteger(entry.level ?? entry.gained_at_level);
        if (level !== undefined) {
          normalized.level = level;
        }
      }

      return normalized;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const normalizeNameValueEntries = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const parsedEntry = parseNameValueStringEntry(entry);
        if (!parsedEntry) {
          return null;
        }

        return {
          name: parsedEntry.name,
          value: parsedEntry.modifier,
        } as JsonRecord;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name)
        ?? coerceNonEmptyString(entry.skill)
        ?? coerceNonEmptyString(entry.save)
        ?? coerceNonEmptyString(entry.ability);
      if (!name) {
        return null;
      }

      const valueText = coerceModifierText(entry.value)
        ?? coerceModifierText(entry.modifier)
        ?? coerceModifierText(entry.bonus)
        ?? '+0';

      const normalized: JsonRecord = {
        name,
        value: normalizeSignedModifier(valueText),
      };

      const notes = coerceNonEmptyString(entry.notes);
      if (notes) {
        normalized.notes = notes;
      }

      return normalized;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const normalizeCharacterBuildPayload = (payload: JsonRecord): JsonRecord => {
  const normalized: JsonRecord = { ...payload };

  for (const key of CHARACTER_BUILD_TEXT_ARRAY_KEYS) {
    normalized[key] = normalizeNamedDescriptionEntries(payload[key], {
      includeLevel: key === 'class_features' || key === 'subclass_features',
    });
  }

  for (const key of CHARACTER_BUILD_VALUE_ARRAY_KEYS) {
    normalized[key] = normalizeNameValueEntries(payload[key]);
  }

  return normalized;
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

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const normalizeAbilityScores = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const source = Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
    acc[key.trim().toLowerCase()] = entryValue;
    return acc;
  }, {});

  const aliasMap: Record<string, string[]> = {
    str: ['str', 'strength'],
    dex: ['dex', 'dexterity'],
    con: ['con', 'constitution'],
    int: ['int', 'intelligence'],
    wis: ['wis', 'wisdom'],
    cha: ['cha', 'charisma'],
  };

  const normalized: Record<string, number> = {};

  for (const [canonicalKey, aliases] of Object.entries(aliasMap)) {
    const candidates = aliases
      .map((alias) => coerceFiniteNumber(source[alias]))
      .filter((candidate): candidate is number => candidate !== undefined);

    if (candidates.length === 0) {
      continue;
    }

    normalized[canonicalKey] = candidates.find((candidate) => candidate !== 10) ?? candidates[0];
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
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

const normalizeSpellListMap = (value: unknown, fallbackKey: string): JsonRecord => {
  if (isRecord(value)) {
    const normalizedEntries = Object.entries(value).reduce<JsonRecord>((acc, [key, entryValue]) => {
      const normalizedKey = coerceNonEmptyString(key);
      if (!normalizedKey) {
        return acc;
      }

      if (Array.isArray(entryValue)) {
        const normalizedList = normalizeStringArray(entryValue);
        if (normalizedList.length > 0) {
          acc[normalizedKey] = normalizedList;
        }
        return acc;
      }

      const singleValue = coerceNonEmptyString(entryValue);
      if (singleValue) {
        acc[normalizedKey] = [singleValue];
      }

      return acc;
    }, {});

    return normalizedEntries;
  }

  if (Array.isArray(value)) {
    const normalizedList = normalizeStringArray(value);
    return normalizedList.length > 0 ? { [fallbackKey]: normalizedList } : {};
  }

  const singleValue = coerceNonEmptyString(value);
  return singleValue ? { [fallbackKey]: [singleValue] } : {};
};

const normalizeSpellSlotsMap = (value: unknown): JsonRecord => {
  if (isRecord(value)) {
    return Object.entries(value).reduce<JsonRecord>((acc, [level, slotCount]) => {
      const normalizedLevel = coerceNonEmptyString(level);
      const normalizedCount = coercePositiveInteger(slotCount);
      if (normalizedLevel && normalizedCount !== undefined) {
        acc[normalizedLevel] = normalizedCount;
      }
      return acc;
    }, {});
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }

    const slotMatch = trimmed.match(/(\d+)\s*slots?.*?(\d+)(?:st|nd|rd|th)?\s*level/i)
      ?? trimmed.match(/(\d+)(?:st|nd|rd|th)?\s*level.*?(\d+)\s*slots?/i);

    if (slotMatch) {
      const first = Number.parseInt(slotMatch[1] ?? '', 10);
      const second = Number.parseInt(slotMatch[2] ?? '', 10);
      const count = trimmed.toLowerCase().includes('level') && slotMatch[0] === trimmed && trimmed.match(/slots?.*level/i)
        ? first
        : second;
      const level = trimmed.toLowerCase().includes('level') && slotMatch[0] === trimmed && trimmed.match(/slots?.*level/i)
        ? second
        : first;

      if (Number.isFinite(count) && count > 0 && Number.isFinite(level) && level > 0) {
        return { [String(level)]: count };
      }
    }
  }

  return {};
};

 const normalizeSpellKnownArray = (value: unknown): string[] => {
   if (Array.isArray(value)) {
     return normalizeStringArray(value);
   }

   if (isRecord(value)) {
     const flattened = Object.values(value).flatMap((entryValue) => {
       if (Array.isArray(entryValue)) {
         return normalizeStringArray(entryValue);
       }

       const singleValue = coerceNonEmptyString(entryValue);
       return singleValue ? [singleValue] : [];
     });

     return [...new Set(flattened)];
   }

   const singleValue = coerceNonEmptyString(value);
   return singleValue ? [singleValue] : [];
 };

const normalizeSpellcastingPayload = (payload: JsonRecord): JsonRecord => {
  const normalized: JsonRecord = { ...payload };

  if (Object.prototype.hasOwnProperty.call(normalized, 'spell_slots')) {
    normalized.spell_slots = normalizeSpellSlotsMap(normalized.spell_slots);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'prepared_spells')) {
    normalized.prepared_spells = normalizeSpellListMap(normalized.prepared_spells, 'prepared');
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'always_prepared_spells')) {
    normalized.always_prepared_spells = normalizeSpellListMap(normalized.always_prepared_spells, 'always');
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'innate_spells')) {
    normalized.innate_spells = normalizeSpellListMap(normalized.innate_spells, 'special');
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'spells_known')) {
    normalized.spells_known = normalizeSpellKnownArray(normalized.spells_known);
  }

  return normalized;
};

const SCENE_TYPE_ALIASES: Record<string, string> = {
  roleplay: 'social',
  role_play: 'social',
  dialogue: 'social',
  narrative: 'cutscene',
  cut_scene: 'cutscene',
};

const SCENE_DISPOSITION_ALIASES: Record<string, 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'helpful'> = {
  ally: 'friendly',
  allied: 'friendly',
  friend: 'friendly',
  enemy: 'hostile',
  suspicious: 'unfriendly',
};

const normalizeSceneType = (value: unknown): string | undefined => {
  const normalized = coerceNonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return undefined;
  }

  return SCENE_TYPE_ALIASES[normalized] ?? normalized;
};

const normalizeSceneDisposition = (value: unknown): string | undefined => {
  const normalized = coerceNonEmptyString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (['hostile', 'unfriendly', 'neutral', 'friendly', 'helpful'].includes(normalized)) {
    return normalized;
  }

  return SCENE_DISPOSITION_ALIASES[normalized];
};

const uniqueStringParts = (...groups: Array<string | string[] | undefined>): string[] => {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const group of groups) {
    const values = typeof group === 'string' ? [group] : Array.isArray(group) ? group : [];
    for (const value of values) {
      const trimmed = value.trim();
      const normalized = trimmed.toLowerCase();
      if (!trimmed || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      parts.push(trimmed);
    }
  }

  return parts;
};

const normalizeSceneSensoryDetails = (value: unknown): JsonRecord | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const sensoryDetails: JsonRecord = {};
  const sights = normalizeLooseStringArray(value.sights);
  const sounds = normalizeLooseStringArray(value.sounds);
  const smells = normalizeLooseStringArray(value.smells);

  if (sights.length > 0) {
    sensoryDetails.sights = sights;
  }
  if (sounds.length > 0) {
    sensoryDetails.sounds = sounds;
  }
  if (smells.length > 0) {
    sensoryDetails.smells = smells;
  }

  return Object.keys(sensoryDetails).length > 0 ? sensoryDetails : undefined;
};

const normalizeSceneLocation = (payload: JsonRecord): JsonRecord | undefined => {
  const existingLocation = isRecord(payload.location) ? payload.location : null;
  const legacySetting = isRecord(payload.setting) ? payload.setting : null;

  const name = coerceNonEmptyString(existingLocation?.name)
    ?? coerceNonEmptyString(payload.location)
    ?? coerceNonEmptyString(legacySetting?.location)
    ?? coerceNonEmptyString(legacySetting?.name)
    ?? coerceNonEmptyString(payload.title);
  const description = coerceNonEmptyString(existingLocation?.description)
    ?? coerceNonEmptyString(legacySetting?.description)
    ?? coerceNonEmptyString(legacySetting?.atmosphere)
    ?? coerceNonEmptyString(legacySetting?.mood)
    ?? coerceNonEmptyString(payload.description);

  if (!name || !description) {
    return undefined;
  }

  const location: JsonRecord = {
    name,
    description,
  };

  const region = coerceNonEmptyString(existingLocation?.region)
    ?? coerceNonEmptyString(legacySetting?.region)
    ?? coerceNonEmptyString(payload.region);
  const ambiance = coerceNonEmptyString(existingLocation?.ambiance)
    ?? coerceNonEmptyString(legacySetting?.ambiance)
    ?? coerceNonEmptyString(legacySetting?.atmosphere)
    ?? coerceNonEmptyString(legacySetting?.mood);
  const sensoryDetails = normalizeSceneSensoryDetails(existingLocation?.sensory_details)
    ?? normalizeSceneSensoryDetails(legacySetting?.sensory_details);

  if (region) {
    location.region = region;
  }
  if (ambiance) {
    location.ambiance = ambiance;
  }
  if (sensoryDetails) {
    location.sensory_details = sensoryDetails;
  }

  return location;
};

const normalizeSceneParticipants = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const name = coerceNonEmptyString(entry);
        return name ? { name, role: 'participant' } as JsonRecord : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name)
        ?? coerceNonEmptyString(entry.character)
        ?? coerceNonEmptyString(entry.npc);
      if (!name) {
        return null;
      }

      const role = coerceNonEmptyString(entry.role)
        ?? coerceNonEmptyString(entry.function)
        ?? 'participant';
      const goals = uniqueStringParts(
        normalizeLooseStringArray(entry.goals),
        normalizeLooseStringArray(entry.goal),
      );
      const disposition = normalizeSceneDisposition(entry.disposition);

      const participant: JsonRecord = { name, role };
      if (goals.length > 0) {
        participant.goals = goals;
      }
      if (disposition) {
        participant.disposition = disposition;
      }

      return participant;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const normalizeSceneSkillChallenges = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const description = coerceNonEmptyString(entry);
        return description
          ? {
            description,
            suggested_skills: [],
            dc: 10,
          } as JsonRecord
          : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const description = coerceNonEmptyString(entry.description)
        ?? coerceNonEmptyString(entry.purpose)
        ?? coerceNonEmptyString(entry.challenge)
        ?? coerceNonEmptyString(entry.skill);
      if (!description) {
        return null;
      }

      const suggestedSkills = uniqueStringParts(
        normalizeLooseStringArray(entry.suggested_skills),
        normalizeLooseStringArray(entry.skills),
        normalizeLooseStringArray(entry.skill),
      );
      const dc = coercePositiveInteger(entry.dc) ?? 10;
      const challenge: JsonRecord = {
        description,
        suggested_skills: suggestedSkills,
        dc: Math.min(30, Math.max(5, dc)),
      };

      const existingConsequences = isRecord(entry.consequences) ? entry.consequences : null;
      const success = coerceNonEmptyString(existingConsequences?.success)
        ?? coerceNonEmptyString(entry.success_result);
      const failure = coerceNonEmptyString(existingConsequences?.failure)
        ?? coerceNonEmptyString(entry.failure_result);
      if (success || failure) {
        challenge.consequences = {
          ...(success ? { success } : {}),
          ...(failure ? { failure } : {}),
        } as JsonRecord;
      }

      return challenge;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const collectSceneObjectives = (payload: JsonRecord): string[] => {
  const canonicalObjectives = normalizeLooseStringArray(payload.objectives);
  if (canonicalObjectives.length > 0) {
    return canonicalObjectives;
  }

  const hooks = normalizeLooseStringArray(payload.hooks);
  if (hooks.length > 0) {
    return hooks;
  }

  if (Array.isArray(payload.events)) {
    const eventObjectives = payload.events
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }

        return coerceNonEmptyString(entry.objective)
          ?? coerceNonEmptyString(entry.description)
          ?? coerceNonEmptyString(entry.trigger);
      })
      .filter((entry): entry is string => typeof entry === 'string');
    if (eventObjectives.length > 0) {
      return uniqueStringParts(eventObjectives);
    }
  }

  if (Array.isArray(payload.branching_paths)) {
    const branchObjectives = payload.branching_paths
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }

        return coerceNonEmptyString(entry.player_choice)
          ?? coerceNonEmptyString(entry.consequence);
      })
      .filter((entry): entry is string => typeof entry === 'string');
    if (branchObjectives.length > 0) {
      return uniqueStringParts(branchObjectives);
    }
  }

  const description = coerceNonEmptyString(payload.description);
  if (!description) {
    return [];
  }

  const firstSentence = description.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? description;
  return firstSentence ? [firstSentence] : [];
};

const normalizeSceneTransitions = (value: unknown): JsonRecord | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entry = coerceNonEmptyString(value.entry)
    ?? coerceNonEmptyString(value.from_previous);
  const legacyExit = uniqueStringParts(normalizeLooseStringArray(value.to_next)).join('; ');
  const exit = coerceNonEmptyString(value.exit)
    ?? (legacyExit.length > 0 ? legacyExit : undefined);

  if (!entry && !exit) {
    return undefined;
  }

  return {
    ...(entry ? { entry } : {}),
    ...(exit ? { exit } : {}),
  };
};

const normalizeSceneGmNotes = (payload: JsonRecord): string | undefined => {
  const narration = isRecord(payload.narration) ? payload.narration : null;
  const notes = uniqueStringParts(
    coerceNonEmptyString(payload.gm_notes),
    normalizeLooseStringArray(narration?.gm_secrets),
  );

  return notes.length > 0 ? notes.join('\n') : undefined;
};

const normalizeSceneTextFragment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sceneDescriptionContainsFragment = (description: string, fragment: string | undefined): boolean => {
  if (!fragment) {
    return false;
  }

  const normalizedDescription = normalizeSceneTextFragment(description);
  const normalizedFragment = normalizeSceneTextFragment(fragment);
  return normalizedFragment.length > 0 && normalizedDescription.includes(normalizedFragment);
};

const normalizeSceneDescription = (
  payload: JsonRecord,
  location: JsonRecord | undefined,
  objectives: string[],
  hooks: string[],
  discoveries: string[],
): string | undefined => {
  const narration = isRecord(payload.narration) ? payload.narration : null;
  const firstEventText = Array.isArray(payload.events)
    ? payload.events
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }

        return coerceNonEmptyString(entry.description)
          ?? coerceNonEmptyString(entry.trigger);
      })
      .find((entry): entry is string => typeof entry === 'string')
    : undefined;

  const baseDescription = coerceNonEmptyString(payload.description) ?? '';
  const locationDescription = coerceNonEmptyString(location?.description);
  const narrationOpening = coerceNonEmptyString(narration?.opening);
  const narrationPerspective = coerceNonEmptyString(narration?.player_perspective);
  const hooksSummary = hooks.length > 0 ? `Hooks: ${hooks.join('; ')}.` : undefined;
  const objectivesSummary = objectives.length > 0 ? `Objectives: ${objectives.join('; ')}.` : undefined;
  const discoveriesSummary = discoveries.length > 0 ? `Discoveries: ${discoveries.join('; ')}.` : undefined;

  const parts = uniqueStringParts(
    baseDescription || undefined,
    sceneDescriptionContainsFragment(baseDescription, locationDescription) ? undefined : locationDescription,
    sceneDescriptionContainsFragment(baseDescription, narrationOpening) ? undefined : narrationOpening,
    sceneDescriptionContainsFragment(baseDescription, narrationPerspective) ? undefined : narrationPerspective,
    sceneDescriptionContainsFragment(baseDescription, hooksSummary) ? undefined : hooksSummary,
    sceneDescriptionContainsFragment(baseDescription, objectivesSummary) ? undefined : objectivesSummary,
    sceneDescriptionContainsFragment(baseDescription, discoveriesSummary) ? undefined : discoveriesSummary,
    sceneDescriptionContainsFragment(baseDescription, firstEventText) ? undefined : firstEventText,
  );
  let description = parts.join(' ').trim();

  if (description.length > 0 && description.length < 100) {
    const locationName = coerceNonEmptyString(location?.name);
    const fallbackSummary = uniqueStringParts(
      coerceNonEmptyString(payload.title)
        ? `Scene focus: ${payload.title}.`
        : undefined,
      locationName
        ? `Location: ${locationName}.`
        : undefined,
      objectives.length > 0
        ? `Primary objective: ${objectives.join('; ')}.`
        : undefined,
    ).join(' ');

    if (fallbackSummary.length > 0) {
      description = uniqueStringParts(description, fallbackSummary).join(' ');
    }
  }

  return description.length > 0 ? description : undefined;
};

const normalizeScenePayload = (payload: JsonRecord): JsonRecord => {
  const normalized: JsonRecord = { ...payload };
  const hooks = normalizeLooseStringArray(payload.hooks);
  const location = normalizeSceneLocation(payload);
  const participants = normalizeSceneParticipants(payload.participants ?? payload.npcs_present);
  const objectives = collectSceneObjectives(payload);
  const skillChallenges = normalizeSceneSkillChallenges(payload.skill_challenges ?? payload.skill_checks);
  const discoveries = uniqueStringParts(
    normalizeLooseStringArray(payload.discoveries),
    normalizeLooseStringArray(payload.clues_information),
  );
  const transitions = normalizeSceneTransitions(payload.transitions);
  const gmNotes = normalizeSceneGmNotes(payload);
  const sceneType = normalizeSceneType(payload.scene_type);
  const description = normalizeSceneDescription(payload, location, objectives, hooks, discoveries);

  if (sceneType) {
    normalized.scene_type = sceneType;
  }
  if (location) {
    normalized.location = location;
  }
  if (participants.length > 0) {
    normalized.participants = participants;
  }
  if (objectives.length > 0) {
    normalized.objectives = objectives;
  }
  if (hooks.length > 0 || Object.prototype.hasOwnProperty.call(payload, 'hooks')) {
    normalized.hooks = hooks;
  }
  if (skillChallenges.length > 0) {
    normalized.skill_challenges = skillChallenges;
  }
  if (discoveries.length > 0) {
    normalized.discoveries = discoveries;
  }
  if (transitions) {
    normalized.transitions = transitions;
  }
  if (gmNotes) {
    normalized.gm_notes = gmNotes;
  }
  if (description) {
    normalized.description = description;
  }

  delete normalized.setting;
  delete normalized.narration;
  delete normalized.npcs_present;
  delete normalized.events;
  delete normalized.skill_checks;
  delete normalized.branching_paths;
  delete normalized.clues_information;
  delete normalized.estimated_duration;

  return normalized;
};

const normalizeStoryArcSecretEntries = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const secret = coerceNonEmptyString(entry);
        return secret
          ? {
            secret,
            discovery_method: 'Investigation, conversation, or exploration',
            impact: secret,
          } as JsonRecord
          : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const secret = coerceNonEmptyString(entry.secret)
        ?? coerceNonEmptyString(entry.clue)
        ?? coerceNonEmptyString(entry.revelation)
        ?? coerceNonEmptyString(entry.name);
      if (!secret) {
        return null;
      }

      const discoveryMethodParts = [
        coerceNonEmptyString(entry.discovery_method),
        ...normalizeStringArray(entry.discovery_methods),
        ...normalizeStringArray(entry.methods),
      ].filter((part): part is string => typeof part === 'string' && part.length > 0);
      const impact = coerceNonEmptyString(entry.impact)
        ?? coerceNonEmptyString(entry.effect)
        ?? coerceNonEmptyString(entry.consequence)
        ?? secret;

      return {
        secret,
        discovery_method: discoveryMethodParts.length > 0
          ? discoveryMethodParts.join('; ')
          : 'Investigation, conversation, or exploration',
        impact,
      } satisfies JsonRecord;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const normalizeStoryArcRewards = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const name = coerceNonEmptyString(entry);
        return name
          ? {
            name,
            type: 'information',
            when: 'At a pivotal story milestone',
          } as JsonRecord
          : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = coerceNonEmptyString(entry.name)
        ?? coerceNonEmptyString(entry.reward)
        ?? coerceNonEmptyString(entry.title);
      if (!name) {
        return null;
      }

      return {
        name,
        type: coerceNonEmptyString(entry.type) ?? 'information',
        when: coerceNonEmptyString(entry.when) ?? coerceNonEmptyString(entry.timing) ?? 'At a pivotal story milestone',
      } satisfies JsonRecord;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const normalizeStoryArcSecretsPayload = (payload: JsonRecord): JsonRecord => ({
  ...payload,
  clues_and_secrets: normalizeStoryArcSecretEntries(payload.clues_and_secrets),
  rewards: normalizeStoryArcRewards(payload.rewards),
  dm_notes: normalizeStringArray(payload.dm_notes),
});

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

  if (contractKey === 'character_build') {
    const normalized = normalizeCharacterBuildPayload(payload);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('character_build:normalize');
    }
    payload = normalized;
  }

  if (contractKey === 'spellcasting') {
    const normalized = normalizeSpellcastingPayload(payload);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('spellcasting:normalize');
    }
    payload = normalized;
  }

  if (input.workflowType === 'scene' && contractKey === 'creator') {
    const normalized = normalizeScenePayload(payload);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('scene:normalize');
    }
    payload = normalized;
  }

  if (contractKey === 'story_arc.secrets') {
    const normalized = normalizeStoryArcSecretsPayload(payload);
    if (JSON.stringify(normalized) !== JSON.stringify(payload)) {
      appliedRepairs.push('story_arc.secrets:normalize');
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

  if (contractKey === 'stats' && payload.ability_scores !== undefined) {
    const normalizedAbilityScores = normalizeAbilityScores(payload.ability_scores);
    if (normalizedAbilityScores && JSON.stringify(normalizedAbilityScores) !== JSON.stringify(payload.ability_scores)) {
      payload = { ...payload, ability_scores: normalizedAbilityScores };
      appliedRepairs.push('stats:normalize_ability_scores');
    }
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
