type PromptFormatKind = 'plain' | 'json' | 'json-fragment' | 'key-value-fragment';

export interface PromptPreformatResult {
  normalizedPrompt: string;
  changed: boolean;
  kind: PromptFormatKind;
}

const UNICODE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\r\n?/g, '\n'],
  [/\u00a0/g, ' '],
  [/\u200b|\u200c|\u200d|\ufeff/g, ''],
  [/[\u2018\u2019\u2032]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u2192/g, '->'],
  [/\u21d2/g, '=>'],
  [/\u2022/g, '-'],
];

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

function normalizeBasicText(value: string): string {
  let normalized = value;

  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return stripCodeFences(normalized);
}

function tryParseJsonPrompt(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && /"[^"\n]+"\s*:/.test(trimmed)) {
    candidates.push(`{${trimmed}}`);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next parse candidate.
    }
  }

  return null;
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeBasicText(value).replace(/\n+/g, ' ').trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

function formatStructuredValue(value: unknown, indentLevel = 0): string[] {
  const indent = '  '.repeat(indentLevel);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${indent}[]`];
    }

    return value.flatMap((item) => {
      if (
        item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
      ) {
        return [`${indent}- ${formatScalar(item)}`];
      }

      return [`${indent}-`, ...formatStructuredValue(item, indentLevel + 1)];
    });
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [`${indent}{}`];
    }

    return entries.flatMap(([key, entryValue]) => {
      if (
        entryValue === null ||
        typeof entryValue === 'string' ||
        typeof entryValue === 'number' ||
        typeof entryValue === 'boolean'
      ) {
        return [`${indent}${key}: ${formatScalar(entryValue)}`];
      }

      return [`${indent}${key}:`, ...formatStructuredValue(entryValue, indentLevel + 1)];
    });
  }

  return [`${indent}${formatScalar(value)}`];
}

function looksLikeStructuredFragment(value: string): boolean {
  const quotedKeyMatches = value.match(/"[^"\n]{1,60}"\s*:/g)?.length ?? 0;
  const plainKeyMatches = value.match(/(?:^|\n)\s*[A-Za-z][A-Za-z0-9 _/'"()&+-]{1,60}\s*:/g)?.length ?? 0;
  return quotedKeyMatches >= 2 || plainKeyMatches >= 4;
}

function cleanupInlineValue(value: string): string {
  let cleaned = value.trim();

  if (cleaned === '{' || cleaned === '[') return '';

  cleaned = cleaned.replace(/,$/, '').trim();
  cleaned = cleaned
    .replace(/\\\\/g, '\\')
    .replace(/\\+"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, ' ');

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned.trim();
}

function formatStructuredFragment(value: string): string | null {
  if (!looksLikeStructuredFragment(value)) {
    return null;
  }

  const expanded = value
    .replace(/,\s*(?=(?:"[^"\n]+"\s*:|[A-Za-z][A-Za-z0-9 _/'"()&+-]{1,60}\s*:))/g, ',\n')
    .replace(/[{}]/g, '\n');

  const lines = expanded
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^(\s*)"([^"\n]+)"\s*:\s*(.*)$/, '$1$2: $3'))
    .map((line) => {
      const match = line.match(/^(\s*)([^:\n]+):\s*(.*)$/);
      if (!match) {
        return cleanupInlineValue(line);
      }

      const [, leadingWhitespace, key, rawValue] = match;
      const indentSize = Math.max(0, Math.floor(leadingWhitespace.length / 2));
      const indent = '  '.repeat(indentSize);
      const cleanedValue = cleanupInlineValue(rawValue);

      return cleanedValue
        ? `${indent}${key.trim()}: ${cleanedValue}`
        : `${indent}${key.trim()}:`;
    })
    .filter(Boolean);

  if (lines.length < 3) {
    return null;
  }

  return `Structured brief:\n${lines.join('\n')}`;
}

export function preformatPromptForAi(prompt: string): PromptPreformatResult {
  const basic = normalizeBasicText(prompt);

  if (!basic) {
    return {
      normalizedPrompt: '',
      changed: basic !== prompt,
      kind: 'plain',
    };
  }

  const parsed = tryParseJsonPrompt(basic);
  if (parsed !== null && typeof parsed === 'object') {
    const formatted = `Structured brief:\n${formatStructuredValue(parsed).join('\n')}`;
    return {
      normalizedPrompt: formatted,
      changed: formatted !== prompt,
      kind: basic.trim().startsWith('{') || basic.trim().startsWith('[') ? 'json' : 'json-fragment',
    };
  }

  const fragment = formatStructuredFragment(basic);
  if (fragment) {
    return {
      normalizedPrompt: fragment,
      changed: fragment !== prompt,
      kind: 'key-value-fragment',
    };
  }

  return {
    normalizedPrompt: basic,
    changed: basic !== prompt,
    kind: 'plain',
  };
}
