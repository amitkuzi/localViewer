// Folders the user has granted localViewer read access to (File System Access
// API directory handles), remembered in IndexedDB so following a link in a
// local document only asks for the folder once. Chromium-only; every function
// degrades to "nothing known" elsewhere.

const DB_NAME = 'localviewer', STORE = 'kv', KEY = 'linkRoots', MAX_ROOTS = 20;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export async function loadRoots() {
  try { return (await tx('readonly', s => s.get(KEY))) || []; } catch { return []; }
}

// Remember a granted folder (most recent first, de-duplicated).
export async function saveRoot(handle) {
  try {
    const roots = await loadRoots();
    const kept = [];
    for (const r of roots) {
      if (!(await r.isSameEntry(handle).catch(() => false))) kept.push(r);
    }
    await tx('readwrite', s => s.put([handle, ...kept].slice(0, MAX_ROOTS), KEY));
  } catch { /* storage unavailable — the grant still works for this session */ }
}

// Find the broadest remembered folder that contains `handle` (a file or a
// folder). Returns { root, dir } where `dir` is the path segments of the
// handle's *containing* folder below `root` — or null.
export async function findRootFor(handle) {
  let best = null;
  for (const root of await loadRoots()) {
    try {
      const segs = await root.resolve(handle);
      if (segs && (!best || segs.length > best.depth)) {
        best = { root, dir: handle.kind === 'file' ? segs.slice(0, -1) : segs, depth: segs.length };
      }
    } catch { /* stale handle — skip */ }
  }
  return best && { root: best.root, dir: best.dir };
}

// Make sure we may read `handle`. Prompts (needs a user gesture) if not yet
// granted this session. Returns true when reading is allowed.
export async function ensureRead(handle) {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

// Walk `segs` down from `root` to a file handle. Throws NotFoundError when a
// segment is missing and TypeMismatchError when the target is a folder.
export async function fileAt(root, segs) {
  let dir = root;
  for (const name of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
  return dir.getFileHandle(segs[segs.length - 1]);
}
