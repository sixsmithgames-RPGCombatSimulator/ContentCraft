/**
 * Location Editor Context - State management for interactive location editing
 *
 * Provides centralized state and actions for:
 * - Room manipulation (move, resize, add, delete)
 * - Door management (add, remove, edit)
 * - Selection state
 * - Version history (undo/redo)
 * - Real-time validation
 * - Human-in-the-loop review workflow
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { createContext, useContext, useReducer, ReactNode, useEffect, useCallback, useRef } from 'react';
import type { Door, EditorAction, EditorState, Snapshot, Space, WallSettings } from './locationEditorTypes';
import {
  synchronizeReciprocalDoors,
  validateAllDoors,
  convertDoorValidationToErrors,
  getOppositeWall,
  calculateReciprocalDoorPosition,
  validateDoor
} from '../utils/doorSync';

// Types are imported from locationEditorTypes.ts to satisfy React Refresh

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: EditorState = {
  spaces: [],
  globalWallSettings: { thickness_ft: 10, material: 'stone' },
  selectedRoomId: null,
  hoveredRoomId: null,
  isDragging: false,
  isResizing: false,
  resizeHandle: null,
  reviewFrequency: 'per-room',
  batchSize: 3,
  pendingReview: [],
  snapshots: [],
  currentSnapshotIndex: -1,
  validationErrors: [],
  validationWarnings: [],
  pendingEdits: new Map(),
  showGridLayer: true,
  showWireframeLayer: true,
  showDetailLayer: true,
  canvasBounds: { width: 1000, height: 1000 }, // 1000ft x 1000ft default
  gridSize: 5, // 5ft grid squares
};

function getEffectiveWallThicknessFt(space: Space, globalWallSettings: WallSettings): number {
  if (typeof space.wall_thickness_ft === 'number' && Number.isFinite(space.wall_thickness_ft) && space.wall_thickness_ft > 0) {
    return space.wall_thickness_ft;
  }
  return globalWallSettings.thickness_ft;
}

// Note: getOppositeWall() and calculateReciprocalDoorPosition() are now imported from doorSync.ts

function shouldTreatAsPlaced(space: Space): space is Space & { position: { x: number; y: number } } {
  return !!space.position &&
    typeof space.position.x === 'number' &&
    Number.isFinite(space.position.x) &&
    typeof space.position.y === 'number' &&
    Number.isFinite(space.position.y);
}

function computeAutoLayout(
  spaces: Space[],
  gridSize: number,
  globalWallSettings: WallSettings
): Space[] {
  if (spaces.length === 0) return spaces;

  const snapToGrid = (value: number): number => Math.round(value / gridSize) * gridSize;
  const getRoomId = (space: Space): string => space.code || space.name;

  const byId = new Map<string, Space>();
  const byName = new Map<string, Space>();
  const byCode = new Map<string, Space>();
  spaces.forEach((s) => {
    byId.set(getRoomId(s), s);
    byName.set(s.name, s);
    if (s.code) byCode.set(s.code, s);
  });

  const findSpace = (idOrName: string): Space | undefined => {
    if (byId.has(idOrName)) return byId.get(idOrName);
    if (byName.has(idOrName)) return byName.get(idOrName);
    if (byCode.has(idOrName)) return byCode.get(idOrName);

    const lower = idOrName.toLowerCase();
    for (const s of spaces) {
      if (getRoomId(s).toLowerCase() === lower) return s;
      if (s.name.toLowerCase() === lower) return s;
    }
    return undefined;
  };

  const placed = new Map<string, { x: number; y: number }>();
  const locked = new Set<string>();

  spaces.forEach((s) => {
    const id = getRoomId(s);
    if (s.position_locked && shouldTreatAsPlaced(s)) {
      locked.add(id);
      placed.set(id, { x: s.position.x, y: s.position.y });
    }
  });

  const result: Space[] = spaces.map((s) => ({ ...s }));
  const resultById = new Map<string, Space>();
  result.forEach((s) => resultById.set(getRoomId(s), s));

  // Validation: Check for data quality issues
  // NOTE: Only validate rooms that need auto-layout (unlocked rooms)
  // Locked rooms can be in any state (user might be editing them)
  const errors: string[] = [];
  const warnings: string[] = [];

  result.forEach((space) => {
    const spaceName = space.name;
    const doors = space.doors || [];
    const hasAccessPoint = !!(space as any).access_point;
    const isLocked = space.position_locked === true;

    // Only require doors/access_point for unlocked rooms (auto-layout needs connectivity)
    // Locked rooms can be temporarily doorless while user is editing
    if (!isLocked && doors.length === 0 && !hasAccessPoint) {
      errors.push(`"${spaceName}" has no doors and no access_point. Unlocked rooms must be accessible for auto-layout. Either add a door/access_point, or lock this room's position.`);
    }

    // Check door targets (for all rooms)
    doors.forEach((door, idx) => {
      const target = door.leads_to;
      if (!target || target === 'Pending') {
        warnings.push(`"${spaceName}" door #${idx + 1} on ${door.wall} wall has incomplete target (${target}).`);
      } else if (!target.includes('Outside') && !findSpace(target)) {
        errors.push(`"${spaceName}" has door to "${target}" which doesn't exist. Fix or remove this door.`);
      }
    });
  });

  // If there are errors, log them and return current state (don't crash)
  if (errors.length > 0) {
    console.error('[computeAutoLayout] VALIDATION ERRORS - Skipping layout:');
    errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));

    // Display user-friendly error message
    const errorMessage = `Cannot calculate room layout:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nPlease fix these issues before auto-layout can work.`;
    alert(errorMessage);

    // Return unchanged spaces instead of throwing
    return result;
  }

  if (warnings.length > 0) {
    console.warn('[computeAutoLayout] VALIDATION WARNINGS:');
    warnings.forEach((warn, idx) => console.warn(`  ${idx + 1}. ${warn}`));
  }

  // Pick the best seed room: always use the room with most valid door connections
  // (Locked rooms are preserved in their positions, but shouldn't affect seed selection)
  const seedId = (() => {
    console.log('[computeAutoLayout] Selecting seed room - analyzing door connections for', result.length, 'rooms');

    let bestRoom: Space | null = null;
    let maxConnections = 0;

    for (const space of result) {
      const doors = space.doors || [];
      const hasAccessPoint = !!(space as any).access_point;

      const validConnections = doors.filter(d =>
        d.leads_to &&
        d.leads_to !== 'Pending' &&
        !d.leads_to.includes('Outside') &&
        findSpace(d.leads_to)
      ).length;

      // Rooms with access points but no doors shouldn't be seeds (they're endpoints like stairs)
      const effectiveConnections = validConnections + (hasAccessPoint && validConnections === 0 ? 0 : 0);

      console.log(`  - "${space.name}": ${doors.length} total doors, ${validConnections} valid connections${hasAccessPoint ? ' [has access_point]' : ''}`);

      if (effectiveConnections > maxConnections) {
        maxConnections = effectiveConnections;
        bestRoom = space;
      }
    }

    const chosen = bestRoom || result[0];
    console.log('[computeAutoLayout] ✓ Seed room selected:', getRoomId(chosen), `(${chosen.name})`, `with ${maxConnections} valid connections`);
    return getRoomId(chosen);
  })();

  if (!placed.has(seedId)) {
    const seed = resultById.get(seedId);
    if (seed) {
      const start = shouldTreatAsPlaced(seed)
        ? { x: seed.position.x, y: seed.position.y }
        : { x: gridSize * 10, y: gridSize * 10 };
      placed.set(seedId, start);
    }
  }

  // Ensure the selected seed is always first in the queue, followed by any other already-placed rooms
  const queue: string[] = [seedId, ...Array.from(placed.keys()).filter(id => id !== seedId)];
  const processed = new Set<string>();

  console.log('[computeAutoLayout] Starting BFS with seed:', seedId, 'Total spaces:', spaces.length);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (processed.has(currentId)) continue;
    processed.add(currentId);

    const currentSpace = resultById.get(currentId);
    const currentPos = placed.get(currentId);
    if (!currentSpace || !currentPos) continue;

    const doors = currentSpace.doors || [];
    console.log(`[computeAutoLayout] Processing "${currentSpace.name}": ${doors.length} doors`);

    for (const door of doors) {
      const targetKey = door.leads_to;
      if (!targetKey || targetKey === 'Pending') {
        console.log(`  - Door on ${door.wall}: skipped (leads_to: ${targetKey})`);
        continue;
      }

      const targetOriginal = findSpace(targetKey);
      if (!targetOriginal) {
        console.log(`  - Door to "${targetKey}": not found`);
        continue;
      }

      const targetId = getRoomId(targetOriginal);
      if (placed.has(targetId)) {
        console.log(`  - Door to "${targetKey}": already placed`);
        continue;
      }
      if (locked.has(targetId)) {
        console.log(`  - Door to "${targetKey}": locked`);
        continue;
      }

      const targetSpace = resultById.get(targetId);
      if (!targetSpace) continue;

      // Find the reciprocal door on the target room that leads back to current room
      const currentRoomName = currentSpace.name;
      const reciprocalDoor = (targetSpace.doors || []).find(d => d.leads_to === currentRoomName);

      // Gap calculation: walls extend outward from interior space
      // The gap between two rooms' interior spaces = sum of both wall thicknesses
      const fromWallThickness = getEffectiveWallThicknessFt(currentSpace, globalWallSettings);
      const toWallThickness = getEffectiveWallThicknessFt(targetSpace, globalWallSettings);
      const gapFt = fromWallThickness + toWallThickness;

      const fromX = currentPos.x;
      const fromY = currentPos.y;
      const fromWidth = currentSpace.size_ft.width;
      const fromHeight = currentSpace.size_ft.height;
      const toWidth = targetSpace.size_ft.width;
      const toHeight = targetSpace.size_ft.height;

      // Helper function to get door position in feet
      // SINGLE SOURCE OF TRUTH: Only position_on_wall_ft is supported (absolute feet from wall start)
      const getDoorPositionFt = (doorObj: any, wallDir: string, roomName: string): number => {
        if (typeof doorObj.position_on_wall_ft === 'number') {
          return doorObj.position_on_wall_ft;
        }

        // ERROR: No position data found
        throw new Error(
          `Door position data missing for "${roomName}" on ${wallDir} wall leading to "${doorObj.leads_to}". ` +
          `Every door must have "position_on_wall_ft" (absolute feet from wall start, representing door center). ` +
          `Fix this door in the JSON file or delete and recreate it.`
        );
      };

      // Get door positions on their respective walls
      const fromDoorPos = getDoorPositionFt(door, door.wall, currentSpace.name);

      // If no reciprocal door, assume it's at the same relative position to minimize misalignment
      const toDoorPos = reciprocalDoor
        ? getDoorPositionFt(reciprocalDoor, reciprocalDoor.wall, targetSpace.name)
        : fromDoorPos;

      let x = fromX;
      let y = fromY;

      // Position the target room so its door aligns with the current room's door
      switch (door.wall) {
        case 'north':
          // Door is on current room's north wall (top edge)
          // Target room's reciprocal door should be on its south wall (bottom edge)
          x = fromX + fromDoorPos - toDoorPos; // Align doors horizontally
          y = fromY - toHeight - gapFt; // Place above
          break;
        case 'south':
          // Door is on current room's south wall (bottom edge)
          // Target room's reciprocal door should be on its north wall (top edge)
          x = fromX + fromDoorPos - toDoorPos; // Align doors horizontally
          y = fromY + fromHeight + gapFt; // Place below
          break;
        case 'east':
          // Door is on current room's east wall (right edge)
          // Target room's reciprocal door should be on its west wall (left edge)
          x = fromX + fromWidth + gapFt; // Place to the right
          y = fromY + fromDoorPos - toDoorPos; // Align doors vertically
          break;
        case 'west':
          // Door is on current room's west wall (left edge)
          // Target room's reciprocal door should be on its east wall (right edge)
          x = fromX - toWidth - gapFt; // Place to the left
          y = fromY + fromDoorPos - toDoorPos; // Align doors vertically
          break;
      }

      const newPos = { x: snapToGrid(x), y: snapToGrid(y) };
      placed.set(targetId, newPos);
      queue.push(targetId);

      if (reciprocalDoor) {
        console.log(`  ✓ Placed "${targetSpace.name}" at (${newPos.x}, ${newPos.y}) via ${door.wall} door (aligned ${fromDoorPos}ft ↔ ${toDoorPos}ft)`);
      } else {
        console.log(`  ✓ Placed "${targetSpace.name}" at (${newPos.x}, ${newPos.y}) via ${door.wall} door (no reciprocal, centered at ${toDoorPos}ft)`);
      }
    }
  }

  const unplaced = result.filter((s) => !placed.has(getRoomId(s)));
  console.log('[computeAutoLayout] Unplaced rooms:', unplaced.length, unplaced.map(s => s.name));
  if (unplaced.length > 0) {
    const cols = Math.ceil(Math.sqrt(unplaced.length));
    unplaced.forEach((s, idx) => {
      if (locked.has(getRoomId(s))) return;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      placed.set(getRoomId(s), { x: 500 + col * 200, y: row * 200 });
    });
  }

  // Normalize coordinates - shift everything to positive quadrant with padding
  // Don't move locked rooms - they stay at their absolute positions
  const unlockedPositions = Array.from(placed.entries())
    .filter(([id]) => !locked.has(id))
    .map(([_, pos]) => pos);

  if (unlockedPositions.length > 0) {
    const minX = Math.min(...unlockedPositions.map(pos => pos.x));
    const minY = Math.min(...unlockedPositions.map(pos => pos.y));
    const padding = gridSize * 2;

    // Only shift if we have negative coordinates
    if (minX < padding || minY < padding) {
      const shiftX = minX < padding ? padding - minX : 0;
      const shiftY = minY < padding ? padding - minY : 0;

      placed.forEach((pos, id) => {
        if (!locked.has(id)) {
          pos.x += shiftX;
          pos.y += shiftY;
        }
      });
    }
  }

  return result.map((s) => {
    const id = getRoomId(s);
    if (locked.has(id)) return s;
    const pos = placed.get(id);
    if (!pos) return s;
    return { ...s, position: { x: pos.x, y: pos.y } };
  });
}

// ============================================================================
// REDUCER
// ============================================================================

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_SPACES': {
      // Synchronize reciprocal doors when loading spaces from session files
      const syncedSpaces = synchronizeReciprocalDoors(action.payload as any[]) as unknown as Space[];
      console.log('[SET_SPACES] Synchronized reciprocal doors for', syncedSpaces.length, 'spaces');

      // Run validation on loaded spaces to populate validation state
      const setSpacesValidationResults = validateAllDoors(syncedSpaces as any[]);
      const setSpacesValidationErrors = convertDoorValidationToErrors(setSpacesValidationResults);

      console.log(`[SET_SPACES] Validation: ${setSpacesValidationErrors.length} error(s) found`);

      return { ...state, spaces: syncedSpaces, validationErrors: setSpacesValidationErrors, validationWarnings: [] };
    }

    case 'ADD_SPACE': {
      const newSpaces = [...state.spaces, action.payload];
      return { ...state, spaces: newSpaces };
    }

    case 'UPDATE_SPACE': {
      const newSpaces = state.spaces.map(space =>
        (space.code === action.payload.id || space.name === action.payload.id)
          ? { ...space, ...action.payload.updates }
          : space
      );
      return { ...state, spaces: newSpaces };
    }

    case 'DELETE_SPACE': {
      const newSpaces = state.spaces.filter(
        space => space.code !== action.payload && space.name !== action.payload
      );
      return { ...state, spaces: newSpaces, selectedRoomId: null };
    }

    case 'MOVE_ROOM': {
      const newSpaces = state.spaces.map(space =>
        (space.code === action.payload.id || space.name === action.payload.id)
          ? { ...space, position: action.payload.position, position_locked: true }
          : space
      );
      return { ...state, spaces: newSpaces };
    }

    case 'RESIZE_ROOM': {
      const newSpaces = state.spaces.map(space =>
        (space.code === action.payload.id || space.name === action.payload.id)
          ? { ...space, size_ft: action.payload.size }
          : space
      );

      // Run validation since resizing can invalidate door positions
      const resizeValidationResults = validateAllDoors(newSpaces as any[]);
      const resizeValidationErrors = convertDoorValidationToErrors(resizeValidationResults);

      console.log(`[RESIZE_ROOM] Validation: ${resizeValidationErrors.length} error(s) found`);

      return { ...state, spaces: newSpaces, validationErrors: resizeValidationErrors, validationWarnings: [] };
    }

    case 'SELECT_ROOM':
      return { ...state, selectedRoomId: action.payload };

    case 'HOVER_ROOM':
      return { ...state, hoveredRoomId: action.payload };

    case 'START_DRAG':
      return { ...state, isDragging: true, selectedRoomId: action.payload };

    case 'END_DRAG':
      return { ...state, isDragging: false };

    case 'START_RESIZE':
      return {
        ...state,
        isResizing: true,
        resizeHandle: action.payload.handle,
        selectedRoomId: action.payload.roomId,
      };

    case 'END_RESIZE':
      return { ...state, isResizing: false, resizeHandle: null };

    case 'ADD_DOOR': {
      // Find the room to add the door to
      const targetRoom = state.spaces.find(
        s => s.code === action.payload.roomId || s.name === action.payload.roomId
      );

      if (!targetRoom) {
        console.error(`[ADD_DOOR] Room not found: ${action.payload.roomId}`);
        return state;
      }

      const door = action.payload.door;

      // VALIDATION: Use centralized validateDoor function from doorSync.ts
      const validation = validateDoor(targetRoom as any, door);

      if (!validation.valid) {
        const errorMsg = `Cannot add door to "${targetRoom.name}": ${validation.errors.join(', ')}`;
        console.error(`[ADD_DOOR] ${errorMsg}`);

        // Show user-friendly error message
        if (validation.errors.some(err => err.includes('conflicts'))) {
          alert(errorMsg + '\n\nMove or remove the conflicting door(s) first.');
        } else {
          alert(errorMsg);
        }

        return state;
      }

      // Validation passed - add the door to the source room
      let newSpaces = state.spaces.map(space =>
        (space.code === action.payload.roomId || space.name === action.payload.roomId)
          ? { ...space, doors: [...(space.doors || []), door] }
          : space
      );

      console.log(`[ADD_DOOR] ✓ Added door to ${targetRoom.name} on ${door.wall} wall at ${door.position_on_wall_ft}ft (center, width: ${door.width_ft}ft)`);

      // Create reciprocal door in target room (unless skipReciprocal flag is set)
      if (!action.payload.skipReciprocal && door.leads_to && door.leads_to !== 'Pending') {
        const leadsToRoom = newSpaces.find(
          s => s.code === door.leads_to || s.name === door.leads_to
        );

        if (leadsToRoom) {
          const oppositeWall = getOppositeWall(door.wall);
          const reciprocalPosition = calculateReciprocalDoorPosition(targetRoom as any, leadsToRoom as any, door);

          // Check if THIS SPECIFIC reciprocal door already exists
          // Match by: leads back to target AND on opposite wall AND at reciprocal position
          const positionTolerance = 10; // 10ft tolerance for position matching (supports multiple doors + manual adjustments)
          const reciprocalExists = (leadsToRoom.doors || []).some(existingDoor => {
            const leadsBackToTarget = existingDoor.leads_to === targetRoom.name || existingDoor.leads_to === targetRoom.code;
            const onOppositeWall = existingDoor.wall === oppositeWall;
            const positionMatches = Math.abs(existingDoor.position_on_wall_ft - reciprocalPosition) < positionTolerance;
            return leadsBackToTarget && onOppositeWall && positionMatches;
          });

          if (!reciprocalExists) {

            // Create the reciprocal door
            const reciprocalDoor: Door = {
              wall: oppositeWall,
              position_on_wall_ft: reciprocalPosition,
              width_ft: door.width_ft,
              leads_to: targetRoom.name,
              style: door.style,
              door_type: door.door_type,
              material: door.material,
              state: door.state,
              color: door.color,
              is_reciprocal: true, // Mark as auto-created reciprocal
            };

            // Add reciprocal door to target room
            newSpaces = newSpaces.map(space =>
              (space.code === leadsToRoom.code || space.name === leadsToRoom.name)
                ? { ...space, doors: [...(space.doors || []), reciprocalDoor] }
                : space
            );

            console.log(`[ADD_DOOR] ✓ Created reciprocal door in ${leadsToRoom.name} on ${oppositeWall} wall at ${reciprocalPosition.toFixed(1)}ft`);
          } else {
            console.log(`[ADD_DOOR] Reciprocal door already exists in ${leadsToRoom.name} on ${oppositeWall} wall at ~${reciprocalPosition.toFixed(1)}ft`);
          }
        } else {
          console.log(`[ADD_DOOR] Target room "${door.leads_to}" not found - no reciprocal door created`);
        }
      }

      // Run validation on updated spaces to populate validation state
      const validationResults = validateAllDoors(newSpaces as any[]);
      const validationErrors = convertDoorValidationToErrors(validationResults);

      console.log(`[ADD_DOOR] Validation: ${validationErrors.length} error(s) found`);

      return { ...state, spaces: newSpaces, validationErrors, validationWarnings: [] };
    }

    case 'REMOVE_DOOR': {
      const targetRoom = state.spaces.find(
        s => s.code === action.payload.roomId || s.name === action.payload.roomId
      );

      if (!targetRoom) {
        console.error(`[REMOVE_DOOR] Room not found: ${action.payload.roomId}`);
        return state;
      }

      // Get the door being removed
      const doorToRemove = (targetRoom.doors || [])[action.payload.doorIndex];
      const remainingDoors = (targetRoom.doors || []).filter((_, idx) => idx !== action.payload.doorIndex);
      const hasAccessPoint = !!(targetRoom as any).access_point;

      // Warn if removing last door and room has no access_point
      if (remainingDoors.length === 0 && !hasAccessPoint && !targetRoom.position_locked) {
        const shouldContinue = confirm(
          `Warning: Removing this door will leave "${targetRoom.name}" with no access.\n\n` +
          `This will prevent auto-layout from working.\n\n` +
          `Options:\n` +
          `• Click OK to continue (then add an access_point or lock the room position)\n` +
          `• Click Cancel to keep the door`
        );

        if (!shouldContinue) {
          console.log('[REMOVE_DOOR] User cancelled door removal');
          return state;
        }
      }

      // Remove the door from the source room
      let newSpaces = state.spaces.map(space =>
        (space.code === action.payload.roomId || space.name === action.payload.roomId)
          ? { ...space, doors: remainingDoors }
          : space
      );

      console.log(`[REMOVE_DOOR] ✓ Removed door from ${targetRoom.name}, ${remainingDoors.length} door(s) remaining`);

      // Remove reciprocal door from target room (unless skipReciprocal flag is set)
      if (!action.payload.skipReciprocal && doorToRemove && doorToRemove.leads_to && doorToRemove.leads_to !== 'Pending' && doorToRemove.leads_to !== 'Outside') {
        const leadsToRoom = newSpaces.find(
          s => s.code === doorToRemove.leads_to || s.name === doorToRemove.leads_to
        );

        if (leadsToRoom) {
          // Calculate expected reciprocal door properties
          const oppositeWall = getOppositeWall(doorToRemove.wall);
          const reciprocalPosition = calculateReciprocalDoorPosition(targetRoom as any, leadsToRoom as any, doorToRemove);

          // Find THE SPECIFIC reciprocal door (not just any door that leads back)
          // Match by: leads back to target AND on opposite wall AND at reciprocal position
          const tolerance = 0.5; // Allow 0.5ft tolerance for position matching
          const reciprocalDoorIndex = (leadsToRoom.doors || []).findIndex(existingDoor => {
            const leadsBackToTarget = existingDoor.leads_to === targetRoom.name || existingDoor.leads_to === targetRoom.code;
            const onOppositeWall = existingDoor.wall === oppositeWall;
            const atReciprocalPosition = Math.abs(existingDoor.position_on_wall_ft - reciprocalPosition) < tolerance;
            return leadsBackToTarget && onOppositeWall && atReciprocalPosition;
          });

          if (reciprocalDoorIndex !== -1) {
            const reciprocalDoor = leadsToRoom.doors![reciprocalDoorIndex];

            // Remove the SPECIFIC reciprocal door
            newSpaces = newSpaces.map(space =>
              (space.code === leadsToRoom.code || space.name === leadsToRoom.name)
                ? { ...space, doors: (space.doors || []).filter((_, idx) => idx !== reciprocalDoorIndex) }
                : space
            );

            console.log(`[REMOVE_DOOR] ✓ Removed reciprocal door from ${leadsToRoom.name} on ${reciprocalDoor.wall} wall at ${reciprocalDoor.position_on_wall_ft.toFixed(1)}ft`);
          } else {
            console.log(`[REMOVE_DOOR] No matching reciprocal door found in ${leadsToRoom.name} on ${oppositeWall} wall at ~${reciprocalPosition.toFixed(1)}ft`);
          }
        }
      }

      // Run validation on updated spaces to populate validation state
      const validationResults = validateAllDoors(newSpaces as any[]);
      const validationErrors = convertDoorValidationToErrors(validationResults);

      console.log(`[REMOVE_DOOR] Validation: ${validationErrors.length} error(s) found`);

      return { ...state, spaces: newSpaces, validationErrors, validationWarnings: [] };
    }

    case 'UPDATE_DOOR': {
      // Find the room with the door to update
      const targetRoom = state.spaces.find(
        s => s.code === action.payload.roomId || s.name === action.payload.roomId
      );

      if (!targetRoom) {
        console.error(`[UPDATE_DOOR] Room not found: ${action.payload.roomId}`);
        return state;
      }

      const existingDoor = targetRoom.doors?.[action.payload.doorIndex];
      if (!existingDoor) {
        console.error(`[UPDATE_DOOR] Door index ${action.payload.doorIndex} not found in room "${targetRoom.name}"`);
        return state;
      }

      // Merge updates with existing door
      const updatedDoor = { ...existingDoor, ...action.payload.updates };
      const wall = updatedDoor.wall;

      // Get wall length based on wall direction
      const wallLength = (wall === 'north' || wall === 'south')
        ? targetRoom.size_ft.width
        : targetRoom.size_ft.height;

      // VALIDATION 1: Door width cannot exceed wall length
      if (updatedDoor.width_ft > wallLength) {
        const errorMsg = `Door width (${updatedDoor.width_ft}ft) cannot exceed ${wall} wall length (${wallLength}ft) for room "${targetRoom.name}"`;
        console.error(`[UPDATE_DOOR] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // VALIDATION 2: Door position represents CENTER of door
      const doorHalfWidth = updatedDoor.width_ft / 2;
      const doorLeftEdge = updatedDoor.position_on_wall_ft - doorHalfWidth;
      const doorRightEdge = updatedDoor.position_on_wall_ft + doorHalfWidth;

      if (doorLeftEdge < 0 || doorRightEdge > wallLength) {
        const errorMsg = `Door position (${updatedDoor.position_on_wall_ft}ft ± ${doorHalfWidth}ft) exceeds ${wall} wall bounds (0 to ${wallLength}ft) for room "${targetRoom.name}". ` +
          `Valid range for door center: ${doorHalfWidth}ft to ${wallLength - doorHalfWidth}ft`;
        console.error(`[UPDATE_DOOR] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // VALIDATION 3: Check for conflicts with other doors on the same wall
      const existingDoors = targetRoom.doors || [];
      const otherDoors = existingDoors.filter((_, idx) => idx !== action.payload.doorIndex);

      const conflicts = otherDoors.filter(existing => {
        if (existing.wall !== wall) return false;

        const existingHalfWidth = existing.width_ft / 2;
        const existingLeft = existing.position_on_wall_ft - existingHalfWidth;
        const existingRight = existing.position_on_wall_ft + existingHalfWidth;

        // Check for overlap (doors conflict if they overlap)
        return !(doorRightEdge <= existingLeft || doorLeftEdge >= existingRight);
      });

      if (conflicts.length > 0) {
        const conflictDesc = conflicts.map(d =>
          `${d.leads_to} at ${d.position_on_wall_ft}ft`
        ).join(', ');

        const errorMsg = `Door conflicts with existing door(s) on ${wall} wall of "${targetRoom.name}": ${conflictDesc}. ` +
          `Move or resize the conflicting door(s) first.`;
        console.error(`[UPDATE_DOOR] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Validation passed - update the door
      const newSpaces = state.spaces.map(space =>
        (space.code === action.payload.roomId || space.name === action.payload.roomId)
          ? {
              ...space,
              doors: (space.doors || []).map((door, idx) =>
                idx === action.payload.doorIndex ? updatedDoor : door
              ),
            }
          : space
      );

      console.log(`[UPDATE_DOOR] ✓ Updated door in ${targetRoom.name} on ${wall} wall to ${updatedDoor.position_on_wall_ft}ft (center, width: ${updatedDoor.width_ft}ft)`);

      // Run validation on updated spaces to populate validation state
      const updateValidationResults = validateAllDoors(newSpaces as any[]);
      const updateValidationErrors = convertDoorValidationToErrors(updateValidationResults);

      console.log(`[UPDATE_DOOR] Validation: ${updateValidationErrors.length} error(s) found`);

      return { ...state, spaces: newSpaces, validationErrors: updateValidationErrors, validationWarnings: [] };
    }

    case 'SET_REVIEW_FREQUENCY':
      return { ...state, reviewFrequency: action.payload };

    case 'SET_BATCH_SIZE':
      return { ...state, batchSize: action.payload };

    case 'ADD_TO_PENDING_REVIEW':
      return { ...state, pendingReview: [...state.pendingReview, ...action.payload] };

    case 'APPROVE_PENDING': {
      const approvedIds = new Set(action.payload);
      const approved = state.pendingReview.filter(space => approvedIds.has(space.code));
      const remaining = state.pendingReview.filter(space => !approvedIds.has(space.code));
      return {
        ...state,
        spaces: [...state.spaces, ...approved],
        pendingReview: remaining,
      };
    }

    case 'REJECT_PENDING': {
      const rejectedIds = new Set(action.payload);
      const remaining = state.pendingReview.filter(space => !rejectedIds.has(space.code));
      return { ...state, pendingReview: remaining };
    }

    case 'CREATE_SNAPSHOT': {
      const snapshot: Snapshot = {
        id: `snapshot-${Date.now()}`,
        timestamp: Date.now(),
        spaces: JSON.parse(JSON.stringify(state.spaces)), // Deep copy
        description: action.payload,
      };

      // Remove any snapshots after current index (when undoing then making new changes)
      const newSnapshots = state.snapshots.slice(0, state.currentSnapshotIndex + 1);
      newSnapshots.push(snapshot);

      // Keep only last 50 snapshots to prevent memory issues
      const trimmedSnapshots = newSnapshots.slice(-50);

      return {
        ...state,
        snapshots: trimmedSnapshots,
        currentSnapshotIndex: trimmedSnapshots.length - 1,
      };
    }

    case 'UNDO': {
      if (state.currentSnapshotIndex <= 0) return state;
      const newIndex = state.currentSnapshotIndex - 1;
      const snapshot = state.snapshots[newIndex];
      return {
        ...state,
        spaces: JSON.parse(JSON.stringify(snapshot.spaces)),
        currentSnapshotIndex: newIndex,
      };
    }

    case 'REDO': {
      if (state.currentSnapshotIndex >= state.snapshots.length - 1) return state;
      const newIndex = state.currentSnapshotIndex + 1;
      const snapshot = state.snapshots[newIndex];
      return {
        ...state,
        spaces: JSON.parse(JSON.stringify(snapshot.spaces)),
        currentSnapshotIndex: newIndex,
      };
    }

    case 'RESTORE_SNAPSHOT': {
      const snapshot = state.snapshots[action.payload];
      if (!snapshot) return state;
      return {
        ...state,
        spaces: JSON.parse(JSON.stringify(snapshot.spaces)),
        currentSnapshotIndex: action.payload,
      };
    }

    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.payload };

    case 'SET_VALIDATION_WARNINGS':
      return { ...state, validationWarnings: action.payload };

    case 'TOGGLE_GRID_LAYER':
      return { ...state, showGridLayer: !state.showGridLayer };

    case 'TOGGLE_WIREFRAME_LAYER':
      return { ...state, showWireframeLayer: !state.showWireframeLayer };

    case 'TOGGLE_DETAIL_LAYER':
      return { ...state, showDetailLayer: !state.showDetailLayer };

    case 'TOGGLE_POSITION_LOCK': {
      const roomId = action.payload;
      let wasUnlocked = false;
      const newSpaces = state.spaces.map(space => {
        if (space.code === roomId || space.name === roomId) {
          const newLocked = !space.position_locked;
          console.log(`[TOGGLE_POSITION_LOCK] ${space.name} position_locked: ${space.position_locked} → ${newLocked}`);
          // Track if we're unlocking a room (to trigger recalculation)
          if (!newLocked && space.position_locked) {
            wasUnlocked = true;
          }
          return { ...space, position_locked: newLocked };
        }
        return space;
      });

      // If we unlocked a room, recalculate layout to position it based on doors
      if (wasUnlocked) {
        console.log('[TOGGLE_POSITION_LOCK] Room was unlocked - recalculating layout');
        const relaidOutSpaces = computeAutoLayout(newSpaces, state.gridSize, state.globalWallSettings);
        return { ...state, spaces: relaidOutSpaces };
      }

      return { ...state, spaces: newSpaces };
    }

    case 'SET_CANVAS_BOUNDS':
      return { ...state, canvasBounds: action.payload };

    case 'SET_GLOBAL_WALL_SETTINGS': {
      const newSettings = action.payload;

      // Check if all rooms are manually positioned (locked)
      const unlockedCount = state.spaces.filter(s => !s.position_locked).length;

      if (unlockedCount === 0) {
        // All rooms are locked - just update wall settings, don't reposition
        console.log('[LocationEditorContext] SET_GLOBAL_WALL_SETTINGS - all rooms locked, skipping auto-layout');
        return {
          ...state,
          globalWallSettings: newSettings,
        };
      }

      // Some rooms are unlocked - recalculate layout for those rooms only
      console.log('[LocationEditorContext] SET_GLOBAL_WALL_SETTINGS - recalculating layout for', unlockedCount, 'unlocked rooms');
      const relaidOutSpaces = computeAutoLayout(state.spaces, state.gridSize, newSettings);
      console.log('[LocationEditorContext] Layout recalculated - sample positions:',
        relaidOutSpaces.slice(0, 3).map(s => ({ name: s.name, pos: s.position }))
      );

      return {
        ...state,
        globalWallSettings: newSettings,
        spaces: relaidOutSpaces,
      };
    }

    case 'RECALCULATE_LAYOUT': {
      return {
        ...state,
        spaces: computeAutoLayout(state.spaces, state.gridSize, state.globalWallSettings),
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface LocationEditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;

  // Convenience methods
  selectRoom: (id: string | null) => void;
  moveRoom: (id: string, position: { x: number; y: number }) => void;
  resizeRoom: (id: string, size: { width: number; height: number }) => void;
  deleteRoom: (id: string) => void;
  addDoor: (roomId: string, door: Door) => void;
  removeDoor: (roomId: string, doorIndex: number) => void;
  togglePositionLock: (roomId: string) => void;
  createSnapshot: (description: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setGlobalWallSettings: (settings: WallSettings) => void;
  recalculateLayout: () => void;
}

const LocationEditorContext = createContext<LocationEditorContextValue | null>(null);

// Export the hook for consuming the context
export function useLocationEditor() {
  const context = useContext(LocationEditorContext);
  if (!context) {
    throw new Error('useLocationEditor must be used within a LocationEditorProvider');
  }
  return context;
}

// Re-export Space type from locationEditorTypes
export type { Space } from './locationEditorTypes';

// ============================================================================
// PROVIDER
// ============================================================================

interface LocationEditorProviderProps {
  children: ReactNode;
  initialSpaces?: Space[];
  initialGlobalWallSettings?: WallSettings;
  onGlobalWallSettingsChange?: (settings: WallSettings) => void;
}

export function LocationEditorProvider({ children, initialSpaces = [], initialGlobalWallSettings, onGlobalWallSettingsChange }: LocationEditorProviderProps) {
  // Initialize state WITHOUT running auto-layout - preserve existing positions
  // Auto-layout only runs when user explicitly changes wall settings or requests recalculate
  const initState = {
    ...initialState,
    globalWallSettings: initialGlobalWallSettings || initialState.globalWallSettings,
    spaces: initialSpaces,
  };

  const [state, dispatch] = useReducer(editorReducer, initState);

  // Track the last wall settings we processed to avoid duplicate dispatches
  const lastProcessedWallSettings = useRef<WallSettings | null>(null);

  // Sync globalWallSettings from parent when it changes (e.g., from top bar UI)
  useEffect(() => {
    if (!initialGlobalWallSettings) return;

    const last = lastProcessedWallSettings.current;
    const hasChanged = !last ||
      last.thickness_ft !== initialGlobalWallSettings.thickness_ft ||
      last.material !== initialGlobalWallSettings.material;

    if (hasChanged) {
      console.log('[LocationEditorContext] Wall settings changed - triggering re-layout', {
        last: lastProcessedWallSettings.current,
        new: initialGlobalWallSettings
      });
      lastProcessedWallSettings.current = { ...initialGlobalWallSettings };
      dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: initialGlobalWallSettings });
    }
  }, [initialGlobalWallSettings]);

  // Notify parent when globalWallSettings change from editor (e.g., from properties panel)
  useEffect(() => {
    if (onGlobalWallSettingsChange) {
      onGlobalWallSettingsChange(state.globalWallSettings);
    }
  }, [onGlobalWallSettingsChange, state.globalWallSettings]);

  // Create initial snapshot when spaces are first loaded
  useEffect(() => {
    if (initialSpaces.length > 0 && state.snapshots.length === 0) {
      dispatch({ type: 'CREATE_SNAPSHOT', payload: 'Initial state' });
    }
  }, [initialSpaces.length, state.snapshots.length]);

  // NOTE: Sync is handled by key-based remount in LiveVisualMapPanel
  // When parent's spaces change, the LocationEditorProvider is remounted with fresh state

  // Convenience methods
  const selectRoom = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ROOM', payload: id });
  }, []);

  const moveRoom = useCallback((id: string, position: { x: number; y: number }) => {
    dispatch({ type: 'MOVE_ROOM', payload: { id, position } });
  }, []);

  const resizeRoom = useCallback((id: string, size: { width: number; height: number }) => {
    dispatch({ type: 'RESIZE_ROOM', payload: { id, size } });
  }, []);

  const deleteRoom = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SPACE', payload: id });
  }, []);

  const addDoor = useCallback((roomId: string, door: Door) => {
    dispatch({ type: 'ADD_DOOR', payload: { roomId, door } });
  }, []);

  const removeDoor = useCallback((roomId: string, doorIndex: number) => {
    dispatch({ type: 'REMOVE_DOOR', payload: { roomId, doorIndex } });
  }, []);

  const togglePositionLock = useCallback((roomId: string) => {
    dispatch({ type: 'TOGGLE_POSITION_LOCK', payload: roomId });
  }, []);

  const createSnapshot = useCallback((description: string) => {
    dispatch({ type: 'CREATE_SNAPSHOT', payload: description });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const canUndo = state.currentSnapshotIndex > 0;
  const canRedo = state.currentSnapshotIndex < state.snapshots.length - 1;

  const setGlobalWallSettings = useCallback((settings: WallSettings) => {
    dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: settings });
  }, []);

  const recalculateLayout = useCallback(() => {
    dispatch({ type: 'RECALCULATE_LAYOUT' });
  }, []);

  const value: LocationEditorContextValue = {
    state,
    dispatch,
    selectRoom,
    moveRoom,
    resizeRoom,
    deleteRoom,
    addDoor,
    removeDoor,
    togglePositionLock,
    createSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    setGlobalWallSettings,
    recalculateLayout,
  };

  return (
    <LocationEditorContext.Provider value={value}>
      {children}
    </LocationEditorContext.Provider>
  );
}
