/**
 * Script to add multi-tenancy (userId filtering) to all remaining route files
 *
 * © 2025 Sixsmith Games. All rights reserved.
 *
 * This script updates route files that don't yet have userId filtering:
 * - Adds AuthRequest type casting
 * - Adds userId to MongoDB filter objects
 *
 * Run with: node scripts/add-multi-tenancy-to-routes.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const routesDir = './src/server/routes';

// Files that still need userId filtering
const filesToUpdate = [
  'canon.ts',    // Partially done, needs completion
  'runs.ts',
  'npcRecords.ts',
  'factCheck.ts',
  'homebrew.ts',
  'upload.ts',
  'progress.ts',
  'ai.ts',
];

function addAuthReqCasting(content) {
  // Pattern: async (req: Request, res: Response)
  // Replace with: async (req: Request, res: Response) with authReq cast added at start

  // Find function signatures and add authReq casting at the beginning of try blocks
  return content.replace(
    /(Router\.(?:get|post|put|delete|patch)\([^)]+\),?\s*async\s*\(req:\s*Request,\s*res:\s*Response\)\s*=>\s*\{\s*try\s*\{)/g,
    (match) => {
      // Check if authReq is already defined
      if (match.includes('authReq')) return match;
      return match + '\n    const authReq = req as unknown as AuthRequest;';
    }
  );
}

function addUserIdToFilters(content) {
  // Add userId to filter objects
  // Pattern: const filter: any = {};
  // Replace with: const filter: any = { userId: authReq.userId };

  content = content.replace(
    /const filter:\s*any\s*=\s*\{\s*\};/g,
    'const filter: any = { userId: authReq.userId };'
  );

  // Pattern: collection.find({})
  // Replace with: collection.find({ userId: authReq.userId })
  content = content.replace(
    /collection\.find\(\{\s*\}\)/g,
    'collection.find({ userId: authReq.userId })'
  );

  // Pattern: collection.findOne({ _id: id })
  // Replace with: collection.findOne({ _id: id, userId: authReq.userId })
  content = content.replace(
    /collection\.findOne\(\{\s*_id:\s*(\w+)\s*\}\)/g,
    'collection.findOne({ _id: $1, userId: authReq.userId })'
  );

  // Pattern: collection.updateOne({ _id: id }, ...)
  // Replace with: collection.updateOne({ _id: id, userId: authReq.userId }, ...)
  content = content.replace(
    /collection\.updateOne\(\s*\{\s*_id:\s*(\w+)\s*\},/g,
    'collection.updateOne({ _id: $1, userId: authReq.userId },'
  );

  // Pattern: collection.deleteOne({ _id: id })
  // Replace with: collection.deleteOne({ _id: id, userId: authReq.userId })
  content = content.replace(
    /collection\.deleteOne\(\{\s*_id:\s*(\w+)\s*\}\)/g,
    'collection.deleteOne({ _id: $1, userId: authReq.userId })'
  );

  return content;
}

function updateRouteFile(filename) {
  const filePath = join(routesDir, filename);

  try {
    let content = readFileSync(filePath, 'utf8');
    const original = content;

    // Add authReq casting to route handlers
    content = addAuthReqCasting(content);

    // Add userId to MongoDB filter objects
    content = addUserIdToFilters(content);

    // Check if file actually changed
    if (content === original) {
      console.log(`⏭️  ${filename}: No changes needed (or already updated)`);
      return false;
    }

    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${filename}: Updated with userId filtering`);
    return true;
  } catch (error) {
    console.error(`❌ ${filename}: Error - ${error.message}`);
    return false;
  }
}

console.log('🚀 Adding multi-tenancy to route files...\n');

let updated = 0;
let skipped = 0;

for (const file of filesToUpdate) {
  if (updateRouteFile(file)) {
    updated++;
  } else {
    skipped++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   ✅ Updated: ${updated} files`);
console.log(`   ⏭️  Skipped: ${skipped} files\n`);

console.log('⚠️  IMPORTANT: Review the changes manually!');
console.log('   Some routes may need special handling for:');
console.log('   - Library entities (scope="lib" might be shared)');
console.log('   - Complex filter conditions');
console.log('   - Nested queries\n');
