import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SENSITIVE_KEY = /^(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|service[-_]?key|password|cookie|set-cookie)$/i;

function sanitize(value: any, seen = new WeakSet<object>()): any {
  if (value === undefined) return null;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      code: (value as any).code ?? null,
      message: value.message,
      status: (value as any).status ?? (value as any).details?.status ?? null,
      details: sanitize((value as any).details ?? null, seen),
      stack: value.stack ?? null,
    };
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(entry, seen),
  ]));
}

export function generationDevLogPath() {
  const configured = String(process.env.GMC_AI_DEV_LOG_PATH ?? '').trim();
  if (configured) return path.resolve(configured);
  const directory = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? os.tmpdir()
    : path.join(process.cwd(), 'logs');
  return path.resolve(directory, 'gmc-ai-generation.jsonl');
}

export async function appendGenerationDevLog(entry: Record<string, any>) {
  const filename = generationDevLogPath();
  const record = {
    schemaVersion: 1,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...sanitize(entry),
  };
  try {
    await mkdir(path.dirname(filename), { recursive: true });
    await appendFile(filename, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (cause: any) {
    throw Object.assign(new Error(`GameMasterCraft could not write the AI developer trace at ${filename}: ${cause?.message ?? cause}`), {
      status: 500,
      code: 'AI_DEV_LOG_WRITE_FAILED',
      cause,
    });
  }
  return { id: record.id, timestamp: record.timestamp, filename };
}
