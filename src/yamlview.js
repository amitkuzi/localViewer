// Renders a parsed YAML/JSON value as a tree of collapsible sections.
// CDN-free (uses native <details>), so it runs under jsdom and is fully testable.
// Parsing itself is done by the caller (js-yaml); this module only turns the
// resulting plain JS value into a smart, foldable view.

// Smart-fold defaults: shallow, small containers start expanded; anything
// deep or large starts collapsed so big files stay readable.
const SMART_DEPTH = 2;
const SMART_MAX_CHILDREN = 20;

function kindOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return 'scalar';
}

// Pure: normalise a value into a render-friendly tree.
// node = { key, kind:'object'|'array'|'scalar', size?, value?, children? }
export function buildTree(value, key = null) {
  const kind = kindOf(value);
  if (kind === 'object') {
    const children = Object.keys(value).map(k => buildTree(value[k], k));
    return { key, kind, size: children.length, children };
  }
  if (kind === 'array') {
    const children = value.map((v, i) => buildTree(v, i));
    return { key, kind, size: children.length, children };
  }
  return { key, kind: 'scalar', value };
}

// Whether a container node should render expanded by default.
export function smartOpen(node, depth) {
  return node.size > 0 && depth < SMART_DEPTH && node.size <= SMART_MAX_CHILDREN;
}

function scalarType(value) {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean' || t === 'string') return t;
  return 'string';
}

export function scalarText(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value === '' ? '""' : value;
  return String(value);
}

function previewText(node) {
  return node.kind === 'array' ? `[${node.size}]` : `{${node.size}}`;
}

function keyLabel(key) {
  if (key === null) return '';
  return typeof key === 'number' ? `${key}` : `${key}`;
}

function renderNode(doc, node, depth) {
  // Empty containers and scalars render as a single flat row.
  if (node.kind === 'scalar' || node.size === 0) {
    const row = doc.createElement('div');
    row.className = 'y-row';
    if (node.key !== null) {
      const k = doc.createElement('span');
      k.className = 'y-key';
      k.textContent = keyLabel(node.key);
      row.appendChild(k);
    }
    const v = doc.createElement('span');
    if (node.kind === 'scalar') {
      v.className = `y-val y-${scalarType(node.value)}`;
      v.textContent = scalarText(node.value);
    } else {
      v.className = 'y-empty';
      v.textContent = node.kind === 'array' ? '[]' : '{}';
    }
    row.appendChild(v);
    return row;
  }

  const details = doc.createElement('details');
  details.className = `y-node y-${node.kind}`;
  if (smartOpen(node, depth)) details.open = true;

  const summary = doc.createElement('summary');
  if (node.key !== null) {
    const k = doc.createElement('span');
    k.className = 'y-key';
    k.textContent = keyLabel(node.key);
    summary.appendChild(k);
  }
  const badge = doc.createElement('span');
  badge.className = 'y-badge';
  badge.textContent = previewText(node);
  summary.appendChild(badge);
  details.appendChild(summary);

  const kids = doc.createElement('div');
  kids.className = 'y-children';
  for (const child of node.children) kids.appendChild(renderNode(doc, child, depth + 1));
  details.appendChild(kids);
  return details;
}

// Render `value` into `container`, replacing previous content.
export function renderYamlValue(container, value) {
  const doc = container.ownerDocument;
  container.textContent = '';
  const tree = buildTree(value);
  container.appendChild(renderNode(doc, tree, 0));
  return container;
}

// Expand/collapse every section in the tree.
export function setAllOpen(container, open) {
  for (const d of container.querySelectorAll('details.y-node')) d.open = open;
  return container;
}
