/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RunType } from '../../models/Run.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ajv = new Ajv({ allErrors: true, strict: false });

// Load schemas
const schemasDir = join(__dirname, '../../schemas');

const baseSchema = JSON.parse(readFileSync(join(schemasDir, 'base.schema.json'), 'utf-8'));
const encounterSchema = JSON.parse(readFileSync(join(schemasDir, 'encounter.schema.json'), 'utf-8'));
const npcSchema = JSON.parse(readFileSync(join(schemasDir, 'npc.schema.json'), 'utf-8'));
const itemSchema = JSON.parse(readFileSync(join(schemasDir, 'item.schema.json'), 'utf-8'));
const sceneSchema = JSON.parse(readFileSync(join(schemasDir, 'scene.schema.json'), 'utf-8'));
const adventureSchema = JSON.parse(readFileSync(join(schemasDir, 'adventure.schema.json'), 'utf-8'));

// Register base schema first
ajv.addSchema(baseSchema);

// Compile type-specific schemas
const validators = {
  encounter: ajv.compile(encounterSchema),
  npc: ajv.compile(npcSchema),
  item: ajv.compile(itemSchema),
  scene: ajv.compile(sceneSchema),
  adventure: ajv.compile(adventureSchema),
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a draft JSON against its schema
 */
export function validateDraft(type: RunType, data: any): ValidationResult {
  const validator = validators[type];

  if (!validator) {
    return {
      valid: false,
      errors: [`No schema validator found for type: ${type}`],
    };
  }

  const valid = validator(data);

  if (!valid && validator.errors) {
    const errors = validator.errors.map(err => {
      const path = err.instancePath || '/';
      return `${path}: ${err.message}`;
    });

    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Format AJV errors into readable messages
 */
export function formatValidationErrors(errors: string[]): string {
  return errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n');
}
