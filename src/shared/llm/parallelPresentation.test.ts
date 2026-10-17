import { describe, expect, it } from 'vitest';
import { parallelPresentationId, parallelPresentationNodeRefs } from './parallelPresentation.js';

describe('one canonical parallel presentation projection', () => {
  it.each(['gma.semantic-action-program/5', 'gma.semantic-action-program/6'])('preserves original ordering and excludes the unfinished observation in %s', (schemaVersion) => {
    const program = { schemaVersion, nodes: [
      { nodeId: 'move', parallelWith: ['cover'] }, { nodeId: 'cover', parallelWith: ['move', 'observe'] },
      { nodeId: 'observe', parallelWith: ['cover'] } ] };
    const cursor = { readyNodeRefs: ['cover', 'move'], waiting: null }, before = structuredClone({ program, cursor });
    const refs = parallelPresentationNodeRefs(program, cursor, 'move');
    expect(refs).toEqual(['move', 'cover']);
    expect(parallelPresentationNodeRefs(program, cursor, 'cover')).toEqual(refs);
    expect(parallelPresentationId(refs)).toMatch(/^cohort:[a-f0-9]{24}$/);
    expect({ program, cursor }).toEqual(before);
    expect(parallelPresentationNodeRefs(program, { readyNodeRefs: ['cover'], waiting: { nodeRef: 'move' } }, 'move')).toEqual(refs);
    expect(parallelPresentationNodeRefs(program, { readyNodeRefs: ['cover'], waiting: { nodeRef: 'move' } }, 'move', false)).toEqual(['move']);
  });
  it('does not add cohort semantics to historical programs or completed members', () => {
    const nodes = [{ nodeId: 'move', parallelWith: ['cover'] }, { nodeId: 'cover', parallelWith: ['move'] }];
    expect(parallelPresentationNodeRefs({ schemaVersion: 'gma.semantic-action-program/4', nodes }, { readyNodeRefs: ['move', 'cover'] }, 'move')).toEqual(['move']);
    expect(parallelPresentationNodeRefs({ schemaVersion: 'gma.semantic-action-program/6', nodes }, { readyNodeRefs: ['cover'] }, 'cover')).toEqual(['cover']);
    expect(parallelPresentationId(['move'])).toBe('move');
  });
  it('rejects missing owners, foreign nodes and malformed relations without inventing membership', () => {
    expect(() => parallelPresentationNodeRefs(null, {}, 'move')).toThrow();
    expect(() => parallelPresentationNodeRefs({ nodes: [] }, {}, 'foreign')).toThrow();
    expect(() => parallelPresentationNodeRefs({ schemaVersion: 'gma.semantic-action-program/6', nodes: [{ nodeId: 'move', parallelWith: 'cover' }] }, { readyNodeRefs: ['move'] }, 'move')).toThrow();
    expect(() => parallelPresentationId([])).toThrow();
    expect(() => parallelPresentationId(['move', 'move'])).toThrow();
  });
});
