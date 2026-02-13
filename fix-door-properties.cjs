/**
 * Fix malformed door properties in session files
 *
 * Converts:
 * - door.position → door.position_on_wall_ft
 * - door.width → door.width_ft
 */

const fs = require('fs');
const path = require('path');

const GENERATION_PROGRESS_DIR = './generation-progress';

function fixDoorProperties(door, roomName, wallLength) {
  let modified = false;
  const fixes = [];

  // Fix width property
  if (door.hasOwnProperty('width') && !door.hasOwnProperty('width_ft')) {
    door.width_ft = door.width;
    delete door.width;
    fixes.push(`Converted width (${door.width_ft}ft) → width_ft`);
    modified = true;
  }

  // Fix position property
  if (door.hasOwnProperty('position') && !door.hasOwnProperty('position_on_wall_ft')) {
    // 'position' is often a decimal (0.0-1.0) representing relative position
    // Convert to absolute feet: position * wallLength
    const relativePosition = door.position;
    if (relativePosition >= 0 && relativePosition <= 1) {
      door.position_on_wall_ft = relativePosition * wallLength;
      fixes.push(`Converted position (${relativePosition.toFixed(2)} relative) → position_on_wall_ft (${door.position_on_wall_ft.toFixed(1)}ft absolute)`);
    } else {
      // Already in feet, just rename
      door.position_on_wall_ft = relativePosition;
      fixes.push(`Renamed position → position_on_wall_ft (${door.position_on_wall_ft.toFixed(1)}ft)`);
    }
    delete door.position;
    modified = true;
  }

  // Ensure door has position_on_wall_ft - if still missing, add default at center
  if (!door.hasOwnProperty('position_on_wall_ft')) {
    door.position_on_wall_ft = wallLength / 2;
    fixes.push(`Added missing position_on_wall_ft (${door.position_on_wall_ft.toFixed(1)}ft - centered)`);
    modified = true;
  }

  if (fixes.length > 0) {
    console.log(`  ${roomName} → ${door.leads_to} (${door.wall} wall):`);
    fixes.forEach(fix => console.log(`    - ${fix}`));
  }

  return modified;
}

function getWallLength(space, wall) {
  const size = space.size_ft || space.dimensions;
  if (!size) {
    console.warn(`Warning: Space "${space.name}" has no size_ft or dimensions`);
    return 50; // Default fallback
  }

  const width = size.width;
  const height = size.height;

  switch (wall) {
    case 'north':
    case 'south':
      return width;
    case 'east':
    case 'west':
      return height;
    default:
      console.warn(`Warning: Unknown wall "${wall}"`);
      return 50;
  }
}

function fixSessionFile(filePath) {
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

  let totalModified = false;
  const spaces = data.liveMapSpaces || [];

  if (spaces.length === 0) {
    console.log('No liveMapSpaces found in this file.');
    return false;
  }

  console.log(`Found ${spaces.length} spaces\n`);

  spaces.forEach((space, spaceIndex) => {
    const doors = space.doors || [];
    if (doors.length === 0) return;

    let spaceModified = false;

    doors.forEach((door, doorIndex) => {
      const wallLength = getWallLength(space, door.wall);
      const modified = fixDoorProperties(door, space.name, wallLength);
      if (modified) {
        spaceModified = true;
        totalModified = true;
      }
    });
  });

  if (totalModified) {
    // Create backup
    const backupPath = filePath + '.backup';
    try {
      fs.copyFileSync(filePath, backupPath);
      console.log(`\n✓ Backup created: ${path.basename(backupPath)}`);
    } catch (err) {
      console.error(`Error creating backup: ${err.message}`);
      return false;
    }

    // Write fixed data
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✓ Fixed file written: ${path.basename(filePath)}`);
      return true;
    } catch (err) {
      console.error(`Error writing file: ${err.message}`);
      return false;
    }
  } else {
    console.log('No changes needed for this file.');
    return false;
  }
}

function main() {
  console.log('Door Properties Fixer');
  console.log('=====================\n');
  console.log('This script will fix malformed door properties in session files:');
  console.log('  - Converts "width" → "width_ft"');
  console.log('  - Converts "position" → "position_on_wall_ft"');
  console.log('  - Adds missing "position_on_wall_ft" with centered default\n');

  if (!fs.existsSync(GENERATION_PROGRESS_DIR)) {
    console.error(`Error: Directory not found: ${GENERATION_PROGRESS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(GENERATION_PROGRESS_DIR)
    .filter(f => f.endsWith('.json') && !f.endsWith('.backup'))
    .map(f => path.join(GENERATION_PROGRESS_DIR, f));

  if (files.length === 0) {
    console.log('No JSON files found.');
    return;
  }

  console.log(`Found ${files.length} JSON files to process.\n`);

  let fixedCount = 0;
  files.forEach(filePath => {
    if (fixSessionFile(filePath)) {
      fixedCount++;
    }
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total files processed: ${files.length}`);
  console.log(`Files modified: ${fixedCount}`);
  console.log(`Files unchanged: ${files.length - fixedCount}`);
  console.log('\n✓ Done!');
}

main();
