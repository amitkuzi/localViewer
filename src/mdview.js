// Per-block text direction for rendered markdown. By default (mode 'auto')
// sets dir="auto" on each block-level element so the browser's bidi algorithm
// aligns every paragraph, heading, list item, etc. by its own first strong
// character — RTL (Hebrew/Arabic) and LTR content render correctly even mixed
// in the same document. Passing 'ltr' or 'rtl' instead forces that direction
// (and alignment, via CSS's direction-aware default text-align: start) on
// every block, overriding auto-detection. Code blocks are always pinned LTR
// since source code direction shouldn't follow the surrounding prose language.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt';

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
