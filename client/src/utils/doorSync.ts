/**
 * Door Synchronization Utilities
 *
 * Ensures reciprocal doors are created and maintained across all rooms.
 * This is critical because doors can be added/modified through multiple code paths:
 * - SpaceApprovalModal (direct array manipulation)
 * - RoomPropertiesPanel (via ADD_DOOR reducer)
 * - Session file loading (SET_SPACES)
 *
 * This utility ensures consistency regardless of which path is used.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { Door } from '../contexts/locationEditorTypes';

// DoorLike is now an alias to the canonical Door type
export type DoorLike = Door;

export interface SpaceLike {
  name: string;
  code?: string;
  size_ft: { width: number; height: number };
  doors?: DoorLike[];
  [key: string]: unknown;
}

/**
 * Get the opposite wall for reciprocal door creation
 */
export function getOppositeWall(wall: 'north' | 'south' | 'east' | 'west'): 'north' | 'south' | 'east' | 'west' {
  const opposites = {
    north: 'south' as const,
    south: 'north' as const,
    east: 'west' as const,
    west: 'east' as const,
  };
  return opposites[wall];
}

/**
 * Calculate reciprocal door position when rooms have different dimensions
 * Now includes bounds clamping to ensure doors stay within valid wall bounds
 */
export function calculateReciprocalDoorPosition(
  sourceRoom: SpaceLike,
  targetRoom: SpaceLike,
  sourceDoor: DoorLike
): number {
  const sourceWall = sourceDoor.wall;
  const sourcePosition = sourceDoor.position_on_wall_ft;
  const doorWidth = sourceDoor.width_ft;

  const sourceWallIsHorizontal = sourceWall === 'north' || sourceWall === 'south';
  const sourceDimension = sourceWallIsHorizontal ? sourceRoom.size_ft.width : sourceRoom.size_ft.height;
  const targetDimension = sourceWallIsHorizontal ? targetRoom.size_ft.width : targetRoom.size_ft.height;

  if (sourceDimension === targetDimension) {
    return sourcePosition; // Same wall length - use same position
  }

  // Different wall lengths - use relative position
  const relativePosition = sourcePosition / sourceDimension;
  let calculatedPosition = relativePosition * targetDimension;

  // Ensure the door stays within valid bounds on the target wall
  // Valid range is [doorWidth/2, targetDimension - doorWidth/2]
  const minValidPosition = doorWidth / 2;
  const maxValidPosition = targetDimension - (doorWidth / 2);

  // Clamp the position to valid bounds
  if (calculatedPosition < minValidPosition) {
    calculatedPosition = minValidPosition;
  } else if (calculatedPosition > maxValidPosition) {
    calculatedPosition = maxValidPosition;
  }

  return calculatedPosition;
}

/**
 * Check if two doors conflict (overlap on the same wall)
 */
function doorsConflict(door1: DoorLike, door2: DoorLike): boolean {
  if (door1.wall !== door2.wall) return false;

  const door1HalfWidth = door1.width_ft / 2;
  const door1Left = door1.position_on_wall_ft - door1HalfWidth;
  const door1Right = door1.position_on_wall_ft + door1HalfWidth;

  const door2HalfWidth = door2.width_ft / 2;
  const door2Left = door2.position_on_wall_ft - door2HalfWidth;
  const door2Right = door2.position_on_wall_ft + door2HalfWidth;

  // Check for overlap
  return !(door1Right < door2Left || door1Left > door2Right);
}

/**
 * Find a non-conflicting position for a door on a wall
 * Tries positions near the preferred position first, then searches the entire wall
 */
function findNonConflictingPosition(
  room: SpaceLike,
  door: DoorLike,
  preferredPosition: number
): number | null {
  const wall = door.wall;
  const wallLength = (wall === 'north' || wall === 'south') ? room.size_ft.width : room.size_ft.height;
  const doorHalfWidth = door.width_ft / 2;
  const minPos = doorHalfWidth;
  const maxPos = wallLength - doorHalfWidth;

  if (minPos > maxPos) {
    return null; // Door is too wide for this wall
  }

  // Try the preferred position first
  const testDoor = { ...door, position_on_wall_ft: preferredPosition };
  const existingDoors = room.doors || [];
  const hasConflict = existingDoors.some(existing => doorsConflict(existing, testDoor));

  if (!hasConflict) {
    return preferredPosition;
  }

  // Try positions near the preferred position, expanding outward
  const searchStep = 1; // Search in 1ft increments
  const maxSearchDistance = wallLength / 2;

  for (let distance = searchStep; distance <= maxSearchDistance; distance += searchStep) {
    // Try higher position
    const higherPos = preferredPosition + distance;
    if (higherPos <= maxPos) {
      testDoor.position_on_wall_ft = higherPos;
      const hasConflictHigh = existingDoors.some(existing => doorsConflict(existing, testDoor));
      if (!hasConflictHigh) {
        return higherPos;
      }
    }

    // Try lower position
    const lowerPos = preferredPosition - distance;
    if (lowerPos >= minPos) {
      testDoor.position_on_wall_ft = lowerPos;
      const hasConflictLow = existingDoors.some(existing => doorsConflict(existing, testDoor));
      if (!hasConflictLow) {
        return lowerPos;
      }
    }
  }

  return null; // No non-conflicting position found
}

export interface DoorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationError {
  id: string;
  roomId: string;
  type: 'overlap' | 'broken-connection' | 'out-of-bounds' | 'invalid-door';
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate a door for a given room
 */
export function validateDoor(room: SpaceLike, door: DoorLike): DoorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate wall length
  const wall = door.wall;
  const wallLength = (wall === 'north' || wall === 'south')
    ? room.size_ft.width
    : room.size_ft.height;

  // Check door width doesn't exceed wall
  if (door.width_ft > wallLength) {
    errors.push(`Door width (${door.width_ft}ft) exceeds ${wall} wall length (${wallLength}ft)`);
  }

  // Check door position is within bounds (accounting for door width)
  const doorHalfWidth = door.width_ft / 2;
  const doorLeftEdge = door.position_on_wall_ft - doorHalfWidth;
  const doorRightEdge = door.position_on_wall_ft + doorHalfWidth;

  if (doorLeftEdge < 0 || doorRightEdge > wallLength) {
    const validMin = doorHalfWidth;
    const validMax = wallLength - doorHalfWidth;
    errors.push(`Door position (${door.position_on_wall_ft}ft) extends beyond ${wall} wall bounds. Valid range: ${validMin.toFixed(1)}ft - ${validMax.toFixed(1)}ft`);
  }

  // Check for conflicts with other doors on same wall
  const existingDoors = room.doors || [];
  const conflicts = existingDoors.filter(existing =>
    existing !== door && doorsConflict(existing, door)
  );

  if (conflicts.length > 0) {
    const conflictDesc = conflicts.map(d =>
      `${d.leads_to} at ${d.position_on_wall_ft}ft`
    ).join(', ');
    errors.push(`Door conflicts with existing door(s) on ${wall} wall: ${conflictDesc}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Synchronize reciprocal doors across all spaces
 *
 * For each door A→B, ensures a matching door B→A exists.
 * Creates missing reciprocal doors automatically.
 *
 * @param spaces - Array of spaces to synchronize
 * @returns Updated spaces array with reciprocal doors added
 */
export function synchronizeReciprocalDoors(spaces: SpaceLike[]): SpaceLike[] {
  const spaceMap = new Map<string, SpaceLike>();
  spaces.forEach(space => {
    spaceMap.set(space.name, space);
    if (space.code) spaceMap.set(space.code, space);
  });

  const updatedSpaces = spaces.map(space => ({ ...space, doors: [...(space.doors || [])] }));

  // Track which specific door pairs we've already processed to avoid creating duplicates
  // Key format: "SourceRoom|SourceWall|SourcePos↔TargetRoom|TargetWall|TargetPos"
  const processed = new Set<string>();

  updatedSpaces.forEach((sourceSpace) => {
    const doors = sourceSpace.doors || [];

    doors.forEach((sourceDoor) => {
      const leads_to = sourceDoor.leads_to;

      // Skip if no target or pending
      if (!leads_to || leads_to === 'Pending' || leads_to === 'Outside') {
        return;
      }

      // Skip if this door is already a reciprocal (child door)
      // Reciprocal doors shouldn't create their own reciprocals
      if (sourceDoor.is_reciprocal === true) {
        return;
      }

      // Find target space
      const targetSpace = spaceMap.get(leads_to);
      if (!targetSpace) {
        console.warn(`[doorSync] Target space "${leads_to}" not found for door from "${sourceSpace.name}"`);
        return;
      }

      const targetIdx = updatedSpaces.findIndex(s => s.name === targetSpace.name);
      if (targetIdx === -1) return;

      // Calculate expected reciprocal door properties
      const oppositeWall = getOppositeWall(sourceDoor.wall);
      const reciprocalPosition = calculateReciprocalDoorPosition(sourceSpace, targetSpace, sourceDoor);

      // Create unique key for THIS SPECIFIC door pair (not just room pair)
      // This allows multiple doors between the same rooms
      const doorPairKey = [
        `${sourceSpace.name}|${sourceDoor.wall}|${sourceDoor.position_on_wall_ft.toFixed(1)}`,
        `${targetSpace.name}|${oppositeWall}|${reciprocalPosition.toFixed(1)}`
      ].sort().join('↔');

      if (processed.has(doorPairKey)) {
        return; // Already processed this specific door pair
      }
      processed.add(doorPairKey);

      // STEP 1: Clean up outdated reciprocal doors
      // Remove reciprocal doors that lead back to source on opposite wall but are NOT at the expected position
      // This prevents accumulation of old reciprocal doors when room dimensions change or doors are moved
      const positionTolerance = 10; // 10ft tolerance for position matching
      const targetDoors = updatedSpaces[targetIdx].doors || [];
      const cleanedTargetDoors = targetDoors.filter(existingDoor => {
        const leadsBackToSource = existingDoor.leads_to === sourceSpace.name || existingDoor.leads_to === sourceSpace.code;
        const onOppositeWall = existingDoor.wall === oppositeWall;
        const isReciprocalDoor = existingDoor.is_reciprocal === true;

        // Keep the door if ANY of these is true:
        // 1. It doesn't lead back to source (not a reciprocal for this parent door)
        // 2. It's not on the opposite wall (not a reciprocal for this parent door)
        // 3. It's not marked as reciprocal (it's a parent door, keep it)
        // 4. It's at the expected position (it's the correct reciprocal, keep it)
        if (!leadsBackToSource || !onOppositeWall || !isReciprocalDoor) {
          return true; // Keep this door
        }

        // This is a reciprocal door leading back to source on opposite wall
        // Only keep it if it's at the expected position
        const positionMatches = Math.abs(existingDoor.position_on_wall_ft - reciprocalPosition) < positionTolerance;
        if (!positionMatches) {
          console.log(`[doorSync] 🧹 Removing outdated reciprocal door: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${existingDoor.position_on_wall_ft.toFixed(1)}ft (expected: ${reciprocalPosition.toFixed(1)}ft)`);
        }
        return positionMatches;
      });

      // Update the target space with cleaned doors
      updatedSpaces[targetIdx].doors = cleanedTargetDoors;

      // STEP 2: Check if the reciprocal door exists at the expected position
      const existingReciprocalDoor = cleanedTargetDoors.find(existingDoor => {
        const leadsBackToSource = existingDoor.leads_to === sourceSpace.name || existingDoor.leads_to === sourceSpace.code;
        const onOppositeWall = existingDoor.wall === oppositeWall;
        const positionMatches = Math.abs(existingDoor.position_on_wall_ft - reciprocalPosition) < positionTolerance;
        return leadsBackToSource && onOppositeWall && positionMatches;
      });

      console.log(`[doorSync] Checking ${sourceSpace.name} → ${targetSpace.name}: existingReciprocalDoor =`, existingReciprocalDoor ? `${existingReciprocalDoor.wall} at ${existingReciprocalDoor.position_on_wall_ft}ft` : 'none');

      if (!existingReciprocalDoor) {
        // Create reciprocal door
        const reciprocalDoor: DoorLike = {
          wall: oppositeWall,
          position_on_wall_ft: reciprocalPosition,
          width_ft: sourceDoor.width_ft,
          leads_to: sourceSpace.name,
          style: sourceDoor.style,
          door_type: sourceDoor.door_type,
          material: sourceDoor.material,
          state: sourceDoor.state,
          color: sourceDoor.color,
          is_reciprocal: true, // Mark as auto-created reciprocal
        };

        // Validate before adding
        let validation = validateDoor(updatedSpaces[targetIdx], reciprocalDoor);

        if (!validation.valid) {
          // If validation fails due to conflict, try to find a non-conflicting position
          const hasConflictError = validation.errors.some(err => err.includes('conflicts'));

          if (hasConflictError) {
            const alternatePosition = findNonConflictingPosition(
              updatedSpaces[targetIdx],
              reciprocalDoor,
              reciprocalPosition
            );

            if (alternatePosition !== null) {
              console.log(`[doorSync] ⚠ Adjusted reciprocal door position from ${reciprocalPosition.toFixed(1)}ft to ${alternatePosition.toFixed(1)}ft to avoid conflict`);
              reciprocalDoor.position_on_wall_ft = alternatePosition;
              validation = validateDoor(updatedSpaces[targetIdx], reciprocalDoor);
            }
          }
        }

        if (validation.valid) {
          updatedSpaces[targetIdx].doors = [...(updatedSpaces[targetIdx].doors || []), reciprocalDoor];
          console.log(`[doorSync] ✓ Created reciprocal door: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${reciprocalDoor.position_on_wall_ft.toFixed(1)}ft`);
        } else {
          console.error(`[doorSync] ✗ Cannot create reciprocal door: ${targetSpace.name} → ${sourceSpace.name}:`);
          console.error(`[doorSync]   Attempted door: ${oppositeWall} wall at ${reciprocalDoor.position_on_wall_ft.toFixed(1)}ft, width ${reciprocalDoor.width_ft}ft`);
          console.error(`[doorSync]   Target room size: ${updatedSpaces[targetIdx].size_ft.width}ft x ${updatedSpaces[targetIdx].size_ft.height}ft`);
          validation.errors.forEach((error, idx) => {
            console.error(`[doorSync]   Error ${idx + 1}: ${error}`);
          });
        }
      } else {
        // Reciprocal door exists - preserve its manually-adjusted position
        console.log(`[doorSync] Reciprocal door already exists: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${existingReciprocalDoor.position_on_wall_ft.toFixed(1)}ft (preserved)`);
      }
    });
  });

  return updatedSpaces;
}

/**
 * Validate all doors in all spaces
 *
 * @param spaces - Array of spaces to validate
 * @returns Validation results for all invalid doors
 */
export function validateAllDoors(spaces: SpaceLike[]): Array<{
  spaceName: string;
  doorIndex: number;
  door: DoorLike;
  validation: DoorValidationResult;
}> {
  const results: Array<{
    spaceName: string;
    doorIndex: number;
    door: DoorLike;
    validation: DoorValidationResult;
  }> = [];

  spaces.forEach(space => {
    const doors = space.doors || [];
    doors.forEach((door, doorIndex) => {
      const validation = validateDoor(space, door);
      if (!validation.valid) {
        results.push({
          spaceName: space.name,
          doorIndex,
          door,
          validation,
        });
      }
    });
  });

  return results;
}

/**
 * Convert door validation results to ValidationError format for editor state
 *
 * @param validationResults - Results from validateAllDoors()
 * @returns Array of ValidationError objects
 */
export function convertDoorValidationToErrors(
  validationResults: Array<{
    spaceName: string;
    doorIndex: number;
    door: DoorLike;
    validation: DoorValidationResult;
  }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  validationResults.forEach(result => {
    result.validation.errors.forEach(errorMsg => {
      // Determine error type from message content
      let errorType: 'overlap' | 'out-of-bounds' | 'invalid-door' = 'invalid-door';
      if (errorMsg.includes('conflicts') || errorMsg.includes('overlap')) {
        errorType = 'overlap';
      } else if (errorMsg.includes('beyond') || errorMsg.includes('bounds') || errorMsg.includes('exceeds')) {
        errorType = 'out-of-bounds';
      }

      errors.push({
        id: `${result.spaceName}-door-${result.doorIndex}`,
        roomId: result.spaceName,
        type: errorType,
        message: errorMsg,
        severity: 'error',
      });
    });

    result.validation.warnings.forEach(warningMsg => {
      errors.push({
        id: `${result.spaceName}-door-${result.doorIndex}-warning`,
        roomId: result.spaceName,
        type: 'invalid-door',
        message: warningMsg,
        severity: 'warning',
      });
    });
  });

  return errors;
}
