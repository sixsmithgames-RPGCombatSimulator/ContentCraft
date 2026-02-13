/**
 * Strict Monster Validation Layer
 *
 * Validates D&D 5e monster stat blocks before saving.
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

// Load monster schema
const monsterSchemaPath = join(__dirname, '../schemas/monster.schema.json');
const monsterSchema = JSON.parse(readFileSync(monsterSchemaPath, 'utf-8'));

// Compile validator
const validateMonster: ValidateFunction = ajv.compile(monsterSchema);

/**
 * Validation error with human-readable message
 */
export class MonsterValidationError extends Error {
  public readonly errors: ErrorObject[];
  public readonly details: string;

  constructor(errors: ErrorObject[]) {
    const details = formatValidationErrors(errors);
    super(`Monster validation failed:\n${details}`);
    this.name = 'MonsterValidationError';
    this.errors = errors;
    this.details = details;
  }
}

/**
 * Format validation errors into human-readable messages with actionable guidance
 */
function formatValidationErrors(errors: ErrorObject[]): string {
  return errors
    .map((err, index) => {
      const path = err.instancePath || '/';
      const fieldName = path.replace(/^\//, '').replace(/\//g, '.') || 'root object';
      const message = err.message || 'validation error';

      // Add specific, actionable guidance based on error type
      let guidance = '';
      if (err.keyword === 'type') {
        const expected = err.params?.type;
        const actual = err.data !== undefined ? typeof err.data : 'undefined';

        // Provide field-specific guidance for common errors
        let fixGuidance = '';
        if (expected === 'object' && actual === 'string') {
          // Common issue: user entered text instead of object structure
          if (fieldName.includes('hit_points')) {
            fixGuidance = 'For hit_points, use {"average": 138, "formula": "19d10+95"} instead of just a number or text';
          } else if (fieldName.includes('speed')) {
            fixGuidance = 'For speed, use {"walk": "30 ft."} instead of just text like "30 ft."';
          } else if (fieldName.includes('abilities') || fieldName.includes('actions')) {
            fixGuidance = 'This should be an object with fields like {"name": "...", "description": "..."}';
          } else {
            fixGuidance = 'Use {key: value} format, not a simple text value. Check the field structure in the editor.';
          }
        } else if (expected === 'integer' && actual === 'string') {
          fixGuidance = `Use a whole number like 138, not "${String(err.data)}" (text in quotes)`;
        } else if (expected === 'integer' && actual === 'object') {
          fixGuidance = 'Use a whole number like 138, not an object like {average: 138}';
        } else if (expected === 'object') {
          fixGuidance = 'Use {key: value} format, not a simple value';
        } else {
          fixGuidance = `Ensure this is ${expected}`;
        }

        guidance = `\n   → Expected: ${expected}${expected === 'integer' ? ' (whole number)' : expected === 'string' ? ' (text)' : expected === 'object' ? ' (key-value structure)' : ''}\n   → Received: ${actual}${actual === 'string' ? ` ("${String(err.data).substring(0, 50)}${String(err.data).length > 50 ? '...' : ''}")` : ''}\n   → Fix: ${fixGuidance}`;
      } else if (err.keyword === 'required') {
        const missing = err.params?.missingProperty;
        guidance = `\n   → Missing required field: "${missing}"\n   → Fix: Add this field to your monster data`;
      } else if (err.keyword === 'enum') {
        const allowed = err.params?.allowedValues;
        guidance = `\n   → Allowed values: ${allowed ? allowed.join(', ') : 'see schema'}\n   → Received: ${JSON.stringify(err.data)}\n   → Fix: Use one of the allowed values listed above`;
      } else if (err.keyword === 'oneOf') {
        guidance = `\n   → This field has multiple valid formats but matches none of them\n   → Fix: Check if the value is the correct type (integer vs object) or structure`;
      } else if (err.keyword === 'additionalProperties') {
        const extra = err.params?.additionalProperty;
        guidance = `\n   → Unexpected field: "${extra}"\n   → Fix: Remove this field or check for typos in field names`;
      }

      return `${index + 1}. Field "${fieldName}": ${message}${guidance}`;
    })
    .join('\n\n');
}

/**
 * Validate monster data against schema
 *
 * @param data - Raw monster data to validate
 * @returns Validation result with success status and detailed errors
 */
export function validateMonsterStrict(data: unknown): {
  valid: boolean;
  errors?: ErrorObject[];
  details?: string;
} {
  const valid = validateMonster(data);

  if (!valid && validateMonster.errors) {
    return {
      valid: false,
      errors: validateMonster.errors,
      details: formatValidationErrors(validateMonster.errors),
    };
  }

  return { valid: true };
}

/**
 * Validate and throw if invalid (for use in routes)
 */
export function validateMonsterOrThrow(data: unknown): void {
  const result = validateMonsterStrict(data);

  if (!result.valid) {
    throw new MonsterValidationError(result.errors || []);
  }
}

/**
 * Check if data represents a monster (has required monster fields)
 */
export function isMonsterContent(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;

  const record = data as Record<string, unknown>;

  // Check for key monster identifiers
  return (
    typeof record.name === 'string' &&
    typeof record.creature_type === 'string' &&
    typeof record.challenge_rating === 'string' &&
    (record.deliverable === 'monster' || record.type === 'monster')
  );
}
