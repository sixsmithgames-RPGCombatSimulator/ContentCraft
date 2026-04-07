import { preformatPromptForAi } from './promptPreformatter';

type JsonRecord = Record<string, unknown>;

export interface ParsedClassLevel {
  class: string;
  level?: number;
  subclass?: string;
}

export interface NpcRequestFacts {
  name?: string;
  level?: number;
  class?: string;
  subclass?: string;
  class_levels?: ParsedClassLevel[];
  species?: string;
  race?: string;
  subrace?: string;
  background?: string;
  alignment?: string;
  age?: number;
  description?: string;
  backstory?: string;
  ability_scores?: Record<string, number>;
  appearance?: Record<string, string>;
}

export interface RequestBlueprint {
  source_kind: 'structured' | 'plain';
  explicit_facts: JsonRecord;
  success_criteria: string[];
  blocking_gaps: string[];
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ABILITY_ALIASES: Record<string, string[]> = {
  str: ['str', 'strength'],
  dex: ['dex', 'dexterity'],
  con: ['con', 'constitution'],
  int: ['int', 'intelligence'],
  wis: ['wis', 'wisdom'],
  cha: ['cha', 'charisma'],
};

const PREPARED_FULL_CASTERS = new Set(['cleric', 'druid', 'wizard']);
const PREPARED_HALF_CASTERS = new Set(['paladin', 'ranger', 'artificer']);
const KNOWN_FULL_CASTERS = new Set(['bard', 'sorcerer']);
const PACT_CASTERS = new Set(['warlock']);

function parseScalarValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  return trimmed;
}

function parseStructuredBriefObject(prompt: string): JsonRecord | null {
  const normalizedPrompt = prompt.replace(/\r\n?/g, '\n').trim();
  const formatted = normalizedPrompt.startsWith('Structured brief:')
    ? normalizedPrompt
    : preformatPromptForAi(prompt).normalizedPrompt;
  if (!formatted.startsWith('Structured brief:')) {
    return null;
  }

  const lines = formatted
    .replace(/^Structured brief:\s*Structured brief:\s*/i, 'Structured brief:\n')
    .replace(/^Structured brief:\s*/i, '')
    .split('\n')
    .filter((line) => line.trim().length > 0 && line.trim().toLowerCase() !== 'structured brief:' && !line.trim().startsWith('- '));

  if (lines.length === 0) {
    return null;
  }

  const root: JsonRecord = {};
  const stack: Array<{ indent: number; obj: JsonRecord }> = [{ indent: -1, obj: root }];

  for (const line of lines) {
    const match = line.match(/^(\s*)([^:\n]+):(.*)$/);
    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const key = match[2].trim().toLowerCase().replace(/\s+/g, '_');
    const rawValue = match[3];

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.obj ?? root;
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      const child: JsonRecord = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
      continue;
    }

    parent[key] = parseScalarValue(trimmedValue);
  }

  return root;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeAbilityScores(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;

  const normalized: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(ABILITY_ALIASES)) {
    const match = aliases
      .map((alias) => coerceNumber(value[alias]))
      .find((score): score is number => typeof score === 'number');
    if (typeof match === 'number') {
      normalized[canonical] = match;
    }
  }

  return Object.keys(normalized).length === 6 ? normalized : undefined;
}

function parseClassLevelText(value: string | undefined, explicitLevel?: number): ParsedClassLevel[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const subclassMatch = trimmed.match(/^(.+?)\s*\((.+)\)\s*(\d+)?$/);
  if (subclassMatch) {
    return [{
      class: subclassMatch[1].trim(),
      subclass: subclassMatch[2].trim(),
      level: coerceNumber(subclassMatch[3]) ?? explicitLevel,
    }];
  }

  const levelMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (levelMatch) {
    return [{
      class: levelMatch[1].trim(),
      level: coerceNumber(levelMatch[2]) ?? explicitLevel,
    }];
  }

  return [{
    class: trimmed,
    level: explicitLevel,
  }];
}

function normalizeClassLevels(value: unknown, levelHint?: number): ParsedClassLevel[] | undefined {
  if (Array.isArray(value)) {
    const normalized: ParsedClassLevel[] = [];

    value.forEach((entry) => {
      if (!isRecord(entry)) return;
      const className = coerceString(entry.class) ?? coerceString(entry.name);
      if (!className) return;

      normalized.push({
        class: className,
        ...(coerceString(entry.subclass) ? { subclass: coerceString(entry.subclass) } : {}),
        ...((coerceNumber(entry.level) ?? levelHint) !== undefined ? { level: coerceNumber(entry.level) ?? levelHint } : {}),
      });
    });

    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'string') {
    return parseClassLevelText(value, levelHint);
  }

  return undefined;
}

export function normalizeNpcClassLevels(value: unknown, levelHint?: number): ParsedClassLevel[] | undefined {
  return normalizeClassLevels(value, levelHint);
}

function extractSceneExplicitFacts(prompt: string): JsonRecord {
  const sentences = prompt
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 4);

  const capitalizedNames = Array.from(
    new Set(
      (prompt.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])
        .filter((token) => !['Create', 'Describe'].includes(token)),
    ),
  ).slice(0, 4);

  return {
    ...(capitalizedNames.length > 0 ? { named_entities: capitalizedNames } : {}),
    ...(sentences.length > 0 ? { requested_beats: sentences } : {}),
  };
}

function buildSceneSuccessCriteria(prompt: string): string[] {
  const lowered = prompt.toLowerCase();
  const criteria = [
    'Satisfy the explicit scene request before adding optional embellishments.',
    'Use canon-backed details for named characters, abilities, and setting elements when available.',
    'Avoid pausing for user input unless the request has a direct blocking contradiction.',
  ];

  if (lowered.includes('all of his abilities') || lowered.includes('all of her abilities') || lowered.includes('all of their abilities')) {
    criteria.unshift('Show the requested character using their full established ability kit during the scene.');
  }
  if (lowered.includes('ambush')) {
    criteria.unshift('Include the ambush itself and the character’s response, not just aftermath or summary.');
  }
  if (lowered.includes('fight') || lowered.includes('fighting')) {
    criteria.unshift('Keep the scene action-forward and centered on the requested combat exchange.');
  }

  return Array.from(new Set(criteria)).slice(0, 6);
}

export function extractNpcRequestFacts(prompt: string): NpcRequestFacts {
  const structured = parseStructuredBriefObject(prompt);
  if (!structured) {
    return {};
  }

  const level = coerceNumber(structured.level);
  const classLevels =
    normalizeClassLevels(structured.class_levels, level)
    ?? normalizeClassLevels(structured.class, level);

  return {
    name: coerceString(structured.name),
    level,
    class: classLevels?.[0]?.class ?? coerceString(structured.class),
    subclass: classLevels?.[0]?.subclass ?? coerceString(structured.subclass),
    class_levels: classLevels,
    species: coerceString(structured.species) ?? coerceString(structured.race),
    race: coerceString(structured.race) ?? coerceString(structured.species),
    subrace: coerceString(structured.subrace),
    background: coerceString(structured.background),
    alignment: coerceString(structured.alignment),
    age: coerceNumber(structured.age),
    description: coerceString(structured.description),
    backstory: coerceString(structured.backstory),
    ability_scores: normalizeAbilityScores(structured.abilities ?? structured.ability_scores ?? structured),
    appearance: isRecord(structured.appearance) ? structured.appearance as Record<string, string> : undefined,
  };
}

export function buildRequestBlueprint(
  prompt: string,
  workflowType?: string | null,
  flags?: Record<string, unknown>,
): RequestBlueprint {
  const npcFacts = extractNpcRequestFacts(prompt);
  const hasNpcFacts = Object.keys(npcFacts).length > 0;
  const type = (workflowType || '').toLowerCase();
  const allowInvention = typeof flags?.allow_invention === 'string' ? flags.allow_invention : undefined;

  if (type === 'npc' || hasNpcFacts) {
    const explicitFacts: JsonRecord = {
      ...(npcFacts.name ? { name: npcFacts.name } : {}),
      ...(npcFacts.level !== undefined ? { level: npcFacts.level } : {}),
      ...(npcFacts.class_levels ? { class_levels: npcFacts.class_levels } : {}),
      ...(npcFacts.race ? { race: npcFacts.race } : {}),
      ...(npcFacts.subrace ? { subrace: npcFacts.subrace } : {}),
      ...(npcFacts.background ? { background: npcFacts.background } : {}),
      ...(npcFacts.alignment ? { alignment: npcFacts.alignment } : {}),
      ...(npcFacts.ability_scores ? { ability_scores: npcFacts.ability_scores } : {}),
      ...(npcFacts.description ? { description: npcFacts.description } : {}),
      ...(npcFacts.backstory ? { backstory: npcFacts.backstory } : {}),
    };

    const successCriteria = [
      'Preserve explicit identity, ancestry, class, level, background, and alignment facts from the user request.',
      'Use explicit ability scores from the request as authoritative instead of inventing replacements.',
      'Derive mechanical details from the supplied character facts before asking the user for anything else.',
      'Only raise proposals for direct contradictions or truly blocking gaps after using the request and canon.',
      allowInvention
        ? `Keep invention within the user's allowance (${allowInvention}).`
        : 'Keep invention conservative and grounded in the request.',
    ];

    if (npcFacts.appearance && Object.keys(npcFacts.appearance).length > 0) {
      successCriteria.splice(2, 0, 'Carry forward the explicit appearance details and descriptive cues from the request.');
    }

    return {
      source_kind: 'structured',
      explicit_facts: explicitFacts,
      success_criteria: successCriteria.slice(0, 6),
      blocking_gaps: [],
    };
  }

  return {
    source_kind: 'plain',
    explicit_facts: extractSceneExplicitFacts(prompt),
    success_criteria: buildSceneSuccessCriteria(prompt),
    blocking_gaps: [],
  };
}

export function resolveNpcCasterProfile(input: {
  classLevels?: ParsedClassLevel[] | null;
  fallbackClass?: string;
  fallbackSubclass?: string;
  fallbackLevel?: number;
}): {
  className?: string;
  subclass?: string;
  level?: number;
  casterType?: 'prepared_full_caster' | 'prepared_half_caster' | 'known_full_caster' | 'pact_magic' | 'noncaster';
} {
  const primary = input.classLevels?.[0];
  const className = primary?.class ?? input.fallbackClass;
  const normalizedClass = className?.trim().toLowerCase() ?? '';
  const subclass = primary?.subclass ?? input.fallbackSubclass;
  const level = primary?.level ?? input.fallbackLevel;

  if (!normalizedClass) {
    return { className, subclass, level, casterType: 'noncaster' };
  }

  if (PREPARED_FULL_CASTERS.has(normalizedClass)) {
    return { className, subclass, level, casterType: 'prepared_full_caster' };
  }
  if (PREPARED_HALF_CASTERS.has(normalizedClass)) {
    return { className, subclass, level, casterType: 'prepared_half_caster' };
  }
  if (KNOWN_FULL_CASTERS.has(normalizedClass)) {
    return { className, subclass, level, casterType: 'known_full_caster' };
  }
  if (PACT_CASTERS.has(normalizedClass)) {
    return { className, subclass, level, casterType: 'pact_magic' };
  }

  return { className, subclass, level, casterType: 'noncaster' };
}

export function computeNpcSpellSlots(
  casterType: 'prepared_full_caster' | 'prepared_half_caster' | 'known_full_caster' | 'pact_magic' | 'noncaster' | undefined,
  level?: number,
): Record<string, number> {
  if (!Number.isFinite(level) || !casterType || casterType === 'noncaster') {
    return {};
  }

  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level as number)));

  const fullCasterSlots: Record<number, Record<string, number>> = {
    1: { 1: 2 },
    2: { 1: 3 },
    3: { 1: 4, 2: 2 },
    4: { 1: 4, 2: 3 },
    5: { 1: 4, 2: 3, 3: 2 },
    6: { 1: 4, 2: 3, 3: 3 },
    7: { 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
  };

  const halfCasterSlots: Record<number, Record<string, number>> = {
    1: {},
    2: { 1: 2 },
    3: { 1: 3 },
    4: { 1: 3 },
    5: { 1: 4, 2: 2 },
    6: { 1: 4, 2: 2 },
    7: { 1: 4, 2: 3 },
    8: { 1: 4, 2: 3 },
    9: { 1: 4, 2: 3, 3: 2 },
    10: { 1: 4, 2: 3, 3: 2 },
    11: { 1: 4, 2: 3, 3: 3 },
    12: { 1: 4, 2: 3, 3: 3 },
    13: { 1: 4, 2: 3, 3: 3, 4: 1 },
    14: { 1: 4, 2: 3, 3: 3, 4: 1 },
    15: { 1: 4, 2: 3, 3: 3, 4: 2 },
    16: { 1: 4, 2: 3, 3: 3, 4: 2 },
    17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  };

  const pactMagicSlots: Record<number, Record<string, number>> = {
    1: { 1: 1 },
    2: { 1: 2 },
    3: { 2: 2 },
    4: { 2: 2 },
    5: { 3: 2 },
    6: { 3: 2 },
    7: { 4: 2 },
    8: { 4: 2 },
    9: { 5: 2 },
    10: { 5: 2 },
    11: { 5: 3 },
    12: { 5: 3 },
    13: { 5: 3 },
    14: { 5: 3 },
    15: { 5: 3 },
    16: { 5: 3 },
    17: { 5: 4 },
    18: { 5: 4 },
    19: { 5: 4 },
    20: { 5: 4 },
  };

  if (casterType === 'prepared_full_caster' || casterType === 'known_full_caster') {
    return fullCasterSlots[normalizedLevel] ?? {};
  }
  if (casterType === 'prepared_half_caster') {
    return halfCasterSlots[normalizedLevel] ?? {};
  }
  if (casterType === 'pact_magic') {
    return pactMagicSlots[normalizedLevel] ?? {};
  }

  return {};
}
