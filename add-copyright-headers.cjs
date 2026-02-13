/**
 * Copyright Header Addition Script
 *
 * Adds copyright headers to all TypeScript/JavaScript files in the project
 * that don't already have them.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 */

const fs = require('fs');
const path = require('path');

const COPYRIGHT_HEADER = `/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

`;

function shouldProcessFile(filePath) {
  // Skip node_modules, dist, build directories
  if (filePath.includes('node_modules') ||
      filePath.includes('dist') ||
      filePath.includes('build') ||
      filePath.includes('.vite')) {
    return false;
  }

  // Only process TypeScript and JavaScript files
  const ext = path.extname(filePath);
  return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
}

function hasExistingCopyright(content) {
  // Check if file already has Sixsmith Games copyright
  return content.includes('Sixsmith Games') ||
         content.includes('© 2025');
}

function addCopyrightHeader(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has copyright
    if (hasExistingCopyright(content)) {
      console.log(`⏭️  Skipped (already has copyright): ${filePath}`);
      return false;
    }

    // Check if file starts with a comment block
    const hasLeadingComment = content.trimStart().startsWith('/**') ||
                               content.trimStart().startsWith('/*') ||
                               content.trimStart().startsWith('//');

    if (hasLeadingComment) {
      // Find the end of the first comment block
      if (content.trimStart().startsWith('/**')) {
        const endOfComment = content.indexOf('*/');
        if (endOfComment !== -1) {
          // Insert copyright at the end of the existing comment block
          const beforeComment = content.substring(0, endOfComment);
          const afterComment = content.substring(endOfComment);
          content = beforeComment + '\n *\n * © 2025 Sixsmith Games. All rights reserved.\n * This software and associated documentation files are proprietary and confidential.\n ' + afterComment;
        }
      } else {
        // For other comment types, add copyright header before the file
        content = COPYRIGHT_HEADER + content;
      }
    } else {
      // No leading comment, add copyright header at the beginning
      content = COPYRIGHT_HEADER + content;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Added copyright: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function walkDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDirectory(filePath, fileList);
    } else if (shouldProcessFile(filePath)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Main execution
const rootDir = __dirname;
const clientSrcDir = path.join(rootDir, 'client', 'src');
const serverSrcDir = path.join(rootDir, 'src');

console.log('🔍 Scanning for TypeScript/JavaScript files...\n');

let filesProcessed = 0;
let filesSkipped = 0;

// Process client files
if (fs.existsSync(clientSrcDir)) {
  console.log('📁 Processing client/src directory...');
  const clientFiles = walkDirectory(clientSrcDir);
  clientFiles.forEach(file => {
    if (addCopyrightHeader(file)) {
      filesProcessed++;
    } else {
      filesSkipped++;
    }
  });
}

// Process server files
if (fs.existsSync(serverSrcDir)) {
  console.log('\n📁 Processing src directory...');
  const serverFiles = walkDirectory(serverSrcDir);
  serverFiles.forEach(file => {
    if (addCopyrightHeader(file)) {
      filesProcessed++;
    } else {
      filesSkipped++;
    }
  });
}

console.log('\n✨ Copyright header addition complete!');
console.log(`   ✅ Files updated: ${filesProcessed}`);
console.log(`   ⏭️  Files skipped: ${filesSkipped}`);
