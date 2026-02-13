/**
 * Strict NPC Validation Layer
 *
 * Per architecture requirements:
 * - Validate BEFORE any transformation
 * - Reject invalid payloads with actionable errors
 * - NO auto-normalization or fallbacks
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize AJV with strict settings
const ajv = new Ajv({
  strict: true,
  allErrors: true, // Report all errors, not just the first
  verbose: true, // Include schema and data in errors
  validateFormats: true,
  $data: true, // Enable $data references
});

// Add format validators (email, uri, date-time, etc.)
addFormats(ajv);

// Load v1 schema (legacy)
const npcSchemaV1Path = join(__dirname, '../../../schema/npc/v1-flat.json');
const npcSchemaV1 = JSON.parse(readFileSync(npcSchemaV1Path, 'utf-8'));

// Load v1.1 schema
const npcSchemaV1_1Path = join(__dirname, '../../../schema/npc/v1.1-server.json');
const npcSchemaV1_1 = JSON.parse(readFileSync(npcSchemaV1_1Path, 'utf-8'));

// Compile validators for both versions
const validateNpcV1: ValidateFunction = ajv.compile(npcSchemaV1);
const validateNpcV1_1: ValidateFunction = ajv.compile(npcSchemaV1_1);

/**
 * Detect schema version from NPC data
 */
function detectSchemaVersion(data: unknown): '1.0' | '1.1' {
  if (typeof data === 'object' && data !== null && 'schema_version' in data) {
    const schemaVersion = (data as Record<string, unknown>).schema_version;
    if (typeof schemaVersion === 'number') {
      // Some sources emit schema_version as a number (e.g. 1.1)
      if (schemaVersion === 1.1) return '1.1';
      if (schemaVersion === 1.0) return '1.0';
    }
    if (typeof schemaVersion === 'string') {
      const normalized = schemaVersion.trim().toLowerCase();
      // Accept common variants like: "1.1", "v1.1", "npc/v1.1", "1.1.0"
      const match = normalized.match(/(?:^|\b|\/)(?:v)?(\d+\.\d+)(?:\.\d+)?(?:$|\b)/);
      if (match?.[1] === '1.1') return '1.1';
    }
  }
  // Default to v1.0 for legacy NPCs
  return '1.0';
}

/**
 * Get the appropriate validator based on schema version
 */
function getValidatorForVersion(version: '1.0' | '1.1'): ValidateFunction {
  return version === '1.1' ? validateNpcV1_1 : validateNpcV1;
}

/**
 * Validation error with human-readable message
 */
export class NpcValidationError extends Error {
  public readonly errors: ErrorObject[];
  public readonly details: string;

  constructor(errors: ErrorObject[]) {
    const details = formatValidationErrors(errors);
    super(`NPC validation failed:\n${details}`);
    this.name = 'NpcValidationError';
    this.errors = errors;
    this.details = details;
  }
}

/**
 * Format AJV errors into human-readable messages
 */
function formatValidationErrors(errors: ErrorObject[]): string {
  const pathToFieldName = (path: string) => (path || '/').replace(/^\//, '').replace(/\//g, '.');
  const labelForPath = (path: string) => {
    const field = pathToFieldName(path);
    const map: Record<string, string> = {
      armor_class: 'Armor Class',
      hit_points: 'Hit Points',
      ability_scores: 'Ability Scores',
      class_levels: 'Class Levels',
      saving_throws: 'Saving Throws',
      skill_proficiencies: 'Skill Proficiencies',
      creature_type: 'Creature Type',
      challenge_rating: 'Challenge Rating',
    };
    return map[field] || field || 'root object';
  };

  const describeType = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const summarizeValue = (value: unknown): string => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const snippet = trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed;
      return `"${snippet}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return String(value);
    if (Array.isArray(value)) return `[array(${value.length})]`;
    if (typeof value === 'object') return '[object]';
    return String(value);
  };

  const byPath = new Map<string, ErrorObject[]>();
  for (const e of errors) {
    const p = e.instancePath || '/';
    const arr = byPath.get(p) || [];
    arr.push(e);
    byPath.set(p, arr);
  }

  const lines: string[] = [];
  let outIndex = 1;

  for (const [path, group] of byPath.entries()) {
    const fieldLabel = labelForPath(path);
    const fieldName = pathToFieldName(path);

    const hasOneOf = group.some((e) => e.keyword === 'oneOf');
    const typeErrors = group.filter((e) => e.keyword === 'type');

    if (hasOneOf && typeErrors.length > 0) {
      const expectedTypes = Array.from(
        new Set(
          typeErrors
            .map((e) => (e.params as any)?.type)
            .filter((t): t is string => typeof t === 'string')
        )
      );

      const sample = typeErrors.find((e) => e.data !== undefined)?.data;
      const actualType = describeType(sample);
      const actualValue = sample !== undefined ? summarizeValue(sample) : 'unknown';

      let fix = 'Use the correct format for this field.';
      if (fieldName === 'armor_class') {
        fix =
          actualType === 'string'
            ? 'Enter a number like 18, or use parentheses like 18 (plate armor). Avoid free-form text.'
            : 'Enter a number like 18, or use parentheses like 18 (plate armor).';
      }

      const expectedText = expectedTypes.length ? expectedTypes.join(' or ') : 'one of the allowed formats';
      lines.push(
        `${outIndex}. ${fieldLabel}: invalid format. Expected ${expectedText}, got ${actualType} (${actualValue}). Fix: ${fix}`
      );
      outIndex += 1;
      continue;
    }

    for (const error of group) {
      const message = error.message || 'unknown error';
      const keyword = error.keyword;

      if (keyword === 'oneOf') {
        const sample = error.data;
        const actualType = describeType(sample);
        const actualValue = sample !== undefined ? summarizeValue(sample) : 'unknown';
        lines.push(
          `${outIndex}. ${fieldLabel}: invalid format. Value is ${actualType} (${actualValue}). Fix: Choose one of the supported formats for this field.`
        );
        outIndex += 1;
        continue;
      }

      if (keyword === 'required') {
        const missing = (error.params as any)?.missingProperty;
        const missingText = typeof missing === 'string' ? missing : 'unknown';
        lines.push(`${outIndex}. ${fieldLabel}: missing required field "${missingText}". Fix: add this field.`);
        outIndex += 1;
        continue;
      }

      if (keyword === 'additionalProperties') {
        const extra = (error.params as any)?.additionalProperty;
        const extraText = typeof extra === 'string' ? extra : 'unknown';
        lines.push(`${outIndex}. ${fieldLabel}: unexpected field "${extraText}". Fix: remove it or correct the spelling.`);
        outIndex += 1;
        continue;
      }

      if (keyword === 'type') {
        const expected = (error.params as any)?.type;
        const expectedText = typeof expected === 'string' ? expected : 'unknown';
        const actualType = describeType(error.data);
        const actualValue = error.data !== undefined ? summarizeValue(error.data) : 'unknown';

        let fix = `Make sure this is a ${expectedText}.`;
        if (fieldName === 'armor_class' && actualType === 'string') {
          fix = 'Enter a number like 18, or use parentheses like 18 (plate armor). Avoid free-form text.';
        }

        lines.push(
          `${outIndex}. ${fieldLabel}: ${message} (expected ${expectedText}, got ${actualType}: ${actualValue}). Fix: ${fix}`
        );
        outIndex += 1;
        continue;
      }

      if (keyword === 'enum') {
        const allowed = (error.params as any)?.allowedValues;
        const allowedText = Array.isArray(allowed) ? allowed.join(', ') : 'see schema';
        lines.push(`${outIndex}. ${fieldLabel}: ${message}. Allowed values: ${allowedText}.`);
        outIndex += 1;
        continue;
      }

      if (keyword === 'pattern') {
        const pattern = (error.params as any)?.pattern;
        const patternText = typeof pattern === 'string' ? pattern : 'unknown pattern';
        lines.push(`${outIndex}. ${fieldLabel}: ${message}. Required pattern: ${patternText}.`);
        outIndex += 1;
        continue;
      }

      lines.push(`${outIndex}. ${fieldLabel}: ${message}`);
      outIndex += 1;
    }
  }

  return lines.join('\n');
}

/**
 * Validate raw NPC data against schema
 *
 * STRICT VALIDATION - NO NORMALIZATION
 * - Rejects invalid payloads immediately
 * - Returns actionable error messages
 * - Never auto-corrects or applies fallbacks
 * - Automatically detects schema version and uses appropriate validator
 *
 * @param data Raw NPC data from any source
 * @throws {NpcValidationError} If validation fails
 * @returns The same data (typed as valid NPC)
 */
export function validateNpcStrict(data: unknown): asserts data is Record<string, unknown> {
  const version = detectSchemaVersion(data);
  const validator = getValidatorForVersion(version);

  const isValid = validator(data);

  if (!isValid) {
    const errors = validator.errors || [];
    console.error(`[NPC Validator] Validation failed for schema version ${version}`);
    throw new NpcValidationError(errors);
  }

  console.log(`[NPC Validator] ✅ Validated successfully against schema version ${version}`);
  // Type guard: if we reach here, data is valid
}

/**
 * Check if data is valid NPC without throwing
 *
 * @param data Raw NPC data
 * @returns true if valid, false otherwise
 */
export function isValidNpc(data: unknown): boolean {
  try {
    validateNpcStrict(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and return errors without throwing
 *
 * Useful for providing validation feedback in UIs
 * Automatically detects schema version and uses appropriate validator
 *
 * @param data Raw NPC data
 * @returns Object with valid flag, errors array, and schema version
 */
export function validateNpcSafe(data: unknown): {
  valid: boolean;
  errors: ErrorObject[];
  details: string | null;
  schemaVersion: '1.0' | '1.1';
} {
  const version = detectSchemaVersion(data);
  const validator = getValidatorForVersion(version);

  const isValid = validator(data);

  if (!isValid) {
    const errors = validator.errors || [];
    return {
      valid: false,
      errors,
      details: formatValidationErrors(errors),
      schemaVersion: version,
    };
  }

  return {
    valid: true,
    errors: [],
    details: null,
    schemaVersion: version,
  };
}

/**
 * Get the compiled validator for a specific version
 *
 * @param version Schema version to use (defaults to detecting from data)
 * @param data Optional data to detect version from
 */
export function getNpcValidator(version?: '1.0' | '1.1', data?: unknown): ValidateFunction {
  if (!version && data) {
    version = detectSchemaVersion(data);
  }
  return getValidatorForVersion(version || '1.0');
}
