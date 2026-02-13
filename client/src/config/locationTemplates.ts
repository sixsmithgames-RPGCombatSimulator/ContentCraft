/**
 * Location Templates System
 *
 * Defines comprehensive architectural templates that bundle constraints,
 * style guidelines, and room type definitions into cohesive packages.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { LocationConstraints } from './locationConstraints';

export interface ArchitecturalStyle {
  materials: {
    primary: string[];
    secondary: string[];
    floors: string[];
    walls: string[];
  };
  color_palette: {
    floors: string[];
    walls: string[];
    accent: string[];
  };
  door_style: 'wooden' | 'iron' | 'archway' | 'portcullis' | 'stone' | 'reinforced';
  lighting: 'torches' | 'candles' | 'magical' | 'natural' | 'oil_lamps' | 'braziers';
  decorative_elements: string[];
}

export interface RoomTypeDefinition {
  type: string;
  typical_names: string[];
  purpose: string;
  features: string[];
  adjacency_preferences: {
    prefer_near: string[];
    avoid_near: string[];
  };
}

export interface LocationTemplate {
  id: string;
  name: string;
  description: string;
  location_types: string[]; // e.g., ["castle", "fortress"]

  architectural_style: ArchitecturalStyle;
  constraints: LocationConstraints;
  room_types: RoomTypeDefinition[];

  layout_philosophy: string; // Natural language guidance for AI
  example_structures: string[]; // Real-world references
}

// ====================
// TEMPLATE 1: MEDIEVAL CASTLE
// ====================

const MEDIEVAL_CASTLE_TEMPLATE: LocationTemplate = {
  id: 'medieval_castle',
  name: 'Medieval Castle',
  description:
    'Defensive fortification with hierarchical spaces prioritizing security and social structure',
  location_types: ['castle', 'fortress', 'stronghold', 'keep'],

  architectural_style: {
    materials: {
      primary: ['stone', 'granite', 'limestone'],
      secondary: ['oak timber', 'iron', 'marble (for important rooms)'],
      floors: ['stone flags', 'cobblestone', 'wooden planks (upper floors)'],
      walls: ['thick stone walls (3-10ft)', 'plastered interior walls', 'tapestries'],
    },
    color_palette: {
      floors: ['#8B7355', '#696969', '#A0826D'],
      walls: ['#D3D3D3', '#C0C0C0', '#E5E4E2'],
      accent: ['#8B0000', '#FFD700', '#000080'],
    },
    door_style: 'iron',
    lighting: 'torches',
    decorative_elements: [
      'tapestries depicting battles and heraldry',
      'suits of armor',
      'weapon displays',
      'banners and flags',
      'carved stone details',
    ],
  },

  constraints: {
    name: 'Medieval Castle Constraints',
    description: 'Architectural rules for defensive medieval fortifications',

    room_size_constraints: {
      default: { min_width: 15, max_width: 80, min_height: 15, max_height: 80, unit: 'ft' },
      great_hall: { min_width: 40, max_width: 100, min_height: 50, max_height: 120, unit: 'ft' },
      throne_room: { min_width: 30, max_width: 80, min_height: 40, max_height: 80, unit: 'ft' },
      barracks: { min_width: 20, max_width: 60, min_height: 20, max_height: 60, unit: 'ft' },
      armory: { min_width: 15, max_width: 40, min_height: 15, max_height: 40, unit: 'ft' },
      treasury: { min_width: 15, max_width: 30, min_height: 15, max_height: 30, unit: 'ft' },
      dungeon: { min_width: 10, max_width: 40, min_height: 10, max_height: 40, unit: 'ft' },
      bedroom: { min_width: 15, max_width: 40, min_height: 15, max_height: 40, unit: 'ft' },
      chapel: { min_width: 20, max_width: 50, min_height: 25, max_height: 60, unit: 'ft' },
      kitchen: { min_width: 20, max_width: 50, min_height: 20, max_height: 50, unit: 'ft' },
      hallway: { min_width: 8, max_width: 20, min_height: 20, max_height: 200, unit: 'ft' },
      tower_room: { min_width: 15, max_width: 30, min_height: 15, max_height: 30, unit: 'ft' },
    },

    door_constraints: {
      min_width: 3,
      max_width: 10,
      position_rules: { min_from_corner: 3, snap_to_grid: 5 },
      door_types: [
        { name: 'iron_door', width: 4, description: 'Heavy iron-reinforced door' },
        { name: 'double_iron', width: 8, description: 'Double iron doors for halls' },
        { name: 'portcullis', width: 10, description: 'Gate with portcullis' },
      ],
    },

    adjacency_rules: [
      {
        room_type_a: 'barracks',
        room_type_b: 'armory',
        relationship: 'should_be_adjacent',
        reason: 'Quick access to weapons during defense',
      },
      {
        room_type_a: 'treasury',
        room_type_b: 'throne_room',
        relationship: 'should_be_adjacent',
        reason: 'Lord controls treasury access',
      },
      {
        room_type_a: 'kitchen',
        room_type_b: 'great_hall',
        relationship: 'should_be_adjacent',
        reason: 'Food service efficiency',
      },
      {
        room_type_a: 'dungeon',
        room_type_b: 'throne_room',
        relationship: 'must_not_be_adjacent',
        reason: 'Security and status separation',
      },
      {
        room_type_a: 'dungeon',
        room_type_b: 'bedroom',
        relationship: 'must_not_be_adjacent',
        reason: 'Prisoners kept far from living quarters',
      },
    ],

    structural_rules: [
      {
        rule_type: 'vertical_access',
        description: 'Towers and multi-floor sections require spiral staircases',
        affected_room_types: ['tower_room', 'stairwell'],
        constraint: 'Include spiral staircases in towers; main areas use broad stone stairs',
      },
      {
        rule_type: 'natural_light',
        description: 'Defensive arrow slits and small windows in outer walls',
        affected_room_types: ['great_hall', 'bedroom', 'chapel'],
        constraint: 'Outer walls have narrow arrow slits; inner rooms have larger windows',
      },
    ],

    require_vertical_access: true,
    min_hallway_width: 8,
  },

  room_types: [
    {
      type: 'great_hall',
      typical_names: ['Great Hall', 'Main Hall', 'Feast Hall', 'Grand Hall'],
      purpose: 'Central gathering space for dining, ceremonies, and audiences',
      features: ['long tables', 'throne or high seat', 'hearth', 'tapestries', 'minstrel gallery'],
      adjacency_preferences: {
        prefer_near: ['kitchen', 'throne_room', 'courtyard'],
        avoid_near: ['dungeon', 'stable', 'latrine'],
      },
    },
    {
      type: 'throne_room',
      typical_names: ['Throne Room', 'Audience Chamber', 'Lords Chamber'],
      purpose: 'Formal space for the lord to receive petitions and conduct official business',
      features: ['throne', 'dais', 'guards', 'banners', 'weapon displays'],
      adjacency_preferences: {
        prefer_near: ['great_hall', 'treasury', 'private_chambers'],
        avoid_near: ['dungeon', 'kitchen', 'barracks'],
      },
    },
    {
      type: 'barracks',
      typical_names: ['Barracks', 'Guard Quarters', 'Soldier Quarters', 'Garrison'],
      purpose: 'Housing and rest area for castle guards and soldiers',
      features: ['bunk beds', 'weapon racks', 'armor stands', 'footlockers', 'training equipment'],
      adjacency_preferences: {
        prefer_near: ['armory', 'training_yard', 'gatehouse'],
        avoid_near: ['bedroom', 'chapel', 'treasury'],
      },
    },
    {
      type: 'armory',
      typical_names: ['Armory', 'Arsenal', 'Weapons Room', 'Arms Storage'],
      purpose: 'Storage and maintenance of weapons and armor',
      features: ['weapon racks', 'armor stands', 'grinding wheels', 'repair benches', 'shields'],
      adjacency_preferences: {
        prefer_near: ['barracks', 'training_yard', 'smithy'],
        avoid_near: ['kitchen', 'bedroom', 'chapel'],
      },
    },
    {
      type: 'bedroom',
      typical_names: ['Bedchamber', 'Lords Chamber', 'Guest Room', 'Noble Quarters'],
      purpose: 'Private sleeping quarters for nobles and important guests',
      features: ['canopy bed', 'wardrobe', 'fireplace', 'sitting area', 'privacy screen'],
      adjacency_preferences: {
        prefer_near: ['privy', 'dressing_room', 'chapel'],
        avoid_near: ['barracks', 'dungeon', 'kitchen'],
      },
    },
    {
      type: 'kitchen',
      typical_names: ['Kitchen', 'Cookhouse', 'Scullery'],
      purpose: 'Food preparation for castle inhabitants',
      features: ['hearths', 'ovens', 'preparation tables', 'storage', 'water access'],
      adjacency_preferences: {
        prefer_near: ['great_hall', 'pantry', 'well'],
        avoid_near: ['bedroom', 'chapel', 'treasury'],
      },
    },
    {
      type: 'chapel',
      typical_names: ['Chapel', 'Prayer Room', 'Sanctuary', 'Temple'],
      purpose: 'Sacred space for worship and religious ceremonies',
      features: ['altar', 'pews or benches', 'religious icons', 'candles', 'stained glass'],
      adjacency_preferences: {
        prefer_near: ['bedroom', 'courtyard'],
        avoid_near: ['dungeon', 'barracks', 'kitchen'],
      },
    },
    {
      type: 'dungeon',
      typical_names: ['Dungeon', 'Prison', 'Cells', 'Oubliette'],
      purpose: 'Secure holding for prisoners',
      features: ['cells', 'shackles', 'iron bars', 'torture devices', 'guard post'],
      adjacency_preferences: {
        prefer_near: ['guard_post'],
        avoid_near: ['throne_room', 'bedroom', 'great_hall', 'chapel'],
      },
    },
  ],

  layout_philosophy:
    'Medieval castles prioritize defense, hierarchy, and control. Defensive structures (walls, towers, gatehouse) form the outer shell. Public/ceremonial spaces (great hall, throne room) occupy prominent central locations. Private quarters for nobility are elevated and protected. Service areas (kitchen, storage) are functional and separate. Military spaces (barracks, armory) cluster near defenses. Lower status areas (dungeons, storage) are relegated to basements or remote corners.',

  example_structures: [
    'Windsor Castle',
    'Tower of London',
    'Château de Chambord',
    'Edinburgh Castle',
    'Warwick Castle',
  ],
};

// ====================
// TEMPLATE 2: COZY TAVERN
// ====================

const COZY_TAVERN_TEMPLATE: LocationTemplate = {
  id: 'cozy_tavern',
  name: 'Cozy Tavern',
  description: 'Welcoming establishment offering food, drink, and lodging with warm atmosphere',
  location_types: ['tavern', 'inn', 'pub', 'alehouse'],

  architectural_style: {
    materials: {
      primary: ['oak timber', 'pine wood', 'brick'],
      secondary: ['plaster', 'thatch or shingles', 'iron fittings'],
      floors: ['worn wooden planks', 'stone flags (ground floor)', 'rugs'],
      walls: ['wooden beams', 'wattle and daub', 'plastered walls', 'wood paneling'],
    },
    color_palette: {
      floors: ['#8B4513', '#A0522D', '#654321'],
      walls: ['#F5DEB3', '#DEB887', '#D2691E'],
      accent: ['#8B0000', '#FFD700', '#228B22'],
    },
    door_style: 'wooden',
    lighting: 'candles',
    decorative_elements: [
      'mounted animal heads',
      'local memorabilia',
      'framed paintings',
      'flower boxes',
      'carved wooden signs',
    ],
  },

  constraints: {
    name: 'Cozy Tavern Constraints',
    description: 'Architectural rules for welcoming taverns and inns',

    room_size_constraints: {
      default: { min_width: 10, max_width: 50, min_height: 10, max_height: 50, unit: 'ft' },
      common_room: { min_width: 25, max_width: 60, min_height: 30, max_height: 70, unit: 'ft' },
      bar_area: { min_width: 15, max_width: 40, min_height: 10, max_height: 30, unit: 'ft' },
      kitchen: { min_width: 15, max_width: 35, min_height: 15, max_height: 35, unit: 'ft' },
      guest_room: { min_width: 10, max_width: 20, min_height: 10, max_height: 20, unit: 'ft' },
      storage: { min_width: 10, max_width: 25, min_height: 10, max_height: 25, unit: 'ft' },
      cellar: { min_width: 15, max_width: 40, min_height: 15, max_height: 40, unit: 'ft' },
      private_quarters: { min_width: 12, max_width: 25, min_height: 12, max_height: 25, unit: 'ft' },
      hallway: { min_width: 5, max_width: 10, min_height: 10, max_height: 100, unit: 'ft' },
    },

    door_constraints: {
      min_width: 3,
      max_width: 8,
      position_rules: { min_from_corner: 2, snap_to_grid: 5 },
      door_types: [
        { name: 'wooden_door', width: 3, description: 'Standard wooden door' },
        { name: 'double_door', width: 6, description: 'Double doors for main entrance' },
      ],
    },

    adjacency_rules: [
      {
        room_type_a: 'kitchen',
        room_type_b: 'common_room',
        relationship: 'must_be_adjacent',
        reason: 'Efficient food and drink service',
      },
      {
        room_type_a: 'bar_area',
        room_type_b: 'common_room',
        relationship: 'must_be_adjacent',
        reason: 'Bar serves the common room',
      },
      {
        room_type_a: 'cellar',
        room_type_b: 'kitchen',
        relationship: 'should_be_adjacent',
        reason: 'Easy access to stored provisions',
      },
      {
        room_type_a: 'guest_room',
        room_type_b: 'common_room',
        relationship: 'must_not_be_adjacent',
        reason: 'Reduce noise for sleeping guests',
      },
      {
        room_type_a: 'guest_room',
        room_type_b: 'kitchen',
        relationship: 'must_not_be_adjacent',
        reason: 'Kitchen noise and smells disturb guests',
      },
    ],

    structural_rules: [
      {
        rule_type: 'vertical_access',
        description: 'Stairs to guest rooms and cellars',
        affected_room_types: ['stairwell', 'stairs'],
        constraint: 'Include wooden stairs to upper guest floors and stone steps to cellar',
      },
      {
        rule_type: 'natural_light',
        description: 'Windows for common areas, privacy for guest rooms',
        affected_room_types: ['common_room', 'guest_room'],
        constraint: 'Common room has large windows; guest rooms have smaller windows with shutters',
      },
    ],

    require_vertical_access: false,
    min_hallway_width: 5,
  },

  room_types: [
    {
      type: 'common_room',
      typical_names: ['Common Room', 'Tap Room', 'Main Hall', 'Public Room'],
      purpose: 'Central gathering space where patrons eat, drink, and socialize',
      features: ['tables and chairs', 'fireplace', 'chandelier', 'bar counter', 'dartboard or games'],
      adjacency_preferences: {
        prefer_near: ['bar_area', 'kitchen', 'entrance'],
        avoid_near: ['guest_room', 'private_quarters'],
      },
    },
    {
      type: 'bar_area',
      typical_names: ['Bar', 'Counter', 'Serving Area', 'Tap'],
      purpose: 'Service area where drinks are poured and served',
      features: ['long bar counter', 'taps and kegs', 'shelves of bottles', 'mugs hanging', 'till'],
      adjacency_preferences: {
        prefer_near: ['common_room', 'cellar', 'kitchen'],
        avoid_near: ['guest_room'],
      },
    },
    {
      type: 'kitchen',
      typical_names: ['Kitchen', 'Cookhouse', 'Scullery'],
      purpose: 'Food preparation area',
      features: ['hearth', 'ovens', 'preparation tables', 'shelving', 'water basin'],
      adjacency_preferences: {
        prefer_near: ['common_room', 'cellar', 'storage'],
        avoid_near: ['guest_room', 'private_quarters'],
      },
    },
    {
      type: 'guest_room',
      typical_names: ['Guest Room', 'Sleeping Chamber', 'Bedchamber', 'Rented Room'],
      purpose: 'Private sleeping quarters for paying guests',
      features: ['bed', 'small table', 'chair', 'washbasin', 'chest or wardrobe'],
      adjacency_preferences: {
        prefer_near: ['hallway', 'other guest rooms'],
        avoid_near: ['common_room', 'kitchen', 'storage'],
      },
    },
    {
      type: 'cellar',
      typical_names: ['Cellar', 'Wine Cellar', 'Beer Cellar', 'Storage Vault'],
      purpose: 'Cool storage for barrels, kegs, and provisions',
      features: ['barrels and kegs', 'wine racks', 'shelving', 'cool temperature', 'stone walls'],
      adjacency_preferences: {
        prefer_near: ['kitchen', 'bar_area'],
        avoid_near: ['guest_room'],
      },
    },
    {
      type: 'private_quarters',
      typical_names: ['Innkeepers Quarters', 'Private Chambers', 'Owners Room'],
      purpose: 'Living space for tavern owner and family',
      features: ['bed', 'sitting area', 'personal belongings', 'fireplace', 'privacy'],
      adjacency_preferences: {
        prefer_near: ['storage', 'office'],
        avoid_near: ['common_room', 'guest_room'],
      },
    },
    {
      type: 'storage',
      typical_names: ['Storage', 'Pantry', 'Stockroom', 'Supply Room'],
      purpose: 'General storage for linens, supplies, and non-perishables',
      features: ['shelving', 'crates and barrels', 'sacks', 'cleaning supplies', 'spare furniture'],
      adjacency_preferences: {
        prefer_near: ['kitchen', 'private_quarters'],
        avoid_near: ['guest_room', 'common_room'],
      },
    },
  ],

  layout_philosophy:
    'Taverns balance public hospitality with private comfort. The common room is the heart and soul, large and welcoming with easy access from the entrance. The bar and kitchen cluster nearby for efficient service. Guest rooms are separated from noise—often on upper floors—with hallways providing privacy. The cellar lies below, keeping beverages cool. Owner quarters are tucked away with private access. The layout flows naturally: guests enter to warmth and cheer, ascend to quiet rest, while service areas work behind the scenes.',

  example_structures: [
    'The Prancing Pony (Lord of the Rings)',
    'The Leaky Cauldron (Harry Potter)',
    'Medieval coaching inns',
  ],
};

// ====================
// TEMPLATE 3: MODERN DUNGEON
// ====================

const MODERN_DUNGEON_TEMPLATE: LocationTemplate = {
  id: 'modern_dungeon',
  name: 'Modern Dungeon',
  description: 'Dangerous underground complex filled with monsters, traps, and treasure',
  location_types: ['dungeon', 'crypt', 'underground_complex', 'lair'],

  architectural_style: {
    materials: {
      primary: ['dark stone', 'granite', 'basalt'],
      secondary: ['iron bars', 'rusty chains', 'ancient brick'],
      floors: ['rough stone', 'dirt and rubble', 'cracked flagstones'],
      walls: ['damp stone walls', 'moss-covered bricks', 'carved rock'],
    },
    color_palette: {
      floors: ['#2F4F4F', '#3C3C3C', '#1C1C1C'],
      walls: ['#4A4A4A', '#5F5F5F', '#696969'],
      accent: ['#8B0000', '#006400', '#4B0082'],
    },
    door_style: 'iron',
    lighting: 'torches',
    decorative_elements: [
      'bones and skulls',
      'cobwebs',
      'ancient carvings',
      'mysterious symbols',
      'ominous statues',
    ],
  },

  constraints: {
    name: 'Modern Dungeon Constraints',
    description: 'Architectural rules for dangerous underground dungeons',

    room_size_constraints: {
      default: { min_width: 15, max_width: 60, min_height: 15, max_height: 60, unit: 'ft' },
      chamber: { min_width: 20, max_width: 70, min_height: 20, max_height: 70, unit: 'ft' },
      boss_room: { min_width: 40, max_width: 100, min_height: 40, max_height: 100, unit: 'ft' },
      corridor: { min_width: 5, max_width: 15, min_height: 20, max_height: 150, unit: 'ft' },
      cell: { min_width: 8, max_width: 15, min_height: 8, max_height: 15, unit: 'ft' },
      trap_room: { min_width: 15, max_width: 40, min_height: 15, max_height: 40, unit: 'ft' },
      treasure_vault: { min_width: 15, max_width: 50, min_height: 15, max_height: 50, unit: 'ft' },
      monster_lair: { min_width: 20, max_width: 60, min_height: 20, max_height: 60, unit: 'ft' },
      puzzle_room: { min_width: 20, max_width: 50, min_height: 20, max_height: 50, unit: 'ft' },
    },

    door_constraints: {
      min_width: 3,
      max_width: 10,
      position_rules: { min_from_corner: 2, snap_to_grid: 5 },
      door_types: [
        { name: 'iron_door', width: 4, description: 'Reinforced iron door' },
        { name: 'secret_door', width: 5, description: 'Hidden passage' },
        { name: 'portcullis', width: 8, description: 'Heavy gate' },
      ],
    },

    adjacency_rules: [
      {
        room_type_a: 'treasure_vault',
        room_type_b: 'boss_room',
        relationship: 'should_be_adjacent',
        reason: 'Boss guards the treasure',
      },
      {
        room_type_a: 'trap_room',
        room_type_b: 'treasure_vault',
        relationship: 'should_be_adjacent',
        reason: 'Traps protect valuable areas',
      },
      {
        room_type_a: 'monster_lair',
        room_type_b: 'corridor',
        relationship: 'should_be_adjacent',
        reason: 'Monsters patrol corridors',
      },
    ],

    structural_rules: [
      {
        rule_type: 'vertical_access',
        description: 'Dungeon levels connected by stairs, shafts, or teleportation',
        affected_room_types: ['stairwell', 'shaft'],
        constraint: 'Include descending passages to deeper levels; vary between stairs, chutes, and pits',
      },
    ],

    require_vertical_access: false,
    min_hallway_width: 5,
  },

  room_types: [
    {
      type: 'chamber',
      typical_names: ['Dark Chamber', 'Tomb Chamber', 'Ancient Hall', 'Crypt'],
      purpose: 'Standard dungeon room with encounters or exploration',
      features: ['pillars', 'ancient furniture', 'debris', 'shadows', 'echoing acoustics'],
      adjacency_preferences: {
        prefer_near: ['corridor', 'other chambers'],
        avoid_near: [],
      },
    },
    {
      type: 'corridor',
      typical_names: ['Corridor', 'Passage', 'Tunnel', 'Winding Hall'],
      purpose: 'Connecting passage between rooms',
      features: ['narrow walls', 'low ceilings', 'trap triggers', 'patrol routes', 'darkness'],
      adjacency_preferences: {
        prefer_near: ['chamber', 'trap_room'],
        avoid_near: [],
      },
    },
    {
      type: 'monster_lair',
      typical_names: ['Monster Den', 'Beast Lair', 'Nest', 'Spawning Pool'],
      purpose: 'Home for dungeon creatures',
      features: ['bones and refuse', 'nests or bedding', 'food stores', 'territorial markings'],
      adjacency_preferences: {
        prefer_near: ['corridor', 'chamber'],
        avoid_near: ['treasure_vault'],
      },
    },
    {
      type: 'trap_room',
      typical_names: ['Trapped Chamber', 'Gauntlet', 'Test Room', 'Perilous Hall'],
      purpose: 'Room filled with deadly traps and hazards',
      features: ['pressure plates', 'dart launchers', 'pit traps', 'poison gas vents', 'blade traps'],
      adjacency_preferences: {
        prefer_near: ['treasure_vault', 'boss_room', 'corridor'],
        avoid_near: [],
      },
    },
    {
      type: 'treasure_vault',
      typical_names: ['Treasure Room', 'Vault', 'Hoard', 'Treasury'],
      purpose: 'Storage of valuable loot and magical items',
      features: ['chests and coffers', 'piles of coins', 'weapon racks', 'trapped locks', 'magical glyphs'],
      adjacency_preferences: {
        prefer_near: ['boss_room', 'trap_room'],
        avoid_near: ['corridor', 'entrance'],
      },
    },
    {
      type: 'boss_room',
      typical_names: ['Throne Room', 'Inner Sanctum', 'Final Chamber', 'Boss Arena'],
      purpose: 'Climactic encounter with dungeon master or powerful creature',
      features: ['elevated platform', 'imposing architecture', 'ample space', 'dramatic lighting', 'throne or altar'],
      adjacency_preferences: {
        prefer_near: ['treasure_vault', 'trap_room'],
        avoid_near: ['entrance', 'corridor'],
      },
    },
    {
      type: 'puzzle_room',
      typical_names: ['Puzzle Chamber', 'Riddle Room', 'Trial of Wits', 'Enigma Hall'],
      purpose: 'Room requiring solving puzzles to proceed',
      features: ['levers and switches', 'moving walls', 'arcane symbols', 'statues', 'magical barriers'],
      adjacency_preferences: {
        prefer_near: ['corridor', 'treasure_vault'],
        avoid_near: [],
      },
    },
    {
      type: 'cell',
      typical_names: ['Prison Cell', 'Holding Cell', 'Cage', 'Dungeon Cell'],
      purpose: 'Imprisonment of captives or monsters',
      features: ['iron bars', 'shackles', 'sparse furnishings', 'locked doors'],
      adjacency_preferences: {
        prefer_near: ['corridor', 'guard_post'],
        avoid_near: ['treasure_vault', 'boss_room'],
      },
    },
  ],

  layout_philosophy:
    'Dungeons are designed to challenge and disorient adventurers. Winding corridors create confusion and limit sight lines. Rooms vary in size and purpose—some for combat, others for puzzles or traps. Valuable areas (treasure vault, boss room) are deep within, protected by layers of danger. Dead ends, loops, and multiple paths add complexity. Monster lairs are strategically placed near choke points. Secret passages and hidden rooms reward exploration. The layout reflects the dungeon history and current inhabitants.',

  example_structures: [
    'Classic D&D dungeons',
    'Zelda dungeons',
    'Dark Souls catacombs',
    'Ancient tombs and crypts',
  ],
};

// ====================
// TEMPLATE 4: FANTASY VILLAGE
// ====================

const FANTASY_VILLAGE_TEMPLATE: LocationTemplate = {
  id: 'fantasy_village',
  name: 'Fantasy Village',
  description: 'Small rural settlement with interconnected buildings and community spaces',
  location_types: ['village', 'hamlet', 'settlement', 'community'],

  architectural_style: {
    materials: {
      primary: ['timber framing', 'wattle and daub', 'thatch'],
      secondary: ['fieldstone', 'clay brick', 'shingles'],
      floors: ['packed earth', 'wooden planks', 'stone flags'],
      walls: ['plaster and timber', 'whitewashed walls', 'exposed beams'],
    },
    color_palette: {
      floors: ['#8B7355', '#A0826D', '#6B5C4D'],
      walls: ['#FFFAF0', '#F5F5DC', '#FAEBD7'],
      accent: ['#8B4513', '#228B22', '#4682B4'],
    },
    door_style: 'wooden',
    lighting: 'natural',
    decorative_elements: [
      'flower boxes',
      'thatched roofs',
      'wooden signs',
      'gardens',
      'cobblestone paths',
    ],
  },

  constraints: {
    name: 'Fantasy Village Constraints',
    description: 'Architectural rules for rustic village buildings',

    room_size_constraints: {
      default: { min_width: 12, max_width: 40, min_height: 12, max_height: 40, unit: 'ft' },
      cottage: { min_width: 15, max_width: 30, min_height: 15, max_height: 30, unit: 'ft' },
      shop: { min_width: 15, max_width: 35, min_height: 15, max_height: 35, unit: 'ft' },
      village_hall: { min_width: 25, max_width: 60, min_height: 30, max_height: 70, unit: 'ft' },
      smithy: { min_width: 20, max_width: 40, min_height: 20, max_height: 40, unit: 'ft' },
      barn: { min_width: 25, max_width: 60, min_height: 30, max_height: 80, unit: 'ft' },
      market_stall: { min_width: 10, max_width: 20, min_height: 10, max_height: 20, unit: 'ft' },
      temple: { min_width: 20, max_width: 50, min_height: 25, max_height: 60, unit: 'ft' },
      home: { min_width: 15, max_width: 35, min_height: 15, max_height: 35, unit: 'ft' },
    },

    door_constraints: {
      min_width: 3,
      max_width: 8,
      position_rules: { min_from_corner: 2, snap_to_grid: 5 },
      door_types: [
        { name: 'wooden_door', width: 3, description: 'Simple wooden door' },
        { name: 'dutch_door', width: 3, description: 'Split door (top/bottom)' },
        { name: 'barn_door', width: 8, description: 'Wide sliding barn door' },
      ],
    },

    adjacency_rules: [
      {
        room_type_a: 'smithy',
        room_type_b: 'home',
        relationship: 'must_not_be_adjacent',
        reason: 'Noise and fire hazard',
      },
      {
        room_type_a: 'village_hall',
        room_type_b: 'market_stall',
        relationship: 'should_be_adjacent',
        reason: 'Community gathering near commerce',
      },
      {
        room_type_a: 'temple',
        room_type_b: 'village_hall',
        relationship: 'should_be_adjacent',
        reason: 'Religious and civic center',
      },
    ],

    structural_rules: [
      {
        rule_type: 'natural_light',
        description: 'Generous windows for homes and shops',
        affected_room_types: ['cottage', 'shop', 'home'],
        constraint: 'Include large windows with shutters; maximize natural daylight',
      },
    ],

    require_vertical_access: false,
    min_hallway_width: 5,
  },

  room_types: [
    {
      type: 'cottage',
      typical_names: ['Cottage', 'Homestead', 'Dwelling', 'Residence'],
      purpose: 'Simple living quarters for villagers',
      features: ['hearth', 'sleeping area', 'table and chairs', 'storage', 'personal items'],
      adjacency_preferences: {
        prefer_near: ['garden', 'other homes', 'well'],
        avoid_near: ['smithy', 'barn'],
      },
    },
    {
      type: 'shop',
      typical_names: ['General Store', 'Shop', 'Merchant Store', 'Traders'],
      purpose: 'Commercial space selling goods',
      features: ['counter', 'shelving', 'display tables', 'storage room', 'till'],
      adjacency_preferences: {
        prefer_near: ['village_hall', 'market_stall', 'street'],
        avoid_near: [],
      },
    },
    {
      type: 'smithy',
      typical_names: ['Smithy', 'Forge', 'Blacksmith Shop'],
      purpose: 'Metalworking and tool repair',
      features: ['forge', 'anvil', 'bellows', 'tool racks', 'quenching barrel'],
      adjacency_preferences: {
        prefer_near: ['street', 'workshop'],
        avoid_near: ['home', 'temple', 'shop'],
      },
    },
    {
      type: 'village_hall',
      typical_names: ['Village Hall', 'Town Hall', 'Meeting House', 'Commons'],
      purpose: 'Community gathering space for meetings and events',
      features: ['long tables', 'benches', 'notice board', 'hearth', 'storage for supplies'],
      adjacency_preferences: {
        prefer_near: ['temple', 'market_stall', 'central square'],
        avoid_near: ['barn', 'smithy'],
      },
    },
    {
      type: 'temple',
      typical_names: ['Temple', 'Chapel', 'Shrine', 'Sanctuary'],
      purpose: 'Place of worship',
      features: ['altar', 'benches or pews', 'religious icons', 'offering box', 'candles'],
      adjacency_preferences: {
        prefer_near: ['village_hall', 'graveyard'],
        avoid_near: ['smithy', 'barn'],
      },
    },
    {
      type: 'barn',
      typical_names: ['Barn', 'Stable', 'Animal Shelter', 'Livestock Pen'],
      purpose: 'Housing for animals and storage for feed',
      features: ['stalls', 'hay loft', 'feed troughs', 'tool storage'],
      adjacency_preferences: {
        prefer_near: ['field', 'pasture'],
        avoid_near: ['home', 'temple', 'shop'],
      },
    },
    {
      type: 'market_stall',
      typical_names: ['Market Stall', 'Vendor Stand', 'Booth', 'Market Stand'],
      purpose: 'Temporary or permanent outdoor vendor space',
      features: ['canopy', 'display table', 'goods for sale', 'small storage'],
      adjacency_preferences: {
        prefer_near: ['village_hall', 'other market stalls', 'street'],
        avoid_near: [],
      },
    },
  ],

  layout_philosophy:
    'Fantasy villages grow organically around central features like a square, well, or crossroads. The village hall and temple form the civic/religious heart. Homes cluster in residential areas with gardens and shared spaces. Commercial buildings (shops, smithy) line the main street for easy access. Agricultural structures (barns, mills) sit on the periphery near fields. Paths wind naturally between buildings. The layout reflects community bonds—neighbors know each other, children play together, and gathering spaces are accessible to all.',

  example_structures: [
    'Medieval European villages',
    'Hobbiton (Lord of the Rings)',
    'Rural fantasy settlements',
  ],
};

// ====================
// TEMPLATE 5: MEDIEVAL TOWN
// ====================

const MEDIEVAL_TOWN_TEMPLATE: LocationTemplate = {
  id: 'medieval_town',
  name: 'Medieval Town',
  description: 'Larger urban settlement with mixed residential and commercial districts',
  location_types: ['town', 'borough', 'market_town', 'city'],

  architectural_style: {
    materials: {
      primary: ['timber framing', 'brick', 'stone'],
      secondary: ['plaster', 'tile roofs', 'slate'],
      floors: ['cobblestone', 'stone paving', 'wooden planks (upper floors)'],
      walls: ['timber and plaster', 'brick facades', 'stone (important buildings)'],
    },
    color_palette: {
      floors: ['#708090', '#696969', '#778899'],
      walls: ['#F5DEB3', '#DEB887', '#D2B48C'],
      accent: ['#8B4513', '#B8860B', '#2F4F4F'],
    },
    door_style: 'wooden',
    lighting: 'oil_lamps',
    decorative_elements: [
      'guild signs',
      'hanging shop signs',
      'window boxes',
      'decorative shutters',
      'heraldic symbols',
    ],
  },

  constraints: {
    name: 'Medieval Town Constraints',
    description: 'Architectural rules for medieval urban settlements',

    room_size_constraints: {
      default: { min_width: 15, max_width: 50, min_height: 15, max_height: 50, unit: 'ft' },
      guildhall: { min_width: 30, max_width: 70, min_height: 35, max_height: 80, unit: 'ft' },
      shop: { min_width: 15, max_width: 40, min_height: 15, max_height: 40, unit: 'ft' },
      workshop: { min_width: 20, max_width: 45, min_height: 20, max_height: 45, unit: 'ft' },
      townhouse: { min_width: 20, max_width: 50, min_height: 20, max_height: 50, unit: 'ft' },
      market_square: { min_width: 40, max_width: 100, min_height: 40, max_height: 100, unit: 'ft' },
      town_hall: { min_width: 35, max_width: 80, min_height: 40, max_height: 90, unit: 'ft' },
      warehouse: { min_width: 25, max_width: 60, min_height: 30, max_height: 70, unit: 'ft' },
      street: { min_width: 10, max_width: 30, min_height: 50, max_height: 300, unit: 'ft' },
      alley: { min_width: 5, max_width: 12, min_height: 20, max_height: 150, unit: 'ft' },
    },

    door_constraints: {
      min_width: 3,
      max_width: 10,
      position_rules: { min_from_corner: 2, snap_to_grid: 5 },
      door_types: [
        { name: 'wooden_door', width: 3, description: 'Standard wooden door' },
        { name: 'shop_door', width: 4, description: 'Wide shop entrance' },
        { name: 'double_door', width: 8, description: 'Double doors for guildhalls' },
      ],
    },

    adjacency_rules: [
      {
        room_type_a: 'shop',
        room_type_b: 'street',
        relationship: 'must_be_adjacent',
        reason: 'Shops need street access for customers',
      },
      {
        room_type_a: 'market_square',
        room_type_b: 'town_hall',
        relationship: 'should_be_adjacent',
        reason: 'Civic center near commerce',
      },
      {
        room_type_a: 'warehouse',
        room_type_b: 'street',
        relationship: 'should_be_adjacent',
        reason: 'Loading and unloading access',
      },
      {
        room_type_a: 'townhouse',
        room_type_b: 'market_square',
        relationship: 'must_not_be_adjacent',
        reason: 'Residential areas separate from busy commerce',
      },
    ],

    structural_rules: [
      {
        rule_type: 'vertical_access',
        description: 'Multi-story buildings with internal staircases',
        affected_room_types: ['townhouse', 'guildhall', 'shop'],
        constraint: 'Include wooden staircases for upper floors; shops have living quarters above',
      },
    ],

    require_vertical_access: false,
    min_hallway_width: 6,
  },

  room_types: [
    {
      type: 'market_square',
      typical_names: ['Market Square', 'Town Square', 'Central Plaza', 'Market Place'],
      purpose: 'Open public space for commerce and gatherings',
      features: ['market stalls', 'fountain or well', 'cobblestones', 'open space', 'vendor carts'],
      adjacency_preferences: {
        prefer_near: ['town_hall', 'shop', 'street'],
        avoid_near: ['townhouse', 'warehouse'],
      },
    },
    {
      type: 'shop',
      typical_names: ['Shop', 'Store', 'Merchant Shop', 'Boutique'],
      purpose: 'Retail space with living quarters above',
      features: ['shop front', 'display windows', 'counter', 'storage', 'upstairs residence'],
      adjacency_preferences: {
        prefer_near: ['street', 'market_square', 'other shops'],
        avoid_near: ['warehouse'],
      },
    },
    {
      type: 'guildhall',
      typical_names: ['Guildhall', 'Guild House', 'Craftsmen Hall', 'Trade Hall'],
      purpose: 'Meeting place and headquarters for trade guilds',
      features: ['meeting hall', 'offices', 'records room', 'guild emblems', 'reception area'],
      adjacency_preferences: {
        prefer_near: ['market_square', 'workshop', 'street'],
        avoid_near: ['alley'],
      },
    },
    {
      type: 'workshop',
      typical_names: ['Workshop', 'Craftsman Shop', 'Atelier', 'Artisan Studio'],
      purpose: 'Production space for crafts and goods',
      features: ['workbenches', 'tools', 'materials storage', 'finished goods display', 'apprentice area'],
      adjacency_preferences: {
        prefer_near: ['guildhall', 'warehouse', 'alley'],
        avoid_near: ['townhouse'],
      },
    },
    {
      type: 'townhouse',
      typical_names: ['Townhouse', 'Residence', 'Burgher House', 'Dwelling'],
      purpose: 'Multi-story urban home for merchants or wealthy citizens',
      features: ['parlor', 'bedrooms', 'kitchen', 'dining room', 'servants quarters'],
      adjacency_preferences: {
        prefer_near: ['other townhouses', 'street'],
        avoid_near: ['market_square', 'workshop', 'warehouse'],
      },
    },
    {
      type: 'town_hall',
      typical_names: ['Town Hall', 'Council Hall', 'Civic Center', 'Municipal Building'],
      purpose: 'Seat of town government and administration',
      features: ['council chamber', 'mayors office', 'records hall', 'public notice board', 'guards'],
      adjacency_preferences: {
        prefer_near: ['market_square', 'street'],
        avoid_near: ['warehouse', 'alley'],
      },
    },
    {
      type: 'warehouse',
      typical_names: ['Warehouse', 'Storage', 'Goods Depot', 'Storehouse'],
      purpose: 'Large-scale storage for merchant goods',
      features: ['high ceilings', 'loading area', 'shelving and racks', 'office', 'security'],
      adjacency_preferences: {
        prefer_near: ['street', 'workshop', 'dock or gate'],
        avoid_near: ['townhouse', 'market_square'],
      },
    },
    {
      type: 'street',
      typical_names: ['High Street', 'Main Street', 'Market Street', 'Thoroughfare'],
      purpose: 'Primary passage for foot and cart traffic',
      features: ['cobblestones', 'wide enough for carts', 'shops lining sides', 'street vendors'],
      adjacency_preferences: {
        prefer_near: ['shop', 'market_square', 'town_hall'],
        avoid_near: [],
      },
    },
  ],

  layout_philosophy:
    'Medieval towns organize around function and status. The market square and town hall form the civic heart, surrounded by shops and guildhalls. Main streets radiate outward, lined with commercial properties. Residential areas cluster by wealth—wealthy townhouses near the center, modest homes on the periphery. Workshops and warehouses group by trade district. Alleys and secondary streets create a dense network. City walls (if present) define boundaries with gates controlling access. The layout reflects social hierarchy, economic activity, and organic medieval growth patterns.',

  example_structures: [
    'Rothenburg ob der Tauber',
    'Medieval York',
    'Carcassonne',
    'Medieval market towns',
  ],
};

// ====================
// TEMPLATE REGISTRY
// ====================

export const LOCATION_TEMPLATES: LocationTemplate[] = [
  MEDIEVAL_CASTLE_TEMPLATE,
  COZY_TAVERN_TEMPLATE,
  MODERN_DUNGEON_TEMPLATE,
  FANTASY_VILLAGE_TEMPLATE,
  MEDIEVAL_TOWN_TEMPLATE,
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string | undefined): LocationTemplate | null {
  if (!id) return null;
  return LOCATION_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Get templates filtered by location type
 */
export function getTemplatesForLocationType(locationType: string): LocationTemplate[] {
  const normalized = locationType.toLowerCase().trim();
  return LOCATION_TEMPLATES.filter((t) =>
    t.location_types.some((type) => type.toLowerCase().includes(normalized) || normalized.includes(type.toLowerCase()))
  );
}

/**
 * Get all template IDs and names for UI selection
 */
export function getTemplateOptions(): Array<{ id: string; name: string; description: string }> {
  return LOCATION_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
}
