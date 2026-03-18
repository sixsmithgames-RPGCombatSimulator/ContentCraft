import { describe, expect, it } from 'vitest';
import {
  getWorkflowStageDefinition,
  getWorkflowStageProxyAllowedKeys,
  isWorkflowStageCriticalZeroGuard,
  normalizeWorkflowStageId,
  resolveWorkflowStageKey,
} from './workflowRegistry';

describe('workflowRegistry', () => {
  it('normalizes canonical and aliased stage ids through the shared registry', () => {
    expect(normalizeWorkflowStageId('Creator: Basic Info')).toBe('basic_info');
    expect(normalizeWorkflowStageId('monster_basic_info')).toBe('monster.basic_info');
  });

  it('returns proxy allowed keys for shared registry stage contracts', () => {
    expect(getWorkflowStageProxyAllowedKeys('item.mechanics')).toEqual(
      expect.arrayContaining(['properties', 'charges', 'spells']),
    );
    expect(getWorkflowStageProxyAllowedKeys('encounter.concept')).toEqual(
      expect.arrayContaining(['title', 'description', 'xp_budget']),
    );
  });

  it('preserves zero-guard behavior for strict NPC stages and resolves scoped aliases', () => {
    expect(isWorkflowStageCriticalZeroGuard('basic_info')).toBe(true);
    expect(resolveWorkflowStageKey('encounter', 'concept')).toBe('encounter.concept');
    expect(resolveWorkflowStageKey('item', 'concept')).toBe('item.concept');
  });

  it('resolves canonical writing stages through the shared registry for non-tabletop workflows', () => {
    expect(resolveWorkflowStageKey('nonfiction', 'Outline & Structure')).toBe('outline_&_structure');
    expect(resolveWorkflowStageKey('nonfiction', 'Draft')).toBe('draft');
    expect(resolveWorkflowStageKey('nonfiction', 'Editor & Style')).toBe('editor_&_style');
    expect(getWorkflowStageDefinition('nonfiction', 'outline_&_structure')?.key).toBe('outline_&_structure');
    expect(getWorkflowStageDefinition('outline', 'editorAndStyle')?.key).toBe('editor_&_style');
  });

  it('resolves the live generic scene workflow stages through the shared registry', () => {
    expect(resolveWorkflowStageKey('scene', 'Purpose')).toBe('purpose');
    expect(resolveWorkflowStageKey('scene', 'Fact Checker')).toBe('fact_checker');
    expect(resolveWorkflowStageKey('scene', 'Stylist')).toBe('stylist');
    expect(resolveWorkflowStageKey('scene', 'Canon Validator')).toBe('canon_validator');
    expect(resolveWorkflowStageKey('scene', 'Physics Validator')).toBe('physics_validator');
    expect(getWorkflowStageDefinition('scene', 'purpose')?.contract?.outputAllowedKeys).toEqual(
      expect.arrayContaining(['content_type', 'generation_mode', 'game_system']),
    );
  });
});
