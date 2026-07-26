import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'src', 'server');
const violations = [];

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      visit(path);
      continue;
    }
    if (!path.endsWith('.ts') || path.includes(`${resolve(root, 'llm-orchestrator', 'providers')}`)) continue;
    const text = readFileSync(path, 'utf8');
    if (/generativelanguage\.googleapis\.com|new\s+OpenAI\s*\(|GoogleGenerativeAI|\.responses\.create\s*\(/.test(text.replace(/^\s*\/\/.*$/gm, ''))) {
      violations.push(path);
    }
  }
}

visit(root);
if (violations.length) {
  process.stderr.write(`Direct provider access is forbidden outside provider adapters:\n${violations.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('Provider boundary valid.\n');
