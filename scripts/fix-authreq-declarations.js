/**
 * Script to add authReq declarations to route handlers that use it but don't declare it
 *
 * © 2025 Sixsmith Games. All rights reserved.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const routesDir = './src/server/routes';
const filesToFix = ['canon.ts', 'factCheck.ts', 'homebrew.ts'];

function fixAuthReqDeclarations(content) {
  // Pattern: route handler that uses authReq but doesn't declare it
  // Match: async (req: Request, res: Response) => {
  //   try {
  //     (no authReq declaration here)
  //     ... uses authReq.userId somewhere

  const lines = content.split('\n');
  const fixed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    fixed.push(line);

    // Check if this line is a route handler declaration
    if (line.match(/async\s*\(req:\s*Request,\s*res:\s*Response\)/)) {
      // Look ahead to find the try block
      let j = i + 1;
      while (j < lines.length && !lines[j].includes('try {')) {
        fixed.push(lines[j]);
        j++;
        i++;
      }

      if (j < lines.length && lines[j].includes('try {')) {
        fixed.push(lines[j]); // Add the 'try {' line
        i = j;

        // Check if the next non-empty line is the authReq declaration
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') {
          k++;
        }

        // If next line doesn't have authReq declaration, check if function uses authReq
        if (k < lines.length && !lines[k].includes('const authReq')) {
          // Look ahead in the function to see if authReq is used
          let usesAuthReq = false;
          let searchLimit = Math.min(k + 100, lines.length); // Search next 100 lines
          for (let m = k; m < searchLimit; m++) {
            if (lines[m].includes('authReq.userId') || lines[m].includes('authReq.user')) {
              usesAuthReq = true;
              break;
            }
            // Stop if we hit the end of the try block
            if (lines[m].includes('} catch')) {
              break;
            }
          }

          // If function uses authReq, add the declaration
          if (usesAuthReq) {
            const indent = lines[j].match(/^(\s*)/)[1] + '  '; // Match indentation + 2 spaces
            fixed.push(indent + '  const authReq = req as unknown as AuthRequest;');
          }
        }
      }
    }
  }

  return fixed.join('\n');
}

function fixFile(filename) {
  const filePath = join(routesDir, filename);

  try {
    let content = readFileSync(filePath, 'utf8');
    const original = content;

    content = fixAuthReqDeclarations(content);

    if (content === original) {
      console.log(`⏭️  ${filename}: No changes needed`);
      return false;
    }

    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${filename}: Added missing authReq declarations`);
    return true;
  } catch (error) {
    console.error(`❌ ${filename}: Error - ${error.message}`);
    return false;
  }
}

console.log('🚀 Fixing missing authReq declarations...\\n');

let fixed = 0;
for (const file of filesToFix) {
  if (fixFile(file)) {
    fixed++;
  }
}

console.log(`\\n📊 Fixed ${fixed} file(s)\\n`);
