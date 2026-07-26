const SECRET_KEY = /(?:authorization|api[-_]?key|cookie|password|prompt|raw|body|output|response|token)/i;
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|AIza[a-z0-9_-]{20,})/ig;

export function redactExecutionEventData(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    if (typeof item === 'string') {
      redacted[key] = item.replace(SECRET_VALUE, '[REDACTED]').slice(0, 500);
    } else if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
      redacted[key] = item;
    } else if (Array.isArray(item)) {
      redacted[key] = item.slice(0, 20).map((entry) => typeof entry === 'string'
        ? entry.replace(SECRET_VALUE, '[REDACTED]').slice(0, 200)
        : '[STRUCTURED_DATA_OMITTED]');
    } else {
      redacted[key] = '[STRUCTURED_DATA_OMITTED]';
    }
  }
  return redacted;
}
