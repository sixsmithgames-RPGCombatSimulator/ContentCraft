/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export type EntityType = 'npc' | 'monster' | 'item' | 'spell' | 'location' | 'faction' | 'rule' | 'timeline';

export interface Relationship {
  target_id: string;
  kind: string; // e.g., "ally", "enemy", "parent", "child", "owns", "located_in"
}

export interface Claim {
  text: string;
  source: string; // e.g., "PHB 2024 p.123", "campaign:session-5"
}

// Spell damage structure
export interface SpellDamage {
  dice?: string; // e.g., "8d6", "3d10"
  bonus?: number; // flat bonus damage
  type: string; // e.g., "fire", "lightning", "necrotic", "radiant"
  on_success?: string; // e.g., "half", "none"
}

// Spell area of effect
export interface SpellAreaOfEffect {
  type: string; // e.g., "sphere", "cone", "line", "cube", "cylinder"
  size: string; // e.g., "20-foot radius", "30-foot cone", "60-foot line"
}

// Spell target restrictions
export interface SpellTarget {
  type: string; // e.g., "creature", "object", "point", "self", "area"
  count?: number | string; // e.g., 1, "up to 3", "any number"
  restrictions?: string[]; // e.g., ["willing", "hostile", "Large or smaller"]
}

// Spell-specific detailed data
export interface SpellDetails {
  // Core properties
  level: number;
  school: string; // e.g., "Evocation", "Abjuration", "Conjuration"
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materials?: string | null;
  };
  duration: string;
  description: string; // Keep full text for reference
  higher_levels?: string | null;

  // Parsed mechanical fields
  damage?: SpellDamage[]; // Array to handle multiple damage instances
  damage_scaling?: string; // e.g., "+1d6 per slot level above 3rd"
  save_type?: string; // e.g., "Dexterity", "Wisdom", "Constitution"
  save_dc_modifier?: string; // e.g., "spellcasting ability", "10 + spell level"
  attack_type?: string; // e.g., "melee spell attack", "ranged spell attack"
  attack_modifier?: string; // e.g., "spellcasting ability"

  // Conditions and effects
  conditions_inflicted?: string[]; // e.g., ["cursed", "frightened", "stunned"]
  conditions_removed?: string[]; // e.g., ["charmed", "paralyzed"]
  buffs_granted?: string[]; // e.g., ["advantage on Dexterity (Stealth) checks"]
  debuffs_inflicted?: string[]; // e.g., ["disadvantage on attack rolls"]

  // Area and targeting
  area_of_effect?: SpellAreaOfEffect;
  targets?: SpellTarget;

  // Action economy
  action_economy_effect?: string; // e.g., "target loses action", "bonus action to activate"
  reaction_trigger?: string; // e.g., "when you see a creature casting a spell"

  // Additional mechanics
  requires_line_of_sight?: boolean;
  can_target_objects?: boolean;
  ongoing_effects?: string[]; // e.g., ["creatures entering area take damage", "can use action each turn"]
  dismissible?: boolean; // can be dismissed as an action
  upcast_effects?: string[]; // specific effects when upcast (beyond just damage)

  // Metadata
  source?: string; // e.g., "PHB 2024", "SRD 5.1"
  url?: string;
  slug?: string;
}

// NPC-specific detailed data
export interface NPCDetails {
  class_levels?: string;
  hit_points?: number;
  personality_traits?: string[];
  physical_appearance?: string;
  identifying_features?: string[];
  motivations?: string;
  ideals?: string;
  flaws?: string;
  skill_proficiencies?: string[];
  weapon_proficiencies?: string[];
  armor_proficiencies?: string[];
  other_proficiencies?: string[];
  spells_known?: string[];
  spells_prepared?: string[];
  equipment_carried?: string[];
  equipment_owned?: string[];
  deeds_titles?: string;
  allies_friends?: string[];
  foes?: string[];
  family?: string[];
  political_knowledge?: string;
  political_preferences?: string;
  political_influence?: string;
}

export interface CanonEntity {
  _id: string; // Format: "{scope}.{type}.{slug}" e.g., "lib.spell.fireball" or "proj_abc123.npc.elara"
  userId?: string; // User ID for multi-tenancy
  scope: string; // "lib" for library entities, "proj_{projectId}" for project entities
  type: EntityType;
  canonical_name: string;
  aliases: string[];
  era?: string; // e.g., "post-sundering", "age-of-arcanum"
  region?: string; // e.g., "sword-coast", "tal-dorei"
  relationships?: Relationship[];
  claims: Claim[]; // Factual statements about this entity
  npc_details?: NPCDetails; // NPC-specific detailed information
  spell_details?: SpellDetails; // Spell-specific detailed information

  // Project/Library fields
  project_id?: string; // Only for project-scoped entities
  is_official?: boolean; // True for library entities (SRD, PHB, etc.)
  tags?: string[]; // Searchable metadata (e.g., ["phb2024", "srd", "level-3", "evocation"])
  source?: string; // Source reference (e.g., "SRD 5.1", "PHB 2024", "campaign:session-5")

  version: string; // Semantic version for tracking changes
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Helper to generate entity ID from type and name with scope
 */
export function generateEntityId(type: EntityType, name: string, scope: string = 'lib'): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${scope}.${type}.${slug}`;
}

/**
 * Helper to generate project-scoped entity ID
 */
export function generateProjectEntityId(projectId: string, type: EntityType, name: string): string {
  return generateEntityId(type, name, `proj_${projectId}`);
}

/**
 * Helper to generate library entity ID
 */
export function generateLibraryEntityId(type: EntityType, name: string): string {
  return generateEntityId(type, name, 'lib');
}

/**
 * Helper to extract scope from entity ID
 */
export function extractScope(entityId: string): string {
  const parts = entityId.split('.');
  return parts[0] || '';
}

/**
 * Helper to check if entity is library-scoped
 */
export function isLibraryEntity(entityId: string): boolean {
  return extractScope(entityId) === 'lib';
}

/**
 * Helper to check if entity is project-scoped
 */
export function isProjectEntity(entityId: string): boolean {
  return extractScope(entityId).startsWith('proj_');
}
