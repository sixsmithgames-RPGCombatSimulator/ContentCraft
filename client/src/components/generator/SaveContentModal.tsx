/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useMemo } from 'react';
import { X, Save, CheckCircle, AlertCircle, FileText, Database } from 'lucide-react';
import { ContentType } from '../../types';
import {
  NormalizedNpc,
  asRecord,
  isNpcContent,
  normalizeNpc,
  normalizedNpcToRecord,
} from './npcUtils';

type JsonRecord = Record<string, unknown>;

interface EncounterEnemy {
  name?: string;
  creature_type?: string;
  tactics?: string;
  role?: string;
  stat_block?: JsonRecord;
}

interface LootItem {
  name?: string;
  item?: string;
  description?: string;
  properties?: JsonRecord;
  rarity?: string;
}

interface RelationshipEntry {
  relationship?: string;
  entity?: string;
  name?: string;
}

interface GeneratedContent {
  title?: string;
  canonical_name?: string;
  deliverable?: string;
  content_type?: string;
  difficulty?: string;
  canon_update?: string;
  description?: string;
  personality?: string;
  background?: string;
  physical_appearance?: string;
  motivations?: string[];
  abilities?: JsonRecord;
  equipment?: string[];
  stat_block?: JsonRecord;
  stat_blocks?: unknown[];
  sources_used?: string[];
  assumptions?: string[];
  _pipeline_stages?: unknown;
  retrieval_hints?: { regions?: string[]; eras?: string[] };
  relationships?: RelationshipEntry[];
  encounter_details?: {
    enemies?: EncounterEnemy[];
    location?: string;
    environment?: JsonRecord;
    features?: JsonRecord[];
    loot?: LootItem[];
  };
  // Item-like fields when deliverable is an item
  properties?: JsonRecord;
  rarity?: string;
  // NPC/Monster specific fields
  name?: string;
  ability_scores?: JsonRecord;
  actions?: unknown[];
  bonus_actions?: unknown[];
  reactions?: unknown[];
  legendary_actions?: unknown[];
  size?: string;
  creature_type?: string;
  subtype?: string;
  alignment?: string;
  challenge_rating?: string | number;
  experience_points?: number;
  armor_class?: unknown;
  hit_points?: unknown;
  speed?: JsonRecord;
  saving_throws?: unknown[];
  skill_proficiencies?: unknown[];
  damage_resistances?: unknown[];
  damage_immunities?: unknown[];
  damage_vulnerabilities?: unknown[];
  condition_immunities?: unknown[];
  senses?: unknown[];
  languages?: unknown[];
  tactics?: unknown;
  ecology?: unknown;
  lore?: unknown;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface SaveContentModalProps {
  isOpen: boolean;
  projectId: string;
  generatedContent: unknown;
  resolvedProposals?: unknown[];
  resolvedConflicts?: unknown[];
  onClose: () => void;
  onSuccess: () => void;
  onBack: () => void; // Callback to return to edit screen
}

/**
 * Maps AI deliverable types to ContentType enum
 * This ensures generated content is properly categorized when saved to the project
 */
const mapDeliverableToContentType = (deliverable: string): ContentType => {
  const deliverableLower = (deliverable || '').toLowerCase();

  // Map common deliverables to content types
  if (deliverableLower.includes('encounter') || deliverableLower.includes('combat')) {
    return ContentType.SECTION;
  }
  if (deliverableLower.includes('scene')) {
    return ContentType.SECTION;
  }
  if (deliverableLower.includes('adventure') || deliverableLower.includes('quest')) {
    return ContentType.CHAPTER;
  }
  if (deliverableLower.includes('npc') || deliverableLower.includes('character')) {
    return ContentType.CHARACTER;
  }
  if (deliverableLower.includes('monster') || deliverableLower.includes('creature')) {
    return ContentType.CHARACTER; // Monsters are also characters
  }
  if (deliverableLower.includes('location') || deliverableLower.includes('place') || deliverableLower.includes('area') || deliverableLower.includes('castle') || deliverableLower.includes('fortress') || deliverableLower.includes('dungeon')) {
    return ContentType.LOCATION;
  }
  if (deliverableLower.includes('item') || deliverableLower.includes('treasure') || deliverableLower.includes('loot')) {
    return ContentType.ITEM;
  }
  if (deliverableLower.includes('stat') || deliverableLower.includes('monster') || deliverableLower.includes('creature')) {
    return ContentType.STAT_BLOCK;
  }
  if (deliverableLower.includes('outline') || deliverableLower.includes('plan')) {
    return ContentType.OUTLINE;
  }
  if (deliverableLower.includes('fact') || deliverableLower.includes('lore')) {
    return ContentType.FACT;
  }
  if (deliverableLower.includes('homebrew')) {
    return ContentType.TEXT; // Homebrew collections saved as text documents
  }

  // Default to TEXT for unknown types
  return ContentType.TEXT;
};

export default function SaveContentModal({
  isOpen,
  projectId,
  generatedContent,
  resolvedProposals,
  resolvedConflicts,
  onClose,
  onSuccess,
  onBack,
}: SaveContentModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractResources, setExtractResources] = useState(false);
  const [extractionMode, setExtractionMode] = useState<'all' | 'selective'>('all');
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

  const gc = useMemo(
    () => (isOpen && generatedContent ? (generatedContent as GeneratedContent) : null),
    [isOpen, generatedContent]
  );

  const inferDomain = useMemo(() => {
    if (!gc) return 'rpg';
    const deliverable = (gc.deliverable || '').toLowerCase();
    if (deliverable.includes('outline') || deliverable.includes('chapter') || deliverable.includes('memoir') || deliverable.includes('journal') || deliverable.includes('nonfiction') || deliverable.includes('diet')) {
      return 'writing';
    }
    return 'rpg';
  }, [gc]);

  const deliverableLower = useMemo(() => (gc?.deliverable || '').toLowerCase(), [gc]);

  const isLikelyLocationDeliverable = useMemo(
    () =>
      deliverableLower.includes('location') ||
      deliverableLower.includes('place') ||
      deliverableLower.includes('area') ||
      deliverableLower.includes('castle') ||
      deliverableLower.includes('fortress') ||
      deliverableLower.includes('dungeon'),
    [deliverableLower]
  );

  const locationSoftWarnings = useMemo(() => {
    if (!gc || !isLikelyLocationDeliverable) return [] as string[];
    const warnings: string[] = [];
    const spaces = (gc as unknown as Record<string, unknown>).spaces;
    if (!Array.isArray(spaces)) {
      warnings.push('Missing `spaces` array. This usually means the Spaces stage data was not captured correctly.');
    }
    return warnings;
  }, [gc, isLikelyLocationDeliverable]);

  // Extract potential entities from generated content with FULL structured data
  const entities = useMemo(() => {
    if (!gc) return [];
    const entities: Array<{
      id: string;
      name: string;
      type: string;
      description: string;
      structured_data?: JsonRecord;
    }> = [];

    const contentType = gc.deliverable?.toLowerCase() || '';

    // Handle HOMEBREW content - extract all entries
    if (contentType.includes('homebrew') && Array.isArray((gc as any).entries)) {
      const entries = (gc as any).entries as Array<{
        type: string;
        title: string;
        short_summary: string;
        long_description: string;
        tags: string[];
        assumptions?: string[];
        notes?: string[];
        section_title?: string;
        claims?: Array<{ text: string; source: string }>;
      }>;

      entries.forEach((entry, index) => {
        // Map homebrew entry types to canon entity types
        const mapType = (homebrewType: string): string => {
          const type = homebrewType.toLowerCase();
          if (type === 'race' || type === 'subrace' || type === 'class' ||
              type === 'subclass' || type === 'feat' || type === 'background') {
            return 'rule';
          }
          if (type === 'spell') return 'spell';
          if (type === 'item') return 'item';
          if (type === 'creature') return 'monster';
          if (type === 'lore') return 'rule';
          return 'rule'; // Default for rules and mechanics
        };

        entities.push({
          id: `homebrew_entry_${index}`,
          name: entry.title,
          type: mapType(entry.type),
          description: entry.short_summary || entry.long_description.substring(0, 200),
          structured_data: {
            homebrew_type: entry.type,
            full_description: entry.long_description,
            tags: entry.tags,
            assumptions: entry.assumptions || [],
            notes: entry.notes || [],
            short_summary: entry.short_summary,
            section_title: entry.section_title || entry.title,
            claims: entry.claims, // Store AI-extracted claims if present
          },
        });
      });

      // Return early for homebrew - don't process standard extraction logic
      return entities;
    }

    // If this IS an NPC, extract the NPC itself
    if (contentType.includes('npc') || contentType.includes('character')) {
      // Use the FULL normalized NPC data instead of manually picking fields
      const npcRecord = asRecord(gc);
      const normalizedNpc = normalizeNpc(npcRecord);

      entities.push({
        id: 'main_npc',
        name: normalizedNpc.name || gc.canonical_name || gc.title || 'Unnamed NPC',
        type: 'npc',
        description: normalizedNpc.description || gc.description || 'Generated NPC',
        structured_data: {
          // Store the FULL normalized NPC data
          npc_details: {
            physical_appearance: normalizedNpc.appearance,
            personality_traits: normalizedNpc.personality?.traits || [],
            ideals: normalizedNpc.personality?.ideals || [],
            bonds: normalizedNpc.personality?.bonds || [],
            flaws: normalizedNpc.personality?.flaws || [],
            motivations: normalizedNpc.motivations || [],
            background: normalizedNpc.background,
            equipment_carried: normalizedNpc.equipment || [],
            allies_friends: normalizedNpc.relationships
              ?.filter((r) => (r.relationship || '').toLowerCase().includes('ally') || (r.relationship || '').toLowerCase().includes('friend'))
              .map((r) => r.entity) || [],
            foes: normalizedNpc.relationships
              ?.filter((r) => (r.relationship || '').toLowerCase().includes('enemy') || (r.relationship || '').toLowerCase().includes('foe'))
              .map((r) => r.entity) || [],
          },
          // Include ALL NPC fields
          ability_scores: normalizedNpc.abilityScores,
          actions: normalizedNpc.actions || [],
          bonus_actions: normalizedNpc.bonusActions || [],
          reactions: normalizedNpc.reactions || [],
          traits: normalizedNpc.abilities || [],
          armor_class: normalizedNpc.armorClass,
          hit_points: normalizedNpc.hitPoints,
          stat_block: normalizedNpc.statBlock || gc.stat_block,
          // Include additional fields
          race: normalizedNpc.race,
          alignment: normalizedNpc.alignment,
          class_levels: normalizedNpc.classLevels,
          challenge_rating: normalizedNpc.challengeRating,
          saving_throws: normalizedNpc.savingThrows,
          skill_proficiencies: normalizedNpc.skills,
          senses: normalizedNpc.senses,
          languages: normalizedNpc.languages,
          damage_resistances: normalizedNpc.damageResistances,
          damage_immunities: normalizedNpc.damageImmunities,
          damage_vulnerabilities: normalizedNpc.damageVulnerabilities,
          condition_immunities: normalizedNpc.conditionImmunities,
        },
      });
    }

    // If this IS a Monster, extract the monster itself
    if (contentType.includes('monster') || contentType.includes('creature')) {
      entities.push({
        id: 'main_monster',
        name: gc.name || gc.canonical_name || 'Unnamed Monster',
        type: 'monster',
        description: gc.description || 'Generated Monster',
        structured_data: {
          monster_details: {
            size: gc.size,
            creature_type: gc.creature_type,
            subtype: gc.subtype,
            alignment: gc.alignment,
            challenge_rating: gc.challenge_rating,
            experience_points: gc.experience_points,
            ability_scores: gc.ability_scores,
            armor_class: gc.armor_class,
            hit_points: gc.hit_points,
            speed: gc.speed,
            abilities: gc.abilities || [],
            actions: gc.actions || [],
            bonus_actions: gc.bonus_actions || [],
            reactions: gc.reactions || [],
            legendary_actions: gc.legendary_actions,
            saving_throws: gc.saving_throws,
            skill_proficiencies: gc.skill_proficiencies,
            damage_resistances: gc.damage_resistances,
            damage_immunities: gc.damage_immunities,
            damage_vulnerabilities: gc.damage_vulnerabilities,
            condition_immunities: gc.condition_immunities,
            senses: gc.senses,
            languages: gc.languages,
            tactics: gc.tactics,
            ecology: gc.ecology,
            lore: gc.lore,
          },
        },
      });
    }

    // Extract NPCs from encounter enemies
    if (gc.encounter_details?.enemies) {
      gc.encounter_details.enemies.forEach((enemy: EncounterEnemy, index: number) => {
        entities.push({
          id: `enemy_${index}`,
          name: enemy.name || enemy.creature_type || `Enemy ${index + 1}`,
          type: 'npc',
          description: enemy.tactics || enemy.role || 'Enemy combatant',
          structured_data: {
            npc_details: {
              personality_traits: enemy.tactics ? [enemy.tactics] : [],
            },
            stat_block: enemy.stat_block,
          },
        });
      });
    }

    // Extract locations
    if (gc.encounter_details?.location) {
      entities.push({
        id: 'location_main',
        name: gc.encounter_details.location,
        type: 'location',
        description:
          typeof (gc.encounter_details.environment as Record<string, unknown> | undefined)?.['description'] === 'string'
            ? String((gc.encounter_details.environment as Record<string, unknown>)['description'])
            : 'Location from encounter',
        structured_data: {
          environment: gc.encounter_details.environment,
          features: gc.encounter_details.features,
        },
      });
    }

    // Extract items from loot
    if (gc.encounter_details?.loot) {
      gc.encounter_details.loot.forEach((item: LootItem, index: number) => {
        entities.push({
          id: `item_${index}`,
          name: item.name || item.item || `Item ${index + 1}`,
          type: 'item',
          description: item.description || 'Loot item',
          structured_data: {
            properties: item.properties,
            rarity: item.rarity,
          },
        });
      });
    }

    // If this IS an item, extract the item itself
    if (contentType.includes('item') || contentType.includes('treasure')) {
      entities.push({
        id: 'main_item',
        name: gc.canonical_name || gc.title || 'Unnamed Item',
        type: 'item',
        description: gc.description || 'Generated item',
        structured_data: {
          properties: gc.properties,
          rarity: gc.rarity,
        },
      });
    }

    return entities;
  }, [gc]);

  if (!isOpen || !gc) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Step 1: ALWAYS save the generated content to the project
      const deliverable = gc.deliverable || 'unknown';
      const mappedContentType = mapDeliverableToContentType(deliverable);
      const title = gc.title || gc.canonical_name || 'Untitled';

      const isLocationContent =
        mappedContentType === ContentType.LOCATION ||
        isLikelyLocationDeliverable;

      // Clean up empty objects and arrays from the generated content
      const cleanupEmptyFields = (obj: Record<string, unknown>): Record<string, unknown> => {
        const cleaned: Record<string, unknown> = {};
        // Fields that frequently cause validation issues
        const skipIfEmpty = ['mythic_actions', 'treasure', 'statBlock', 'lair_actions', 'regional_effects'];
        const preserveIfEmpty = new Set<string>();

        if (isNpcContent(deliverable, gc.content_type)) {
          preserveIfEmpty.add('class_levels');
          preserveIfEmpty.add('motivations');
          preserveIfEmpty.add('sources_used');
          preserveIfEmpty.add('assumptions');
          preserveIfEmpty.add('proposals');
        }

        for (const [key, value] of Object.entries(obj)) {
          // Skip null/undefined
          if (value === null || value === undefined) continue;

          // Skip empty arrays
          if (Array.isArray(value) && value.length === 0) {
            if (preserveIfEmpty.has(key)) {
              cleaned[key] = value;
            }
            continue;
          }

          // Skip empty objects
          if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) {
            if (preserveIfEmpty.has(key)) {
              cleaned[key] = value;
            }
            continue;
          }

          // For problematic fields, be more aggressive about skipping
          if (skipIfEmpty.includes(key)) {
            if (typeof value === 'object' && !Array.isArray(value)) {
              const objKeys = Object.keys(value as object);
              // Skip if empty or all values are empty
              if (objKeys.length === 0) continue;
              const allEmpty = objKeys.every(k => {
                const v = (value as Record<string, unknown>)[k];
                return v === null || v === undefined || v === '' ||
                       (Array.isArray(v) && v.length === 0) ||
                       (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
              });
              if (allEmpty) {
                console.log(`[SaveContentModal] Skipping empty object field: ${key}`);
                continue;
              }
            }
          }

          // Keep everything else
          cleaned[key] = value;
        }
        return cleaned;
      };

      const cleanedGc = isLocationContent
        ? { ...asRecord(gc) }
        : cleanupEmptyFields(asRecord(gc));
      console.log('[SaveContentModal] Cleaned content fields:', Object.keys(cleanedGc));

      // Log and remove problematic fields that cause validation errors
      if (!isLocationContent) {
        const problematicFields = ['mythic_actions', 'treasure'];
        problematicFields.forEach(field => {
          if (cleanedGc[field]) {
            console.log(`[SaveContentModal] Removing problematic field ${field}:`, cleanedGc[field]);
            delete cleanedGc[field];
          }
        });
      }

      // Handle oneOf validation issues - remove from statBlock if present in both places
      if (!isLocationContent && cleanedGc.statBlock && typeof cleanedGc.statBlock === 'object') {
        const statBlock = cleanedGc.statBlock as Record<string, unknown>;
        ['lair_actions', 'regional_effects'].forEach(field => {
          if (statBlock[field] && cleanedGc[field]) {
            console.log(`[SaveContentModal] Removing duplicate ${field} from statBlock`);
            delete statBlock[field];
          }
        });
        // If statBlock is now empty, remove it
        if (Object.keys(statBlock).length === 0) {
          delete cleanedGc.statBlock;
        }
      }

      let normalizedNpcPayload: NormalizedNpc | undefined;
      let persistedNpcPayload: Record<string, unknown> | undefined;

      if (isNpcContent(deliverable, gc.content_type)) {
        const npcRecord = asRecord(cleanedGc);
        const normalized = normalizeNpc(npcRecord);

        const canonicalSchemaVersion = (() => {
          const raw = typeof normalized.schemaVersion === 'string' ? normalized.schemaVersion.trim() : '';
          if (!raw) return '1.1';
          // Keep explicit legacy version if present.
          if (raw === '1.0') return '1.0';
          // Treat common variants like "npc/v1.1" or "v1.1" as v1.1.
          if (raw.includes('1.1')) return '1.1';
          return '1.1';
        })();

        const normalizedWithVersion: NormalizedNpc = {
          ...normalized,
          schemaVersion: canonicalSchemaVersion,
        };

        if (!normalizedWithVersion.description || !normalizedWithVersion.description.trim()) {
          throw new Error('NPC description is required before saving.');
        }

        normalizedNpcPayload = normalizedWithVersion;
        persistedNpcPayload = normalizedNpcToRecord(normalizedWithVersion, npcRecord);
      }

      const payload: Record<string, unknown> = {
        project_id: projectId,
        content_type: mappedContentType,
        deliverable_type: deliverable,
        title,
        generated_content: cleanedGc,
        resolved_proposals: resolvedProposals || [],
        resolved_conflicts: resolvedConflicts || [],
        domain: inferDomain,
      };

      if (normalizedNpcPayload && persistedNpcPayload) {
        payload.normalized_content = normalizedNpcPayload;
        payload.persisted_content = persistedNpcPayload;
      }

      console.log('[SaveContentModal] Sending payload to backend:', {
        project_id: payload.project_id,
        content_type: payload.content_type,
        title: payload.title,
        generated_content_keys: Object.keys(payload.generated_content as object),
        persisted_content_keys: payload.persisted_content && typeof payload.persisted_content === 'object'
          ? Object.keys(payload.persisted_content as object)
          : null,
        persisted_schema_version: payload.persisted_content && typeof payload.persisted_content === 'object'
          ? (payload.persisted_content as Record<string, unknown>).schema_version
          : null,
        persisted_schemaVersion: payload.persisted_content && typeof payload.persisted_content === 'object'
          ? (payload.persisted_content as Record<string, unknown>).schemaVersion
          : null,
        generated_content_sample: {
          title: (payload.generated_content as Record<string, unknown>).title,
          canonical_name: (payload.generated_content as Record<string, unknown>).canonical_name,
          description: (payload.generated_content as Record<string, unknown>).description,
          ability_scores: (payload.generated_content as Record<string, unknown>).ability_scores,
          actions: (payload.generated_content as Record<string, unknown>).actions,
        },
        has_normalized_content: !!normalizedNpcPayload,
        has_persisted_content: !!persistedNpcPayload,
      });

      const saveContentResponse = await fetch(`${API_BASE_URL}/content/generated/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!saveContentResponse.ok) {
        const errorData = await saveContentResponse.json();
        console.error('[SaveContentModal] Save failed with error:', errorData);
        console.error('[SaveContentModal] Error data type:', typeof errorData);
        console.error('[SaveContentModal] Error data keys:', Object.keys(errorData));
        console.error('[SaveContentModal] Detailed validation errors:', errorData.details);
        console.error('[SaveContentModal] Details type:', typeof errorData.details);
        if (errorData.details) {
          console.error('[SaveContentModal] Details keys:', Object.keys(errorData.details));
          console.error('[SaveContentModal] Details.errors:', errorData.details.errors);
          console.error('[SaveContentModal] Details.errors type:', typeof errorData.details.errors);
          console.error('[SaveContentModal] Details.errors is array?', Array.isArray(errorData.details.errors));
        }

        // Format detailed error message for user
        let errorMessage = `${errorData.error || 'Validation Failed'}\n\n`;

        if (errorData.message) {
          errorMessage += `${errorData.message}\n\n`;
        }

        // Add formatted validation errors if available
        if (errorData.details?.errors && Array.isArray(errorData.details.errors)) {
          const formatValidationError = (err: unknown): string => {
            if (typeof err === 'string') return err;
            if (!err || typeof err !== 'object') return String(err);

            const e = err as Record<string, unknown>;
            const keyword = typeof e.keyword === 'string' ? e.keyword : undefined;
            const message = typeof e.message === 'string' ? e.message : undefined;
            const params = (e.params && typeof e.params === 'object') ? (e.params as Record<string, unknown>) : undefined;

            const instancePathRaw =
              (typeof e.instancePath === 'string' ? e.instancePath : undefined) ||
              (typeof e.dataPath === 'string' ? e.dataPath : undefined) ||
              (typeof e.path === 'string' ? e.path : undefined) ||
              (typeof e.field === 'string' ? e.field : undefined) ||
              '';

            const instancePath = instancePathRaw && instancePathRaw.trim().length > 0 ? instancePathRaw : '(root)';

            if (keyword === 'required' && params && typeof params.missingProperty === 'string') {
              const missing = params.missingProperty;
              const fullPath = instancePathRaw ? `${instancePathRaw}/${missing}` : missing;
              return `${fullPath}: missing required property`;
            }

            if (keyword === 'additionalProperties' && params && typeof params.additionalProperty === 'string') {
              const extra = params.additionalProperty;
              const fullPath = instancePathRaw ? `${instancePathRaw}/${extra}` : extra;
              return `${fullPath}: unexpected property`;
            }

            if (message) {
              return `${instancePath}: ${message}`;
            }

            try {
              return `${instancePath}: ${JSON.stringify(e)}`;
            } catch {
              return `${instancePath}: schema validation error`;
            }
          };

          const formattedErrors = (errorData.details.errors as unknown[])
            .map(formatValidationError)
            .map((s) => (typeof s === 'string' ? s : JSON.stringify(s)))
            .map((s, i) => `${i + 1}. ${s}`)
            .join('\n');

          const validationErrorsText =
            typeof errorData.details?.validationErrors === 'string'
              ? (errorData.details.validationErrors as string)
              : '';

          const simplifyNpcSchemaDetails = (details: string): string => {
            const rawLines = details
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);

            const parsed = rawLines
              .map((line) => {
                const m = line.match(/^\d+\.\s+At\s+([^:]+):\s+(.*)$/);
                if (!m) return null;
                return { path: m[1], msg: m[2] };
              })
              .filter((v): v is { path: string; msg: string } => !!v);

            if (parsed.length === 0 || parsed.length !== rawLines.length) return details;

            const byPath = new Map<string, string[]>();
            for (const p of parsed) {
              byPath.set(p.path, [...(byPath.get(p.path) || []), p.msg]);
            }

            const out: string[] = [];
            for (const [path, msgs] of byPath.entries()) {
              if (path === '/armor_class') {
                const hasOneOf = msgs.some((m) => m.toLowerCase().includes('oneof'));
                const hasInteger = msgs.some((m) => m.toLowerCase().includes('must be integer'));
                const hasArray = msgs.some((m) => m.toLowerCase().includes('must be array'));

                if (hasOneOf && (hasInteger || hasArray)) {
                  out.push(
                    'Armor Class: invalid format. Fix: Enter a number like 18, or use parentheses like 18 (plate armor). Avoid free-form text.'
                  );
                  continue;
                }
              }

              out.push(`${path}: ${msgs[0]}`);
            }

            return out.join('\n');
          };

          const simplifiedValidationErrorsText =
            validationErrorsText && validationErrorsText.trim().length > 0
              ? simplifyNpcSchemaDetails(validationErrorsText)
              : '';

          const hasOnlyGenericSchemaFailure =
            (errorData.details.errors as unknown[]).length === 1 &&
            typeof (errorData.details.errors as unknown[])[0] === 'string' &&
            String((errorData.details.errors as unknown[])[0]).toLowerCase().includes('schema validation failed');

          if (validationErrorsText && validationErrorsText.trim().length > 0) {
            if (!hasOnlyGenericSchemaFailure) {
              errorMessage += `TECHNICAL VALIDATION ERRORS:\n\n${formattedErrors}\n\n`;
            }
            errorMessage += `WHAT TO FIX:\n\n${simplifiedValidationErrorsText}`;
          } else {
            errorMessage += `VALIDATION ERRORS:\n\n${formattedErrors}`;
          }

          if (typeof errorData.details?.schemaVersion === 'string' && errorData.details.schemaVersion.trim().length > 0) {
            const schemaUsed = String(errorData.details.schemaVersion).trim();
            errorMessage += `\n\nSCHEMA VERSION USED: ${schemaUsed}`;

            if (schemaUsed === '1.0') {
              errorMessage +=
                `\n\nNOTE: You are being validated against the legacy NPC schema (v1.0), which requires many more fields. ` +
                `This usually happens when the NPC's schema version is missing or not exactly "1.1". ` +
                `Fix: ensure the NPC has schema_version: "1.1" (not "npc/v1.1" or "v1.1").`;
            }
          }

          if (Array.isArray(errorData.details?.warnings) && errorData.details.warnings.length > 0) {
            const warningsText = (errorData.details.warnings as unknown[])
              .map((w) => (typeof w === 'string' ? w : JSON.stringify(w)))
              .map((s, i) => `${i + 1}. ${s}`)
              .join('\n');
            errorMessage += `\n\nWARNINGS:\n\n${warningsText}`;
          }
        } else if (errorData.details?.validationErrors) {
          errorMessage += `DETAILS:\n${errorData.details.validationErrors}`;
        } else {
          console.error('[SaveContentModal] No structured errors found, falling back to JSON dump');
          errorMessage += `RAW ERROR DATA:\n${JSON.stringify(errorData, null, 2)}`;
        }

        console.error('[SaveContentModal] Final error message to display:', errorMessage);
        throw new Error(errorMessage);
      }

      const contentResult = await saveContentResponse.json();
      const createdBlock = contentResult?.data?.content_block;
      let successMessage = `✅ Content Saved to Project!\n\nTitle: ${title}\nDeliverable: ${deliverable}\nCategory: ${mappedContentType}\nContent ID: ${contentResult.data.content_id}`;

      if (createdBlock) {
        successMessage += `\nContent Block: ${createdBlock.id}`;
      }

      // Step 2: OPTIONALLY extract resources to library (if checkbox is checked)
      if (extractResources && entities.length > 0) {
        const entitiesToSave = extractionMode === 'all'
          ? entities
          : entities.filter(e => selectedEntities.includes(e.id));

        if (entitiesToSave.length > 0) {
          // Convert to proper entity format with structured data
          const formattedEntities = entitiesToSave.map(entity => {
            const baseEntity = {
              type: entity.type,
              canonical_name: entity.name,
              aliases: [],
              claims: [{
                text: entity.description,
                source: `Generated: ${title}`,
              }],
            };

            // Handle HOMEBREW entities specially
            if ((gc.deliverable?.toLowerCase() || '').includes('homebrew') && entity.structured_data) {
              const homebrewData = entity.structured_data as Record<string, unknown>;

              // Get section info for proper source attribution
              const fileName = ((gc as any).fileName as string) || 'Homebrew Document';
              const sectionTitle = (homebrewData.section_title as string) || entity.name;
              const sourceAttribution = `${fileName}:section_${sectionTitle.replace(/\s+/g, '_')}`;

              // Use AI-extracted claims if available, otherwise create default 2 claims
              const claims = (homebrewData.claims && Array.isArray(homebrewData.claims) && (homebrewData.claims as Array<{ text: string; source: string }>).length > 0)
                ? homebrewData.claims as Array<{ text: string; source: string }>
                : [
                    {
                      text: entity.description,
                      source: sourceAttribution,
                    },
                    {
                      text: String(homebrewData.full_description || ''),
                      source: sourceAttribution,
                    },
                  ];

              return {
                ...baseEntity,
                claims,
                // Store homebrew metadata
                homebrew_metadata: {
                  homebrew_type: homebrewData.homebrew_type,
                  tags: homebrewData.tags || [],
                  short_summary: homebrewData.short_summary,
                  assumptions: homebrewData.assumptions || [],
                  notes: homebrewData.notes || [],
                },
              };
            }

            // Handle standard entities
            return {
              ...baseEntity,
              // Add structured data if present
              ...(entity.structured_data?.npc_details ? { npc_details: (entity.structured_data as Record<string, unknown>)['npc_details'] } : {}),
              ...(entity.structured_data?.spell_details ? { spell_details: (entity.structured_data as Record<string, unknown>)['spell_details'] } : {}),
              ...(entity.structured_data?.stat_block ? { stat_block: (entity.structured_data as Record<string, unknown>)['stat_block'] } : {}),
              ...(entity.structured_data?.abilities ? { abilities: (entity.structured_data as Record<string, unknown>)['abilities'] } : {}),
              ...(entity.structured_data?.properties ? { properties: (entity.structured_data as Record<string, unknown>)['properties'] } : {}),
              ...(entity.structured_data?.rarity ? { rarity: (entity.structured_data as Record<string, unknown>)['rarity'] } : {}),
              ...(entity.structured_data?.environment ? { environment: (entity.structured_data as Record<string, unknown>)['environment'] } : {}),
              ...(entity.structured_data?.features ? { features: (entity.structured_data as Record<string, unknown>)['features'] } : {}),
              // Add any additional fields from the generated content
              ...(gc.retrieval_hints?.regions?.[0] ? { region: gc.retrieval_hints.regions[0] } : {}),
              ...(gc.retrieval_hints?.eras?.[0] ? { era: gc.retrieval_hints.eras[0] } : {}),
            };
          });

          // Save entities to library
          const resourceResponse = await fetch(`${API_BASE_URL}/upload/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entities: formattedEntities,
              sourceName: `Generated: ${title}`,
              projectId,
            }),
          });

          if (!resourceResponse.ok) {
            const errorData = await resourceResponse.json();
            throw new Error(errorData.error || 'Failed to save resources to library');
          }

          const resourceResult = await resourceResponse.json();

          // Build detailed feedback message
          const libraryDetails: string[] = [];

          if (resourceResult.entitiesCreated > 0) {
            libraryDetails.push(`✅ ${resourceResult.entitiesCreated} new ${resourceResult.entitiesCreated === 1 ? 'entity' : 'entities'} added`);
          }

          if (resourceResult.entitiesUpdated > 0) {
            libraryDetails.push(`🔄 ${resourceResult.entitiesUpdated} existing ${resourceResult.entitiesUpdated === 1 ? 'entity' : 'entities'} updated`);
          }

          const unchangedCount = entitiesToSave.length - (resourceResult.entitiesCreated + resourceResult.entitiesUpdated);
          if (unchangedCount > 0) {
            libraryDetails.push(`ℹ️ ${unchangedCount} ${unchangedCount === 1 ? 'entity' : 'entities'} already in library (no changes)`);
          }

          if (resourceResult.chunksCreated > 0) {
            libraryDetails.push(`📝 ${resourceResult.chunksCreated} ${resourceResult.chunksCreated === 1 ? 'fact' : 'facts'} stored`);
          }

          successMessage += `\n\n📚 Library Update:\n${libraryDetails.join('\n')}`;
        }
      }

      alert(successMessage);

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const toggleEntity = (entityId: string) => {
    setSelectedEntities(prev =>
      prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Save Generated Content</h2>
            <p className="text-sm text-gray-600 mt-1">
              Save story content to your project and optionally extract resources to your library
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-800 mb-2">Validation Error</h3>
              <div className="text-sm text-red-700 whitespace-pre-wrap font-mono bg-red-100 p-3 rounded border border-red-300 overflow-x-auto max-h-60 overflow-y-auto">
                {error}
              </div>
              <p className="text-xs text-red-600 mt-2">
                💡 <strong>Tip:</strong> Click "Back" to return to the edit screen, correct these issues, then try saving again.
              </p>
            </div>
          </div>
        )}

        {locationSoftWarnings.length > 0 && (
          <div className="mx-6 mt-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-yellow-900 mb-2">Location data is incomplete</h3>
              <div className="text-sm text-yellow-900">
                <ul className="list-disc pl-5 space-y-1">
                  {locationSoftWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-yellow-800 mt-2">
                You can continue, but saving now may lock in missing structure. Use "Fix now" to return to the editor.
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              className="px-3 py-2 bg-yellow-700 text-white rounded-md hover:bg-yellow-800 text-sm font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Fix now
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">
              {gc.title || 'Generated Content'}
            </h3>
            <p className="text-sm text-gray-600">
              {gc.deliverable || 'content'} • {entities.length} entities found
            </p>

            {/* Content Summary */}
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs">
              <div className="font-medium text-gray-700 mb-2">Content includes:</div>
              <div className="grid grid-cols-2 gap-2 text-gray-600">
                {gc.encounter_details && <div>✓ Encounter Details</div>}
                {Array.isArray(gc.stat_blocks) && <div>✓ Stat Blocks ({gc.stat_blocks.length})</div>}
                {gc.description && <div>✓ Description</div>}
                {gc.personality && <div>✓ Personality</div>}
                {gc.background && <div>✓ Background</div>}
                {gc.abilities && <div>✓ Abilities</div>}
                {Array.isArray(gc.sources_used) && <div>✓ Sources ({gc.sources_used.length})</div>}
                {Array.isArray(gc.assumptions) && <div>✓ Assumptions ({gc.assumptions.length})</div>}
                {gc._pipeline_stages != null && <div>✓ Full Pipeline Data</div>}
              </div>
            </div>
          </div>

          {/* Primary Action: Save Content */}
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">Story Content</h4>
                <p className="text-sm text-blue-700">
                  This {gc.deliverable || 'content'} will be saved to your project's content library.
                  You can view, edit, and use it when building your campaign.
                </p>
                {typeof gc.canon_update === 'string' && gc.canon_update.trim().length > 0 && gc.canon_update.trim().toLowerCase() !== 'no canon changes' && (
                  <div className="mt-3 p-3 bg-white border border-blue-200 rounded">
                    <div className="text-xs font-semibold text-blue-800 mb-1">Canon Update</div>
                    <div className="text-sm text-blue-900">{gc.canon_update}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Secondary Action: Extract Resources (Optional) */}
          {entities.length > 0 && (
            <div className="mb-6">
              <label className="flex items-start gap-3 p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={extractResources}
                  onChange={(e) => setExtractResources(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-5 h-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-900">
                      {(gc.deliverable?.toLowerCase() || '').includes('homebrew')
                        ? 'Add Homebrew Entries to Canon Library'
                        : 'Also Extract Resources to Library'}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    {(gc.deliverable?.toLowerCase() || '').includes('homebrew')
                      ? `Add ${entities.length} homebrew entries (races, spells, items, etc.) to your canon library as reusable game content with full descriptions and tags.`
                      : `Extract ${entities.length} NPCs, items, and locations from this content and add them to your canon library as reusable resources.`}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Extraction Mode (only shown if extractResources is checked) */}
          {extractResources && entities.length > 0 && (
            <div className="mb-6 ml-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Which entities would you like to extract?
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setExtractionMode('all')}
                  className={`flex-1 p-4 border-2 rounded-lg transition-colors ${
                    extractionMode === 'all'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">All Entities</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Extract all {entities.length} entities
                  </div>
                </button>
                <button
                  onClick={() => setExtractionMode('selective')}
                  className={`flex-1 p-4 border-2 rounded-lg transition-colors ${
                    extractionMode === 'selective'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">Select Specific</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Choose which entities to extract
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Entity List (only shown if extractResources is checked and extraction mode is active) */}
          {extractResources && entities.length > 0 && (
            <div className="ml-8 space-y-3">
              <h4 className="font-medium text-gray-700 text-sm">
                Entities to Extract ({extractionMode === 'all' ? entities.length : selectedEntities.length})
              </h4>
              {entities.map(entity => (
                <div
                  key={entity.id}
                  onClick={() => extractionMode === 'selective' && toggleEntity(entity.id)}
                  className={`border rounded-lg p-4 transition-all ${
                    extractionMode === 'selective'
                      ? selectedEntities.includes(entity.id)
                        ? 'border-blue-400 bg-blue-50 cursor-pointer'
                        : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                      : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="font-semibold text-gray-900">{entity.name}</h5>
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                          {entity.type}
                        </span>
                        {/* Show homebrew type badge */}
                        {!!(entity.structured_data as any)?.homebrew_type && (
                          <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                            {String((entity.structured_data as any).homebrew_type)}
                          </span>
                        )}
                        {extractionMode === 'all' && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{entity.description}</p>
                      {/* Show tags for homebrew entries */}
                      {Array.isArray((entity.structured_data as any)?.tags) && ((entity.structured_data as any).tags as string[]).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {((entity.structured_data as any).tags as string[]).slice(0, 5).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                              {tag}
                            </span>
                          ))}
                          {((entity.structured_data as any).tags as string[]).length > 5 && (
                            <span className="px-1.5 py-0.5 text-xs text-gray-500">
                              +{((entity.structured_data as any).tags as string[]).length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {extractionMode === 'selective' && (
                      <input
                        type="checkbox"
                        checked={selectedEntities.includes(entity.id)}
                        onChange={() => toggleEntity(entity.id)}
                        className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onBack}
            disabled={saving}
            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (extractResources && extractionMode === 'selective' && selectedEntities.length === 0)}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {extractResources ? 'Save Content & Extract Resources' : 'Save Content to Project'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
