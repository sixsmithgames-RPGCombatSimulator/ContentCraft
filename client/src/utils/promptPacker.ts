/**
 * Prompt Packer Utility
 *
 * Enforces hard 8,000-character limit as an engineering constraint.
 * Measures exact payload size, assembles prompts in priority order,
 * and fails fast with structured errors on overflow.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

/**
 * Safety ceiling for prompt size (chars).
 * Set below the hard 8,000 limit to account for SDK overhead and edge cases.
 */
export const PROMPT_SAFETY_CEILING = 7200;

/**
 * Hard limit imposed by Gemini API (chars).
 * Content beyond this is silently truncated.
 */
export const GEMINI_HARD_LIMIT = 8000;

/**
 * Must-have prompt components (never dropped).
 */
export interface MustHaveComponents {
  /** Stage-minimal system contract (800-1500 chars target) */
  stageContract: string;
  /** JSON-only output format requirement */
  outputFormat: string;
  /** Compact schema spec (required keys + type hints) */
  requiredKeys: string;
  /** Reduced stage inputs from prior outputs */
  stageInputs: Record<string, unknown>;
}

/**
 * Should-have prompt components (dropped if needed to fit).
 */
export interface ShouldHaveComponents {
  /** Canon facts relevant to this stage */
  canonFacts?: string;
  /** Compressed summary of previous decisions */
  previousDecisionsSummary?: string;
}

/**
 * Nice-to-have prompt components (dropped first).
 */
export interface NiceToHaveComponents {
  /** Full prior stage outputs (verbose) */
  fullPriorOutputs?: Record<string, unknown>;
  /** Verbose flags from config */
  verboseFlags?: Record<string, unknown>;
  /** Example outputs or templates */
  examples?: string;
}

/**
 * Configuration for prompt packing.
 */
export interface PromptPackConfig {
  mustHave: MustHaveComponents;
  shouldHave: ShouldHaveComponents;
  niceToHave: NiceToHaveComponents;
  /** Safety ceiling in chars (default: 7200) */
  safetyCeiling?: number;
}

/**
 * Size breakdown by component category.
 */
export interface SizeBreakdown {
  mustHave: {
    stageContract: number;
    outputFormat: number;
    requiredKeys: number;
    stageInputs: number;
    total: number;
  };
  shouldHave: {
    canonFacts: number;
    previousDecisions: number;
    total: number;
  };
  niceToHave: {
    fullPriorOutputs: number;
    verboseFlags: number;
    examples: number;
    total: number;
  };
  grandTotal: number;
}

/**
 * Result of prompt packing operation.
 */
export interface PackedPromptResult {
  success: boolean;
  systemPrompt?: string;
  userPrompt?: string;
  analysis: {
    totalChars: number;
    breakdown: SizeBreakdown;
    droppedSections: string[];
    compressionApplied: boolean;
  };
  error?: {
    message: string;
    breakdown: SizeBreakdown;
    overflow: number;
  };
}

/**
 * Measures the exact size of a prompt as it will be sent to Gemini.
 * Accounts for JSON serialization overhead (quoting, escaping).
 *
 * @param systemPrompt - System prompt text
 * @param userPrompt - User prompt text
 * @returns Exact character count of serialized payload
 */
export function measurePromptSize(systemPrompt: string, userPrompt: string): number {
  // Simulate Gemini SDK request body structure
  const requestBody = {
    contents: [
      {
        parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  // Measure serialized JSON size
  const serialized = JSON.stringify(requestBody);
  return serialized.length;
}

function composePrompt(systemPrompt: string, userPrompt: string): string {
  return `${systemPrompt}\n\n---\n\n${userPrompt}`;
}

function buildCandidate(
  config: PromptPackConfig,
): { systemPrompt: string; userPrompt: string; totalChars: number } {
  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(config);
  return {
    systemPrompt,
    userPrompt,
    totalChars: composePrompt(systemPrompt, userPrompt).length,
  };
}

/**
 * Generates a size breakdown for prompt components.
 *
 * @param config - Prompt pack configuration
 * @returns Detailed size breakdown
 */
function generateSizeBreakdown(config: PromptPackConfig): SizeBreakdown {
  const mustHave = {
    stageContract: config.mustHave.stageContract.length,
    outputFormat: config.mustHave.outputFormat.length,
    requiredKeys: config.mustHave.requiredKeys.length,
    stageInputs: JSON.stringify(config.mustHave.stageInputs).length,
    total: 0,
  };
  mustHave.total = mustHave.stageContract + mustHave.outputFormat + mustHave.requiredKeys + mustHave.stageInputs;

  const shouldHave = {
    canonFacts: config.shouldHave.canonFacts?.length || 0,
    previousDecisions: config.shouldHave.previousDecisionsSummary?.length || 0,
    total: 0,
  };
  shouldHave.total = shouldHave.canonFacts + shouldHave.previousDecisions;

  const niceToHave = {
    fullPriorOutputs: config.niceToHave.fullPriorOutputs ? JSON.stringify(config.niceToHave.fullPriorOutputs).length : 0,
    verboseFlags: config.niceToHave.verboseFlags ? JSON.stringify(config.niceToHave.verboseFlags).length : 0,
    examples: config.niceToHave.examples?.length || 0,
    total: 0,
  };
  niceToHave.total = niceToHave.fullPriorOutputs + niceToHave.verboseFlags + niceToHave.examples;

  const grandTotal = mustHave.total + shouldHave.total + niceToHave.total;

  return { mustHave, shouldHave, niceToHave, grandTotal };
}

/**
 * Compresses a decisions summary by truncating to a character limit.
 *
 * @param summary - Original summary text
 * @param maxChars - Maximum characters allowed
 * @returns Compressed summary
 */
function compressDecisionsSummary(summary: string, maxChars: number): string {
  if (summary.length <= maxChars) return summary;
  return summary.substring(0, maxChars - 50) + '\n\n[... truncated due to size limits ...]';
}

/**
 * Compresses canon facts by truncating to a character limit.
 *
 * @param facts - Original facts text
 * @param maxChars - Maximum characters allowed
 * @returns Compressed facts
 */
function compressCanonFacts(facts: string, maxChars: number): string {
  if (facts.length <= maxChars) return facts;
  return facts.substring(0, maxChars - 50) + '\n\n[... truncated due to size limits ...]';
}

/**
 * Builds a packed prompt with hard size enforcement.
 * Assembles components in priority order and fails fast on overflow.
 *
 * @param config - Prompt pack configuration
 * @returns Packed prompt result with success/failure status
 */
export function buildPackedPrompt(config: PromptPackConfig): PackedPromptResult {
  const safetyCeiling = config.safetyCeiling || PROMPT_SAFETY_CEILING;
  const droppedSections: string[] = [];
  let compressionApplied = false;

  // Generate initial size breakdown
  let breakdown = generateSizeBreakdown(config);

  // Step 1: Check if must-have alone exceeds ceiling
  if (breakdown.mustHave.total > safetyCeiling) {
    return {
      success: false,
      analysis: {
        totalChars: breakdown.grandTotal,
        breakdown,
        droppedSections: [],
        compressionApplied: false,
      },
      error: {
        message: `Must-have components alone (${breakdown.mustHave.total} chars) exceed safety ceiling (${safetyCeiling} chars). Cannot pack prompt.`,
        breakdown,
        overflow: breakdown.mustHave.total - safetyCeiling,
      },
    };
  }

  // Step 2: Try with all components
  let workingConfig = { ...config };

  if (breakdown.grandTotal <= safetyCeiling) {
    const candidate = buildCandidate(workingConfig);
    if (candidate.totalChars <= safetyCeiling) {
      return {
        success: true,
        systemPrompt: candidate.systemPrompt,
        userPrompt: candidate.userPrompt,
        analysis: {
          totalChars: candidate.totalChars,
          breakdown,
          droppedSections,
          compressionApplied,
        },
      };
    }
  }

  // Step 3: Drop nice-to-have components
  if (breakdown.niceToHave.total > 0) {
    workingConfig = {
      ...workingConfig,
      niceToHave: {},
    };
    breakdown = generateSizeBreakdown(workingConfig);
    droppedSections.push('nice-to-have (examples, verbose flags, full prior outputs)');

    if (breakdown.grandTotal <= safetyCeiling) {
      const candidate = buildCandidate(workingConfig);
      if (candidate.totalChars <= safetyCeiling) {
        return {
          success: true,
          systemPrompt: candidate.systemPrompt,
          userPrompt: candidate.userPrompt,
          analysis: {
            totalChars: candidate.totalChars,
            breakdown,
            droppedSections,
            compressionApplied,
          },
        };
      }
    }
  }

  // Step 4: Compress should-have components
  const availableForShouldHave = safetyCeiling - breakdown.mustHave.total;
  const shouldHaveTotal = breakdown.shouldHave.total;

  if (shouldHaveTotal > availableForShouldHave) {
    compressionApplied = true;
    const compressionRatio = availableForShouldHave / shouldHaveTotal;

    if (workingConfig.shouldHave.canonFacts) {
      const targetCanonSize = Math.floor(breakdown.shouldHave.canonFacts * compressionRatio);
      workingConfig.shouldHave.canonFacts = compressCanonFacts(workingConfig.shouldHave.canonFacts, targetCanonSize);
    }

    if (workingConfig.shouldHave.previousDecisionsSummary) {
      const targetDecisionsSize = Math.floor(breakdown.shouldHave.previousDecisions * compressionRatio);
      workingConfig.shouldHave.previousDecisionsSummary = compressDecisionsSummary(
        workingConfig.shouldHave.previousDecisionsSummary,
        targetDecisionsSize
      );
    }

    breakdown = generateSizeBreakdown(workingConfig);

    if (breakdown.grandTotal <= safetyCeiling) {
      const candidate = buildCandidate(workingConfig);
      if (candidate.totalChars <= safetyCeiling) {
        return {
          success: true,
          systemPrompt: candidate.systemPrompt,
          userPrompt: candidate.userPrompt,
          analysis: {
            totalChars: candidate.totalChars,
            breakdown,
            droppedSections,
            compressionApplied,
          },
        };
      }
    }
  }

  // Step 5: Drop should-have components entirely
  workingConfig = {
    ...workingConfig,
    shouldHave: {},
  };
  breakdown = generateSizeBreakdown(workingConfig);
  droppedSections.push('should-have (canon facts, previous decisions)');

  if (breakdown.grandTotal <= safetyCeiling) {
    const candidate = buildCandidate(workingConfig);
    if (candidate.totalChars <= safetyCeiling) {
      return {
        success: true,
        systemPrompt: candidate.systemPrompt,
        userPrompt: candidate.userPrompt,
        analysis: {
          totalChars: candidate.totalChars,
          breakdown,
          droppedSections,
          compressionApplied,
        },
      };
    }
  }

  // Step 6: Still too large - fail fast
  const finalCandidate = buildCandidate(workingConfig);
  return {
    success: false,
    analysis: {
      totalChars: finalCandidate.totalChars,
      breakdown,
      droppedSections,
      compressionApplied,
    },
    error: {
      message: `Prompt still exceeds safety ceiling (${safetyCeiling} chars) after dropping all optional components. Final composed prompt: ${finalCandidate.totalChars} chars.`,
      breakdown,
      overflow: finalCandidate.totalChars - safetyCeiling,
    },
  };
}

/**
 * Builds the system prompt from packed components.
 *
 * @param config - Working configuration
 * @returns Assembled system prompt
 */
function buildSystemPrompt(config: PromptPackConfig): string {
  const parts: string[] = [];

  // Output format requirement (always first)
  parts.push(config.mustHave.outputFormat);

  // Stage contract
  parts.push(config.mustHave.stageContract);

  // Required keys (compact schema spec)
  if (config.mustHave.requiredKeys) {
    parts.push(`\n**Required Output Structure:**\n${config.mustHave.requiredKeys}`);
  }

  return parts.join('\n\n');
}

/**
 * Builds the user prompt from packed components.
 *
 * @param config - Working configuration
 * @returns Assembled user prompt
 */
function buildUserPrompt(config: PromptPackConfig): string {
  const parts: string[] = [];

  // Stage inputs (must-have)
  if (Object.keys(config.mustHave.stageInputs).length > 0) {
    parts.push(`**Stage Inputs:**\n${JSON.stringify(config.mustHave.stageInputs, null, 2)}`);
  }

  // Canon facts (should-have)
  if (config.shouldHave.canonFacts) {
    parts.push(`**Relevant Canon:**\n${config.shouldHave.canonFacts}`);
  }

  // Previous decisions (should-have)
  if (config.shouldHave.previousDecisionsSummary) {
    parts.push(`**Previous Decisions:**\n${config.shouldHave.previousDecisionsSummary}`);
  }

  // Full prior outputs (nice-to-have)
  if (config.niceToHave.fullPriorOutputs && Object.keys(config.niceToHave.fullPriorOutputs).length > 0) {
    parts.push(`**Full Context:**\n${JSON.stringify(config.niceToHave.fullPriorOutputs, null, 2)}`);
  }

  // Verbose flags (nice-to-have)
  if (config.niceToHave.verboseFlags && Object.keys(config.niceToHave.verboseFlags).length > 0) {
    parts.push(`**Flags:**\n${JSON.stringify(config.niceToHave.verboseFlags, null, 2)}`);
  }

  // Examples (nice-to-have)
  if (config.niceToHave.examples) {
    parts.push(`**Examples:**\n${config.niceToHave.examples}`);
  }

  return parts.join('\n\n');
}

/**
 * Formats a size breakdown for logging.
 *
 * @param breakdown - Size breakdown to format
 * @returns Formatted string
 */
export function formatSizeBreakdown(breakdown: SizeBreakdown): string {
  return `
📊 Prompt Size Breakdown:
├─ Must-Have: ${breakdown.mustHave.total.toLocaleString()} chars
│  ├─ Stage Contract: ${breakdown.mustHave.stageContract.toLocaleString()}
│  ├─ Output Format: ${breakdown.mustHave.outputFormat.toLocaleString()}
│  ├─ Required Keys: ${breakdown.mustHave.requiredKeys.toLocaleString()}
│  └─ Stage Inputs: ${breakdown.mustHave.stageInputs.toLocaleString()}
├─ Should-Have: ${breakdown.shouldHave.total.toLocaleString()} chars
│  ├─ Canon Facts: ${breakdown.shouldHave.canonFacts.toLocaleString()}
│  └─ Previous Decisions: ${breakdown.shouldHave.previousDecisions.toLocaleString()}
├─ Nice-To-Have: ${breakdown.niceToHave.total.toLocaleString()} chars
│  ├─ Full Prior Outputs: ${breakdown.niceToHave.fullPriorOutputs.toLocaleString()}
│  ├─ Verbose Flags: ${breakdown.niceToHave.verboseFlags.toLocaleString()}
│  └─ Examples: ${breakdown.niceToHave.examples.toLocaleString()}
└─ Grand Total: ${breakdown.grandTotal.toLocaleString()} chars
`.trim();
}
