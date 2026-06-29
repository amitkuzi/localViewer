// Integration test (jsdom): the YAML view renders collapsible sections and the
// expand/collapse-all controls work.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderYamlValue, setAllOpen } from '../src/yamlview.js';

describe('renderYamlValue (DOM)', () => {
  let tree;
  beforeEach(() => {
    document.body.innerHTML = '<div id="tree"></div>';
    tree = document.getElementById('tree');
  });

  it('renders objects as <details> sections with keys', () => {
    renderYamlValue(tree, { name: 'app', port: 8080 });
    const root = tree.querySelector('details.y-node');
    expect(root).not.toBeNull();
    expect(root.classList.contains('y-object')).toBe(true);
    const keys = [...tree.querySelectorAll('.y-key')].map(k => k.textContent);
    expect(keys).toContain('name');
    expect(keys).toContain('port');
  });

  it('types scalar values for syntax colouring', () => {
    renderYamlValue(tree, { s: 'x', n: 1, b: true, z: null });
    expect(tree.querySelector('.y-val.y-string').textContent).toBe('x');
    expect(tree.querySelector('.y-val.y-number').textContent).toBe('1');
    expect(tree.querySelector('.y-val.y-boolean').textContent).toBe('true');
    expect(tree.querySelector('.y-val.y-null').textContent).toBe('null');
  });

  it('smart-folds: shallow open, deep collapsed by default', () => {
    renderYamlValue(tree, { a: { b: { c: { d: 1 } } } });
    const sections = tree.querySelectorAll('details.y-node');
    // depth 0 and 1 open, depth 2 collapsed
    expect(sections[0].open).toBe(true);
    expect(sections[1].open).toBe(true);
    expect(sections[2].open).toBe(false);
  });

  it('renders empty containers as a flat row, not a section', () => {
    renderYamlValue(tree, { items: [], meta: {} });
    expect(tree.querySelectorAll('.y-empty').length).toBe(2);
  });

  it('setAllOpen expands and collapses every section', () => {
    renderYamlValue(tree, { a: { b: { c: { d: 1 } } } });
    setAllOpen(tree, true);
    expect([...tree.querySelectorAll('details.y-node')].every(d => d.open)).toBe(true);
    setAllOpen(tree, false);
    expect([...tree.querySelectorAll('details.y-node')].some(d => d.open)).toBe(false);
  });

  it('replaces previous content on re-render', () => {
    renderYamlValue(tree, { a: 1 });
    renderYamlValue(tree, { b: 2 });
    const keys = [...tree.querySelectorAll('.y-key')].map(k => k.textContent);
    expect(keys).toEqual(['b']);
  });
});
