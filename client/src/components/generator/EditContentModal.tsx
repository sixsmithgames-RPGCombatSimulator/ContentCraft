/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Save, Tag, AlertCircle, ChevronDown, ChevronUp, Map } from 'lucide-react';
import ExpandableObjectEditor from './ExpandableObjectEditor';
import ExpandableArrayEditor from './ExpandableArrayEditor';
import InteractiveLocationEditor from './InteractiveLocationEditor';
import { LocationEditorProvider } from '../../contexts/LocationEditorContext';

type JsonRecord = Record<string, unknown>;

interface EditContentModalProps {
  isOpen: boolean;
  generatedContent: unknown;
  onSave: (editedContent: unknown) => void | Promise<void>;
  onClose: () => void;
}

export default function EditContentModal({
  isOpen,
  generatedContent,
  onSave,
  onClose,
}: EditContentModalProps) {
  // CRITICAL: All hooks must be called before any conditional returns
  const [content, setContent] = useState<JsonRecord>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic']));
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [initError, setInitError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'fields' | 'map'>('fields');

  // Initialize content when modal opens
  useEffect(() => {
    // Reset states when modal closes
    if (!isOpen) {
      setContent({});
      setExpandedSections(new Set(['basic']));
      setValidationErrors([]);
      setInitError('');
      setActiveTab('fields');
      return;
    }

    // Modal is open - initialize content
    if (!generatedContent) {
      const error = 'No generatedContent prop provided to EditContentModal';
      console.error('[EditContentModal] ERROR:', error);
      setInitError(error);
      setContent({});
      return;
    }

    console.log('[EditContentModal] Initializing with generatedContent:', {
      type: typeof generatedContent,
      isArray: Array.isArray(generatedContent),
      keys: generatedContent && typeof generatedContent === 'object' ? Object.keys(generatedContent) : [],
      generatedContent
    });

    const gc = generatedContent as JsonRecord;

    // Safety check - ensure we have valid content
    if (!gc || typeof gc !== 'object') {
      const error = `Invalid generatedContent type: ${typeof gc}`;
      console.error('[EditContentModal] ERROR:', error, gc);
      setInitError(error);
      setContent({});
      return;
    }

    if (Object.keys(gc).length === 0) {
      const warning = 'Empty generatedContent received - object has no keys';
      console.warn('[EditContentModal] WARNING:', warning);
      setInitError(warning);
      // Don't return - allow empty content to show error in UI
    } else {
      setInitError(''); // Clear any previous error
    }

    // Normalize nested and alternative field names for easier editing
    const normalized = { ...gc };
    const normalizedFields: string[] = [];

    const normalizeKeyForLookup = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keyLookup: Record<string, string> = {};
    for (const k of Object.keys(normalized)) {
      const nk = normalizeKeyForLookup(k);
      if (!keyLookup[nk]) keyLookup[nk] = k;
    }

    const getByAltKey = (altKey: string): unknown => {
      const actual = keyLookup[normalizeKeyForLookup(altKey)];
      return actual ? (normalized as any)[actual] : undefined;
    };

    const mapAltKeyIfMissing = (destKey: string, altKeys: string[]) => {
      if ((normalized as any)[destKey] !== undefined) return;
      for (const alt of altKeys) {
        const v = getByAltKey(alt);
        if (v !== undefined) {
          (normalized as any)[destKey] = v;
          normalizedFields.push(`${alt} → ${destKey}`);
          return;
        }
      }
    };

    mapAltKeyIfMissing('personality_traits', ['PERSONALITY TRAITS', 'Personality Traits', 'PERSONALITY_TRAITS', 'personality_traits']);
    mapAltKeyIfMissing('ideals', ['IDEALS', 'Ideals', 'IDEALS:', 'ideals']);
    mapAltKeyIfMissing('bonds', ['BONDS', 'Bonds', 'BONDS:', 'bonds']);
    mapAltKeyIfMissing('flaws', ['FLAWS', 'Flaws', 'FLAWS:', 'flaws']);
    mapAltKeyIfMissing('goals', ['GOALS', 'Goals', 'GOALS:', 'goals']);
    mapAltKeyIfMissing('fears', ['FEARS', 'Fears', 'FEARS:', 'fears']);
    mapAltKeyIfMissing('quirks', ['QUIRKS', 'Quirks', 'QUIRKS:', 'quirks']);
    mapAltKeyIfMissing('voice_mannerisms', ['VOICE/MANNERISMS', 'VOICE & MANNERISMS', 'Voice/Mannerisms', 'voice_mannerisms']);

    // Parse role field if it contains concatenated personality info (e.g., "PERSONALITY TRAITS: ... IDEALS: ... BONDS: ...")
    if (normalized.role && typeof normalized.role === 'string') {
      const roleStr = normalized.role as string;
      const labelPatterns: { label: string; field: string; isArray: boolean }[] = [
        { label: 'PERSONALITY TRAITS:', field: 'personality_traits', isArray: true },
        { label: 'IDEALS:', field: 'ideals', isArray: true },
        { label: 'BONDS:', field: 'bonds', isArray: true },
        { label: 'FLAWS:', field: 'flaws', isArray: true },
        { label: 'GOALS:', field: 'goals', isArray: true },
        { label: 'FEARS:', field: 'fears', isArray: true },
        { label: 'QUIRKS:', field: 'quirks', isArray: true },
        { label: 'VOICE/MANNERISMS:', field: 'voice_mannerisms', isArray: false },
        { label: 'VOICE & MANNERISMS:', field: 'voice_mannerisms', isArray: false },
      ];

      // Check if role contains any of these labels
      const hasLabels = labelPatterns.some(p => roleStr.includes(p.label));
      if (hasLabels) {
        const labelPositions = labelPatterns
          .map((p) => roleStr.indexOf(p.label))
          .filter((idx) => idx >= 0);
        const firstLabelIdx = labelPositions.length ? Math.min(...labelPositions) : -1;

        const rolePrefix = firstLabelIdx > 0 ? roleStr.substring(0, firstLabelIdx).trim() : '';

        // Extract each section
        for (let i = 0; i < labelPatterns.length; i++) {
          const { label, field, isArray } = labelPatterns[i];
          const startIdx = roleStr.indexOf(label);
          if (startIdx === -1) continue;

          // Find the end of this section (start of next label or end of string)
          let endIdx = roleStr.length;
          for (const otherPattern of labelPatterns) {
            if (otherPattern.label === label) continue;
            const otherIdx = roleStr.indexOf(otherPattern.label, startIdx + label.length);
            if (otherIdx !== -1 && otherIdx < endIdx) {
              endIdx = otherIdx;
            }
          }

          const value = roleStr.substring(startIdx + label.length, endIdx).trim();
          if (value && !normalized[field]) {
            normalized[field] = isArray ? [value] : value;
            normalizedFields.push(`role.${label} → ${field}`);
          }
        }
        normalized.role = rolePrefix;
        normalizedFields.push('Preserved role prefix after extracting personality data');
      }
    }

    // Flatten personality object if it exists
    if (normalized.personality && typeof normalized.personality === 'object') {
      const personality = normalized.personality as JsonRecord;

      // Flatten personality fields to top level if they don't already exist
      if (personality.ideals && !normalized.ideals) {
        normalized.ideals = personality.ideals;
        normalizedFields.push('personality.ideals → ideals');
      }
      if (personality.flaws && !normalized.flaws) {
        normalized.flaws = personality.flaws;
        normalizedFields.push('personality.flaws → flaws');
      }
      if (personality.traits && !normalized.personality_traits) {
        normalized.personality_traits = personality.traits;
        normalizedFields.push('personality.traits → personality_traits');
      }
      if (personality.bonds && !normalized.bonds) {
        normalized.bonds = personality.bonds;
        normalizedFields.push('personality.bonds → bonds');
      }
    }

    // Convert string ideals/flaws/etc to arrays (schema requires arrays)
    const arrayFields = ['ideals', 'flaws', 'bonds', 'goals', 'fears', 'quirks', 'personality_traits'];
    for (const field of arrayFields) {
      if (typeof normalized[field] === 'string') {
        normalized[field] = [normalized[field]];
        normalizedFields.push(`Converted ${field} from string to array`);
      }
    }

    // Normalize name → title and canonical_name for NPCs and other content
    if (normalized.name && typeof normalized.name === 'string') {
      if (!normalized.title) {
        normalized.title = normalized.name;
        normalizedFields.push('name → title');
      }
      if (!normalized.canonical_name) {
        normalized.canonical_name = normalized.name;
        normalizedFields.push('name → canonical_name');
      }
    }

    const isPlainObject = (value: unknown): value is JsonRecord =>
      value !== null && typeof value === 'object' && !Array.isArray(value);

    const liftIfMissing = (srcLabel: string, src: JsonRecord, srcKey: string, destKey: string = srcKey) => {
      if (normalized[destKey] === undefined && src[srcKey] !== undefined) {
        normalized[destKey] = src[srcKey];
        normalizedFields.push(`${srcLabel}.${srcKey} → ${destKey}`);
      }
    };

    const nestedNpcContainer =
      (isPlainObject((normalized as any).npc) ? ((normalized as any).npc as JsonRecord) : null) ||
      (isPlainObject((normalized as any).character) ? ((normalized as any).character as JsonRecord) : null);

    if (nestedNpcContainer) {
      const keysToLift = [
        'name',
        'title',
        'canonical_name',
        'aliases',
        'description',
        'appearance',
        'physical_appearance',
        'background',
        'race',
        'size',
        'creature_type',
        'subtype',
        'alignment',
        'role',
        'affiliation',
        'location',
        'era',
        'region',
        'class_levels',
        'experience_points',
        'hooks',
        'motivations',
        'tactics',
        'ability_scores',
        'armor_class',
        'hit_points',
        'hit_dice',
        'speed',
        'senses',
        'languages',
        'saving_throws',
        'skill_proficiencies',
        'skills',
        'damage_resistances',
        'damage_immunities',
        'damage_vulnerabilities',
        'condition_immunities',
        'abilities',
        'actions',
        'bonus_actions',
        'reactions',
        'spellcasting',
        'cantrips',
        'prepared_spells',
        'spell_slots',
        'innate_spellcasting',
        'allies_friends',
        'allies',
        'allies_and_contacts',
        'foes',
        'enemies',
        'rivals',
        'mentors',
        'students',
        'family',
        'factions',
        'minions',
        'conflicts',
        'equipment',
        'magic_items',
        'attuned_items',
        'signature_items',
        'notes',
        'sources',
      ];

      for (const key of keysToLift) {
        liftIfMissing('npc', nestedNpcContainer, key);
      }

      if (normalized.appearance === undefined && nestedNpcContainer.physical_appearance !== undefined) {
        normalized.appearance = nestedNpcContainer.physical_appearance;
        normalizedFields.push('npc.physical_appearance → appearance');
      }

      if (normalized.skill_proficiencies === undefined && nestedNpcContainer.skills !== undefined) {
        normalized.skill_proficiencies = nestedNpcContainer.skills;
        normalizedFields.push('npc.skills → skill_proficiencies');
      }
    }

    const statBlock =
      (isPlainObject((normalized as any).stat_block) ? ((normalized as any).stat_block as JsonRecord) : null) ||
      (nestedNpcContainer && isPlainObject((nestedNpcContainer as any).stat_block)
        ? (((nestedNpcContainer as any).stat_block as JsonRecord) ?? null)
        : null);

    if (statBlock) {
      const statKeysToLift = [
        'ability_scores',
        'armor_class',
        'hit_points',
        'hit_dice',
        'speed',
        'senses',
        'languages',
        'saving_throws',
        'skill_proficiencies',
        'skills',
        'damage_resistances',
        'damage_immunities',
        'damage_vulnerabilities',
        'condition_immunities',
        'abilities',
        'actions',
        'bonus_actions',
        'reactions',
      ];
      for (const key of statKeysToLift) {
        liftIfMissing('stat_block', statBlock, key);
      }

      if (normalized.skill_proficiencies === undefined && statBlock.skills !== undefined) {
        normalized.skill_proficiencies = statBlock.skills;
        normalizedFields.push('stat_block.skills → skill_proficiencies');
      }
    }

    // Normalize alternative field names for relationships
    if (!normalized.allies_friends && normalized.allies) {
      normalized.allies_friends = normalized.allies;
      normalizedFields.push('allies → allies_friends');
    }
    if (!normalized.allies_friends && normalized.allies_and_contacts) {
      normalized.allies_friends = normalized.allies_and_contacts;
      normalizedFields.push('allies_and_contacts → allies_friends');
    }
    if (!normalized.foes && normalized.enemies) {
      normalized.foes = normalized.enemies;
      normalizedFields.push('enemies → foes');
    }

    if (normalizedFields.length > 0) {
      console.log('[EditContentModal] Normalized fields:', normalizedFields);
    }

    setContent(normalized);

    // Auto-expand relevant sections based on content
    const sections = new Set(['basic']);
    const deliverable = String(gc.deliverable || '').toLowerCase();

    if (deliverable.includes('npc') || deliverable.includes('character')) {
      sections.add('npc_core');
      sections.add('npc_stats');
      sections.add('npc_combat');
      sections.add('npc_relationships');
      sections.add('npc_magic_items');
      sections.add('npc_spellcasting');
    } else if (deliverable.includes('monster') || deliverable.includes('creature')) {
      sections.add('monster_core');
      sections.add('monster_stats');
      sections.add('monster_combat');
    } else if (deliverable.includes('encounter')) {
      sections.add('encounter_core');
      sections.add('encounter_environment');
      sections.add('encounter_enemies');
    } else if (deliverable.includes('item')) {
      sections.add('item_core');
      sections.add('item_properties');
      sections.add('item_lore');
    } else if (deliverable.includes('scene')) {
      sections.add('scene_core');
      sections.add('scene_setting');
      sections.add('scene_npcs');
    } else if (deliverable.includes('story_arc') || deliverable.includes('arc')) {
      sections.add('arc_core');
      sections.add('arc_acts');
      sections.add('arc_npcs');
    } else if (deliverable.includes('adventure')) {
      sections.add('adventure_core');
      sections.add('adventure_structure');
      sections.add('adventure_resources');
    } else if (deliverable.includes('location') || deliverable.includes('castle') || deliverable.includes('dungeon')) {
      sections.add('location_core');
      sections.add('location_structure');
      sections.add('location_spaces');
      sections.add('location_details');
    }
    sections.add('tags');
    sections.add('sources');

    setExpandedSections(sections);
  }, [isOpen, generatedContent]);

  // All useCallback hooks MUST be defined before any conditional returns
  const updateField = useCallback((path: string, value: unknown) => {
    // Handle empty path - replace entire content
    if (!path || path.trim() === '') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        setContent(value as JsonRecord);
      }
      return;
    }

    setContent(prevContent => {
      const pathParts = path.split('.').filter(p => p.length > 0);
      const newContent = { ...prevContent };
      let current: any = newContent;

      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current)) {
          current[part] = {};
        } else {
          current[part] = { ...current[part] };
        }
        current = current[part];
      }

      current[pathParts[pathParts.length - 1]] = value;
      return newContent;
    });
  }, []);

  const getNestedValue = useCallback((obj: JsonRecord, path: string): unknown => {
    // Handle empty path - return entire object
    if (!path || path.trim() === '') {
      return obj;
    }

    const parts = path.split('.').filter(p => p.length > 0);
    let current: any = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }, []);

  const updateArrayItem = useCallback((path: string, index: number, value: string) => {
    const arr = (getNestedValue(content, path) as string[]) || [];
    const newArr = [...arr];
    newArr[index] = value;
    updateField(path, newArr);
  }, [updateField, getNestedValue, content]);

  const addArrayItem = useCallback((path: string, value: string) => {
    const arr = (getNestedValue(content, path) as string[]) || [];
    updateField(path, [...arr, value]);
  }, [updateField, getNestedValue, content]);

  const removeArrayItem = useCallback((path: string, index: number) => {
    const arr = (getNestedValue(content, path) as string[]) || [];
    updateField(path, arr.filter((_, i) => i !== index));
  }, [updateField, getNestedValue, content]);

  // NOW safe to do conditional return - all hooks have been called
  if (!isOpen) return null;

  // Check if content is empty
  const isContentEmpty = !content || Object.keys(content).length === 0;

  const deliverable = String(content.deliverable || '').toLowerCase();
  const isNpc = deliverable.includes('npc') || deliverable.includes('character');
  const isMonster = deliverable.includes('monster') || deliverable.includes('creature');
  const isCreature = isNpc || isMonster; // Both NPCs and monsters share most stat block fields
  const isEncounter = deliverable.includes('encounter');
  const isItem = deliverable.includes('item');
  const isScene = deliverable.includes('scene');
  const isStoryArc = deliverable.includes('story_arc') || deliverable.includes('arc');
  const isAdventure = deliverable.includes('adventure');
  const isLocation = deliverable.includes('location') || deliverable.includes('castle') || deliverable.includes('dungeon');

  const armorClassInlineIssue = (() => {
    if (!isCreature) return '';
    const ac = getNestedValue(content, 'armor_class');
    if (ac === null || ac === undefined) return '';
    if (typeof ac !== 'string') return '';

    const acStr = ac.trim();
    if (!acStr) return '';

    if (/^\d+$/.test(acStr)) return '';
    if (/^(\d+)\s*\([^)]+\)$/.test(acStr)) return '';
    if (/^\d+\s*\($/.test(acStr) || /^\d+\s*\([^)]*$/.test(acStr)) {
      return 'Armor Class looks incomplete. Finish it like 18 (plate armor), or enter a plain number like 18.';
    }

    return 'Armor Class must be a number like 18, or a number with parentheses like 18 (plate armor). Remove extra text like "Armor + Shield".';
  })();

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const ensureString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  };

  /**
   * Normalize and validate content before saving
   * Automatically fixes common data type issues
   */
  const normalizeAndValidateContent = (data: JsonRecord): { normalized: JsonRecord; errors: string[] } => {
    const normalized = { ...data };
    const errors: string[] = [];

    // Normalize hit_points: if it's a string or number, convert to proper object
    if (normalized.hit_points) {
      if (typeof normalized.hit_points === 'string') {
        const match = String(normalized.hit_points).match(/^(\d+)\s*\(([^)]+)\)$/);
        if (match) {
          normalized.hit_points = { average: parseInt(match[1]), formula: match[2] };
        } else if (/^\d+$/.test(String(normalized.hit_points))) {
          normalized.hit_points = { average: parseInt(String(normalized.hit_points)) };
        }
      } else if (typeof normalized.hit_points === 'number') {
        normalized.hit_points = { average: normalized.hit_points };
      }
    }

    // Normalize speed: if it's a string, convert to {walk: "..."} object
    if (normalized.speed && typeof normalized.speed === 'string') {
      const speedStr = String(normalized.speed).trim();
      // Common formats: "30 ft.", "30 ft., fly 60 ft.", etc.
      if (speedStr.includes(',')) {
        // Multiple speeds: "30 ft., fly 60 ft."
        const speedObj: Record<string, string> = {};
        speedStr.split(',').forEach(part => {
          const trimmed = part.trim();
          const match = trimmed.match(/^(fly|swim|climb|burrow|hover)?\s*(\d+\s*ft\.?)$/i);
          if (match) {
            const type = match[1] ? match[1].toLowerCase() : 'walk';
            speedObj[type] = match[2];
          }
        });
        if (Object.keys(speedObj).length > 0) {
          normalized.speed = speedObj;
        }
      } else {
        // Single speed value
        normalized.speed = { walk: speedStr };
      }
    }

    // Normalize armor_class: if it's a string, try to parse it
    if (normalized.armor_class && typeof normalized.armor_class === 'string') {
      const acStr = String(normalized.armor_class).trim();
      const match = acStr.match(/^(\d+)\s*(?:\(([^)]+)\))?$/);
      if (match) {
        const acValue = parseInt(match[1]);
        if (match[2]) {
          normalized.armor_class = [{ value: acValue, type: match[2] }];
        } else {
          normalized.armor_class = acValue;
        }
      } else if (/^\d+$/.test(acStr)) {
        normalized.armor_class = parseInt(acStr);
      } else {
        errors.push('Armor Class must be a number (example: 18). Remove descriptive text like "Armor + Shield" from the Armor Class field.');
      }
    }

    // Normalize saving_throws: convert strings to objects
    if (Array.isArray(normalized.saving_throws)) {
      normalized.saving_throws = normalized.saving_throws
        .map((st: any) => {
          // If already an object with name and value, keep it
          if (st && typeof st === 'object' && st.name && st.value) {
            return st;
          }
          // If it's a string like "Con +8" or "DEX +5", parse it
          if (typeof st === 'string') {
            const match = st.trim().match(/^(\w+)\s+([+\-]?\d+)$/);
            if (match) {
              return { name: match[1], value: match[2] };
            }
          }
          // Invalid entry - will be filtered out
          return null;
        })
        .filter((st: any) => st !== null);
    }

    // Normalize skill_proficiencies: convert strings to objects
    if (Array.isArray(normalized.skill_proficiencies)) {
      normalized.skill_proficiencies = normalized.skill_proficiencies
        .map((sk: any) => {
          // If already an object with name and value, keep it
          if (sk && typeof sk === 'object' && sk.name && sk.value) {
            return sk;
          }
          // If it's a string like "Perception +7" or "Stealth +8", parse it
          if (typeof sk === 'string') {
            const match = sk.trim().match(/^([A-Za-z\s]+?)\s+([+\-]?\d+)$/);
            if (match) {
              return { name: match[1].trim(), value: match[2] };
            }
          }
          // Invalid entry - will be filtered out
          return null;
        })
        .filter((sk: any) => sk !== null);
    }

    return { normalized, errors };
  };

  // For arrays of strings only
  const ensureArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map(v => typeof v === 'string' ? v : String(v || ''));
    }
    return [];
  };

  // For arrays that may contain objects (preserves object structure)
  const ensureAnyArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) {
      return value;
    }
    return [];
  };

  // Helper to convert array that may contain objects to string array
  const ensureStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map(v => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v !== null) {
          // Convert common object patterns to strings
          const obj = v as any;

          // Pattern: {name: "Con", value: "+11"} or {name: "Perception", value: "+8", notes: "..."}
          if (obj.name && obj.value !== undefined) {
            const notes = obj.notes ? ` (${obj.notes})` : '';
            return `${obj.name} ${obj.value}${notes}`;
          }

          // Pattern: {name: "DEX", bonus: 9} or {ability: "DEX", bonus: 9}
          if ((obj.name || obj.ability) && obj.bonus !== undefined) {
            const name = obj.name || obj.ability;
            const bonus = Number(obj.bonus);
            return `${name} ${bonus >= 0 ? '+' : ''}${bonus}`;
          }

          // Pattern: {skill: "Perception", bonus: 8}
          if (obj.skill && obj.bonus !== undefined) {
            const bonus = Number(obj.bonus);
            return `${obj.skill} ${bonus >= 0 ? '+' : ''}${bonus}`;
          }

          // Pattern: {name: "value"} - just return name
          if (obj.name && Object.keys(obj).length === 1) {
            return String(obj.name);
          }

          // Fallback: Try to create a readable string from object
          if (obj.name && obj.description) {
            return `${obj.name}: ${obj.description}`;
          }

          // Last resort: JSON stringify
          return JSON.stringify(obj);
        }
        return String(v || '');
      });
    }
    return [];
  };

  const ensureObject = (value: unknown): JsonRecord => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonRecord;
    }
    return {};
  };

  const SectionHeader = ({ title, section, badge }: { title: string; section: string; badge?: string }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 rounded-md transition-all shadow-sm"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {badge && <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">{badge}</span>}
      </div>
      {expandedSections.has(section) ? <ChevronUp className="w-5 h-5 text-gray-700" /> : <ChevronDown className="w-5 h-5 text-gray-700" />}
    </button>
  );

  const TextField = ({ label, path, rows, placeholder }: { label: string; path: string; rows?: number; placeholder?: string }) => {
    const initialValue = ensureString(getNestedValue(content, path));
    const [localValue, setLocalValue] = useState(initialValue);

    // Update local state when content changes externally
    useEffect(() => {
      setLocalValue(ensureString(getNestedValue(content, path)));
    }, [content, path]);

    const handleChange = (newValue: string) => {
      setLocalValue(newValue);
    };

    const handleBlur = () => {
      updateField(path, localValue);
    };

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {rows && rows > 1 ? (
          <textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            rows={rows}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        ) : (
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}
      </div>
    );
  };

  const NumberField = ({ label, path, placeholder }: { label: string; path: string; placeholder?: string }) => {
    const initialValue = getNestedValue(content, path);
    const [localValue, setLocalValue] = useState(typeof initialValue === 'number' ? String(initialValue) : '');

    useEffect(() => {
      const val = getNestedValue(content, path);
      setLocalValue(typeof val === 'number' ? String(val) : '');
    }, [content, path]);

    const handleBlur = () => {
      updateField(path, localValue ? parseFloat(localValue) : undefined);
    };

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    );
  };

  // Flexible string array editor that can handle arrays of strings OR objects
  const FlexibleStringArrayEditor = ({ label, path, placeholder }: { label: string; path: string; placeholder?: string }) => {
    // Memoize items to prevent infinite loop - only recalculate when content or path changes
    const items = useMemo(() => ensureStringArray(getNestedValue(content, path)), [content, path]);
    const [newItem, setNewItem] = useState('');
    const [localItems, setLocalItems] = useState<Record<number, string>>({});

    useEffect(() => {
      // Reset local state when items change externally
      setLocalItems({});
    }, [items]);

    const handleItemChange = (index: number, value: string) => {
      setLocalItems(prev => ({ ...prev, [index]: value }));
    };

    const handleItemBlur = (index: number) => {
      const newValue = localItems[index];
      if (newValue !== undefined) {
        updateArrayItem(path, index, newValue);
        setLocalItems(prev => {
          const { [index]: _, ...rest } = prev;
          return rest;
        });
      }
    };

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={localItems[index] !== undefined ? localItems[index] : item}
                onChange={(e) => handleItemChange(index, e.target.value)}
                onBlur={() => handleItemBlur(index)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => removeArrayItem(path, index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim()) {
                  addArrayItem(path, newItem.trim());
                  setNewItem('');
                }
              }}
              placeholder={placeholder || 'Add new item...'}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (newItem.trim()) {
                  addArrayItem(path, newItem.trim());
                  setNewItem('');
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
      </div>
    );
  };

  const StringArrayEditor = ({ label, path, placeholder }: { label: string; path: string; placeholder?: string }) => {
    // Memoize items to prevent infinite loop - only recalculate when content or path changes
    const items = useMemo(() => ensureArray(getNestedValue(content, path)), [content, path]);
    const [newItem, setNewItem] = useState('');
    const [localItems, setLocalItems] = useState<Record<number, string>>({});

    useEffect(() => {
      // Reset local state when items change externally
      setLocalItems({});
    }, [items]);

    const handleItemChange = (index: number, value: string) => {
      setLocalItems(prev => ({ ...prev, [index]: value }));
    };

    const handleItemBlur = (index: number) => {
      const newValue = localItems[index];
      if (newValue !== undefined) {
        updateArrayItem(path, index, newValue);
        setLocalItems(prev => {
          const { [index]: _, ...rest } = prev;
          return rest;
        });
      }
    };

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={localItems[index] !== undefined ? localItems[index] : item}
                onChange={(e) => handleItemChange(index, e.target.value)}
                onBlur={() => handleItemBlur(index)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => removeArrayItem(path, index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newItem.trim()) {
                  addArrayItem(path, newItem.trim());
                  setNewItem('');
                }
              }}
              placeholder={placeholder || `Add ${label.toLowerCase()}...`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (newItem.trim()) {
                  addArrayItem(path, newItem.trim());
                  setNewItem('');
                }
              }}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ObjectEditor = ({ label, path }: { label: string; path: string }) => {
    // Get the raw value - could be object, array, or anything
    const rawValue = getNestedValue(content, path);

    // Convert to JSON, handling undefined/null
    const valueToEdit = rawValue !== undefined && rawValue !== null ? rawValue : {};

    const [jsonStr, setJsonStr] = useState(JSON.stringify(valueToEdit, null, 2));
    const [error, setError] = useState('');

    useEffect(() => {
      const valueToEdit = rawValue !== undefined && rawValue !== null ? rawValue : {};
      setJsonStr(JSON.stringify(valueToEdit, null, 2));
    }, [rawValue]);

    const handleBlur = () => {
      try {
        const parsed = JSON.parse(jsonStr);
        updateField(path, parsed);
        setError('');
      } catch (e) {
        setError('Invalid JSON');
      }
    };

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <textarea
          value={jsonStr}
          onChange={(e) => setJsonStr(e.target.value)}
          onBlur={handleBlur}
          rows={8}
          className={`w-full px-3 py-2 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm`}
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <p className="text-xs text-gray-500 mt-1">Edit as JSON (must be valid) - Can be object or array</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Generated Content</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review and modify all fields before saving • {deliverable || 'Unknown Type'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation (for Locations) */}
        {isLocation && (
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="flex">
              <button
                onClick={() => setActiveTab('fields')}
                className={`flex-1 px-6 py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'fields'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Tag className="w-4 h-4" />
                Edit Fields
              </button>
              <button
                onClick={() => setActiveTab('map')}
                className={`flex-1 px-6 py-3 font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'map'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Map className="w-4 h-4" />
                Edit Map
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Fields Tab Content */}
          {activeTab === 'fields' && (
            <>
              {/* Initialization Error Message */}
              {initError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-red-800">
                <strong>Initialization Error:</strong>
                <p className="mt-1">{initError}</p>
                <p className="mt-2 text-xs font-mono">Check browser console for detailed error logs</p>
              </div>
            </div>
          )}

          {/* Error Message if content is empty */}
          {!initError && isContentEmpty && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-red-800">
                <strong>Error: No content data available.</strong>
                <p className="mt-1">The generated content is empty or was not properly passed to this modal. Please check the browser console for errors and try regenerating the content.</p>
                <p className="mt-1 text-xs">generatedContent prop: {generatedContent ? 'present' : 'null or undefined'}</p>
              </div>
            </div>
          )}

          {/* Info Banner */}
          {!isContentEmpty && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-blue-800">
                <strong>All fields from generated content are shown below.</strong> Edit any field, modify tags, or adjust nested structures.
                Complex objects (traits, actions, equipment) are shown as JSON - edit carefully. Click "Save & Continue" when ready.
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div className="space-y-2">
            <SectionHeader title="Basic Information" section="basic" />
            {expandedSections.has('basic') && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                <TextField label="Title" path="title" placeholder="Content title" />
                <TextField label="Canonical Name" path="canonical_name" placeholder="Canonical name for library" />
                <TextField label="Description" path="description" rows={4} placeholder="Main description" />
                <TextField label="Deliverable Type" path="deliverable" placeholder="npc, encounter, item, etc." />
                {!!content.difficulty && <TextField label="Difficulty" path="difficulty" />}
              </div>
            )}
          </div>

          {/* NPC Core Fields */}
          {isNpc && (
            <div className="space-y-2">
              <SectionHeader title="NPC Core Details" section="npc_core" />
              {expandedSections.has('npc_core') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Basic Identity */}
                  {!!content.aliases && (
                    <StringArrayEditor label="Aliases / Other Names" path="aliases" />
                  )}
                  {!!content.genre && (
                    <TextField label="Genre" path="genre" placeholder="fantasy, sci-fi, horror, etc." />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Appearance" path="appearance" rows={3} />
                    <TextField label="Background" path="background" rows={3} />
                  </div>

                  {/* Creature Info */}
                  <div className="grid grid-cols-4 gap-3">
                    <TextField label="Race" path="race" />
                    <TextField label="Size" path="size" placeholder="Medium, Large, etc." />
                    <TextField label="Creature Type" path="creature_type" placeholder="Humanoid, Undead, etc." />
                    <TextField label="Subtype" path="subtype" placeholder="Elf, Vampire, etc." />
                  </div>

                  {/* Alignment & Role */}
                  <div className="grid grid-cols-3 gap-3">
                    <TextField label="Alignment" path="alignment" />
                    <TextField label="Role" path="role" />
                    <TextField label="Affiliation" path="affiliation" />
                  </div>

                  {/* Location & Era */}
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Location" path="location" placeholder="Where they're typically found" />
                    <TextField label="Era / Time Period" path="era" placeholder="When they exist/existed" />
                  </div>

                  {/* Class & XP */}
                  {Array.isArray(content.class_levels) ? (
                    <ExpandableArrayEditor
                      label="Class Levels"
                      value={ensureAnyArray(content.class_levels)}
                      onChange={(val) => updateField('class_levels', val)}
                      path="class_levels"
                      defaultExpanded={true}
                    />
                  ) : (
                    <TextField label="Class Levels" path="class_levels" placeholder="e.g., Fighter 5 / Druid 3" />
                  )}
                  {!!content.experience_points && (
                    <NumberField label="Experience Points (XP)" path="experience_points" />
                  )}

                  {/* Personality */}
                  <StringArrayEditor label="Personality Traits" path="personality_traits" />
                  <StringArrayEditor label="Ideals" path="ideals" />
                  <StringArrayEditor label="Bonds" path="bonds" />
                  <StringArrayEditor label="Flaws" path="flaws" />
                  <StringArrayEditor label="Goals" path="goals" />
                  <StringArrayEditor label="Fears" path="fears" />
                  <StringArrayEditor label="Quirks" path="quirks" />
                  <TextField label="Voice & Mannerisms" path="voice_mannerisms" rows={2} />
                  <StringArrayEditor label="Story Hooks" path="hooks" />
                </div>
              )}
            </div>
          )}

          {/* Monster Core Details */}
          {isMonster && (
            <div className="space-y-2">
              <SectionHeader title="Monster Core Details" section="monster_core" />
              {expandedSections.has('monster_core') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Basic Identity */}
                  <div className="grid grid-cols-4 gap-3">
                    <TextField label="Size" path="size" placeholder="Medium, Large, etc." />
                    <TextField label="Creature Type" path="creature_type" placeholder="Dragon, Humanoid, Undead, etc." />
                    <TextField label="Subtype" path="subtype" placeholder="Chromatic Dragon, Vampire, etc." />
                    <TextField label="Alignment" path="alignment" />
                  </div>

                  {/* Location & CR */}
                  <div className="grid grid-cols-3 gap-3">
                    <TextField label="Location" path="location" placeholder="Where typically found" />
                    <TextField label="Challenge Rating" path="challenge_rating" placeholder="e.g. 5" />
                    {!!content.experience_points && (
                      <NumberField label="Experience Points (XP)" path="experience_points" />
                    )}
                  </div>

                  {/* Description & Appearance */}
                  <TextField label="Description" path="description" rows={4} placeholder="Physical description and notable features" />

                  {/* Ecology - object or string */}
                  {content.ecology && typeof content.ecology === 'object' && !Array.isArray(content.ecology) ? (
                    <ExpandableObjectEditor
                      label="Ecology (habitat, diet, behavior, group_size)"
                      value={ensureObject(content.ecology)}
                      onChange={(val) => updateField('ecology', val)}
                      path="ecology"
                      defaultExpanded={false}
                    />
                  ) : content.ecology ? (
                    <TextField label="Ecology" path="ecology" rows={3} placeholder="Habitat, diet, behavior" />
                  ) : null}

                  {/* Lore - object or string */}
                  {content.lore && typeof content.lore === 'object' && !Array.isArray(content.lore) ? (
                    <ExpandableObjectEditor
                      label="Lore & History"
                      value={ensureObject(content.lore)}
                      onChange={(val) => updateField('lore', val)}
                      path="lore"
                      defaultExpanded={false}
                    />
                  ) : content.lore ? (
                    <TextField label="Lore & History" path="lore" rows={3} placeholder="Origin, cultural significance, legends" />
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Creature Stats & Abilities - shared by NPCs and Monsters */}
          {isCreature && (
            <div className="space-y-2">
              <SectionHeader title={isMonster ? "Monster Stats & Abilities" : "NPC Stats & Abilities"} section={isMonster ? "monster_stats" : "npc_stats"} />
              {(expandedSections.has('npc_stats') || expandedSections.has('monster_stats')) && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Ability Scores - object with str, dex, con, int, wis, cha */}
                  {!!content.ability_scores && (
                    <ExpandableObjectEditor
                      label="Ability Scores (str, dex, con, int, wis, cha)"
                      value={ensureObject(content.ability_scores)}
                      onChange={(val) => updateField('ability_scores', val)}
                      path="ability_scores"
                      defaultExpanded={false}
                    />
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Armor Class (AC)</label>
                      <input
                        type="text"
                        value={(() => {
                          const ac = getNestedValue(content, 'armor_class');
                          // Handle array format: [{value: 20, type: "natural armor"}]
                          if (Array.isArray(ac) && ac.length > 0 && ac[0] && typeof ac[0] === 'object') {
                            const firstAc = ac[0] as any;
                            if (firstAc.value !== undefined) {
                              return `${firstAc.value}${firstAc.type ? ` (${firstAc.type})` : ''}`;
                            }
                          }
                          // Handle simple number format
                          if (typeof ac === 'number') {
                            return String(ac);
                          }
                          // Handle string format
                          return String(ac || '');
                        })()}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          // Try to parse "18 (plate armor)" format
                          const match = val.match(/^(\d+)\s*\(([^)]+)\)$/);
                          if (match) {
                            updateField('armor_class', [{ value: parseInt(match[1]), type: match[2] }]);
                          } else if (/^\d+$/.test(val)) {
                            // Plain number
                            updateField('armor_class', parseInt(val));
                          } else {
                            // Store as-is for later normalization
                            updateField('armor_class', val);
                          }
                        }}
                        placeholder="e.g. 18 or 18 (plate armor)"
                        className={`w-full px-2 py-1.5 border rounded-md text-sm ${armorClassInlineIssue ? 'border-red-400' : 'border-gray-300'}`}
                      />
                      {!!armorClassInlineIssue && (
                        <p className="text-xs text-red-700 mt-1">{armorClassInlineIssue}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hit Points</label>
                      <input
                        type="text"
                        value={(() => {
                          const hp = getNestedValue(content, 'hit_points');
                          if (typeof hp === 'object' && hp && 'average' in hp) {
                            const hpObj = hp as { average: unknown; formula?: unknown };
                            return `${hpObj.average}${hpObj.formula ? ` (${hpObj.formula})` : ''}`;
                          }
                          return String(hp || '');
                        })()}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Try to parse "138 (12d12+60)" format back to object
                          const match = val.match(/^(\d+)\s*\(([^)]+)\)$/);
                          if (match) {
                            updateField('hit_points', { average: parseInt(match[1]), formula: match[2] });
                          } else if (/^\d+$/.test(val)) {
                            updateField('hit_points', parseInt(val));
                          } else {
                            updateField('hit_points', val);
                          }
                        }}
                        placeholder="e.g. 112 (15d8 + 45)"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <TextField label="Hit Dice" path="hit_dice" placeholder="e.g. 15d8" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Challenge Rating" path="challenge_rating" placeholder="e.g. 10 (5,900 XP)" />
                    <NumberField label="Proficiency Bonus" path="proficiency_bonus" />
                  </div>

                  {/* Multiclass Features - array of objects */}
                  {!!content.multiclass_features && (
                    <ExpandableArrayEditor
                      label="Multiclass Features"
                      value={ensureAnyArray(content.multiclass_features)}
                      onChange={(val) => updateField('multiclass_features', val)}
                      path="multiclass_features"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ class: '', level: '', feature: '', description: '' }}
                    />
                  )}

                  {/* Speed - object with walk, climb, fly, swim, etc. */}
                  {!!content.speed && (
                    <ExpandableObjectEditor
                      label="Speed (walk, climb, fly, swim, etc.)"
                      value={ensureObject(content.speed)}
                      onChange={(val) => updateField('speed', val)}
                      path="speed"
                      defaultExpanded={false}
                    />
                  )}

                  <StringArrayEditor label="Languages" path="languages" />
                  <StringArrayEditor label="Senses" path="senses" />
                  <FlexibleStringArrayEditor label="Saving Throws" path="saving_throws" placeholder="e.g. DEX +9" />
                  <FlexibleStringArrayEditor label="Skill Proficiencies" path="skill_proficiencies" placeholder="e.g. Perception +8" />
                  <StringArrayEditor label="Damage Resistances" path="damage_resistances" />
                  <StringArrayEditor label="Damage Immunities" path="damage_immunities" />
                  <StringArrayEditor label="Damage Vulnerabilities" path="damage_vulnerabilities" />
                  <StringArrayEditor label="Condition Immunities" path="condition_immunities" />
                </div>
              )}
            </div>
          )}

          {/* Creature Combat & Actions - shared by NPCs and Monsters */}
          {isCreature && (
            <div className="space-y-2">
              <SectionHeader title={isMonster ? "Monster Combat & Actions" : "NPC Combat & Actions"} section={isMonster ? "monster_combat" : "npc_combat"} />
              {(expandedSections.has('npc_combat') || expandedSections.has('monster_combat')) && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Tactics - can be object or string */}
                  {content.tactics && typeof content.tactics === 'object' && !Array.isArray(content.tactics) ? (
                    <ExpandableObjectEditor
                      label="Tactics"
                      value={ensureObject(content.tactics)}
                      onChange={(val) => updateField('tactics', val)}
                      path="tactics"
                      defaultExpanded={false}
                    />
                  ) : (
                    <TextField label="Tactics" path="tactics" rows={3} placeholder="Combat strategy and tactics" />
                  )}

                  {/* Abilities - array of objects */}
                  {!!content.abilities && (
                    <ExpandableArrayEditor
                      label="Abilities (special abilities)"
                      value={ensureAnyArray(content.abilities)}
                      onChange={(val) => updateField('abilities', val)}
                      path="abilities"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', description: '', uses: '', recharge: '', notes: '' }}
                    />
                  )}

                  {/* Actions - array of objects */}
                  {!!content.actions && (
                    <ExpandableArrayEditor
                      label="Actions"
                      value={ensureAnyArray(content.actions)}
                      onChange={(val) => updateField('actions', val)}
                      path="actions"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', description: '', uses: '', recharge: '', notes: '' }}
                    />
                  )}

                  {/* Bonus Actions - array of objects */}
                  {!!content.bonus_actions && (
                    <ExpandableArrayEditor
                      label="Bonus Actions"
                      value={ensureAnyArray(content.bonus_actions)}
                      onChange={(val) => updateField('bonus_actions', val)}
                      path="bonus_actions"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', description: '', uses: '', recharge: '', notes: '' }}
                    />
                  )}

                  {/* Reactions - array of objects */}
                  {!!content.reactions && (
                    <ExpandableArrayEditor
                      label="Reactions"
                      value={ensureAnyArray(content.reactions)}
                      onChange={(val) => updateField('reactions', val)}
                      path="reactions"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', description: '', uses: '', recharge: '', notes: '' }}
                    />
                  )}

                  {/* Multiattack - can be string or object */}
                  {content.multiattack && typeof content.multiattack === 'object' && !Array.isArray(content.multiattack) ? (
                    <ExpandableObjectEditor
                      label="Multiattack"
                      value={ensureObject(content.multiattack)}
                      onChange={(val) => updateField('multiattack', val)}
                      path="multiattack"
                      defaultExpanded={false}
                    />
                  ) : content.multiattack ? (
                    <TextField label="Multiattack" path="multiattack" rows={2} placeholder="Description of multiattack pattern" />
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Creature Spellcasting (v1.1) - shared by NPCs and Monsters */}
          {isCreature && (content.spellcasting || content.cantrips || content.prepared_spells || content.spell_slots || content.innate_spellcasting) && (
            <div className="space-y-2">
              <SectionHeader title="Spellcasting" section={isMonster ? "monster_spellcasting" : "npc_spellcasting"} badge="v1.1" />
              {(expandedSections.has('npc_spellcasting') || expandedSections.has('monster_spellcasting')) && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {!!content.spellcasting && (
                    <ExpandableObjectEditor
                      label="Spellcasting Details (ability, save DC, attack bonus)"
                      value={ensureObject(content.spellcasting)}
                      onChange={(val) => updateField('spellcasting', val)}
                      path="spellcasting"
                      defaultExpanded={true}
                    />
                  )}

                  {!!content.cantrips && (
                    <StringArrayEditor label="Cantrips" path="cantrips" />
                  )}

                  {!!content.prepared_spells && (
                    <ExpandableObjectEditor
                      label="Prepared Spells (by level)"
                      value={ensureObject(content.prepared_spells)}
                      onChange={(val) => updateField('prepared_spells', val)}
                      path="prepared_spells"
                      defaultExpanded={false}
                    />
                  )}

                  {!!content.spell_slots && (
                    <ExpandableObjectEditor
                      label="Spell Slots (by level)"
                      value={ensureObject(content.spell_slots)}
                      onChange={(val) => updateField('spell_slots', val)}
                      path="spell_slots"
                      defaultExpanded={false}
                    />
                  )}

                  {!!content.innate_spellcasting && (
                    <ExpandableObjectEditor
                      label="Innate Spellcasting"
                      value={ensureObject(content.innate_spellcasting)}
                      onChange={(val) => updateField('innate_spellcasting', val)}
                      path="innate_spellcasting"
                      defaultExpanded={false}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* NPC Vampire Traits (v1.1) */}
          {isNpc && !!content.vampire_traits && (
            <div className="space-y-2">
              <SectionHeader title="Vampire Traits" section="npc_vampire" badge="v1.1" />
              {expandedSections.has('npc_vampire') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  <ExpandableObjectEditor
                    label="Vampire Mechanics"
                    value={ensureObject(content.vampire_traits)}
                    onChange={(val) => updateField('vampire_traits', val)}
                    path="vampire_traits"
                    defaultExpanded={true}
                  />
                </div>
              )}
            </div>
          )}

          {/* Creature Legendary & Mythic Actions (v1.1) - shared by NPCs and Monsters */}
          {isCreature && (content.legendary_actions || content.mythic_actions) && (
            <div className="space-y-2">
              <SectionHeader title="Legendary & Mythic Actions" section={isMonster ? "monster_legendary" : "npc_legendary"} badge="v1.1" />
              {(expandedSections.has('npc_legendary') || expandedSections.has('monster_legendary')) && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {!!content.legendary_actions && (
                    <ExpandableObjectEditor
                      label="Legendary Actions"
                      value={ensureObject(content.legendary_actions)}
                      onChange={(val) => updateField('legendary_actions', val)}
                      path="legendary_actions"
                      defaultExpanded={true}
                    />
                  )}
                  {!!content.mythic_actions && (
                    <ExpandableObjectEditor
                      label="Mythic Actions"
                      value={ensureObject(content.mythic_actions)}
                      onChange={(val) => updateField('mythic_actions', val)}
                      path="mythic_actions"
                      defaultExpanded={false}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Creature Lair & Regional Effects (v1.1) - shared by NPCs and Monsters */}
          {isCreature && (content.lair_actions || content.regional_effects || content.lair_description) && (
            <div className="space-y-2">
              <SectionHeader title="Lair & Regional Effects" section={isMonster ? "monster_lair" : "npc_lair"} badge="v1.1" />
              {(expandedSections.has('npc_lair') || expandedSections.has('monster_lair')) && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {!!content.lair_description && (
                    <TextField label="Lair Description" path="lair_description" rows={3} />
                  )}
                  {!!content.lair_actions && (
                    <ExpandableArrayEditor
                      label="Lair Actions"
                      value={ensureAnyArray(content.lair_actions)}
                      onChange={(val) => updateField('lair_actions', val)}
                      path="lair_actions"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ initiative: 20, action: '', description: '' }}
                    />
                  )}
                  {!!content.regional_effects && (
                    <ExpandableArrayEditor
                      label="Regional Effects"
                      value={ensureAnyArray(content.regional_effects)}
                      onChange={(val) => updateField('regional_effects', val)}
                      path="regional_effects"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ radius: '', effect: '', description: '', duration: '' }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* NPC Relationships & Networks (v1.1) */}
          {isNpc && (
            <div className="space-y-2">
              <SectionHeader title="Relationships & Networks" section="npc_relationships" badge="v1.1" />
              {expandedSections.has('npc_relationships') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Allies & Friends */}
                  <ExpandableArrayEditor
                    label="Allies & Friends"
                    value={ensureAnyArray(content.allies_friends)}
                    onChange={(val) => updateField('allies_friends', val)}
                    path="allies_friends"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', type: '', relationship: '', notes: '' }}
                  />

                  {/* Foes & Enemies */}
                  <ExpandableArrayEditor
                    label="Foes & Enemies"
                    value={ensureAnyArray(content.foes)}
                    onChange={(val) => updateField('foes', val)}
                    path="foes"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', type: '', relationship: '', reason: '', notes: '' }}
                  />

                  {/* Rivals */}
                  {!!content.rivals && (
                    <ExpandableArrayEditor
                      label="Rivals"
                      value={ensureAnyArray(content.rivals)}
                      onChange={(val) => updateField('rivals', val)}
                      path="rivals"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', type: '', nature: '', notes: '' }}
                    />
                  )}

                  {/* Mentors */}
                  {!!content.mentors && (
                    <ExpandableArrayEditor
                      label="Mentors"
                      value={ensureAnyArray(content.mentors)}
                      onChange={(val) => updateField('mentors', val)}
                      path="mentors"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', type: '', subject: '', notes: '' }}
                    />
                  )}

                  {/* Students */}
                  {!!content.students && (
                    <ExpandableArrayEditor
                      label="Students"
                      value={ensureAnyArray(content.students)}
                      onChange={(val) => updateField('students', val)}
                      path="students"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', type: '', subject: '', notes: '' }}
                    />
                  )}

                  {/* Family */}
                  {!!content.family && (
                    <ExpandableArrayEditor
                      label="Family"
                      value={ensureAnyArray(content.family)}
                      onChange={(val) => updateField('family', val)}
                      path="family"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', type: '', relation: '', status: '', notes: '' }}
                    />
                  )}

                  {/* Factions */}
                  <ExpandableArrayEditor
                    label="Factions"
                    value={ensureAnyArray(content.factions)}
                    onChange={(val) => updateField('factions', val)}
                    path="factions"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', role: '', standing: '', notes: '' }}
                  />

                  {/* Minions */}
                  <ExpandableArrayEditor
                    label="Minions"
                    value={ensureAnyArray(content.minions)}
                    onChange={(val) => updateField('minions', val)}
                    path="minions"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', type: '', quantity: 1, loyalty: '', notes: '' }}
                  />

                  {/* Conflicts */}
                  {!!content.conflicts && (
                    <ExpandableArrayEditor
                      label="Conflicts"
                      value={ensureAnyArray(content.conflicts)}
                      onChange={(val) => updateField('conflicts', val)}
                      path="conflicts"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', type: '', status: '', stakes: '', notes: '' }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* NPC Magic Items & Equipment (v1.1) */}
          {isNpc && (
            <div className="space-y-2">
              <SectionHeader title="Magic Items & Equipment" section="npc_magic_items" badge="v1.1" />
              {expandedSections.has('npc_magic_items') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                  {/* Equipment - general mundane items */}
                  <ExpandableArrayEditor
                    label="Equipment (mundane items)"
                    value={ensureArray(content.equipment) as unknown[]}
                    onChange={(val) => updateField('equipment', val)}
                    path="equipment"
                    defaultExpanded={false}
                    itemType="string"
                  />

                  {/* Attuned Magic Items */}
                  <ExpandableArrayEditor
                    label="Attuned Magic Items"
                    value={ensureAnyArray(content.attuned_items)}
                    onChange={(val) => updateField('attuned_items', val)}
                    path="attuned_items"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', rarity: 'Uncommon', requires_attunement: true, attuned: true, description: '', charges: '', recharge: '' }}
                  />

                  {/* Magic Items (Non-Attuned) */}
                  <ExpandableArrayEditor
                    label="Magic Items (Non-Attuned)"
                    value={ensureAnyArray(content.magic_items)}
                    onChange={(val) => updateField('magic_items', val)}
                    path="magic_items"
                    defaultExpanded={false}
                    itemType="object"
                    objectTemplate={{ name: '', rarity: 'Common', description: '', charges: '' }}
                  />

                  {/* Signature Items */}
                  {!!content.signature_items && (
                    <ExpandableArrayEditor
                      label="Signature Items"
                      value={ensureAnyArray(content.signature_items)}
                      onChange={(val) => updateField('signature_items', val)}
                      path="signature_items"
                      defaultExpanded={false}
                      itemType="object"
                      objectTemplate={{ name: '', description: '', significance: '', notes: '' }}
                    />
                  )}

                  {/* Wealth */}
                  {content.wealth && typeof content.wealth === 'object' && !Array.isArray(content.wealth) ? (
                    <ExpandableObjectEditor
                      label="Wealth (gp, sp, cp, etc.)"
                      value={ensureObject(content.wealth)}
                      onChange={(val) => updateField('wealth', val)}
                      path="wealth"
                      defaultExpanded={false}
                    />
                  ) : content.wealth ? (
                    <TextField label="Wealth" path="wealth" placeholder="e.g., 500 gp, wealthy" />
                  ) : null}

                  {/* Resources */}
                  {!!content.resources && (
                    <ExpandableArrayEditor
                      label="Resources"
                      value={ensureArray(content.resources) as unknown[]}
                      onChange={(val) => updateField('resources', val)}
                      path="resources"
                      defaultExpanded={false}
                      itemType="string"
                    />
                  )}
                </div>
              )}
            </div>
          )}


          {/* ENCOUNTER SECTIONS */}
          {isEncounter && (
            <>
              {/* Encounter Core */}
              <div className="space-y-2">
                <SectionHeader title="Encounter Core" section="encounter_core" />
                {expandedSections.has('encounter_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <div className="grid grid-cols-2 gap-3">
                      <TextField label="Encounter Type" path="encounter_type" placeholder="combat, social, exploration, puzzle" />
                      <TextField label="Party Level Range" path="party_level_range" placeholder="e.g., 5-7" />
                    </div>
                    <TextField label="Estimated Duration" path="estimated_duration" placeholder="e.g., 30-45 minutes" />
                    <ObjectEditor label="Objectives (primary, secondary, failure_conditions)" path="objectives" />
                    <StringArrayEditor label="Hooks" path="hooks" />
                    <StringArrayEditor label="Escalation Options" path="escalation" />
                  </div>
                )}
              </div>

              {/* Encounter Environment */}
              <div className="space-y-2">
                <SectionHeader title="Environment & Map" section="encounter_environment" />
                {expandedSections.has('encounter_environment') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Environment (location, terrain, lighting, weather)" path="environment" />
                    <ObjectEditor label="Encounter Map (dimensions, key_features, cover_terrain)" path="encounter_map" />
                  </div>
                )}
              </div>

              {/* Encounter Enemies & Tactics */}
              <div className="space-y-2">
                <SectionHeader title="Enemies & Tactics" section="encounter_enemies" />
                {expandedSections.has('encounter_enemies') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Enemies (name, count, cr, role, tactics)" path="enemies" />
                    <ObjectEditor label="Tactics (enemy_strategy, reinforcements, retreat, phases)" path="tactics" />
                    <ObjectEditor label="Rewards (treasure, experience, story_rewards)" path="rewards" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ITEM SECTIONS */}
          {isItem && (
            <>
              {/* Item Core */}
              <div className="space-y-2">
                <SectionHeader title="Item Core" section="item_core" />
                {expandedSections.has('item_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <StringArrayEditor label="Aliases" path="aliases" />
                    <TextField label="Appearance" path="appearance" rows={3} />
                    <div className="grid grid-cols-3 gap-3">
                      <TextField label="Item Type" path="item_type" placeholder="weapon, armor, wondrous_item" />
                      <TextField label="Subtype" path="subtype" placeholder="longsword, plate armor" />
                      <TextField label="Rarity" path="rarity" placeholder="common, uncommon, rare..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <TextField label="Requires Attunement" path="requires_attunement" placeholder="true/false" />
                      <TextField label="Attunement Requirements" path="attunement_requirements" placeholder="by a spellcaster" />
                    </div>
                  </div>
                )}
              </div>

              {/* Item Properties & Mechanics */}
              <div className="space-y-2">
                <SectionHeader title="Properties & Mechanics" section="item_properties" />
                {expandedSections.has('item_properties') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Properties (magical_bonus, special_abilities, passive_effects, activation, cursed)" path="properties" />
                    <ObjectEditor label="Mechanics (damage, armor_class, spell_save_dc, attack_bonus, weight, cost_gp)" path="mechanics" />
                  </div>
                )}
              </div>

              {/* Item Lore */}
              <div className="space-y-2">
                <SectionHeader title="Lore & History" section="item_lore" />
                {expandedSections.has('item_lore') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="History" path="history" rows={3} />
                    <ObjectEditor label="Lore (creator, origin_story, famous_wielders, current_location, legends)" path="lore" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* SCENE SECTIONS */}
          {isScene && (
            <>
              {/* Scene Core */}
              <div className="space-y-2">
                <SectionHeader title="Scene Core" section="scene_core" />
                {expandedSections.has('scene_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="Scene Type" path="scene_type" placeholder="roleplay, investigation, exploration, social" />
                    <TextField label="Estimated Duration" path="estimated_duration" placeholder="e.g., 20-30 minutes" />
                    <StringArrayEditor label="Hooks" path="hooks" />
                    <StringArrayEditor label="Clues/Information" path="clues_information" />
                    <ObjectEditor label="Transitions (from_previous, to_next)" path="transitions" />
                  </div>
                )}
              </div>

              {/* Scene Setting */}
              <div className="space-y-2">
                <SectionHeader title="Setting & Narration" section="scene_setting" />
                {expandedSections.has('scene_setting') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Setting (location, time_of_day, atmosphere, sensory_details, mood)" path="setting" />
                    <ObjectEditor label="Narration (opening, player_perspective, gm_secrets)" path="narration" />
                  </div>
                )}
              </div>

              {/* Scene NPCs & Events */}
              <div className="space-y-2">
                <SectionHeader title="NPCs & Events" section="scene_npcs" />
                {expandedSections.has('scene_npcs') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="NPCs Present (name, role, disposition, goals, secrets)" path="npcs_present" />
                    <ObjectEditor label="Events (trigger, description, outcomes)" path="events" />
                    <ObjectEditor label="Skill Checks (skill, dc, purpose, success_result, failure_result)" path="skill_checks" />
                    <ObjectEditor label="Branching Paths (player_choice, consequence, leads_to)" path="branching_paths" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* STORY ARC SECTIONS */}
          {isStoryArc && (
            <>
              {/* Story Arc Core */}
              <div className="space-y-2">
                <SectionHeader title="Story Arc Core" section="arc_core" />
                {expandedSections.has('arc_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="Premise" path="premise" rows={2} placeholder="Core concept in 1-2 sentences" />
                    <StringArrayEditor label="Themes" path="themes" placeholder="betrayal, redemption, mystery..." />
                    <ObjectEditor label="Scope (estimated_sessions, level_range, geographic_scope, stakes)" path="scope" />
                    <ObjectEditor label="Hook (initial_hook, personal_connections, urgency)" path="hook" />
                    <ObjectEditor label="Pacing (introduction, rising_action, climax, falling_action)" path="pacing" />
                  </div>
                )}
              </div>

              {/* Story Arc Acts & Climax */}
              <div className="space-y-2">
                <SectionHeader title="Acts & Climax" section="arc_acts" />
                {expandedSections.has('arc_acts') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Acts (act_number, title, summary, key_events, major_npcs, locations, estimated_sessions, act_climax)" path="acts" />
                    <ObjectEditor label="Climax (description, location, stakes, victory_conditions, failure_outcomes)" path="climax" />
                    <ObjectEditor label="Resolution Options (outcome, requirements, consequences)" path="resolution_options" />
                    <ObjectEditor label="Subplots (title, description, resolution)" path="subplots" />
                  </div>
                )}
              </div>

              {/* Story Arc NPCs & Locations */}
              <div className="space-y-2">
                <SectionHeader title="NPCs & Locations" section="arc_npcs" />
                {expandedSections.has('arc_npcs') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Major NPCs (name, role, motivation, arc)" path="major_npcs" />
                    <ObjectEditor label="Key Locations (name, significance, when_visited)" path="key_locations" />
                    <ObjectEditor label="Central Conflict (antagonist, goal, methods, weakness)" path="central_conflict" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ADVENTURE SECTIONS */}
          {isAdventure && (
            <>
              {/* Adventure Core */}
              <div className="space-y-2">
                <SectionHeader title="Adventure Core" section="adventure_core" />
                {expandedSections.has('adventure_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="Subtitle" path="subtitle" />
                    <TextField label="Premise" path="premise" rows={2} />
                    <ObjectEditor label="Scope (estimated_sessions, level_range, player_count, difficulty)" path="scope" />
                    <StringArrayEditor label="Themes" path="themes" />
                  </div>
                )}
              </div>

              {/* Adventure Structure */}
              <div className="space-y-2">
                <SectionHeader title="Adventure Structure" section="adventure_structure" />
                {expandedSections.has('adventure_structure') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Adventure Structure (introduction, acts, climax, conclusion)" path="adventure_structure" />
                  </div>
                )}
              </div>

              {/* Adventure Resources */}
              <div className="space-y-2">
                <SectionHeader title="Resources & Guidance" section="adventure_resources" />
                {expandedSections.has('adventure_resources') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Major NPCs (name, role, brief_stats, key_motivations)" path="major_npcs" />
                    <ObjectEditor label="Key Locations (name, description, encounters, points_of_interest)" path="key_locations" />
                    <ObjectEditor label="Magic Items (name, where_found, brief_description)" path="magic_items" />
                    <ObjectEditor label="Appendices (npcs, items, maps, handouts)" path="appendices" />
                    <ObjectEditor label="GM Guidance (preparation_notes, pacing_tips, common_pitfalls, improvisation_tips)" path="gm_guidance" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Location Sections */}
          {isLocation && (
            <>
              {/* Location Core */}
              <div className="space-y-2">
                <SectionHeader title="Location Core" section="location_core" />
                {expandedSections.has('location_core') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="Location Type" path="location_type" placeholder="e.g. tavern, castle, dungeon, city" />
                    <TextField label="Scale" path="scale" placeholder="simple, moderate, complex, massive" />
                    <TextField label="Purpose" path="purpose" rows={2} placeholder="Primary function" />
                    <NumberField label="Estimated Spaces" path="estimated_spaces" />
                    <TextField label="Architectural Style" path="architectural_style" />
                    <TextField label="Setting" path="setting" rows={2} />
                    <StringArrayEditor label="Key Features" path="key_features" />
                  </div>
                )}
              </div>

              {/* Location Structure */}
              <div className="space-y-2">
                <SectionHeader title="Structure & Layout" section="location_structure" />
                {expandedSections.has('location_structure') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Overall Dimensions (footprint, height)" path="overall_dimensions" />
                    <ObjectEditor label="Layout (description, dimensions, levels)" path="layout" />
                    <TextField label="Spatial Organization" path="spatial_organization" rows={2} />
                    <StringArrayEditor label="Access Points" path="access_points" />
                    <ObjectEditor label="Wings" path="wings" />
                    <ObjectEditor label="Floors" path="floors" />
                    <ObjectEditor label="Chunk Mesh Metadata" path="chunk_mesh_metadata" />
                  </div>
                )}
              </div>

              {/* Location Spaces */}
              <div className="space-y-2">
                <SectionHeader title="Spaces & Rooms" section="location_spaces" />
                {expandedSections.has('location_spaces') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <ObjectEditor label="Spaces (id, name, purpose, description, geometry, features)" path="spaces" />
                    <ObjectEditor label="Hallways" path="hallways" />
                    <ObjectEditor label="Doors" path="doors" />
                    <ObjectEditor label="Staircases" path="staircases" />
                  </div>
                )}
              </div>

              {/* Location Details */}
              <div className="space-y-2">
                <SectionHeader title="Details & Atmosphere" section="location_details" />
                {expandedSections.has('location_details') && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <TextField label="Materials" path="materials" rows={2} />
                    <TextField label="Lighting Scheme" path="lighting_scheme" />
                    <TextField label="Atmosphere" path="atmosphere" rows={3} />
                    <ObjectEditor label="Inhabitants (permanent_residents, notable_npcs, visitors, creatures)" path="inhabitants" />
                    <ObjectEditor label="Encounter Areas (space_id, encounter_type, description, tactical_notes)" path="encounter_areas" />
                    <ObjectEditor label="Secrets (type, location, description, how_to_find)" path="secrets" />
                    <ObjectEditor label="Treasure Locations (location, description, difficulty)" path="treasure_locations" />
                    <TextField label="History" path="history" rows={4} />
                    <TextField label="Current Events" path="current_events" rows={3} />
                    <StringArrayEditor label="Adventure Hooks" path="adventure_hooks" />
                    <StringArrayEditor label="Special Features" path="special_features" />
                    <TextField label="Cinematic Walkthrough" path="cinematic_walkthrough" rows={5} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tags & Metadata */}
          <div className="space-y-2">
            <SectionHeader title="Tags & Metadata" section="tags" />
            {expandedSections.has('tags') && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                {content.region !== undefined && <TextField label="Region" path="region" />}
                {content.era !== undefined && <TextField label="Era" path="era" />}
                {!!content.retrieval_hints && (
                  <>
                    <StringArrayEditor label="Retrieval Hint - Regions" path="retrieval_hints.regions" />
                    <StringArrayEditor label="Retrieval Hint - Eras" path="retrieval_hints.eras" />
                    <StringArrayEditor label="Retrieval Hint - Keywords" path="retrieval_hints.keywords" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sources & Metadata */}
          <div className="space-y-2">
            <SectionHeader title="Sources & Metadata" section="sources" />
            {expandedSections.has('sources') && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-md border border-gray-200">
                <TextField label="Rule Base" path="rule_base" placeholder="e.g. 2024RAW, 2014RAW" />
                <TextField label="Canon Update Summary" path="canon_update" rows={2} />
                <StringArrayEditor label="Sources Used" path="sources_used" />
                <StringArrayEditor label="Assumptions" path="assumptions" />
                {!!content.notes && <StringArrayEditor label="Notes" path="notes" />}
                {content.canon_alignment_score !== undefined && (
                  <NumberField label="Canon Alignment Score" path="canon_alignment_score" />
                )}
                {content.logic_score !== undefined && (
                  <NumberField label="Logic Score" path="logic_score" />
                )}
              </div>
            )}
          </div>

          {/* Raw JSON Viewer (Advanced) */}
          <div className="space-y-2">
            <SectionHeader title="Advanced: Full JSON" section="raw_json" badge="Advanced" />
            {expandedSections.has('raw_json') && (
              <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
                <ObjectEditor label="Complete Content (Edit with caution)" path="" />
                <p className="text-xs text-gray-600 mt-2">
                  This shows the complete content structure. Changes here override individual field edits.
                </p>
              </div>
            )}
          </div>
            </>
          )}

          {/* Map Tab Content */}
          {activeTab === 'map' && isLocation && (
            <div className="h-full flex flex-col">
              <LocationEditorProvider initialSpaces={(content.spaces as any) || []}>
                <InteractiveLocationEditor
                  locationName={String(content.title || content.canonical_name || 'Unnamed Location')}
                  onSave={(updatedSpaces: unknown) => {
                    console.log('[EditContentModal] Received updated spaces from map editor:', Array.isArray(updatedSpaces) ? updatedSpaces.length : 0);
                    updateField('spaces', updatedSpaces);
                  }}
                />
              </LocationEditorProvider>
            </div>
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-red-800 mb-2">Please fix the following issues:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Normalize and validate content before saving
              const { normalized, errors } = normalizeAndValidateContent(content);

              if (errors.length > 0) {
                setValidationErrors(errors);
                return;
              }

              // Clear any previous errors
              setValidationErrors([]);

              console.log('[EditContentModal] Saving edited content:', {
                contentKeys: Object.keys(normalized),
                deliverable: normalized.deliverable,
                sampleFields: {
                  title: normalized.title,
                  canonical_name: normalized.canonical_name,
                  description: normalized.description,
                  ability_scores: normalized.ability_scores,
                  actions: normalized.actions,
                },
                fullContent: normalized,
              });
              Promise.resolve(onSave(normalized)).catch((err) => {
                console.error('[EditContentModal] Save failed:', err);
                setValidationErrors([
                  err instanceof Error ? err.message : String(err),
                ]);
              });
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
