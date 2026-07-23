// Per-block text direction for rendered markdown. Sets dir="auto" on each
// block-level element so the browser's bidi algorithm aligns every paragraph,
// heading, list item, etc. by its own first strong character — RTL (Hebrew/
// Arabic) and LTR content render correctly even mixed in the same document.
// Code blocks are pinned LTR since source code direction shouldn't follow
// the surrounding prose language.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt';

export function applyTextDirection(container) {
  container.setAttribute('dir', 'auto');
  for (const el of container.querySelectorAll(BLOCK_SELECTOR)) {
    el.setAttribute('dir', 'auto');
  }
  for (const el of container.querySelectorAll('pre')) {
    el.setAttribute('dir', 'ltr');
  }
  return container;
}
