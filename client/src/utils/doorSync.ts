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
import {
  getDoorWallLengthFt,
  getOppositeWall,
  projectDoorPositionToTargetWallFt,
} from './locationMapGeometry';

// DoorLike is now an alias to the canonical Door type
export type DoorLike = Door;

export interface SpaceLike {
  name: string;
  code?: string;
  size_ft: { width: number; height: number };
  doors?: DoorLike[];
  [key: string]: unknown;
}

export const RECIPROCAL_DOOR_POSITION_TOLERANCE_FT = 0.5;
export { getOppositeWall };

function getSpaceIdentity(space: SpaceLike): string {
  return typeof space.code === 'string' && space.code.trim().length > 0 ? space.code : space.name;
}

function isMeaningfulDoorTarget(leadsTo: unknown): leadsTo is string {
  return typeof leadsTo === 'string' && leadsTo !== 'Pending' && leadsTo !== 'Outside' && leadsTo.trim().length > 0;
}

function normalizeSpaceLookupKey(key: string): string {
  return key.trim().toLowerCase();
}

export function getReciprocalParentSignature(sourceSpace: SpaceLike, sourceDoor: DoorLike): string {
  const sourceId = getSpaceIdentity(sourceSpace);
  const targetId = typeof sourceDoor.leads_to === 'string' ? sourceDoor.leads_to : '';

  return [
    sourceId,
    sourceDoor.wall,
    sourceDoor.position_on_wall_ft.toFixed(3),
    sourceDoor.width_ft.toFixed(3),
    targetId,
  ].join('|');
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
  return projectDoorPositionToTargetWallFt(sourceRoom, targetRoom, sourceDoor);
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
  preferredPosition: number,
  ignoreDoorIndex?: number
): number | null {
  const wall = door.wall;
  const wallLength = getDoorWallLengthFt(room, wall);
  const doorHalfWidth = door.width_ft / 2;
  const minPos = doorHalfWidth;
  const maxPos = wallLength - doorHalfWidth;

  if (minPos > maxPos) {
    return null; // Door is too wide for this wall
  }

  // Try the preferred position first
  const testDoor = { ...door, position_on_wall_ft: preferredPosition };
  const existingDoors = (room.doors || []).filter((_, idx) => idx !== ignoreDoorIndex);
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

function validateDoorWithIgnore(
  room: SpaceLike,
  door: DoorLike,
  ignoreDoorIndex?: number
): DoorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const wallLength = getDoorWallLengthFt(room, door.wall);

  if (door.width_ft > wallLength) {
    errors.push(`Door width (${door.width_ft}ft) exceeds ${door.wall} wall length (${wallLength}ft)`);
  }

  const doorHalfWidth = door.width_ft / 2;
  const doorLeftEdge = door.position_on_wall_ft - doorHalfWidth;
  const doorRightEdge = door.position_on_wall_ft + doorHalfWidth;

  if (doorLeftEdge < 0 || doorRightEdge > wallLength) {
    const validMin = doorHalfWidth;
    const validMax = wallLength - doorHalfWidth;
    errors.push(
      `Door position (${door.position_on_wall_ft}ft) extends beyond ${door.wall} wall bounds. Valid range: ${validMin.toFixed(1)}ft - ${validMax.toFixed(1)}ft`
    );
  }

  const existingDoors = (room.doors || []).filter((_, idx) => idx !== ignoreDoorIndex);
  const conflicts = existingDoors.filter(existing => doorsConflict(existing, door));

  if (conflicts.length > 0) {
    const conflictDesc = conflicts
      .map(d => `${d.leads_to} at ${d.position_on_wall_ft}ft`)
      .join(', ');
    errors.push(`Door conflicts with existing door(s) on ${door.wall} wall: ${conflictDesc}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a door for a given room
 */
export function validateDoor(room: SpaceLike, door: DoorLike): DoorValidationResult {
  return validateDoorWithIgnore(room, door);
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
  const updatedSpaces = spaces.map(space => ({
    ...space,
    doors: (space.doors || []).map(door => ({ ...door })),
  }));

  const spaceMap = new Map<string, { index: number; space: SpaceLike }>();
  updatedSpaces.forEach((space, index) => {
    spaceMap.set(normalizeSpaceLookupKey(space.name), { index, space });
    if (space.code) {
      spaceMap.set(normalizeSpaceLookupKey(space.code), { index, space });
    }
  });

  const expectedReciprocalSignatures = new Set<string>();

  const findSpaceByReference = (idOrName: string): { index: number; space: SpaceLike } | undefined =>
    spaceMap.get(normalizeSpaceLookupKey(idOrName));

  const leadsBackToSource = (door: DoorLike, sourceSpace: SpaceLike): boolean => {
    return door.leads_to === sourceSpace.name || door.leads_to === sourceSpace.code;
  };

  const isMatchingManualDoor = (
    door: DoorLike,
    sourceSpace: SpaceLike,
    oppositeWall: DoorLike['wall'],
    reciprocalPosition: number
  ): boolean => {
    return (
      door.is_reciprocal !== true &&
      leadsBackToSource(door, sourceSpace) &&
      door.wall === oppositeWall &&
      Math.abs(door.position_on_wall_ft - reciprocalPosition) < RECIPROCAL_DOOR_POSITION_TOLERANCE_FT
    );
  };

  const findLegacyReciprocalDoorIndex = (
    targetDoors: DoorLike[],
    sourceSpace: SpaceLike,
    oppositeWall: DoorLike['wall'],
    reciprocalPosition: number
  ): number => {
    const legacyCandidates = targetDoors
      .map((door, index) => ({ door, index }))
      .filter(({ door }) =>
        door.is_reciprocal === true &&
        !door.reciprocal_parent_signature &&
        leadsBackToSource(door, sourceSpace) &&
        door.wall === oppositeWall
      )
      .sort((a, b) =>
        Math.abs(a.door.position_on_wall_ft - reciprocalPosition) - Math.abs(b.door.position_on_wall_ft - reciprocalPosition)
      );

    if (legacyCandidates.length !== 1) {
      return -1;
    }

    return legacyCandidates[0].index;
  };

  updatedSpaces.forEach((sourceSpace) => {
    const sourceDoors = sourceSpace.doors || [];

    sourceDoors.forEach((sourceDoor) => {
      if (sourceDoor.is_reciprocal === true || !isMeaningfulDoorTarget(sourceDoor.leads_to)) {
        return;
      }

      const targetLookup = findSpaceByReference(sourceDoor.leads_to);
      if (!targetLookup) {
        console.warn(`[doorSync] Target space "${sourceDoor.leads_to}" not found for door from "${sourceSpace.name}"`);
        return;
      }

      const { index: targetIdx, space: targetSpace } = targetLookup;
      const oppositeWall = getOppositeWall(sourceDoor.wall);
      const reciprocalPosition = calculateReciprocalDoorPosition(sourceSpace, targetSpace, sourceDoor);
      const parentSignature = getReciprocalParentSignature(sourceSpace, sourceDoor);
      expectedReciprocalSignatures.add(parentSignature);

      let targetDoors = updatedSpaces[targetIdx].doors || [];
      const staleTolerance = Math.max(sourceDoor.width_ft, 2);
      targetDoors = targetDoors.filter((door) => {
        if (door.is_reciprocal !== true) {
          return true;
        }

        if (!leadsBackToSource(door, sourceSpace) || door.wall !== oppositeWall) {
          return true;
        }

        if (door.reciprocal_parent_signature === parentSignature) {
          return true;
        }

        return Math.abs(door.position_on_wall_ft - reciprocalPosition) > staleTolerance;
      });
      updatedSpaces[targetIdx].doors = targetDoors;

      const manualDoorAlreadyHandlesPair = targetDoors.some(door =>
        isMatchingManualDoor(door, sourceSpace, oppositeWall, reciprocalPosition)
      );

      if (manualDoorAlreadyHandlesPair) {
        updatedSpaces[targetIdx].doors = targetDoors.filter((door) => {
          if (door.is_reciprocal !== true) {
            return true;
          }

          if (door.reciprocal_parent_signature === parentSignature) {
            return false;
          }

          return !(
            !door.reciprocal_parent_signature &&
            leadsBackToSource(door, sourceSpace) &&
            door.wall === oppositeWall
          );
        });
        return;
      }

      let reciprocalDoorIndex = targetDoors.findIndex(door =>
        door.is_reciprocal === true &&
        door.reciprocal_parent_signature === parentSignature
      );

      if (reciprocalDoorIndex === -1) {
        reciprocalDoorIndex = findLegacyReciprocalDoorIndex(targetDoors, sourceSpace, oppositeWall, reciprocalPosition);
      }

      const baseReciprocalDoor: DoorLike = {
        wall: oppositeWall,
        position_on_wall_ft: reciprocalPosition,
        width_ft: sourceDoor.width_ft,
        leads_to: sourceSpace.name,
        style: sourceDoor.style,
        door_type: sourceDoor.door_type,
        material: sourceDoor.material,
        state: sourceDoor.state,
        color: sourceDoor.color,
        is_reciprocal: true,
        reciprocal_parent_signature: parentSignature,
      };

      if (reciprocalDoorIndex !== -1) {
        const existingDoor = targetDoors[reciprocalDoorIndex];
        let updatedDoor: DoorLike = {
          ...existingDoor,
          ...baseReciprocalDoor,
          position_on_wall_ft: existingDoor.position_on_wall_ft,
        };

        let validation = validateDoorWithIgnore(updatedSpaces[targetIdx], updatedDoor, reciprocalDoorIndex);

        if (!validation.valid) {
          updatedDoor = { ...updatedDoor, position_on_wall_ft: reciprocalPosition };
          validation = validateDoorWithIgnore(updatedSpaces[targetIdx], updatedDoor, reciprocalDoorIndex);
        }

        if (!validation.valid) {
          const alternatePosition = findNonConflictingPosition(
            updatedSpaces[targetIdx],
            updatedDoor,
            reciprocalPosition,
            reciprocalDoorIndex
          );

          if (alternatePosition !== null) {
            updatedDoor = { ...updatedDoor, position_on_wall_ft: alternatePosition };
            validation = validateDoorWithIgnore(updatedSpaces[targetIdx], updatedDoor, reciprocalDoorIndex);
          }
        }

        if (validation.valid) {
          targetDoors[reciprocalDoorIndex] = updatedDoor;
          updatedSpaces[targetIdx].doors = targetDoors;
          console.log(
            `[doorSync] ✓ Updated reciprocal door: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${updatedDoor.position_on_wall_ft.toFixed(1)}ft`
          );
        } else {
          console.error(`[doorSync] ✗ Cannot update reciprocal door: ${targetSpace.name} → ${sourceSpace.name}`);
          validation.errors.forEach((error, idx) => {
            console.error(`[doorSync]   Error ${idx + 1}: ${error}`);
          });
        }

        return;
      }

      const reciprocalDoor: DoorLike = { ...baseReciprocalDoor };
      let validation = validateDoor(updatedSpaces[targetIdx], reciprocalDoor);

      if (!validation.valid) {
        const alternatePosition = findNonConflictingPosition(
          updatedSpaces[targetIdx],
          reciprocalDoor,
          reciprocalPosition
        );

        if (alternatePosition !== null) {
          reciprocalDoor.position_on_wall_ft = alternatePosition;
          validation = validateDoor(updatedSpaces[targetIdx], reciprocalDoor);
        }
      }

      if (validation.valid) {
        updatedSpaces[targetIdx].doors = [...(updatedSpaces[targetIdx].doors || []), reciprocalDoor];
        console.log(
          `[doorSync] ✓ Created reciprocal door: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${reciprocalDoor.position_on_wall_ft.toFixed(1)}ft`
        );
      } else {
        console.error(`[doorSync] ✗ Cannot create reciprocal door: ${targetSpace.name} → ${sourceSpace.name}`);
        validation.errors.forEach((error, idx) => {
          console.error(`[doorSync]   Error ${idx + 1}: ${error}`);
        });
      }
    });
  });

  updatedSpaces.forEach((space) => {
    const currentDoors = space.doors || [];
    space.doors = currentDoors.filter((door) => {
      if (door.is_reciprocal !== true) {
        return true;
      }

      if (!door.reciprocal_parent_signature) {
        return false;
      }

      return expectedReciprocalSignatures.has(door.reciprocal_parent_signature);
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
