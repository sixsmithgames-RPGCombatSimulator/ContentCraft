/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { ChangeEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import GeneratorPanel, { GenerationConfig } from '../components/generator/GeneratorPanel';
import ResourcesPanel from '../components/generator/ResourcesPanel';
import CopyPasteModal from '../components/generator/CopyPasteModal';
import ReviewAdjustModal from '../components/generator/ReviewAdjustModal';
import CanonDeltaModal from '../components/generator/CanonDeltaModal';
import EditContentModal from '../components/generator/EditContentModal';
import HomebrewEditModal from '../components/generator/HomebrewEditModal';
import SaveContentModal from '../components/generator/SaveContentModal';
import CanonNarrowingModal from '../components/generator/CanonNarrowingModal';
import FactChunkingModal from '../components/generator/FactChunkingModal';
import ResumeProgressModal from '../components/generator/ResumeProgressModal';
import SpaceApprovalModal from '../components/generator/SpaceApprovalModal';
import LiveVisualMapPanel from '../components/generator/LiveVisualMapPanel';
import { AlertTriangle, Zap } from 'lucide-react';
import { parseAIResponse, formatParseError } from '../utils/jsonParser';
import {
  createProgressSession,
  addProgressEntry,
  updateProgressResponse,
  saveProgressToFile,
  type GenerationProgress,
  type StageChunkState,
  type ProgressEntry,
} from '../utils/generationProgress';
import {
  buildSafePrompt,
  formatPromptAnalysis,
  calculateAvailableFactSpace,
  PROMPT_LIMITS,
} from '../utils/promptLimits';
import { NPC_CREATOR_STAGES, STAGE_ROUTER_MAP } from '../config/npcCreatorStages';
import { determineRequiredStages, getRoutingSummary, type StageRoutingDecision } from '../config/npcStageRouter';
import { MONSTER_CREATOR_STAGES } from '../config/monsterCreatorStages';
import { LOCATION_CREATOR_STAGES } from '../config/locationCreatorStages';
import { ENCOUNTER_CREATOR_STAGES } from '../config/encounterCreatorStages';
import { ITEM_CREATOR_STAGES } from '../config/itemCreatorStages';
import { STORY_ARC_CREATOR_STAGES } from '../config/storyArcCreatorStages';
import { getNpcSectionChunks, type NpcSectionChunk } from '../config/npcSectionChunks';
import { validateSpaceGeometry } from '../utils/locationGeometry';
import { validateIncomingLocationSpace } from '../utils/locationSpaceValidation';
import type { LiveMapSpace } from '../types/liveMapTypes';
import { synchronizeReciprocalDoors } from '../utils/doorSync';
import { projectApi, API_BASE_URL } from '../services/api';
import type { Project } from '../types';
import { useAiAssistant } from '../contexts/AiAssistantContext';
import type { WorkflowType } from '../contexts/AiAssistantContext';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;

interface StageContext {
  config: GenerationConfig;
  stageResults: StageResults;
  factpack: Factpack | null;
  chunkInfo?: {
    isChunked: boolean;
    currentChunk: number;
    totalChunks: number;
    chunkLabel: string;
  };
  previousDecisions?: Record<string, string>; // Accumulated answers from previous chunks
  unansweredProposals?: unknown[]; // Proposals from previous chunks that need answering
  npcSectionContext?: {
    isNpcSectionChunking: boolean;
    currentSectionIndex: number;
    currentSection: NpcSectionChunk | null;
    accumulatedSections: JsonRecord;
  };
}

interface CanonEntityClaim {
  text?: string;
}

interface CanonEntity {
  _id: string;
  canonical_name?: string;
  aliases?: string[];
  type?: string;
  region?: string;
  era?: string;
  claims?: CanonEntityClaim[];
  [key: string]: unknown;
}

interface CanonFact {
  chunk_id: string;
  text: string;
  entity_id: string;
  entity_name: string;
  entity_type?: string;
  region?: string;
  era?: string;
  tags?: string[];
}

interface Factpack {
  facts: CanonFact[];
  entities: string[];
  gaps: string[];
}

// Fact Checker structures (typed for proposal mapping)
interface FactCheckAmbiguityOut {
  field_path: string;
  text?: string;
  clarification_needed?: string;
  recommended_revision?: string;
}

interface FactCheckUnassociatedOut {
  field_path: string;
  text?: string;
  reason?: string;
  suggested_action?: 'ask_user' | 'discard' | 'keep';
}

interface FactCheckOutput {
  user_questions?: string[];
  ambiguities?: FactCheckAmbiguityOut[];
  unassociated?: FactCheckUnassociatedOut[];
  revision_prompt?: string;
  conflicts?: unknown[];
  summary?: string;
  proposals?: Proposal[];
}

interface Stage {
  name: string;
  systemPrompt: string;
  buildUserPrompt: (context: StageContext) => string;
}

// Types aligned with CanonDeltaModal's onApprove callback
interface Proposal {
  question: string;
  options?: Array<string | { choice: string; description: string }>;
  rule_impact?: string;
  selected?: string;
  field_path?: string;
  current_value?: string;
  reason?: string;
  clarification_needed?: string;
  recommended_revision?: string;
}

interface Conflict {
  new_claim: string;
  existing_claim: string;
  entity_id: string;
  entity_name: string;
  resolution?: 'keep_old' | 'use_new' | 'merge' | 'skip';
}

type PhysicsIssue = {
  severity?: string;
  description?: string;
  issue_type?: string;
  location?: string;
  suggestion?: string;
  field_path?: string;
  summary?: string;
  details?: string;
  rule_reference?: string;
  suggested_fix?: string;
  current_value?: string;
  resolution?: 'acknowledge' | 'will_fix' | 'ignore';
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toObjectArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const sanitizeProposalsValue = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) return [];

  const cleaned: JsonRecord[] = [];
  for (const item of value) {
    if (item === null || item === undefined) continue;

    if (typeof item === 'string') {
      const q = item.trim();
      if (q.length === 0) continue;
      cleaned.push({ question: q });
      continue;
    }

    if (isRecord(item) && typeof item.question === 'string' && item.question.trim().length > 0) {
      cleaned.push(item);
    }
  }

  return cleaned;
};

const getString = (source: JsonRecord | null | undefined, key: string): string | undefined => {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Merges multiple homebrew chunk results into a single combined result
 */
const mergeHomebrewChunks = (chunks: JsonRecord[]): JsonRecord => {
  const merged: JsonRecord = {
    entries: [],
    races: [],
    classes: [],
    spells: [],
    items: [],
    creatures: [],
    rules: [],
    lore: [],
    backgrounds: [],
    feats: [],
    subraces: [],
    subclasses: [],
    unparsed: [],
    notes: '',
  };

  chunks.forEach((chunk, index) => {
    // Handle newest structure with entities array (AI extraction with claims)
    if (Array.isArray(chunk.entities)) {
      const entities = chunk.entities as Array<{
        type: string;
        canonical_name: string;
        claims?: Array<{ text: string; source: string }>;
        homebrew_metadata?: {
          homebrew_type?: string;
          tags?: string[];
          short_summary?: string;
          full_description?: string;
          assumptions?: string[];
          notes?: string[];
        };
      }>;

      // Convert entities to entries format
      const entries = entities.map(entity => {
        const metadata = entity.homebrew_metadata || {};
        return {
          type: metadata.homebrew_type || entity.type,
          title: entity.canonical_name,
          short_summary: metadata.short_summary || (entity.claims?.[0]?.text || ''),
          long_description: metadata.full_description || (entity.claims?.map(c => c.text).join(' ') || ''),
          tags: metadata.tags || [],
          assumptions: metadata.assumptions || [],
          notes: metadata.notes || [],
          claims: entity.claims || [], // Preserve AI-extracted claims
        };
      });

      // Add all entries to the main entries array
      (merged.entries as unknown[]).push(...entries);

      // Also group by type for backward compatibility
      entries.forEach((entry) => {
        const type = entry.type;
        if (type === 'race') {
          (merged.races as unknown[]).push(entry);
        } else if (type === 'subrace') {
          (merged.subraces as unknown[]).push(entry);
        } else if (type === 'class') {
          (merged.classes as unknown[]).push(entry);
        } else if (type === 'subclass') {
          (merged.subclasses as unknown[]).push(entry);
        } else if (type === 'spell') {
          (merged.spells as unknown[]).push(entry);
        } else if (type === 'item') {
          (merged.items as unknown[]).push(entry);
        } else if (type === 'creature') {
          (merged.creatures as unknown[]).push(entry);
        } else if (type === 'rule') {
          (merged.rules as unknown[]).push(entry);
        } else if (type === 'lore') {
          (merged.lore as unknown[]).push(entry);
        } else if (type === 'background') {
          (merged.backgrounds as unknown[]).push(entry);
        } else if (type === 'feat') {
          (merged.feats as unknown[]).push(entry);
        }
      });
    }
    // Handle new structure with entries array (auto-parser output)
    else if (Array.isArray(chunk.entries)) {
      const entries = chunk.entries as Array<{
        type: string;
        title: string;
        short_summary?: string;
        long_description?: string;
        tags?: string[];
        assumptions?: string[];
        notes?: string[];
        claims?: Array<{ text: string; source: string }>;
      }>;

      // Add all entries to the main entries array
      (merged.entries as unknown[]).push(...entries);

      // Also group by type for backward compatibility
      entries.forEach((entry) => {
        const type = entry.type;
        if (type === 'race') {
          (merged.races as unknown[]).push(entry);
        } else if (type === 'subrace') {
          (merged.subraces as unknown[]).push(entry);
        } else if (type === 'class') {
          (merged.classes as unknown[]).push(entry);
        } else if (type === 'subclass') {
          (merged.subclasses as unknown[]).push(entry);
        } else if (type === 'spell') {
          (merged.spells as unknown[]).push(entry);
        } else if (type === 'item') {
          (merged.items as unknown[]).push(entry);
        } else if (type === 'creature') {
          (merged.creatures as unknown[]).push(entry);
        } else if (type === 'rule') {
          (merged.rules as unknown[]).push(entry);
        } else if (type === 'lore') {
          (merged.lore as unknown[]).push(entry);
        } else if (type === 'background') {
          (merged.backgrounds as unknown[]).push(entry);
        } else if (type === 'feat') {
          (merged.feats as unknown[]).push(entry);
        }
      });
    }

    // Handle old structure with separate arrays (backward compatibility)
    const categories = ['races', 'classes', 'spells', 'items', 'creatures', 'rules', 'lore', 'unparsed'];
    categories.forEach((category) => {
      const chunkData = chunk[category];
      if (Array.isArray(chunkData) && chunkData.length > 0) {
        const existing = merged[category] as unknown[];
        merged[category] = [...existing, ...chunkData];
      }
    });

    // Merge unparsed sections
    if (Array.isArray(chunk.unparsed)) {
      (merged.unparsed as unknown[]).push(...chunk.unparsed);
    }

    // Combine notes
    const chunkNotes = getString(chunk, 'notes');
    if (chunkNotes) {
      merged.notes = (merged.notes as string) + `\n\nChunk ${index + 1}: ${chunkNotes}`;
    }
  });

  // Trim notes
  merged.notes = (merged.notes as string).trim();

  return merged;
};

const matchDeliverable = (value: string | undefined): GenerationConfig['type'] | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes('story arc') || lower.includes('story-arc') || lower.includes('story_arc') || lower.includes('plot arc')) {
    return 'story_arc';
  }
  if (lower.includes('npc') || lower.includes('character')) return 'npc';
  if (lower.includes('monster') || lower.includes('creature')) return 'monster';
  if (lower.includes('encounter') || lower.includes('combat')) return 'encounter';
  if (lower.includes('scene') || lower.includes('narrative')) return 'scene';
  if (lower.includes('item') || lower.includes('artifact') || lower.includes('treasure')) return 'item';
  if (lower.includes('adventure') || lower.includes('quest') || lower.includes('campaign')) return 'adventure';
  if (lower.includes('nonfiction') || lower.includes('non-fiction') || lower.includes('non fiction')) return 'nonfiction';
  return null;
};

const inferDeliverableType = (
  data: JsonRecord,
  fallback: GenerationConfig['type'],
): GenerationConfig['type'] => {
  const direct = matchDeliverable(typeof data.deliverable === 'string' ? data.deliverable : undefined);
  if (direct) return direct;

  const typeHint = matchDeliverable(typeof data.type === 'string' ? data.type : undefined);
  if (typeHint) return typeHint;

  const draft = isRecord(data.draft) ? (data.draft as JsonRecord) : undefined;
  if (draft) {
    const draftDeliverable = matchDeliverable(typeof draft.deliverable === 'string' ? draft.deliverable : undefined);
    if (draftDeliverable) return draftDeliverable;

    if (isRecord(draft.story_arc) || isRecord(draft.storyArc)) return 'story_arc';
    if (isRecord(draft.npc)) return 'npc';
    if (isRecord(draft.monster)) return 'monster';
    if (isRecord(draft.encounter) || isRecord(draft.encounter_details)) return 'encounter';
    if (isRecord(draft.item)) return 'item';
    if (isRecord(draft.scene)) return 'scene';
  }

  if (isRecord(data.story_arc) || isRecord(data.storyArc) || isRecord(data.arc)) return 'story_arc';
  if (isRecord(data.npc)) return 'npc';
  if (isRecord(data.monster)) return 'monster';
  if (isRecord(data.encounter) || isRecord(data.encounter_details)) return 'encounter';
  if (isRecord(data.item)) return 'item';

  return fallback;
};

// Minimal fact for AI - only what's needed
interface MinimalFact {
  text: string;
  source?: string; // entity name for attribution
}

// Helper function to create minimal factpack for AI (strips unnecessary metadata)
// Optionally limits facts to stay under maxChars to avoid exceeding prompt limits
const createMinimalFactpack = (factpack: Factpack | null, maxChars?: number): { facts: MinimalFact[] } => {
  if (!factpack) return { facts: [] };

  const allFacts = factpack.facts.map(fact => ({
    text: fact.text,
    source: fact.entity_name, // Just entity name for attribution
  }));

  // If no limit specified, return all facts
  if (!maxChars) {
    return { facts: allFacts };
  }

  // Limit facts to stay under maxChars
  const limitedFacts: MinimalFact[] = [];
  let currentChars = 0;

  for (const fact of allFacts) {
    const factLength = fact.text.length + (fact.source?.length || 0);
    if (currentChars + factLength > maxChars && limitedFacts.length > 0) {
      // Would exceed limit, stop here
      console.log(`[createMinimalFactpack] Limited to ${limitedFacts.length}/${allFacts.length} facts (${currentChars}/${maxChars} chars)`);
      break;
    }
    limitedFacts.push(fact);
    currentChars += factLength;
  }

  return { facts: limitedFacts };
};

// Helper function to strip unnecessary data from stage outputs before passing to next stage
const stripStageOutput = (stageOutput: JsonRecord): JsonRecord => {
  const cleaned = { ...stageOutput };

  // Remove retrieval_hints - only needed once to fetch facts, wastes tokens after that
  delete cleaned.retrieval_hints;

  // Remove keywords - only needed in keyword_extractor stage
  delete cleaned.keywords;

  return cleaned;
};

/**
 * Extracts space data from a stage chunk result for live map display
 */
const extractSpaceForMap = (chunkResult: JsonRecord): any | null => {
  // Helper to extract all space fields (including visual data)
  const extractFields = (space: Record<string, unknown>) => {
    // Ensure size_ft exists for map compatibility
    let size_ft = space.size_ft;
    if (!size_ft && space.dimensions && typeof space.dimensions === 'object') {
      const dims = space.dimensions as Record<string, unknown>;
      if (dims.width && dims.height) {
        size_ft = { width: dims.width, height: dims.height };
      }
    }

    const position = (
      space.position &&
      typeof space.position === 'object' &&
      typeof (space.position as any).x === 'number' &&
      typeof (space.position as any).y === 'number'
    )
      ? { x: (space.position as any).x, y: (space.position as any).y }
      : undefined;

    return {
      name: String(space.name || 'Unnamed Space'),
      code: typeof space.code === 'string' ? space.code : undefined,
      id: typeof space.id === 'string' ? space.id : undefined,
      position,
      dimensions: space.dimensions, // Keep as-is (object or string)
      size_ft, // Add for map compatibility
      purpose: space.purpose ? String(space.purpose) : undefined,
      function: space.function ? String(space.function) : undefined,
      description: space.description ? String(space.description) : undefined,
      floor: space.floor,
      walls: space.walls,
      doors: space.doors,
      features: space.features,
      lighting: space.lighting,
      ambient_color: space.ambient_color,
      connections: Array.isArray(space.connections)
        ? space.connections.filter((c): c is string => typeof c === 'string')
        : undefined,
      // Shape and space type properties
      shape: space.shape,
      space_type: space.space_type,
      // Stairs properties
      stair_type: space.stair_type,
      z_direction: space.z_direction,
      z_connects_to: space.z_connects_to,
      // L-shape properties
      l_cutout_corner: space.l_cutout_corner,
      // Polygon points (for future use)
      polygon_points: space.polygon_points,
    };
  };

  // Check if there's a 'space' object (single space per chunk)
  if (chunkResult.space && typeof chunkResult.space === 'object') {
    return extractFields(chunkResult.space as Record<string, unknown>);
  }

  // Check if there's a 'spaces' array with at least one space
  if (Array.isArray(chunkResult.spaces) && chunkResult.spaces.length > 0) {
    return extractFields(chunkResult.spaces[0] as Record<string, unknown>);
  }

  // Try to extract from top-level fields (space data directly in chunk result)
  if (chunkResult.name) {
    return extractFields(chunkResult);
  }

  return null;
};

/**
 * Merges multiple stage chunk results into a single combined result
 * Handles different stage types appropriately (e.g., Spaces = collect into array)
 */
const mergeStageChunks = (chunks: JsonRecord[], stageName: string): JsonRecord => {
  if (chunks.length === 0) return {};
  if (chunks.length === 1) return chunks[0];

  // For Spaces stage: collect all generated spaces into a single array
  if (stageName === 'Spaces') {
    const allSpaces: unknown[] = [];
    const firstChunk = chunks[0];

    // Collect all spaces from all chunks
    chunks.forEach(chunk => {
      // Each chunk might have a 'space' object or 'spaces' array
      if (chunk.space && typeof chunk.space === 'object') {
        allSpaces.push(chunk.space);
      } else if (Array.isArray(chunk.spaces)) {
        allSpaces.push(...chunk.spaces);
      }
    });

    console.log(`[mergeStageChunks] Merged ${chunks.length} chunks into ${allSpaces.length} spaces`);

    // Return structure with all spaces plus metadata from first chunk
    return {
      ...firstChunk,
      spaces: allSpaces,
      total_spaces: allSpaces.length,
    };
  }

  // For other stages: merge fields, preferring later chunks for scalars, concatenating arrays
  const merged: JsonRecord = { ...chunks[0] };

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    for (const key in chunk) {
      const value = chunk[key];
      if (Array.isArray(value) && Array.isArray(merged[key])) {
        // Concatenate arrays
        (merged[key] as unknown[]).push(...value);
      } else {
        // Overwrite with latest value
        merged[key] = value;
      }
    }
  }

  return merged;
};

// Helper function to normalize output for final content
const normalizeOutput = (content: JsonRecord, contentType: string): JsonRecord => {
  // Special handling for locations - flatten nested structure
  if (contentType === 'location') {
    return normalizeLocationData(content);
  }

  return {
    ...content,
    deliverable: contentType,
    type: contentType,
    content_type: contentType,
  };
};

/**
 * Normalizes location data by flattening nested stageResults structure
 * Merges location_purpose, location_foundation, location_spaces, location_details into single object
 */
const normalizeLocationData = (stageResults: JsonRecord): JsonRecord => {
  // NOTE: Stage results are stored by stage.name, not stage.id
  // So "Purpose" stage -> stageResults.purpose, "Foundation" -> stageResults.foundation, etc.
  const purpose = isRecord(stageResults.purpose) ? (stageResults.purpose as JsonRecord) : null;
  const foundation = isRecord(stageResults.foundation) ? (stageResults.foundation as JsonRecord) : null;
  const spacesStage = stageResults.spaces;
  const spaces = isRecord(spacesStage) ? (spacesStage as JsonRecord) : null;
  const details = isRecord(stageResults.details) ? (stageResults.details as JsonRecord) : null;
  const accuracy = isRecord(stageResults.accuracy_refinement) ? (stageResults.accuracy_refinement as JsonRecord) : null;

  const extraStageResults: JsonRecord = { ...stageResults };
  delete extraStageResults.purpose;
  delete extraStageResults.foundation;
  delete extraStageResults.spaces;
  delete extraStageResults.details;
  delete extraStageResults.accuracy_refinement;

  // Extract spaces array
  const spacesArray =
    spaces && Array.isArray(spaces.spaces)
      ? (spaces.spaces as unknown[])
      : Array.isArray(spacesStage)
        ? (spacesStage as unknown[])
        : null;

  // Merge all fields into flat structure
  const normalized: JsonRecord = {
    deliverable: 'location',
    type: 'location',
    content_type: 'location',

    // From Purpose stage
    name: (purpose?.name as string | undefined) || (stageResults.name as string | undefined),
    location_type: (purpose?.location_type as string | undefined) || (stageResults.location_type as string | undefined),
    description: (purpose?.description as string | undefined) || (stageResults.description as string | undefined),
    purpose: purpose?.purpose,
    scale: purpose?.scale,
    estimated_spaces: purpose?.estimated_spaces,
    architectural_style:
      (purpose?.architectural_style as string | undefined) || (foundation?.architectural_style as string | undefined),
    setting: purpose?.setting,
    key_features: purpose?.key_features,

    // From Foundation stage
    total_floors: foundation?.total_floors,
    total_area: foundation?.total_area,
    layout: foundation?.layout,
    spatial_organization: foundation?.spatial_organization,
    primary_materials: foundation?.primary_materials,
    defensive_features: foundation?.defensive_features,
    access_points: foundation?.access_points,

    // From Spaces stage
    spaces: spacesArray,
    total_spaces:
      spaces && typeof spaces.total_spaces === 'number'
        ? spaces.total_spaces
        : Array.isArray(spacesArray)
          ? spacesArray.length
          : null,

    // From Details stage
    atmosphere: details?.atmosphere,
    sensory_details: details?.sensory_details,
    npcs: details?.npcs,
    encounters: details?.encounters,
    treasure: details?.treasure,
    secrets: details?.secrets,
    hooks: details?.hooks,
    history: details?.history,

    // From Accuracy stage (if present)
    accuracy_report: accuracy?.accuracy_report,
    refined_spaces: accuracy?.refined_spaces,
    refined_details: accuracy?.refined_details,
    gm_notes: accuracy?.gm_notes,
    tactical_summary: accuracy?.tactical_summary,

    // Preserve any additional fields
    ...extraStageResults,
  };

  return normalized;
};

const NONFICTION_BOOK_STAGES: Stage[] = [
  {
    name: 'Purpose',
    systemPrompt: `You are the Purpose Analyzer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to analyze the user's request and determine the PURPOSE and CONSTRAINTS for writing a non-fiction book.

IMPORTANT: Audiobooks are structured differently than print books.
- Print books: chapters/sections, headings, visuals/figures (if any), references/endnotes.
- Audiobooks: spoken flow, narration-friendly language, avoidance of heavy visual references, and segment-based structure.

Output a JSON object with:
- deliverable: "nonfiction"
- keywords: string[] (5-15 significant nouns/proper nouns/key concepts for canon/library search)
- medium: "print" | "audiobook" | "both" (infer; if truly ambiguous, create a proposal)
- audience: who this is for
- goal: what the reader should achieve
- key_topics: array of major topics
- tone: descriptive tone guidance (e.g., "authoritative but warm")
- detail_level: "brief" | "standard" | "detailed" | "comprehensive"
- special_requirements: array of constraints
- proposals: array of questions only if needed

If the request implies an audiobook (e.g., "for listening", "narration", "audio"), set medium="audiobook".
If it implies a printed book (e.g., "print", "illustrations", "figures", "footnotes"), set medium="print".
If it implies both or a repurposable manuscript, set medium="both".`,
    buildUserPrompt: (context) => JSON.stringify({
      user_request: context.config.prompt,
      type: context.config.type,
      flags: context.config.flags,
    }, null, 2),
  },
  {
    name: 'Outline & Structure',
    systemPrompt: `You are the Outliner for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to produce a clear, usable outline and structure that matches the user's request and the Purpose stage decisions.

Output a JSON with:
- deliverable: "nonfiction"
- working_title: string
- subtitle: string (optional)
- medium: "print" | "audiobook" | "both" (from Purpose)
- thesis: the core promise/idea in 1-2 sentences
- audience: from Purpose
- voice: guidance for the writing voice
- structure:
  - if medium includes print: parts/chapters with titles and bullet-point key_takeaways
  - if medium includes audiobook: episodes/segments with titles and listener_takeaways
- retrieval_hints: { keywords: [], entities: [], regions: [], eras: [] } (use keywords for concepts/sources to find)
- proposals: questions only for missing requirements that materially affect the structure

Use relevant_canon as a reference pool for existing facts; do not invent citations you don't have.`,
    buildUserPrompt: (context) => {
      const userPrompt: any = {
        prompt: context.config.prompt,
        type: context.config.type,
        flags: context.config.flags,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        relevant_canon: createMinimalFactpack(context.factpack),
      };

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Draft',
    systemPrompt: `You are the Writer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to create a reader-facing draft that matches the Outline & Structure and the medium selected in the Purpose stage.

CRITICAL:
- If medium includes audiobook: write in a narration-friendly style (spoken language, fewer visual-only references).
- If medium includes print: you may include references to figures/tables, but keep them optional.

Output JSON with:
- deliverable: "nonfiction"
- title: string
- subtitle: string (optional)
- medium: "print" | "audiobook" | "both"
- table_of_contents: array of chapter/segment titles
- chapters: array of { title: string, summary: string, key_points: string[], draft_text: string }
- formatted_manuscript: string (human-readable manuscript with headings; this will be shown to the user)
- sources_used: string[] (if you used canon facts)
- assumptions: string[]
- proposals: array of unresolved questions
- canon_update: string

Use canon_reference if provided; otherwise use relevant_canon. Do NOT fabricate sources.`,
    buildUserPrompt: (context) => {
      const userPrompt: any = {
        original_user_request: context.config.prompt,
        type: context.config.type,
        flags: context.config.flags,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
      };

      if (context.stageResults['outline_&_structure']) {
        userPrompt.canon_reference = `Relevant canon facts were already provided earlier in this conversation. Review them if needed.`;
      } else {
        userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
      }

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Editor & Style',
    systemPrompt: `You are the Editor for non-fiction book generation.

Evaluate the Draft against the Relevant Canon/Library facts and identify what needs to be clarified or revised.

CRITICAL TASKS:
1. Conflicts: cite any draft claims that contradict provided facts.
2. Ambiguities: list vague statements needing clarification.
3. Unassociated: flag claims that need sourcing or are unsupported by provided facts.
4. Revision Prompt: craft a JSON-safe string instructing the Writer what to revise.
5. User Questions: gather concrete questions for each ask_user item.
6. Summary: short recap.

Output STRICT JSON:
{
  "conflicts": [...],
  "ambiguities": [...],
  "unassociated": [...],
  "revision_prompt": string,
  "user_questions": string[],
  "summary": string
}

Do NOT rewrite the manuscript here; only analyze and provide actionable guidance.`,
    buildUserPrompt: (context) => {
      const draft = stripStageOutput(context.stageResults.draft as JsonRecord);
      const userPrompt: any = {
        draft,
        deliverable: context.config.type,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
        relevant_canon: createMinimalFactpack(context.factpack, 6000),
      };

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Finalizer',
    systemPrompt: `You are the Finalizer for non-fiction book generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO tables. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to incorporate the Editor findings and the user's clarifications, and produce the final manuscript output.

CRITICAL RULES:
1. Do NOT add, remove, or change factual claims.
2. Incorporate clarifications from the Editor report and the user's previous_decisions.
3. Ensure the output remains usable for the selected medium:
   - Print: clean headings, chapter structure, optional callouts.
   - Audiobook: narration-friendly phrasing, avoid heavy visual-only references.
4. Ensure formatted_manuscript is human-readable and complete.
5. Preserve sources_used, assumptions, proposals, and canon_update fields.

Output JSON matching the Draft stage structure, with final prose and formatting.`,
    buildUserPrompt: (context) => {
      const fullDraft = stripStageOutput(context.stageResults.draft as JsonRecord);
      const fullEditor = stripStageOutput(context.stageResults['editor_&_style'] as JsonRecord);

      const userPrompt: any = {
        draft: fullDraft,
        editor_report: fullEditor,
        deliverable_type: context.config.type,
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
        outline: context.stageResults['outline_&_structure'] ? stripStageOutput(context.stageResults['outline_&_structure'] as JsonRecord) : undefined,
      };

      if (context.stageResults['outline_&_structure']) {
        userPrompt.canon_reference = `Relevant facts were provided earlier in this conversation. Review them if needed.`;
      } else {
        userPrompt.relevant_canon = createMinimalFactpack(context.factpack, 6000);
      }

      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
];

const GENERIC_STAGES: Stage[] = [
  {
    name: 'Purpose',
    systemPrompt: `You are the Purpose Analyzer for content generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.

Your job is to analyze the user's request and determine the PURPOSE and CONSTRAINTS for generation.

Output a JSON with:
- content_type: "npc" | "location" | "item" | "encounter" | "adventure" | "scene" | "organization" | "other"
- generation_mode: "mechanical" (stat block/rules) | "narrative" (story/description) | "hybrid" (both)
- game_system: "D&D 5e" | "Pathfinder" | "system-agnostic" | "other" (extract from user prompt or infer)
- detail_level: "brief" | "standard" | "detailed" | "comprehensive"
- special_requirements: array of special constraints (e.g., ["homebrew allowed", "must have stat block", "narrative focus", "specific race", "specific class"])
- interpretation: brief explanation of what you understand the user wants

Examples:
- User: "Create a level 9 vampire NPC" → game_system: "D&D 5e", generation_mode: "mechanical"
- User: "Describe an ancient elven queen" → game_system: "system-agnostic", generation_mode: "narrative"
- User: "A haunted tavern for my campaign" → content_type: "location", generation_mode: "hybrid"`,
    buildUserPrompt: (context) => JSON.stringify({
      user_request: context.config.prompt,
      flags: context.config.flags,
    }, null, 2),
  },
  {
    name: 'Keyword Extractor',
    systemPrompt: `You are a Keyword Extraction specialist.
Your ONLY job is to identify significant keywords from the user's prompt that should be used to search the canon database.

CRITICAL RULES:
1. Extract ONLY significant nouns, proper nouns, and key concepts
2. EXCLUDE common words: and, is, they, that, what, are, the, a, an, in, on, at, to, for, of, with, by, from, etc.
3. Include: character names, location names, item names, ability/power names, entity types, regions, eras, events
4. If a multi-word phrase is clearly a proper noun or title, keep it together (e.g., "Night City", "Corporate Tower", "Vault of Secrets")
5. Return 5-15 keywords maximum - be selective and relevant

TAKE YOUR TIME. Read the prompt carefully. Think about what concepts are mentioned that would exist in the setting's canon database.

Output ONLY valid JSON with this structure:
{
  "keywords": ["keyword1", "keyword2", ...]
}`,
    buildUserPrompt: (context) => JSON.stringify({
      user_prompt: context.config.prompt,
    }, null, 2),
  },
  {
    name: 'Planner',
    systemPrompt: `You are the Planner for game content generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks (no \`\`\`json). NO explanations. NO tables. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.

⚠️ CRITICAL: CHARACTER IDENTITY ⚠️
The user prompt specifies the EXACT character/content to create (e.g., "Goran Varus").
Canon facts are PROVIDED FOR REFERENCE to inform the design - they describe the world, setting, and related entities.
DO NOT substitute or confuse the requested character with other characters mentioned in canon.
Example: If user requests "Goran Varus" and canon mentions "Sir Darris Gorran", you are creating GORAN VARUS (not Sir Darris Gorran).
Your proposals should be about the REQUESTED character only, using their name from the prompt.

⚠️ CRITICAL: NEVER REPEAT QUESTIONS ⚠️
If the user input includes a "previous_decisions" object, those topics have ALREADY been decided.
DO NOT create proposals for ANY topic mentioned in previous_decisions.
DO NOT ask about topics that are semantically similar to previously decided topics.
Asking duplicate questions wastes the user's time and will be considered a critical failure.

Analyze the user prompt and produce a Design Brief JSON with:
- deliverable: type of content ("scene"|"encounter"|"npc"|"item"|"adventure")
- story_clock: narrative timing/urgency (optional)
- threads: story threads to weave in (optional)
- retrieval_hints: { entities: [], regions: [], eras: [], keywords: [] }
- proposals: array of questions/choices for the user
- allow_invention: from flags
- rule_base: from flags
- tone: from flags
- mode: from flags ("GM"|"player")
- difficulty: from flags
- realism: from flags

CRITICAL INSTRUCTIONS FOR ACCURACY:
1. READ ALL provided canon facts THOROUGHLY - do not skip or skim
2. Do NOT invent ANY facts that are not in the Relevant Canon provided
3. If canon mentions a location, character, or item - USE IT EXACTLY as described
4. If information is not in the canon - note it in retrieval_hints, do NOT make it up
5. Be 100% ACCURATE and 100% PRECISE with canon facts
6. Take your time - accuracy is more important than speed

CANON FACTS ARE YOUR DEFAULTS:
7. If canon provides a fact (e.g., "Androids have INT 16"), USE IT as the default value
8. DO NOT ask about information that canon explicitly provides unless there's genuine ambiguity
9. Example: If canon says "Int 16", set Int 16. Don't ask "should it be 16, 18, or 20?"
10. Example: If canon describes a power's mechanics (e.g., "Cyber-reflex at rank 3 grants +2 AC"), USE those exact mechanics

PROPOSALS - ONLY FOR TRUE AMBIGUITY:
11. ONLY create proposals[] for:
    - Information NOT in canon (custom items, specific tactics, narrative choices)
    - Genuine ambiguity where canon has conflicting information
    - Design choices where multiple valid interpretations exist
    - Information the user didn't specify (e.g., what effect does "sleep arrow" cause?)
12. DO NOT create proposals for information canon explicitly provides
13. DO NOT create proposals for basic stat calculations you can do yourself

The Relevant Canon below contains ALL facts from the database that relate to the keywords in this request.
If you need a fact and it's not listed - it does not exist in canon yet.

Choose conservative defaults. Output ONLY valid JSON.`,
    buildUserPrompt: (context) => {
      // For chunk 1 with large prompts, truncate to fit since detailed prompts are less critical in intro chunks
      let promptToUse = context.config.prompt;
      let flagsToUse = context.config.flags;

      if (context.chunkInfo?.currentChunk === 1) {
        // Truncate prompt if too large
        if (promptToUse && promptToUse.length > 1500) {
          console.log(`[Planner Chunk 1] Truncating prompt from ${promptToUse.length} to 1500 chars`);
          promptToUse = promptToUse.substring(0, 1500) + '\n\n[... remainder in subsequent chunks ...]';
        }

        // Simplify flags for chunk 1 if they're huge
        const flagsJson = JSON.stringify(flagsToUse);
        if (flagsJson.length > 500) {
          console.log(`[Planner Chunk 1] Simplifying flags from ${flagsJson.length} to minimal set`);
          flagsToUse = {
            allow_invention: flagsToUse?.allow_invention,
            rule_base: flagsToUse?.rule_base,
            mode: flagsToUse?.mode,
            tone: flagsToUse?.tone || 'balanced',
            difficulty: flagsToUse?.difficulty || 'standard',
            realism: flagsToUse?.realism || 'cinematic',
          };
        }
      }

      const userPrompt: any = {
        prompt: promptToUse,
        type: context.config.type,
        flags: flagsToUse,
        relevant_canon: createMinimalFactpack(context.factpack),
      };

      // Add chunk information if this is a multi-part generation
      if (context.chunkInfo?.isChunked) {
        const isFirstChunk = context.chunkInfo.currentChunk === 1;
        const isLastChunk = context.chunkInfo.currentChunk === context.chunkInfo.totalChunks;

        userPrompt.chunk_info = {
          message: isLastChunk
            ? `⚠️ FINAL CHUNK (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}): All canon has been provided. This is your last chance to refine.`
            : `📦 CHUNK ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}): More canon will come in subsequent parts.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
          data_status: isFirstChunk
            ? "Initial draft - no previous corrections"
            : "⚠️ UPDATED WITH CORRECTIONS from previous chunk(s). This incorporates your latest decisions and refinements.",
        };
      }

      // Include unanswered proposals from previous chunk for AI to attempt answering
      if (context.unansweredProposals && context.unansweredProposals.length > 0) {
        userPrompt.unanswered_questions_from_previous_chunk = context.unansweredProposals;
        userPrompt.ANSWER_QUESTIONS_INSTRUCTION = `⚠️ CRITICAL: The above unanswered_questions_from_previous_chunk contains ${context.unansweredProposals.length} questions from the previous chunk that you could not answer with those facts. NOW, with the NEW facts in relevant_canon, ATTEMPT TO ANSWER these questions. If you can definitively answer a question using the new facts, DO NOT include it in your proposals[] array. ONLY include questions in proposals[] that you STILL cannot answer with the combined facts from all chunks so far. This reduces the burden on the user.`;
      }

      // Include previous decisions to avoid asking the same questions again
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ FORBIDDEN: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} decisions already made in previous chunks or stages. You MUST NOT create proposals[] entries for these topics. You MUST NOT ask similar or related questions. Repeating questions is a critical error.`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Creator',
    systemPrompt: `You are the Creator for D&D content generation.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.

Output STRICTLY valid JSON matching the requested schema.

⚠️ MOST CRITICAL: IDENTITY & PURPOSE ⚠️
The original_user_request field contains the EXACT character/content to create (e.g., "Captain Sarah Chen, a cyberpunk netrunner...").
This is THE PRIMARY SOURCE OF TRUTH about what to create.
Canon facts are PROVIDED FOR REFERENCE to inform design - they describe the world, setting, mechanics, and related entities.
DO NOT substitute or confuse the requested subject with other subjects mentioned in canon facts.
Example: If original_user_request says "Goran Varus" and canon mentions "Sir Darris Gorran", you MUST create GORAN VARUS (not Sir Darris Gorran).
Read the original_user_request FIRST before looking at canon facts.
Use the EXACT name, level/rank, class/role, species/race, and details from original_user_request.
Adapt your output format based on the PURPOSE stage results (mechanical stat block vs narrative description vs hybrid).

⚠️ CRITICAL: NEVER REPEAT QUESTIONS ⚠️
If the user input includes a "previous_decisions" object, those topics have ALREADY been decided in a previous stage.
DO NOT create proposals[] for ANY topic mentioned in previous_decisions.
DO NOT ask questions that are semantically similar to previously decided topics.
USE the decisions from previous_decisions directly in your output.
Asking duplicate questions wastes the user's time and will be considered a critical failure.

CRITICAL RULES FOR ACCURACY AND THOROUGHNESS:
1. READ EVERY SINGLE FACT in the Relevant Canon below - do NOT skip any
2. Use ONLY facts from the Relevant Canon provided - NEVER invent new facts
3. Every claim you make MUST be traceable to a chunk_id in sources_used[]
4. Be 100% ACCURATE - verify each fact against the Relevant Canon
5. Be 100% PRECISE - use exact names, descriptions, and details from canon
6. TAKE YOUR TIME - accuracy is more important than speed
7. If a location, NPC, item, or creature is mentioned in canon - USE ONLY that information
8. If something is NOT in the Relevant Canon - add it to proposals[], do NOT make it up

USE CANON AS FOUNDATION - DO NOT ASK ABOUT WHAT CANON PROVIDES:
9. If canon explicitly states values (e.g., "Androids have STR 10, DEX 16, CON 14..."), USE them in the output
10. If canon describes mechanics (e.g., "Cyber-reflex at rank 3: +2 AC, advantage on initiative"), implement EXACTLY as described
11. If canon lists features/abilities (e.g., "Telepaths gain Mind Link ability"), include them in the appropriate section
12. DO NOT ask about information canon provides - just use it (e.g., if canon says "INT 16", set INT 16)
13. DO NOT ask about abilities/powers that canon fully describes - just implement them
14. Examples of what NOT to propose:
    - "What are the base ability scores?" (if canon provides this for the race/species/template)
    - "What does [ability name] do at level X?" (if canon describes this)
    - "Does [character type] have [common ability]?" (if canon lists standard abilities)

PROPOSALS - ONLY FOR GENUINE UNKNOWNS:
15. ONLY create proposals[] for:
    - Information NOT in canon (custom items the user mentioned, specific tactics, narrative details)
    - Genuine ambiguity where canon has multiple conflicting interpretations
    - Details user mentioned but didn't specify (e.g., "sleep arrow" - what's the effect?)
    - Creative choices beyond canon (personality details, specific motivations)
16. DO NOT propose for:
    - Stats/mechanics canon explicitly provides
    - Powers/abilities canon fully describes
    - Calculations you can do (HP from hit dice, proficiency bonus from level)

Required fields in ALL outputs:
- rule_base: the rule base being used
- sources_used: array of chunk_ids
- assumptions: array of reasonable assumptions made
- proposals: array of questions for unknowns (USE THIS LIBERALLY!)
- retrieval_hints: optional { entities[], regions[], eras[], keywords[] } if you need more canon
- canon_update: one-line summary of canon changes

ADAPT OUTPUT BASED ON GENERATION MODE (from PURPOSE stage):
- If generation_mode is "mechanical": Include complete mechanical data (stat blocks, rules mechanics, numerical values)
  - For NPCs: ability scores, armor class, hit points, speed, proficiency/skill bonuses, saving throws, senses
  - For NPCs: class/career levels, features, actions, bonus actions, reactions, legendary/mythic/lair actions if applicable
  - For NPCs: weapon/attack options with damage, equipment, spellcasting details (if applicable)
- If generation_mode is "narrative": Focus on descriptive content (appearance, personality, background, motivations, relationships)
  - For NPCs: physical description, personality traits, background story, goals, fears, relationships, distinctive features
  - Include special abilities/powers as prose descriptions rather than mechanical stat blocks
- If generation_mode is "hybrid": Include BOTH mechanical stats AND narrative descriptions
- Always adapt terminology to the game_system (e.g., D&D uses "class levels", Cyberpunk uses "roles", generic uses "archetype")

CRITICAL MULTICLASS/TEMPLATE LEVELING RULES (for game systems that use them):
- When a prompt says "level X [template] (previous level Y [class])", interpret this as [Template] level X (NOT total level X)
- Example: "level 9 vampire (previous level 5 fighter)" = Fighter 5 / Vampire 9 (total level 14)
- Example: "level 3 lycanthrope (previous level 8 ranger)" = Ranger 8 / Lycanthrope 3 (total level 11)
- Characters RETAIN their class/career levels from before gaining the template and ADD template levels
- Each special ability description may specify the template level required (e.g., "At 9th level...")
- Use the template level (not total level) to determine which special abilities are available

CRITICAL SPECIAL ABILITIES RULES (for characters with unique powers):
- If the prompt lists specific abilities (e.g., "celerity, misty escape, shape changer"), you MUST include ALL of them
- For EACH ability mentioned, find the corresponding canon fact and include the FULL description based on the character's level/rank
- Example: "Celerity" at level 9 should include the 9th level upgrades if canon describes them
- Do NOT omit any powers, weaknesses, or abilities listed in the prompt
- If the prompt says "5 powers beyond base traits", count them and ensure all 5 are present
- Include abilities in appropriate sections based on generation_mode:
  - Mechanical: traits[], actions[], bonus_actions[], reactions[], weaknesses[]
  - Narrative: special_abilities[], distinctive_traits[], vulnerabilities[]
  - Hybrid: both formats

For any missing or uncertain data, add a proposals[] entry with options.

The Relevant Canon below is filtered to only include facts related to this request.
If you need information and it's not here - it doesn't exist in canon yet.

Output ONLY valid JSON. No prose, no explanations outside the JSON structure.`,
    buildUserPrompt: (context) => {
      const userPrompt: any = {
        original_user_request: context.config.prompt,  // CRITICAL: Include original prompt so AI knows what to create
        type: context.config.type,
        brief: stripStageOutput(context.stageResults.planner as JsonRecord),
        flags: context.config.flags,
        // Include Purpose stage results for format adaptation
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
      };

      // NPC SECTION-BASED CHUNKING: Inject section-specific instructions
      if (context.npcSectionContext?.isNpcSectionChunking && context.npcSectionContext.currentSection) {
        const section = context.npcSectionContext.currentSection;
        const sectionIndex = context.npcSectionContext.currentSectionIndex;
        const accumulated = context.npcSectionContext.accumulatedSections;

        userPrompt.NPC_SECTION_INSTRUCTIONS = section.instructions;
        userPrompt.SECTION_NUMBER = `Section ${sectionIndex + 1} of ${context.chunkInfo?.totalChunks || 1}`;
        userPrompt.SECTION_NAME = section.chunkLabel;

        // Include accumulated sections from previous chunks for context
        if (section.includePreviousSections && Object.keys(accumulated).length > 0) {
          userPrompt.previous_sections = accumulated;
          userPrompt.SECTION_BUILD_INSTRUCTION = `⚠️ CRITICAL: The previous_sections field contains the NPC data created in earlier sections. Build upon this foundation. DO NOT re-output these fields - only output the NEW fields for this section (${section.outputFields.join(', ')}). The system will merge them automatically.`;
        }

        console.log(`[NPC Section Chunking] Injecting instructions for section: ${section.chunkLabel}`);
      }

      // OPTIMIZATION: Don't resend canon if Planner already provided it in same AI session
      // In copy-paste workflow, all prompts go to SAME AI chat session, so AI remembers previous canon
      if (context.stageResults.planner) {
        // Planner already ran and provided canon facts
        // Reference them instead of resending (saves token usage, stays within limits)
        userPrompt.canon_reference = `⚠️ CRITICAL: Canon facts were already provided in the Planner stage above in this conversation. REVIEW those facts from your conversation history. Use them to inform your creation. If you need ADDITIONAL canon not already provided, indicate that in your retrieval_hints[] field.`;
      } else {
        // No Planner results yet, send all facts
        userPrompt.relevant_canon = createMinimalFactpack(context.factpack);
      }

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        const isFirstChunk = context.chunkInfo.currentChunk === 1;
        const isLastChunk = context.chunkInfo.currentChunk === context.chunkInfo.totalChunks;

        userPrompt.chunk_info = {
          message: isLastChunk
            ? `⚠️ FINAL CHUNK (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}): All canon provided. Finalize your work.`
            : `📦 CHUNK ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}): More canon coming in next chunk.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
          data_status: isFirstChunk
            ? "Initial creation - working from Design Brief"
            : "⚠️ UPDATED CONTENT from previous chunk(s). The 'brief' field contains your latest corrections and decisions. Build upon this updated version, don't revert to original.",
        };
      }

      // Include unanswered proposals from previous chunk for AI to attempt answering
      if (context.unansweredProposals && context.unansweredProposals.length > 0) {
        userPrompt.unanswered_questions_from_previous_chunk = context.unansweredProposals;
        userPrompt.ANSWER_QUESTIONS_INSTRUCTION = `⚠️ CRITICAL: The above unanswered_questions_from_previous_chunk contains ${context.unansweredProposals.length} questions from the previous chunk that could not be answered with those facts. NOW, with the NEW facts in relevant_canon, ATTEMPT TO ANSWER these questions. If you can definitively answer a question using the new facts, DO NOT include it in your proposals[] array. ONLY include questions in proposals[] that you STILL cannot answer with the combined facts from all chunks so far. This reduces the burden on the user.`;
      }

      // Include previous decisions
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ MANDATORY: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} decisions already made by the user. You MUST:
1. INCORPORATE these decisions into your stat block/content (e.g., if user answered "AC 19", set armor_class: 19)
2. UPDATE relevant fields based on these answers (e.g., if user chose "Option B: Blueblood Charm", include that ability)
3. NOT create proposals[] entries for ANY of these topics
4. NOT ask similar or related questions
Failing to incorporate user decisions is a critical error - the user already answered these questions!`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Fact Checker',
    systemPrompt: `You are the Canon Fact Checker for game content generation.
Evaluate the Creator draft against the Relevant Canon facts.

CRITICAL TASKS:
1. Conflicts: cite any draft claims that contradict canon. Provide field_path, summary, details, severity (critical|major|minor), chunk_id, canon_fact, suggested_fix.
2. Ambiguities: list vague statements needing clarification with field_path, text, clarification_needed, recommended_revision.
3. Unassociated: flag claims lacking canon support with field_path, text, reason, suggested_action (ask_user|discard|keep).
4. Revision Prompt: craft a JSON-safe string instructing the Authoring AI to resolve conflicts, harden ambiguous text, and consult the user on unassociated content.
5. User Questions: gather concrete questions for each "ask_user" item.
6. Summary: short recap of counts and critical findings.

Output STRICT JSON:
{
  "conflicts": [...],
  "ambiguities": [...],
  "unassociated": [...],
  "revision_prompt": string,
  "user_questions": string[],
  "summary": string
}`,
    buildUserPrompt: (context) => {
      // Get full draft
      const fullDraft = stripStageOutput(context.stageResults.creator as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let draftToUse = fullDraft;
      if (context.chunkInfo?.currentChunk === 1) {
        const draftJson = JSON.stringify(fullDraft);
        if (draftJson.length > 5000) {
          console.log(`[Fact Checker Chunk 1] Draft is large (${draftJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          draftToUse = {
            name: fullDraft.name,
            type: context.config.type,
            schema_version: fullDraft.schema_version,
            challenge_rating: fullDraft.challenge_rating,
            _summary: `[Large draft - ${draftJson.length} chars. Full fact-checking in chunk 2. For now, minimal validation only.]`,
            _field_count: Object.keys(fullDraft).length,
          };
        }
      }

      const userPrompt: any = {
        draft: draftToUse,
        deliverable: context.config.type,
        flags: context.config.flags,
      };

      // Reference canon from Planner stage instead of resending
      if (context.stageResults.planner) {
        userPrompt.canon_reference = `⚠️ Canon facts were already provided in the Planner stage earlier in this conversation. Review those facts to validate the draft.`;
      } else {
        userPrompt.relevant_canon = createMinimalFactpack(context.factpack, 6000);
      }

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full draft will be provided in next chunk for detailed fact-checking.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full draft provided. Perform thorough fact-checking now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      // Include previous decisions for context
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.note = "Previous decisions were already made. Do NOT flag these as issues.";
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Stylist',
    systemPrompt: `You are the Stylist for game content generation.
Your job is to improve prose, apply tone, AND normalize the JSON structure to match our standard schema.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output ONLY valid JSON. NO markdown code blocks. NO explanations. NO tables. NO prose.
Start your response with { and end with }. Nothing before or after.
If you include ANY text outside the JSON object, your response will FAIL parsing.

CRITICAL RULES FOR ACCURACY:
1. Do NOT add, remove, or change ANY facts
2. Do NOT modify sources_used, assumptions, proposals, retrieval_hints, or canon_update
3. Apply the specified tone to narrative/description fields only
4. Integrate clarifications from the Fact Check report without introducing new facts
5. If mode="player", remove GM-only information (secrets, hidden DCs) from narration fields ONLY
6. Improve readability and flow of descriptions while preserving meaning
7. TAKE YOUR TIME - read carefully to ensure no facts are altered

PROPOSALS - CRITICAL FORMAT REQUIREMENTS:
8. Copy existing proposals[] EXACTLY as-is - do NOT modify them
9. If adding NEW proposals, they MUST use this EXACT format:
   {
     "question": "Clear question asking the user to decide something",
     "options": ["Option 1", "Option 2", "Option 3"],
     "rule_impact": "How this choice affects game balance or rules"
   }
10. NEVER create proposals with fields like "summary", "details", or "suggested_action"
11. NEVER document resolved conflicts or changes in proposals[] - those go in validation_notes
12. ONLY add proposals for UNRESOLVED questions that need user input
13. If you fix an issue, document it in validation_notes, NOT in proposals[]

NORMALIZATION - CRITICAL FOR ALL CONTENT TYPES:
11. Transform the draft JSON to match the normalized schema below based on deliverable type
12. ADAPT field names and structure based on the game_system and generation_mode from the Purpose stage:
    - For D&D/Pathfinder: use fields like "armor_class", "challenge_rating", "proficiency_bonus", "saving_throws"
    - For Cyberpunk/sci-fi: use fields like "armor_rating", "threat_level", "skill_bonuses", "resistances"
    - For narrative-only (generation_mode: "narrative"): OMIT mechanical fields, focus on description/personality/background
    - For system-agnostic: use generic field names like "defense", "difficulty", "bonuses"
13. Map all fields intelligently (e.g., physical_appearance → appearance, saving_throws → saving_throws array, etc.)
14. Ensure ALL data from the draft is preserved, just with standardized field names
15. If a field exists in the draft but not in the schema, include it anyway (better to have extra than missing)

CRITICAL MULTICLASS/TEMPLATE LEVELING RULES (DO NOT "CORRECT" THIS):
- Characters with templates/prestige classes RETAIN their base class levels and ADD template levels
- "level X [template] (previous level Y [class])" means [Template] level X, NOT total level X
- Example: "level 9 vampire (previous level 5 fighter)" = Fighter 5 / Vampire 9 (total level 14)
- Example: "level 3 lycanthrope (previous level 8 ranger)" = Ranger 8 / Lycanthrope 3 (total level 11)
- Example: "rank 4 cyborg (previous rank 6 operative)" = Operative 6 / Cyborg 4 (total rank 10)
- DO NOT reduce template levels to make the total level match the stated number
- Use the template level/rank (not total level) to determine which special abilities are available
- DO NOT omit any special abilities/powers/weaknesses from the draft - preserve ALL of them
- Ensure traits[], actions[], bonus_actions[], reactions[], special_abilities[], and weaknesses[] contain ALL abilities from the draft

=== NORMALIZED SCHEMAS (TEMPLATES TO ADAPT) ===
The schemas below are DEFAULT TEMPLATES optimized for D&D-like game systems.
ADAPT these schemas based on the game_system and generation_mode from the Purpose stage:
- Change field names to match the game system's terminology
- Omit mechanical fields for narrative-only generation
- Add custom fields needed for specific game systems
- The schemas show the STRUCTURE, not rigid requirements

=== NORMALIZED SCHEMA FOR NPC DELIVERABLES (v1.1) ===
For deliverable="npc", output should match this structure (adapted as needed):
{
  "schema_version": "1.1",  // REQUIRED: Always "1.1" for new NPCs
  "genre": string,  // "D&D", "Pathfinder", "Sci-Fi", "Modern", "Fantasy", etc.
  "type": "npc",
  "deliverable": "npc",
  "name": string,  // canonical_name → name (v1.1 uses 'name' as primary field)
  "title": string,
  "aliases": string[],
  "description": string,
  "appearance": string,  // NOT physical_appearance
  "background": string,
  "race": string,
  "alignment": string,
  "role": string,
  "affiliation": string,
  "location": string,
  "era": string,
  "class_levels": string | Array<{ class: string, level: number, subclass?: string, notes?: string }>,  // Can be string OR array
  "multiclass_features": Array<{ name: string, source_classes: string[], description: string }>,  // For hybrid class mechanics
  "class_features": Array<{ name: string, description: string, level?: number, source?: string, uses?: string, notes?: string }>,  // ALL base class features (e.g., Arcane Recovery, Extra Attack, Spell Mastery)
  "subclass_features": Array<{ name: string, description: string, level?: number, source?: string, uses?: string, notes?: string }>,  // ALL subclass/archetype features (e.g., Portent, Expert Divination)
  "racial_features": Array<{ name: string, description: string, source?: string, notes?: string }>,  // ALL racial traits (e.g., Darkvision, Fey Ancestry, Relentless Endurance)
  "feats": Array<{ name: string, description: string, source?: string, prerequisite?: string, notes?: string }>,  // ALL feats (from ASI, background origin feat, racial bonus)
  "asi_choices": Array<{ level: number, choice: string, details?: string, source_class?: string }>,  // ASI/feat choices at each ASI level
  "background_feature": { background_name: string, feature_name: string, description: string, origin_feat?: string, skill_proficiencies?: string[], tool_proficiencies?: string[], languages_granted?: string[], equipment_granted?: string[] },  // Background details
  "challenge_rating": string,  // Include XP like "10 (5,900 XP)"
  "ability_scores": { "str": number, "dex": number, "con": number, "int": number, "wis": number, "cha": number },  // lowercase keys
  "armor_class": number | Array<{ value: number, type?: string, notes?: string }>,
  "hit_points": number | { average: number, formula: string, notes?: string },
  "hit_dice": string,
  "speed": { "walk": string, "climb"?: string, "fly"?: string, "swim"?: string, "burrow"?: string, "hover"?: string },
  "proficiency_bonus": number,
  "saving_throws": Array<{ name: string, value: string, notes?: string }> | string[],  // Can be objects or strings
  "skill_proficiencies": Array<{ name: string, value: string, notes?: string }> | string[],
  "senses": string[],
  "passive_perception": number,
  "languages": string[],
  "damage_resistances": string[],
  "damage_immunities": string[],
  "damage_vulnerabilities": string[],
  "condition_immunities": string[],
  "abilities": Array<{ name: string, description: string, uses?: string, recharge?: string, notes?: string, source?: string }>,  // Use 'abilities' NOT 'traits'
  "vampire_traits"?: {  // Optional: For vampire template NPCs
    "vampire_level": number,
    "regeneration": { "hit_points_per_turn": number, "disable_conditions": string[] },
    "weaknesses": Array<{ type: string, effect: string }>,
    "blood_requirements": { "frequency": string, "amount": string, "consequences": string },
    "shapechanger_forms": string[]
  },
  "spellcasting"?: {  // Enhanced with Artificer support
    "type": string,  // "Innate", "Prepared", "Known", "Artificer"
    "ability": string,  // "INT", "WIS", "CHA"
    "save_dc": number,
    "attack_bonus": number,
    "cantrips": string[],  // Separate from known_spells
    "spellcasting_focus": string,  // e.g., "arcane focus", "component pouch"
    "spell_storing_items": Array<{ item: string, spell: string, level: number, uses: number }>,  // Artificer mechanic
    "spell_slots": { "1st": number, "2nd": number, ... },
    "prepared_spells": { "1st": string[], "2nd": string[], ... },
    "innate_spells": { "At will": string[], "3/day": string[], ... },
    "known_spells": string[]
  },
  "actions": Array<{ name: string, description: string, uses?: string, recharge?: string, notes?: string }>,
  "bonus_actions": Array<{ name: string, description: string, uses?: string, recharge?: string, notes?: string }>,
  "reactions": Array<{ name: string, description: string, uses?: string, recharge?: string, notes?: string }>,
  "legendary_actions"?: {  // Enhanced with reset tracking
    "summary": string,
    "count": number,  // Number of legendary actions per round
    "reset": string,  // When they reset (e.g., "start of turn", "short rest")
    "options": Array<{ name: string, description: string, cost?: number, uses?: string, notes?: string }>
  },
  "mythic_actions"?: {
    "summary": string,
    "trigger": string,  // What triggers mythic actions
    "options": Array<{ name: string, description: string, uses?: string, notes?: string }>
  },
  "lair_description": string,  // Where the creature lives
  "lair_actions": Array<string> | Array<{ initiative: number, action: string, description: string }>,  // Simple or enhanced
  "regional_effects": Array<string> | Array<{ radius: string, effect: string, description: string, duration?: string }>,
  "equipment": string[],  // Mundane items
  "attuned_items": Array<{ name: string, rarity: string, requires_attunement: boolean, attuned: boolean, description: string, properties?: string[], charges?: { current: number, maximum: number, recharge: string } }>,
  "magic_items": Array<{ name: string, rarity: string, description: string }>,  // Non-attuned magic items
  "treasure"?: { coinage: string, art_objects: string[], notes: string },
  "relationships": Array<{ entity: string, relationship: string, notes?: string }>,
  "allies_friends": Array<{ name: string, type: string, relationship: string, location?: string, stat_summary?: string, stat_block_ref?: string, notes?: string }>,  // Detailed allies
  "factions": Array<{ name: string, role: string, standing?: string, notes?: string }>,
  "minions": Array<{ name: string, type: string, quantity?: number, loyalty?: string, notes?: string }>,
  "personality": { "traits": string[], "ideals": string[], "bonds": string[], "flaws": string[] },
  "motivations": string[],
  "tactics": string,
  "hooks": string[],
  "notes": string[],
  "rule_base": string,  // "2024RAW", "2014RAW", or "HouseRules:..."
  "sources_used": string[],
  "assumptions": string[],
  "proposals": Array<{ question: string, options: string[], rule_impact: string, recommendation?: string }>,
  "canon_update": string,
  "generation_metadata"?: {  // Tracks AI generation quality
    "generated_date": string,
    "ai_model": string,
    "validation_notes": string[],
    "conflicts": Array<{ field: string, issue: string, severity: string }>,
    "canon_alignment_score": number  // 0-100
  }
}

=== NORMALIZED SCHEMA FOR ENCOUNTER DELIVERABLES ===
For deliverable="encounter", output MUST match this structure:
{
  "type": "encounter",
  "deliverable": "encounter",
  "title": string,
  "description": string,
  "encounter_type": string,  // "combat", "social", "exploration", "puzzle", "mixed"
  "difficulty": string,  // "easy", "standard", "deadly", "boss"
  "party_level_range": string,  // e.g., "5-7"
  "estimated_duration": string,  // e.g., "30-45 minutes"
  "environment": {
    "location": string,
    "terrain": string,
    "lighting": string,
    "weather": string,
    "special_conditions": string[]
  },
  "enemies": Array<{
    "name": string,
    "count": number,
    "cr": string,
    "role": string,  // "boss", "elite", "minion", "support"
    "tactics": string
  }>,
  "objectives": {
    "primary": string[],
    "secondary": string[],
    "failure_conditions": string[]
  },
  "encounter_map": {
    "description": string,
    "dimensions": string,
    "key_features": string[],
    "cover_terrain": string[]
  },
  "tactics": {
    "enemy_strategy": string,
    "reinforcements": string,
    "retreat_conditions": string,
    "special_phases": string[]
  },
  "rewards": {
    "treasure": string[],
    "experience": string,
    "story_rewards": string[]
  },
  "hooks": string[],
  "escalation": string[],  // How encounter can become more difficult
  "era": string,
  "region": string,
  "rule_base": string,
  "sources_used": string[],
  "assumptions": string[],
  "proposals": array,
  "canon_update": string
}

=== NORMALIZED SCHEMA FOR ITEM DELIVERABLES ===
For deliverable="item", output MUST match this structure:
{
  "type": "item",
  "deliverable": "item",
  "title": string,
  "canonical_name": string,
  "aliases": string[],
  "description": string,
  "item_type": string,  // "weapon", "armor", "wondrous_item", "potion", "scroll", "ring", "rod", "staff", "wand", etc.
  "subtype": string,  // e.g., "longsword", "plate armor", "cloak"
  "rarity": string,  // "common", "uncommon", "rare", "very_rare", "legendary", "artifact"
  "requires_attunement": boolean,
  "attunement_requirements": string,  // e.g., "by a spellcaster", "by a paladin"
  "appearance": string,
  "history": string,
  "properties": {
    "magical_bonus": string,  // e.g., "+2 to attack and damage"
    "special_abilities": Array<{
      "name": string,
      "description": string,
      "uses": string,  // e.g., "3 charges per day"
      "recharge": string
    }>,
    "passive_effects": string[],
    "activation": string,  // "action", "bonus action", "reaction", "passive"
    "cursed": boolean,
    "curse_description": string
  },
  "mechanics": {
    "damage": string,  // For weapons
    "armor_class": string,  // For armor
    "spell_save_dc": string,
    "attack_bonus": string,
    "weight": string,
    "cost_gp": number
  },
  "lore": {
    "creator": string,
    "origin_story": string,
    "famous_wielders": string[],
    "current_location": string,
    "legends": string[]
  },
  "era": string,
  "region": string,
  "rule_base": string,
  "sources_used": string[],
  "assumptions": string[],
  "proposals": array,
  "canon_update": string
}

=== NORMALIZED SCHEMA FOR SCENE DELIVERABLES ===
For deliverable="scene", output MUST match this structure:
{
  "type": "scene",
  "deliverable": "scene",
  "title": string,
  "description": string,
  "scene_type": string,  // "roleplay", "investigation", "exploration", "social", "revelation", "cinematic"
  "setting": {
    "location": string,
    "time_of_day": string,
    "atmosphere": string,
    "sensory_details": {
      "sights": string,
      "sounds": string,
      "smells": string,
      "tactile": string
    },
    "mood": string
  },
  "narration": {
    "opening": string,  // GM reads this to set the scene
    "player_perspective": string,  // What players observe/experience
    "gm_secrets": string[]  // Hidden information only GM knows
  },
  "npcs_present": Array<{
    "name": string,
    "role": string,
    "disposition": string,  // "friendly", "neutral", "hostile", "suspicious"
    "goals": string[],
    "secrets": string[]
  }>,
  "events": Array<{
    "trigger": string,  // What causes this event
    "description": string,
    "outcomes": string[]  // Possible results
  }>,
  "skill_checks": Array<{
    "skill": string,
    "dc": number,
    "purpose": string,
    "success_result": string,
    "failure_result": string
  }>,
  "branching_paths": Array<{
    "player_choice": string,
    "consequence": string,
    "leads_to": string  // Next scene or encounter
  }>,
  "clues_information": string[],
  "hooks": string[],
  "transitions": {
    "from_previous": string,
    "to_next": string[]  // Possible next scenes
  },
  "estimated_duration": string,
  "era": string,
  "region": string,
  "rule_base": string,
  "sources_used": string[],
  "assumptions": string[],
  "proposals": array,
  "canon_update": string
}

=== NORMALIZED SCHEMA FOR STORY_ARC DELIVERABLES ===
For deliverable="story_arc", output MUST match this structure:
{
  "type": "story_arc",
  "deliverable": "story_arc",
  "title": string,
  "description": string,
  "premise": string,  // Core concept in 1-2 sentences
  "themes": string[],  // "betrayal", "redemption", "mystery", etc.
  "scope": {
    "estimated_sessions": number,
    "level_range": string,  // "5-7"
    "geographic_scope": string,  // "single city", "regional", "continental"
    "stakes": string  // "personal", "regional", "world-ending"
  },
  "hook": {
    "initial_hook": string,
    "personal_connections": string[],  // Ties to PC backgrounds
    "urgency": string
  },
  "acts": Array<{
    "act_number": number,
    "title": string,
    "summary": string,
    "key_events": string[],
    "major_npcs": string[],
    "locations": string[],
    "estimated_sessions": number,
    "act_climax": string
  }>,
  "major_npcs": Array<{
    "name": string,
    "role": string,  // "villain", "ally", "mentor", "rival"
    "motivation": string,
    "arc": string  // Their character development
  }>,
  "key_locations": Array<{
    "name": string,
    "significance": string,
    "when_visited": string  // Which act
  }>,
  "central_conflict": {
    "antagonist": string,
    "goal": string,
    "methods": string[],
    "weakness": string
  },
  "climax": {
    "description": string,
    "location": string,
    "stakes": string,
    "victory_conditions": string[],
    "failure_outcomes": string[]
  },
  "resolution_options": Array<{
    "outcome": string,
    "requirements": string[],
    "consequences": string
  }>,
  "subplots": Array<{
    "title": string,
    "description": string,
    "resolution": string
  }>,
  "pacing": {
    "introduction": string,
    "rising_action": string,
    "climax": string,
    "falling_action": string
  },
  "era": string,
  "region": string,
  "rule_base": string,
  "sources_used": string[],
  "assumptions": string[],
  "proposals": array,
  "canon_update": string
}

=== NORMALIZED SCHEMA FOR ADVENTURE DELIVERABLES ===
For deliverable="adventure", output MUST match this structure:
{
  "type": "adventure",
  "deliverable": "adventure",
  "title": string,
  "subtitle": string,
  "description": string,
  "premise": string,
  "scope": {
    "estimated_sessions": number,
    "level_range": string,
    "player_count": string,  // "3-5 players"
    "difficulty": string
  },
  "adventure_structure": {
    "introduction": {
      "hook": string,
      "starting_location": string,
      "initial_scenes": string[]
    },
    "acts": Array<{
      "act_number": number,
      "title": string,
      "summary": string,
      "encounters": string[],  // References to encounter titles
      "scenes": string[],  // References to scene titles
      "key_npcs": string[],
      "locations": string[],
      "act_objective": string
    }>,
    "climax": {
      "title": string,
      "description": string,
      "final_encounter": string,
      "resolution_options": string[]
    },
    "conclusion": {
      "epilogue": string,
      "rewards": string[],
      "sequel_hooks": string[]
    }
  },
  "major_npcs": Array<{
    "name": string,
    "role": string,
    "brief_stats": string,  // Or reference to full NPC
    "key_motivations": string[]
  }>,
  "key_locations": Array<{
    "name": string,
    "description": string,
    "encounters": string[],
    "points_of_interest": string[]
  }>,
  "magic_items": Array<{
    "name": string,
    "where_found": string,
    "brief_description": string
  }>,
  "appendices": {
    "npcs": string,  // "See NPC appendix"
    "items": string,  // "See magic items appendix"
    "maps": string[],
    "handouts": string[]
  },
  "gm_guidance": {
    "preparation_notes": string[],
    "pacing_tips": string[],
    "common_pitfalls": string[],
    "improvisation_tips": string[]
  },
  "themes": string[],
  "era": string,
  "region": string,
  "rule_base": string,
  "sources_used": string[],
  "assumptions": string[],
  "proposals": array,
  "canon_update": string
}

FIELD MAPPING INTELLIGENCE (applies to ALL content types):
- "physical_appearance" OR "appearance" → "appearance"
- "saving_throws" OR "saves" → "saving_throws" (as string array)
- "skill_proficiencies" OR "skills" → "skill_proficiencies" (as string array)
- "personality" object with traits/ideals/bonds/flaws → flatten to personality_traits[], ideals, flaws
- "hit_points" number OR string OR object → string formula like "112 (15d8 + 45)"
- "class_levels" array OR string → simple string representation
- Any nested npc.* OR encounter.* OR item.* OR scene.* fields → flatten to root level
- "environment_details" OR "setting_details" → normalize to appropriate structure (environment for encounters, setting for scenes)
- "treasure" OR "loot" OR "rewards" → "rewards" with consistent structure
- "location" OR "place" OR "venue" → use appropriate context-specific field name

Output the normalized, polished JSON matching the schema for the deliverable type.`,
    buildUserPrompt: (context) => {
      // Get full content
      const fullDraft = stripStageOutput(context.stageResults.creator as JsonRecord);
      const fullFactCheck = stripStageOutput(context.stageResults.fact_checker as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let draftToUse = fullDraft;
      let factCheckToUse = fullFactCheck;

      if (context.chunkInfo?.currentChunk === 1) {
        const draftJson = JSON.stringify(fullDraft);
        if (draftJson.length > 5000) {
          console.log(`[Stylist Chunk 1] Draft is large (${draftJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          draftToUse = {
            name: fullDraft.name,
            type: context.config.type,
            schema_version: fullDraft.schema_version,
            challenge_rating: fullDraft.challenge_rating,
            _summary: `[Large draft - ${draftJson.length} chars. Full styling/normalization in chunk 2. For now, pass through as-is.]`,
            _field_count: Object.keys(fullDraft).length,
          };
        }

        const factCheckJson = JSON.stringify(fullFactCheck);
        if (factCheckJson.length > 3000) {
          console.log(`[Stylist Chunk 1] Fact check is large (${factCheckJson.length} chars). Sending minimal summary.`);
          factCheckToUse = {
            _summary: `[Large fact check - ${factCheckJson.length} chars. Full details in chunk 2.]`,
          };
        }
      }

      const userPrompt: any = {
        draft: draftToUse,
        tone: context.config.flags.tone,
        mode: context.config.flags.mode,
        fact_check: factCheckToUse,
        deliverable_type: context.config.type,
        // Include Purpose stage results for schema adaptation
        purpose: context.stageResults.purpose ? stripStageOutput(context.stageResults.purpose as JsonRecord) : undefined,
      };

      // Reference canon from Planner stage instead of resending
      if (context.stageResults.planner) {
        userPrompt.canon_reference = `⚠️ Canon facts were already provided in the Planner stage earlier in this conversation. Review those facts if needed for styling/normalization.`;
      } else {
        userPrompt.relevant_canon = createMinimalFactpack(context.factpack, 6000);
      }

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full draft will be provided in next chunk for detailed styling/normalization.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full draft provided. Apply thorough styling and normalization now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      // Include previous decisions so they can be incorporated during styling/normalization
      if (context.previousDecisions && Object.keys(context.previousDecisions).length > 0) {
        userPrompt.previous_decisions = context.previousDecisions;
        userPrompt.CRITICAL_INSTRUCTION = `⚠️ MANDATORY: The previous_decisions object contains ${Object.keys(context.previousDecisions).length} user decisions. While normalizing:
1. INCORPORATE these decisions into the normalized output (e.g., if user chose "AC 19", ensure armor_class: 19)
2. PRESERVE all details from user answers (e.g., if user specified ability details, include them)
3. DO NOT create new proposals for these topics
Failing to incorporate user decisions during normalization is a critical error!`;
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Canon Validator',
    systemPrompt: `You are the Canon Validator for game content generation.
Your job is to detect conflicts between the generated content and existing canon facts.

CRITICAL RULES FOR THOROUGHNESS:
1. READ EVERY SINGLE FACT in the Relevant Canon below - do NOT skip any
2. Compare ALL claims in the generated content against EVERY fact in the Relevant Canon
3. TAKE YOUR TIME - be thorough and meticulous in your analysis
4. Detect contradictions in:
   - Entity states (alive vs dead, friendly vs hostile, etc.)
   - Locations (destroyed vs intact, abandoned vs inhabited, etc.)
   - Temporal consistency (events in wrong era, anachronisms)
   - Relationship contradictions (enemy vs ally, etc.)
   - Physical descriptions (appearance, size, abilities)
   - Historical events (timeline, causality)
5. For each conflict found, provide:
   - new_claim: what the generated content says
   - existing_claim: what canon says (quote the exact fact)
   - entity_name: which entity is affected
   - conflict_type: type of contradiction
   - severity: "critical" (breaks canon) | "minor" (questionable but acceptable)
6. Add validation metadata to the content:
   - conflicts: array of detected conflicts
   - canon_alignment_score: 0-100 (100 = perfect alignment, deduct points for each conflict)
   - validation_notes: any additional observations
7. Be 100% ACCURATE in identifying conflicts - false positives waste user time
8. Be 100% PRECISE - quote exact facts from canon when noting conflicts

The Relevant Canon below contains all facts that relate to this content.
Read them ALL carefully before validating.

⚠️ CRITICAL: DO NOT CREATE OR MODIFY PROPOSALS ⚠️
You are a VALIDATOR, not a question-asker. Do NOT add to proposals[].
Document resolved conflicts and corrections in validation_notes, NOT in proposals[].
Copy the existing proposals[] array EXACTLY as-is if present.

Output the SAME JSON content with added fields:
- conflicts: [...]
- canon_alignment_score: number
- validation_notes: string`,
    buildUserPrompt: (context) => {
      // Get full content
      const fullContent = stripStageOutput(context.stageResults.stylist as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let contentToUse = fullContent;
      if (context.chunkInfo?.currentChunk === 1) {
        const contentJson = JSON.stringify(fullContent);
        if (contentJson.length > 5000) {
          console.log(`[Canon Validator Chunk 1] Content is large (${contentJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          contentToUse = {
            name: fullContent.name,
            type: context.config.type,
            schema_version: fullContent.schema_version,
            challenge_rating: fullContent.challenge_rating,
            _summary: `[Large content - ${contentJson.length} chars. Full validation in chunk 2. For now, perform basic metadata validation only.]`,
            _field_count: Object.keys(fullContent).length,
          };
        }
      }

      const userPrompt: any = {
        content: contentToUse,
        relevant_canon: createMinimalFactpack(context.factpack, 5000), // Limit to 5000 chars for canon validation
      };

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full content will be provided in next chunk for detailed validation.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full content provided. Perform thorough validation now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
  {
    name: 'Physics Validator',
    systemPrompt: `You are the Physics & Logic Validator for game content generation.
Your job is to ensure the content is internally consistent and follows game physics/logic.

CRITICAL RULES FOR THOROUGHNESS:
1. READ the entire generated content carefully - do NOT skip sections
2. TAKE YOUR TIME - be thorough in checking every detail
3. Check for logical inconsistencies:
   - Impossible actions (walking through walls without magic, etc.)
   - Rule violations (wrong spell levels, incorrect damage types, etc.)
   - Timeline contradictions (events in wrong order)
   - Geography violations (impossible distances, wrong terrain types)
   - Power level mismatches (CR too low/high for described abilities)
   - Internal contradictions (content contradicts itself)
4. For each issue found, provide:
   - issue_type: "rule_violation" | "logic_error" | "balance_issue" | "impossibility"
   - description: what's wrong (be specific)
   - location: where in the content (e.g., "encounter_details.enemies[0]")
   - severity: "critical" | "moderate" | "minor"
   - suggestion: how to fix it
5. Validate against the specified rule_base (5e, PF2e, etc.)
6. Add validation metadata:
   - physics_issues: array of detected issues
   - logic_score: 0-100 (100 = perfectly consistent, deduct points for each issue)
   - balance_notes: observations about game balance
7. Be 100% ACCURATE - false positives waste user time
8. Be 100% PRECISE - cite specific rules or logic principles when identifying issues

The Relevant Canon is provided for context about the world's established facts.

⚠️ CRITICAL: DO NOT CREATE OR MODIFY PROPOSALS ⚠️
You are a VALIDATOR, not a question-asker. Do NOT add to proposals[].
Document issues and corrections in balance_notes, NOT in proposals[].
Copy the existing proposals[] array EXACTLY as-is if present.

Output the SAME JSON content with added fields:
- physics_issues: [...]
- logic_score: number
- balance_notes: string`,
    buildUserPrompt: (context) => {
      // Get full content
      const fullContent = stripStageOutput(context.stageResults.canon_validator as JsonRecord);

      // For chunk 1 with large content, send minimal summary to fit in prompt limits
      let contentToUse = fullContent;
      if (context.chunkInfo?.currentChunk === 1) {
        const contentJson = JSON.stringify(fullContent);
        if (contentJson.length > 5000) {
          console.log(`[Physics Validator Chunk 1] Content is large (${contentJson.length} chars). Sending minimal summary.`);

          // Create minimal summary with just metadata and basic info
          contentToUse = {
            name: fullContent.name,
            type: context.config.type,
            schema_version: fullContent.schema_version,
            challenge_rating: fullContent.challenge_rating,
            _summary: `[Large content - ${contentJson.length} chars. Full validation in chunk 2. For now, perform basic metadata validation only.]`,
            _field_count: Object.keys(fullContent).length,
          };
        }
      }

      const userPrompt: any = {
        content: contentToUse,
        relevant_canon: createMinimalFactpack(context.factpack, 4000), // Limit to 4000 chars for physics validation
        rule_base: context.config.flags.rule_base,
        difficulty: context.config.flags.difficulty,
      };

      // Add chunk information
      if (context.chunkInfo?.isChunked) {
        userPrompt.chunk_info = {
          message: context.chunkInfo.currentChunk < context.chunkInfo.totalChunks
            ? `Processing part ${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks} (${context.chunkInfo.chunkLabel}). Additional canon will be provided in subsequent parts. ${context.chunkInfo.currentChunk === 1 ? 'Full content will be provided in next chunk for detailed validation.' : ''}`
            : `Final part (${context.chunkInfo.currentChunk} of ${context.chunkInfo.totalChunks}). All canon and full content provided. Perform thorough validation now.`,
          current_chunk: context.chunkInfo.currentChunk,
          total_chunks: context.chunkInfo.totalChunks,
        };
      }

      return JSON.stringify(userPrompt, null, 2);
    },
  },
];

/**
 * Get appropriate stages based on content type
 */
function getStages(config: GenerationConfig | null, dynamicNpcStages?: Stage[] | null): Stage[] {
  if (!config) return GENERIC_STAGES;

  if (config.type === 'nonfiction') {
    return NONFICTION_BOOK_STAGES;
  }

  // Use specialized monster stages for monster generation
  if (config.type === 'monster') {
    return MONSTER_CREATOR_STAGES;
  }

  // Use specialized encounter stages for encounter generation
  if (config.type === 'encounter') {
    return ENCOUNTER_CREATOR_STAGES;
  }

  // Use specialized item stages for magic item generation
  if (config.type === 'item') {
    return ITEM_CREATOR_STAGES;
  }

  // Use specialized story arc stages for story arc generation
  if (config.type === 'story_arc') {
    return STORY_ARC_CREATOR_STAGES;
  }

  // Use specialized NPC stages for NPC generation
  if (config.type === 'npc') {
    const prefixStages: Stage[] = [GENERIC_STAGES[1], GENERIC_STAGES[2]];
    if (dynamicNpcStages && dynamicNpcStages.length > 0) {
      return dynamicNpcStages;
    }
    return [...prefixStages, ...NPC_CREATOR_STAGES];
  }

  // Use specialized location stages for location generation
  if (config.type === 'location') {
    return LOCATION_CREATOR_STAGES;
  }

  // Default to generic stages for all other types
  return GENERIC_STAGES;
}

/**
 * Determine if map should be visible for the current stage
 * Map is shown for location-type generation during Spaces, Details, and Accuracy Refinement stages
 */
function shouldShowMapForStage(
  config: GenerationConfig | null,
  currentStageIndex: number
): boolean {
  if (config?.type !== 'location') return false;

  const stages = getStages(config);
  const stageName = stages[currentStageIndex]?.name;

  // Show map for Spaces (Stage 3), Details (Stage 4), Accuracy Refinement (Stage 5)
  return stageName === 'Spaces' ||
         stageName === 'Details' ||
         stageName === 'Accuracy Refinement';
}

/**
 * Limit accumulated answers to prevent exceeding character limits in prompts
 * Keeps the most recent answers and trims older ones
 */
function limitAccumulatedAnswers(
  answers: Record<string, string>,
  maxChars: number = 6000
): Record<string, string> {
  const entries = Object.entries(answers);
  let totalChars = 0;
  const limited: Record<string, string> = {};

  // Process in reverse order (most recent first if they were added sequentially)
  for (let i = entries.length - 1; i >= 0; i--) {
    const [question, answer] = entries[i];
    const entrySize = question.length + answer.length;

    if (totalChars + entrySize <= maxChars) {
      limited[question] = answer;
      totalChars += entrySize;
    } else {
      // Would exceed limit - stop here
      console.log(`[limitAccumulatedAnswers] Trimmed ${entries.length - Object.keys(limited).length} older answers to stay under ${maxChars} chars`);
      break;
    }
  }

  return limited;
}

/**
 * Deduplicate proposals against already-answered questions
 * This prevents asking the user the same question multiple times when retrying stages
 *
 * Proposals typically have this structure:
 * { topic: "custom_item_effect_sleep_arrow", question: "What is the effect...", options: [...] }
 *
 * Accumulated answers are stored as:
 * { "question text": "answer", ... } OR { "topic": "answer", ... }
 */
function deduplicateProposals(
  proposals: unknown[],
  accumulatedAnswers: Record<string, string>
): unknown[] {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return proposals;
  }

  // Build comprehensive sets of what's been answered
  const answeredQuestions = new Set(Object.keys(accumulatedAnswers));
  const answeredTopics = new Set<string>();

  // Extract topics from accumulated answers keys
  Object.keys(accumulatedAnswers).forEach(key => {
    // If the key looks like a topic (e.g., "custom_item_effect_sleep_arrow"), add it
    if (key.includes('_') && !key.includes(' ') && key.length < 100) {
      answeredTopics.add(key);
    }

    // Also try to extract topic prefix (e.g., "custom_item_effect:" -> "custom_item_effect")
    const topicMatch = key.match(/^([a-z_]+):/i);
    if (topicMatch) {
      answeredTopics.add(topicMatch[1]);
    }
  });

  // Also check for semantic similarity in question text
  const answeredQuestionWords = new Set<string>();
  Object.keys(accumulatedAnswers).forEach(key => {
    // Extract significant words from question (4+ chars, alphanumeric)
    const words = key.toLowerCase().match(/\b\w{4,}\b/g) || [];
    words.forEach(word => answeredQuestionWords.add(word));
  });

  const seenQuestions = new Set<string>();
  const seenTopics = new Set<string>();
  const seenFields = new Set<string>();
  const seenQuestionFingerprints = new Set<string>();

  // Helper to create a semantic fingerprint of a question
  const getQuestionFingerprint = (text: string): string => {
    // Normalize: lowercase, remove punctuation, extract key words
    const normalized = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract significant words (4+ chars), sort alphabetically for consistency
    const words = normalized.match(/\b\w{4,}\b/g) || [];
    const uniqueWords = [...new Set(words)].sort();

    // Create fingerprint from top 5 most significant words
    return uniqueWords.slice(0, 5).join('_');
  };

  const deduplicated = proposals.filter((proposal) => {
    if (proposal === null || proposal === undefined) {
      return false;
    }
    if (typeof proposal !== 'object') {
      return true;
    }

    const prop = proposal as Record<string, unknown>;

    // Extract fields
    const topic = typeof prop.topic === 'string' ? prop.topic : null;
    const question = typeof prop.question === 'string' ? prop.question : null;
    const fieldPath = typeof prop.field_path === 'string' ? prop.field_path :
                     (typeof prop.field === 'string' ? prop.field : null);
    const _currentValue = typeof prop.current_value === 'string' ? prop.current_value : null;

    // Filter out proposals with topics that were already answered
    if (topic && answeredTopics.has(topic)) {
      console.log(`[Proposal Dedup] Filtered out already-answered topic: ${topic}`);
      return false;
    }

    // Filter out proposals with exact question matches
    if (question && answeredQuestions.has(question)) {
      console.log(`[Proposal Dedup] Filtered out already-answered question: ${question.substring(0, 50)}...`);
      return false;
    }

    // NEW: Filter out proposals targeting the same field_path
    if (fieldPath) {
      if (seenFields.has(fieldPath)) {
        console.log(`[Proposal Dedup] Filtered out duplicate field_path: ${fieldPath}`);
        return false;
      }
      seenFields.add(fieldPath);
    }

    // NEW: Semantic deduplication using question fingerprints
    if (question) {
      const fingerprint = getQuestionFingerprint(question);
      if (fingerprint && seenQuestionFingerprints.has(fingerprint)) {
        console.log(`[Proposal Dedup] Filtered out semantically similar question: ${question.substring(0, 50)}...`);
        return false;
      }
      if (fingerprint) {
        seenQuestionFingerprints.add(fingerprint);
      }
    }

    // Filter out duplicate topics in the current proposals array
    if (topic) {
      if (seenTopics.has(topic)) {
        console.log(`[Proposal Dedup] Filtered out duplicate topic in current set: ${topic}`);
        return false;
      }
      seenTopics.add(topic);
    }

    // Filter out duplicate questions in the current proposals array
    if (question) {
      if (seenQuestions.has(question)) {
        console.log(`[Proposal Dedup] Filtered out duplicate question in current set: ${question.substring(0, 50)}...`);
        return false;
      }
      seenQuestions.add(question);
    }

    return true;
  });

  if (deduplicated.length < proposals.length) {
    console.log(`[Proposal Dedup] Reduced from ${proposals.length} to ${deduplicated.length} proposals (${proposals.length - deduplicated.length} duplicates removed)`);
  }

  return deduplicated;
}

export default function ManualGenerator() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || 'default';
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [modalMode, setModalMode] = useState<'output' | 'input' | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [stageResults, setStageResults] = useState<StageResults>({});
  const [factpack, setFactpack] = useState<Factpack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [finalOutput, setFinalOutput] = useState<JsonRecord | null>(null);
  const [showCanonDeltaModal, setShowCanonDeltaModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editedContent, setEditedContent] = useState<unknown>(null);
  const [resolvedProposals, setResolvedProposals] = useState<Proposal[]>([]);
  const [resolvedConflicts, setResolvedConflicts] = useState<Conflict[]>([]);
  const [_resolvedPhysicsIssues, setResolvedPhysicsIssues] = useState<PhysicsIssue[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentStageOutput, setCurrentStageOutput] = useState<JsonRecord | null>(null);
  const [uploadedContentType, setUploadedContentType] = useState<GenerationConfig['type']>('npc');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [skipMode, _setSkipMode] = useState(false);
  const [showNarrowingModal, _setShowNarrowingModal] = useState(false);
  const [currentKeywords, setCurrentKeywords] = useState<string[]>([]);
  const [pendingFactpack, setPendingFactpack] = useState<Factpack | null>(null);
  const [pendingStageResults, setPendingStageResults] = useState<StageResults | null>(null);
  const [processingRetrievalHints, setProcessingRetrievalHints] = useState(false);
  const [retrievalHintsContext, setRetrievalHintsContext] = useState<{ stageName: string; requestedEntities: string[] } | null>(null);
  const [accumulatedAnswers, setAccumulatedAnswers] = useState<Record<string, string>>({});
  const [showChunkingModal, setShowChunkingModal] = useState(false);
  const [factGroups, setFactGroups] = useState<FactGroup[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isMultiPartGeneration, setIsMultiPartGeneration] = useState(false);
  const [currentChunkInfo, setCurrentChunkInfo] = useState<{ isChunked: boolean; currentChunk: number; totalChunks: number; chunkLabel: string } | undefined>(undefined);

  // NPC Section-based chunking state
  const [npcSectionChunks, setNpcSectionChunks] = useState<NpcSectionChunk[]>([]);
  const [currentNpcSectionIndex, setCurrentNpcSectionIndex] = useState(0);
  const [isNpcSectionChunking, setIsNpcSectionChunking] = useState(false);
  const [accumulatedNpcSections, setAccumulatedNpcSections] = useState<JsonRecord>({});

  // Stage-based chunking state (for Location Spaces iteration)
  const [isStageChunking, setIsStageChunking] = useState(false);
  const [currentStageChunk, setCurrentStageChunk] = useState(0);
  const [totalStageChunks, setTotalStageChunks] = useState(0);
  const [accumulatedChunkResults, setAccumulatedChunkResults] = useState<JsonRecord[]>([]);

  // Live visual map state (for Location generation)
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [liveMapSpaces, setLiveMapSpaces] = useState<LiveMapSpace[]>([]);

  // Space approval workflow state (for Location Spaces stage)
  const [showSpaceApprovalModal, setShowSpaceApprovalModal] = useState(false);
  const [pendingSpace, setPendingSpace] = useState<JsonRecord | null>(null);
  const [_rejectedSpaces, _setRejectedSpaces] = useState<Array<{ space: JsonRecord; reason?: string }>>([]);
  const [rejectionFeedback, setRejectionFeedback] = useState<string | null>(null);
  const [reviewingSpaceIndex, setReviewingSpaceIndex] = useState<number>(-1); // Index in accumulatedChunkResults, -1 = new space
  const [savedNewSpace, setSavedNewSpace] = useState<JsonRecord | null>(null); // Save new space when navigating away
  const [mapUpdateCounter, setMapUpdateCounter] = useState(0); // Force map re-renders
  const [batchModeEnabled, setBatchModeEnabled] = useState(false); // Auto-accept spaces without individual approval

  // Auto-save progress state
  const [progressSession, setProgressSession] = useState<GenerationProgress | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Smart stage routing state (for NPC generation)
  const [dynamicNpcStages, setDynamicNpcStages] = useState<Stage[] | null>(null);
  const [stageRoutingDecision, setStageRoutingDecision] = useState<StageRoutingDecision | null>(null);

  // Get appropriate stages based on content type
  const STAGES = getStages(config, dynamicNpcStages);

  useEffect(() => {
    if (!projectId || projectId === 'default') {
      setProject(null);
      setProjectLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setProjectLoading(true);
      try {
        const response = await projectApi.getById(projectId);
        if (cancelled) return;
        if (response.success && response.data) {
          setProject(response.data);
        } else {
          setProject(null);
        }
      } catch {
        if (!cancelled) setProject(null);
      } finally {
        if (!cancelled) setProjectLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ─── AI Assistant Integration ──────────────────────────────────────────────
  const { setWorkflowContext, registerApplyChanges } = useAiAssistant();

  // Map GenerationConfig type to WorkflowType
  const configTypeToWorkflow = (type: GenerationConfig['type'] | undefined): WorkflowType => {
    if (!type) return 'unknown';
    const map: Record<string, WorkflowType> = {
      npc: 'npc', monster: 'monster', encounter: 'encounter', location: 'location',
      item: 'item', story_arc: 'story_arc', scene: 'scene', adventure: 'adventure',
      homebrew: 'homebrew', nonfiction: 'nonfiction', outline: 'outline', chapter: 'chapter',
      memoir: 'memoir', journal_entry: 'journal_entry', other_writing: 'other_writing',
    };
    return map[type] || 'unknown';
  };

  const workflowLabelMap: Record<string, string> = {
    npc: 'NPC Creator', monster: 'Monster Creator', encounter: 'Encounter Builder',
    location: 'Location Builder', item: 'Item Creator', story_arc: 'Story Arc',
    scene: 'Scene Writer', adventure: 'Adventure Planner', homebrew: 'Homebrew Parser',
    nonfiction: 'Non-Fiction Writer', outline: 'Outline Generator', chapter: 'Chapter Writer',
    memoir: 'Memoir Writer', journal_entry: 'Journal Entry', other_writing: 'Writing Assistant',
    unknown: 'Content Generator',
  };

  // Push workflow context into AI Assistant whenever relevant state changes
  useEffect(() => {
    if (!config) {
      setWorkflowContext(null);
      return;
    }

    const wfType = configTypeToWorkflow(config.type);
    setWorkflowContext({
      workflowType: wfType,
      workflowLabel: workflowLabelMap[wfType] || 'Content Generator',
      currentStage: STAGES[currentStageIndex]?.name,
      stageProgress: currentStageIndex >= 0
        ? { current: currentStageIndex + 1, total: STAGES.length }
        : undefined,
      currentData: stageResults,
      factpack: factpack
        ? { facts: factpack.facts.map(f => ({ text: f.text, source: f.entity_name })) }
        : undefined,
      generationConfig: {
        type: config.type,
        prompt: config.prompt,
        flags: config.flags,
      },
    });
  }, [config, currentStageIndex, stageResults, factpack, STAGES]);

  // Register applyChanges callback so the AI panel can merge changes back
  useEffect(() => {
    const handleApply = (changes: Record<string, unknown>, mergeMode: 'replace' | 'merge') => {
      setStageResults(prev => {
        if (mergeMode === 'replace') {
          return changes as StageResults;
        }
        // Merge mode: shallow-merge top-level keys
        const merged = { ...prev };
        for (const key of Object.keys(changes)) {
          const existing = merged[key];
          const incoming = changes[key];
          if (
            existing && typeof existing === 'object' && !Array.isArray(existing) &&
            incoming && typeof incoming === 'object' && !Array.isArray(incoming)
          ) {
            merged[key] = { ...existing, ...(incoming as JsonRecord) };
          } else {
            merged[key] = incoming as JsonRecord;
          }
        }
        return merged;
      });
      console.log('[AI Assistant] Applied changes to stageResults:', Object.keys(changes));
    };

    registerApplyChanges(handleApply);

    return () => {
      registerApplyChanges(null);
      setWorkflowContext(null);
    };
  }, [registerApplyChanges, setWorkflowContext]);
  // ─── End AI Assistant Integration ──────────────────────────────────────────

  const resetPipelineState = () => {
    setCurrentStageIndex(-1);
    setModalMode(null);
    _setSkipMode(false);
    setStageResults({});
    setError(null);
    setShowReviewModal(false);
    _setShowNarrowingModal(false);
    setCurrentKeywords([]);
    setPendingFactpack(null);
    setPendingStageResults(null);
    setProcessingRetrievalHints(false);
    setAccumulatedAnswers({});
    setShowChunkingModal(false);
    setFactGroups([]);
    setCurrentGroupIndex(0);
    setIsMultiPartGeneration(false);
    setCurrentChunkInfo(undefined);
    setDynamicNpcStages(null);
    setStageRoutingDecision(null);
  };

  // Helper function to deduplicate a factpack (removes duplicates based on chunk_id AND text content)
  const deduplicateFactpack = (factpack: Factpack): Factpack => {
    const seenChunkIds = new Set<string>();
    const seenTexts = new Set<string>();
    const uniqueFacts: CanonFact[] = [];

    // Deduplicate facts by chunk_id AND text content
    factpack.facts.forEach(fact => {
      const normalizedText = fact.text.trim().toLowerCase();

      // Skip if we've seen this chunk_id OR this exact text
      if (seenChunkIds.has(fact.chunk_id) || seenTexts.has(normalizedText)) {
        return;
      }

      seenChunkIds.add(fact.chunk_id);
      seenTexts.add(normalizedText);
      uniqueFacts.push(fact);
    });

    // Deduplicate entities
    const uniqueEntities = Array.from(new Set(factpack.entities));

    // Deduplicate gaps
    const uniqueGaps = Array.from(new Set(factpack.gaps));

    console.log(`[Deduplication] Reduced from ${factpack.facts.length} to ${uniqueFacts.length} facts (removed ${factpack.facts.length - uniqueFacts.length} duplicates)`);

    return {
      facts: uniqueFacts,
      entities: uniqueEntities,
      gaps: uniqueGaps,
    };
  };

  // Helper function to auto-save progress
  const saveProgress = async (session: GenerationProgress) => {
    if (!autoSaveEnabled || !session) return;

    try {
      await saveProgressToFile(session);
      setLastSaveTime(new Date().toISOString());
    } catch (error) {
      console.error('[Auto-Save] Failed to save progress:', error);
    }
  };

  const jumpToStage = async (stageName: string) => {
    if (!config) return;
    const idx = STAGES.findIndex((s) => s.name === stageName);
    if (idx < 0) return;

    setModalMode(null);
    _setSkipMode(false);
    setCurrentStageIndex(idx);

    await saveStateAndSession({
      currentStageIndex: idx,
    });

    setTimeout(() => {
      showStageOutput(idx, config, stageResults, factpack);
    }, 100);
  };

  const locationSoftWarning = (() => {
    if (config?.type !== 'location') return undefined;
    if (modalMode !== 'input') return undefined;
    const stageName = STAGES[currentStageIndex]?.name;
    if (!stageName) return undefined;

    const spacesStage = stageResults.spaces;
    const hasSpaces =
      isRecord(spacesStage) && Array.isArray((spacesStage as JsonRecord).spaces) && ((spacesStage as JsonRecord).spaces as unknown[]).length > 0;
    const hasDetails = isRecord(stageResults.details);

    if (stageName === 'Details') {
      if (hasSpaces) return undefined;
      return {
        title: 'Missing Spaces stage data',
        message:
          'This stage depends on your generated spaces. The current session does not have a valid `stageResults.spaces.spaces` array, so the AI may produce low-quality or inconsistent details. You can continue, but it is strongly recommended to fix spaces first.',
        fixStageName: 'Spaces',
        fixLabel: 'Fix now (go to Spaces)',
      };
    }

    if (stageName === 'Accuracy Refinement') {
      if (!hasSpaces) {
        return {
          title: 'Missing Spaces stage data',
          message:
            'Accuracy Refinement validates geometry/connections, which requires your spaces. This session does not have a valid `stageResults.spaces.spaces` array. You can continue, but the report may be incomplete or misleading.',
          fixStageName: 'Spaces',
          fixLabel: 'Fix now (go to Spaces)',
        };
      }

      if (!hasDetails) {
        return {
          title: 'Missing Details stage data',
          message:
            'Accuracy Refinement also uses narrative/location detail context. This session does not have a valid `stageResults.details` object. You can continue, but the output may be less useful.',
          fixStageName: 'Details',
          fixLabel: 'Fix now (go to Details)',
        };
      }
    }

    return undefined;
  })();

  // Helper function to update and save stage results
  const saveStageResults = async (results: StageResults, stageIndex: number) => {
    if (!autoSaveEnabled || !progressSession) return;

    try {
      // Update the session with the latest stage results and stage index
      const updatedSession: GenerationProgress = {
        ...progressSession,
        lastUpdatedAt: new Date().toISOString(),
        stageResults: results as unknown as Record<string, unknown>,
        currentStageIndex: stageIndex,
      };

      setProgressSession(updatedSession);
      await saveProgress(updatedSession);
      console.log(`[Auto-Save] Saved stage results for stage ${stageIndex}`);
    } catch (error) {
      console.error('[Auto-Save] Failed to save stage results:', error);
    }
  };

  /**
   * Atomically update state and persist to session
   * PATTERN: Use this whenever advancing stages or completing chunks
   */
  const saveStateAndSession = async (updates: {
    currentStageIndex?: number;
    stageResults?: StageResults;
    /**
     * Optional updated chunking state for the current stage.
     * When provided, this completely replaces the previous StageChunkState on the session.
     */
    stageChunkState?: StageChunkState;
  }) => {
    if (!autoSaveEnabled || !progressSession) return;

    try {
      const updatedSession: GenerationProgress = {
        ...progressSession,
        lastUpdatedAt: new Date().toISOString(),
        currentStageIndex: updates.currentStageIndex ?? currentStageIndex,
        stageResults: (updates.stageResults ?? stageResults) as unknown as Record<string, unknown>,
        stageChunkState: updates.stageChunkState ?? progressSession.stageChunkState,
      };

      setProgressSession(updatedSession);
      await saveProgress(updatedSession);
      console.log(`[Auto-Save] Saved state update:`, updates);
    } catch (error) {
      console.error('[Auto-Save] Failed to save state update:', error);
    }
  };

  // Handle resuming from a saved session
  const handleResumeSession = (session: GenerationProgress) => {
    console.log('[Resume] Restoring session:', session.sessionId);
    console.log('[Resume] Session currentStageIndex:', session.currentStageIndex);
    console.log('[Resume] Session stageChunkState:', session.stageChunkState);
    console.log('[Resume] Progress entries count:', session.progress?.length || 0);

    // Restore configuration (with type conversion)
    setConfig(session.config as unknown as GenerationConfig);

    // Restore stage results
    setStageResults(session.stageResults as StageResults);

    // Restore current stage
    const restoredStageIndex = session.currentStageIndex;
    console.log(`[Resume] Setting currentStageIndex to ${restoredStageIndex} (${STAGES[restoredStageIndex]?.name || 'Unknown'})`);
    setCurrentStageIndex(restoredStageIndex);

    // Restore multi-chunk state
    if (session.multiChunkState.isMultiPartGeneration) {
      setIsMultiPartGeneration(true);
      setCurrentGroupIndex(session.multiChunkState.currentGroupIndex);
      if (session.multiChunkState.factGroups) {
        setFactGroups(session.multiChunkState.factGroups as unknown as FactGroup[]);
      }
    }

    // Restore stage chunking state (for iterative location generation)
    // PRIMARY: Load from stageChunkState (single source of truth)
    // FALLBACK: Load from top-level fields for old sessions, then migrate
    let accumulatedChunks: JsonRecord[] = [];
    let savedLiveMapSpaces: JsonRecord[] = [];
    let needsMigration = false;

    if (session.stageChunkState?.liveMapSpaces || session.stageChunkState?.accumulatedChunkResults) {
      // Modern format: Load from stageChunkState
      console.log('[Resume] Loading from stageChunkState (modern format)');
      accumulatedChunks = session.stageChunkState.accumulatedChunkResults || [];
      savedLiveMapSpaces = session.stageChunkState.liveMapSpaces || [];
    } else if (session.liveMapSpaces || session.accumulatedChunkResults) {
      // Legacy format: Load from top-level, mark for migration
      console.log('[Resume] Loading from top-level fields (legacy format) - will migrate to stageChunkState');
      accumulatedChunks = session.accumulatedChunkResults || [];
      savedLiveMapSpaces = session.liveMapSpaces || [];
      needsMigration = true;
    }

    // If no accumulated chunks but we have progress entries for Spaces stage, reconstruct from progress
    let reconstructedChunkingMetadata: { isStageChunking: boolean; currentStageChunk: number; totalStageChunks: number } | null = null;
    if (accumulatedChunks.length === 0 && session.progress?.length > 0) {
      const spacesEntries = session.progress.filter((entry: ProgressEntry) =>
        entry.stage === 'Spaces' && entry.status === 'completed' && entry.response
      );

      if (spacesEntries.length > 0) {
        console.log(`[Resume] Reconstructing ${spacesEntries.length} spaces from saved progress...`);
        const reconstructedSpaces: JsonRecord[] = [];
        let totalChunks = 0;

        for (const entry of spacesEntries) {
          try {
            const spaceData = JSON.parse(entry.response || '{}');
            reconstructedSpaces.push(spaceData);
          } catch (error) {
            console.warn('[Resume] Failed to parse space entry:', error);
          }
        }

        // Try to determine total chunks from the last entry's prompt
        const lastEntry = spacesEntries[spacesEntries.length - 1];
        if (lastEntry?.prompt) {
          const match = lastEntry.prompt.match(/Space (\d+)\/(\d+)/);
          if (match) {
            totalChunks = parseInt(match[2], 10);
          }
        }

        accumulatedChunks = reconstructedSpaces;

        // Also rebuild live map spaces
        const rebuiltMapSpaces = reconstructedSpaces
          .map(space => extractSpaceForMap(space))
          .filter(space => space !== null);
        savedLiveMapSpaces = rebuiltMapSpaces;

        // Store chunking metadata for later use
        if (totalChunks > 0) {
          reconstructedChunkingMetadata = {
            isStageChunking: true,
            currentStageChunk: reconstructedSpaces.length, // Next chunk to generate
            totalStageChunks: totalChunks,
          };
        }

        console.log(`[Resume] ✓ Reconstructed ${reconstructedSpaces.length} of ${totalChunks} spaces with live map`);
      }
    }

    if (session.stageChunkState) {
      console.log('[Resume] Restoring stageChunkState:', {
        isStageChunking: session.stageChunkState.isStageChunking,
        currentStageChunk: session.stageChunkState.currentStageChunk,
        totalStageChunks: session.stageChunkState.totalStageChunks,
        accumulatedChunks: accumulatedChunks.length,
        liveMapSpaces: savedLiveMapSpaces.length,
      });
      setIsStageChunking(session.stageChunkState.isStageChunking);
      setCurrentStageChunk(session.stageChunkState.currentStageChunk);
      setTotalStageChunks(session.stageChunkState.totalStageChunks);
      setAccumulatedChunkResults(accumulatedChunks);

      // Rebuild live map from accumulated chunks if empty but chunks exist
      if (savedLiveMapSpaces.length === 0 && accumulatedChunks.length > 0) {
        const rebuiltSpaces = accumulatedChunks
          .map((chunk: any) => extractSpaceForMap(chunk))
          .filter((space: any) => space !== null);
        // Synchronize reciprocal doors before setting live map spaces
        const syncedSpaces = synchronizeReciprocalDoors(rebuiltSpaces);
        console.log('[Resume] Synchronized reciprocal doors for', syncedSpaces.length, 'rebuilt spaces');
        setLiveMapSpaces(syncedSpaces);
        setShowLiveMap(true);
      } else {
        console.log('[Resume] Loading savedLiveMapSpaces - sample positions:',
          savedLiveMapSpaces.slice(0, 3).map(s => ({
            name: s.name,
            position: s.position,
            position_locked: s.position_locked
          }))
        );
        console.log('[Resume] FULL savedLiveMapSpaces:', savedLiveMapSpaces.map(s => `${s.name}: (${s.position?.x},${s.position?.y}) locked=${s.position_locked}`));
        // Synchronize reciprocal doors before setting live map spaces
        const syncedSpaces = synchronizeReciprocalDoors(savedLiveMapSpaces);
        console.log('[Resume] Synchronized reciprocal doors for', syncedSpaces.length, 'saved spaces');
        setLiveMapSpaces(syncedSpaces);
        setShowLiveMap(session.stageChunkState.showLiveMap || savedLiveMapSpaces.length > 0);
        console.log('[Resume] ✓ setLiveMapSpaces called with', syncedSpaces.length, 'spaces');
      }
    } else if (accumulatedChunks.length > 0 || savedLiveMapSpaces.length > 0) {
      // Fallback: restore from top-level fields or reconstructed data if stageChunkState doesn't exist
      console.log('[Resume] Using fallback restoration (no stageChunkState)');
      console.log('[Resume] Fallback - savedLiveMapSpaces count:', savedLiveMapSpaces.length);
      console.log('[Resume] Fallback - sample positions:', savedLiveMapSpaces.slice(0, 3).map(s => `${s.name}: (${s.position?.x},${s.position?.y}) locked=${s.position_locked}`));
      setAccumulatedChunkResults(accumulatedChunks);

      // If we reconstructed chunking metadata, apply it
      if (reconstructedChunkingMetadata) {
        console.log('[Resume] Applying reconstructed chunking metadata:', reconstructedChunkingMetadata);
        setIsStageChunking(reconstructedChunkingMetadata.isStageChunking);
        setCurrentStageChunk(reconstructedChunkingMetadata.currentStageChunk);
        setTotalStageChunks(reconstructedChunkingMetadata.totalStageChunks);
      } else if (accumulatedChunks.length > 0 && session.config.type === 'location') {
        // ============================================================================
        // CRITICAL FIX: For location generation with accumulated spaces but no chunk
        // metadata, derive totalStageChunks from stageResults.purpose.estimated_spaces.
        // This ensures the chunking workflow continues properly after resume.
        // ============================================================================
        console.log('[Resume] Deriving chunking state from accumulated spaces + purpose data');
        
        // Try to get estimated_spaces from purpose stage result
        const purposeData = session.stageResults?.purpose as Record<string, unknown> | undefined;
        let estimatedSpaces: number = accumulatedChunks.length + 1; // Default: assume at least one more space
        
        if (purposeData?.estimated_spaces) {
          if (typeof purposeData.estimated_spaces === 'number') {
            estimatedSpaces = purposeData.estimated_spaces;
          } else if (typeof purposeData.estimated_spaces === 'string') {
            estimatedSpaces = parseInt(purposeData.estimated_spaces, 10) || estimatedSpaces;
          }
          console.log(`[Resume] Found estimated_spaces in purpose: ${estimatedSpaces}`);
        } else {
          // Fallback: infer from scale if available
          const scale = String(purposeData?.scale || '').toLowerCase();
          if (scale.includes('simple')) estimatedSpaces = Math.max(4, accumulatedChunks.length + 1);
          else if (scale.includes('moderate')) estimatedSpaces = Math.max(12, accumulatedChunks.length + 1);
          else if (scale.includes('complex')) estimatedSpaces = Math.max(30, accumulatedChunks.length + 1);
          else if (scale.includes('massive')) estimatedSpaces = Math.max(50, accumulatedChunks.length + 1);
          console.log(`[Resume] Inferred estimated_spaces from scale "${scale}": ${estimatedSpaces}`);
        }
        
        // Only set chunking state if we have spaces to generate beyond what's accumulated
        if (accumulatedChunks.length < estimatedSpaces) {
          console.log(`[Resume] ✓ Setting chunking state: ${accumulatedChunks.length}/${estimatedSpaces} spaces complete`);
          setIsStageChunking(true);
          setCurrentStageChunk(accumulatedChunks.length); // 0-indexed, so length = next chunk index
          setTotalStageChunks(estimatedSpaces);
          
          // Also create the reconstructedChunkingMetadata for later use
          reconstructedChunkingMetadata = {
            isStageChunking: true,
            currentStageChunk: accumulatedChunks.length,
            totalStageChunks: estimatedSpaces,
          };
        } else {
          console.log(`[Resume] All ${accumulatedChunks.length} spaces already complete (estimated: ${estimatedSpaces})`);
        }
      } else {
        console.warn('[Resume] No reconstructed chunking metadata - totalStageChunks may be 0');
      }

      if (savedLiveMapSpaces.length > 0) {
        console.log('[Resume] Fallback - Loading', savedLiveMapSpaces.length, 'spaces into liveMapSpaces');
        console.log('[Resume] Fallback - First 3 spaces being loaded:', savedLiveMapSpaces.slice(0, 3).map(s => `${s.name}: pos=(${s.position?.x},${s.position?.y}) locked=${s.position_locked}`));
        // Synchronize reciprocal doors before setting live map spaces
        const syncedSpaces = synchronizeReciprocalDoors(savedLiveMapSpaces);
        console.log('[Resume] Fallback - Synchronized reciprocal doors for', syncedSpaces.length, 'spaces');
        setLiveMapSpaces(syncedSpaces);
        setShowLiveMap(true);
        console.log('[Resume] Fallback - ✓ setLiveMapSpaces called');
      } else if (accumulatedChunks.length > 0) {
        console.log('[Resume] Fallback - No savedLiveMapSpaces, rebuilding from accumulatedChunks');
        const rebuiltSpaces = accumulatedChunks
          .map((chunk: any) => extractSpaceForMap(chunk))
          .filter((space: any) => space !== null);
        console.log('[Resume] Fallback - Rebuilt', rebuiltSpaces.length, 'spaces');
        // Synchronize reciprocal doors before setting live map spaces
        const syncedSpaces = synchronizeReciprocalDoors(rebuiltSpaces);
        console.log('[Resume] Fallback - Synchronized reciprocal doors for', syncedSpaces.length, 'rebuilt spaces');
        setLiveMapSpaces(syncedSpaces);
        setShowLiveMap(true);
      }
    }

    // Restore factpack if available
    if (session.factpack) {
      setFactpack(session.factpack as unknown as Factpack);
    }

    // Restore the session itself
    setProgressSession(session);

    // MIGRATION: If loaded from legacy top-level fields, migrate to stageChunkState
    if (needsMigration && (savedLiveMapSpaces.length > 0 || accumulatedChunks.length > 0)) {
      console.log('[Resume] Migrating legacy session to stageChunkState format...');
      const migratedSession: GenerationProgress = {
        ...session,
        lastUpdatedAt: new Date().toISOString(),
        stageChunkState: {
          isStageChunking: session.stageChunkState?.isStageChunking ?? false,
          currentStageChunk: session.stageChunkState?.currentStageChunk ?? 0,
          totalStageChunks: session.stageChunkState?.totalStageChunks ?? 0,
          showLiveMap: savedLiveMapSpaces.length > 0,
          liveMapSpaces: savedLiveMapSpaces,
          accumulatedChunkResults: accumulatedChunks,
        },
      };

      // Save migrated format
      saveProgressToFile(migratedSession)
        .then(() => {
          console.log('[Resume] ✓ Migration complete - session now uses stageChunkState');
          setProgressSession(migratedSession);
        })
        .catch(err => console.error('[Resume] Migration save failed:', err));
    }

    // Find the last incomplete entry to determine what to show
    const incompleteEntry = session.progress.find(
      entry => entry.status === 'pending' && entry.response === null
    );

    // Build effective chunk state from session OR reconstructed metadata
    const effectiveChunkState = session.stageChunkState || (reconstructedChunkingMetadata ? {
      isStageChunking: reconstructedChunkingMetadata.isStageChunking,
      currentStageChunk: reconstructedChunkingMetadata.currentStageChunk,
      totalStageChunks: reconstructedChunkingMetadata.totalStageChunks,
      liveMapSpaces: savedLiveMapSpaces,
      accumulatedChunkResults: accumulatedChunks,
    } : null);

    // Check if we're mid-chunking and have more spaces to generate
    const hasMoreSpacesToGenerate = effectiveChunkState &&
      effectiveChunkState.isStageChunking &&
      effectiveChunkState.currentStageChunk < effectiveChunkState.totalStageChunks;

    // Find the Spaces stage index for location generation
    const spacesStageIndex = STAGES.findIndex(s => s.name === 'Spaces');

    if (incompleteEntry) {
      // CRITICAL FIX: Verify currentStageIndex matches the incomplete entry's stage name
      const stageNameFromEntry = incompleteEntry.stage;
      const expectedStageIndex = STAGES.findIndex(s => s.name === stageNameFromEntry);

      if (expectedStageIndex !== -1 && expectedStageIndex !== session.currentStageIndex) {
        console.warn(`[Resume] Stage mismatch! Session currentStageIndex: ${session.currentStageIndex}, Entry stage: ${stageNameFromEntry} (index ${expectedStageIndex}). Correcting to ${expectedStageIndex}.`);
        setCurrentStageIndex(expectedStageIndex);
      }

      // Show the prompt that was waiting for a response
      setCurrentPrompt(incompleteEntry.prompt);
      setModalMode('input');
      console.log('[Resume] Resuming at pending prompt for stage:', incompleteEntry.stage);
      alert(`✅ Session Resumed!\n\nResuming at an incomplete prompt.\nCurrent stage: ${incompleteEntry.stage}\nTotal stages: ${STAGES.length}\n\nYou can continue from where you left off.`);
    } else if (hasMoreSpacesToGenerate && spacesStageIndex !== -1) {
      // PRIORITY: Resume mid-chunking for Spaces stage even if session.currentStageIndex advanced
      const nextChunkIndex = effectiveChunkState.currentStageChunk + 1;
      const chunkInfo = {
        isChunked: true,
        currentChunk: nextChunkIndex,
        totalChunks: effectiveChunkState.totalStageChunks,
        chunkLabel: `Space ${nextChunkIndex} of ${effectiveChunkState.totalStageChunks}`,
      };

      // Correct the stage index to Spaces if it was wrongly advanced
      if (session.currentStageIndex !== spacesStageIndex) {
        console.warn(`[Resume] Correcting stage from ${session.currentStageIndex} to ${spacesStageIndex} (Spaces) - more spaces to generate`);
        setCurrentStageIndex(spacesStageIndex);
      }

      console.log(`[Resume] Continuing stage chunking from chunk ${nextChunkIndex}/${effectiveChunkState.totalStageChunks}`);
      showStageOutput(
        spacesStageIndex,
        session.config as unknown as GenerationConfig,
        session.stageResults as unknown as StageResults,
        session.factpack as unknown as Factpack || null,
        chunkInfo
      );
      alert(`✅ Session Resumed!\n\nResumed at Spaces stage\nGenerating Space ${nextChunkIndex} of ${effectiveChunkState.totalStageChunks}\n\n${effectiveChunkState.liveMapSpaces?.length || 0} spaces already generated.`);
    } else if (session.currentStageIndex < STAGES.length - 1) {
      // Normal stage resume (no chunking or chunking complete)
      showStageOutput(
        session.currentStageIndex,
        session.config as unknown as GenerationConfig,
        session.stageResults as unknown as StageResults,
        session.factpack as unknown as Factpack || null
      );
      console.log('[Resume] Showing stage output for index:', session.currentStageIndex);
      alert(`✅ Session Resumed!\n\nResumed at Stage ${session.currentStageIndex + 1} of ${STAGES.length}\n\nYou can continue from where you left off.`);
    } else {
      // Generation was complete or at final stage
      console.log('[Resume] Session was already complete or at final stage');

      // Check if we have final output in stageResults
      const finalStageResults = session.stageResults as StageResults;
      const hasPhysicsValidator = finalStageResults.physics_validator;

      if (hasPhysicsValidator) {
        // Session was fully complete - restore the final output
        setIsComplete(true);
        const finalContent = hasPhysicsValidator;
        setFinalOutput(finalContent as JsonRecord);
        alert(`⚠️ Session Was Already Complete!\n\nThis generation finished all ${STAGES.length} stages.\n\nThe completed content is shown below. You cannot resume a completed session, but you can view and save the results.`);
      } else {
        // At final stage but not complete - show the stage
        showStageOutput(
          session.currentStageIndex,
          session.config as unknown as GenerationConfig,
          finalStageResults,
          session.factpack as unknown as Factpack || null
        );
        alert(`✅ Session Resumed!\n\nResumed at final stage (${STAGES[session.currentStageIndex].name})\nStage ${session.currentStageIndex + 1} of ${STAGES.length}\n\nComplete this stage to finish generation.`);
      }
    }
  };

  // Interface for fact group (used for chunking large factpacks)
  interface FactGroup {
    id: string;
    label: string;
    facts: CanonFact[];
    characterCount: number;
    entityTypes: string[];
    regions: string[];
  }

  // Helper function to intelligently group facts when total exceeds character limit
  const groupFactsIntelligently = (factpack: Factpack, maxCharsPerGroup: number = 8000): FactGroup[] => {
    const facts = factpack.facts;

    // Calculate total character count
    const totalChars = facts.reduce((sum, fact) => sum + fact.text.length, 0);

    console.log(`[Fact Grouping] Total facts: ${facts.length}, Total chars: ${totalChars}, Limit: ${maxCharsPerGroup}`);

    // If under limit, return single group
    if (totalChars <= maxCharsPerGroup) {
      return [{
        id: 'all',
        label: 'All Facts',
        facts,
        characterCount: totalChars,
        entityTypes: Array.from(new Set(facts.map(f => f.entity_type || 'unknown'))),
        regions: Array.from(new Set(facts.map(f => f.region || 'unspecified').filter(Boolean))),
      }];
    }

    // Group by entity type first, then by region within each type
    const typeGroups = new Map<string, Map<string, CanonFact[]>>();

    facts.forEach(fact => {
      const type = fact.entity_type || 'unknown';
      const region = fact.region || 'unspecified';

      if (!typeGroups.has(type)) {
        typeGroups.set(type, new Map());
      }

      const regionMap = typeGroups.get(type)!;
      if (!regionMap.has(region)) {
        regionMap.set(region, []);
      }

      regionMap.get(region)!.push(fact);
    });

    // Convert to flat groups with character counts
    const preliminaryGroups: FactGroup[] = [];
    let groupId = 0;

    for (const [type, regionMap] of typeGroups.entries()) {
      for (const [region, regionFacts] of regionMap.entries()) {
        const charCount = regionFacts.reduce((sum, fact) => sum + fact.text.length, 0);

        preliminaryGroups.push({
          id: `group-${groupId++}`,
          label: region !== 'unspecified' ? `${type} - ${region}` : type,
          facts: regionFacts,
          characterCount: charCount,
          entityTypes: [type],
          regions: region !== 'unspecified' ? [region] : [],
        });
      }
    }

    // Merge small groups and split large groups
    const finalGroups: FactGroup[] = [];
    let currentGroup: FactGroup | null = null;

    for (const group of preliminaryGroups.sort((a, b) => a.characterCount - b.characterCount)) {
      // If group exceeds limit, split it
      if (group.characterCount > maxCharsPerGroup) {
        // Split into multiple chunks
        const chunks: CanonFact[][] = [];
        let currentChunk: CanonFact[] = [];
        let currentChunkChars = 0;

        for (const fact of group.facts) {
          if (currentChunkChars + fact.text.length > maxCharsPerGroup && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkChars = 0;
          }

          currentChunk.push(fact);
          currentChunkChars += fact.text.length;
        }

        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }

        // Add each chunk as a separate group
        chunks.forEach((chunkFacts, index) => {
          finalGroups.push({
            id: `${group.id}-${index + 1}`,
            label: `${group.label} (Part ${index + 1}/${chunks.length})`,
            facts: chunkFacts,
            characterCount: chunkFacts.reduce((sum, fact) => sum + fact.text.length, 0),
            entityTypes: group.entityTypes,
            regions: group.regions,
          });
        });
      }
      // If we can merge with current group without exceeding limit
      else if (currentGroup && (currentGroup.characterCount + group.characterCount <= maxCharsPerGroup)) {
        currentGroup.facts.push(...group.facts);
        currentGroup.characterCount += group.characterCount;
        currentGroup.entityTypes = Array.from(new Set([...currentGroup.entityTypes, ...group.entityTypes]));
        currentGroup.regions = Array.from(new Set([...currentGroup.regions, ...group.regions]));
        currentGroup.label = currentGroup.entityTypes.length > 1
          ? `Mixed (${currentGroup.entityTypes.join(', ')})`
          : currentGroup.entityTypes[0];
      }
      // Start a new group
      else {
        if (currentGroup) {
          finalGroups.push(currentGroup);
        }
        currentGroup = { ...group };
      }
    }

    // Add final group if exists
    if (currentGroup) {
      finalGroups.push(currentGroup);
    }

    console.log(`[Fact Grouping] Created ${finalGroups.length} groups:`, finalGroups.map(g => ({
      label: g.label,
      facts: g.facts.length,
      chars: g.characterCount,
    })));

    return finalGroups;
  };

  // Helper function to merge chunk outputs from a single stage
  const mergeChunkOutputs = (chunkResults: JsonRecord[], stageName: string): JsonRecord => {
    if (chunkResults.length === 0) {
      return {};
    }

    if (chunkResults.length === 1) {
      return chunkResults[0];
    }

    console.log(`[Merge Chunks] Merging ${chunkResults.length} chunk results for stage ${stageName}`);

    // Start with the first chunk as base
    const merged = { ...chunkResults[0] };

    // For Planner stage: merge threads, retrieval_hints, use LAST chunk's proposals
    if (stageName === 'Planner' || stageName === 'Outline & Structure') {
      const allThreads = new Set<string>();  // Use Set to deduplicate
      const allRetrievalHints = {
        entities: new Set<string>(),
        regions: new Set<string>(),
        eras: new Set<string>(),
        keywords: new Set<string>(),
      };

      chunkResults.forEach((chunk) => {
        // Merge threads (deduplicate)
        if (Array.isArray(chunk.threads)) {
          chunk.threads.forEach((thread: unknown) => allThreads.add(String(thread)));
        }

        // Merge retrieval hints
        if (chunk.retrieval_hints && typeof chunk.retrieval_hints === 'object') {
          const hints = chunk.retrieval_hints as Record<string, unknown>;
          if (Array.isArray(hints.entities)) hints.entities.forEach((e: unknown) => allRetrievalHints.entities.add(String(e)));
          if (Array.isArray(hints.regions)) hints.regions.forEach((r: unknown) => allRetrievalHints.regions.add(String(r)));
          if (Array.isArray(hints.eras)) hints.eras.forEach((e: unknown) => allRetrievalHints.eras.add(String(e)));
          if (Array.isArray(hints.keywords)) hints.keywords.forEach((k: unknown) => allRetrievalHints.keywords.add(String(k)));
        }
      });

      // UPDATED: Aggregate proposals from ALL chunks, not just the last one
      // Each chunk may have asked unique questions about different aspects
      const allProposals: unknown[] = [];
      chunkResults.forEach((chunk) => {
        if (Array.isArray(chunk.proposals)) {
          allProposals.push(...chunk.proposals);
        }
      });

      console.log(`[Merge Chunks] Collected ${allProposals.length} proposals from all ${chunkResults.length} chunks`);

      merged.threads = Array.from(allThreads);  // Convert Set back to Array
      merged.proposals = allProposals;
      merged.retrieval_hints = {
        entities: Array.from(allRetrievalHints.entities),
        regions: Array.from(allRetrievalHints.regions),
        eras: Array.from(allRetrievalHints.eras),
        keywords: Array.from(allRetrievalHints.keywords),
      };

      console.log(`[Merge Chunks] Merged Planner: ${allThreads.size} unique threads, ${allProposals.length} proposals (from all chunks)`);
    }

    // For Creator/other stages: use last chunk as base
    else {
      const lastChunk = chunkResults[chunkResults.length - 1];
      Object.assign(merged, lastChunk);

      // UPDATED: Aggregate proposals from ALL chunks, not just the last one
      // Each chunk may have asked unique questions about different aspects
      const allProposals: unknown[] = [];
      chunkResults.forEach((chunk) => {
        if (Array.isArray(chunk.proposals)) {
          allProposals.push(...chunk.proposals);
        }
      });

      if (allProposals.length > 0) {
        merged.proposals = allProposals;
      }

      console.log(`[Merge Chunks] Merged ${stageName}: ${allProposals.length} proposals (from all ${chunkResults.length} chunks)`);
    }

    return merged;
  };

  // Helper function to check if factpack needs chunking and show modal if needed
  const checkForChunking = (factpack: Factpack, stageName?: string): boolean => {
    // SPECIAL CASE: NPC Creator stage uses section-based chunking
    // This forces controlled chunking by NPC section (Basic Info, Stats, Combat, etc.)
    // rather than by fact size
    if (config?.type === 'npc' && stageName === 'Creator') {
      console.log(`🎯 [NPC Section Chunking] Detected NPC Creator stage - forcing section-based chunking`);
      const sections = getNpcSectionChunks();
      setNpcSectionChunks(sections);
      setCurrentNpcSectionIndex(0);
      setIsNpcSectionChunking(true);
      setAccumulatedNpcSections({});
      console.log(`├─ Total Sections: ${sections.length}`);
      console.log(`└─ Sections: ${sections.map(s => s.chunkLabel).join(', ')}`);

      // Show chunking modal with NPC sections
      setShowChunkingModal(true);
      return true; // Always chunk NPCs by section
    }

    // Normal fact-based chunking for non-NPC stages
    const totalChars = factpack.facts.reduce((sum, fact) => sum + fact.text.length, 0);

    // Calculate available space based on typical stage overhead
    // Using conservative estimates for overhead
    const typicalSystemPromptSize = 2000; // Most stages have 1500-2500 char system prompts
    const typicalUserPromptBase = 800; // Config, type, flags, formatting
    const typicalAccumulatedAnswers = 1000; // Grows over stages
    const typicalNpcSchema = (config?.type === 'npc' || config?.type === 'monster') ? 600 : 0;

    const estimatedOverhead = typicalSystemPromptSize + typicalUserPromptBase + typicalAccumulatedAnswers + typicalNpcSchema + 200; // +200 formatting
    const availableForFacts = Math.max(1000, PROMPT_LIMITS.AI_HARD_LIMIT - estimatedOverhead); // Minimum 1000 chars for facts

    console.log(`[Fact Chunking Check] Stage: ${stageName || 'Unknown'}`);
    console.log(`├─ Total Facts: ${factpack.facts.length} facts, ${totalChars.toLocaleString()} chars`);
    console.log(`├─ Estimated Overhead: ${estimatedOverhead.toLocaleString()} chars`);
    console.log(`├─ Available for Facts: ${availableForFacts.toLocaleString()} chars`);
    console.log(`└─ Needs Chunking: ${totalChars > availableForFacts ? 'YES' : 'NO'}`);

    if (totalChars > availableForFacts) {
      console.log(`⚠️ [Fact Chunking] Facts (${totalChars.toLocaleString()}) exceed available space (${availableForFacts.toLocaleString()}). Showing chunking modal.`);
      const groups = groupFactsIntelligently(factpack, availableForFacts);
      setFactGroups(groups);
      setShowChunkingModal(true);
      return true; // Needs chunking
    }

    return false; // No chunking needed
  };

  // Helper function to merge factpacks (avoid duplicates)
  const mergeFactpacks = (existing: Factpack, newFacts: Factpack): Factpack => {
    const existingChunkIds = new Set(existing.facts.map(f => f.chunk_id));
    const uniqueNewFacts = newFacts.facts.filter(f => !existingChunkIds.has(f.chunk_id));

    const existingEntityIds = new Set(existing.entities);
    const uniqueNewEntities = newFacts.entities.filter(e => !existingEntityIds.has(e));

    const merged = {
      facts: [...existing.facts, ...uniqueNewFacts],
      entities: [...existing.entities, ...uniqueNewEntities],
      gaps: [...existing.gaps, ...newFacts.gaps],
    };

    // Always deduplicate the merged result to ensure no duplicates slip through
    return deduplicateFactpack(merged);
  };

  // Helper function to search canon with keywords
  const searchCanonWithKeywords = async (keywords: string[]): Promise<Factpack> => {
    try {
      // Fetch all linked entities for this project (expands collections)
      const response = await fetch(`${API_BASE_URL}/canon/projects/${projectId}/entities`);

      if (!response.ok) {
        throw new Error(`Failed to fetch entities: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

    const relevantEntities: CanonEntity[] = Array.isArray(data)
      ? data.filter((entity): entity is CanonEntity => Boolean(entity && typeof entity === 'object' && '_id' in entity))
      : [];

    const slugify = (s: string) => s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const keywordSlugs = keywords
      .map((k) => (typeof k === 'string' ? slugify(k) : ''))
      .filter((k) => k.length > 0);

    const keywordSet = new Set(keywordSlugs);
    const regionAnchors = new Set(['snowdown', 'westphal']);

    // Score entities based on match quality
    // Priority: Tags (1000) > Canonical Name/Title (500) > ID/Aliases (300) > Type/Region (100) > Claims (10)
    const scoredEntities = relevantEntities.map((entity) => {
      let score = 0;
      const matchReasons: string[] = [];

      const id = entity._id || '';
      const leafId = id.includes('.') ? id.split('.').pop() || id : id;
      const nameSlug = entity.canonical_name ? slugify(entity.canonical_name) : '';
      const aliasSlugs = toStringArray(entity.aliases).map(slugify);
      const regionSlug = entity.region ? slugify(entity.region) : '';
      const typeSlug = entity.type ? slugify(entity.type) : '';
      const tags = toStringArray(entity.tags || []).map(slugify);

      // PRIORITY 1: Tags (HIGHEST - 1000 points per match)
      for (const keyword of keywordSet) {
        if (tags.includes(keyword)) {
          score += 1000;
          matchReasons.push(`tag:${keyword}`);
        }
      }

      // PRIORITY 2: Canonical Name/Title (HIGH - 500 points)
      if (nameSlug && keywordSet.has(nameSlug)) {
        score += 500;
        matchReasons.push(`name:${nameSlug}`);
      }

      // Check for partial name matches (250 points)
      for (const keyword of keywordSet) {
        if (nameSlug && nameSlug.includes(keyword) && keyword.length > 3) {
          score += 250;
          matchReasons.push(`name_partial:${keyword}`);
        }
      }

      // PRIORITY 3: ID and Aliases (MEDIUM-HIGH - 300 points)
      if (keywordSet.has(leafId)) {
        score += 300;
        matchReasons.push(`id:${leafId}`);
      }

      if (aliasSlugs.some((a) => keywordSet.has(a))) {
        score += 300;
        const matchedAlias = aliasSlugs.find((a) => keywordSet.has(a));
        matchReasons.push(`alias:${matchedAlias}`);
      }

      // PRIORITY 4: Type and Region (MEDIUM - 100 points)
      if (typeSlug && keywordSet.has(typeSlug)) {
        score += 100;
        matchReasons.push(`type:${typeSlug}`);
      }

      if (regionSlug) {
        for (const keyword of keywordSet) {
          if (regionSlug.includes(keyword)) {
            score += 100;
            matchReasons.push(`region:${keyword}`);
          }
        }
      }

      // Region anchors (special boost)
      if (regionAnchors.has(leafId) && keywordSet.has(leafId)) {
        score += 200;
        matchReasons.push('region_anchor');
      }

      // PRIORITY 5: Claims/Description (LOW - 10 points per match)
      // Only search claims for multi-word keywords or when we have no better matches
      const multiWordKeywords = keywords.filter(k =>
        typeof k === 'string' && k.trim().split(/\s+/).length >= 2
      ).map(slugify);

      const searchInClaims = multiWordKeywords.length > 0 || score === 0;

      if (searchInClaims) {
        const claims = toObjectArray(entity.claims);
        for (const claim of claims) {
          const claimText = getString(claim, 'text') || '';
          const claimSlug = slugify(claimText);

          for (const keyword of (multiWordKeywords.length > 0 ? multiWordKeywords : Array.from(keywordSet))) {
            if (claimSlug.includes(keyword) && keyword.length > 3) {
              score += 10;
              matchReasons.push(`claim:${keyword}`);
            }
          }
        }
      }

      return {
        entity,
        score,
        matchReasons,
      };
    });

    // Filter to only entities with matches (score > 0) and sort by score
    const keywordMatches = scoredEntities
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => {
        console.log(`[Canon Match] ${item.entity.canonical_name} (score: ${item.score}, reasons: ${item.matchReasons.join(', ')})`);
        return item.entity;
      });

    console.log(`[ManualGenerator] Filtered to ${keywordMatches.length} relevant entities from ${relevantEntities.length} total`);
    console.log(`[ManualGenerator] Keywords searched: ${keywords.join(', ')}`);

    // Build factpack with prioritized entities
    const facts: CanonFact[] = [];
    keywordMatches.forEach((entity) => {
      toObjectArray(entity.claims).forEach((claim, index) => {
        facts.push({
          chunk_id: `${entity._id}#c${index + 1}`,
          text: getString(claim, 'text') || 'No description available',
          entity_id: entity._id,
          entity_name: entity.canonical_name || 'Unknown',
          entity_type: entity.type,
          region: entity.region,
          era: entity.era,
          tags: toStringArray(entity.tags || []),
        });
      });
    });

    return {
      facts,
      entities: keywordMatches.map((e) => e._id),
      gaps: facts.length === 0 ? ['No relevant canon found for these keywords'] : [],
    };
    } catch (error) {
      console.error('[searchCanonWithKeywords] Error fetching canon:', error);
      // Return empty factpack on error rather than breaking the workflow
      return {
        facts: [],
        entities: [],
        gaps: [`Error searching canon: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  };

  const handleUploadedJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const text = await file.text();

      const parseResult = parseAIResponse<JsonRecord>(text);
      if (!parseResult.success) {
        const errorMessage = formatParseError(parseResult);
        throw new Error(`Invalid JSON file:\n\n${errorMessage}`);
      }

      const parsed: JsonRecord = parseResult.data || {};

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Uploaded JSON must represent an object with content fields.');
      }

      // CRITICAL FIX: Check if this is a saved generation output with nested structure
      let contentToUse: JsonRecord = parsed;

      // Check if this is NPC with multi-stage Creator structure
      if (parsed._pipeline_stages &&
          typeof parsed._pipeline_stages === 'object' &&
          (parsed.deliverable === 'npc' || parsed.type === 'npc')) {
        console.log('[Upload] Detected NPC with multi-stage Creator structure, using intelligent merger');

        const { mergeNpcStages } = await import('../utils/npcStageMerger');
        const mergeResult = mergeNpcStages(parsed._pipeline_stages as Record<string, JsonRecord>);

        contentToUse = mergeResult.merged;

        // Merge in the top-level metadata
        if (parsed.deliverable) contentToUse.deliverable = parsed.deliverable;
        if (parsed.title) contentToUse.title = parsed.title;
        if (parsed.type) contentToUse.type = parsed.type;
        if (parsed.fact_check_report) contentToUse.fact_check_report = parsed.fact_check_report;
        if (parsed.conflicts) contentToUse.conflicts = parsed.conflicts;
        if (parsed.physics_issues) contentToUse.physics_issues = parsed.physics_issues;

        console.log('[Upload] NPC intelligently merged:', {
          totalFields: Object.keys(contentToUse).length,
          conflicts: mergeResult.conflicts.length,
          warnings: mergeResult.warnings,
        });

        // Log conflicts
        if (mergeResult.conflicts.length > 0) {
          console.warn('[Upload NPC Merge Conflicts]', mergeResult.conflicts);
        }
      }
      // If the uploaded JSON has _pipeline_stages with physics_validator.content.content, extract it
      else if (parsed._pipeline_stages &&
          typeof parsed._pipeline_stages === 'object' &&
          (parsed._pipeline_stages as any).physics_validator?.content?.content) {
        console.log('[Upload] Detected saved generation output, extracting content from physics_validator');
        contentToUse = (parsed._pipeline_stages as any).physics_validator.content.content as JsonRecord;

        // Merge in the top-level metadata if present
        if (parsed.deliverable) contentToUse.deliverable = parsed.deliverable;
        if (parsed.fact_check_report) contentToUse.fact_check_report = parsed.fact_check_report;
        if (parsed.conflicts) contentToUse.conflicts = parsed.conflicts;
        if (parsed.physics_issues) contentToUse.physics_issues = parsed.physics_issues;
        if (parsed.logic_score) contentToUse.logic_score = parsed.logic_score;
        if (parsed.balance_notes) contentToUse.balance_notes = parsed.balance_notes;
        if (parsed.canon_alignment_score) contentToUse.canon_alignment_score = parsed.canon_alignment_score;
        if (parsed.validation_notes) contentToUse.validation_notes = parsed.validation_notes;
        if (parsed.proposals) contentToUse.proposals = parsed.proposals;
      }

      // Check if this is a monster with stage structure (basic_info, stats_&_defenses, etc.)
      // If so, flatten the stages into a single object
      if (uploadedContentType === 'monster' &&
          (contentToUse['stats_&_defenses'] || contentToUse['combat_&_abilities'] ||
           contentToUse['legendary_&_lair'] || contentToUse['ecology_&_lore'])) {
        console.log('[Upload] Detected monster with stage structure, flattening...');

        // Extract stage data
        const statsDefenses = (contentToUse['stats_&_defenses'] as JsonRecord) || {};
        const combatAbilities = (contentToUse['combat_&_abilities'] as JsonRecord) || {};
        const legendaryLair = (contentToUse['legendary_&_lair'] as JsonRecord) || {};
        const ecologyLore = (contentToUse['ecology_&_lore'] as JsonRecord) || {};

        // Merge all stage results, with later stages overwriting earlier ones
        // TOP-LEVEL fields (name, description, etc.) should be preserved
        // STAGE fields (ability_scores, actions, etc.) from stages should be used
        const flattened = {
          ...contentToUse,  // Keep top-level fields like name, description
          ...statsDefenses,
          ...combatAbilities,
          ...legendaryLair,
          ...ecologyLore,
        };

        // Remove the stage containers
        delete flattened['stats_&_defenses'];
        delete flattened['combat_&_abilities'];
        delete flattened['legendary_&_lair'];
        delete flattened['ecology_&_lore'];

        contentToUse = flattened;
        console.log('[Upload] Monster stages flattened');
      }

      // Use the user's selected deliverable type from the dropdown
      // This allows users to correct mistyped uploads (e.g., monster labeled as npc)
      const normalized: JsonRecord = {
        ...contentToUse,
        deliverable: uploadedContentType, // Use dropdown selection, not inferred
        type: uploadedContentType, // Also set type field to match deliverable
      };

      // Monster-specific normalization
      if (uploadedContentType === 'monster') {
        // Keep hit_points as-is (integer or object {average, formula}) - schema accepts both
        // Don't convert to string

        // Normalize saving throws: ensure value is string, remove notes
        if (Array.isArray(normalized.saving_throws)) {
          normalized.saving_throws = normalized.saving_throws.map((st: any) => {
            if (st && typeof st === 'object') {
              return {
                name: st.name,
                value: typeof st.value === 'number' ? (st.value >= 0 ? `+${st.value}` : `${st.value}`) : String(st.value),
                // Omit notes - schema doesn't require it
              };
            }
            return st;
          });
        }

        // Normalize skill proficiencies: ensure value is string, remove notes
        if (Array.isArray(normalized.skill_proficiencies)) {
          normalized.skill_proficiencies = normalized.skill_proficiencies.map((skill: any) => {
            if (skill && typeof skill === 'object') {
              return {
                name: skill.name,
                value: typeof skill.value === 'number' ? (skill.value >= 0 ? `+${skill.value}` : `${skill.value}`) : String(skill.value),
                // Omit notes - schema doesn't require it
              };
            }
            return skill;
          });
        }
      }

      if (!('title' in normalized) || typeof normalized.title !== 'string') {
        const canonicalName = 'canonical_name' in contentToUse && typeof contentToUse.canonical_name === 'string'
          ? contentToUse.canonical_name
          : undefined;
        normalized.title = canonicalName || file.name.replace(/\.json$/i, '');
      }

      console.log('[Upload] Normalized content:', normalized);

      resetPipelineState();
      const rawProposals = (normalized as Record<string, unknown>)['proposals'] as unknown;
      const proposals: Proposal[] = Array.isArray(rawProposals)
        ? (rawProposals as unknown[])
            .map((p) => (isRecord(p) ? p : null))
            .filter((p): p is JsonRecord => p !== null)
            .map((p: JsonRecord) => ({
              question: getString(p, 'question') || 'Unspecified',
              options: toStringArray((p as Record<string, unknown>)['options']),
              rule_impact: getString(p, 'rule_impact') || '',
            }))
        : [];

      const rawConflicts = (normalized as Record<string, unknown>)['conflicts'] as unknown;
      const conflicts: Conflict[] = Array.isArray(rawConflicts)
        ? (rawConflicts as unknown[])
            .map((c) => (isRecord(c) ? c : null))
            .filter((c): c is JsonRecord => c !== null)
            .map((c: JsonRecord) => ({
              new_claim: getString(c, 'new_claim') || '',
              existing_claim: getString(c, 'existing_claim') || '',
              entity_id: getString(c, 'entity_id') || '',
              entity_name: getString(c, 'entity_name') || '',
              resolution: (getString(c, 'resolution') as Conflict['resolution']) || undefined,
            }))
        : [];

      setResolvedProposals(proposals);
      setResolvedConflicts(conflicts);
      setFinalOutput(normalized);
      setIsComplete(true);

      const titleText = typeof (normalized as JsonRecord).title === 'string'
        ? ((normalized as JsonRecord).title as string)
        : String(((normalized as JsonRecord).title as unknown) ?? 'Untitled');
      alert(`✅ Uploaded content loaded!\n\nTitle: ${titleText}\nDeliverable: ${uploadedContentType}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process uploaded JSON.';
      setUploadError(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleGenerate = async (generationConfig: GenerationConfig) => {
    setConfig(generationConfig);
    setStageResults({});
    setError(null);
    setIsComplete(false);
    setFinalOutput(null);

    // Create a new progress session for auto-save
    if (autoSaveEnabled) {
      const session = createProgressSession(generationConfig as unknown as import('../utils/generationProgress').GenerationConfig);
      setProgressSession(session);
      await saveProgress(session);
      console.log('[Auto-Save] New generation session created:', session.sessionId);
    }

    // Handle homebrew document extraction differently
    if (generationConfig.type === 'homebrew' && generationConfig.homebrewFile) {
      try {
        // Upload file to backend for chunking
        const formData = new FormData();
        formData.append('file', generationConfig.homebrewFile);

        const response = await fetch(`${API_BASE_URL}/homebrew/chunk`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to process homebrew file');
        }

        const chunkData = await response.json();

        console.log(`[Homebrew] File chunked into ${chunkData.totalChunks} chunks`);

        // Store chunks in state for sequential processing
        const homebrewChunks = chunkData.chunks;

        // Start processing first chunk
        setCurrentStageIndex(0);
        setStageResults({ homebrew_chunks: homebrewChunks, current_chunk: 0 });

        // Initialize empty factpack (not used for homebrew)
        setFactpack({
          facts: [],
          entities: [],
          gaps: [],
        });

        // Show the first chunk prompt
        setCurrentPrompt(homebrewChunks[0].prompt);
        setModalMode('output');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process homebrew file';
        setError(`Homebrew extraction error: ${message}`);
      }
      return;
    }

    // Normal flow for other content types
    setCurrentStageIndex(0); // Start at Keyword Extractor (index 0)

    // Initialize empty factpack - will be populated after keyword extraction
    setFactpack({
      facts: [],
      entities: [],
      gaps: ['Factpack will be populated after the initial stage'],
    });

    // Show first stage prompt (Keyword Extractor)
    showStageOutput(0, generationConfig, {} as StageResults, null);
  };

  const showStageOutput = async (
    stageIndex: number,
    cfg: GenerationConfig,
    results: StageResults,
    fp: Factpack | null,
    chunkInfo?: { isChunked: boolean; currentChunk: number; totalChunks: number; chunkLabel: string },
    unansweredProposals?: unknown[]
  ) => {
    // Compute stages dynamically from cfg parameter to avoid React state timing issues
    const stages = getStages(cfg, dynamicNpcStages);
    const stage = stages[stageIndex];

    // Store chunkInfo in state so it persists across stages
    if (chunkInfo) {
      setCurrentChunkInfo(chunkInfo);
    }

    // Limit accumulated answers to prevent exceeding character limits in the JSON prompt
    const limitedDecisions = Object.keys(accumulatedAnswers).length > 0
      ? limitAccumulatedAnswers(accumulatedAnswers, 4000)
      : undefined;

    // Check if this is an NPC or Monster generation stage that needs schema guidance
    const isNpcStage = cfg.type === 'npc' && (stage.name === 'Creator' || stage.name === 'Stylist');
    const isMonsterStage = cfg.type === 'monster' && (stage.name === 'Creator' || stage.name === 'Stylist');
    let npcSchemaGuidance: string | undefined;

    if (isNpcStage) {
      npcSchemaGuidance = `
⚠️ CRITICAL: NPC OUTPUT SCHEMA ⚠️

Your NPC output MUST conform to the schema structure. Use EXACT field names:

REQUIRED FIELDS:
- name (string), description (string, min 20 chars), race, class_levels
- ability_scores: {str, dex, con, int, wis, cha} - LOWERCASE ONLY
- proficiency_bonus, personality: {traits[], ideals[], bonds[], flaws[]}
- motivations[], rule_base, sources_used[], assumptions[], proposals[], canon_update

CHARACTER BUILD FIELDS (CRITICAL for D&D NPCs with class levels):
- class_features: Array<{name, description, level, source, uses?, notes?}> — ALL base class features from level 1 to character level
- subclass_features: Array<{name, description, level, source, uses?, notes?}> — ALL subclass/archetype features
- racial_features: Array<{name, description, source?, notes?}> — ALL racial traits (Darkvision, Fey Ancestry, etc.)
- feats: Array<{name, description, source?, prerequisite?, notes?}> — ALL feats from ASI, background, racial bonus
- asi_choices: Array<{level, choice, details?, source_class?}> — ASI/feat choices at each ASI level
- background_feature: {background_name, feature_name, description, origin_feat?, skill_proficiencies?, tool_proficiencies?}

CRITICAL NAMING RULES:
1. Ability scores: Use LOWERCASE: str, dex, con, int, wis, cha (NOT STR, DEX, etc.)
2. Special abilities: Use "abilities" field (NOT "traits")
3. Equipment: Flat array of strings (NOT nested under "carried")
4. Magic items: Array of strings or objects with "name" property
5. Personality: Nested object {traits: [], ideals: [], bonds: [], flaws: []}

Example (CORRECT): {"ability_scores": {"str": 18, "dex": 16, ...}, "personality": {"traits": ["Brave"], ...}}
Example (WRONG): {"ability_scores": {"STR": 18, ...}, "personality_traits": ["Brave"], ...}

Validation will reject incorrect field names.`;
    }

    if (isMonsterStage) {
      npcSchemaGuidance = `
⚠️ CRITICAL: MONSTER OUTPUT SCHEMA ⚠️

Your Monster output MUST conform to the D&D 5e monster stat block schema. Use EXACT field names:

REQUIRED FIELDS:
- name (string), description (string, min 20 chars)
- size (string): Tiny, Small, Medium, Large, Huge, or Gargantuan
- creature_type (string): Aberration, Beast, Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, or Undead
- alignment (string), challenge_rating (string like "1/4", "1", "5"), experience_points (integer)
- ability_scores: {str, dex, con, int, wis, cha} - LOWERCASE ONLY, integers 1-30
- proficiency_bonus (integer +2 to +9 based on CR)
- armor_class (integer or object), hit_points (integer or object with average/formula)
- actions[] (array of objects with name, description)
- rule_base, sources_used[], assumptions[], proposals[], canon_update

OPTIONAL BUT COMMON:
- subtype, speed {walk, fly, swim, climb, burrow, hover}
- saving_throws[], skill_proficiencies[], damage_resistances[], damage_immunities[]
- condition_immunities[], senses[], languages[], abilities[]
- bonus_actions[], reactions[], legendary_actions {summary, options[]}
- tactics (combat strategy), ecology (habitat/behavior), lore (background)

CRITICAL NAMING RULES:
1. Ability scores: LOWERCASE only (str, dex, con, int, wis, cha)
2. Actions/abilities: Use "actions" for attacks, "abilities" for passive features
3. CR as string: "1/8", "1/4", "1/2", "1", "5", "20" etc.
4. Arrays of objects must have "name" and "description" fields minimum

Example (CORRECT): {"size": "Large", "creature_type": "Dragon", "challenge_rating": "10", "ability_scores": {"str": 23, "dex": 10, ...}}

Validation will reject incorrect field names or missing required fields.`;
    }

    // Don't condense system prompts - preserve quality
    // If chunking is needed, chunk 1 can have zero facts and all facts go to chunks 2+
    const actualSystemPrompt = stage.systemPrompt;

    const stageNeedsCanon = stage.name !== 'Purpose' && stage.name !== 'Keyword Extractor';

    // Only use factpack if this stage needs canon AND we have facts
    let limitedFactpack: Factpack | null = null;
    if (stageNeedsCanon) {
      limitedFactpack = fp || factpack; // Use provided factpack or fallback to state

      // Filter canon for location stages - only World/Setting and Locations
      const isLocationStage = ['Foundation', 'Spaces', 'Details', 'Accuracy Refinement'].includes(stage.name);
      if (isLocationStage && limitedFactpack && limitedFactpack.facts) {
        const filteredFacts = limitedFactpack.facts.filter(fact => {
          const type = fact.type?.toLowerCase();
          return type === 'world' || type === 'setting' || type === 'location';
        });
        console.log(`[Canon Filter] Location stage "${stage.name}": Filtered ${limitedFactpack.facts.length} facts to ${filteredFacts.length} (World/Setting/Location only)`);
        limitedFactpack = {
          ...limitedFactpack,
          facts: filteredFacts,
        };
      }
    } else {
      // For non-canon stages (Purpose, Keyword Extractor), always use null
      limitedFactpack = null;
    }

    let spaceCalculation: ReturnType<typeof calculateAvailableFactSpace> | null = null;

    let hasCanonFacts = false;

    const hasFactpackFacts =
      !!(limitedFactpack && Array.isArray(limitedFactpack.facts) && limitedFactpack.facts.length > 0);

    if (hasFactpackFacts) {
      // Calculate available space ONLY for stages that use facts
      // Build minimal context to get accurate user prompt size

      // Build NPC section context for estimation if needed
      let minimalNpcContext: StageContext['npcSectionContext'] | undefined;
      if (isNpcSectionChunking && stage.name === 'Creator') {
        const currentSection = npcSectionChunks[currentNpcSectionIndex] || null;
        minimalNpcContext = {
          isNpcSectionChunking: true,
          currentSectionIndex: currentNpcSectionIndex,
          currentSection: currentSection,
          accumulatedSections: accumulatedNpcSections,
        };
      }

      const minimalContext: StageContext = {
        config: cfg,
        stageResults: results,
        factpack: { facts: [], entities: [], gaps: [] }, // Empty factpack for estimation
        chunkInfo: chunkInfo || currentChunkInfo,
        previousDecisions: limitedDecisions,
        unansweredProposals: unansweredProposals,
        npcSectionContext: minimalNpcContext,
      };

      const userPromptWithoutFacts = stage.buildUserPrompt(minimalContext);

      const stageEmbedsCanonFacts = userPromptWithoutFacts.includes('"relevant_canon"');
      hasCanonFacts = stageEmbedsCanonFacts;

      if (!stageEmbedsCanonFacts) {
        console.log(`[Fact Space] ${stage.name}: Prompt does not embed canon facts (likely using canon_reference). Skipping fact chunking check.`);
      }

      if (!stageEmbedsCanonFacts) {
        spaceCalculation = null;
      } else {

        spaceCalculation = calculateAvailableFactSpace(
          actualSystemPrompt,  // Use condensed prompt if needed
          userPromptWithoutFacts,  // This already includes previousDecisions in the JSON
          {
            // Don't pass accumulated answers - they're already in userPromptWithoutFacts via previousDecisions
            accumulatedAnswers: undefined,
            npcSchemaGuidance,
            forceIncludeSchema: isNpcStage,
          }
        );

      console.log(`\n📐 Available Fact Space Calculation for ${stage.name}:`);
      console.log(`├─ System Prompt: ${spaceCalculation.breakdown.systemPrompt.toLocaleString()} chars`);
      console.log(`├─ User Prompt Base: ${spaceCalculation.breakdown.userPromptBase.toLocaleString()} chars`);
      console.log(`├─ Formatting: ${spaceCalculation.breakdown.formatting.toLocaleString()} chars`);
      console.log(`├─ Accumulated Answers: ${spaceCalculation.breakdown.accumulatedAnswers.toLocaleString()} chars`);
      console.log(`├─ NPC Schema: ${spaceCalculation.breakdown.npcSchema.toLocaleString()} chars`);
      console.log(`├─ Total Overhead: ${spaceCalculation.overhead.toLocaleString()} chars`);
      console.log(`└─ Available for Facts: ${spaceCalculation.availableForFacts.toLocaleString()} chars\n`);

      const totalFactChars = limitedFactpack.facts.reduce((sum, f) => sum + f.text.length, 0);

      if (totalFactChars > spaceCalculation.availableForFacts) {
        console.warn(`⚠️ Facts (${totalFactChars.toLocaleString()} chars) exceed available space (${spaceCalculation.availableForFacts.toLocaleString()} chars).`);

        // If we have enough facts to chunk, trigger chunking instead of trimming
        // BUT: don't re-trigger if we're already in multi-part mode (prevents infinite loops)
        if (limitedFactpack.facts.length > 10 && !isMultiPartGeneration) {
          console.log(`📦 Triggering chunking for ${stage.name} stage (${limitedFactpack.facts.length} facts, ${totalFactChars.toLocaleString()} chars)`);

          // IMPORTANT: Chunk 1 uses full prompt (limited space), but chunks 2+ use minimal prompts (much more space)
          // Estimate minimal prompt overhead: ~500 chars system + ~200 chars user base + ~200 formatting = ~900 chars
          const minimalPromptOverhead = 900;
          const availableForSubsequentChunks = PROMPT_LIMITS.AI_HARD_LIMIT - minimalPromptOverhead;

          // CRITICAL: Chunk 1 needs LESS space because we add multi-part instructions (~300 chars) to system prompt
          const multiPartInstructionsOverhead = 300;
          const availableForChunk1 = Math.max(0, spaceCalculation.availableForFacts - multiPartInstructionsOverhead);

          console.log(`📊 Chunking Strategy:`);
          console.log(`   Chunk 1 space: ${availableForChunk1.toLocaleString()} chars (full prompt + multi-part instructions)`);
          console.log(`   Chunks 2+ space: ${availableForSubsequentChunks.toLocaleString()} chars each (with minimal prompts)`);

          // Group facts intelligently - use the larger limit for subsequent chunks
          const groups = groupFactsIntelligently(limitedFactpack, availableForSubsequentChunks);

          // If chunk 1 has very little space (<500 chars), give it ZERO facts and put everything in chunks 2+
          if (availableForChunk1 < 500) {
            console.log(`⚠️ Chunk 1 has minimal space (${availableForChunk1} chars). Putting ALL facts in chunks 2+.`);

            // Create empty chunk 1 + all fact groups
            const newGroups: FactGroup[] = [
              {
                id: 'chunk1-intro',
                label: 'Introduction (No Facts)',
                facts: [],
                characterCount: 0,
                entityTypes: [],
                regions: [],
              },
              ...groups,
            ];

            setFactGroups(newGroups);
            console.log(`📦 Created ${newGroups.length} groups: 1 intro + ${groups.length} fact groups`);
          }
          // Otherwise, try to fit some facts in chunk 1
          else if (groups.length > 0 && groups[0].characterCount > availableForChunk1) {
            console.log(`⚠️ First group (${groups[0].characterCount} chars) exceeds chunk 1 space (${availableForChunk1} chars). Splitting...`);

            // Split first group into two: some for chunk 1, rest goes into chunk 2
            const firstGroupFacts = groups[0].facts;
            const chunk1Facts: CanonFact[] = [];
            let chunk1Chars = 0;
            let remainingFactsIndex = 0;

            for (let i = 0; i < firstGroupFacts.length; i++) {
              if (chunk1Chars + firstGroupFacts[i].text.length <= availableForChunk1) {
                chunk1Facts.push(firstGroupFacts[i]);
                chunk1Chars += firstGroupFacts[i].text.length;
                remainingFactsIndex = i + 1;
              } else {
                break;
              }
            }

            // Create new groups array with split first group
            const remainingFacts = firstGroupFacts.slice(remainingFactsIndex);
            const newGroups: FactGroup[] = [
              {
                ...groups[0],
                id: 'chunk1',
                label: `${groups[0].label} (Chunk 1 - ${chunk1Facts.length} facts)`,
                facts: chunk1Facts,
                characterCount: chunk1Chars,
              },
              {
                ...groups[0],
                id: 'chunk2-part1',
                label: `${groups[0].label} (Continued)`,
                facts: remainingFacts,
                characterCount: remainingFacts.reduce((sum, f) => sum + f.text.length, 0),
              },
              ...groups.slice(1), // Rest of the groups
            ];

            setFactGroups(newGroups);
            console.log(`📦 Split into ${newGroups.length} groups for efficient chunking`);
          } else {
            setFactGroups(groups);
          }

          setShowChunkingModal(true);
          setPendingFactpack(limitedFactpack);

          const estimatedChunks = Math.max(2, Math.ceil((totalFactChars - spaceCalculation.availableForFacts) / availableForSubsequentChunks) + 1);
          setError(`The ${stage.name} stage has too much canon data (${totalFactChars.toLocaleString()} chars) to fit in one prompt (only ${spaceCalculation.availableForFacts.toLocaleString()} chars available for facts after prompt overhead). Estimated ${estimatedChunks} chunks needed. Please approve chunking.`);
          return; // Stop here and wait for user to approve chunking
        }

        // If too few facts to chunk, trim them
        console.warn(`⚠️ Too few facts to chunk (${limitedFactpack.facts.length}). Trimming instead...`);
        const trimmedFacts: typeof limitedFactpack.facts = [];
        let currentChars = 0;

        for (const fact of limitedFactpack.facts) {
          if (currentChars + fact.text.length <= spaceCalculation.availableForFacts) {
            trimmedFacts.push(fact);
            currentChars += fact.text.length;
          } else {
            break;
          }
        }

        limitedFactpack = {
          ...limitedFactpack,
          facts: trimmedFacts,
        };

        const trimmedCount = (fp || factpack)!.facts.length - trimmedFacts.length;
        if (trimmedCount > 0) {
          console.warn(`⚠️ Trimmed ${trimmedCount} facts to fit within AI character limit`);
          setError(`${trimmedCount} facts were omitted to stay within the ${PROMPT_LIMITS.AI_HARD_LIMIT.toLocaleString()} character AI limit.`);
        }
      }
    }
    }

    // Build NPC section context if in NPC section chunking mode
    let npcContext: StageContext['npcSectionContext'] | undefined;
    if (isNpcSectionChunking && stage.name === 'Creator') {
      const currentSection = npcSectionChunks[currentNpcSectionIndex] || null;
      npcContext = {
        isNpcSectionChunking: true,
        currentSectionIndex: currentNpcSectionIndex,
        currentSection: currentSection,
        accumulatedSections: accumulatedNpcSections,
      };
      console.log(`[NPC Section Context] Section ${currentNpcSectionIndex + 1}/${npcSectionChunks.length}: ${currentSection?.chunkLabel}`);
    }

    const context: StageContext = {
      config: cfg,
      stageResults: results,
      factpack: limitedFactpack,
      chunkInfo: chunkInfo || currentChunkInfo,
      previousDecisions: limitedDecisions,
      unansweredProposals: unansweredProposals,
      npcSectionContext: npcContext,
    };

    // Check if this stage requires chunking (e.g., Location Spaces stage)
    // This must happen BEFORE we start chunking to initialize the iteration
    console.log(`[Stage Chunking Debug] Stage: ${stage.name}, isStageChunking: ${isStageChunking}, chunkInfo: ${!!chunkInfo}, hasShould Chunk: ${'shouldChunk' in stage}`);
    if ('shouldChunk' in stage) {
      console.log(`[Stage Chunking Debug] shouldChunk type: ${typeof stage.shouldChunk}`);
    }

    if (!isStageChunking && !chunkInfo && 'shouldChunk' in stage && typeof stage.shouldChunk === 'function') {
      console.log(`[Stage Chunking] ✓ ${stage.name} has shouldChunk function, calling it...`);
      console.log(`[Stage Chunking] Context:`, context);
      console.log(`[Stage Chunking] Context.stageResults:`, context.stageResults);
      const chunkConfig = stage.shouldChunk(context);
      console.log(`[Stage Chunking] Result:`, chunkConfig);
      console.log(`[Stage Chunking] shouldChunk=${chunkConfig.shouldChunk}, totalChunks=${chunkConfig.totalChunks}`);

      if (chunkConfig.shouldChunk && chunkConfig.totalChunks > 1) {
        console.log(`[Stage Chunking] ✓✓✓ ENTERING CHUNKING MODE ✓✓✓`);
        console.log(`[Stage Chunking] ${stage.name} requires ${chunkConfig.totalChunks} iterations`);

        // Initialize stage chunking state
        setIsStageChunking(true);
        setCurrentStageChunk(0);
        setTotalStageChunks(chunkConfig.totalChunks);
        setAccumulatedChunkResults([]);

        // Create chunkInfo for first iteration
        const firstChunkInfo = {
          isChunked: true,
          currentChunk: 1,
          totalChunks: chunkConfig.totalChunks,
          chunkLabel: `Space 1 of ${chunkConfig.totalChunks}`,
        };

        // Re-call showStageOutput with chunk info to start iteration
        console.log(`[Stage Chunking] Starting chunk 1/${chunkConfig.totalChunks}`);
        showStageOutput(stageIndex, cfg, results, fp, firstChunkInfo, unansweredProposals);
        return; // Exit and restart with chunk info
      }
    }

    // Build user prompt and log its size
    let userPromptContent = stage.buildUserPrompt(context);
    console.log(`[Prompt Building] ${stage.name} user prompt: ${userPromptContent.length.toLocaleString()} chars`);

    // If user prompt is unusually large for early stages, investigate and trim
    if (['Purpose', 'Keyword Extractor'].includes(stage.name) && userPromptContent.length > 6000) {
      console.warn(`⚠️ WARNING: ${stage.name} user prompt is unexpectedly large (${userPromptContent.length.toLocaleString()} chars)`);
      console.log('User prompt preview (first 500 chars):', userPromptContent.substring(0, 500) + '...');

      // Emergency trim: Ensure Purpose/Keyword stages never exceed reasonable size
      // These stages shouldn't have large prompts - something is wrong if they do
      const maxEarlyStagePromptSize = 5000;
      if (userPromptContent.length > maxEarlyStagePromptSize) {
        console.error(`🚨 EMERGENCY TRIM: ${stage.name} prompt truncated from ${userPromptContent.length.toLocaleString()} to ${maxEarlyStagePromptSize.toLocaleString()} chars`);
        console.warn(`⚠️ This usually means config.prompt is too large. Consider shortening your generation prompt.`);
        userPromptContent = userPromptContent.substring(0, maxEarlyStagePromptSize) + '\n\n[... content trimmed due to size limits ...]';
        // Don't call setError here - let generation proceed with trimmed content
        // If still too large, the hard limit check below will catch it
      }

      // Check individual components
      if (cfg.prompt && cfg.prompt.length > 4000) {
        console.warn(`⚠️ config.prompt itself is very large: ${cfg.prompt.length.toLocaleString()} chars`);
      }
      if (cfg.flags && JSON.stringify(cfg.flags).length > 2000) {
        console.warn(`⚠️ config.flags is very large: ${JSON.stringify(cfg.flags).length.toLocaleString()} chars`);
      }
    }

    // Build prompt with character limit checking
    // For multi-chunk generations, use minimal prompts for chunks 2+
    const isSubsequentChunk = chunkInfo && chunkInfo.currentChunk > 1;
    const isLastChunk = chunkInfo && chunkInfo.currentChunk === chunkInfo.totalChunks;
    const isFirstChunk = chunkInfo && chunkInfo.currentChunk === 1;

    let systemPromptToUse = actualSystemPrompt;  // Use condensed prompt if stage needed it
    let userPromptToUse = userPromptContent;

    // Add multi-part instructions for chunk 1
    if (isFirstChunk && chunkInfo && chunkInfo.totalChunks > 1) {
      systemPromptToUse = `${actualSystemPrompt}

---
🔔 MULTI-PART GENERATION (${chunkInfo.totalChunks} chunks total):
- This is chunk 1 of ${chunkInfo.totalChunks}
- More canon facts will follow in subsequent messages
- ⚠️ CRITICAL: Use the SAME AI chat session for ALL ${chunkInfo.totalChunks} chunks
- Do NOT start a new session or you will lose context
- After receiving all chunks, generate the complete ${config.type}`;

      console.log(`📦 Chunk 1/${chunkInfo.totalChunks}: Added multi-part instructions`);
    }

    // Use minimal prompts for chunks 2+ (but NOT for Spaces stage - it needs full prompt each time)
    const isLocationSpacesStage = stage.id === 'location_spaces' || stage.name === 'Spaces';

    if (isSubsequentChunk && !isLocationSpacesStage) {
      systemPromptToUse = `Continuing ${stage.name} generation. Chunk ${chunkInfo!.currentChunk} of ${chunkInfo!.totalChunks}.

${isLastChunk
  ? '🎯 FINAL CHUNK: After receiving this data, generate the complete JSON output based on ALL canon facts from all chunks.'
  : '📦 More canon facts coming in next chunk. Acknowledge receipt and wait for next chunk.'}

⚠️ CRITICAL: Use the SAME chat session. Do not start a new session.
Output: Valid JSON only. No markdown, no prose.`;

      // Minimal user prompt - just the facts
      userPromptToUse = `${isLastChunk ? 'Final' : 'Continuing'} canon facts:\n\n${userPromptContent}`;

      console.log(`📦 Chunk ${chunkInfo!.currentChunk}/${chunkInfo!.totalChunks}: Using minimal continuation prompt`);
    } else if (isSubsequentChunk && isLocationSpacesStage) {
      // Spaces stage needs full system prompt every time for visual data generation
      console.log(`📦 Chunk ${chunkInfo!.currentChunk}/${chunkInfo!.totalChunks}: Using full prompt (Spaces stage requires it)`);
    }

    const { prompt: fullPrompt, analysis, warnings } = buildSafePrompt(
      systemPromptToUse,
      userPromptToUse,
      {
        // Don't pass accumulated answers here - they're already in the user prompt via previousDecisions
        // Passing them here would add them as a separate section, causing double-counting
        accumulatedAnswers: undefined,
        npcSchemaGuidance: isSubsequentChunk ? undefined : npcSchemaGuidance,
        forceIncludeSchema: isSubsequentChunk ? false : isNpcStage,
      }
    );

    // Log prompt analysis
    console.log(`\n${formatPromptAnalysis(analysis)}`);
    if (warnings.length > 0) {
      console.warn('⚠️ Prompt Warnings:', warnings);
    }

    // CRITICAL: Prompt exceeds AI hard limit - trigger chunking if possible
    if (analysis.totalChars > PROMPT_LIMITS.AI_HARD_LIMIT) {
      const overflow = analysis.totalChars - PROMPT_LIMITS.AI_HARD_LIMIT;

      // Check if this is a stage that can be chunked (has facts)
      // Don't re-trigger if already in multi-part mode (prevents infinite loops)
      if (hasCanonFacts && limitedFactpack.facts.length > 10 && spaceCalculation && !isMultiPartGeneration) {
        console.warn(`⚠️ Prompt exceeds AI hard limit by ${overflow.toLocaleString()} chars. Triggering chunking...`);

        // Use multi-chunk strategy: chunk 1 has limited space, chunks 2+ have much more
        const minimalPromptOverhead = 900;
        const availableForSubsequentChunks = PROMPT_LIMITS.AI_HARD_LIMIT - minimalPromptOverhead;
        const multiPartInstructionsOverhead = 300;
        const availableForChunk1 = Math.max(0, spaceCalculation.availableForFacts - multiPartInstructionsOverhead);

        console.log(`📊 Backup Chunking Strategy:`);
        console.log(`   Chunk 1 space: ${availableForChunk1.toLocaleString()} chars`);
        console.log(`   Chunks 2+ space: ${availableForSubsequentChunks.toLocaleString()} chars`);

        // Trigger chunking modal
        const groups = groupFactsIntelligently(limitedFactpack, availableForSubsequentChunks);

        // If chunk 1 has very little space (<500 chars), give it ZERO facts
        if (availableForChunk1 < 500) {
          console.log(`⚠️ Chunk 1 has minimal space (${availableForChunk1} chars). Putting ALL facts in chunks 2+.`);

          const newGroups: FactGroup[] = [
            {
              id: 'chunk1-intro',
              label: 'Introduction (No Facts)',
              facts: [],
              characterCount: 0,
              entityTypes: [],
              regions: [],
            },
            ...groups,
          ];

          setFactGroups(newGroups);
        }
        // Split first group if needed
        else if (groups.length > 0 && groups[0].characterCount > availableForChunk1) {
          const firstGroupFacts = groups[0].facts;
          const chunk1Facts: CanonFact[] = [];
          let chunk1Chars = 0;
          let remainingFactsIndex = 0;

          for (let i = 0; i < firstGroupFacts.length; i++) {
            if (chunk1Chars + firstGroupFacts[i].text.length <= availableForChunk1) {
              chunk1Facts.push(firstGroupFacts[i]);
              chunk1Chars += firstGroupFacts[i].text.length;
              remainingFactsIndex = i + 1;
            } else {
              break;
            }
          }

          const remainingFacts = firstGroupFacts.slice(remainingFactsIndex);
          const newGroups: FactGroup[] = [
            {
              ...groups[0],
              id: 'chunk1',
              label: `${groups[0].label} (Chunk 1 - ${chunk1Facts.length} facts)`,
              facts: chunk1Facts,
              characterCount: chunk1Chars,
            },
            {
              ...groups[0],
              id: 'chunk2-part1',
              label: `${groups[0].label} (Continued)`,
              facts: remainingFacts,
              characterCount: remainingFacts.reduce((sum, f) => sum + f.text.length, 0),
            },
            ...groups.slice(1),
          ];

          setFactGroups(newGroups);
        } else {
          setFactGroups(groups);
        }

        setShowChunkingModal(true);
        setPendingFactpack(limitedFactpack);

        setError(`This stage has too much canon data to fit in one prompt (${analysis.totalChars.toLocaleString()} chars). Please approve chunking.`);
        return;
      }

      // If can't chunk but already in multi-part mode, we need to trim this chunk's facts
      if (isMultiPartGeneration && hasCanonFacts) {
        console.warn(`⚠️ Already in multi-part mode, but chunk exceeds limit. Trimming facts for this chunk...`);

        // Calculate how many chars we can use
        const availableForFacts = Math.max(100, PROMPT_LIMITS.AI_HARD_LIMIT - spaceCalculation.overhead);

        // Trim facts to fit
        const trimmedFacts: CanonFact[] = [];
        let currentChars = 0;

        for (const fact of limitedFactpack.facts) {
          if (currentChars + fact.text.length <= availableForFacts) {
            trimmedFacts.push(fact);
            currentChars += fact.text.length;
          } else {
            break;
          }
        }

        limitedFactpack = {
          ...limitedFactpack,
          facts: trimmedFacts,
        };

        const trimmedCount = (limitedFactpack?.facts?.length || 0) - trimmedFacts.length;
        console.warn(`⚠️ Trimmed ${trimmedCount} facts from this chunk to fit within limit`);

        // Rebuild prompt with trimmed facts
        const context: StageContext = {
          config: cfg,
          stageResults: results,
          factpack: limitedFactpack,
          chunkInfo: chunkInfo || currentChunkInfo,
          previousDecisions: limitedDecisions,
          unansweredProposals: unansweredProposals,
        };

        userPromptContent = stage.buildUserPrompt(context);

        // Re-build the full prompt
        const { prompt: rebuiltPrompt, analysis: rebuiltAnalysis } = buildSafePrompt(
          systemPromptToUse,
          userPromptContent,
          {
            accumulatedAnswers: undefined,
            npcSchemaGuidance: isSubsequentChunk ? undefined : npcSchemaGuidance,
            forceIncludeSchema: isSubsequentChunk ? false : isNpcStage,
          }
        );

        setCurrentPrompt(rebuiltPrompt);
        console.log(`📊 Rebuilt prompt after trimming: ${rebuiltAnalysis.totalChars} chars`);
        setModalMode('output');
        return;
      }

      // If can't chunk (no facts or too few facts), show warning and allow user to proceed
      console.warn(`⚠️ WARNING: Prompt is ${analysis.totalChars.toLocaleString()} chars, exceeding AI hard limit of ${PROMPT_LIMITS.AI_HARD_LIMIT.toLocaleString()} by ${overflow.toLocaleString()} chars. The AI may truncate data.`);
      console.warn(`⚠️ ${hasCanonFacts ? 'Not enough facts to chunk - reduce your request complexity.' : 'This stage has no canon facts to chunk - reduce your generation prompt length.'}`);

      // Continue to show the prompt instead of blocking - user can proceed with caution
      setCurrentPrompt(fullPrompt);
      setModalMode('output');
      return;
    }

    // Show warning if close to limit
    if (analysis.totalChars > PROMPT_LIMITS.WARNING_THRESHOLD) {
      console.warn(`⚠️ Prompt is ${((analysis.totalChars / PROMPT_LIMITS.AI_HARD_LIMIT) * 100).toFixed(1)}% of AI hard limit`);
    }

    setCurrentPrompt(fullPrompt);
    setModalMode('output');

    // Auto-save the prompt being shown to user
    if (autoSaveEnabled && progressSession) {
      const chunkIndex = chunkInfo ? chunkInfo.currentChunk : null;
      let updatedSession = addProgressEntry(
        progressSession,
        stage.name,
        chunkIndex,
        fullPrompt
      );
      // CRITICAL: Also update currentStageIndex so resume knows which stage to show
      updatedSession = {
        ...updatedSession,
        currentStageIndex: stageIndex,
      };
      setProgressSession(updatedSession);
      await saveProgress(updatedSession);
      console.log(`[Auto-Save] Saved prompt for ${stage.name} (stage ${stageIndex}) chunk ${chunkIndex ?? 'N/A'}`);
    }
  };

  const handleCopied = () => {
    setTimeout(() => {
      _setSkipMode(false); // Reset skip mode when moving from output to input mode normally
      setModalMode('input');
    }, 600);
  };

  const handleAutoParse = async () => {
    setError(null);

    try {
      const homebrewChunks = stageResults.homebrew_chunks as Array<{ index: number; title: string; content: string }>;
      const currentChunkIndex = (stageResults.current_chunk as number) || 0;
      const currentChunk = homebrewChunks[currentChunkIndex];

      const response = await fetch(`${API_BASE_URL}/homebrew/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkIndex: currentChunk.index,
          sectionTitle: currentChunk.title,
          content: currentChunk.content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to auto-parse chunk');
      }

      const parsed = await response.json();

      // Process the parsed result the same way as manual AI input
      handleSubmit(JSON.stringify(parsed));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-parse failed';
      setError(`Auto-parse error: ${message}`);
    }
  };

  /**
   * ====================================================================
   * SPACE APPROVAL HANDLERS
   * These handlers are called from SpaceApprovalModal when the user
   * approves, rejects, or edits a generated space during Location Spaces stage.
   * ====================================================================
   */

  /**
   * Handle space acceptance - adds the space to accumulated results and continues generation
   */
  const handleSpaceAccept = async () => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to accept');
      return;
    }

    // If reviewing an existing space (not new), just close modal
    if (reviewingSpaceIndex >= 0) {
      console.log(`[Space Approval] Closing review of existing space #${reviewingSpaceIndex + 1}`);
      setShowSpaceApprovalModal(false);
      setReviewingSpaceIndex(-1);
      return;
    }

    console.log(`[Space Approval] Space accepted: ${pendingSpace.name}`);

    // Add the approved space to accumulated chunk results
    const newAccumulated = [...accumulatedChunkResults, pendingSpace];
    setAccumulatedChunkResults(newAccumulated);

    // Clear pending space and close modal
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);
    setReviewingSpaceIndex(-1);

    // Get current stage for logging
    const currentStage = STAGES[currentStageIndex];
    console.log(`[Space Approval] Accumulated ${newAccumulated.length}/${totalStageChunks} spaces`);

    // Update live visual map with the accepted space
    const spaceData = extractSpaceForMap(pendingSpace);
    console.log(`[Live Map] Extracted space data from accepted space:`, spaceData);

    let updatedLiveMapSpaces = liveMapSpaces;
    if (spaceData) {
      updatedLiveMapSpaces = [...liveMapSpaces, spaceData];
      // Synchronize reciprocal doors when adding new space
      const syncedSpaces = synchronizeReciprocalDoors(updatedLiveMapSpaces);
      console.log(`[Live Map] Synchronized reciprocal doors after adding: ${spaceData.name}`);
      setLiveMapSpaces(syncedSpaces);
      setShowLiveMap(true);
      console.log(`[Live Map] ✓ Added accepted space: ${spaceData.name}`);
    }

    // Check if we have more spaces to generate
    if (currentStageChunk < totalStageChunks - 1) {
      // Move to next chunk
      const nextChunkIndex = currentStageChunk + 1;
      setCurrentStageChunk(nextChunkIndex);

      const chunkInfo = {
        isChunked: true,
        currentChunk: nextChunkIndex + 1,
        totalChunks: totalStageChunks,
        chunkLabel: `Space ${nextChunkIndex + 1} of ${totalStageChunks}`,
      };

      console.log(`[Space Approval] Moving to space ${nextChunkIndex + 1}/${totalStageChunks}`);

      // Update stage results with accumulated content
      const mergedChunks = mergeStageChunks(newAccumulated, currentStage.name);
      const updatedResults = {
        ...stageResults,
        [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: mergedChunks,
      };
      setStageResults(updatedResults);

      // Auto-save progress
      if (autoSaveEnabled && progressSession) {
        const savedSession = {
          ...progressSession,
          lastUpdatedAt: new Date().toISOString(),
          stageResults: updatedResults as unknown as Record<string, unknown>,
          currentStageIndex: currentStageIndex,
          // Save at top level as backup (in case stageChunkState gets lost)
          liveMapSpaces: updatedLiveMapSpaces,
          accumulatedChunkResults: newAccumulated,
          // Also save in stageChunkState (primary location)
          stageChunkState: {
            isStageChunking: true,
            currentStageChunk: nextChunkIndex,
            totalStageChunks: totalStageChunks,
            accumulatedChunkResults: newAccumulated,
            liveMapSpaces: updatedLiveMapSpaces,
            showLiveMap: showLiveMap,
          },
        };
        setProgressSession(savedSession);
        await saveProgress(savedSession);
        console.log(`[Auto-Save] Saved approved space ${currentStageChunk + 1}/${totalStageChunks}`);
      }

      // Generate next space - merge rejection feedback into config if present
      // This ensures the AI receives feedback from any rejected spaces when generating the next one
      const configWithFeedback = rejectionFeedback ? {
        ...config!,
        flags: { ...config!.flags, rejection_feedback: rejectionFeedback },
      } : config!;

      setTimeout(() => {
        showStageOutput(currentStageIndex, configWithFeedback, updatedResults, factpack, chunkInfo);
      }, 100);

      return;
    }

    // All spaces complete - finalize stage
    console.log(`[Space Approval] All ${totalStageChunks} spaces approved. Finalizing...`);

    // Merge all chunk results
    const finalMerged = mergeStageChunks(newAccumulated, currentStage.name);

    // Store final merged results
    const finalResults = {
      ...stageResults,
      [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: finalMerged,
    };
    setStageResults(finalResults);

    // Reset stage chunking state (but preserve accumulated data for later stages)
    setIsStageChunking(false);
    setCurrentStageChunk(0);
    setTotalStageChunks(0);
    // DON'T clear accumulatedChunkResults - keep for Details/Accuracy stages

    // Clear rejection feedback for next generation
    setRejectionFeedback(null);

    // Move to next stage
    if (currentStageIndex < STAGES.length - 1) {
      console.log('[Space Approval] Moving to next stage after completion');
      const nextStageIndex = currentStageIndex + 1;
      setCurrentStageIndex(nextStageIndex);

      // ✓ ATOMIC SAVE: Persist stage completion with chunking metadata
      await saveStateAndSession({
        currentStageIndex: nextStageIndex,
        stageResults: finalResults,
        stageChunkState: {
          isStageChunking: false,
          currentStageChunk: 0,
          totalStageChunks: 0,
          accumulatedChunkResults: accumulatedChunkResults,  // Keep spaces!
          liveMapSpaces: liveMapSpaces,  // Keep map!
          showLiveMap: true,
        },
      });

      setTimeout(() => {
        showStageOutput(nextStageIndex, config!, finalResults, factpack);
      }, 100);
    } else {
      console.log('[Space Approval] All stages complete');
      setFinalOutput(normalizeLocationData(finalResults));
      setIsComplete(true);
    }
  };

  /**
   * Handle space rejection - stores rejection reason and regenerates the same space
   */
  const handleSpaceReject = (reason?: string) => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to reject');
      return;
    }

    console.log(`[Space Approval] Space rejected: ${pendingSpace.name}${reason ? `, Reason: ${reason}` : ''}`);

    // Track rejected space for analytics/debugging
    _setRejectedSpaces(prev => [...prev, { space: pendingSpace, reason }]);

    // Build feedback for next AI generation
    const spaceName = pendingSpace.name || 'the space';
    const rejectionNote = reason
      ? `IMPORTANT: The previous space "${spaceName}" was rejected by the user for this reason: "${reason}". Please generate a DIFFERENT space that addresses this feedback and better matches the user's floor plan specifications. Do NOT generate "${spaceName}" again.`
      : `IMPORTANT: The previous space "${spaceName}" was rejected by the user. Please generate a DIFFERENT space that better matches the user's floor plan specifications. Do NOT generate "${spaceName}" again.`;

    setRejectionFeedback(rejectionNote);

    // Clear pending space and close modal
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);

    console.log(`[Space Approval] Regenerating space #${currentStageChunk + 1} with rejection feedback`);

    // Regenerate the same space number with rejection feedback
    // The rejection feedback will be picked up in buildUserPrompt
    const chunkInfo = {
      isChunked: true,
      currentChunk: currentStageChunk + 1,
      totalChunks: totalStageChunks,
      chunkLabel: `Space ${currentStageChunk + 1} of ${totalStageChunks} (Regenerating)`,
    };

    // Show the output modal again to regenerate - include rejection feedback in config
    // The rejection feedback is critical here as it tells the AI why the previous attempt failed
    const configWithFeedback = rejectionFeedback ? {
      ...config!,
      flags: { ...config!.flags, rejection_feedback: rejectionFeedback },
    } : config!;

    setTimeout(() => {
      showStageOutput(currentStageIndex, configWithFeedback, stageResults, factpack, chunkInfo);
    }, 100);
  };

  /**
   * Handle space edit - allows user to modify the space JSON before accepting
   */
  const handleSpaceEdit = async (editedSpace: JsonRecord) => {
    if (!pendingSpace) {
      console.error('[Space Approval] No pending space to edit');
      return;
    }

    console.log(`[Space Approval] Space edited: ${pendingSpace.name} -> ${editedSpace.name}`);
    console.log('[Space Approval] Edited space data:', {
      name: editedSpace.name,
      dimensions: editedSpace.dimensions,
      size_ft: editedSpace.size_ft,
    });

    // If reviewing an existing space, update it in place
    if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < accumulatedChunkResults.length) {
      console.log(`[Space Edit] Updating existing space at index ${reviewingSpaceIndex}`);

      // ✓ CRITICAL: Update pendingSpace FIRST to prevent form revert
      // This ensures the form's useEffect has the latest data immediately
      setPendingSpace(editedSpace);
      console.log('[Space Edit] ✓ Updated pendingSpace immediately to prevent form revert');

      const updatedAccumulated = [...accumulatedChunkResults];
      updatedAccumulated[reviewingSpaceIndex] = editedSpace;

      // Update live map - FORCE complete rebuild to ensure React sees the change
      const spaceData = extractSpaceForMap(editedSpace);
      console.log('[Space Edit] Extracted space data for map:', spaceData);
      console.log('[Space Edit] Door count in extracted space:', spaceData?.doors?.length);
      console.log('[Space Edit] Doors in extracted space:', spaceData?.doors);
      spaceData?.doors?.forEach((door, idx) => {
        console.log(`  Door ${idx + 1}: ${door.wall} wall at ${door.position_on_wall_ft}ft → "${door.leads_to}" (width: ${door.width_ft}ft)`);
      });
      if (spaceData) {
        console.log(`[Space Edit] Before update - old space at index ${reviewingSpaceIndex}:`, liveMapSpaces[reviewingSpaceIndex]);

        // Create entirely new array to force React to see the change
        const updatedLiveMap = liveMapSpaces.map((space, idx) => {
          if (idx === reviewingSpaceIndex) {
            return { ...spaceData }; // Return new object
          }
          return space;
        });

        console.log(`[Space Edit] After update - new space at index ${reviewingSpaceIndex}:`, updatedLiveMap[reviewingSpaceIndex]);
        console.log(`[Space Edit] Setting live map with ${updatedLiveMap.length} spaces`);

        // Synchronize reciprocal doors across all spaces (both live map and accumulated)
        const syncedLiveMap = synchronizeReciprocalDoors(updatedLiveMap);
        const syncedAccumulated = synchronizeReciprocalDoors(updatedAccumulated as any[]);
        console.log(`[Space Edit] Synchronized reciprocal doors for ${syncedLiveMap.length} spaces`);

        // Update both accumulated results and live map with synchronized doors
        setAccumulatedChunkResults(syncedAccumulated);
        setLiveMapSpaces(syncedLiveMap);
        setMapUpdateCounter(prev => prev + 1); // Increment to force React re-render

        // Update pendingSpace with synced version so form shows reciprocal doors
        setPendingSpace(syncedAccumulated[reviewingSpaceIndex]);

        console.log(`[Live Map] ✓ Map updated with new dimensions for space #${reviewingSpaceIndex + 1}: ${spaceData.name}`, spaceData.size_ft);

        // Auto-save the changes to session using atomic save pattern
        await saveStateAndSession({
          currentStageIndex: currentStageIndex,  // ← Preserve current stage
          stageChunkState: progressSession?.stageChunkState ? {
            ...progressSession.stageChunkState,
            liveMapSpaces: syncedLiveMap,
            accumulatedChunkResults: syncedAccumulated,
          } : undefined,
        });
        console.log(`[Auto-Save] Saved edited space #${reviewingSpaceIndex + 1}`);
      }

      return; // Stay in review mode
    }

    // Otherwise, it's a new space - auto-accept it
    // Update pending space with edited version
    setPendingSpace(editedSpace);

    // Auto-accept the edited space
    // We need to temporarily update pendingSpace and then call accept
    // Since setState is async, we'll pass the edited space directly
    handleSpaceAcceptWithCustomSpace(editedSpace);
  };

  /**
   * Navigate to previous accepted space for review
   */
  const handlePreviousSpace = () => {
    if (accumulatedChunkResults.length === 0) return;

    // If currently at new space, save it before navigating away
    if (reviewingSpaceIndex < 0 && pendingSpace) {
      setSavedNewSpace(pendingSpace);
    }

    const newIndex = reviewingSpaceIndex < 0
      ? accumulatedChunkResults.length - 1  // If at new space, go to last accepted
      : Math.max(0, reviewingSpaceIndex - 1); // Otherwise go to previous

    console.log(`[Space Navigation] Going to previous space: index ${newIndex}`);
    setReviewingSpaceIndex(newIndex);
    setPendingSpace(accumulatedChunkResults[newIndex]);
  };

  /**
   * Navigate to next accepted space or new space
   */
  const handleNextSpace = () => {
    if (reviewingSpaceIndex < 0) return; // Already at new space

    const newIndex = reviewingSpaceIndex + 1;

    if (newIndex >= accumulatedChunkResults.length) {
      // Return to new/pending space
      console.log(`[Space Navigation] Returning to new space`);
      setReviewingSpaceIndex(-1);
      // Restore the saved new space
      if (savedNewSpace) {
        setPendingSpace(savedNewSpace);
        setSavedNewSpace(null);
      }
    } else {
      console.log(`[Space Navigation] Going to next space: index ${newIndex}`);
      setReviewingSpaceIndex(newIndex);
      setPendingSpace(accumulatedChunkResults[newIndex]);
    }
  };

  /**
   * Handle adding a new space manually
   * Opens SpaceApprovalModal in edit mode with a blank/default space
   */
  const handleAddSpace = () => {
    console.log('[Add Space] Creating new blank space');
    
    // Create a new space with default values
    const newSpace: JsonRecord = {
      name: `New Space ${accumulatedChunkResults.length + 1}`,
      code: `space_${Date.now()}`,
      purpose: '',
      description: '',
      dimensions: { width: 20, height: 20, unit: 'ft' },
      size_ft: { width: 20, height: 20 },
      floor_height: 10,
      space_type: 'room',
      shape: 'rectangle',
      doors: [],
      features: [],
    };
    
    // Set as pending space (reviewingSpaceIndex = -1 means new space)
    setPendingSpace(newSpace);
    setReviewingSpaceIndex(-1);
    setSavedNewSpace(null);
    
    // Open the modal (it will show in edit mode)
    setShowSpaceApprovalModal(true);
    
    console.log('[Add Space] Opened SpaceApprovalModal for new space');
  };

  /**
   * Handle finishing skip mode - user has reviewed all pasted spaces and is ready to advance
   */
  const handleFinishSkip = async () => {
    console.log('[Skip Mode] User finished reviewing spaces, advancing to next stage');

    if (accumulatedChunkResults.length === 0) {
      console.warn('[Skip Mode] No spaces to finalize');
      return;
    }

    // Merge all accumulated spaces into stage results
    const finalResults: StageResults = {
      ...stageResults,
      spaces: {
        spaces: accumulatedChunkResults,
        total_spaces: accumulatedChunkResults.length,
      } as unknown as JsonRecord,
    };
    setStageResults(finalResults);

    console.log(`[Skip Mode] Finalized ${accumulatedChunkResults.length} spaces, advancing to next stage`);

    // Clear skip mode and chunking state
    _setSkipMode(false);
    setIsStageChunking(false);
    setCurrentStageChunk(0);
    setTotalStageChunks(0);
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);
    setReviewingSpaceIndex(-1);

    // Advance to next stage
    if (currentStageIndex < STAGES.length - 1) {
      const nextStageIndex = currentStageIndex + 1;
      setCurrentStageIndex(nextStageIndex);

      // ✓ ATOMIC SAVE: Persist skip completion with all spaces
      await saveStateAndSession({
        currentStageIndex: nextStageIndex,
        stageResults: finalResults,
        stageChunkState: {
          isStageChunking: false,
          currentStageChunk: 0,
          totalStageChunks: 0,
          accumulatedChunkResults: accumulatedChunkResults, // Preserve for Details/Accuracy stages
          liveMapSpaces: liveMapSpaces, // Preserve map
          showLiveMap: true,
        },
      });

      // Show next stage output
      setTimeout(() => {
        showStageOutput(nextStageIndex, config!, finalResults, factpack);
      }, 100);
    } else {
      // Final stage - just save
      await saveStateAndSession({
        stageResults: finalResults,
      });
      console.log('[Skip Mode] Final stage reached');
    }
  };

  /**
   * Helper function to accept a custom space (used after editing)
   */
  const handleSpaceAcceptWithCustomSpace = async (customSpace: JsonRecord) => {
    console.log(`[Space Approval] Accepting custom/edited space: ${customSpace.name}`);

    // Add the custom space to accumulated chunk results
    const newAccumulated = [...accumulatedChunkResults, customSpace];
    setAccumulatedChunkResults(newAccumulated);

    // Clear pending space and close modal
    setShowSpaceApprovalModal(false);
    setPendingSpace(null);

    // Get current stage
    const currentStage = STAGES[currentStageIndex];
    console.log(`[Space Approval] Accumulated ${newAccumulated.length}/${totalStageChunks} spaces`);

    // Update live visual map
    const spaceData = extractSpaceForMap(customSpace);
    let updatedLiveMapSpaces = liveMapSpaces;
    if (spaceData) {
      updatedLiveMapSpaces = [...liveMapSpaces, spaceData];
      // Synchronize reciprocal doors when adding new space
      const syncedSpaces = synchronizeReciprocalDoors(updatedLiveMapSpaces);
      console.log(`[Live Map] Synchronized reciprocal doors after adding edited: ${spaceData.name}`);
      setLiveMapSpaces(syncedSpaces);
      setShowLiveMap(true);
      console.log(`[Live Map] ✓ Added edited space: ${spaceData.name}`);
    }

    // Continue with same logic as handleSpaceAccept
    if (currentStageChunk < totalStageChunks - 1) {
      const nextChunkIndex = currentStageChunk + 1;
      setCurrentStageChunk(nextChunkIndex);

      const chunkInfo = {
        isChunked: true,
        currentChunk: nextChunkIndex + 1,
        totalChunks: totalStageChunks,
        chunkLabel: `Space ${nextChunkIndex + 1} of ${totalStageChunks}`,
      };

      const mergedChunks = mergeStageChunks(newAccumulated, currentStage.name);
      const updatedResults = {
        ...stageResults,
        [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: mergedChunks,
      };
      setStageResults(updatedResults);

      if (autoSaveEnabled && progressSession) {
        const savedSession = {
          ...progressSession,
          lastUpdatedAt: new Date().toISOString(),
          stageResults: updatedResults as unknown as Record<string, unknown>,
          currentStageIndex,
          // Save at top level as backup (in case stageChunkState gets lost)
          liveMapSpaces: updatedLiveMapSpaces,
          accumulatedChunkResults: newAccumulated,
          // Also save in stageChunkState (primary location)
          stageChunkState: {
            isStageChunking: true,
            currentStageChunk: nextChunkIndex,
            totalStageChunks,
            accumulatedChunkResults: newAccumulated,
            liveMapSpaces: updatedLiveMapSpaces,
            showLiveMap,
          },
        };
        setProgressSession(savedSession);
        await saveProgress(savedSession);
      }

      // Continue to next space - include rejection feedback if present
      const configWithFeedback = rejectionFeedback ? {
        ...config!,
        flags: { ...config!.flags, rejection_feedback: rejectionFeedback },
      } : config!;

      setTimeout(() => {
        showStageOutput(currentStageIndex, configWithFeedback, updatedResults, factpack, chunkInfo);
      }, 100);

      return;
    }

    // All spaces complete
    const finalMerged = mergeStageChunks(newAccumulated, currentStage.name);
    const finalResults = {
      ...stageResults,
      [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: finalMerged,
    };
    setStageResults(finalResults);

    setIsStageChunking(false);
    setCurrentStageChunk(0);
    setTotalStageChunks(0);
    setRejectionFeedback(null);

    if (currentStageIndex < STAGES.length - 1) {
      setCurrentStageIndex(currentStageIndex + 1);
      setTimeout(() => {
        showStageOutput(currentStageIndex + 1, config!, finalResults, factpack);
      }, 100);
    } else {
      setFinalOutput(normalizeLocationData(finalResults));
      setIsComplete(true);
    }
  };

  const handleSubmit = async (aiResponse: string) => {
    // Clear any previous errors
    setError(null);

    try {
      const currentStage = STAGES[currentStageIndex];

      // Special handling for Visual Map stage - it outputs pure HTML, not JSON
      let parsed: JsonRecord;
      if (currentStage.name === 'Visual Map') {
        console.log('[Visual Map] Processing raw HTML output (no JSON parsing)');
        // Store the raw HTML directly without JSON parsing
        parsed = {
          visual_map_html: aiResponse.trim(),
          stage: 'visual_map',
          generated_at: new Date().toISOString(),
        };
      } else {
        // Parse AI response with improved error handling for JSON stages
        const parseResult = parseAIResponse<JsonRecord>(aiResponse);

        if (!parseResult.success) {
          const errorMessage = formatParseError(parseResult);
          setError(errorMessage);
          return;
        }

        parsed = parseResult.data || {};
      }

      if (currentStage.name === 'Spaces' && config?.type === 'location') {
        const candidateSpace = ((): unknown => {
          if (parsed.space && typeof parsed.space === 'object') return parsed.space;
          if (Array.isArray(parsed.spaces) && parsed.spaces.length > 0) return parsed.spaces[0];
          return parsed;
        })();

        const validation = validateIncomingLocationSpace(candidateSpace, {
          requireFeaturePositionAnchor: true,
        });
        if (!validation.ok) {
          setError(validation.error);
          return;
        }
      }

      console.log(`[handleSubmit] Stage: ${currentStage.name}, isMultiPartGeneration: ${isMultiPartGeneration}, currentGroupIndex: ${currentGroupIndex}, totalGroups: ${factGroups.length}`);

      // Auto-save the AI response
      if (autoSaveEnabled && progressSession) {
        const updatedSession = updateProgressResponse(
          progressSession,
          aiResponse,
          'completed'
        );
        setProgressSession(updatedSession);
        await saveProgress(updatedSession);
        console.log(`[Auto-Save] Saved AI response for ${currentStage.name}`);
      }

      // Special handling for Homebrew Extraction - chunked processing
      // Check if we're processing homebrew chunks (not by stage name, but by presence of chunks)
      if (config?.type === 'homebrew' && stageResults.homebrew_chunks) {
        const homebrewChunks = stageResults.homebrew_chunks as unknown[];
        const currentChunkIndex = (stageResults.current_chunk as number) || 0;

        // Store this chunk's result
        const chunkResults = (stageResults.chunk_results as JsonRecord[]) || [];
        chunkResults.push(parsed);

        const newResults: StageResults = {
          ...stageResults,
          chunk_results: chunkResults as unknown as JsonRecord,
        };
        setStageResults(newResults);

        // Check if there are more chunks to process
        const nextChunkIndex = currentChunkIndex + 1;
        if (nextChunkIndex < homebrewChunks.length) {
          // Show next chunk prompt
          const nextChunk = homebrewChunks[nextChunkIndex] as { prompt: string; title: string; index: number };
          console.log(`[Homebrew] Moving to chunk ${nextChunkIndex + 1}/${homebrewChunks.length}: ${nextChunk.title}`);

          const updatedResults: StageResults = {
            ...newResults,
            current_chunk: nextChunkIndex as unknown as JsonRecord,
          };
          setStageResults(updatedResults);

          setCurrentPrompt(nextChunk.prompt);
          setModalMode('output');
          return;
        }

        // All chunks processed - merge results
        console.log(`[Homebrew] All ${chunkResults.length} chunks processed. Merging...`);

        const mergedContent = mergeHomebrewChunks(chunkResults);

        const finalContent: JsonRecord = {
          ...mergedContent,
          deliverable: 'homebrew',
          type: 'homebrew',
          document_title: config.homebrewFile?.name || 'Homebrew Content',
          fileName: config.homebrewFile?.name || 'Homebrew Content', // For source attribution
          content_type: 'homebrew',
          total_chunks: homebrewChunks.length,
        };

        setStageResults({ ...newResults, merged: finalContent });
        setFinalOutput(finalContent);
        setIsComplete(true);
        setModalMode(null);

        console.log('[Homebrew] Extraction complete:', finalContent);

        const docTitle = getString(finalContent, 'document_title') || 'Homebrew Content';
        alert(`✅ Homebrew Extraction Complete!\n\nDocument: ${docTitle}\nChunks processed: ${homebrewChunks.length}\n\nReview the extracted content below before saving.`);

        // Scroll to results
        setTimeout(() => {
          const resultsSection = document.getElementById('generation-results');
          if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);

        return;
      }

      // If Fact Checker, convert its questions/issues into proposals for ReviewAdjustModal
      if (currentStage.name === 'Fact Checker' || (config!.type === 'nonfiction' && currentStage.name === 'Editor & Style')) {
        const proposals: Proposal[] = [];
        const fc = parsed as FactCheckOutput;
        const seenFieldPaths = new Set<string>();

        // 2) ambiguities -> proposals requesting clarification (PROCESS FIRST - they have more detail)
        if (Array.isArray(fc.ambiguities)) {
          fc.ambiguities.forEach((a: FactCheckAmbiguityOut) => {
            const fp: string = a?.field_path || 'unknown field';
            const need: string | undefined = a?.clarification_needed;

            if (typeof need === 'string' && need.trim().length > 0) {
              // Mark this field_path as seen to avoid duplicates
              if (fp && fp !== 'unknown field') {
                seenFieldPaths.add(fp);
              }

              // Use clarification_needed as the main question
              const question = need;

              // Build options from recommended_revision if available
              const options: Array<string | { choice: string; description: string }> = [];

              if (a?.recommended_revision) {
                // Option 1: Keep current value
                options.push({
                  choice: 'Keep current value',
                  description: a?.text ? `Keep: "${a.text.substring(0, 100)}${a.text.length > 100 ? '...' : ''}"` : 'Keep the current implementation as-is'
                });

                // Option 2: Use recommended revision
                options.push({
                  choice: 'Use recommended revision',
                  description: `${a.recommended_revision.substring(0, 150)}${a.recommended_revision.length > 150 ? '...' : ''}`
                });
              }

              proposals.push({
                question,
                field_path: a?.field_path,
                current_value: a?.text,
                clarification_needed: a?.clarification_needed,
                recommended_revision: a?.recommended_revision,
                options: options.length > 0 ? options : undefined,
              });
            }
          });
        }

        // 1) direct user_questions -> proposals (ONLY if not already covered by ambiguities)
        if (Array.isArray(fc.user_questions)) {
          fc.user_questions.forEach((q: string) => {
            if (typeof q === 'string' && q.trim().length > 0) {
              // Check if this question is already covered by checking field paths mentioned in the question
              const isDuplicate = Array.from(seenFieldPaths).some(fp => {
                // Check if field path appears in question
                return fp !== 'unknown field' && q.includes(fp);
              });

              // Only add if not a duplicate
              if (!isDuplicate) {
                proposals.push({ question: q });
              }
            }
          });
        }

        // 3) unassociated with suggested_action === 'ask_user' -> proposals for confirmation
        if (Array.isArray(fc.unassociated)) {
          fc.unassociated.forEach((u: FactCheckUnassociatedOut) => {
            if (u?.suggested_action === 'ask_user') {
              const fp = u?.field_path || 'unknown field';

              // Skip if already handled
              if (fp && fp !== 'unknown field' && seenFieldPaths.has(fp)) {
                return;
              }

              const txt = typeof u?.text === 'string' ? u.text : '';
              const why = typeof u?.reason === 'string' ? u.reason : '';

              // Create a clear question
              const question = txt
                ? `Review unassociated content: "${txt}" at ${fp}`
                : `Review ${fp} (not backed by canon)`;

              proposals.push({
                question,
                field_path: u?.field_path,
                current_value: txt,
                reason: why,
                options: [
                  { choice: 'Keep as-is', description: 'Keep this content even though it lacks direct canon support' },
                  { choice: 'Remove this', description: 'Remove this content entirely' },
                  { choice: 'Revise based on canon', description: 'Modify to align better with canon facts' }
                ],
              });
            }
          });
        }

        if (proposals.length > 0) {
          (parsed as JsonRecord).proposals = proposals as unknown as JsonRecord[];
        }
      }

      if ((parsed as any).proposals !== undefined) {
        (parsed as any).proposals = sanitizeProposalsValue((parsed as any).proposals);
      }

      // Deduplicate proposals against already-answered questions BEFORE checking if we need review
      if (Array.isArray((parsed as JsonRecord).proposals) && ((parsed as JsonRecord).proposals as unknown[]).length > 0) {
        const proposals = (parsed as JsonRecord).proposals as unknown[];
        const originalCount = proposals.length;
        (parsed as JsonRecord).proposals = deduplicateProposals(proposals, accumulatedAnswers);
        const newProposals = (parsed as JsonRecord).proposals as unknown[];
        if (newProposals.length !== originalCount) {
          console.log(`[Stage ${currentStage.name}] Deduplicated proposals: ${originalCount} -> ${newProposals.length}`);
        }
      }

      // Check if this stage has proposals or critical issues that need review
      const hasProposals = Array.isArray(parsed.proposals) && parsed.proposals.length > 0;
      const hasCriticalPhysics = Array.isArray(parsed.physics_issues)
        && parsed.physics_issues.some((issue: unknown) =>
          typeof issue === 'object' && issue !== null && 'severity' in issue &&
          (issue as { severity?: string }).severity === 'critical'
        );
      const hasCriticalConflicts = Array.isArray(parsed.conflicts)
        && parsed.conflicts.some((conflict: unknown) =>
          typeof conflict === 'object' && conflict !== null && 'severity' in conflict &&
          (conflict as { severity?: string }).severity === 'critical'
        );
      const hasCriticalIssues = hasCriticalPhysics || hasCriticalConflicts;

      // If there are proposals or critical issues, show review modal
      // BUT: in multi-chunk mode, we carry proposals forward and only show after all chunks
      // ALSO: For Location Spaces stage, space approval workflow takes precedence over proposals
      const isLocationSpacesStage = currentStage.name === 'Spaces' && config!.type === 'location';
      if ((hasProposals || hasCriticalIssues) && !isMultiPartGeneration && !isLocationSpacesStage) {
        setCurrentStageOutput(parsed);
        setShowReviewModal(true);
        return; // Don't proceed to next stage yet
      }

      // Store result
      let newResults: StageResults = {
        ...stageResults,
        [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: parsed,
      };

      if (config!.type === 'nonfiction' && currentStage.name === 'Purpose') {
        const keywords = toStringArray((parsed as JsonRecord).keywords);
        if (keywords.length > 0) {
          console.log('[ManualGenerator] Extracted keywords:', keywords);

          const newFactpack = await searchCanonWithKeywords(keywords);
          console.log(`[ManualGenerator] Found ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

          if (newFactpack.facts.length > config!.max_canon_facts) {
            console.log('[ManualGenerator] Fact count exceeds threshold - showing narrowing modal');
            setStageResults(newResults);
            setPendingStageResults(newResults);
            setPendingFactpack(newFactpack);
            setCurrentKeywords(keywords);
            _setShowNarrowingModal(true);
            setModalMode(null);
            await saveStageResults(newResults, currentStageIndex);
            return;
          }

          setFactpack(newFactpack);

          if (currentStageIndex < STAGES.length - 1) {
            const nextIndex = currentStageIndex + 1;

            setIsMultiPartGeneration(false);
            setFactGroups([]);
            setCurrentGroupIndex(0);

            setIsStageChunking(false);
            setCurrentStageChunk(0);
            setTotalStageChunks(0);
            setAccumulatedChunkResults([]);

            setCurrentStageIndex(nextIndex);
            setModalMode(null);
            _setSkipMode(false);
            setStageResults(newResults);

            await saveStageResults(newResults, currentStageIndex);

            setTimeout(() => {
              showStageOutput(nextIndex, config!, newResults, newFactpack);
            }, 100);
          }
          return;
        }
      }

      // Special handling for Keyword Extractor stage
      if (currentStage.name === 'Keyword Extractor') {
        // Extract keywords and search canon
        const keywords = toStringArray(parsed.keywords);
        console.log('[ManualGenerator] Extracted keywords:', keywords);

        // Use helper function to search canon
        const newFactpack = await searchCanonWithKeywords(keywords);
        console.log(`[ManualGenerator] Found ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

        // Check if fact count exceeds user-configured threshold
        if (newFactpack.facts.length > config!.max_canon_facts) {
          console.log('[ManualGenerator] Fact count exceeds threshold - showing narrowing modal');
          // Store factpack and keywords for later use
          setPendingFactpack(newFactpack);
          setCurrentKeywords(keywords);
          _setShowNarrowingModal(true);
          setModalMode(null); // Close the copy/paste modal
          return; // Don't proceed to next stage yet
        }

        // Fact count is within threshold - proceed to next stage
        setFactpack(newFactpack);

        // Move to next stage with the NEW factpack
        if (currentStageIndex < STAGES.length - 1) {
          const nextIndex = currentStageIndex + 1;

          // Reset multi-part generation state when moving to new stage
          setIsMultiPartGeneration(false);
          setFactGroups([]);
          setCurrentGroupIndex(0);

          // Reset stage chunking state when moving to new stage
          setIsStageChunking(false);
          setCurrentStageChunk(0);
          setTotalStageChunks(0);
          setAccumulatedChunkResults([]);

          setCurrentStageIndex(nextIndex);
          setModalMode(null);
          _setSkipMode(false); // Reset skip mode when moving to next stage
          setStageResults(newResults);

          // Auto-save stage results
          await saveStageResults(newResults, currentStageIndex);

          // Show next stage with the NEW factpack
          setTimeout(() => {
            showStageOutput(nextIndex, config!, newResults, newFactpack);
          }, 100);
        }
        return; // Exit early for keyword extractor
      }

      // Check for retrieval_hints from Planner or Creator stages
      // IMPORTANT: Skip retrieval hints processing in multi-chunk mode
      // Process them ONLY after all chunks are merged
      if ((currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft'))) && !isMultiPartGeneration) {
        console.log(`[Retrieval Hints] Processing hints for ${currentStage.name} stage...`);
        const hintsResult = await processRetrievalHints(parsed, newResults, currentStage.name);

        if (!hintsResult.shouldProceed) {
          // Narrowing modal is showing - wait for user action
          console.log(`[Retrieval Hints] Narrowing modal shown, waiting for user action`);
          return;
        }

        // Update results after retrieval hints processing
        newResults = hintsResult.newResults;
        setStageResults(newResults);

        // Move to next stage with UPDATED factpack (may have new facts from retrieval hints)
        if (currentStageIndex < STAGES.length - 1) {
          const nextIndex = currentStageIndex + 1;

          // Reset multi-part generation state when moving to new stage
          setIsMultiPartGeneration(false);
          setFactGroups([]);
          setCurrentGroupIndex(0);

          // Reset stage chunking state when moving to new stage
          setIsStageChunking(false);
          setCurrentStageChunk(0);
          setTotalStageChunks(0);
          setAccumulatedChunkResults([]);

          setCurrentStageIndex(nextIndex);
          setModalMode(null);
          _setSkipMode(false);

          setTimeout(() => {
            showStageOutput(nextIndex, config!, newResults, factpack);
          }, 100);
        }
        return; // Exit early after processing retrieval hints
      }

      if (isMultiPartGeneration && (currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft')))) {
        console.log(`[Multi-Chunk] Skipping retrieval hints processing - will process after all chunks merged`);
        // In multi-chunk mode, we'll process retrieval hints after merging all chunks
      }

      // ============================================================================
      // SAFETY CHECK: For Spaces stage with accumulated chunks but isStageChunking=false
      // (can happen after resume if chunk state wasn't properly restored), re-derive
      // the chunking state and treat the submission as part of the chunking workflow.
      // ============================================================================
      let effectiveIsStageChunking = isStageChunking;
      let effectiveTotalChunks = totalStageChunks;
      let effectiveCurrentChunk = currentStageChunk;
      
      if (!isStageChunking && currentStage.name === 'Spaces' && config!.type === 'location') {
        // Check if we have accumulated chunks, indicating we're mid-workflow
        if (accumulatedChunkResults.length > 0) {
          console.warn('[Stage Chunking] ⚠️ Detected accumulated spaces but isStageChunking=false. Re-deriving...');
          
          // Get estimated_spaces from purpose stage
          const purposeData = stageResults.purpose as Record<string, unknown> | undefined;
          let estimatedSpaces = accumulatedChunkResults.length + 1; // Assume at least one more
          
          if (purposeData?.estimated_spaces) {
            if (typeof purposeData.estimated_spaces === 'number') {
              estimatedSpaces = purposeData.estimated_spaces;
            } else if (typeof purposeData.estimated_spaces === 'string') {
              estimatedSpaces = parseInt(purposeData.estimated_spaces, 10) || estimatedSpaces;
            }
          }
          
          // Correct the state for this submission
          effectiveIsStageChunking = true;
          effectiveTotalChunks = estimatedSpaces;
          effectiveCurrentChunk = accumulatedChunkResults.length; // Next chunk to generate
          
          // Also update the React state to fix future submissions
          setIsStageChunking(true);
          setTotalStageChunks(estimatedSpaces);
          setCurrentStageChunk(accumulatedChunkResults.length);
          
          console.log(`[Stage Chunking] ✓ Re-derived: chunk ${effectiveCurrentChunk + 1}/${effectiveTotalChunks}`);
        } else {
          // No accumulated chunks - this might be the first space, check if we should chunk
          const purposeData = stageResults.purpose as Record<string, unknown> | undefined;
          let estimatedSpaces = 1;
          
          if (purposeData?.estimated_spaces) {
            if (typeof purposeData.estimated_spaces === 'number') {
              estimatedSpaces = purposeData.estimated_spaces;
            } else if (typeof purposeData.estimated_spaces === 'string') {
              estimatedSpaces = parseInt(purposeData.estimated_spaces, 10) || 1;
            }
          }
          
          if (estimatedSpaces > 1) {
            console.warn('[Stage Chunking] ⚠️ First space submitted but isStageChunking=false. Setting up chunking...');
            effectiveIsStageChunking = true;
            effectiveTotalChunks = estimatedSpaces;
            effectiveCurrentChunk = 0;
            
            setIsStageChunking(true);
            setTotalStageChunks(estimatedSpaces);
            setCurrentStageChunk(0);
            
            console.log(`[Stage Chunking] ✓ Set up chunking: ${estimatedSpaces} total spaces`);
          }
        }
      }

      // STAGE CHUNKING: Handle chunk completion and merging (e.g., Location Spaces)
      if (effectiveIsStageChunking) {
        console.log(`[Stage Chunking] Chunk ${effectiveCurrentChunk + 1}/${effectiveTotalChunks} complete for ${currentStage.name}`);

        // ====================================================================
        // SPACE APPROVAL WORKFLOW: For Location Spaces stage, show approval modal
        // before adding space to accumulated results. This allows users to
        // accept, reject, or edit each space before continuing generation.
        // ====================================================================
        if (currentStage.name === 'Spaces' && config!.type === 'location') {
          console.log(`[Space Approval] Showing approval modal for space #${effectiveCurrentChunk + 1}`);

          // Store the pending space and show approval modal
          setPendingSpace(parsed);
          setReviewingSpaceIndex(-1); // -1 indicates this is a new/pending space
          setSavedNewSpace(null); // Clear any saved new space

          // ✓ FIX: If in skip mode, DON'T auto-complete chunking
          // Allow user to paste multiple spaces, review each one
          if (skipMode) {
            console.log('[Skip Mode] Space data pasted, opening approval modal');
            setShowSpaceApprovalModal(true);
            setModalMode(null);
            // DON'T advance stage - wait for user to review and decide
            return;
          }

          // ✓ Batch Mode: Auto-accept spaces without showing approval modal
          if (batchModeEnabled) {
            console.log(`[Batch Mode] Auto-accepting space: ${parsed.name || 'Unnamed'}`);
            // Directly call the accept logic without showing modal
            // Add the approved space to accumulated chunk results
            const newAccumulated = [...accumulatedChunkResults, parsed];
            setAccumulatedChunkResults(newAccumulated);
            
            // Update live visual map
            const spaceData = extractSpaceForMap(parsed);
            let updatedLiveMapSpaces = liveMapSpaces;
            if (spaceData) {
              updatedLiveMapSpaces = [...liveMapSpaces, spaceData];
              // Synchronize reciprocal doors when adding new space
              const syncedSpaces = synchronizeReciprocalDoors(updatedLiveMapSpaces);
              console.log(`[Batch Mode] Synchronized reciprocal doors after auto-adding: ${spaceData.name}`);
              setLiveMapSpaces(syncedSpaces);
              setShowLiveMap(true);
              console.log(`[Batch Mode] Auto-added space to map: ${spaceData.name}`);
            }

            // Check if we have more spaces to generate
            if (effectiveCurrentChunk < effectiveTotalChunks - 1) {
              const nextChunkIndex = effectiveCurrentChunk + 1;
              setCurrentStageChunk(nextChunkIndex);

              const chunkInfo = {
                isChunked: true,
                currentChunk: nextChunkIndex + 1,
                totalChunks: effectiveTotalChunks,
                chunkLabel: `Space ${nextChunkIndex + 1} of ${effectiveTotalChunks}`,
              };

              console.log(`[Batch Mode] Auto-advancing to space ${nextChunkIndex + 1}/${effectiveTotalChunks}`);

              // Auto-save progress
              if (autoSaveEnabled && progressSession) {
                const savedSession = {
                  ...progressSession,
                  lastUpdatedAt: new Date().toISOString(),
                  stageResults: { ...stageResults } as unknown as Record<string, unknown>,
                  stageChunkState: {
                    isStageChunking: true,
                    currentStageChunk: nextChunkIndex,
                    totalStageChunks: effectiveTotalChunks,
                    accumulatedChunkResults: newAccumulated,
                    liveMapSpaces: updatedLiveMapSpaces,
                    showLiveMap: true,
                  },
                };
                setProgressSession(savedSession);
                saveProgress(savedSession);
              }

              // Generate next space prompt
              setTimeout(() => {
                showStageOutput(currentStageIndex, config!, stageResults, factpack, chunkInfo);
              }, 100);
              return;
            }

            // All spaces complete in batch mode - finalize and move to next stage
            console.log(`[Batch Mode] All ${effectiveTotalChunks} spaces auto-accepted. Finalizing...`);
            const finalMerged = mergeStageChunks(newAccumulated, currentStage.name);
            const finalResults = {
              ...stageResults,
              [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: finalMerged,
            };
            setStageResults(finalResults);
            setIsStageChunking(false);
            setCurrentStageChunk(0);
            setTotalStageChunks(0);
            setAccumulatedChunkResults([]); // Clear accumulated chunks
            setBatchModeEnabled(false); // Reset batch mode for next generation

            if (currentStageIndex < STAGES.length - 1) {
              const nextStageIndex = currentStageIndex + 1;
              setCurrentStageIndex(nextStageIndex);
              setTimeout(() => {
                showStageOutput(nextStageIndex, config!, finalResults, factpack);
              }, 100);
            }
            return;
          }

          setShowSpaceApprovalModal(true);
          setModalMode(null); // Close copy-paste modal

          // The approval handlers (handleSpaceAccept, handleSpaceReject, handleSpaceEdit)
          // will be called when user makes a decision. Those handlers will continue
          // the chunking workflow.
          return; // Wait for user approval before continuing
        }

        // Collect this chunk's results (for non-Spaces stages or after approval)
        const newAccumulated = [...accumulatedChunkResults, parsed];
        setAccumulatedChunkResults(newAccumulated);

        console.log(`[Stage Chunking] Accumulated ${newAccumulated.length}/${totalStageChunks} chunks`);

        // Update live visual map if this is Spaces stage for a location
        console.log(`[Stage Chunking] Checking live map conditions: stage=${currentStage.name}, type=${config!.type}`);
        let updatedLiveMapSpaces = liveMapSpaces;
        if (currentStage.name === 'Spaces' && config!.type === 'location') {
          console.log(`[Live Map] Extracting space data from parsed result:`, parsed);
          // Extract space data from the parsed result
          const spaceData = extractSpaceForMap(parsed);
          console.log(`[Live Map] Extracted space data:`, spaceData);
          if (spaceData) {
            updatedLiveMapSpaces = [...liveMapSpaces, spaceData];
            // Synchronize reciprocal doors when adding new space
            const syncedSpaces = synchronizeReciprocalDoors(updatedLiveMapSpaces);
            console.log(`[Live Map] Synchronized reciprocal doors after adding: ${spaceData.name}`);
            setLiveMapSpaces(syncedSpaces);
            setShowLiveMap(true);
            console.log(`[Live Map] ✓ Added space: ${spaceData.name}`);

            // Validate geometry and generate proposals
            // NOTE: Stage results stored by stage.name, not stage.id (e.g., "foundation" not "location_foundation")
            const foundation = stageResults.foundation as Record<string, unknown> | undefined;
            const parentStructure = foundation ? {
              total_floors: typeof foundation.total_floors === 'number' ? foundation.total_floors : undefined,
              total_area: typeof foundation.total_area === 'number' ? foundation.total_area : undefined,
              layout: typeof foundation.layout === 'string' ? foundation.layout : undefined,
            } : undefined;

            const validation = validateSpaceGeometry(spaceData, liveMapSpaces, parentStructure);

            if (!validation.isValid && validation.proposals.length > 0) {
              console.log(`[Geometry Validation] Found ${validation.proposals.length} issues for "${spaceData.name}"`);

              // Add geometry proposals to the parsed result
              const existingProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
              parsed.proposals = [
                ...existingProposals,
                ...validation.proposals.map(p => ({
                  type: p.type,
                  category: p.category,
                  question: p.question,
                  options: p.options,
                  context: p.context,
                })),
              ];
            }
          }
        }

        // Check for proposals - if user answers are needed, show review modal
        const proposals = (parsed as JsonRecord).proposals;
        const hasProposals = proposals && Array.isArray(proposals) && proposals.length > 0;

        if (hasProposals) {
          console.log(`[Stage Chunking] Chunk has ${(proposals as unknown[]).length} proposals - showing review modal`);
          setCurrentStageOutput(parsed);
          setShowReviewModal(true);
          return; // Wait for user to answer proposals before continuing
        }

        // Check if we have more chunks to process
        if (currentStageChunk < totalStageChunks - 1) {
          // Move to next chunk
          const nextChunkIndex = currentStageChunk + 1;
          setCurrentStageChunk(nextChunkIndex);

          const chunkInfo = {
            isChunked: true,
            currentChunk: nextChunkIndex + 1,
            totalChunks: totalStageChunks,
            chunkLabel: `Space ${nextChunkIndex + 1} of ${totalStageChunks}`,
          };

          console.log(`[Stage Chunking] Moving to chunk ${nextChunkIndex + 1}/${totalStageChunks}`);

          // Update stage results with accumulated content (merge arrays)
          const mergedChunks = mergeStageChunks(newAccumulated, currentStage.name);
          const updatedResults = {
            ...newResults,
            [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: mergedChunks,
          };
          setStageResults(updatedResults);

          // Auto-save progress after each chunk to prevent data loss during long iterations
          if (autoSaveEnabled && progressSession) {
            const savedSession = {
              ...progressSession,
              lastUpdatedAt: new Date().toISOString(),
              stageResults: updatedResults as unknown as Record<string, unknown>,
              currentStageIndex: currentStageIndex,
              // Save at top level as backup (in case stageChunkState gets lost)
              liveMapSpaces: updatedLiveMapSpaces,
              accumulatedChunkResults: newAccumulated,
              // Also save in stageChunkState (primary location)
              stageChunkState: {
                isStageChunking: true,
                currentStageChunk: nextChunkIndex,
                totalStageChunks: totalStageChunks,
                accumulatedChunkResults: newAccumulated,
                liveMapSpaces: updatedLiveMapSpaces,
                showLiveMap: showLiveMap,
              },
            };
            setProgressSession(savedSession);
            await saveProgress(savedSession);
            console.log(`[Auto-Save] Saved chunk ${currentStageChunk + 1}/${totalStageChunks} for ${currentStage.name} with ${updatedLiveMapSpaces.length} spaces`);
          }

          // Re-run stage with next chunk
          setTimeout(() => {
            showStageOutput(currentStageIndex, config!, updatedResults, factpack, chunkInfo);
          }, 100);

          return; // Don't proceed to next stage yet
        }

        // All chunks complete - finalize
        console.log(`[Stage Chunking] All ${totalStageChunks} chunks complete for ${currentStage.name}. Finalizing...`);

        // Merge all chunk results
        const finalMerged = mergeStageChunks(newAccumulated, currentStage.name);

        // Store final merged results
        const finalResults = {
          ...newResults,
          [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: finalMerged,
        };
        setStageResults(finalResults);

        // Reset stage chunking state
        setIsStageChunking(false);
        setCurrentStageChunk(0);
        setTotalStageChunks(0);
        setAccumulatedChunkResults([]);

        // Keep live map state for location generation (Stages 4-5 will continue showing it)
        // Only reset map state if not a location, or if location is fully complete
        if (config?.type !== 'location') {
          setShowLiveMap(false);
          setLiveMapSpaces([]);
        }
        // Note: For locations, map persists through Details and Accuracy Refinement stages

        // Clear stage chunk state from progress session (chunking complete)
        if (autoSaveEnabled && progressSession) {
          const clearedSession = {
            ...progressSession,
            lastUpdatedAt: new Date().toISOString(),
            stageResults: finalResults as unknown as Record<string, unknown>,
            stageChunkState: undefined, // Clear chunking state
          };
          setProgressSession(clearedSession);
          await saveProgress(clearedSession);
          console.log(`[Auto-Save] Cleared chunking state - stage complete`);
        }

        console.log(`[Stage Chunking] Final merged result:`, finalMerged);

        // Continue to next stage
        newResults = finalResults;
      }

      // NPC SECTION CHUNKING: Handle section completion and merging
      if (isNpcSectionChunking && currentStage.name === 'Creator') {
        console.log(`[NPC Section Chunking] Section ${currentNpcSectionIndex + 1}/${npcSectionChunks.length} complete: ${npcSectionChunks[currentNpcSectionIndex]?.chunkLabel}`);

        // Merge this section's output with accumulated sections
        const mergedSections = {
          ...accumulatedNpcSections,
          ...parsed, // Merge new fields from this section
        };
        setAccumulatedNpcSections(mergedSections);

        // Remove pipeline fields before storing
        const cleanedSections = { ...mergedSections };
        delete cleanedSections.sources_used;
        delete cleanedSections.assumptions;
        delete cleanedSections.proposals;
        delete cleanedSections.retrieval_hints;
        delete cleanedSections.canon_update;

        console.log(`[NPC Section Chunking] Merged section output. Total fields so far: ${Object.keys(cleanedSections).length}`);

        // Check if we have more sections to process
        if (currentNpcSectionIndex < npcSectionChunks.length - 1) {
          // Move to next section
          const nextSectionIndex = currentNpcSectionIndex + 1;
          setCurrentNpcSectionIndex(nextSectionIndex);
          const nextSection = npcSectionChunks[nextSectionIndex];

          const chunkInfo = {
            isChunked: true,
            currentChunk: nextSectionIndex + 1,
            totalChunks: npcSectionChunks.length,
            chunkLabel: nextSection.chunkLabel,
          };

          console.log(`[NPC Section Chunking] Moving to section ${nextSectionIndex + 1}/${npcSectionChunks.length}: ${nextSection.chunkLabel}`);

          // Update stage results with merged content so far
          const updatedResults = {
            ...newResults,
            creator: cleanedSections,
          };
          setStageResults(updatedResults);

          // Re-run Creator stage with next section
          setTimeout(() => {
            showStageOutput(currentStageIndex, config!, updatedResults, factpack, chunkInfo);
          }, 100);

          return; // Don't proceed to next stage yet
        }

        // All NPC sections complete - finalize
        console.log(`[NPC Section Chunking] All ${npcSectionChunks.length} sections complete. Finalizing NPC...`);

        // Store final merged NPC
        const finalResults = {
          ...newResults,
          creator: cleanedSections,
        };
        setStageResults(finalResults);

        // Reset NPC section chunking state
        setIsNpcSectionChunking(false);
        setIsMultiPartGeneration(false);

        // Continue to next stage (Fact Checker)
        if (currentStageIndex < STAGES.length - 1) {
          const nextIndex = currentStageIndex + 1;
          setCurrentStageIndex(nextIndex);
          setModalMode(null);

          setTimeout(() => {
            showStageOutput(nextIndex, config!, finalResults, factpack);
          }, 100);
        }

        return; // Exit after handling NPC section completion
      }

      // Check if we're in multi-chunk mode (fact-based) and have more chunks to process for THIS stage
      if (isMultiPartGeneration && !isNpcSectionChunking && currentGroupIndex < factGroups.length - 1) {
        console.log(`[Multi-Chunk] Stage: ${currentStage.name}, Chunk ${currentGroupIndex + 1}/${factGroups.length} complete.`);
        console.log(`[Multi-Chunk] Current index: ${currentGroupIndex}, Total groups: ${factGroups.length}, Moving to next chunk...`);

        // CRITICAL FIX: Update the stage output with the LATEST AI response
        // This ensures the next chunk sees the updated/corrected version, not the original
        const stageKey = currentStage.name.toLowerCase().replace(/\s+/g, '_');
        const chunkResults = (newResults[`${stageKey}_chunks`] as JsonRecord[]) || [];
        chunkResults.push(parsed);

        // Update the main stage output with the latest response
        // This way the next chunk will reference the UPDATED data
        const updatedResults = {
          ...newResults,
          [stageKey]: parsed, // Use latest chunk's output as the "current" output
          [`${stageKey}_chunks`]: chunkResults, // Also keep chunk history for merging later
        };
        setStageResults(updatedResults);

        console.log(`[Multi-Chunk] Updated ${stageKey} with latest chunk response. Next chunk will see these corrections.`);

        // Move to next chunk
        const nextChunkIndex = currentGroupIndex + 1;
        setCurrentGroupIndex(nextChunkIndex);
        const nextGroup = factGroups[nextChunkIndex];

        const nextGroupFactpack: Factpack = {
          facts: nextGroup.facts,
          entities: Array.from(new Set(nextGroup.facts.map(f => f.entity_id || f.entity_name))),
          gaps: [],
        };
        setFactpack(nextGroupFactpack);

        // Create chunk info for next chunk
        const chunkInfo = {
          isChunked: true,
          currentChunk: nextChunkIndex + 1,
          totalChunks: factGroups.length,
          chunkLabel: nextGroup.label,
        };

        // Extract unanswered proposals from this chunk to carry forward
        const unansweredProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];

        // Pass unanswered proposals to the AI in the user prompt context
        // The AI will try to answer them with the new facts from the next chunk
        console.log(`[Multi-Chunk] Carrying forward ${unansweredProposals.length} unanswered proposals to chunk ${nextChunkIndex + 1}`);

        // Re-run the SAME stage with the next chunk's facts
        setTimeout(() => {
          showStageOutput(currentStageIndex, config!, updatedResults, nextGroupFactpack, chunkInfo, unansweredProposals);
        }, 100);

        return; // Don't proceed to next stage yet
      }

      // If multi-chunk mode and this was the last chunk for this stage, merge chunk results
      if (isMultiPartGeneration && currentGroupIndex === factGroups.length - 1) {
        console.log(`[Multi-Chunk] All ${factGroups.length} chunks complete for stage ${currentStage.name}. Merging results...`);

        const stageKey = currentStage.name.toLowerCase().replace(/\s+/g, '_');
        const chunkResults = (newResults[`${stageKey}_chunks`] as JsonRecord[]) || [];
        chunkResults.push(parsed); // Add the last chunk

        // Merge all chunk results for this stage
        const mergedStageOutput = mergeChunkOutputs(chunkResults, currentStage.name);

        // VALIDATION: Check for missing required fields
        if (currentStage.name.toLowerCase().includes('core details')) {
          const requiredFields = [
            'personality_traits', 'ideals', 'bonds', 'flaws',
            'goals', 'fears', 'quirks', 'voice_mannerisms', 'hooks'
          ];
          const missingFields = requiredFields.filter(field => !(field in mergedStageOutput));

          if (missingFields.length > 0) {
            console.error(`[Validation] Core Details stage is missing required fields:`, missingFields);
            console.error(`[Validation] Stage output:`, mergedStageOutput);

            // Add a critical issue to force user review
            const criticalIssue = {
              severity: 'critical',
              description: `AI response is incomplete. Missing required personality fields: ${missingFields.join(', ')}. Please retry this stage with better instructions.`,
              suggestion: 'Click "Reject & Retry" and tell the AI to provide ALL personality fields separately.',
            };

            if (!Array.isArray(mergedStageOutput.conflicts)) {
              mergedStageOutput.conflicts = [];
            }
            (mergedStageOutput.conflicts as unknown[]).unshift(criticalIssue);
          }
        }

        // VALIDATION: Check Stats stage for refusal to create stats
        if (currentStage.name.toLowerCase().includes('stats')) {
          const statsFields = ['ability_scores', 'armor_class', 'hit_points'];
          const missingStats = statsFields.filter(field => !(field in mergedStageOutput));

          // Check assumptions for signs of refusal
          const assumptions = mergedStageOutput.assumptions;
          const isRefusingToCreate = Array.isArray(assumptions) && assumptions.some((a: unknown) =>
            typeof a === 'string' && (
              a.toLowerCase().includes('no mechanical statistics') ||
              a.toLowerCase().includes('canon does not specify') ||
              a.toLowerCase().includes('not provided')
            )
          );

          if (missingStats.length > 0 || isRefusingToCreate) {
            console.error(`[Validation] Stats stage refused to create stats or is missing fields:`, missingStats);
            console.error(`[Validation] Stage output:`, mergedStageOutput);

            const criticalIssue = {
              severity: 'critical',
              description: `AI refused to create stats. The AI must CREATE appropriate stats based on the character concept, not report what canon says. Missing: ${missingStats.join(', ')}`,
              suggestion: 'Click "Reject & Retry" and instruct: "You are a CREATOR. Create appropriate stats for this character based on their role, class, and CR. Do not say canon doesn\'t specify them - YOU create them!"',
            };

            if (!Array.isArray(mergedStageOutput.conflicts)) {
              mergedStageOutput.conflicts = [];
            }
            (mergedStageOutput.conflicts as unknown[]).unshift(criticalIssue);
          }
        }

        let mergedResults: StageResults = {
          ...stageResults,
          [stageKey]: mergedStageOutput,
        };
        setStageResults(mergedResults);

        // Deduplicate proposals against already-answered questions
        const mergedStageProposals = (mergedStageOutput as Record<string, unknown>).proposals;
        if (Array.isArray(mergedStageProposals) && mergedStageProposals.length > 0) {
          const originalCount = mergedStageProposals.length;
          (mergedStageOutput as Record<string, unknown>).proposals = deduplicateProposals(
            mergedStageProposals,
            accumulatedAnswers
          ) as JsonRecord[];
          const nextProposals = (mergedStageOutput as Record<string, unknown>).proposals;
          if (Array.isArray(nextProposals) && nextProposals.length !== originalCount) {
            console.log(`[Multi-Chunk] Deduplicated proposals: ${originalCount} -> ${nextProposals.length}`);
          }
        }

        // If there are still unanswered proposals after all chunks, show review modal
        // IMPORTANT: Check this BEFORE processing retrieval hints
        if (Array.isArray(mergedStageOutput.proposals) && mergedStageOutput.proposals.length > 0) {
          console.log(`[Multi-Chunk] ${mergedStageOutput.proposals.length} proposals remain unanswered after all chunks. Showing review modal...`);
          setCurrentStageOutput(mergedStageOutput as JsonRecord);
          setShowReviewModal(true);
          return; // Wait for user to answer
        }

        // Now process retrieval hints from the merged output (Planner or Creator only)
        // Only do this if there are NO unanswered proposals
        if (currentStage.name === 'Planner' || currentStage.name === 'Creator' || (config!.type === 'nonfiction' && (currentStage.name === 'Outline & Structure' || currentStage.name === 'Draft'))) {
          console.log(`[Multi-Chunk] Processing retrieval hints from merged ${currentStage.name} output...`);
          const initialFactCount = factpack!.facts.length;
          const hintsResult = await processRetrievalHints(mergedStageOutput, mergedResults, currentStage.name);

          if (!hintsResult.shouldProceed) {
            // Narrowing modal is showing - wait for user action
            // When user responds, they'll be taken to next stage
            console.log(`[Multi-Chunk] Retrieval hints triggered narrowing modal, waiting for user action`);
            return;
          }

          // Update results after retrieval hints processing
          mergedResults = hintsResult.newResults;
          setStageResults(mergedResults);

          // If retrieval hints added facts, disable multi-chunk mode for subsequent stages
          // (the new factpack won't align with the original chunk groups)
          if (factpack!.facts.length > initialFactCount) {
            console.log(`[Multi-Chunk] Retrieval hints added facts (${initialFactCount} → ${factpack!.facts.length}). Disabling multi-chunk mode for subsequent stages.`);
            setIsMultiPartGeneration(false);
            setFactGroups([]);
            setCurrentGroupIndex(0);
          }
        }

        // No unanswered proposals, proceed to next stage or complete
        setModalMode(null);
        _setSkipMode(false);

        if (currentStageIndex < STAGES.length - 1) {
          // Move to next stage
          console.log(`[Multi-Chunk] No unanswered proposals. Proceeding to next stage...`);

          // Reset multi-part generation for the next stage
          setIsMultiPartGeneration(false);
          setFactGroups([]);
          setCurrentGroupIndex(0);

          // Reset stage chunking for the next stage
          setIsStageChunking(false);
          setCurrentStageChunk(0);
          setTotalStageChunks(0);
          setAccumulatedChunkResults([]);

          const nextIndex = currentStageIndex + 1;
          setCurrentStageIndex(nextIndex);

          setTimeout(() => {
            showStageOutput(nextIndex, config!, mergedResults, factpack);
          }, 100);
        } else {
          // Pipeline complete!
          console.log(`[Multi-Chunk] Pipeline complete! Processing final output...`);

          // Reset multi-chunk mode
          setIsMultiPartGeneration(false);
          setFactGroups([]);
          setCurrentGroupIndex(0);

          // Reset stage chunking mode
          setIsStageChunking(false);
          setCurrentStageChunk(0);
          setTotalStageChunks(0);
          setAccumulatedChunkResults([]);

          // CRITICAL FIX: Extract content from correct location
          let baseContent: JsonRecord = {};
          if (config!.type === 'monster') {
            baseContent = {
              ...mergedResults.basic_info,
              ...mergedResults['stats_&_defenses'],
              ...mergedResults['combat_&_abilities'],
              ...mergedResults['legendary_&_lair'],
              ...mergedResults['ecology_&_lore'],
              deliverable: 'monster', // Set AFTER spread to ensure it's not overwritten
            };

            // Keep hit_points as-is (integer or object {average, formula}) - schema accepts both

            // Normalize saving throws: ensure value is string, remove notes
            if (Array.isArray(baseContent.saving_throws)) {
              baseContent.saving_throws = baseContent.saving_throws.map((st: any) => {
                if (st && typeof st === 'object') {
                  return {
                    name: st.name,
                    value: typeof st.value === 'number' ? (st.value >= 0 ? `+${st.value}` : `${st.value}`) : String(st.value),
                    // Omit notes - schema doesn't require it
                  };
                }
                return st;
              });
            }

            // Normalize skill proficiencies: ensure value is string, remove notes
            if (Array.isArray(baseContent.skill_proficiencies)) {
              baseContent.skill_proficiencies = baseContent.skill_proficiencies.map((skill: any) => {
                if (skill && typeof skill === 'object') {
                  return {
                    name: skill.name,
                    value: typeof skill.value === 'number' ? (skill.value >= 0 ? `+${skill.value}` : `${skill.value}`) : String(skill.value),
                    // Omit notes - schema doesn't require it
                  };
                }
                return skill;
              });
            }

            console.log('[Multi-Chunk Complete] Monster: Merged all 5 stage results');
          } else {
            const physicsValidator = mergedResults.physics_validator;
            const physicsContent = isRecord(physicsValidator)
              && isRecord(physicsValidator.content)
              && isRecord(physicsValidator.content.content)
              ? (physicsValidator.content.content as JsonRecord)
              : null;

            if (config!.type === 'nonfiction' && mergedResults.finalizer) {
              baseContent = mergedResults.finalizer as JsonRecord;
              console.log('[Multi-Chunk Complete] Using content from finalizer');
            } else if (physicsContent) {
              baseContent = physicsContent;
            console.log('[Multi-Chunk Complete] Using content from physics_validator.content.content');
            } else if (mergedResults.stylist) {
            baseContent = mergedResults.stylist as JsonRecord;
            console.log('[Multi-Chunk Complete] Using content from stylist');
          } else if (mergedResults.creator) {
            baseContent = mergedResults.creator as JsonRecord;
            console.log('[Multi-Chunk Complete] Using content from creator');
          }
          }

          const finalContent = normalizeOutput(baseContent as JsonRecord, config!.type);

          setStageResults(mergedResults);
          setFinalOutput(finalContent);
          setIsComplete(true);
        }
        return;
      }

      // Move to next stage or finish (for all other stages - non-chunked flow)
      if (currentStageIndex < STAGES.length - 1) {
        const nextIndex = currentStageIndex + 1;

        // Reset multi-part generation state when moving to new stage
        setIsMultiPartGeneration(false);
        setFactGroups([]);
        setCurrentGroupIndex(0);

        setCurrentStageIndex(nextIndex);
        setModalMode(null);
        _setSkipMode(false); // Reset skip mode when moving to next stage
        setStageResults(newResults);

        // Auto-save stage results
        await saveStageResults(newResults, currentStageIndex);

        // Show next stage after a brief delay
        setTimeout(() => {
          showStageOutput(nextIndex, config!, newResults, factpack);
        }, 100);
      } else {
        // Pipeline complete!
        // CRITICAL FIX: Extract content from the correct location in stage results
        // Physics Validator wraps content in { content: { content: {...}, relevant_canon: {...} } }
        let baseContent: JsonRecord = {};

        // For monsters, merge all stage results since each stage adds different fields
        if (config!.type === 'monster') {
          baseContent = {
            ...newResults.basic_info,
            ...newResults['stats_&_defenses'],
            ...newResults['combat_&_abilities'],
            ...newResults['legendary_&_lair'],
            ...newResults['ecology_&_lore'],
            deliverable: 'monster', // Set AFTER spread to ensure it's not overwritten
          };

          // Keep hit_points as-is (integer or object {average, formula}) - schema accepts both

          // Clean up saving throws notes (remove LaTeX-style math)
          if (Array.isArray(baseContent.saving_throws)) {
            baseContent.saving_throws = baseContent.saving_throws.map((st: any) => {
              if (st && typeof st === 'object' && st.notes) {
                return { ...st, notes: undefined };
              }
              return st;
            });
          }

          // Clean up skill proficiencies notes
          if (Array.isArray(baseContent.skill_proficiencies)) {
            baseContent.skill_proficiencies = baseContent.skill_proficiencies.map((skill: any) => {
              if (skill && typeof skill === 'object' && skill.notes) {
                return { ...skill, notes: undefined };
              }
              return skill;
            });
          }

          console.log('[Pipeline Complete] Monster: Merged all 5 stage results');
        } else if (config?.type === 'location') {
          // Location uses multi-stage approach: Purpose -> Foundation -> Spaces -> Details -> Accuracy Refinement
          baseContent = {
            ...newResults.purpose,
            ...newResults.foundation,
            spaces: newResults.spaces, // Don't spread spaces - keep as array
            ...newResults.details,
            ...newResults.accuracy_refinement,
            deliverable: 'location', // Set AFTER spread to ensure it's not overwritten
          };

          console.log('[Pipeline Complete] Location: Merged all location stage results', {
            hasPurpose: !!newResults.purpose,
            hasFoundation: !!newResults.foundation,
            hasSpaces: !!newResults.spaces,
            spacesCount: Array.isArray(newResults.spaces) ? newResults.spaces.length : 0,
            hasDetails: !!newResults.details,
            hasAccuracyRefinement: !!newResults.accuracy_refinement,
            totalFields: Object.keys(baseContent).length,
          });
        } else if (config?.type === 'npc') {
          // NPC uses multi-stage Creator approach - use intelligent merger
          const { mergeNpcStages } = await import('../utils/npcStageMerger');
          const mergeResult = mergeNpcStages(newResults);

          baseContent = mergeResult.merged;

          // Log merge results
          console.log('[Pipeline Complete] NPC: Intelligently merged all Creator sub-stages:', {
            totalFields: Object.keys(baseContent).length,
            conflicts: mergeResult.conflicts.length,
            warnings: mergeResult.warnings,
          });

          // Log conflicts for review
          if (mergeResult.conflicts.length > 0) {
            console.warn('[NPC Merge Conflicts] The following fields had different values across stages:');
            for (const conflict of mergeResult.conflicts) {
              console.warn(`  - ${conflict.field}: ${conflict.resolution}`, {
                stages: conflict.stages.map(s => s.stageName),
                finalValue: conflict.resolvedValue,
              });
            }
          }
        } else if (config?.type === 'nonfiction') {
          if (newResults.finalizer) {
            baseContent = newResults.finalizer as JsonRecord;
            console.log('[Pipeline Complete] Using content from finalizer');
          } else if (newResults['editor_&_style']) {
            baseContent = newResults['editor_&_style'] as JsonRecord;
            console.log('[Pipeline Complete] Using content from editor_&_style');
          } else if (newResults.draft) {
            baseContent = newResults.draft as JsonRecord;
            console.log('[Pipeline Complete] Using content from draft');
          }
        } else if (newResults.physics_validator?.content?.content) {
          // Content from Physics Validator (wrapped structure)
          baseContent = newResults.physics_validator.content.content as JsonRecord;
          console.log('[Pipeline Complete] Using content from physics_validator.content.content');
        } else if (newResults.stylist) {
          // Content from Stylist (normal structure)
          baseContent = newResults.stylist as JsonRecord;
          console.log('[Pipeline Complete] Using content from stylist');
        } else if (newResults.creator) {
          // Content from Creator (fallback)
          baseContent = newResults.creator as JsonRecord;
          console.log('[Pipeline Complete] Using content from creator');
        } else {
          console.error('[Pipeline Complete] No content found in stage results!', newResults);
        }

        // Sanitize and deduplicate proposals to prevent asking the same question multiple times
        let proposals = sanitizeProposalsValue((baseContent as any).proposals);
        if (Array.isArray(proposals) && proposals.length > 0) {
          // First, filter out malformed proposals (ones that don't have the correct schema)
          proposals = proposals.filter((proposal: any) => {
            // Must have a "question" field
            if (!proposal.question || typeof proposal.question !== 'string') {
              console.log('[Proposal Sanitization] Removing proposal without valid question field:', proposal);
              return false;
            }

            // Must NOT have malformed fields like "summary", "details", "suggested_action"
            if (proposal.summary || proposal.details || proposal.suggested_action) {
              console.log('[Proposal Sanitization] Removing malformed proposal (has summary/details/suggested_action):', proposal.question);
              return false;
            }

            // Should have options (though we'll allow it if missing for now)
            if (!proposal.options) {
              console.warn('[Proposal Sanitization] Proposal missing options, but allowing:', proposal.question);
            }

            return true;
          });

          console.log(`[Proposal Sanitization] After sanitization: ${(baseContent as any).proposals?.length || 0} -> ${proposals.length} proposals`);

          // Now deduplicate
          const seenQuestions = new Set<string>();
          const seenQuestionsNormalized = new Set<string>();

          proposals = proposals.filter((proposal: any) => {
            const question = proposal.question || '';
            const normalizedQuestion = question.trim().toLowerCase();

            // Skip if we've already seen this exact question
            if (seenQuestions.has(question)) {
              console.log('[Proposal Dedup] Removing duplicate proposal:', question);
              return false;
            }

            // Skip if we've already seen a very similar question
            if (seenQuestionsNormalized.has(normalizedQuestion)) {
              console.log('[Proposal Dedup] Removing similar proposal:', question);
              return false;
            }

            // Skip if this question was already answered in a previous chunk
            if (accumulatedAnswers[question]) {
              console.log('[Proposal Dedup] Removing already-answered proposal:', question);
              return false;
            }

            // Check if a very similar question was already answered
            for (const answeredQ of Object.keys(accumulatedAnswers)) {
              if (answeredQ.trim().toLowerCase() === normalizedQuestion) {
                console.log('[Proposal Dedup] Removing answered proposal (similar):', question);
                return false;
              }
            }

            seenQuestions.add(question);
            seenQuestionsNormalized.add(normalizedQuestion);
            return true;
          });

          console.log(`[Proposal Dedup] Reduced from ${(baseContent as any).proposals?.length || 0} to ${proposals.length} proposals`);
        }

        // Infer deliverable to ensure correct save categorization (e.g., CHARACTER for NPC)
        const inferredDeliverable = inferDeliverableType(baseContent as JsonRecord, config!.type);

        const finalContent: JsonRecord = {
          // Use Stylist as the source of truth for all content fields
          ...baseContent,

          // Override with deduplicated proposals
          proposals,

          rule_base:
            (baseContent as any).rule_base ??
            (typeof config?.flags?.rule_base === 'string' ? config.flags.rule_base : undefined),

          // Critical for correct mapping when saving to project
          deliverable: inferredDeliverable,

          fact_check_report: config!.type === 'nonfiction' ? (newResults['editor_&_style'] || {}) : (newResults.fact_checker || {}),
          // Add Canon Validator metadata (these are NEW fields, not overwrites)
          conflicts: newResults.canon_validator?.conflicts || [],
          canon_alignment_score: newResults.canon_validator?.canon_alignment_score,
          validation_notes: newResults.canon_validator?.validation_notes,

          // Add Physics Validator metadata (these are NEW fields, not overwrites)
          physics_issues: newResults.physics_validator?.physics_issues || [],
          logic_score: newResults.physics_validator?.logic_score,
          balance_notes: newResults.physics_validator?.balance_notes,

          // Include the full stage results for debugging/audit trail
          _pipeline_stages: newResults,
        };

        setModalMode(null);
        setStageResults(newResults);
        setFinalOutput(finalContent);

        // Auto-save final stage results
        await saveStageResults(newResults, STAGES.length - 1);

        console.log('Final Results:', newResults);
        console.log('[DEBUG] Merged finalContent:', finalContent);

        // Check if we're in multi-part generation and have more chunks
        if (isMultiPartGeneration && currentGroupIndex < factGroups.length - 1) {
          const nextChunkIndex = currentGroupIndex + 1;
          const nextGroup = factGroups[nextChunkIndex];

          const shouldContinue = window.confirm(
            `✅ Part ${currentGroupIndex + 1} of ${factGroups.length} Complete!\n\n` +
            `Current part: ${factGroups[currentGroupIndex].label}\n` +
            `Next part: ${nextGroup.label} (${nextGroup.facts.length} facts)\n\n` +
            `Continue with next part?`
          );

          if (shouldContinue) {
            // Load next chunk and restart from Planner stage
            setCurrentGroupIndex(nextChunkIndex);
            const nextGroupFactpack: Factpack = {
              facts: nextGroup.facts,
              entities: Array.from(new Set(nextGroup.facts.map(f => f.entity_id || f.entity_name))),
              gaps: [],
            };
            setFactpack(nextGroupFactpack);

            // Reset to Planner stage
            setCurrentStageIndex(0); // Planner is at index 0
            setIsComplete(false);
            setFinalOutput(null);
            setStageResults({});

            // Create chunk info for next chunk
            const chunkInfo = {
              isChunked: true,
              currentChunk: nextChunkIndex + 1,
              totalChunks: factGroups.length,
              chunkLabel: nextGroup.label,
            };

            setTimeout(() => {
              showStageOutput(0, config!, {} as StageResults, nextGroupFactpack, chunkInfo);
            }, 100);

            return; // Don't set isComplete to true or show completion message
          } else {
            // User chose to stop - show final results from all chunks processed so far
            alert(
              `✅ Multi-Part Generation Stopped\n\n` +
              `Completed ${currentGroupIndex + 1} of ${factGroups.length} parts.\n\n` +
              `Results from completed parts are shown below.`
            );
          }
        }

        setIsComplete(true);

        // Show success message and scroll to results
        const title = getString(finalContent, 'title') || getString(finalContent, 'canonical_name') || 'Generated Content';
        const conflictCount = Array.isArray((finalContent as unknown as Record<string, unknown>)['conflicts'])
          ? ((finalContent as unknown as Record<string, unknown>)['conflicts'] as unknown[]).length
          : 0;
        const issueCount = Array.isArray((finalContent as unknown as Record<string, unknown>)['physics_issues'])
          ? ((finalContent as unknown as Record<string, unknown>)['physics_issues'] as unknown[]).length
          : 0;

        // Scroll to results section after a brief delay to ensure it's rendered
        setTimeout(() => {
          const resultsSection = document.getElementById('generation-results');
          if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);

        const canonAlign = (finalContent as Record<string, unknown>)['canon_alignment_score'];
        const logicScore = (finalContent as Record<string, unknown>)['logic_score'];
        const canonAlignText = typeof canonAlign === 'number' ? String(canonAlign) : 'N/A';
        const logicScoreText = typeof logicScore === 'number' ? String(logicScore) : 'N/A';
        alert(`✅ Generation Complete!\n\nTitle: ${title}\n\nValidation Results:\n• ${conflictCount} canon conflicts detected\n• ${issueCount} physics/logic issues found\n• Canon Alignment: ${canonAlignText}/100\n• Logic Score: ${logicScoreText}/100\n\nReview the results below before saving.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error processing AI response';
      // Set error but keep modal open so user can fix the input
      setError(`Error processing response: ${message}\n\nPlease check the response and try again.`);
    }
  };

  const handleClose = () => {
    if (currentStageIndex >= 0 && currentStageIndex < STAGES.length) {
      // If auto-save is enabled and we have a progress session, data is saved
      const dataSaved = autoSaveEnabled && progressSession;

      const message = dataSaved
        ? 'Close this generation session?\n\n✅ Your progress has been auto-saved and you can resume later from the "Resume Session" option.'
        : 'Are you sure you want to close? Your progress will be lost. Click "Cancel" to continue, or "OK" to reset.';

      const confirmClose = window.confirm(message);
      if (!confirmClose) {
        return;
      }

      // Just close the modal - don't reset if data is saved
      if (dataSaved) {
        setModalMode(null);
        console.log('[Close] Session closed but saved. Can resume from:', progressSession.sessionId);
      } else {
        // Reset everything if not saved
        setCurrentStageIndex(-1);
        setModalMode(null);
        _setSkipMode(false);
        setStageResults({} as StageResults);
        setConfig(null);
        setError(null);
      }
    } else {
      setModalMode(null);
      _setSkipMode(false);
    }
  };

  const handleReset = () => {
    setCurrentStageIndex(-1);
    setModalMode(null);
    _setSkipMode(false);
    setStageResults({} as StageResults);
    setConfig(null);
    setError(null);
    setIsComplete(false);
    setFinalOutput(null);
  };

  const handleRetryCurrentStage = () => {
    if (currentStageIndex >= 0 && config) {
      showStageOutput(currentStageIndex, config, stageResults, factpack);
    }
  };

  const handleBack = () => {
    if (currentStageIndex > 0) {
      const prevIndex = currentStageIndex - 1;
      setCurrentStageIndex(prevIndex);
      setModalMode(null);
      _setSkipMode(false); // Reset skip mode when going back

      // Show previous stage
      setTimeout(() => {
        showStageOutput(prevIndex, config!, stageResults, factpack);
      }, 100);
    }
  };

  const handleRetryWithAnswers = (answers: Record<string, string>, issuesToAddress: string[]) => {
    // Close review modal
    setShowReviewModal(false);

    // Accumulate answers from this retry
    const updatedAnswers = {
      ...accumulatedAnswers,
      ...answers,
    };
    setAccumulatedAnswers(updatedAnswers);

    console.log('[ManualGenerator] Accumulated answers after retry:', updatedAnswers);

    // CRITICAL FIX: Rebuild prompt from scratch instead of appending to avoid prompt bloat
    // The showStageOutput function will include the updatedAnswers automatically
    // Rebuild the stage output with updated answers
    setTimeout(() => {
      showStageOutput(
        currentStageIndex,
        config!,
        stageResults,
        factpack,
        currentChunkInfo || undefined
      );

      // After prompt is generated, add retry-specific instructions
      setTimeout(() => {
        let additionalInstructions = '\n\n---\n\nADDITIONAL GUIDANCE FROM USER (RETRY):\n\n';

        if (Object.keys(answers).length > 0) {
          additionalInstructions += 'NEW ANSWERS TO PROPOSALS:\n';
          Object.entries(answers).forEach(([question, answer]) => {
            additionalInstructions += `Q: ${question}\nA: ${answer}\n\n`;
          });
        }

        if (issuesToAddress.length > 0) {
          additionalInstructions += 'CRITICAL ISSUES TO ADDRESS:\n';
          issuesToAddress.forEach((issue, i) => {
            additionalInstructions += `${i + 1}. ${issue}\n`;
          });
          additionalInstructions += '\nPlease revise your output to address these critical issues.\n';
        }

        additionalInstructions += '\n⚠️ IMPORTANT: This is a retry. Please regenerate your response with these clarifications, ensuring NO proposals or critical issues remain.';

        // Append retry instructions to the freshly generated prompt
        setCurrentPrompt(prev => {
          // Limit the final prompt size by checking length
          const combined = prev + additionalInstructions;
          if (combined.length > 20000) {
            console.warn(`[Retry] Prompt exceeds 20k chars (${combined.length}). Consider reducing canon facts or answers.`);
          }
          return combined;
        });

        // Show the modal with updated prompt
        _setSkipMode(false);
        setModalMode('output');
      }, 100);
    }, 100);
  };

  const handleAcceptWithIssues = (answers: Record<string, string>) => {
    // User chose to accept despite proposals/issues
    setShowReviewModal(false);

    // Accumulate answers from this stage
    const updatedAnswers = {
      ...accumulatedAnswers,
      ...answers,
    };
    setAccumulatedAnswers(updatedAnswers);

    console.log('[ManualGenerator] Accumulated answers:', updatedAnswers);

    const currentStage = STAGES[currentStageIndex];

    // Filter out answered proposals from the stage output before storing
    const answeredQuestions = new Set(Object.keys(answers));
    let filteredOutput = { ...currentStageOutput };

    if (Array.isArray(filteredOutput.proposals)) {
      const remainingProposals = (filteredOutput.proposals as unknown[])
        .filter((proposal) => {
          if (typeof proposal === 'string') {
            return !answeredQuestions.has(proposal);
          }
          if (isRecord(proposal) && typeof proposal.question === 'string') {
            return !answeredQuestions.has(proposal.question);
          }
          return true;
        });

      console.log(`[ManualGenerator] Filtered proposals: ${(filteredOutput.proposals as unknown[]).length} -> ${remainingProposals.length}`);
      filteredOutput = {
        ...filteredOutput,
        proposals: remainingProposals.length > 0 ? remainingProposals : undefined,
      };
    }

    const newResults: StageResults = {
      ...stageResults,
      [currentStage.name.toLowerCase().replace(/\s+/g, '_')]: filteredOutput || {},
    };

    // Continue to next stage
    if (currentStageIndex < STAGES.length - 1) {
      const nextIndex = currentStageIndex + 1;

      // Reset multi-part generation state when moving to new stage
      setIsMultiPartGeneration(false);
      setFactGroups([]);
      setCurrentGroupIndex(0);

      setCurrentStageIndex(nextIndex);
      setStageResults(newResults);

      // Smart Stage Routing: Analyze Basic Info output for NPCs and build dynamic stages
      if (config!.type === 'npc' && currentStage.name === 'Creator: Basic Info' && !dynamicNpcStages) {
        const basicInfoOutput = filteredOutput || {};
        const routingDecision = determineRequiredStages(
          basicInfoOutput as Record<string, unknown>,
          config!.prompt
        );

        setStageRoutingDecision(routingDecision);

        console.log('[Smart Routing] Stage routing decision:', routingDecision);
        console.log('[Smart Routing] Summary:\n' + getRoutingSummary(routingDecision));

        const prefixStages: Stage[] = [GENERIC_STAGES[1], GENERIC_STAGES[2]];

        const dynamicStages: Stage[] = [...prefixStages, NPC_CREATOR_STAGES[0]];

        Object.entries(routingDecision).forEach(([stageKey, requirement]) => {
          if (requirement.required && stageKey !== 'basicInfo') {
            const stageConfig = STAGE_ROUTER_MAP[stageKey];
            if (stageConfig) {
              dynamicStages.push(stageConfig);
            }
          }
        });

        setDynamicNpcStages(dynamicStages);
        console.log(`[Smart Routing] Dynamic stages built: ${dynamicStages.map(s => s.name).join(', ')}`);
        console.log(`[Smart Routing] Skipped ${NPC_CREATOR_STAGES.length - (dynamicStages.length - prefixStages.length)} stages`);
      }

      // CRITICAL FIX: Pass updated answers directly to showStageOutput since state update is async
      // We need to ensure the next stage gets the accumulated answers
      setTimeout(() => {
        // Build context with updated answers for the next stage
        const nextStage = STAGES[nextIndex];
        const context: StageContext = {
          config: config!,
          stageResults: newResults,
          factpack: factpack || null,
          previousDecisions: Object.keys(updatedAnswers).length > 0 ? updatedAnswers : undefined,
        };

        const userPrompt = nextStage.buildUserPrompt(context);
        const systemPrompt = nextStage.systemPrompt || '';

        const fullPrompt = `${systemPrompt}\n\n---\n\nUSER INPUT:\n${userPrompt}`;

        // If there are previous decisions, add them to the prompt
        if (Object.keys(updatedAnswers).length > 0) {
          const decisionsText = '\n\n---\n\nPREVIOUSLY ANSWERED QUESTIONS:\n\n' +
            'The following questions were already answered in earlier stages or chunks. Do NOT ask these questions again:\n\n' +
            Object.entries(updatedAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n') +
            '\n\nCRITICAL: Do NOT include any of the above questions in your proposals[] array. These decisions are final and must not be re-asked.';

          setCurrentPrompt(fullPrompt + decisionsText);
        } else {
          setCurrentPrompt(fullPrompt);
        }

        setModalMode('output');
      }, 100);
    } else {
      // Pipeline complete - Build complete final output
      // CRITICAL FIX: Extract content from the correct location in stage results
      // Physics Validator wraps content in { content: { content: {...}, relevant_canon: {...} } }
      let baseContent: JsonRecord = {};

      if (config!.type === 'location') {
        // Location: Use normalized data
        baseContent = normalizeLocationData(newResults);
        console.log('[handleAcceptWithIssues] Location: Normalized stage results');
      } else if (config!.type === 'monster') {
        baseContent = {
          ...newResults.basic_info,
          ...newResults['stats_&_defenses'],
          ...newResults['combat_&_abilities'],
          ...newResults['legendary_&_lair'],
          ...newResults['ecology_&_lore'],
          deliverable: 'monster', // Set AFTER spread to ensure it's not overwritten
        };

        // Keep hit_points as-is (integer or object {average, formula}) - schema accepts both

        // Clean up saving throws notes
        if (Array.isArray(baseContent.saving_throws)) {
          baseContent.saving_throws = baseContent.saving_throws.map((st: any) => {
            if (st && typeof st === 'object' && st.notes) {
              return { ...st, notes: undefined };
            }
            return st;
          });
        }

        // Clean up skill proficiencies notes
        if (Array.isArray(baseContent.skill_proficiencies)) {
          baseContent.skill_proficiencies = baseContent.skill_proficiencies.map((skill: any) => {
            if (skill && typeof skill === 'object' && skill.notes) {
              return { ...skill, notes: undefined };
            }
            return skill;
          });
        }

        console.log('[handleAcceptWithIssues] Monster: Merged all 5 stage results');
      } else if (config!.type === 'npc') {
        const npcStageKeys = [
          'creator:_basic_info',
          'creator:_core_details',
          'creator:_stats',
          'creator:_character_build',
          'creator:_combat',
          'creator:_spellcasting',
          'creator:_legendary',
          'creator:_relationships',
          'creator:_equipment',
        ] as const;

        const mergedNpc: JsonRecord = {};
        const sourcesUsedSet = new Set<string>();
        const assumptionsSet = new Set<string>();
        let schemaVersion: string | undefined;

        for (const key of npcStageKeys) {
          const stageOut = (newResults as any)[key];
          if (!isRecord(stageOut)) continue;

          if (!schemaVersion && typeof stageOut.schema_version === 'string') {
            schemaVersion = stageOut.schema_version;
          }

          if (Array.isArray(stageOut.sources_used)) {
            stageOut.sources_used
              .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
              .forEach((s: string) => sourcesUsedSet.add(s));
          }

          if (Array.isArray(stageOut.assumptions)) {
            stageOut.assumptions
              .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
              .forEach((s: string) => assumptionsSet.add(s));
          }

          Object.assign(mergedNpc, stageOut);
        }

        mergedNpc.deliverable = 'npc';
        if (schemaVersion) {
          mergedNpc.schema_version = schemaVersion;
        }

        mergedNpc.sources_used = Array.from(sourcesUsedSet);
        mergedNpc.assumptions = Array.from(assumptionsSet);

        mergedNpc.proposals = [];

        baseContent = mergedNpc;
        console.log('[handleAcceptWithIssues] NPC: Merged all creator stage results');
      } else if (config?.type === 'nonfiction') {
        if (newResults.finalizer) {
          baseContent = newResults.finalizer as JsonRecord;
          console.log('[handleAcceptWithIssues] Using content from finalizer');
        } else if (newResults['editor_&_style']) {
          baseContent = newResults['editor_&_style'] as JsonRecord;
          console.log('[handleAcceptWithIssues] Using content from editor_&_style');
        } else if (newResults.draft) {
          baseContent = newResults.draft as JsonRecord;
          console.log('[handleAcceptWithIssues] Using content from draft');
        }
      } else if (newResults.physics_validator?.content?.content) {
        // Content from Physics Validator (wrapped structure)
        baseContent = newResults.physics_validator.content.content as JsonRecord;
        console.log('[handleAcceptWithIssues] Using content from physics_validator.content.content');
      } else if (newResults.stylist) {
        // Content from Stylist (normal structure)
        baseContent = newResults.stylist as JsonRecord;
        console.log('[handleAcceptWithIssues] Using content from stylist');
      } else if (newResults.creator) {
        // Content from Creator (fallback)
        baseContent = newResults.creator as JsonRecord;
        console.log('[handleAcceptWithIssues] Using content from creator');
      } else {
        console.error('[handleAcceptWithIssues] No content found in stage results!', newResults);
      }

      // Deduplicate proposals before including in final output
      let proposals: unknown[] = [];
      if (Array.isArray((baseContent as any).proposals)) {
        const seenQuestions = new Set<string>();
        const seenQuestionsNormalized = new Set<string>();

        proposals = (baseContent as any).proposals.filter((p: unknown) => {
          if (!isRecord(p) || typeof p.question !== 'string') return true;

          const question = p.question;
          const normalizedQuestion = question.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');

          // Check if this question was already answered
          if (updatedAnswers[question]) {
            console.log(`[Proposal Dedup] Removing answered question: ${question}`);
            return false;
          }

          // Check for exact duplicates
          if (seenQuestions.has(question)) {
            return false;
          }

          // Check for semantic duplicates
          if (seenQuestionsNormalized.has(normalizedQuestion)) {
            return false;
          }

          seenQuestions.add(question);
          seenQuestionsNormalized.add(normalizedQuestion);
          return true;
        });

        console.log(`[Proposal Dedup] Reduced from ${(baseContent as any).proposals?.length || 0} to ${proposals.length} proposals`);
      }

      // Infer deliverable to ensure correct save categorization
      const inferredDeliverable = inferDeliverableType(baseContent as JsonRecord, config!.type);

      const finalContent: JsonRecord = {
        // Use Stylist as the source of truth for all content fields
        ...baseContent,

        // Override with deduplicated proposals
        proposals,

        // Critical for correct mapping when saving to project
        deliverable: inferredDeliverable,

        fact_check_report: config!.type === 'nonfiction' ? (newResults['editor_&_style'] || {}) : (newResults.fact_checker || {}),

        // Add Canon Validator metadata (these are NEW fields, not overwrites)
        conflicts: newResults.canon_validator?.conflicts || [],
        canon_alignment_score: newResults.canon_validator?.canon_alignment_score,
        validation_notes: newResults.canon_validator?.validation_notes,

        // Add Physics Validator metadata (these are NEW fields, not overwrites)
        physics_issues: newResults.physics_validator?.physics_issues || [],
        logic_score: newResults.physics_validator?.logic_score,
        balance_notes: newResults.physics_validator?.balance_notes,

        // Include the full stage results for debugging/audit trail
        _pipeline_stages: newResults,
      };

      setStageResults(newResults);
      setFinalOutput(finalContent);
      setIsComplete(true);
      setModalMode(null); // CRITICAL: Close the modal

      console.log('[ManualGenerator] Pipeline complete via handleAcceptWithIssues');
      console.log('[DEBUG] Final content:', finalContent);

      // Scroll to results section
      setTimeout(() => {
        const resultsSection = document.getElementById('generation-results');
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);

      // Show success message
      const title = getString(finalContent, 'title') || getString(finalContent, 'canonical_name') || 'Generated Content';
      alert(`✅ Generation Complete!\n\nTitle: ${title}\n\nScroll down to review and save the content.`);
    }
  };

  const handleSkip = () => {
    // User wants to skip this stage and provide data manually
    // Switch to input mode and enable skip mode to show appropriate UI
    _setSkipMode(true);
    setModalMode('input');
  };

  const handleNarrow = async (newKeywords: string[]) => {
    // User provided new, more specific keywords - re-search canon
    console.log('[ManualGenerator] Narrowing with new keywords:', newKeywords);

    try {
      const newFactpack = await searchCanonWithKeywords(newKeywords);
      console.log(`[ManualGenerator] After narrowing: ${newFactpack.facts.length} facts (threshold: ${config!.max_canon_facts})`);

      // Check if still exceeds threshold
      if (newFactpack.facts.length > config!.max_canon_facts) {
        // Still too many - update modal with new counts
        setPendingFactpack(newFactpack);
        setCurrentKeywords(newKeywords);
        // Modal stays open with updated data
        alert(`Still ${newFactpack.facts.length} facts found (limit: ${config!.max_canon_facts}). Please narrow further or proceed anyway.`);
      } else {
        // Success! Within threshold
        _setShowNarrowingModal(false);
        setPendingFactpack(null);
        setCurrentKeywords([]);
        setRetrievalHintsContext(null);

        if (processingRetrievalHints) {
          // We were processing retrieval_hints - merge and continue
          const mergedFactpack = mergeFactpacks(factpack!, newFactpack);
          console.log(`[ManualGenerator] Merged after narrowing: ${mergedFactpack.facts.length} total facts`);
          setFactpack(mergedFactpack);
          setProcessingRetrievalHints(false);

          // If in multi-chunk mode, we should have already merged chunks and be ready to proceed to next stage
          // The pendingStageResults contains the merged stage output
          if (pendingStageResults && currentStageIndex < STAGES.length - 1) {
            const nextIndex = currentStageIndex + 1;
            setCurrentStageIndex(nextIndex);
            setStageResults(pendingStageResults);
            setPendingStageResults(null);

            // Note: chunk state already reset above
            if (isMultiPartGeneration) {
              setCurrentGroupIndex(0);
              console.log(`[Multi-Chunk] Narrowed facts retrieved, proceeding to next stage with multi-chunk mode active`);
            }

            setTimeout(() => {
              showStageOutput(nextIndex, config!, pendingStageResults, mergedFactpack);
            }, 100);
          }
        } else {
          // We were processing initial keyword extraction
          setFactpack(newFactpack);
          setPendingFactpack(null);
          setCurrentKeywords([]);

          const baseStageResults = pendingStageResults || stageResults;
          setPendingStageResults(null);

          // Store keyword extractor result and proceed to next stage
          const currentStage = STAGES[currentStageIndex];
          const stageKey = currentStage.name.toLowerCase().replace(/\s+/g, '_');
          const shouldStoreKeywordsOnStage = currentStage.name === 'Keyword Extractor';
          const newResults: StageResults = {
            ...baseStageResults,
            ...(shouldStoreKeywordsOnStage ? { [stageKey]: { keywords: newKeywords } } : {}),
          };

          if (currentStageIndex < STAGES.length - 1) {
            const nextIndex = currentStageIndex + 1;
            setCurrentStageIndex(nextIndex);
            setStageResults(newResults);

            setTimeout(() => {
              showStageOutput(nextIndex, config!, newResults, newFactpack);
            }, 100);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error searching canon';
      setError(`Failed to search canon: ${message}`);
    }
  };

  const handleFilterFacts = (filteredFacts: Array<{ text: string; chunk_id?: string; entity_name: string; entity_id?: string; entity_type?: string; region?: string }>) => {
    // User filtered facts manually
    console.log('[ManualGenerator] User filtered to', filteredFacts.length, 'facts from', pendingFactpack!.facts.length);

    // Create new factpack with filtered facts
    const filteredFactpack: Factpack = {
      facts: filteredFacts.map(fact => ({
        text: fact.text,
        chunk_id: fact.chunk_id || '',
        entity_name: fact.entity_name,
        entity_id: fact.entity_id || fact.entity_name,
        entity_type: fact.entity_type,
        region: fact.region,
      })),
      entities: Array.from(new Set(filteredFacts.map(f => f.entity_id || f.entity_name))),
      gaps: [],
    };

    _setShowNarrowingModal(false);
    setRetrievalHintsContext(null);

    if (processingRetrievalHints) {
      // We were processing retrieval_hints - merge and continue
      const mergedFactpack = mergeFactpacks(factpack!, filteredFactpack);
      console.log(`[ManualGenerator] Merged after filtering: ${mergedFactpack.facts.length} total facts`);
      setFactpack(mergedFactpack);
      setPendingFactpack(null);
      setCurrentKeywords([]);
      setProcessingRetrievalHints(false);

      // If in multi-chunk mode, we should have already merged chunks and be ready to proceed to next stage
      // The pendingStageResults contains the merged stage output
      if (pendingStageResults && currentStageIndex < STAGES.length - 1) {
        const nextIndex = currentStageIndex + 1;
        setCurrentStageIndex(nextIndex);
        setStageResults(pendingStageResults);
        setPendingStageResults(null);

        // Reset chunk index for next stage (if still in multi-chunk mode)
        if (isMultiPartGeneration) {
          setCurrentGroupIndex(0);
          console.log(`[Multi-Chunk] Retrieved additional facts, proceeding to next stage with multi-chunk mode active`);
        }

        setTimeout(() => {
          showStageOutput(nextIndex, config!, pendingStageResults, mergedFactpack);
        }, 100);
      }
    } else {
      // We were processing initial keyword extraction

      // Check if chunking is needed
      const nextStageName = STAGES[Math.min(currentStageIndex + 1, STAGES.length - 1)]?.name;
      const needsChunking = checkForChunking(filteredFactpack, nextStageName);

      if (needsChunking) {
        // Store the factpack for after user approves chunking
        setPendingFactpack(filteredFactpack);
        return;
      }

      setFactpack(filteredFactpack);
      setPendingFactpack(null);
      setCurrentKeywords([]);

      // Store keyword extractor result and proceed to next stage
      const currentStage = STAGES[currentStageIndex];
      const baseStageResults = pendingStageResults || stageResults;
      setPendingStageResults(null);
      const stageKey = currentStage.name.toLowerCase().replace(/\s+/g, '_');
      const shouldStoreKeywordsOnStage = currentStage.name === 'Keyword Extractor';
      const newResults: StageResults = {
        ...baseStageResults,
        ...(shouldStoreKeywordsOnStage ? { [stageKey]: { keywords: currentKeywords } } : {}),
      };

      if (currentStageIndex < STAGES.length - 1) {
        const nextIndex = currentStageIndex + 1;
        setCurrentStageIndex(nextIndex);
        setStageResults(newResults);

        setTimeout(() => {
          showStageOutput(nextIndex, config!, newResults, filteredFactpack);
        }, 100);
      }
    }
  };

  const handleProceedAnyway = () => {
    // User chose to proceed despite high fact count
    console.log('[ManualGenerator] User chose to proceed with', pendingFactpack!.facts.length, 'facts');

    _setShowNarrowingModal(false);
    setRetrievalHintsContext(null);

    if (processingRetrievalHints) {
      // We were processing retrieval_hints - merge and continue
      const mergedFactpack = mergeFactpacks(factpack!, pendingFactpack!);
      console.log(`[ManualGenerator] Merged after proceeding anyway: ${mergedFactpack.facts.length} total facts`);
      setFactpack(mergedFactpack);
      setPendingFactpack(null);
      setCurrentKeywords([]);
      setProcessingRetrievalHints(false);

      // If in multi-chunk mode, we should have already merged chunks and be ready to proceed to next stage
      // The pendingStageResults contains the merged stage output
      if (pendingStageResults && currentStageIndex < STAGES.length - 1) {
        const nextIndex = currentStageIndex + 1;
        setCurrentStageIndex(nextIndex);
        setStageResults(pendingStageResults);
        setPendingStageResults(null);

        // Reset chunk index for next stage (if still in multi-chunk mode)
        if (isMultiPartGeneration) {
          setCurrentGroupIndex(0);
          console.log(`[Multi-Chunk] Proceeding with all facts, advancing to next stage with multi-chunk mode active`);
        }

        setTimeout(() => {
          showStageOutput(nextIndex, config!, pendingStageResults, mergedFactpack);
        }, 100);
      }
    } else {
      // We were processing initial keyword extraction
      setFactpack(pendingFactpack!);
      setPendingFactpack(null);
      setCurrentKeywords([]);

      const baseStageResults = pendingStageResults || stageResults;
      setPendingStageResults(null);

      // Store keyword extractor result and proceed to next stage
      const currentStage = STAGES[currentStageIndex];
      const stageKey = currentStage.name.toLowerCase().replace(/\s+/g, '_');
      const shouldStoreKeywordsOnStage = currentStage.name === 'Keyword Extractor';
      const newResults: StageResults = {
        ...baseStageResults,
        ...(shouldStoreKeywordsOnStage ? { [stageKey]: { keywords: currentKeywords } } : {}),
      };

      if (currentStageIndex < STAGES.length - 1) {
        const nextIndex = currentStageIndex + 1;
        setCurrentStageIndex(nextIndex);
        setStageResults(newResults);

        setTimeout(() => {
          showStageOutput(nextIndex, config!, newResults, pendingFactpack!);
        }, 100);
      }
    }
  };

  const handleProceedWithChunking = () => {
    setShowChunkingModal(false);

    if (isNpcSectionChunking) {
      // NPC Section-Based Chunking
      console.log('[NPC Section Chunking] User approved section-based generation with', npcSectionChunks.length, 'sections');

      setIsMultiPartGeneration(true);
      setCurrentNpcSectionIndex(0);
      setAccumulatedNpcSections({});

      const firstSection = npcSectionChunks[0];

      // Create chunk info for first section
      const chunkInfo = {
        isChunked: true,
        currentChunk: 1,
        totalChunks: npcSectionChunks.length,
        chunkLabel: firstSection.chunkLabel,
      };

      const currentStage = STAGES[currentStageIndex];
      console.log(`[NPC Section Chunking] Starting section 1/${npcSectionChunks.length}: ${firstSection.chunkLabel} for ${currentStage.name} stage`);

      setTimeout(() => {
        showStageOutput(currentStageIndex, config!, stageResults, factpack, chunkInfo);
      }, 100);

    } else {
      // Fact-Based Chunking (original behavior)
      console.log('[Fact Chunking] User approved multi-part generation with', factGroups.length, 'parts');

      setIsMultiPartGeneration(true);
      setCurrentGroupIndex(0);

      // Start with first group
      const firstGroup = factGroups[0];
      const firstGroupFactpack: Factpack = {
        facts: firstGroup.facts,
        entities: Array.from(new Set(firstGroup.facts.map(f => f.entity_id || f.entity_name))),
        gaps: [],
      };

      setFactpack(firstGroupFactpack);
      setPendingFactpack(null);

      // Create chunk info for first chunk
      const chunkInfo = {
        isChunked: true,
        currentChunk: 1,
        totalChunks: factGroups.length,
        chunkLabel: firstGroup.label,
      };

      // CRITICAL FIX: Stay on the CURRENT stage and show chunk 1
      // Don't move to next stage - we're chunking the current stage
      const currentStage = STAGES[currentStageIndex];
      console.log(`[Fact Chunking] Starting chunk 1/${factGroups.length} for ${currentStage.name} stage`);

      setTimeout(() => {
        showStageOutput(currentStageIndex, config!, stageResults, firstGroupFactpack, chunkInfo);
      }, 100);
    }
  };

  const handleCloseNarrowingModal = () => {
    // User cancelled - reset and go back
    _setShowNarrowingModal(false);
    setPendingFactpack(null);
    setCurrentKeywords([]);
    setPendingStageResults(null);
    setProcessingRetrievalHints(false);
    setRetrievalHintsContext(null);
    // Show the keyword extractor input modal again so user can retry
    setModalMode('input');
  };

  // Helper function to process retrieval_hints from stage outputs
  const processRetrievalHints = async (stageOutput: JsonRecord, newResults: StageResults, stageName: string) => {
    // Extract retrieval_hints if present
    const retrievalHints = isRecord(stageOutput.retrieval_hints) ? stageOutput.retrieval_hints : null;

    if (!retrievalHints) {
      // No retrieval hints - proceed normally
      return { shouldProceed: true, newResults };
    }

    // Combine all hints into keywords array
    const hintsKeywords: string[] = [];

    if (Array.isArray(retrievalHints.entities)) {
      hintsKeywords.push(...toStringArray(retrievalHints.entities));
    }
    if (Array.isArray(retrievalHints.regions)) {
      hintsKeywords.push(...toStringArray(retrievalHints.regions));
    }
    if (Array.isArray(retrievalHints.eras)) {
      hintsKeywords.push(...toStringArray(retrievalHints.eras));
    }
    if (Array.isArray(retrievalHints.keywords)) {
      hintsKeywords.push(...toStringArray(retrievalHints.keywords));
    }

    if (hintsKeywords.length === 0) {
      // No actual hints - proceed normally
      return { shouldProceed: true, newResults };
    }

    console.log('[ManualGenerator] Found retrieval_hints:', hintsKeywords);

    // Search canon with hints
    const newFactpack = await searchCanonWithKeywords(hintsKeywords);
    console.log(`[ManualGenerator] Retrieval hints found ${newFactpack.facts.length} additional facts (threshold: ${config!.max_canon_facts})`);

    // Check if NEW facts exceed threshold
    if (newFactpack.facts.length > config!.max_canon_facts) {
      console.log('[ManualGenerator] Retrieval hints exceeded threshold - showing narrowing modal');

      // Store context about what was requested
      const requestedEntities: string[] = [];
      if (Array.isArray(retrievalHints.entities)) {
        requestedEntities.push(...toStringArray(retrievalHints.entities));
      }
      if (Array.isArray(retrievalHints.regions)) {
        requestedEntities.push(...toStringArray(retrievalHints.regions));
      }

      setRetrievalHintsContext({
        stageName,
        requestedEntities,
      });

      // Store for later processing
      setPendingFactpack(newFactpack);
      setCurrentKeywords(hintsKeywords);
      setPendingStageResults(newResults);
      setProcessingRetrievalHints(true);
      _setShowNarrowingModal(true);
      setModalMode(null);
      return { shouldProceed: false, newResults };
    }

    // Merge with existing factpack
    const mergedFactpack = mergeFactpacks(factpack!, newFactpack);
    console.log(`[ManualGenerator] Merged factpack: ${factpack!.facts.length} existing + ${newFactpack.facts.length} new = ${mergedFactpack.facts.length} total`);
    setFactpack(mergedFactpack);

    return { shouldProceed: true, newResults };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-500" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-gray-900">Manual AI Generator</h1>
                  {project?.title && (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                      {project.title}
                    </span>
                  )}
                  {project?.type && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {project.type}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-1">
                  Use any AI chat service - copy prompts, paste responses
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResumeModal(true)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium border border-gray-300"
              >
                Resume Session
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Auto-save progress</span>
              </label>
              {progressSession && (
                <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                  Session: {progressSession.sessionId.substring(0, 8)}...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Generator Panel - shown before generation starts */}
        {!config && (
          <div className="mb-6">
            {projectId !== 'default' && projectLoading && !project ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600">Loading project settings...</div>
              </div>
            ) : (
              <GeneratorPanel onGenerate={handleGenerate} projectType={project?.type} />
            )}

            {/* Import JSON Section */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-3">Or Import Existing JSON</h3>
              <p className="text-sm text-gray-600 mb-4">
                Skip generation and directly import a previously generated JSON file for editing and saving.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Content Type:</label>
                  <select
                    value={uploadedContentType}
                    onChange={(e) => setUploadedContentType(e.target.value as GenerationConfig['type'])}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="npc">NPC</option>
                    <option value="monster">Monster</option>
                    <option value="encounter">Encounter</option>
                    <option value="item">Item</option>
                    <option value="scene">Scene</option>
                    <option value="story_arc">Story Arc</option>
                    <option value="adventure">Adventure</option>
                    <option value="location">Location</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer text-sm font-medium text-gray-700">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadedJson}
                    className="hidden"
                    disabled={uploading}
                  />
                  {uploading ? 'Importing...' : 'Choose JSON File'}
                </label>
              </div>
              {uploadError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Banner */}
        {currentStageIndex >= 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  Generation in Progress: Stage {currentStageIndex + 1} of {STAGES.length} - {STAGES[currentStageIndex]?.name}
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  {modalMode === null ? 'Modal closed. Click "Show Current Prompt" to continue.' : modalMode === 'output' ? 'Copy the prompt and paste it into your AI chat' : 'Paste the AI response to continue'}
                </p>
                {autoSaveEnabled && lastSaveTime && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Auto-saved at {new Date(lastSaveTime).toLocaleTimeString()}
                  </p>
                )}
                {/* Smart Routing Info */}
                {config?.type === 'npc' && stageRoutingDecision && (
                  <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded-md">
                    <h4 className="text-xs font-semibold text-blue-900 mb-2">📋 Smart Stage Routing</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="font-medium text-green-700">Included Stages:</p>
                        <ul className="list-disc list-inside text-green-800 mt-1">
                          {Object.entries(stageRoutingDecision).filter(([_, req]) => req.required).map(([key, req]) => (
                            <li key={key} title={req.reason}>
                              {key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Skipped Stages:</p>
                        <ul className="list-disc list-inside text-gray-700 mt-1">
                          {Object.entries(stageRoutingDecision).filter(([_, req]) => !req.required).map(([key, req]) => (
                            <li key={key} title={req.reason}>
                              {key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 mt-2 italic">
                      Hover over stages to see reasoning
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {modalMode === null && (
                  <button
                    onClick={handleRetryCurrentStage}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Show Current Prompt
                  </button>
                )}
                {/* Show "Review Spaces" button during location generation if there are accepted spaces */}
                {config?.type === 'location' && accumulatedChunkResults.length > 0 && STAGES[currentStageIndex]?.name === 'Spaces' && (
                  <button
                    onClick={() => {
                      console.log('[Review Spaces] Opening space approval modal to review previous spaces');
                      // Synchronize reciprocal doors before reviewing
                      const syncedResults = synchronizeReciprocalDoors(accumulatedChunkResults as any[]);
                      setAccumulatedChunkResults(syncedResults);
                      setLiveMapSpaces(syncedResults); // Keep live map in sync
                      console.log('[Review Spaces] Synchronized reciprocal doors for', syncedResults.length, 'spaces');
                      setReviewingSpaceIndex(syncedResults.length - 1); // Start at last accepted space
                      setPendingSpace(syncedResults[syncedResults.length - 1]);
                      setShowSpaceApprovalModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Review Spaces ({accumulatedChunkResults.length})
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
                >
                  Reset & Start Over
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Display */}
        {isComplete && finalOutput && (
          <div id="generation-results" className="mt-6 scroll-mt-4">
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-green-800">Generation Complete</h2>
                  <span className="text-3xl">✅</span>
                  <h2 className="text-2xl font-bold text-gray-800">Generated Content</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Homebrew content skips canon delta review and goes straight to editing
                      if (getString(finalOutput, 'deliverable') === 'homebrew') {
                        setShowEditModal(true);
                      } else {
                        setShowCanonDeltaModal(true);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                  >
                    {getString(finalOutput, 'deliverable') === 'homebrew' ? 'Edit & Save to Project' : 'Review & Save to Project'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const jsonString = JSON.stringify(finalOutput, null, 2);
                        await navigator.clipboard.writeText(jsonString);
                        alert(`Copied to clipboard! (${jsonString.length.toLocaleString()} characters)`);
                      } catch (err) {
                        console.error('Failed to copy JSON:', err);
                        alert('Failed to copy to clipboard. Please try selecting and copying the JSON manually from the preview below.');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Show homebrew-specific content if it's a homebrew deliverable */}
                {getString(finalOutput, 'deliverable') === 'homebrew' ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">
                        {getString(finalOutput, 'document_title') || 'Homebrew Content'}
                      </h3>
                      <div className="flex gap-2 mb-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">homebrew</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                          {(typeof (finalOutput as Record<string, unknown>).total_chunks === 'number'
                            ? ((finalOutput as Record<string, unknown>).total_chunks as number)
                            : 0)} chunks processed
                        </span>
                      </div>
                    </div>

                    {/* Parsing Summary */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-700 mb-3">Parsing Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(() => {
                          const entries = Array.isArray(finalOutput.entries) ? finalOutput.entries : [];
                          const typeCounts: Record<string, number> = {};
                          entries.forEach((entry: any) => {
                            const type = entry.type || 'unknown';
                            typeCounts[type] = (typeCounts[type] || 0) + 1;
                          });

                          const typeColors: Record<string, { bg: string; border: string; text: string }> = {
                            race: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple' },
                            subrace: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple' },
                            rule: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red' },
                            lore: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo' },
                            spell: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue' },
                            item: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green' },
                            creature: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange' },
                            class: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan' },
                            subclass: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan' },
                            feat: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow' },
                            background: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal' },
                          };

                          return Object.entries(typeCounts).map(([type, count]) => {
                            const colors = typeColors[type] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray' };
                            return (
                              <div key={type} className={`${colors.bg} border ${colors.border} rounded p-3`}>
                                <div className={`text-xs ${colors.text}-600 font-medium mb-1 capitalize`}>{type}s</div>
                                <div className={`text-2xl font-bold ${colors.text}-700`}>
                                  {count}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Entries Preview */}
                    {Array.isArray(finalOutput.entries) && finalOutput.entries.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-3">Extracted Entries ({finalOutput.entries.length})</h4>
                        <div className="space-y-2 max-h-96 overflow-auto">
                          {(finalOutput.entries as Array<{type: string; title: string; short_summary?: string; tags?: string[]}>).map((entry, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="font-medium text-gray-900">{entry.title}</div>
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded capitalize flex-shrink-0">
                                  {entry.type}
                                </span>
                              </div>
                              {entry.short_summary && (
                                <p className="text-sm text-gray-600 mb-2">{entry.short_summary}</p>
                              )}
                              {entry.tags && entry.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {entry.tags.map((tag: string, tagIdx: number) => (
                                    <span key={tagIdx} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unparsed Content - Most Important for User */}
                    {Array.isArray(finalOutput.unparsed) && finalOutput.unparsed.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                          Unparsed Content ({finalOutput.unparsed.length} section{finalOutput.unparsed.length !== 1 ? 's' : ''})
                        </h4>
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-3">
                          <p className="text-sm text-yellow-800 mb-2">
                            This content could not be automatically parsed into structured data. Review it below and decide how to handle it:
                          </p>
                          <div className="space-y-3">
                            {finalOutput.unparsed.map((section: string, idx: number) => (
                              <div key={idx} className="bg-white border border-yellow-200 rounded p-3">
                                <div className="text-xs text-yellow-700 font-medium mb-1">Section {idx + 1}</div>
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                                  {section}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Parsing Notes */}
                    {getString(finalOutput, 'notes') && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2">Parsing Notes</h4>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3">
                          <pre className="text-sm text-blue-800 whitespace-pre-wrap">
                            {getString(finalOutput, 'notes')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Full JSON Output - Collapsed by default */}
                    <div className="border-t pt-4">
                      <details className="group">
                        <summary className="font-medium text-gray-700 mb-2 cursor-pointer hover:text-blue-600 flex items-center gap-2">
                          <span>Full JSON Output</span>
                          <span className="text-xs text-gray-500">(click to expand)</span>
                        </summary>
                        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 font-mono mt-2">
                          {JSON.stringify(finalOutput, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Standard content display */}
                    <div>
                      {(() => {
                        const title = getString(finalOutput, 'title') || getString(finalOutput, 'canonical_name') || getString(finalOutput, 'name') || 'Untitled';
                        const deliverable = getString(finalOutput, 'deliverable');
                        const difficulty = getString(finalOutput, 'difficulty');
                        return (
                          <>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
                            <div className="flex gap-2 mb-3">
                              {deliverable && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">{deliverable}</span>
                              )}
                              {difficulty && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium">{difficulty}</span>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {(getString(finalOutput, 'deliverable') === 'nonfiction' || getString(finalOutput, 'type') === 'nonfiction') && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-700 mb-2">Manuscript Preview</h4>
                        {getString(finalOutput, 'formatted_manuscript') ? (
                          <pre className="bg-white border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                            {getString(finalOutput, 'formatted_manuscript')}
                          </pre>
                        ) : Array.isArray(finalOutput.chapters) && finalOutput.chapters.length > 0 ? (
                          <div className="space-y-3 max-h-96 overflow-auto">
                            {(finalOutput.chapters as Array<{ title?: string; summary?: string; draft_text?: string }>).map((ch, idx) => (
                              <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                                <div className="font-medium text-gray-900">{ch.title || `Chapter ${idx + 1}`}</div>
                                {ch.summary && <div className="text-sm text-gray-600 mt-1">{ch.summary}</div>}
                                {ch.draft_text && (
                                  <pre className="text-sm text-gray-800 whitespace-pre-wrap mt-2 max-h-64 overflow-auto">
                                    {ch.draft_text}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">No manuscript preview was provided.</div>
                        )}
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-700 mb-2">Full JSON Output:</h4>
                      <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm overflow-auto max-h-96 font-mono">
                        {JSON.stringify(finalOutput, null, 2)}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            How Manual Mode Works
          </h3>
          <ol className="text-sm text-yellow-800 space-y-2">
            <li>
              <strong>1.</strong> Click "Generate Content" to start
            </li>
            <li>
              <strong>2.</strong> A popup shows a prompt → Click "Copy" → Paste into your AI chat
            </li>
            <li>
              <strong>3.</strong> Copy the AI's response → Paste it back in the next popup
            </li>
            <li>
              <strong>4.</strong> Repeat for {STAGES.length} stages ({STAGES.map(s => s.name).join(' → ')})
            </li>
            <li>
              <strong>5.</strong> Review validation results (conflicts, logic issues, scores)
            </li>
            <li>
              <strong>6.</strong> Click "Review & Save to Project" to resolve issues and save
            </li>
          </ol>
          <p className="text-xs text-yellow-700 mt-3">
            💡 Works with ChatGPT, Claude, Gemini, or any AI that accepts JSON prompts
          </p>
        </div>

        {/* Resources Panel */}
        <ResourcesPanel projectId={projectId} />
      </div>

      {/* Copy/Paste Modal */}
      <CopyPasteModal
        isOpen={modalMode !== null && !showReviewModal}
        mode={modalMode || 'output'}
        stageName={STAGES[currentStageIndex]?.name || ''}
        stageNumber={currentStageIndex + 1}
        totalStages={STAGES.length}
        outputText={modalMode === 'output' ? currentPrompt : undefined}
        error={error}
        softWarning={locationSoftWarning}
        onFixNow={
          locationSoftWarning
            ? () => {
                jumpToStage(locationSoftWarning.fixStageName);
              }
            : undefined
        }
        canGoBack={currentStageIndex > 0}
        canSkip={!isMultiPartGeneration} // Disable Skip during multi-chunk generation
        skipMode={skipMode}
        chunkProgress={
          // Show chunk progress for homebrew chunks
          Array.isArray(stageResults.homebrew_chunks) && typeof stageResults.current_chunk === 'number'
            ? {
              current: stageResults.current_chunk as number,
              total: stageResults.homebrew_chunks.length,
              title: (stageResults.homebrew_chunks[stageResults.current_chunk as number] as { title?: string } | undefined)?.title,
            }
            // Or show chunk progress for stage chunking (location spaces)
            : isStageChunking && totalStageChunks > 0
            ? {
              current: currentStageChunk,
              total: totalStageChunks,
              title: `Space ${currentStageChunk + 1} of ${totalStageChunks}`,
            }
            // Or show chunk progress for multi-part generation
            : isMultiPartGeneration && factGroups.length > 0
            ? {
              current: currentGroupIndex,
              total: factGroups.length,
              title: factGroups[currentGroupIndex]?.label || `Chunk ${currentGroupIndex + 1}`,
            }
            : undefined
        }
        canAutoParse={Array.isArray(stageResults.homebrew_chunks) && config?.type === 'homebrew'}
        structuredContent={
          (() => {
            const stages = getStages(config, dynamicNpcStages);
            const currentStage = stages[currentStageIndex];
            if (!currentStage || modalMode !== 'input') return undefined;

            if (currentStage.name === 'Details' && stageResults.details) {
              return {
                type: 'location-details' as const,
                data: stageResults.details as Record<string, unknown>,
              };
            }

            if (currentStage.name === 'Accuracy Refinement' && stageResults.accuracy_refinement) {
              return {
                type: 'location-accuracy' as const,
                data: stageResults.accuracy_refinement as Record<string, unknown>,
              };
            }

            return undefined;
          })()
        }
    liveMapPanel={
      // Show Live Map Panel inside modal during Location Spaces, Details, and Accuracy Refinement stages
      (() => {
        const shouldShow = !!config && shouldShowMapForStage(config, currentStageIndex) && showLiveMap;
        return shouldShow ? (
          <LiveVisualMapPanel
            updateToken={mapUpdateCounter}
            locationName={String(stageResults.purpose?.name || (config ? config.prompt : '')).slice(0, 50)}
            totalSpaces={totalStageChunks}
            currentSpace={currentStageChunk + 1}
            spaces={liveMapSpaces}
            isGenerating={modalMode === 'input'}
            onAddSpace={handleAddSpace}
            onUpdateSpaces={async (updatedSpaces) => {
              console.log('[ManualGenerator] Received updated spaces from editor:', updatedSpaces.length);
              console.log('[ManualGenerator] Sample updated space:', updatedSpaces[0]?.name, updatedSpaces[0]?.size_ft);

              // Update the accumulated chunk results to persist the changes
              // CRITICAL: Match by name, NOT by index (order can change when rooms are repositioned)
              const resultsMap = new Map(
                accumulatedChunkResults.map(r => [(r.name || r.id), r])
              );

              const updatedResults = updatedSpaces.map((space) => {
                // Find matching original by name
                const original = resultsMap.get(space.name || space.id);
                if (!original) {
                  console.log('[onUpdateSpaces] New space detected:', space.name);
                  return space;
                }

                // ✓ CRITICAL: Remove old dimensions before merging to prevent conflicts
                const cleanedOriginal = { ...original };
                delete cleanedOriginal.dimensions;
                delete cleanedOriginal.size_ft;

                const merged = {
                  ...cleanedOriginal,
                  ...space,
                };

                // ✓ CRITICAL: Explicitly preserve position and position_locked from editor
                if (space.position) {
                  merged.position = {
                    x: space.position.x,
                    y: space.position.y,
                  };
                }
                if (typeof space.position_locked === 'boolean') {
                  merged.position_locked = space.position_locked;
                }

                // ✓ CRITICAL: Explicitly preserve doors from editor (including manually-adjusted child door positions)
                if (Array.isArray(space.doors)) {
                  merged.doors = space.doors;
                }

                // ✓ CRITICAL: Sync dimensions and size_ft to prevent reversion
                // ALWAYS use size_ft as source of truth (visual editor uses this)
                if (space.size_ft && typeof space.size_ft === 'object') {
                  merged.size_ft = {
                    width: space.size_ft.width,
                    height: space.size_ft.height,
                  };
                  merged.dimensions = {
                    width: space.size_ft.width,
                    height: space.size_ft.height,
                  };
                }
                // Fallback: if only dimensions provided, sync to size_ft
                else if (space.dimensions && typeof space.dimensions === 'object') {
                  const dims = space.dimensions as any;
                  merged.dimensions = {
                    width: dims.width,
                    height: dims.height,
                  };
                  merged.size_ft = {
                    width: dims.width,
                    height: dims.height,
                  };
                }
                // Last resort: preserve original if nothing provided
                else if (original.size_ft) {
                  const originalSize = original.size_ft;
                  if (originalSize && typeof originalSize === 'object') {
                    const w = (originalSize as Record<string, unknown>).width;
                    const h = (originalSize as Record<string, unknown>).height;
                    merged.size_ft = {
                      width: typeof w === 'number' ? w : undefined,
                      height: typeof h === 'number' ? h : undefined,
                    };
                  }

                  const originalDims = original.dimensions;
                  if (typeof originalDims === 'string') {
                    merged.dimensions = originalDims;
                  } else if (originalDims && typeof originalDims === 'object') {
                    const w = (originalDims as Record<string, unknown>).width;
                    const h = (originalDims as Record<string, unknown>).height;
                    const unit = (originalDims as Record<string, unknown>).unit;
                    merged.dimensions = {
                      width: typeof w === 'number' ? w : undefined,
                      height: typeof h === 'number' ? h : undefined,
                      unit: typeof unit === 'string' ? unit : undefined,
                    };
                  }
                }

                console.log(`[Save Debug] ${space.name}:`, {
                  position: merged.position,
                  position_locked: merged.position_locked,
                  size_ft: merged.size_ft
                });

                return merged;
              });
              setAccumulatedChunkResults(updatedResults);
              setLiveMapSpaces(updatedResults); // Use merged results to include door changes from form

              // Force map re-render
              setMapUpdateCounter(prev => prev + 1);

              // CRITICAL: Also update stageResults so the AI context includes these manual edits
              // This ensures that when the next prompt is generated, it has the latest user edits
              const mergedChunks = mergeStageChunks(updatedResults, 'Spaces');
              const updatedStageResults = {
                ...stageResults,
                spaces: mergedChunks,
              };
              setStageResults(updatedStageResults);

              console.log('[ManualGenerator] ✓ Updated spaces saved to accumulatedChunkResults AND stageResults');
              console.log('[ManualGenerator] ✓ Next AI prompt will include these manual edits');

              // Save to progress session if auto-save is enabled
              if (autoSaveEnabled && progressSession) {
                try {
                  // SINGLE SOURCE OF TRUTH: Always save to stageChunkState only
                  const updatedSession: GenerationProgress = {
                    ...progressSession,
                    lastUpdatedAt: new Date().toISOString(),
                    stageChunkState: {
                      isStageChunking: progressSession.stageChunkState?.isStageChunking ?? isStageChunking,
                      currentStageChunk: progressSession.stageChunkState?.currentStageChunk ?? currentStageChunk,
                      totalStageChunks: progressSession.stageChunkState?.totalStageChunks ?? totalStageChunks,
                      showLiveMap: progressSession.stageChunkState?.showLiveMap ?? showLiveMap,
                      liveMapSpaces: updatedResults, // Use merged results to preserve all data
                      accumulatedChunkResults: updatedResults,
                    },
                  };

                  console.log('[ManualGenerator] Saving to stageChunkState:', updatedResults.length, 'spaces');
                  updatedResults.slice(0, 3).forEach(s => {
                    console.log(`  - ${s.name}: pos=(${s.position?.x},${s.position?.y}) locked=${s.position_locked}`);
                  });

                  setProgressSession(updatedSession);
                  await saveProgressToFile(updatedSession);
                  setLastSaveTime(new Date().toISOString());
                  console.log('[ManualGenerator] ✓ Saved to stageChunkState (single source of truth)');
                } catch (error) {
                  console.error('[ManualGenerator] Failed to save updated spaces to session:', error);
                }
              }
            }}
          />
        ) : undefined;
      })()
    }
    onAutoParse={handleAutoParse}
    onCopied={handleCopied}
    onSubmit={handleSubmit}
    onSkip={handleSkip}
    onBack={handleBack}
    acceptedSpacesCount={accumulatedChunkResults.length}
    totalSpacesCount={totalStageChunks}
    batchModeEnabled={batchModeEnabled}
    onReviewSpaces={() => {
      console.log('[Review Spaces] Opening space approval modal from CopyPasteModal');
      // Synchronize reciprocal doors before reviewing
      const syncedResults = synchronizeReciprocalDoors(accumulatedChunkResults as any[]);
      setAccumulatedChunkResults(syncedResults);
      setLiveMapSpaces(syncedResults); // Keep live map in sync
      console.log('[Review Spaces] Synchronized reciprocal doors for', syncedResults.length, 'spaces');
      setReviewingSpaceIndex(syncedResults.length - 1); // Start at last accepted space
      setPendingSpace(syncedResults[syncedResults.length - 1]);
      setShowSpaceApprovalModal(true);
    }}
    onToggleBatchMode={() => {
      const newValue = !batchModeEnabled;
      setBatchModeEnabled(newValue);
      console.log(`[Batch Mode] ${newValue ? 'Enabled' : 'Disabled'} - spaces will ${newValue ? 'auto-accept' : 'require approval'}`);
      if (newValue) {
        alert('⚡ Batch Mode Enabled\n\nRemaining spaces will be auto-accepted as they are generated.\n\nYou can still review all spaces at the end before proceeding to the next stage.');
      }
    }}
    onFinishSkip={handleFinishSkip}
    lastSaveTime={lastSaveTime}
    onSaveDraft={() => {
      if (progressSession && autoSaveEnabled) {
        const savedSession = {
          ...progressSession,
          lastUpdatedAt: new Date().toISOString(),
          stageResults: { ...stageResults } as unknown as Record<string, unknown>,
          currentStageIndex,
          stageChunkState: isStageChunking ? {
            isStageChunking,
            currentStageChunk,
            totalStageChunks,
            accumulatedChunkResults,
            liveMapSpaces,
            showLiveMap,
          } : undefined,
        };
        setProgressSession(savedSession);
        saveProgress(savedSession);
        const now = new Date();
        setLastSaveTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        console.log('[Manual Save] Draft saved at', now.toISOString());
      } else {
        alert('Auto-save is disabled or no session exists. Enable auto-save to use this feature.');
      }
    }}
    onClose={handleClose}
  />

      {/* Review & Adjust Modal */}
      <ReviewAdjustModal
        isOpen={showReviewModal}
        stageName={STAGES[currentStageIndex]?.name || ''}
        stageOutput={currentStageOutput}
        onRetry={handleRetryWithAnswers}
        onAccept={handleAcceptWithIssues}
        onClose={() => setShowReviewModal(false)}
      />

      {/* Space Approval Modal - Shows after each space generation for user review */}
      <SpaceApprovalModal
        isOpen={showSpaceApprovalModal}
        space={pendingSpace}
        spaceNumber={reviewingSpaceIndex >= 0 ? reviewingSpaceIndex + 1 : currentStageChunk + 1}
        totalSpaces={totalStageChunks || accumulatedChunkResults.length || 0}
        onAccept={handleSpaceAccept}
        onReject={handleSpaceReject}
        onEdit={handleSpaceEdit}
        onClose={() => {
          setShowSpaceApprovalModal(false);
          setReviewingSpaceIndex(-1); // Reset review index
          setSavedNewSpace(null); // Clear saved space
        }}
        onPreviousSpace={handlePreviousSpace}
        onNextSpace={handleNextSpace}
        canGoPrevious={accumulatedChunkResults.length > 0}
        canGoNext={reviewingSpaceIndex >= 0 && (reviewingSpaceIndex < accumulatedChunkResults.length - 1 || savedNewSpace !== null)}
        isReviewMode={reviewingSpaceIndex >= 0} // True when reviewing existing space
        existingSpaceNames={accumulatedChunkResults.map((s: JsonRecord) => s.name as string).filter(Boolean)}
        existingSpaces={accumulatedChunkResults as any}
        locationName={String(stageResults.purpose?.name || config?.prompt || '').slice(0, 100)}
        liveMapPanel={
          // Show Live Map in SpaceApprovalModal when reviewing spaces
          shouldShowMapForStage(config, currentStageIndex) && showLiveMap && liveMapSpaces.length > 0 ? (
            <LiveVisualMapPanel
              updateToken={mapUpdateCounter}
              locationName={String(stageResults.purpose?.name || config?.prompt || '').slice(0, 50)}
              totalSpaces={totalStageChunks}
              currentSpace={reviewingSpaceIndex >= 0 ? reviewingSpaceIndex + 1 : currentStageChunk + 1}
              spaces={liveMapSpaces}
              isGenerating={false}
              onAddSpace={handleAddSpace}
              selectedSpaceId={
                pendingSpace
                  ? (() => {
                      const code = typeof (pendingSpace as any).code === 'string' ? String((pendingSpace as any).code) : '';
                      const name = typeof (pendingSpace as any).name === 'string' ? String((pendingSpace as any).name) : '';

                      if (code && liveMapSpaces.some((s: any) => s && s.code === code)) return code;
                      if (name) return name;
                      return null;
                    })()
                  : null
              }
              onSelectSpace={(spaceId) => {
                if (!spaceId) return;

                // Find matching space by code (preferred) or name in accumulated results
                const idx = accumulatedChunkResults.findIndex((s: JsonRecord) => {
                  const code = s.code as string | undefined;
                  if (code && code === spaceId) return true;
                  const name = s.name as string | undefined;
                  return !!name && name === spaceId;
                });

                if (idx >= 0) {
                  console.log(`[Selection Sync] Map selected space "${spaceId}" at index ${idx}`);
                  setReviewingSpaceIndex(idx);
                  setPendingSpace(accumulatedChunkResults[idx]);
                } else {
                  console.log(`[Selection Sync] Map selected space "${spaceId}" not found in accumulated results; keeping current pending space`);
                }
              }}
              onUpdateSpaces={async (updatedSpaces) => {
                console.log('[SpaceApprovalModal] Received updated spaces from editor:', updatedSpaces.length);

                // Log the current reviewing space before and after merge
                if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < updatedSpaces.length) {
                  const originalSpace = accumulatedChunkResults[reviewingSpaceIndex];
                  const incomingSpace = updatedSpaces[reviewingSpaceIndex];
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} BEFORE merge:`, {
                    name: originalSpace?.name,
                    dimensions: originalSpace?.dimensions,
                    size_ft: originalSpace?.size_ft,
                  });
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} FROM editor:`, {
                    name: incomingSpace?.name,
                    dimensions: incomingSpace?.dimensions,
                    size_ft: incomingSpace?.size_ft,
                  });
                }

                const updatedResults = updatedSpaces.map((space, idx) => {
                  const original = accumulatedChunkResults[idx];

                  // ✓ CRITICAL: Remove old dimensions before merging to prevent conflicts
                  const cleanedOriginal = { ...original };
                  delete cleanedOriginal.dimensions;
                  delete cleanedOriginal.size_ft;

                  const merged = {
                    ...cleanedOriginal,
                    ...space,
                  };

                  // ✓ CRITICAL: Sync dimensions and size_ft to prevent reversion
                  // ALWAYS use size_ft as source of truth (visual editor uses this)
                  if (space.size_ft && typeof space.size_ft === 'object') {
                    merged.size_ft = {
                      width: space.size_ft.width,
                      height: space.size_ft.height,
                    };
                    merged.dimensions = {
                      width: space.size_ft.width,
                      height: space.size_ft.height,
                    };
                  }
                  // Fallback: if only dimensions provided, sync to size_ft
                  else if (space.dimensions && typeof space.dimensions === 'object') {
                    const dims = space.dimensions as any;
                    merged.dimensions = {
                      width: dims.width,
                      height: dims.height,
                    };
                    merged.size_ft = {
                      width: dims.width,
                      height: dims.height,
                    };
                  }
                  // Last resort: preserve original if nothing provided
                  else if (original.size_ft) {
                    const originalSize = original.size_ft;
                    if (originalSize && typeof originalSize === 'object') {
                      const w = (originalSize as Record<string, unknown>).width;
                      const h = (originalSize as Record<string, unknown>).height;
                      merged.size_ft = {
                        width: typeof w === 'number' ? w : undefined,
                        height: typeof h === 'number' ? h : undefined,
                      };
                    }

                    const originalDims = original.dimensions;
                    if (typeof originalDims === 'string') {
                      merged.dimensions = originalDims;
                    } else if (originalDims && typeof originalDims === 'object') {
                      const w = (originalDims as Record<string, unknown>).width;
                      const h = (originalDims as Record<string, unknown>).height;
                      const unit = (originalDims as Record<string, unknown>).unit;
                      merged.dimensions = {
                        width: typeof w === 'number' ? w : undefined,
                        height: typeof h === 'number' ? h : undefined,
                        unit: typeof unit === 'string' ? unit : undefined,
                      };
                    }
                  }

                  // ✓ CRITICAL: Explicitly preserve doors from editor (including manually-adjusted child door positions)
                  if (Array.isArray(space.doors)) {
                    merged.doors = space.doors;
                  }

                  console.log(`[Merge Debug] Space #${idx + 1}: size_ft`, merged.size_ft, 'dimensions', merged.dimensions);

                  return merged;
                });

                // Log the merged result
                if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < updatedResults.length) {
                  const mergedSpace = updatedResults[reviewingSpaceIndex];
                  console.log(`[SpaceApprovalModal] Space #${reviewingSpaceIndex + 1} AFTER merge:`, {
                    name: mergedSpace?.name,
                    dimensions: mergedSpace?.dimensions,
                    size_ft: mergedSpace?.size_ft,
                  });
                }

                setAccumulatedChunkResults(updatedResults);
                setLiveMapSpaces(updatedResults); // Use merged results to include door changes from form

                // Force map re-render
                setMapUpdateCounter(prev => prev + 1);

                // ✓ SYNC: Update pendingSpace so form receives new data
                if (reviewingSpaceIndex >= 0 && reviewingSpaceIndex < updatedSpaces.length) {
                  const updatedPendingSpace = updatedResults[reviewingSpaceIndex];
                  setPendingSpace(updatedPendingSpace);
                  console.log(`[Map→Form Sync] Updated pendingSpace for space #${reviewingSpaceIndex + 1}:`, {
                    name: updatedPendingSpace?.name,
                    dimensions: updatedPendingSpace?.dimensions,
                    size_ft: updatedPendingSpace?.size_ft,
                  });
                }

                // Save using atomic save pattern
                await saveStateAndSession({
                  stageChunkState: progressSession?.stageChunkState ? {
                    ...progressSession.stageChunkState,
                    liveMapSpaces: updatedSpaces,
                    accumulatedChunkResults: updatedResults,
                  } : undefined,
                });
                console.log('[SpaceApprovalModal] ✓ Spaces persisted to session file');
              }}
            />
          ) : undefined
        }
        onNavigateToEditor={() => {
          setShowSpaceApprovalModal(false);
          setShowLiveMap(true);
        }}
      />

      {/* Canon Delta Review Modal */}
      <CanonDeltaModal
        isOpen={showCanonDeltaModal}
        generatedContent={finalOutput}
        onClose={() => setShowCanonDeltaModal(false)}
        onApprove={(proposals, conflicts, physicsIssues) => {
          console.log('[ManualGenerator] CanonDelta approved, opening EditContentModal with finalOutput:', finalOutput);
          setResolvedProposals(proposals);
          setResolvedConflicts(conflicts);
          setResolvedPhysicsIssues(physicsIssues);
          setShowCanonDeltaModal(false);
          setShowEditModal(true); // Show Edit modal instead of Save modal
        }}
      />

      {/* Edit Content Modal - Conditional based on content type */}
      {(() => {
        // Debug logging for EditContentModal data
        if (showEditModal) {
          const dataToPass = editedContent || finalOutput;
          console.log('[ManualGenerator] Opening EditContentModal with data:', {
            showEditModal,
            hasEditedContent: !!editedContent,
            hasFinalOutput: !!finalOutput,
            dataToPass,
            dataKeys: dataToPass ? Object.keys(dataToPass) : [],
            deliverable: dataToPass ? (dataToPass as any).deliverable : 'unknown'
          });
        }
        return null;
      })()}
      {getString(finalOutput, 'deliverable') === 'homebrew' ? (
        <HomebrewEditModal
          isOpen={showEditModal}
          homebrewContent={(editedContent as Record<string, unknown>) || finalOutput || {}}
          projectId={projectId}
          onClose={() => setShowEditModal(false)}
          onSave={(edited) => {
            setEditedContent(edited);
            setShowEditModal(false);
            setShowSaveModal(true);
          }}
        />
      ) : (
        <EditContentModal
          isOpen={showEditModal}
          generatedContent={editedContent || finalOutput}
          onClose={() => setShowEditModal(false)}
          onSave={(edited) => {
            setEditedContent(edited);
            setShowEditModal(false);
            setShowSaveModal(true);
          }}
        />
      )}

      {/* Save Content Modal */}
      <SaveContentModal
        isOpen={showSaveModal}
        projectId={projectId}
        generatedContent={editedContent || finalOutput}
        resolvedProposals={resolvedProposals}
        resolvedConflicts={resolvedConflicts}
        onClose={() => setShowSaveModal(false)}
        onBack={() => {
          setShowSaveModal(false);
          setShowEditModal(true);
        }}
        onSuccess={() => {
          setShowSaveModal(false);
          setEditedContent(null); // Clear edited content after save
          // Optionally refresh resources panel
        }}
      />

      {/* Canon Narrowing Modal */}
      <CanonNarrowingModal
        isOpen={showNarrowingModal}
        currentKeywords={currentKeywords}
        factCount={pendingFactpack?.facts.length || 0}
        maxFacts={config?.max_canon_facts || 50}
        canonFacts={pendingFactpack?.facts.map(fact => ({
          text: fact.text,
          chunk_id: fact.chunk_id,
          entity_name: fact.entity_name,
          entity_id: fact.entity_id,
          entity_type: fact.entity_type,
          region: fact.region,
        })) || []}
        onNarrow={handleNarrow}
        onFilter={handleFilterFacts}
        onProceedAnyway={handleProceedAnyway}
        onClose={handleCloseNarrowingModal}
        context={processingRetrievalHints ? 'retrieval_hints' : 'initial'}
        requestedBy={retrievalHintsContext?.stageName}
        requestedEntities={retrievalHintsContext?.requestedEntities}
        existingFactCount={processingRetrievalHints ? factpack?.facts.length : undefined}
      />

      <FactChunkingModal
        isOpen={showChunkingModal}
        groups={factGroups}
        npcSections={npcSectionChunks}
        mode={isNpcSectionChunking ? 'npc-sections' : 'facts'}
        totalCharacters={pendingFactpack?.facts.reduce((sum, f) => sum + f.text.length, 0) || 0}
        onClose={() => setShowChunkingModal(false)}
        onProceed={handleProceedWithChunking}
      />

      <ResumeProgressModal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        onResume={handleResumeSession}
      />
    </div>
  );
}
