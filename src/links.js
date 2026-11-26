// Pure helpers for following links inside rendered documents. No DOM, no
// File System Access API — app.js does the I/O; this decides *what* a link
// points at and *where* it resolves to, so it is trivially unit-testable.

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

const WIN_ABS = /^[a-z]:[\\/]/i;     // C:\docs\a.md  or  C:/docs/a.md
const UNC     = /^\\\\/;             // \\server\share\a.md
const SCHEME  = /^([a-z][a-z0-9+.-]*):/i;

// Classify an href taken verbatim from a rendered document:
//   { type: 'none' }                              empty / nothing to follow
//   { type: 'anchor',   id }                      #heading in the same document
//   { type: 'external', url }                     http(s), mailto, … → the browser
//   { type: 'absolute', path, hash }              file:///… or C:\… on this machine
//   { type: 'relative', path, query, hash }       other.md, ../docs/a.md#intro
export function classifyLink(href) {
  const h = String(href ?? '').trim();
  if (!h) return { type: 'none' };
  if (h.startsWith('#')) return { type: 'anchor', id: safeDecode(h.slice(1)) };

  if (WIN_ABS.test(h) || UNC.test(h)) {
    const [p, ...rest] = h.split('#');
    return { type: 'absolute', path: p.replace(/\\/g, '/'), hash: safeDecode(rest.join('#')) };
  }
  if (h.startsWith('//')) return { type: 'external', url: 'https:' + h };

  const m = SCHEME.exec(h);
  if (m) {
    if (m[1].toLowerCase() !== 'file') return { type: 'external', url: h };
    // file:///D:/docs/a.md → D:/docs/a.md ; file://server/share/a.md → //server/share/a.md
    const rest = h.slice(m[0].length);
    const [p, ...hash] = rest.split('#');
    let path = safeDecode(p.split('?')[0]).replace(/\\/g, '/');
    path = path.replace(/^\/\/\/?(?=[a-z]:\/)/i, '');   // strip "//" or "///" before a drive
    return { type: 'absolute', path, hash: safeDecode(hash.join('#')) };
  }

  const hashAt = h.indexOf('#');
  const beforeHash = hashAt < 0 ? h : h.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : safeDecode(h.slice(hashAt + 1));
  const qAt = beforeHash.indexOf('?');
  const rawPath = qAt < 0 ? beforeHash : beforeHash.slice(0, qAt);
  const query = qAt < 0 ? '' : beforeHash.slice(qAt);
  if (!rawPath) return hash ? { type: 'anchor', id: hash } : { type: 'none' };
  return { type: 'relative', path: rawPath.replace(/\\/g, '/'), query, hash };
}

// Resolve a relative (URL-style, "/"-separated, possibly %-encoded) path
// against a folder given as path segments from some root folder. A leading "/"
// means "from the root". Returns the target's segments, or null when the path
// climbs above the root with "..".
export function resolveSegments(baseDir, relPath) {
  const out = String(relPath).startsWith('/') ? [] : [...baseDir];
  for (const raw of String(relPath).split('/')) {
    const part = safeDecode(raw);
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out;
}

// How many folders above the root `relPath` climbs (0 when it stays inside).
export function levelsAboveRoot(baseDir, relPath) {
  let depth = String(relPath).startsWith('/') ? 0 : baseDir.length;
  let worst = 0;
  for (const raw of String(relPath).split('/')) {
    const part = safeDecode(raw);
    if (!part || part === '.') continue;
    depth += part === '..' ? -1 : 1;
    worst = Math.min(worst, depth);
  }
  return worst ? -worst : 0;
}

// Map an absolute on-disk path onto a granted folder we only know by name:
// the segments after the last occurrence of `rootName` in the path, e.g.
// ("D:/Dev/localViewer/docs/a.md", "localViewer") → ["docs", "a.md"].
// Case-insensitive (Windows). Returns null when the folder isn't in the path.
export function segmentsAfterRoot(absPath, rootName) {
  const segs = String(absPath).replace(/\\/g, '/').split('/').filter(Boolean);
  const name = String(rootName).toLowerCase();
  for (let i = segs.length - 2; i >= 0; i--) {
    if (segs[i].toLowerCase() === name) return segs.slice(i + 1);
  }
  return null;
}

// If `absPath` lies inside the folder `dir` (both on-disk paths), return the
// path relative to it ("/"-separated); otherwise null. Case-insensitive.
export function relativeToDir(absPath, dir) {
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  const a = norm(absPath), d = norm(dir);
  if (!d || a.toLowerCase().indexOf(d.toLowerCase() + '/') !== 0) return null;
  return a.slice(d.length + 1);
}

// Join an on-disk folder and a "/"-separated relative path, using the folder's
// own separator style. "..": pops a segment.
export function joinDiskPath(dir, relPath) {
  const sep = String(dir).includes('\\') ? '\\' : '/';
  const parts = String(dir).replace(/[\\/]+$/, '').split(/[\\/]/);
  for (const raw of String(relPath).split('/')) {
    const part = safeDecode(raw);
    if (!part || part === '.') continue;
    if (part === '..') { if (parts.length > 1) parts.pop(); } else parts.push(part);
  }
  return parts.join(sep);
}

// GitHub-style heading slug: lower-case, drop punctuation, spaces → "-".
// Letters/digits of any script (Hebrew, etc.) are kept.
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// Give an HTML document a <base href> so its relative CSS/images/links resolve
// against where it was loaded from. Without a base URL, returns it unchanged.
export function withBaseHref(html, baseURL) {
  if (!baseURL) return html;
  const tag = `<base href="${String(baseURL).replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  return tag + html;
}
