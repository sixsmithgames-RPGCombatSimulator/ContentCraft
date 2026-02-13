/**
 * Prompt Character Limit Management
 *
 * Ensures all AI prompts stay within character limits to prevent truncation
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export const PROMPT_LIMITS = {
  /**
   * HARD LIMIT: AI truncates everything after this
   * This is NOT negotiable - the AI will silently drop characters beyond this
   */
  AI_HARD_LIMIT: 8000,

  /**
   * Safe maximum to leave buffer for edge cases
   */
  MAX_PROMPT_CHARS: 7800,

  /**
   * Soft warning threshold (90% of hard limit)
   */
  WARNING_THRESHOLD: 7200,

  /**
   * Maximum characters for canon facts section (will be calculated dynamically)
   */
  MAX_CANON_FACTS_CHARS: 4000,

  /**
   * Maximum characters for accumulated answers section
   */
  MAX_ACCUMULATED_ANSWERS_CHARS: 1500,

  /**
   * Reserve space for system prompt and formatting
   */
  SYSTEM_PROMPT_RESERVE: 1500,
};

export interface PromptAnalysis {
  totalChars: number;
  exceedsLimit: boolean;
  percentOfLimit: number;
  recommendation: 'ok' | 'warning' | 'error';
  breakdown: {
    systemPrompt: number;
    userPrompt: number;
    accumulatedAnswers?: number;
    npcSchemaGuidance?: number;
    other?: number;
  };
  message: string;
}

/**
 * Analyzes a prompt's character count and provides recommendations
 */
export function analyzePrompt(
  systemPrompt: string,
  userPrompt: string,
  accumulatedAnswers?: string,
  npcSchemaGuidance?: string
): PromptAnalysis {
  const systemChars = systemPrompt.length;
  const userChars = userPrompt.length;
  const answersChars = accumulatedAnswers?.length || 0;
  const schemaChars = npcSchemaGuidance?.length || 0;

  const totalChars = systemChars + userChars + answersChars + schemaChars;
  const percentOfLimit = (totalChars / PROMPT_LIMITS.MAX_PROMPT_CHARS) * 100;

  let recommendation: 'ok' | 'warning' | 'error' = 'ok';
  let message = `Prompt is ${totalChars.toLocaleString()} chars (${percentOfLimit.toFixed(1)}% of limit)`;

  if (totalChars > PROMPT_LIMITS.MAX_PROMPT_CHARS) {
    recommendation = 'error';
    const overflow = totalChars - PROMPT_LIMITS.MAX_PROMPT_CHARS;
    message = `⚠️ PROMPT TOO LONG: ${totalChars.toLocaleString()} chars exceeds limit by ${overflow.toLocaleString()} chars. Must trim content.`;
  } else if (totalChars > PROMPT_LIMITS.WARNING_THRESHOLD) {
    recommendation = 'warning';
    const remaining = PROMPT_LIMITS.MAX_PROMPT_CHARS - totalChars;
    message = `⚠️ WARNING: Prompt is ${percentOfLimit.toFixed(1)}% of limit (${remaining.toLocaleString()} chars remaining)`;
  }

  return {
    totalChars,
    exceedsLimit: totalChars > PROMPT_LIMITS.MAX_PROMPT_CHARS,
    percentOfLimit,
    recommendation,
    breakdown: {
      systemPrompt: systemChars,
      userPrompt: userChars,
      accumulatedAnswers: answersChars,
      npcSchemaGuidance: schemaChars,
    },
    message,
  };
}

/**
 * Trims canon facts to fit within character limit
 */
export function trimCanonFacts(
  facts: Array<{ text: string; source?: string }>,
  maxChars: number = PROMPT_LIMITS.MAX_CANON_FACTS_CHARS
): {
  trimmedFacts: Array<{ text: string; source?: string }>;
  originalCount: number;
  trimmedCount: number;
  totalChars: number;
} {
  let currentChars = 0;
  const trimmedFacts: Array<{ text: string; source?: string }> = [];

  for (const fact of facts) {
    const factChars = fact.text.length + (fact.source?.length || 0) + 50; // +50 for JSON formatting
    if (currentChars + factChars <= maxChars) {
      trimmedFacts.push(fact);
      currentChars += factChars;
    } else {
      break;
    }
  }

  return {
    trimmedFacts,
    originalCount: facts.length,
    trimmedCount: trimmedFacts.length,
    totalChars: currentChars,
  };
}

/**
 * Trims accumulated answers to fit within character limit
 */
export function trimAccumulatedAnswers(
  answers: Record<string, string>,
  maxChars: number = PROMPT_LIMITS.MAX_ACCUMULATED_ANSWERS_CHARS
): {
  trimmedAnswers: Record<string, string>;
  originalCount: number;
  trimmedCount: number;
  totalChars: number;
} {
  const entries = Object.entries(answers);
  const trimmedAnswers: Record<string, string> = {};
  let currentChars = 0;

  // Keep most recent answers
  for (let i = entries.length - 1; i >= 0; i--) {
    const [question, answer] = entries[i];
    const entryChars = question.length + answer.length + 20; // +20 for formatting

    if (currentChars + entryChars <= maxChars) {
      trimmedAnswers[question] = answer;
      currentChars += entryChars;
    } else {
      break;
    }
  }

  return {
    trimmedAnswers,
    originalCount: entries.length,
    trimmedCount: Object.keys(trimmedAnswers).length,
    totalChars: currentChars,
  };
}

/**
 * Builds a safe prompt that respects character limits
 */
export function buildSafePrompt(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    accumulatedAnswers?: Record<string, string>;
    npcSchemaGuidance?: string;
    forceIncludeSchema?: boolean;
  }
): {
  prompt: string;
  analysis: PromptAnalysis;
  warnings: string[];
} {
  const warnings: string[] = [];
  let finalSystemPrompt = systemPrompt;
  let finalUserPrompt = userPrompt;
  let accumulatedSection = '';
  let schemaSection = '';

  // 1. Start with base system + user prompts
  let baseChars = systemPrompt.length + userPrompt.length;

  // 2. Add NPC schema guidance if requested
  if (options?.npcSchemaGuidance) {
    const schemaChars = options.npcSchemaGuidance.length;

    if (options.forceIncludeSchema || baseChars + schemaChars < PROMPT_LIMITS.MAX_PROMPT_CHARS - 1000) {
      schemaSection = options.npcSchemaGuidance;
      baseChars += schemaChars;
    } else {
      warnings.push('NPC schema guidance omitted due to character limit');
    }
  }

  // 3. Add accumulated answers if space allows
  if (options?.accumulatedAnswers && Object.keys(options.accumulatedAnswers).length > 0) {
    const remainingChars = PROMPT_LIMITS.MAX_PROMPT_CHARS - baseChars;
    const maxAnswersChars = Math.min(
      PROMPT_LIMITS.MAX_ACCUMULATED_ANSWERS_CHARS,
      remainingChars - 500 // Keep 500 char buffer
    );

    if (maxAnswersChars > 0) {
      const { trimmedAnswers, originalCount, trimmedCount } = trimAccumulatedAnswers(
        options.accumulatedAnswers,
        maxAnswersChars
      );

      if (trimmedCount > 0) {
        accumulatedSection = '\n\n---\n\nPREVIOUSLY ANSWERED QUESTIONS:\n\n';

        if (trimmedCount < originalCount) {
          const omittedCount = originalCount - trimmedCount;
          accumulatedSection += `⚠️ Showing ${trimmedCount} most recent answers (${omittedCount} older answers omitted for space).\n\n`;
          warnings.push(`Trimmed ${omittedCount} older answers to fit character limit`);
        }

        accumulatedSection += 'The following questions were already answered. Do NOT ask these questions again:\n\n';
        Object.entries(trimmedAnswers).forEach(([question, answer]) => {
          accumulatedSection += `Q: ${question}\nA: ${answer}\n\n`;
        });
        accumulatedSection += 'CRITICAL: Do NOT re-ask any of the above questions in your proposals[] array.\n';
      }
    } else {
      warnings.push('No space for accumulated answers - character limit reached');
    }
  }

  // 4. Build final prompt
  let fullPrompt = finalSystemPrompt;

  if (schemaSection) {
    fullPrompt += '\n\n' + schemaSection;
  }

  fullPrompt += '\n\n---\n\nUSER INPUT:\n' + finalUserPrompt;

  if (accumulatedSection) {
    fullPrompt += accumulatedSection;
  }

  // 5. Final safety check
  const analysis = analyzePrompt(systemPrompt, userPrompt, accumulatedSection, schemaSection);

  if (analysis.exceedsLimit) {
    warnings.push(`CRITICAL: Prompt still exceeds limit after trimming (${analysis.totalChars} chars)`);
  }

  return {
    prompt: fullPrompt,
    analysis,
    warnings,
  };
}

/**
 * Calculates available space for canon facts based on prompt overhead
 *
 * CRITICAL: The AI has a HARD 8000 character limit. Anything beyond this is silently truncated.
 * We must calculate overhead (system prompt, user prompt, formatting) and determine how
 * much space is left for canon facts.
 *
 * @param systemPrompt The stage's system instructions
 * @param userPromptBase Base user prompt (without facts)
 * @param options Additional sections that consume space
 * @returns Available character space for facts
 */
export function calculateAvailableFactSpace(
  systemPrompt: string,
  userPromptBase: string,
  options?: {
    accumulatedAnswers?: Record<string, string>;
    npcSchemaGuidance?: string;
    forceIncludeSchema?: boolean;
  }
): {
  availableForFacts: number;
  overhead: number;
  breakdown: {
    systemPrompt: number;
    userPromptBase: number;
    formatting: number;
    accumulatedAnswers: number;
    npcSchema: number;
    total: number;
  };
} {
  const systemChars = systemPrompt.length;
  const userBaseChars = userPromptBase.length;
  const formattingChars = 200; // JSON formatting, separators, etc.

  let accumulatedChars = 0;
  if (options?.accumulatedAnswers) {
    // Estimate accumulated answers section size
    const entries = Object.entries(options.accumulatedAnswers);
    accumulatedChars = Math.min(
      entries.reduce((sum, [q, a]) => sum + q.length + a.length + 50, 0),
      PROMPT_LIMITS.MAX_ACCUMULATED_ANSWERS_CHARS
    ) + 200; // +200 for section headers
  }

  let schemaChars = 0;
  if (options?.npcSchemaGuidance && options.forceIncludeSchema) {
    schemaChars = options.npcSchemaGuidance.length;
  }

  const totalOverhead = systemChars + userBaseChars + formattingChars + accumulatedChars + schemaChars;
  const available = Math.max(0, PROMPT_LIMITS.MAX_PROMPT_CHARS - totalOverhead);

  return {
    availableForFacts: available,
    overhead: totalOverhead,
    breakdown: {
      systemPrompt: systemChars,
      userPromptBase: userBaseChars,
      formatting: formattingChars,
      accumulatedAnswers: accumulatedChars,
      npcSchema: schemaChars,
      total: totalOverhead,
    },
  };
}

/**
 * Formats prompt analysis for logging
 */
export function formatPromptAnalysis(analysis: PromptAnalysis): string {
  const hardLimit = PROMPT_LIMITS.AI_HARD_LIMIT;
  const exceedsHardLimit = analysis.totalChars > hardLimit;

  const lines = [
    exceedsHardLimit
      ? `🚨 CRITICAL: Prompt EXCEEDS AI HARD LIMIT (${analysis.totalChars.toLocaleString()} > ${hardLimit.toLocaleString()}) - AI will truncate!`
      : `📊 Prompt Analysis: ${analysis.message}`,
    `├─ System Prompt: ${analysis.breakdown.systemPrompt.toLocaleString()} chars`,
    `├─ User Prompt: ${analysis.breakdown.userPrompt.toLocaleString()} chars`,
  ];

  if (analysis.breakdown.accumulatedAnswers) {
    lines.push(`├─ Accumulated Answers: ${analysis.breakdown.accumulatedAnswers.toLocaleString()} chars`);
  }

  if (analysis.breakdown.npcSchemaGuidance) {
    lines.push(`├─ NPC Schema Guidance: ${analysis.breakdown.npcSchemaGuidance.toLocaleString()} chars`);
  }

  lines.push(`└─ Total: ${analysis.totalChars.toLocaleString()} chars (${(analysis.totalChars / hardLimit * 100).toFixed(1)}% of AI hard limit: ${hardLimit.toLocaleString()})`);

  if (exceedsHardLimit) {
    const truncated = analysis.totalChars - hardLimit;
    lines.push(`⚠️ WARNING: ${truncated.toLocaleString()} characters will be LOST to AI truncation!`);
  }

  return lines.join('\n');
}
