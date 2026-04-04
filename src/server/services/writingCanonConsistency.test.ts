import { describe, expect, it } from 'vitest';
import { ContentType, type ContentBlock } from '../../shared/types/index.js';
import type { CanonEntity } from '../models/CanonEntity.js';
import { buildWritingCanonProjectReport } from './writingCanonConsistency.js';

const createBlock = (overrides: Partial<ContentBlock> = {}): ContentBlock => ({
  id: 'block-1',
  projectId: 'project-1',
  title: 'Fiblan Notes',
  content: 'Fiblan was born in Stoneharbor. Fiblan has silver hair.',
  type: ContentType.TEXT,
  order: 0,
  metadata: { domain: 'writing' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const createEntity = (claims: string[]): CanonEntity => ({
  _id: 'lib.npc.fiblan',
  userId: 'user-1',
  scope: 'lib',
  type: 'npc',
  canonical_name: 'Fiblan',
  aliases: [],
  claims: claims.map((text, index) => ({
    text,
    source: `test:${index + 1}`,
  })),
  version: '1.0.0',
});

describe('writingCanonConsistency', () => {
  it('flags contradictory writing details against canon attributes', () => {
    const report = buildWritingCanonProjectReport({
      projectId: 'project-1',
      blocks: [createBlock()],
      entities: [
        createEntity([
          'Fiblan was born in Marenport.',
          'Fiblan has black hair.',
        ]),
      ],
      searchedScope: 'project',
    });

    expect(report.summary.conflictCount).toBeGreaterThanOrEqual(2);
    expect(report.summary.reviewRequired).toBe(true);
    expect(report.blocks[0]?.items.some((item) => item.status === 'conflicting')).toBe(true);
  });

  it('marks new draft facts as additive when canon has no matching attribute', () => {
    const report = buildWritingCanonProjectReport({
      projectId: 'project-1',
      blocks: [
        createBlock({
          content: 'Fiblan was born in Marenport. Fiblan is 59 years old.',
        }),
      ],
      entities: [
        createEntity([
          'Fiblan was born in Marenport.',
        ]),
      ],
      searchedScope: 'project',
    });

    expect(report.summary.conflictCount).toBe(0);
    expect(report.summary.additiveCount).toBeGreaterThanOrEqual(1);
    expect(report.blocks[0]?.items.some((item) => item.status === 'additive_unverified')).toBe(true);
  });

  it('stays quiet when the writing does not mention linked canon entities directly', () => {
    const report = buildWritingCanonProjectReport({
      projectId: 'project-1',
      blocks: [
        createBlock({
          title: 'Untitled Notes',
          content: 'A nameless wizard studies in silence.',
        }),
      ],
      entities: [
        createEntity([
          'Fiblan was born in Marenport.',
        ]),
      ],
      searchedScope: 'project',
    });

    expect(report.summary.matchedBlockCount).toBe(0);
    expect(report.summary.flaggedBlockCount).toBe(0);
    expect(report.blocks).toHaveLength(0);
  });
});
