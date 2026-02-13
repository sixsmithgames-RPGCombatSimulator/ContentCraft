/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import Ajv, { type ValidateFunction } from 'ajv';
import type { SchemaRegistryEntry } from '../models/SchemaRegistry.js';
import { getSchemaRegistryCollection } from '../config/mongo.js';

interface CachedSchema {
  version: string;
  validator: ValidateFunction;
  schema: Record<string, unknown>;
}

const ajv = new Ajv({ allErrors: true, strict: true });

const cache = new Map<string, CachedSchema>();

async function loadActiveEntry(domain: string): Promise<SchemaRegistryEntry> {
  const collection = getSchemaRegistryCollection();
  const entry = await collection.findOne({ domain, active: true });

  if (!entry) {
    throw new Error(`Active schema for domain "${domain}" not found`);
  }

  if (!entry.schema || typeof entry.schema !== 'object') {
    throw new Error(`Schema entry for domain "${domain}" is invalid`);
  }

  return entry;
}

export async function getValidatorForDomain(domain: string): Promise<CachedSchema> {
  const cached = cache.get(domain);
  if (cached) {
    return cached;
  }

  const entry = await loadActiveEntry(domain);
  const compiled = ajv.compile(entry.schema);

  const result: CachedSchema = {
    version: entry.version,
    validator: compiled,
    schema: entry.schema,
  };

  cache.set(domain, result);
  return result;
}

export async function refreshSchemaForDomain(domain: string): Promise<void> {
  const entry = await loadActiveEntry(domain);
  const compiled = ajv.compile(entry.schema);

  cache.set(domain, {
    version: entry.version,
    validator: compiled,
    schema: entry.schema,
  });
}

export function clearSchemaCache(): void {
  cache.clear();
}
