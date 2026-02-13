/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export type DoorStyle = 'wooden' | 'stone' | 'metal' | 'archway' | 'secret' | 'opening';

export interface Door {
  wall: 'north' | 'south' | 'east' | 'west';
  position_on_wall_ft: number;
  width_ft: number;
  leads_to: string;
  style?: DoorStyle; // Type of door/opening
  door_type?: string; // Legacy property, use 'style' instead
  material?: string;
  state?: 'open' | 'closed' | 'locked' | 'barred';
  color?: string;
  is_reciprocal?: boolean; // True if this door was auto-created as a reciprocal (child door)
}

export interface SpaceFeature {
  name: string;
  position_ft: { x: number; y: number };
  size_ft?: { width: number; height: number };
}

export interface Space {
  index: number;
  name: string;
  code: string;
  level: number;
  size_ft: { width: number; height: number };
  position?: { x: number; y: number }; // Grid coordinates (in feet)
  position_locked?: boolean;
  wall_thickness_ft?: number;
  wall_material?: string;
  features?: SpaceFeature[];
  doors?: Door[];
  description?: string;
  purpose?: string;
  // Space type - room (default), stairs, corridor
  space_type?: 'room' | 'stairs' | 'corridor';
  // Stairs properties
  stair_type?: 'straight' | 'spiral';
  z_direction?: 'ascending' | 'descending';
  z_connects_to?: string; // Name of space on other floor
  // Shape - rectangle (default), circle, L-shape, polygon
  shape?: 'rectangle' | 'circle' | 'L-shape' | 'polygon';
  // For L-shape: which corner is cut out
  l_cutout_corner?: 'ne' | 'nw' | 'se' | 'sw';
  // For polygon: array of points relative to position (in feet)
  polygon_points?: Array<{ x: number; y: number }>;
}

export interface WallSettings {
  thickness_ft: number;
  material: string;
}

export interface ValidationError {
  id: string;
  roomId: string;
  type: 'overlap' | 'broken-connection' | 'out-of-bounds' | 'invalid-door';
  message: string;
  severity: 'error' | 'warning';
}

export interface Snapshot {
  id: string;
  timestamp: number;
  spaces: Space[];
  description: string; // e.g., "Added Southeast Ward", "Moved Guard Tower"
}

export type ReviewFrequency = 'per-room' | 'per-batch' | 'issues-only' | 'none';

export interface EditorState {
  // Core data
  spaces: Space[];

  globalWallSettings: WallSettings;

  // Selection & interaction
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  isDragging: boolean;
  isResizing: boolean;
  resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | null;

  // Review workflow
  reviewFrequency: ReviewFrequency;
  batchSize: number;
  pendingReview: Space[]; // Spaces awaiting user approval

  // Version history
  snapshots: Snapshot[];
  currentSnapshotIndex: number;

  // Validation
  validationErrors: ValidationError[];
  validationWarnings: ValidationError[];

  // Pending edits (debounced before validation)
  pendingEdits: Map<string, Partial<Space>>;

  // Layer visibility
  showGridLayer: boolean;
  showWireframeLayer: boolean;
  showDetailLayer: boolean;

  // Canvas state
  canvasBounds: { width: number; height: number }; // In feet
  gridSize: number; // Grid square size in feet (default: 5)
}

export type EditorAction =
  | { type: 'SET_SPACES'; payload: Space[] }
  | { type: 'ADD_SPACE'; payload: Space }
  | { type: 'UPDATE_SPACE'; payload: { id: string; updates: Partial<Space> } }
  | { type: 'DELETE_SPACE'; payload: string }
  | { type: 'MOVE_ROOM'; payload: { id: string; position: { x: number; y: number } } }
  | { type: 'RESIZE_ROOM'; payload: { id: string; size: { width: number; height: number } } }
  | { type: 'SET_GLOBAL_WALL_SETTINGS'; payload: WallSettings }
  | { type: 'RECALCULATE_LAYOUT' }
  | { type: 'SELECT_ROOM'; payload: string | null }
  | { type: 'HOVER_ROOM'; payload: string | null }
  | { type: 'START_DRAG'; payload: string }
  | { type: 'END_DRAG' }
  | { type: 'START_RESIZE'; payload: { roomId: string; handle: 'nw' | 'ne' | 'sw' | 'se' } }
  | { type: 'END_RESIZE' }
  | { type: 'ADD_DOOR'; payload: { roomId: string; door: Door; skipReciprocal?: boolean } }
  | { type: 'REMOVE_DOOR'; payload: { roomId: string; doorIndex: number; skipReciprocal?: boolean } }
  | { type: 'UPDATE_DOOR'; payload: { roomId: string; doorIndex: number; updates: Partial<Door> } }
  | { type: 'TOGGLE_POSITION_LOCK'; payload: string }
  | { type: 'SET_REVIEW_FREQUENCY'; payload: ReviewFrequency }
  | { type: 'SET_BATCH_SIZE'; payload: number }
  | { type: 'ADD_TO_PENDING_REVIEW'; payload: Space[] }
  | { type: 'APPROVE_PENDING'; payload: string[] }
  | { type: 'REJECT_PENDING'; payload: string[] }
  | { type: 'CREATE_SNAPSHOT'; payload: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESTORE_SNAPSHOT'; payload: number }
  | { type: 'SET_VALIDATION_ERRORS'; payload: ValidationError[] }
  | { type: 'SET_VALIDATION_WARNINGS'; payload: ValidationError[] }
  | { type: 'TOGGLE_GRID_LAYER' }
  | { type: 'TOGGLE_WIREFRAME_LAYER' }
  | { type: 'TOGGLE_DETAIL_LAYER' }
  | { type: 'SET_CANVAS_BOUNDS'; payload: { width: number; height: number } };
