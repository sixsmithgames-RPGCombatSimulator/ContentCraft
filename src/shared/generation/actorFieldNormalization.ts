export type ActorFieldRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ActorFieldRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DICE_EXPRESSION = /^\d+d\d+(?:[+-]\d+d\d+)*(?:[+-]\d+)?$/i;

function normalizeDiceExpression(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, '').trim();
  return compact && DICE_EXPRESSION.test(compact) ? compact.toLowerCase() : null;
}

function finiteInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function structuredDiceTerm(source: ActorFieldRecord): string | null {
  const count = finiteInteger(source.count, source.number, source.dice_count, source.diceCount, source.quantity);
  const rawSides = source.sides ?? source.die_size ?? source.dieSize ?? source.die;
  const sidesMatch = String(rawSides ?? '').trim().match(/^d?(\d+)$/i);
  const sides = sidesMatch ? Number(sidesMatch[1]) : NaN;
  if (count === null || count < 1 || !Number.isInteger(sides) || sides < 2) return null;

  const modifier = finiteInteger(source.modifier, source.bonus);
  const signedModifier = modifier && modifier > 0 ? `+${modifier}` : '';
  return `${count}d${sides}${signedModifier}`;
}

/**
 * Converts supported legacy hit-dice representations into the canonical string
 * notation used by the NPC and monster schemas. Unknown objects remain invalid
 * instead of being guessed or silently discarded by callers.
 */
export function normalizeHitDiceNotation(value: unknown): string | null {
  const direct = normalizeDiceExpression(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const terms = value.map(normalizeHitDiceNotation);
    return terms.every((term): term is string => Boolean(term)) ? terms.join('+') : null;
  }

  if (!isRecord(value)) return null;

  for (const key of ['formula', 'notation', 'expression', 'total', 'value', 'hit_dice', 'hitDice']) {
    const candidate = normalizeDiceExpression(value[key]);
    if (candidate) return candidate;
  }

  if (value.dice !== undefined) {
    const dice = normalizeHitDiceNotation(value.dice);
    if (dice) return dice;
  }

  const structured = structuredDiceTerm(value);
  if (structured) return structured;

  const keyedTerms = Object.entries(value).flatMap(([key, countValue]) => {
    const match = key.match(/^d(\d+)$/i);
    const count = finiteInteger(countValue);
    return match && count && count > 0 ? [`${count}d${Number(match[1])}`] : [];
  });
  if (keyedTerms.length > 0) return keyedTerms.join('+');

  const namedTerms = Object.values(value).map(normalizeHitDiceNotation);
  return namedTerms.length > 0 && namedTerms.every((term): term is string => Boolean(term))
    ? namedTerms.join('+')
    : null;
}

function featureName(value: ActorFieldRecord): string {
  return String(value.name ?? value.label ?? value.title ?? '').trim();
}

function normalizeFeature(value: unknown, mappedName?: string): ActorFieldRecord | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { name: mappedName ?? text, description: text } : null;
  }
  if (!isRecord(value)) return null;
  const name = featureName(value) || String(mappedName ?? '').trim();
  if (!name) return null;
  return {
    ...value,
    name,
    description: String(value.description ?? value.effect ?? name),
  };
}

/** Normalize canonical feature/action arrays without treating ability scores as features. */
export function normalizeActorFeatureList(value: unknown): ActorFieldRecord[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFeature(entry)).filter((entry): entry is ActorFieldRecord => Boolean(entry));
  }
  if (!isRecord(value)) return [];

  const direct = normalizeFeature(value);
  if (direct) return [direct];

  return Object.entries(value)
    .map(([name, entry]) => normalizeFeature(entry, name))
    .filter((entry): entry is ActorFieldRecord => Boolean(entry));
}

/** Convert legacy legendary-action arrays to the canonical object block. */
export function normalizeLegendaryActionBlock(value: unknown): ActorFieldRecord | null {
  if (Array.isArray(value)) {
    const options = normalizeActorFeatureList(value);
    return options.length > 0 ? { options } : null;
  }
  if (!isRecord(value)) return null;

  const source = { ...value };
  const rawOptions = source.options ?? source.actions;
  if (rawOptions !== undefined) {
    const options = normalizeActorFeatureList(rawOptions);
    delete source.actions;
    if (options.length > 0) source.options = options;
    else delete source.options;
  }

  const hasSummary = typeof source.summary === 'string' && source.summary.trim().length > 0;
  return Object.keys(source).length > 0 && (hasSummary || source.options !== undefined || Object.keys(source).some((key) => key !== 'summary'))
    ? source
    : null;
}
