import { compileFromFile } from 'json-schema-to-typescript';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

async function main() {
  const schemaPath = resolve('schema/encounter/v1.json');
  const schemaDir = dirname(schemaPath);
  const outputPath = resolve('client/src/types/encounter/generated.ts');

  const ts = await compileFromFile(schemaPath, {
    cwd: schemaDir,
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, ts);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
