/**
 * Location Geometry Validation - Detects spatial conflicts and generates proposals
 *
 * Validates that spaces fit within parent structures, connections are valid,
 * and vertical relationships make sense.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  getOppositeWall,
  projectDoorPositionToTargetWallFt,
} from './locationMapGeometry';

type Wall = 'north' | 'south' | 'east' | 'west';

interface Space {
  name: string;
  dimensions?: string | { width: number; height: number; unit?: string };
  width?: number;
  length?: number;
  area?: number;
  floor?: number | string;
  connections?: string[];
  vertical_connections?: string[];
  parent_structure?: string;
  wall_thickness_ft?: number;
  wall_material?: string;
  doors?: DoorGeometry[];
}

interface DoorGeometry {
  wall: Wall;
  position_on_wall_ft: number;
  width_ft: number;
  leads_to: string;
}

export interface GeometryProposal {
  type: 'question' | 'warning' | 'error';
  category: 'dimensions' | 'connections' | 'vertical' | 'parent_fit' | 'doors' | 'wall_thickness';
  question: string;
  options: string[];
  context?: string;
}

interface ValidationResult {
  isValid: boolean;
  proposals: GeometryProposal[];
  warnings: string[];
}

export interface ParentStructure {
  total_floors?: number;
  total_area?: number;
  layout?: string;
}

const DOOR_ALIGNMENT_TOLERANCE_FT = 1;
const WALL_THICKNESS_VARIANCE_FT = 4;

/**
 * Validates a newly generated space against existing spaces and parent structure
 */
export function validateSpaceGeometry(
  newSpace: Space,
  existingSpaces: Space[],
  parentStructure?: ParentStructure
): ValidationResult {
  const proposals: GeometryProposal[] = [];
  const warnings: string[] = [];

  // 1. Validate dimensions format
  if (newSpace.dimensions) {
    const dimProposal = validateDimensions(newSpace);
    if (dimProposal) proposals.push(dimProposal);
  }

  // 2. Check if space fits within parent structure
  if (parentStructure && parentStructure.total_area) {
    const areaProposal = checkParentAreaFit(newSpace, existingSpaces, parentStructure.total_area);
    if (areaProposal) proposals.push(areaProposal);
  }

  // 3. Validate connections exist
  if (newSpace.connections && newSpace.connections.length > 0) {
    const connectionProposals = validateConnections(newSpace, existingSpaces);
    proposals.push(...connectionProposals);
  }

  // 3b. Validate door bounds, reciprocal pairs, and wall-thickness drift
  if (newSpace.doors && newSpace.doors.length > 0) {
    const doorProposals = validateDoorGeometry(newSpace, existingSpaces);
    proposals.push(...doorProposals);
  }

  // 4. Validate vertical connections (stairs, elevators)
  if (newSpace.vertical_connections && newSpace.vertical_connections.length > 0) {
    const verticalProposals = validateVerticalConnections(newSpace, existingSpaces, parentStructure?.total_floors);
    proposals.push(...verticalProposals);
  }

  // 5. Check for duplicate names
  const duplicateProposal = checkDuplicateNames(newSpace, existingSpaces);
  if (duplicateProposal) proposals.push(duplicateProposal);

  return {
    isValid: proposals.length === 0,
    proposals,
    warnings,
  };
}

/**
 * Validates dimension format and extracts numeric values
 */
function validateDimensions(space: Space): GeometryProposal | null {
  if (!space.dimensions) return null;

  // Handle new object format
  if (typeof space.dimensions === 'object') {
    const dims = space.dimensions;
    if (dims.width && dims.height && typeof dims.width === 'number' && typeof dims.height === 'number') {
      // Valid object format
      return null;
    }
    // Invalid object format
    return {
      type: 'error',
      category: 'dimensions',
      question: `Dimensions object is invalid: ${JSON.stringify(dims)}. Should be { width: number, height: number, unit: "ft" }`,
      options: ['Retry with correct format', 'Continue anyway'],
    };
  }

  // Handle string format
  const dimStr = space.dimensions.toLowerCase();

  // Try to parse dimensions like "50×30 ft", "20x40", "100 sq ft"
  const patterns = [
    /(\d+)\s*[×x]\s*(\d+)/,  // 50×30 or 50x30
    /(\d+)\s*sq\s*ft/i,       // 100 sq ft
    /(\d+)\s*×\s*(\d+)\s*ft/, // 50 × 30 ft
  ];

  let matched = false;
  for (const pattern of patterns) {
    if (pattern.test(dimStr)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    // Format dimensions for display
    const dimDisplay = String(space.dimensions);

    return {
      type: 'warning',
      category: 'dimensions',
      question: `The dimensions "${dimDisplay}" for "${space.name}" don't match expected format. Should we standardize this?`,
      options: [
        'Convert to "width×length ft" format',
        'Keep as-is',
        'Remove dimensions (calculate from area)',
      ],
      context: 'Standard formats: "50×30 ft", "50x30", or "1500 sq ft"',
    };
  }

  return null;
}

/**
 * Checks if the cumulative area of spaces exceeds parent structure
 */
function checkParentAreaFit(
  newSpace: Space,
  existingSpaces: Space[],
  totalParentArea: number
): GeometryProposal | null {
  const newSpaceArea = calculateArea(newSpace);
  if (!newSpaceArea) return null;

  const existingTotalArea = existingSpaces.reduce((sum, space) => {
    return sum + (calculateArea(space) || 0);
  }, 0);

  const cumulativeArea = existingTotalArea + newSpaceArea;
  const percentUsed = (cumulativeArea / totalParentArea) * 100;

  if (percentUsed > 100) {
    return {
      type: 'error',
      category: 'parent_fit',
      question: `Total area (${Math.round(cumulativeArea)} sq ft) exceeds parent structure (${totalParentArea} sq ft) by ${Math.round(percentUsed - 100)}%. How should we resolve this?`,
      options: [
        'Reduce size of this space to fit',
        'Expand parent structure to accommodate',
        'Overlap spaces (shared areas)',
        'Continue anyway (may be multi-floor)',
      ],
      context: `Current space uses ${Math.round((newSpaceArea / totalParentArea) * 100)}% of remaining area`,
    };
  } else if (percentUsed > 90) {
    return {
      type: 'warning',
      category: 'parent_fit',
      question: `We're at ${Math.round(percentUsed)}% capacity. Only ${Math.round(totalParentArea - cumulativeArea)} sq ft remains. Should we adjust remaining spaces?`,
      options: [
        'Continue as planned',
        'Reduce size of future spaces',
        'Add another floor',
      ],
    };
  }

  return null;
}

/**
 * Validates that connections reference existing spaces
 */
function validateConnections(newSpace: Space, existingSpaces: Space[]): GeometryProposal[] {
  if (!newSpace.connections || newSpace.connections.length === 0) return [];

  const existingNames = existingSpaces.map(s => s.name.toLowerCase());
  const proposals: GeometryProposal[] = [];

  for (const connection of newSpace.connections) {
    const connectionLower = connection.toLowerCase();

    // Check if connection exists
    if (!existingNames.includes(connectionLower) && connectionLower !== 'entrance' && connectionLower !== 'exterior') {
      // Try to find similar names (typo detection)
      const similar = existingSpaces.find(s =>
        s.name.toLowerCase().includes(connectionLower) ||
        connectionLower.includes(s.name.toLowerCase())
      );

      if (similar) {
        proposals.push({
          type: 'question',
          category: 'connections',
          question: `"${newSpace.name}" connects to "${connection}", but we don't have that space yet. Did you mean "${similar.name}"?`,
          options: [
            `Yes, connect to "${similar.name}"`,
            'No, this is a future space',
            'Remove this connection',
          ],
        });
      } else {
        proposals.push({
          type: 'warning',
          category: 'connections',
          question: `"${newSpace.name}" connects to "${connection}", which doesn't exist yet. Is this correct?`,
          options: [
            'Yes, will be generated later',
            'No, remove this connection',
            'Connect to a different space',
          ],
        });
      }
    }
  }

  return proposals;
}

function getSpaceSizeFt(space: Space): { width: number; height: number } | null {
  if (space.width && space.length) {
    return { width: space.width, height: space.length };
  }

  if (space.dimensions) {
    if (typeof space.dimensions === 'object') {
      const dims = space.dimensions;
      if (dims.width && dims.height && typeof dims.width === 'number' && typeof dims.height === 'number') {
        return { width: dims.width, height: dims.height };
      }
    } else {
      const rectMatch = space.dimensions.toLowerCase().match(/(\d+)\s*[×x]\s*(\d+)/);
      if (rectMatch) {
        return {
          width: parseInt(rectMatch[1]),
          height: parseInt(rectMatch[2]),
        };
      }
    }
  }

  return null;
}

function getWallLengthFt(space: Space, wall: Wall): number | null {
  const sizeFt = getSpaceSizeFt(space);
  if (!sizeFt) return null;

  return wall === 'north' || wall === 'south' ? sizeFt.width : sizeFt.height;
}

function isMeaningfulDoorTarget(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'pending' && normalized !== 'outside' && normalized !== 'entrance';
}

function validateDoorBounds(space: Space, door: DoorGeometry): GeometryProposal | null {
  const wallLength = getWallLengthFt(space, door.wall);
  if (!wallLength) {
    return null;
  }

  if (door.width_ft > wallLength) {
    return {
      type: 'error',
      category: 'doors',
      question: `Door on "${space.name}" is ${door.width_ft}ft wide, which exceeds the ${door.wall} wall length of ${wallLength}ft. How should we resolve this?`,
      options: [
        'Reduce the door width',
        'Move the door to a longer wall',
        'Resize the room',
      ],
    };
  }

  const halfWidth = door.width_ft / 2;
  const leftEdge = door.position_on_wall_ft - halfWidth;
  const rightEdge = door.position_on_wall_ft + halfWidth;

  if (leftEdge < 0 || rightEdge > wallLength) {
    return {
      type: 'error',
      category: 'doors',
      question: `Door on "${space.name}" extends beyond the ${door.wall} wall bounds. Should we move it inward or resize the wall?`,
      options: [
        'Move the door inward',
        'Reduce the door width',
        'Resize the room',
      ],
      context: `Valid door-center range on this wall is ${halfWidth.toFixed(1)}ft to ${(wallLength - halfWidth).toFixed(1)}ft.`,
    };
  }

  return null;
}

function findSpaceByName(name: string, spaces: Space[]): Space | undefined {
  return spaces.find((space) => space.name.toLowerCase() === name.toLowerCase());
}

function getDoorPairDistance(sourceDoor: DoorGeometry, targetDoor: DoorGeometry, sourceSpace: Space, targetSpace: Space): number {
  const sourceSize = getSpaceSizeFt(sourceSpace);
  const targetSize = getSpaceSizeFt(targetSpace);
  if (!sourceSize || !targetSize) {
    return Number.POSITIVE_INFINITY;
  }

  const projectedPosition = projectDoorPositionToTargetWallFt(
    { size_ft: sourceSize },
    { size_ft: targetSize },
    sourceDoor,
  );

  const wallPenalty = targetDoor.wall === getOppositeWall(sourceDoor.wall) ? 0 : 1000;
  return wallPenalty + Math.abs(targetDoor.position_on_wall_ft - projectedPosition);
}

function validateDoorGeometry(newSpace: Space, existingSpaces: Space[]): GeometryProposal[] {
  if (!newSpace.doors || newSpace.doors.length === 0) return [];

  const proposals: GeometryProposal[] = [];
  const sourceDoorsByTarget = new Map<string, DoorGeometry[]>();
  const sourceSpaceSize = getSpaceSizeFt(newSpace);
  const wallThicknessCheckedTargets = new Set<string>();

  for (const door of newSpace.doors) {
    const boundsProposal = validateDoorBounds(newSpace, door);
    if (boundsProposal) {
      proposals.push(boundsProposal);
    }

    if (!isMeaningfulDoorTarget(door.leads_to)) {
      continue;
    }

    const targetKey = door.leads_to.toLowerCase();
    const doorsForTarget = sourceDoorsByTarget.get(targetKey);
    if (doorsForTarget) {
      doorsForTarget.push(door);
    } else {
      sourceDoorsByTarget.set(targetKey, [door]);
    }
  }

  for (const [targetKey, sourceDoors] of sourceDoorsByTarget.entries()) {
    const targetSpace = findSpaceByName(sourceDoors[0].leads_to, existingSpaces);
    if (!targetSpace) {
      continue;
    }

    const returnDoors = (targetSpace.doors || []).filter((door) => door.leads_to.toLowerCase() === newSpace.name.toLowerCase());
    const targetSpaceSize = getSpaceSizeFt(targetSpace);

    if (returnDoors.length === 0) {
      proposals.push({
        type: 'warning',
        category: 'doors',
        question: `"${newSpace.name}" has ${sourceDoors.length} door${sourceDoors.length === 1 ? '' : 's'} leading to "${targetSpace.name}", but "${targetSpace.name}" does not have a paired return door yet. Should we add one?`,
        options: [
          'Add matching return door(s)',
          'Leave it for the map editor',
          'Keep this as a one-way/open connection',
        ],
      });
    } else {
      if (returnDoors.length < sourceDoors.length) {
        proposals.push({
          type: 'warning',
          category: 'doors',
          question: `"${newSpace.name}" has ${sourceDoors.length} door${sourceDoors.length === 1 ? '' : 's'} to "${targetSpace.name}", but "${targetSpace.name}" only has ${returnDoors.length} matching return door${returnDoors.length === 1 ? '' : 's'}. Should we pair the extras?`,
          options: [
            'Add more paired doors',
            'Consolidate to fewer doors',
            'Keep and fix later in the editor',
          ],
        });
      }

      const availableDoorIndexes = returnDoors.map((_, index) => index);

      for (const sourceDoor of sourceDoors) {
        if (!sourceSpaceSize || !targetSpaceSize || availableDoorIndexes.length === 0) {
          continue;
        }

        let bestDoorIndex = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const candidateIndex of availableDoorIndexes) {
          const distance = getDoorPairDistance(sourceDoor, returnDoors[candidateIndex], newSpace, targetSpace);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestDoorIndex = candidateIndex;
          }
        }

        if (bestDoorIndex === -1) {
          continue;
        }

        const matchedDoor = returnDoors[bestDoorIndex];
        availableDoorIndexes.splice(availableDoorIndexes.indexOf(bestDoorIndex), 1);

        const expectedWall = getOppositeWall(sourceDoor.wall);
        const expectedPosition = projectDoorPositionToTargetWallFt(
          { size_ft: sourceSpaceSize },
          { size_ft: targetSpaceSize },
          sourceDoor,
        );

        if (matchedDoor.wall !== expectedWall) {
          proposals.push({
            type: 'warning',
            category: 'doors',
            question: `Door pairing between "${newSpace.name}" and "${targetSpace.name}" looks inconsistent: the return door is on the ${matchedDoor.wall} wall, but it should usually be on the ${expectedWall} wall. Should we realign it?`,
            options: [
              `Move the return door to the ${expectedWall} wall`,
              'Keep this unusual layout',
              'Fix it in the editor',
            ],
          });
        } else if (Math.abs(matchedDoor.position_on_wall_ft - expectedPosition) > DOOR_ALIGNMENT_TOLERANCE_FT) {
          proposals.push({
            type: 'warning',
            category: 'doors',
            question: `Paired doors between "${newSpace.name}" and "${targetSpace.name}" are offset (${sourceDoor.position_on_wall_ft.toFixed(1)}ft vs ${matchedDoor.position_on_wall_ft.toFixed(1)}ft projected to ${expectedPosition.toFixed(1)}ft). Should we align them?`,
            options: [
              'Align the paired doors',
              'Keep the offset intentionally',
              'Fix it in the editor',
            ],
          });
        }
      }
    }

    if (
      !wallThicknessCheckedTargets.has(targetKey) &&
      typeof newSpace.wall_thickness_ft === 'number' &&
      typeof targetSpace.wall_thickness_ft === 'number'
    ) {
      wallThicknessCheckedTargets.add(targetKey);

      const thicknessDifference = Math.abs(newSpace.wall_thickness_ft - targetSpace.wall_thickness_ft);
      if (thicknessDifference >= WALL_THICKNESS_VARIANCE_FT) {
        proposals.push({
          type: 'warning',
          category: 'wall_thickness',
          question: `"${newSpace.name}" uses ${newSpace.wall_thickness_ft}ft walls, but connected space "${targetSpace.name}" uses ${targetSpace.wall_thickness_ft}ft walls. Should connected rooms share a more consistent wall thickness?`,
          options: [
            `Match "${targetSpace.name}" at ${targetSpace.wall_thickness_ft}ft`,
            `Keep "${newSpace.name}" at ${newSpace.wall_thickness_ft}ft`,
            'Use different thicknesses intentionally',
          ],
        });
      }
    }
  }

  return proposals;
}

/**
 * Validates vertical connections (stairs, elevators) across floors
 */
function validateVerticalConnections(
  newSpace: Space,
  existingSpaces: Space[],
  totalFloors?: number
): GeometryProposal[] {
  if (!newSpace.vertical_connections || newSpace.vertical_connections.length === 0) return [];

  const proposals: GeometryProposal[] = [];
  const currentFloor = typeof newSpace.floor === 'number' ? newSpace.floor : parseFloor(newSpace.floor);

  if (currentFloor === null) {
    proposals.push({
      type: 'warning',
      category: 'vertical',
      question: `"${newSpace.name}" has vertical connections but no floor specified. Which floor is this on?`,
      options: totalFloors
        ? Array.from({ length: totalFloors }, (_, i) => `Floor ${i + 1}`)
        : ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3'],
    });
    return proposals;
  }

  // Check if vertical connections make sense
  for (const verticalConn of newSpace.vertical_connections) {
    const connectedSpace = existingSpaces.find(s => s.name.toLowerCase() === verticalConn.toLowerCase());

    if (connectedSpace) {
      const connectedFloor = typeof connectedSpace.floor === 'number'
        ? connectedSpace.floor
        : parseFloor(connectedSpace.floor);

      if (connectedFloor !== null && Math.abs(connectedFloor - currentFloor) > 1) {
        proposals.push({
          type: 'warning',
          category: 'vertical',
          question: `"${newSpace.name}" (floor ${currentFloor}) has a vertical connection to "${verticalConn}" (floor ${connectedFloor}), spanning ${Math.abs(connectedFloor - currentFloor)} floors. Is this correct?`,
          options: [
            'Yes, correct (e.g., elevator shaft)',
            'No, they should be adjacent floors',
            'Remove this connection',
          ],
        });
      }
    }
  }

  return proposals;
}

/**
 * Checks for duplicate space names
 */
function checkDuplicateNames(newSpace: Space, existingSpaces: Space[]): GeometryProposal | null {
  const duplicate = existingSpaces.find(s => s.name.toLowerCase() === newSpace.name.toLowerCase());

  if (duplicate) {
    return {
      type: 'error',
      category: 'dimensions',
      question: `A space named "${newSpace.name}" already exists. Duplicate names will cause confusion. How should we resolve this?`,
      options: [
        `Rename to "${newSpace.name} 2"`,
        `Rename to "${newSpace.name} (${newSpace.floor || 'Alternate'})"`,
        'Enter custom name',
      ],
    };
  }

  return null;
}

/**
 * Calculates area from space dimensions
 */
function calculateArea(space: Space): number | null {
  // If area is directly specified
  if (space.area && typeof space.area === 'number') {
    return space.area;
  }

  const sizeFt = getSpaceSizeFt(space);
  if (sizeFt) {
    return sizeFt.width * sizeFt.height;
  }

  if (space.dimensions && typeof space.dimensions === 'string') {
    const sqftMatch = space.dimensions.toLowerCase().match(/(\d+)\s*sq\s*ft/i);
    if (sqftMatch) {
      return parseInt(sqftMatch[1]);
    }
  }

  return null;
}

/**
 * Parses floor number from string
 */
function parseFloor(floorStr: string | undefined): number | null {
  if (!floorStr) return null;

  const str = floorStr.toLowerCase();

  if (str.includes('ground') || str.includes('first') || str === '1') return 1;
  if (str.includes('second') || str === '2') return 2;
  if (str.includes('third') || str === '3') return 3;
  if (str.includes('fourth') || str === '4') return 4;
  if (str.includes('basement') || str.includes('cellar')) return 0;

  // Try to extract number
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}
