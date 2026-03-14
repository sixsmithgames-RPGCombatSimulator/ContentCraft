import { describe, expect, it } from 'vitest';
import { createProjectContentLibraryDraft } from './projectContentLibraryMapper';

describe('createProjectContentLibraryDraft', () => {
  it('creates an NPC library draft from structured project content', () => {
    const draft = createProjectContentLibraryDraft(
      {
        _id: 'content-1',
        project_id: 'project-1',
        content_type: 'npc',
        title: 'Thyra Odinson',
        generated_content: {
          name: 'Thyra Odinson',
          personality_traits: ['Protective of travelers'],
        },
        resolved_proposals: [],
        resolved_conflicts: [],
        metadata: {
          structuredContent: {
            type: 'npc',
            data: {
              name: 'Thyra Odinson',
              personality_traits: ['Protective of travelers'],
              goals: ['Guard the northern pass'],
            },
          },
          deliverable: 'npc',
        },
        created_at: new Date('2026-03-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-02T00:00:00.000Z'),
      },
      'project-1',
    );

    expect('entityId' in draft).toBe(true);
    if (!('entityId' in draft)) {
      return;
    }

    expect(draft.entityType).toBe('npc');
    expect(draft.entityId).toBe('lib.npc.thyra_odinson');
    expect(draft.claims.length).toBeGreaterThan(0);
    expect(draft.tags).toContain('generated');
    expect(draft.tags).toContain('project-project-1');
  });

  it('marks unsupported project content clearly', () => {
    const draft = createProjectContentLibraryDraft(
      {
        _id: 'content-2',
        project_id: 'project-1',
        content_type: 'chapter',
        title: 'Chapter One',
        generated_content: { title: 'Chapter One' },
        resolved_proposals: [],
        resolved_conflicts: [],
        metadata: {},
        created_at: new Date('2026-03-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-02T00:00:00.000Z'),
      },
      'project-1',
    );

    expect('entityId' in draft).toBe(false);
    if ('entityId' in draft) {
      return;
    }

    expect(draft.reason).toContain('cannot be promoted');
  });
});
