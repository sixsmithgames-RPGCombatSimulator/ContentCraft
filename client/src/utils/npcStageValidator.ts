/**
 * NPC Stage Output Validation
 * Validates that AI responses include all required fields
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Core Details stage output
 * Ensures all personality fields are present
 */
export function validateCoreDetailsStage(output: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredFields = [
    'personality_traits',
    'ideals',
    'bonds',
    'flaws',
    'goals',
    'fears',
    'quirks',
    'voice_mannerisms',
    'hooks',
  ];

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in output)) {
      missingFields.push(field);
    } else {
      const value = output[field];
      // Check if field is empty/null
      if (value === null || value === undefined || value === '') {
        warnings.push(`Field "${field}" is present but empty`);
      } else if (Array.isArray(value) && value.length === 0) {
        warnings.push(`Field "${field}" is an empty array`);
      }
    }
  }

  if (missingFields.length > 0) {
    errors.push(
      `Missing required personality fields: ${missingFields.join(', ')}. ` +
      `The AI must provide ALL personality fields separately, not just hooks.`
    );
  }

  // Special check: if only hooks is present, that's a critical error
  if (missingFields.length === requiredFields.length - 1 && 'hooks' in output) {
    errors.push(
      `CRITICAL: AI only provided "hooks" field and skipped all other personality fields. ` +
      `This is not acceptable. The AI must provide: ${requiredFields.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate any NPC stage output based on stage name
 */
export function validateNpcStageOutput(
  stageName: string,
  output: Record<string, unknown>
): ValidationResult {
  const normalizedName = stageName.toLowerCase();

  if (normalizedName.includes('core details')) {
    return validateCoreDetailsStage(output);
  }

  // Other stages pass validation for now
  return {
    isValid: true,
    errors: [],
    warnings: [],
  };
}
