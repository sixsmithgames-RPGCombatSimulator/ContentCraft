export type SmartJsonParseOptions = {
  requireObject?: boolean;
  allowSingleItemArray?: boolean;
  maxLength?: number;
};

export type SmartJsonParseResult =
  | { ok: true; value: unknown; foundJsonBlock: boolean; repaired: boolean; warnings: string[] }
  | { ok: false; message: string; warnings: string[] };

function normalizeJsonText(text: unknown): string {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\[cite_start\]/gi, '')
    .replace(/\[cite_end\]/gi, '')
    .replace(/【\d+†source】/g, '')
    .trim();
}

function extractBalancedJsonBlock(text: string): string {
  const source = String(text ?? '');
  for (let start = 0; start < source.length; start += 1) {
    if (!['{', '['].includes(source[start])) continue;
    const stack: string[] = [];
    let quote = '';
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === '{') stack.push('}');
      else if (character === '[') stack.push(']');
      else if (character === '}' || character === ']') {
        if (stack.at(-1) !== character) break;
        stack.pop();
        if (stack.length === 0) return source.slice(start, index + 1).trim();
      }
    }
  }
  return '';
}

function jsonCandidates(rawText: string) {
  const normalized = normalizeJsonText(rawText)
    .replace(/^(?:Here's the JSON:|Here is the JSON:|JSON:|Response:|Output:|Result:)\s*/i, '');
  const candidates = new Set<string>([normalized]);
  const fenced = [...normalized.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  for (const candidate of fenced) candidates.add(normalizeJsonText(candidate));
  for (const candidate of [...candidates]) {
    const block = extractBalancedJsonBlock(candidate);
    if (block) candidates.add(block);
    const loose = candidate.trim().replace(/;\s*$/, '');
    if (!/^[{[]/.test(loose) && /(?:^|[\s,])["']?responseText["']?\s*:/.test(loose)) candidates.add(`{${loose}}`);
  }
  return [...candidates].filter(Boolean);
}

function transformOutsideJsonStrings(text: string, transform: (segment: string) => string) {
  let output = '';
  let segment = '';
  let quote = '';
  let escaped = false;
  const flush = () => {
    if (segment) output += transform(segment);
    segment = '';
  };
  for (const character of String(text ?? '')) {
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      flush();
      quote = character;
      output += character;
    } else {
      segment += character;
    }
  }
  flush();
  return output;
}

function stripJsonComments(text: string) {
  let output = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
      output += character;
    } else if (character === '/' && next === '/') {
      while (index < text.length && !/[\r\n]/.test(text[index])) index += 1;
      output += text[index] ?? '';
    } else if (character === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index += 1;
    } else {
      output += character;
    }
  }
  return output;
}

function removeTrailingJsonCommas(text: string) {
  let output = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      continue;
    }
    if (character === ',') {
      let next = index + 1;
      while (/\s/.test(text[next] ?? '')) next += 1;
      if (text[next] === '}' || text[next] === ']') continue;
    }
    output += character;
  }
  return output;
}

function convertSingleQuotedJsonStrings(text: string) {
  let output = '';
  let doubleQuoted = false;
  let doubleEscaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (doubleQuoted) {
      output += character;
      if (doubleEscaped) doubleEscaped = false;
      else if (character === '\\') doubleEscaped = true;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      output += character;
      continue;
    }
    if (character !== "'") {
      output += character;
      continue;
    }
    let value = '';
    let closed = false;
    let escaped = false;
    let cursor = index + 1;
    for (; cursor < text.length; cursor += 1) {
      const current = text[cursor];
      if (escaped) {
        if (current === 'n') value += '\n';
        else if (current === 'r') value += '\r';
        else if (current === 't') value += '\t';
        else value += current;
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === "'") {
        closed = true;
        break;
      } else {
        value += current;
      }
    }
    if (!closed) {
      output += character;
      continue;
    }
    output += JSON.stringify(value);
    index = cursor;
  }
  return output;
}

function escapeBareNewlinesInJsonStrings(text: string) {
  let output = '';
  let quote = '';
  let escaped = false;
  for (const character of text) {
    if (quote) {
      if (escaped) {
        output += character;
        escaped = false;
      } else if (character === '\\') {
        output += character;
        escaped = true;
      } else if (character === quote) {
        output += character;
        quote = '';
      } else if (character === '\n') output += '\\n';
      else if (character === '\r') output += '\\r';
      else if (character === '\t') output += '\\t';
      else output += character;
    } else {
      if (character === '"' || character === "'") quote = character;
      output += character;
    }
  }
  return output;
}

function repairJsonText(text: string): { repaired: string; warnings: string[] } {
  const warnings: string[] = [];
  let repaired = normalizeJsonText(text).replace(/;\s*$/, '');
  const withoutComments = stripJsonComments(repaired);
  if (withoutComments !== repaired) {
    repaired = withoutComments;
    warnings.push('repair:removed_comments');
  }
  const withSyntaxQuotes = transformOutsideJsonStrings(repaired, (segment) => segment
    .replace(/[“”]([^“”\r\n]+)[“”](\s*:)/g, '"$1"$2')
    .replace(/(:\s*)[“”]([^“”\r\n]*)[“”]/g, '$1"$2"')
    .replace(/[‘’]([^‘’\r\n]+)[‘’](\s*:)/g, '"$1"$2')
    .replace(/(:\s*)[‘’]([^‘’\r\n]*)[‘’]/g, '$1"$2"')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bundefined\b/g, 'null')
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3'));
  if (withSyntaxQuotes !== repaired) {
    repaired = withSyntaxQuotes;
    warnings.push('repair:normalized_syntax');
  }
  const withDoubleQuotedStrings = convertSingleQuotedJsonStrings(repaired);
  if (withDoubleQuotedStrings !== repaired) {
    repaired = withDoubleQuotedStrings;
    warnings.push('repair:single_quoted_strings');
  }
  const escapedNewlines = escapeBareNewlinesInJsonStrings(repaired);
  if (escapedNewlines !== repaired) {
    repaired = escapedNewlines;
    warnings.push('repair:escaped_newlines');
  }
  const withoutTrailingCommas = removeTrailingJsonCommas(repaired);
  if (withoutTrailingCommas !== repaired) {
    repaired = withoutTrailingCommas;
    warnings.push('repair:removed_trailing_commas');
  }
  return { repaired, warnings };
}

function normalizeParsedValue(value: unknown, options: SmartJsonParseOptions) {
  if (Array.isArray(value) && options.allowSingleItemArray !== false && value.length === 1 && value[0] && typeof value[0] === 'object') return value[0];
  return value;
}

function validateParsedValue(value: unknown, options: SmartJsonParseOptions): string | null {
  if (options.requireObject === false) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'JSON result must be an object.';
  return null;
}

export function parseSmartJson(text: unknown, options: SmartJsonParseOptions = {}): SmartJsonParseResult {
  const raw = normalizeJsonText(text);
  if (!raw) return { ok: false, message: 'JSON text is required.', warnings: [] };
  if (options.maxLength && raw.length > options.maxLength) return { ok: false, message: `JSON text exceeds size limit (${options.maxLength} characters).`, warnings: [] };
  const errors: string[] = [];
  for (const candidate of jsonCandidates(raw)) {
    const foundJsonBlock = candidate !== raw || /^[{[]/.test(candidate.trim());
    try {
      const value = normalizeParsedValue(JSON.parse(candidate), options);
      const validation = validateParsedValue(value, options);
      if (validation) return { ok: false, message: validation, warnings: [] };
      return { ok: true, value, foundJsonBlock, repaired: false, warnings: [] };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const repair = repairJsonText(candidate);
    try {
      const value = normalizeParsedValue(JSON.parse(repair.repaired), options);
      const validation = validateParsedValue(value, options);
      if (validation) return { ok: false, message: validation, warnings: repair.warnings };
      return { ok: true, value, foundJsonBlock, repaired: repair.warnings.length > 0, warnings: repair.warnings };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const suffix = errors.at(-1) ? ` Last parser error: ${errors.at(-1)}` : '';
  return { ok: false, message: `Could not parse a usable JSON object.${suffix}`, warnings: [] };
}
