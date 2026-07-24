import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GMC_VERSION } from './serviceVersion.js';

describe('GameMasterCraft service version', () => {
  it('matches the canonical root manifest', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(GMC_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(GMC_VERSION).toBe(manifest.version);
  });
});
