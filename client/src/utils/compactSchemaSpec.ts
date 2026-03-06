/**
 * Compact Schema Specification Generator
 *
 * Generates minimal schema representations (required keys + type hints)
 * instead of full JSON schema dumps. Reduces prompt size by 70-80%.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

/**
 * Schema object structure (subset of JSON Schema).
 */
export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaObject;
  description?: string;
}

/**
 * Schema property definition.
 */
export interface SchemaProperty {
  type?: string | string[];
  properties?: Record<string, SchemaProperty>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  description?: string;
}

/**
 * Generates a compact schema specification for a stage.
 * Includes only required keys and their type constraints.
 *
 * @param schema - Full JSON schema object
 * @param requiredFields - List of required field names
 * @returns Compact schema spec string (200-500 chars vs 1500-3000+ for full schema)
 *
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     ability_scores: {
 *       type: 'object',
 *       required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
 *       properties: {
 *         str: { type: 'integer', minimum: 1, maximum: 30 },
 *         // ... other abilities
 *       }
 *     },
 *     speed: {
 *       type: 'object',
 *       required: ['walk'],
 *       properties: {
 *         walk: { type: 'integer', minimum: 0 }
 *       }
 *     }
 *   },
 *   required: ['ability_scores', 'speed']
 * };
 *
 * const compact = generateCompactSchemaSpec(schema, ['ability_scores', 'speed']);
 * // Output:
 * // ability_scores: {str, dex, con, int, wis, cha} (integers 1-30)
 * // speed: {walk} (integer >= 0)
 * ```
 */
export function generateCompactSchemaSpec(schema: SchemaObject, requiredFields: string[]): string {
  if (!schema.properties) {
    return 'No schema properties defined.';
  }

  const lines: string[] = [];

  for (const fieldName of requiredFields) {
    const prop = schema.properties[fieldName];
    if (!prop) continue;

    const spec = formatPropertySpec(fieldName, prop);
    if (spec) {
      lines.push(spec);
    }
  }

  return lines.join('\n');
}

/**
 * Formats a single property specification.
 *
 * @param name - Property name
 * @param prop - Property schema
 * @param indent - Indentation level (for nested properties)
 * @returns Formatted spec string
 */
function formatPropertySpec(name: string, prop: SchemaProperty, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const type = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type;

  // Handle object types with nested properties
  if (type === 'object' && prop.properties) {
    const requiredKeys = prop.required || [];
    const optionalKeys = Object.keys(prop.properties).filter(k => !requiredKeys.includes(k));
    
    const keyList = [
      ...requiredKeys,
      ...optionalKeys.map(k => `${k}?`)
    ].join(', ');

    // Add type constraints if available
    const constraints = extractConstraints(prop);
    const constraintStr = constraints ? ` ${constraints}` : '';

    return `${prefix}${name}: {${keyList}}${constraintStr}`;
  }

  // Handle array types
  if (type === 'array' && prop.items) {
    const itemType = prop.items.type || 'unknown';
    const constraints = extractConstraints(prop.items);
    const constraintStr = constraints ? ` (${constraints})` : '';
    return `${prefix}${name}: array of ${itemType}${constraintStr}`;
  }

  // Handle primitive types
  const constraints = extractConstraints(prop);
  const constraintStr = constraints ? ` (${constraints})` : '';
  return `${prefix}${name}: ${type}${constraintStr}`;
}

/**
 * Extracts type constraints from a property (min/max, enum, etc.).
 *
 * @param prop - Property schema
 * @returns Constraint string or null
 */
function extractConstraints(prop: SchemaProperty): string | null {
  const constraints: string[] = [];

  // Numeric constraints
  if (typeof prop.minimum === 'number' && typeof prop.maximum === 'number') {
    constraints.push(`${prop.minimum}-${prop.maximum}`);
  } else if (typeof prop.minimum === 'number') {
    constraints.push(`>= ${prop.minimum}`);
  } else if (typeof prop.maximum === 'number') {
    constraints.push(`<= ${prop.maximum}`);
  }

  // Enum constraints
  if (prop.enum && prop.enum.length > 0) {
    const enumStr = prop.enum.map(v => JSON.stringify(v)).join(' | ');
    constraints.push(enumStr);
  }

  // Nested object constraints (for objects within arrays)
  if (prop.type === 'object' && prop.properties && prop.required) {
    const requiredKeys = prop.required.join(', ');
    constraints.push(`required: {${requiredKeys}}`);
  }

  return constraints.length > 0 ? constraints.join(', ') : null;
}

/**
 * Generates a compact template example for a schema.
 * Useful for showing the expected JSON structure without verbose descriptions.
 *
 * @param schema - Full JSON schema object
 * @param requiredFields - List of required field names
 * @returns JSON template string with placeholders
 *
 * @example
 * ```typescript
 * const template = generateSchemaTemplate(schema, ['ability_scores', 'speed']);
 * // Output:
 * // {
 * //   "ability_scores": {"str": 0, "dex": 0, "con": 0, "int": 0, "wis": 0, "cha": 0},
 * //   "speed": {"walk": 0}
 * // }
 * ```
 */
export function generateSchemaTemplate(schema: SchemaObject, requiredFields: string[]): string {
  if (!schema.properties) {
    return '{}';
  }

  const template: Record<string, unknown> = {};

  for (const fieldName of requiredFields) {
    const prop = schema.properties[fieldName];
    if (!prop) continue;

    template[fieldName] = generatePropertyTemplate(prop);
  }

  return JSON.stringify(template, null, 2);
}

/**
 * Generates a template value for a property.
 *
 * @param prop - Property schema
 * @returns Template value
 */
function generatePropertyTemplate(prop: SchemaProperty): unknown {
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;

  switch (type) {
    case 'object':
      if (prop.properties && prop.required) {
        const obj: Record<string, unknown> = {};
        for (const key of prop.required) {
          const nestedProp = prop.properties[key];
          if (nestedProp) {
            obj[key] = generatePropertyTemplate(nestedProp);
          }
        }
        return obj;
      }
      return {};

    case 'array':
      return [];

    case 'string':
      return prop.enum ? prop.enum[0] : '';

    case 'integer':
    case 'number':
      return prop.minimum || 0;

    case 'boolean':
      return false;

    default:
      return null;
  }
}

/**
 * Formats a list of required fields as a compact bullet list.
 * Alternative to full schema spec when only field names are needed.
 *
 * @param requiredFields - List of required field names
 * @returns Formatted list string
 *
 * @example
 * ```typescript
 * const list = formatRequiredFieldsList(['ability_scores', 'speed', 'senses']);
 * // Output:
 * // - ability_scores
 * // - speed
 * // - senses
 * ```
 */
export function formatRequiredFieldsList(requiredFields: string[]): string {
  return requiredFields.map(field => `- ${field}`).join('\n');
}
