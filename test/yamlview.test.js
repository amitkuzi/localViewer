import { describe, it, expect } from 'vitest';
import { buildTree, smartOpen, scalarText } from '../src/yamlview.js';

describe('buildTree', () => {
  it('wraps a scalar', () => {
    expect(buildTree(42, 'n')).toEqual({ key: 'n', kind: 'scalar', value: 42 });
  });

  it('builds an object node with keyed children', () => {
    const t = buildTree({ a: 1, b: 'x' });
    expect(t.kind).toBe('object');
    expect(t.size).toBe(2);
    expect(t.children.map(c => c.key)).toEqual(['a', 'b']);
    expect(t.children[0]).toEqual({ key: 'a', kind: 'scalar', value: 1 });
  });

  it('builds an array node with index keys', () => {
    const t = buildTree(['x', 'y']);
    expect(t.kind).toBe('array');
    expect(t.size).toBe(2);
    expect(t.children.map(c => c.key)).toEqual([0, 1]);
  });

  it('nests objects and arrays', () => {
    const t = buildTree({ list: [{ id: 1 }] });
    const list = t.children[0];
    expect(list.kind).toBe('array');
    expect(list.children[0].kind).toBe('object');
    expect(list.children[0].children[0]).toEqual({ key: 'id', kind: 'scalar', value: 1 });
  });

  it('treats null as a scalar', () => {
    expect(buildTree(null, 'x')).toEqual({ key: 'x', kind: 'scalar', value: null });
  });
});

describe('smartOpen', () => {
  it('opens shallow, small containers', () => {
    expect(smartOpen({ size: 3 }, 0)).toBe(true);
    expect(smartOpen({ size: 3 }, 1)).toBe(true);
  });
  it('collapses deep containers', () => {
    expect(smartOpen({ size: 3 }, 2)).toBe(false);
  });
  it('collapses large containers even when shallow', () => {
    expect(smartOpen({ size: 21 }, 0)).toBe(false);
  });
  it('does not open empty containers', () => {
    expect(smartOpen({ size: 0 }, 0)).toBe(false);
  });
});

describe('scalarText', () => {
  it('formats primitives', () => {
    expect(scalarText('hi')).toBe('hi');
    expect(scalarText(7)).toBe('7');
    expect(scalarText(true)).toBe('true');
    expect(scalarText(null)).toBe('null');
    expect(scalarText('')).toBe('""');
  });
});
