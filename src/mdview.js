// Per-block text direction for rendered markdown. By default (mode 'auto')
// sets dir="auto" on each block-level element so the browser's bidi algorithm
// aligns every paragraph, heading, list item, etc. by its own first strong
// character — RTL (Hebrew/Arabic) and LTR content render correctly even mixed
// in the same document. Passing 'ltr' or 'rtl' instead forces that direction
// (and alignment, via CSS's direction-aware default text-align: start) on
// every block, overriding auto-detection. Code blocks are always pinned LTR
// since source code direction shouldn't follow the surrounding prose language.
import { slugify } from './links.js';

const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt';

// Give every heading a GitHub-style id ("My Title" → "my-title", repeats get
// "-1", "-2") so in-document links like [see](#my-title) can scroll to it.
// Headings that already carry an id keep it.
export function addHeadingIds(container) {
  const seen = new Map();
  for (const h of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (h.id) continue;
    const base = slugify(h.textContent) || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    h.id = n ? `${base}-${n}` : base;
  }
  return container;
}

// Find the element a "#fragment" link points at: an exact id, else a heading
// whose slug matches (so "#My Title" and "#my-title" both work).
export function findAnchorTarget(container, id) {
  if (!id) return null;
  for (const el of container.querySelectorAll('[id], a[name]')) {
    if (el.id === id || el.getAttribute('name') === id) return el;
  }
  const slug = slugify(id);
  return [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .find(h => h.id === slug || slugify(h.textContent) === slug) || null;
}

export function applyTextDirection(container, mode = 'auto') {
  const dir = mode === 'ltr' || mode === 'rtl' ? mode : 'auto';
  container.setAttribute('dir', dir);
  for (const el of container.querySelectorAll(BLOCK_SELECTOR)) {
    el.setAttribute('dir', dir);
  }
  for (const el of container.querySelectorAll('pre')) {
    el.setAttribute('dir', 'ltr');
  }
  return container;
}
