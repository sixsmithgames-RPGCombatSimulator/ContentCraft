/**
 * Utility for parsing JSON from AI responses with helpful error messages
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface ParseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: string;
  suggestions?: string[];
  /** Original text that was cleaned/repaired for reference */
  cleanedText?: string;
  /** True if auto-repair was attempted */
  wasRepaired?: boolean;
  /** Human-friendly error category */
  errorCategory?: 'empty' | 'truncated' | 'markdown' | 'quotes' | 'syntax' | 'unknown';
}

/**
 * Clean common AI artifacts from JSON text
 */
function cleanAIArtifacts(text: string): string {
  let cleaned = text.trim();

  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```\s*$/i, '');

  // Remove citation markers like [cite_start], [cite_end], 【cite】, etc.
  cleaned = cleaned.replace(/\[cite_start\]/gi, '');
  cleaned = cleaned.replace(/\[cite_end\]/gi, '');
  cleaned = cleaned.replace(/【\d+†source】/g, '');
  cleaned = cleaned.replace(/\[\d+\]/g, ''); // Remove [1], [2], etc.

  // Remove common AI prefixes
  const prefixes = [
    /^Here's the JSON:/i,
    /^Here is the JSON:/i,
    /^JSON:/i,
    /^Response:/i,
    /^Output:/i,
    /^Result:/i,
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Repair common JSON issues
 */
function repairJSON(jsonText: string): string {
  let repaired = jsonText.trim();

  // Remove any text before the first { or [
  const firstBrace = repaired.indexOf('{');
  const firstBracket = repaired.indexOf('[');
  let startIndex = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex > 0) {
    repaired = repaired.substring(startIndex);
  }

  // Remove any text after the last } or ]
  const lastBrace = repaired.lastIndexOf('}');
  const lastBracket = repaired.lastIndexOf(']');
  const endIndex = Math.max(lastBrace, lastBracket);

  if (endIndex !== -1 && endIndex < repaired.length - 1) {
    repaired = repaired.substring(0, endIndex + 1);
  }

  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Remove comments
  repaired = repaired.replace(/\/\/.*$/gm, '');
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');

  // Fix unescaped quotes in string values
  const stringFields = [
    'text', 'source', 'canonical_name', 'short_summary', 'full_description',
    'description', 'homebrew_type', 'title', 'content', 'question', 'answer',
    'name', 'value', 'message', 'reason', 'suggestion', 'note'
  ];

  for (const field of stringFields) {
    const regex = new RegExp(`"${field}"\\s*:\\s*"`, 'g');
    let match;
    let lastIndex = 0;
    let result = '';

    while ((match = regex.exec(repaired)) !== null) {
      result += repaired.substring(lastIndex, match.index + match[0].length);
      let pos = match.index + match[0].length;
      let stringValue = '';
      let escaped = false;

      while (pos < repaired.length) {
        const char = repaired[pos];

        if (escaped) {
          stringValue += char;
          escaped = false;
        } else if (char === '\\') {
          stringValue += char;
          escaped = true;
        } else if (char === '"') {
          const nextNonSpace = repaired.substring(pos + 1).match(/^\s*([,}\]])/);
          if (nextNonSpace) {
            result += stringValue + '"';
            lastIndex = pos + 1;
            break;
          } else {
            stringValue += '\\"';
          }
        } else {
          stringValue += char;
        }
        pos++;
      }
    }

    result += repaired.substring(lastIndex);
    repaired = result;
  }

  return repaired;
}

/**
 * Extract context around an error position
 */
function getErrorContext(text: string, position: number): string {
  const start = Math.max(0, position - 100);
  const end = Math.min(text.length, position + 100);
  const snippet = text.substring(start, end);
  const relativePos = position - start;

  return `...${snippet}...\n${' '.repeat(relativePos + 3)}^ Error near here`;
}

/**
 * Categorize the error for better UX
 */
function categorizeError(error: Error, originalText: string): ParseResult['errorCategory'] {
  const errorMsg = error.message.toLowerCase();
  
  if (!originalText || originalText.trim().length === 0) return 'empty';
  if (errorMsg.includes('unexpected end') || errorMsg.includes('unterminated')) return 'truncated';
  if (originalText.includes('```')) return 'markdown';
  if (errorMsg.includes('unexpected token') && errorMsg.includes('"')) return 'quotes';
  if (errorMsg.includes('unexpected token') || errorMsg.includes('unexpected character')) return 'syntax';
  return 'unknown';
}

/**
 * Get a short, friendly error title based on category
 */
function getFriendlyErrorTitle(category: ParseResult['errorCategory']): string {
  switch (category) {
    case 'empty': return 'Empty Response';
    case 'truncated': return 'Response Was Cut Off';
    case 'markdown': return 'Remove Code Block Markers';
    case 'quotes': return 'Quote Formatting Issue';
    case 'syntax': return 'JSON Syntax Error';
    default: return 'Invalid JSON Format';
  }
}

/**
 * Get the primary action the user should take
 */
function getPrimaryAction(category: ParseResult['errorCategory']): string {
  switch (category) {
    case 'empty': return 'Please paste the AI\'s response.';
    case 'truncated': return 'The response appears incomplete. Ask the AI to regenerate it.';
    case 'markdown': return 'Remove the ```json and ``` markers from the response.';
    case 'quotes': return 'The AI used quotes in a way that broke the JSON. Ask it to escape quotes properly.';
    case 'syntax': return 'Copy only the JSON portion (starts with { and ends with }).';
    default: return 'Try copying only the JSON part of the response.';
  }
}

/**
 * Generate helpful error message and suggestions
 */
function generateErrorMessage(error: Error, originalText: string, repairedText: string): { error: string; suggestions: string[]; category: ParseResult['errorCategory'] } {
  const category = categorizeError(error, originalText);
  const title = getFriendlyErrorTitle(category);
  const primaryAction = getPrimaryAction(category);
  const suggestions: string[] = [];

  // Add primary action as first suggestion
  suggestions.push(`👉 ${primaryAction}`);

  // Add category-specific additional suggestions
  switch (category) {
    case 'markdown':
      suggestions.push('');
      suggestions.push('The response should look like:');
      suggestions.push('  {');
      suggestions.push('    "name": "...",');
      suggestions.push('    ...');
      suggestions.push('  }');
      suggestions.push('');
      suggestions.push('NOT like:');
      suggestions.push('  ```json');
      suggestions.push('  { ... }');
      suggestions.push('  ```');
      break;
      
    case 'truncated':
      suggestions.push('');
      suggestions.push('Signs the response was cut off:');
      suggestions.push('  • Ends mid-word or mid-sentence');
      suggestions.push('  • Missing closing braces } or brackets ]');
      suggestions.push('  • "Continue" or "..." at the end');
      break;
      
    case 'quotes':
      suggestions.push('');
      suggestions.push('Ask the AI to:');
      suggestions.push('  • Use single quotes in text: \'like this\'');
      suggestions.push('  • Or escape quotes: \\"like this\\"');
      break;
      
    case 'syntax': {
      // Show error location if available
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('position')) {
        const posMatch = errorMsg.match(/position (\d+)/);
        if (posMatch) {
          const position = parseInt(posMatch[1]);
          const context = getErrorContext(repairedText, position);
          suggestions.push('');
          suggestions.push('📍 Error location:');
          suggestions.push(context);
        }
      }
      suggestions.push('');
      suggestions.push('Common fixes:');
      suggestions.push('  • Remove text before the opening {');
      suggestions.push('  • Remove text after the closing }');
      suggestions.push('  • Remove trailing commas before }');
      break;
    }
  }

  // Always add the general tip about validators
  suggestions.push('');
  suggestions.push('💡 Tip: Paste into jsonlint.com to see exactly where the error is.');

  const mainError = `❌ ${title}\n\n${primaryAction}`;

  return { error: mainError, suggestions, category };
}

/**
 * Parse JSON from AI response with helpful error handling
 */
export function parseAIResponse<T = unknown>(text: string): ParseResult<T> {
  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: '❌ Empty Response\n\nNo text was provided.',
      suggestions: ['👉 Paste the AI\'s complete JSON response into the text area.'],
      errorCategory: 'empty',
    };
  }

  // Step 1: Clean AI artifacts
  const cleaned = cleanAIArtifacts(text);

  // Step 2: First attempt - parse as-is
  try {
    const parsed = JSON.parse(cleaned) as T;
    return { success: true, data: parsed };
  } catch {
    // First parse failed - fall back to repair pass
    console.log('First parse attempt failed, attempting repair...');

    // Step 3: Second attempt - repair and parse
    const repaired = repairJSON(cleaned);

    try {
      const parsed = JSON.parse(repaired) as T;
      console.log('✅ Successfully parsed after repair');
      return { success: true, data: parsed, wasRepaired: true, cleanedText: repaired };
    } catch (secondError) {
      // Step 4: Generate helpful error message
      console.error('❌ Parse failed even after repair:', secondError);
      console.error('Original text length:', text.length);
      console.error('Repaired text length:', repaired.length);
      console.error('First 500 chars of repaired:', repaired.substring(0, 500));

      const errorInfo = generateErrorMessage(
        secondError instanceof Error ? secondError : new Error(String(secondError)),
        text,
        repaired
      );

      return {
        success: false,
        error: errorInfo.error,
        errorDetails: `Original: ${text.length} chars → Cleaned: ${repaired.length} chars`,
        suggestions: errorInfo.suggestions,
        cleanedText: repaired,
        wasRepaired: true,
        errorCategory: errorInfo.category,
      };
    }
  }
}

/**
 * Format parse result error for display
 */
export function formatParseError(result: ParseResult): string {
  if (result.success) return '';

  let message = result.error || 'Unknown parsing error';

  if (result.suggestions && result.suggestions.length > 0) {
    message += '\n\n' + result.suggestions.join('\n');
  }

  if (result.errorDetails) {
    message += '\n\n📊 ' + result.errorDetails;
  }

  return message;
}

/**
 * Attempt to auto-clean and return the cleaned text for the user to review
 * Returns null if no cleanup was possible
 */
export function tryAutoClean(text: string): { cleaned: string; changes: string[] } | null {
  if (!text || text.trim().length === 0) return null;

  const changes: string[] = [];
  let cleaned = text;

  // Track original state
  const hadMarkdown = text.includes('```');
  const hadCitations = text.includes('[cite_start]') || text.includes('【');
  const hadPrefixes = /^(Here's the JSON:|Here is the JSON:|JSON:|Response:|Output:|Result:)/im.test(text);

  // Apply cleaning
  cleaned = cleanAIArtifacts(cleaned);
  cleaned = repairJSON(cleaned);

  // Report what was changed
  if (hadMarkdown) changes.push('Removed markdown code blocks (```)'); 
  if (hadCitations) changes.push('Removed AI citation markers');
  if (hadPrefixes) changes.push('Removed AI prefix text');

  // Check if we trimmed content before/after JSON
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace > 0) changes.push('Removed text before opening {');
  if (lastBrace !== -1 && lastBrace < text.length - 5) changes.push('Removed text after closing }');

  // Only return if we made changes
  if (changes.length === 0 && cleaned === text.trim()) return null;

  return { cleaned, changes };
}
