// Framework-free helpers for file naming, paths and window titles.
// No DOM or CDN imports here so this module is trivially unit-testable.

const APP_NAME = 'localViewer';

// Map a file name to the internal viewer kind, or null if unsupported.
export function detectKind(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.txt')) return 'md';
  if (n.endsWith('.yaml') || n.endsWith('.yml')) return 'yaml';
  if (n.endsWith('.stl')) return 'stl';
  if (n.endsWith('.3mf')) return '3mf';
  return null;
}

// Split a filesystem path or URL into { dir, base }.
// Handles both "/" and "\" separators and strips URL query/hash.
export function splitPath(path) {
  const clean = String(path || '').split(/[?#]/)[0];
  const norm = clean.replace(/[\\/]+$/, ''); // drop trailing separators
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx < 0) return { dir: '', base: norm };
  return { dir: norm.slice(0, idx), base: norm.slice(idx + 1) };
}

export function basename(path) { return splitPath(path).base; }
export function dirname(path)  { return splitPath(path).dir; }

// The folder that contains a file, suitable for "open containing folder".
// Returns '' when no directory component is known (e.g. a bare file name,
// which is all a sandboxed browser file picker exposes).
export function containingFolder(path) {
  return dirname(path);
}

// True when `path` carries a real directory we could reveal in a file manager.
export function hasResolvablePath(path) {
  return containingFolder(path).length > 0;
}

// Window/tab title for the currently shown file.
export function titleFor(name) {
  return name ? `${name} — ${APP_NAME}` : `${APP_NAME} — MD / YAML / STL / 3MF`;
}

// Build the metadata shown in the header for an opened file.
// `source` is the most informative locator we have: a full URL (?src=),
// an explicit ?path=, or just the file name from a picker/drop.
export function fileMeta(name, source) {
  const display = source && source !== name ? source : name;
  return {
    name,
    source: source || name,
    displayPath: display || '',
    folder: containingFolder(source || name),
    kind: detectKind(name)
  };
}
