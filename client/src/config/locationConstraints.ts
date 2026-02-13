/**
 * Location Constraints System
 *
 * Defines architectural constraints for map generation including room sizes,
 * door specifications, adjacency rules, and structural requirements.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface RoomSizeConstraint {
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  unit: 'ft';
}

export interface DoorConstraint {
  min_width: number;
  max_width: number;
  position_rules: {
    min_from_corner: number; // feet from corners
    snap_to_grid: number; // grid size in feet
  };
  door_types: Array<{
    name: string;
    width: number;
    description: string;
  }>;
}

export type AdjacencyRelationship =
  | 'must_be_adjacent'
  | 'should_be_adjacent'
  | 'must_not_be_adjacent';

export interface AdjacencyRule {
  room_type_a: string;
  room_type_b: string;
  relationship: AdjacencyRelationship;
  reason?: string;
}

export type StructuralRuleType =
  | 'load_bearing'
  | 'vertical_access'
  | 'natural_light'
  | 'ventilation';

export interface StructuralRule {
  rule_type: StructuralRuleType;
  description: string;
  affected_room_types: string[];
  constraint: string; // Natural language for AI prompts
}

export interface LocationConstraints {
  name: string;
  description: string;

  // Room-specific size constraints by type
  room_size_constraints: Record<string, RoomSizeConstraint>;

  // Door specifications
  door_constraints: DoorConstraint;

  // Adjacency rules (kitchen near dining, etc.)
  adjacency_rules: AdjacencyRule[];

  // Structural rules (stairs, ventilation, etc.)
  structural_rules: StructuralRule[];

  // Global limits
  max_rooms_per_floor?: number;
  min_hallway_width?: number;
  require_vertical_access?: boolean;
}

/**
 * Default constraints for freeform generation
 * Provides sensible baseline rules without being overly restrictive
 */
export const DEFAULT_CONSTRAINTS: LocationConstraints = {
  name: 'Default Constraints',
  description: 'Sensible baseline architectural constraints for any location type',

  room_size_constraints: {
    default: {
      min_width: 10,
      max_width: 100,
      min_height: 10,
      max_height: 100,
      unit: 'ft',
    },
    hallway: {
      min_width: 5,
      max_width: 20,
      min_height: 20,
      max_height: 200,
      unit: 'ft',
    },
    corridor: {
      min_width: 5,
      max_width: 15,
      min_height: 20,
      max_height: 200,
      unit: 'ft',
    },
    closet: {
      min_width: 5,
      max_width: 15,
      min_height: 5,
      max_height: 15,
      unit: 'ft',
    },
    storage: {
      min_width: 10,
      max_width: 40,
      min_height: 10,
      max_height: 40,
      unit: 'ft',
    },
  },

  door_constraints: {
    min_width: 3,
    max_width: 10,
    position_rules: {
      min_from_corner: 3,
      snap_to_grid: 5,
    },
    door_types: [
      { name: 'single', width: 3, description: 'Standard single door' },
      { name: 'double', width: 6, description: 'Double doors for wide entries' },
      { name: 'large', width: 10, description: 'Large gates or grand entrances' },
    ],
  },

  adjacency_rules: [],

  structural_rules: [
    {
      rule_type: 'vertical_access',
      description: 'Multi-floor buildings require vertical connections',
      affected_room_types: ['stairwell', 'stairs', 'elevator', 'ladder'],
      constraint:
        'Buildings with multiple floors must include at least one stairwell, staircase, elevator, or vertical access point',
    },
  ],

  max_rooms_per_floor: undefined,
  min_hallway_width: 5,
  require_vertical_access: false,
};

/**
 * Get room size constraint for a specific room type
 * Falls back to 'default' if specific type not found
 */
export function getRoomSizeConstraint(
  constraints: LocationConstraints,
  roomType: string | undefined
): RoomSizeConstraint {
  if (!roomType) {
    return constraints.room_size_constraints.default || DEFAULT_CONSTRAINTS.room_size_constraints.default;
  }

  const normalized = roomType.toLowerCase().trim();

  // Try exact match first
  if (constraints.room_size_constraints[normalized]) {
    return constraints.room_size_constraints[normalized];
  }

  // Try partial matches for common patterns
  for (const [key, value] of Object.entries(constraints.room_size_constraints)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  // Fall back to default
  return constraints.room_size_constraints.default || DEFAULT_CONSTRAINTS.room_size_constraints.default;
}

/**
 * Get adjacency rules for a specific room type
 */
export function getAdjacencyRulesForRoom(
  constraints: LocationConstraints,
  roomType: string
): AdjacencyRule[] {
  const normalized = roomType.toLowerCase().trim();
  return constraints.adjacency_rules.filter(
    (rule) =>
      rule.room_type_a.toLowerCase() === normalized ||
      rule.room_type_b.toLowerCase() === normalized
  );
}

/**
 * Check if two room types should be adjacent based on constraints
 */
export function shouldBeAdjacent(
  constraints: LocationConstraints,
  roomTypeA: string,
  roomTypeB: string
): AdjacencyRelationship | null {
  const normalized_a = roomTypeA.toLowerCase().trim();
  const normalized_b = roomTypeB.toLowerCase().trim();

  const rule = constraints.adjacency_rules.find(
    (r) =>
      (r.room_type_a.toLowerCase() === normalized_a &&
        r.room_type_b.toLowerCase() === normalized_b) ||
      (r.room_type_a.toLowerCase() === normalized_b &&
        r.room_type_b.toLowerCase() === normalized_a)
  );

  return rule ? rule.relationship : null;
}
