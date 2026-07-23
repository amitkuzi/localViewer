// Integration test (jsdom): rendered markdown blocks get per-element dir="auto"
// so RTL (Hebrew/Arabic) and LTR paragraphs each align correctly, while code
// blocks stay pinned LTR.
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTextDirection } from '../src/mdview.js';

describe('applyTextDirection (DOM)', () => {
  let el;
  beforeEach(() => {
    document.body.innerHTML = '<article id="md"></article>';
    el = document.getElementById('md');
  });

  it('sets dir="auto" on the container', () => {
    applyTextDirection(el);
    expect(el.getAttribute('dir')).toBe('auto');
  });

  it('sets dir="auto" on block-level elements', () => {
    el.innerHTML = '<h1>שלום</h1><p>Hello</p><li>item</li><blockquote>quote</blockquote>';
    applyTextDirection(el);
    for (const sel of ['h1', 'p', 'li', 'blockquote']) {
      expect(el.querySelector(sel).getAttribute('dir')).toBe('auto');
    }
  });

  it('sets dir="auto" on table cells', () => {
    el.innerHTML = '<table><tr><th>a</th><td>b</td></tr></table>';
    applyTextDirection(el);
    expect(el.querySelector('th').getAttribute('dir')).toBe('auto');
    expect(el.querySelector('td').getAttribute('dir')).toBe('auto');
  });

  it('pins code blocks to LTR regardless of surrounding content', () => {
    el.innerHTML = '<p>שלום</p><pre><code>const x = 1;</code></pre>';
    applyTextDirection(el);
    expect(el.querySelector('pre').getAttribute('dir')).toBe('ltr');
  });

  it('does not touch inline elements like strong/em/code', () => {
    el.innerHTML = '<p>hello <strong>world</strong></p>';
    applyTextDirection(el);
    expect(el.querySelector('strong').hasAttribute('dir')).toBe(false);
  });
});
