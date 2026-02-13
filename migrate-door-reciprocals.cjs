/**
 * Migrate Door Reciprocals - Add is_reciprocal flags to existing doors
 *
 * This script:
 * 1. Reads all doors from session files
 * 2. Identifies parent doors (removes duplicate reciprocal pairs)
 * 3. Clears all doors from spaces
 * 4. Re-adds parent doors using synchronizeReciprocalDoors logic
 * 5. This automatically creates reciprocal doors with proper is_reciprocal flags
 */

const fs = require('fs');
const path = require('path');

const GENERATION_PROGRESS_DIR = './generation-progress';

/**
 * Get the opposite wall for reciprocal door creation
 */
function getOppositeWall(wall) {
  const opposites = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
  };
  return opposites[wall];
}

/**
 * Calculate reciprocal door position when rooms have different dimensions
 */
function calculateReciprocalDoorPosition(sourceRoom, targetRoom, sourceDoor) {
  const sourceWall = sourceDoor.wall;
  const sourcePosition = sourceDoor.position_on_wall_ft;

  const sourceWallIsHorizontal = sourceWall === 'north' || sourceWall === 'south';
  const sourceDimension = sourceWallIsHorizontal ? sourceRoom.size_ft.width : sourceRoom.size_ft.height;
  const targetDimension = sourceWallIsHorizontal ? targetRoom.size_ft.width : targetRoom.size_ft.height;

  if (sourceDimension === targetDimension) {
    return sourcePosition; // Same wall length - use same position
  }

  // Different wall lengths - use relative position
  const relativePosition = sourcePosition / sourceDimension;
  return relativePosition * targetDimension;
}

/**
 * Identify parent doors from a set of spaces
 * Returns only the "parent" doors, removing reciprocal duplicates
 */
function identifyParentDoors(spaces) {
  const spaceMap = new Map();
  spaces.forEach(space => {
    spaceMap.set(space.name, space);
    if (space.code) spaceMap.set(space.code, space);
  });

  const parentDoors = [];
  const processed = new Set();

  spaces.forEach((space) => {
    const doors = space.doors || [];

    doors.forEach((door) => {
      const leads_to = door.leads_to;

      // Skip if no target or pending/outside
      if (!leads_to || leads_to === 'Pending' || leads_to === 'Outside') {
        // These are always "parent" doors
        parentDoors.push({
          roomName: space.name,
          door: { ...door },
        });
        return;
      }

      // Find target space
      const targetSpace = spaceMap.get(leads_to);
      if (!targetSpace) {
        // Target doesn't exist - treat as parent
        parentDoors.push({
          roomName: space.name,
          door: { ...door },
        });
        return;
      }

      // Calculate expected reciprocal door properties
      const oppositeWall = getOppositeWall(door.wall);
      const reciprocalPosition = calculateReciprocalDoorPosition(space, targetSpace, door);

      // Create unique key for this door pair
      const doorPairKey = [
        `${space.name}|${door.wall}|${door.position_on_wall_ft.toFixed(1)}`,
        `${targetSpace.name}|${oppositeWall}|${reciprocalPosition.toFixed(1)}`
      ].sort().join('↔');

      if (processed.has(doorPairKey)) {
        // Already processed this pair - this is the reciprocal, skip it
        return;
      }

      // Mark this pair as processed
      processed.add(doorPairKey);

      // This is the parent door
      parentDoors.push({
        roomName: space.name,
        door: { ...door },
      });
    });
  });

  return parentDoors;
}

/**
 * Re-implement synchronizeReciprocalDoors from doorSync.ts
 */
function synchronizeReciprocalDoors(spaces) {
  const spaceMap = new Map();
  spaces.forEach(space => {
    spaceMap.set(space.name, space);
    if (space.code) spaceMap.set(space.code, space);
  });

  const updatedSpaces = spaces.map(space => ({ ...space, doors: [...(space.doors || [])] }));

  // Track which specific door pairs we've already processed
  const processed = new Set();

  updatedSpaces.forEach((sourceSpace, sourceIdx) => {
    const doors = sourceSpace.doors || [];

    doors.forEach((sourceDoor, doorIdx) => {
      const leads_to = sourceDoor.leads_to;

      // Skip if no target or pending
      if (!leads_to || leads_to === 'Pending' || leads_to === 'Outside') {
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

      // Create unique key for THIS SPECIFIC door pair
      const doorPairKey = [
        `${sourceSpace.name}|${sourceDoor.wall}|${sourceDoor.position_on_wall_ft.toFixed(1)}`,
        `${targetSpace.name}|${oppositeWall}|${reciprocalPosition.toFixed(1)}`
      ].sort().join('↔');

      if (processed.has(doorPairKey)) {
        return; // Already processed this specific door pair
      }
      processed.add(doorPairKey);

      // Check if THIS SPECIFIC reciprocal door already exists
      const tolerance = 0.5;
      const reciprocalExists = (updatedSpaces[targetIdx].doors || []).some(existingDoor => {
        const leadsBackToSource = existingDoor.leads_to === sourceSpace.name || existingDoor.leads_to === sourceSpace.code;
        const onOppositeWall = existingDoor.wall === oppositeWall;
        const atReciprocalPosition = Math.abs(existingDoor.position_on_wall_ft - reciprocalPosition) < tolerance;
        return leadsBackToSource && onOppositeWall && atReciprocalPosition;
      });

      if (!reciprocalExists) {
        // Create reciprocal door
        const reciprocalDoor = {
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

        updatedSpaces[targetIdx].doors = [...(updatedSpaces[targetIdx].doors || []), reciprocalDoor];
        console.log(`[doorSync] ✓ Created reciprocal door: ${targetSpace.name} → ${sourceSpace.name} on ${oppositeWall} wall at ${reciprocalPosition.toFixed(1)}ft`);
      }
    });
  });

  return updatedSpaces;
}

/**
 * Process a single session file
 */
function migrateSessionFile(filePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing: ${path.basename(filePath)}`);
  console.log('='.repeat(80));

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`Error reading file: ${err.message}`);
    return false;
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error(`Error parsing JSON: ${err.message}`);
    return false;
  }

  const spaces = data.liveMapSpaces || [];

  if (spaces.length === 0) {
    console.log('No liveMapSpaces found in this file.');
    return false;
  }

  console.log(`Found ${spaces.length} spaces`);

  // Count existing doors
  const totalDoors = spaces.reduce((sum, space) => sum + (space.doors?.length || 0), 0);
  console.log(`Total existing doors: ${totalDoors}\n`);

  if (totalDoors === 0) {
    console.log('No doors to migrate.');
    return false;
  }

  // Step 1: Identify parent doors
  console.log('Step 1: Identifying parent doors...');
  const parentDoors = identifyParentDoors(spaces);
  console.log(`Found ${parentDoors.length} parent doors\n`);

  // Step 2: Remove all doors from spaces
  console.log('Step 2: Clearing all doors from spaces...');
  spaces.forEach(space => {
    space.doors = [];
  });

  // Step 3: Re-add parent doors (without is_reciprocal flag)
  console.log('Step 3: Re-adding parent doors...');
  parentDoors.forEach(({ roomName, door }) => {
    const space = spaces.find(s => s.name === roomName);
    if (space) {
      // Remove is_reciprocal flag from parent doors
      const cleanDoor = { ...door };
      delete cleanDoor.is_reciprocal;
      space.doors.push(cleanDoor);
    }
  });

  // Step 4: Run synchronization to create reciprocal doors with proper flags
  console.log('\nStep 4: Synchronizing reciprocal doors...');
  const synchronizedSpaces = synchronizeReciprocalDoors(spaces);

  // Update data
  data.liveMapSpaces = synchronizedSpaces;

  // Count final doors
  const finalDoors = synchronizedSpaces.reduce((sum, space) => sum + (space.doors?.length || 0), 0);
  const reciprocalDoors = synchronizedSpaces.reduce((sum, space) =>
    sum + (space.doors?.filter(d => d.is_reciprocal).length || 0), 0
  );

  console.log(`\n✓ Migration complete:`);
  console.log(`  - Parent doors: ${parentDoors.length}`);
  console.log(`  - Reciprocal doors created: ${reciprocalDoors}`);
  console.log(`  - Total doors: ${finalDoors}`);

  // Create backup
  const backupPath = filePath + '.pre-reciprocal-migration';
  try {
    fs.copyFileSync(filePath, backupPath);
    console.log(`\n✓ Backup created: ${path.basename(backupPath)}`);
  } catch (err) {
    console.error(`Error creating backup: ${err.message}`);
    return false;
  }

  // Write migrated data
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✓ Migrated file written: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`Error writing file: ${err.message}`);
    return false;
  }
}

function main() {
  console.log('Door Reciprocal Migration Tool');
  console.log('==============================\n');
  console.log('This script will:');
  console.log('  1. Identify parent doors in each session');
  console.log('  2. Remove all doors from spaces');
  console.log('  3. Re-add parent doors');
  console.log('  4. Regenerate reciprocal doors with is_reciprocal flags\n');

  if (!fs.existsSync(GENERATION_PROGRESS_DIR)) {
    console.error(`Error: Directory not found: ${GENERATION_PROGRESS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(GENERATION_PROGRESS_DIR)
    .filter(f => f.endsWith('.json') && !f.endsWith('.backup') && !f.endsWith('.pre-reciprocal-migration'))
    .map(f => path.join(GENERATION_PROGRESS_DIR, f));

  if (files.length === 0) {
    console.log('No JSON files found.');
    return;
  }

  console.log(`Found ${files.length} JSON files to process.\n`);

  let migratedCount = 0;
  files.forEach(filePath => {
    if (migrateSessionFile(filePath)) {
      migratedCount++;
    }
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total files processed: ${files.length}`);
  console.log(`Files migrated: ${migratedCount}`);
  console.log(`Files unchanged: ${files.length - migratedCount}`);
  console.log('\n✓ Done!');
}

main();
