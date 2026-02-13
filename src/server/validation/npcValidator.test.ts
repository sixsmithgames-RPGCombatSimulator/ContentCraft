/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { describe, it, expect } from 'vitest';
import { validateNpcSafe } from './npcValidator.js';
import { mapAndValidateNpc } from '../services/npcSchemaMapper.js';

describe('npcValidator.validateNpcSafe', () => {
  it('validates v1.1 NPC with string proposals', () => {
    const npc = {
      schema_version: '1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('treats schema_version variant npc/v1.1 as v1.1', () => {
    const npc = {
      schema_version: 'npc/v1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    // validateNpcSafe validates raw data. v1.1 schema requires schema_version === "1.1" exactly,
    // so variants like "npc/v1.1" should fail. Normalization happens in the mapper.
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('mapAndValidateNpc normalizes schema_version variants and validates as v1.1', () => {
    const npc = {
      schema_version: 'npc/v1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: ['Should this NPC have a secret?'],
    };

    const result = mapAndValidateNpc(npc as unknown as Record<string, unknown>);
    expect(result.success).toBe(true);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.data?.schema_version).toBe('1.1');
  });

  it('validates v1.1 NPC with object proposals', () => {
    const npc = {
      schema_version: '1.1',
      name: 'Test NPC',
      description: 'This is a sufficiently long description.',
      proposals: [{ question: 'Should this NPC have a secret?', answer: 'Yes' }],
    };

    const result = validateNpcSafe(npc);
    expect(result.schemaVersion).toBe('1.1');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('defaults to v1.0 and fails when legacy required fields are missing', () => {
    const legacyNpc = {
      name: 'Legacy NPC',
      description: 'This is a sufficiently long description.',
    };

    const result = validateNpcSafe(legacyNpc);
    expect(result.schemaVersion).toBe('1.0');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
