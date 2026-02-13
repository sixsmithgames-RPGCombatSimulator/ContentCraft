/**
 * Strict Location Validation Layer
 *
 * Validates D&D location data with scale-aware geometry validation.
 * - Validate BEFORE any transformation
 * - Reject invalid payloads with actionable errors
 * - NO auto-normalization or fallbacks
 * - Scale-aware: Strict geometry validation only for complex/massive locations
 
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

// Load location schema
const locationSchemaPath = join(__dirname, '../schemas/location.schema.json');
const locationSchema = JSON.parse(readFileSync(locationSchemaPath, 'utf-8'));

// Compile validator
const validateLocation: ValidateFunction = ajv.compile(locationSchema);

/**
 * Validation error with human-readable message
 */
export class LocationValidationError extends Error {
  public readonly errors: ErrorObject[];
  public readonly details: string;

  constructor(errors: ErrorObject[]) {
    const details = formatValidationErrors(errors);
    super(`Location validation failed:\n${details}`);
    this.name = 'LocationValidationError';
    this.errors = errors;
    this.details = details;
  }
}

/**
 * Geometry conflict error with proposal suggestions
 */
export class GeometryConflictError extends Error {
  public readonly conflicts: GeometryConflict[];
  public readonly proposals: GeometryProposal[];

  constructor(conflicts: GeometryConflict[], proposals: GeometryProposal[]) {
    const details = formatGeometryConflicts(conflicts);
    super(`Geometry validation failed:\n${details}`);
    this.name = 'GeometryConflictError';
    this.conflicts = conflicts;
    this.proposals = proposals;
  }
}

/**
 * Geometry conflict description
 */
export interface GeometryConflict {
  type: 'overlap' | 'disconnected' | 'dimension_mismatch' | 'impossible_connection' | 'missing_support' | 'vertical_misalignment';
  severity: 'blocking' | 'warning';
  description: string;
  affected_spaces?: string[];
  field_path?: string;
  details?: Record<string, unknown>;
}

/**
 * Geometry conflict resolution proposal
 */
export interface GeometryProposal {
  conflict_id: string;
  question: string;
  options: string[];
  rule_impact: string;
  field_path?: string;
  severity: 'blocking' | 'warning';
  auto_fix_suggestion?: string;
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
          if (fieldName.includes('dimensions')) {
            fixGuidance = 'For dimensions, use {"length": "60 ft", "width": "40 ft", "height": "15 ft"} instead of just text';
          } else if (fieldName.includes('geometry')) {
            fixGuidance = 'Geometry should be an object with dimensions and optional position/connections';
          } else if (fieldName.includes('mesh_metadata') || fieldName.includes('mesh_anchors')) {
            fixGuidance = 'Metadata linking requires an object structure with connection information';
          } else {
            fixGuidance = 'Use {key: value} format, not a simple text value. Check the field structure in the editor.';
          }
        } else if (expected === 'integer' && actual === 'string') {
          fixGuidance = `Use a whole number like 5, not "${String(err.data)}" (text in quotes)`;
        } else if (expected === 'array' && actual === 'object') {
          fixGuidance = 'Use [value1, value2] format for lists/arrays';
        } else if (expected === 'object') {
          fixGuidance = 'Use {key: value} format, not a simple value';
        } else {
          fixGuidance = `Ensure this is ${expected}`;
        }

        guidance = `\n   → Expected: ${expected}${expected === 'integer' ? ' (whole number)' : expected === 'string' ? ' (text)' : expected === 'object' ? ' (key-value structure)' : expected === 'array' ? ' (list)' : ''}\n   → Received: ${actual}${actual === 'string' ? ` ("${String(err.data).substring(0, 50)}${String(err.data).length > 50 ? '...' : ''}")` : ''}\n   → Fix: ${fixGuidance}`;
      } else if (err.keyword === 'required') {
        const missing = err.params?.missingProperty;
        guidance = `\n   → Missing required field: "${missing}"\n   → Fix: Add this field to your location data`;
      } else if (err.keyword === 'enum') {
        const allowed = err.params?.allowedValues;
        guidance = `\n   → Allowed values: ${allowed ? allowed.join(', ') : 'see schema'}\n   → Received: ${JSON.stringify(err.data)}\n   → Fix: Use one of the allowed values listed above`;
      } else if (err.keyword === 'oneOf') {
        guidance = `\n   → This field has multiple valid formats but matches none of them\n   → Fix: Check if the value is the correct type (coordinates vs relative position)`;
      } else if (err.keyword === 'additionalProperties') {
        const extra = err.params?.additionalProperty;
        guidance = `\n   → Unexpected field: "${extra}"\n   → Fix: Remove this field or check for typos in field names`;
      }

      return `${index + 1}. Field "${fieldName}": ${message}${guidance}`;
    })
    .join('\n\n');
}

/**
 * Format geometry conflicts into human-readable messages
 */
function formatGeometryConflicts(conflicts: GeometryConflict[]): string {
  return conflicts
    .map((conflict, index) => {
      const severity = conflict.severity === 'blocking' ? '🛑 BLOCKING' : '⚠️  WARNING';
      let message = `${index + 1}. [${severity}] ${conflict.type.replace(/_/g, ' ').toUpperCase()}\n   ${conflict.description}`;

      if (conflict.affected_spaces && conflict.affected_spaces.length > 0) {
        message += `\n   Affected spaces: ${conflict.affected_spaces.join(', ')}`;
      }

      if (conflict.field_path) {
        message += `\n   Field: ${conflict.field_path}`;
      }

      if (conflict.details) {
        message += `\n   Details: ${JSON.stringify(conflict.details, null, 2)}`;
      }

      return message;
    })
    .join('\n\n');
}

/**
 * Validate location data against schema
 *
 * @param data - Raw location data to validate
 * @returns Validation result with success status and detailed errors
 */
export function validateLocationStrict(data: unknown): {
  valid: boolean;
  errors?: ErrorObject[];
  details?: string;
} {
  const valid = validateLocation(data);

  if (!valid && validateLocation.errors) {
    return {
      valid: false,
      errors: validateLocation.errors,
      details: formatValidationErrors(validateLocation.errors),
    };
  }

  return { valid: true };
}

/**
 * Validate and throw if invalid (for use in routes)
 */
export function validateLocationOrThrow(data: unknown): void {
  const result = validateLocationStrict(data);

  if (!result.valid) {
    throw new LocationValidationError(result.errors || []);
  }
}

/**
 * Check if data represents a location (has required location fields)
 */
export function isLocationContent(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;

  const record = data as Record<string, unknown>;

  // Check for key location identifiers
  return (
    typeof record.name === 'string' &&
    typeof record.location_type === 'string' &&
    (record.deliverable === 'location' ||
      record.type === 'location' ||
      ['castle', 'dungeon', 'city', 'fortress', 'manor', 'temple', 'tower', 'wilderness', 'tavern', 'inn', 'shop'].includes(
        record.location_type as string
      ))
  );
}

/**
 * Determine location scale from data
 */
export function getLocationScale(data: unknown): 'simple' | 'moderate' | 'complex' | 'massive' | 'unknown' {
  if (typeof data !== 'object' || data === null) return 'unknown';

  const record = data as Record<string, unknown>;

  // Explicit scale field (from Purpose stage)
  if (record.scale && typeof record.scale === 'string') {
    if (['simple', 'moderate', 'complex', 'massive'].includes(record.scale)) {
      return record.scale as 'simple' | 'moderate' | 'complex' | 'massive';
    }
  }

  // Infer from estimated_spaces
  if (typeof record.estimated_spaces === 'number') {
    if (record.estimated_spaces <= 5) return 'simple';
    if (record.estimated_spaces <= 20) return 'moderate';
    if (record.estimated_spaces <= 50) return 'complex';
    return 'massive';
  }

  // Infer from actual spaces count
  if (record.spaces && Array.isArray(record.spaces)) {
    const count = record.spaces.length;
    if (count <= 5) return 'simple';
    if (count <= 20) return 'moderate';
    if (count <= 50) return 'complex';
    return 'massive';
  }

  // Infer from presence of complex topology features
  if (record.wings || record.locking_points || record.load_bearing_walls) {
    return 'complex';
  }

  return 'unknown';
}

/**
 * Validate geometry for a location (scale-aware)
 *
 * Simple/Moderate: Relaxed validation (warnings only)
 * Complex/Massive: Strict validation (blocking errors)
 *
 * @param data - Location data with geometry
 * @returns Array of geometry conflicts
 */
export function validateGeometry(data: unknown): GeometryConflict[] {
  if (typeof data !== 'object' || data === null) {
    return [
      {
        type: 'dimension_mismatch',
        severity: 'blocking',
        description: 'Location data must be an object',
      },
    ];
  }

  const record = data as Record<string, unknown>;
  const scale = getLocationScale(data);
  const conflicts: GeometryConflict[] = [];

  // For simple/moderate locations, only do basic checks (warnings)
  const strictMode = scale === 'complex' || scale === 'massive';

  // 1. Check for spaces array
  const spaces = record.spaces as Array<Record<string, unknown>> | undefined;
  if (!spaces || !Array.isArray(spaces)) {
    // Only blocking for complex/massive
    if (strictMode) {
      conflicts.push({
        type: 'dimension_mismatch',
        severity: 'blocking',
        description: 'Complex/massive locations require a spaces array',
        field_path: 'spaces',
      });
    }
    return conflicts; // Can't validate further without spaces
  }

  // 2. Check each space has required geometry (scale-aware)
  spaces.forEach((space, index) => {
    const spaceId = (space.id as string) || `space_${index}`;

    if (!space.geometry) {
      conflicts.push({
        type: 'dimension_mismatch',
        severity: strictMode ? 'blocking' : 'warning',
        description: `Space "${spaceId}" missing geometry object`,
        affected_spaces: [spaceId],
        field_path: `spaces[${index}].geometry`,
      });
      return;
    }

    const geometry = space.geometry as Record<string, unknown>;

    // Check dimensions
    if (!geometry.dimensions) {
      conflicts.push({
        type: 'dimension_mismatch',
        severity: strictMode ? 'blocking' : 'warning',
        description: `Space "${spaceId}" missing dimensions`,
        affected_spaces: [spaceId],
        field_path: `spaces[${index}].geometry.dimensions`,
      });
    }

    // For complex/massive, require position information
    if (strictMode && !geometry.position) {
      conflicts.push({
        type: 'dimension_mismatch',
        severity: 'warning',
        description: `Space "${spaceId}" missing position information (recommended for ${scale} locations)`,
        affected_spaces: [spaceId],
        field_path: `spaces[${index}].geometry.position`,
      });
    }
  });

  // 3. Check connectivity (all scales)
  const spaceIds = new Set(spaces.map((s) => s.id as string).filter(Boolean));
  const connectedSpaces = new Set<string>();

  spaces.forEach((space, index) => {
    const spaceId = (space.id as string) || `space_${index}`;
    const geometry = space.geometry as Record<string, unknown> | undefined;
    const connections = geometry?.connections as Array<Record<string, unknown>> | undefined;

    if (connections && Array.isArray(connections)) {
      connections.forEach((conn) => {
        const target = conn.to as string;
        if (target) {
          connectedSpaces.add(spaceId);
          connectedSpaces.add(target);

          // Check if target exists
          if (!spaceIds.has(target)) {
            conflicts.push({
              type: 'disconnected',
              severity: strictMode ? 'blocking' : 'warning',
              description: `Space "${spaceId}" connects to non-existent space "${target}"`,
              affected_spaces: [spaceId, target],
              field_path: `spaces[${index}].geometry.connections`,
            });
          }
        }
      });
    }
  });

  // Check for completely disconnected spaces
  const disconnectedSpaces = Array.from(spaceIds).filter((id) => !connectedSpaces.has(id));
  if (disconnectedSpaces.length > 0 && spaces.length > 1) {
    // Only warn for simple, block for complex
    conflicts.push({
      type: 'disconnected',
      severity: strictMode ? 'blocking' : 'warning',
      description: `${disconnectedSpaces.length} space(s) have no connections to other spaces`,
      affected_spaces: disconnectedSpaces,
      details: { disconnected_space_ids: disconnectedSpaces },
    });
  }

  // 4. Check mesh_anchors for chunk meshing (all scales)
  const hasMeshAnchors = spaces.some((space) => {
    return space.mesh_anchors && typeof space.mesh_anchors === 'object';
  });

  if (!hasMeshAnchors && spaces.length > 5) {
    conflicts.push({
      type: 'dimension_mismatch',
      severity: 'warning',
      description: 'No spaces have mesh_anchors metadata for chunk meshing (recommended for locations with 5+ spaces)',
      field_path: 'spaces[].mesh_anchors',
    });
  }

  // 5. Validate locking points (complex/massive only)
  if (strictMode && record.locking_points) {
    const lockingPoints = record.locking_points as Array<Record<string, unknown>>;
    if (Array.isArray(lockingPoints)) {
      const lockingPointIds = new Set(lockingPoints.map((lp) => lp.id as string).filter(Boolean));

      // Check spaces reference valid locking points
      spaces.forEach((space, index) => {
        const geometry = space.geometry as Record<string, unknown> | undefined;
        const locks = geometry?.locking_points as string[] | undefined;

        if (locks && Array.isArray(locks)) {
          locks.forEach((lockId) => {
            if (!lockingPointIds.has(lockId)) {
              const spaceId = (space.id as string) || `space_${index}`;
              conflicts.push({
                type: 'missing_support',
                severity: 'blocking',
                description: `Space "${spaceId}" references non-existent locking point "${lockId}"`,
                affected_spaces: [spaceId],
                field_path: `spaces[${index}].geometry.locking_points`,
              });
            }
          });
        }
      });
    }
  }

  // 6. Validate vertical alignment (complex/massive with floors)
  if (strictMode && record.floors) {
    const floors = record.floors as Array<Record<string, unknown>>;
    if (Array.isArray(floors)) {
      const floorLevels = new Set(floors.map((f) => f.level).filter((l) => typeof l === 'number'));

      // Check spaces reference valid floor levels
      spaces.forEach((space, index) => {
        const floorLevel = space.floor_level;
        if (typeof floorLevel === 'number' && !floorLevels.has(floorLevel)) {
          const spaceId = (space.id as string) || `space_${index}`;
          conflicts.push({
            type: 'vertical_misalignment',
            severity: 'blocking',
            description: `Space "${spaceId}" on floor ${floorLevel} but that floor doesn't exist`,
            affected_spaces: [spaceId],
            field_path: `spaces[${index}].floor_level`,
            details: { space_floor: floorLevel, available_floors: Array.from(floorLevels) },
          });
        }
      });
    }
  }

  return conflicts;
}

/**
 * Generate proposals for geometry conflicts
 *
 * @param conflicts - Array of geometry conflicts
 * @returns Array of resolution proposals
 */
export function generateGeometryProposals(conflicts: GeometryConflict[]): GeometryProposal[] {
  const proposals: GeometryProposal[] = [];

  conflicts.forEach((conflict, index) => {
    const proposalId = `conflict_${index}`;

    switch (conflict.type) {
      case 'disconnected':
        proposals.push({
          conflict_id: proposalId,
          question: `How should we handle disconnected spaces: ${conflict.affected_spaces?.join(', ') || 'multiple spaces'}?`,
          options: [
            'Add hallways to connect them',
            'Add doors between adjacent spaces',
            'Leave disconnected (separate areas)',
            'Remove disconnected spaces',
            'Custom',
          ],
          rule_impact: 'Affects connectivity and navigation paths',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: 'Add hallways to connect them',
        });
        break;

      case 'dimension_mismatch':
        proposals.push({
          conflict_id: proposalId,
          question: `${conflict.description} - How should we proceed?`,
          options: [
            'Add missing dimensions with default values',
            'Use parent structure dimensions',
            'Prompt for specific dimensions',
            'Skip geometry validation',
            'Custom',
          ],
          rule_impact: 'Affects spatial layout and validation accuracy',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: conflict.severity === 'blocking' ? 'Prompt for specific dimensions' : 'Add missing dimensions with default values',
        });
        break;

      case 'impossible_connection':
        proposals.push({
          conflict_id: proposalId,
          question: `Impossible connection detected: ${conflict.description}. How should we resolve this?`,
          options: [
            'Remove the impossible connection',
            'Adjust space positions to make it possible',
            'Convert to a narrative-only connection',
            'Add intermediate connecting space',
            'Custom',
          ],
          rule_impact: 'Affects structural integrity and physical possibility',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: 'Add intermediate connecting space',
        });
        break;

      case 'missing_support':
        proposals.push({
          conflict_id: proposalId,
          question: `Missing structural support: ${conflict.description}. How should we fix this?`,
          options: [
            'Add the missing locking point',
            'Reference a different existing locking point',
            'Remove this structural reference',
            'Convert to free-standing structure',
            'Custom',
          ],
          rule_impact: 'Affects structural validation and consistency',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: 'Add the missing locking point',
        });
        break;

      case 'vertical_misalignment':
        proposals.push({
          conflict_id: proposalId,
          question: `Vertical alignment issue: ${conflict.description}. What should we do?`,
          options: [
            'Add the missing floor level',
            'Move space to existing floor',
            'Remove floor level reference (single-level location)',
            'Adjust all floor numbering',
            'Custom',
          ],
          rule_impact: 'Affects vertical structure and floor organization',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: 'Move space to existing floor',
        });
        break;

      case 'overlap':
        proposals.push({
          conflict_id: proposalId,
          question: `Space overlap detected: ${conflict.description}. How should we resolve?`,
          options: [
            'Adjust positions to eliminate overlap',
            'Reduce dimensions to fit',
            'Convert to nested spaces (one inside other)',
            'Mark as abstract/narrative layout',
            'Custom',
          ],
          rule_impact: 'Affects physical layout and dimensional accuracy',
          field_path: conflict.field_path,
          severity: conflict.severity,
          auto_fix_suggestion: 'Adjust positions to eliminate overlap',
        });
        break;

      default:
        // Generic proposal for unknown conflict types
        proposals.push({
          conflict_id: proposalId,
          question: `Geometry conflict detected: ${conflict.description}. How should we proceed?`,
          options: ['Auto-fix if possible', 'Skip validation', 'Manual correction needed', 'Custom'],
          rule_impact: 'Affects geometry validation',
          field_path: conflict.field_path,
          severity: conflict.severity,
        });
    }
  });

  return proposals;
}

/**
 * Validate location with full geometry checking
 *
 * Combines schema validation with geometry validation
 *
 * @param data - Location data
 * @returns Validation result with schema and geometry errors
 */
export function validateLocationWithGeometry(data: unknown): {
  valid: boolean;
  schemaErrors?: ErrorObject[];
  geometryConflicts?: GeometryConflict[];
  proposals?: GeometryProposal[];
  details?: string;
} {
  // First validate against schema
  const schemaResult = validateLocationStrict(data);

  if (!schemaResult.valid) {
    return {
      valid: false,
      schemaErrors: schemaResult.errors,
      details: schemaResult.details,
    };
  }

  // Then validate geometry
  const geometryConflicts = validateGeometry(data);

  // Only blocking conflicts make it invalid
  const blockingConflicts = geometryConflicts.filter((c) => c.severity === 'blocking');

  if (blockingConflicts.length > 0) {
    const proposals = generateGeometryProposals(blockingConflicts);
    return {
      valid: false,
      geometryConflicts: blockingConflicts,
      proposals,
      details: formatGeometryConflicts(blockingConflicts),
    };
  }

  // Warnings don't block but are included
  const warnings = geometryConflicts.filter((c) => c.severity === 'warning');
  if (warnings.length > 0) {
    return {
      valid: true,
      geometryConflicts: warnings,
      details: `Validation passed with ${warnings.length} warning(s):\n${formatGeometryConflicts(warnings)}`,
    };
  }

  return { valid: true };
}

/**
 * Check if location has chunk mesh metadata
 */
export function hasChunkMeshMetadata(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;

  const record = data as Record<string, unknown>;

  // Check foundation level
  if (record.chunk_mesh_metadata && typeof record.chunk_mesh_metadata === 'object') {
    return true;
  }

  // Check space level
  const spaces = record.spaces as Array<Record<string, unknown>> | undefined;
  if (spaces && Array.isArray(spaces)) {
    return spaces.some((space) => space.mesh_anchors && typeof space.mesh_anchors === 'object');
  }

  return false;
}
