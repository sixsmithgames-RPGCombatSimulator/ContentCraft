import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version?: unknown };

if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  throw new Error('GameMasterCraft package.json must declare a valid semantic version.');
}

export const GMC_VERSION = manifest.version;
