/**
 * AI Assistant Prompt Builder
 *
 * Generates contextual prompts for the AI Assistant panel based on the
 * current workflow state. Works with any workflow type.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { AiAssistantWorkflowContext, WorkflowType } from '../contexts/AiAssistantContext';

// ─── Quick Action Templates ──────────────────────────────────────────────────

export interface QuickAction {
  label: string;
  description: string;
  icon: string; // emoji for simplicity
  buildPrompt: (ctx: AiAssistantWorkflowContext) => string;
}

const SHARED_ACTIONS: QuickAction[] = [
  {
    label: 'Summarize Current State',
    description: 'Get a summary of everything generated so far',
    icon: '📋',
    buildPrompt: (ctx) =>
      `Here is the current ${ctx.workflowLabel} data so far:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Please provide a concise summary of what has been generated, highlighting any notable features, potential issues, or areas that could be improved.',
  },
  {
    label: 'Check Consistency',
    description: 'Validate internal consistency of the generated content',
    icon: '🔍',
    buildPrompt: (ctx) =>
      `Review the following ${ctx.workflowLabel} data for internal consistency:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Check for:\n' +
      '1. Contradictions between fields\n' +
      '2. Missing required information\n' +
      '3. Values that seem implausible\n' +
      '4. Suggestions for improvement\n\n' +
      'Return your analysis as JSON with: { "issues": [...], "suggestions": [...], "overall_quality": "good|fair|poor" }',
  },
];

const NPC_ACTIONS: QuickAction[] = [
  {
    label: 'Refine Personality',
    description: 'Make personality traits more vivid and distinct',
    icon: '🎭',
    buildPrompt: (ctx) => {
      const data = ctx.currentData;
      return (
        `Here is the current NPC data:\n\n` +
        '```json\n' +
        JSON.stringify(data, null, 2) +
        '\n```\n\n' +
        'Please refine the personality-related fields to make this character more vivid and memorable. ' +
        'Focus on personality_traits, ideals, bonds, flaws, and mannerisms. ' +
        'Keep the core concept but make the details more specific and interesting.\n\n' +
        'Return ONLY the updated fields as a JSON object (not the entire NPC).'
      );
    },
  },
  {
    label: 'Enhance Backstory',
    description: 'Add depth to the character background',
    icon: '📖',
    buildPrompt: (ctx) =>
      `Here is the current NPC data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Enhance the backstory and background-related fields. Add compelling details ' +
      'that connect to the character\'s personality, motivations, and current situation. ' +
      (ctx.factpack && ctx.factpack.facts.length > 0
        ? `\n\nHere are some canon facts to incorporate:\n${ctx.factpack.facts.map((f) => `- ${f.text}`).join('\n')}\n\n`
        : '') +
      'Return ONLY the updated fields as a JSON object.',
  },
  {
    label: 'Adjust Combat Stats',
    description: 'Rebalance combat-related stats and abilities',
    icon: '⚔️',
    buildPrompt: (ctx) =>
      `Here is the current NPC data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Review and adjust the combat-related stats (ability scores, HP, AC, attacks, spells, ' +
      'class features, etc.) for D&D 5e balance. Ensure they are appropriate for the ' +
      'character\'s level and role.\n\n' +
      'Return ONLY the updated combat fields as a JSON object.',
  },
  {
    label: 'Change Background',
    description: 'Switch the character background and update related fields',
    icon: '🔄',
    buildPrompt: (ctx) =>
      `Here is the current NPC data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'I want to change this NPC\'s background. Please suggest 3 alternative backgrounds ' +
      'that would fit this character concept, then provide the updated fields for the ' +
      'first suggestion (including background_feature, proficiencies, and any personality ' +
      'adjustments).\n\n' +
      'Return JSON: { "suggestions": [...], "recommended": { ...updated_fields } }',
  },
];

const LOCATION_ACTIONS: QuickAction[] = [
  {
    label: 'Add Atmosphere',
    description: 'Enrich sensory details and atmosphere',
    icon: '🌫️',
    buildPrompt: (ctx) =>
      `Here is the current location data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Enrich the atmosphere and sensory details for this location. Add vivid descriptions ' +
      'of sights, sounds, smells, and textures that a DM could read aloud.\n\n' +
      'Return ONLY the updated fields as a JSON object.',
  },
  {
    label: 'Add Secret Room',
    description: 'Generate a hidden area or secret passage',
    icon: '🚪',
    buildPrompt: (ctx) =>
      `Here is the current location data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Add a secret room or hidden passage that fits the theme and layout of this location. ' +
      'Include how it\'s discovered, what\'s inside, and any traps or challenges.\n\n' +
      'Return the new space as a JSON object matching the existing space format.',
  },
];

const ENCOUNTER_ACTIONS: QuickAction[] = [
  {
    label: 'Balance Difficulty',
    description: 'Adjust encounter difficulty for a party size/level',
    icon: '⚖️',
    buildPrompt: (ctx) =>
      `Here is the current encounter data:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Review this encounter for difficulty balance. Suggest adjustments to enemy count, ' +
      'CR, or tactical setup to better match a standard party of 4-5 players.\n\n' +
      'Return JSON: { "analysis": "...", "adjustments": { ...updated_fields } }',
  },
];

const WRITING_ACTIONS: QuickAction[] = [
  {
    label: 'Improve Prose',
    description: 'Polish the writing quality and flow',
    icon: '✍️',
    buildPrompt: (ctx) =>
      `Here is the current content:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Improve the prose quality: tighten sentences, vary rhythm, strengthen word choices, ' +
      'and improve flow between sections. Maintain the author\'s voice and intent.\n\n' +
      'Return ONLY the updated text fields as a JSON object.',
  },
  {
    label: 'Expand Section',
    description: 'Add more detail to a specific section',
    icon: '📝',
    buildPrompt: (ctx) =>
      `Here is the current content:\n\n` +
      '```json\n' +
      JSON.stringify(ctx.currentData, null, 2) +
      '\n```\n\n' +
      'Identify the section that would benefit most from expansion and provide a more ' +
      'detailed version. Explain why you chose that section.\n\n' +
      'Return JSON: { "section": "section_name", "reason": "...", "expanded": { ...updated_fields } }',
  },
];

/** Get quick actions appropriate for the current workflow */
export function getQuickActions(workflowType: WorkflowType): QuickAction[] {
  const actions = [...SHARED_ACTIONS];

  switch (workflowType) {
    case 'npc':
      actions.push(...NPC_ACTIONS);
      break;
    case 'location':
      actions.push(...LOCATION_ACTIONS);
      break;
    case 'encounter':
      actions.push(...ENCOUNTER_ACTIONS);
      break;
    case 'nonfiction':
    case 'outline':
    case 'chapter':
    case 'memoir':
    case 'journal_entry':
    case 'other_writing':
    case 'scene':
      actions.push(...WRITING_ACTIONS);
      break;
    case 'monster':
      // Monster shares some NPC combat actions
      actions.push(NPC_ACTIONS[2]); // Adjust Combat Stats
      break;
    case 'item':
      // Items have no special actions yet, just shared
      break;
  }

  return actions;
}

// ─── Free-Form Prompt Builder ────────────────────────────────────────────────

/**
 * Wraps a user's free-form message with workflow context so the AI
 * has enough information to give a useful response.
 */
export function buildContextualPrompt(
  userMessage: string,
  ctx: AiAssistantWorkflowContext
): string {
  const parts: string[] = [];

  // System preamble
  parts.push(
    `You are an AI assistant helping with ${ctx.workflowLabel} in a content creation tool called ContentCraft.`
  );

  if (ctx.currentStage) {
    parts.push(`The user is currently on the "${ctx.currentStage}" stage.`);
  }

  // Current data context (trimmed if too large)
  const dataJson = JSON.stringify(ctx.currentData, null, 2);
  if (dataJson.length <= 8000) {
    parts.push(`\nCurrent ${ctx.workflowType} data:\n\`\`\`json\n${dataJson}\n\`\`\``);
  } else {
    // Provide keys only if data is large
    const keys = Object.keys(ctx.currentData);
    parts.push(
      `\nCurrent data has ${keys.length} top-level fields: ${keys.join(', ')}` +
        `\n(Data too large to include in full — ${dataJson.length} chars)`
    );
  }

  // Schema context
  if (ctx.schema && Object.keys(ctx.schema).length > 0) {
    const schemaJson = JSON.stringify(ctx.schema, null, 2);
    if (schemaJson.length <= 4000) {
      parts.push(`\nRelevant schema:\n\`\`\`json\n${schemaJson}\n\`\`\``);
    }
  }

  // Canon/factpack
  if (ctx.factpack && ctx.factpack.facts.length > 0) {
    const factLines = ctx.factpack.facts
      .slice(0, 30) // Limit to first 30
      .map((f) => `- ${f.text}${f.source ? ` (${f.source})` : ''}`)
      .join('\n');
    parts.push(`\nCanon facts (${ctx.factpack.facts.length} total):\n${factLines}`);
  }

  // Generation config
  if (ctx.generationConfig) {
    const configJson = JSON.stringify(ctx.generationConfig, null, 2);
    if (configJson.length <= 2000) {
      parts.push(`\nGeneration config:\n\`\`\`json\n${configJson}\n\`\`\``);
    }
  }

  // User message
  parts.push(`\n---\nUser request: ${userMessage}`);

  // Output instructions
  parts.push(
    '\n---\nIMPORTANT: If your response includes data changes, return them as a JSON object ' +
      'that can be merged into the existing data. Wrap the JSON in ```json code blocks. ' +
      'Only include the fields you are changing, not the entire object.'
  );

  return parts.join('\n');
}

/**
 * Generates a "copy-ready" prompt for a quick action.
 * User can copy this and paste into any AI chat.
 */
export function buildQuickActionPrompt(
  action: QuickAction,
  ctx: AiAssistantWorkflowContext
): string {
  return action.buildPrompt(ctx);
}

// ─── JSON Extraction ─────────────────────────────────────────────────────────

/**
 * Attempts to extract a JSON object from an AI response.
 * Handles markdown code blocks, mixed prose+JSON, etc.
 */
export function extractJsonFromResponse(text: string): {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
} {
  const cleaned = text.trim();

  // Try to find JSON in code blocks first
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { success: true, data: parsed };
      }
      // If it's an array, wrap it
      if (Array.isArray(parsed)) {
        return { success: true, data: { items: parsed } };
      }
    } catch (e) {
      // Fall through to other methods
    }
  }

  // Try to find raw JSON object (first { to last })
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        return { success: true, data: parsed };
      }
    } catch (e) {
      // Fall through
    }
  }

  // Try parsing the entire response as JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return { success: true, data: Array.isArray(parsed) ? { items: parsed } : parsed };
    }
  } catch {
    // Not valid JSON
  }

  return {
    success: false,
    error: 'Could not extract JSON from the response. Make sure the AI returned a JSON object.',
  };
}

/**
 * Computes a simple diff between old and new data for preview.
 * Returns an array of { path, oldValue, newValue } for changed fields.
 */
export function computeFieldDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  prefix = ''
): Array<{ path: string; oldValue: unknown; newValue: unknown }> {
  const diffs: Array<{ path: string; oldValue: unknown; newValue: unknown }> = [];

  for (const key of Object.keys(newData)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const oldVal = oldData[key];
    const newVal = newData[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ path: fullPath, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}
